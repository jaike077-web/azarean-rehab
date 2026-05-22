// =====================================================
// Wave 2 #2.08 — NumericInputForm
// =====================================================
// Tier 1 ввод measurement'а. State machine:
//   1. category: 'rom' | 'girth' — chip switcher
//   2. measurement_type — picker (8 ROM или 7 girth, Cyrillic labels)
//   3. bilateral toggle (default OFF)
//   4. side L/R (если !bilateral)
//   5. value: numeric (degrees/cm) или HBB ChipGroup (categorical)
//      — если bilateral=true → две input'ы (L + R)
//   6. notes
//   7. submit
//
// Bilateral submit: один Date.now() millis (BIGINT, memory #30 HF#11) для
// пары, два sequential POST'а. Half-pair при второй ошибке acceptable MVP.
//
// Frontend validation mirror backend: degrees 0..360, cm > 0 < 200,
// HBB whitelist. На invalid → toast.error без API call.
// =====================================================

import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { rehab } from '../../../services/api';
import { useToast } from '../../../context/ToastContext';
import { ChipGroup } from './ui';
import './NumericInputForm.css';

// Cyrillic labels — точный mapping из TZ 2.08, НЕ изобретать
export const ROM_TYPES = [
  { value: 'shoulder_forward_flexion_degrees', label: 'Плечо: сгибание вперёд', unit: '°', valueKind: 'degrees' },
  { value: 'shoulder_abduction_degrees',       label: 'Плечо: отведение', unit: '°', valueKind: 'degrees' },
  { value: 'shoulder_er_0_degrees',            label: 'Плечо: наружная ротация (0°)', unit: '°', valueKind: 'degrees' },
  { value: 'shoulder_ir_90_abd_degrees',       label: 'Плечо: внутренняя ротация (90° отв.)', unit: '°', valueKind: 'degrees' },
  { value: 'shoulder_hbb_categorical',         label: 'Плечо: рука за спину (HBB)', unit: '', valueKind: 'categorical' },
  { value: 'knee_flexion_degrees',             label: 'Колено: сгибание', unit: '°', valueKind: 'degrees' },
  { value: 'knee_extension_degrees',           label: 'Колено: разгибание', unit: '°', valueKind: 'degrees' },
  { value: 'knee_flexion_hbd_cm',              label: 'Колено: пятка до ягодицы', unit: 'см', valueKind: 'cm' },
];

export const GIRTH_TYPES = [
  { value: 'shoulder_mid_deltoid_cm',     label: 'Окружность плеча (ср. дельтовидная)', unit: 'см' },
  { value: 'shoulder_mid_biceps_cm',      label: 'Окружность плеча (ср. бицепс)', unit: 'см' },
  { value: 'knee_joint_line_cm',          label: 'Окружность колена (суставная линия)', unit: 'см' },
  { value: 'knee_suprapatellar_5cm_cm',   label: 'Окружность 5 см над надколенником', unit: 'см' },
  { value: 'knee_suprapatellar_10cm_cm',  label: 'Окружность 10 см над надколенником', unit: 'см' },
  { value: 'knee_suprapatellar_15cm_cm',  label: 'Окружность 15 см над надколенником', unit: 'см' },
  { value: 'knee_calf_max_cm',            label: 'Окружность икры (максимум)', unit: 'см' },
];

export const HBB_VERTEBRAE = [
  { value: 'T1', label: 'T1' }, { value: 'T2', label: 'T2' }, { value: 'T3', label: 'T3' },
  { value: 'T4', label: 'T4' }, { value: 'T5', label: 'T5' }, { value: 'T6', label: 'T6' },
  { value: 'T7', label: 'T7' }, { value: 'T8', label: 'T8' }, { value: 'T9', label: 'T9' },
  { value: 'T10', label: 'T10' }, { value: 'T11', label: 'T11' }, { value: 'T12', label: 'T12' },
  { value: 'L1', label: 'L1' }, { value: 'L2', label: 'L2' }, { value: 'L3', label: 'L3' },
  { value: 'L4', label: 'L4' }, { value: 'L5', label: 'L5' },
  { value: 'sacrum', label: 'Крестец' },
  { value: 'great_trochanter', label: 'Большой вертел' },
];

const CATEGORY_OPTIONS = [
  { value: 'rom', label: 'Подвижность (ROM)' },
  { value: 'girth', label: 'Окружность' },
];

