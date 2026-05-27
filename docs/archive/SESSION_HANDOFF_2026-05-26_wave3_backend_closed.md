# Azarean Rehab — Session Handoff 2026-05-26 (Wave 3 command-center backend closed → C5 frontend next)

**Для:** новый архитекторский чат (Claude Opus 4.7, claude.ai).
**Готовность:** project files (`/mnt/project/`) + userMemories. Этот документ — orientation map + первая задача.

---

## 🟢 ПЕРВАЯ ЗАДАЧА (до всего остального) — сверить project files

Vadim перезалил `MEMORY_RULES.md` и `CLAUDE.md`. Прошлый чат видел **устаревший** CLAUDE.md и не мог проверить свежие (project files грузятся на старте — mid-chat перезалив не виден). Поэтому новый чат должен СНАЧАЛА:

1. `view /mnt/project/CLAUDE.md` — убедиться, что это **актуальная** версия, НЕ stale. Маркеры stale (если увидишь — старая копия осталась, скажи Vadim удалить):
   - заголовок «Текущее состояние (**апрель 2026**)»
   - «ExerciseRunner **v3**» (актуально — v4 LOCKED)
   - «**308 тестов**» / «152 backend + 156 frontend» (актуально — ~789+ после Wave 3)
   - «Деплой на VDS — **планируется**, конфликт субдоменов» (актуально — Wave 2 LIVE на my.azarean.ru с 2026-05-22)
   - «**20 таблиц, 16 миграций**» (актуально — ~45 таблиц / 35+ миграций)
