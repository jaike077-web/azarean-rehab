#!/bin/bash
# =====================================================
# Azarean Rehab — Initial VDS Setup (run ONCE)
# -----------------------------------------------------
# Запускается ВРУЧНУЮ на VDS под root:
#   ssh root@185.93.109.234
#   bash /opt/azarean-rehab/deploy/setup.sh
#
# Что делает:
#  1. Создаёт /opt/azarean-rehab/ (если не существует)
#  2. Создаёт PostgreSQL юзера + БД
#  3. Копирует .env.production.example → .env (без секретов)
#  4. Устанавливает nginx server block
#  5. Запрашивает Let's Encrypt сертификат для my.azarean.ru
#  6. Настраивает PM2 (не стартует, только подготовка)
#  7. Добавляет cron для бэкапов и healthcheck
#
# !!! НЕ ПЕРЕЗАПИСЫВАЕТ существующие файлы .env или БД !!!
# Скрипт идемпотентен: проверяет state перед каждым действием.
#
# Требования (должны быть установлены — на общем VDS уже есть):
#  - Node.js ≥ 20, npm
#  - PostgreSQL 14
#  - PM2
#  - nginx
#  - certbot
# =====================================================

set -euo pipefail

# ─── Настройки ───
APP_DIR="/opt/azarean-rehab"
APP_USER="root"            # JARVIS тоже под root — держим единообразие
DOMAIN="my.azarean.ru"
DB_NAME="azarean_rehab"
DB_USER="azarean_user"
NGINX_SITE="/etc/nginx/sites-available/${DOMAIN}"
NGINX_ENABLED="/etc/nginx/sites-enabled/${DOMAIN}"

# ─── Проверки окружения ───
echo "═══ Проверка окружения ═══"
command -v node >/dev/null 2>&1  || { echo "ERROR: Node.js не установлен"; exit 1; }
command -v psql >/dev/null 2>&1  || { echo "ERROR: psql не установлен"; exit 1; }
command -v pm2  >/dev/null 2>&1  || { echo "ERROR: PM2 не установлен"; exit 1; }
command -v nginx >/dev/null 2>&1 || { echo "ERROR: nginx не установлен"; exit 1; }
command -v certbot >/dev/null 2>&1 || { echo "ERROR: certbot не установлен"; exit 1; }

NODE_MAJOR=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "ERROR: Node.js ${NODE_MAJOR}.x — требуется >= 20"
  exit 1
fi
echo "✓ Node $(node -v), PG $(psql --version | awk '{print $3}'), PM2 $(pm2 -v), nginx $(nginx -v 2>&1 | awk -F'/' '{print $2}')"

# ─── 1. Директория проекта ───
echo ""
echo "═══ 1. Директория ═══"
if [ ! -d "$APP_DIR" ]; then
  mkdir -p "$APP_DIR"
  echo "✓ Создано $APP_DIR"
else
  echo "ℹ $APP_DIR уже существует (skip)"
fi

# Создаём структуру для релизов — GitHub Actions деплоит сюда
mkdir -p "$APP_DIR/backend" "$APP_DIR/frontend/build" "$APP_DIR/backups" "$APP_DIR/logs"
mkdir -p /var/log/pm2
echo "✓ Структура каталогов готова"

# ─── 2. PostgreSQL БД + юзер ───
echo ""
echo "═══ 2. PostgreSQL ═══"

