# TZ Wave 3 — C5.3: Панель «Динамика» (3 оси раздельно)

**Ветка:** `wave-3/owner-command-center`, продолжаем от tip **`791a2ba`** (C5.2).
Цепочка базы: `aedadc6 (C4) → b5d59c7 (revert) → 495a6cd (C5.1) → 791a2ba (C5.2)`.
**Тип:** frontend под-чекпойнт (3 из 4). **Исполнитель:** Claude Code.
**Зависимости в репо:** `WAVE_3_COMMAND_CENTER_API_CONTRACT.md`, `MEMORY_RULES.md`.
**DoD:** панель «Динамика» питается `/dynamics`; 3 оси (боль / приверженность / фазы) показаны **раздельно**, не сводятся в один балл; `insufficient_data` — честная корзина; `overtraining_candidates` — отдельный warning-бейдж; смена периода рефетчит; honest empty при `cohort=0`. Инструкторы остаются заглушкой (C5.4). STOP с отчётом.

---

## 0. Verify-step — правила (architect signature)

Написано по контракту + recon, не из памяти. Правила (MEMORY_RULES §9 + §3/§5):
- **§9 Динамика (дословно):** три оси показывать **РАЗДЕЛЬНО** — НЕ схлопывать в один индикатор. `insufficient_data` — честная корзина (НЕ прятать в stable). `conflicts.overtraining_candidates` — **first-class сигнал, additive**, отдельным бейджем, НЕ вычитается из осей. На пилоте первые ~2 недели боль = преимущественно `insufficient_data` — это ожидаемо, UI не должен выглядеть сломанным.
- **Rule #34 (anti-175%)** на фронте: **клиент НЕ агрегирует и НЕ сверяет инварианты.** Сумма корзин каждой оси == `cohort` и `on_track+stalled == cohort` — гарантия бэкенда; фронт просто рисует отданные числа. Никакой арифметики поверх payload (в C5.3 display-процентов нет вовсе).
- **Контракт — период:** `/dynamics` — окно тренда, **период-зависим** → рефетч при смене периода.
- **Rule #20** (§3): CSS Modules camelCase; smoke в браузере обязателен.
- **Rule #25** (§5): fetch в `useCallback([period])`, `useEffect([loadDynamics])`.
- **JSDOM-урок (C5.2):** маппинги цвет/иконка/значение — **named-export pure function**; inline-style с CSS-переменными в JSDOM через `style.X`/`getAttribute('style')` НЕ ассертится. Тестировать через функцию + через текст/счётчики, не через цвет dot'а.
- **CLAUDE.md:** lucide-react только; комментарии на русском.

---

## 1. ТОЧНЫЕ поля payload (из контракта — НЕ угадывать)

### `GET /api/admin/command-center/dynamics?period=` → после unwrap `response.data`:
```
period                              (string)
window_days                         (number)
instructor_id                       (number|null)
cohort                              (number)   ← пациенты с активной программой
pain.improving                      (number)
pain.stable                         (number)
pain.worsening                      (number)
pain.insufficient_data              (number)
adherence.improving                 (number)
adherence.stable                    (number)
adherence.worsening                 (number)
adherence.insufficient_data         (number)
phase.on_track                      (number)
phase.stalled                       (number)
conflicts.overtraining_candidates   (number)
```
Инварианты (гарантия бэкенда, фронт НЕ проверяет): сумма корзин каждой оси (вкл. `insufficient_data`) == `cohort`; `phase.on_track + phase.stalled == cohort`.
Ответ = `{ data: { ... } }` → после интерсептора `response.data` = объект выше.

---

## 2. Семантика осей — КРИТИЧНО (направления противоположны)

⚠️ У **боли** и **приверженности** «улучшение» означает движение в РАЗНЫЕ стороны — НЕ копипастить иконки между осями:

**Ось «Боль»** (боль падает = хорошо):
- `improving` → иконка `TrendingDown`, цвет `var(--color-success)` (боль снижается)
- `stable` → `Minus`, `var(--color-text-muted)`
- `worsening` → `TrendingUp`, `var(--color-danger)` (боль растёт)
- `insufficient_data` → отдельная честная строка, `var(--color-text-muted)`

