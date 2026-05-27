# TZ Wave 1 · Коммит 1.07 — AdminContent UI для program_templates

**Дата:** 2026-05-12
**Roadmap:** `PATIENT_UX_ROADMAP_2026-05-08_v2.md` пункт #3
**Цель:** в AdminContent добавить вкладку (или секцию) «Шаблоны программ» с полноценным CRUD: создать шаблон, привязать к program_type, задать рекомендованные complex_templates на каждую фазу.
**Объём:** 5-6 часов
**Риск:** средний — много UI-логики, junction-управление через UI

---

## Зависимость

После коммитов 1.01-1.06. Ветка строится от `wave-1/06-program-templates-migration`.

---

## Что блокирует

После 1.06 БД готова к шаблонам программ, но **наполнять можно только через SQL**:
```sql
INSERT INTO program_templates (code, program_type, title) VALUES ('acl_bptb', 'acl', 'ПКС BPTB-графт');
INSERT INTO program_template_phase_complexes (program_template_id, phase_number, complex_template_id) VALUES (...);
```

Это неудобно. Vadim не должен лазить в SQL для добавления шаблона.

**После этого коммита:**
- В AdminContent появляется секция «Шаблоны программ»
- Vadim может: создать новый шаблон, привязать к program_type, описать, задать на каждой фазе рекомендованный template комплекса упражнений (или оставить пустым)
- Удалить (soft-delete is_active=false)
- Дублировать существующий шаблон через variant_of

**Что НЕ делается этим коммитом:**
- RehabProgramModal wizard — это 1.08 (использует уже наполненные шаблоны)
- Stuck detection инструктор — это 1.09
- Контентное наполнение шаблонов — это работа Vadim'а в UI после деплоя волны

---

## Параллельная работа — координация

**ТРОГАЕМ:**
- `backend/routes/admin.js` — endpoints для CRUD program_templates + phase_complexes junction
- `frontend/src/pages/Admin/AdminProgramTemplates.js` (новый компонент)
- `frontend/src/pages/Admin/ProgramTemplateForm.js` (новая модалка)
- `frontend/src/pages/Admin/AdminContent.js` — добавить таб/секцию
- `frontend/src/services/api.js` — admin функции для program_templates
- Тесты

**НЕ ТРОГАТЬ:**
- `routes/rehab.js`
- RehabProgramModal (1.08)
- Pacient'ские экраны
- LOCKED-зоны

---

## Backend — admin endpoints

В `backend/routes/admin.js` добавить:

