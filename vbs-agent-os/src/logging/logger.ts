import pino from "pino";
import { env } from "../config/env.js";

/**
 * Structural redaction of known secret-bearing paths (fast, safe against
 * circular Fastify request/response internals). Free-form deep redaction of
 * agent-produced content happens explicitly at the API boundary via
 * redactDeep() (see security/redact.ts) — NOT here, since applying it to
 * every log call risks recursing into circular Node objects.
 */
export const logger = pino({
  level: env.NODE_ENV === "production" ? "info" : "debug",
  transport:
    env.NODE_ENV === "development"
      ? { target: "pino-pretty", options: { colorize: true } }
      : undefined,
  redact: {
    paths: [
      "*.ANTHROPIC_API_KEY",
      "*.DATABASE_URL",
      "*.HERMES_ADMIN_TOKEN",
      "*.authorization",
      "req.headers.authorization",
    ],
    censor: "[REDACTED]",
  },
});
