#!/bin/bash
# =====================================================
# check-schema-drift.sh — обнаружение изменений схемы вне миграций
# =====================================================
# Daily cron. Сравнивает текущий pg_dump --schema-only с baseline'ом
# (сохранённым после последнего migrate.sh). Если drift:
#   - НЕ новый файл миграции с момента baseline'а → алерт в ops-bot
#     (значит кто-то менял схему руками — Bug #36 анти-регресс)
#   - есть новый файл миграции → авто-обновляем baseline (legitimate change)
#
# Baseline: /var/lib/azarean-rehab/schema-baseline.sql
# Лог: /var/log/azarean-rehab-schema-drift.log
#
# Cron каждый день в 04:00 МСК:
#   0 4 * * * root /opt/azarean-rehab/deploy/check-schema-drift.sh
# =====================================================

set -u

APP_DIR="${APP_DIR:-/opt/azarean-rehab}"
BACKEND_DIR="$APP_DIR/backend"
ENV_FILE="${ENV_FILE:-$BACKEND_DIR/.env}"
STATE_DIR="${STATE_DIR:-/var/lib/azarean-rehab}"
BASELINE="$STATE_DIR/schema-baseline.sql"
CURRENT="$STATE_DIR/schema-current.sql"
LOG_FILE="${LOG_FILE:-/var/log/azarean-rehab-schema-drift.log}"
MIGRATIONS_DIR="$BACKEND_DIR/database/migrations"

mkdir -p "$STATE_DIR"
TS=$(date '+%Y-%m-%d %H:%M:%S')

# --- Прочитать env vars ---
read_env_var() {
    grep -E "^${1}=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '\r'
}

DB_HOST=$(read_env_var DB_HOST)
DB_PORT=$(read_env_var DB_PORT)
DB_NAME=$(read_env_var DB_NAME)
DB_USER=$(read_env_var DB_USER)
DB_PASSWORD=$(read_env_var DB_PASSWORD)
OPS_TOKEN=$(read_env_var OPS_BOT_TOKEN)
OPS_CHAT_ID=$(read_env_var OPS_CHAT_ID)

if [ -z "${DB_NAME:-}" ] || [ -z "${DB_USER:-}" ]; then
    echo "[$TS] ERROR: DB env vars не настроены" >> "$LOG_FILE"
    exit 1
fi

export PGPASSWORD="$DB_PASSWORD"
PG_DUMP_BIN="${PG_DUMP_BIN:-pg_dump}"

# --- Снимаем текущий schema-only dump ---
# --schema-only: без данных
# --no-owner --no-privileges: без grant'ов и owner'ов (могут отличаться по env)
# --schema=public: только public schema (системные не нужны)
"$PG_DUMP_BIN" \
    -h "${DB_HOST:-localhost}" \
    -p "${DB_PORT:-5432}" \
    -U "$DB_USER" \
    --schema-only \
    --no-owner \
    --no-privileges \
    --schema=public \
    "$DB_NAME" > "$CURRENT" 2>>"$LOG_FILE"

if [ ! -s "$CURRENT" ]; then
    echo "[$TS] ERROR: pg_dump вернул пустой файл" >> "$LOG_FILE"
    exit 1
fi

# --- Bootstrap: если baseline'а ещё нет, создать и выйти ---
if [ ! -f "$BASELINE" ]; then
    cp "$CURRENT" "$BASELINE"
    # Сразу фиксируем текущий счётчик миграций — чтобы при следующем
    # запуске «новых миграций нет» вычислялось корректно.
    LAST_MIGR_COUNT_FILE="$STATE_DIR/last-migr-count"
    ls "$MIGRATIONS_DIR"/*.sql 2>/dev/null | wc -l > "$LAST_MIGR_COUNT_FILE"
    echo "[$TS] BOOTSTRAP: baseline создан ($(wc -l < "$BASELINE") строк, $(cat "$LAST_MIGR_COUNT_FILE") миграций)" >> "$LOG_FILE"
    exit 0
fi

# --- Diff текущей схемы с baseline'ом ---
# Игнорируем строки времени из COMMENT'ов и pg_dump-метаданные
DIFF_OUTPUT=$(diff -u \
    <(grep -vE '^(--|SET|SELECT pg_catalog|REVOKE|GRANT)' "$BASELINE") \
    <(grep -vE '^(--|SET|SELECT pg_catalog|REVOKE|GRANT)' "$CURRENT") 2>&1)

if [ -z "$DIFF_OUTPUT" ]; then
    # Schema не изменилась
    exit 0
fi

# --- Schema изменилась. Это legitimate (новая миграция) или drift? ---
# Считаем количество миграций в каталоге
MIGR_COUNT=$(ls "$MIGRATIONS_DIR"/*.sql 2>/dev/null | wc -l)

# Сохраняем счётчик миграций при последнем baseline-снятии
LAST_MIGR_COUNT_FILE="$STATE_DIR/last-migr-count"
LAST_MIGR_COUNT=$(cat "$LAST_MIGR_COUNT_FILE" 2>/dev/null || echo "0")

if [ "$MIGR_COUNT" -gt "$LAST_MIGR_COUNT" ]; then
    # Появились новые миграции с момента baseline → legitimate change
    cp "$CURRENT" "$BASELINE"
    echo "$MIGR_COUNT" > "$LAST_MIGR_COUNT_FILE"
    echo "[$TS] LEGITIMATE: $((MIGR_COUNT - LAST_MIGR_COUNT)) новых миграций, baseline обновлён" >> "$LOG_FILE"
    exit 0
fi

# --- DRIFT detected — schema изменилась без новой миграции ---
echo "[$TS] DRIFT DETECTED" >> "$LOG_FILE"
echo "--- diff ---" >> "$LOG_FILE"
echo "$DIFF_OUTPUT" >> "$LOG_FILE"
echo "--- end diff ---" >> "$LOG_FILE"

# Берём первые 30 строк diff'а для алерта (Telegram limit 4000 chars)
DIFF_PREVIEW=$(echo "$DIFF_OUTPUT" | head -30)

if [ -n "${OPS_TOKEN:-}" ] && [ -n "${OPS_CHAT_ID:-}" ]; then
    TEXT="🚨 [PROD] Schema drift detected

Тип: Infra · СХЕМА БД
Что: схема azarean_rehab изменилась БЕЗ новой миграции
Когда: $TS

Что делать:
  - Проверить что не делали ALTER TABLE / CREATE / DROP вручную через psql
  - Если изменения легитимные — оформить миграцией (см. CLAUDE.md
    «СХЕМА БД МЕНЯЕТСЯ ТОЛЬКО МИГРАЦИЕЙ») и закоммитить
  - Если нет — это потенциальный security incident, проверить access logs
  - Полный diff: /var/log/azarean-rehab-schema-drift.log

Diff (первые 30 строк):
$DIFF_PREVIEW"

    curl -s --max-time 10 \
        --data-urlencode "chat_id=$OPS_CHAT_ID" \
        --data-urlencode "text=$TEXT" \
        "https://api.telegram.org/bot$OPS_TOKEN/sendMessage" > /dev/null 2>&1
fi

# Не обновляем baseline при drift — пусть продолжает пинговать пока юзер не поправит.
exit 1
