# TZ HOTFIX #4 — Invite-code UX improvements (share-link + pre-fill)

**Дата:** 2026-05-15
**Объём:** ~45-60 минут
**Risk:** LOW — изолированные UI улучшения + 1 query-param read
**Тип:** Hot-fix UX качества
**Архитектор:** GO — тривиальный fix, повышает first-time-use conversion

---

## Контекст

Инструктор Vadim 2026-05-15 в smoke: «когда отправляем код, у нас нет ссылки на страницу регистрации». Кнопка `<a href="t.me/share/url">` есть в [InviteCodeModal.js:117-125](frontend/src/components/InviteCodeModal.js#L117-L125), но юзер её не заметил.

Также, после клика на кнопку:
- Текст в Telegram заканчивается `…Перейдите по ссылке и введите код:` (двоеточие в конце, без URL — URL отображается **отдельным блоком**)
- Код 8 символов рендерится как plain text → **не tap-to-copy** в Telegram
- Юзер ожидал URL **в одном клике от пациента**, а пациент должен делать 3 шага (open URL → copy code из text → paste in form)

**Архитектурное предложение:** pre-filled `?code=ABCDEFGH` в URL → пациент кликает → форма автозаполняется → 1 шаг вместо 3.

---

## Verify-step

```bash
cd c:/Users/Вадим/Desktop/Azarean_rehab

# 1. Подтвердить что InviteCodeModal.js на месте + telegramShareUrl формирование
grep -n "telegramShareUrl\|t.me/share" frontend/src/components/InviteCodeModal.js
# Ожидается: строки ~51-58

# 2. Подтвердить что PatientRegister.js уже использует URLSearchParams
grep -n "URLSearchParams\|useLocation" frontend/src/pages/PatientAuth/PatientRegister.js
# Ожидается: строка ~2 (импорт useLocation) и ~20 (instantiation)

# 3. Подтвердить что invite_code state управляет полем формы
grep -n "inviteCode" frontend/src/pages/PatientAuth/PatientRegister.js | head -10

# 4. Проверить что нет других мест где invite-code URL формируется (для consistency)
grep -rn "patient-register" frontend/src/ backend/ | grep -v "test\|node_modules\|.git"
# Ожидается: 2-3 совпадения — backend OAuth callback (redirect after no-match) + InviteCodeModal + Login link
# Backend redirect уже добавляет `?oauth_provider=...` — мы добавим в InviteCodeModal `?code=...`
```

---

## Что менять

### Файл 1: `frontend/src/components/InviteCodeModal.js`

#### 1A — `telegramShareUrl` теперь включает `?code=` (строка ~51-58):

**Before:**
```javascript
const telegramShareUrl = code
  ? `https://t.me/share/url?url=${encodeURIComponent(
      'https://my.azarean.ru/patient-register'
    )}&text=${encodeURIComponent(
      `Ваш код приглашения для регистрации в Azarean: ${code}\n` +
      `Перейдите по ссылке и введите код:`
    )}`
  : null;
```

**After:**
```javascript
const telegramShareUrl = code
  ? `https://t.me/share/url?url=${encodeURIComponent(
      `https://my.azarean.ru/patient-register?code=${code}`
    )}&text=${encodeURIComponent(
      `Регистрация в Azarean Rehab.\n` +
      `Перейдите по ссылке — код приглашения уже подставлен:`
    )}`
  : null;
```

**Key changes:**
- URL включает `?code=ABCDEFGH` для auto-fill
- Текст НЕ содержит сам код (раньше дублировал — теперь только URL и инструкция)
- Текст финиширует осмысленно, без trailing colon
- Убрано «(код 8 символов: ...)» — лишнее, URL self-describing

#### 1B — Добавить «Скопировать полное сообщение» кнопку

**Найти блок `inviteCodeActions`** (строки ~117-135):

