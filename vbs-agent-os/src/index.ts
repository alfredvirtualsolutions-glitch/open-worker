import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import { env } from "./config/env.js";
import { logger } from "./logging/logger.js";
import { taskRoutes } from "./api/routes/tasks.js";
import { reportRoutes } from "./api/routes/reports.js";
import { controlRoutes } from "./api/routes/control.js";
import { webhookRoutes } from "./api/routes/webhooks.js";
import { HermesDispatcher } from "./hermes/dispatcher.js";
import { pool } from "./db/pool.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Built by the `web/` Vite app (see ADR-002); copied into place at
// ./web-dist by the Docker build's web-build stage in production.
const WEB_DIST = path.join(__dirname, "../web-dist");

async function main() {
  const app = Fastify({ loggerInstance: logger as any });

  await app.register(cors, { origin: true });

  app.get("/healthz", async (_request, reply) => {
    try {
      await pool.query("SELECT 1");
      return reply.send({ ok: true, service: "vbs-agent-os", version: "1.0.0-phase1" });
    } catch (err) {
      return reply.code(503).send({ ok: false, error: (err as Error).message });
    }
  });

  await app.register(taskRoutes);
  await app.register(reportRoutes);
  await app.register(controlRoutes);
  await app.register(webhookRoutes);

  // Prime Control Gate UI (ADR-002) — static SPA served from the same
  // process/container, no separate service. Skipped with a warning if the
  // web app hasn't been built yet (e.g. local backend-only dev).
  if (existsSync(WEB_DIST)) {
    await app.register(fastifyStatic, { root: WEB_DIST, prefix: "/gate/" });
  } else {
    logger.warn({ WEB_DIST }, "web-dist not found — /gate UI not served (run `npm run build` in web/ first)");
  }

  const dispatcher = new HermesDispatcher();
  dispatcher.start();

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "shutting down");
    dispatcher.stop();
    await app.close();
    await pool.end();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  await app.listen({ host: "0.0.0.0", port: env.PORT });
  logger.info({ port: env.PORT }, "VBS Agent Operating System (Phase 1) listening");
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Fatal startup error:", err);
  process.exit(1);
});