```javascript
// === program_templates admin CRUD ===

router.get('/program-templates', authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    const result = await query(`
      SELECT pt.*, types.label AS program_type_label, types.joint AS program_joint,
             (SELECT COUNT(*) FROM rehab_programs WHERE program_template_id = pt.id AND is_active = true) AS active_programs_count
      FROM program_templates pt
      LEFT JOIN program_types types ON types.code = pt.program_type
      ORDER BY pt.position ASC, pt.title ASC
    `);
    return res.json({ data: result.rows, total: result.rows.length });
  } catch (err) { next(err); }
});

router.post('/program-templates', authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    const { code, program_type, title, description, surgery_required, default_phase_count, variant_of, position } = req.body;
    if (!code || !program_type || !title) {
      return res.status(400).json({ error: 'ValidationError', message: 'code, program_type, title обязательны' });
    }
    if (!/^[a-z0-9_]{1,50}$/.test(code)) {
      return res.status(400).json({ error: 'ValidationError', message: 'code: lowercase a-z0-9_, 1-50' });
    }
    const ptCheck = await query('SELECT code FROM program_types WHERE code = $1 AND is_active = true', [program_type]);
    if (ptCheck.rows.length === 0) {
      return res.status(400).json({ error: 'ValidationError', message: 'program_type не найден' });
    }
    const result = await query(`
      INSERT INTO program_templates (code, program_type, title, description, surgery_required, default_phase_count, variant_of, position)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *
    `, [code, program_type, title, description || null, surgery_required ?? false, default_phase_count || null, variant_of || null, position ?? 0]);

    await logAdminAction(req.user.id, 'create', 'program_template', result.rows[0].id, { code, title });
    return res.status(201).json({ data: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Conflict', message: 'Код уже существует' });
    }
    next(err);
  }
});

router.put('/program-templates/:id', authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'ValidationError', message: 'Невалидный id' });

    const allowed = ['title', 'description', 'surgery_required', 'default_phase_count', 'variant_of', 'position', 'is_active', 'program_type'];
    const updates = [];
    const params = [id];
    let p = 2;
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        updates.push(`${key} = $${p++}`);
        params.push(req.body[key]);
      }
    }
    if (updates.length === 0) {
      return res.status(400).json({ error: 'ValidationError', message: 'Нет полей' });
    }
    updates.push('updated_at = NOW()');

    const result = await query(
      `UPDATE program_templates SET ${updates.join(', ')} WHERE id = $1 RETURNING *`,
      params
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'NotFound', message: 'Не найден' });
    }
    await logAdminAction(req.user.id, 'update', 'program_template', id, { changes: req.body });
    return res.json({ data: result.rows[0] });
  } catch (err) { next(err); }
});

router.delete('/program-templates/:id', authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'ValidationError', message: 'Невалидный id' });

    // Проверка использования
    const usage = await query(
      `SELECT COUNT(*) AS c FROM rehab_programs WHERE program_template_id = $1 AND is_active = true AND status = 'active'`,
      [id]
    );
    if (parseInt(usage.rows[0].c) > 0) {
      return res.status(409).json({
        error: 'Conflict',
        message: `Шаблон используется в ${usage.rows[0].c} активных программах. Деактивация невозможна.`
      });
    }
    const result = await query(
      `UPDATE program_templates SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING id`,
      [id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'NotFound', message: 'Не найден' });
    await logAdminAction(req.user.id, 'deactivate', 'program_template', id, {});
    return res.json({ data: { id, deactivated: true } });
  } catch (err) { next(err); }
});

// === phase_complexes junction ===

router.get('/program-templates/:id/phase-complexes', authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'ValidationError' });

    const result = await query(`
      SELECT pc.id, pc.phase_number, pc.complex_template_id, pc.is_recommended, pc.notes,
             t.name AS template_name, t.description AS template_description
      FROM program_template_phase_complexes pc
      LEFT JOIN templates t ON t.id = pc.complex_template_id
      WHERE pc.program_template_id = $1
      ORDER BY pc.phase_number
    `, [id]);
    return res.json({ data: result.rows, total: result.rows.length });
  } catch (err) { next(err); }
});

router.put('/program-templates/:id/phase-complexes/:phase', authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const phaseNumber = parseInt(req.params.phase);
    if (isNaN(id) || isNaN(phaseNumber)) {
      return res.status(400).json({ error: 'ValidationError' });
    }
    const { complex_template_id, is_recommended, notes } = req.body;

    // UPSERT — если запись для (id, phase) есть → UPDATE, иначе INSERT
    const result = await query(`
      INSERT INTO program_template_phase_complexes (program_template_id, phase_number, complex_template_id, is_recommended, notes)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (program_template_id, phase_number)
      DO UPDATE SET
        complex_template_id = EXCLUDED.complex_template_id,
        is_recommended = EXCLUDED.is_recommended,
        notes = EXCLUDED.notes
      RETURNING *
    `, [id, phaseNumber, complex_template_id || null, is_recommended ?? true, notes || null]);

    await logAdminAction(req.user.id, 'upsert', 'phase_complex', id, { phase_number: phaseNumber, complex_template_id });
    return res.json({ data: result.rows[0] });
  } catch (err) { next(err); }
});

router.delete('/program-templates/:id/phase-complexes/:phase', authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const phaseNumber = parseInt(req.params.phase);
    if (isNaN(id) || isNaN(phaseNumber)) {
      return res.status(400).json({ error: 'ValidationError' });
    }
    const result = await query(`
      DELETE FROM program_template_phase_complexes
      WHERE program_template_id = $1 AND phase_number = $2 RETURNING id
    `, [id, phaseNumber]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'NotFound' });
    }
    return res.json({ data: { deleted: true } });
  } catch (err) { next(err); }
});
```

---