const SIDE_OPTIONS = [
  { value: 'L', label: 'Левая' },
  { value: 'R', label: 'Правая' },
];

// Возвращает meta измерения (label, unit, valueKind) — null если type невалидный
function getTypeMeta(category, type) {
  const list = category === 'rom' ? ROM_TYPES : GIRTH_TYPES;
  return list.find((t) => t.value === type) || null;
}

// Frontend validation — mirror backend, fail fast
function validateValue(valueKind, raw) {
  if (valueKind === 'degrees') {
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0 || n > 360) {
      return 'Значение должно быть числом в диапазоне 0..360';
    }
    return null;
  }
  if (valueKind === 'cm') {
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0 || n >= 200) {
      return 'Значение должно быть числом > 0 и < 200';
    }
    return null;
  }
  if (valueKind === 'categorical') {
    if (typeof raw !== 'string' || !HBB_VERTEBRAE.some((v) => v.value === raw)) {
      return 'Выберите позвонок';
    }
    return null;
  }
  return 'Неизвестный тип значения';
}

const EMPTY_FORM = {
  category: 'rom',
  measurement_type: '',
  bilateral: false,
  side: 'L',
  value: '',     // single side value (numeric или HBB code)
  valueL: '',    // bilateral L
  valueR: '',    // bilateral R
  notes: '',
};

