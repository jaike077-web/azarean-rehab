# TZ Wave 1 · Коммит 1.08a — Backend подготовка к wizard (derived_title для Bug #13)

**Дата:** 2026-05-13
**Roadmap:** `PATIENT_UX_ROADMAP_2026-05-08_v2.md` пункт #3 + Bug #13
**Цель:** добавить computed поле `derived_title` в SELECT'ы `routes/complexes.js` (Bug #13 fallback из первых упражнений). По договорённости `2026-05-13` split — backend перед UI, чтобы review был чище.
**Объём:** 1.5-2 часа
**Риск:** низкий — расширение SELECT + новый computed field

---

## Verify-step перед стартом (правило 2026-05-13)

**Обязательно сделай grep до начала кода:**

```bash
cd c:/Users/Вадим/Desktop/Azarean_rehab
grep -rn "Комплекс #" frontend/src/
grep -rn "Комплекс #" backend/routes/
grep -rn "complex.title" frontend/src/components/RehabProgramModal*
```

**Зачем:**
- Найти где сейчас фронт делает fallback `Комплекс #${id}` — это место будет использовать новое поле `derived_title` в 1.08b
- Понять структуру SELECT'ов в `routes/complexes.js` (могла измениться с моего brief'а)
- Подтвердить что в текущем коде `complex.title` уже nullable (если кто-то добавил NOT NULL в Wave 0 — это меняет логику)

**Если найдёшь premise drift** (например, `derived_title` уже частично есть, или есть таблица `complex_titles` отдельная) — стопись и спроси, не делай дубль.

---

## Зависимость

После 1.07. Ветка `wave-1/08a-wizard-backend-prep` от `wave-1/07-admin-program-templates`.

---

## Что блокирует

В текущем UI (RehabProgramModal old, и любое другое место где выбирается complex_id) комплексы **без `title`** показываются как `Комплекс #${id}` — невыразительный fallback, инструктор не понимает что выбирает. Это Bug #13.

Решение: вместо frontend-side `deriveLabel(complex)` хелпера — **computed поле в backend SELECT**. По образцу `is_registered` (computed в `patients.js`) и `is_stuck_on_phase` (которое будет в 1.09 как EXISTS-агрегат).

