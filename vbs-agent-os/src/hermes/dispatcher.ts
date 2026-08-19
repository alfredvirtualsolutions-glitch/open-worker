import { randomUUID } from "node:crypto";
import { env } from "../config/env.js";
import { logger } from "../logging/logger.js";
import {
  claimDispatchableTasks,
  claimQaPendingTasks,
  createTask,
  transitionTask,
  scheduleRetry,
  escalateQaFailureIfExhausted,
  requeueForRework,
  getTask,
} from "../db/taskRepo.js";
import { pool } from "../db/pool.js";
import { isGloballyOrScopedPaused, isPaused } from "./controlFlags.js";
import { gemmaAdapter } from "../agents/gemma.js";
import { deepseekAdapter } from "../agents/deepseek.js";
import { primeAdapter } from "../agents/prime.js";
import { novaAdapter } from "../agents/nova.js";
import type { AgentAdapter, PrimeOutput } from "../agents/types.js";
import type { AgentName, TaskContract } from "../contract/taskContract.js";
import { assertAgentMayEmitDecision, PRIME_DECISION_TO_STATUS } from "../contract/stateMachine.js";
import { getNextPipelineAgent } from "../config/workflowPipeline.js";

const WORKER_ADAPTERS: Partial<Record<AgentName, AgentAdapter>> = {
  gemma: gemmaAdapter,
  deepseek: deepseekAdapter,
  nova: novaAdapter,
};

const WORKER_ID = `hermes-${process.pid}-${randomUUID().slice(0, 8)}`;

/**
 * Hermes: orchestrator / operations commander. Owns planning, routing,
 * retries, scheduling (PRD §2). Implements the canonical flow of PRD §3 as
 * two independent claim loops so a slow QA review never blocks new work
 * intake, and vice versa:
 *   1. worker loop:  QUEUED/FAILED_RETRYABLE -> ASSIGNED -> RUNNING -> COMPLETED -> QA_PENDING
 *   2. Prime loop:   QA_PENDING -> APPROVED / REWORK / REJECTED / HUMAN_REVIEW
 */
