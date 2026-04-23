#!/bin/bash
# =====================================================
# Azarean Rehab — Healthcheck
# -----------------------------------------------------
# Каждые 5 минут (cron): проверяет что PM2 процесс жив и
# отвечает. Если нет — рестарт + алерт в лог.
# Лог: /var/log/azarean-rehab-health.log
# =====================================================

set -uo pipefail

TIMESTAMP="[$(date '+%Y-%m-%d %H:%M:%S')]"
PM2_NAME="azarean-rehab"
PORT=3001

# ─── 1. Процесс PM2 живой? ───
PM2_STATUS=$(pm2 jlist 2>/dev/null | node -e "
  let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{
    try{const a=JSON.parse(d);
      const p=a.find(x=>x.name==='$PM2_NAME');
      console.log(p?p.pm2_env.status:'not_found');
    }catch(e){console.log('error');}
  });
" 2>/dev/null || echo "error")

if [ "$PM2_STATUS" != "online" ]; then
  echo "$TIMESTAMP WARN: PM2 process $PM2_NAME status=$PM2_STATUS — рестартуем"
  pm2 restart "$PM2_NAME"
  sleep 3
fi

# ─── 2. Отвечает ли backend на healthcheck endpoint? ───
# Backend пока не имеет /api/health — используем публичный /api/rehab/phases
# (без auth, возвращает 200 если БД и код живы).
HTTP_CODE=$(curl -sf -o /dev/null -w "%{http_code}" -m 10 "http://127.0.0.1:${PORT}/api/rehab/phases?type=acl" || echo "000")

if [ "$HTTP_CODE" != "200" ]; then
  echo "$TIMESTAMP WARN: HTTP $HTTP_CODE from port $PORT — рестарт PM2"
  pm2 restart "$PM2_NAME"
else
  # OK — выводим раз в час (00-05 минут), в остальное время тихо
  MIN=$(date +%M)
  if [ "$MIN" -le 5 ]; then
    echo "$TIMESTAMP OK: PM2=$PM2_STATUS HTTP=$HTTP_CODE"
  fi
fi