**Ось «Приверженность»** (активность растёт = хорошо):
- `improving` → иконка `TrendingUp`, цвет `var(--color-success)`
- `stable` → `Minus`, `var(--color-text-muted)`
- `worsening` → `TrendingDown`, `var(--color-danger)`
- `insufficient_data` → отдельная честная строка

**Ось «Фазы»** (current-state, НЕ ↗→↘):
- `on_track` → `var(--color-success)`
- `stalled` → `var(--color-warning)`
- отдельная строка/пара, без улучшение/ухудшение.

---

## 3. Файлы

### 3.1 `frontend/src/pages/CommandCenter/DynamicsPanel.js` (новый)
Пропсы: `{ period }`.
- Импорты: `useState, useCallback, useEffect`, lucide `TrendingUp, TrendingDown, Minus, AlertTriangle, RefreshCw`, `admin` из services, `plural`, `s`.
- **Свой fetch** (по образцу AttentionPanel, но период-зависим): `loadDynamics` в `useCallback([period])`: `const r = await admin.commandCenter.getDynamics({ period }); setData(r.data || null)`. `useEffect([loadDynamics])`. Стейт `data`, `loading`, `error`.
- **Pure-function маппинги (named export, для JSDOM-тестируемости):**
  ```js
  export function painTrendMeta(key) { /* key∈improving/stable/worsening → {Icon, color, label} */ }
  export function adherenceTrendMeta(key) { /* противоположные иконки */ }
  ```
  (либо один маппинг с флагом оси — но направления должны различаться; экспортировать named для теста).
- Заголовок: «Динамика» + контекст «когорта: {cohort} {plural(cohort,['пациент','пациента','пациентов'])} с активной программой».
- **Overtraining-бейдж (отдельно, additive):** если `data.conflicts.overtraining_candidates > 0` — бейдж рядом с заголовком: `<AlertTriangle/>` + «возможный перетрен: N» (`var(--color-warning)` / `--color-warning-bg`). Если 0 — **не показывать**.
- **3 мини-блока осей** (РАЗДЕЛЬНО, в ряд или столбцом):
  - блок «Боль»: improving/stable/worsening с иконкой+цветом из `painTrendMeta` + число; ниже — `insufficient_data` строкой «недостаточно данных: N». Микрокопия под осью боли: «боль начнём оценивать после ~2 недель записей дневника».
  - блок «Приверженность»: то же из `adherenceTrendMeta`; своя строка `insufficient_data`.
  - блок «Фазы»: `on_track` / `stalled` как пара (success / warning), без стрелок.
- **insufficient_data — честно:** всегда показывать число, НЕ прятать в stable, НЕ скрывать при 0 (можно скрыть строку только если 0 — но НЕ сливать в stable). Решение: если `insufficient_data > 0` — отдельная заметная строка; если 0 — строку можно опустить.
- **Empty** (`data.cohort === 0`): «Пока некого анализировать — нет активных программ».
- **Error**: текст + «Повторить» (`RefreshCw`) → рефетч панели.
- **Loading**: skeleton-блоки (`s.skelRow`, переиспользовать из C5.2).

### 3.2 `frontend/src/pages/CommandCenter/DynamicsPanel.test.js` (новый)
- `painTrendMeta` / `adherenceTrendMeta` как pure functions: improving у боли → TrendingDown/success, у приверженности → TrendingUp/success; worsening наоборот (по 2-3 кейса на каждую).
- Рендер из мок-data: 3 блока присутствуют, `insufficient_data` показан числом (по тексту «недостаточно данных»), overtraining-бейдж появляется при `>0` и скрыт при `0`, empty при `cohort:0`.
- НЕ ассертить цвет dot'а через inline-style (JSDOM-урок) — проверять через named-функцию + текст.

