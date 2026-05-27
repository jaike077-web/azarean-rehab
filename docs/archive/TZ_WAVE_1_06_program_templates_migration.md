# TZ Wave 1 · Коммит 1.06 — Миграция program_templates + endpoints

**Дата:** 2026-05-12
**Roadmap:** `PATIENT_UX_ROADMAP_2026-05-08_v2.md` пункт #3
**Цель:** ввести сущность `program_templates` — преднабор «тип программы + фазы + рекомендованные комплексы». После этого коммита БД готова к шаблонам, но UI шаблонов нет (1.07) и RehabProgramModal ещё старая (1.08).
**Объём:** 4-5 часов
**Риск:** средний — много связанных таблиц, аккуратная миграция

---

## Зависимость

После коммитов 1.01-1.05. Ветка строится от `wave-1/05-admin-phases-program-type`. **Это первый коммит блока B.**

---

## Что блокирует

Сейчас при создании RehabProgram инструктор:
1. Выбирает пациента
2. Выбирает существующий complex_id (из ранее созданных комплексов)
3. Указывает диагноз вручную текстом
4. Ставит current_phase=1

Это означает что **на каждого нового пациента инструктор верстает complex с нуля**, не имея «преднабора по протоколу». Нет понятия «стандартный комплекс для ACL фазы 1». Templates существуют для комплексов упражнений, но никак не связаны ни с program_type, ни с фазами.

**После этого коммита:**
- В БД есть `program_templates` (например, «ПКС BPTB», «Меннисэктомия»)
- Junction `program_template_phase_complexes` — какой template комплекса рекомендован на каждой фазе шаблона программы
- `templates.program_type` — для фильтрации templates по типу программы
- `rehab_programs.program_template_id` — для tracking какой шаблон использован при создании
- Backend endpoints для управления

