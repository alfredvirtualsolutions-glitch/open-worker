# VBS Agent Operating System — Phase 1 build plan

Scope: PRD §8 Phase 1 (Core Operations) only. Target: hiclaw-hermes-worker VPS + custom domain.

## Plan
- [x] Read PRD, produce ADR-001 (architecture + tech stack + open decisions)
- [x] Task contract schema (Zod, matches PRD §4 JSON envelope exactly)
- [x] Postgres schema: tasks, task_events (audit log), control_flags, client_configs
- [x] State machine module with transition guards (PRD §4 + Prime decision states)
- [x] Hermes dispatcher (claim via SKIP LOCKED, retries w/ backoff, pause-switch checks)
- [x] Agent adapters: gemma.ts, deepseek.ts, prime.ts, nova.ts (Claude-backed, role-scoped prompts)
- [x] Secrets redaction guard (PRD §7 — never in prompts/logs/reports)
- [x] Independent report endpoints per agent + Hermes consolidated executive report (PRD §5)
- [x] Kill switches: PAUSE_ALL / PAUSE_CLIENT / PAUSE_WORKFLOW / CANCEL_TASK
- [x] Dockerfile + docker-compose.yml (app, postgres, caddy)
- [x] Caddyfile for custom domain + automatic TLS
- [x] Deploy runbook + deploy.sh for hiclaw-hermes-worker
- [x] Local build/typecheck verification in sandbox
- [ ] User provides exact domain string → finalize Caddyfile + DNS record instructions
- [ ] User runs runbook on hiclaw-hermes-worker, supplies ANTHROPIC_API_KEY + admin token
- [ ] Post-deploy smoke test against PRD §9 acceptance checklist (Phase-1-relevant items)

## PRD alignment pass (against the full PRD document, not just ADR-001's summary)
- [x] FR-10: retry limits configurable per task_type (was hardcoded 5 everywhere) — src/config/retryPolicy.ts
- [x] PRD §3 canonical flow: Gemma → DeepSeek → Prime gate → Nova → Prime final QA chained as
      linked follow-up tasks per pipelined task_type — src/config/workflowPipeline.ts
- [x] PRD §3 step 8 "Response Analysis - Nova": POST /webhooks/inbound-reply turns an
      inbound reply into a Nova response_analysis task (channel-agnostic — a real
      provider still needs to be wired up to call it; see README "Wiring a real inbound
      channel"). Also fixed Nova's FR-06 "no approved context" guard, which was
      incorrectly blocking response-analysis tasks (they legitimately start with empty
      evidence — they analyze fresh inbound text, not draft from prior approved context).

## Phase 2 — Prime Control Gate UI (ADR-002)
- [x] ADR-002: framework (Vite+React+TS SPA, no router), auth (paste admin token,
      same bearer-token model), hosting (same container, served at /gate)
- [x] Backend: GET /tasks accepts ?status= filter (needed for the human-review queue)
- [x] web/: human-review queue, recent-activity list, Prime decision/confidence stats
      (GET /reports/prime), task detail (evidence/input/result/audit trail), resolve
      form (POST /tasks/:id/resolve)
- [x] Dockerfile web-build stage; Fastify serves web-dist/ at /gate (skipped with a
      warning if not built — local backend-only dev still works)
- [x] Smoke-tested end to end: built the SPA, started the backend, confirmed /gate/
      and /gate/assets/* serve correctly and unauthenticated API calls still 401
- [ ] Owner tries it against a real deployment and gives feedback

## Phase 3 — Command Center (ADR-002 addendum)
- [x] Second tab in the same web/ app (CommandCenter.tsx) — no backend changes needed,
      every endpoint it uses already existed from Phase 1
- [x] Executive summary, five agent cards (Hermes/Gemma/DeepSeek/Prime/Nova), PAUSE_ALL
      toggle. PAUSE_CLIENT/PAUSE_WORKFLOW stay API-only (see ADR-002 addendum for why);
      CANCEL_TASK added to TaskDetail instead (per-task action, not a dashboard control)
- [x] Real end-to-end smoke test: started a local Postgres, applied the schema, seeded
      tasks across HUMAN_REVIEW/CLOSED/FAILED_FINAL, ran the actual backend against it,
      exercised create/resolve/pause/flags over curl, then screenshotted the running UI
      (Playwright + the sandbox's pre-installed Chromium) to confirm it renders and
      behaves correctly against real data — not just a build-succeeds check
- [ ] Owner tries it against a real deployment and gives feedback

## Notes / lessons
- No SSH access from this session — deploy is runbook-based, by design (keeps owner's key off session).
- LLM backend: Claude for all 5 roles (owner's choice) — role separation enforced via system prompts + DB constraints, not separate model vendors.
- Broker: deliberately no Redis/Kafka in Phase 1 — DB-polling dispatcher is sufficient at this scale; documented upgrade path in ADR-001.
