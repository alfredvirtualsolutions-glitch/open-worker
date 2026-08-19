import { describe, it, expect } from "vitest";
import {
  assertLegalTransition,
  IllegalTransitionError,
  assertAgentMayEmitDecision,
  isTerminal,
} from "../src/contract/stateMachine.js";

describe("state machine", () => {
  it("allows the canonical happy path", () => {
    expect(() => assertLegalTransition("QUEUED", "ASSIGNED")).not.toThrow();
    expect(() => assertLegalTransition("ASSIGNED", "RUNNING")).not.toThrow();
    expect(() => assertLegalTransition("RUNNING", "COMPLETED")).not.toThrow();
    expect(() => assertLegalTransition("COMPLETED", "QA_PENDING")).not.toThrow();
    expect(() => assertLegalTransition("QA_PENDING", "APPROVED")).not.toThrow();
    expect(() => assertLegalTransition("APPROVED", "CLOSED")).not.toThrow();
  });

  it("rejects skipping the QA gate (COMPLETED -> APPROVED directly)", () => {
    expect(() => assertLegalTransition("COMPLETED", "APPROVED")).toThrow(IllegalTransitionError);
  });

  it("rejects a CLOSED task being reopened", () => {
    expect(() => assertLegalTransition("CLOSED", "QUEUED")).toThrow(IllegalTransitionError);
  });

  it("allows REWORK to route back to QUEUED (PRD FR-05)", () => {
    expect(() => assertLegalTransition("REWORK", "QUEUED")).not.toThrow();
  });

  it("allows escalation to HUMAN_REVIEW from every active state", () => {
    for (const from of ["QUEUED", "ASSIGNED", "RUNNING", "COMPLETED"] as const) {
      expect(() => assertLegalTransition(from, "HUMAN_REVIEW")).not.toThrow();
    }
  });

  it("only lets Prime emit a QA decision", () => {
    expect(() => assertAgentMayEmitDecision("prime")).not.toThrow();
    expect(() => assertAgentMayEmitDecision("gemma")).toThrow();
    expect(() => assertAgentMayEmitDecision("nova")).toThrow();
    expect(() => assertAgentMayEmitDecision("hermes")).toThrow();
  });

  it("classifies terminal statuses correctly", () => {
    expect(isTerminal("CLOSED")).toBe(true);
    expect(isTerminal("REJECTED")).toBe(true);
    expect(isTerminal("FAILED_FINAL")).toBe(true);
    expect(isTerminal("QUEUED")).toBe(false);
    expect(isTerminal("HUMAN_REVIEW")).toBe(false);
  });
});
