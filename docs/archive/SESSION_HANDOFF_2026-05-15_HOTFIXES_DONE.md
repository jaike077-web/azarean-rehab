# SESSION HANDOFF — Wave 1 hot-fix batch закрыт (6 PR'ов)

**Дата:** 2026-05-15
**Точка:** Все 4 backlog hot-fix'а из prod-smoke + Wave 1 retrospective + SW cache invalidation — в проде, smoke OK.

---

## TL;DR для нового чата

```
✅ 6 PR'ов merged в main за одну сессию (8894ddf → f7ef711)
✅ Backend 423 → 437 (+14 тестов), 0 миграций
✅ Bug #5 (блокер коммерч.запуска), #12 (полностью), #13 (root cause) закрыты
✅ Prod-smoke 4/4 ✅ — UI/UX, Telegram share, OAuth, AdminContent
⚠️  Backlog: AdminContent dark modal text (партнёр Bug #15) + Wave 1 retro для api.js/RoadmapScreen/telegramBot
🟢 Готовы 4 TZ для повторного использования (если понадобится) в корне (TZ_HOTFIX_*.md)
⏳ Wave 2 ждёт ответы юзера архитектору на 4 OPEN questions (measurements + pain events)
```

**Точка входа в новый чат:**
> Читай `SESSION_HANDOFF_2026-05-15_HOTFIXES_DONE.md` в корне + memory `wave_1_hotfix_batch_complete.md`. Все 4 hot-fix'а в проде, ждём ответы архитектору для Wave 2 / либо backlog dark theme.

---

## Что в проде после сессии

### Финальный список PR'ов (по порядку merge)

