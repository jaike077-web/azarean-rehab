import React from 'react';
import s from './RehabProgramModal.module.css';

/**
 * ComplexSelector — единый селектор комплекса для create-wizard и edit-form.
 * Wave 1 #1.08b. Закрывает Bug #13: вместо `Комплекс #${c.id}` показывает
 * `c.derived_title` (computed backend поле из 1.08a).
 *
 * Props:
 *   complexes — массив { id, title, derived_title, ... } из complexes.getByPatient
 *   value      — текущий complex_id (number | '')
 *   onChange   — (newId | '') => void
 *   disabled   — boolean
 *   id         — id для <label htmlFor>
 *   required   — boolean
 */
function ComplexSelector({ complexes = [], value, onChange, disabled = false, id = 'rp-complex', required = false }) {
  return (
    <select
      id={id}
      value={value || ''}
      onChange={(e) => onChange(e.target.value ? parseInt(e.target.value, 10) : '')}
      disabled={disabled || complexes.length === 0}
      required={required}
    >
      <option value="">— Выберите комплекс —</option>
      {complexes.map((c) => (
        <option key={c.id} value={c.id}>
          {/* Bug #13 fix (Wave 1 #1.08a + #1.08b):
              derived_title из backend computed field (COALESCE(title, first-2-exercises))
              → fallback на «Комплекс #N» если совсем пусто. */}
          {c.derived_title || c.title || `Комплекс #${c.id}`}
        </option>
      ))}
    </select>
  );
}

export default ComplexSelector;
