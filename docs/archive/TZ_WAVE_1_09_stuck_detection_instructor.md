# TZ Wave 1 · Коммит 1.09 — Stuck detection: инструкторская сторона

**Дата:** 2026-05-12
**Roadmap:** `PATIENT_UX_ROADMAP_2026-05-08_v2.md` пункт #2 (инструкторская часть)
**Цель:** добавить инструкторскую сторону stuck detection — yellow badge в `Patients.js` (1.3×duration_weeks) и red Telegram push куратору (1.7×). Weekly cron в scheduler. Это **последний коммит Wave 1**.
**Объём:** 4-5 часов
**Риск:** низкий-средний — два независимых поведения, оба additive

---

## Зависимость

После 1.08. Ветка `wave-1/09-stuck-detection-instructor` от `wave-1/08-rehab-program-modal-wizard`.

---

## Что блокирует

В Wave 0 #06 добавлен пациентский баннер stuck (1.5× threshold). Сейчас **инструктор не знает что пациент застрял** пока сам не зайдёт в его карточку и не посмотрит phase_started_at vs duration_weeks вручную.

После коммита:
- В `Patients.js` рядом с именем пациента — yellow badge «застрял на фазе» при `1.3× duration_weeks` превышении
- При `1.7× duration_weeks` — Telegram push куратору через ops-bot (один раз на пациент-фазу, дедуп через `phase_stuck_alerts.notified_instructor`)
- Weekly cron в scheduler понедельник 09:00 МСК

