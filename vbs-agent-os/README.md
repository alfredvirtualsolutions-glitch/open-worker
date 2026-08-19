# VBS Agent Operating System — Phase 1 (Core Operations)

Implements the PRD's Phase 1 scope: the shared task contract, persistent
state, Hermes routing, the four specialist agent adapters (Gemma, DeepSeek,
Prime, Nova — all Claude-backed), state transitions, independent per-agent
reporting, and the pause/cancel kill switches. See `ADR-001-vbs-agent-operating-system.md`
for the full architecture rationale and `tasks/todo.md` for build status.

## Local development

```bash
npm install
cp .env.example .env   # fill in a real ANTHROPIC_API_KEY, DATABASE_URL, HERMES_ADMIN_TOKEN
npm run build
npm run migrate
npm run dev             # or: npm start (after build)
npm test                # vitest — state machine + task contract + redaction
npm run typecheck
```

## Deploying to hiclaw-hermes-worker

See `deploy/RUNBOOK.md` for the full step-by-step (DNS, transferring the
project, secrets, running `deploy/deploy.sh`, verifying).

## API surface (all routes require `Authorization: Bearer $HERMES_ADMIN_TOKEN`)

- `POST /tasks` — create a task (FR-01). `assigned_agent` must be one of `gemma|deepseek|nova`.
- `GET /tasks` — list recent tasks.
- `GET /tasks/:taskId` — full task + its audit trail (FR-09).
- `POST /tasks/:taskId/resolve` — owner resolves a `HUMAN_REVIEW` task.
- `GET /reports/{hermes|gemma|deepseek|prime|nova}` — independent per-agent reports (FR-07).
- `GET /reports/executive` — Hermes's consolidated view (additive, per FR-08).
- `GET /control/flags`, `POST /control/pause-all`, `POST /control/pause-client`,
  `POST /control/pause-workflow`, `POST /control/cancel-task/:taskId` — kill switches (PRD §7).
- `GET /healthz` — unauthenticated liveness/DB check.

## What's intentionally not built yet

Phase 2 (Prime control-gate UI), Phase 3 (5-agent command-center dashboard),
Phase 5 (autonomous external actions), and Phase 6 (per-client campaign
config beyond the basic `client_configs` table) are out of scope for this
delivery — see the ADR's "Consequences" section for the upgrade path.
