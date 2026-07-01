import { schedules, logger } from "@trigger.dev/sdk";
import { createClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

export interface RefreshAnalyticsViewsResult {
  refreshed_views: string[];
  failed_views:    string[];
}

// ---------------------------------------------------------------------------
// Views to refresh — in order (extraction quality first for coherent UI)
// ---------------------------------------------------------------------------

export const ANALYTICS_VIEWS = [
  "mv_extraction_quality_30d",
  "mv_supplier_quality_30d",
  "mv_field_confidence_30d",
] as const;

// ---------------------------------------------------------------------------
// Supabase client (lazy, facturas schema)
// ---------------------------------------------------------------------------

function getSupabaseClient() {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  }
  return createClient(url, key, { db: { schema: "facturas" } });
}

// ---------------------------------------------------------------------------
// Task — daily 01:00 UTC (before work hours, after purge at 02:00)
// TD.3: sample-refresh-analytics-views
// ---------------------------------------------------------------------------

export const refreshAnalyticsViewsConfig = {
  id:   "sample-refresh-analytics-views",
  cron: "0 1 * * *",

  run: async (_payload: unknown): Promise<RefreshAnalyticsViewsResult> => {
    const db = getSupabaseClient();

    const refreshed_views: string[] = [];
    const failed_views:    string[] = [];

    logger.info("refresh-analytics-views: starting", {
      views: ANALYTICS_VIEWS,
    });

    for (const view of ANALYTICS_VIEWS) {
      logger.info(`refresh-analytics-views: refreshing ${view}`);

      const { error } = await db.rpc("refresh_materialized_view", { view_name: view });

      if (error) {
        logger.error(`refresh-analytics-views: failed to refresh ${view}`, {
          view,
          error: error.message,
        });
        failed_views.push(view);
        // Continue with remaining views — do NOT abort the whole task
        continue;
      }

      logger.info(`refresh-analytics-views: refreshed ${view}`);
      refreshed_views.push(view);
    }

    logger.info("refresh-analytics-views: complete", {
      refreshed: refreshed_views.length,
      failed:    failed_views.length,
    });

    return { refreshed_views, failed_views };
  },
};

export const refreshAnalyticsViews = schedules.task(refreshAnalyticsViewsConfig);
