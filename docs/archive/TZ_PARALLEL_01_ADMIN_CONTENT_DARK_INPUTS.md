# TZ #01 — Hot-fix: AdminContent dark theme — невидимый текст в input/select/textarea

**Дата:** 2026-05-16
**Severity:** MEDIUM (admin-only, юзер один — Vadim; UX некомфортный, но не блокер коммерч.запуска)
**Тип:** UX/CSS hot-fix, точечный
**Связано:** Bug #15 (CLAUDE.md tech debt) — родитель этой проблемы, **scope этого ТЗ НЕ распространяется на Bug #15.** Глобальный fix для всех input/textarea/select в проекте — отдельная задача после спеки архитектора.

---

## Проблема (verified)

**Воспроизведение:** Dark theme → Sidebar → Контент → любой таб (Типы / Фазы / Шаблоны / Советы / Видео) → нажать «Создать» → модалка с формой → input/select/textarea содержат **светлый текст на светлом фоне**.

**Root cause** ([frontend/src/pages/Admin/AdminContent.module.css:348-359](frontend/src/pages/Admin/AdminContent.module.css#L348-L359)):

```css
.adminFormGroup input,
.adminFormGroup select,
.adminFormGroup textarea {
  padding: clamp(8px, 1vw, 10px) 12px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  font-size: 14px;
  color: var(--color-text);    /* ← в dark = #e7eaf3, почти белый */
  outline: none;
  ...
  /* background НЕ задан */
}
```

Глобальный `input/textarea/select` в [frontend/src/index.css:53-63](frontend/src/index.css#L53-L63) тоже **не задаёт background** (только padding/border/min-height). CSS Modules селектор `.adminFormGroup_<hash> input` имеет specificity (0,1,1) > globalного (0,0,1), но это не меняет дела — никто не задаёт background.

Браузер использует system-default background (`Canvas` keyword) = **белый**, потому что:
- [frontend/src/context/ThemeContext.js](frontend/src/context/ThemeContext.js) ставит `data-theme="dark"` на `<html>`, но **не ставит `color-scheme: dark`**.
- Без `color-scheme: dark` браузер не переключает native widget palette → input render'ится с light system colors (белый bg + dark text по умолчанию, но `color: var(--color-text)` overrides text на почти-белый) → **почти-белый текст на белом фоне = невидимо**.

**Почему `color-scheme: dark` не используем** ([memory/bug_dark_theme_mdeditor_global_inputs.md](.claude/projects/c--Users-------Desktop-Azarean-rehab/memory/bug_dark_theme_mdeditor_global_inputs.md)):
- В сессии 2026-05-12 пробовали — браузерные нативные виджеты подхватили (scrollbar), но MDEditor (`@uiw/react-md-editor` в EditExerciseModal) при этом сбоил.
- Откатили всё. Активация `color-scheme` ждёт design-spec от архитектора по Bug #15.

---

## Дизайн tokens (verified)

[frontend/src/styles/tokens.css](frontend/src/styles/tokens.css) — иерархия 4 уровня глубины:

| Token | Light | Dark | Назначение по комментарию tokens.css |
|---|---|---|---|
| `--color-bg` | `#f8fafc` | `#0a0e1a` | фон страницы |
| `--color-surface` | `#ffffff` | `#131a2c` | карточки |
| `--color-surface-2` | `#f1f5f9` | `#1c2540` | **«поля ввода, hover»** |
| `--color-surface-3` | `#ffffff` | `#283156` | модалки, dropdown'ы |

Модалка `.adminModal` имеет `background: var(--color-surface)` ([AdminContent.module.css:294](frontend/src/pages/Admin/AdminContent.module.css#L294)). Поэтому input нельзя ставить тот же `--color-surface` (сольётся). Token `--color-surface-2` спроектирован архитектором именно под «поля ввода».

**Проверочный контраст:**
- Light: input `#f1f5f9` на модалке `#ffffff` — input чуть серее модалки, text `#1e293b` (dark slate) ОК
- Dark: input `#1c2540` на модалке `#131a2c` — input чуть светлее модалки, text `#e7eaf3` (off-white) ОК

---

## Решение — минимально-инвазивный fix

### Единственное изменение

**Файл:** [frontend/src/pages/Admin/AdminContent.module.css](frontend/src/pages/Admin/AdminContent.module.css)

**Было** (строки 348-359):
```css
.adminFormGroup input,
.adminFormGroup select,
.adminFormGroup textarea {
  padding: clamp(8px, 1vw, 10px) 12px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  font-size: 14px;
  color: var(--color-text);
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
  min-height: 44px;
}
```

**Стало:**
```css
.adminFormGroup input,
.adminFormGroup select,
.adminFormGroup textarea {
  padding: clamp(8px, 1vw, 10px) 12px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  font-size: 14px;
  color: var(--color-text);
  background: var(--color-surface-2);
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
  min-height: 44px;
}
```

**Изменение:** +1 строка `background: var(--color-surface-2);`. Никаких удалений, никаких других правил.

### Почему НЕ трогаем глобал в `index.css`

- В [memory/bug_dark_theme_mdeditor_global_inputs.md](.claude/projects/c--Users-------Desktop-Azarean-rehab/memory/bug_dark_theme_mdeditor_global_inputs.md) зафиксировано: глобальный `color/background` на `input/textarea/select` в `index.css` (сессия 2026-05-12) дал инверсию в одной из тем у Vadim'а → откатили.
- Точечный fix в `.adminFormGroup` scoped к AdminContent — другие формы (PatientRegister, CreateComplex, EditComplex, EditExerciseModal и т.д.) **не затронуты**.
- Глобальный fix останется в backlog для архитектора (Bug #15).

### Известное ограничение fix'а

`<select>` в Chrome/Firefox с `color-scheme` отсутствующим может **частично игнорировать** background для native dropdown'а (само поле подхватит, выпадающий список — нет). Это **acceptable trade-off**:
- Само закрытое поле select станет читаемым (главная цель fix'а).
- Открытый dropdown с list of options — native styling, в dark может выглядеть как white list — менее частая ситуация, не блокирует ввод.
- Полный fix требует `appearance: none` + custom chevron + `color-scheme: dark` глобально → Bug #15 scope.

---

## Out of scope (зафиксировать в комментарии PR'а)

| Что | Почему не делаем сейчас |
|---|---|
| Глобальный fix в `index.css` для `input/textarea/select` | Откатили 2026-05-12, ждёт спеку Bug #15 |
| `color-scheme: dark` на `<html>` в ThemeContext | Сломал MDEditor 2026-05-12, ждёт спеку Bug #15 |
| MDEditor (поле «Описание» в EditExerciseModal) | Bug #15, ждёт спеку |
| Глобальный `border: 2px solid #e2e8f0` хардкод в [index.css:60](frontend/src/index.css#L60) | Bug #15 scope |
| Аналогичная проблема в AdminUsers / PatientRegister / CreateComplex / EditComplex | Bug #15 scope (проверить grep'ом в рамках Bug #15 fix'а) |

---

## Тесты

**Unit-тесты:** не требуются.
- Тесты CSS Modules используют Proxy mock (`(_, prop) => String(prop)`) → не могут проверить наличие `background` в CSS.
- Smoke в браузере — единственный способ верифицировать.

**Регрессионные:** `cd frontend && CI=true npx react-scripts test --watchAll=false` должен оставаться **252/252**.

---

## Smoke checklist (обязательно в реальном браузере)

### Light theme (через переключатель в Profile или Dashboard)

| Шаг | Ожидание |
|---|---|
| Open Dashboard → Sidebar → Контент → Типы программ → Создать | Модалка открывается. input[Код], input[Название], input[Сустав], select[Хирургия требуется], input[Позиция] — **видимый text при вводе, серебристо-серый bg (#f1f5f9), белая модалка (#ffffff)** |
| Контент → Фазы → Создать | PhaseForm — все inputs (number, text, textarea) видимы при вводе |
| Контент → Шаблоны программ → Создать | Аналогично |
| Контент → Советы → Создать | Аналогично |
| Контент → Видео → Создать | Аналогично |
| Edit existing item (Pencil icon) → форма с pre-filled значениями | Существующий text **видим** |

### Dark theme

Те же 6 шагов:

| Шаг | Ожидание |
|---|---|
| Все модалки | input bg = `#1c2540` (slate глубже модалки `#131a2c`), text = `#e7eaf3` (off-white) — **читаемо** |

### Регрессии (проверить что не сломали)

| Что | Где | Ожидание |
|---|---|---|
| Любые inputs ВНЕ модалок AdminContent | PatientRegister, CreateComplex, EditComplex, EditExerciseModal, ProfileScreen у пациента | **Без изменений** — fix scoped к `.adminFormGroup` |
| Other Admin суб-табы (Users, Stats, AuditLogs, System) | Sidebar → соответствующие табы | Не используют `.adminFormGroup` (проверено grep'ом — этот класс существует только в AdminContent.module.css). Без изменений. |
| `<select>` открытый dropdown в dark | AdminContent → Фазы → Создать → клик в select «Тип» | Список options может быть белым (native) — это known limitation, не блокер |

---

## Деплой

1. Stash dirty файлов (изоляция): `git stash push -m "dark-theme-2026-05-04-isolation" CLAUDE.md frontend/src/pages/PatientDashboard/PatientDashboard.js frontend/src/pages/PatientDashboard/components/DiaryScreen.css frontend/src/pages/PatientDashboard/tokens.css frontend/src/styles/tokens.css`
2. Edit `AdminContent.module.css` (одна строка).
3. `cd frontend && CI=true npx react-scripts test --watchAll=false` → ожидается 252/252.
4. `cd frontend && npm start` → smoke в реальном браузере по чек-листу выше (light + dark).
5. Commit: `fix(admin-content): background для inputs в формах dark theme (Bug #15 partial)`.
6. PR в main, body содержит ссылку на этот ТЗ + smoke checklist.
7. После squash-merge — restore stash: `git stash pop`.
8. Prod auto-deploy через GitHub Actions.
9. **SW bump НЕ требуется** — это чистый CSS, не JS bundle. Браузер заберёт новый CSS при следующем визите (cache TTL для CSS — короткий, в отличие от JS chunks).
10. Prod smoke по тому же checklist'у.

---

## После завершения

- Обновить [memory/bug_admin_content_modal_dark_theme_text.md](.claude/projects/c--Users-------Desktop-Azarean-rehab/memory/bug_admin_content_modal_dark_theme_text.md) пометкой «закрыт частично PR #XX 2026-05-16 — точечный fix только в AdminContent, глобал ждёт Bug #15».
- Bug #15 в CLAUDE.md tech debt таблице **не закрыт** — это только partial fix.

---

## Что НЕ ожидаем от fix'а

- `<select>` native dropdown menu в dark может выглядеть white (browser-native styling без `color-scheme: dark`)
- Другие формы в проекте (PatientRegister, CreateComplex и т.д.) — не затрагиваются
- MDEditor в EditExerciseModal — отдельный баг #15
- Глобальный input border `#e2e8f0` в index.css:60 — отдельный баг #15
