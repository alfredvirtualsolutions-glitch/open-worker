# Deploy runbook — VBS Agent Operating System (Phase 1) on hiclaw-hermes-worker

Target: UpCloud VPS `hiclaw-hermes-worker`, Ubuntu 24.04, `95.111.213.103`.
Domain: `ops.warmail.online` (adjust if you'd rather use a different subdomain —
`warmail.online` itself is assumed to be your existing Vercel site, so this
uses a subdomain instead of touching your root domain's records).

You keep your SSH private key on your own machine the whole time — nothing in
this runbook asks you to share it with anyone.

## 0. Prerequisites

- You can already run `ssh root@95.111.213.103` from your machine (this is
  the same server we looked at in UpCloud Hub earlier).
- You have (or will generate) an Anthropic API key — https://console.anthropic.com/settings/keys
- Your domain's DNS is managed in Vercel (per your note "warmail.online on vercel").

## 1. Point the subdomain at the server (Vercel DNS)

In the Vercel dashboard: **your team → Domains → warmail.online → DNS Records**
(or **Project → Settings → Domains** if it's attached to a project) → **Add Record**:

| Type | Name | Value              | TTL  |
|------|------|---------------------|------|
| A    | ops  | 95.111.213.103       | Auto |

This creates `ops.warmail.online → 95.111.213.103`. DNS usually propagates
within a few minutes; you can check with `dig ops.warmail.online +short`.

If you'd rather use a different subdomain (e.g. `agents.warmail.online`), use
that name instead here and set `DOMAIN=` to match in step 3.

## 2. Get the project onto the server

From your own machine, in the folder where you unzipped the delivered
`vbs-agent-os.tar.gz`:

```bash
scp vbs-agent-os.tar.gz root@95.111.213.103:/root/
ssh root@95.111.213.103
mkdir -p /opt/vbs-agent-os
tar -xzf /root/vbs-agent-os.tar.gz -C /opt/vbs-agent-os --strip-components=1
cd /opt/vbs-agent-os
```

## 3. Configure secrets

```bash
cp .env.example .env
nano .env   # or vim
```

Fill in:
- `DOMAIN=ops.warmail.online` (or whatever subdomain you used in step 1)
- `DATABASE_URL=` — your managed Postgres connection string (including
  `?sslmode=require`). Paste it directly into `.env` on the server via
  `nano` — don't paste it anywhere else (chat, tickets, etc.); if it's ever
  been pasted somewhere outside this file, rotate that password from your
  database provider's console first.
- `ANTHROPIC_API_KEY=` — your real key, starts with `sk-ant-`
- `HERMES_ADMIN_TOKEN=` — generate with `openssl rand -hex 32`; this is the
  bearer token you'll use to call the API — save it somewhere safe (a
  password manager), it is not recoverable from the server afterward.

Nothing in this file should ever be pasted into a chat session, ticket, or
committed to git.

## 4. Run the deploy script

```bash
chmod +x deploy/deploy.sh
./deploy/deploy.sh
```

This installs Docker if missing, builds the app image, runs the schema
migration against your managed Postgres instance, starts the stack (`app` +
`caddy`), and installs a systemd unit so it survives reboots.

Caddy will automatically request a Let's Encrypt certificate for `DOMAIN` the
first time it receives traffic on port 443 — this requires the DNS record
from step 1 to have propagated already.

## 5. Verify

```bash
curl -s https://ops.warmail.online/healthz
# {"ok":true,"service":"vbs-agent-os","version":"1.0.0-phase1"}
```

Create your first client + task (replace TOKEN with your HERMES_ADMIN_TOKEN):

```bash
curl -s -X POST https://ops.warmail.online/tasks \
  -H "Authorization: Bearer TOKEN" -H "Content-Type: application/json" \
  -d '{
    "client_id": "internal-test",
    "requested_by": "owner",
    "task_type": "research_question",
    "assigned_agent": "gemma",
    "input": {"question": "Summarize the key risks in this text.", "text": "..."}
  }'
```

Then watch it move through the pipeline:

```bash
curl -s -H "Authorization: Bearer TOKEN" https://ops.warmail.online/reports/executive
```

> Note: `client_id` must exist in `client_configs` first (foreign key). For a
> quick manual test, insert one directly against the managed database
> (requires the `psql` client — `apt install -y postgresql-client` if it's
> not already on the box):
> `psql "$DATABASE_URL" -c "INSERT INTO client_configs (client_id, display_name) VALUES ('internal-test','Internal Test') ON CONFLICT DO NOTHING;"`

## 6. Operating it day to day

- Logs: `docker compose logs -f app`
- Restart: `systemctl restart vbs-agent-os` (or `docker compose restart`)
- Pause everything: `curl -X POST .../control/pause-all -d '{"paused":true}'`
- Update code: re-run `scp` + `tar` from step 2 with a new build, then
  `docker compose build && docker compose up -d`

## What this does NOT do yet (by design)

Per the PRD's release gate, Phase 5 (autonomous external actions — e.g. Nova
actually sending emails, DeepSeek writing to external systems) is not wired
up. Approved tasks close cleanly with a note that controlled actions aren't
enabled. Enable that only after the Phase 1 acceptance checklist (PRD §9)
has been exercised in production and you're ready to scope Phase 2/3
(Prime control-gate UI + the 5-agent command center dashboard).
