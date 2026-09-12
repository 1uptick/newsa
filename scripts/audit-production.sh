#!/usr/bin/env bash
# Run on the VPS to discover Path A (SQLite) vs Path B (Supabase).
# Usage: cd /path/to/newsa && ./scripts/audit-production.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PORT="${PORT:-5001}"
BASE="http://127.0.0.1:${PORT}"

echo "=== Newsa production audit ==="
echo "Directory: $ROOT"
echo ""

echo "--- Git version ---"
git log -1 --oneline 2>/dev/null || echo "(not a git repo)"
echo ""

echo "--- Database type ---"
if [[ -f newsa.db ]]; then
  echo "FOUND: newsa.db ($(du -h newsa.db | cut -f1))"
  HAS_SQLITE=1
else
  echo "NOT FOUND: newsa.db"
  HAS_SQLITE=0
fi

if [[ -f .env ]] && grep -q "^SUPABASE_URL=.\+" .env 2>/dev/null; then
  echo "FOUND: SUPABASE_URL in .env"
  HAS_SUPABASE=1
else
  echo "NOT FOUND: SUPABASE_URL in .env (empty or missing)"
  HAS_SUPABASE=0
fi

echo ""
if [[ "$HAS_SQLITE" -eq 1 && "$HAS_SUPABASE" -eq 0 ]]; then
  echo "RESULT: Path A — production uses SQLite (newsa.db)"
  echo "        Latest code requires Supabase. Run migrate-sqlite-to-supabase before deploying."
elif [[ "$HAS_SUPABASE" -eq 1 ]]; then
  echo "RESULT: Path B — production uses Supabase"
  if [[ "$HAS_SQLITE" -eq 1 ]]; then
    echo "        Note: newsa.db still present — likely leftover from old setup. Back it up, then remove after migration verified."
  fi
else
  echo "RESULT: Unknown — no newsa.db and no SUPABASE_URL. Check .env and running process."
fi

echo ""
echo "--- Env keys present (values hidden) ---"
if [[ -f .env ]]; then
  grep -E "^(AIRTABLE_|VITE_FIREBASE_|FIREBASE_|SUPABASE_|SMTP_|APP_BASE)" .env \
    | sed 's/=.*$/=***/' || true
else
  echo "No .env file found"
fi

echo ""
echo "--- API checks (app must be running on port $PORT) ---"
if curl -sf "${BASE}/api/ping" >/dev/null 2>&1; then
  echo "ping: OK"
  echo "auth/status:"
  curl -s "${BASE}/api/auth/status" | head -c 500
  echo ""
  echo "airtable/check:"
  curl -s "${BASE}/api/airtable/check" | head -c 500
  echo ""
else
  echo "App not responding at ${BASE}/api/ping"
  echo "Start the app or adjust PORT, then re-run this script."
fi

echo ""
echo "=== Next steps ==="
echo "Path A: see STAGING.md → 'Path A (SQLite)' + scripts/migrate-sqlite-to-supabase.mjs"
echo "Path B: see STAGING.md → 'Path B (Supabase)' + npm run dev:staging locally"
