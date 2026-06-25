#!/bin/bash
# =====================================================
# Azarean Rehab — Restore / учебное восстановление (DR drill)
# -----------------------------------------------------
# Восстанавливает пару (БД-дамп + uploads-tar) ОДНОГО таймстампа в ОТДЕЛЬНУЮ
# тестовую БД и каталог — НЕ трогает прод (защита от случайного затирания).
# Цель — регулярно проверять, что бэкап реально восстановим (счётчики таблиц
# и наличие фото совпадают с источником).
#
# Использование:
#   bash restore.sh                       # последний бэкап → тест-БД + /tmp/...
#   bash restore.sh 20260625-031500       # конкретный таймстамп
#   bash restore.sh latest azarean_rehab_restore_test /tmp/azarean_restore
#
# Прод восстанавливать ВРУЧНУЮ и осознанно (см. deploy/README.md), не этим
# скриптом — он намеренно льёт в безопасную тест-цель.
# =====================================================

set -euo pipefail

APP_DIR="/opt/azarean-rehab"
BACKUP_DIR="$APP_DIR/backups"
WHICH="${1:-latest}"
TARGET_DB="${2:-azarean_rehab_restore_test}"
TARGET_UPLOADS="${3:-/tmp/azarean_restore/uploads}"

set -a
source <(grep -E '^DB_' "$APP_DIR/backend/.env")
set +a
export PGPASSWORD="$DB_PASSWORD"

# ---- Выбор файлов ----
if [ "$WHICH" = "latest" ]; then
  DB_FILE=$(ls -1t "$BACKUP_DIR"/azarean_rehab-*.sql.gz 2>/dev/null | head -1 || true)
  UP_FILE=$(ls -1t "$BACKUP_DIR"/azarean_uploads-*.tar.gz 2>/dev/null | head -1 || true)
else
  DB_FILE="$BACKUP_DIR/azarean_rehab-${WHICH}.sql.gz"
  UP_FILE="$BACKUP_DIR/azarean_uploads-${WHICH}.tar.gz"
fi

[ -n "${DB_FILE:-}" ] && [ -f "$DB_FILE" ] || { echo "❌ Дамп БД не найден: $DB_FILE"; exit 1; }
echo "Restore из: $DB_FILE"
[ -f "${UP_FILE:-}" ] && echo "Uploads:    $UP_FILE" || echo "⚠️  Uploads-tar не найден (восстановлю только БД)"

# ---- Защита от прода ----
if [ "$TARGET_DB" = "${DB_NAME}" ]; then
  echo "❌ Отказ: TARGET_DB совпадает с прод-БД ($DB_NAME). Восстанавливай прод вручную."
  exit 1
fi

# ---- Восстановление БД в свежую тест-БД ----
echo "→ Пересоздаю $TARGET_DB ..."
psql -h localhost -p "${DB_PORT:-5432}" -U "$DB_USER" -d postgres -v ON_ERROR_STOP=1 \
  -c "DROP DATABASE IF EXISTS \"$TARGET_DB\";" -c "CREATE DATABASE \"$TARGET_DB\";"
gunzip -c "$DB_FILE" | psql -h localhost -p "${DB_PORT:-5432}" -U "$DB_USER" -d "$TARGET_DB" -q

# ---- Восстановление uploads ----
if [ -f "${UP_FILE:-}" ]; then
  rm -rf "$TARGET_UPLOADS"
  mkdir -p "$(dirname "$TARGET_UPLOADS")"
  tar -xzf "$UP_FILE" -C "$(dirname "$TARGET_UPLOADS")"
fi

# ---- Верификация (счётчики) ----
echo "──────── ВЕРИФИКАЦИЯ ────────"
TABLES=$(psql -h localhost -U "$DB_USER" -d "$TARGET_DB" -tA -c \
  "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';")
echo "Таблиц в восстановленной БД: $TABLES"
for t in patients rehab_programs rom_measurements pain_entries diary_entries; do
  CNT=$(psql -h localhost -U "$DB_USER" -d "$TARGET_DB" -tA -c "SELECT count(*) FROM $t;" 2>/dev/null || echo "н/д")
  echo "  $t: $CNT строк"
done
if [ -d "$TARGET_UPLOADS" ]; then
  FILES=$(find "$TARGET_UPLOADS" -type f | wc -l)
  echo "Файлов в восстановленных uploads: $FILES"
fi
echo "✅ Drill завершён. Тест-БД: $TARGET_DB (можно удалить: DROP DATABASE \"$TARGET_DB\";)"
