# TZ Wave 3 — C5.2: Панели «Требует внимания» + «Воронка» + «Сегменты»

**Ветка:** `wave-3/owner-command-center`, продолжаем от tip **`495a6cd`** (C5.1).
Цепочка базы: `aedadc6 (C4) → b5d59c7 (revert 980a7f5) → 495a6cd (C5.1 shell)`.
**Тип:** frontend под-чекпойнт (2 из 4). **Исполнитель:** Claude Code.
**Зависимости в репо:** `WAVE_3_COMMAND_CENTER_API_CONTRACT.md` (**обязателен** — C5.2 потребляет payload), `MEMORY_RULES.md`.
**DoD:** «Требует внимания», «Воронка», «Сегменты» питаются реальными данными `/attention` + `/command-center`; per-panel loading/error/empty; honest empty-states; смена периода рефетчит `/command-center`. Динамика и Инструкторы остаются заглушками (C5.3/C5.4). STOP с отчётом.

---

## 0. Verify-step — правила (architect signature)

Написано по контракту (реальные snake_case ключи) + recon, не из памяти. Правила (MEMORY_RULES):
- **Rule #20** (§3): CSS Modules camelCase; smoke в реальном браузере обязателен (токены/тёмная тема юнит-тестами не ловятся).
- **Rule #25** (§5): `useEffect` deps без context-функций → обернуть fetch в `useCallback`.
- **Rule #34 (anti-175%)** на фронте: **клиент НЕ агрегирует payload.** Числа берём как пришли. Единственная арифметика — ширина бара воронки `count / Math.max(funnel.created, 1)` (display-only, guard на 0). НЕ суммировать сегменты, НЕ сверять инварианты на клиенте.
- **§9 каноны:** funnel/сегменты семантика зашита в бэкенде; фронт только рисует. `funnel_gaps.registered_no_active_program` — **сигнал недоделанного онбординга** (amber), не просто число. `segments_note.no_target_set` — программы без cadence (сноска, не штраф).
- **Контракт — период:** этапы воронки 1–4 и сегменты = current-state (от периода не зависят). `funnel.adhering` = adherence-based → меняется с периодом. Поэтому смена периода рефетчит `/command-center`. `/attention` от периода не зависит — грузится один раз.
- **CLAUDE.md:** lucide-react только; комментарии на русском; не выдумывать роуты (`/patients/:id` НЕТ → клик ведёт на `/patients`).

---

## 1. ТОЧНЫЕ поля payload (из контракта — НЕ угадывать)

### `GET /api/admin/command-center` → после unwrap `response.data`:
```
period                                  (string)
adherence_window_days                   (number)
instructor_id                           (number|null)
funnel.created                          (number)
funnel.registered                       (number)
funnel.active_program                   (number)
funnel.active                           (number)
funnel.adhering                         (number)
funnel_gaps.registered_no_active_program (number)
segments.active                         (number)
segments.at_risk                        (number)
segments.dormant                        (number)
segments.churned                        (number)
segments_note.no_target_set             (number)
```
Монотонность: `created ≥ registered ≥ active_program ≥ active ≥ adhering` (гарантия бэкенда, фронт не проверяет).

### `GET /api/admin/command-center/attention` → после unwrap `response.data`:
```
items[]                                 (array)
items[].kind                            ('phase_stuck' | 'pain_red_flag')
items[].patient_id                      (number)
items[].patient_name                    (string)
items[].instructor_id                   (number)
items[].instructor_name                 (string)
items[].severity                        ('low'|'medium'|'high'|'critical')
items[].summary                         (string)   ← уже человекочитаемый, рендерить как есть
items[].created_at                      (ISO string)
total                                   (number)
```
⚠️ **Важно про unwrap:** ответ = `{ data: { items, total } }`. После интерсептора `response.data = { items, total }` (объект, НЕ массив). Читать **`r.data.items`** и **`r.data.total`** (total ВНУТРИ data, не в meta — это не list-envelope). `r.data.items` может быть `[]`. Сорт уже сделан бэкендом (severity DESC → created_at DESC) — **НЕ пересортировывать.**
Параметры: `?limit=` (default 50), `?severity=` (не используем в C5.2).

---

## 2. Архитектура fetch (C5.2)

