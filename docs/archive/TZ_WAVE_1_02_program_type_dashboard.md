# TZ Wave 1 · Коммит 1.02 — Backend endpoints для program_types + dashboard

**Дата:** 2026-05-12
**Roadmap:** `PATIENT_UX_ROADMAP_2026-05-08_v2.md` пункт #1
**Цель:** добавить `program_type` + `program_label` (joined из справочника) в `/api/rehab/my/dashboard`. Добавить новый endpoint `GET /api/program-types` для дальнейшего использования в UI (RehabProgramModal wizard, AdminContent). Без UI-изменений в этом коммите.
**Объём:** 2-3 часа
**Риск:** низкий — расширение существующего endpoint + один новый GET

---

## Зависимость

После коммита 1.01 (миграция применена в dev). Без 1.01 этот коммит не имеет смысла — нет ни `rehab_programs.program_type`, ни `program_types` таблицы.

Ветка строится от `wave-1/01-program-types-migration`.

---

## Что блокирует

После 1.01 в БД есть `program_type` и справочник, но никто этим не пользуется. Wave 0 коммит #02 показывает `program_label` через временный мaппинг по `diagnosis` строке в backend — не через JOIN с program_types.

Чтобы коммит 1.03 (полная замена маппинга в HomeScreen) мог работать, нужно сначала backend, который возвращает `program_type` + готовый `program_label` из справочника. Это инкрементальное расширение, не breaking change — старые поля dashboard остаются.

**После этого коммита:**
- `GET /api/rehab/my/dashboard` возвращает `program.program_type` и `program.program_label`
- Новый `GET /api/program-types` для UI (список активных program_types для селекторов)
- UI пока продолжает использовать временный маппинг (это в 1.03)

---

## Параллельная работа — координация

**ТРОГАЕМ:**
- `backend/routes/rehab.js` — расширение `/my/dashboard` SQL-запроса
- Новый файл `backend/routes/programTypes.js` (или добавить в `routes/rehab.js` — обсудить ниже)
- `backend/server.js` — регистрация роутера если новый файл
- `backend/tests/__tests__/rehab.routes.test.js` — расширение тестов dashboard
- Новый файл `backend/tests/__tests__/programTypes.routes.test.js`

**НЕ ТРОГАТЬ:**
- Frontend код (полностью)
- Существующий backend код вне `rehab.js` + `server.js`
- `services/telegramBot.js` (это коммит 1.04)
- Существующие миграции

**Архитектурное решение — где жить новому endpoint'у:**

Два варианта:
1. **Новый файл `routes/programTypes.js`** + регистрация `app.use('/api/program-types', ...)` в server.js. Логично, но размножает файлы — у нас сейчас 13 routes-файлов, добавлять 14-й ради одного GET — overkill.
2. **Внутрь `routes/rehab.js`** как `GET /api/rehab/program-types` (на префиксе `/api/rehab` который уже есть).

**Решение: вариант 2** — добавляем в `rehab.js` как `GET /program-types`. Префикс становится `/api/rehab/program-types`. Это согласуется с уже существующим `GET /api/rehab/phases/:type` (тоже справочник внутри rehab.js).

---

## Backend — расширение dashboard

### Точка вставки

