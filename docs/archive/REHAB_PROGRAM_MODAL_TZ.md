# ТЗ: RehabProgram Modal — UI для назначения программы реабилитации

**Дата:** 2026-04-28
**Цель:** Дать Татьяне (инструктору) возможность мышкой назначить пациенту программу реабилитации, без захода в psql.
**Блокирует:** Home-экран пациентского кабинета — без `rehab_programs` запись пуст блок «Ваш комплекс на сегодня» и Roadmap.

---

## Параллельная работа — координация

В соседнем чате идёт реализация **Yandex OAuth** для пациентской авторизации. Чтобы не пересекаться, эта задача **НЕ ТРОГАЕТ**:

- `backend/routes/patientAuth.js`, `backend/routes/auth.js`
- `backend/middleware/patientAuth.js`, `backend/middleware/auth.js`
- `frontend/src/pages/PatientAuth/*` (Login, Register, ForgotPassword, ResetPassword)
- `frontend/src/pages/Login.js`
- `frontend/src/context/PatientAuthContext.js`
- `frontend/src/context/AuthContext.js`
- Секцию `patientApi` в [frontend/src/services/api.js](frontend/src/services/api.js) (строки ~314+, всё ниже комментария «АВТОРИЗАЦИЯ ПАЦИЕНТОВ»)
- Любые OAuth-связанные файлы (`oauthProxy*`, `telegramOauth*`, etc.)

**Все изменения — только инструкторская сторона.**

В `services/api.js` дописываем новый экспорт **в верхнюю часть файла** (рядом с `templates` и `diagnoses`, до секции `patientApi`). Если будет merge-конфликт — он тривиальный.

---

## Backend — без изменений

Все нужные эндпоинты уже работают в [backend/routes/rehab.js](backend/routes/rehab.js). Документирую контракты:

### `GET /api/rehab/programs?patient_id=X&status=active`
Authorization: instructor JWT (`authenticateToken`).
Response 200:
```json
{
  "data": [
    {
      "id": 7, "patient_id": 14, "complex_id": 59,
      "title": "Реабилитация ACL правого колена",
      "diagnosis": "ACL right knee",
      "surgery_date": "2026-03-15",
      "current_phase": 2,
      "phase_started_at": "2026-04-20",
      "phase_title": "Контроль и сила", "phase_subtitle": null, "phase_color": "#...",
      "status": "active",
      "notes": "Без impact-нагрузки",
      "is_active": true,
      "created_at": "2026-04-10T..."
    }
  ],
  "total": 1
}
```
Фильтр `created_by = req.user.id` — инструктор видит только свои.

### `POST /api/rehab/programs`
Body required: `patient_id`, `title`. Optional: `complex_id`, `diagnosis`, `surgery_date`, `current_phase` (default 1), `notes`.
Backend проверяет ownership (`patients.created_by = req.user.id OR NULL`) → 403 если чужой.
Создаёт также запись в `streaks` (initial).
Response 201:
```json
{ "message": "Программа создана", "data": { ...program } }
```

### `PUT /api/rehab/programs/:id`
Body: любые из `title, diagnosis, surgery_date, current_phase, status, notes, complex_id`. COALESCE — null поля не затирают.
Особенность: при смене `current_phase` бекенд автоматически обновляет `phase_started_at = CURRENT_DATE`.
Response 200: `{ message: 'Программа обновлена', data: { ...program } }`.

### `DELETE /api/rehab/programs/:id`
Soft delete (`is_active = false`).
Response 200: `{ message: 'Программа удалена' }`.

---

## Шаг 1 — API-клиент

**Файл:** [frontend/src/services/api.js](frontend/src/services/api.js)

Найти строку с `export const templates = {` (~строка 299) и **сразу после блока templates**, до `// АВТОРИЗАЦИЯ ПАЦИЕНТОВ` комментария добавить:

```js
export const rehabPrograms = {
  getByPatient: (patientId, status) => {
    const params = new URLSearchParams({ patient_id: String(patientId) });
    if (status) params.set('status', status);
    return api.get(`/rehab/programs?${params.toString()}`);
  },
  create: (data) => api.post('/rehab/programs', data),
  update: (id, data) => api.put(`/rehab/programs/${id}`, data),
  delete: (id) => api.delete(`/rehab/programs/${id}`),
};
```

**Не трогать** ничего ниже строки `// АВТОРИЗАЦИЯ ПАЦИЕНТОВ`.

---

## Шаг 2 — Компонент `RehabProgramModal`

**Создать файлы:**
- `frontend/src/components/RehabProgramModal.js`
- `frontend/src/components/RehabProgramModal.css`

### Паттерн UI