export default function NumericInputForm({ onSaved }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();

  const setField = (patch) => setForm((prev) => ({ ...prev, ...patch }));

  const handleCategoryChange = (next) => {
    if (!next) return;
    setField({ category: next, measurement_type: '', value: '', valueL: '', valueR: '' });
  };

  const handleTypeChange = (next) => {
    setField({ measurement_type: next || '', value: '', valueL: '', valueR: '' });
  };

  const handleReset = () => setForm(EMPTY_FORM);

  const meta = getTypeMeta(form.category, form.measurement_type);
  const typeOptions = form.category === 'rom' ? ROM_TYPES : GIRTH_TYPES;
  const isCategorical = meta?.valueKind === 'categorical';
  // Girth не имеет categorical — всегда cm. HBB только для shoulder_hbb_categorical (ROM).
  const valueKind = meta?.valueKind ?? (form.category === 'girth' ? 'cm' : null);

  async function submitOne(payload) {
    if (form.category === 'rom') return rehab.postRomMeasurement(payload);
    return rehab.postGirthMeasurement(payload);
  }

  async function handleSubmit(e) {
    if (e) e.preventDefault();
    if (!meta) {
      toast.error('Выберите тип замера');
      return;
    }

    if (form.notes && form.notes.length > 1000) {
      toast.error('Заметка должна быть ≤ 1000 символов');
      return;
    }

    if (form.bilateral) {
      const errL = validateValue(valueKind, form.valueL);
      const errR = validateValue(valueKind, form.valueR);
      if (errL) { toast.error(`Левая: ${errL}`); return; }
      if (errR) { toast.error(`Правая: ${errR}`); return; }

      // Один session_id для пары (HF#11 BIGINT millis)
      const sessionId = Date.now();
      const notesParam = form.notes || undefined;

      setSubmitting(true);
      try {
        const buildPayload = (sideVal, raw) => {
          if (form.category === 'rom') {
            return {
              measurement_type: form.measurement_type,
              side: sideVal,
              value: valueKind === 'categorical' ? raw : Number(raw),
              measurement_session_id: sessionId,
              notes: notesParam,
            };
          }
          return {
            measurement_type: form.measurement_type,
            side: sideVal,
            value_cm: Number(raw),
            measurement_session_id: sessionId,
            notes: notesParam,
          };
        };

        await submitOne(buildPayload('L', form.valueL));
        await submitOne(buildPayload('R', form.valueR));

        handleReset();
        if (typeof onSaved === 'function') onSaved();
      } catch (err) {
        // Half-pair acceptable для MVP — оставляем что прошло, юзер дозамерит
        const msg = err?.response?.data?.message || 'Не удалось сохранить';
        toast.error(msg);
      } finally {
        setSubmitting(false);
      }
      return;
    }

    // Single side
    if (!['L', 'R'].includes(form.side)) {
      toast.error('Выберите сторону (L или R)');
      return;
    }
    const valErr = validateValue(valueKind, form.value);
    if (valErr) { toast.error(valErr); return; }

    setSubmitting(true);
    try {
      let payload;
      if (form.category === 'rom') {
        payload = {
          measurement_type: form.measurement_type,
          side: form.side,
          value: valueKind === 'categorical' ? form.value : Number(form.value),
          notes: form.notes || undefined,
        };
      } else {
        payload = {
          measurement_type: form.measurement_type,
          side: form.side,
          value_cm: Number(form.value),
          notes: form.notes || undefined,
        };
      }
      await submitOne(payload);
      handleReset();
      if (typeof onSaved === 'function') onSaved();
    } catch (err) {
      const msg = err?.response?.data?.message || 'Не удалось сохранить';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  // Numeric input vs HBB picker для value поля
  const renderValueInput = (raw, onChangeFn) => {
    if (isCategorical) {
      return (
        <ChipGroup
          options={HBB_VERTEBRAE}
          selected={raw}
          onChange={(next) => onChangeFn(next || '')}
        />
      );
    }
    return (
      <div className="pd-num-input-wrap">
        <input
          type="number"
          className="pd-num-input"
          inputMode="decimal"
          step={valueKind === 'degrees' ? '1' : '0.1'}
          min="0"
          max={valueKind === 'degrees' ? '360' : '200'}
          value={raw}
          onChange={(e) => onChangeFn(e.target.value)}
        />
        {meta?.unit && <span className="pd-num-input-unit">{meta.unit}</span>}
      </div>
    );
  };

  return (
    <form className="pd-num-form" onSubmit={handleSubmit}>
      <div className="pd-num-form__group">
        <label className="pd-num-form__label">Тип замера</label>
        <ChipGroup
          options={CATEGORY_OPTIONS}
          selected={form.category}
          onChange={handleCategoryChange}
        />
      </div>

      <div className="pd-num-form__group">
        <label className="pd-num-form__label" htmlFor="measurement_type_select">
          Что замеряем
        </label>
        <select
          id="measurement_type_select"
          className="pd-num-form__select"
          value={form.measurement_type}
          onChange={(e) => handleTypeChange(e.target.value)}
        >
          <option value="">— выберите —</option>
          {typeOptions.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>

      {meta && (
        <>
          <div className="pd-num-form__group">
            <label className="pd-num-form__bilateral-toggle">
              <input
                type="checkbox"
                checked={form.bilateral}
                onChange={(e) => setField({ bilateral: e.target.checked, value: '', valueL: '', valueR: '' })}
              />
              <span>Замерить обе стороны (L + R)</span>
            </label>
          </div>

          {!form.bilateral && (
            <div className="pd-num-form__group">
              <label className="pd-num-form__label">Сторона</label>
              <ChipGroup
                options={SIDE_OPTIONS}
                selected={form.side}
                onChange={(next) => setField({ side: next || 'L' })}
              />
            </div>
          )}

          {form.bilateral ? (
            <>
              <div className="pd-num-form__group">
                <label className="pd-num-form__label">Значение (левая)</label>
                {renderValueInput(form.valueL, (next) => setField({ valueL: next }))}
              </div>
              <div className="pd-num-form__group">
                <label className="pd-num-form__label">Значение (правая)</label>
                {renderValueInput(form.valueR, (next) => setField({ valueR: next }))}
              </div>
            </>
          ) : (
            <div className="pd-num-form__group">
              <label className="pd-num-form__label">Значение</label>
              {renderValueInput(form.value, (next) => setField({ value: next }))}
            </div>
          )}

          <div className="pd-num-form__group">
            <label className="pd-num-form__label" htmlFor="measurement_notes">
              Заметка (опционально)
            </label>
            <textarea
              id="measurement_notes"
              className="pd-num-form__textarea"
              value={form.notes}
              onChange={(e) => setField({ notes: e.target.value })}
              maxLength={1000}
              rows={2}
              placeholder="Контекст замера (опционально)"
            />
          </div>

          <div className="pd-num-form__actions">
            <button
              type="submit"
              className="pd-num-form__submit"
              disabled={submitting}
            >
              {submitting ? 'Сохранение…' : 'Сохранить замер'}
            </button>
          </div>
        </>
      )}
    </form>
  );
}

NumericInputForm.propTypes = {
  onSaved: PropTypes.func,
};
