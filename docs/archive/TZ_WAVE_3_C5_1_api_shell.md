# TZ Wave 3 — C5.1: API-методы + shell командного центра

**Ветка:** продолжаем `wave-3/owner-command-center` от tip `aedadc6` (бэкенд C1–C4 закрыт).
**Тип:** frontend под-чекпойнт (1 из 4: C5.1→C5.2→C5.3→C5.4). **Исполнитель:** Claude Code (VS Code, Windows).
**Зависимости в репо:** `WAVE_3_COMMAND_CENTER_API_CONTRACT.md` + `MEMORY_RULES.md` (должны лежать рядом).
**Definition of done:** каркас командного центра рендерится для `role==='admin'` (шапка + селектор периода + 5 пустых панелей); instructor видит старую welcome без изменений; новые API-методы добавлены; тесты зелёные. STOP с commit-отчётом.

---

## 0. Verify-step — правила (architect signature)

TZ-COMPLIANCE: написано по живому recon `Dashboard.js`/`api.js`/`tokens.css` + контракту, не из памяти. Правила (MEMORY_RULES):
- **Rule #20** (§3): CSS Modules, классы **camelCase** (`.commandCenter`, доступ `s.commandCenter`). dash-case → `s.fooBar===undefined` → стили не применятся. Smoke в реальном браузере обязателен.
- **Rule #25** (§5): API namespacing — новые методы в существующие namespace'ы (`admin`, `patients`) тем же стилем; `useEffect` deps без context-функций → `useCallback`.
- **Rule #28** (§3): hover-guard на сегментных кнопках — `.periodBtn:hover:not(.active)` (без guard hover (0,2,0) перекрасит `.active` (0,1,0)).
- **Rule #34 (anti-175%)** перенесён на фронт: **клиент НЕ агрегирует payload** (не складывает/делит счётчики панелей). Единственная арифметика в C5.x — display-проценты с guard на 0 (в C5.1 их ещё нет).
- **CLAUDE.md общие:** lucide-react только (без эмодзи), комментарии на русском, не выдумывать роуты/UI, bug-fix ≠ рефакторинг соседнего.
- **CSS Modules — НЕ миксовать с новой фичей в одну сессию** не нарушается: это новый компонент, существующие .module.css не переименовываем.

Поля payload в **C5.1 не потребляются** (панели — заглушки). Используются только из `AuthContext`: `user.full_name` (имя), `user.role` (`'admin'|'instructor'`). Параметры API-методов сверены с контрактом: `period` (`7d|30d|all`), `instructor_id`, `limit`, `severity`.

---

## 1. Pre-flight (recon-факты)

- `frontend/src/pages/Dashboard.js` (378 строк, CSS Modules `import s from './Dashboard.module.css'`) — tab-container, `activeTab` useState, `renderContent()` switch. **Landing = `default:` case** (welcomeSection + statsGrid с `completion_percent` = «175%»). Заменяем `default:` ТОЛЬКО для admin.
- `user` доступен в `Dashboard.js` (recon: шапка уже выводит `user?.full_name` + `user?.role`). Взять тот же хук контекста, что уже импортирован в `Dashboard.js` — **подтвердить имя хука при импорте в новый компонент, не угадывать.**
- Admin-пункты гейтятся `user?.role === 'admin'`.
- `api.js` unwrap-interceptor: компонент получает `response.data` = payload. Паттерн: `const r = await admin.getX(); setX(r.data || [])`.
- `tokens.css`: есть `--color-primary`, `--color-primary-bg`, `--color-surface`, `--color-border`, `--color-text`, `--color-text-muted`, `--radius-lg/xl/full`, `--shadow-card`. **`--color-secondary` НЕТ** (для C5.3 dormant — использовать `--color-text-muted`, новый токен не вводить).
- Dashboard — НЕ lazy (критичная страница). Новый landing-компонент тоже НЕ lazy.

---

## 2. Файлы под правку/создание

