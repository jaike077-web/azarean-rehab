#!/usr/bin/env bash
# check-lost-work.sh — детектор «работа есть, но её никто не видит».
# Обходит места, где работа застревает невидимо для git log:
#   1. Dangling-коммиты (git fsck) — осиротевшие при rebase/reset/удалении веток
#   2. Заначки старше 24ч — stash это карман на час, не склад
#   3. Локальные ветки не в дефолтной и без движения >7 дней
#   4. Коммиты, не запушенные на origin (сгорят с диском)
#   5. Грязное рабочее дерево (показываем — глазами оценить)
# Exit: 0 = чисто; 1 = есть находки. Запуск: ./scripts/check-lost-work.sh [--quiet]
set -uo pipefail
cd "$(dirname "$0")/.."

QUIET=0; [ "${1:-}" = "--quiet" ] && QUIET=1
FOUND=0
say() { [ "$QUIET" -eq 0 ] && echo "$@" || true; }

# Дефолтная ветка: origin/HEAD → main → master
DEFAULT_BRANCH="$(git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed 's#origin/##')"
if [ -z "$DEFAULT_BRANCH" ]; then
  git show-ref --verify --quiet refs/heads/main && DEFAULT_BRANCH=main || DEFAULT_BRANCH=master
fi

say "═══ Проверка потерянной работы ($(date '+%Y-%m-%d %H:%M'), дефолт=$DEFAULT_BRANCH) ═══"

# ── 1. Dangling-коммиты (минус разобранные в .lost-work-ack) ──
ACK_FILE="scripts/.lost-work-ack"
DANGLING_ALL="$(git fsck --no-reflogs 2>/dev/null | grep 'dangling commit' | awk '{print $3}')"
DANGLING=""
for c in $DANGLING_ALL; do
  grep -q "^$c" "$ACK_FILE" 2>/dev/null || DANGLING="$DANGLING $c"
done
DANGLING="$(echo "$DANGLING" | xargs || true)"
if [ -n "$DANGLING" ]; then
  FOUND=1
  say ""
  say "⚠️  1. ОСИРОТЕВШИЕ КОММИТЫ (не достижимы ни из ветки/тега, не в $ACK_FILE):"
  for c in $DANGLING; do
    say "   $(git show -s --format='%h  %ci  %s' "$c" 2>/dev/null | head -c 120)"
  done
  say "   → Разобрать: git show <sha>; вернуть: git cherry-pick / git checkout <sha> -- <file>"
  say "   → Разобран? Вписать full-sha в $ACK_FILE с комментарием — больше не всплывёт"
else
  say "✅ 1. Dangling-коммитов нет"
fi

# ── 2. Старые заначки ──
NOW=$(date +%s); STALE_STASH=0
while IFS= read -r line; do
  [ -z "$line" ] && continue
  REF="${line%%:*}"
  TS=$(git log -1 --format=%ct "$REF" 2>/dev/null || echo "$NOW")
  AGE_H=$(( (NOW - TS) / 3600 ))
  if [ "$AGE_H" -gt 24 ]; then
    FOUND=1; STALE_STASH=1
    say "⚠️  2. Заначка старше суток (${AGE_H}ч): $line"
  fi
done < <(git stash list 2>/dev/null)
[ "$STALE_STASH" -eq 0 ] && say "✅ 2. Старых заначек нет" \
  || say "   → stash живёт часы. Дольше → git stash branch wip/<тема> 'stash@{N}'"

# ── 3. Неслитые локальные ветки без движения >7 дней ──
STALE_BR=0; CURRENT="$(git rev-parse --abbrev-ref HEAD)"
while IFS= read -r br; do
  br="$(echo "$br" | sed 's/^[* ] //')"
  [ "$br" = "$DEFAULT_BRANCH" ] && continue
  [ "$br" = "$CURRENT" ] && continue
  if ! git merge-base --is-ancestor "$br" "$DEFAULT_BRANCH" 2>/dev/null; then
    TS=$(git log -1 --format=%ct "$br" 2>/dev/null || echo "$NOW")
    AGE_D=$(( (NOW - TS) / 86400 ))
    if [ "$AGE_D" -gt 7 ]; then
      FOUND=1; STALE_BR=1
      say "⚠️  3. Ветка не в $DEFAULT_BRANCH, стоит ${AGE_D}д: $br ($(git log -1 --format='%h %s' "$br" | head -c 70))"
    fi
  fi
done < <(git branch --list)
[ "$STALE_BR" -eq 0 ] && say "✅ 3. Застрявших веток нет" \
  || say "   → Влить, или затегировать и удалить: git tag archive/<имя> <ветка> && git branch -D <ветка>"

# ── 4. Незапушенные коммиты ──
UNPUSHED=0
while IFS= read -r br; do
  br="$(echo "$br" | sed 's/^[* ] //')"
  UP="$(git rev-parse --abbrev-ref "$br@{upstream}" 2>/dev/null || true)"
  if [ -z "$UP" ]; then
    N=$(git rev-list --count "$br" --not --remotes 2>/dev/null || echo 0)
    [ "$N" -gt 0 ] && { FOUND=1; UNPUSHED=1; say "⚠️  4. Ветка БЕЗ upstream, $N локальных коммитов: $br"; }
  else
    N=$(git rev-list --count "$UP..$br" 2>/dev/null || echo 0)
    [ "$N" -gt 0 ] && { FOUND=1; UNPUSHED=1; say "⚠️  4. Не запушено $N коммитов: $br → $UP"; }
  fi
done < <(git branch --list)
[ "$UNPUSHED" -eq 0 ] && say "✅ 4. Всё запушено на origin"

# ── 5. Грязное рабочее дерево ──
DIRTY="$(git status --porcelain | head -20)"
if [ -n "$DIRTY" ]; then
  say ""; say "ℹ️  5. Незакоммиченное (глазами оценить):"; say "$DIRTY"
else
  say "✅ 5. Рабочее дерево чистое"
fi

say ""
[ "$FOUND" -eq 0 ] && say "═══ ✅ Потерянной работы не обнаружено ═══" || say "═══ ⚠️ Есть находки — разобрать выше ═══"
exit $FOUND
