import type { FastifyInstance } from "fastify";
import { pool } from "../../db/pool.js";
import { redactDeep } from "../../security/redact.js";
import { requireAdminToken } from "../auth.js";

/**
 * PRD §5 Reporting & Command Center: "The owner receives independent
 * operational truth from each agent plus one consolidated Hermes executive
 * view." FR-07/FR-08: each report is independently computed from the same
 * underlying tasks/task_events tables — Hermes's summary is additive, never
 * a replacement.
 */
export async function reportRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", requireAdminToken);

  // Hermes - Operations: jobs running/completed/failed, retries, blocked deps, system health.
  app.get("/reports/hermes", async (_request, reply) => {
    const { rows: byStatus } = await pool.query(
      "SELECT status, count(*)::int AS count FROM tasks GROUP BY status"
    );
    const { rows: retries } = await pool.query(
      "SELECT count(*)::int AS count FROM tasks WHERE attempt_count > 0"
    );
    const { rows: blocked } = await pool.query(
      "SELECT count(*)::int AS count FROM tasks WHERE status = 'BLOCKED'"
    );
    return reply.send(
      redactDeep({
        agent: "hermes",
        jobs_by_status: Object.fromEntries(byStatus.map((r) => [r.status, r.count])),
        tasks_retried: retries[0]?.count ?? 0,
        blocked_dependencies: blocked[0]?.count ?? 0,
        system_health: (byStatus.find((r) => r.status === "FAILED_FINAL")?.count ?? 0) === 0 ? "ok" : "attention",
      })
    );
  });

  // Gemma - Intelligence: signals found, verified insights, weak evidence, contradictions.
  app.get("/reports/gemma", async (_request, reply) => makeWorkerReport(app, "gemma", reply));

  // DeepSeek - Production: records processed, extracted, duplicates, errors, processing time.
  app.get("/reports/deepseek", async (_request, reply) => makeWorkerReport(app, "deepseek", reply));

  // Nova - Communications: messages prepared, replies, positive intent, objections, opportunities.
  app.get("/reports/nova", async (_request, reply) => makeWorkerReport(app, "nova", reply));

  // Prime - Quality: approved/rework/rejected/human-review counts, QA failures, confidence.
  app.get("/reports/prime", async (_request, reply) => {
    const { rows } = await pool.query(
      "SELECT decision, count(*)::int AS count FROM prime_decisions GROUP BY decision"
    );
    const { rows: avgConfidence } = await pool.query(
      "SELECT avg(confidence) AS avg_confidence FROM tasks WHERE confidence IS NOT NULL"
    );
    return reply.send(
      redactDeep({
        agent: "prime",
        decisions: Object.fromEntries(rows.map((r) => [r.decision, r.count])),
        average_confidence: avgConfidence[0]?.avg_confidence ? Number(avgConfidence[0].avg_confidence) : null,
      })
    );
  });

  // Executive Summary: today's output, key opportunities, attention required, blockers, recommended decisions.
  app.get("/reports/executive", async (_request, reply) => {
    const { rows: today } = await pool.query(
      "SELECT count(*)::int AS count FROM tasks WHERE created_at >= date_trunc('day', now())"
    );
    const { rows: needsAttention } = await pool.query(
      "SELECT task_id, task_type, assigned_agent, status, issues FROM tasks WHERE requires_human_attention = TRUE AND status NOT IN ('CLOSED') ORDER BY updated_at DESC LIMIT 50"
    );
    const { rows: blockers } = await pool.query(
      "SELECT task_id, task_type, status FROM tasks WHERE status IN ('BLOCKED','FAILED_FINAL') ORDER BY updated_at DESC LIMIT 50"
    );
    const { rows: byStatus } = await pool.query("SELECT status, count(*)::int AS count FROM tasks GROUP BY status");

    return reply.send(
      redactDeep({
        agent: "hermes_executive_summary",
        note: "This summary is additive; it does not replace the underlying per-agent reports (PRD §5).",
        todays_task_volume: today[0]?.count ?? 0,
        attention_required: needsAttention,
        blockers,
        system_health: byStatus,
      })
    );
  });
}

async function makeWorkerReport(_app: FastifyInstance, agent: string, reply: import("fastify").FastifyReply) {
  const { rows: processed } = await pool.query(
    "SELECT count(*)::int AS count FROM tasks WHERE assigned_agent = $1",
    [agent]
  );
  const { rows: byStatus } = await pool.query(
    "SELECT status, count(*)::int AS count FROM tasks WHERE assigned_agent = $1 GROUP BY status",
    [agent]
  );
  const { rows: weakEvidence } = await pool.query(
    "SELECT count(*)::int AS count FROM tasks WHERE assigned_agent = $1 AND confidence IS NOT NULL AND confidence < 0.5",
    [agent]
  );
  const { rows: errors } = await pool.query(
    "SELECT count(*)::int AS count FROM tasks WHERE assigned_agent = $1 AND status IN ('FAILED_RETRYABLE','FAILED_FINAL')",
    [agent]
  );
  return reply.send(
    redactDeep({
      agent,
      total_tasks: processed[0]?.count ?? 0,
      by_status: Object.fromEntries(byStatus.map((r) => [r.status, r.count])),
      weak_evidence_count: weakEvidence[0]?.count ?? 0,
      error_count: errors[0]?.count ?? 0,
    })
  );
}
