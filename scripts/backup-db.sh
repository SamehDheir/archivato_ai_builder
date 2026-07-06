#!/usr/bin/env bash
#
# Postgres backup via pg_dump → gzipped, timestamped file, with retention pruning.
# Intended for the docker-compose deploy. For managed Postgres, prefer the
# provider's automated backups + point-in-time recovery over this script.
#
# Usage:
#   ./scripts/backup-db.sh                 # dumps the compose `db` service
#   DATABASE_URL=postgres://... ./scripts/backup-db.sh   # dumps a specific URL
#
# Schedule it from cron, e.g. hourly:
#   0 * * * * cd /srv/archivato && ./scripts/backup-db.sh >> backups/backup.log 2>&1
#
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
STAMP="$(date +%Y%m%d-%H%M%S)"

mkdir -p "$BACKUP_DIR"
OUT="$BACKUP_DIR/archivato-$STAMP.sql.gz"

if [ -n "${DATABASE_URL:-}" ]; then
  # Dump directly from a connection string (managed DB or remote).
  pg_dump "$DATABASE_URL" | gzip >"$OUT"
else
  # Dump from the docker-compose `db` service (no host pg_dump required).
  docker compose -f "$COMPOSE_FILE" exec -T db \
    pg_dump -U "${POSTGRES_USER:-postgres}" "${POSTGRES_DB:-archivato}" | gzip >"$OUT"
fi

echo "Wrote backup: $OUT ($(du -h "$OUT" | cut -f1))"

# Prune backups older than the retention window.
find "$BACKUP_DIR" -name 'archivato-*.sql.gz' -mtime +"$RETENTION_DAYS" -delete
echo "Pruned backups older than ${RETENTION_DAYS} days"

# Restore (destructive — overwrites the target database):
#   gunzip -c backups/archivato-YYYYMMDD-HHMMSS.sql.gz \
#     | docker compose -f docker-compose.prod.yml exec -T db \
#         psql -U postgres -d archivato
