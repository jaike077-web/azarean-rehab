# TZ Wave 1 · Коммит 1.05 — AdminContent: phases CRUD с program_type + program_types микро-CRUD

**Дата:** 2026-05-12
**Roadmap:** `PATIENT_UX_ROADMAP_2026-05-08_v2.md` пункт #3 (AdminContent UI)
**Цель:** в AdminContent (`/admin` → таб Phases) добавить колонку `program_type` в таблицу/форму phases. Дополнительно — микро-CRUD для самих `program_types` (добавить новый тип, переименовать label, деактивировать). После этого коммита Vadim может сам добавлять патологии через UI без SQL.
**Объём:** 4-5 часов
**Риск:** средний — AdminContent UI большой компонент, требует аккуратной работы

---

## Зависимость

После коммитов 1.01-1.04. Ветка строится от `wave-1/04-roadmap-telegram-dynamic`.

---

## Что блокирует

После 1.04 multi-protocol foundation готов: справочник есть, фронт и бот динамические. Но **наполнять справочник Vadim'у пока только через SQL** (`INSERT INTO program_types VALUES ...`). Это:
- Неудобно для расширения
- Требует доступа к VDS / pgAdmin
- Не масштабируется (после Wave 1B будет нужно добавлять много шаблонов программ)

И аналогично — **phases** для нового program_type Vadim сейчас может создавать только через SQL. Существующий AdminContent → Phases имеет CRUD для phases в рамках одного программ_type='acl', но колонки program_type там нет.

**После этого коммита:**
- AdminContent → Phases CRUD расширен колонкой program_type (filter + edit + add)
- Микро-секция вверху страницы Phases: CRUD program_types (table + add/edit/deactivate)
- Vadim может через UI:
  - Добавить новый program_type (например, `meniscus_partial`, label «Частичная меннисэктомия»)
  - Залить фазы для этого нового типа
  - Деактивировать неактуальные program_types (is_active=false)

**Что НЕ делается этим коммитом:**
- Шаблоны программ (program_templates) — это коммит 1.06
- Связь templates ↔ program_types (templates.program_type FK) — это коммит 1.06
- AdminContent UI для program_templates — это коммит 1.07
- RehabProgramModal wizard — это коммит 1.08

---

## Параллельная работа — координация

**ТРОГАЕМ:**
- `backend/routes/admin.js` — endpoints для program_types CRUD + phases расширение для filter by program_type
- `frontend/src/pages/Admin/AdminContent.js` (или подкомпоненты Phases — уточнить структуру) — UI таблицы phases + микро-CRUD program_types
- `frontend/src/services/api.js` — добавить admin функции `getProgramTypes`, `createProgramType`, `updateProgramType`, `deleteProgramType` (deactivate)
- `backend/tests/__tests__/admin.routes.test.js` — расширение
- `frontend/src/pages/Admin/AdminPanel.test.js` — расширение (если actively тестируется)

**НЕ ТРОГАТЬ:**
- `routes/rehab.js` (всё в 1.01-1.04)
- Frontend HomeScreen / RoadmapScreen / Telegram bot
- LOCKED-зоны
- `program_templates` — это 1.06
- Migrations — миграция 1.01 уже залила program_types

---

## Backend — endpoints

### 1. CRUD для program_types

В `backend/routes/admin.js` добавить:

