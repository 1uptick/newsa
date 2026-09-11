#!/bin/bash
# Restart the staging process on this VPS. Does not build.
set -euo pipefail
APP=/opt/kongstocks/app
if [[ ! -d "$APP/.next" ]]; then
  echo "No prebuilt $APP/.next — build locally and push first." >&2
  exit 1
fi
if pm2 describe kongstocks-staging >/dev/null 2>&1; then
  pm2 restart kongstocks-staging --update-env
else
  pm2 start "$APP/ecosystem.config.cjs" --only kongstocks-staging
  pm2 save
fi
mkdir -p /opt/kongstocks/releases
echo "$APP $(date -u +%Y-%m-%dT%H:%M:%SZ) prebuilt" > /opt/kongstocks/releases/staging.sha
echo "Staging restarted. http://127.0.0.1:3010"
