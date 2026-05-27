#!/bin/bash
# =====================================================
# Azarean Rehab — Migration Runner с checksum tracking
# -----------------------------------------------------
# Применяет миграции по порядку к production БД (PG18).
#
# Использует таблицу _migrations(filename, applied_at, checksum)
# для отслеживания применённых миграций. Каждая миграция применяется
# только один раз; повторная попытка применить → skip.
#
# Защита от Bug #36 (schema drift): если уже применённая миграция
# была изменена (checksum mismatch) — exit 1 с алертом. Политика:
# миграции после apply immutable, исправления — только новой миграцией.
#
# Bootstrap: при первом прогоне (пустая _migrations) — все существующие
# миграции помечаются как legacy с NULL checksum. На втором прогоне
# их checksum фиксируется. Это позволяет миграционировать существующие
# окружения без повторного применения уже работающих миграций.
#
# Запускается:
#   - вручную после setup.sh
#   - из GitHub Actions перед рестартом PM2
#
# Требует:
#   - /opt/azarean-rehab/backend/.env с корректными DB_*
#   - Файлы миграций в /opt/azarean-rehab/backend/database/migrations/
# =====================================================

set -euo pipefail

# Можно переопределить через ENV для локального тестирования:
#   APP_DIR=/path/to/local/repo bash deploy/migrate.sh
APP_DIR="${APP_DIR:-/opt/azarean-rehab}"
BACKEND_DIR="$APP_DIR/backend"
MIGRATIONS_DIR="$BACKEND_DIR/database/migrations"
SCHEMA_FILE="$BACKEND_DIR/database/schema.sql"

# ─── Загружаем .env ───
if [ ! -f "$BACKEND_DIR/.env" ]; then
  echo "ERROR: $BACKEND_DIR/.env не найден"
  exit 1
fi

set -a
source <(grep -E '^DB_' "$BACKEND_DIR/.env")
set +a

echo "═══ Миграции → $DB_NAME ═══"
echo "  host: $DB_HOST:$DB_PORT  user: $DB_USER"

export PGPASSWORD="$DB_PASSWORD"
PSQL_BASE="psql -h ${DB_HOST:-localhost} -p ${DB_PORT:-5432} -U $DB_USER -d $DB_NAME -v ON_ERROR_STOP=1"
PSQL_QUIET="$PSQL_BASE -tAX"

# ─── Проверка connection ───
$PSQL_BASE -c "SELECT version();" > /dev/null
echo "✓ Connection OK"

# ─── Определяем состояние БД (для первой установки) ───
USERS_EXISTS=$($PSQL_QUIET -c "SELECT 1 FROM information_schema.tables WHERE table_name='users'" 2>/dev/null || echo "")

if [ -z "$USERS_EXISTS" ]; then
  echo "БД пустая — применяем schema.sql"
  $PSQL_BASE -f "$SCHEMA_FILE"
  echo "✓ schema.sql применён"
fi

# ─── Гарантируем существование _migrations ───
$PSQL_QUIET -c "CREATE TABLE IF NOT EXISTS _migrations (filename VARCHAR(255) PRIMARY KEY, applied_at TIMESTAMP NOT NULL DEFAULT NOW(), checksum VARCHAR(64))" > /dev/null

