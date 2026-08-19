import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createTaskInputSchema } from "../../contract/taskContract.js";
import { createTask, getTask, getTaskEvents, listAllTasks, resolveHumanReview } from "../../db/taskRepo.js";
import { redactDeep } from "../../security/redact.js";
import { requireAdminToken } from "../auth.js";

const WORK_AGENTS = new Set(["gemma", "deepseek", "nova"]);

export async function taskRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", requireAdminToken);

  // FR-01: Hermes can create, assign, monitor, retry and close tasks.
  app.post("/tasks", async (request, reply) => {
    const parsed = createTaskInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid task payload", details: parsed.error.flatten() });
    }
    const agent = parsed.data.assigned_agent ?? "gemma";
    if (!WORK_AGENTS.has(agent)) {
      return reply
        .code(400)
        .send({ error: `assigned_agent must be one of gemma|deepseek|nova (got "${agent}")` });
    }
    const task = await createTask({ ...parsed.data, assigned_agent: agent as "gemma" | "deepseek" | "nova" });
    return reply.code(201).send(redactDeep(task));
  });

  app.get("/tasks", async (request, reply) => {
    const query = z.object({ limit: z.coerce.number().int().positive().max(1000).default(200) }).parse(request.query);
    const tasks = await listAllTasks(query.limit);
    return reply.send(redactDeep(tasks));
  });

  // FR-09: Owner can inspect task history, evidence, outputs, decisions and failures.
  app.get("/tasks/:taskId", async (request, reply) => {
    const { taskId } = z.object({ taskId: z.string().uuid() }).parse(request.params);
    const task = await getTask(taskId);
    if (!task) return reply.code(404).send({ error: "not found" });
    const events = await getTaskEvents(taskId);
    return reply.send(redactDeep({ task, events }));
  });

  // Owner resolves a HUMAN_REVIEW task — the owner is the final authority (PRD §7).
  app.post("/tasks/:taskId/resolve", async (request, reply) => {
    const { taskId } = z.object({ taskId: z.string().uuid() }).parse(request.params);
    const body = z
      .object({
        decision: z.enum(["APPROVED", "REWORK", "REJECTED", "CLOSED"]),
        note: z.string().optional(),
        resolved_by: z.string().default("owner"),
      })
      .parse(request.body);
    const task = await getTask(taskId);
    if (!task) return reply.code(404).send({ error: "not found" });
    if (task.status !== "HUMAN_REVIEW") {
      return reply.code(409).send({ error: `task is in ${task.status}, not HUMAN_REVIEW` });
    }
    const updated = await resolveHumanReview(taskId, body.decision, body.resolved_by, body.note);
    return reply.send(redactDeep(updated));
  });
}
