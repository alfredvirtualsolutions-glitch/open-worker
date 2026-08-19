import type { AgentName } from "../contract/taskContract.js";

/**
 * PRD §3 "End-to-End Workflow" + §10 diagram: a unit of work moves through
 * Gemma (research) -> DeepSeek (extraction) -> Prime gate -> Nova
 * (communication prep) -> Prime final QA -> Hermes executes/follows up.
 *
 * The single-worker-then-Prime-gate flow already built (COMPLETED ->
 * QA_PENDING -> Prime decision) satisfies that for one agent. Chaining
 * stages together — Hermes creating the next stage's task, linked via
 * parent_task_id/run_id, once Prime approves the current one — turns it
 * into the full canonical pipeline without any new dispatch machinery:
 * each stage is still just a normal task claimed, run and QA-gated exactly
 * as before.
 *
 * Not every task_type needs the full pipeline — a task_type absent from
 * this map behaves exactly as it did before this file existed: one worker,
 * one Prime gate, then closed (PRD FR-11: reusable via configuration, not
 * hard-coded flows). Add/rename entries here to match real task_type
 * values as they're defined; this file is the single place that decides it.
 */
export const WORKFLOW_PIPELINES: Record<string, AgentName[]> = {
  // Example wiring of the PRD's canonical flow. Adjust the task_type key
  // (and the agents/order) to match how task_type values are actually used.
  research_to_outreach: ["gemma", "deepseek", "nova"],
};

/**
 * PRD §3 step 8 "Response Analysis - Nova": the task_type used for tasks
 * created from an inbound reply (POST /webhooks/inbound-reply). Nova's
 * FR-06 "no unapproved context" guard (src/agents/nova.ts) is exempted for
 * this task_type — analyzing a reply needs no prior approved evidence, it
 * works from the fresh inbound text instead, so there's nothing to invent.
 */
export const RESPONSE_ANALYSIS_TASK_TYPE = "response_analysis";

export function getPipeline(taskType: string): AgentName[] | null {
  return WORKFLOW_PIPELINES[taskType] ?? null;
}

/** The agent a newly created task of this task_type should start with, if it's pipelined. */
export function getPipelineStartAgent(taskType: string): AgentName | null {
  return getPipeline(taskType)?.[0] ?? null;
}

/**
 * The agent that should run after `currentAgent` in this task_type's
 * pipeline, or null if there is no pipeline for this task_type, or this
 * was already the pipeline's last stage.
 */
export function getNextPipelineAgent(taskType: string, currentAgent: AgentName): AgentName | null {
  const pipeline = getPipeline(taskType);
  if (!pipeline) return null;
  const idx = pipeline.indexOf(currentAgent);
  if (idx === -1 || idx === pipeline.length - 1) return null;
  return pipeline[idx + 1] ?? null;
}
