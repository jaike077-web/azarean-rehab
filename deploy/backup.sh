#!/bin/bash
# =====================================================
# Azarean Rehab — Daily Backup (БД + фото пациентов + off-site)
# -----------------------------------------------------
# Запускается из cron (см. setup.sh) и перед миграциями в deploy.yml.
# Делает: (1) pg_dump БД, (2) tar.gz каталога data/uploads (фото замеров/
# дневника/аватары — биометрика), (3) off-site выгрузку обоих на Timeweb S3
# (RU, 152-ФЗ — спецкатегория ПДн хранится в РФ; НЕ на зарубежный сервер).
# Локальная ротация — KEEP_DAYS. Лог: /var/log/azarean-rehab-backup.log
# =====================================================

set -euo pipefail

APP_DIR="/opt/azarean-rehab"
BACKUP_DIR="$APP_DIR/backups"
UPLOADS_DIR="$APP_DIR/data/uploads"
KEEP_DAYS=14

mkdir -p "$BACKUP_DIR"

# Читаем DB_* и OFFSITE_* из .env
set -a
source <(grep -E '^DB_' "$APP_DIR/backend/.env")
source <(grep -E '^OFFSITE_' "$APP_DIR/backend/.env" 2>/dev/null || true)
set +a

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
DB_FILE="$BACKUP_DIR/azarean_rehab-${TIMESTAMP}.sql.gz"
UPLOADS_FILE="$BACKUP_DIR/azarean_uploads-${TIMESTAMP}.tar.gz"

# ---- 1. Дамп БД ----
export PGPASSWORD="$DB_PASSWORD"
pg_dump -h localhost -p "${DB_PORT:-5432}" -U "$DB_USER" "$DB_NAME" \
  --no-owner --no-privileges \
  | gzip -9 > "$DB_FILE"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] DB backup OK: $DB_FILE ($(du -h "$DB_FILE" | cut -f1))"

# ---- 2. Фото пациентов (data/uploads) ----
# Биометрика (ROM-фото), дневниковые фото, аватары. В БД лежит только путь —
# сам JPEG на диске. Без этого tar потеря диска = безвозвратная потеря мед-фото.
if [ -d "$UPLOADS_DIR" ]; then
  tar -czf "$UPLOADS_FILE" -C "$APP_DIR/data" uploads
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Uploads backup OK: $UPLOADS_FILE ($(du -h "$UPLOADS_FILE" | cut -f1))"
else
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] WARN: $UPLOADS_DIR не найден — пропускаю бэкап фото"
  UPLOADS_FILE=""
fi

# ---- 3. Off-site на Timeweb S3 (RU) ----
# Best-effort: сбой выгрузки НЕ ломает локальный бэкап. Активируется при заданном
# OFFSITE_RCLONE_REMOTE в .env (напр. "timeweb:azarean-backups"); rclone.conf с
# ключами Timeweb S3 — на сервере (секреты вне репо). См. deploy/README.md.
set +e
if [ -n "${OFFSITE_RCLONE_REMOTE:-}" ]; then
  if command -v rclone >/dev/null 2>&1; then
    rclone copy "$DB_FILE" "$OFFSITE_RCLONE_REMOTE/" 2>&1
    OK_DB=$?
    OK_UP=0
    if [ -n "$UPLOADS_FILE" ]; then
      rclone copy "$UPLOADS_FILE" "$OFFSITE_RCLONE_REMOTE/" 2>&1
      OK_UP=$?
    fi
    if [ "$OK_DB" -eq 0 ] && [ "$OK_UP" -eq 0 ]; then
      echo "[$(date '+%Y-%m-%d %H:%M:%S')] Off-site OK → $OFFSITE_RCLONE_REMOTE"
      # off-site ротация (если задан OFFSITE_KEEP_DAYS)
      if [ -n "${OFFSITE_KEEP_DAYS:-}" ]; then
        rclone delete --min-age "${OFFSITE_KEEP_DAYS}d" "$OFFSITE_RCLONE_REMOTE/" 2>&1 || true
      fi
    else
      echo "[$(date '+%Y-%m-%d %H:%M:%S')] 🚨 Off-site FAILED (db=$OK_DB uploads=$OK_UP) — бэкап только локально!"
    fi
  else
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] 🚨 OFFSITE_RCLONE_REMOTE задан, но rclone не установлен — off-site НЕ работает!"
  fi
else
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ⚠️  Off-site НЕ настроен (OFFSITE_RCLONE_REMOTE пуст) — бэкап только на этом VDS. Потеря диска = потеря всего."
fi
set -e

# ---- 4. Локальная ротация ----
find "$BACKUP_DIR" -name 'azarean_rehab-*.sql.gz'   -mtime +$KEEP_DAYS -delete
find "$BACKUP_DIR" -name 'azarean_uploads-*.tar.gz' -mtime +$KEEP_DAYS -delete
DB_REMAINING=$(ls -1 "$BACKUP_DIR"/azarean_rehab-*.sql.gz 2>/dev/null | wc -l)
UP_REMAINING=$(ls -1 "$BACKUP_DIR"/azarean_uploads-*.tar.gz 2>/dev/null | wc -l)
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Хранится локально: БД=$DB_REMAINING, uploads=$UP_REMAINING"
