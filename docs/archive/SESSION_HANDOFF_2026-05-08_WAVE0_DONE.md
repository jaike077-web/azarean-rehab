# Session Handoff — Wave 0 закрыта · 2026-05-08

**Что сделано:** все 6 коммитов Волны 0 (Patient UX Roadmap v2) закрыты. 6 PR открыты, ждут пакетного merge'а.

**Где стопанулись:** последний коммит #06 готов, smoke 3/3 пройден, dev-БД восстановлена в clean baseline. Решено перейти в новый чат для финального pre-merge smoke + merge всей волны.

---

## Старт нового чата — что сделать первым делом

1. Прочитать **этот файл** (он в корне проекта)
2. Прочитать **`memory/wave_0_complete.md`** — итоговая сводка Волны 0
3. Прочитать **`memory/wave_0_batch_merge_policy.md`** — политика merge'а
4. Прочитать **`wave_0_progress.md`** — все 6 строк должны быть `⏸ заморожен`
5. Дальше — финальный pre-merge smoke + merge

---

## Состояние на момент handoff'а

### 6 PR открыты (все на main, base — соответствующая предыдущая ветка)

| # | Ветка | Коммиты | PR |
|---|---|---|---|
| 1 | `wave-0/01-streak-no-reset` | `3aca77d` | https://github.com/jaike077-web/azarean-rehab/pull/45 |
| 2 | `wave-0/02-home-dynamic-label` | `8c9df80` | https://github.com/jaike077-web/azarean-rehab/pull/46 |
| 3 | `wave-0/03-diary-report-via-messages` | `28f5857` | https://github.com/jaike077-web/azarean-rehab/pull/47 |
| 4 | `wave-0/04-home-replay` | `98d9e8b` | https://github.com/jaike077-web/azarean-rehab/pull/48 |
| 5 | `wave-0/05-runner-accordion-extended` | `8ea7bda` + `d258079` | https://github.com/jaike077-web/azarean-rehab/pull/49 |
| 6 | `wave-0/06-roadmap-stuck-banner` | `5b608b3` + `9751e75` + `89dcd6d` | https://github.com/jaike077-web/azarean-rehab/pull/50 |

