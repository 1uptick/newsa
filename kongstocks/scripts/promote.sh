#!/bin/bash
# 1-click go-live: run the current staging build as production (same code, prod DB/env).
set -euo pipefail
APP=/opt/kongstocks/app
STAGING_SHA_FILE=/opt/kongstocks/releases/staging.sha
PROD_SHA_FILE=/opt/kongstocks/releases/prod.sha
PREV_SHA_FILE=/opt/kongstocks/releases/prod.prev.sha

if [[ ! -f "$STAGING_SHA_FILE" ]]; then
  echo "No staging release to promote. Run scripts/deploy-staging.sh first."
  exit 1
fi

if [[ -f "$PROD_SHA_FILE" ]]; then
  cp "$PROD_SHA_FILE" "$PREV_SHA_FILE"
fi
cp "$STAGING_SHA_FILE" "$PROD_SHA_FILE"

cd "$APP"
if pm2 describe kongstocks-prod >/dev/null 2>&1; then
  pm2 restart kongstocks-prod --update-env
else
  pm2 start "$APP/ecosystem.config.cjs" --only kongstocks-prod
  pm2 save
fi

curl -fsS "http://127.0.0.1:3011/" >/dev/null
echo "Promoted staging → production on :3011"
echo "Rollback: scripts/rollback-prod.sh"