Подражает [frontend/src/components/InviteCodeModal.js](frontend/src/components/InviteCodeModal.js):
- Wrapper `<div className="modal-overlay">` с `onClick={onClose}`
- Внутри `<div className="modal-content rehab-program-modal" onClick={stopPropagation}>`
- Header с иконкой (`Activity` или `Stethoscope` из lucide-react), title, close-кнопка
- Body с формой
- Footer с кнопками

### Props

```js
function RehabProgramModal({ patient, onClose, onSaved }) { ... }
```

- `patient` — `{ id, full_name }`
- `onClose: () => void`
- `onSaved: () => void` — родитель перезагружает list

### State

```js
const [mode, setMode] = useState(null);       // 'create' | 'edit' | null (loading)
const [program, setProgram] = useState(null); // существующая программа в edit
const [complexesList, setComplexesList] = useState([]);
const [loading, setLoading] = useState(true); // initial fetch
const [submitting, setSubmitting] = useState(false);
const [confirmDelete, setConfirmDelete] = useState(false);

const [form, setForm] = useState({
  title: '',
  complex_id: '',
  diagnosis: '',
  surgery_date: '',
  current_phase: 1,
  notes: '',
  status: 'active',
});
```

### Initial load (`useEffect` на mount)

Параллельно (`Promise.all`):
1. `rehabPrograms.getByPatient(patient.id, 'active')` → если `data[0]` есть, mode=edit + заполнить form, иначе mode=create.
2. `complexes.getByPatient(patient.id)` → setComplexesList.

При ошибке — `toast.error('Не удалось загрузить данные программы')`, оставить mode=null + показать пустое тело с retry-кнопкой.

### Form fields

| Поле | Тип | Required | Заметки |
|------|-----|----------|---------|
| `title` | text | ✅ | Default в create-mode: `'Реабилитация'`. Max 255. |
| `complex_id` | select | ✅ | Опции из `complexesList`. Показывает `c.title || \`Комплекс #${c.id}\``. **Если `complexesList.length === 0`** — render disabled select + warning «У пациента нет ни одного комплекса. Сначала создайте комплекс упражнений на странице "Мои комплексы".» + Submit disabled. |
| `diagnosis` | text | — | Plain string. Подсказка: «Например: "ACL правого колена"». |
| `surgery_date` | date | — | `<input type="date">`. |
| `current_phase` | select | — | 1, 2, 3, 4 (числами). Default 1. Подсказка: «Фазы относятся к ACL-программам». |
| `notes` | textarea | — | rows=3. |
| `status` | select | только в edit | `active` / `paused` / `completed`. |

### Validation

```js
const isValid = form.title.trim().length > 0 && form.complex_id;
```

Submit-кнопка `disabled={!isValid || submitting || complexesList.length === 0}`.

### Submit handler

```js
const handleSubmit = async (e) => {
  e.preventDefault();
  if (!isValid) return;
  setSubmitting(true);
  try {
    const payload = {
      title: form.title.trim(),
      complex_id: form.complex_id ? parseInt(form.complex_id, 10) : null,
      diagnosis: form.diagnosis.trim() || null,
      surgery_date: form.surgery_date || null,
      current_phase: parseInt(form.current_phase, 10),
      notes: form.notes.trim() || null,
    };
    if (mode === 'create') {
      payload.patient_id = patient.id;
      await rehabPrograms.create(payload);
      toast.success('Программа создана');
    } else {
      payload.status = form.status;
      await rehabPrograms.update(program.id, payload);
      toast.success('Программа обновлена');
    }
    onSaved();
  } catch (err) {
    toast.error(err.response?.data?.message || 'Не удалось сохранить программу');
  } finally {
    setSubmitting(false);
  }
};
```

### Delete handler (только edit-mode)

Кнопка `<button className="btn-delete">Удалить программу</button>` в footer слева.
По клику — открыть inline-confirm («Удалить программу? Дневник и прогресс пациента сохранятся, но он перестанет видеть “комплекс на сегодня”»). При подтверждении:
```js
await rehabPrograms.delete(program.id);
toast.success('Программа удалена');
onSaved();
```

Можно использовать `useConfirm` hook (уже есть в проекте: `frontend/src/hooks/useConfirm.js`) — посмотрите как `Patients.js` делает в `handleDelete`.

### UI-детали

- Header: иконка `Activity` (lucide) + title `Программа реабилитации` + small grey подзаголовок `{patient.full_name}`.
- В edit-mode под формой: «Создана: {dd.MM.yyyy} · Текущая фаза начата: {dd.MM.yyyy}». Использовать `formatDateNumeric` из [utils/dateUtils](frontend/src/utils/dateUtils.js).
- Подсказка под `complex_id`: «Этот комплекс пациент увидит как “комплекс на сегодня” в своём кабинете».
- В loading-стейте — простой `<LoadingSpinner />` ([components/LoadingSpinner.js](frontend/src/components/LoadingSpinner.js) уже есть).