**Before:**
```jsx
<div className={s.inviteCodeActions}>
  <a
    href={telegramShareUrl}
    target="_blank"
    rel="noopener noreferrer"
    className={`${s.btnSecondary} ${s.inviteCodeShareBtn}`}
  >
    Отправить в Telegram
  </a>
  <button
    type="button"
    className={s.btnSecondary}
    onClick={requestCode}
    disabled={loading}
  >
    <RefreshCw size={16} className={s.btnIcon} />
    <span>Сгенерировать новый</span>
  </button>
</div>
```

**After:**
```jsx
<div className={s.inviteCodeActions}>
  <button
    type="button"
    className={`${s.btnPrimary} ${s.inviteCodeShareBtn}`}
    onClick={handleCopyShareMessage}
    title="Скопировать ссылку с кодом"
  >
    {copiedMessage ? <Check size={16} /> : <Copy size={16} />}
    <span>{copiedMessage ? 'Скопировано' : 'Скопировать ссылку для пациента'}</span>
  </button>
  <a
    href={telegramShareUrl}
    target="_blank"
    rel="noopener noreferrer"
    className={`${s.btnSecondary} ${s.inviteCodeShareBtn}`}
  >
    Отправить в Telegram
  </a>
  <button
    type="button"
    className={s.btnSecondary}
    onClick={requestCode}
    disabled={loading}
  >
    <RefreshCw size={16} className={s.btnIcon} />
    <span>Сгенерировать новый</span>
  </button>
</div>
```

**Reorder rationale (архитектор):**
1. **Скопировать ссылку для пациента** (новый, `btnPrimary`) — самый частый случай. Vadim копирует и шлёт через WhatsApp / SMS / любой свой канал. **Primary action.**
2. **Отправить в Telegram** — если у пациента есть Telegram, в 1 клик
3. **Сгенерировать новый** — last resort если код истёк / потерян

#### 1C — Добавить handler + state для "Copy message"

**В начале компонента (рядом с existing `[copied, setCopied] = useState(false)` ~строка 23):**

```javascript
const [copiedMessage, setCopiedMessage] = useState(false);
```

**Под `handleCopy` (после строки ~49) — добавить новый handler:**