- **`CommandCenter.js` владеет fetch `/command-center`** (период-зависим). Стейт: `summary`, `summaryLoading`, `summaryError`. Fetch в `useCallback([period])`, `useEffect([loadSummary])`. Результат (`summary`, loading, error, retry-функция) пробрасывается пропсами в `<FunnelPanel>` и `<SegmentsPanel>` — **один fetch на обе панели**.
- **`AttentionPanel` владеет своим fetch `/attention`** (mount-once, период не нужен). Свой стейт/loading/error/retry внутри компонента.
- Динамика и Инструкторы в C5.2 — остаются заглушками `—`.

---

## 3. Файлы

### 3.1 `frontend/src/pages/CommandCenter/AttentionPanel.js` (новый)
- `useNavigate`, `useCallback`, lucide `AlertTriangle, ChevronRight, RefreshCw`.
- Fetch: `admin.commandCenter.getAttention({ limit: 50 })` → `setItems(r.data.items || [])`, `setTotal(r.data.total ?? 0)`. Обернуть в `useCallback([])`, вызвать в `useEffect`.
- Заголовок: «Требует внимания» + бейдж `{total}` если `total > 0`.
- Строка (на каждый `items[]`):
  - dot цвета `severityColor(item.severity)`:
    `critical|high → var(--color-danger)`, `medium → var(--color-warning)`, `low → var(--color-text-muted)`.
  - `item.summary` (как есть).
  - мета: «{item.patient_name} · {item.instructor_name} · {дата}», дата = `new Date(item.created_at).toLocaleDateString('ru-RU')`.
  - `<ChevronRight/>` справа.
  - клик по строке → `navigate('/patients')` (deep-link к пациенту невозможен — нет роута `/patients/:id`; ограничение задокументировано).
- **Empty** (`items.length === 0`): «Нет сигналов, требующих внимания» + приглушённая `AlertTriangle`. Спокойный тон, НЕ тревожный, НЕ «загрузка».
- **Error**: текст ошибки + кнопка «Повторить» (`RefreshCw`) → рефетч только этой панели.
- **Loading**: 3 серые строки-плейсхолдеры (`s.skelRow`).

### 3.2 `frontend/src/pages/CommandCenter/FunnelPanel.js` (новый)
Пропсы: `{ summary, loading, error, onRetry }`.
- 5 стадий по порядку с подписями:
  `created→«Заведён»`, `registered→«Зарегистрирован»`, `active_program→«Активная программа»`, `active→«Активен»`, `adhering→«Соблюдает»`.
- Рендер: 5 горизонтальных баров. Ширина бара = `${Math.round(100 * count / Math.max(summary.funnel.created, 1))}%` (display-only, guard на 0). На баре — число + label.
- **Gap-callout:** если `summary.funnel_gaps.registered_no_active_program > 0` — amber-плашка под воронкой:
  «Зарегистрированы без активной программы: N» (`background: var(--color-warning-bg); color: var(--color-warning)`), N + `plural(N,['пациент','пациента','пациентов'])`.
- Подсказка мелким текстом: «этапы 1–4 — текущее состояние; "Соблюдает" зависит от периода».
- **Empty** (`summary.funnel.created === 0`): «Пока нет заведённых пациентов».
- loading/error как у Attention (через пропсы).

### 3.3 `frontend/src/pages/CommandCenter/SegmentsPanel.js` (новый)
Пропсы: `{ summary, loading, error, onRetry }` (тот же объект `/command-center`).
- 4 карточки:
  `active→«Активны»` (`--color-success`), `at_risk→«Под риском»` (`--color-warning`), `dormant→«Спят»` (`--color-text-muted`), `churned→«Отвалились»` (`--color-danger`).
  Каждая = число + label.
- **Сноска:** `summary.segments_note.no_target_set > 0` → мелким текстом «N программ без заданной цели», N + `plural(N,['программа','программы','программ'])`.
- Empty: все нули — показать карточки с 0 честно (не прятать).

### 3.4 `frontend/src/pages/CommandCenter/CommandCenter.js` (правка)
- Добавить fetch `/command-center` (см. §2): `loadSummary` в `useCallback([period])`, `useEffect([loadSummary])`.
- Заменить 3 из 5 заглушек на реальные `<AttentionPanel/>`, `<FunnelPanel summary=.. loading=.. error=.. onRetry=../>`, `<SegmentsPanel .../>`. Порядок неизменен: Attention → Funnel → Segments → (Dynamics stub) → (Instructors stub).

