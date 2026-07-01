import { describe, it } from "vitest";

describe.skip("trigger-engineer integration", () => {
  it.todo("generates real TypeScript task via LLM");
  it.todo("prompt interpolation includes availableExamples");
  it.todo("prompt interpolation includes proposalText");
  it.todo("generated code uses task() or schemaTask() from @trigger.dev/sdk");
});
