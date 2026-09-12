#!/usr/bin/env bash
# Deploy production on the VPS (portal.newsa.io).
# Usage on the server:
#   cd /path/to/newsa && ./scripts/deploy-production.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Pull latest code"
git pull origin master

echo "==> Install dependencies"
npm ci

echo "==> Build frontend"
npm run build

echo "==> Restart app (adjust for your process manager)"
if command -v pm2 >/dev/null 2>&1; then
  pm2 restart newsa --update-env || pm2 start npm --name newsa -- start
elif systemctl is-active --quiet newsa 2>/dev/null; then
  sudo systemctl restart newsa
else
  echo "No pm2 or systemd unit 'newsa' found. Start manually:"
  echo "  NODE_ENV=production PORT=5001 npm start"
fi

echo "==> Done. Production should be live at https://portal.newsa.io"