```javascript
const handleCopyShareMessage = async () => {
  if (!code) return;
  const message = `Регистрация в Azarean Rehab.\n` +
    `Перейдите по ссылке — код приглашения уже подставлен:\n` +
    `https://my.azarean.ru/patient-register?code=${code}`;
  try {
    await navigator.clipboard.writeText(message);
    setCopiedMessage(true);
    setTimeout(() => setCopiedMessage(false), 2000);
  } catch (_err) {
    toast.error('Не удалось скопировать');
  }
};
```

---

### Файл 2: `frontend/src/pages/PatientAuth/PatientRegister.js`

#### 2A — Прочитать `code` из query params (строка ~20):

**Before:**
```javascript
const queryParams = new URLSearchParams(location.search);
const oauthProvider = queryParams.get('oauth_provider');
const prefillPhone = queryParams.get('phone') || '';
const prefillFullName = queryParams.get('full_name') || '';
const prefillEmail = queryParams.get('email') || '';
```

**After:**
```javascript
const queryParams = new URLSearchParams(location.search);
const oauthProvider = queryParams.get('oauth_provider');
const prefillPhone = queryParams.get('phone') || '';
const prefillFullName = queryParams.get('full_name') || '';
const prefillEmail = queryParams.get('email') || '';
const prefillCode = queryParams.get('code') || '';  // Wave 1 hot-fix #4
```

#### 2B — Pre-fill inviteCode state (строка ~31):

**Before:**
```javascript
const [inviteCode, setInviteCode] = useState('');
```

**After:**
```javascript
const [inviteCode, setInviteCode] = useState(prefillCode);
```

#### 2C — Опционально: показать info-блок если код pre-filled

После `useEffect` для OAuth провайдера (~строка 39-44), добавить второй `useEffect`:

```javascript
// Wave 1 hot-fix #4: если код пришёл из ссылки — info для прозрачности
useEffect(() => {
  if (prefillCode) {
    // Toast info — пациент видит что код подставлен автоматически
    toast.info?.('Код приглашения подставлен из ссылки');
  }
}, [prefillCode]); // eslint-disable-line react-hooks/exhaustive-deps
```

**Note:** проверить что `toast.info` существует в `ToastContext.js`. Если нет — использовать `console.log` или inline UI hint:

```jsx
{prefillCode && (
  <div className={sr.codePrefilledHint}>
    ✓ Код приглашения подставлен из ссылки
  </div>
)}
```

И в `PatientRegister.module.css` добавить:
```css
.codePrefilledHint {
  background: var(--color-success-bg, #e6f7ed);
  color: var(--color-success, #1a8a6a);
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 13px;
  margin-bottom: 12px;
}
```

#### 2D — invite-code input disabled когда pre-filled?

**Не нужно.** Пациент может изменить код, если ошибочно перешёл по чужой ссылке. Pre-fill — это default, не lock.

---

## Тесты

### Frontend

**Unit-тесты** опциональны. Минимум:

`frontend/src/components/InviteCodeModal.test.js` (если существует) или новый:

```javascript
describe('InviteCodeModal — share-link', () => {
  test('telegramShareUrl содержит code в query params', () => {
    // ...mount component, mock generateInviteCode return code='ABCDEFGH'
    // ...query for the <a href> element
    expect(linkEl.href).toContain('patient-register%3Fcode%3DABCDEFGH');
  });

  test('"Скопировать ссылку" копирует полное сообщение с URL', async () => {
    // mock navigator.clipboard.writeText
    // click button
    // assert clipboard.writeText called with text containing 'patient-register?code=...'
  });
});
```

`frontend/src/pages/PatientAuth/PatientRegister.test.js` (если существует):

```javascript
describe('PatientRegister — invite code pre-fill', () => {
  test('код из query param ?code= подставляется в input', () => {
    render(<PatientRegister />, { route: '/patient-register?code=ABCDEFGH' });
    expect(screen.getByPlaceholderText(/код приглашения/i).value).toBe('ABCDEFGH');
  });
});
```

### Backend

Не затронут.

### Smoke test (в dev браузере)

#### Сценарий 1 — Pre-fill через ссылку (главный happy path)

1. Login как admin Vadim
2. Открыть карточку пациента → кнопка «Сгенерировать код приглашения»
3. Нажать «Скопировать ссылку для пациента» → проверить clipboard (Ctrl+V в notepad):
   ```
   Регистрация в Azarean Rehab.
   Перейдите по ссылке — код приглашения уже подставлен:
   https://my.azarean.ru/patient-register?code=ABCDEFGH
   ```
4. Открыть в **новой incognito вкладке** скопированный URL (или localhost эквивалент `http://localhost:3001/patient-register?code=ABCDEFGH`)
5. **Поле invite-code должно быть pre-filled** значением `ABCDEFGH`
6. (Опционально) info-блок «✓ Код приглашения подставлен из ссылки» виден
7. Заполнить остальные поля, submit → регистрация успешна

#### Сценарий 2 — Telegram share UX

1. (В той же модалке) Нажать «Отправить в Telegram»
2. Открывается `t.me/share/url?url=...&text=...`
3. URL содержит `patient-register?code=ABCDEFGH`
4. Text НЕ содержит дублирования кода
5. Pre-fill при клике из Telegram должен работать (это уже cценарий 1)

#### Сценарий 3 — Без pre-fill (классический flow)

1. Открыть `/patient-register` (без `?code=`)
2. Поле invite-code пустое
3. Регистрация по-прежнему требует ручного ввода — backward compatibility

#### Сценарий 4 — Edge cases

- `?code=` пустой → поле пустое (не undefined)
- `?code=INVALID` → можно ввести, backend rejection с message
- `?code=ABCDEFGH&phone=+79...` (OAuth + invite) → оба pre-fill работают

---

## Definition of Done

- [ ] Verify-step 4 проверки пройдены
- [ ] `InviteCodeModal.js`:
  - [ ] `telegramShareUrl` URL содержит `?code=${code}`
  - [ ] Текст в Telegram переписан (без дубля кода, без trailing colon)
  - [ ] Новая state `copiedMessage`
  - [ ] Новый handler `handleCopyShareMessage`
  - [ ] Reorder buttons: «Скопировать ссылку» (primary) → «Telegram» → «Сгенерировать новый»
- [ ] `PatientRegister.js`:
  - [ ] `prefillCode` из URLSearchParams
  - [ ] `useState(prefillCode)` вместо `useState('')`
  - [ ] (опционально) info-блок при pre-filled
- [ ] Frontend тесты прошли (252/252)
- [ ] Smoke 4 сценария пройдены вручную
- [ ] Commit на ветке `hotfix/invite-code-share-ux` от main
- [ ] Mini-PR с body описанием
- [ ] После merge — обновить memory `bug_invite_code_share_link.md` пометкой closed + SHA

---

## Commit message

```
fix(invite-code): pre-filled link + улучшенный share UX

После Wave 1 prod-smoke юзер не заметил кнопку «Отправить в Telegram»
и не понял что URL для пациента нужен отдельно от кода. После клика
пациент должен был 3 шага: открыть URL, скопировать код из текста,
вставить в форму.

Changes:
- InviteCodeModal: URL в share-link теперь включает ?code=ABCDEFGH
- Новая кнопка «Скопировать ссылку для пациента» (primary) с полным
  готовым сообщением для отправки через любой канал
- Reorder buttons: Copy-link (primary) → Telegram → Re-generate
- Text сообщения упрощён (без дубля кода)
- PatientRegister: pre-fill inviteCode из query param ?code=

Smoke: пациент кликает по ссылке → форма авто-заполнена → 1 клик
вместо 3.

Backward compatibility: ручной ввод кода продолжает работать.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

## NOT TOUCH

- **Backend `routes/patientAuth.js`** — invite-code generation logic не меняется
- **Backend `utils/inviteCode.js`** — генерация 8-char codes не меняется
- **Migration `20260427_patient_invite_codes.sql`** — БД схема не меняется
- **Other PatientRegister form fields** — не рефакторить
- **InviteCodeModal copy basic logic (handleCopy для просто кода)** — оставить (некоторые юзеры могут хотеть только code без ссылки)
- **PatientAuthContext / login flow** — не меняется
- **Dark-theme dirty файлы** — изоляция через `git stash`

---

## Backward compatibility checklist

- [ ] Старые приглашения (текст без URL) → пациент вручную вводит код, как раньше
- [ ] Прямой URL `/patient-register` без `?code=` → пустое поле, ручной ввод
- [ ] OAuth callback redirect `?oauth_provider=...&phone=...` → продолжает работать, может комбинироваться с `?code=` (хотя сценарий маловероятен)
- [ ] Старые сгенерированные коды (выпущенные до этого PR) — продолжают работать в форме (формат не изменился)

---

## UX-bonus идеи (НЕ в этом PR — в backlog)

1. **QR-код** генерация для invite-link (для отправки через email-аттач или печать). Lucide-react имеет `<QrCode>` icon. Опционально в Wave 2.
2. **WhatsApp share button** (`wa.me/?text=...`) — есть пациенты которые предпочитают WhatsApp. Опционально.
3. **Email share** — `mailto:?subject=...&body=...` link. Опционально.
4. **Multi-language**: текст «Регистрация в Azarean Rehab» — пока только русский. Когда придёт i18n — расширить.

---

## Связано

- [memory/bug_invite_code_share_link.md](.claude/projects/c--Users-------Desktop-Azarean-rehab/memory/bug_invite_code_share_link.md) — обнаружение
- Phase 1 invite-code flow (CLAUDE.md, 2026-04-27) — оригинальная реализация
- `feedback_dont_assume_user_needs.md` — урок: не предполагать что юзер видит UI (Vadim кнопку Telegram пропустил)
