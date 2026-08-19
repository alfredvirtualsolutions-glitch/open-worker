# ADR-002: Prime Control Gate UI — Phase 2

**Status:** Accepted (Phase 2 scope)
**Date:** 2026-08-19
**Deciders:** Alfred (owner)

## Context

PRD §8 Phase 2 scope: "QA states, rework routing, human-review queue, confidence rules
and decision audit trail." ADR-001's own action item said to scope this only after
Phase 1's acceptance criteria pass in production; the owner chose to build it now,
against local dev, ahead of that deployment.

Today the owner's only way to see a `HUMAN_REVIEW` task or resolve it is `curl`.
Everything the UI needs already exists as API surface from Phase 1 — this ADR is
about how to expose it, not what to build behind it.

## Decision

- **Framework:** a small Vite + React + TypeScript SPA, no router library. The whole
  app is one page with client-side state (queue view vs. task-detail view) — there's
  nothing here that benefits from URL-addressable routes, and pulling in a router is
  one more dependency for zero functional gain at this size.
- **Scope of the UI itself** (deliberately narrow, matching the PRD's Phase 2 wording):
  - **Human-review queue** — tasks with `status = HUMAN_REVIEW`, the actionable list.
  - **Resolve action** — `POST /tasks/:taskId/resolve` (APPROVED/REWORK/REJECTED/CLOSED
    + note), the only write this UI performs.
  - **Task detail** — full task contract + its `task_events` audit trail, evidence,
    confidence, Prime's reason.
  - **Confidence / QA-state visibility** — a recent-activity list across all statuses,
    and Prime's aggregate decision counts + average confidence (`GET /reports/prime`).
  - **Not included:** kill switches (`PAUSE_*`, `CANCEL_TASK`). ADR-001 already assigned
    those to Phase 3's command center ("the control primitives ship now so Phase 3 is UI
    on top of working switches, not new logic") — adding a second, earlier UI surface for
    the same primitives would fork that decision instead of building on it.
- **Auth:** no new auth system. The SPA prompts once for `HERMES_ADMIN_TOKEN`, stores it
  in `localStorage`, and sends it as `Authorization: Bearer` on every API call — the same
  shared-secret model every other client of this API already uses. Validated on entry by
  calling a real authed endpoint (`GET /reports/prime`) rather than trusting the paste.
- **Hosting:** served as static files by the *same* Fastify app, at `/gate`, via
  `@fastify/static` — not a second container, not a separate Caddy site. This keeps
  ADR-001's "one process type" decision intact: Caddy still only proxies to one `app`
  service, Docker Compose still has the same two services (`app`, `caddy`). The
  Dockerfile gains one extra build stage (`web-build`) that builds the SPA and copies its
  output into the runtime image.

## Options Considered

### Option A: SPA served by the existing Fastify app (chosen)
No new service, no new deploy step beyond the existing `deploy.sh` (the Dockerfile does
the extra build stage). Costs one new dependency (`@fastify/static`) and one new
top-level directory (`web/`) with its own tiny `package.json`.

### Option B: Separate static site served directly by Caddy
Marginally simpler build (no Fastify static plugin), but reopens the "one process type"
question ADR-001 settled — now there's a build artifact Caddy serves that the `app`
container has no involvement in, and CORS/auth has to be reasoned about across two
origins instead of one. Rejected: no real benefit at this scale, real added surface.

### Option C: Full framework (Next.js) instead of a plain Vite SPA
Rejected: this UI has no server-rendering need, no auth system of its own to build, and
no SEO/routing requirements — a framework built for those problems is pure overhead here.

## Consequences

- **Easier:** Phase 3's command center can be built as more pages/panels in the same
  `web/` app rather than a new project, once it's time.
- **Harder:** if the owner ever wants per-user auth (not just "whoever has the admin
  token"), the localStorage-token model needs replacing — acceptable now for a
  single-owner tool, called out here so it isn't a silent assumption later.
- **Revisit:** before Phase 3, decide whether kill-switch controls join this same app or
  get their own view within it.

## Addendum: Phase 3 (2026-08-19)

Resolved the open question above: Phase 3's command center is a second tab in the same
`web/` app (`CommandCenter.tsx`), not a new project — confirming the "Easier" consequence
predicted it correctly. Genuinely required no backend changes; every endpoint it calls
(`GET /reports/{hermes,gemma,deepseek,prime,nova,executive}`, `GET /control/flags`,
`POST /control/pause-all`) already existed from Phase 1.

Scope decision on kill switches specifically: only `PAUSE_ALL` got a control (a single
toggle — the one switch an owner needs in an emergency, not a form). `PAUSE_CLIENT` and
`PAUSE_WORKFLOW` need a `client_id`/`run_id` the dashboard doesn't otherwise surface
prominently, so building input forms for them now would be speculative; they stay
API-only until there's an actual workflow that makes their targets visible in the UI.
`CANCEL_TASK` went to `TaskDetail` instead of the command center — it acts on one task,
so it belongs where that task is already open, not on a global dashboard.
