-- VBS Agent Operating System — Phase 1 schema
-- Postgres 16. This IS the task contract (PRD §4) plus the audit trail,
-- control flags (kill switches, PRD §7) and per-client configuration (FR-11).

CREATE TABLE IF NOT EXISTS client_configs (
    client_id       TEXT PRIMARY KEY,
    display_name    TEXT NOT NULL,
    config          JSONB NOT NULL DEFAULT '{}'::jsonb, -- targeting, sources, channels, thresholds
    active          BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per task, mirroring the shared task contract 1:1.
CREATE TABLE IF NOT EXISTS tasks (
    task_id                     UUID PRIMARY KEY,
    run_id                      UUID NOT NULL,
    parent_task_id              UUID NULL REFERENCES tasks(task_id),
    client_id                   TEXT NOT NULL REFERENCES client_configs(client_id),
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    requested_by                TEXT NOT NULL,
    assigned_agent              TEXT NOT NULL CHECK (assigned_agent IN ('hermes','gemma','deepseek','prime','nova')),
    task_type                   TEXT NOT NULL,
    priority                    TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
    input                       JSONB NOT NULL DEFAULT '{}'::jsonb,
    expected_output             JSONB NOT NULL DEFAULT '{}'::jsonb,
    status                      TEXT NOT NULL CHECK (status IN (
                                    'QUEUED','ASSIGNED','RUNNING','COMPLETED','QA_PENDING',
                                    'APPROVED','REWORK','REJECTED','HUMAN_REVIEW','ACTIONED','CLOSED',
                                    'FAILED_RETRYABLE','FAILED_FINAL','BLOCKED'
                                 )),
    confidence                  DOUBLE PRECISION NULL CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
    evidence                    JSONB NOT NULL DEFAULT '[]'::jsonb,
    result                      JSONB NOT NULL DEFAULT '{}'::jsonb,
    issues                      JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- Only Prime may set this; enforced in application layer + prime_decisions audit table below.
    prime_decision               TEXT NULL CHECK (prime_decision IS NULL OR prime_decision IN ('APPROVED','REWORK','REJECTED','HUMAN_REVIEW')),
    next_action                 TEXT NULL,
    requires_human_attention    BOOLEAN NOT NULL DEFAULT FALSE,

    -- Retry / scheduling bookkeeping (not part of the wire contract, internal to Hermes)
    attempt_count                INTEGER NOT NULL DEFAULT 0,
    max_attempts                 INTEGER NOT NULL DEFAULT 5,
    run_at                       TIMESTAMPTZ NOT NULL DEFAULT now(), -- next eligible dispatch time (backoff)
    locked_by                    TEXT NULL,      -- worker instance id currently processing this task
    locked_at                    TIMESTAMPTZ NULL,
    idempotency_key              TEXT NULL       -- required before any (future) external action, PRD §7
);

CREATE INDEX IF NOT EXISTS idx_tasks_dispatch ON tasks (status, run_at) WHERE status IN ('QUEUED','FAILED_RETRYABLE');
CREATE INDEX IF NOT EXISTS idx_tasks_client ON tasks (client_id);
CREATE INDEX IF NOT EXISTS idx_tasks_run ON tasks (run_id);
CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks (parent_task_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_idempotency ON tasks (idempotency_key) WHERE idempotency_key IS NOT NULL;

-- Append-only audit log. Answers PRD §4's traceability requirement:
-- who created the task, who processed it, what evidence was used,
-- what Prime decided, what action followed, what result was produced.
CREATE TABLE IF NOT EXISTS task_events (
    event_id        BIGSERIAL PRIMARY KEY,
    task_id         UUID NOT NULL REFERENCES tasks(task_id),
    at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    actor            TEXT NOT NULL,     -- 'hermes' | 'gemma' | 'deepseek' | 'prime' | 'nova' | 'owner' | 'system'
    event_type      TEXT NOT NULL,     -- e.g. 'CREATED','ASSIGNED','STATE_CHANGE','PRIME_DECISION','ERROR','PAUSED','RESUMED'
    from_status     TEXT NULL,
    to_status       TEXT NULL,
    detail          JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_task_events_task ON task_events (task_id, at);

-- Prime-only decision audit, separate from generic events so it can't be
-- forged by another agent's adapter code path (defense in depth on top of
-- the CHECK constraint on tasks.prime_decision).
CREATE TABLE IF NOT EXISTS prime_decisions (
    id               BIGSERIAL PRIMARY KEY,
    task_id          UUID NOT NULL REFERENCES tasks(task_id),
    at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    decision         TEXT NOT NULL CHECK (decision IN ('APPROVED','REWORK','REJECTED','HUMAN_REVIEW')),
    reason           TEXT NOT NULL,
    evidence_checked JSONB NOT NULL DEFAULT '[]'::jsonb
);

-- Kill switches (PRD §7): PAUSE ALL, PAUSE CLIENT, PAUSE WORKFLOW.
-- CANCEL TASK is a status transition on `tasks`, not a flag here.
CREATE TABLE IF NOT EXISTS control_flags (
    scope           TEXT NOT NULL,   -- 'ALL' | 'CLIENT' | 'WORKFLOW'
    scope_key       TEXT NOT NULL,   -- 'ALL' for global, client_id for CLIENT, run_id for WORKFLOW
    paused          BOOLEAN NOT NULL DEFAULT FALSE,
    paused_by       TEXT NULL,
    paused_at       TIMESTAMPTZ NULL,
    reason          TEXT NULL,
    PRIMARY KEY (scope, scope_key)
);

INSERT INTO control_flags (scope, scope_key, paused)
VALUES ('ALL', 'ALL', FALSE)
ON CONFLICT (scope, scope_key) DO NOTHING;
