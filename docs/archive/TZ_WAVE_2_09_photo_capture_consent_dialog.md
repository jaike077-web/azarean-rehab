# TZ Wave 2.09 — Photo Capture + ConsentDialog (Frontend Tier 2 base)

## 1. Header

| Параметр | Значение |
|---|---|
| **Дата** | 2026-05-19 |
| **Базовая ветка** | `feature/wave-2-08-measurements-frontend-base` (commit `83b1d53`) |
| **Новая ветка** | `feature/wave-2-09-photo-capture` |
| **Цель** | Photo capture для ROM measurements + ConsentDialog modal для legal consent |
| **Объём** | ~12 jest tests, 1 новый компонент (ConsentDialog), modified MeasurementHistoryList + api.js |
| **Риск** | Medium — cross-cutting concern (consent flow), file upload, modal UX |

---

## 2. Verify-step

### A. Verify-step output в commit report (rule #15, для executor)

В commit report MD добавить:

1. **Grep existing diary photo flow** — meta-rule copy-existing:
   ```bash
   grep -rn "diary.*photo\|input.*type.*file\|FormData\|multipart" frontend/src/
   ```
   Output должен показать: где живёт diary photo upload (если есть), какой API export используется, какой component pattern.

2. **`psql \d patients`** — verify `photo_consent_at` column exists:
   ```sql
   \d patients
   ```
   Expected: `photo_consent_at | timestamp with time zone | nullable`

3. **`psql \d rom_measurements`** — verify `photo_url` column:
   ```sql
   \d rom_measurements
   ```
   Expected: `photo_url | text | nullable`

4. **Network DevTools snapshot** успешного flow:
   - `POST /api/patient-auth/photo-consent` → 200, response headers (включая `Set-Cookie` если есть refresh)
   - `POST /api/rehab/my/rom/:id/photo` → 200, multipart request headers
   - `GET /api/rehab/my/rom/:id/photo` → 200, Content-Type image/jpeg

### B. MEMORY_RULES.md compliance check (meta-rule TZ-COMPLIANCE, для architect)

| Rule | Section | Application в TZ 2.09 |
|---|---|---|
| **#25** (frontend conventions ⚠️ drift hotspot) | UI components | ConsentDialog в `components/` (NOT `screens/`). Никаких subdirs `components/measurements/`. |
| **#25** API namespacing | services/api.js | Flat exports: `rehab.postPhotoConsent`, `rehab.uploadRomPhoto`, `rehab.getRomPhotoUrl`. НЕ `rehab.photo.X`, НЕ `rehab.consent.X`. |
| **#25** context | imports | `import { useToast } from '../context/ToastContext'` (singular). |
| **#28** CSS hover specificity | ConsentDialog accept button | Если button имеет `--disabled` state — guard `:hover:not(:disabled):not(.--disabled)`. |
| **#29** z-index hierarchy | ConsentDialog + photo viewer modal | Оба modals: `z-index: 9000` (Toast 10000 остаётся поверх). |
| **Meta-rule copy-existing** | photo upload pattern | Verify-step A.1 grep — копировать diary photo flow если он есть. НЕ изобретать новый pattern. |
| **#22** photo storage | backend paths | Mount paths fixed из 2.07: `/api/patient-auth/photo-consent` + `/api/rehab/my/rom/:id/photo`. |
| **#15** verify-step output | commit report | Раздел A выше — обязательно в commit report MD. |
| **Rule #21** (architect) | этот TZ | Verify-step compliance check = sign that rules были sweep'нуты, не угаданы. |

**Architect statement:** TZ написан с явным sweep против MEMORY_RULES.md. Drift hotspot #25 (components/ + flat exports) — applied в section 8.

---

## 3. Зависимости

- Commit `83b1d53` (2.08) — `MeasurementHistoryList` существует, в неё интегрируем photo controls
- Commit `d55203c` (2.07) — backend endpoints готовы (`/api/patient-auth/photo-consent` + `POST/GET /api/rehab/my/rom/:id/photo`)
- Commit `c33cac8` (2.06) — `rom_measurements.photo_url` column существует, nullable
- Existing **diary photo flow** в репо (если есть — verify через grep) как pattern reference

---

## 4. Что блокирует / не блокирует

**Блокирует:**
- TZ 2.10 (Tier 2 markup canvas — optional Wave 3, может быть пропущен)