### 2.1 `frontend/src/services/api.js`
В `export const admin = { ... }` добавить блок (на `api` instance — instructor JWT в Bearer, НЕ `patientApi`), стилем существующих методов:
```js
  // Командный центр (Wave 3)
  commandCenter: {
    getSummary:     (params = {}) => api.get('/admin/command-center', { params }),
    getInstructors: (params = {}) => api.get('/admin/command-center/instructors', { params }),
    getAttention:   (params = {}) => api.get('/admin/command-center/attention', { params }),
    getDynamics:    (params = {}) => api.get('/admin/command-center/dynamics', { params }),
  },
```
В `export const patients = { ... }` (НЕ admin — путь `/patients/:id/...`) добавить:
```js
  assignInstructor: (id, data) => api.patch(`/patients/${id}/assign-instructor`, data),
```
> Сверка с контрактом: пути и query-параметры (`period`, `instructor_id`, `limit`, `severity`) — точь-в-точь из `WAVE_3_COMMAND_CENTER_API_CONTRACT.md`. PATCH body = `{ instructor_id, reason? }`.

### 2.2 `frontend/src/utils/plural.js` (новый)
```js
// Русские склонения: plural(1,['пациент','пациента','пациентов']) → 'пациент'
export function plural(n, forms) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b > 1 && b < 5) return forms[1];
  if (b === 1) return forms[0];
  return forms[2];
}
```
+ unit-тест `frontend/src/utils/plural.test.js`: кейсы 1→[0], 2/3/4→[1], 5/11/0→[2], 21→[0], 22→[1], 25→[2].

### 2.3 `frontend/src/pages/CommandCenter/CommandCenter.js` (новый)
Папка `pages/CommandCenter/` (плоско в `pages/`, по аналогии с `pages/Admin/`). Все под-компоненты C5.2–C5.4 лягут сюда же; один `CommandCenter.module.css` на всё (как `AdminContent.module.css` на 4 таблицы).

В C5.1 — только каркас:
- Импорты: `{ useState }`, контекст-хук для `user` (как в `Dashboard.js`), `s from './CommandCenter.module.css'`, нужные lucide-иконки.
- Стейт: `const [period, setPeriod] = useState('30d');`
- **Шапка:**
  - `<h2 className={s.welcomeTitle}>С возвращением, {user?.full_name}</h2>` — **только имя, НЕ склеивать с ролью.**
  - Роль отдельным pill: `<span className={s.rolePill}>{user?.role === 'admin' ? 'Администратор' : 'Инструктор'}</span>`.
- **Селектор периода** — сегментный контрол, 3 кнопки:
  - `[{v:'7d',l:'7 дней'},{v:'30d',l:'30 дней'},{v:'all',l:'Всё время'}]` map →
    `<button className={\`${s.periodBtn} ${period===opt.v ? s.active : ''}\`} onClick={()=>setPeriod(opt.v)}>{opt.l}</button>`
  - Подпись мелким текстом: «период влияет на приверженность и динамику».
- **5 контейнеров панелей** (в C5.1 — заглушки), порядок сверху вниз:
  1. «Требует внимания» (без props периода)
  2. «Воронка онбординга» (props `period`)
  3. «Сегменты активности» (props `period`)
  4. «Динамика» (props `period`)
  5. «Срез по инструкторам» (без props периода)
  - Заглушка: `<section className={s.panel}><h3 className={s.panelTitle}>{title}</h3><p className={s.panelStub}>—</p></section>`.
  - В C5.1 НЕ создавать отдельные файлы панелей — просто 5 `<section>` инлайн в `CommandCenter.js`. Реальные компоненты панелей появятся в C5.2–C5.4.

