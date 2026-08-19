import { describe, it, expect } from "vitest";
import { parseTaskContract, createTaskInputSchema } from "../src/contract/taskContract.js";
import { redactString, assertNoRawEnvLeak } from "../src/security/redact.js";

const validTask = {
  client_id: "internal-test",
  run_id: "b920d06b-b519-407c-91d8-ed4d2103a7b9",
  task_id: "183aebeb-4331-430b-9683-9a7e322233cd",
  parent_task_id: null,
  created_at: new Date().toISOString(),
  requested_by: "owner",
  assigned_agent: "gemma",
  task_type: "research_question",
  priority: "normal",
  input: { question: "test" },
  expected_output: {},
  status: "QUEUED",
  confidence: null,
  evidence: [],
  result: {},
  issues: [],
  prime_decision: null,
  next_action: null,
  requires_human_attention: false,
};

describe("task contract", () => {
  it("parses a well-formed contract", () => {
    expect(() => parseTaskContract(validTask)).not.toThrow();
  });

  it("rejects a contract missing required fields", () => {
    const { client_id, ...rest } = validTask;
    expect(() => parseTaskContract(rest)).toThrow();
  });

  it("rejects an embedded credential-looking value (PRD §7)", () => {
    const poisoned = { ...validTask, input: { note: "key: sk-ant-abcdefghijklmno" } };
    expect(() => parseTaskContract(poisoned)).toThrow(/credential/i);
  });

  it("rejects an invalid confidence value out of [0,1]", () => {
    const bad = { ...validTask, confidence: 1.5 };
    expect(() => parseTaskContract(bad)).toThrow();
  });

  it("create-task input schema rejects an unknown assigned_agent", () => {
    const result = createTaskInputSchema.safeParse({
      client_id: "x",
      requested_by: "owner",
      task_type: "t",
      assigned_agent: "skynet",
    });
    expect(result.success).toBe(false);
  });
});

describe("secret redaction", () => {
  it("redacts an Anthropic-style API key", () => {
    const out = redactString("here is my key sk-ant-api03-abcdefghijklmnopqrstuvwxyz");
    expect(out).not.toMatch(/sk-ant-/);
    expect(out).toContain("[REDACTED]");
  });

  it("redacts a bearer token", () => {
    const out = redactString("Authorization: Bearer abcdef1234567890XYZ");
    expect(out).toContain("[REDACTED]");
  });

  it("throws if raw env secret value leaks into output text", () => {
    const original = process.env.HERMES_ADMIN_TOKEN;
    process.env.HERMES_ADMIN_TOKEN = "super-secret-admin-token-value";
    try {
      expect(() => assertNoRawEnvLeak("the token is super-secret-admin-token-value")).toThrow();
      expect(() => assertNoRawEnvLeak("nothing sensitive here")).not.toThrow();
    } finally {
      process.env.HERMES_ADMIN_TOKEN = original;
    }
  });
});