# ─── Bootstrap legacy миграций (только если _migrations пуста) ───
MIGR_COUNT=$($PSQL_QUIET -c "SELECT COUNT(*) FROM _migrations")
if [ "$MIGR_COUNT" = "0" ]; then
  echo ""
  echo "Bootstrap: помечаем все существующие миграции как legacy (checksum=NULL)"
  for migration in $(ls "$MIGRATIONS_DIR"/*.sql | sort); do
    name=$(basename "$migration")
    $PSQL_QUIET -c "INSERT INTO _migrations (filename, checksum) VALUES ('$name', NULL) ON CONFLICT (filename) DO NOTHING" > /dev/null
  done
  echo "✓ Bootstrap: $(ls "$MIGRATIONS_DIR"/*.sql | wc -l) миграций помечены как legacy"
fi

# ─── Применяем миграции в порядке имени ───
echo ""
echo "Проверяем миграции..."

APPLIED_COUNT=0
SKIPPED_COUNT=0

for migration in $(ls "$MIGRATIONS_DIR"/*.sql | sort); do
  name=$(basename "$migration")

  # Считаем checksum файла. strip-CR перед хешем — line-ending-agnostic:
  # на Linux/LF файл CR не содержит → no-op (тот же sha что раньше, prod-stable).
  # На Windows working tree с core.autocrlf=true файл может содержать CRLF →
  # после tr -d '\r' хеш совпадает с LF-вариантом, идентично prod-checksum.
  # Корень: тул не должен зависеть от переводов строк (см. .gitattributes
  # *.sql text eol=lf — это belt+suspenders, фиксят корень с двух сторон).
  if command -v sha256sum > /dev/null 2>&1; then
    file_checksum=$(tr -d '\r' < "$migration" | sha256sum | awk '{print $1}')
  else
    # macOS fallback
    file_checksum=$(tr -d '\r' < "$migration" | shasum -a 256 | awk '{print $1}')
  fi

  # Проверяем состояние в _migrations
  stored=$($PSQL_QUIET -c "SELECT COALESCE(checksum, '__legacy__') FROM _migrations WHERE filename = '$name'" 2>/dev/null || echo "")

  if [ -z "$stored" ]; then
    # Не применена — apply + INSERT
    echo "  → $name (NEW)"
    if $PSQL_BASE --single-transaction -f "$migration" 2>&1 | tail -3; then
      $PSQL_QUIET -c "INSERT INTO _migrations (filename, checksum) VALUES ('$name', '$file_checksum')" > /dev/null
      echo "    ✓ applied + checksum recorded"
      APPLIED_COUNT=$((APPLIED_COUNT + 1))
    else
      echo "    ✗ FAILED — остановка"
      exit 1
    fi
  elif [ "$stored" = "__legacy__" ]; then
    # Legacy bootstrap — фиксируем checksum (миграция уже применена ранее)
    $PSQL_QUIET -c "UPDATE _migrations SET checksum = '$file_checksum' WHERE filename = '$name'" > /dev/null
    echo "  ✓ $name (legacy → checksum recorded)"
    SKIPPED_COUNT=$((SKIPPED_COUNT + 1))
  elif [ "$stored" = "$file_checksum" ]; then
    SKIPPED_COUNT=$((SKIPPED_COUNT + 1))
  else
    # Checksum mismatch — миграция изменена после применения
    echo ""
    echo "ERROR: миграция $name была изменена после применения"
    echo "  Stored:  $stored"
    echo "  Current: $file_checksum"
    echo ""
    echo "Политика: миграции после apply immutable. Создайте новую"
    echo "миграцию для исправления вместо редактирования существующей."
    exit 1
  fi
done

echo ""
echo "✓ Применено новых: $APPLIED_COUNT"
echo "✓ Пропущено существующих: $SKIPPED_COUNT"

# ─── Применяем сиды если первая установка ───
SEEDS_DIR="$BACKEND_DIR/database/seeds"
PHASES_COUNT=$($PSQL_QUIET -c "SELECT COUNT(*) FROM rehab_phases WHERE program_type='acl'" 2>/dev/null || echo "0")
if [ "$PHASES_COUNT" -eq 0 ] && [ -f "$SEEDS_DIR/acl_phases.sql" ]; then
  echo ""
  echo "Применяем seed: acl_phases.sql (6 фаз ACL)"
  $PSQL_BASE -f "$SEEDS_DIR/acl_phases.sql"
  echo "✓ Сиды применены"
fi

echo ""
echo "═══ МИГРАЦИИ ЗАВЕРШЕНЫ ═══"
echo ""
echo "Состояние БД:"
$PSQL_BASE -c "\dt" | tail -25
echo ""
echo "Пациентов: $($PSQL_QUIET -c 'SELECT COUNT(*) FROM patients')"
echo "Инструкторов: $($PSQL_QUIET -c "SELECT COUNT(*) FROM users WHERE role='instructor'")"
echo "Упражнений: $($PSQL_QUIET -c 'SELECT COUNT(*) FROM exercises')"
echo "Фаз реабилитации: $($PSQL_QUIET -c 'SELECT COUNT(*) FROM rehab_phases')"
echo "Миграций в _migrations: $($PSQL_QUIET -c 'SELECT COUNT(*) FROM _migrations')"
