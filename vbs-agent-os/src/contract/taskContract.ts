/**
 * The One Shared Task Contract (PRD §4).
 * Every agent consumes and produces this exact envelope. This is the backbone
 * of orchestration, debugging, reporting and auditability — treat changes to
 * this file as a breaking schema migration, not a routine edit.
 */
import { z } from "zod";

export const AGENT_NAMES = ["hermes", "gemma", "deepseek", "prime", "nova"] as const;
export type AgentName = (typeof AGENT_NAMES)[number];

/** PRD §4 "Required Task States" */
export const TASK_STATUSES = [
  "QUEUED",
  "ASSIGNED",
  "RUNNING",
  "COMPLETED",
  "QA_PENDING",
  "APPROVED",
  "REWORK",
  "REJECTED",
  "HUMAN_REVIEW",
  "ACTIONED",
  "CLOSED",
  // Failure states
  "FAILED_RETRYABLE",
  "FAILED_FINAL",
  "BLOCKED",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

/** PRD §4 "Prime Decision States" */
export const PRIME_DECISIONS = ["APPROVED", "REWORK", "REJECTED", "HUMAN_REVIEW"] as const;
export type PrimeDecision = (typeof PRIME_DECISIONS)[number];

export const TASK_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const evidenceItemSchema = z.object({
  source: z.string().min(1),
  claim: z.string().min(1),
  confidence: z.number().min(0).max(1).nullable().optional(),
  observed: z.boolean().default(true), // false => derived/inferred, per PRD §7 Data Integrity
});
export type EvidenceItem = z.infer<typeof evidenceItemSchema>;

export const issueSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  raised_by: z.enum(AGENT_NAMES),
  severity: z.enum(["info", "attention", "action_required"]).default("info"),
});
export type Issue = z.infer<typeof issueSchema>;

/**
 * Exact shape of the JSON envelope shown in PRD §4, with types tightened.
 */
export const taskContractSchema = z.object({
  client_id: z.string().min(1),
  run_id: z.string().uuid(),
  task_id: z.string().uuid(),
  parent_task_id: z.string().uuid().nullable().default(null),
  created_at: z.string().datetime(),
  requested_by: z.string().min(1), // "owner" | agent name | "system"
  assigned_agent: z.enum(AGENT_NAMES),
  task_type: z.string().min(1),
  priority: z.enum(TASK_PRIORITIES).default("normal"),
  input: z.record(z.unknown()).default({}),
  expected_output: z.record(z.unknown()).default({}),
  status: z.enum(TASK_STATUSES),
  confidence: z.number().min(0).max(1).nullable().default(null),
  evidence: z.array(evidenceItemSchema).default([]),
  result: z.record(z.unknown()).default({}),
  issues: z.array(issueSchema).default([]),
  prime_decision: z.enum(PRIME_DECISIONS).nullable().default(null),
  next_action: z.string().nullable().default(null),
  requires_human_attention: z.boolean().default(false),
});
export type TaskContract = z.infer<typeof taskContractSchema>;

/** Fields a caller may set when first creating a task — the rest are system-managed. */
export const createTaskInputSchema = taskContractSchema.pick({
  client_id: true,
  requested_by: true,
  task_type: true,
  priority: true,
  input: true,
  expected_output: true,
  assigned_agent: true,
}).partial({ priority: true, expected_output: true, assigned_agent: true });
export type CreateTaskInput = z.infer<typeof createTaskInputSchema>;

/**
 * Guardrail for PRD §7 "Secret Handling": reject any task contract whose
 * serialized form looks like it contains a credential. This is a defense in
 * depth check, not the only line of defense (see security/redact.ts).
 */
const SECRET_LOOKALIKE = /(sk-[a-zA-Z0-9-]{10,}|api[_-]?key\s*[:=]|authorization:\s*bearer)/i;

export function assertNoEmbeddedSecrets(contract: unknown): void {
  const serialized = JSON.stringify(contract);
  if (SECRET_LOOKALIKE.test(serialized)) {
    throw new Error(
      "Task contract rejected: payload looks like it contains a credential. " +
        "Secrets must never be placed in task payloads (PRD §7)."
    );
  }
}

export function parseTaskContract(raw: unknown): TaskContract {
  const parsed = taskContractSchema.parse(raw);
  assertNoEmbeddedSecrets(parsed);
  return parsed;
}
