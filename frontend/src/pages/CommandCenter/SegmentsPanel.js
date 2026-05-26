// =====================================================
// SegmentsPanel — Сегменты активности (Wave 3 C5.2)
// 4 карточки: active / at_risk / dormant / churned.
// Числа из payload как есть. НЕ суммируем, НЕ сверяем инвариант
// segments.* == funnel.active_program на клиенте (Rule #34 anti-175%).
// =====================================================

import React from 'react';
import { RefreshCw } from 'lucide-react';
import { plural } from '../../utils/plural';
import s from './CommandCenter.module.css';

// 4 сегмента: токены семантики из tokens.css. dormant — secondary (нет --color-secondary,
// используем --color-text-muted по §1 C5.1 recon).
const SEGMENTS = [
  { key: 'active',   label: 'Активны',     color: 'var(--color-success)' },
  { key: 'at_risk',  label: 'Под риском',  color: 'var(--color-warning)' },
  { key: 'dormant',  label: 'Спят',        color: 'var(--color-text-muted)' },
  { key: 'churned',  label: 'Отвалились',  color: 'var(--color-danger)' },
];

function SegmentsPanel({ summary, loading, error, onRetry }) {
  return (
    <section className={s.panel}>
      <div className={s.panelHeader}>
        <h3 className={s.panelTitle}>Сегменты активности</h3>
      </div>

      {loading && (
        <div>
          <div className={s.skelRow} />
          <div className={s.skelRow} />
        </div>
      )}

      {!loading && error && (
        <div className={s.panelError}>
          <span>{error}</span>
          <button type="button" className={s.retryBtn} onClick={onRetry}>
            <RefreshCw size={14} /> Повторить
          </button>
        </div>
      )}

      {!loading && !error && summary && (
        <>
          <div className={s.segGrid}>
            {SEGMENTS.map((seg) => {
              const value = summary.segments?.[seg.key] ?? 0;
              return (
                <div key={seg.key} className={s.segCard}>
                  <div
                    className={s.segValue}
                    style={{ color: seg.color }}
                  >
                    {value}
                  </div>
                  <div className={s.segLabel}>{seg.label}</div>
                </div>
              );
            })}
          </div>

          {summary.segments_note?.no_target_set > 0 && (
            <p className={s.segNote}>
              {summary.segments_note.no_target_set}{' '}
              {plural(summary.segments_note.no_target_set, [
                'программа', 'программы', 'программ',
              ])}{' '}
              без заданной цели
            </p>
          )}
        </>
      )}
    </section>
  );
}

export default SegmentsPanel;