### CSS

`RehabProgramModal.css` — повторить структуру [InviteCodeModal.css](frontend/src/components/InviteCodeModal.css):
- `.rehab-program-modal { max-width: 560px; }`
- `.rehab-program-modal-body { padding: 0 24px 24px; }`
- Form fields с `.detail-row`-style label/input pairs
- Helper-текст `.field-help { color: #718096; font-size: 12px; margin-top: 4px; }`
- Warn-блок (если нет комплексов) — копия `.invite-code-help-warn`
- Footer с flex-row: `.modal-footer-actions { display: flex; justify-content: space-between; gap: 12px; padding: 16px 24px; border-top: 1px solid #e2e8f0; }`

---

## Шаг 3 — Интеграция в `Patients.js`

**Файл:** [frontend/src/pages/Patients.js](frontend/src/pages/Patients.js)

### 3.1 Импорты

В блоке lucide-import (~строки 14-28) добавить `Activity`:
```js
import { ..., KeyRound, Activity } from 'lucide-react';
```

В блоке других импортов (~строка 8):
```js
import RehabProgramModal from '../components/RehabProgramModal';
```

### 3.2 State

После `const [inviteCodePatient, setInviteCodePatient] = useState(null);` (~строка 43) добавить:
```js
const [programPatient, setProgramPatient] = useState(null);
```

### 3.3 Кнопка в `patient-actions`

В блоке `<div className="patient-actions">` (~строка 560), **между кнопкой «Прогресс» и кнопкой «Редактировать»**, вставить:

```jsx
<button
  className="btn-secondary"
  onClick={() => setProgramPatient(patient)}
  title="Программа реабилитации"
>
  <Activity className="btn-icon" size={16} />
  <span>Программа</span>
</button>
```

### 3.4 Рендер модалки

В конце return-блока, **рядом с `<InviteCodeModal>`** (~поиск по `inviteCodePatient`), добавить:

```jsx
{programPatient && (
  <RehabProgramModal
    patient={programPatient}
    onClose={() => setProgramPatient(null)}
    onSaved={() => {
      setProgramPatient(null);
      loadPatients();
    }}
  />
)}
```

---

## Шаг 4 — Тесты

**Создать:** `frontend/src/components/__tests__/RehabProgramModal.test.js`

Минимальные кейсы (Jest + React Testing Library, паттерн как у других тестов в проекте):

1. **Render — пациент без программы → create-mode**
   - Mock `rehabPrograms.getByPatient` → `{ data: [] }`
   - Mock `complexes.getByPatient` → `{ data: [{ id: 1, title: 'Комплекс A' }] }`
   - Title пустой, кнопка «Сохранить» disabled пока не введено title

2. **Render — пациент с программой → edit-mode**
   - Mock возвращает `{ data: [{ id: 7, title: 'Реаб ACL', complex_id: 1, current_phase: 2, status: 'active' }] }`
   - Form pre-filled, видна кнопка «Удалить программу»

3. **Validation — submit disabled пока title и complex_id не заданы**

4. **Submit create** — проверить что `rehabPrograms.create` вызван с правильным `patient_id` и payload, `onSaved` вызван

5. **Submit edit** — проверить что `rehabPrograms.update` вызван, `onSaved` вызван

6. **Empty complexes warning** — Mock complexes → `{ data: [] }`, проверить наличие текста «У пациента нет ни одного комплекса»

7. **Delete flow** — клик на «Удалить программу» → confirm → `rehabPrograms.delete` вызван → `onSaved`

**Mock-конвенция (см. CLAUDE.md):**
> mocks bypass interceptor, so mock `{ data: <payload> }` directly

```js
jest.mock('../../services/api', () => ({
  rehabPrograms: {
    getByPatient: jest.fn(() => Promise.resolve({ data: [] })),
    create: jest.fn(() => Promise.resolve({ data: { id: 1 } })),
    update: jest.fn(() => Promise.resolve({ data: { id: 1 } })),
    delete: jest.fn(() => Promise.resolve({ data: {} })),
  },
  complexes: {
    getByPatient: jest.fn(() => Promise.resolve({ data: [] })),
  },
}));
```

**Запуск:**
```bash
cd frontend && npx react-scripts test --watchAll=false RehabProgramModal
```

Проходить должны все. Также проверить что **существующие 156 тестов** не упали:
```bash
cd frontend && npx react-scripts test --watchAll=false
```

---

## Шаг 5 — Smoke test (ручной)

**Серверы:**
```bash
# Tab 1
cd backend && npm run dev   # :5000

# Tab 2
cd frontend && PORT=3001 BROWSER=none npm start   # :3001
```

