import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { setPause, listControlFlags } from "../../hermes/controlFlags.js";
import { transitionTask, getTask } from "../../db/taskRepo.js";
import { requireAdminToken } from "../auth.js";

/** PRD §7 Kill Switch: PAUSE ALL, PAUSE CLIENT, PAUSE WORKFLOW, CANCEL TASK. */
export async function controlRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", requireAdminToken);

  app.get("/control/flags", async (_request, reply) => reply.send(await listControlFlags()));

  app.post("/control/pause-all", async (request, reply) => {
    const body = z.object({ paused: z.boolean(), by: z.string().default("owner"), reason: z.string().optional() }).parse(
      request.body
    );
    await setPause("ALL", "ALL", body.paused, body.by, body.reason);
    return reply.send({ ok: true });
  });

  app.post("/control/pause-client", async (request, reply) => {
    const body = z
      .object({ client_id: z.string(), paused: z.boolean(), by: z.string().default("owner"), reason: z.string().optional() })
      .parse(request.body);
    await setPause("CLIENT", body.client_id, body.paused, body.by, body.reason);
    return reply.send({ ok: true });
  });

  app.post("/control/pause-workflow", async (request, reply) => {
    const body = z
      .object({ run_id: z.string().uuid(), paused: z.boolean(), by: z.string().default("owner"), reason: z.string().optional() })
      .parse(request.body);
    await setPause("WORKFLOW", body.run_id, body.paused, body.by, body.reason);
    return reply.send({ ok: true });
  });

  app.post("/control/cancel-task/:taskId", async (request, reply) => {
    const { taskId } = z.object({ taskId: z.string().uuid() }).parse(request.params);
    const task = await getTask(taskId);
    if (!task) return reply.code(404).send({ error: "not found" });
    if (["CLOSED", "REJECTED", "FAILED_FINAL"].includes(task.status)) {
      return reply.code(409).send({ error: `task already terminal (${task.status})` });
    }
    const updated = await transitionTask(taskId, {
      status: "HUMAN_REVIEW",
      actor: "owner",
      requires_human_attention: true,
      detail: { note: "cancelled by owner — awaiting disposal via /tasks/:id/resolve" },
    });
    return reply.send({ ok: true, task: updated });
  });
}
