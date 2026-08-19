import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { pool } from "./pool.js";
import type { AgentName, CreateTaskInput, TaskContract, TaskStatus } from "../contract/taskContract.js";
import { taskContractSchema } from "../contract/taskContract.js";
import { assertLegalTransition } from "../contract/stateMachine.js";
import { getMaxAttemptsForTaskType, DEFAULT_MAX_ATTEMPTS, DEFAULT_QA_MAX_ATTEMPTS } from "../config/retryPolicy.js";

function rowToContract(row: Record<string, unknown>): TaskContract {
  return taskContractSchema.parse({
    client_id: row.client_id,
    run_id: row.run_id,
    task_id: row.task_id,
    parent_task_id: row.parent_task_id,
    created_at: new Date(row.created_at as string).toISOString(),
    requested_by: row.requested_by,
    assigned_agent: row.assigned_agent,
    task_type: row.task_type,
    priority: row.priority,
    input: row.input,
    expected_output: row.expected_output,
    status: row.status,
    confidence: row.confidence,
    evidence: row.evidence,
    result: row.result,
    issues: row.issues,
    prime_decision: row.prime_decision,
    next_action: row.next_action,
    requires_human_attention: row.requires_human_attention,
  });
}

export async function createTask(
  input: CreateTaskInput,
  opts?: {
    parentTaskId?: string;
    runId?: string;
    /** Seed evidence/result carried forward from a prior pipeline stage (PRD §3 canonical flow). */
    initialEvidence?: unknown[];
    initialResult?: Record<string, unknown>;
  }
): Promise<TaskContract> {
  const task_id = randomUUID();
  const run_id = opts?.runId ?? randomUUID();
  const assigned_agent: AgentName = input.assigned_agent ?? "hermes";
  // PRD FR-10: retry limits are configurable per task type, not a global constant.
  const max_attempts = getMaxAttemptsForTaskType(input.task_type);

  const { rows } = await pool.query(
    `INSERT INTO tasks (
        task_id, run_id, parent_task_id, client_id, requested_by, assigned_agent,
        task_type, priority, input, expected_output, status, max_attempts, evidence, result
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'QUEUED',$11,$12,$13)
     RETURNING *`,
    [
      task_id,
      run_id,
      opts?.parentTaskId ?? null,
      input.client_id,
      input.requested_by,
      assigned_agent,
      input.task_type,
      input.priority ?? "normal",
      JSON.stringify(input.input ?? {}),
      JSON.stringify(input.expected_output ?? {}),
      max_attempts,
      JSON.stringify(opts?.initialEvidence ?? []),
      JSON.stringify(opts?.initialResult ?? {}),
    ]
  );

  await logEvent(task_id, "system", "CREATED", null, "QUEUED", { requested_by: input.requested_by });
  return rowToContract(rows[0]);
}

export async function getTask(taskId: string): Promise<TaskContract | null> {
  const { rows } = await pool.query("SELECT * FROM tasks WHERE task_id = $1", [taskId]);
  return rows[0] ? rowToContract(rows[0]) : null;
}

export async function listTasksByAgent(agent: AgentName, limit = 100): Promise<TaskContract[]> {
  const { rows } = await pool.query(
    "SELECT * FROM tasks WHERE assigned_agent = $1 ORDER BY created_at DESC LIMIT $2",
    [agent, limit]
  );
  return rows.map(rowToContract);
}

export async function listAllTasks(limit = 200, status?: TaskStatus): Promise<TaskContract[]> {
  const { rows } = status
    ? await pool.query("SELECT * FROM tasks WHERE status = $1 ORDER BY created_at DESC LIMIT $2", [status, limit])
    : await pool.query("SELECT * FROM tasks ORDER BY created_at DESC LIMIT $1", [limit]);
  return rows.map(rowToContract);
}

