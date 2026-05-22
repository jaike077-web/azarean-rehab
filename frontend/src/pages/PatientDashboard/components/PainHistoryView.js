// =====================================================
// Wave 2 #2.05 — PainHistoryView
// История pain_entries с фильтром type=all|daily|event. AlertTriangle
// бейдж на записях с red_flag_triggered=true.
// =====================================================

import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { AlertTriangle, Zap } from 'lucide-react';
import { rehab } from '../../../services/api';
import './PainComponents.css';

const FILTER_OPTIONS = [
  ['all', 'Все'],
  ['daily', 'Дневник'],
  ['event', 'Срочные'],
];

function formatDateTime(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('ru-RU', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return '';
  }
}

export default function PainHistoryView({ limit }) {
  const [type, setType] = useState('all');
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (typeof rehab.getPainHistory !== 'function') {
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    rehab.getPainHistory({ type, limit: limit ?? 30 })
      .then((res) => { if (!cancelled) setEntries(res.data || []); })
      .catch(() => { if (!cancelled) setEntries([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [type, limit]);

  return (
    <div className="pd-pain-history">
      <div className="pd-pain-history__filter" role="tablist">
        {FILTER_OPTIONS.map(([v, l]) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={type === v}
            className={`pd-pain-history__filter-btn ${type === v ? 'pd-pain-history__filter-btn--active' : ''}`}
            onClick={() => setType(v)}
          >
            {l}
          </button>
        ))}
      </div>

      {loading && <div className="pd-pain-history__loading">Загрузка…</div>}
      {!loading && entries.length === 0 && (
        <div className="pd-pain-history__empty">Пока нет записей</div>
      )}

      <ul className="pd-pain-history__list">
        {entries.map((e) => (
          <li key={e.id} className="pd-pain-history__item">
            <div className="pd-pain-history__row">
              <span className="pd-pain-history__date">{formatDateTime(e.created_at)}</span>
              {e.is_event && (
                <span className="pd-pain-history__badge pd-pain-history__badge--event">
                  <Zap size={12} /> Событие
                </span>
              )}
              {e.red_flag_triggered && (
                <span
                  className="pd-pain-history__badge pd-pain-history__badge--redflag"
                  aria-label="Сработал красный флаг"
                >
                  <AlertTriangle size={12} /> Внимание
                </span>
              )}
            </div>
            <div className="pd-pain-history__vas">ВАШ: {e.vas_score}/10</div>
            {e.locations && e.locations.length > 0 && (
              <div className="pd-pain-history__locations">
                {e.locations.map((l) => l.label).join(', ')}
              </div>
            )}
            {e.notes && <div className="pd-pain-history__notes">{e.notes}</div>}
          </li>
        ))}
      </ul>
    </div>
  );
}

PainHistoryView.propTypes = {
  limit: PropTypes.number,
};