Найти в `backend/routes/rehab.js` обработчик `router.get('/my/dashboard', ...)` (примерно строки 300-400, точное место уточнить grep'ом `'/my/dashboard'`).

Внутри SELECT'а программы добавить JOIN с program_types для получения label.

### До (приблизительно)

```javascript
const programResult = await query(
  `SELECT id, current_phase, phase_started_at, status, diagnosis, program_type
   FROM rehab_programs
   WHERE patient_id = $1 AND status = 'active' AND is_active = true
   ORDER BY created_at DESC
   LIMIT 1`,
  [patientId]
);
```

(до коммита 1.01 — без `program_type`, после 1.01 — с `program_type`)

### После

```javascript
const programResult = await query(
  `SELECT
     rp.id, rp.current_phase, rp.phase_started_at, rp.status,
     rp.diagnosis, rp.program_type,
     pt.label AS program_label,
     pt.joint AS program_joint,
     pt.surgery_required AS program_surgery_required
   FROM rehab_programs rp
   LEFT JOIN program_types pt ON pt.code = rp.program_type
   WHERE rp.patient_id = $1 AND rp.status = 'active' AND rp.is_active = true
   ORDER BY rp.created_at DESC
   LIMIT 1`,
  [patientId]
);
```

**Обратная совместимость:**
- Если по какой-то причине `pt.label` NULL (программа имеет несуществующий `program_type` — не должно случиться из-за FK, но защита) → frontend в коммите 1.03 будет использовать fallback на текущий временный маппинг по diagnosis. Никто не сломается.

### Структура ответа dashboard

Возвращаемый объект `data.program` (если есть активная программа) теперь содержит:

```jsonc
{
  "data": {
    "program": {
      "id": 1,
      "current_phase": 3,
      "phase_started_at": "2026-04-15",
      "status": "active",
      "diagnosis": "ПКС BPTB-графт",
      "program_type": "acl",
      "program_label": "ПКС реабилитация",
      "program_joint": "knee",
      "program_surgery_required": true
    },
    // ...остальные поля dashboard (streak, todayDone, etc) без изменений
  }
}
```

Если активной программы нет — `data.program: null` (как было).

---

## Backend — новый endpoint `GET /api/rehab/program-types`

### Точка вставки

В `backend/routes/rehab.js` найти существующий публичный endpoint `GET /phases/:type` (примерно строки 800-900) — поставить новый рядом, тоже публичный.

### Код endpoint'а

```javascript
// GET /api/rehab/program-types — справочник активных program_types для UI селекторов
// Публичный endpoint (не требует JWT), используется в RehabProgramModal wizard
// и AdminContent. Соблюдается generalLimiter rate limit (public endpoint)
router.get('/program-types', async (req, res, next) => {
  try {
    const result = await query(
      `SELECT code, label, joint, body_side_relevant, surgery_required
       FROM program_types
       WHERE is_active = true
       ORDER BY position ASC, code ASC`
    );

    return res.json({
      data: result.rows,
      total: result.rows.length
    });
  } catch (err) {
    next(err);
  }
});
```

**Почему публичный (без JWT):**
- По образцу `GET /api/rehab/phases/:type` (тоже справочник, тоже публичный)
- Содержит только нечувствительный справочный контент (тип патологии + название)
- Используется в RehabProgramModal который открывается инструктору (JWT уже есть на странице, но endpoint сам не требует) и в будущем AdminContent (тоже за JWT)
- Если в Wave 1B потребуется auth (например, для админ-CRUD) — это будут отдельные endpoints `POST /api/admin/program-types` под `requireAdmin`

### Rate limiting

Endpoint находится под общим `generalLimiter` (см. `server.js`), как и остальные `/api/rehab/*` GETs. Дополнительной настройки не требует.

---

## Тесты

### Расширение `backend/tests/__tests__/rehab.routes.test.js`

В существующем `describe('GET /api/rehab/my/dashboard')` добавить:

```javascript
it('возвращает program_type и program_label из JOIN', async () => {
  const patient = await createTestPatient();
  const accessToken = signPatientToken(patient.id);
  await query(
    `INSERT INTO rehab_programs (patient_id, current_phase, status, is_active, program_type, diagnosis)
     VALUES ($1, 2, 'active', true, 'acl', 'ПКС BPTB')`,
    [patient.id]
  );

  const res = await request(app)
    .get('/api/rehab/my/dashboard')
    .set('Cookie', [`patient_access_token=${accessToken}`])
    .expect(200);

  expect(res.body.data.program).toBeDefined();
  expect(res.body.data.program.program_type).toBe('acl');
  expect(res.body.data.program.program_label).toBe('ПКС реабилитация');
  expect(res.body.data.program.program_joint).toBe('knee');
  expect(res.body.data.program.program_surgery_required).toBe(true);
});

it('program_label NULL если program_type не найден в справочнике (защита от inconsistency)', async () => {
  // Этот кейс не должен происходить из-за FK, но проверяем защиту через LEFT JOIN
  // Используем SQL-trick для имитации (отключаем FK на момент INSERT)
  await query('ALTER TABLE rehab_programs DROP CONSTRAINT IF EXISTS fk_rehab_programs_program_type');
  const patient = await createTestPatient();
  const accessToken = signPatientToken(patient.id);
  await query(
    `INSERT INTO rehab_programs (patient_id, current_phase, status, is_active, program_type, diagnosis)
     VALUES ($1, 1, 'active', true, 'nonexistent', 'test')`,
    [patient.id]
  );

  const res = await request(app)
    .get('/api/rehab/my/dashboard')
    .set('Cookie', [`patient_access_token=${accessToken}`])
    .expect(200);

  expect(res.body.data.program.program_type).toBe('nonexistent');
  expect(res.body.data.program.program_label).toBeNull();

  // Cleanup — восстановить FK
  await query(`
    ALTER TABLE rehab_programs
      ADD CONSTRAINT fk_rehab_programs_program_type
      FOREIGN KEY (program_type) REFERENCES program_types(code) ON UPDATE CASCADE
  `);
});

it('program null если у пациента нет активной программы', async () => {
  const patient = await createTestPatient();
  const accessToken = signPatientToken(patient.id);

  const res = await request(app)
    .get('/api/rehab/my/dashboard')
    .set('Cookie', [`patient_access_token=${accessToken}`])
    .expect(200);

  expect(res.body.data.program).toBeNull();
});
```

### Новый файл `backend/tests/__tests__/programTypes.routes.test.js`

```javascript
const request = require('supertest');
const app = require('../../server');
const { query } = require('../../database/db');

describe('GET /api/rehab/program-types', () => {
  it('возвращает минимальный seed из 3 кодов', async () => {
    const res = await request(app)
      .get('/api/rehab/program-types')
      .expect(200);

    expect(res.body.data).toBeInstanceOf(Array);
    expect(res.body.data.length).toBeGreaterThanOrEqual(3);
    const codes = res.body.data.map(pt => pt.code);
    expect(codes).toEqual(expect.arrayContaining(['acl', 'knee_general', 'shoulder_general']));
  });

  it('каждая запись содержит code/label/joint', async () => {
    const res = await request(app)
      .get('/api/rehab/program-types')
      .expect(200);

    const aclEntry = res.body.data.find(pt => pt.code === 'acl');
    expect(aclEntry).toEqual(expect.objectContaining({
      code: 'acl',
      label: 'ПКС реабилитация',
      joint: 'knee',
      surgery_required: true
    }));
  });

  it('отсортировано по position', async () => {
    const res = await request(app)
      .get('/api/rehab/program-types')
      .expect(200);

    // acl=1, knee_general=2, shoulder_general=3 по position в seed
    expect(res.body.data[0].code).toBe('acl');
    expect(res.body.data[1].code).toBe('knee_general');
    expect(res.body.data[2].code).toBe('shoulder_general');
  });

  it('фильтрует is_active=false', async () => {
    await query("UPDATE program_types SET is_active = false WHERE code = 'shoulder_general'");

    const res = await request(app)
      .get('/api/rehab/program-types')
      .expect(200);

    const codes = res.body.data.map(pt => pt.code);
    expect(codes).not.toContain('shoulder_general');
    expect(codes).toContain('acl');
    expect(codes).toContain('knee_general');

    // Cleanup
    await query("UPDATE program_types SET is_active = true WHERE code = 'shoulder_general'");
  });

  it('endpoint доступен без авторизации', async () => {
    await request(app)
      .get('/api/rehab/program-types')
      // без headers/cookies
      .expect(200);
  });

  it('returns { data, total } format (no success field)', async () => {
    const res = await request(app)
      .get('/api/rehab/program-types')
      .expect(200);

    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('total');
    expect(res.body).not.toHaveProperty('success');
  });
});
```

**Команда запуска:**
```bash
cd backend && npm test -- --testPathPattern='(rehab\.routes|programTypes\.routes)'
```

---

## NOT TOUCH

- Любой frontend файл (это коммит 1.03)
- `services/telegramBot.js` (коммит 1.04)
- Существующие endpoints в `routes/rehab.js` кроме `/my/dashboard`
- AdminContent (коммит 1.05)
- `routes/admin.js`

---

## Smoke test

### Сценарий 1 — `/api/rehab/program-types` отвечает корректно

```bash
# Локально (без JWT)
curl http://localhost:5000/api/rehab/program-types | jq
```

**Ожидание:**
```json
{
  "data": [
    { "code": "acl", "label": "ПКС реабилитация", "joint": "knee", "surgery_required": true, "body_side_relevant": true },
    { "code": "knee_general", "label": "Реабилитация колена", "joint": "knee", "surgery_required": false, "body_side_relevant": true },
    { "code": "shoulder_general", "label": "Реабилитация плеча", "joint": "shoulder", "surgery_required": false, "body_side_relevant": true }
  ],
  "total": 3
}
```

### Сценарий 2 — dashboard возвращает program_label

1. Войти как пациент `avi707@mail.ru` / `Test1234` через UI
2. В DevTools → Network вкладке наблюдать `GET /api/rehab/my/dashboard`
3. **Ожидание в response.data.program:**
   ```json
   {
     "program_type": "acl",
     "program_label": "ПКС реабилитация",
     "program_joint": "knee",
     // ...остальные поля
   }
   ```

### Сценарий 3 — UI не сломан

Войти как пациент → HomeScreen. **Ожидание:** работает как раньше (1.03 ещё не выполнен, фронт продолжает использовать временный маппинг через diagnosis).

---

## Файлы — итоговый чеклист

### Создать
- `backend/tests/__tests__/programTypes.routes.test.js` — тесты нового endpoint'а

### Изменить
- `backend/routes/rehab.js` — расширить SELECT `/my/dashboard` + добавить `/program-types`
- `backend/tests/__tests__/rehab.routes.test.js` — расширить тесты dashboard (+3 кейса)
- `CLAUDE.md` — секция «API endpoints / Реабилитация» добавить строку про `/program-types`

### НЕ ТРОГАТЬ
- Frontend
- Любые другие routes/services
- AdminContent
- Telegram bot

---

## Текст коммита

```
feat(api): program_types endpoint + program_label в dashboard

Wave 1 коммит 1.02 — backend для multi-protocol.

- GET /api/rehab/program-types — справочник активных типов программ
  (публичный, для UI селекторов в RehabProgramModal и AdminContent)
- /api/rehab/my/dashboard расширен: program.program_label/joint/surgery_required
  через LEFT JOIN с program_types
- Backwards-compatible: fallback на NULL если справочник пуст

Без UI-изменений. Использование на фронте — в 1.03.

Test: backend +9 кейсов (3 dashboard, 6 program-types endpoint)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

## Пост-коммит

**`CLAUDE.md`:**
- Секция «API endpoints / Реабилитация» — добавить строку `GET /api/rehab/program-types` (публичный, справочник)
- Секция «API endpoints / Реабилитация / /my/dashboard» — отметить что возвращает program_label через JOIN

**Memory:**
- `wave_1_progress.md` — статус 1.02 → `⏸ заморожен`

---

## Definition of Done

- [ ] `routes/rehab.js` расширен (dashboard JOIN + новый endpoint)
- [ ] 3 теста dashboard расширения зелёные
- [ ] 6 тестов нового endpoint'а зелёные
- [ ] curl manual проверка отдаёт 3 записи
- [ ] dashboard у пациента avi707 возвращает program_label в DevTools
- [ ] UI пациента работает как раньше (1.03 ещё не сделан, fallback на временный маппинг)
- [ ] CLAUDE.md обновлён
- [ ] Коммит создан с указанным текстом + Co-Authored-By
- [ ] `wave_1_progress.md` обновлён: 1.02 → `⏸ заморожен`
- [ ] **Push только по «ок» от Vadim'а**