export async function logEvent(
  taskId: string,
  actor: string,
  eventType: string,
  fromStatus: TaskStatus | null,
  toStatus: TaskStatus | null,
  detail: Record<string, unknown> = {},
  client?: PoolClient
): Promise<void> {
  const runner = client ?? pool;
  await runner.query(
    `INSERT INTO task_events (task_id, actor, event_type, from_status, to_status, detail)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [taskId, actor, eventType, fromStatus, toStatus, JSON.stringify(detail)]
  );
}

export async function getTaskEvents(taskId: string) {
  const { rows } = await pool.query(
    "SELECT event_id, at, actor, event_type, from_status, to_status, detail FROM task_events WHERE task_id = $1 ORDER BY at ASC",
    [taskId]
  );
  return rows;
}

/**
 * Atomically claim up to `limit` dispatchable WORK tasks (assigned to a
 * specialist worker: gemma/deepseek/nova) for this worker instance,
 * transitioning QUEUED/FAILED_RETRYABLE -> ASSIGNED. Uses FOR UPDATE SKIP LOCKED
 * so multiple Hermes instances (future scale-out) never double-claim a task.
 */
export async function claimDispatchableTasks(workerId: string, limit: number): Promise<TaskContract[]> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `SELECT * FROM tasks
        WHERE status IN ('QUEUED','FAILED_RETRYABLE')
          AND run_at <= now()
          AND assigned_agent IN ('gemma','deepseek','nova')
        ORDER BY priority = 'urgent' DESC, priority = 'high' DESC, created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT $1`,
      [limit]
    );

    const claimed: TaskContract[] = [];
    for (const row of rows) {
      const from = row.status as TaskStatus;
      assertLegalTransition(from, "ASSIGNED");
      await client.query(
        `UPDATE tasks SET status = 'ASSIGNED', locked_by = $2, locked_at = now(), updated_at = now()
          WHERE task_id = $1`,
        [row.task_id, workerId]
      );
      await logEvent(row.task_id, "hermes", "STATE_CHANGE", from, "ASSIGNED", { worker: workerId }, client);
      claimed.push(rowToContract({ ...row, status: "ASSIGNED" }));
    }
    await client.query("COMMIT");
    return claimed;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Claim tasks sitting in QA_PENDING for Prime's review. Unlike worker tasks,
 * these stay assigned to whichever agent produced them — Prime reviews the
 * SAME task record (no child-task fan-out) so the audit trail stays on one
 * task_id per PRD §4's traceability requirement.
 */
export async function claimQaPendingTasks(workerId: string, limit: number): Promise<TaskContract[]> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `SELECT * FROM tasks
        WHERE status = 'QA_PENDING'
        ORDER BY priority = 'urgent' DESC, priority = 'high' DESC, updated_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT $1`,
      [limit]
    );
    for (const row of rows) {
      await client.query(
        `UPDATE tasks SET locked_by = $2, locked_at = now() WHERE task_id = $1`,
        [row.task_id, workerId]
      );
    }
    await client.query("COMMIT");
    return rows.map(rowToContract);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export interface StatusUpdate {
  status: TaskStatus;
  actor: string;
  result?: Record<string, unknown>;
  evidence?: unknown[];
  confidence?: number | null;
  issues?: unknown[];
  next_action?: string | null;
  requires_human_attention?: boolean;
  prime_decision?: string | null;
  detail?: Record<string, unknown>;
}

export async function transitionTask(taskId: string, update: StatusUpdate): Promise<TaskContract> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query("SELECT * FROM tasks WHERE task_id = $1 FOR UPDATE", [taskId]);
    if (!rows[0]) throw new Error(`Task ${taskId} not found`);
    const from = rows[0].status as TaskStatus;
    assertLegalTransition(from, update.status);

    const { rows: updated } = await client.query(
      `UPDATE tasks SET
          status = $2,
          result = COALESCE($3, result),
          evidence = COALESCE($4, evidence),
          confidence = COALESCE($5, confidence),
          issues = COALESCE($6, issues),
          next_action = COALESCE($7, next_action),
          requires_human_attention = COALESCE($8, requires_human_attention),
          prime_decision = COALESCE($9, prime_decision),
          updated_at = now(),
          locked_by = NULL,
          locked_at = NULL
        WHERE task_id = $1
        RETURNING *`,
      [
        taskId,
        update.status,
        update.result ? JSON.stringify(update.result) : null,
        update.evidence ? JSON.stringify(update.evidence) : null,
        update.confidence === undefined ? null : update.confidence,
        update.issues ? JSON.stringify(update.issues) : null,
        update.next_action === undefined ? null : update.next_action,
        update.requires_human_attention === undefined ? null : update.requires_human_attention,
        update.prime_decision === undefined ? null : update.prime_decision,
      ]
    );

    await logEvent(taskId, update.actor, "STATE_CHANGE", from, update.status, update.detail ?? {}, client);
    await client.query("COMMIT");
    return rowToContract(updated[0]);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/** REWORK -> QUEUED, back to the originating worker (PRD FR-05), attempt_count bumped. */
export async function requeueForRework(taskId: string): Promise<TaskContract> {
  await pool.query(
    `UPDATE tasks SET status = 'QUEUED', attempt_count = attempt_count + 1, run_at = now(), updated_at = now()
      WHERE task_id = $1`,
    [taskId]
  );
  await logEvent(taskId, "hermes", "STATE_CHANGE", "REWORK", "QUEUED", { note: "returned to originating worker" });
  const task = await getTask(taskId);
  if (!task) throw new Error("Task disappeared during rework requeue");
  return task;
}

/** Owner-only resolution of a HUMAN_REVIEW task (PRD §7: owner is final authority). */
export async function resolveHumanReview(
  taskId: string,
  decision: "APPROVED" | "REWORK" | "REJECTED" | "CLOSED",
  actor: string,
  note?: string
): Promise<TaskContract> {
  return transitionTask(taskId, {
    status: decision,
    actor,
    detail: { note: note ?? "owner resolved HUMAN_REVIEW" },
  });
}

/**
 * QA-stage failures (Prime's own adapter call erroring) stay in QA_PENDING and
 * are simply retried on the next dispatcher tick, up to `maxAttempts`, then
 * escalated straight to HUMAN_REVIEW — deliberately NOT routed through
 * FAILED_RETRYABLE/QUEUED, because that queue is worker-claimed by
 * assigned_agent and would incorrectly re-run the original worker instead of
 * retrying Prime's review.
 */
export async function escalateQaFailureIfExhausted(
  taskId: string,
  reason: string,
  maxAttemptsOverride?: number
): Promise<void> {
  const { rows } = await pool.query(
    "UPDATE tasks SET attempt_count = attempt_count + 1, updated_at = now() WHERE task_id = $1 RETURNING attempt_count, max_attempts",
    [taskId]
  );
  const attempt = rows[0]?.attempt_count ?? 1;
  const maxAttempts = maxAttemptsOverride ?? rows[0]?.max_attempts ?? DEFAULT_QA_MAX_ATTEMPTS;
  if (attempt >= maxAttempts) {
    await transitionTask(taskId, {
      status: "HUMAN_REVIEW",
      actor: "hermes",
      requires_human_attention: true,
      detail: { reason: `Prime QA review failed ${attempt} times: ${reason}` },
    });
  } else {
    await logEvent(taskId, "hermes", "QA_RETRY_PENDING", "QA_PENDING", "QA_PENDING", { attempt, reason });
  }
}

/**
 * Bounded exponential backoff retry, per PRD §7 Retry Policy. Reads/bumps
 * attempt_count itself. The retry limit is the task's own `max_attempts`
 * (set at creation from its task_type, per FR-10) unless the caller passes
 * an explicit override — used for failures no retry could ever fix (e.g. no
 * adapter registered for the assigned agent).
 */
export async function scheduleRetry(taskId: string, reason: string, maxAttemptsOverride?: number): Promise<TaskContract> {
  const { rows } = await pool.query("SELECT attempt_count, max_attempts FROM tasks WHERE task_id = $1", [taskId]);
  const attempt = (rows[0]?.attempt_count ?? 0) + 1;
  const maxAttempts = maxAttemptsOverride ?? rows[0]?.max_attempts ?? DEFAULT_MAX_ATTEMPTS;
  if (attempt >= maxAttempts) {
    const failed = await transitionTask(taskId, {
      status: "FAILED_FINAL",
      actor: "hermes",
      requires_human_attention: true,
      detail: { reason, attempt, maxAttempts },
    });
    await transitionTask(taskId, {
      status: "HUMAN_REVIEW",
      actor: "hermes",
      detail: { reason: "Retries exhausted, surfaced to owner", attempt },
    });
    return failed;
  }

  const backoffSeconds = Math.min(60 * 2 ** attempt, 3600);
  await pool.query(
    `UPDATE tasks SET status = 'FAILED_RETRYABLE', attempt_count = $2,
        run_at = now() + ($3 || ' seconds')::interval, updated_at = now(), locked_by = NULL
      WHERE task_id = $1`,
    [taskId, attempt, backoffSeconds]
  );
  await logEvent(taskId, "hermes", "RETRY_SCHEDULED", "RUNNING", "FAILED_RETRYABLE", {
    reason,
    attempt,
    backoffSeconds,
  });
  const task = await getTask(taskId);
  if (!task) throw new Error("Task disappeared during retry scheduling");
  return task;
}
