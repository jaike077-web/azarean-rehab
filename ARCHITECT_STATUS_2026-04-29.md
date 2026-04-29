# Azarean Rehab — Current State (для архитектора)

**Дата:** 2026-04-29
**Предыдущий снапшот:** `ARCHITECT_STATUS_2026-04-24.md`
**Период с прошлого снапшота:** 5 дней, закрыты Phase 1 (invite-code) + Phase 2 (Telegram OIDC + Yandex OAuth) + RehabProgram UI

---

## Production state

- **URL:** https://my.azarean.ru — задеплоен 2026-04-23, стабилен
- **VDS:** 185.93.109.234 (shared с JARVIS Director, Fastify на :3000)
- **CI/CD:** GitHub Actions, push в `main` → Test → Build → Deploy (SSH, root). Last green: коммит `e1fbaae`
- **Backup:** `pg_dump` ежедневно 03:15 Екб, 14-дневная ротация (`deploy/backup.sh`)
- **Healthcheck:** `deploy/healthcheck.sh` через cron каждые 5 мин, лог `/var/log/azarean-rehab-health.log` (без Telegram-алертов и backoff — оба в P1)
- **Prod Telegram bot:** `@az_zari_bot` (dev — `@azarean_rehab_bot`)
- **Активных пациентов:** 2 — id=1 (тестовый клиент, ПКС), id=6 (Вадим Азаренков, auth_provider=telegram, привязан через OIDC silent autolink по phone)
- **Тесты:** backend 214/214 + frontend 202/202 = **416 зелёных**

---

## Закрыто после `ARCHITECT_STATUS_2026-04-24.md` (5 дней)

### Phase 1 — invite-code flow (закрывает gap «пациент-невидимка»)
- Self-registration без 8-символьного кода невозможна. Инструктор генерирует код через `POST /api/patients/:id/invite-code` (24ч TTL, used-once, SHA-256 хэш). Frontend: `InviteCodeModal` с copy-to-clipboard и `t.me/share`
- Миграция `20260427_patient_invite_codes.sql` + `backend/utils/inviteCode.js` (alphabet без `0/O/1/I/l`)
- Коммит `e3970f6`

### Phase 2a — phone normalizer (фундамент под OAuth phone-match)
- `backend/utils/phone.js` (E.164, 17 unit-тестов), routes/patients и /patient-auth нормализуют на write
- Бэкфилл существующих записей миграцией `20260427_normalize_patient_phones.sql` (идемпотентна)
- Коммит `30e031f`

### Phase 2b/c — Telegram OIDC через финский прокси
- Rehab-VDS физически не достукается до `oauth.telegram.org` (selective subnet block у AdminVPS). JARVIS-Director поднял nginx reverse-proxy `https://tg-proxy.azarean.ru` на финском VDS (78.17.1.70), IP-allowlist 185.93.109.234, `X-Proxy-Secret`
- Backend через `openid-client@6` + `customFetch`, миграция `20260427_oauth_pkce_nonce.sql` (PKCE S256 + OIDC nonce)
- Match-flow: provider_id → silent autolink по нормализованному phone → `/patient-register?...` с pre-fill
- Грабли (см. `memory/telegram_oidc_proxy.md`): legacy Login Widget HMAC мёртв после OIDC switch, `telegram:bot_access` нельзя обязательным (toggle off → silent fail), один `$1` на VARCHAR+BIGINT нельзя (pg `inconsistent types deduced`), openid-client@6 ESM в CJS — лениво require внутри функций
- Коммиты `7cb4742`, `a89ae5f`, `b29a661`, `897a82b`

