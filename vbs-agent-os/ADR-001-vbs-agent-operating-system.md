# ADR-001: VBS Agent Operating System — Phase 1 (Core Operations)

**Status:** Accepted (Phase 1 scope)
**Date:** 2026-08-19
**Deciders:** Alfred (owner)

## Context

Virtual Business Solutions wants to coordinate five AI workers — **Hermes** (orchestrator),
**Gemma** (research/intelligence), **DeepSeek** (execution/extraction), **Prime** (QA & control
gate), and **Nova** (communications) — as one operating system instead of five disconnected
assistants. The PRD (v1.0) defines a shared task contract, a task state machine, a QA gate with
four decision states, independent per-agent reporting plus a consolidated executive view, and a
six-phase rollout. Full autonomous external action (Phase 5) is explicitly gated behind passing
every acceptance criterion — this build does not enable it.

Constraints for this iteration:
- **Scope:** Phase 1 only — task contract, persistent state, Hermes routing, agent adapters,
  state transitions, independent reporting. No autonomous external actions.
- **LLM backend:** Claude (Anthropic API) for all five agent roles — one key, five distinct
  system prompts/role boundaries taken from PRD §2.
- **Target host:** single UpCloud VPS `hiclaw-hermes-worker` (Ubuntu 24.04, 2 vCPU / 4GB RAM /
  233GB disk, 95.111.213.103), reachable at a Cloudflare-managed custom domain.
- **Access model:** no SSH access from this session — delivered as a runbook + deploy script the
  owner runs themselves. Secrets never leave the owner's machine/server.

## Decision

Build a single-VPS-sized system:

- **Language/runtime:** Node.js 20 + TypeScript. One codebase, one container image, easy to run
  on a 4GB box, first-class Anthropic SDK support.
- **API/orchestrator:** Fastify. Hermes is both an HTTP API (task intake, reports, kill switches)
  and a dispatcher loop (poll-based, no separate broker needed at this scale).
- **Persistence:** PostgreSQL 16. The task contract is the row; state transitions are enforced in
  a single `tasks` table with a `task_events` audit-log table (append-only) satisfying the PRD's
  traceability requirement (§4) and NFR "Auditability."
- **Queueing/retries:** No separate broker (Kafka/SQS/Redis) for Phase 1 — task volume on one
  operator's desk doesn't need it, and the PRD explicitly wants reusability without added
  infra. Hermes polls `tasks WHERE status IN (QUEUED, FAILED_RETRYABLE) AND run_at <= now()`
  with `SELECT ... FOR UPDATE SKIP LOCKED` for safe concurrency, bounded exponential-backoff
  retries per PRD §7. Revisit Redis/BullMQ only if throughput or multi-instance Hermes is needed.
- **Agent adapters:** four modules (`gemma.ts`, `deepseek.ts`, `prime.ts`, `nova.ts`), each a thin
  wrapper that (a) loads the task contract, (b) calls Claude with a role-scoped system prompt
  encoding the PRD §2 "Owns / Must Not Own" boundaries, (c) validates the model's output against
  a Zod schema before persisting, (d) writes the result + evidence back onto the task contract.
  Hermes never calls a worker's model directly — it only assigns/collects.
- **Prime gate:** a fifth adapter, but privileged — the only one allowed to set `prime_decision`
  and move a task to `APPROVED / REWORK / REJECTED / HUMAN_REVIEW`. Enforced in the DB layer, not
  just convention (a Postgres CHECK constraint + a dedicated `prime_decisions` audit table).
- **Reporting (Phase 1 slice):** independent per-agent report endpoints
  (`GET /reports/{hermes|gemma|deepseek|prime|nova}`) computed from `tasks` +
  `task_events`, satisfying FR-07/FR-08 without building the full Phase 3 dashboard UI yet.
  Hermes's consolidated report is additive, never a replacement (PRD §5 reporting rule).
- **Kill switches (Phase 1 slice):** `PAUSE_ALL`, `PAUSE_CLIENT`, `PAUSE_WORKFLOW` as rows in a
  `control_flags` table checked by the dispatcher before every claim; `CANCEL_TASK` as a status
  transition. Full command-center UI is Phase 3; the control primitives ship now so Phase 3 is UI
  on top of working switches, not new logic.
- **Secrets:** `.env` file on the VPS only, loaded via `dotenv`/systemd `EnvironmentFile`, never
  logged, never placed in task payloads or reports (PRD §7 hard requirement — enforced by a
  redaction check in the logger and a lint rule against interpolating `process.env` into any
  `result`/`evidence` field).
