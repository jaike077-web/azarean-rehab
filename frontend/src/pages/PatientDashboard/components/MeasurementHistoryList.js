// =====================================================
// Wave 2 #2.08 — MeasurementHistoryList
// =====================================================
// Sorted список карточек. Cyrillic labels из NumericInputForm export.
// measured_at — backend через ::text шлёт 'YYYY-MM-DD' string
// (timezone rule #27), отображаем без preprocessing.
// =====================================================

import React from 'react';
import PropTypes from 'prop-types';
import { ROM_TYPES, GIRTH_TYPES, HBB_VERTEBRAE } from './NumericInputForm';
import './MeasurementHistoryList.css';

const ROM_LABEL_MAP = Object.fromEntries(ROM_TYPES.map((t) => [t.value, t.label]));
const GIRTH_LABEL_MAP = Object.fromEntries(GIRTH_TYPES.map((t) => [t.value, t.label]));
const HBB_LABEL_MAP = Object.fromEntries(HBB_VERTEBRAE.map((v) => [v.value, v.label]));
const ROM_UNIT_MAP = Object.fromEntries(ROM_TYPES.map((t) => [t.value, t.unit]));

function formatValue(m, isRom) {
  if (isRom) {
    if (m.value_degrees != null) return `${m.value_degrees}°`;
    if (m.value_cm != null) return `${m.value_cm} см`;
    if (m.value_categorical) {
      return HBB_LABEL_MAP[m.value_categorical] || m.value_categorical;
    }
    return '—';
  }
  return m.value_cm != null ? `${m.value_cm} см` : '—';
}

function MeasurementCard({ m, isRom }) {
  const labelMap = isRom ? ROM_LABEL_MAP : GIRTH_LABEL_MAP;
  const typeLabel = labelMap[m.measurement_type] || m.measurement_type;
  const unit = isRom ? (ROM_UNIT_MAP[m.measurement_type] || '') : 'см';

  return (
    <article className="pd-measurement-card">
      <div className="pd-measurement-card__row pd-measurement-card__row--meta">
        <span className="pd-measurement-card__date">{m.measured_at}</span>
        <span className="pd-measurement-card__side">
          {m.side === 'L' ? 'Левая' : m.side === 'R' ? 'Правая' : '—'}
        </span>
      </div>
      <div className="pd-measurement-card__row pd-measurement-card__row--main">
        <span className="pd-measurement-card__type">{typeLabel}</span>
        <span className="pd-measurement-card__value" aria-label={`Значение ${formatValue(m, isRom)}`}>
          {formatValue(m, isRom)}
        </span>
      </div>
      {m.notes && <div className="pd-measurement-card__notes">{m.notes}</div>}
      {/* unit подсказка скрыта чтобы не дублировать в formatValue, но
          aria-label выше включает unit для скрин-ридеров. */}
      {unit && <span className="pd-measurement-card__unit-srhint" hidden>{unit}</span>}
    </article>
  );
}

MeasurementCard.propTypes = {
  m: PropTypes.shape({
    id: PropTypes.number.isRequired,
    measurement_type: PropTypes.string.isRequired,
    side: PropTypes.string,
    value_degrees: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    value_cm: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    value_categorical: PropTypes.string,
    notes: PropTypes.string,
    measured_at: PropTypes.string,
  }).isRequired,
  isRom: PropTypes.bool.isRequired,
};

export default function MeasurementHistoryList({ items }) {
  const { rom = [], girth = [] } = items || {};

  const all = [
    ...rom.map((m) => ({ ...m, _isRom: true })),
    ...girth.map((m) => ({ ...m, _isRom: false })),
  ].sort((a, b) => {
    // measured_at — 'YYYY-MM-DD' string (rule #27), localeCompare стабилен
    const dateA = String(a.measured_at || '');
    const dateB = String(b.measured_at || '');
    if (dateA !== dateB) return dateB.localeCompare(dateA);
    return (b.id || 0) - (a.id || 0);
  });

  if (all.length === 0) {
    return (
      <div className="pd-measurement-history-empty">
        Пока нет замеров. Добавьте первый через форму выше.
      </div>
    );
  }

  return (
    <div className="pd-measurement-history-list">
      {all.map((m) => (
        <MeasurementCard
          key={`${m._isRom ? 'rom' : 'girth'}-${m.id}`}
          m={m}
          isRom={m._isRom}
        />
      ))}
    </div>
  );
}

MeasurementHistoryList.propTypes = {
  items: PropTypes.shape({
    rom: PropTypes.array,
    girth: PropTypes.array,
  }),
};