export class HermesDispatcher {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  start(): void {
    if (this.timer) return;
    logger.info({ workerId: WORKER_ID }, "Hermes dispatcher starting");
    this.timer = setInterval(() => void this.tick(), env.DISPATCH_INTERVAL_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async tick(): Promise<void> {
    if (this.running) return; // don't overlap ticks
    this.running = true;
    try {
      if (await isPaused("ALL", "ALL")) {
        return; // PRD §7 kill switch: PAUSE ALL
      }

      // Step 1: system check (Hermes housekeeping — no LLM call).
      await this.systemCheck();

      const [claimedWork, claimedQa] = await Promise.all([
        claimDispatchableTasks(WORKER_ID, env.DISPATCH_CONCURRENCY),
        claimQaPendingTasks(WORKER_ID, env.DISPATCH_CONCURRENCY),
      ]);

      await Promise.allSettled([
        ...claimedWork.map((task) => this.processWorkerTask(task)),
        ...claimedQa.map((task) => this.processQaTask(task)),
      ]);
    } catch (err) {
      logger.error({ err: (err as Error).message }, "dispatcher tick failed");
    } finally {
      this.running = false;
    }
  }

  /** Inspect queues, failed jobs, dependencies (PRD §3 step 1). Logged, not persisted per-tick. */
  private async systemCheck(): Promise<void> {
    const { rows } = await pool.query(
      `SELECT status, count(*)::int AS count FROM tasks GROUP BY status`
    );
    const failedFinal = rows.find((r) => r.status === "FAILED_FINAL")?.count ?? 0;
    const humanReview = rows.find((r) => r.status === "HUMAN_REVIEW")?.count ?? 0;
    if (failedFinal > 0 || humanReview > 0) {
      logger.warn({ failedFinal, humanReview }, "system check: items need attention");
    }
  }

  private async processWorkerTask(task: TaskContract): Promise<void> {
    const log = logger.child({ task_id: task.task_id, agent: task.assigned_agent });

    if (await isGloballyOrScopedPaused(task.client_id, task.run_id)) {
      log.info("task skipped: client or workflow paused");
      return;
    }

    const adapter = WORKER_ADAPTERS[task.assigned_agent];
    if (!adapter) {
      log.error("no worker adapter registered for assigned_agent");
      // No retry could ever fix a missing adapter — override the task's configured
      // max_attempts down to 1 so this fails immediately instead of backing off.
      await scheduleRetry(task.task_id, `No worker adapter for ${task.assigned_agent}`, 1);
      return;
    }

    try {
      await transitionTask(task.task_id, { status: "RUNNING", actor: task.assigned_agent });
      const output = await adapter.run(task);

      await transitionTask(task.task_id, {
        status: "COMPLETED",
        actor: adapter.name,
        result: output.result,
        evidence: output.evidence,
        confidence: output.confidence,
        issues: output.issues,
        next_action: output.next_action,
        requires_human_attention: output.requires_human_attention,
      });

      // Step 4/6 of canonical flow: every worker's completed output goes to Prime's gate.
      await transitionTask(task.task_id, { status: "QA_PENDING", actor: "hermes" });
    } catch (err) {
      log.error({ err: (err as Error).message }, "worker task failed");
      await scheduleRetry(task.task_id, (err as Error).message);
    }
  }

  private async processQaTask(task: TaskContract): Promise<void> {
    const log = logger.child({ task_id: task.task_id, agent: "prime" });
    try {
      assertAgentMayEmitDecision("prime");
      const primeOut = (await primeAdapter.run(task)) as PrimeOutput;

      await pool.query(
        `INSERT INTO prime_decisions (task_id, decision, reason, evidence_checked)
         VALUES ($1,$2,$3,$4)`,
        [task.task_id, primeOut.prime_decision, primeOut.reason, JSON.stringify(primeOut.evidence)]
      );

      await transitionTask(task.task_id, {
        status: PRIME_DECISION_TO_STATUS[primeOut.prime_decision],
        actor: "prime",
        prime_decision: primeOut.prime_decision,
        next_action: primeOut.next_action,
        requires_human_attention: primeOut.requires_human_attention || primeOut.prime_decision === "HUMAN_REVIEW",
        detail: { reason: primeOut.reason },
      });

      log.info({ decision: primeOut.prime_decision }, "Prime decision recorded");

      if (primeOut.prime_decision === "REWORK") {
        await requeueForRework(task.task_id);
      } else if (primeOut.prime_decision === "APPROVED") {
        const fresh = await getTask(task.task_id);
        if (fresh) {
          // PRD §3 canonical flow: Gemma -> DeepSeek -> Prime gate -> Nova ->
          // Prime final QA -> Hermes execute. If this task_type is pipelined
          // and this wasn't the last stage, hand off to the next agent as a
          // linked follow-up task instead of closing.
          const nextAgent = getNextPipelineAgent(fresh.task_type, fresh.assigned_agent);
          if (nextAgent) {
            await transitionTask(task.task_id, {
              status: "CLOSED",
              actor: "hermes",
              detail: { note: `Approved; pipeline advancing to ${nextAgent}.` },
            });
            const nextTask = await createTask(
              {
                client_id: fresh.client_id,
                requested_by: "hermes",
                task_type: fresh.task_type,
                priority: fresh.priority,
                input: fresh.input,
                expected_output: fresh.expected_output,
                assigned_agent: nextAgent as "gemma" | "deepseek" | "nova",
              },
              {
                parentTaskId: fresh.task_id,
                runId: fresh.run_id,
                initialEvidence: fresh.evidence,
                initialResult: fresh.result,
              }
            );
            log.info({ nextTaskId: nextTask.task_id, nextAgent }, "pipeline advanced to next stage");
          } else {
            // Last (or only) stage. Phase 1: no autonomous external actions (PRD §8 Phase 5 gate).
            await transitionTask(task.task_id, {
              status: "CLOSED",
              actor: "hermes",
              detail: { note: "Approved; controlled actions are not enabled in this Phase 1 deployment." },
            });
          }
        }
      } else if (primeOut.prime_decision === "REJECTED") {
        await transitionTask(task.task_id, { status: "CLOSED", actor: "hermes", detail: { note: "rejected by Prime" } });
      }
      // HUMAN_REVIEW: left as-is for the owner to resolve via POST /tasks/:id/resolve.
    } catch (err) {
      log.error({ err: (err as Error).message }, "Prime QA task failed");
      await escalateQaFailureIfExhausted(task.task_id, (err as Error).message);
    }
  }
}
