# TZ HOTFIX — пациентский /my/stuck-status: program_type из БД (не хардкод 'acl')

**Дата:** 2026-05-13 (написано после Wave 1 batch merge consent от архитектора)
**Объём:** ~30 минут работы
**Risk:** низкий — мини-патч, only-good направление (никого не ломает)
**Тип:** Hot-fix перед стартом Wave 2

---

## Контекст

Wave 0 #06 (`3aca77d` ну или какой там был) написал пациентский endpoint `GET /api/rehab/my/stuck-status` для UI-баннера «вы застряли на фазе» (RoadmapScreen). Тогда multi-protocol foundation ещё не было — поэтому endpoint захардкодил `program_type = 'acl'` в SQL.

Wave 1 #1.01 ввёл поле `rehab_programs.program_type` и справочник `program_types`. Wave 1 #1.04 убрал хардкод 'acl' в RoadmapScreen.js, services/api.js и telegramBot. **Но этот endpoint оставили за scope 1.04** — он был не в TZ архитектора.

**Сейчас в проде после merge Wave 1:** ACL-пациент видит баннер корректно (хардкод совпадает с реальностью), а shoulder/knee_general пациент **никогда** не увидит баннер — SELECT по `program_type = 'acl'` вернёт 0 строк, endpoint отдаст `{ is_stuck: false }` всегда.

---

## Зависимость

После merge Wave 1 в main (нужна миграция 1.01 + `rehab_programs.program_type` в prod БД).

Ветка `hotfix/patient-stuck-status-program-type` от `main` (после deploy Wave 1).

---

## Verify-step (как договорились с архитектором)

Перед стартом проверить:

```bash
cd c:/Users/Вадим/Desktop/Azarean_rehab
grep -nE "program_type = 'acl'" backend/routes/rehab.js
# Ожидается: строка ~512 в /my/stuck-status. Если 0 совпадений — кто-то уже починил, остановиться.

grep -nE "SELECT.*current_phase.*phase_started_at" backend/routes/rehab.js
# Ожидается: строка ~474, должен НЕ включать program_type. Если уже включает — частично исправлено, скоординировать.
```

---

## Что менять

### Файл: `backend/routes/rehab.js`

**1. Добавить `program_type` в SELECT программы (строка ~474):**

```javascript
const programResult = await query(
  `SELECT id, program_type, current_phase, phase_started_at, created_at
   //              ^^^^^^^^^^^^^^ ДОБАВИТЬ
   FROM rehab_programs
   WHERE patient_id = $1 AND status = 'active' AND is_active = true
   ORDER BY created_at DESC
   LIMIT 1`,
  [patientId]
);
```

**2. Заменить хардкод 'acl' на `program.program_type` в phase lookup (строка ~509):**

```javascript
const phaseResult = await query(
  `SELECT title, duration_weeks
   FROM rehab_phases
   WHERE program_type = $1 AND phase_number = $2 AND is_active = true
   //                  ^^^                  ^^^  было: program_type = 'acl' AND phase_number = $1
   LIMIT 1`,
  [program.program_type, program.current_phase]
);
```

**3. Удалить комментарий «Wave 1 заменит хардкод 'acl'» (строка ~489)** — Wave 1 уже завершена, комментарий устарел.

### Файл: `backend/tests/__tests__/rehab.routes.test.js`

Поправить существующие mocks в блоке `describe('GET /api/rehab/my/stuck-status', ...)` (строки ~1116-1238). Сейчас они мокают:

```javascript
query.mockResolvedValueOnce({
  rows: [{
    id: 1,
    current_phase: 2,
    phase_started_at: ..., created_at: ...,
  }],
});
```

Добавить `program_type: 'acl'` в каждый mock (или соответствующее значение по сценарию).

**Добавить новый тест:**

```javascript
it('возвращает is_stuck=true для shoulder-программы (не acl)', async () => {
  const eightWeeksAgo = new Date(Date.now() - 8 * 7 * 24 * 60 * 60 * 1000);
  query.mockResolvedValueOnce({
    rows: [{
      id: 1, program_type: 'shoulder_general',
      current_phase: 2, phase_started_at: eightWeeksAgo, created_at: eightWeeksAgo,
    }],
  });
  // duration_weeks = "0-4" (upper=4) → threshold 1.5× = 6 нед. 8 > 6 → stuck
  query.mockResolvedValueOnce({
    rows: [{ title: 'Иммобилизация', duration_weeks: '0-4' }],
  });

  const res = await request(app)
    .get('/api/rehab/my/stuck-status')
    .set('Authorization', `Bearer ${validToken}`);

  expect(res.status).toBe(200);
  expect(res.body.data.is_stuck).toBe(true);
});
```

И проверить в первом mock-call'е что SQL содержит `program_type = $1` (а не литерал 'acl'):

```javascript
expect(query.mock.calls[1][0]).toMatch(/program_type = \$1/);
expect(query.mock.calls[1][1]).toContain('shoulder_general');
```

---

## Smoke test

### Сценарий 1 — ACL пациент (regression check)
Использовать тестового пациента id=14 (Vadim) с ACL программой. Открыть RoadmapScreen — баннер ведёт себя как до hot-fix'а.

### Сценарий 2 — Shoulder пациент
Создать (или перевести) тестового пациента на `program_type='shoulder_general'`:
```sql
UPDATE rehab_programs SET program_type = 'shoulder_general'
WHERE patient_id = 15 AND is_active = true;
```
+ программу сделать «застрявшей» (PHASE_STARTED_AT 12 недель назад):
```sql
UPDATE rehab_programs SET phase_started_at = NOW() - INTERVAL '12 weeks'
WHERE patient_id = 15 AND is_active = true;
```
Залогиниться как этот пациент → RoadmapScreen → **баннер должен показаться**. До hot-fix'а — не покажется (silent failure).

---

## Definition of Done

- [ ] Verify-step grep'ом ✓
- [ ] 2 SQL правки в `routes/rehab.js`
- [ ] Удалён устаревший комментарий
- [ ] Все существующие тесты `/my/stuck-status` обновлены с `program_type` в моках
- [ ] Новый тест для shoulder-сценария
- [ ] Backend `npm test` зелёный (ожидаем +1 тест)
- [ ] Smoke сценарии 1-2 пройдены
- [ ] Commit + Co-Authored-By
- [ ] **Push в новую ветку `hotfix/patient-stuck-status-program-type` от `main`**
- [ ] Mini-PR в main, squash-merge
- [ ] Закрыть в `memory/bug_patient_stuck_status_hardcoded_acl.md` пометкой «закрыт SHA <commit>»

---

## Commit message

```
fix(stuck): пациентский /my/stuck-status — program_type из БД

Wave 0 #06 захардкодил `program_type = 'acl'` в SQL до того как
multi-protocol foundation (Wave 1) ввёл поле program_type. Wave 1 #1.04
убрал хардкод в RoadmapScreen + api.js + telegramBot, но этот endpoint
остался за scope.

Для shoulder/knee_general пациентов SELECT возвращал 0 строк → endpoint
отдавал { is_stuck: false } всегда → баннер «застрял на фазе» никогда
не показывался. Silent failure без ошибок в console.

Hot-fix перед Wave 2 — добавить program_type из rehab_programs.program_type
в phase lookup. Никаких миграций. Тесты обновлены + +1 кейс для shoulder.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

## NOT TOUCH

- LOCKED-зоны (ExerciseRunner)
- Все Wave 1 файлы — они уже в main
- Инструкторский `/programs/:id/stuck-status` (Wave 1 #1.09 — уже корректен, использует `program.program_type`)