### Phase 2d — Yandex OAuth 2.0 (без OIDC, без прокси)
- Yandex не публикует OIDC discovery (`/.well-known/openid-configuration` → 404), нет ID-токена. Plain OAuth 2.0 + PKCE S256, userinfo через `GET login.yandex.ru/info` с `Authorization: OAuth <token>`
- Прокси не нужен — oauth.yandex.ru/login.yandex.ru доступны с rehab-VDS
- Phone scope = `login:default_phone` (точное имя видно только в Yandex Cabinet после создания app). Match-flow идентичен Telegram'у
- Все 3 сценария проверены в проде (returning / phone-autolink / unknown→register)
- Коммит `7b19e9d`. Подробности — `memory/yandex_oauth_v2.md`

### RehabProgram UI (закрывает 2-й бизнес-блокер из §7.1)
- `frontend/src/components/RehabProgramModal.js` + кнопка «Программа» на карточке пациента в Patients.js. Модалка create/edit/delete, автоопределяет mode по наличию активной программы. Backend без изменений
- 7 unit-тестов. **Разблокирует Home-экран пациента** — блок «Ваш комплекс на сегодня» теперь работает после назначения мышкой (раньше требовался прямой `INSERT INTO rehab_programs`)
- Коммит `e1fbaae`

---

## Что осталось от `ARCHITECT_STATUS_2026-04-24.md` §7

| Backlog item (старый) | Status |
|---|---|
| §7.1.1 Self-registration → пациент-невидимка | ✅ закрыт (Phase 1) |
| §7.1.2 Нет UI для RehabProgram | ✅ закрыт (RehabProgramModal) |
| §7.2.3 Хардкод «Татьяна · куратор» в ContactScreen/ProfileScreen | 🟡 ждёт `instructor_name` в `/api/rehab/my/dashboard` |
| §7.2.4 Compliance disclaimer «зашифрованные данные» | 🔴 не закрыт |
| §7.2.5 Exercise library virtualization (>1000) | 🟡 не блокер при текущем объёме |
| §7.2.6 `_migrations` checksum table | 🔴 не закрыт |
| §7.2.7 Non-root deploy user | 🔴 не закрыт |
| §7.2.8 Healthcheck Telegram alerts | 🔴 не закрыт |
| §7.2.9 `/api/health` endpoint | 🔴 не закрыт |
| §7.3 Security backlog (2FA, admin email split) | 🟡 после первого пилота |

---

## Текущие приоритеты (zero реальных пациентов, руки развязаны)

### P0 — этой неделей (разблокировать пилот)
1. **Compliance disclaimer fix** — переформулировать «данные в зашифрованном виде» (на самом деле TLS in-transit + bcrypt + SHA-256, не at-rest). Один edit
2. **Sentry подключение** — backend + frontend, 30-60 мин
3. **Bot link-code login как fallback** к OAuth — когда oauth.telegram.org WebSocket-сигнал глючит при consent в Desktop (~5-6 ч)

### P1 — до первого живого пилота
4. **Email integration (Resend)** — сейчас email stub в `console.log`, нужен реальный для password-reset и invite-code-via-email
5. **`/api/health` endpoint** — `SELECT 1` + uptime + db.alive + db.ms (без version)
6. **Healthcheck backoff + Telegram-алерт** через `@azarean_ops_bot`
7. **Compliance legal position документ + юрист** — подпадает ли под Постановление №1416 о медизделиях
8. **Audit log retention plan** — таблица растёт линейно, сейчас без партицирования и без TTL

