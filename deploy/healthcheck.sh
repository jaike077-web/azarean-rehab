#!/bin/bash
# =====================================================
# Azarean Rehab — Healthcheck с backoff threshold
# -----------------------------------------------------
# Каждые 5 минут (cron): проверяет что PM2 процесс жив и /api/health
# отвечает 200. Рестарт PM2 ТОЛЬКО при THRESHOLD подряд фейлах —
# чтобы transient ошибки (сеть, БД рестарт) не вызывали цикл рестартов.
#
# Лог: /var/log/azarean-rehab-health.log
# Состояние: /var/lib/azarean-rehab/health-fails (счётчик подряд фейлов)
# =====================================================

set -uo pipefail

TIMESTAMP="[$(date '+%Y-%m-%d %H:%M:%S')]"
PM2_NAME="azarean-rehab"
PORT=3001

STATE_DIR="/var/lib/azarean-rehab"
FAIL_COUNT_FILE="$STATE_DIR/health-fails"
THRESHOLD=3

mkdir -p "$STATE_DIR"
[ -f "$FAIL_COUNT_FILE" ] || echo "0" > "$FAIL_COUNT_FILE"

# ─── 1. PM2 процесс живой? ───
PM2_STATUS=$(pm2 jlist 2>/dev/null | node -e "
  let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{
    try{const a=JSON.parse(d);
      const p=a.find(x=>x.name==='$PM2_NAME');
      console.log(p?p.pm2_env.status:'not_found');
    }catch(e){console.log('error');}
  });
" 2>/dev/null || echo "error")

if [ "$PM2_STATUS" != "online" ]; then
  echo "$TIMESTAMP CRIT: PM2 process $PM2_NAME status=$PM2_STATUS — рестарт"
  pm2 restart "$PM2_NAME"
  echo "0" > "$FAIL_COUNT_FILE"
  sleep 3
  exit 0
fi

# ─── 2. /api/health отвечает? ───
# Берём тело + HTTP-код: при 503 с db.alive=false рестарт процесса не поможет
# (это деградация БД, а не отказ ноды) — только алертим, счётчик не копим.
HEALTH=$(curl -s -m 10 -w $'\n%{http_code}' "http://127.0.0.1:${PORT}/api/health" 2>/dev/null || printf '\n000')
HTTP_CODE=$(printf '%s' "$HEALTH" | tail -n1)
HEALTH_BODY=$(printf '%s' "$HEALTH" | sed '$d')

if [ "$HTTP_CODE" = "200" ]; then
  # Reset счётчика при success
  echo "0" > "$FAIL_COUNT_FILE"
  # OK — выводим раз в час (00-05 минут), в остальное время тихо
  MIN=$(date +%M)
  if [ "$MIN" -le 5 ]; then
    echo "$TIMESTAMP OK: PM2=online HTTP=200"
  fi
elif printf '%s' "$HEALTH_BODY" | grep -q '"alive":false'; then
  # БД недоступна — нода жива и честно отдаёт 503. Рестарт PM2 не вылечит БД и
  # только усугубит (death-spiral). Алертим, счётчик НЕ инкрементируем.
  echo "0" > "$FAIL_COUNT_FILE"
  echo "$TIMESTAMP WARN: БД недоступна (db.alive=false), HTTP $HTTP_CODE — НЕ рестартим (деградация зависимости, не отказ ноды)"
else
  CURRENT=$(cat "$FAIL_COUNT_FILE" 2>/dev/null || echo "0")
  CURRENT=$((CURRENT + 1))
  echo "$CURRENT" > "$FAIL_COUNT_FILE"
  echo "$TIMESTAMP WARN: HTTP $HTTP_CODE from /api/health (fail $CURRENT/$THRESHOLD)"

  if [ "$CURRENT" -ge "$THRESHOLD" ]; then
    echo "$TIMESTAMP CRIT: $THRESHOLD consecutive fails — рестарт PM2"
    pm2 restart "$PM2_NAME"
    echo "0" > "$FAIL_COUNT_FILE"
  fi
fi
