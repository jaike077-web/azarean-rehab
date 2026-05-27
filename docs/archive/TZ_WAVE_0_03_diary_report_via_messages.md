# TZ Волна 0 · Коммит 03 — отчёт из дневника через POST в messages, не clipboard

**Дата:** 2026-05-08
**Roadmap:** `PATIENT_UX_ROADMAP_2026-05-08_v2.md` пункт #6 (Волна 0 часть)
**Цель:** Кнопка «Отправить отчёт» в DiaryScreen больше не копирует текст в буфер обмена. Вместо этого — POST в `messages` с привязкой `linked_diary_id` и `message_kind = 'diary_report'`. Куратор видит отчёт в чате с кнопкой «Открыть запись дневника». MessengerCTA для Telegram/WhatsApp/Max становится опциональной, не основной.
**Объём:** 2-3 часа
**Риск:** низкий-средний — изменение существующего endpoint, frontend flow, потенциальная миграция (если поля в `messages` отсутствуют).

---

## Что блокирует

Текущий flow «Отправить отчёт» из DiaryScreen:

1. Пациент жмёт кнопку «Отправить отчёт»
2. Frontend формирует текст и **копирует в clipboard**
3. Открывается MessengerCTA (выбор Telegram / WhatsApp / Max)
4. Пациент сам вручную вставляет текст (Ctrl+V) в Telegram куратору

Проблемы:
- **Отвратительный UX для пожилых / нетехнических пациентов:** «у меня не вставляется», «куда нажимать»
- Отчёт не сохраняется в системе — теряется в Telegram-переписке
- Куратор не может вернуться к отчёту через приложение
- Нет связи отчёт ↔ запись дневника (`linked_diary_id` поле уже зарезервировано в `messages`, но не используется)

После этого коммита:
- Жмёт «Отправить отчёт» → один клик, отчёт сохраняется в `messages`, появляется в ContactScreen
- Куратор видит карточку отчёта в чате с превью + кнопкой «Открыть запись дневника» (для будущего просмотра — full UI на стороне инструктора в Волне 2)
- MessengerCTA остаётся как **опциональная** кнопка «Также продублировать в Telegram» — для пациентов которым важно дублирование

---

## Параллельная работа — координация

**ТРОГАЕМ:**
- `backend/routes/rehab.js` — handler `POST /my/messages`
- `backend/database/migrations/` — возможно новая миграция (см. шаг 1)
- `frontend/src/pages/PatientDashboard/components/DiaryScreen.js`
- `frontend/src/pages/PatientDashboard/components/ContactScreen.js`
- `frontend/src/pages/PatientDashboard/components/ui/MessengerCTA.js`
- `backend/tests/__tests__/rehab.routes.test.js`

**НЕ ТРОГАТЬ:**
- ExerciseRunner — это коммит 05
- HomeScreen — отдельные коммиты 02 и 04
- Никаких изменений в логике Telegram-бота

---

## Шаг 1 — проверить структуру таблицы `messages`

**Перед написанием кода — обязательно выполнить:**

```bash
psql -U postgres -d azarean_rehab -c "\d messages"
```