**НЕ блокирует:**
- Backend changes (frontend-only TZ)
- ExerciseRunner v4 (LOCKED — rule #8 в memory)
- Other PatientDashboard screens

---

## 5. ❌ НЕ создавать / ❌ НЕ трогать

- ❌ НЕ создавать `components/measurements/` subdir — все в `components/` flat
- ❌ НЕ создавать nested API namespace `rehab.photo.X` или `rehab.consent.X`
- ❌ НЕ изобретать новый photo upload pattern если diary photo flow существует в репо
- ❌ НЕ модифицировать ExerciseRunner v4
- ❌ НЕ менять backend (endpoints/middleware/DB) — фронтенд only
- ❌ НЕ использовать emoji — только `lucide-react` icons (Camera, Image, X, Check, etc.)
- ❌ НЕ использовать localStorage/sessionStorage для photo_consent state — refresh через patient context
- ❌ НЕ ставить `z-index: 10000+` для modals — Toast зарезервирован
- ❌ НЕ trigger ConsentDialog для users у которых `photo_consent_at !== null` — bypass прямо в file picker

---

## 6. ✅ Переиспользуем

- **DiaryScreen photo flow** (если есть в репо после grep) — pattern reference (component layout, multipart FormData, error handling)
- **`patientApi`** structure — flat exports `rehab.X`
- **`ToastContext`** — `useToast()` для feedback
- **`MeasurementHistoryList.js`** — место интеграции photo controls
- **`lucide-react`** icons:
  - `Camera` — "Добавить фото" button
  - `Image` — thumbnail placeholder/indicator
  - `X` — close modal
  - `Check` — accept consent
- **`requireSameOrigin` middleware** — backend уже применяет, ничего frontend-side не нужно кроме credentials: 'include' (если diary photo использует — копировать pattern)

---

## 7. Реализация (с STOP checkpoints)

### Checkpoint 1 — API layer

Добавить в `services/api.js`:

```js
// rehab.X flat exports (per rule #25)
rehab.postPhotoConsent = async () => {
  return api.post('/api/patient-auth/photo-consent');
  // Returns { data: { photo_consent_at: '2026-05-19T...' } }
};

rehab.uploadRomPhoto = async (romId, file) => {
  const formData = new FormData();
  formData.append('photo', file);
  return api.post(`/api/rehab/my/rom/${romId}/photo`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });
  // Returns { data: { photo_url: '/api/rehab/my/rom/:id/photo' } }
};

rehab.getRomPhotoUrl = (romId) => {
  // Returns URL for <img src=...>, backend streams JPEG with JWT cookie auth
  return `${API_BASE}/api/rehab/my/rom/${romId}/photo`;
};
```

**STOP 1:** verify через grep что paths существующих diary equivalents (если есть `rehab.uploadDiaryPhoto` или similar). Если pattern существует — копировать его form (function signature, error handling). Если нет — этот pattern становится reference для будущих uploads.

---

### Checkpoint 2 — ConsentDialog component

Create `frontend/src/components/ConsentDialog.js`:

```jsx
import React, { useState } from 'react';
import { X, Check } from 'lucide-react';
import { rehab } from '../services/api';
import { useToast } from '../context/ToastContext';
import './ConsentDialog.css';

export default function ConsentDialog({ open, onConsent, onCancel }) {
  const [checked, setChecked] = useState(false);
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  if (!open) return null;

  const handleAccept = async () => {
    if (!checked) return;
    setLoading(true);
    try {
      const res = await rehab.postPhotoConsent();
      const consentAt = res.data?.photo_consent_at;
      toast.success('Согласие получено');
      onConsent(consentAt);
    } catch (e) {
      toast.error('Не удалось сохранить согласие');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="pd-consent-overlay" role="dialog" aria-modal="true">
      <div className="pd-consent-modal">
        <button className="pd-consent-close" onClick={onCancel} aria-label="Закрыть">
          <X size={20} />
        </button>
        <h2 className="pd-consent-title">Согласие на обработку фото</h2>
        <div className="pd-consent-text">
          <p>
            Вы загружаете фотографию для медицинского наблюдения за прогрессом реабилитации.
            Фото будут храниться в шифрованном виде на серверах в России (152-ФЗ).
            Доступ имеют только вы и ваш инструктор.
          </p>
          <p>
            Вы можете отозвать согласие в любой момент в настройках профиля.
          </p>
          <p className="pd-consent-text-note">
            <em>Заглушка legal-текст для v1. Финальная версия после consult'а юриста.</em>
          </p>
        </div>
        <label className="pd-consent-checkbox">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            disabled={loading}
          />
          <span>Я согласен(а) на обработку фотографий</span>
        </label>
        <div className="pd-consent-actions">
          <button className="pd-consent-cancel" onClick={onCancel} disabled={loading}>
            Отмена
          </button>
          <button
            className="pd-consent-accept"
            onClick={handleAccept}
            disabled={!checked || loading}
          >
            <Check size={18} />
            <span>{loading ? 'Сохранение...' : 'Принять'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
```

**CSS (`ConsentDialog.css`)** — z-index 9000 (rule #29), hover guards (rule #28):

```css
.pd-consent-overlay {
  position: fixed; inset: 0;
  background: rgba(10, 14, 26, 0.6);
  z-index: 9000;
  display: flex; align-items: center; justify-content: center;
  padding: 16px;
}

.pd-consent-modal {
  background: var(--color-surface-2);
  border-radius: 12px;
  max-width: 480px; width: 100%;
  padding: 24px;
  position: relative;
}

/* Rule #28: hover guard для accept button */
.pd-consent-accept:hover:not(:disabled):not(.--loading) {
  background: var(--color-primary-hover);
}

.pd-consent-accept:disabled {
  opacity: 0.5; cursor: not-allowed;
}

/* ... остальные стили */
```

**STOP 2:** standalone smoke в isolated test render — verify modal появляется/исчезает, checkbox state управляет button disabled, accept call'ит API.

---

### Checkpoint 3 — Photo capture integration в MeasurementHistoryList

Modify `components/MeasurementHistoryList.js`:

1. Import `ConsentDialog`, `Camera`, `Image` icons, `useState`, `usePatientAuth` (для consent state)

2. Add state:
   ```js
   const [consentDialogOpen, setConsentDialogOpen] = useState(false);
   const [pendingRomId, setPendingRomId] = useState(null);
   const fileInputRef = useRef(null);
   const { patient, refresh } = usePatientAuth();
   ```

3. Add photo capture handler:
   ```js
   const handleAddPhoto = (romId) => {
     if (!patient.photo_consent_at) {
       setPendingRomId(romId);
       setConsentDialogOpen(true);
     } else {
       triggerFilePicker(romId);
     }
   };

   const handleConsent = async (consentAt) => {
     setConsentDialogOpen(false);
     await refresh(); // обновляет patient.photo_consent_at в context
     if (pendingRomId) {
       triggerFilePicker(pendingRomId);
       setPendingRomId(null);
     }
   };

   const triggerFilePicker = (romId) => {
     fileInputRef.current.dataset.romId = romId;
     fileInputRef.current.click();
   };

   const handleFileSelected = async (e) => {
     const file = e.target.files[0];
     const romId = parseInt(e.target.dataset.romId, 10);
     if (!file || !romId) return;
     try {
       const res = await rehab.uploadRomPhoto(romId, file);
       toast.success('Фото загружено');
       onReload(); // refresh history list
     } catch (err) {
       toast.error('Не удалось загрузить фото');
     } finally {
       e.target.value = ''; // reset
     }
   };
   ```

4. Render conditional UI per entry:
   ```jsx
   {entry.measurement_type === 'rom' && (
     entry.photo_url ? (
       <button
         className="pd-photo-thumb"
         onClick={() => setViewingPhotoRomId(entry.id)}
         aria-label="Открыть фото"
       >
         <Image size={20} />
       </button>
     ) : (
       <button
         className="pd-add-photo"
         onClick={() => handleAddPhoto(entry.id)}
       >
         <Camera size={18} />
         <span>Добавить фото</span>
       </button>
     )
   )}
   ```

5. Add hidden file input + ConsentDialog + PhotoViewer modal at bottom:
   ```jsx
   <input
     ref={fileInputRef}
     type="file"
     accept="image/*"
     style={{ display: 'none' }}
     onChange={handleFileSelected}
   />
   <ConsentDialog
     open={consentDialogOpen}
     onConsent={handleConsent}
     onCancel={() => { setConsentDialogOpen(false); setPendingRomId(null); }}
   />
   {viewingPhotoRomId && (
     <PhotoViewerModal
       romId={viewingPhotoRomId}
       onClose={() => setViewingPhotoRomId(null)}
     />
   )}
   ```

**STOP 3:** integration test — render history с mixed entries (один с `photo_url`, один без), verify button rendering + click flow.

---

### Checkpoint 4 — PhotoViewerModal (inline component или отдельный файл)

Можно inline в MeasurementHistoryList.js (мелкий компонент) или вынести в `components/PhotoViewerModal.js`. Architect рекомендует вынести — потенциально reusable для diary photos в будущем.

```jsx
function PhotoViewerModal({ romId, onClose }) {
  const url = rehab.getRomPhotoUrl(romId);
  return (
    <div className="pd-photo-viewer-overlay" onClick={onClose}>
      <button className="pd-photo-viewer-close" onClick={onClose} aria-label="Закрыть">
        <X size={24} />
      </button>
      <img
        src={url}
        alt="Замер"
        className="pd-photo-viewer-img"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}
```

**CSS** — z-index 9000, click-outside-to-close:

```css
.pd-photo-viewer-overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.85);
  z-index: 9000;
  display: flex; align-items: center; justify-content: center;
  padding: 16px;
}

.pd-photo-viewer-img {
  max-width: 100%; max-height: 90vh;
  object-fit: contain;
}
```

**STOP 4:** thumbnail click → modal open, click overlay → close, click image → no close (stopPropagation), close button → close.

---

## 8. Tests (~12)

`__tests__/ConsentDialog.test.js` (~6 tests):

1. Renders legal text + checkbox + accept button when `open=true`
2. Returns null when `open=false`
3. Accept button disabled when checkbox unchecked
4. Accept button enabled when checkbox checked
5. Click accept calls `rehab.postPhotoConsent` + `onConsent(consentAt)` + toast.success
6. Click cancel calls `onCancel` без API call

`__tests__/MeasurementHistoryList.test.js` (additions ~6):

1. Renders "Добавить фото" button для ROM entry с `photo_url === null`
2. Renders thumbnail button для ROM entry с `photo_url !== null`
3. Не renders photo controls для girth entries (`measurement_type === 'girth'`)
4. Click "Добавить фото" с `patient.photo_consent_at === null` → opens ConsentDialog (не trigger file picker)
5. Click "Добавить фото" с existing consent → triggers file picker напрямую (no dialog)
6. Bilateral pair (same session_id): только L имеет photo_url, R показывает кнопку "Добавить фото" (photos independent per measurement, не shared в paire)

---

## 9. NOT TOUCH (LOCKED zones + adjacent)

- ❌ `ExerciseRunner v4` (rule #8 memory — LOCKED)
- ❌ `pd-*` global CSS files без direct task — rule #20
- ❌ `services/api.js` axios interceptor — rule #11 (response unwrap pattern)
- ❌ Backend endpoints (`routes/patientAuth.js`, `routes/rehab.js`) — frontend-only TZ
- ❌ Migration files — schema готова
- ❌ `PatientAuthProvider` core logic — только используем `refresh()` метод
- ❌ Existing diary photo flow (если есть) — read-only reference

---

## 10. Smoke (4 cards для Vadim локально)

### Card 1 — First-time user, cancel consent

| Шаг | Действие | Ожидание |
|---|---|---|
| 1 | Открыть Замеры tab, в истории найти ROM entry без фото | Видна кнопка "Добавить фото" |
| 2 | Click "Добавить фото" | ConsentDialog открылся |
| 3 | Click "Отмена" | Dialog закрылся, file picker НЕ открылся |
| 4 | Network DevTools | НЕТ запросов к `/api/patient-auth/photo-consent` |

### Card 2 — First-time user, accept + upload

| Шаг | Действие | Ожидание |
|---|---|---|
| 1 | ROM entry без фото → Click "Добавить фото" | ConsentDialog открылся |
| 2 | Check checkbox + Click "Принять" | Network: POST `/api/patient-auth/photo-consent` → 200. Toast "Согласие получено". File picker открылся |
| 3 | Select JPEG (~1MB) | Network: POST `/api/rehab/my/rom/:id/photo` multipart → 200. Toast "Фото загружено" |
| 4 | History refresh | Запись теперь показывает thumbnail button (Image icon) вместо "Добавить фото" |

### Card 3 — Returning user (consent exists), direct upload

| Шаг | Действие | Ожидание |
|---|---|---|
| 1 | Другой ROM entry без фото → Click "Добавить фото" | ConsentDialog НЕ открывается. File picker открылся напрямую |
| 2 | Select JPEG | POST photo → 200. Toast success. Thumbnail появился |

### Card 4 — View existing photo

| Шаг | Действие | Ожидание |
|---|---|---|
| 1 | ROM entry с photo_url → Click thumbnail | Modal открылся, картинка загружается (GET `/api/rehab/my/rom/:id/photo` → 200, image/jpeg) |
| 2 | Click рядом с картинкой (overlay) | Modal закрылся |
| 3 | Снова открыть, click на саму картинку | Modal НЕ закрылся (stopPropagation) |
| 4 | Click X button | Modal закрылся |

---

## 11. Файлы checklist

**Создать:**
- `frontend/src/components/ConsentDialog.js`
- `frontend/src/components/ConsentDialog.css`
- `frontend/src/components/PhotoViewerModal.js` (если выделять)
- `frontend/src/components/PhotoViewerModal.css` (если выделять)
- `frontend/src/__tests__/ConsentDialog.test.js`

**Изменить:**
- `frontend/src/services/api.js` — добавить 3 flat exports (`rehab.postPhotoConsent`, `rehab.uploadRomPhoto`, `rehab.getRomPhotoUrl`)
- `frontend/src/components/MeasurementHistoryList.js` — photo capture integration
- `frontend/src/components/MeasurementHistoryList.css` — стили для add-photo / thumb buttons (с rule #28 hover guards)
- `frontend/src/__tests__/MeasurementHistoryList.test.js` — +6 tests

**НЕ трогать:**
- Backend (любой файл в `backend/`)
- Migrations
- ExerciseRunner files
- Other screens (HomeScreen, DiaryScreen, etc.)
- `pd-*` global tokens.css

---

## 12. Текст коммита

```
TZ 2.09: photo capture + ConsentDialog для ROM measurements

- ConsentDialog modal с legal placeholder text + checkbox + accept flow
- MeasurementHistoryList integration: "Добавить фото" button для photo_url=null ROM entries
- Consent gate: ConsentDialog при photo_consent_at=null, иначе file picker напрямую
- PhotoViewerModal для full-size view (click thumbnail → modal)
- API: rehab.postPhotoConsent + rehab.uploadRomPhoto + rehab.getRomPhotoUrl (flat exports)
- Mount paths: /api/patient-auth/photo-consent + /api/rehab/my/rom/:id/photo
- CSS: z-index 9000 для obоих modals (rule #29), hover guards (rule #28)
- 12 tests добавлено

Compliance check applied: MEMORY_RULES.md rules #15, #22, #25, #28, #29 + meta-rule
copy-existing (verify-step grep diary photo flow) + meta-rule TZ-COMPLIANCE.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

## 13. Definition of Done

- [ ] 4 checkpoint'а пройдены (API → ConsentDialog → integration → PhotoViewer)
- [ ] ~12 jest tests passing (6 ConsentDialog + 6 MeasurementHistoryList additions)
- [ ] Verify-step output в commit report MD:
  - [ ] Grep diary photo flow paths (meta-rule copy-existing)
  - [ ] `psql \d patients` — `photo_consent_at` column verified
  - [ ] `psql \d rom_measurements` — `photo_url` column verified
  - [ ] Network DevTools snapshot успешного POST/GET photo
- [ ] No drift on rule #25 (components/ flat, `rehab.X` flat exports)
- [ ] CSS hover guard (rule #28) для accept/cancel buttons
- [ ] z-index 9000 (rule #29) для ConsentDialog + PhotoViewerModal
- [ ] No emoji (lucide-react only — rule #14)
- [ ] Smoke 4 cards passing локально (Vadim runs)
- [ ] Commit message с Co-Authored-By trailer
- [ ] Branch ⏸ frozen (NOT pushed, NOT merged)

---

## 14. После TZ 2.09

**TZ 2.10** (optional Wave 3) — Tier 2 markup:
- Canvas overlay на photo для AI-assisted ROM markup (manual lines drawing → degree calculation)
- Reference photos display (instructor-set baseline)
- MediaPipe opt-in для auto-markup (Block D consent flag — отдельный от photo consent)

**Альтернатива** — пропустить 2.10, переходить к Wave 2 closure:
1. Vadim проверяет smoke по всем 14 PR последовательно на dev
2. Merge PR #67 (dark theme) в main если ещё не
3. Batch merge всех Wave 2 PR в строгом порядке (af313b4 → ... → 2.09 commit)
4. Деплой на VDS 185.93.109.234 (nginx reconfig для `rehab.azarean.ru`)
5. Wave 3 planning

Решение по 2.10 vs closure — после execution 2.09 и pilot feedback по Tier 1 UX.

---

*Generated by Claude Opus 4.7 — architect session 2026-05-19 post-2.08.*
*First TZ под применением meta-rule TZ-COMPLIANCE (section 2.B).*
