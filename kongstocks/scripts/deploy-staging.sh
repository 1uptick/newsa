#!/bin/bash
# Build and (re)start the staging Next.js process on this VPS.
set -euo pipefail
APP=/opt/kongstocks/app
cd "$APP"
if [[ -f package-lock.json ]]; then npm ci; else npm install; fi
set -a
source /opt/kongstocks/deploy/.env.staging
set +a
export PAYLOAD_PUSH=true
npx payload migrate || true
npm run build
mkdir -p /opt/kongstocks/releases
if pm2 describe kongstocks-staging >/dev/null 2>&1; then
  pm2 restart kongstocks-staging --update-env
else
  pm2 start "$APP/ecosystem.config.cjs" --only kongstocks-staging
  pm2 save
fi
echo "$APP $(git -C "$APP" rev-parse --short HEAD 2>/dev/null || echo nogit)" > /opt/kongstocks/releases/staging.sha
echo "Staging deployed. http://127.0.0.1:${PORT:-3010}"
