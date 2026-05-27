# SESSION HANDOFF — Pilot prep batch closed (2026-05-26)

**Дата:** 2026-05-26
**Контекст:** Сессия закрытия pilot-prep задач после Wave 2 closure. 8 коммитов: cleanup test patients, admin UI смена email/password, modal close-on-drag fix (6 итераций), CI lint gate, brand polish.

---

## TL;DR для нового чата

```
✅ Prod БД cleanup: 11 тестовых patients удалены, id=12 (avi707@mail.ru) сохранён как demo+uploads anchor
✅ Admin email сменён через UI: vadim@azarean.com → jaike077@yandex.ru (placeholder → реальный yandex)
✅ Modal close-on-drag fix: 25 модалок мигрированы на useModalOverlayClose hook
✅ CI lint gate: npm run lint:modals в frontend ловит anti-patterns при build
✅ Brand polish: AN-logo.jpg → logo_az.png по всему UI, favicon multi-res, VK/Yandex SVG OAuth
✅ SW bump v6 → v7 для auto-cleanup stale cache у других клиентов
🟢 Main HEAD = `7cb4022`, prod live на https://my.azarean.ru
```

**Точка входа в новом чате:**
> Pilot prep полностью закрыт. Pilot-аккаунты ещё не созданы (Татьяна / Алёна как users роль `admin` или `instructor`). Backlog: dark theme bug, Node 20 deprecation, либо новые задачи от Vadim'а.

---

## Что было сделано в этой сессии