## Frontend — компонент `AdminProgramTemplates.js`

Создать `frontend/src/pages/Admin/AdminProgramTemplates.js`:

Компонент состоит из:
1. **Таблица шаблонов** — список с колонками: код · название · тип программы · #фаз · использований
2. **Кнопка «Добавить шаблон»** → модалка ProgramTemplateForm
3. **На каждой строке:**
   - ✏ редактировать (модалка)
   - 📋 управление phase_complexes (раскрывающаяся секция или sub-modal)
   - 🚫 деактивировать (если нет активных программ)

### Sub-секция — phase_complexes management

При выборе шаблона показывается список фаз (берётся из `rehab_phases` по `program_type` шаблона) с возможностью:
- На каждой фазе — select рекомендованного `complex_template_id` из списка templates (filtered by program_type шаблона)
- Заметка для куратора (notes textarea)
- Tap «Сохранить» → PUT `/api/admin/program-templates/:id/phase-complexes/:phase`

### Пример структуры компонента

```javascript
function AdminProgramTemplates() {
  const [templates, setTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState(null);
  const [phaseComplexes, setPhaseComplexes] = useState({});
  const [phases, setPhases] = useState([]);
  const [allComplexTemplates, setAllComplexTemplates] = useState([]); // для select на фазах
  const [programTypes, setProgramTypes] = useState([]);

  // ... загрузка списков, обработчики create/edit/delete

  return (
    <div className="admin-section">
      <div className="admin-section__header">
        <h3>Шаблоны программ</h3>
        <button onClick={() => setCreating(true)}>+ Добавить шаблон</button>
      </div>

      <table className="admin-table">
        {/* строки шаблонов с разворачивающимся sub-section */}
      </table>

      {selectedTemplateId && (
        <PhaseComplexEditor
          templateId={selectedTemplateId}
          phases={phases}
          allComplexTemplates={allComplexTemplates}
          phaseComplexes={phaseComplexes}
          onUpdate={(phase, data) => savePhaseComplex(selectedTemplateId, phase, data)}
        />
      )}

      {(creating || editing) && (
        <ProgramTemplateForm
          initial={editing}
          programTypes={programTypes}
          allTemplates={templates}
          onSubmit={handleSubmit}
          onCancel={() => { setCreating(false); setEditing(null); }}
        />
      )}
    </div>
  );
}
```

Точный layout — задизайнить в стиле AdminContent (CSS Modules, темная тема). Можно сделать модалкой раскрывающейся (как существующие AdminUserModal pattern).

### Изменения в `services/api.js`

```javascript
adminApi: {
  // existing...
  getProgramTemplates: () => api.get('/admin/program-templates').then(r => r.data),
  createProgramTemplate: (data) => api.post('/admin/program-templates', data).then(r => r.data),
  updateProgramTemplate: (id, data) => api.put(`/admin/program-templates/${id}`, data).then(r => r.data),
  deleteProgramTemplate: (id) => api.delete(`/admin/program-templates/${id}`).then(r => r.data),
  getPhaseComplexes: (templateId) => api.get(`/admin/program-templates/${templateId}/phase-complexes`).then(r => r.data),
  upsertPhaseComplex: (templateId, phaseNumber, data) =>
    api.put(`/admin/program-templates/${templateId}/phase-complexes/${phaseNumber}`, data).then(r => r.data),
  deletePhaseComplex: (templateId, phaseNumber) =>
    api.delete(`/admin/program-templates/${templateId}/phase-complexes/${phaseNumber}`).then(r => r.data),
}
```

---

## Тесты

### Backend: `admin.routes.test.js` расширение

