# TZ HOTFIX #2 — Поле «Название комплекса» в CreateComplex + EditComplex

**Дата:** 2026-05-15
**Объём:** ~30-45 минут
**Risk:** LOW — изолированное UI добавление, BD already accepts title
**Тип:** Hot-fix UX качества (root cause Bug #13)
**Архитектор:** GO (см. отчёт 2026-05-15) — добавить required text input, **НЕ** делать NOT NULL в БД (backwards compat)

---

## Контекст

БД: `complexes.title VARCHAR(255)` существует с миграции `20260211_add_complexes_title.sql` (3 месяца). Backend `POST /api/complexes` уже принимает `title` в body, frontend его **не отправляет**. Все existing complexes имеют `title=NULL`.

Wave 1 #1.08a добавил computed `derived_title` (COALESCE первых 2 упражнений ' · ') — это **косметика** для UI fallback, не настоящий fix. Инструктор по-прежнему видит «3D дыхание (алгоритм) · IMG_9033» в селекторах вместо нормального «Утренний комплекс плеча».

**Confirmed user impact (smoke 2026-05-15):** инструктор не понимает что выбирает в `ComplexSelector` модалки `RehabProgramModal` — `derived_title` для длинных названий упражнений становится нечитаем.

---

## Verify-step

```bash
cd c:/Users/Вадим/Desktop/Azarean_rehab

# 1. Подтвердить что поле title уже в БД
"C:/Program Files/PostgreSQL/18/bin/psql.exe" -h localhost -U postgres -d azarean_rehab \
  -c "\d complexes" | grep title
# Ожидается: title | character varying(255) |

# 2. Подтвердить что backend принимает title
grep -n "req.body" backend/routes/complexes.js | head -5
grep -n "title" backend/routes/complexes.js | head -20
# Должны быть строки типа `const { title, diagnosis_id, ... } = req.body`

# 3. Подтвердить что frontend НЕ передаёт title
grep -n "title" frontend/src/pages/CreateComplex.js | head -10
grep -n "title" frontend/src/pages/EditComplex.js | head -10
# В обоих 0 совпадений по нашей теме (только в exercise.title)

# 4. Проверить что derived_title работает (smoke ComplexSelector в RehabProgramModal)
# — это уже работает после Wave 1 #1.08a, наш fix будет ПОВЕРХ.

# 5. Существующих complexes сколько? (для смока после)
"C:/Program Files/PostgreSQL/18/bin/psql.exe" -h localhost -U postgres -d azarean_rehab \
  -c "SELECT COUNT(*) FILTER (WHERE title IS NULL) AS without_title, COUNT(*) FILTER (WHERE title IS NOT NULL) AS with_title, COUNT(*) AS total FROM complexes WHERE is_active = true;"
# Ожидается: все NULL (без title). После нашего fix'а новые будут с title.
```

---

## Что менять

### Файл 1: `frontend/src/pages/CreateComplex.js`

#### 1A — Добавить state (строка ~148, рядом с `selectedDiagnosis`):

**После:**
```javascript
const [selectedPatient, setSelectedPatient] = useState(null);
```

**Добавить:**
```javascript
const [complexTitle, setComplexTitle] = useState('');
```

(Использую `complexTitle` чтобы не конфликтовать с другими `title` переменными в файле, например `templateName/templateDescription`.)

#### 1B — Передать в complexData (строка ~284):

**Before:**
```javascript
const complexData = {
  patient_id: selectedPatient.id,
  diagnosis_id: selectedDiagnosis?.id || null,
  diagnosis_note: diagnosisNote,
  recommendations: ...,
  warnings: ...,
  exercises: ...
};
```

**After:**
```javascript
const complexData = {
  patient_id: selectedPatient.id,
  title: complexTitle.trim() || null,    // <-- ДОБАВИТЬ
  diagnosis_id: selectedDiagnosis?.id || null,
  diagnosis_note: diagnosisNote,
  recommendations: ...,
  warnings: ...,
  exercises: ...
};
```

`.trim() || null` — пустая строка → NULL, чтобы derived_title fallback продолжал работать.

#### 1C — Добавить input в Step 2 UI (строка ~506-540):

**Вставить ПЕРЕД блоком «Диагноз (опционально)» (новый `<div className={s.formGroup}>`):**

```jsx
<div className={s.formGroup}>
  <label htmlFor="complex-title-input">Название комплекса</label>
  <input
    id="complex-title-input"
    type="text"
    placeholder="Например: Утренний комплекс плеча"
    value={complexTitle}
    onChange={(e) => setComplexTitle(e.target.value)}
    maxLength={255}
    autoComplete="off"
  />
  <small className={s.fieldHint}>
    Опционально. Если оставить пустым — название соберётся из первых двух упражнений.
  </small>
</div>
```

**Note:** проверить что `s.fieldHint` есть в `CreateComplex.module.css`. Если нет — использовать inline style `<small style={{ color: 'var(--color-text-muted)', fontSize: '12px' }}>` или скопировать класс из соседних формов.

#### 1D — Step 4 (success) — показать введённое название

Опционально, для UX clarity. Найти Step 4 где показывается «Комплекс создан». Если показывается название — использовать `complexTitle || 'из первых упражнений'`.

---

### Файл 2: `frontend/src/pages/EditComplex.js`

#### 2A — Добавить state (строка ~130):

**После `const [patientName, setPatientName] = useState('');`** (или рядом):

```javascript
const [complexTitle, setComplexTitle] = useState('');
```

#### 2B — Pre-fill из loadComplexData (строка ~175):

**Before:**
```javascript
setPatientName(complexData.patient_name);
setDiagnosisId(complexData.diagnosis_id || '');
setRecommendations(complexData.recommendations || '');
```

**After:**
```javascript
setPatientName(complexData.patient_name);
setComplexTitle(complexData.title || '');    // <-- ДОБАВИТЬ
setDiagnosisId(complexData.diagnosis_id || '');
setRecommendations(complexData.recommendations || '');
```

#### 2C — Передать в updateData (строка ~274):

**Before:**
```javascript
const updateData = {
  diagnosis_id: diagnosisId || null,
  recommendations: recommendations || null,
  exercises: ...
};
```

**After:**
```javascript
const updateData = {
  title: complexTitle.trim() || null,    // <-- ДОБАВИТЬ
  diagnosis_id: diagnosisId || null,
  recommendations: recommendations || null,
  exercises: ...
};
```

#### 2D — Добавить input в UI

**Verify:** найти где в EditComplex.js рендерится форма (вокруг текста типа «Рекомендации» или «Изменить комплекс для»). Грепнуть:

```bash
grep -n "Рекомендации\|Назначение\|diagnosis\|recommendations\|formGroup" frontend/src/pages/EditComplex.js
```

Найти `<div className={s.formGroup}>` с textarea для recommendations. **ПЕРЕД этим блоком** вставить:

```jsx
<div className={s.formGroup}>
  <label htmlFor="complex-title-input">Название комплекса</label>
  <input
    id="complex-title-input"
    type="text"
    placeholder="Например: Утренний комплекс плеча"
    value={complexTitle}
    onChange={(e) => setComplexTitle(e.target.value)}
    maxLength={255}
    autoComplete="off"
  />
  <small className={s.fieldHint}>
    Если оставить пустым — название соберётся из первых двух упражнений.
  </small>
</div>
```

---

### Файл 3 (опционально): `backend/routes/complexes.js`

**Verify:** убедиться что `PUT /complexes/:id` принимает `title` поле и обновляет БД.

```bash
grep -B 1 -A 15 "router.put" backend/routes/complexes.js | head -30
```

Если `UPDATE complexes SET ...` НЕ содержит `title = $...` — добавить. Если есть — НИЧЕГО НЕ МЕНЯТЬ.

POST уже работает (verify-step #2 это подтвердит).

---

## Тесты

### Backend

`backend/routes/complexes.js` — если PUT не принимал title и мы добавили:
- Найти существующий тест `describe('PUT /api/complexes/:id', ...)`
- Добавить тест: «обновляет title если передан» + «sets title=NULL если передан пустой/null»

Если PUT уже принимал title (после verify-step) — backend тесты не трогать.

### Frontend

Добавить 1-2 теста в `frontend/src/pages/CreateComplex.test.js` (если файл существует) или skip frontend тесты (CRA frontend в проекте уже покрыт 252 тестов, для UI-input это test через DOM-rendering).

**Опционально:** unit-тест что `complexes.create()` вызывается с `title` в payload.

### Smoke test (в dev браузере)

1. Открыть `/create-complex` → Step 1 выбрать пациента → Step 2 заполнить «Название комплекса: Утренний плеча» + diagnosis → Step 3 добавить 2 упражнения → Step 4 финиш
2. Открыть БД:
   ```sql
   SELECT id, title, derived_title, patient_id FROM complexes ORDER BY id DESC LIMIT 1;
   ```
   Должен быть `title = 'Утренний плеча'`
3. Открыть `/edit-complex/:id` (только что созданного) → проверить что title pre-filled → изменить на «Утренний правое плечо» → save
4. Снова `SELECT title FROM complexes WHERE id = :id` → `'Утренний правое плечо'`
5. **RehabProgramModal regression check:** открыть модалку добавления программы → выбрать пациента → ComplexSelector → новый комплекс должен показаться с `title`, не fallback
6. **Backwards compat:** старый комплекс (`title=NULL`) в селекторе должен показываться через `derived_title` fallback (первых 2 упражнения)
7. **Пустой title:** создать комплекс с пустым названием → БД `title=NULL` → селектор использует `derived_title`

---

## Definition of Done

- [ ] Verify-step 5 проверок пройдены
- [ ] CreateComplex.js: state `complexTitle` добавлен, передаётся в complexData, input в Step 2 UI
- [ ] EditComplex.js: state `complexTitle` добавлен, pre-fill из loadComplexData, передаётся в updateData, input в UI
- [ ] (Опционально) backend PUT /complexes/:id — добавлено handling title если не было
- [ ] Smoke 7 сценариев пройдены в dev браузере
- [ ] Frontend tests прошли (252/252 → 252+ если добавил unit-тесты)
- [ ] Backend tests прошли если PUT trog'нул
- [ ] Commit на ветке `hotfix/complex-title-ui` от main
- [ ] Mini-PR с body описанием
- [ ] После merge — обновить memory `bug_complex_title_field_missing_in_ui.md` пометкой closed + SHA
- [ ] CLAUDE.md — Bug #13 переоформить из «закрыт как косметика через derived_title» в «полностью закрыт UI input PR #XX + derived_title fallback PR #58/#59»

---

## Smoke сценарий регрессии

**Что НЕ должно сломаться:**
- Старые complexes (title=NULL) показываются через derived_title в:
  - `ComplexSelector` (RehabProgramModal create wizard + edit form)
  - `MyComplexes` список
  - `PatientProgress` view
  - `ViewProgress` view
- `derived_title` SELECT в `routes/complexes.js` (Wave 1 #1.08a) — НЕ ТРОГАТЬ
- Существующий `templates.title` UI (отдельная сущность) — не путать

---

## Commit message

```
fix(complex-title): добавить UI поле «Название комплекса» (Bug #13 root cause)

БД допускает `complexes.title VARCHAR(255)` с миграции 20260211, но
frontend UI поле не expose'ил. Все complexes создавались с title=NULL.
Wave 1 #1.08a добавил `derived_title` (COALESCE первых 2 упражнений) —
это была косметика, не настоящий fix.

Changes:
- CreateComplex.js: state complexTitle + input в Step 2 + передача в payload
- EditComplex.js: state complexTitle + pre-fill из existing + передача в update

Поле опционально (не required). Пустой → NULL → derived_title fallback.
Backwards compat: старые complexes с title=NULL продолжают работать через
derived_title (Wave 1 #1.08a).

Smoke 7 сценариев пройдены: новые с title, edit pre-fill, RehabProgramModal
ComplexSelector показывает реальный title, fallback для legacy.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

## NOT TOUCH

- **`routes/complexes.js` SELECT'ы с derived_title** (Wave 1 #1.08a) — НЕ ТРОГАТЬ
- **`ComplexSelector.js`** (Wave 1 #1.08b) — он уже корректно показывает `c.derived_title || c.title || \`Комплекс #${c.id}\``. Не менять fallback.
- **Other formGroup'ы** в CreateComplex/EditComplex — не рефакторить
- **Step navigation logic** — не трогать (Step 2 → Step 3 conditions)
- **Templates UI** — отдельная сущность (`templates.title` уже работает), не путать
- **Dark-theme dirty файлы** — изоляция через `git stash` перед стартом, restore после
- **complexes.title NOT NULL constraint** — НЕ добавлять (breaking change для existing данных)

---

## Связано

- [memory/bug_complex_title_field_missing_in_ui.md](.claude/projects/c--Users-------Desktop-Azarean-rehab/memory/bug_complex_title_field_missing_in_ui.md) — обнаружение бага
- Bug #13 в CLAUDE.md — закрыт через derived_title косметику (Wave 1 #1.08a + 1.08b), этот PR закрывает root cause
- `feature_complex_duration_calc.md` — соседний backlog (расчёт длительности) — не связан, не трогать
