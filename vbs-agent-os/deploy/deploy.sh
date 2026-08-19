#!/usr/bin/env bash
# Run this ON hiclaw-hermes-worker (as root), from /opt/vbs-agent-os, after
# uploading the project and filling in .env. See deploy/RUNBOOK.md for the
# full step-by-step, including how to get the project onto the server.
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "ERROR: .env not found. Copy .env.example to .env and fill in real values first." >&2
  exit 1
fi
set -a; source .env; set +a
if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: DATABASE_URL is not set in .env (managed Postgres connection string)." >&2
  exit 1
fi

echo "==> Checking for Docker..."
if ! command -v docker &>/dev/null; then
  echo "Docker not found — installing via get.docker.com ..."
  curl -fsSL https://get.docker.com | sh
fi

echo "==> Building the app image..."
docker compose build

echo "==> Running database migration against the managed Postgres instance..."
docker compose run --rm app node dist/db/migrate.js

echo "==> Starting app + caddy..."
docker compose up -d

echo "==> Installing systemd unit so the stack survives reboots..."
cp deploy/vbs-agent-os.service /etc/systemd/system/vbs-agent-os.service
systemctl daemon-reload
systemctl enable vbs-agent-os.service

echo "==> Done. Check status with: docker compose ps"
echo "==> Health check (once DNS + TLS are live): curl -s https://${DOMAIN:-<your-domain>}/healthz"
