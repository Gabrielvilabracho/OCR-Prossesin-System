import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = resolve(__dirname, "../../../..");

function readRepoFile(path: string): string {
  return readFileSync(resolve(repoRoot, path), "utf8");
}

function repoPathExists(path: string): boolean {
  return existsSync(resolve(repoRoot, path));
}

describe("public repository documentation", () => {
  it("documents the public-safe repository layout", () => {
    const readme = readRepoFile("README.md");
    const claude = readRepoFile("CLAUDE.md");

    expect(readme).toContain("# AI Invoice Processing");
    expect(readme).toContain("Public-readiness status");
    expect(readme).toContain("`trigger/` | Trigger.dev v4 tasks and orchestration code");
    expect(readme).toContain("`analytics/` | Python 3.12 dashboards and evaluation tooling");
    expect(readme).toContain("`clients/` | Client/sample-client contracts, migrations, and docs");
    expect(readme).not.toContain("multi-client document/invoice processing platform");
    expect(readme).not.toContain("`contracts/` | Cross-runtime JSON Schemas and integration contracts");
    expect(readme).not.toContain("`services/` | Service implementations, each classified as shared or client-specific");

    expect(claude).toContain("soluciones AI/automatización");
    expect(claude).toContain("automations/                  ← flujos n8n / Trigger.dev por cliente");
    expect(claude).toContain("agents/                       ← agentes AI");
    expect(claude).toContain("archives/                     ← inactivo 90+ días");
    expect(claude).not.toContain("docs-first multi-client platform");
    expect(claude).not.toContain("Services must declare `SHARED-PLATFORM` or `CLIENT-SPECIFIC` in their README");
  });

  it("reverts shared pattern ownership and n8n backup governance docs", () => {
    const architecture = readRepoFile("company/architecture.md");
    const n8nReadme = readRepoFile("workflows/n8n/README.md");

    expect(architecture).toContain("**Última actualización**: 2026-05-12");
    expect(architecture).not.toContain("## 9) Shared processing patterns");
    expect(architecture).not.toContain("Shared processing pattern map");
    expect(architecture).not.toContain("Services are classified in their README header");

    expect(n8nReadme).toContain("# Workflows n8n — Backup");
    expect(n8nReadme).toContain("Directorio de backup de workflows exportados desde n8n.");
    expect(n8nReadme).toContain("`{id}-{name-kebab}.json`");
    expect(n8nReadme).not.toContain("workflows/n8n/{slug}/");
    expect(n8nReadme).not.toContain("Each client directory MUST contain at least one exported workflow JSON");
  });

  it("keeps existing contracts and service directories as runtime assets", () => {
    expect(repoPathExists("contracts/README.md")).toBe(true);
    expect(repoPathExists("contracts/sample-accounting/process-invoice-request.schema.json")).toBe(true);
    expect(repoPathExists("services/sample-accounting-ai/README.md")).toBe(true);
  });

  it("removes the reverted shared-vs-client-specific service decision", () => {
    const decisionLog = readRepoFile("decisions/log.md");

    expect(decisionLog).not.toContain("Multi-client platform cleanup: shared vs client-specific services");
    expect(decisionLog).not.toContain("Python multi-tenant refactor remains out of scope");
  });

  it("does not require cleanup-only reference artifacts in the reverted structure", () => {
    expect(repoPathExists("openspec/changes/multi-client-platform-cleanup/reference-checks.md")).toBe(false);
  });
});