**Текущая ветка:** `wave-0/06-roadmap-stuck-banner` (PR #50).

### Тесты

- **Backend:** 338/338 (старт 293, +45 за волну)
- **Frontend:** 236/236 (старт 209, +27 за волну)

### Миграции БД (применены на dev, на проде применятся при первом push в main)

- `20260508_streak_days.sql` — таблица streak_days, идемпотентна (commit 01)
- `20260508_messages_extend.sql` — добавляет message_kind в messages, идемпотентна (commit 03)

### dev-БД состояние

- Пациент id=14 в clean baseline
- `phase_started_at` — 2 недели назад (НЕ застрял для smoke)
- Упражнение id=12 «Приводящие с мячом в статике» осталось обогащено (cues/tips/abs_contra/red_flags/safe_with_inflammation) — это НЕ откатили после smoke 5, можно оставить или сбросить через psql если мешает

---

## Что НЕ делать в новом чате

### Uncommitted dark-theme правки (5 файлов от 2026-05-04)

```
M CLAUDE.md  (но мы добавили запись про Wave 0 — всё ОК, можно стейджить)
M frontend/src/pages/PatientDashboard/PatientDashboard.js
M frontend/src/pages/PatientDashboard/components/DiaryScreen.css
M frontend/src/pages/PatientDashboard/tokens.css
M frontend/src/styles/tokens.css
```

Эти правки от 2026-05-04 ждут отдельного смока юзером в браузере перед push (см. `SESSION_HANDOFF_2026-05-04.md`). НЕ стейджить их с merge Волны 0. Все коммиты Волны 0 не миксовали с ними (использовали inline-стили где нужно было трогать те файлы).

### Не мержить ничего в main до завершения pre-merge smoke

Авто-CI/CD `.github/workflows/deploy.yml` пускает прод-деплой на любой push в main → каждый merge запускает деплой. Поэтому делаем всё пакетом одним «окном».

---

## Финальный pre-merge smoke (рекомендуется свежим взглядом)

Цель: пройти все 6 коммитов на dev одним проходом без перерыва, без подсказок от меня.

### Подготовка

1. Проверь сервера: `netstat -ano | grep -E ":3001|:5000"` — оба должны быть listening
2. Если нет: `cd backend && npm run dev` + `cd frontend && PORT=3001 BROWSER=none npm start`
3. Залогинься как пациент: http://localhost:3001/patient-login → `avi707@mail.ru` / `Test1234`

### Сценарий 1 — Главная (commit 02 + 04)

- Hero показывает «Сегодня» badge + «Разрыв ПКС левого колена — Фаза 1»? **Должно быть «ПКС — Фаза 1»** (короткий label).
- Если упражнения сделаны → ветка «Готово · Комплекс завершён» с кнопкой «Заполнить дневник» **и** secondary «Начать ещё раз».
- Если упражнения НЕ сделаны → стандартная ветка с «Начать».

### Сценарий 2 — Стрик (commit 01)

- На «Главной» в нижней правой части прогресс-кольца — «N/7 Дней»
- Если есть пропуск вчерашнего дня — жёлтая плашка под прогрессом «Ты пропустил вчера...»
- Активность за сегодня НЕ должна обнулять стрик при следующем заходе

### Сценарий 3 — Дневник (commit 03)

- Открой «Дневник» → измени любое поле (Боль, ROM)
- Подожди ~1 секунду (auto-save), внизу появится зелёная кнопка **«Отправить отчёт»**
- Жми → кнопка меняет состояния («Отправляем…» → «Отправлено куратору»)
- Под ней появится кнопка «Продублировать · Telegram»
- На «Связь» — белая карточка «Отчёт по дневнику · 8 мая» с превью и кнопкой «Открыть запись →»

### Сценарий 4 — Упражнения accordion (commit 05)

- На «Главной» жми «Начать»
- В ExerciseRunner найди «Приводящие с мячом в статике» (через стрелочки/dots)
- Жми «▶ Описание и инструкции»
- Должно раскрыться **4 секции:** Описание / Как делать (с подзаголовком cues) / Полезно знать / Безопасность (с тремя градациями) + бейдж «✓ Безопасно при активном воспалении»

### Сценарий 5 — Roadmap stuck banner (commit 06)

⚠️ Сейчас пациент НЕ застрял (phase_started_at = 2 недели назад). Чтобы увидеть баннер:

```
"C:/Program Files/PostgreSQL/18/bin/psql.exe" -h localhost -U postgres -d azarean_rehab -c "UPDATE rehab_programs SET phase_started_at = NOW() - INTERVAL '20 weeks' WHERE patient_id = 14 AND status = 'active';"
```

- На «Путь восстановления» сверху должен появиться жёлтый info-баннер «Ты на этой фазе уже 20 недель» + CTA «Связаться с куратором»
- CTA → переход на «Связь»
- Зелёная карточка «Готовое сообщение для куратора» с pre-filled текстом
- Кнопка «Скопировано · нажми ещё раз» с inline-flash при клике
- MessengerCTA (Telegram/WhatsApp/Max) внутри карточки

После проверки **обязательно** вернуть БД в clean baseline:

```
"C:/Program Files/PostgreSQL/18/bin/psql.exe" -h localhost -U postgres -d azarean_rehab -c "UPDATE rehab_programs SET phase_started_at = NOW() - INTERVAL '2 weeks' WHERE patient_id = 14 AND status = 'active';"
```

### Сценарий 6 — Регрессы (важно!)

- Существующий `pgic` flow (Главная → 3 кнопки «Лучше/Так же/Хуже») работает
- Сохранение записи дневника через auto-save (флэш «Сохранено» в шапке)
- Загрузка фотографий в дневнике
- Telegram/WhatsApp кнопки в Связи открывают мессенджер
- Profile → settings, аватар, выход из аккаунта

---

## Merge всей волны — порядок СТРОГО #45 → #50

После успешного pre-merge smoke выполнить через `gh pr merge` или GitHub UI **в строгом порядке**:

```bash
gh pr merge 45 --squash --delete-branch
gh pr merge 46 --squash --delete-branch
gh pr merge 47 --squash --delete-branch
gh pr merge 48 --squash --delete-branch
gh pr merge 49 --squash --delete-branch
gh pr merge 50 --squash --delete-branch
```

**Важно:**
- `--squash` — каждый PR в один коммит (чище история main)
- `--delete-branch` — авто-удаление feature-веток после merge
- Между мерджами 30-60 секунд паузы — чтобы CI/CD не накладывались
- **GitHub Actions автоматически пустит deploy на прод** после первого же merge → следующие пять триггернут ещё деплои → последний задеплоит финал. Это нормально (политика batch — один большой деплой не получится с 6 push'ей, но прод стабилизируется на финальном)

Альтернатива (быстрее) — мерджить через GitHub UI кнопкой «Squash and merge» сверху вниз в порядке #45→#50.

### Если порядок нарушен

Если случайно промерджить #46 раньше #45:
- #45 содержит коммит `3aca77d` (commit 01), #46 построена от #45 → содержит ОБА коммита
- После merge #46 в main: оба коммита окажутся в main как **один squash-коммит**
- PR #45 покажет «No commits to merge» → закроется автоматически
- Коммиты не теряются, но #45 как отдельный merge-commit теряется → нарушается code-review-аудит (но прод не сломается)

---

## После merge

### Финальный prod-smoke

Прогнать всё то же что в pre-merge smoke, но **на проде** https://my.azarean.ru:
1. `vadim@azarean.com` инструктор
2. Создать тестового пациента (или взять id=6 если его данные на проде остались)
3. Все 6 сценариев

### Если что-то ломается на проде

**git revert ВСЕГО ПАКЕТА**, не отдельных коммитов:

```bash
git checkout main
git pull
# Найти SHA squash-коммитов 6 PR'ов через git log --oneline | head -10
git revert --no-commit <sha_50> <sha_49> <sha_48> <sha_47> <sha_46> <sha_45>
git commit -m "revert: rollback Wave 0 (PRs #45-50) due to prod regression"
git push
```

CI/CD задеплоит revert. Затем разобраться, починить, попробовать ещё раз новыми PR'ами.

### Документация

После prod-smoke:
- В CLAUDE.md «Завершено» обновить запись про Wave 0: добавить «smoke на проде ✅, дата YYYY-MM-DD»
- В `wave_0_progress.md` все 6 строк перевести в `🟢 в main`
- Опционально — попросить архитектора написать `ARCHITECT_STATUS_2026-05-XX.md`

---

## Окружение

### Тестовые учётные данные

- Инструктор (admin): `vadim@azarean.com` / `Test1234`
- Тестовый пациент: id=14, `avi707@mail.ru` / `Test1234`

### Сервера на момент handoff'а

- Backend: `localhost:5000` (nodemon)
- Frontend: `localhost:3001` (CRA)
- JARVIS Director на `:3000` — НЕ ТРОГАТЬ

### dev-БД

- PostgreSQL 18, БД `azarean_rehab`, пароль `Azarean444`
- psql: `"C:\Program Files\PostgreSQL\18\bin\psql.exe" -h localhost -U postgres -d azarean_rehab`

### Команды тестов

```bash
# Backend (338/338)
cd backend && npx jest

# Frontend (236/236)
cd frontend && npx react-scripts test --watchAll=false
```

### gh CLI

Авторизован под `jaike077-web` (keyring, scopes `gist, read:org, repo, workflow`). Можно сразу делать `gh pr merge` без переавторизации.

---

## Контекст бесшовного перехода

- Все 6 PR живые, ничего не закрыто
- dev-БД в clean baseline (исключение — упражнение id=12 обогащено новыми полями, не откачено — это нормально, можно оставить)
- Memory обновлена, главная точка входа — `memory/wave_0_complete.md`
- CLAUDE.md обновлён, Wave 0 в разделе «Завершено», Bug #12 частично закрыт
- Текущая git-ветка: `wave-0/06-roadmap-stuck-banner` (можно остаться на ней или переключиться на main для merge'а)

---

## Связанные документы

1. **`memory/wave_0_complete.md`** — итоговая сводка волны (главная)
2. **`memory/wave_0_batch_merge_policy.md`** — политика merge'а
3. `wave_0_progress.md` — журнал прогресса
4. `TZ_WAVE_0_INDEX.md` — карта волны
5. `PATIENT_UX_ROADMAP_2026-05-08_v2.md` — корневой roadmap (для контекста Волны 1)
6. `CLAUDE.md` — стек, правила, структура (всегда подгружается)
7. `SESSION_HANDOFF_2026-05-04.md` — состояние dark-theme (НЕ ТРОГАТЬ)
