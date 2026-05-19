// =====================================================
// Wave 2 коммит 2.05 — pain constants (зеркало backend CHECK enum'ов)
// =====================================================
// ВАЖНО: эти whitelist'ы синхронизированы с CHECK constraint'ами миграции
// 20260516_wave2_schema. Если backend изменит enum — здесь тоже обновить.
// Сверено verify-step 2026-05-18.
// =====================================================

// pain_entries.trigger_type CHECK — 8 значений
export const TRIGGER_TYPE_OPTIONS = [
  { value: 'at_rest', label: 'В покое' },
  { value: 'on_flexion', label: 'При сгибании' },
  { value: 'on_extension', label: 'При разгибании' },
  { value: 'on_walking', label: 'При ходьбе' },
  { value: 'at_night', label: 'Ночью' },
  { value: 'after_exercise', label: 'После упражнений' },
  { value: 'on_lifting', label: 'При подъёме тяжестей' },
  { value: 'other', label: 'Другое' },
];

// pain_entries.pain_character CHECK — 6 значений (не 8 как в TZ v1; verify-step
// показал реальный enum из миграции)
export const PAIN_CHARACTER_OPTIONS = [
  { value: 'aching', label: 'Ноющая' },
  { value: 'sharp', label: 'Острая' },
  { value: 'burning', label: 'Жгучая' },
  { value: 'shooting', label: 'Простреливающая' },
  { value: 'throbbing', label: 'Пульсирующая' },
  { value: 'other', label: 'Другая' },
];

export const VAS_MIN = 0;
export const VAS_MAX = 10;
export const NOTES_MAX_LEN = 1000;
export const MAX_LOCATIONS_PER_ENTRY = 16;
export const PHOTO_MAX_SIZE_MB = 5;

// Номер куратора для banner'а recent red-flag. Положи в frontend/.env как
// REACT_APP_CURATOR_PHONE=+7900XXXXXXX. Пустой → tel: ссылка пустая.
export const CURATOR_PHONE = process.env.REACT_APP_CURATOR_PHONE || '';