**Что НЕ делается:**
- Структурированные criteria_next с чекбоксами (это Wave 2)
- Per-program_type override thresholds (пока единые 1.3/1.7, в backlog'е)

---

## Параллельная работа — координация

**ТРОГАЕМ:**
- Новая миграция `backend/database/migrations/20260513_phase_stuck_alerts.sql`
- `backend/routes/rehab.js` — новый endpoint `GET /api/rehab/programs/:id/stuck-status` (instructor-side, аналог пациентского из Wave 0 #06 но с yellow/red statuses)
- `backend/routes/patients.js` — расширение `GET /api/patients` (включать `stuck_status` агрегат)
- `backend/services/scheduler.js` — добавить weekly cron `checkStuckPhases()`
- `backend/services/telegramBot.js` — добавить функцию `notifyInstructorOnRedStuck(patientId, programId, phaseNumber)`
- `frontend/src/pages/Patients.js` — yellow badge рядом с именем
- Тесты

**НЕ ТРОГАТЬ:**
- RoadmapScreen / HomeScreen / RehabProgramModal
- AdminContent
- LOCKED-зоны
- Существующие миграции
- Пациентский stuck banner (Wave 0 #06)

---

## Backend — миграция

### Файл `backend/database/migrations/20260513_phase_stuck_alerts.sql`

```sql
-- Wave 1 коммит 1.09: stuck-alerts таблица для дедупликации Telegram push'ей
BEGIN;

CREATE TABLE IF NOT EXISTS phase_stuck_alerts (
  id SERIAL PRIMARY KEY,
  program_id INTEGER NOT NULL REFERENCES rehab_programs(id) ON DELETE CASCADE,
  phase_number SMALLINT NOT NULL,
  threshold_level VARCHAR(10) NOT NULL CHECK (threshold_level IN ('yellow', 'red')),
  detected_at TIMESTAMP DEFAULT NOW(),
  resolved_at TIMESTAMP,
  notified_instructor BOOLEAN DEFAULT FALSE,
  notified_at TIMESTAMP,
  UNIQUE (program_id, phase_number, threshold_level)
);

CREATE INDEX IF NOT EXISTS idx_phase_stuck_alerts_program ON phase_stuck_alerts(program_id);
CREATE INDEX IF NOT EXISTS idx_phase_stuck_alerts_unresolved ON phase_stuck_alerts(program_id) WHERE resolved_at IS NULL;

COMMIT;
```

---

## Backend — stuck-check логика

### `backend/services/stuckDetection.js` (новый файл)

```javascript
const { query } = require('../database/db');

const YELLOW_MULTIPLIER = 1.3;
const RED_MULTIPLIER = 1.7;

/**
 * Проверить stuck-статус одной программы.
 * Возвращает { yellow: boolean, red: boolean, actual_weeks, expected_weeks }
 */
async function computeStuckStatus(programId) {
  const programResult = await query(`
    SELECT rp.id, rp.program_type, rp.current_phase, rp.phase_started_at, rp.created_at
    FROM rehab_programs rp
    WHERE rp.id = $1 AND rp.is_active = true AND rp.status = 'active'
  `, [programId]);

  if (programResult.rows.length === 0) return null;
  const program = programResult.rows[0];

  const phaseResult = await query(`
    SELECT duration_weeks FROM rehab_phases
    WHERE program_type = $1 AND phase_number = $2 AND is_active = true LIMIT 1
  `, [program.program_type, program.current_phase]);

  if (phaseResult.rows.length === 0) return null;
  const durationWeeks = phaseResult.rows[0].duration_weeks || 4;
  const startedAt = new Date(program.phase_started_at || program.created_at);
  const daysOnPhase = Math.floor((Date.now() - startedAt) / (1000 * 60 * 60 * 24));
  const actualWeeks = daysOnPhase / 7;

  return {
    yellow: actualWeeks > durationWeeks * YELLOW_MULTIPLIER,
    red: actualWeeks > durationWeeks * RED_MULTIPLIER,
    actual_weeks: +actualWeeks.toFixed(1),
    expected_weeks: durationWeeks,
    current_phase: program.current_phase,
    phase_started_at: startedAt.toISOString().split('T')[0],
  };
}

/**
 * Weekly cron: проверить все активные программы, создать alerts при пересечении threshold'а,
 * отправить Telegram push куратору на red'ы которые ещё не уведомлены.
 */
async function checkStuckPhases() {
  const programs = await query(`
    SELECT rp.id, rp.patient_id, rp.current_phase, p.full_name AS patient_name, p.created_by AS instructor_id
    FROM rehab_programs rp
    JOIN patients p ON p.id = rp.patient_id
    WHERE rp.is_active = true AND rp.status = 'active'
  `);

  const { notifyInstructorOnRedStuck } = require('./telegramBot');

  for (const program of programs.rows) {
    const status = await computeStuckStatus(program.id);
    if (!status) continue;

    // YELLOW
    if (status.yellow) {
      await query(`
        INSERT INTO phase_stuck_alerts (program_id, phase_number, threshold_level)
        VALUES ($1, $2, 'yellow')
        ON CONFLICT (program_id, phase_number, threshold_level) DO NOTHING
      `, [program.id, program.current_phase]);
    }

    // RED + notification
    if (status.red) {
      const inserted = await query(`
        INSERT INTO phase_stuck_alerts (program_id, phase_number, threshold_level)
        VALUES ($1, $2, 'red')
        ON CONFLICT (program_id, phase_number, threshold_level) DO NOTHING
        RETURNING id
      `, [program.id, program.current_phase]);

      if (inserted.rows.length > 0 && program.instructor_id) {
        // Не уведомляли ещё для этого (program, phase, red) — шлём push
        try {
          await notifyInstructorOnRedStuck({
            instructorId: program.instructor_id,
            patientId: program.patient_id,
            patientName: program.patient_name,
            programId: program.id,
            phaseNumber: program.current_phase,
            actualWeeks: status.actual_weeks,
            expectedWeeks: status.expected_weeks,
          });
          await query(`
            UPDATE phase_stuck_alerts SET notified_instructor = TRUE, notified_at = NOW()
            WHERE program_id = $1 AND phase_number = $2 AND threshold_level = 'red'
          `, [program.id, program.current_phase]);
        } catch (err) {
          console.error('Telegram notify failed:', err.message);
        }
      }
    }
  }
}

module.exports = { computeStuckStatus, checkStuckPhases, YELLOW_MULTIPLIER, RED_MULTIPLIER };
```

### Изменения в `services/scheduler.js`

Добавить cron понедельник 09:00 МСК:

```javascript
const { checkStuckPhases } = require('./stuckDetection');

// Weekly stuck-phases check — каждый понедельник 09:00 МСК
cron.schedule('0 9 * * 1', async () => {
  console.log('[scheduler] Running weekly stuck-phases check...');
  try {
    await checkStuckPhases();
    console.log('[scheduler] Stuck-phases check completed');
  } catch (err) {
    console.error('[scheduler] Stuck-phases check failed:', err);
  }
}, { timezone: 'Europe/Moscow' });
```

### Изменения в `services/telegramBot.js`

```javascript
async function notifyInstructorOnRedStuck({ instructorId, patientId, patientName, programId, phaseNumber, actualWeeks, expectedWeeks }) {
  // Получить telegram_chat_id куратора из users
  const userResult = await query(
    `SELECT telegram_chat_id FROM users WHERE id = $1 AND telegram_chat_id IS NOT NULL`,
    [instructorId]
  );
  if (userResult.rows.length === 0) return;

  const chatId = userResult.rows[0].telegram_chat_id;
  const text = `🔴 Застрял на фазе\n\nПациент: ${patientName}\nФаза: ${phaseNumber}\nНа фазе: ${actualWeeks} нед. (ожидалось ~${expectedWeeks})\n\nПора пересмотреть программу.`;

  await bot.sendMessage(chatId, text, {
    reply_markup: {
      inline_keyboard: [[{ text: 'Открыть пациента', url: `https://my.azarean.ru/patient/${patientId}` }]]
    }
  });
}

