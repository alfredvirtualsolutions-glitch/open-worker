import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createTask, getTask } from "../../db/taskRepo.js";
import { RESPONSE_ANALYSIS_TASK_TYPE } from "../../config/workflowPipeline.js";
import { redactDeep } from "../../security/redact.js";
import { requireAdminToken } from "../auth.js";

/**
 * PRD §3 step 8 "Response Analysis - Nova": Response Analysis needs
 * something to actually trigger it when an inbound reply arrives. This is
 * that trigger — a channel-agnostic ingestion endpoint. Whatever receives
 * the reply first (an email inbound-parse webhook, an SMS provider
 * callback, a chat platform event, or the owner pasting one in manually)
 * normalizes it to this shape and POSTs it here; this turns it into a
 * standard Nova task and lets it flow through the existing dispatcher and
 * Prime gate exactly like any other task.
 *
 * Auth: reuses the same bearer-token model as every other route for now.
 * Wiring a real provider (Postmark/SendGrid inbound parse, Twilio, etc.)
 * later should add that provider's own webhook-signature verification in
 * front of this route rather than relying on the shared admin token.
 */
const inboundReplySchema = z.object({
  client_id: z.string().min(1),
  channel: z.string().min(1), // e.g. "email" | "sms" | "chat" | "other" — free string, PRD FR-11 (config, not hard-coded flows)
  from: z.string().min(1),
  reply_text: z.string().min(1),
  in_reply_to_task_id: z.string().uuid().nullable().optional(),
  received_at: z.string().datetime().optional(),
});

export async function webhookRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", requireAdminToken);

  app.post("/webhooks/inbound-reply", async (request, reply) => {
    const parsed = inboundReplySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid inbound reply payload", details: parsed.error.flatten() });
    }
    const body = parsed.data;

    let parentTaskId: string | undefined;
    let runId: string | undefined;
    if (body.in_reply_to_task_id) {
      const original = await getTask(body.in_reply_to_task_id);
      if (!original) {
        return reply.code(404).send({ error: `in_reply_to_task_id ${body.in_reply_to_task_id} not found` });
      }
      if (original.client_id !== body.client_id) {
        return reply
          .code(400)
          .send({ error: `in_reply_to_task_id belongs to client "${original.client_id}", not "${body.client_id}"` });
      }
      parentTaskId = original.task_id;
      runId = original.run_id;
    }

    // Redact before this ever reaches a prompt or gets persisted — an inbound
    // reply is untrusted external content and could contain a pasted secret
    // (PRD §7: credentials must never be placed in prompts, task logs or reports).
    const safeInput = redactDeep({
      channel: body.channel,
      from: body.from,
      reply_text: body.reply_text,
      received_at: body.received_at ?? new Date().toISOString(),
      in_reply_to_task_id: body.in_reply_to_task_id ?? null,
    });

    const task = await createTask(
      {
        client_id: body.client_id,
        requested_by: "system",
        task_type: RESPONSE_ANALYSIS_TASK_TYPE,
        priority: "normal",
        input: safeInput,
        expected_output: {},
        assigned_agent: "nova",
      },
      { parentTaskId, runId }
    );

    return reply.code(201).send(redactDeep(task));
  });
}
