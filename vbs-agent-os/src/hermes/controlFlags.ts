import { pool } from "../db/pool.js";

/** PRD §7 Kill Switch: PAUSE ALL, PAUSE CLIENT, PAUSE WORKFLOW, CANCEL TASK. */
export type ControlScope = "ALL" | "CLIENT" | "WORKFLOW";

export async function isPaused(scope: ControlScope, scopeKey: string): Promise<boolean> {
  const { rows } = await pool.query(
    "SELECT paused FROM control_flags WHERE scope = $1 AND scope_key = $2",
    [scope, scopeKey]
  );
  return rows[0]?.paused === true;
}

export async function isGloballyOrScopedPaused(clientId: string, runId: string): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT paused FROM control_flags
      WHERE (scope = 'ALL' AND scope_key = 'ALL')
         OR (scope = 'CLIENT' AND scope_key = $1)
         OR (scope = 'WORKFLOW' AND scope_key = $2)`,
    [clientId, runId]
  );
  return rows.some((r) => r.paused === true);
}

export async function setPause(
  scope: ControlScope,
  scopeKey: string,
  paused: boolean,
  pausedBy: string,
  reason?: string
): Promise<void> {
  await pool.query(
    `INSERT INTO control_flags (scope, scope_key, paused, paused_by, paused_at, reason)
     VALUES ($1,$2,$3,$4, CASE WHEN $3 THEN now() ELSE NULL END, $5)
     ON CONFLICT (scope, scope_key)
     DO UPDATE SET paused = $3, paused_by = $4, paused_at = CASE WHEN $3 THEN now() ELSE NULL END, reason = $5`,
    [scope, scopeKey, paused, pausedBy, reason ?? null]
  );
}

export async function listControlFlags() {
  const { rows } = await pool.query("SELECT * FROM control_flags ORDER BY scope, scope_key");
  return rows;
}
