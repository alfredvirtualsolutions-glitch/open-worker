# VBS Agent Operating System — Phase 1 (Core Operations)

Implements the PRD's Phase 1 scope: the shared task contract, persistent
state, Hermes routing, the four specialist agent adapters (Gemma, DeepSeek,
Prime, Nova — all Claude-backed), state transitions, independent per-agent
reporting, and the pause/cancel kill switches, plus the Phase 2 Prime Control
Gate UI. See `ADR-001-vbs-agent-operating-system.md` (Phase 1) and
`ADR-002-prime-control-gate-ui.md` (Phase 2) for the architecture rationale,
and `tasks/todo.md` for build status.

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

### Prime Control Gate UI (`web/`)

The human-review queue + task detail UI (ADR-002) is a separate small app.
For UI development, run it standalone against the backend above:

```bash
cd web
npm install
npm run dev             # http://localhost:5173, proxies API calls to :8787
```

To see it served the way production does (same origin, at `/gate`, no
proxy): `cd web && npm run build`, then `cp -r web/dist web-dist` from the
repo root and restart the backend — `docker compose`/`deploy.sh` do this
build step automatically via the Dockerfile's `web-build` stage.

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
- `POST /webhooks/inbound-reply` — turns an inbound reply (email/SMS/chat/etc.) into a
  Nova `response_analysis` task (PRD §3 step 8). Body: `{client_id, channel, from,
  reply_text, in_reply_to_task_id?, received_at?}`. See "Wiring a real inbound channel" below.
- `GET /healthz` — unauthenticated liveness/DB check.

### Wiring a real inbound channel

`POST /webhooks/inbound-reply` is the trigger PRD §3 step 8 needs, but it's
channel-agnostic by design — nothing here calls out to an email or SMS
provider yet. To wire up a real one: point that provider's inbound webhook
(e.g. Postmark/SendGrid inbound parse, Twilio SMS) at a small translator
that maps its payload to this endpoint's shape, and add that provider's own
webhook-signature verification in front of it rather than relying on the
shared `HERMES_ADMIN_TOKEN` for an externally-reachable endpoint.

## What's intentionally not built yet

Phase 3 (5-agent command-center dashboard, including the `PAUSE_*`/`CANCEL_TASK`
kill-switch UI — the API for those already exists per PRD §7, just no UI yet),
Phase 5 (autonomous external actions), and Phase 6 (per-client campaign config
beyond the basic `client_configs` table) are out of scope for this delivery —
see ADR-001's "Consequences" section and ADR-002 for the upgrade path.