module.exports = { /* existing exports */, notifyInstructorOnRedStuck };
```

### Endpoint для UI инструктора

В `routes/rehab.js`:

```javascript
// GET /api/rehab/programs/:id/stuck-status (instructor) — детальный статус с yellow/red
router.get('/programs/:id/stuck-status', authenticateToken, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'ValidationError' });
    const { computeStuckStatus } = require('../services/stuckDetection');
    const status = await computeStuckStatus(id);
    return res.json({ data: status || { yellow: false, red: false } });
  } catch (err) { next(err); }
});
```

### Расширение `GET /api/patients`

В `routes/patients.js` найти SELECT (уже расширен hot-fix'ом `52631a2`). Добавить агрегат stuck-flag:

```sql
SELECT
  -- ...existing fields...
  (p.password_hash IS NOT NULL OR p.last_login_at IS NOT NULL) AS is_registered,
  -- stuck status: TRUE если есть unresolved yellow alert для активной программы пациента
  EXISTS (
    SELECT 1 FROM phase_stuck_alerts psa
    JOIN rehab_programs rp ON rp.id = psa.program_id
    WHERE rp.patient_id = p.id
      AND rp.is_active = true AND rp.status = 'active'
      AND psa.threshold_level IN ('yellow', 'red')
      AND psa.resolved_at IS NULL
  ) AS is_stuck_on_phase
FROM patients p
-- ...
```

---

## Frontend — Patients.js badge

Найти место рендера строки пациента. Добавить:

```javascript
{patient.is_stuck_on_phase && (
  <span className="patient-row__stuck-badge" title="Пациент застрял на фазе">
    <AlertTriangle size={14} />
    <span>застрял</span>
  </span>
)}
```

Стиль (CSS Module или global):

```css
.patient-row__stuck-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 6px;
  background: var(--color-warning-bg, rgba(251, 191, 36, 0.15));
  color: var(--color-warning-text, #d97706);
  font-size: 12px;
  font-weight: 500;
}
```

---

## Тесты

### Backend — `stuckDetection.test.js` (новый)

```javascript
const { computeStuckStatus, checkStuckPhases } = require('../../services/stuckDetection');
const { query } = require('../../database/db');