### 2.4 `frontend/src/pages/CommandCenter/CommandCenter.module.css` (новый)
Имена **camelCase** (Rule #20). На токенах:
- `.commandCenter` — wrapper (`max-width` как у admin-контента, padding).
- `.ccHeader` — flex шапка.
- `.welcomeTitle` — `color: var(--color-text)`.
- `.rolePill` — `background: var(--color-primary-bg); color: var(--color-primary); border-radius: var(--radius-full); padding: 2px 12px; font-size: 13px`.
- `.periodSelector` — flex-группа.
- `.periodBtn` — нейтральная кнопка (border `var(--color-border)`, `var(--color-surface)`).
- **`.periodBtn:hover:not(.active)`** — hover-фон (Rule #28 guard, обязателен).
- `.periodBtn.active` — `background: var(--color-primary); color:#fff`.
- `.periodHint` — `color: var(--color-text-muted); font-size:12px`.
- `.panel` — `background: var(--color-surface); border:1px solid var(--color-border); border-radius: var(--radius-lg); box-shadow: var(--shadow-card); padding: clamp(14px,2vw,20px); margin-bottom:16px`.
- `.panelTitle` — `color: var(--color-text); font-weight:600`.
- `.panelStub` — `color: var(--color-text-muted)`.

### 2.5 `frontend/src/pages/Dashboard.js` (правка `default:` case)
```jsx
default:
  return user?.role === 'admin'
    ? <CommandCenter user={user} />
    : ( /* СУЩЕСТВУЮЩИЙ welcomeSection JSX — оставить как есть, не трогать */ );
```
- Импорт `import CommandCenter from '../CommandCenter/CommandCenter';` (или верный относительный путь) сверху, **НЕ lazy**.
- `dashboard.getStats()` effect и весь instructor-welcome JSX — **не трогать** (instructor им пользуется; вынести существующий JSX в скобки тернарника без изменений).

---

## 3. Verify-step (выполнить и приложить вывод в отчёт)

```bash
grep -n "commandCenter" frontend/src/services/api.js          # 4 метода в admin
grep -n "assignInstructor" frontend/src/services/api.js       # 1 метод в patients
grep -n "CommandCenter" frontend/src/pages/Dashboard.js       # импорт + рендер в default
grep -rn "periodBtn:hover:not(.active)" frontend/src/pages/CommandCenter/CommandCenter.module.css  # Rule #28 guard есть
grep -rEn 'className=["\x27]\w+(-\w+)+["\x27]' frontend/src/pages/CommandCenter/   # 0 kebab-orphans (Rule #20)
npm run lint:modals --prefix frontend                          # green (модалок ещё нет)
cd frontend && CI=true npm test -- --watchAll=false            # baseline + plural.test зелёные
```

## 4. Тестовый чек-лист C5.1
- [ ] `plural.test.js` — 7 кейсов проходят.
- [ ] Существующие frontend-тесты не сломаны (baseline по контракту репо).
- [ ] Ручной smoke (`npm start`, реальный браузер — Rule #20 обязателен):
  - [ ] admin-логин → главная: «С возвращением, {имя}» (имя БЕЗ роли), pill роли отдельно, 3 кнопки периода переключаются (активная подсвечена), 5 пустых панелей в правильном порядке.
  - [ ] instructor-логин → старая welcome-вьюха без изменений.
  - [ ] Консоль чистая (нет `s.X undefined` → стили на месте).
  - [ ] Тёмная тема: панели/pill/кнопки читаемы (токены работают).

## 5. Definition of done
API-методы добавлены и сгрепаны; `CommandCenter` рендерится для admin, instructor нетронут; period-стейт переключается; `plural` с тестом; CSS на токенах с hover-guard; lint:modals green; тесты зелёные; smoke в браузере пройден.

## 6. Что НЕ делаем в C5.1
- НЕ создаём файлы панелей (`AttentionPanel.js` и т.д.) — это C5.2–C5.4.
- НЕ фетчим данные (панели = заглушки `—`).
- НЕ чиним backend «175%» (`/dashboard/stats`) — отдельный фолоу-ап, на admin-главной просто перестаём показывать.
- НЕ трогаем instructor welcome, ExerciseRunner, не добавляем `success:true`.

---

### 🛑 STOP C5.1
Commit-отчёт: tip SHA + вывод verify-grep'ов + дельта тестов (backend/frontend) + список drift'ов (расхождения TZ vs реальность — как в Wave 2). Жду подтверждения перед выдачей `TZ_WAVE_3_C5_2_*.md`.

---

*C5.1 TZ. Architect: Claude Opus 4.7, 2026-05-26. Ветка `wave-3/owner-command-center` от `aedadc6`. Контракт + MEMORY_RULES — в репо. Per-checkpoint STOP, NO batching (Rule #23).*