| PR | SHA | Что |
|---|---|---|
| [#61](https://github.com/jaike077-web/azarean-rehab/pull/61) | `8894ddf` | Wave 1 retrospective — 4 пропущенных хардкода `program_type='acl'` в `routes/rehab.js` + **Bug #12 closed completely** |
| [#62](https://github.com/jaike077-web/azarean-rehab/pull/62) | `8974938` | OAuth post-registration — **Bug #5 closed (блокер коммерч.запуска снят)** |
| [#63](https://github.com/jaike077-web/azarean-rehab/pull/63) | `e016285` | complex.title field UI — **Bug #13 root cause closed** |
| [#64](https://github.com/jaike077-web/azarean-rehab/pull/64) | `f88bf5c` | AdminContent CSS Modules — 22 класса скопированы |
| [#65](https://github.com/jaike077-web/azarean-rehab/pull/65) | `c738941` | invite-code share UX — pre-filled `?code=` URL |
| [#66](https://github.com/jaike077-web/azarean-rehab/pull/66) | `f7ef711` | SW bump v3→v4 — invalidate cache для #65 |

### Метрики

- Backend: 423 → **437** (+14 тестов: +6 OAuth, +4 complex.title, +1 stuck-status shoulder, +3 multi-protocol shoulder + 1 instructor)
- Frontend: **252/252** — без изменений
- 0 миграций БД
- 0 password_hash UPDATE в OAuth flow (verified grep'ом)

---

## Prod-smoke результаты (2026-05-15)

| # | Что | Результат |
|---|---|---|
| 1 | Returning OAuth login (Vadim через Яндекс) | ✅ работает |
| 2 | Создание комплекса с title + edit pre-fill + RehabProgramModal selector + legacy fallback | ✅ работает |
| 3 | AdminContent 5 табов × 2 темы | ✅ работает + ⚠️ модалки в dark theme — белый input text (backlog) |
| 4 | Telegram share с `?code=` pre-fill | ✅ после SW bump (PR #66) |

---

## Открытый backlog (для нового чата)

### MEDIUM
- **AdminContent модалки dark theme — невидимый input text** ([memory/bug_admin_content_modal_dark_theme_text.md](.claude/projects/c--Users-------Desktop-Azarean-rehab/memory/bug_admin_content_modal_dark_theme_text.md)). Обнаружено в smoke #3. Партнёр Bug #15 (MDEditor + global inputs). Ждём architect spec на Bug #15 → глобальный fix в `index.css`. **Не блокер коммерч.запуска** (admin-only, один Vadim).

### HIGH
- **Wave 1 retrospective audit оставшихся endpoint'ов** — мы прогрепали `routes/rehab.js`, но не Wave 1 #1.04 (api.js, RoadmapScreen, telegramBot) — там тоже могли остаться хардкоды. Можно сделать перед Wave 2 (~30 мин полного grep'а).

### LOW (отложено в backlog)
- Zombie `/my/program` endpoint ([memory/zombie_endpoint_my_program.md](.claude/projects/c--Users-------Desktop-Azarean-rehab/memory/zombie_endpoint_my_program.md)) — JSDoc `@deprecated` в PR #61. Триггер удаления — Wave 3.
- `'general'` sentinel в `program_types` справочник ([memory/backlog_general_program_type_in_registry.md](.claude/projects/c--Users-------Desktop-Azarean-rehab/memory/backlog_general_program_type_in_registry.md)) — design-quality.

---

## Что ждёт твоё внимание — Wave 2

Архитектор обещал перейти к Wave 2 после batch hot-fix'ов. Нужны **твои ответы на 5 вопросов** (из его отчёта 2026-05-15):

### A. Плечо measurements
- **Окружности (раз в 7-10 дней):** какие 2-3 точки? Mid-deltoid / mid-biceps / acromial?
- **ROM:** какие 3-5 движений самые информативные? (forward flexion, abduction, IR/ER в 0°/90°, hand-behind-back)

### B. Голеностоп measurements
- Окружности: «фигура-8» или над лодыжками?
- ROM: DF + PF в градусах? Single-leg balance time?

### C. Позвоночник ROM
- Schober test, lateral flexion, rotation, extension, cervical?

### D. ТБС measurements
- Reference point для бедра?
- Hip flexion/abduction/IR? Trendelenburg test?

### E. Pain events — финальный выбор
- (1) Простой VAS slider + free text
- (2) **VAS + multi-select pain locations** (chips, per program_type) — **рекомендация архитектора**
- (3) Full Body Pain Diagram

После ответов архитектор пишет `TZ_WAVE_2_*.md` файлы.

### Параллельно (можно делать пока ждём)
- **Seed phases для shoulder_general / knee_general** — clinical content от тебя (структура: 6 фаз с goals/restrictions/criteria_next/red_flags/faq как у acl)
- **Hot-fix AdminContent dark modal** — если архитектор пришлёт spec по Bug #15

---

## Известные ограничения (для нового чата)

### Dirty файлы dark-theme (от 2026-05-04)
4 файла uncommitted в working tree + CLAUDE.md (последний обновлён в этой сессии хвостовой записью про PR #62):
- `frontend/src/pages/PatientDashboard/PatientDashboard.js`
- `frontend/src/pages/PatientDashboard/components/DiaryScreen.css`
- `frontend/src/pages/PatientDashboard/tokens.css`
- `frontend/src/styles/tokens.css`
- `CLAUDE.md` (содержит и dark-theme правки от 2026-05-04, и retrospective запись)

Все 6 hot-fix коммитов прошли мимо них (через `git stash` перед merge'ем + restore после). **Продолжать эту изоляцию.**

### SSH classifier
SSH на prod через Bash tool блокируется auto-classifier'ом. **Workaround:** юзер делает SSH сам через свой терминал. Также auto-classifier правильно блокирует прямой PII dump (например `SELECT phone, password_hash IS NOT NULL FROM patients`).

### TZ файлы для повторного использования
В корне 4 TZ + 1 для retrospective:
- [TZ_HOTFIX_OAUTH_POST_REGISTRATION.md](TZ_HOTFIX_OAUTH_POST_REGISTRATION.md) (использован)
- [TZ_HOTFIX_COMPLEX_TITLE_UI.md](TZ_HOTFIX_COMPLEX_TITLE_UI.md) (использован)
- [TZ_HOTFIX_ADMIN_CONTENT_CSS_MODULES.md](TZ_HOTFIX_ADMIN_CONTENT_CSS_MODULES.md) (использован)
- [TZ_HOTFIX_INVITE_CODE_SHARE_UX.md](TZ_HOTFIX_INVITE_CODE_SHARE_UX.md) (использован)
- [ARCHITECT_QUESTION_HARDCODES_AUDIT_2026-05-15.md](ARCHITECT_QUESTION_HARDCODES_AUDIT_2026-05-15.md) (для архитектора, retrospective discovery)

Можно безопасно удалить эти TZ файлы из корня, они уже задеплоены — оставлены для истории и шаблона будущих hot-fix'ов.

---

## Lessons learned

### 1. UX-критичный JS-change → bump SW CACHE_NAME
Prod-smoke #4 показал: после merge PR #65 юзер видел СТАРЫЙ Telegram-text. Cache-first для статики (`sw.js:75`) кэширует `bundle.<hash>.js`. Bump CACHE_NAME → activate event удалит старый кэш → fresh install. Без bump'а — 24ч TTL естественного обновления. **Memo для будущего:** любой user-visible JS-change в merge — SW bump в отдельном PR.

### 2. Full-codebase grep перед закрытием bug-категории (новое feedback правило)
Wave 1 #1.02 пропустил 4 хардкода `program_type='acl'`. Bug #12 был помечен «closed полностью» преждевременно. Если бы Claude не сделал verify-grep — это всплыло бы в проде когда первый shoulder пациент сел на HomeScreen. См. [memory/feedback_full_grep_after_bug_category_closed.md](.claude/projects/c--Users-------Desktop-Azarean-rehab/memory/feedback_full_grep_after_bug_category_closed.md).

### 3. ТЗ архитектора нужно сверять с реальным кодом
Юзер: «ТЗ от архитектора нужно сверять с реальным кодом и положением дел». Claude теперь делает verify-step grep + read source code до executable ТЗ. ТЗ #2 (complex.title) обнаружил что **backend** POST/PUT тоже не принимают title — это расширило scope. ТЗ #5 (OAuth) выявил что Telegram email-fallback не нужен (`claims.email` отсутствует) — pure economy.

---

## Команды для напоминания

```bash
# Где я
cd c:/Users/Вадим/Desktop/Azarean_rehab
git log --oneline -8   # последние 8 коммитов (Wave 1 retro + 6 hot-fix)
git branch --show-current  # должно быть main
git status --short      # должно быть 5 dirty dark-theme файлов

# Test baseline после batch
cd backend && npm test       # 437/437
cd frontend && CI=true npx react-scripts test --watchAll=false  # 252/252

# Dev серверы
netstat -ano | grep ":5000\|:3001"   # backend :5000, frontend :3001

# DB credentials
"C:/Program Files/PostgreSQL/18/bin/psql.exe" -h localhost -U postgres -d azarean_rehab
# password в pgpass.conf

# Prod health
curl -s https://my.azarean.ru/api/health
```

---

## Точка опоры

**Memory:**
- [wave_1_hotfix_batch_complete.md](.claude/projects/c--Users-------Desktop-Azarean-rehab/memory/wave_1_hotfix_batch_complete.md) — итоговая сводка с метриками
- [wave_1_complete.md](.claude/projects/c--Users-------Desktop-Azarean-rehab/memory/wave_1_complete.md) — Wave 1 (10 PR)
- [wave_1_retrospective_2026-05-15.md](.claude/projects/c--Users-------Desktop-Azarean-rehab/memory/wave_1_retrospective_2026-05-15.md) — retrospective audit

**Bug closes (все 5):**
- [bug_oauth_blocked_after_local_registration.md](.claude/projects/c--Users-------Desktop-Azarean-rehab/memory/bug_oauth_blocked_after_local_registration.md) ✅ #5
- [bug_complex_title_field_missing_in_ui.md](.claude/projects/c--Users-------Desktop-Azarean-rehab/memory/bug_complex_title_field_missing_in_ui.md) ✅ #13
- [bug_admin_content_css_modules_unfinished.md](.claude/projects/c--Users-------Desktop-Azarean-rehab/memory/bug_admin_content_css_modules_unfinished.md) ✅
- [bug_invite_code_share_link.md](.claude/projects/c--Users-------Desktop-Azarean-rehab/memory/bug_invite_code_share_link.md) ✅
- [bug_patient_stuck_status_hardcoded_acl.md](.claude/projects/c--Users-------Desktop-Azarean-rehab/memory/bug_patient_stuck_status_hardcoded_acl.md) ✅

**Открытые backlog:**
- [bug_admin_content_modal_dark_theme_text.md](.claude/projects/c--Users-------Desktop-Azarean-rehab/memory/bug_admin_content_modal_dark_theme_text.md) (новый, партнёр Bug #15)
- [zombie_endpoint_my_program.md](.claude/projects/c--Users-------Desktop-Azarean-rehab/memory/zombie_endpoint_my_program.md)
- [backlog_general_program_type_in_registry.md](.claude/projects/c--Users-------Desktop-Azarean-rehab/memory/backlog_general_program_type_in_registry.md)

---

**Wave 1 + hot-fix batch — большая ступень.** Wave 2 (клинический дневник) — следующий major блок, ждёт твои ответы архитектору.