| Phase | Commit | Описание |
|---|---|---|
| Cleanup prod БД | (SSH op) | DELETE FROM patients WHERE id != 12 + CASCADE (9 complexes, 6 programs, 21 progress_logs, etc) + audit_logs BULK_DELETE + pg_dump backup `/tmp/azarean_rehab_pre_cleanup_20260525_073934.dump` + local backup `c:/tmp/`. Orphan files в uploads/ = 0. |
| Admin UI смена creds | `5649e3c` | PUT /api/admin/users/:id принимает email + new_password. AdminUserModal: email/password поля видны и при edit. Self password change → force logout + redirect. +6 backend tests + AuthContext/useNavigate mocks в AdminPanel.test.js. |
| Admin email change | (UI op by Vadim) | vadim@azarean.com → jaike077@yandex.ru через AdminPanel → Pencil. full_name → "Вадим Superadmin". Audit log записал `email_changed_to: jaike077@yandex.ru`. |
| Login logo fix | `f08d9e3` | Огромный logo_az.png в Login.module.css → constrained clamp(80px, 18vw, 120px). |
| Modal close-on-drag v1 | `663c6af` | Hook + 15 модалок в 9 файлах (components/* + Admin/* + Exercises ExerciseModal). +4 hook unit tests. |
| Modal close-on-drag v2 | `76a247f` | 3 пропущенных string-literal className (PatientModal, PhotoViewerModal, ExerciseViewModal) + Rules of Hooks fix для 4 модалок с early return (ConfirmModal, TemplateSelector, TemplateViewModal, PatientModal). |
| Modal close-on-drag v3 | `790757f` | 6 page-level модалок (Patients × 2 add+complexes, Diagnoses × 2, MyComplexes, CreateComplex). |
| Modal close-on-drag v4 | `ea03913` | DeleteConfirmModal (Exercises) + **lint script `npm run lint:modals`** + CI gate в deploy.yml + CLAUDE.md docs. |
| Debug logs | `8256cd6` | **Debug commit** для диагностики «hook не работает» — CI build silently failed на DeleteTemplateModal Rules of Hooks → Deploy skipped → Vadim видел stale bundle. |
| DeleteTemplateModal hook fix | `4291e3b` | Hook ВЫШЕ early return как в v2. Build снова прошёл. |
| Cleanup + SW bump | `7cb4022` | Убрал debug logs из hook (он реально работает — доказано console logs от Vadim'а) + SW bump v6 → v7 для auto-cleanup stale cache. |

---

## Что в проде сейчас

| | |
|---|---|
| URL | https://my.azarean.ru |
| Main HEAD | `7cb4022` (или последний bug-fix commit cleanup) |
| Bundle | `main.a265fe3f.js` (Last-Modified 2026-05-26 08:02) |
| SW | azarean-v7 |
| Admin login | `jaike077@yandex.ru` / `Test1234` |
| Test patient | id=12 `avi707@mail.ru` / `Test1234` (anchored, не удалять) |
| Tests | backend 598/598 ✓, frontend 342/342 ✓ |
| Lint modals | clean (112 files / 5 whitelisted / 0 violations) |

---

## Memory updates в этой сессии

Новые memory files:
- [prod_test_patient_anchored.md](.claude/projects/c--Users-------Desktop-Azarean-rehab/memory/prod_test_patient_anchored.md) — id=12 anchor + UPDATE 2026-05-25 про cleanup
- [prod_admin_credentials.md](.claude/projects/c--Users-------Desktop-Azarean-rehab/memory/prod_admin_credentials.md) — новый email + механизм смены
- [bug_dark_theme_not_working.md](.claude/projects/c--Users-------Desktop-Azarean-rehab/memory/bug_dark_theme_not_working.md) — backlog для будущей сессии
- [modal_overlay_close_hook.md](.claude/projects/c--Users-------Desktop-Azarean-rehab/memory/modal_overlay_close_hook.md) — архитектура hook + pattern для новых модалок
- [feedback_gh_run_watch_misleading.md](.claude/projects/c--Users-------Desktop-Azarean-rehab/memory/feedback_gh_run_watch_misleading.md) — verify per-job, не exit code
- [feedback_sw_cache_bump_required.md](.claude/projects/c--Users-------Desktop-Azarean-rehab/memory/feedback_sw_cache_bump_required.md) — bump CACHE_NAME при UI deploy
- [feedback_eslint_rules_only_in_build.md](.claude/projects/c--Users-------Desktop-Azarean-rehab/memory/feedback_eslint_rules_only_in_build.md) — Rules of Hooks ловится в build, не в jest

CLAUDE.md обновлён: prod admin email секции + новый entry в «Завершённые исправления» (entry #70).

---

## Backlog для следующей сессии

### Cosmetic / UX
- **Dark theme не работает** — Vadim подтвердил в local smoke 2026-05-22. См. [bug_dark_theme_not_working.md](.claude/projects/c--Users-------Desktop-Azarean-rehab/memory/bug_dark_theme_not_working.md). Не блокер pilot, нужен dedicated session.
- HF#13 cosmetic: PhotoViewerModal close X невидим (Esc работает) — Wave 2 closure backlog.
- `program_types.label='ПКС реабилитация'` в БД → миграция на «ПКС восстановление».
- HomeScreen footer link с «Записать сейчас» уже OK после Wave 3 backlog cleanup.

### Backend gaps
- 404 `/api/rehab/my/exercises` — endpoint не имплементирован полностью?
- 401 `/api/rehab/my/stuck-status` для свежего пациента — норма или баг?
- `POST /programs` не ставит `status='active'` по умолчанию (workaround в Phase 8 prod smoke 2026-05-22).

### Architecture / process
- **Pilot аккаунты создать**: Татьяна + Алёна как `users` с role `instructor` или `admin`. Анонсу был draft в [ANNOUNCE_DRAFT_2026-05-22.md](ANNOUNCE_DRAFT_2026-05-22.md).
- Ops Alerts admin UI — Wave 2.04 backend есть, frontend нет (scope decision).
- Node.js 20 deprecation в GitHub Actions runners — deadline 2026-09-16.
- CSS Modules orphan audit раз в волну (правило в memory).

### Process improvements (после lessons этой сессии)
- **Caretake `gh run watch`**: всегда дополнять `gh run view <id> --json jobs` (уже в feedback memory). Можно автоматизировать через wrapper script.
- **SW bump в каждый significant UI deploy** (уже в feedback memory). Можно добавить pre-commit hook что проверяет sw.js при frontend changes.
- **`npm run build` локально перед UI push'ем** (уже в feedback memory).

---

## Команды для нового чата — старт

```bash
# 1. Где я
cd "c:/Users/Вадим/Desktop/Azarean_rehab"
git rev-parse --abbrev-ref HEAD       # main
git log --oneline -10                 # должно начинаться с 7cb4022

# 2. Production live check
curl -fsSL -o /dev/null -w "HTTPS: %{http_code}\n" https://my.azarean.ru
curl -fsSL -o /dev/null -w "API: %{http_code}\n" "https://my.azarean.ru/api/rehab/phases?type=acl"
# Expected: HTTPS 200, API 200

# 3. Bundle check (правильный prod код задеплоен?)
curl -sI "https://my.azarean.ru$(curl -fsSL https://my.azarean.ru/ | grep -oE '/static/js/main\.[a-z0-9]+\.js' | head -1)" | grep -i last-modified

# 4. Lint guard работает?
cd frontend && npm run lint:modals    # должно: 112 files / 5 whitelisted / 0 violations
```

---

## Lessons learned 2026-05-26 (для нового чата)

1. **Auto mode classifier правильно блокирует prod actions** — SSH в prod, bulk DELETE — требуют explicit user authorization. Это **правильное поведение**, не пытаться обходить.

2. **Cache invalidation сложнее чем кажется** — SW v6 держал stale chunks 3 итерации модальных фиксов. Каждый significant UI deploy → bump SW. На пилотах нельзя полагаться на «пользователь сам Ctrl+Shift+R».

3. **gh CLI exit codes врут на multi-job runs** — `gh run watch <id> --exit-status` returned 0 при failed Build job. Per-job check через `gh run view <id> --json jobs` обязателен.

4. **ESLint rules в jest ≠ ESLint rules в build** — `react-hooks/rules-of-hooks` срабатывает только в build. Locally: `CI=false npm run build` перед push'ем UI с hooks.

5. **Discovery patterns должны быть multi-faceted** — мой regex `className={...overlay...}` нашёл только JSX expressions, пропустил string-literal `className="pd-modal-overlay"`. Нужно несколько разных patterns + `role="dialog"` / `aria-modal` как надёжный маркер.

---

**Конец handoff'а.** Pilot prep batch закрыт 🎉. Следующая сессия: либо Vadim создаёт аккаунты Татьяны/Алёны и они тестят, либо новые задачи. Backlog для Wave 3 в CLAUDE.md секции «Backlog для Wave 3 / Wave 2.5 hot-fixes».
