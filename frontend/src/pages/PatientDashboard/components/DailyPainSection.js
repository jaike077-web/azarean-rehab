// =====================================================
// Wave 2 #2.05 — DailyPainSection
// Структурированная pain секция для DiaryScreen. Pre-load existing today
// запись (UX option C) с UPSERT через backend `POST /my/pain/daily`.
// Banner «Сегодняшняя запись от HH:MM» если запись уже есть — кнопка
// «Обновить» вместо «Сохранить».
//
// ВНИМАНИЕ: эта секция — про structured pain_entries (новая таблица из 2.01).
// В DiaryScreen.js уже есть существующий pain slider для diary_entries —
// это РАЗНЫЕ данные (subjective feeling vs structured локализация).
// Размещается рядом, не заменяет existing.
// =====================================================

import React, { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import { Check, Edit3 } from 'lucide-react';
import LocationsMultiSelect from './LocationsMultiSelect';
import TriggerSelect from './TriggerSelect';
import PainCharacterSelect from './PainCharacterSelect';
import { PainScale } from './ui';
import { rehab } from '../../../services/api';
import { useToast } from '../../../context/ToastContext';
import { NOTES_MAX_LEN } from '../constants/pain';

const EMPTY_FORM = {
  vas_score: null,
  location_codes: [],
  trigger_type: '',
  pain_character: [], // HF#9 v2: array (multi-select)
  notes: '',
};

function formatTime(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export default function DailyPainSection({ onSaved }) {
  const [locations, setLocations] = useState([]);
  const [existing, setExisting] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();

  useEffect(() => {
    let cancelled = false;
    // Defensive — если api helper отсутствует (например, partial mock в тестах),
    // gracefully render пустое состояние вместо crash'а.
    if (typeof rehab.getPainLocations !== 'function') return undefined;
    rehab.getPainLocations()
      .then((res) => { if (!cancelled) setLocations(res.data || []); })
      .catch(() => { /* silent */ });
    if (typeof rehab.getDailyPainToday !== 'function') return () => { cancelled = true; };
    rehab.getDailyPainToday()
      .then((res) => {
        if (cancelled) return;
        const today = (res.data || [])[0];
        // pre-load если запись за сегодня уже есть (UX option C)
        if (today) {
          const todayDate = new Date().toISOString().slice(0, 10);
          const entryDate = String(today.entry_date || '').slice(0, 10);
          if (entryDate === todayDate) {
            setExisting(today);
            setForm({
              vas_score: today.vas_score,
              location_codes: (today.locations || []).map((l) => l.code),
              trigger_type: today.trigger_type || '',
              // HF#9 v2: pain_character — array; backend возвращает массив или null
              pain_character: Array.isArray(today.pain_character) ? today.pain_character : [],
              notes: today.notes || '',
            });
          }
        }
      })
      .catch(() => { /* silent */ });
    return () => { cancelled = true; };
  }, []);

  const handleSubmit = useCallback(async () => {
    if (form.vas_score == null) {
      toast.error('Укажите уровень боли');
      return;
    }
    if (form.notes.length > NOTES_MAX_LEN) {
      toast.error(`Заметка ≤ ${NOTES_MAX_LEN} символов`);
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        vas_score: form.vas_score,
        location_codes: form.location_codes.length ? form.location_codes : undefined,
        trigger_type: form.trigger_type || undefined,
        // HF#9 v2: empty array → undefined (backend reject'нул бы empty[])
        pain_character: form.pain_character.length > 0 ? form.pain_character : undefined,
        notes: form.notes || undefined,
      };
      const res = await rehab.createDailyPain(payload);
      const saved = res.data || {};
      setExisting(saved);
      toast.success(existing ? 'Сегодняшняя запись обновлена' : 'Запись сохранена');
      if (typeof onSaved === 'function') onSaved(saved);
    } catch (err) {
      const msg = err?.response?.data?.message || 'Не удалось сохранить';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }, [form, existing, onSaved, toast]);

  return (
    <section className="pd-daily-pain">
      <h3 className="pd-daily-pain__heading">Где болит сегодня</h3>

      {existing && (
        <div className="pd-daily-pain__existing-banner" role="status">
          <Edit3 size={14} aria-hidden="true" />
          <span>
            Сегодняшняя запись от {formatTime(existing.created_at)} — обновите, если изменилось
          </span>
        </div>
      )}

      <div className="pd-daily-pain__form">
        <div className="pd-pain-event-form__group">
          <label className="pd-pain-event-form__label">Боль по локализациям (0–10)</label>
          <PainScale
            value={form.vas_score}
            onChange={(v) => setForm({ ...form, vas_score: v })}
          />
        </div>

        <div className="pd-pain-event-form__group">
          <label className="pd-pain-event-form__label">Где болит?</label>
          <LocationsMultiSelect
            locations={locations}
            value={form.location_codes}
            onChange={(codes) => setForm({ ...form, location_codes: codes })}
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
          <label className="pd-pain-event-form__label" htmlFor="daily-pain-notes">
            Заметка (опционально)
          </label>
          <textarea
            id="daily-pain-notes"
            className="pd-pain-event-form__textarea"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            maxLength={NOTES_MAX_LEN}
            rows={2}
            placeholder="Опишите подробнее (опционально)"
          />
        </div>

        <div className="pd-daily-pain__actions">
          <button
            type="button"
            className="pd-pain-btn pd-pain-btn--primary"
            onClick={handleSubmit}
            disabled={submitting}
          >
            <Check size={16} />
            {submitting ? 'Сохранение…' : existing ? 'Обновить' : 'Сохранить'}
          </button>
        </div>
      </div>
    </section>
  );
}

DailyPainSection.propTypes = {
  onSaved: PropTypes.func,
};