```javascript
describe('Admin program_templates CRUD', () => {
  let adminToken;
  beforeEach(async () => {
    adminToken = signToken((await createTestAdmin()).id);
  });

  it('GET /api/admin/program-templates возвращает все', async () => {
    const res = await request(app)
      .get('/api/admin/program-templates')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body.data).toBeInstanceOf(Array);
  });

  it('POST создаёт шаблон', async () => {
    const res = await request(app)
      .post('/api/admin/program-templates')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: 'test_acl_v1', program_type: 'acl', title: 'Test ACL' })
      .expect(201);
    expect(res.body.data.code).toBe('test_acl_v1');
    await query(`DELETE FROM program_templates WHERE code = 'test_acl_v1'`);
  });

  it('POST 400 если program_type не существует', async () => {
    await request(app)
      .post('/api/admin/program-templates')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: 'bad_type', program_type: 'fake_xxx', title: 'X' })
      .expect(400);
  });

  it('POST 409 на дубль code', async () => {
    await query(`INSERT INTO program_templates (code, program_type, title) VALUES ('dup_test', 'acl', 'Dup')`);
    await request(app)
      .post('/api/admin/program-templates')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: 'dup_test', program_type: 'acl', title: 'Dup 2' })
      .expect(409);
    await query(`DELETE FROM program_templates WHERE code = 'dup_test'`);
  });

  it('PUT обновляет title', async () => {
    const ins = await query(`INSERT INTO program_templates (code, program_type, title) VALUES ('upd_test', 'acl', 'Old') RETURNING id`);
    const id = ins.rows[0].id;
    const res = await request(app)
      .put(`/api/admin/program-templates/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'New title' })
      .expect(200);
    expect(res.body.data.title).toBe('New title');
    await query(`DELETE FROM program_templates WHERE id = $1`, [id]);
  });

  it('DELETE деактивирует если нет активных программ', async () => {
    const ins = await query(`INSERT INTO program_templates (code, program_type, title) VALUES ('del_test', 'acl', 'Del') RETURNING id`);
    const id = ins.rows[0].id;
    await request(app)
      .delete(`/api/admin/program-templates/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    await query(`DELETE FROM program_templates WHERE id = $1`, [id]);
  });

  it('PUT phase-complexes upsert работает', async () => {
    const ins = await query(`INSERT INTO program_templates (code, program_type, title) VALUES ('pc_test', 'acl', 'PC') RETURNING id`);
    const id = ins.rows[0].id;
    // Создать template комплекса для теста
    const tpl = await query(`INSERT INTO templates (name) VALUES ('Complex tpl') RETURNING id`);
    const tplId = tpl.rows[0].id;

    // Первый upsert — создание
    const r1 = await request(app)
      .put(`/api/admin/program-templates/${id}/phase-complexes/1`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ complex_template_id: tplId, is_recommended: true, notes: 'Note 1' })
      .expect(200);
    expect(r1.body.data.notes).toBe('Note 1');

    // Второй upsert на ту же (id, phase) — должен обновить
    const r2 = await request(app)
      .put(`/api/admin/program-templates/${id}/phase-complexes/1`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ complex_template_id: tplId, notes: 'Note 2 updated' })
      .expect(200);
    expect(r2.body.data.notes).toBe('Note 2 updated');

    // Cleanup
    await query(`DELETE FROM program_templates WHERE id = $1`, [id]);
    await query(`DELETE FROM templates WHERE id = $1`, [tplId]);
  });

  it('requireAdmin на всех endpoints', async () => {
    const instructorToken = signToken((await createTestInstructor()).id);
    await request(app)
      .post('/api/admin/program-templates')
      .set('Authorization', `Bearer ${instructorToken}`)
      .send({ code: 'x', program_type: 'acl', title: 'y' })
      .expect(403);
  });
});
```

### Frontend smoke-render (если есть AdminPanel.test.js)

Минимально:

```javascript
import { adminApi } from '../../services/api';
jest.mock('../../services/api', () => ({
  adminApi: {
    getProgramTemplates: jest.fn(() => Promise.resolve({ data: [
      { id: 1, code: 'acl_bptb', title: 'ACL BPTB', program_type: 'acl', program_type_label: 'ПКС' }
    ] })),
    getProgramTypes: jest.fn(() => Promise.resolve({ data: [] })),
  },
}));

describe('AdminProgramTemplates', () => {
  it('рендерит таблицу шаблонов', async () => {
    render(<AdminProgramTemplates />);
    expect(await screen.findByText('ACL BPTB')).toBeInTheDocument();
  });
});
```

---

## NOT TOUCH

- `routes/rehab.js` (всё в 1.06)
- RehabProgramModal (это 1.08)
- Pacient'ские экраны
- LOCKED-зоны

---

## Smoke test (в реальном браузере)

### Сценарий 1 — секция шаблонов видна

1. Войти как админ vadim@azarean.com
2. /admin → Content / Phases / Шаблоны программ
3. **Ожидание:** таблица (изначально пустая), кнопка «Добавить шаблон»

### Сценарий 2 — создать шаблон

1. + Добавить шаблон → модалка
2. code=`acl_bptb`, program_type=acl, title=«ПКС BPTB-графт», description=«Шаблон для ПКС с BPTB графтом»
3. Сохранить
4. **Ожидание:** новая строка в таблице

### Сценарий 3 — задать рекомендованный complex template на фазу

1. Развернуть шаблон acl_bptb → видны 6 фаз ACL
2. На фазе 1: select existing template (если есть в БД, иначе нужно сначала создать template через CreateComplex или AdminTemplates)
3. Сохранить
4. **Ожидание:** запись в `program_template_phase_complexes` создана, refresh показывает выбранный template

### Сценарий 4 — попытка удалить используемый шаблон

1. Привязать программу к шаблону (через SQL для теста):
   ```sql
   UPDATE rehab_programs SET program_template_id = (SELECT id FROM program_templates WHERE code = 'acl_bptb') WHERE id = (SELECT id FROM rehab_programs LIMIT 1);
   ```
2. Попробовать деактивировать шаблон через UI
3. **Ожидание:** 409 ошибка «используется в 1 активной программе»
4. Откатить SQL

### Сценарий 5 — popup валидация

1. Создать шаблон с code=`bad code!`
2. **Ожидание:** 400 error «code: lowercase a-z0-9_»

### Сценарий 6 — невалидный program_type

1. Создать шаблон с program_type=«несуществующий»
2. **Ожидание:** 400 error

### Сценарий 7 — dark theme + mobile

Проверить визуально.

---

## Файлы — итоговый чеклист

### Создать
- `frontend/src/pages/Admin/AdminProgramTemplates.js`
- `frontend/src/pages/Admin/ProgramTemplateForm.js`
- `frontend/src/pages/Admin/PhaseComplexEditor.js` (или встроить в AdminProgramTemplates)
- Опционально CSS-модуль для них

### Изменить
- `backend/routes/admin.js` — 7 endpoint'ов
- `backend/tests/__tests__/admin.routes.test.js` — +7 тестов
- `frontend/src/services/api.js` — добавить adminApi функции
- `frontend/src/pages/Admin/AdminContent.js` — добавить секцию/таб
- `CLAUDE.md` — обновить «API endpoints / Admin»

### НЕ ТРОГАТЬ
- `routes/rehab.js`
- RehabProgramModal
- Pacient'ские экраны

---

## Текст коммита

```
feat(admin): CRUD UI для шаблонов программ + phase_complexes

Wave 1 коммит 1.07.

- 7 admin endpoint'ов для program_templates и phase_complexes
- AdminProgramTemplates: таблица шаблонов + create/edit/deactivate
- PhaseComplexEditor: на каждой фазе — выбор recommended template
- Защита от деактивации используемых шаблонов (409)
- Audit log для всех изменений

Готовит почву для RehabProgramModal wizard (1.08).

Test: backend +7, frontend +1 smoke

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

## Пост-коммит

**`CLAUDE.md`:** добавить 7 строк API endpoints, описание AdminProgramTemplates компонента
**Memory:** `wave_1_progress.md` → 1.07 ⏸

---

## Definition of Done

- [ ] 7 backend endpoint'ов работают, тестируются
- [ ] UI компонент рендерит таблицу, модалки create/edit работают
- [ ] PhaseComplexEditor работает upsert/delete
- [ ] Защита 409 при использовании шаблона
- [ ] Audit log записывает изменения
- [ ] 7 backend тестов зелёные
- [ ] 1+ frontend smoke
- [ ] Smoke сценарии 1-7 в браузере
- [ ] CLAUDE.md обновлён
- [ ] Коммит + Co-Authored-By
- [ ] wave_1_progress.md → 1.07 ⏸
- [ ] **Push только по «ок»**
