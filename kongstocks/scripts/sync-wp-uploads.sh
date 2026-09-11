#!/bin/bash
# Resume-able copy of live WordPress uploads onto this VPS.
# Re-run before DNS cutover so new n8n/WP files are included.
set -euo pipefail

DEST="${DEST:-/opt/kongstocks/wp-content/uploads}"
SRC_HOST="${SRC_HOST:-147.93.83.46}"
SRC_PORT="${SRC_PORT:-65002}"
SRC_USER="${SRC_USER:-u480736744}"
SRC_PATH="${SRC_PATH:-domains/kongstocks.com/public_html/wp-content/uploads/}"
KEY="${KEY:-/root/.ssh/kongstocks_ed25519}"

mkdir -p "$DEST"
chmod 755 /opt/kongstocks/wp-content "$DEST" || true

echo "Syncing ${SRC_USER}@${SRC_HOST}:${SRC_PATH} -> ${DEST}"
rsync -az --info=progress2 --partial \
  --chmod=Du=rwx,Dgo=rx,Fu=rw,Fgo=r \
  -e "ssh -p ${SRC_PORT} -i ${KEY} -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new -o ServerAliveInterval=30" \
  "${SRC_USER}@${SRC_HOST}:${SRC_PATH}" \
  "${DEST}/"

# nginx www-data must be able to read every year/month directory rsync creates.
chmod -R a+rX "$DEST" || true

echo "Done. $(du -sh "$DEST" | awk '{print $1}') in $DEST"