### P2 — после 5-10 пациентов в пилоте
9. **GDPR data export + self-delete endpoints** — `GET /api/patient-auth/me/export`, `DELETE /api/patient-auth/me`
10. **`_migrations` checksum table** — skip-already-applied в `migrate.sh` (сейчас все 25 файлов прогоняются на каждом редеплое, идемпотентность держится на guard'ах в каждой миграции — хрупко)
11. **Non-root deploy user** (`azarean_deploy` + sudoers narrow whitelist) с решением `.env` permission проблемы
12. **Runtime schema drift detection cron** — еженедельный diff `\d+ table` dev↔prod

### P3 — long-term (только по явному запросу)
13. 2FA для админов (когда появится 2-й админ)
14. Audit log partitioning по месяцу
15. `messages.sender_id` polymorphic split (instructor_id / patient_id вместо одной колонки без FK)
16. Exercise library virtualization (react-window) при >2000 упражнений
17. CSS Modules вместо глобальных стилей (закроет 80+ дублей)
18. ROM CV measurement (MediaPipe Pose, замер угла сустава по фото)
19. Dark theme

---

## Решения, принятые архитектором (зафиксированы)

- **Invite-code:** 8 chars alphanumeric с alphabet без `0/O/1/I/l` (НЕ 6 chars — повышает entropy при том же UX)
- **RehabProgram UI:** модалка на карточке пациента в Patients.js, не отдельная страница
- **Migration tracking:** своя `_migrations(version PK, applied_at)`, не node-pg-migrate / sqitch (меньше зависимостей)
- **`/api/health`:** минимальный — status + uptime + db.alive + db.ms, без version и без Kinescope/Telegram пробинга
- **Non-root deploy:** `azarean_deploy` user + `sudoers NOPASSWD` whitelist на `systemctl reload nginx` и `pm2 *`
- **Telegram OIDC:** через финский reverse-proxy (rehab-VDS не достукается до oauth.telegram.org), не Bot Login Widget HMAC. Прокси на JARVIS-VDS, IP-allowlist + secret-header
- **Yandex OAuth:** plain OAuth 2.0 + PKCE, без прокси, userinfo через login.yandex.ru/info
- **Phone-match для silent autolink:** только при single match по нормализованному E.164. Multi-match → редирект на /patient-register с pre-fill (юзер вводит invite-code вручную)
- **Compliance disclaimer:** переформулировать («защищённое соединение TLS», убрать «at-rest шифрование»), не шифровать поля через pgcrypto на этом этапе

---

## Открытые вопросы (требуют решения)

1. **Compliance / 152-ФЗ + Постановление №1416** — подпадает ли продукт под медицинские изделия (классификация ЭКО vs «приложение для физкультуры»)? Нужна юридическая консультация **до публичного маркетинга**. Сейчас инструктор хранит diagnosis/birth_date/phone — это уже «специальная категория» по 152-ФЗ.
2. **Long-term масштаб vs нишевый продукт** — обсуждалось, не финализировано. Влияет на: партицирование audit_log, virtualization exercise-library, multi-tenancy для других физиотерапевтических студий.
3. **Audit log retention** — хранить вечно (как доказательство для GDPR-аудитов) или TTL 365 дней с архивированием в S3?
4. **Email provider** — Resend (выбрано как дефолт) или альтернатива (Mailgun, SES)? Для РФ-юзеров — будут ли проблемы с deliverability на mail.ru / yandex.ru?

---

## Контекст для быстрого погружения

1. **Этот файл** — снапшот на 2026-04-29
2. `ARCHITECT_STATUS_2026-04-24.md` — снапшот деплоя + первый smoke-test (всё ещё актуален как baseline)
3. `CLAUDE.md` — стек, схема БД (20 таблиц), 25 миграций, API endpoints, 43 закрытых бага
4. `memory/MEMORY.md` + `memory/production_deployment.md` — credentials, runbook
5. `memory/telegram_oidc_proxy.md` + `memory/yandex_oauth_v2.md` — детали OAuth-интеграций (грабли + решения)
6. `deploy/README.md` — 6-step smoke test + rollback

**Prod alive check:**
```bash
curl https://my.azarean.ru/api/rehab/phases?type=acl
# ожидаем: { "data": [6 phases] }
```

---

**Ответственный:** jaike707@gmail.com
**Последний прод-коммит:** `e1fbaae feat(rehab-programs): UI для создания RehabProgram из карточки пациента`
**Следующий шаг:** архитектор выбирает приоритет из P0/P1
