# VBS Agent Operating System — Phase 1 (Core Operations)

Implements the PRD's Phase 1 scope: the shared task contract, persistent
state, Hermes routing, the four specialist agent adapters (Gemma, DeepSeek,
Prime, Nova — all Claude-backed), state transitions, independent per-agent
reporting, and the pause/cancel kill switches. See `ADR-001-vbs-agent-operating-system.md`
for the full architecture rationale and `tasks/todo.md` for build status.

The PRD's canonical end-to-end flow (§3) — Gemma research → DeepSeek
extraction → Prime gate → Nova communication prep → Prime final QA →
Hermes execute — is implemented as chained tasks: every single worker's
output already goes through a Prime QA gate before closing, so a
pipelined `task_type` (configured in `src/config/workflowPipeline.ts`)
just has Hermes spawn the next stage as a linked follow-up task
(`parent_task_id`/`run_id`) each time Prime approves, carrying the prior
stage's evidence/result forward. A `task_type` absent from that config
behaves as a single worker + one Prime gate, same as before.

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
  If `task_type` is a pipelined type (see `src/config/workflowPipeline.ts`), `assigned_agent`
  is overridden to the pipeline's first stage regardless of what's passed.
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
