import { describe, it } from "vitest";

// REQ-14b: Integration tests are skipped in CI — no live LLM or Supabase calls

describe.skip("proposal handler — integration", () => {
  it("generates a proposal from a real brief end-to-end");
  it("writes brief.md and proposal.md to the filesystem");
  it("creates an approval record in Supabase");
});
