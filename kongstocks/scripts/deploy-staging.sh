#!/bin/bash
# Build KongStocks staging locally, then push the prebuilt app to the VPS.
# Does not run `next build` on the server.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOST="${KS_SSH_HOST:-kongstocks-vps}"
REMOTE_APP="${KS_REMOTE_APP:-/opt/kongstocks/app}"
REMOTE_ENV="${KS_REMOTE_ENV:-/opt/kongstocks/deploy/.env.staging}"
ENV_FILE="$ROOT/.env.staging.local"
TUNNEL_PORT="${KS_DB_TUNNEL_PORT:-15433}"
TUNNEL_PID=""

on_vps() {
  [[ -f /opt/kongstocks/deploy/.env.staging && -d /opt/kongstocks/app ]]
}

cleanup() {
  if [[ -n "$TUNNEL_PID" ]] && kill -0 "$TUNNEL_PID" 2>/dev/null; then
    kill "$TUNNEL_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

if on_vps; then
  echo "This script builds on a workstation. Restarting the existing staging build."
  exec "$ROOT/scripts/restart-staging.sh"
fi

cd "$ROOT"

NODE20_BIN="${KS_NODE20_BIN:-$HOME/.nvm/versions/node/v20.20.2/bin}"
if [[ -x "$NODE20_BIN/node" ]]; then
  export PATH="$NODE20_BIN:$PATH"
  hash -r
fi
echo "==> Node $(node -v) ($(command -v node))"

echo "==> Fetch staging env from $HOST"
ssh "$HOST" "cat $REMOTE_ENV" > "$ENV_FILE"
chmod 600 "$ENV_FILE"

if [[ ! -d node_modules ]]; then
  echo "==> Install dependencies"
  if [[ -f package-lock.json ]]; then npm ci; else npm install; fi
fi

DB_URL="$(grep -E '^DATABASE_URL=' "$ENV_FILE" | head -1 | cut -d= -f2-)"
if [[ "$DB_URL" == *@127.0.0.1:5433* || "$DB_URL" == *@localhost:5433* ]]; then
  echo "==> Tunnel staging Postgres 127.0.0.1:${TUNNEL_PORT} → ${HOST}:5433"
  ssh -N -o ExitOnForwardFailure=yes -L "${TUNNEL_PORT}:127.0.0.1:5433" "$HOST" &
  TUNNEL_PID=$!
  for _ in 1 2 3 4 5 6 7 8; do
    if (echo >/dev/tcp/127.0.0.1/"$TUNNEL_PORT") >/dev/null 2>&1; then
      break
    fi
    sleep 0.25
  done
  BUILD_DATABASE_URL="${DB_URL/@127.0.0.1:5433/@127.0.0.1:${TUNNEL_PORT}}"
  BUILD_DATABASE_URL="${BUILD_DATABASE_URL/@localhost:5433/@127.0.0.1:${TUNNEL_PORT}}"
else
  BUILD_DATABASE_URL="$DB_URL"
fi

echo "==> Build locally"
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a
export DATABASE_URL="$BUILD_DATABASE_URL"
export PAYLOAD_PUSH=false
npm run build

echo "==> Push prebuilt app to $HOST:$REMOTE_APP"
if command -v rsync >/dev/null 2>&1; then
  rsync -az --delete \
    --exclude node_modules \
    --exclude .env \
    --exclude .env.local \
    --exclude .env.staging \
    --exclude .env.staging.local \
    --exclude media \
    --exclude .payload \
    --exclude '*.log' \
    --exclude tsconfig.tsbuildinfo \
    "$ROOT/" "$HOST:$REMOTE_APP/"
else
  tar --exclude=node_modules --exclude=.env --exclude=.env.local \
    --exclude=.env.staging --exclude=.env.staging.local \
    --exclude=media --exclude=.payload --exclude='*.log' \
    -C "$ROOT" -czf - . |
    ssh "$HOST" "mkdir -p '$REMOTE_APP' && tar -C '$REMOTE_APP' -xzf -"
fi

echo "==> Restart staging (no remote build)"
ssh "$HOST" "bash $REMOTE_APP/scripts/restart-staging.sh"
echo "Staging updated from local build."