### 3.5 `frontend/src/pages/CommandCenter/CommandCenter.module.css` (дополнить)
Новые классы (camelCase, на токенах): `.attentionRow` (+ hover), `.sevDot`, `.attnMeta` (`color: var(--color-text-muted)`), `.attnEmpty`, `.skelRow`, `.panelError`, `.retryBtn`, `.funnelBar`, `.funnelTrack`, `.funnelFill`, `.funnelLabel`, `.gapCallout`, `.segGrid`, `.segCard`, `.segValue`, `.segLabel`, `.segNote`, `.panelHint`. Семантические цвета — через CSS-переменные в inline-style для динамики (`style={{ background: severityColor(sev) }}`) ИЛИ через классы-модификаторы — на усмотрение, но цвета только из токенов.

> Динамика/Инструкторы заглушки в `CommandCenter.js` НЕ трогаем (C5.3/C5.4).

---

## 4. Verify-step (приложить вывод)
```bash
grep -rn "getAttention\|getSummary" frontend/src/pages/CommandCenter/
grep -rn "r.data.items\|r.data.total\|\.data\.items\|\.data\.total" frontend/src/pages/CommandCenter/AttentionPanel.js
grep -rn "registered_no_active_program" frontend/src/pages/CommandCenter/FunnelPanel.js
grep -rn "no_target_set" frontend/src/pages/CommandCenter/SegmentsPanel.js
grep -rn "navigate('/patients')" frontend/src/pages/CommandCenter/AttentionPanel.js
grep -rEn 'className=["\x27]\w+(-\w+)+["\x27]' frontend/src/pages/CommandCenter/   # 0 kebab-orphans (Rule #20)
npm run lint:modals --prefix frontend
cd frontend && CI=true npm test -- --watchAll=false
```

## 5. Тестовый чек-лист C5.2
- [ ] Unit: AttentionPanel — рендер списка из мок-`{items,total}`, empty при `items:[]`, severity→цвет, клик→navigate('/patients') (мок useNavigate).
- [ ] Unit: FunnelPanel — 5 стадий, gap-callout появляется при `registered_no_active_program>0` и скрыт при 0, empty при `created:0`.
- [ ] Unit: SegmentsPanel — 4 карточки, сноска no_target_set при >0.
- [ ] Существующие тесты не сломаны.
- [ ] Smoke (`npm start`, реальный браузер, Rule #20): на dev (2 пациента) —
  - [ ] «Требует внимания» показывает реальные phase_stuck/pain_red_flag ИЛИ honest empty.
  - [ ] Воронка с числами; amber-callout если есть registered-без-программы.
  - [ ] Сегменты с нулями честно; сноска про no_target_set если есть.
  - [ ] Смена периода 30d→7d→all не роняет панели, воронка/сегменты не «прыгают» (current-state), «Соблюдает» может измениться.
  - [ ] Падение одного запроса (заглушить URL в devtools) → только его панель в error+retry, остальные живы.
  - [ ] Тёмная тема: severity-dot, amber-callout, карточки читаемы.

## 6. Что НЕ делаем в C5.2
- НЕ трогаем Dynamics/Instructors заглушки (C5.3/C5.4).
- НЕ пересортировываем `/attention` (бэкенд отдаёт отсортированным).
- НЕ агрегируем/не сверяем инварианты сегментов на клиенте (Rule #34).
- НЕ создаём drill-down по сегментам/воронке (post-pilot).
- НЕ создаём роут `/patients/:id`.

---

### 🛑 STOP C5.2
Commit-отчёт: tip SHA + verify-grep + дельта тестов + drift'ы. Жду перед `TZ_WAVE_3_C5_3_*.md` (Динамика — там 3 оси + `insufficient_data` + `overtraining_candidates`).

---

*C5.2 TZ. Architect: Claude Opus 4.7, 2026-05-26. Ветка `wave-3/owner-command-center` от `495a6cd`. Поля — из WAVE_3_COMMAND_CENTER_API_CONTRACT.md. Per-checkpoint STOP, NO batching.*
