# TZ Wave 1 · Коммит 1.03 — HomeScreen: полная замена временного маппинга

**Дата:** 2026-05-12
**Roadmap:** `PATIENT_UX_ROADMAP_2026-05-08_v2.md` пункт #1
**Цель:** убрать временный маппинг `diagnosis → program_label` из Wave 0 коммита #02 (sha `f368c97`) и использовать `program_label` из dashboard, который теперь возвращает backend через JOIN с program_types (коммит 1.02). Это финальный шаг закрытия литерала «ПКС» в HomeScreen.
**Объём:** 2-3 часа
**Риск:** низкий — фронтенд-only, упрощение существующего кода

---

## Зависимость

После коммитов 1.01 и 1.02. Ветка строится от `wave-1/02-program-type-dashboard`.

---

## Что блокирует

Wave 0 коммит #02 (sha `f368c97`) убрал жёсткий литерал «ПКС» из hero-карточки HomeScreen, но решил задачу **временным маппингом**: функция `mapDiagnosisToLabel(diagnosis)` где-то в `HomeScreen.js` или его helper'е, делающая regex по строке diagnosis и возвращающая `'ПКС'` / `'Плечо'` / fallback.

Это решение зафиксировано в memory как `project_program_label_taxonomy.md` («словарь labels непоследовательный») — Vadim хочет нормальную таксономию из БД.

**После коммита 1.02** backend уже возвращает `dashboardData.program.program_label` напрямую из справочника. **Этот коммит** просто использует то что уже есть и удаляет временную функцию.

**После этого коммита:**
- Hero-карточка HomeScreen показывает `dashboardData.program.program_label` напрямую
- `mapDiagnosisToLabel` (или как она называется) удалена
- Закрыты последние следы Bug #12 (часть про HomeScreen)
- Бонус: если у пациента в БД `program_type='shoulder_general'` (после backfill 1.01) — он автоматически увидит «Реабилитация плеча» вместо «ПКС»

**Что НЕ делается этим коммитом:**
- RoadmapScreen хардкод `?type=acl` — в коммите 1.04
- telegramBot.js хардкод — в коммите 1.04
- Никаких backend изменений (всё сделано в 1.02)

---

## Параллельная работа — координация

**ТРОГАЕМ:**
- `frontend/src/pages/PatientDashboard/components/HomeScreen.js` — убрать временный маппинг, использовать program_label напрямую
- Возможно `frontend/src/pages/PatientDashboard/utils/*.js` — если `mapDiagnosisToLabel` живёт в отдельном утиле, удалить или упростить
- `frontend/src/pages/PatientDashboard/components/HomeScreen.test.js` — обновить тесты (моки dashboard теперь возвращают program_label напрямую, не вычисляются из diagnosis)

**НЕ ТРОГАТЬ:**
- Backend (всё уже сделано в 1.02)
- RoadmapScreen.js (это коммит 1.04)
- Telegram bot (1.04)
- AdminContent (1.05)
- LOCKED-зоны (ExerciseRunner, pd-* стили вне HomeScreen)

---

## Frontend — изменения в HomeScreen

### Шаг 1 — найти текущий код

В `HomeScreen.js` после Wave 0 коммита #02 должно быть что-то такое:

```javascript
// Wave 0 #02 — временный маппинг diagnosis → label, заменить через program_type в Wave 1
function mapDiagnosisToLabel(diagnosis) {
  if (!diagnosis) return 'Реабилитация';
  const lower = diagnosis.toLowerCase();
  if (/пкс|колен|acl|мениск/.test(lower)) return 'ПКС';
  if (/плеч|shoulder|манжет/.test(lower)) return 'Плечо';
  return 'Реабилитация';
}

// ...в JSX hero-карточки:
<span className="pd-hero__label">
  {mapDiagnosisToLabel(dashboardData?.program?.diagnosis)} · Фаза {dashboardData?.program?.current_phase}
</span>
```