describe('stuckDetection', () => {
  it('computeStuckStatus возвращает yellow=true при > 1.3× duration_weeks', async () => {
    const patient = await createTestPatient();
    const programRes = await query(`
      INSERT INTO rehab_programs (patient_id, program_type, current_phase, status, is_active, phase_started_at)
      VALUES ($1, 'acl', 1, 'active', true, NOW() - INTERVAL '6 weeks')
      RETURNING id
    `, [patient.id]);
    // ACL фаза 1 в seed имеет duration_weeks = 4; 6 > 4*1.3=5.2 → yellow=true, 6 < 4*1.7=6.8 → red=false
    const status = await computeStuckStatus(programRes.rows[0].id);
    expect(status.yellow).toBe(true);
    expect(status.red).toBe(false);
  });

  it('computeStuckStatus возвращает red=true при > 1.7×', async () => {
    const patient = await createTestPatient();
    const programRes = await query(`
      INSERT INTO rehab_programs (patient_id, program_type, current_phase, status, is_active, phase_started_at)
      VALUES ($1, 'acl', 1, 'active', true, NOW() - INTERVAL '8 weeks')
      RETURNING id
    `, [patient.id]);
    // 8 > 4*1.7=6.8 → red=true
    const status = await computeStuckStatus(programRes.rows[0].id);
    expect(status.red).toBe(true);
  });

  it('checkStuckPhases создаёт alerts с дедупликацией', async () => {
    // Первый прогон — создаёт alert
    await checkStuckPhases();
    const count1 = await query(`SELECT COUNT(*) AS c FROM phase_stuck_alerts WHERE threshold_level = 'yellow'`);
    // Второй прогон — не дублирует
    await checkStuckPhases();
    const count2 = await query(`SELECT COUNT(*) AS c FROM phase_stuck_alerts WHERE threshold_level = 'yellow'`);
    expect(count1.rows[0].c).toBe(count2.rows[0].c);
  });
});

describe('GET /api/rehab/programs/:id/stuck-status (instructor)', () => {
  it('возвращает yellow/red статус для активной программы', async () => {
    const instructor = await createTestInstructor();
    const token = signToken(instructor.id);
    const patient = await createTestPatient();
    const programRes = await query(`
      INSERT INTO rehab_programs (patient_id, program_type, current_phase, status, is_active, phase_started_at)
      VALUES ($1, 'acl', 1, 'active', true, NOW() - INTERVAL '6 weeks')
      RETURNING id
    `, [patient.id]);
    const res = await request(app)
      .get(`/api/rehab/programs/${programRes.rows[0].id}/stuck-status`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.data.yellow).toBe(true);
  });
});

describe('GET /api/patients возвращает is_stuck_on_phase', () => {
  it('flag TRUE если есть unresolved yellow alert', async () => {
    const instructor = await createTestInstructor();
    const token = signToken(instructor.id);
    const patient = await createTestPatient();
    const programRes = await query(`
      INSERT INTO rehab_programs (patient_id, program_type, current_phase, status, is_active, phase_started_at)
      VALUES ($1, 'acl', 1, 'active', true, NOW() - INTERVAL '7 weeks') RETURNING id
    `, [patient.id]);
    await query(`INSERT INTO phase_stuck_alerts (program_id, phase_number, threshold_level) VALUES ($1, 1, 'yellow')`, [programRes.rows[0].id]);

    const res = await request(app).get('/api/patients').set('Authorization', `Bearer ${token}`).expect(200);
    const found = res.body.data.find(p => p.id === patient.id);
    expect(found.is_stuck_on_phase).toBe(true);
  });
});
```

### Frontend — `Patients.test.js` расширение

```javascript
it('показывает stuck badge для пациента с is_stuck_on_phase=true', () => {
  const patients = [{ id: 1, full_name: 'Тест', is_registered: true, is_stuck_on_phase: true }];
  render(<Patients patients={patients} />);
  expect(screen.getByText(/застрял/i)).toBeInTheDocument();
});