**Преимущества backend-side подхода:**
- Одна точка истины — все UI потребители (RehabProgramModal old, новый wizard в 1.08b, ViewProgress, etc.) получают `derived_title` бесплатно
- Не дублируется логика на фронте
- При смене формулы (например, 3 первых упражнения вместо 2) — одна правка
- Соответствует pattern проекта (computed поля в SELECT'ах)

**После коммита:**
- `GET /api/complexes` и `GET /api/complexes/:id` возвращают поле `derived_title VARCHAR | null`
- Формула: `coalesce(title, first 1-2 exercise titles joined ' · ', '')` — если оба пусты, поле NULL, фронт сам решает что показать (но это уже край)
- Frontend пока не использует поле — это в 1.08b

**Что НЕ делается:**
- Никаких изменений во frontend (1.08b)
- Никаких новых таблиц / миграций
- Wizard переписка (1.08b)
- Stuck detection (1.09)

---

## Параллельная работа — координация

**ТРОГАЕМ:**
- `backend/routes/complexes.js` — расширить SELECT'ы (GET list + GET :id)
- `backend/tests/__tests__/complexes.routes.test.js` (если есть — иначе расширить общий test файл) — +3-5 кейсов
- `CLAUDE.md` — отметить новое поле `derived_title` в описании API

**Опционально (если grep покажет что patient_id filter полезен для 1.08b):**
- Добавить `?patient_id=` фильтр в `GET /api/complexes` — но только если он уже не существует и не дублирует существующий `?created_by=` или иное.

**НЕ ТРОГАТЬ:**
- Frontend (это 1.08b)
- `RehabProgramModal.js` (1.08b)
- Другие routes
- LOCKED-зоны

---

## Backend — реализация

### Шаг 1 — найти текущий SELECT для GET /complexes и GET /complexes/:id

Grep `'/api/complexes'` или `router.get('/'` в `routes/complexes.js`. Текущий SELECT возвращает примерно:

```javascript
SELECT c.id, c.title, c.patient_id, c.instructor_id, c.diagnosis_id, c.recommendations, ...
FROM complexes c
WHERE c.is_active = true
```

### Шаг 2 — добавить derived_title через подзапрос

Используем коррелированный subquery с `LEFT JOIN LATERAL` или подзапросом `(SELECT string_agg(...) FROM ... LIMIT 2)`:

```sql
SELECT
  c.id, c.title, c.patient_id, c.instructor_id, c.diagnosis_id, c.recommendations,
  -- ... existing fields ...
  COALESCE(
    NULLIF(c.title, ''),
    (
      SELECT string_agg(ex.title, ' · ' ORDER BY ce.order_number)
      FROM (
        SELECT exercise_id, order_number
        FROM complex_exercises
        WHERE complex_id = c.id
        ORDER BY order_number
        LIMIT 2
      ) ce
      JOIN exercises ex ON ex.id = ce.exercise_id
    ),
    NULL
  ) AS derived_title
FROM complexes c
WHERE c.is_active = true
```

**Логика COALESCE:**
1. Если `c.title` непустой → берём его
2. Иначе — `string_agg` из первых 2 упражнений (joined ' · ')
3. Иначе (нет ни title, ни упражнений) → NULL (фронт покажет `Комплекс #${id}` сам)

**Производительность:** subquery выполняется один раз на ряд `complexes`. Для списков из 50 комплексов — 50 subqueries, каждый по index'у `complex_exercises(complex_id, order_number)` (этот индекс уже есть из миграций Wave 0). Приемлемо для текущего масштаба (10-100 комплексов в системе).

Если в будущем потребуется оптимизация — можно сделать `LEFT JOIN LATERAL` или materialized view. Сейчас не нужно.

### Шаг 3 — повторить для GET /complexes/:id

Тот же `derived_title` в WHERE `c.id = $1` SELECT'е.

### Шаг 4 — опциональный фильтр ?patient_id

После grep'а — если current `GET /api/complexes` не поддерживает фильтр по `patient_id`, и для 1.08b wizard'а пригодится «комплексы конкретного пациента отдельной секцией» — добавить:

```javascript
const { patient_id } = req.query;
let sql = `... SELECT ... FROM complexes c WHERE c.is_active = true`;
const params = [];
if (patient_id) {
  sql += ' AND c.patient_id = $1';
  params.push(parseInt(patient_id));
}
sql += ' ORDER BY c.created_at DESC';
```

Если фильтр уже есть — не дублируй.

---

## Тесты

### Расширение `backend/tests/__tests__/complexes.routes.test.js` (или эквивалент)

Mock-based (без реальной БД, по правилу 2026-05-13):

```javascript
const { query } = require('../../database/db');
jest.mock('../../database/db');

describe('GET /api/complexes — derived_title computed field', () => {
  // ... setup admin/instructor JWT, mock query() return values

  it('derived_title = title если title непустой', async () => {
    query.mockResolvedValueOnce({
      rows: [{
        id: 1, title: 'Реабилитация колена базовая',
        derived_title: 'Реабилитация колена базовая',
        // ... other fields
      }]
    });
    const res = await request(app).get('/api/complexes')
      .set('Authorization', `Bearer ${instructorToken}`)
      .expect(200);
    expect(res.body.data[0].derived_title).toBe('Реабилитация колена базовая');
  });

  it('derived_title = first 1-2 exercises joined если title пустой', async () => {
    query.mockResolvedValueOnce({
      rows: [{
        id: 2, title: null,
        derived_title: 'Приседания у стены · Подъём прямой ноги',
      }]
    });
    const res = await request(app).get('/api/complexes')
      .set('Authorization', `Bearer ${instructorToken}`)
      .expect(200);
    expect(res.body.data[0].derived_title).toBe('Приседания у стены · Подъём прямой ноги');
  });

  it('derived_title = null если ни title ни exercises', async () => {
    query.mockResolvedValueOnce({
      rows: [{
        id: 3, title: null,
        derived_title: null,
      }]
    });
    const res = await request(app).get('/api/complexes')
      .set('Authorization', `Bearer ${instructorToken}`)
      .expect(200);
    expect(res.body.data[0].derived_title).toBeNull();
  });

  it('GET /api/complexes/:id возвращает derived_title', async () => {
    query.mockResolvedValueOnce({
      rows: [{ id: 5, title: '', derived_title: 'Упр1 · Упр2' }]
    });
    const res = await request(app).get('/api/complexes/5')
      .set('Authorization', `Bearer ${instructorToken}`)
      .expect(200);
    expect(res.body.data.derived_title).toBe('Упр1 · Упр2');
  });

  // Опционально, если добавляешь patient_id filter:
  it('фильтр ?patient_id передаёт параметр в SQL', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await request(app).get('/api/complexes?patient_id=14')
      .set('Authorization', `Bearer ${instructorToken}`)
      .expect(200);
    // Проверяем что query() был вызван с patient_id в params
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('patient_id'),
      expect.arrayContaining([14])
    );
  });
});
```

Если в проекте принят паттерн mock'а через supertest без `jest.mock('../../database/db')` — адаптируй под него (как ты делал в 1.05/1.07).

### SQL-sanity тест (опционально)

Если хочешь продублировать sanity-check как в 1.01 — отдельным `it('SELECT содержит string_agg для derived_title')` через регэксп на route file content.

---

## NOT TOUCH

- Frontend (1.08b)
- `RehabProgramModal.js`
- LOCKED-зоны
- Другие routes
- Существующие миграции

---

## Smoke test

В этом коммите нет UI — smoke через curl.

### Сценарий 1 — GET /api/complexes возвращает derived_title

```bash
TOKEN=$(curl -s -X POST http://localhost:5000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"vadim@azarean.com","password":"Test1234"}' | jq -r '.data.access_token')

curl -H "Authorization: Bearer $TOKEN" http://localhost:5000/api/complexes | jq '.data[0] | {id, title, derived_title}'
```

**Ожидание:** для существующих комплексов в dev — derived_title непустой (либо title, либо упражнения).

### Сценарий 2 — комплекс без title

В dev-БД создать тестовый комплекс без title:
```sql
INSERT INTO complexes (patient_id, instructor_id, title, is_active)
VALUES (14, 1, NULL, true) RETURNING id;
-- предположим вернул id=99
INSERT INTO complex_exercises (complex_id, exercise_id, order_number, sets, reps)
VALUES (99, 1, 1, 3, 10), (99, 2, 2, 3, 10);
```

Затем `curl GET /api/complexes/99` → ожидание `derived_title` = названия первых 2 упражнений joined ' · '.

**Cleanup:**
```sql
DELETE FROM complex_exercises WHERE complex_id = 99;
DELETE FROM complexes WHERE id = 99;
```

### Сценарий 3 — UI не сломан

Войти как инструктор → MyComplexes / Patients → ничего не сломано (фронт пока не использует derived_title — это 1.08b).

---

## Файлы — итоговый чеклист

### Изменить
- `backend/routes/complexes.js` — расширить SELECT'ы GET list + GET :id (+ опционально patient_id filter)
- `backend/tests/__tests__/complexes.routes.test.js` (или эквивалент) — +4-5 mock-based кейсов
- `CLAUDE.md` — секция «API endpoints / Complexes» — отметить `derived_title` поле в ответе

### Не создавать
- Никаких новых файлов

### НЕ ТРОГАТЬ
- Frontend
- `RehabProgramModal.js`
- LOCKED
- Другие routes

---

## Текст коммита

```
feat(complexes): derived_title computed field для Bug #13 fallback

Wave 1 коммит 1.08a — backend prep для wizard.

- GET /api/complexes и /:id возвращают derived_title
- Формула: COALESCE(title, first 1-2 exercises joined ' · ', NULL)
- Закрывает frontend-side fallback «Комплекс #N» (Bug #13)
- Использование во wizard'е — 1.08b

Pattern: computed field в SELECT (как is_registered, is_stuck_on_phase).
Mock-based тесты (правило 2026-05-13).

Test: backend +4-5

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

## Definition of Done

- [ ] Verify-step выполнен (grep по «Комплекс #» и complex.title)
- [ ] SELECT'ы `complexes.js` расширены `derived_title`
- [ ] (опционально) `?patient_id` filter добавлен если ещё не было
- [ ] Mock-based тесты зелёные (4-5 кейсов)
- [ ] Sanity curl смоки 1-2 прошли
- [ ] UI не сломан (1.08b ещё не сделан, derived_title не используется)
- [ ] CLAUDE.md обновлён
- [ ] Коммит + Co-Authored-By
- [ ] `wave_1_progress.md` обновлён: 1.08a → ⏸ заморожен
- [ ] **Push только по «ок»**
