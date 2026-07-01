import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock @trigger.dev/sdk BEFORE importing the task
// ---------------------------------------------------------------------------

vi.mock("@trigger.dev/sdk", () => {
  const mockTask = vi.fn();
  const schedulesTaskFn = vi.fn((config: { id: string; cron: string; run: Function }) => ({
    id: config.id,
    cron: config.cron,
    run: config.run,
  }));

  return {
    schedules: { task: schedulesTaskFn },
    logger: {
      info:  vi.fn(),
      warn:  vi.fn(),
      error: vi.fn(),
      trace: vi.fn(),
    },
  };
});

// ---------------------------------------------------------------------------
// Mock Supabase createClient
// ---------------------------------------------------------------------------

const mockRpc = vi.fn();

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    rpc: mockRpc,
  })),
}));

import {
  refreshAnalyticsViews,
  refreshAnalyticsViewsConfig,
  ANALYTICS_VIEWS,
} from "../sample-refresh-analytics-views.task";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRpcSuccess() {
  mockRpc.mockResolvedValue({ data: null, error: null });
}

function makeRpcFail(viewName: string, errorMessage: string) {
  mockRpc.mockImplementation((fn: string, args: Record<string, unknown>) => {
    if (args && args["view_name"] === viewName) {
      return Promise.resolve({ data: null, error: { message: errorMessage } });
    }
    return Promise.resolve({ data: null, error: null });
  });
}

// ---------------------------------------------------------------------------
// TD.3 — Task contract
// ---------------------------------------------------------------------------

describe("refreshAnalyticsViews — task contract", () => {
  it("exports a task with id 'sample-refresh-analytics-views'", () => {
    expect(refreshAnalyticsViews).toBeDefined();
    expect(refreshAnalyticsViews.id).toBe("sample-refresh-analytics-views");
  });

  it("has a run function", () => {
    expect(typeof refreshAnalyticsViewsConfig.run).toBe("function");
  });

  it("cron is set to daily 01:00 UTC", () => {
    expect(refreshAnalyticsViewsConfig.cron).toBe("0 1 * * *");
  });
});

// ---------------------------------------------------------------------------
// TD.3 — ANALYTICS_VIEWS export
// ---------------------------------------------------------------------------

describe("ANALYTICS_VIEWS constant", () => {
  it("contains exactly the 3 materialized views", () => {
    expect(ANALYTICS_VIEWS).toHaveLength(3);
    expect(ANALYTICS_VIEWS).toContain("mv_extraction_quality_30d");
    expect(ANALYTICS_VIEWS).toContain("mv_supplier_quality_30d");
    expect(ANALYTICS_VIEWS).toContain("mv_field_confidence_30d");
  });
});

// ---------------------------------------------------------------------------
// TD.3 — Happy path: all 3 views refreshed
// ---------------------------------------------------------------------------

describe("refreshAnalyticsViews — successful refresh of all views", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env["SUPABASE_URL"] = "http://localhost:54321";
    process.env["SUPABASE_SERVICE_ROLE_KEY"] = "test-key";
    makeRpcSuccess();
  });

  it("calls refresh_materialized_view rpc once per view", async () => {
    const result = await refreshAnalyticsViewsConfig.run({});
    expect(mockRpc).toHaveBeenCalledTimes(3);
  });

  it("calls refresh for mv_extraction_quality_30d", async () => {
    await refreshAnalyticsViewsConfig.run({});
    expect(mockRpc).toHaveBeenCalledWith("refresh_materialized_view", {
      view_name: "mv_extraction_quality_30d",
    });
  });

  it("calls refresh for mv_supplier_quality_30d", async () => {
    await refreshAnalyticsViewsConfig.run({});
    expect(mockRpc).toHaveBeenCalledWith("refresh_materialized_view", {
      view_name: "mv_supplier_quality_30d",
    });
  });

  it("calls refresh for mv_field_confidence_30d", async () => {
    await refreshAnalyticsViewsConfig.run({});
    expect(mockRpc).toHaveBeenCalledWith("refresh_materialized_view", {
      view_name: "mv_field_confidence_30d",
    });
  });

  it("returns refreshed_views with all 3 view names", async () => {
    const result = await refreshAnalyticsViewsConfig.run({});
    expect(result.refreshed_views).toHaveLength(3);
    expect(result.refreshed_views).toContain("mv_extraction_quality_30d");
    expect(result.refreshed_views).toContain("mv_supplier_quality_30d");
    expect(result.refreshed_views).toContain("mv_field_confidence_30d");
  });

  it("returns failed_views as empty array when all succeed", async () => {
    const result = await refreshAnalyticsViewsConfig.run({});
    expect(result.failed_views).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TD.3 — Error isolation: one view fails, others still run
// ---------------------------------------------------------------------------

describe("refreshAnalyticsViews — error isolation per view", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env["SUPABASE_URL"] = "http://localhost:54321";
    process.env["SUPABASE_SERVICE_ROLE_KEY"] = "test-key";
  });

  it("does NOT abort when mv_extraction_quality_30d fails — other 2 views still run", async () => {
    makeRpcFail("mv_extraction_quality_30d", "lock timeout");
    const result = await refreshAnalyticsViewsConfig.run({});
    // All 3 rpc calls must have been made (no early exit)
    expect(mockRpc).toHaveBeenCalledTimes(3);
  });

  it("reports mv_extraction_quality_30d in failed_views when it errors", async () => {
    makeRpcFail("mv_extraction_quality_30d", "lock timeout");
    const result = await refreshAnalyticsViewsConfig.run({});
    expect(result.failed_views).toContain("mv_extraction_quality_30d");
  });

  it("still reports succeeded views in refreshed_views when one fails", async () => {
    makeRpcFail("mv_supplier_quality_30d", "connection error");
    const result = await refreshAnalyticsViewsConfig.run({});
    expect(result.refreshed_views).toContain("mv_extraction_quality_30d");
    expect(result.refreshed_views).toContain("mv_field_confidence_30d");
    expect(result.refreshed_views).not.toContain("mv_supplier_quality_30d");
  });

  it("reports all 3 in failed_views when all fail", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: "DB down" } });
    const result = await refreshAnalyticsViewsConfig.run({});
    expect(result.failed_views).toHaveLength(3);
    expect(result.refreshed_views).toHaveLength(0);
  });
});