```javascript
// === program_types CRUD (admin only) ===

// GET /api/admin/program-types — список всех (включая is_active=false)
router.get('/program-types', authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    const result = await query(
      `SELECT code, label, joint, body_side_relevant, surgery_required,
              is_active, position, created_at, updated_at
       FROM program_types
       ORDER BY position ASC, code ASC`
    );
    return res.json({ data: result.rows, total: result.rows.length });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/program-types — создать новый
router.post('/program-types', authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    const { code, label, joint, body_side_relevant, surgery_required, position } = req.body;

    if (!code || !label) {
      return res.status(400).json({ error: 'ValidationError', message: 'code и label обязательны' });
    }
    // Code валидация: только lowercase a-z0-9_, max 50
    if (!/^[a-z0-9_]{1,50}$/.test(code)) {
      return res.status(400).json({
        error: 'ValidationError',
        message: 'code должен быть lowercase a-z0-9_ длиной 1-50'
      });
    }

    const result = await query(
      `INSERT INTO program_types (code, label, joint, body_side_relevant, surgery_required, position)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [code, label, joint || null, body_side_relevant ?? true, surgery_required ?? false, position ?? 0]
    );

    // Audit log
    await logAdminAction(req.user.id, 'create', 'program_type', null, { code, label });

    return res.status(201).json({ data: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Conflict', message: 'Код уже существует' });
    }
    next(err);
  }
});

