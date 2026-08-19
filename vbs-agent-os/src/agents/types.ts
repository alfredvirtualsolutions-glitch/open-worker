import { z } from "zod";
import { evidenceItemSchema, issueSchema } from "../contract/taskContract.js";
import type { TaskContract } from "../contract/taskContract.js";

/**
 * What an agent adapter is allowed to hand back to Hermes. Deliberately NOT
 * the full task contract — an adapter proposes a result, it never sets its
 * own `status` or (except Prime) `prime_decision`. Hermes/the state machine
 * owns those (PRD §2 "Must Not Own" boundaries, enforced here in types too).
 */
export const agentOutputSchema = z.object({
  result: z.record(z.unknown()).default({}),
  evidence: z.array(evidenceItemSchema).default([]),
  confidence: z.number().min(0).max(1).nullable().default(null),
  issues: z.array(issueSchema).default([]),
  next_action: z.string().nullable().default(null),
  requires_human_attention: z.boolean().default(false),
});
export type AgentOutput = z.infer<typeof agentOutputSchema>;

/** Prime's output additionally carries the gate decision + a written reason. */
export const primeOutputSchema = agentOutputSchema.extend({
  prime_decision: z.enum(["APPROVED", "REWORK", "REJECTED", "HUMAN_REVIEW"]),
  reason: z.string().min(1),
});
export type PrimeOutput = z.infer<typeof primeOutputSchema>;

export interface AgentAdapter {
  name: "gemma" | "deepseek" | "prime" | "nova";
  /** Run this agent's work for a task currently in RUNNING and return its proposed output. */
  run(task: TaskContract): Promise<AgentOutput | PrimeOutput>;
}
