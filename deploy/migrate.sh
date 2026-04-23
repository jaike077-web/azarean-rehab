#!/bin/bash
# =====================================================
# Azarean Rehab — Migration Runner
# -----------------------------------------------------
# Применяет миграции по порядку к production БД (PG14).
# Идемпотентен: миграции с IF NOT EXISTS / CREATE OR REPLACE
# можно прогонять повторно. Миграции без IF NOT EXISTS
# упадут, но psql --single-transaction откатит частичные
# изменения.
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

APP_DIR="/opt/azarean-rehab"
BACKEND_DIR="$APP_DIR/backend"
MIGRATIONS_DIR="$BACKEND_DIR/database/migrations"
SCHEMA_FILE="$BACKEND_DIR/database/schema.sql"

# ─── Загружаем .env ───
if [ ! -f "$BACKEND_DIR/.env" ]; then
  echo "ERROR: $BACKEND_DIR/.env не найден"
  exit 1
fi

# Читаем DB_* переменные из .env
set -a
source <(grep -E '^DB_' "$BACKEND_DIR/.env")
set +a

echo "═══ Миграции → $DB_NAME ═══"
echo "  host: $DB_HOST:$DB_PORT  user: $DB_USER"

export PGPASSWORD="$DB_PASSWORD"
PSQL="psql -h ${DB_HOST:-localhost} -p ${DB_PORT:-5432} -U $DB_USER -d $DB_NAME -v ON_ERROR_STOP=1"

# ─── Проверка connection ───
$PSQL -c "SELECT version();" > /dev/null
echo "✓ Connection OK"

# ─── Определяем состояние БД ───
# Используем существование таблицы `users` как индикатор первой установки.
USERS_EXISTS=$($PSQL -tAc "SELECT 1 FROM information_schema.tables WHERE table_name='users'" 2>/dev/null || echo "")

if [ -z "$USERS_EXISTS" ]; then
  echo "БД пустая — применяем schema.sql"
  $PSQL -f "$SCHEMA_FILE"
  echo "✓ schema.sql применён"
fi

# ─── Применяем миграции в порядке имени ───
echo ""
echo "Применяем миграции..."
for migration in $(ls "$MIGRATIONS_DIR"/*.sql | sort); do
  name=$(basename "$migration")
  echo "  → $name"

  # Используем single-transaction чтобы упавшая миграция откатилась
  if $PSQL --single-transaction -f "$migration" 2>&1 | tail -3; then
    echo "    ✓"
  else
    echo "    ✗ FAILED — остановка"
    exit 1
  fi
done

# ─── Применяем сиды если первая установка ───
SEEDS_DIR="$BACKEND_DIR/database/seeds"
PHASES_COUNT=$($PSQL -tAc "SELECT COUNT(*) FROM rehab_phases WHERE program_type='acl'" 2>/dev/null || echo "0")
if [ "$PHASES_COUNT" -eq 0 ] && [ -f "$SEEDS_DIR/acl_phases.sql" ]; then
  echo ""
  echo "Применяем seed: acl_phases.sql (6 фаз ACL)"
  $PSQL -f "$SEEDS_DIR/acl_phases.sql"
  echo "✓ Сиды применены"
fi

echo ""
echo "═══ МИГРАЦИИ ЗАВЕРШЕНЫ ═══"

# Небольшая сводка
echo ""
echo "Состояние БД:"
$PSQL -c "\dt" | tail -25
echo ""
echo "Пациентов: $($PSQL -tAc 'SELECT COUNT(*) FROM patients')"
echo "Инструкторов: $($PSQL -tAc "SELECT COUNT(*) FROM users WHERE role='instructor'")"
echo "Упражнений: $($PSQL -tAc 'SELECT COUNT(*) FROM exercises')"
echo "Фаз реабилитации: $($PSQL -tAc 'SELECT COUNT(*) FROM rehab_phases')"
