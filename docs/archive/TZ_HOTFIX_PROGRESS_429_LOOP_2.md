# TZ Hot-fix — bug #16: POST /api/progress 429 loop (блокер пилота)

**Ветка:** новая `hotfix/progress-429-loop` от `main` tip `db64dc8` (Wave 3 LIVE). Pre-existing баг, НЕ Wave 3 regression.
**Тип:** hot-fix, **двухчастный**: Part A — диагностика (read-only, STOP) → Part B — фикс по подтверждённой причине.
**Исполнитель:** Claude Code. **Приоритет:** P0 — пациент не может завершить тренировку на проде.

> ⚠️ **Почему диагностика-first:** причина не подтверждена (5 гипотез в handoff, «нужна верификация»). Фикс **полностью разный** по веткам, и ExerciseRunner **LOCKED** — модифицировать его на догадке нельзя (TZ-COMPLIANCE / drift #33 + правило LOCKED). Part B не выполнять, пока Part A не подтвердил причину и архитектор не выбрал ветку.

---

## 0. Verify-step — правила (architect signature)

- **TZ-COMPLIANCE / drift #33:** не угадывать фикс. Сначала прочитать живой код (call site, handler, interceptor, limiter) + воспроизвести на dev. Только потом — фикс.
- **ExerciseRunner LOCKED** (CLAUDE.md): flow / CSS / RPE zones / pain slider / timer / анимации — НЕ трогать. Разблокировка — только если Part A докажет, что фикс именно в submit-логике ExerciseRunner, и только для submit-логики (НЕ для locked design-поверхности). Vadim в handoff предварительно признал разблокировку обоснованной — но **узко** и **после диагностики**.
- **Rate limiting OFF в dev** (CLAUDE.md bug #1, by design): на dev 429 НЕ будет — диагностика идёт по **счётчику POST'ов в Network**, не по ответу 429. 429 воспроизводится только на проде/при NODE_ENV=production.
- **Bug fix ≠ рефакторинг соседнего** (CLAUDE.md): фикс минимальный, без попутной чистки.
- **Анти-петля без `success:true`**, lucide-only, комментарии на русском.

---

# PART A — ДИАГНОСТИКА (read-only, ничего не правим)

Цель: однозначно определить, **петля это или батч by-design**, и где именно call site.

### A1. Воспроизведение на dev + захват содержимого POST'ов (ключевой шаг)
- dev up (`npm run dev` + `npm start`), логин пациентом `avi707@mail.ru` / `Test1234` (id=14), **incognito без расширений** (handoff: `safari is not defined` в Console — это browser extension `content.js`, не наш bundle, отфильтровать).
- ExerciseRunner → DevTools Network, фильтр `progress`. Нажать «Выполнено».
- **Зафиксировать ДВА числа и содержимое:**
  - Сколько POST `/api/progress` ушло на ОДНО нажатие?
  - Тело каждого: `exercise_id`, `session_id`, `completed`. **Одинаковый `exercise_id` повторяется N раз → ПЕТЛЯ. Разные `exercise_id` (по числу упражнений в комплексе) → БАТЧ by-design.**
- Это решающий сигнал. Приложить в отчёт: список POST'ов с их `exercise_id`.

### A2. Call site
- `grep -rn "progressPatient.create\|/progress\|progress.create\|api.post('/progress'\|patientApi.post('/progress'" frontend/src/`
- Показать функцию-обработчик целиком (где вызывается POST): это в `ExerciseRunner.js`? в родителе (`PatientDashboard.js`)? в `services/api.js`?

### A3. Guard / двойной вызов
- В обработчике есть `isSubmitting` / `submittingRef` / disable кнопки на время запроса? Или вызов без защиты от повторного входа?
- POST вызывается из `onClick` И из `onSubmit`/`useEffect` одновременно? (`grep` обработчиков на кнопке «Выполнено».)

### A4. Chain-reaction (гипотеза 4)
- После POST success: `setState` → re-render → не вызывает ли это POST повторно? Особенно `useEffect` с deps, куда попадает результат `updateStreak`/dashboard refetch.
- `grep -n "useEffect" ExerciseRunner.js` (и родитель) — есть ли effect, в deps которого меняющийся после POST объект?

### A5. Interceptor на 429
- `grep -n "429\|Too Many\|retry\|interceptors.response" frontend/src/services/api.js` — **не ретраит ли интерсептор на 429?** (на 403+«истёк» — refresh+retry by design; 429 НЕ должен попадать в retry-очередь). Если 429 случайно матчит retry-условие → это и есть усилитель петли.

### A6. Limiter config (объясняет прод-429)
- `grep -rn "generalLimiter\|rateLimit\|express-rate-limit\|windowMs\|max:" backend/server.js backend/middleware/` — окно и max у `generalLimiter`, и **под каким лимитером висит `/api/progress`** (authLimiter 5/15min? generalLimiter?). Если /progress под узким лимитером и легитимно шлёт N запросов за раз — 429 объясним даже без петли.

### A7. Cross-check с memory
- Сверить вывод с `memory/bug_progress_429_loop.md` (у тебя в локальной памяти есть, у архитектора нет): если там уже зафиксирована подтверждённая причина — указать, совпала ли с A1–A6.

### 🛑 STOP PART A — отчёт
Приложить: (1) сколько POST'ов + их `exercise_id` (петля/батч), (2) call site + код обработчика, (3) есть ли guard, (4) chain-reaction да/нет, (5) ретраит ли интерсептор 429, (6) limiter config для /progress, (7) вердикт причины.
**Жду отчёт + подтверждаю ветку фикса. Part B без подтверждения не выполнять.**

---

# PART B — ФИКС (✅ ВЕТКА ПОДТВЕРЖДЕНА АРХИТЕКТОРОМ: 2a)

**Решение (2026-05-26, по отчёту Part A):** причина — **батч by-design + слишком тесный глобальный лимитер**, НЕ петля. 6 анти-петельных проверок отрицательные, единственный call site защищён `saving`/`disabled`. **Делаем Ветку 2a. ExerciseRunner НЕ разблокируем, НЕ трогаем.**

### Что делаем (серверная сторона, `backend/server.js`)
1. **Выделить progress-маршруты из глобального `generalLimiter`** и дать им отдельный щедрый лимит:
   - В `generalLimiter` добавить `skip: (req) => req.path.startsWith('/progress')` (проверить фактический `req.path` под mount'ом `app.use('/api', ...)` — должен быть `/progress...`; если иначе — подстроить предикат).
   - Новый `progressLimiter = rateLimit({ windowMs: 15*60*1000, max: 600, ... })`, смонтировать `app.use('/api/progress', progressLimiter)` — **только в production** (как `generalLimiter`, тем же `if (config.nodeEnv === 'production')` блоком; в dev остаётся выключенным).
   - 600/15min/IP ≈ 15–20 полных тренировок (включая prevSession GET'ы) — с запасом для пилота, но всё ещё защита от abuse.
   - **Симметрия (важно, из отчёта Part A):** `progressLimiter` обязан покрывать И POST `/progress`, И GET `/progress/exercise/:id/complex/:id` (prevSession useEffect L67–77) — они оба под `/api/progress`, так что один mount на `/api/progress` накроет оба. Убедиться, что GET'ы не остаются под старым 100-лимитом.
2. **НЕ создаём** batch-endpoint (вариант 2b отклонён — потребовал бы трогать ExerciseRunner).
3. **НЕ трогаем** `authLimiter` (5/15min на login/register — остаётся).

### Anti-regression тест (из отчёта Part A — закрывает петлю программно)
- В `frontend/src/.../ExercisesScreen.test.js` (где `expect(progressPatient.create).toHaveBeenCalledWith(...)`, ~L163) **добавить** `expect(progressPatient.create).toHaveBeenCalledTimes(1)` после одного submit. Это программный эквивалент A1 для петли: один клик = один POST.
  - **Если этот тест КРАСНЫЙ** (create вызвался >1 раза) → петля всё-таки есть → STOP, эскалация на Ветку 1 (тогда нужен ref-guard + узкая разблокировка ExerciseRunner). Если зелёный — Ветка 2a подтверждена окончательно, петли нет.
- Backend: добавить тест на наличие/конфиг `progressLimiter` (mock-level — что `/api/progress` имеет отдельный лимит ≠ generalLimiter), либо хотя бы sanity на server.js wiring.

### type="button" (опционально, НЕ обязательно для P0)
Из Part A: на done/skip кнопках нет `type="button"` — мина, если ExerciseRunner когда-нибудь обернут в `<form>`. **Сейчас не причина бага.** Можно добавить одну строку (`type="button"`) как дешёвую защиту — но это касание ExerciseRunner. Решение: **по умолчанию НЕ трогаем** (узкий LOCKED), вынести в backlog. Если хочется закрыть — отдельной явной разблокировкой, не в этом P0.

### Проверка
- Dev: anti-regression тест зелёный (1 submit = 1 POST). На dev 429 не воспроизводится (лимитер off) — это ок.
- **Прод-проверка обязательна** (429 живёт только на проде): после деплоя — incognito без расширений, пациент id=12 на проде, пройти **полный** комплекс до конца (все упражнения «Выполнено») → **0× 429**, прогресс сохранён. Опц. прогнать дважды подряд (проверить, что 600-лимит держит повторную сессию).
- Деплой через CI/CD: смержить `hotfix/progress-429-loop` в main → Actions. `skip_tests=false` (тесты не пропускаем).

### 🛑 STOP PART B — отчёт
SHA + verify (grep `progressLimiter`/`skip` в server.js) + дельта тестов (вкл. `toHaveBeenCalledTimes(1)` — зелёный) + drift'ы + подтверждение прод-проверки (0× 429 на полном комплексе).

---

## Вне scope этого TZ (трекаются отдельно)
- **bug #17** — patient welcome 100% width на десктопе (P3 cosmetic, ~5 мин: `max-width:520px; margin:0 auto` в контейнере — имя компонента подтвердить grep'ом). Отдельный микро-TZ или quick-win, не смешивать с P0.
- **bug #18** — таймер ExerciseRunner без звука (feature backlog, ExerciseRunner LOCKED, сверять с iOS-эталоном). Не в этом hot-fix.
- **Три хвоста закрытия Wave 3** (MEMORY_RULES regen + reconcile волн + чистка апрельского CLAUDE.md) — после блокера.

---

*Hot-fix TZ bug #16. Architect: Claude Opus 4.7, 2026-05-26. Ветка `hotfix/progress-429-loop` от `db64dc8`. Диагностика-first (drift #33) + ExerciseRunner LOCKED → unlock условный и узкий. Part B после подтверждения ветки.*
