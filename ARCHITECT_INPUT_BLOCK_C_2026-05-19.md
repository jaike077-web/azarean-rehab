# Input от Vadim'а для Block C (2.06 + 2.07 batch) — 2026-05-19

**После HF#9 v2 закрытия Block B.** Архитектор пишет TZ 2.06+2.07 на основе этих decisions.

---

## Storage decisions

| # | Вопрос | Решение |
|---|---|---|
| **1** | Хранилище фото rom_measurements / pain photos | **A — local disk на VDS** (`/var/www/azarean/uploads/` или эквивалент в `/opt/azarean-rehab/uploads`). Просто, бесплатно, бэкап ручной через pg_dump + filesystem snapshot. S3 (NetAngels / Yandex Object Storage) — backlog Wave 3, когда объём фото станет значимым. |
| **2** | Compression при upload | **Да** — sharp resize до 1200px max (стандарт для clinical photos, видны детали достаточно) + JPEG quality 80. Original raw НЕ сохраняем (privacy + space). Pattern уже используется для diary_photos через `multer + sharp` (см. `backend/middleware/upload.js`). |
| **3** | Использование пациентских фото для AI ROM (Block D Tier 3 MediaPipe) | **Да, можно** — с **явным consent UI**. Пациент при первой загрузке фото видит модалку: «Это фото может быть использовано для автоматического измерения угла. Согласны?» Чекбокс + дата сохраняются в `patients.photo_consent_at` + `photo_consent_version` (колонки уже добавлены в 2.01 schema). Без consent — фото только для просмотра куратору, AI не trigger'ит. |

---

## Architect notes для TZ 2.06

- `backend/middleware/upload.js` уже имеет `diaryPhotoUpload + processDiaryPhoto` pattern (multer + sharp resize fit:inside 1200×1200, JPEG q82, метаданные в `diary_photos` таблице). **Переиспользовать** этот pattern — не плодить параллельную инфраструктуру. Создать `measurementPhotoUpload + processMeasurementPhoto` (либо обобщить existing).
- Path хранения: предложение `/uploads/measurements/{patient_id}/{measurement_id}_{type}.jpg` (organized by patient для bilateral comparison flow).
- Endpoint download: `GET /api/rehab/my/measurements/{id}/photos/{photo_id}` с JWT auth (по analogii с `/api/rehab/my/diary/:entry_id/photos/:photo_id`).
- Patient `photo_consent_at` проверять на upload — если null **и** AI flag в payload → потребовать consent через 400 response с code `CONSENT_REQUIRED`.
- Privacy в Telegram alert: фото колена не PHI strict, но в alert body передавать **только URL под auth**, не embedded photo (иначе в Telegram cloud копия). Pattern уже принят для diary photos.

---

## REACT_APP_CURATOR_PHONE

Vadim положил `+79091111188` в `frontend/.env` (.gitignored) — это его реальный номер для smoke сценария B (dedup banner на проде эту переменную нужно будет положить через deploy/setup script).

---

## Browser smoke 2.05 + HF#9

Vadim **сейчас** будет проходить 5 сценариев из `SESSION_HANDOFF_2026-05-19.md`. Результат (особенно по сценариям A — Telegram multi-character, B — dedup banner, C — UPSERT pre-load multi) — пришлёт отдельно. Block C TZ архитектор может **писать параллельно** — smoke не блокер для TZ написания, только для merge'а.

---

## Готовность к Block C

✅ Storage decisions получены
✅ Curator phone положен в dev .env
⏸ Browser smoke в процессе (не блокер TZ)
✅ pg_dump backup сохранён, БД в clean состоянии после HF#9 v2
✅ 8 PR ⏸ stack stable, ничего не дрифтит

**Архитектор — поехали. Жду TZ 2.06 + 2.07 батчем.**