### 3.3 `frontend/src/pages/CommandCenter/CommandCenter.js` (правка)
- Заменить заглушку «Динамика» на `<DynamicsPanel period={period} />`. Порядок неизменен: Attention → Funnel → Segments → **Dynamics** → (Instructors stub).
- Инструкторы-заглушку НЕ трогать (C5.4).

### 3.4 `frontend/src/pages/CommandCenter/CommandCenter.module.css` (дополнить)
Новые camelCase-классы на токенах: `.dynamicsGrid`, `.axisBlock`, `.axisTitle`, `.trendRow`, `.trendIcon`, `.trendCount`, `.insufficientRow`, `.axisHint` (`color: var(--color-text-muted); font-size:12px`), `.phasePair`, `.phaseChip`, `.overtrainBadge` (`background: var(--color-warning-bg); color: var(--color-warning); border-radius: var(--radius-full)`), `.cohortNote`. Цвета осей — через CSS-переменные (inline-style или классы-модификаторы), тёмная тема подхватит автоматически.

---

## 4. Verify-step (приложить вывод)
```bash
grep -rn "getDynamics" frontend/src/pages/CommandCenter/
grep -rn "insufficient_data\|overtraining_candidates\|cohort" frontend/src/pages/CommandCenter/DynamicsPanel.js
grep -rn "painTrendMeta\|adherenceTrendMeta" frontend/src/pages/CommandCenter/   # named exports для JSDOM-теста
grep -rn "TrendingUp\|TrendingDown\|Minus" frontend/src/pages/CommandCenter/DynamicsPanel.js
grep -rEn 'className=["\x27]\w+(-\w+)+["\x27]' frontend/src/pages/CommandCenter/   # 0 kebab-orphans (Rule #20)
npm run lint:modals --prefix frontend
cd frontend && CI=true npm test -- --watchAll=false
```

## 5. Тестовый чек-лист C5.3
- [ ] Unit: `painTrendMeta` improving→TrendingDown/success, worsening→TrendingUp/danger; `adherenceTrendMeta` improving→TrendingUp/success, worsening→TrendingDown/danger (направления различаются).
- [ ] Unit: рендер 3 блоков; `insufficient_data` виден числом; overtraining-бейдж при `>0`, скрыт при `0`; empty при `cohort:0`.
- [ ] Цвет dot'а НЕ ассертится через inline-style (JSDOM-урок) — только через функцию/текст.
- [ ] Существующие тесты не сломаны.
- [ ] Smoke (`npm start`, реальный браузер, Rule #20): на dev (cohort=2) —
  - [ ] боль = «недостаточно данных: 2» с пояснением (не выглядит сломанным).
  - [ ] приверженность показывает improving/worsening честно (например worsening: 2).
  - [ ] фазы on_track/stalled парой.
  - [ ] overtraining-бейдж скрыт при 0.
  - [ ] три оси визуально РАЗДЕЛЬНЫ, не один балл.
  - [ ] смена периода 30d→7d→all рефетчит динамику (числа/окно меняются).
  - [ ] тёмная тема: success/danger/warning читаемы.

## 6. Что НЕ делаем в C5.3
- НЕ сводим оси в общий индикатор (§9 запрещает).
- НЕ прячем `insufficient_data` в stable.
- НЕ вычитаем `overtraining_candidates` из осей (additive).
- НЕ сверяем инварианты сумм на клиенте (Rule #34).
- НЕ трогаем Instructors-заглушку (C5.4), Attention/Funnel/Segments (C5.2), instructor welcome, ExerciseRunner.

---

### 🛑 STOP C5.3
Commit-отчёт: tip SHA + verify-grep + дельта тестов + drift'ы. Жду перед `TZ_WAVE_3_C5_4_*.md` (Инструкторы: таблица + модалка `/attention?instructor_id` + inline-переназначение `PATCH`, z-index 9000, NO modal-on-modal).

---

*C5.3 TZ. Architect: Claude Opus 4.7, 2026-05-26. Ветка `wave-3/owner-command-center` от `791a2ba`. Поля — из WAVE_3_COMMAND_CENTER_API_CONTRACT.md §4. Per-checkpoint STOP, NO batching.*
