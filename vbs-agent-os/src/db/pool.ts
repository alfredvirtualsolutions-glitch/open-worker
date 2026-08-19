import pg from "pg";
import { env } from "../config/env.js";

// Managed Postgres providers (UpCloud Managed Databases, etc.) typically
// require TLS (`sslmode=require`) but present a cert chain node's default
// trust store may not have — request TLS without strict CA verification in
// that case rather than failing to connect. Self-hosted/local Postgres
// (no sslmode param) is unaffected.
const needsSsl = /sslmode=require/i.test(env.DATABASE_URL);

export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
  max: 10,
  idleTimeoutMillis: 30_000,
});

pool.on("error", (err) => {
  // A dropped idle connection should not crash the process (NFR: Reliability).
  // eslint-disable-next-line no-console
  console.error({ err: err.message }, "unexpected postgres pool error");
});
