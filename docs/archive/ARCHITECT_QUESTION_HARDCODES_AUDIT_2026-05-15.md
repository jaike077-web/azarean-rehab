# Вопрос архитектору — premise drift: ТЗ hot-fix #3 покрывал 1 из 5 хардкодов

**Дата:** 2026-05-15
**Контекст:** твой ТЗ `TZ_HOTFIX_PATIENT_STUCK_STATUS_PROGRAM_TYPE.md` + дизайн OAuth fix получены. Claude в чате Вадима применил ТЗ и открыл [PR #61](https://github.com/jaike077-web/azarean-rehab/pull/61) (commit `6718bfa`, backend 424/424 +1 shoulder тест). PR **не merged**.

При verify-step выяснилось что ТЗ покрывает только один из пяти `program_type = 'acl'` хардкодов в `backend/routes/rehab.js`. Полный аудит ниже.

---

## Полный обзор хардкодов `program_type = 'acl'` в backend

### `routes/rehab.js`

| # | Строка | Endpoint | Severity | Что произойдёт у shoulder/knee_general пациента |
|---|---|---|---|---|
| 1 | 33 | `GET /api/rehab/phases?type=` | 🟢 LOW (by-design) | Default param. Wave 1 #1.04 фронт передаёт явно. Backend default — safety net. |
| 2 | 307 | `GET /api/rehab/my/program` phase lookup | 🟢 LOW | Endpoint живой в backend + тесты, **но фронт его не зовёт** после Wave 1 #1.02 (заменён `/my/dashboard`). Direct API call вернёт `phase=null`. |
| 3 | **367** | `GET /api/rehab/my/dashboard` phase lookup | 🔴 **CRITICAL** | **HomeScreen главный экран.** Wave 1 #1.02 закрыл `program_label` через JOIN с `program_types`, но **phase lookup в том же endpoint'е остался хардкодом**. Shoulder/knee_general пациент не увидит `phase.title`, `phase.color`, `phase.icon`, `phase.duration_weeks`. |
| 4 | 414 | tips filter в `/my/dashboard`: `(program_type = 'acl' OR program_type = 'general')` | 🟡 LOW | Tips для shoulder/knee_general program_type не покажутся. Сейчас нет таких tips в БД → silent failure только при будущем наполнении контента. |
| 5 | 493 | `/my/stuck-status` phase lookup | ✅ **ЗАКРЫТ PR #61** | — |
| 6 | 1294 | `GET /api/rehab/programs` (instructor list) JOIN `LEFT JOIN rehab_phases ph ON ph.program_type = 'acl'` | 🟡 MEDIUM | Инструктор не увидит `phase_title`/`phase_subtitle`/`phase_color` для shoulder программ в списке в Patients.js/PatientProgress.js. Не блокер, но грязно. |
| 7 | 1377 | INSERT `COALESCE($9, 'acl')` при создании программы | 🟢 LOW (by-design) | Архитектор сознательно: «90% knee, дефолтим в acl». |

### `routes/admin.js`

| # | Строка | Severity | Что |
|---|---|---|---|
| 8 | 505 | 🟢 LOW (by-design) | Default `program_type = 'acl'` при создании фазы через AdminContent. UX default, валидируется через справочник Wave 1 #1.05. |

### `frontend/src/pages/Admin/AdminContent.js`

| # | Строки | Severity | Что |
|---|---|---|---|
| 9 | 148, 157, 641, 655 | 🟢 LOW (by-design) | UX defaults в формах создания фазы / шаблона. |

### Корректно (образцы)

- `backend/services/stuckDetection.js:33-36` — Wave 1 #1.09 использует `[program.program_type, program.current_phase]` параметром ✅
- `backend/services/telegramBot.js:171` — Wave 1 #1.04 JOIN `ON ph.program_type = rp.program_type` ✅

---

## Главная находка — promise drift Wave 1 #1.02

`/my/dashboard` (строки 339-376):

```javascript
// 1. Активная программа + JOIN с program_types (Wave 1 #1.02 — ОК)
const programResult = await query(
  `SELECT rp.id, rp.title, ..., rp.program_type,
          pt.label AS program_label,
          pt.joint AS program_joint,
          pt.surgery_required AS program_surgery_required
   FROM rehab_programs rp
   LEFT JOIN program_types pt ON pt.code = rp.program_type
   WHERE rp.patient_id = $1 ...`,
  [patientId]
);

// ...

// 2. Текущая фаза (если есть программа) — ХАРДКОД 'acl' (НЕ ОК)
if (program) {
  const phaseResult = await query(
    `SELECT id, phase_number, title, subtitle, duration_weeks, description, icon, color, color_bg
     FROM rehab_phases
     WHERE program_type = 'acl' AND phase_number = $1 AND is_active = true`,
    [program.current_phase]
  );
  // ...
}
```

ТЗ Wave 1 #1.02 говорил «JOIN program_types в `/my/dashboard` для program_label/joint/surgery_required». Phase lookup в том же endpoint'е остался не тронут. Это premise drift на уровне TZ-формулировки — scope #1.02 был сужен до `program_label` и не включал phase, хотя оба критичны для HomeScreen non-ACL пациента.

После merge PR #61 в проде будет несостыковка:
- ✅ `/my/stuck-status` работает для non-ACL — баннер «застрял» покажется
- ❌ `/my/dashboard` всё ещё broken — сама фаза на HomeScreen без title/icon/color

То есть **shoulder пациент увидит баннер «вы на фазе X слишком долго», но не увидит саму фазу X.**

---

## Вопросы к тебе

### Q1. Severity-валидация

Согласен с severity-классификацией выше? Особенно по #3 (стр 367, `/my/dashboard`) — это critical уровня Wave 1 #1.02 промах, или просто tail-fix который ты сознательно отложил?

### Q2. Scope PR #61

Три варианта:

**A.** Расширить PR #61 — добавить fix'ы для строк 307, 367, 414, 1294 в той же ветке `hotfix/patient-stuck-status-program-type`. Один атомарный multi-protocol cleanup. Title/body PR обновить. Force-push поверх `6718bfa`.

**B.** Оставить PR #61 узким (только stuck-status, как в твоём оригинальном ТЗ). Сделать отдельный PR #62 «multi-protocol cleanup» для 367, 307, 414, 1294. Плюс: clean atomic history. Минус: 2 деплоя вместо одного, на 1 деплой prod в полусломанном состоянии (баннер работает, HomeScreen — нет).

**C.** Pause PR #61, ты пишешь полное ТЗ `TZ_HOTFIX_MULTI_PROTOCOL_CLEANUP_2026-05-15.md` покрывающее все 4 — Claude делает всё одной волной по твоему ОК-нутому ТЗ. Self-correction Wave 1 #1.02.

Мой склон — вариант A (быстро, атомарно, одна тема). Но если ты считаешь что это нужно через формальный ТЗ — B/C.

### Q3. Test strategy

Сколько новых тестов добавить?

**A.** Минимум — 1 shoulder тест для `/my/dashboard` (критичный) + SQL-assertion'ы для остальных трёх. Итого +1 тест.

**B.** Максимум — shoulder тест для каждого из 4 endpoint'ов (`/my/program`, `/my/dashboard`, `/programs` instructor list, tips). Итого +4 теста.

**C.** Что-то посередине — 2 shoulder теста (`/my/dashboard` обязательно + один инструкторский для `/programs`).

### Q4. Wave 1 retrospective

Promise drift в ТЗ #1.02 поднимает вопрос: **что ещё могло утечь?**

Сейчас у нас на main 10 коммитов Wave 1 + 9 коммитов Wave 0, и Bug #12 («хардкод ПКС/acl») помечен «закрыт полностью» в CLAUDE.md/memory. Но один из endpoint'ов был забыт. Если бы Claude не сделал verify-grep — это всплыло бы в проде когда первый shoulder пациент сел на HomeScreen.

Стоит ли провести full retrospective audit:
- Grep'нуть весь backend + frontend на все литералы program_type-связанные (`'acl'`, `'ПКС'`, `'knee'` если применимо)?
- Проверить остальные Wave 1 endpoint'ы (#1.04 — RoadmapScreen+api.js+telegramBot, #1.06 — POST /programs, #1.07 — admin program-templates) на аналогичные узкие scope?

Это уроке Wave 1 уровня — могу зафиксировать в memory и в feedback правиле «всегда полный grep по теме перед закрытием bug-категории, не только endpoint в TZ».

### Q5. By-design vs bug

Подтверди для:
- Стр 33 (`?type` default) — оставить как есть, или строже сделать (400 если type не передан)?
- Стр 1377 (INSERT COALESCE default 'acl') — оставить как есть?
- admin.js:505 + AdminContent.js form defaults — оставить как есть?

Я сейчас считаю все три by-design и не трогаю. Но если ты хочешь cleanup до конца — добавлю в scope.

---

## Что ждёт от тебя

1. **Severity-confirm** (Q1)
2. **Scope-решение** (Q2) — мой склон в варианте A
3. **Test strategy** (Q3) — мой склон в варианте B (по shoulder тесту на каждый critical endpoint)
4. **Retrospective да/нет** (Q4)
5. **By-design подтверждения** (Q5)

После твоих ответов Claude доделает в одной волне (вариант A) или дождётся твоего ТЗ (C).
