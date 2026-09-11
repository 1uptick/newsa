#!/bin/bash
set -euo pipefail
BACKUP_DIR=/var/backups/kongstocks
RETENTION_DAYS=7
DATE=$(date +%Y%m%d-%H%M%S)
mkdir -p "$BACKUP_DIR"
set -a
source /opt/kongstocks/deploy/.env.postgres
set +a
docker compose -f /opt/kongstocks/deploy/docker-compose.postgres.yml --env-file /opt/kongstocks/deploy/.env.postgres exec -T postgres-staging \
  pg_dump -U kongstocks_staging kongstocks_staging | gzip > "$BACKUP_DIR/staging-$DATE.sql.gz"
docker compose -f /opt/kongstocks/deploy/docker-compose.postgres.yml --env-file /opt/kongstocks/deploy/.env.postgres exec -T postgres-prod \
  pg_dump -U kongstocks_prod kongstocks_prod | gzip > "$BACKUP_DIR/prod-$DATE.sql.gz"
find "$BACKUP_DIR" -name "*.sql.gz" -mtime +"$RETENTION_DAYS" -delete
echo "Backed up staging and prod at $DATE"
