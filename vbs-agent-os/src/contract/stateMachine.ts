import type { TaskStatus, PrimeDecision, AgentName } from "./taskContract.js";

/**
 * The full transition graph from PRD §4 + the canonical flow in §3:
 *   START -> Hermes system check -> Gemma research -> DeepSeek process ->
 *   Prime quality gate -> Nova communication prep -> Prime final QA ->
 *   Hermes executes approved action -> Nova response analysis ->
 *   Prime validates consequential decisions -> Hermes updates state -> all report.
 *
 * This module is the single source of truth for "is this transition legal?" —
 * both the dispatcher and the API layer must go through here, never mutate
 * `status` directly.
 */

export const TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  // HUMAN_REVIEW is reachable from every active state so the owner can always
  // cancel/escalate a task (PRD §7: "the owner controls exceptions").
  QUEUED: ["ASSIGNED", "BLOCKED", "FAILED_FINAL", "HUMAN_REVIEW"],
  ASSIGNED: ["RUNNING", "FAILED_RETRYABLE", "BLOCKED", "HUMAN_REVIEW"],
  RUNNING: ["COMPLETED", "FAILED_RETRYABLE", "FAILED_FINAL", "BLOCKED", "HUMAN_REVIEW"],
  COMPLETED: ["QA_PENDING", "HUMAN_REVIEW"],
  QA_PENDING: ["APPROVED", "REWORK", "REJECTED", "HUMAN_REVIEW"],
  APPROVED: ["ACTIONED", "CLOSED"],
  REWORK: ["ASSIGNED", "QUEUED"], // returns to the originating worker (PRD FR-05)
  REJECTED: ["CLOSED"],
  HUMAN_REVIEW: ["APPROVED", "REWORK", "REJECTED", "CLOSED"], // owner resolves
  ACTIONED: ["CLOSED"],
  CLOSED: [],
  FAILED_RETRYABLE: ["QUEUED", "FAILED_FINAL"],
  FAILED_FINAL: ["HUMAN_REVIEW"], // surfaced per PRD §7 Retry Policy
  BLOCKED: ["QUEUED", "HUMAN_REVIEW"],
};

export class IllegalTransitionError extends Error {
  constructor(from: TaskStatus, to: TaskStatus) {
    super(`Illegal task transition: ${from} -> ${to}`);
    this.name = "IllegalTransitionError";
  }
}

export function assertLegalTransition(from: TaskStatus, to: TaskStatus): void {
  const allowed = TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw new IllegalTransitionError(from, to);
  }
}

/** Only Prime may move a task out of QA_PENDING, and only via this mapping. */
export const PRIME_DECISION_TO_STATUS: Record<PrimeDecision, TaskStatus> = {
  APPROVED: "APPROVED",
  REWORK: "REWORK",
  REJECTED: "REJECTED",
  HUMAN_REVIEW: "HUMAN_REVIEW",
};

export function assertAgentMayEmitDecision(agent: AgentName): void {
  if (agent !== "prime") {
    throw new Error(
      `Illegal: only Prime may set prime_decision / drive QA_PENDING transitions (attempted by "${agent}"). ` +
        `PRD §2: Prime "must not own... replacing Hermes"; other agents must not own "final approval".`
    );
  }
}

export const TERMINAL_STATUSES: ReadonlySet<TaskStatus> = new Set([
  "CLOSED",
  "REJECTED",
  "FAILED_FINAL",
]);

export function isTerminal(status: TaskStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}