- **Deployment topology:** Docker Compose on the VPS — `app` (Hermes API + dispatcher, one
  container, both share the compiled TS build so there's one process type, not five), `postgres`,
  and `caddy` as reverse proxy terminating TLS automatically via Let's Encrypt for the custom
  domain (Cloudflare DNS → A record → Caddy → app). systemd keeps `docker compose` running across
  reboots. No Kubernetes — one box, one operator, not worth the operational overhead yet.

## Options Considered

### Option A: Node/TS + Postgres + Docker Compose on the single VPS (chosen)
| Dimension | Assessment |
|---|---|
| Complexity | Low — one language, one datastore, one deploy unit |
| Cost | Lowest — no managed broker/queue, fits existing $74/mo VPS |
| Scalability | Adequate for one operator/one team; documented upgrade path to Redis+BullMQ or multi-instance Postgres-backed queue if volume grows |
| Team familiarity | High — TS/Node is the most common stack for this shape of system |

**Pros:** fastest to ship Phase 1, matches PRD's "reusable OS, not hard-coded flows" (FR-11) via
config-driven client profiles later, keeps ops burden near zero for a single owner.
**Cons:** single point of failure (one VPS); acceptable for Phase 1 given no autonomous external
actions are enabled yet, revisit before Phase 5.

### Option B: Python (FastAPI) + Celery + Redis + Postgres
| Dimension | Assessment |
|---|---|
| Complexity | Medium-High — broker + worker pool to operate |
| Cost | Higher — extra Redis service, more RAM pressure on a 4GB box |
| Scalability | Better at high volume, overkill here |
| Team familiarity | Fine, but adds moving parts for no Phase-1 benefit |

**Cons:** Celery/Redis is real operational surface for a workload that's currently "one operator's
task queue." Rejected for Phase 1; the DB-polling design in Option A can migrate to this later
without changing the task contract.

### Option C: Serverless (Cloudflare Workers / Lambda) functions per agent
**Cons:** rejected outright — the PRD's explicit target is a VPS the owner already provisioned
(`hiclaw-hermes-worker`) running "locally," and serverless cold starts/state make the QA-gate
audit trail and pause switches harder to reason about for no gain at this scale.

## Trade-off Analysis

The core trade-off is **operational simplicity now vs. horizontal scalability later**. Everything
in Option A is chosen so that scaling later is additive (swap DB-polling for a real queue, add a
second `app` replica behind Caddy, move Postgres to a managed instance) without touching the task
contract, the state machine, or the agent adapter interfaces — those are the load-bearing walls
per the PRD ("Keep the OS reusable... without redesigning the core architecture").

## Consequences

- **Easier:** onboarding a new client (PRD FR-11) is a new row in `client_configs`, not new code;
  adding a sixth agent later is a new adapter module implementing the same interface; debugging is
  "read `task_events` for this `task_id`" (PRD traceability requirement, satisfied by construction).
- **Harder:** if task volume grows past what one VPS/Postgres can poll comfortably, Hermes's
  dispatcher needs to move off `SELECT FOR UPDATE SKIP LOCKED` polling to a real queue — documented
  as the Phase 1→beyond upgrade path, not attempted now.
- **Revisit:** before enabling Phase 5 (Controlled Actions), re-evaluate single-VPS availability
  and add idempotency-protected outbound integrations per PRD §7; before Phase 6, confirm the
  `client_configs` shape covers real second-client requirements.

## Action Items

1. [x] Define the task contract schema (Zod + Postgres DDL).
2. [x] Implement state machine + transition guards.
3. [x] Implement Hermes dispatcher (claim, retry, backoff, pause-switch checks).
4. [x] Implement four agent adapters (Gemma, DeepSeek, Prime, Nova) calling Claude with
   role-scoped prompts and PRD-derived Owns/Must-Not-Own guardrails.
5. [x] Implement independent per-agent report endpoints + Hermes consolidated report.
6. [x] Implement audit log (`task_events`) and secret-redaction guard.
7. [x] Package as Docker Compose (app + postgres + caddy) with Caddyfile for the custom domain.
8. [ ] Owner runs `deploy/RUNBOOK.md` on `hiclaw-hermes-worker` and confirms the custom domain
   (Cloudflare A record → server IP) once the exact hostname is provided.
9. [ ] Owner supplies `ANTHROPIC_API_KEY` and a strong `HERMES_ADMIN_TOKEN` into the server's
   `.env` (never sent through this session).
10. [ ] After Phase 1 acceptance criteria (PRD §9, Phase-1-relevant items) pass in production,
    revisit this ADR to scope Phase 2 (Prime Control Gates UI) and Phase 3 (Command Center).
