#!/bin/bash
# =====================================================
# Azarean Rehab — Daily DB Backup
# -----------------------------------------------------
# Запускается из cron (см. setup.sh), ротирует 14 копий.
# Лог: /var/log/azarean-rehab-backup.log
# =====================================================

set -euo pipefail

APP_DIR="/opt/azarean-rehab"
BACKUP_DIR="$APP_DIR/backups"
KEEP_DAYS=14

mkdir -p "$BACKUP_DIR"

# Читаем DB_* из .env
set -a
source <(grep -E '^DB_' "$APP_DIR/backend/.env")
set +a

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_FILE="$BACKUP_DIR/azarean_rehab-${TIMESTAMP}.sql.gz"

export PGPASSWORD="$DB_PASSWORD"
pg_dump -h localhost -p "${DB_PORT:-5432}" -U "$DB_USER" "$DB_NAME" \
  --no-owner --no-privileges \
  | gzip -9 > "$BACKUP_FILE"

SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Backup OK: $BACKUP_FILE ($SIZE)"

# Ротация — удалить старше KEEP_DAYS дней
find "$BACKUP_DIR" -name 'azarean_rehab-*.sql.gz' -mtime +$KEEP_DAYS -delete
REMAINING=$(ls -1 "$BACKUP_DIR"/azarean_rehab-*.sql.gz 2>/dev/null | wc -l)
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Хранится копий: $REMAINING"