2. Cross-check нового CLAUDE.md против `MEMORY_RULES.md` Section 9 + Section 8 — сходится ли (45 таблиц, command-center endpoints, Wave 2 done). Любую оставшуюся stale-инфу — флагнуть Vadim.
3. `view /mnt/project/MEMORY_RULES.md` — подтвердить, что это версия **2026-05-26** (есть **Section 9** «Wave 3 — Owner command center», Rule #34 dimension discipline, Rule #35 logAudit). Если заголовок «Last updated: 2026-05-19» и нет Section 9 — старая копия, сказать перезалить.
4. Убедиться, что каждого файла по **одной** копии (две = конфликт).

Только после сверки — переходить к C5.

---

## Где мы (state на 2026-05-26)

**Vadim Azarenkov** — co-owner Azarean (Екатеринбург, ACL + shoulder rehab). Workflow: я (architect, этот чат) пишу checkpoint-TZ → Vadim запускает в **Claude Code (VS Code, Windows)** → commit-отчёт → следующий TZ. Per-checkpoint, STOP-маркеры, NO batching (Rule #23).

**Фаза:** Wave 2 LIVE на проде (pilot). Идёт **Wave 3 — Owner command center** (кураторский дашборд: триаж пациентов + надзор за инструкторами). Переделываем убогую главную админки (была: vanity-карточки + сломанный «175% Выполнение»).

### Бэкенд командного центра — CLOSED (C1–C4)

Ветка `wave-3/owner-command-center` от main `3907034`, **tip `aedadc6`**, 7 коммитов, **701 тест зелёных, 36 suites**.

| CP | SHA | Что |
|---|---|---|
| C1 | `1568eeb`+`29d6b47` | миграция `assigned_instructor_id` + cadence на complexes (`target_min/max/unit`) + бэкфилл + reassign endpoint + автозаполнение |
| C2 | `e62f5cc`+`0acc0d4` | `/command-center` (воронка/сегменты/адхеренс) + at_risk-пол + tie-breaker |
| hygiene | `980a7f5` | audit RESOLVE → `{details:{...}}` |
| C3 | `a51b4f2` | `/instructors` + `/attention` (Слой 0) |
| C4 | `aedadc6` | `/dynamics` (3 оси) |

**5 endpoint'ов** (admin-only glob): `/command-center`, `/command-center/instructors`, `/command-center/attention`, `/command-center/dynamics`, `PATCH /patients/:id/assign-instructor`. Полный контракт — в `WAVE_3_COMMAND_CENTER_API_CONTRACT.md` (Vadim приложит/зальёт; это **вход для C5**).

Все определения (активен/соблюдает/динамика, каноны активная-программа/без-ответа/streaks, статус ops_alerts/phase_stuck/criteria) — в **MEMORY_RULES Section 9**. Не переспрашивать Vadim то, что там есть.

---

## NEXT: C5 — фронт командного центра

Это другой тип чекпойнта (frontend). **Порядок:**

1. **Фронт-recon** (read-only, Vadim в Claude Code) — TZ-COMPLIANCE для фронта обязателен, структуру `Dashboard.js` лучше увидеть, чем угадать:
```
RECON C5-front — read-only.
1. Файл главной admin/instructor (Dashboard.js, default-ветка) — cat структуры:
   как рендерит, где activeTab, как гейтит admin-пункты (role==='admin').
2. Admin API service (frontend/src/services/...) — методы, форма вызовов,
   как разворачивается {data}/{meta} интерсептором (axios unwrap).
3. Роутинг: где висит главная, как добавить новый admin-view (отдельный роут
   или вкладка внутри Dashboard).
4. Готовые компоненты таблицы/модалки в admin-части для переиспользования
   (grep Modal/Table в frontend/src/pages/Admin/ или аналог).
5. Дизайн-токены/CSS: глобальный CSS (admin НЕ на CSS Modules?) — как стилизованы
   существующие admin-карточки/таблицы.
```
2. **Я пишу C5 TZ** (контракт вкладываю внутрь; читаю SKILL `frontend-design` перед написанием UI-кода — оно в /mnt/skills).
3. Vadim прогоняет C5 TZ → Claude Code строит фронт → commit-отчёт.

### Три открытых вопроса для C5 (решить с Vadim или recon прояснит)
1. Грузить все панели одним вызовом или по-панельно (loading states)?
2. Источник данных модалки инструктора — фильтр существующих endpoint'ов или новый endpoint?
3. Нужен ли drill-down (клик по сегменту → список пациентов) в этой волне?

---

## Целевой UI (макеты НЕ переносятся — описываю текстом)

В прошлом чате собирали 3 inline-макета (visualizer) — в новый чат они не переедут. Дизайн-интент:

**Главная — слои сверху вниз по срочности:**
1. **Шапка:** «С возвращением, {имя}» (ТОЛЬКО имя, НЕ «Вадим Администратор» — роль отдельным pill). + **селектор периода** 7d / 30d(default) / всё время. Период влияет только на адхеренс/динамику; воронка/сегменты — current-state (UI: подсказать это).
2. **Требует внимания** (`/attention`) — лента red flags + stuck, цветной dot по severity + «пациент · куратор · дата». Топ экрана.
3. **Воронка онбординга** (`/command-center` funnel) — 5 этапов: заведён→зарегистрирован→активная программа→активен→соблюдает. Разрыв `registered_no_active_program` подсветить amber (= недоделанный онбординг инструктора).
4. **Сегменты активности** — 4 карточки: Активны(success)/Под риском(warning)/Спят(secondary)/Отвалились(danger). Сноска `no_target_set` если есть.
5. **Динамика** (`/dynamics`) — 3 оси РАЗДЕЛЬНО (↗/→/↘ боль · приверженность · фазы), НЕ один балл. Отдельный warning-бейдж «перетрен: N» (overtraining_candidates). `insufficient_data` показать честно.
6. **Срез по инструкторам** (`/instructors`) — таблица: Инструктор · Пациентов · Без прогр. · Активны · Под риском · Без ответа · Flags. **Клик по строке → модалка инструктора.**

**Модалка инструктора:** read-only витрина — шапка (аватар, имя, caseload, no_program), strip метрик (активны%, под риском, без ответа, red flags), список «требует внимания» его пациентов (dot + причина + «...» кебаб). **Правила: НЕ modal-on-modal; клик по пациенту уводит в его профиль; «...» = быстрые действия вкл. переназначить (`PATCH`).**

**Что выкинуто со старой главной:** vanity-карточки (239 упражнений, сырой счётчик комплексов, «175%»), дубль переключателя темы, текст-заглушка «выберите раздел». **Грамматика:** склонения («1 пациент», не «1 пациентов»).

**Конвенции фронта:** admin-фронт = общий `Dashboard.js` (gated role==='admin'), глобальный CSS (НЕ Modules в admin-части — проверить recon'ом), **lucide-react только, без эмодзи**, спокойная палитра (indigo/blue, светлый фон, скруглённые карточки), семантические цвета. SKILL `frontend-design` перед написанием.

**Реальность пилота:** на dev 2 пациента, пилот не начат → дашборд будет разрежённым, ось боли = `insufficient_data` первые ~2 недели. **UI обязан иметь honest empty-states**, не «вечная загрузка» и не выглядеть сломанным.

---

## Pending side-tasks (не блокируют C5)

- **logAudit grep-sweep** — Vadim взял (отдельный коммит): `grep -rn "logAudit" backend/` на flat-keys / отсутствие `details:`-обёртки (Rule #35). Спросить статус.
- **Репо-`CLAUDE.md` refresh** — опционально, отдельной задачей через Claude Code (тот, что Claude Code авто-читает в репо; ≠ project-file CLAUDE.md). Только always-on факты, не определения командного центра. Обсуждалось, Vadim решит когда.
- После всей волны: C6 (RBAC — instructor видит только свою группу; сейчас всё admin-only).

---

## Стоячие напоминалки (workflow)

- **Rule #21** — декларация = tool call в том же turn. Vadim чувствителен.
- **TZ-COMPLIANCE** — читать живой источник / recon ДО написания, не угадывать. Для агрегатов — особенно (класс бага 175% жил в ненагрунтованной SQL). Для фронта — recon структуры компонентов.
- **Rule #34** — дисциплина размерностей: сессия = `COUNT(DISTINCT session_id)`, никогда `COUNT(rows)`, не миксовать. Каждый агрегат → regression-тест.
- **Rule #23** — per-checkpoint, STOP, NO batching. Жду commit-отчёт (tip SHA + verify + дельта тестов + drift'ы) перед следующим CP.
- **Durable rule → MEMORY_RULES.md артефакт** (Vadim перезаливает), НЕ в memory.
- Pattern B / pilot posture / калибровочные пороги под data — MEMORY_RULES Section 7.

---

## Файлы этой сессии (в `/mnt/user-data/outputs/`, Vadim управляет project files)

| Файл | Назначение |
|---|---|
| `MEMORY_RULES.md` | durable rules v2026-05-26 → **в project files (заменить старый)** |
| `WAVE_3_COMMAND_CENTER_API_CONTRACT.md` | вход для C5 → приложить/залить к C5 kickoff |
| `TZ_WAVE_3_C1..C4_*.md` | исполненные TZ (архив, в репо уже сделано) |
| `SESSION_HANDOFF_2026-05-26_*.md` | этот файл |

---

*Generated 2026-05-26 by Claude Opus 4.7. Session: Wave 3 command-center backend C1–C4 (execution + reports) → closed → MEMORY_RULES regen + API contract. Next: C5 frontend. Backend tip `aedadc6`, 701 tests.*
