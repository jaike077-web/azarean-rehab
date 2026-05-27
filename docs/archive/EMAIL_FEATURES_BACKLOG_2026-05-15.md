# Email features backlog — план расширения Y360/Resend интеграции

**Дата:** 2026-05-15
**Контекст:** [backend/utils/email.js](backend/utils/email.js) сейчас обслуживает один сценарий — password reset через Y360 → Resend → stub. Заготовка `sendVerificationEmail()` существует но не дёргается. Этот файл — список того что МОЖНО подцепить к существующей инфраструктуре, с приоритизацией.

**Когда стартовать:** **после batch-merge Wave 1** (10 PR #45..#54). Email-фичи не пересекаются с Wave 1 (program_types, templates, wizard), но добавляют коммиты в `routes/patientAuth.js` / `routes/auth.js` / `scheduler.js` — после Wave 1 merge конфликтов точно не будет.

**Ограничения 152-ФЗ:** все триггеры используют Y360 как primary (РФ серверы → нет трансграничной передачи). Resend остаётся как fallback. Для каждой новой функции — НЕ включать в письмо медицинские данные (диагноз, дневник). Только nominal/transactional текст.

---

## P0 — Берём первым (must-have для пилота)

### E.1 — Email-верификация при регистрации
**Цель:** защита от опечаток в email — иначе пациент при попытке reset password не получит письмо и не сможет восстановить доступ.

**Scope:**
- В `backend/routes/patientAuth.js` POST `/register`: после создания пациента генерировать verification-токен (SHA-256 hash в БД, TTL 24 часа), вызывать `sendVerificationEmail(email, token)`.
- Новая миграция: `patient_email_verifications(id, patient_id FK, token_hash, expires_at, used_at)`. Полные данные как у `patient_password_resets`.
- Frontend: новая страница `/patient-verify-email/:token` — POST на новый endpoint, показывает success/expired/invalid.
- Backend: новый endpoint `POST /api/patient-auth/verify-email` принимает токен, ставит `patients.email_verified=true`, помечает `used_at=NOW()`.
- **OAuth-пациенты:** при регистрации через Yandex/Telegram OAuth `email_verified=true` сразу (провайдер уже подтвердил).

**Что НЕ делать:**
- НЕ блокировать вход неверифицированным — это создаст deadlock «не могу залогиниться → не могу подтвердить email». Только показывать banner в Dashboard «подтвердите email».
- НЕ переотправлять автоматически при каждом login — отдельная кнопка «Отправить заново».

**ETA:** 2-3 часа.

**Coordination:** routes/patientAuth.js. После Wave 1 merge.

**DoD:**
- [ ] Миграция `patient_email_verifications` идемпотентна, прогон дважды
- [ ] При local-регистрации с invite-code отправляется письмо со ссылкой
- [ ] При OAuth-регистрации `email_verified=true` без письма
- [ ] Страница `/patient-verify-email/:token` обрабатывает success / expired / invalid / already-used
- [ ] Banner «подтвердите email» в Dashboard если `email_verified=false`
- [ ] Backend тесты на 3 ветки + frontend test на страницу

---

### E.2 — Уведомление о смене пароля
**Цель:** security hygiene. Если кто-то перехватил access token и сменил пароль — пациент видит письмо «ваш пароль был изменён, если не вы — пишите куратору».

**Scope:**
- В `POST /api/patient-auth/change-password` (после успешной смены) — вызвать `sendPasswordChangedNotification(email, { ip, userAgent, timestamp })`.
- Новая функция в [utils/email.js](backend/utils/email.js) + новый шаблон HTML/text.
- Шаблон НЕ содержит сам пароль (никогда). Только факт + время + IP первой пары октетов (1.2.x.x для приватности).
- IP читать из `req.ip` (express уже знает `trust proxy`).

**Что НЕ делать:**
- НЕ отправлять при автоматической ротации refresh-токена (это техническое действие).
- НЕ давать кнопку «откатить пароль» в письме — это создаёт новый attack vector. Только «свяжитесь с куратором».

**ETA:** 30-45 минут.

**Coordination:** routes/patientAuth.js. Можно делать вместе с E.1.

**DoD:**
- [ ] После `POST /change-password` приходит письмо с timestamp/IP
- [ ] Шаблон НЕ содержит пароль (regex проверка в тесте)
- [ ] Тест что письмо вызывается из routes/patientAuth.js

---

### E.3 — Кнопка «отправить invite-code на email» в InviteCodeModal
**Цель:** упростить Татьяне workflow «дать пациенту код». Сейчас она копирует код вручную и шлёт через Telegram/SMS/устно. Если у пациента известен email — может прислать прямо из системы.

**Scope:**
- В [InviteCodeModal.js](frontend/src/components/InviteCodeModal.js) — добавить кнопку «Отправить на email» рядом с «Отправить в Telegram». Показывать только если у пациента `email` заполнен.
- Backend: новый endpoint `POST /api/patients/:id/invite-code/send-email` — берёт **последний активный** invite-code пациента, шлёт письмо. Если активного нет — 404. Если письмо упало — 500 с понятным сообщением.
- Шаблон: «Здравствуйте, [имя пациента]! Ваш код для регистрации в Azarean: XXXX-XXXX. Перейдите на my.azarean.ru/patient-register и введите код. Срок действия: 24 часа.»
- **Не показывать сам код** в response endpoint'а (он уже был показан Татьяне при генерации) — только success/failure.

**Что НЕ делать:**
- НЕ генерировать новый код при отправке (это отдельный flow).
- НЕ слать автоматически при `POST /invite-code` — пусть Татьяна решает каналом доставки сама.

**ETA:** 1.5-2 часа.

**Coordination:** routes/patients.js + InviteCodeModal.js. Не пересекается с Wave 1.

**DoD:**
- [ ] Endpoint работает, отправляет письмо с правильным кодом
- [ ] Кнопка в модалке показывается только если у пациента есть email
- [ ] Toast «отправлено» / «ошибка отправки»
- [ ] Backend тест endpoint'а (с моком email)

---

## P1 — Следующая волна (когда P0 закроется)

### E.4 — Welcome email после первой регистрации
**Цель:** снизить churn в первые 24 часа. Краткое onboarding по экранам Dashboard + reminder про куратора.

**Scope:**
- После `POST /api/patient-auth/register` (рядом с verification email) — но **отдельным письмом через 5-10 минут**. Использовать `setTimeout` на 5 мин ИЛИ записать `welcome_sent_at` в patients и cron каждые 10 мин проверяет «зарегистрирован 5+ мин назад, welcome не отправлен → шлём».
- Cron-вариант лучше — переживёт рестарт PM2.
- Шаблон: «Добро пожаловать в Azarean! Ваш куратор — [имя]. На главной странице вы увидите комплекс на сегодня. Заполняйте дневник каждый день — это помогает нам подстраивать программу.»

**ETA:** 1-1.5 часа.

**DoD:**
- [ ] Поле `welcome_sent_at` в patients (миграция)
- [ ] Cron-задача в scheduler.js (каждые 10 мин)
- [ ] Письмо приходит через 5-10 мин после регистрации, один раз

---

### E.5 — Уведомление о новом OAuth-привязке
**Цель:** пациент видит когда к его аккаунту привязан новый провайдер (Yandex/Telegram). Защита от silent account takeover.

**Scope:**
- В oauth callback'ах (Telegram, Yandex), когда `linked_to_existing_patient=true` — после успешной привязки слать письмо «к вашему Azarean-аккаунту привязан вход через Yandex». Email берётся из `patients.email`.
- Не слать при first-time registration через OAuth (там был verify-email).
- Не слать при returning login (привязка уже была).

**ETA:** 45-60 минут.

**DoD:**
- [ ] Письмо приходит ТОЛЬКО при autolink, не при returning
- [ ] Шаблон содержит провайдера + timestamp
- [ ] Тест на 3 ветки в oauth callback (new / autolink / returning)

---

### E.6 — Уведомление о scheduled hard-delete (grace period)
**Цель:** защита от случайного удаления аккаунта. Сейчас `DELETE /me` ставит soft delete + cron hard-delete через 30 дней — но пациент об этом не уведомлён.

**Scope:**
- После `DELETE /me` (soft) — сразу письмо «ваш аккаунт помечен на удаление. Хард-delete через 30 дней. Чтобы отменить — войдите и нажмите "Восстановить"».
- Дополнительно: cron в scheduler.js за **7 дней** до hard-delete шлёт reminder.
- Endpoint `POST /api/patient-auth/me/restore` — отменяет deletion request (UPDATE `patient_deletion_queue` SET `cancelled_at = NOW()`).
- UI: на /patient-login если последняя попытка logged in user'а попадает на is_active=false — показать «ваш аккаунт помечен на удаление, восстановить?» с кнопкой.

**Что НЕ делать:**
- НЕ удалять сразу при request DELETE — grace period обязателен (политика 152-ФЗ Article 21 разрешает hard delete до 30 дней с момента запроса).

**ETA:** 2-3 часа.

**DoD:**
- [ ] Письмо сразу после DELETE
- [ ] Reminder за 7 дней
- [ ] Endpoint restore работает
- [ ] UI flow на /patient-login

---

## P2 — Полезное при росте пациентопотока

### E.7 — Email-fallback для messages от куратора
**Цель:** если пациент не привязал ни один мессенджер — он не узнаёт о новом сообщении от Татьяны. Email как канал доставки last-resort.

**Когда подцеплять:** когда появится первая жалоба «не вижу когда куратор пишет». Не раньше — у нас 4 channels (telegram/whatsapp/max/in_app) уже есть.

**Scope:**
- В `POST /api/rehab/programs/:id/messages` (от инструктора) — после INSERT проверить `patients.preferred_messenger`. Если нет привязанного канала ИЛИ `preferred_messenger='email'` → отправить уведомление.
- Шаблон: «У вас новое сообщение от куратора. Откройте Azarean: my.azarean.ru/patient-dashboard» (без содержания сообщения — privacy).

**ETA:** 1-1.5 часа.

---

### E.8 — Уведомление инструктору о новой регистрации через invite-code
**Цель:** Татьяна узнаёт «Иван Петров активировал инвайт» без проверки Dashboard.

**Когда подцеплять:** когда у Татьяны будет 5+ активных пациентов и она перестанет видеть всех вручную.

**Scope:**
- После `POST /patient-auth/register` (invite-code flow) — взять `patient.created_by` → email инструктора → слать notification «новая регистрация».
- Email инструктора — из `users.email`.

**ETA:** 30-45 минут.

---

## P3 — Преждевременно, не делать без явного запроса

| Что | Почему пока нет |
|---|---|
| Еженедельный progress digest | Дублирует Roadmap/Profile экраны. Когда пациент перестал заходить — лучше Telegram-пуш через scheduler. |
| Email-напоминания о дневнике в 21:00 | scheduler уже шлёт через `preferred_messenger`. Email игнорируется чаще чем пушится. |
| Email-дайджесты советов / educational | Нет регулярного контента у Татьяны. |
| Email о stuck-статусе пациенту | Риск guilt-tripping. Лучше Татьяна напишет лично через messages. |
| Async data export через email | Текущий export'a быстрый, JSON отдаётся сразу. Email-link не нужен. |

---

## Порядок исполнения

Делаем последовательно после Wave 1 merge:

**Сессия 1 (3-4 часа):** E.1 + E.2 — security core (verify email + password change notification)
**Сессия 2 (2 часа):** E.3 — invite-code на email (Татьянин UX)
**Сессия 3 (опционально):** E.4 + E.5 + E.6 — onboarding / security extras

После пилота с 5+ пациентами — оценить P2.

---

## Файлы, которые будут затронуты

### Backend
- [backend/utils/email.js](backend/utils/email.js) — новые шаблоны (`passwordChangedTemplate`, `welcomeTemplate`, `oauthLinkedTemplate`, `inviteCodeTemplate`, `accountDeletionTemplate`)
- [backend/routes/patientAuth.js](backend/routes/patientAuth.js) — verify email endpoints, change-password trigger, delete grace
- [backend/routes/patients.js](backend/routes/patients.js) — send-invite-via-email endpoint
- [backend/services/scheduler.js](backend/services/scheduler.js) — welcome cron, deletion reminder cron
- Миграции: `patient_email_verifications`, `patients.welcome_sent_at`

### Frontend
- [frontend/src/components/InviteCodeModal.js](frontend/src/components/InviteCodeModal.js) — кнопка «отправить на email»
- Новая страница `frontend/src/pages/PatientAuth/VerifyEmail.js` + роут
- Banner «подтвердите email» в Dashboard
- UI восстановления аккаунта на /patient-login

### НЕ ТРОГАТЬ
- Y360/Resend интеграцию в email.js (она уже работает)
- OAuth callback'и без необходимости
- Шаблоны (создавать новые рядом, не править существующие — это commits review-able по диффу)

---

## Что обновлять после каждой фичи

- [CLAUDE.md](CLAUDE.md) — секция «Завершённые исправления», добавить запись с номером
- [MEMORY.md](C:\Users\Вадим\.claude\projects\c--Users-------Desktop-Azarean-rehab\memory\MEMORY.md) — секция «Closed bugs»
- При завершении всех P0 — закрыть этот файл (переименовать в `EMAIL_FEATURES_DONE_2026-05-15.md` или удалить)
