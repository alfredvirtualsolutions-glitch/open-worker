# AGENTS.md — open-worker / vbs-agent-os

## Repo structure
- `agent-os/` — Agent OS framework (standards, commands, profiles, scripts) — not the app
- `vbs-agent-os/` — **The actual application** (Phase 1 Core Operations)
  - Node.js 20 + TypeScript, Fastify API, PostgreSQL (managed), Docker Compose deploy
  - Five agent roles: Hermes (orchestrator), Gemma (research), DeepSeek (extraction), Prime (QA gate), Nova (comms) — all Claude-backed
  - `web/` — Prime Control Gate UI (React + Vite), built separately, served as static files at `/gate`
  - `src/services/` — External service integrations (Sequenzy, bunny.net)

## Key commands (run from `vbs-agent-os/`)

### Local development
```bash
npm install
cp .env.example .env   # fill in ANTHROPIC_API_KEY, DATABASE_URL, HERMES_ADMIN_TOKEN, SEQUENZY_API_KEY, BUNNY_API_KEY
npm run build          # tsc + copies schema.sql to dist/db/
npm run migrate        # runs schema.sql against managed Postgres
npm run dev            # tsx watch src/index.ts (port 8787)
npm run start          # node dist/index.js (after build)
npm test               # vitest run — state machine, task contract, redaction, pipeline
npm run typecheck      # tsc --noEmit
```

### Web UI (Prime Control Gate)
```bash
cd web
npm install
npm run dev            # http://localhost:5173, proxies API to :8787
npm run build          # tsc --noEmit && vite build → web/dist
# For prod: cp -r web/dist ../web-dist, then rebuild backend Docker image
```

### Deploy (on `hiclaw-hermes-worker` VPS)
```bash
cd /opt/vbs-agent-os
cp .env.example .env   # fill in real secrets (never paste into chat)
chmod +x deploy/deploy.sh
./deploy/deploy.sh     # builds image, runs migrate, starts compose, installs systemd unit
```
- Uses managed Postgres (external) — `DATABASE_URL` must include `?sslmode=require`
- Caddy terminates TLS (Let's Encrypt) for `DOMAIN` (e.g., `ops.warmail.online`)
- Systemd unit: `systemctl restart vbs-agent-os` / `docker compose logs -f app`

## Required env vars (`.env` on server only — never commit)
| Var | Purpose |
|-----|---------|
| `DOMAIN` | Custom domain for Caddy (must have A record pointing at VPS) |
| `DATABASE_URL` | Managed Postgres connection string with `?sslmode=require` |
| `ANTHROPIC_API_KEY` | Single key for all 5 agent roles (`sk-ant-...`) |
| `HERMES_ADMIN_TOKEN` | Bearer token for all API calls (`openssl rand -hex 32`) |
| `DISPATCH_INTERVAL_MS` | Hermes poll interval (default 3000) |
| `DISPATCH_CONCURRENCY` | Max concurrent tasks (default 3) |
| `MODEL_*` | Per-role model override (default `claude-sonnet-4-5`) |
| `SEQUENZY_API_KEY` | Email marketing API key (Nova: transactional sends, subscribers, events) |
| `BUNNY_API_KEY` | CDN/storage/video API key (DeepSeek: uploads, purges, video push) |
| `BUNNY_STORAGE_ZONE` | bunny.net storage zone name (for file uploads) |
| `BUNNY_CDN_HOSTNAME` | bunny.net CDN hostname (for cache purges) |

## Architecture highlights
- **Task contract** — Zod schema + Postgres `tasks` table; state machine enforced in DB (CHECK constraints + `task_events` audit log)
- **Hermes dispatcher** — polls `tasks WHERE status IN (QUEUED, FAILED_RETRYABLE) AND run_at <= now()` with `SELECT FOR UPDATE SKIP LOCKED`; exponential backoff retries
- **Agent adapters** — thin wrappers: load contract → call Claude with role-scoped prompt → validate output via Zod → persist result/evidence
- **Prime gate** — only Prime can set `prime_decision` and move task to `APPROVED/REWORK/REJECTED/HUMAN_REVIEW`; enforced in DB layer
- **Pipelined workflows** — configured in `src/config/workflowPipeline.ts`; `task_type` in pipeline auto-overrides `assigned_agent` to first stage
- **Kill switches** — `PAUSE_ALL`, `PAUSE_CLIENT`, `PAUSE_WORKFLOW` in `control_flags` table (checked before every claim); `CANCEL_TASK` via status transition
- **Secrets** — never logged, never in payloads/reports; redaction guard in logger + lint rule

## External service integrations (Phase 5 slice)
- **Sequenzy** (`src/services/sequenzy.ts`) — Nova handles: `sequenzy_send_email`, `sequenzy_trigger_event`, `sequenzy_manage_subscriber`. Calls `https://api.sequenzy.com/api/v1` with Bearer token.
- **bunny.net** (`src/services/bunny.ts`) — DeepSeek handles: `bunny_upload`, `bunny_purge`, `bunny_video_push`. Calls `https://api.bunny.net` and `https://storage.bunnycdn.com` with `Access-Key` header.
- Both are **opt-in**: if the API key env var is missing, the adapter returns a structured error instead of crashing.
- Pipelined workflows: `email_outreach` (gemma→deepseek→nova), `content_publish` (gemma→deepseek→nova).

## API surface (all require `Authorization: Bearer $HERMES_ADMIN_TOKEN`)
- `POST /tasks` — create task (`assigned_agent`: gemma|deepseek|nova; overridden for pipelined types)
- `GET /tasks` / `GET /tasks/:taskId` — list / detail + audit trail
- `POST /tasks/:taskId/resolve` — resolve `HUMAN_REVIEW` task
- `GET /reports/{hermes|gemma|deepseek|prime|nova}` — independent per-agent reports
- `GET /reports/executive` — Hermes consolidated view
- `GET/POST /control/flags` — kill switches (`pause-all`, `pause-client`, `pause-workflow`, `cancel-task/:taskId`)
- `POST /webhooks/inbound-reply` — turns inbound reply into Nova `response_analysis` task
- `GET /healthz` — unauthenticated liveness/DB check

## Testing
- `vitest` — unit tests only (state machine, task contract, redaction, workflow pipeline)
- No integration tests; requires managed Postgres for full verification
- Run single test: `npx vitest run tests/stateMachine.test.ts`

## What's NOT built yet (by design)
- Phase 3: 5-agent command-center dashboard (kill-switch UI)
- Phase 6: Per-client campaign config beyond basic `client_configs` table

## Key files to know
- `ADR-001-vbs-agent-operating-system.md` — Phase 1 architecture rationale
- `ADR-002-prime-control-gate-ui.md` — Phase 2 UI rationale
- `src/config/workflowPipeline.ts` — pipelined task_type definitions + external action task types
- `src/contract/stateMachine.ts` — state transition guards
- `src/services/sequenzy.ts` — Sequenzy REST API wrapper (Nova)
- `src/services/bunny.ts` — bunny.net REST API wrapper (DeepSeek)
- `deploy/RUNBOOK.md` — full deploy procedure (DNS, secrets, verification)