#!/bin/bash
# =====================================================
# check-tg-proxy.sh — мониторинг tg-proxy.azarean.ru
# =====================================================
# Telegram OIDC ходит через reverse-proxy на финском VDS (78.17.1.70,
# управляется JARVIS-Director'ом). Если прокси лежит — пациенты не могут
# залогиниться через Telegram (Yandex не затронут).
#
# Скрипт проверяет, что прокси отвечает, и шлёт алерт в Telegram ops-bot
# при N фейлах подряд (защита от transient блипов).
#
# Cron каждые 5 минут:
#   */5 * * * * /opt/azarean-rehab/deploy/check-tg-proxy.sh >/dev/null 2>&1
#
# Состояние:
#   /var/lib/azarean-rehab/tg-proxy-fails — счётчик фейлов подряд
# =====================================================

set -u

ENV_FILE="${ENV_FILE:-/opt/azarean-rehab/backend/.env}"
STATE_DIR="${STATE_DIR:-/var/lib/azarean-rehab}"
STATE_FILE="$STATE_DIR/tg-proxy-fails"
LOG_FILE="${LOG_FILE:-/var/log/azarean-rehab-tg-proxy.log}"

mkdir -p "$STATE_DIR"

# --- Прочитать env vars из .env (без source — у нас могут быть пробелы/спецсимволы) ---
read_env_var() {
    local key="$1"
    grep -E "^${key}=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '\r'
}

PROXY_URL=$(read_env_var TG_PROXY_URL)
PROXY_SECRET=$(read_env_var TG_PROXY_SECRET)
OPS_TOKEN=$(read_env_var OPS_BOT_TOKEN)
OPS_CHAT_ID=$(read_env_var OPS_CHAT_ID)

if [ -z "$PROXY_URL" ] || [ -z "$PROXY_SECRET" ]; then
    # Прокси не настроен — нечего мониторить (например, локальная dev-копия)
    exit 0
fi

# --- Сама проверка ---
# Discovery endpoint — единственный stateless GET что прокси whitelist'ит.
# 200 = прокси жив И oauth.telegram.org отвечает.
TS=$(date '+%Y-%m-%d %H:%M:%S')
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    --max-time 10 \
    --connect-timeout 5 \
    -H "X-Proxy-Secret: $PROXY_SECRET" \
    "$PROXY_URL/.well-known/openid-configuration" 2>&1)

if [ "$HTTP_CODE" = "200" ]; then
    # Success — reset счётчик
    PREV=$(cat "$STATE_FILE" 2>/dev/null || echo "0")
    echo "0" > "$STATE_FILE"
    if [ "$PREV" != "0" ] && [ "$PREV" != "" ]; then
        # Recovery после серии фейлов — отдельная нотификация
        echo "[$TS] RECOVERY (после $PREV фейлов)" >> "$LOG_FILE"
        if [ -n "$OPS_TOKEN" ] && [ -n "$OPS_CHAT_ID" ]; then
            curl -s --max-time 5 \
                --data-urlencode "chat_id=$OPS_CHAT_ID" \
                --data-urlencode "text=✅ [PROD] tg-proxy.azarean.ru снова отвечает (после $PREV фейлов подряд)." \
                "https://api.telegram.org/bot$OPS_TOKEN/sendMessage" > /dev/null 2>&1
        fi
    fi
    exit 0
fi

# Fail — increment counter
COUNT=$(cat "$STATE_FILE" 2>/dev/null || echo "0")
COUNT=$((COUNT + 1))
echo "$COUNT" > "$STATE_FILE"
echo "[$TS] FAIL #$COUNT (HTTP $HTTP_CODE)" >> "$LOG_FILE"

# Алерт-стратегия:
#   1-й fail (5 мин) — silent (transient блип, не спамим)
#   2-й fail (10 мин подряд) — первый алерт
#   12-й fail (60 мин) — повторный алерт «всё ещё лежит»
#   далее каждый 12-й (раз в час)
SHOULD_ALERT=false
if [ "$COUNT" -eq 2 ]; then
    SHOULD_ALERT=true
elif [ "$COUNT" -ge 12 ] && [ $((COUNT % 12)) -eq 0 ]; then
    SHOULD_ALERT=true
fi

if [ "$SHOULD_ALERT" = "true" ] && [ -n "$OPS_TOKEN" ] && [ -n "$OPS_CHAT_ID" ]; then
    DURATION_MIN=$((COUNT * 5))
    TEXT="🚨 [PROD] tg-proxy.azarean.ru недоступен

Тип: Infra · ПРОКСИ
Что: HTTP $HTTP_CODE при GET /.well-known/openid-configuration
Где: финский VDS 78.17.1.70 (управляется JARVIS)
Лежит: $DURATION_MIN мин подряд (fail #$COUNT)

Что делать:
  - Telegram OAuth-логин у пациентов не работает.
  - Yandex OAuth не затронут (без прокси).
  - Связаться с JARVIS-Director'ом для перезапуска nginx на 78.17.1.70.
  - Если долго — временно отключить TELEGRAM_LOGIN_ENABLED=false в .env, pm2 restart."

    curl -s --max-time 10 \
        --data-urlencode "chat_id=$OPS_CHAT_ID" \
        --data-urlencode "text=$TEXT" \
        "https://api.telegram.org/bot$OPS_TOKEN/sendMessage" > /dev/null 2>&1
fi

exit 1