// PUT /api/admin/program-types/:code — обновить label/joint/etc (не сам code)
router.put('/program-types/:code', authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    const { code } = req.params;
    const { label, joint, body_side_relevant, surgery_required, position, is_active } = req.body;

    // buildPatch pattern для частичного обновления
    const updates = [];
    const params = [code];
    let p = 2;
    for (const [key, value] of Object.entries({ label, joint, body_side_relevant, surgery_required, position, is_active })) {
      if (value !== undefined) {
        updates.push(`${key} = $${p++}`);
        params.push(value);
      }
    }
    if (updates.length === 0) {
      return res.status(400).json({ error: 'ValidationError', message: 'Нет полей для обновления' });
    }
    updates.push('updated_at = NOW()');

    const result = await query(
      `UPDATE program_types SET ${updates.join(', ')} WHERE code = $1 RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'NotFound', message: 'Program type не найден' });
    }

    await logAdminAction(req.user.id, 'update', 'program_type', null, { code, changes: req.body });

    return res.json({ data: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/admin/program-types/:code — soft delete (is_active=false)
// НЕ удаляем физически — на код могут ссылаться программы и phases
router.delete('/program-types/:code', authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    const { code } = req.params;

    // Проверка что есть активные программы с этим типом
    const usageCheck = await query(
      `SELECT COUNT(*) AS active_programs FROM rehab_programs
       WHERE program_type = $1 AND is_active = true AND status = 'active'`,
      [code]
    );
    if (parseInt(usageCheck.rows[0].active_programs) > 0) {
      return res.status(409).json({
        error: 'Conflict',
        message: `Тип используется в ${usageCheck.rows[0].active_programs} активных программах. Сначала переведите программы на другой тип.`
      });
    }

    const result = await query(
      `UPDATE program_types SET is_active = false, updated_at = NOW()
       WHERE code = $1 RETURNING code`,
      [code]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'NotFound', message: 'Не найден' });
    }

    await logAdminAction(req.user.id, 'deactivate', 'program_type', null, { code });

    return res.json({ data: { code, deactivated: true } });
  } catch (err) {
    next(err);
  }
});
```

### 2. Расширение phases CRUD — поддержка фильтра program_type

Найти существующий блок phases в `routes/admin.js` (`GET /api/admin/phases`, `POST /api/admin/phases`, etc.) — около строки 434+ по brief'у.

В `GET /api/admin/phases` добавить опциональный фильтр `?program_type=...`:

```javascript
router.get('/phases', authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    const { program_type } = req.query;
    let sql = `SELECT * FROM rehab_phases`;
    const params = [];
    if (program_type) {
      sql += ` WHERE program_type = $1`;
      params.push(program_type);
    }
    sql += ` ORDER BY program_type, phase_number`;

    const result = await query(sql, params);
    return res.json({ data: result.rows, total: result.rows.length });
  } catch (err) {
    next(err);
  }
});
```

В `POST /api/admin/phases` принимать `program_type` (он уже в schema, проверить что валидация требует его):

```javascript
const { program_type, phase_number, title, ...rest } = req.body;
if (!program_type || !phase_number || !title) {
  return res.status(400).json({ error: 'ValidationError', message: 'program_type, phase_number, title обязательны' });
}
// Валидация что program_type существует в справочнике (FK сделает то же, но явно)
const ptCheck = await query('SELECT code FROM program_types WHERE code = $1', [program_type]);
if (ptCheck.rows.length === 0) {
  return res.status(400).json({ error: 'ValidationError', message: 'program_type не найден в справочнике' });
}
// INSERT с program_type
```

В `PUT /api/admin/phases/:id` тоже разрешить менять program_type (по необходимости).

---

## Frontend — AdminContent UI

### Структура раздела Phases (после изменений)

```
AdminContent → таб "Phases"
├── Микро-секция «Типы программ» (новая)
│   ├── Таблица: код · название · joint · активен
│   ├── Кнопки: + Добавить тип · ✏ редактировать · 🚫 деактивировать
│   └── Модалка ProgramTypeForm
└── Секция «Фазы реабилитации» (расширенная)
    ├── Filter: select [Все / acl / knee_general / shoulder_general / ...]
    ├── Таблица: тип · номер · название · длительность · …
    ├── Кнопки: + Добавить фазу · ✏ ред · 🗑 удалить
    └── Модалка PhaseForm — теперь с полем program_type (select)
```

### Файлы фронтенда

Точная структура AdminContent неизвестна без grep'а кода. Скорее всего:
- `frontend/src/pages/Admin/AdminContent.js` — главный компонент
- Подкомпоненты для каждой вкладки: `AdminPhases`, `AdminTips`, и т.д.

Если `AdminPhases.js` уже существует — расширяем его. Если нет — добавляем секции прямо в AdminContent.js (хотя это раздувает файл, лучше отдельный компонент).

**Минимальный подход:**

Создать новый компонент `frontend/src/pages/Admin/AdminProgramTypes.js`:

```javascript
import React, { useEffect, useState, useCallback } from 'react';
import { Plus, Pencil, Ban, Check } from 'lucide-react';
import { adminApi } from '../../services/api';
import ProgramTypeForm from './ProgramTypeForm'; // новая модалка

function AdminProgramTypes({ onProgramTypeChange }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.getProgramTypes();
      setItems(res.data || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSubmit = async (data) => {
    if (editing) {
      await adminApi.updateProgramType(editing.code, data);
    } else {
      await adminApi.createProgramType(data);
    }
    setEditing(null);
    setCreating(false);
    await load();
    onProgramTypeChange?.();
  };

  const handleDeactivate = async (code) => {
    if (!confirm(`Деактивировать тип "${code}"?`)) return;
    try {
      await adminApi.deleteProgramType(code);
      await load();
    } catch (err) {
      alert(err?.message || 'Ошибка');
    }
  };

  return (
    <div className="admin-section">
      <div className="admin-section__header">
        <h3>Типы программ</h3>
        <button className="btn-primary" onClick={() => setCreating(true)}>
          <Plus size={16} /> Добавить тип
        </button>
      </div>

      {loading ? <p>Загрузка…</p> : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>Код</th><th>Название</th><th>Сустав</th><th>Хирургия</th><th>Активен</th><th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((pt) => (
              <tr key={pt.code} className={pt.is_active ? '' : 'is-inactive'}>
                <td><code>{pt.code}</code></td>
                <td>{pt.label}</td>
                <td>{pt.joint}</td>
                <td>{pt.surgery_required ? '✓' : '—'}</td>
                <td>{pt.is_active ? <Check size={14} /> : <Ban size={14} />}</td>
                <td className="admin-table__actions">
                  <button onClick={() => setEditing(pt)} title="Редактировать">
                    <Pencil size={14} />
                  </button>
                  {pt.is_active && (
                    <button onClick={() => handleDeactivate(pt.code)} title="Деактивировать">
                      <Ban size={14} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {(editing || creating) && (
        <ProgramTypeForm
          initial={editing}
          onSubmit={handleSubmit}
          onCancel={() => { setEditing(null); setCreating(false); }}
        />
      )}
    </div>
  );
}

export default AdminProgramTypes;
```

И отдельный `ProgramTypeForm.js` — простая модалка с полями code (только при создании), label, joint, body_side_relevant, surgery_required, position.

### Изменения в существующей секции Phases

В компоненте управления phases (где он живёт):
1. Добавить filter dropdown по program_type:
   ```jsx
   <select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
     <option value="">Все типы</option>
     {programTypes.map(pt => (
       <option key={pt.code} value={pt.code}>{pt.label}</option>
     ))}
   </select>
   ```
2. В колонке таблицы phases добавить «Тип» (отображать `phase.program_type` или соответствующий label)
3. В форме создания/редактирования фазы добавить select поля `program_type` (если не было)

### Изменения в `services/api.js`

Добавить admin функции:

```javascript
export const adminApi = {
  // existing...
  getProgramTypes: () => api.get('/admin/program-types').then(r => r.data),
  createProgramType: (data) => api.post('/admin/program-types', data).then(r => r.data),
  updateProgramType: (code, data) => api.put(`/admin/program-types/${code}`, data).then(r => r.data),
  deleteProgramType: (code) => api.delete(`/admin/program-types/${code}`).then(r => r.data),
};
```

---

## Тесты

### Backend: `admin.routes.test.js`

Добавить новый `describe`-блок `program_types CRUD`:

```javascript
describe('Admin program_types CRUD', () => {
  let admin, adminToken;

  beforeEach(async () => {
    admin = await createTestAdmin();
    adminToken = signToken(admin.id);
  });

  it('GET /api/admin/program-types возвращает все типы включая is_active=false', async () => {
    await query(`UPDATE program_types SET is_active = false WHERE code = 'shoulder_general'`);
    const res = await request(app)
      .get('/api/admin/program-types')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(3);
    await query(`UPDATE program_types SET is_active = true WHERE code = 'shoulder_general'`);
  });

  it('POST создаёт новый program_type', async () => {
    const res = await request(app)
      .post('/api/admin/program-types')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: 'meniscus_partial', label: 'Частичная меннисэктомия', joint: 'knee', surgery_required: true })
      .expect(201);
    expect(res.body.data.code).toBe('meniscus_partial');
    // Cleanup
    await query(`DELETE FROM program_types WHERE code = 'meniscus_partial'`);
  });

  it('POST отдаёт 409 при дубле code', async () => {
    await request(app)
      .post('/api/admin/program-types')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: 'acl', label: 'Дубль' })
      .expect(409);
  });

  it('POST валидирует формат code (только a-z0-9_)', async () => {
    await request(app)
      .post('/api/admin/program-types')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: 'Wrong Code!', label: 'Test' })
      .expect(400);
  });

  it('PUT обновляет label', async () => {
    const res = await request(app)
      .put('/api/admin/program-types/knee_general')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ label: 'Реабилитация колена (общая)' })
      .expect(200);
    expect(res.body.data.label).toBe('Реабилитация колена (общая)');
    // Restore
    await query(`UPDATE program_types SET label = 'Реабилитация колена' WHERE code = 'knee_general'`);
  });

  it('DELETE деактивирует если нет активных программ', async () => {
    // Создать временный тип без программ
    await query(`INSERT INTO program_types (code, label, joint) VALUES ('temp_test', 'Test', 'knee')`);
    const res = await request(app)
      .delete('/api/admin/program-types/temp_test')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body.data.deactivated).toBe(true);
    // Cleanup
    await query(`DELETE FROM program_types WHERE code = 'temp_test'`);
  });

  it('DELETE отдаёт 409 если есть активные программы', async () => {
    // У 'acl' могут быть активные программы в тесте
    const usage = await query(`SELECT COUNT(*) AS c FROM rehab_programs WHERE program_type = 'acl' AND is_active = true AND status = 'active'`);
    if (parseInt(usage.rows[0].c) > 0) {
      await request(app)
        .delete('/api/admin/program-types/acl')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(409);
    }
  });

  it('Все endpoints требуют requireAdmin', async () => {
    const instructorToken = signToken((await createTestInstructor()).id);
    await request(app)
      .post('/api/admin/program-types')
      .set('Authorization', `Bearer ${instructorToken}`)
      .send({ code: 'x', label: 'y' })
      .expect(403);
  });
});

describe('Admin phases — расширение фильтром program_type', () => {
  it('GET /api/admin/phases?program_type=acl фильтрует', async () => {
    const adminToken = signToken((await createTestAdmin()).id);
    const res = await request(app)
      .get('/api/admin/phases?program_type=acl')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    res.body.data.forEach(phase => {
      expect(phase.program_type).toBe('acl');
    });
  });

  it('POST /api/admin/phases требует валидный program_type', async () => {
    const adminToken = signToken((await createTestAdmin()).id);
    await request(app)
      .post('/api/admin/phases')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ program_type: 'nonexistent', phase_number: 1, title: 'Test' })
      .expect(400);
  });
});
```

### Frontend: тесты для `AdminProgramTypes.js` (если actively тестируется)

Минимальный smoke-render:

```javascript
import { adminApi } from '../../services/api';
jest.mock('../../services/api', () => ({
  adminApi: {
    getProgramTypes: jest.fn(() => Promise.resolve({ data: [
      { code: 'acl', label: 'ПКС', joint: 'knee', is_active: true, surgery_required: true }
    ] })),
  },
}));

describe('AdminProgramTypes', () => {
  it('рендерит таблицу типов программ', async () => {
    render(<AdminProgramTypes />);
    expect(await screen.findByText('ПКС')).toBeInTheDocument();
    expect(screen.getByText('knee')).toBeInTheDocument();
  });
});
```

---

## NOT TOUCH

- `routes/rehab.js`
- HomeScreen / RoadmapScreen / Telegram bot
- LOCKED-зоны
- `program_templates` (1.06)
- Существующие миграции

---

## Smoke test (в реальном браузере)

### Сценарий 1 — таблица program_types видна

1. Войти как админ vadim@azarean.com / Test1234
2. /admin → Phases (или Content)
3. **Ожидание:** сверху таблица «Типы программ» с 3 строками (acl/knee_general/shoulder_general), кнопка «Добавить тип»

### Сценарий 2 — создать новый program_type

1. Кнопка «Добавить тип» → модалка
2. Заполнить: code=`meniscus_partial`, label=«Частичная меннисэктомия», joint=knee, surgery_required=true
3. Сохранить
4. **Ожидание:** появилась 4-я строка в таблице. Audit log зафиксировал.

### Сценарий 3 — добавить фазу для нового program_type

1. В секции «Фазы реабилитации» нажать «Добавить фазу»
2. В select program_type выбрать `meniscus_partial`
3. Заполнить phase_number=1, title=«Фаза 1 — Защита», duration_weeks=2
4. Сохранить
5. **Ожидание:** фаза появилась в таблице. Фильтр «meniscus_partial» показывает только её.

### Сценарий 4 — попытка деактивировать тип используемый программами

1. Попробовать деактивировать `acl` (если есть активные ACL программы)
2. **Ожидание:** 409 ошибка «используется в N активных программах»

### Сценарий 5 — попытка дублирующего кода

1. «Добавить тип» с code=`acl`
2. **Ожидание:** 409 ошибка «Код уже существует»

### Сценарий 6 — невалидный формат code

1. «Добавить тип» с code=«Wrong Code!»
2. **Ожидание:** 400 ошибка «code должен быть lowercase a-z0-9_»

### Сценарий 7 — dark theme + mobile

1. Toggle dark theme
2. Проверить читаемость таблицы program_types и phases
3. Mobile viewport — таблицы возможно скроллируются горизонтально, не ломаются

### Сценарий 8 — пациент после добавления нового типа

1. После создания meniscus_partial и фазы 1
2. В dev-БД: `UPDATE rehab_programs SET program_type = 'meniscus_partial' WHERE patient_id = (SELECT id FROM patients WHERE email = 'avi707@mail.ru')`
3. Войти как пациент → Roadmap
4. **Ожидание:** показана фаза «Фаза 1 — Защита» для meniscus_partial
5. **Откатить:** `UPDATE ... SET program_type = 'acl'`

---

## Файлы — итоговый чеклист

### Создать
- `frontend/src/pages/Admin/AdminProgramTypes.js` — компонент управления типами
- `frontend/src/pages/Admin/ProgramTypeForm.js` — модалка create/edit
- `frontend/src/pages/Admin/AdminProgramTypes.test.js` — smoke-render тест (опционально)

### Изменить
- `backend/routes/admin.js` — 4 endpoint'а для program_types + расширение GET /phases filter
- `backend/tests/__tests__/admin.routes.test.js` — +9 кейсов
- `frontend/src/services/api.js` — добавить adminApi.getProgramTypes/create/update/delete
- `frontend/src/pages/Admin/AdminContent.js` (или AdminPhases подкомпонент) — добавить AdminProgramTypes секцию + filter в Phases + поле program_type в форме фазы
- `CLAUDE.md` — секция «API endpoints / Admin» добавить 4 строки про program-types

### НЕ ТРОГАТЬ
- `routes/rehab.js`, frontend Pacient'ские экраны, LOCKED-зоны

---

## Текст коммита

```
feat(admin): CRUD для program_types + фильтр phases по типу

Wave 1 коммит 1.05 — последний коммит блока A.

- 4 admin endpoint'а: GET/POST/PUT/DELETE /api/admin/program-types
  (DELETE = soft-delete is_active=false, блокируется если есть
  активные программы с этим типом)
- AdminProgramTypes компонент: таблица + create/edit модалка
- AdminPhases расширен фильтром program_type + поле в форме фазы
- Audit log для всех изменений типов

Vadim теперь может через UI добавлять патологии без SQL.
Готовит почву для шаблонов программ (блок B, 1.06+).

Test: backend +9, frontend +1 smoke

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

## Пост-коммит

**`CLAUDE.md`:**
- Секция «API endpoints / Admin» — добавить 4 строки про `/admin/program-types`
- Секция «Завершённые исправления» — запись про 1.05

**Memory:**
- `wave_1_progress.md` — 1.05 → `⏸ заморожен`
- `memory/wave_1_block_a_done.md` — короткая запись «Блок A Wave 1 готов, фундамент multi-protocol заложен, Vadim может создавать program_types через UI»

---

## Definition of Done

- [ ] 4 backend endpoint'а работают и тестируются
- [ ] GET /phases поддерживает фильтр program_type
- [ ] POST /phases валидирует наличие program_type в справочнике
- [ ] AdminProgramTypes компонент рендерит таблицу + модалка работает
- [ ] AdminPhases фильтр + поле program_type в форме работают
- [ ] 9 backend тестов зелёные
- [ ] 1 frontend smoke-test зелёный
- [ ] Audit log записывает create/update/deactivate
- [ ] Smoke сценарии 1-8 пройдены в браузере
- [ ] CLAUDE.md обновлён
- [ ] Коммит создан + Co-Authored-By
- [ ] `wave_1_progress.md` обновлён: 1.05 → `⏸ заморожен`
- [ ] Создан `memory/wave_1_block_a_done.md`
- [ ] **Push только по «ок» от Vadim'а**
- [ ] **После 1.05 — Блок A Wave 1 готов**. Технически здесь точка для решения о паузе/продолжении, но по политике `feedback_one_change_per_session.md` идём дальше к 1.06 без паузы (Wave 2 после полного закрытия Wave 1)