**Что НЕ делается этим коммитом:**
- AdminContent UI для program_templates — это 1.07
- RehabProgramModal wizard с выбором шаблона — это 1.08
- Никаких заполнений шаблонов конкретными комплексами (это контент-работа Vadim'а в AdminContent)

---

## Параллельная работа — координация

**ТРОГАЕМ:**
- Новый файл миграции `backend/database/migrations/20260513_program_templates.sql`
- `backend/routes/rehab.js` — endpoints `GET /api/rehab/program-templates`, `GET /api/rehab/program-templates/:id/phases`, расширение `POST /api/rehab/programs`
- `backend/tests/__tests__/rehab.routes.test.js` — тесты новых endpoints + расширение POST programs

**НЕ ТРОГАТЬ:**
- AdminContent UI (это 1.07)
- RehabProgramModal (это 1.08)
- Существующие миграции (только additive новая)
- LOCKED-зоны

---

## Backend — миграция

### Файл `backend/database/migrations/20260513_program_templates.sql`

```sql
-- Миграция Wave 1 коммит 1.06: шаблоны программ + связи
-- Идемпотентна

BEGIN;

-- 1. Шаблоны программ (например, «ПКС BPTB», «Меннисэктомия частичная»)
CREATE TABLE IF NOT EXISTS program_templates (
  id SERIAL PRIMARY KEY,
  code VARCHAR(50) UNIQUE NOT NULL,
  program_type VARCHAR(50) NOT NULL REFERENCES program_types(code) ON UPDATE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  surgery_required BOOLEAN DEFAULT FALSE,
  default_phase_count SMALLINT,
  variant_of INTEGER REFERENCES program_templates(id) ON DELETE SET NULL,
  is_active BOOLEAN DEFAULT TRUE,
  position SMALLINT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_program_templates_type ON program_templates(program_type);
CREATE INDEX IF NOT EXISTS idx_program_templates_active ON program_templates(is_active);

-- 2. Junction: шаблон программы ↔ рекомендованные шаблоны комплексов на каждой фазе
CREATE TABLE IF NOT EXISTS program_template_phase_complexes (
  id SERIAL PRIMARY KEY,
  program_template_id INTEGER NOT NULL REFERENCES program_templates(id) ON DELETE CASCADE,
  phase_number SMALLINT NOT NULL,
  complex_template_id INTEGER REFERENCES templates(id) ON DELETE SET NULL,
  is_recommended BOOLEAN DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (program_template_id, phase_number)
);

CREATE INDEX IF NOT EXISTS idx_pt_phase_complexes_template ON program_template_phase_complexes(program_template_id);

-- 3. rehab_programs.program_template_id — tracking какой шаблон использован
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'rehab_programs' AND column_name = 'program_template_id'
  ) THEN
    ALTER TABLE rehab_programs
      ADD COLUMN program_template_id INTEGER REFERENCES program_templates(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 4. templates.program_type — для фильтрации комплексов под тип программы
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'templates' AND column_name = 'program_type'
  ) THEN
    ALTER TABLE templates
      ADD COLUMN program_type VARCHAR(50) REFERENCES program_types(code) ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_templates_program_type ON templates(program_type);

COMMIT;
```

**Никакого seed program_templates в миграции** — Vadim наполняет через AdminContent UI (1.07).

---

## Backend — endpoints

В `backend/routes/rehab.js` добавить (рядом с `GET /api/rehab/program-types` из 1.02):

```javascript
// GET /api/rehab/program-templates — список активных шаблонов программ
// Публичный (для UI). Параметр ?program_type=acl фильтрует.
router.get('/program-templates', async (req, res, next) => {
  try {
    const { program_type } = req.query;
    let sql = `
      SELECT pt.id, pt.code, pt.program_type, pt.title, pt.description,
             pt.surgery_required, pt.default_phase_count, pt.variant_of,
             pt.position,
             types.label AS program_type_label,
             types.joint AS program_joint
      FROM program_templates pt
      LEFT JOIN program_types types ON types.code = pt.program_type
      WHERE pt.is_active = true
    `;
    const params = [];
    if (program_type) {
      sql += ' AND pt.program_type = $1';
      params.push(program_type);
    }
    sql += ' ORDER BY pt.position ASC, pt.title ASC';

    const result = await query(sql, params);
    return res.json({ data: result.rows, total: result.rows.length });
  } catch (err) {
    next(err);
  }
});

// GET /api/rehab/program-templates/:id/phases — фазы шаблона с рекомендованными complex_templates
router.get('/program-templates/:id/phases', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'ValidationError', message: 'Невалидный id' });

    // Получить шаблон программы
    const templateResult = await query(
      'SELECT * FROM program_templates WHERE id = $1 AND is_active = true',
      [id]
    );
    if (templateResult.rows.length === 0) {
      return res.status(404).json({ error: 'NotFound', message: 'Шаблон программы не найден' });
    }
    const template = templateResult.rows[0];

    // Получить фазы из rehab_phases по program_type шаблона
    const phasesResult = await query(
      `SELECT phase_number, title, subtitle, duration_weeks, description, goals, restrictions
       FROM rehab_phases
       WHERE program_type = $1 AND is_active = true
       ORDER BY phase_number`,
      [template.program_type]
    );

    // Получить рекомендованные complex_templates на каждой фазе
    const complexesResult = await query(
      `SELECT pc.phase_number, pc.complex_template_id, pc.is_recommended, pc.notes,
              t.id AS template_id, t.name AS template_name, t.description AS template_description
       FROM program_template_phase_complexes pc
       LEFT JOIN templates t ON t.id = pc.complex_template_id
       WHERE pc.program_template_id = $1`,
      [id]
    );

    // Merge: для каждой фазы прицепить recommended complex template
    const phasesWithComplexes = phasesResult.rows.map(phase => {
      const rec = complexesResult.rows.find(c => c.phase_number === phase.phase_number);
      return {
        ...phase,
        recommended_complex: rec ? {
          template_id: rec.template_id,
          name: rec.template_name,
          description: rec.template_description,
          notes: rec.notes
        } : null
      };
    });

    return res.json({
      data: {
        template,
        phases: phasesWithComplexes
      }
    });
  } catch (err) {
    next(err);
  }
});
```

### Расширение POST /api/rehab/programs

Найти существующий `POST /api/rehab/programs` в `routes/rehab.js`. Добавить приёмку `program_template_id` (опционально):

```javascript
// До
const { patient_id, complex_id, diagnosis, current_phase, surgery_date, program_type } = req.body;

// После
const { patient_id, complex_id, diagnosis, current_phase, surgery_date, program_type, program_template_id } = req.body;

// При INSERT включить program_template_id
const result = await query(
  `INSERT INTO rehab_programs (patient_id, complex_id, diagnosis, current_phase, surgery_date, program_type, program_template_id, status, is_active, created_by)
   VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', true, $8) RETURNING *`,
  [patient_id, complex_id, diagnosis, current_phase || 1, surgery_date, program_type || 'acl', program_template_id || null, req.user.id]
);
```

**Никакой автоматики копирования комплекса из шаблона** в этом коммите — это будет в 1.08 в логике wizard'а на фронте. Здесь просто хранение FK.

---

## Тесты

### Idempotency cycle миграции

```bash
createdb azarean_test_migrate
psql -U postgres -d azarean_test_migrate -f backend/database/schema.sql
for f in backend/database/migrations/*.sql; do psql -U postgres -d azarean_test_migrate -f "$f" || exit 1; done
for f in backend/database/migrations/*.sql; do psql -U postgres -d azarean_test_migrate -f "$f" || exit 1; done
psql -U postgres -d azarean_test_migrate -c "\d program_templates"
psql -U postgres -d azarean_test_migrate -c "\d program_template_phase_complexes"
psql -U postgres -d azarean_test_migrate -c "\d rehab_programs" | grep program_template_id
psql -U postgres -d azarean_test_migrate -c "\d templates" | grep program_type
dropdb azarean_test_migrate
```

### Backend: новые тесты `rehab.routes.test.js`

```javascript
describe('GET /api/rehab/program-templates', () => {
  beforeEach(async () => {
    await query(`
      INSERT INTO program_templates (code, program_type, title, description, position)
      VALUES
        ('acl_bptb', 'acl', 'ПКС BPTB-графт', 'Шаблон для ПКС с BPTB', 1),
        ('knee_general_v1', 'knee_general', 'Общая колено', 'Базовый шаблон', 2)
      ON CONFLICT (code) DO NOTHING
    `);
  });

  it('возвращает активные шаблоны', async () => {
    const res = await request(app).get('/api/rehab/program-templates').expect(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    const codes = res.body.data.map(t => t.code);
    expect(codes).toContain('acl_bptb');
  });

  it('фильтрует по program_type', async () => {
    const res = await request(app).get('/api/rehab/program-templates?program_type=acl').expect(200);
    res.body.data.forEach(t => {
      expect(t.program_type).toBe('acl');
    });
  });

  it('возвращает joined program_type_label', async () => {
    const res = await request(app).get('/api/rehab/program-templates?program_type=acl').expect(200);
    const tpl = res.body.data.find(t => t.code === 'acl_bptb');
    expect(tpl.program_type_label).toBe('ПКС реабилитация');
  });
});

describe('GET /api/rehab/program-templates/:id/phases', () => {
  let templateId;

  beforeEach(async () => {
    const res = await query(`
      INSERT INTO program_templates (code, program_type, title)
      VALUES ('test_acl', 'acl', 'Test ACL Template') RETURNING id
    `);
    templateId = res.rows[0].id;
  });

  it('возвращает phases для program_type шаблона + recommended complexes', async () => {
    const res = await request(app)
      .get(`/api/rehab/program-templates/${templateId}/phases`)
      .expect(200);

    expect(res.body.data.template.code).toBe('test_acl');
    expect(res.body.data.phases).toBeInstanceOf(Array);
    // Минимум фазы ACL должны быть из seed
    expect(res.body.data.phases.length).toBeGreaterThan(0);
    // recommended_complex может быть null если не задан в junction
    res.body.data.phases.forEach(p => {
      expect(p).toHaveProperty('recommended_complex');
    });
  });

  it('404 если шаблон не найден', async () => {
    await request(app).get('/api/rehab/program-templates/999999/phases').expect(404);
  });

  it('400 на невалидный id', async () => {
    await request(app).get('/api/rehab/program-templates/abc/phases').expect(400);
  });
});

describe('POST /api/rehab/programs — accept program_template_id', () => {
  it('сохраняет program_template_id', async () => {
    const instructor = await createTestInstructor();
    const instructorToken = signToken(instructor.id);
    const patient = await createTestPatient();
    const tplRes = await query(`INSERT INTO program_templates (code, program_type, title) VALUES ('postest', 'acl', 'Post Test') RETURNING id`);
    const templateId = tplRes.rows[0].id;

    const res = await request(app)
      .post('/api/rehab/programs')
      .set('Authorization', `Bearer ${instructorToken}`)
      .send({
        patient_id: patient.id,
        diagnosis: 'Test',
        program_type: 'acl',
        program_template_id: templateId,
        current_phase: 1
      })
      .expect(201);

    expect(res.body.data.program_template_id).toBe(templateId);

    // Cleanup
    await query(`DELETE FROM program_templates WHERE code = 'postest'`);
  });
});
```

---

## NOT TOUCH

- Frontend полностью
- AdminContent (это 1.07)
- RehabProgramModal (это 1.08)
- Существующие миграции

---

## Smoke test

В этом коммите нет UI — smoke сводится к БД + curl.

### Сценарий 1 — миграция применилась

```bash
psql -U postgres -d azarean_rehab -c "\d program_templates"
psql -U postgres -d azarean_rehab -c "\d program_template_phase_complexes"
psql -U postgres -d azarean_rehab -c "\d rehab_programs" | grep program_template_id
psql -U postgres -d azarean_rehab -c "\d templates" | grep program_type
```

**Ожидание:** все 4 структуры на месте.

### Сценарий 2 — endpoint возвращает пустой массив

```bash
curl http://localhost:5000/api/rehab/program-templates | jq
```

**Ожидание:** `{"data": [], "total": 0}` (нет seed'а — это OK, Vadim добавит через AdminContent)

### Сценарий 3 — UI не сломан

Пациент / инструктор UI работает как до — нет UI-зависимых изменений.

---

## Файлы — итоговый чеклист

### Создать
- `backend/database/migrations/20260513_program_templates.sql`

### Изменить
- `backend/routes/rehab.js` — 2 новых endpoint'а + расширение POST /programs
- `backend/tests/__tests__/rehab.routes.test.js` — +7 кейсов
- `CLAUDE.md` — секция «Схема БД» + «API endpoints» обновить

### НЕ ТРОГАТЬ
- Frontend, AdminContent, RehabProgramModal

---

## Текст коммита

```
feat(db, api): шаблоны программ (program_templates) + связи

Wave 1 коммит 1.06 — фундамент блока B.

- Новая таблица program_templates: преднабор «тип + название»
- Junction program_template_phase_complexes: шаблон комплекса
  на каждой фазе шаблона программы
- rehab_programs.program_template_id: tracking источника
- templates.program_type: фильтрация комплексов под тип программы
- 2 публичных endpoint'а: GET /program-templates,
  GET /program-templates/:id/phases (включает recommended complex)
- POST /programs принимает program_template_id

Без seed'а — Vadim наполняет через AdminContent (1.07).
Без UI — RehabProgramModal wizard в 1.08.

Test: backend +7

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

## Пост-коммит

**`CLAUDE.md`:**
- Секция «Схема БД» — добавить program_templates + program_template_phase_complexes
- Секция «API endpoints / Реабилитация» — добавить 2 строки про /program-templates
- Секция «Открытые баги» — Bug #12 уже вычеркнут (1.04)

**Memory:**
- `wave_1_progress.md` — 1.06 → `⏸ заморожен`

---

## Definition of Done

- [ ] Миграция `20260513_program_templates.sql` создана
- [ ] Idempotency cycle пройден (createdb → migrate × 2)
- [ ] 4 структуры созданы: 2 таблицы, 2 ALTER
- [ ] FK constraints работают
- [ ] 2 endpoint'а отвечают корректно (curl)
- [ ] POST /programs принимает и сохраняет program_template_id
- [ ] 7 тестов зелёные, существующие не сломаны
- [ ] CLAUDE.md обновлён
- [ ] Коммит + Co-Authored-By
- [ ] `wave_1_progress.md` обновлён
- [ ] **Push только по «ок»**
