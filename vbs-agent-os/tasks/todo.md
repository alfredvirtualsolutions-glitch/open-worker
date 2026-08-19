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

## Notes / lessons
- No SSH access from this session — deploy is runbook-based, by design (keeps owner's key off session).
- LLM backend: Claude for all 5 roles (owner's choice) — role separation enforced via system prompts + DB constraints, not separate model vendors.
- Broker: deliberately no Redis/Kafka in Phase 1 — DB-polling dispatcher is sufficient at this scale; documented upgrade path in ADR-001.
