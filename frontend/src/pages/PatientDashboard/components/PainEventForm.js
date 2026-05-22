// =====================================================
// Wave 2 #2.05 — PainEventForm
// Modal для записи срочного pain event (is_event=true). Открывается из
// HomeScreen footer link (UX option 2B). Включает:
//   - RecentRedFlagBanner если за последний час был red-flag
//   - PainScale (DVPRS) — обязательный
//   - LocationsMultiSelect (chips, red-flag индикация) — обязательны ≥1
//   - TriggerSelect single-select — опциональный
//   - PainCharacterSelect multi-select (HF#9 v2) — опциональный
//   - notes textarea — опциональная
//   - photo upload (camera+gallery через accept="image/*")
//
// При submit: createPainEvent → toast c учётом dedup state +
// red-flag → real Telegram alert (через utils/opsAlert.js).
// =====================================================

import React, { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import { Camera, Send } from 'lucide-react';
import PatientModal from './PatientModal';
import LocationsMultiSelect from './LocationsMultiSelect';
import TriggerSelect from './TriggerSelect';
import PainCharacterSelect from './PainCharacterSelect';
import RecentRedFlagBanner from './RecentRedFlagBanner';
import { PainScale } from './ui';
import { rehab } from '../../../services/api';
import { useToast } from '../../../context/ToastContext';
import { NOTES_MAX_LEN, MAX_LOCATIONS_PER_ENTRY, PHOTO_MAX_SIZE_MB } from '../constants/pain';

const EMPTY_FORM = {
  vas_score: null,
  location_codes: [],
  trigger_type: '',
  pain_character: [], // HF#9 v2: array (multi-select)
  notes: '',
  photo_file: null,
};

export default function PainEventForm({ isOpen, onClose, onSubmitted }) {
  const [locations, setLocations] = useState([]);
  const [recentAlerts, setRecentAlerts] = useState({ count: 0, lastAt: null });
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();

  // На open подгружаем локации + recent alerts. На close сбрасываем форму.
  useEffect(() => {
    if (!isOpen) {
      setForm(EMPTY_FORM);
      setErrors({});
      return undefined;
    }
    let cancelled = false;
    if (typeof rehab.getPainLocations === 'function') {
      rehab.getPainLocations()
        .then((res) => { if (!cancelled) setLocations(res.data || []); })
        .catch(() => { if (!cancelled) toast.error('Не удалось загрузить локации'); });
    }
    if (typeof rehab.getRecentRedFlagAlerts === 'function') {
      rehab.getRecentRedFlagAlerts(1)
        .then((res) => {
          if (cancelled) return;
          const arr = res.data || [];
          setRecentAlerts({ count: arr.length, lastAt: arr[0]?.created_at || null });
        })
        .catch(() => { /* silent — не блокер */ });
    }
    return () => { cancelled = true; };
    // toast — stable API singleton (через useMemo в ToastProvider), не включаем
    // в deps чтобы избежать infinite loop в тестах где mock возвращает новый
    // объект на каждый useToast() call. См. memory/bug_toast_context_remount.md.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const validate = useCallback(() => {
    const e = {};
    if (form.vas_score == null) e.vas_score = 'Укажите уровень боли';
    if (!form.location_codes.length) e.location_codes = 'Укажите хотя бы одну локацию';
    if (form.location_codes.length > MAX_LOCATIONS_PER_ENTRY) {
      e.location_codes = `Не больше ${MAX_LOCATIONS_PER_ENTRY} локаций`;
    }
    if (form.notes.length > NOTES_MAX_LEN) e.notes = `≤ ${NOTES_MAX_LEN} символов`;
    setErrors(e);
    return Object.keys(e).length === 0;
  }, [form]);

  const handleSubmit = async () => {
    if (!validate()) return;
    setSubmitting(true);
    try {
      // Photo upload — пока MVP. Backend pain_entries.photo_url принимает строку,
      // upload infrastructure появится в 2.06 (полноценный multer endpoint).
      // Если есть file — кладём имя файла в notes (placeholder) либо пропускаем.
      // TODO 2.06: photo_url = await uploadPainPhoto(form.photo_file)
      const payload = {
        vas_score: form.vas_score,
        location_codes: form.location_codes,
        trigger_type: form.trigger_type || undefined,
        // HF#9 v2: pain_character — array; empty → undefined (backend ожидает null/отсутствие)
        pain_character: form.pain_character.length > 0 ? form.pain_character : undefined,
        notes: form.notes || undefined,
        // photo_url: пока пропускаем — добавим в 2.06
      };
      const res = await rehab.createPainEvent(payload);
      const data = res.data || {};
      const isRedFlag = !!data.ops_alert_id;
      const dedupActive = recentAlerts.count > 0;

      if (isRedFlag && dedupActive) {
        toast.success('Запись о боли сохранена. Куратор уже был уведомлён за последний час.');
      } else if (isRedFlag) {
        toast.success('Запись о боли сохранена. Куратор получит срочное уведомление.');
      } else {
        toast.success('Запись о боли сохранена');
      }

      if (typeof onSubmitted === 'function') onSubmitted(data);
      onClose();
    } catch (err) {
      const msg = err?.response?.data?.message || 'Не удалось сохранить запись';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handlePhotoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > PHOTO_MAX_SIZE_MB * 1024 * 1024) {
      toast.error(`Фото больше ${PHOTO_MAX_SIZE_MB} МБ`);
      e.target.value = '';
      return;
    }
    setForm({ ...form, photo_file: file });
  };

  return (
    <PatientModal isOpen={isOpen} onClose={onClose} title="Срочная боль">
      <RecentRedFlagBanner
        recentAlertsCount={recentAlerts.count}
        lastAlertAt={recentAlerts.lastAt}
      />

      <div className="pd-pain-event-form">
        <div className="pd-pain-event-form__group">
          <label className="pd-pain-event-form__label">
            Уровень боли (0–10) <span className="pd-pain-required">*</span>
          </label>
          <PainScale
            value={form.vas_score}
            onChange={(v) => setForm({ ...form, vas_score: v })}
          />
          {errors.vas_score && <div className="pd-pain-error">{errors.vas_score}</div>}
        </div>

        <div className="pd-pain-event-form__group">
          <label className="pd-pain-event-form__label">
            Где болит? <span className="pd-pain-required">*</span>
          </label>
          <LocationsMultiSelect
            locations={locations}
            value={form.location_codes}
            onChange={(codes) => setForm({ ...form, location_codes: codes })}
            error={errors.location_codes}
          />
        </div>

        <TriggerSelect
          value={form.trigger_type}
          onChange={(v) => setForm({ ...form, trigger_type: v })}
        />

        <PainCharacterSelect
          value={form.pain_character}
          onChange={(v) => setForm({ ...form, pain_character: v })}
        />

        <div className="pd-pain-event-form__group">
          <label className="pd-pain-event-form__label" htmlFor="pain-notes">
            Заметка (опционально)
          </label>
          <textarea
            id="pain-notes"
            className="pd-pain-event-form__textarea"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            maxLength={NOTES_MAX_LEN}
            rows={3}
            placeholder="Опишите подробнее"
          />
          {errors.notes && <div className="pd-pain-error">{errors.notes}</div>}
        </div>

        <div className="pd-pain-event-form__group">
          <label className="pd-pain-event-form__label" htmlFor="pain-photo">
            <Camera size={16} /> Фото (опционально)
          </label>
          <input
            id="pain-photo"
            type="file"
            accept="image/*"
            onChange={handlePhotoChange}
            className="pd-pain-event-form__file"
          />
          {form.photo_file && (
            <div className="pd-pain-event-form__photo-name">{form.photo_file.name}</div>
          )}
          <div className="pd-pain-event-form__hint">
            До {PHOTO_MAX_SIZE_MB} МБ. Полноценная загрузка фото — в следующем обновлении.
          </div>
        </div>

        <div className="pd-pain-event-form__actions">
          <button
            type="button"
            className="pd-pain-btn pd-pain-btn--secondary"
            onClick={onClose}
            disabled={submitting}
          >
            Отмена
          </button>
          <button
            type="button"
            className="pd-pain-btn pd-pain-btn--primary"
            onClick={handleSubmit}
            disabled={submitting}
          >
            <Send size={16} />
            {submitting ? 'Сохранение…' : 'Отправить'}
          </button>
        </div>
      </div>
    </PatientModal>
  );
}

PainEventForm.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onSubmitted: PropTypes.func,
};