it('не показывает badge если is_stuck_on_phase=false', () => {
  const patients = [{ id: 1, full_name: 'Тест', is_registered: true, is_stuck_on_phase: false }];
  render(<Patients patients={patients} />);
  expect(screen.queryByText(/застрял/i)).not.toBeInTheDocument();
});
```

---

## NOT TOUCH

- Пациентский stuck banner (Wave 0 #06) — работает независимо
- RoadmapScreen / HomeScreen / RehabProgramModal
- LOCKED-зоны

---

## Smoke test

### Сценарий 1 — миграция применилась

```bash
psql -U postgres -d azarean_rehab -c "\d phase_stuck_alerts"
```

### Сценарий 2 — yellow badge в списке пациентов

1. В dev: создать программу с `phase_started_at = NOW() - INTERVAL '7 weeks'` для тестового пациента (ACL фаза 1, duration=4 → yellow при > 5.2 нед)
2. Запустить cron вручную (через node REPL или endpoint debug)
3. Refresh /admin или /patients (инструкторский UI)
4. **Ожидание:** yellow badge «застрял» рядом с пациентом

### Сценарий 3 — Telegram push (если есть TELEGRAM_BOT_TOKEN в dev)

1. Создать программу с `phase_started_at = NOW() - INTERVAL '9 weeks'` (red threshold)
2. Привязать у тестового instructor'а `telegram_chat_id`
3. Запустить cron
4. **Ожидание:** push пришёл в Telegram, в `phase_stuck_alerts.notified_at` записана дата
5. Повторный прогон cron — push НЕ дублируется (дедуп через UNIQUE и `notified_instructor=TRUE`)

### Сценарий 4 — endpoint GET /programs/:id/stuck-status работает

```bash
curl -H "Authorization: Bearer $INSTRUCTOR_TOKEN" http://localhost:5000/api/rehab/programs/1/stuck-status | jq
```

### Сценарий 5 — dark theme + mobile

Badge читаемый в обеих темах. На mobile не разваливает строку пациента.

### Сценарий 6 — пациентский banner работает по-старому

Войти как пациент → RoadmapScreen → пациентский баннер (1.5× threshold) показывается как раньше, не сломан.

---

## Файлы — итоговый чеклист

### Создать
- `backend/database/migrations/20260513_phase_stuck_alerts.sql`
- `backend/services/stuckDetection.js`
- `backend/tests/__tests__/stuckDetection.test.js`

### Изменить
- `backend/routes/rehab.js` — + endpoint `/programs/:id/stuck-status`
- `backend/routes/patients.js` — расширить SELECT с `is_stuck_on_phase` EXISTS
- `backend/services/scheduler.js` — добавить weekly cron
- `backend/services/telegramBot.js` — добавить `notifyInstructorOnRedStuck`
- `backend/tests/__tests__/patients.routes.test.js` — +1 тест
- `frontend/src/pages/Patients.js` — yellow badge
- `frontend/src/pages/Patients.test.js` — +2 теста
- `CLAUDE.md` — секции «Схема БД», «API endpoints», «Cron tasks»

### НЕ ТРОГАТЬ
- Пациентский stuck banner (Wave 0 #06)
- RoadmapScreen / HomeScreen / RehabProgramModal
- LOCKED-зоны

---

## Текст коммита

```
feat(stuck): инструкторская сторона detection — bейджи и Telegram push

Wave 1 коммит 1.09 — последний в волне.

- phase_stuck_alerts таблица для дедупликации
- services/stuckDetection.js: computeStuckStatus + checkStuckPhases
- Yellow (1.3×) → INSERT alert + badge в Patients.js
- Red (1.7×) → INSERT alert + Telegram push куратору (дедуп через UNIQUE)
- Weekly cron понедельник 09:00 МСК
- GET /api/patients возвращает is_stuck_on_phase EXISTS-агрегат
- GET /api/rehab/programs/:id/stuck-status для деталей

Тhresholds 1.3/1.7 — стартовые, будут подкручены по реальным данным.

Test: backend +5, frontend +2

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

## Definition of Done

- [ ] Миграция применена, idempotency проверена
- [ ] `services/stuckDetection.js` создан, тесты зелёные
- [ ] Cron в scheduler.js (понедельник 09:00 МСК Europe/Moscow)
- [ ] Telegram push функция работает (или mock-тест если нет prod-токена в dev)
- [ ] Endpoint `/programs/:id/stuck-status` отвечает
- [ ] GET /patients возвращает `is_stuck_on_phase`
- [ ] Yellow badge виден в Patients.js
- [ ] 5 backend + 2 frontend тестов зелёные
- [ ] Smoke сценарии 1-6 пройдены
- [ ] Пациентский баннер Wave 0 #06 не сломан
- [ ] CLAUDE.md обновлён
- [ ] Коммит + Co-Authored-By
- [ ] `wave_1_progress.md` → 1.09 ⏸
- [ ] **Push только по «ок»**
- [ ] **После 1.09 — Wave 1 готов к batch merge**. Vadim мержит #01-09 в порядке через GitHub UI, prod-deploy, финальный smoke.