**Сценарий 1 — Create**
1. `http://localhost:3001/login` → `vadim@azarean.com` / `Test1234`
2. Перейти на «Пациенты» (или /dashboard?home=1 → Пациенты)
3. Найти тестового пациента **id=14 «Вадим»** (avi707@mail.ru)
4. Если у него уже есть программа в БД (вероятно есть от предыдущих смоук-тестов) — сначала удалить её через UI или вручную:
   ```sql
   UPDATE rehab_programs SET is_active = false WHERE patient_id = 14;
   ```
5. Нажать кнопку **«Программа»** → модалка открывается в режиме **create**
6. Если у пациента нет комплексов — увидеть warning. Если есть (комплекс 59 у пациента 14 уже привязан) — выбрать его в select.
7. Заполнить: title=«Реабилитация ACL колена», complex_id=59 (тестовый), diagnosis=«ACL правое колено», phase=1
8. Сохранить → toast «Программа создана» → модалка закрылась → list перезагрузился

**Сценарий 2 — пациент видит программу**
1. Открыть в incognito-окне `http://localhost:3001/patient-login`
2. `avi707@mail.ru` / `Test1234`
3. На Home должен появиться блок **«Ваш комплекс на сегодня»** с кнопкой «Начать тренировку» (раньше блок был пустой)
4. Нажать «Начать тренировку» → ExerciseRunner запускается с упражнениями выбранного комплекса

**Сценарий 3 — Edit**
1. Вернуться в инструкторский браузер, нажать «Программа» у того же пациента → модалка в **edit-mode**, поля заполнены
2. Сменить current_phase 1 → 2, сохранить → toast «Программа обновлена»
3. Открыть пациентский Roadmap-экран → должна показаться 2-я фаза вместо 1-й

**Сценарий 4 — Delete**
1. «Программа» → «Удалить программу» → confirm → toast «Программа удалена»
2. У пациента на Home блок «комплекс на сегодня» снова пустой

---

## Файлы — итоговый чеклист

### Создать
- `frontend/src/components/RehabProgramModal.js` (~250-300 строк)
- `frontend/src/components/RehabProgramModal.css` (~80-100 строк)
- `frontend/src/components/__tests__/RehabProgramModal.test.js` (~7 кейсов)

### Изменить
- `frontend/src/services/api.js` — добавить экспорт `rehabPrograms` (один блок)
- `frontend/src/pages/Patients.js` — импорт + state + кнопка + рендер модалки

### НЕ ТРОГАТЬ
- весь `backend/`
- любые auth-файлы (см. секцию «Параллельная работа» выше)
- `patientApi` секцию в `services/api.js`

---

## Коммит

```
feat(rehab): RehabProgramModal — UI для назначения программы реабилитации

Закрывает архитектурный gap «Нет UI для RehabProgram» из CLAUDE.md.
Разблокирует Home-экран пациента (блок «Ваш комплекс на сегодня»).

- Backend без изменений (POST/PUT/DELETE /api/rehab/programs готовы)
- Новый компонент RehabProgramModal в стиле InviteCodeModal
- Кнопка «Программа» на карточке пациента в Patients.js
- Поддерживает create/edit/delete через одну модалку
- 7 unit-тестов

Не пересекается с параллельным Yandex OAuth — трогает только
инструкторскую сторону (api instance, не patientApi).
```

---

## Пост-коммит — обновить документацию

### CLAUDE.md
В секции «Завершённые исправления» (Bug-блок), добавить:
```
43. **RehabProgram UI** → создан `frontend/src/components/RehabProgramModal.js`. Кнопка «Программа» на карточке пациента в Patients.js → create/edit/delete через одну модалку. Закрыл backlog gap «Нет UI для RehabProgram».
```

И в backlog таблице открытых багов убрать строку про RehabProgram (если есть).

### MEMORY.md
В секции `## Architectural gaps (не закрыты — backlog)`:
- Зачеркнуть `**Нет UI для создания RehabProgram**` → пометить **ЗАКРЫТО Phase 3 RehabProgramModal**

В секции `## Closed bugs (2026-04-27 → 2026-04-28, ...)`:
- Добавить пункт про RehabProgramModal с хешом коммита.

---

## Definition of Done

- [ ] `cd frontend && npx react-scripts test --watchAll=false` — все тесты pass (156 + новые 7 = 163)
- [ ] Smoke test 1-4 пройден без ошибок в консоли браузера
- [ ] У пациента id=14 в Home отображается «Ваш комплекс на сегодня» после создания программы
- [ ] Коммит создан, сообщение по шаблону выше
- [ ] CLAUDE.md и MEMORY.md обновлены
- [ ] Не задействован ни один файл из списка «НЕ ТРОГАТЬ»