Ожидаемая структура (по roadmap v2 #6 это нужно):
- `id`, `patient_id`, `instructor_id`, `sender_id`, `body`, `created_at` (минимум)
- `linked_diary_id INTEGER` — может уже быть (упоминается в анализе Claude Code)
- `message_kind VARCHAR(30)` — может отсутствовать

**Возможные исходы:**

**Исход A:** оба поля уже есть → **миграция не нужна**, переходим к шагу 2.

**Исход B:** одно или оба поля отсутствуют → создаём миграцию `20260508_messages_extend.sql`:

```sql
-- 2026-05-08: расширение messages для типизированных отчётов
-- Wave 0, commit 03

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'messages' AND column_name = 'message_kind'
  ) THEN
    ALTER TABLE messages
      ADD COLUMN message_kind VARCHAR(30) DEFAULT 'text'
        CHECK (message_kind IN ('text', 'diary_report', 'session_report', 'system_alert'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'messages' AND column_name = 'linked_diary_id'
  ) THEN
    ALTER TABLE messages
      ADD COLUMN linked_diary_id INTEGER REFERENCES diary_entries(id) ON DELETE SET NULL;

    CREATE INDEX IF NOT EXISTS idx_messages_linked_diary ON messages(linked_diary_id) WHERE linked_diary_id IS NOT NULL;
  END IF;

  -- linked_session_id зарезервирован для коммита из Волны 3, здесь не добавляем
END $$;
```

Применить:

```bash
psql -U postgres -d azarean_rehab -f backend/database/migrations/20260508_messages_extend.sql
psql -U postgres -d azarean_rehab -c "\d messages"
```

---

## Backend — контракты

### `POST /api/rehab/my/messages`

Расширяется body-схема. Старый формат:

```json
{ "body": "string" }
```

Новый формат:

```json
{
  "body": "string",
  "message_kind": "text" | "diary_report",
  "linked_diary_id": 123  // optional, обязателен при message_kind=diary_report
}
```

Если `message_kind` не передан — default `'text'` (backwards compat).

Если `message_kind = 'diary_report'`, но `linked_diary_id` отсутствует или указывает на запись другого пациента — 400 Bad Request.

Response:

```json
{
  "data": {
    "id": 456,
    "body": "...",
    "message_kind": "diary_report",
    "linked_diary_id": 123,
    "created_at": "2026-05-08T10:30:00Z"
  }
}
```

### `GET /api/rehab/my/messages`

Расширяется response — каждое сообщение теперь включает `message_kind` и `linked_diary_id`:

```json
{
  "data": [
    {
      "id": 456,
      "body": "...",
      "message_kind": "diary_report",
      "linked_diary_id": 123,
      "linked_diary": {                     // hydrated, если linked_diary_id != null
        "id": 123,
        "entry_date": "2026-05-08",
        "pain_level": 3
      },
      "sender_id": 14,
      "created_at": "..."
    }
  ]
}
```

Hydration `linked_diary` — JOIN с `diary_entries` по `linked_diary_id`. Возвращаем минимум: `id`, `entry_date`, `pain_level`. Это для превью в ContactScreen.

---

## Шаг 2 — обновить `POST /my/messages` в `routes/rehab.js`

**Файл:** `backend/routes/rehab.js`
**Точка вставки:** существующий handler `POST /my/messages` (grep по `'/my/messages'`).

Старая логика (примерно):

```javascript
router.post('/my/messages', authenticatePatient, requireSameOrigin, async (req, res, next) => {
  const { body } = req.body;
  if (!body || body.length > 5000) return res.status(400).json({ error: 'INVALID_BODY' });

  const patientId = req.patientId;
  const result = await query(
    `INSERT INTO messages (patient_id, sender_id, body, created_at)
     VALUES ($1, $1, $2, NOW())
     RETURNING id, body, created_at`,
    [patientId, body]
  );
  res.json({ data: result.rows[0] });
});
```

Новая логика:

```javascript
router.post('/my/messages', authenticatePatient, requireSameOrigin, async (req, res, next) => {
  try {
    const { body, message_kind = 'text', linked_diary_id = null } = req.body;
    const patientId = req.patientId;

    if (!body || typeof body !== 'string') {
      return res.status(400).json({ error: 'INVALID_BODY', message: 'body обязателен' });
    }
    if (body.length > 5000) {
      return res.status(400).json({ error: 'BODY_TOO_LONG', message: 'максимум 5000 символов' });
    }

    const allowedKinds = ['text', 'diary_report'];
    if (!allowedKinds.includes(message_kind)) {
      return res.status(400).json({ error: 'INVALID_KIND', message: 'message_kind должен быть один из: ' + allowedKinds.join(', ') });
    }

    // Validation для diary_report
    if (message_kind === 'diary_report') {
      if (!linked_diary_id || !Number.isInteger(linked_diary_id)) {
        return res.status(400).json({ error: 'LINKED_DIARY_REQUIRED', message: 'для diary_report обязателен linked_diary_id' });
      }

      // Ownership check — diary_entry должна принадлежать этому пациенту
      const ownership = await query(
        `SELECT id FROM diary_entries WHERE id = $1 AND patient_id = $2`,
        [linked_diary_id, patientId]
      );
      if (ownership.rows.length === 0) {
        return res.status(404).json({ error: 'DIARY_NOT_FOUND', message: 'запись дневника не найдена' });
      }
    }

    const result = await query(
      `INSERT INTO messages (patient_id, sender_id, body, message_kind, linked_diary_id, created_at)
       VALUES ($1, $1, $2, $3, $4, NOW())
       RETURNING id, body, message_kind, linked_diary_id, created_at`,
      [patientId, body, message_kind, linked_diary_id]
    );

    res.status(201).json({ data: result.rows[0] });
  } catch (err) {
    next(err);
  }
});
```

---

## Шаг 3 — обновить `GET /my/messages` (hydration)

**Файл:** `backend/routes/rehab.js`
**Точка вставки:** существующий handler `GET /my/messages`.

Старый запрос (примерно):

```sql
SELECT id, body, sender_id, created_at FROM messages
WHERE patient_id = $1
ORDER BY created_at DESC
LIMIT 100
```

Новый запрос с LEFT JOIN на diary_entries:

```sql
SELECT
  m.id, m.body, m.sender_id, m.created_at,
  m.message_kind, m.linked_diary_id,
  CASE
    WHEN m.linked_diary_id IS NOT NULL THEN
      json_build_object(
        'id', de.id,
        'entry_date', de.entry_date::text,
        'pain_level', de.pain_level
      )
    ELSE NULL
  END AS linked_diary
FROM messages m
LEFT JOIN diary_entries de ON de.id = m.linked_diary_id AND de.patient_id = m.patient_id
WHERE m.patient_id = $1
ORDER BY m.created_at DESC
LIMIT 100
```

Frontend получит каждое сообщение с опциональным полем `linked_diary` (объект или null).

---

## Шаг 4 — обновить `DiaryScreen.js` (handleReportSend вместо handleReportCopy)

**Файл:** `frontend/src/pages/PatientDashboard/components/DiaryScreen.js`
**Точка вставки:** найти существующую функцию `handleReportCopy` (или похожую — формирует текст отчёта и копирует в clipboard).

Заменить логику:

```jsx
// Старое: копировать в clipboard + открыть MessengerCTA
const handleReportCopy = () => {
  const text = formatDiaryReport(entry);
  navigator.clipboard.writeText(text);
  setMessengerCTAOpen(true);  // принудительно
};

// ⬇⬇⬇

// Новое: POST в messages, опционально дублировать в Telegram через MessengerCTA
const handleReportSend = async () => {
  if (!entry?.id) {
    toast.error('Сначала сохрани запись дневника');
    return;
  }

  setReportSending(true);
  try {
    const text = formatDiaryReport(entry);
    await rehab.sendMessage({
      body: text,
      message_kind: 'diary_report',
      linked_diary_id: entry.id
    });
    toast.success('Отчёт отправлен куратору');
    setReportSent(true);                                  // показывает «✓ Отправлено»
  } catch (err) {
    console.error('Failed to send report:', err);
    toast.error('Не удалось отправить отчёт. Попробуй ещё раз.');
  } finally {
    setReportSending(false);
  }
};
```

Имя функции в `services/api.js` — найти существующее, может быть `rehab.sendMessage` или `rehab.createMessage`. Если нет — добавить:

```javascript
// frontend/src/services/api.js (raздел rehab)
sendMessage: (payload) => patientApi.post('/rehab/my/messages', payload),
```

UI кнопки — оставить как есть, только переименовать обработчик и добавить состояние `reportSending` / `reportSent`:

```jsx
<button
  onClick={handleReportSend}
  disabled={reportSending || reportSent}
  className="pd-btn pd-btn-primary"
>
  {reportSending ? 'Отправляем…' : reportSent ? '✓ Отправлено куратору' : 'Отправить отчёт'}
</button>

{reportSent && (
  <button
    onClick={() => setMessengerCTAOpen(true)}
    className="pd-btn pd-btn-secondary"
  >
    Также продублировать в Telegram
  </button>
)}
```

**Важно:**
- Иконки только из lucide-react (`Send`, `Check` если нужно). Не emoji в кнопках. Символ `✓` в text — допустим, но лучше `<Check size={14} />`
- При повторном открытии того же diary entry в тот же день — кнопка должна показывать «✓ Отправлено» если для этого diary_id уже есть `messages.linked_diary_id` запись. Запросить из messages в начале:

```jsx
useEffect(() => {
  if (!entry?.id) return;
  rehab.getMessages().then(res => {
    const reportSentForThisEntry = res.data.some(m =>
      m.message_kind === 'diary_report' && m.linked_diary_id === entry.id
    );
    setReportSent(reportSentForThisEntry);
  }).catch(() => {});
}, [entry?.id]);
```

(Это лёгкая лишняя загрузка — можно положить флаг в сам diary_entry response, но в Волне 0 не оптимизируем.)

---

## Шаг 5 — обновить `ContactScreen.js` для рендера diary_report

**Файл:** `frontend/src/pages/PatientDashboard/components/ContactScreen.js`
**Точка вставки:** в рендере списка сообщений.

Найти место где маппятся messages в JSX. Расширить рендер чтобы для `message_kind === 'diary_report'` показывать карточку:

```jsx
{messages.map(m => {
  if (m.message_kind === 'diary_report' && m.linked_diary) {
    return (
      <div key={m.id} className="pd-msg pd-msg-diary-report">
        <div className="pd-msg-header">
          <FileText size={16} />
          <span>Отчёт по дневнику · {formatDate(m.linked_diary.entry_date)}</span>
        </div>
        <div className="pd-msg-body">{m.body}</div>
        <button
          onClick={() => navigateToDiary(m.linked_diary.entry_date)}
          className="pd-msg-action"
        >
          Открыть запись
        </button>
      </div>
    );
  }
  // обычное сообщение — как было
  return <div key={m.id} className="pd-msg">{m.body}</div>;
})}
```

`navigateToDiary(date)` — переключение на DiaryScreen в нужную дату. Если такой логики ещё нет — оставить кнопку, но onClick может быть заглушкой `console.log` с TODO; в Волне 2 при работе над дневником это будет реальным переключением. **Минимально кнопка должна существовать для куратора** (она ведь будет видеть это в инструкторском UI потом).

---

## Шаг 6 — обновить `MessengerCTA.js` (роль изменилась)

**Файл:** `frontend/src/pages/PatientDashboard/components/ui/MessengerCTA.js`

Раньше это была единственная воронка для отправки отчёта. Теперь — опциональное дублирование. Убедиться что:

- Компонент НЕ открывается автоматически при клике «Отправить отчёт»
- Открывается только по явному клику на «Также продублировать в Telegram» из шага 4
- Логика copy-to-clipboard внутри MessengerCTA остаётся (для случая когда пользователь хочет дублировать) — но это не основной flow

Может потребоваться убрать prop `autoOpen` или эквивалент. Найти и почистить.

---

## NOT TOUCH

В этом коммите **НЕ трогать**:

- `services/telegramBot.js` — никаких изменений в боте
- Push'ы инструктору в Telegram — это Волна 3, не сейчас
- ExerciseRunner — коммит 05
- HomeScreen — коммиты 02, 04
- Графики trend в DiaryScreen — отдельная история (Волна 2)

---

## Тесты

### Backend

**Файл:** `backend/tests/__tests__/messages.routes.test.js` (новый или расширить существующий)

```javascript
describe('POST /api/rehab/my/messages', () => {
  test('text сообщение без linked_diary_id — успех', async () => {
    const res = await patientRequest.post('/api/rehab/my/messages').send({
      body: 'Привет куратор!'
    });
    expect(res.status).toBe(201);
    expect(res.body.data.message_kind).toBe('text');
    expect(res.body.data.linked_diary_id).toBeNull();
  });

  test('diary_report с валидным linked_diary_id — успех', async () => {
    // Создать diary_entry для тестового пациента
    const diaryRes = await patientRequest.post('/api/rehab/my/diary').send({ pain_level: 3 });
    const diaryId = diaryRes.body.data.id;

    const res = await patientRequest.post('/api/rehab/my/messages').send({
      body: 'Сегодня болит при ходьбе',
      message_kind: 'diary_report',
      linked_diary_id: diaryId
    });
    expect(res.status).toBe(201);
    expect(res.body.data.message_kind).toBe('diary_report');
    expect(res.body.data.linked_diary_id).toBe(diaryId);
  });

  test('diary_report без linked_diary_id — 400', async () => {
    const res = await patientRequest.post('/api/rehab/my/messages').send({
      body: 'отчёт',
      message_kind: 'diary_report'
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('LINKED_DIARY_REQUIRED');
  });

  test('diary_report с linked_diary_id чужого пациента — 404', async () => {
    // Создать diary_entry для пациента A, попытаться отправить отчёт от пациента B
    // ...
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('DIARY_NOT_FOUND');
  });

  test('невалидный message_kind — 400', async () => {
    const res = await patientRequest.post('/api/rehab/my/messages').send({
      body: 'test',
      message_kind: 'something_else'
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_KIND');
  });

  test('body > 5000 символов — 400', async () => {
    const res = await patientRequest.post('/api/rehab/my/messages').send({
      body: 'a'.repeat(5001)
    });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/rehab/my/messages', () => {
  test('возвращает linked_diary как объект для diary_report', async () => {
    // Создать diary_entry, отправить diary_report
    // GET /messages
    // expect linked_diary !== null, содержит entry_date, pain_level
  });

  test('linked_diary = null для обычных text сообщений', async () => {
    // ...
  });
});
```

### Frontend

**Файл:** `frontend/src/pages/PatientDashboard/components/DiaryScreen.test.js`

```javascript
describe('DiaryScreen — handleReportSend', () => {
  test('кнопка «Отправить отчёт» вызывает rehab.sendMessage с правильными параметрами', async () => {
    const sendMessageMock = jest.fn().mockResolvedValue({ data: { id: 1 } });
    jest.spyOn(rehab, 'sendMessage').mockImplementation(sendMessageMock);

    render(<DiaryScreen entry={{ id: 42, entry_date: '2026-05-08', pain_level: 3 }} />);
    const sendBtn = screen.getByRole('button', { name: /отправить отчёт/i });
    fireEvent.click(sendBtn);

    await waitFor(() => {
      expect(sendMessageMock).toHaveBeenCalledWith({
        body: expect.any(String),
        message_kind: 'diary_report',
        linked_diary_id: 42
      });
    });
  });

  test('после успешной отправки кнопка показывает «✓ Отправлено»', async () => {
    jest.spyOn(rehab, 'sendMessage').mockResolvedValue({ data: { id: 1 } });
    render(<DiaryScreen entry={{ id: 42 }} />);
    fireEvent.click(screen.getByRole('button', { name: /отправить отчёт/i }));
    await waitFor(() => {
      expect(screen.getByText(/отправлено куратору/i)).toBeInTheDocument();
    });
  });

  test('clipboard.writeText НЕ вызывается при отправке', async () => {
    const writeText = jest.fn();
    Object.assign(navigator, { clipboard: { writeText } });
    jest.spyOn(rehab, 'sendMessage').mockResolvedValue({ data: { id: 1 } });
    render(<DiaryScreen entry={{ id: 42 }} />);
    fireEvent.click(screen.getByRole('button', { name: /отправить отчёт/i }));
    await waitFor(() => {
      expect(writeText).not.toHaveBeenCalled();
    });
  });

  test('кнопка «Также в Telegram» появляется только после отправки', async () => {
    jest.spyOn(rehab, 'sendMessage').mockResolvedValue({ data: { id: 1 } });
    render(<DiaryScreen entry={{ id: 42 }} />);
    expect(screen.queryByRole('button', { name: /продублировать/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /отправить отчёт/i }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /продублировать/i })).toBeInTheDocument();
    });
  });
});
```

### Команды запуска

```bash
cd backend && npm test -- --testPathPattern=messages
cd frontend && npm test -- --testPathPattern=DiaryScreen --watchAll=false
```

---

## ⛔ STOP — smoke в реальном браузере

### Сценарий 1: «Свежий отчёт»

1. Залогиниться пациентом id=14 `avi707@mail.ru` / `Test1234`
2. Открыть DiaryScreen, заполнить запись (любые значения)
3. Сохранить запись (если есть отдельная кнопка save) или просто заполнить (если auto-save)
4. Нажать «Отправить отчёт»
5. Через ~1 сек кнопка меняется на «✓ Отправлено куратору»
6. Появляется вторичная кнопка «Также продублировать в Telegram»
7. **Не должно быть** автоматического открытия MessengerCTA

### Сценарий 2: «Отчёт виден в чате»

1. После сценария 1 — открыть ContactScreen
2. Увидеть карточку с заголовком «Отчёт по дневнику · 8 мая» (или сегодняшняя дата)
3. Карточка содержит body отчёта
4. Кнопка «Открыть запись» присутствует (даже если onClick — заглушка)

### Сценарий 3: «Опциональное дублирование в Telegram»

1. После сценария 1, во вторичной кнопке нажать «Также продублировать в Telegram»
2. Открывается MessengerCTA с выбором мессенджеров
3. Текст уже скопирован в clipboard (старая логика для дубля сохраняется)
4. Можно выбрать Telegram → откроется t.me/share или web.telegram.org с текстом

### Сценарий 4: «Повторный заход — кнопка показывает “Отправлено”»

1. После сценария 1 — закрыть DiaryScreen, перейти на HomeScreen, потом обратно
2. На той же записи дневника кнопка должна сразу показывать «✓ Отправлено куратору» (без необходимости снова жать)
3. Кнопка отключена (disabled)

### Сценарий 5: «Без записи дневника»

1. Открыть DiaryScreen для пустого состояния (новый день, нет entry)
2. Нажать «Отправить отчёт» (если кнопка вообще видна)
3. Должно показать toast «Сначала сохрани запись дневника»
4. Не отправлять ничего

⛔ **Если хотя бы один сценарий падает — НЕ коммитить.**

---

## Файлы

**Создать (если необходимо):**
- `backend/database/migrations/20260508_messages_extend.sql` — только если поля отсутствуют (см. шаг 1)
- `backend/tests/__tests__/messages.routes.test.js` (или расширить `rehab.routes.test.js`)

**Изменить:**
- `backend/routes/rehab.js` — handlers POST и GET `/my/messages`
- `frontend/src/pages/PatientDashboard/components/DiaryScreen.js`
- `frontend/src/pages/PatientDashboard/components/ContactScreen.js`
- `frontend/src/pages/PatientDashboard/components/ui/MessengerCTA.js` (минимальные изменения)
- `frontend/src/services/api.js` (добавить sendMessage если нет)
- `frontend/src/pages/PatientDashboard/components/DiaryScreen.test.js`

**НЕ ТРОГАТЬ:**
- ExerciseRunner, HomeScreen, RoadmapScreen
- `services/telegramBot.js`
- `database/schema.sql`

---

## Коммит

**Текст:**

```
feat(diary): отчёт через POST в messages вместо clipboard

#6 из Patient UX Roadmap v2 (Волна 0):
- Кнопка «Отправить отчёт» в DiaryScreen теперь сохраняет в БД
  через POST /api/rehab/my/messages с message_kind='diary_report'
- linked_diary_id связывает сообщение с записью дневника
- ContactScreen рендерит карточку отчёта с превью даты и боли
- MessengerCTA для Telegram стал опциональной вторичной кнопкой

Изменения:
- POST /my/messages принимает message_kind + linked_diary_id с
  валидацией ownership (linked_diary должен принадлежать patient'у)
- GET /my/messages возвращает hydrated linked_diary (entry_date, pain_level)
- Миграция 20260508_messages_extend (если поля отсутствовали)
- DiaryScreen handleReportSend заменил handleReportCopy
- При повторном открытии того же entry — кнопка сразу «✓ Отправлено»

Тесты: 8 backend + 4 frontend.
Roadmap: PATIENT_UX_ROADMAP_2026-05-08_v2.md #6
```

---

## Пост-коммит

**`CLAUDE.md`:**
- Раздел «Открытые баги»: вычеркнуть «Отчёт через clipboard» (если был как тех. долг)
- Раздел «API»: обновить контракт `POST /my/messages` с новыми полями
- Раздел «Структура БД»: обновить описание `messages` (добавить `message_kind`, `linked_diary_id`)

**`MEMORY.md` или `memory/wave_0_messages.md`:**
- «`messages.message_kind` whitelist: text, diary_report, session_report (Волна 3), system_alert»
- «`linked_diary_id` обязателен при `diary_report`, ownership-check на backend»

**`wave_0_progress.md`:** строка `03` → `✅ done`, SHA, дата.

---

## Definition of Done

- [ ] Структура `messages` проверена через `\d`, миграция применена если требовалась
- [ ] Backend тесты зелёные (включая 8 новых)
- [ ] Frontend тесты зелёные (включая 4 новых)
- [ ] Smoke 1-5 пройдены в реальном браузере
- [ ] В консоли браузера нет ошибок
- [ ] Документация обновлена
- [ ] Прогон миграции на проде после merge (если была)
- [ ] **Push после явного «ок»**