# Проверить существует ли уже БД
DB_EXISTS=$(sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" || echo "")
USER_EXISTS=$(sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" || echo "")

if [ -z "$DB_EXISTS" ] && [ -z "$USER_EXISTS" ]; then
  echo "БД и юзер не существуют."
  echo ""
  echo "❗ ВАЖНО: сейчас введи пароль для $DB_USER (32+ символов)."
  echo "   Запомни его — он пойдёт в .env как DB_PASSWORD."
  echo "   Рекомендация: сгенерить заранее через: openssl rand -base64 32"
  echo ""
  sudo -u postgres createuser --pwprompt --no-superuser --no-createdb --no-createrole "$DB_USER"
  sudo -u postgres createdb --owner="$DB_USER" "$DB_NAME"
  sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;"
  echo "✓ БД $DB_NAME + юзер $DB_USER созданы"
else
  echo "ℹ БД и/или юзер уже существуют (skip):"
  [ -n "$DB_EXISTS" ] && echo "  - БД $DB_NAME"
  [ -n "$USER_EXISTS" ] && echo "  - юзер $DB_USER"
fi

# Проверить что JARVIS БД не пострадала
JARVIS_DB=$(sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='jarvis_director'" || echo "")
if [ -n "$JARVIS_DB" ]; then
  echo "✓ jarvis_director БД на месте (не тронули)"
fi

# ─── 3. .env файл ───
echo ""
echo "═══ 3. .env ═══"
ENV_FILE="$APP_DIR/backend/.env"
if [ ! -f "$ENV_FILE" ]; then
  if [ -f "$APP_DIR/backend/.env.production.example" ]; then
    cp "$APP_DIR/backend/.env.production.example" "$ENV_FILE"
    chmod 600 "$ENV_FILE"
    echo "✓ .env создан из шаблона"
    echo ""
    echo "❗ ДЕЙСТВИЕ: отредактируй $ENV_FILE"
    echo "   Заполни все <CHANGE_ME_*> реальными значениями."
    echo "   Секреты пришлёт Claude Code в чате."
  else
    echo "ERROR: шаблон .env.production.example не найден в $APP_DIR/backend/"
    echo "Сначала задеплой код через GitHub Actions (хотя бы один раз)."
    exit 1
  fi
else
  echo "ℹ .env уже существует (skip — не перезаписываем чтобы не потерять секреты)"
fi

# ─── 4. nginx server block ───
echo ""
echo "═══ 4. Nginx ═══"
if [ ! -f "$NGINX_SITE" ]; then
  if [ -f "$APP_DIR/deploy/nginx-my-azarean.conf" ]; then
    cp "$APP_DIR/deploy/nginx-my-azarean.conf" "$NGINX_SITE"
    echo "✓ Скопирован $NGINX_SITE"
  else
    echo "ERROR: $APP_DIR/deploy/nginx-my-azarean.conf не найден"
    exit 1
  fi
else
  echo "ℹ $NGINX_SITE уже существует (skip)"
fi

if [ ! -L "$NGINX_ENABLED" ]; then
  ln -s "$NGINX_SITE" "$NGINX_ENABLED"
  echo "✓ Симлинк в sites-enabled"
fi

# Проверить конфиг до reload
nginx -t
if [ $? -eq 0 ]; then
  systemctl reload nginx
  echo "✓ nginx reload OK"
else
  echo "ERROR: nginx -t failed — не перезагружаем"
  exit 1
fi

# ─── 5. Let's Encrypt ───
echo ""
echo "═══ 5. Let's Encrypt ═══"
if ! certbot certificates 2>&1 | grep -q "$DOMAIN"; then
  echo "Получаем сертификат для $DOMAIN..."
  echo "❗ ВАЖНО: DNS A-запись my.azarean.ru → 185.93.109.234 должна уже быть настроена."
  echo "   Проверь: nslookup $DOMAIN"
  echo ""
  read -p "Продолжить получение сертификата? (y/n) " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --email admin@azarean.ru --redirect
    echo "✓ Сертификат получен"
  else
    echo "⏸ Пропущено. Запусти вручную: certbot --nginx -d $DOMAIN"
  fi
else
  echo "ℹ Сертификат для $DOMAIN уже есть (skip)"
fi

# ─── 6. PM2 prep ───
echo ""
echo "═══ 6. PM2 prep ═══"
echo "ℹ PM2 стартует процесс только после первого деплоя (когда код будет в $APP_DIR/backend/)"
echo "ℹ pm2-logrotate должен быть установлен (см. jarvis setup). Проверить: pm2 list"
pm2 list | head -5 || true

# ─── 7. Cron для бэкапов ───
echo ""
echo "═══ 7. Cron ═══"
CRON_BACKUP="/etc/cron.d/azarean-rehab-backup"
if [ ! -f "$CRON_BACKUP" ]; then
  cat > "$CRON_BACKUP" <<EOF
# Azarean Rehab — ежедневный бэкап БД в 03:15 Екб (22:15 UTC)
15 22 * * * root $APP_DIR/deploy/backup.sh >> /var/log/azarean-rehab-backup.log 2>&1
EOF
  chmod 644 "$CRON_BACKUP"
  echo "✓ Cron backup установлен"
fi

CRON_HEALTH="/etc/cron.d/azarean-rehab-healthcheck"
if [ ! -f "$CRON_HEALTH" ]; then
  cat > "$CRON_HEALTH" <<EOF
# Azarean Rehab — healthcheck каждые 5 минут
*/5 * * * * root $APP_DIR/deploy/healthcheck.sh >> /var/log/azarean-rehab-health.log 2>&1
EOF
  chmod 644 "$CRON_HEALTH"
  echo "✓ Cron healthcheck установлен"
fi

# ─── Итог ───
echo ""
echo "═══ SETUP ЗАВЕРШЁН ═══"
echo ""
echo "Следующие шаги:"
echo "  1. Отредактировать $ENV_FILE (вставить реальные секреты)"
echo "  2. Прогнать миграции: bash $APP_DIR/deploy/migrate.sh"
echo "  3. Запустить GitHub Actions workflow_dispatch для первого деплоя"
echo "  4. После успешного деплоя: pm2 start $APP_DIR/deploy/ecosystem.config.js --env production"
echo "  5. pm2 save && pm2 startup  (чтобы процесс поднимался после reboot)"
echo ""
echo "Smoke-тест после деплоя:"
echo "  curl -I https://$DOMAIN/            (должно быть 200)"
echo "  curl https://$DOMAIN/api/rehab/phases?type=acl  (должен вернуть JSON)"
