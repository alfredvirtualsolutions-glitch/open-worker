import type { FastifyReply, FastifyRequest } from "fastify";
import { env } from "../config/env.js";

/**
 * Single shared-secret admin token (HERMES_ADMIN_TOKEN), sent as
 * `Authorization: Bearer <token>`. Sufficient for a single-owner Phase 1
 * deployment; revisit (per-user auth) before opening this to a team.
 */
export function requireAdminToken(request: FastifyRequest, reply: FastifyReply, done: () => void): void {
  const header = request.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token || token !== env.HERMES_ADMIN_TOKEN) {
    reply.code(401).send({ error: "unauthorized" });
    return;
  }
  done();
}
