# TZ Волна 0 · Коммит 01 — починка стрика без обнуления при пропуске

**Дата:** 2026-05-08
**Roadmap:** `PATIENT_UX_ROADMAP_2026-05-08_v2.md` пункт #7
**Цель:** Восстановить работу стрика (регресс v12). Любая активность пациента сегодня (тренировка, заполнение дневника, мини-комплекс) инкрементирует уникальный счётчик дней. Пропуск дня **не обнуляет** стрик — показывает мягкое предупреждение.
**Объём:** 3-4 часа
**Риск:** средний — затрагивает БД (новая таблица), две точки backend-логики, frontend StreakBadge.

---

## Что блокирует

Это **закрытие регресса v12**, не новая фича. После v12-редизайна `DiaryScreen` поле `exercises_done` было удалено из UI. Старая логика `updateStreak()` вызывалась только при `exercises_done = true` в дневнике (`backend/routes/rehab.js:564-566`). Сейчас:

- `updateStreak()` не вызывается **никогда** автоматически
- `ExerciseRunner` шлёт в `POST /api/progress`, но `progress.js` **не дёргает** `updateStreak`
- Все пациенты на проде видят `current_streak = 0` или старое значение, не растёт даже у тех, кто тренируется ежедневно
- В `HomeScreen` бейдж стрика показывает либо «0 дней» либо застывшее значение

**После этого коммита:** активный пациент через 7 дней видит «7 дней активности». Если пропустит день — на 8-й день увидит «7 дней активности · ты пропустил вчера, давай вернёмся», стрик не обнуляется.

---

## Параллельная работа — координация

Если параллельно идёт другая сессия:

**ТРОГАЕМ (не запускать другие сессии на этих файлах):**
- `backend/database/migrations/` — новая миграция
- `backend/routes/rehab.js` — функция `updateStreak`
- `backend/routes/progress.js` — добавляем вызов
- `frontend/src/pages/PatientDashboard/components/ui/StreakBadge.js` (или где он лежит — найти grep'ом)
- `backend/tests/__tests__/rehab.routes.test.js` или новый тестовый файл

**НЕ ТРОГАТЬ:**
- `backend/services/scheduler.js` — никаких изменений в crons этим коммитом
- `frontend/src/pages/PatientDashboard/components/HomeScreen.js` — отдельный коммит 02
- Все остальные роуты

---

## Backend — контракты

### Новая таблица `streak_days`

```sql
CREATE TABLE streak_days (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  program_id INTEGER REFERENCES rehab_programs(id) ON DELETE CASCADE,
  activity_date DATE NOT NULL,
  source VARCHAR(20) NOT NULL CHECK (source IN ('progress', 'diary', 'mini', 'manual')),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (patient_id, activity_date, program_id)
);

CREATE INDEX idx_streak_days_patient_date ON streak_days(patient_id, activity_date);
CREATE INDEX idx_streak_days_program ON streak_days(program_id);
```

### Контракт endpoint `GET /api/rehab/my/streak`

Этот endpoint **уже существует** в `routes/rehab.js`. Не менять сигнатуру, расширить response. Текущий формат (проверить точно — может отличаться):

```json
{
  "data": {
    "current_streak": 0,
    "longest_streak": 0,
    "total_days": 0,
    "last_activity_date": null
  }
}
```

Новый формат — добавляются 2 поля:

```json
{
  "data": {
    "current_streak": 7,
    "longest_streak": 12,
    "total_days": 28,
    "last_activity_date": "2026-05-07",
    "missed_yesterday": true,
    "days_since_last_activity": 1
  }
}
```

`missed_yesterday: true` если `last_activity_date < CURRENT_DATE - 1 INTERVAL` и `last_activity_date IS NOT NULL`.
`days_since_last_activity` — целое число дней от последней активности до сегодня (0 если сегодня была активность).

---

## Шаг 1 — миграция БД

**Файл:** `backend/database/migrations/20260508_streak_days.sql`

Создать новый файл со следующим содержимым:

```sql
-- 2026-05-08: streak_days table for non-reset activity tracking
-- Wave 0, commit 01

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'streak_days'
  ) THEN
    CREATE TABLE streak_days (
      id SERIAL PRIMARY KEY,
      patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
      program_id INTEGER REFERENCES rehab_programs(id) ON DELETE CASCADE,
      activity_date DATE NOT NULL,
      source VARCHAR(20) NOT NULL CHECK (source IN ('progress', 'diary', 'mini', 'manual')),
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE (patient_id, activity_date, program_id)
    );

    CREATE INDEX idx_streak_days_patient_date ON streak_days(patient_id, activity_date);
    CREATE INDEX idx_streak_days_program ON streak_days(program_id);

    -- Backfill из существующих streaks таблицы — без истории по дням
    -- Просто помечаем last_activity_date как одну запись для каждого active streak
    INSERT INTO streak_days (patient_id, program_id, activity_date, source)
    SELECT
      patient_id,
      program_id,
      last_activity_date,
      'manual'
    FROM streaks
    WHERE last_activity_date IS NOT NULL
      AND last_activity_date >= CURRENT_DATE - INTERVAL '90 days'
    ON CONFLICT (patient_id, activity_date, program_id) DO NOTHING;
  END IF;
END $$;
```

**Применить локально перед коммитом:**

```bash
cd backend
psql -U postgres -d azarean_rehab -f database/migrations/20260508_streak_days.sql
```

Проверить:

```bash
psql -U postgres -d azarean_rehab -c "\d streak_days"
psql -U postgres -d azarean_rehab -c "SELECT COUNT(*) FROM streak_days;"
```

---

## Шаг 2 — переписать `updateStreak()` в `routes/rehab.js`

**Файл:** `backend/routes/rehab.js`
**Точка вставки:** найти существующую функцию `updateStreak` (строки ~1393-1452 на 2026-05-07, точное место найти grep'ом `function updateStreak`)

**Старая логика (удалить целиком):**
```javascript
async function updateStreak(patientId, programId) {
  // Старая: last_activity_date = вчера → +1, иначе → 1 (обнуление)
  // ВЕСЬ блок удалить
}
```

**Новая логика (вставить вместо старой):**

```javascript
/**
 * Обновляет streak для пациента: добавляет уникальный день активности.
 * Пропуски НЕ обнуляют стрик. Любая активность инкрементирует counter.
 *
 * @param {number} patientId - ID пациента
 * @param {number|null} programId - ID программы (может быть null если нет активной программы)
 * @param {string} source - источник активности: 'progress', 'diary', 'mini', 'manual'
 * @returns {Promise<void>}
 */
async function updateStreak(patientId, programId, source = 'progress') {
  if (!patientId) return;

  const client = await getClient();
  try {
    await client.query('BEGIN');

    // 1. Запись уникального дня активности (idempotent через UNIQUE constraint)
    await client.query(
      `INSERT INTO streak_days (patient_id, program_id, activity_date, source)
       VALUES ($1, $2, CURRENT_DATE, $3)
       ON CONFLICT (patient_id, activity_date, program_id) DO NOTHING`,
      [patientId, programId, source]
    );

    // 2. Пересчёт агрегатов в streaks
    // current_streak теперь = total active days (не consecutive)
    // longest_streak = consecutive run, computed
    const aggregates = await client.query(
      `SELECT
         COUNT(*) AS total_days,
         MAX(activity_date) AS last_activity_date
       FROM streak_days
       WHERE patient_id = $1
         AND ($2::int IS NULL OR program_id = $2 OR program_id IS NULL)`,
      [patientId, programId]
    );

    const totalDays = parseInt(aggregates.rows[0].total_days, 10) || 0;
    const lastDate = aggregates.rows[0].last_activity_date;

    // Вычисление longest consecutive run для retrospective view
    const longestRunResult = await client.query(
      `WITH ordered_days AS (
         SELECT activity_date,
                activity_date - (ROW_NUMBER() OVER (ORDER BY activity_date))::int * INTERVAL '1 day' AS grp
         FROM streak_days
         WHERE patient_id = $1
           AND ($2::int IS NULL OR program_id = $2 OR program_id IS NULL)
       )
       SELECT MAX(run_length) AS longest_run
       FROM (
         SELECT COUNT(*) AS run_length
         FROM ordered_days
         GROUP BY grp
       ) runs`,
      [patientId, programId]
    );
    const longestRun = parseInt(longestRunResult.rows[0].longest_run, 10) || 0;

    // 3. UPSERT в streaks
    if (programId) {
      await client.query(
        `INSERT INTO streaks (patient_id, program_id, current_streak, longest_streak, total_days, last_activity_date, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         ON CONFLICT (patient_id, program_id) DO UPDATE SET
           current_streak = EXCLUDED.current_streak,
           longest_streak = GREATEST(streaks.longest_streak, EXCLUDED.longest_streak),
           total_days = EXCLUDED.total_days,
           last_activity_date = EXCLUDED.last_activity_date,
           updated_at = NOW()`,
        [patientId, programId, totalDays, longestRun, totalDays, lastDate]
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('updateStreak error:', err);
    // Не пробрасываем ошибку — streak это вспомогательная фича, не должна ломать основной flow
  } finally {
    client.release();
  }
}
```

**Логика `current_streak = total_days`:** в новой механике стрик это просто счётчик уникальных дней активности с начала программы. Не consecutive. Это намеренно — соответствует принципу «не обнуляем при пропуске».

`longest_streak` хранит максимальный consecutive run для retrospective и будущих наградных систем (Star Tracker), но в UI его пока не показываем.

---

## Шаг 3 — добавить вызов `updateStreak()` в `routes/progress.js`

**Файл:** `backend/routes/progress.js`
**Точка вставки:** в обработчике `POST /api/progress`, после успешного INSERT в `progress_logs`, перед `res.json(...)`.

Найти примерно такой блок (точная структура может отличаться):

```javascript
router.post('/', authenticatePatientOrInstructor, async (req, res) => {
  // ... валидация ...
  // INSERT в progress_logs ...
  // const result = await query('INSERT INTO progress_logs ...', [...]);

  // ⬇ ВСТАВИТЬ ЗДЕСЬ:

  // Обновление стрика — только для пациента (не инструктора)
  if (req.user?.kind === 'patient' || req.patientId) {
    const patientId = req.patientId || req.user.patient_id;
    // Найти активную программу пациента
    try {
      const program = await query(
        `SELECT id FROM rehab_programs WHERE patient_id = $1 AND status = 'active' LIMIT 1`,
        [patientId]
      );
      const programId = program.rows[0]?.id || null;

      // Импортировать updateStreak из rehab.js или вынести в utils/streaks.js
      const { updateStreak } = require('./rehab');
      await updateStreak(patientId, programId, 'progress');
    } catch (err) {
      console.error('Failed to update streak from progress:', err);
      // Не блокируем основной flow
    }
  }

  res.json({ data: ... });
});
```

**Альтернатива** (рекомендуется): вынести `updateStreak` в `backend/utils/streaks.js` и импортировать в обоих местах. Это чище, чем cross-route require:

```javascript
// backend/utils/streaks.js
const { query, getClient } = require('../database/db');

async function updateStreak(patientId, programId, source = 'progress') {
  // ... тело функции
}

module.exports = { updateStreak };
```

И в `routes/rehab.js` + `routes/progress.js`:
```javascript
const { updateStreak } = require('../utils/streaks');
```

**Решение по чистоте:** выноси в `utils/streaks.js`. Это снижает coupling и упрощает тесты.

---

## Шаг 4 — расширить ответ `GET /api/rehab/my/streak`

**Файл:** `backend/routes/rehab.js`
**Точка вставки:** найти существующий handler `GET /my/streak` (grep'ом).

Текущий handler возвращает данные из таблицы `streaks`. Добавить вычисление `missed_yesterday` и `days_since_last_activity`:

```javascript
router.get('/my/streak', authenticatePatient, requireSameOrigin, async (req, res, next) => {
  try {
    const patientId = req.patientId;

    const result = await query(
      `SELECT s.*,
              CASE
                WHEN s.last_activity_date IS NULL THEN NULL
                ELSE (CURRENT_DATE - s.last_activity_date)::int
              END AS days_since_last_activity
       FROM streaks s
       JOIN rehab_programs rp ON rp.id = s.program_id
       WHERE s.patient_id = $1 AND rp.status = 'active'
       LIMIT 1`,
      [patientId]
    );

    const streak = result.rows[0] || {
      current_streak: 0,
      longest_streak: 0,
      total_days: 0,
      last_activity_date: null,
      days_since_last_activity: null
    };

    streak.missed_yesterday = streak.days_since_last_activity === 1;

    res.json({ data: streak });
  } catch (err) {
    next(err);
  }
});
```

---

## Шаг 5 — обновить `StreakBadge` на frontend

**Файл:** `frontend/src/pages/PatientDashboard/components/ui/StreakBadge.js` (или где компонент — найти grep'ом по `StreakBadge`)

Найти существующий компонент. Расширить рендер чтобы показывать предупреждение при `missed_yesterday`.

Псевдокод (привести к стилю компонентов в проекте):

```jsx
import { Flame, AlertCircle } from 'lucide-react';
import s from './StreakBadge.module.css';   // если CSS Modules; если глобальные стили — pd- prefix

export default function StreakBadge({ streak }) {
  if (!streak || streak.current_streak === 0) {
    return (
      <div className={s.badge}>
        <Flame size={16} />
        <span>Начни сегодня</span>
      </div>
    );
  }

  return (
    <div className={s.badge}>
      <Flame size={16} className={s.icon} />
      <span className={s.count}>{streak.current_streak} {pluralize(streak.current_streak, 'день', 'дня', 'дней')}</span>
      {streak.missed_yesterday && (
        <div className={s.warning}>
          <AlertCircle size={12} />
          <span>Ты пропустил вчера — продолжай!</span>
        </div>
      )}
    </div>
  );
}

function pluralize(n, one, few, many) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return few;
  return many;
}
```

**Важно:**
- Иконка строго `lucide-react`. **Никаких emoji** (правило проекта).
- Цвет warning — нейтральный/жёлтый, не красный. Не паникёрский.
- Если в проекте используется `pd-` глобальный префикс вместо CSS Modules для PatientDashboard — следовать конвенции файла. Найти существующий `StreakBadge.css` рядом и обновить там.

---

## NOT TOUCH

В этом коммите **НЕ трогать**:

- `backend/services/scheduler.js` — никаких новых cron'ов в этом коммите
- `frontend/src/pages/PatientDashboard/components/HomeScreen.js` — стрик-бейдж там уже рендерится через `StreakBadge`, изменений в HomeScreen не нужно (если только не нужна правка пропсов — тогда минимальная)
- `backend/database/migrations/` — другие миграции, только новый файл `20260508_streak_days.sql`
- Telegram bot (`services/telegramBot.js`) — стрик там не используется
- `backend/routes/rehab.js` другие функции кроме `updateStreak` и `GET /my/streak`

---

## Тесты

### Backend

**Файл:** `backend/tests/__tests__/streak.test.js` (новый файл)

Mock-конвенция: использовать существующий patternsetup из `rehab.routes.test.js`. Mock'ать БД через `pg-mem` или supertest + реальная test DB.

Кейсы:

```javascript
describe('updateStreak', () => {
  beforeEach(async () => {
    // Очистить streak_days, streaks для тестового пациента
  });

  test('первый вызов создаёт запись в streak_days и обновляет streaks', async () => {
    await updateStreak(testPatientId, testProgramId, 'progress');
    const days = await query('SELECT * FROM streak_days WHERE patient_id = $1', [testPatientId]);
    expect(days.rows).toHaveLength(1);
    expect(days.rows[0].activity_date).toEqual(today);
    expect(days.rows[0].source).toBe('progress');
  });

  test('повторный вызов в тот же день идемпотентен (не создаёт дубль)', async () => {
    await updateStreak(testPatientId, testProgramId, 'progress');
    await updateStreak(testPatientId, testProgramId, 'diary');
    const days = await query('SELECT * FROM streak_days WHERE patient_id = $1', [testPatientId]);
    expect(days.rows).toHaveLength(1);
  });

  test('current_streak растёт по дням', async () => {
    // Симулируем 5 разных дней через прямые INSERT'ы (для теста, в проде это вызовы)
    for (let i = 0; i < 5; i++) {
      await query(
        `INSERT INTO streak_days (patient_id, program_id, activity_date, source)
         VALUES ($1, $2, CURRENT_DATE - INTERVAL '${4-i} days', 'progress')`,
        [testPatientId, testProgramId]
      );
    }
    await updateStreak(testPatientId, testProgramId, 'progress');  // финальный для пересчёта
    const streaks = await query('SELECT * FROM streaks WHERE patient_id = $1', [testPatientId]);
    expect(streaks.rows[0].current_streak).toBe(5);
    expect(streaks.rows[0].total_days).toBe(5);
  });

  test('пропуск дня НЕ обнуляет current_streak', async () => {
    // Дни 1, 2, 3 (с разрывом на день 2)
    await query(`INSERT INTO streak_days (patient_id, program_id, activity_date, source) VALUES ($1, $2, CURRENT_DATE - INTERVAL '3 days', 'progress')`, [testPatientId, testProgramId]);
    await query(`INSERT INTO streak_days (patient_id, program_id, activity_date, source) VALUES ($1, $2, CURRENT_DATE - INTERVAL '1 day', 'progress')`, [testPatientId, testProgramId]);
    await updateStreak(testPatientId, testProgramId, 'progress');  // CURRENT_DATE
    const streaks = await query('SELECT * FROM streaks WHERE patient_id = $1', [testPatientId]);
    expect(streaks.rows[0].current_streak).toBe(3);  // 3 уникальных дня, не сбросилось
  });

  test('longest_streak считает максимальный consecutive run', async () => {
    // Дни: -10 -9 -8 (run 3), -5 -4 (run 2), 0 (run 1)
    for (const offset of [10, 9, 8, 5, 4, 0]) {
      await query(
        `INSERT INTO streak_days (patient_id, program_id, activity_date, source)
         VALUES ($1, $2, CURRENT_DATE - INTERVAL '${offset} days', 'progress')`,
        [testPatientId, testProgramId]
      );
    }
    await updateStreak(testPatientId, testProgramId, 'progress');
    const streaks = await query('SELECT * FROM streaks WHERE patient_id = $1', [testPatientId]);
    expect(streaks.rows[0].longest_streak).toBeGreaterThanOrEqual(3);
  });

  test('source может быть progress, diary, mini, manual', async () => {
    for (const src of ['progress', 'diary', 'mini', 'manual']) {
      await expect(updateStreak(testPatientId, testProgramId, src)).resolves.not.toThrow();
    }
  });

  test('невалидный source — не вызывает crash', async () => {
    await expect(updateStreak(testPatientId, testProgramId, 'invalid_source')).rejects.toThrow();  // CHECK constraint
  });
});

describe('GET /api/rehab/my/streak', () => {
  test('возвращает missed_yesterday=true если last_activity_date был позавчера', async () => {
    // Создать streak с last_activity_date = вчера
    // Запросить endpoint
    // expect missed_yesterday=true, days_since_last_activity=1
  });

  test('возвращает missed_yesterday=false если активность сегодня', async () => {
    // ...
  });

  test('возвращает days_since_last_activity=null если стрика нет', async () => {
    // ...
  });
});

describe('POST /api/progress → updateStreak вызов', () => {
  test('после POST /api/progress в streak_days появляется запись', async () => {
    const beforeCount = await query('SELECT COUNT(*) FROM streak_days WHERE patient_id = $1', [testPatientId]);
    // POST /api/progress с patientApi
    await patientApi.post('/api/progress', {
      complex_id: testComplexId,
      exercise_id: testExerciseId,
      session_id: 12345,
      completed: true,
      pain_level: 3,
      difficulty_rating: 5
    });
    const afterCount = await query('SELECT COUNT(*) FROM streak_days WHERE patient_id = $1', [testPatientId]);
    expect(parseInt(afterCount.rows[0].count, 10)).toBe(parseInt(beforeCount.rows[0].count, 10) + 1);
  });
});
```

### Frontend

**Файл:** `frontend/src/pages/PatientDashboard/components/ui/StreakBadge.test.js` (новый или расширить существующий)

```javascript
describe('StreakBadge', () => {
  test('показывает "Начни сегодня" при current_streak=0', () => {
    render(<StreakBadge streak={{ current_streak: 0 }} />);
    expect(screen.getByText('Начни сегодня')).toBeInTheDocument();
  });

  test('показывает число дней с правильной формой', () => {
    render(<StreakBadge streak={{ current_streak: 1 }} />);
    expect(screen.getByText('1 день')).toBeInTheDocument();

    render(<StreakBadge streak={{ current_streak: 3 }} />);
    expect(screen.getByText('3 дня')).toBeInTheDocument();

    render(<StreakBadge streak={{ current_streak: 7 }} />);
    expect(screen.getByText('7 дней')).toBeInTheDocument();

    render(<StreakBadge streak={{ current_streak: 21 }} />);
    expect(screen.getByText('21 день')).toBeInTheDocument();
  });

  test('показывает warning при missed_yesterday=true', () => {
    render(<StreakBadge streak={{ current_streak: 5, missed_yesterday: true }} />);
    expect(screen.getByText(/пропустил вчера/i)).toBeInTheDocument();
  });

  test('не показывает warning если missed_yesterday=false', () => {
    render(<StreakBadge streak={{ current_streak: 5, missed_yesterday: false }} />);
    expect(screen.queryByText(/пропустил/i)).not.toBeInTheDocument();
  });
});
```

### Команды запуска

```bash
# Backend
cd backend && npm test -- --testPathPattern=streak

# Frontend
cd frontend && npm test -- --testPathPattern=StreakBadge --watchAll=false
```

---

## ⛔ STOP — smoke в реальном браузере

Перед коммитом **обязательно** прогнать в реальном браузере на dev окружении:

### Сценарий 1: «Свежий streak»

1. Открыть БД, очистить для пациента id=14: `DELETE FROM streak_days WHERE patient_id = 14; UPDATE streaks SET current_streak=0, total_days=0, last_activity_date=NULL WHERE patient_id = 14;`
2. Залогиниться пациентом `avi707@mail.ru` / `Test1234`
3. На HomeScreen увидеть бейдж «Начни сегодня» (или эквивалент при current_streak=0)
4. Открыть любой комплекс, выполнить хотя бы одно упражнение, завершить сессию
5. Вернуться на HomeScreen — бейдж должен показывать «1 день»
6. Перезагрузить страницу — должно сохраниться

### Сценарий 2: «Пропуск дня»

1. В БД для пациента id=14: `UPDATE streaks SET current_streak=5, total_days=5, last_activity_date=CURRENT_DATE - INTERVAL '2 days' WHERE patient_id = 14; INSERT INTO streak_days (patient_id, program_id, activity_date, source) VALUES (14, 1, CURRENT_DATE - INTERVAL '2 days', 'manual') ON CONFLICT DO NOTHING;`
2. Перезагрузить ЛК пациента
3. Бейдж должен показывать «5 дней» **+ предупреждение «Ты пропустил вчера — продолжай!»**
4. Проверить: предупреждение НЕ красное, тон нейтральный

### Сценарий 3: «Активность после пропуска не обнуляет»

1. Состояние из сценария 2 (last_activity_date = позавчера, current_streak=5)
2. Пациент выполняет упражнение
3. После завершения сессии — current_streak должен стать **6**, не **1**
4. Предупреждение «пропустил вчера» исчезает (теперь активность сегодня)

### Сценарий 4: «Diary активность тоже считается»

1. Состояние: current_streak=0, нет записей в streak_days сегодня
2. Пациент заполняет дневник (DiaryScreen, сохраняет запись)
3. **Замечание:** в этом коммите вызов `updateStreak` из `routes/rehab.js POST /my/diary` уже существует — проверить что он остался работать, не сломан переписыванием функции
4. После сохранения — current_streak становится 1, source = 'diary' в `streak_days`

⛔ **Если хотя бы один сценарий проваливается — НЕ коммитить.** Чинить и повторить smoke.

---

## Файлы

**Создать:**
- `backend/database/migrations/20260508_streak_days.sql`
- `backend/utils/streaks.js`
- `backend/tests/__tests__/streak.test.js`

**Изменить:**
- `backend/routes/rehab.js` — удалить старую `updateStreak`, исправить вызов (теперь импорт из `utils/streaks.js`), расширить `GET /my/streak`
- `backend/routes/progress.js` — добавить вызов `updateStreak` после INSERT в progress_logs
- `frontend/src/pages/PatientDashboard/components/ui/StreakBadge.js` — расширить рендер для warning
- `frontend/src/pages/PatientDashboard/components/ui/StreakBadge.test.js` (если был) или создать
- Если `StreakBadge.css` отдельный — добавить класс `.warning` стили

**НЕ ТРОГАТЬ:**
- `backend/services/scheduler.js`
- `backend/services/telegramBot.js`
- `frontend/src/pages/PatientDashboard/components/HomeScreen.js` (если только проп не меняется в API; если меняется — минимально)
- `backend/database/schema.sql` (миграции отдельно от schema)

---

## Коммит

**Текст:**

```
fix(streak): не обнулять стрик при пропуске, любая активность считается

Закрытие регресса v12 (#7 в Patient UX Roadmap v2):
- Старая логика updateStreak обнуляла current_streak до 1 при пропуске
- Новая: уникальные дни активности через streak_days, без обнуления
- Активность из progress_logs (не только diary) тоже инкрементирует
- При пропуске дня UI показывает мягкое предупреждение, стрик сохраняется

Изменения:
- Новая таблица streak_days (миграция 20260508_streak_days)
- updateStreak() вынесен в utils/streaks.js, переписан под новую модель
- Вызов добавлен в POST /api/progress (раньше дёргался только из diary)
- GET /api/rehab/my/streak возвращает missed_yesterday и days_since_last_activity
- StreakBadge показывает warning при пропуске вчерашнего дня

Тесты: 7 новых backend + 4 frontend.
Roadmap: PATIENT_UX_ROADMAP_2026-05-08_v2.md #7
```

---

## Пост-коммит

### Обновить документацию:

**`CLAUDE.md`:**
- Раздел «Открытые баги»: вычеркнуть строку про сломанный стрик (Bug #7)
- Раздел «Завершённые исправления»: добавить запись «Bug v12 streak регресс закрыт коммитом ___, см. Wave 0 коммит 01»
- Раздел «Структура БД»: добавить описание таблицы `streak_days`

**`MEMORY.md` или `memory/wave_0_streak.md`:**
- Зафиксировать решение: «стрик в Azarean Rehab — НЕ daily consecutive, а total active days с retrospective longest_run»
- Зафиксировать связь с Star Tracker (когда буду делать gamification — current_streak это просто counter, freeze будет работать поверх)

**`wave_0_progress.md`:**
- Строка `01` → `✅ done`, SHA первых 7 символов, дата

---

## Definition of Done

- [ ] Миграция применена на dev БД, таблица `streak_days` создана
- [ ] Все backend тесты зелёные (включая 7 новых для стрика)
- [ ] Все frontend тесты зелёные (включая 4 новых для StreakBadge)
- [ ] Smoke сценарии 1-4 пройдены в реальном браузере (Chrome desktop + Safari iOS если возможно)
- [ ] Коммит создан с указанным текстом
- [ ] Документация обновлена (CLAUDE.md + MEMORY.md + wave_0_progress.md)
- [ ] **`git push` только после явного «ок» от юзера**
- [ ] Прогон миграции на проде после merge: `cd /var/www/azarean-rehab/backend && bash deploy/migrate.sh`
- [ ] Ручная проверка на проде: пациент id=6 (Вадим) — стрик видно, не сломан
