import { describe, it, expect, vi, beforeEach } from "vitest";

// config/env.ts exits the process if real secrets aren't set — stub it so
// importing nova.ts (which imports env.ts) doesn't crash the test runner.
vi.mock("../src/config/env.js", () => ({
  env: {
    NODE_ENV: "test",
    PORT: 8787,
    DATABASE_URL: "postgres://test",
    ANTHROPIC_API_KEY: "test-key",
    HERMES_ADMIN_TOKEN: "test-token-0123456789",
    DISPATCH_INTERVAL_MS: 3000,
    DISPATCH_CONCURRENCY: 3,
    MODEL_HERMES: "test-model",
    MODEL_GEMMA: "test-model",
    MODEL_DEEPSEEK: "test-model",
    MODEL_PRIME: "test-model",
    MODEL_NOVA: "test-model",
  },
}));

const runAgentCallMock = vi.fn();
vi.mock("../src/agents/runAgentCall.js", () => ({
  runAgentCall: (...args: unknown[]) => runAgentCallMock(...args),
}));

const { novaAdapter } = await import("../src/agents/nova.js");
const { RESPONSE_ANALYSIS_TASK_TYPE } = await import("../src/config/workflowPipeline.js");
import type { TaskContract } from "../src/contract/taskContract.js";

function baseTask(overrides: Partial<TaskContract> = {}): TaskContract {
  return {
    client_id: "internal-test",
    run_id: "b920d06b-b519-407c-91d8-ed4d2103a7b9",
    task_id: "183aebeb-4331-430b-9683-9a7e322233cd",
    parent_task_id: null,
    created_at: new Date().toISOString(),
    requested_by: "system",
    assigned_agent: "nova",
    task_type: "communication_prep",
    priority: "normal",
    input: {},
    expected_output: {},
    status: "RUNNING",
    confidence: null,
    evidence: [],
    result: {},
    issues: [],
    prime_decision: null,
    next_action: null,
    requires_human_attention: false,
    ...overrides,
  };
}

describe("nova adapter FR-06 guard", () => {
  beforeEach(() => {
    runAgentCallMock.mockReset();
    runAgentCallMock.mockResolvedValue({
      result: {},
      evidence: [],
      confidence: null,
      issues: [],
      next_action: null,
      requires_human_attention: false,
    });
  });

  it("refuses to draft communication with no approved evidence or result", async () => {
    const out = await novaAdapter.run(baseTask());
    expect(out.issues[0]?.code).toBe("NOVA_NO_APPROVED_CONTEXT");
    expect(runAgentCallMock).not.toHaveBeenCalled();
  });

  it("proceeds when evidence or result is present", async () => {
    await novaAdapter.run(baseTask({ result: { draft: "hi" } }));
    expect(runAgentCallMock).toHaveBeenCalledOnce();
  });

  it("exempts response-analysis tasks from the guard even with empty evidence/result", async () => {
    await novaAdapter.run(baseTask({ task_type: RESPONSE_ANALYSIS_TASK_TYPE }));
    expect(runAgentCallMock).toHaveBeenCalledOnce();
  });
});