(Точный код может отличаться — grep'нуть `mapDiagnosisToLabel` или `Wave 0 #02` или `Фаза {` в HomeScreen.js. Если функция в отдельном файле — grep по utils.)

### Шаг 2 — заменить

```javascript
// Без локальной функции — берём program_label напрямую из dashboard
// dashboardData.program.program_label теперь возвращается backend'ом через JOIN
// с program_types (Wave 1 коммит 1.02)

// ...в JSX hero-карточки:
<span className="pd-hero__label">
  {dashboardData?.program?.program_label || 'Реабилитация'} · Фаза {dashboardData?.program?.current_phase}
</span>
```

### Шаг 3 — удалить мёртвый код

Если `mapDiagnosisToLabel` больше нигде не используется (grep по всему фронту) — удалить функцию. Если используется ещё где-то — оставить и пометить `// TODO: будет удалена когда все потребители перейдут на program_label из dashboard`.

### Шаг 4 — fallback логика

`program_label` приходит из JOIN с program_types. Если по какой-то причине его нет (новая программа без program_type — но это блокируется FK; или dashboard API ещё не задеплоен в проде на момент работы фронта — но это нерелевантно для нашего batch merge):

```javascript
const programLabel = dashboardData?.program?.program_label || 'Реабилитация';
const currentPhase = dashboardData?.program?.current_phase;

// Если совсем нет программы — не показывать «Фаза», только onboarding-блок (это уже есть в HomeScreen)
```

---

## Тесты

### Изменения в `frontend/src/pages/PatientDashboard/components/HomeScreen.test.js`

Найти существующие тесты Hero title (3 теста после Wave 0 #02: «ПКС — Фаза 1», «Плечо — Фаза 1», «Фаза 1»). Заменить моки чтобы тестировать новое поведение:

**До (мокался diagnosis):**
```javascript
it('показывает «ПКС — Фаза 1» для пациента с ACL диагнозом', () => {
  const mockDashboard = {
    program: {
      diagnosis: 'ПКС BPTB-графт',
      current_phase: 1
    }
  };
  // ...render, expect "ПКС — Фаза 1"
});
```

**После (мокается program_label):**
```javascript
it('показывает «ПКС реабилитация · Фаза 1» из program_label', () => {
  const mockDashboard = {
    program: {
      program_type: 'acl',
      program_label: 'ПКС реабилитация',
      current_phase: 1
    }
  };
  // ...render, expect "ПКС реабилитация · Фаза 1"
});

it('показывает «Реабилитация плеча · Фаза 1» для shoulder_general', () => {
  const mockDashboard = {
    program: {
      program_type: 'shoulder_general',
      program_label: 'Реабилитация плеча',
      current_phase: 1
    }
  };
  // ...render
});

it('fallback «Реабилитация · Фаза 1» если program_label не пришёл', () => {
  const mockDashboard = {
    program: {
      program_type: 'unknown',
      program_label: null,
      current_phase: 1
    }
  };
  // ...render
});
```

Сценарий «нет активной программы» (рендерится onboarding-блок) — оставить как был, никак не зависит от program_label.

### Дополнительный тест — backwards compatibility

Если временный маппинг ещё используется где-то (старые snapshot-тесты) — обновить snapshots.

**Команда запуска:**
```bash
cd frontend && npm test -- --testPathPattern=HomeScreen --watchAll=false
```

---

## NOT TOUCH

- Backend (всё в 1.02)
- RoadmapScreen.js (коммит 1.04)
- LOCKED-зоны (ExerciseRunner, иные pd-* компоненты)
- Wave 0 коммит #04 логика повторного захода (secondary CTA) — не трогаем, рядом в HomeScreen но независима
- `dashboardData.program.diagnosis` поле — оно ещё используется в других местах HomeScreen (например, для tip-секций), не удалять

---

## Smoke test (в реальном браузере)

### Сценарий 1 — ACL пациент видит «ПКС реабилитация»

1. В dev-БД убедиться что у тестового пациента (id=14 или другой) `program_type = 'acl'`
2. Войти как пациент avi707@mail.ru / Test1234
3. HomeScreen → hero-карточка
4. **Ожидание:** надпись «ПКС реабилитация · Фаза N»

### Сценарий 2 — Shoulder пациент видит «Реабилитация плеча»

1. В dev-БД создать или обновить тестового пациента с `program_type = 'shoulder_general'`:
   ```sql
   UPDATE rehab_programs SET program_type = 'shoulder_general' WHERE patient_id = (SELECT id FROM patients WHERE email = 'avi707@mail.ru');
   ```
2. Refresh HomeScreen
3. **Ожидание:** надпись «Реабилитация плеча · Фаза N»
4. **Откатить:** вернуть `program_type = 'acl'` если меняли для теста

### Сценарий 3 — Дefault fallback

1. В DevTools перехватить response `/api/rehab/my/dashboard` (через Network → throttle или прямую запись) или временно убрать FK и поставить `program_type = 'unknown'`
2. **Ожидание:** «Реабилитация · Фаза N» (fallback не падает)

### Сценарий 4 — Нет программы

1. В dev: `UPDATE rehab_programs SET is_active = false WHERE patient_id = $id`
2. Refresh
3. **Ожидание:** показан onboarding-блок «Куратор скоро составит программу» (или эквивалент), без «Фаза»
4. **Откатить**

### Сценарий 5 — Mobile layout

1. DevTools → Device toolbar → iPhone 14 Pro Max
2. HomeScreen, hero
3. **Ожидание:** надпись «Реабилитация плеча · Фаза 3» не обрезается, не ломает вёрстку (label стал чуть длиннее чем «ПКС»)

### Сценарий 6 — Dark theme

1. ProfileScreen → переключить на dark
2. HomeScreen
3. **Ожидание:** контраст текста ок, hero-карточка не сломана

---

## Файлы — итоговый чеклист

### Создать
- (ничего)

### Изменить
- `frontend/src/pages/PatientDashboard/components/HomeScreen.js` — убрать `mapDiagnosisToLabel`, использовать `program_label` напрямую
- (возможно) `frontend/src/pages/PatientDashboard/utils/*.js` — удалить функцию если жила в отдельном файле и больше нигде не нужна
- `frontend/src/pages/PatientDashboard/components/HomeScreen.test.js` — обновить моки (4 теста)
- `CLAUDE.md` — секция «Открытые баги» Bug #12 — отметить «закрыт частично, остался RoadmapScreen и Telegram bot (1.04)»

### НЕ ТРОГАТЬ
- Backend
- RoadmapScreen, Telegram bot, AdminContent
- LOCKED-зоны

---

## Текст коммита

```
feat(home): program_label из dashboard вместо временного маппинга

Wave 1 коммит 1.03 — финальный шаг закрытия литерала «ПКС».

- Удалена временная функция mapDiagnosisToLabel (Wave 0 #02 временно)
- Hero-карточка использует program_label напрямую из dashboardData
- Backend возвращает program_label из JOIN с program_types (1.02)
- Fallback «Реабилитация» если program_label не пришёл

Закрывает Bug #12 для HomeScreen. Telegram bot и RoadmapScreen
хардкоды убираются в 1.04.

Test: frontend +4 кейса HomeScreen Hero title

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

## Пост-коммит

**`CLAUDE.md`:**
- Секция «Открытые баги» Bug #12 — обновить статус «остался хардкод в RoadmapScreen + Telegram bot (1.04)»
- Секция «Завершённые исправления» — запись про коммит 1.03

**Memory:**
- `wave_1_progress.md` — статус 1.03 → `⏸ заморожен`

---

## Definition of Done

- [ ] Функция временного маппинга удалена (grep чистый)
- [ ] HomeScreen использует `dashboardData.program.program_label` напрямую
- [ ] 4 теста HomeScreen Hero обновлены и зелёные
- [ ] Snapshot тесты обновлены (если есть)
- [ ] Smoke сценарии 1-6 пройдены в реальном браузере
- [ ] Mobile + dark theme проверены
- [ ] CLAUDE.md обновлён
- [ ] Коммит создан с указанным текстом + Co-Authored-By
- [ ] `wave_1_progress.md` обновлён: 1.03 → `⏸ заморожен`
- [ ] **Push только по «ок» от Vadim'а**
