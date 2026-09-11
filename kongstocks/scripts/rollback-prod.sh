#!/bin/bash
set -euo pipefail
PREV=/opt/kongstocks/releases/prod.prev.sha
if [[ ! -f "$PREV" ]]; then
  echo "No previous production release."
  exit 1
fi
echo "Previous release was: $(cat "$PREV")"
echo "Restart production against the last known good SHA (same tree; rebuild if needed)."
set -a
source /opt/kongstocks/deploy/.env.prod
set +a
cd /opt/kongstocks/app
pm2 restart kongstocks-prod --update-env
echo "Production process restarted."
