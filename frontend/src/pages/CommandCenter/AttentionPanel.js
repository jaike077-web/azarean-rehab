// =====================================================
// AttentionPanel — Слой 0 (Wave 3 C5.2)
// Лента нерезолвленных ops_alerts + phase_stuck_alerts.
// Сорт уже сделан бэкендом (severity DESC → created_at DESC),
// фронт не пересортирует (Rule #34 — клиент не агрегирует payload).
// Период не влияет — fetch один раз на mount.
// =====================================================

import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ChevronRight, RefreshCw } from 'lucide-react';
import { admin } from '../../services/api';
import s from './CommandCenter.module.css';

// severity → CSS-переменная цвета (из tokens.css). Только токены, не хардкод.
// Экспорт для unit-теста (JSDOM не парсит CSS-vars в inline-style,
// проще тестировать mapping как чистую функцию).
export function severityColor(sev) {
  if (sev === 'critical' || sev === 'high') return 'var(--color-danger)';
  if (sev === 'medium') return 'var(--color-warning)';
  return 'var(--color-text-muted)'; // low + fallback
}

function AttentionPanel() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await admin.commandCenter.getAttention({ limit: 50 });
      // ⚠️ Контракт: ответ {data:{items,total}} → после unwrap r.data = {items,total},
      // total — ВНУТРИ data, не в meta (это не list-envelope с total как параллельным полем).
      setItems(r.data?.items || []);
      setTotal(r.data?.total ?? 0);
    } catch (e) {
      setError(e?.response?.data?.message || 'Не удалось загрузить ленту');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Клик по строке → /patients (роута /patients/:id нет; это задокументированное
  // ограничение в TZ). Архитектор пометил доработку как post-pilot.
  const handleRowClick = () => navigate('/patients');

  return (
    <section className={s.panel}>
      <div className={s.panelHeader}>
        <h3 className={s.panelTitle}>
          Требует внимания
          {total > 0 && <span className={s.panelBadge}>{total}</span>}
        </h3>
      </div>

      {loading && (
        <div>
          <div className={s.skelRow} />
          <div className={s.skelRow} />
          <div className={s.skelRow} />
        </div>
      )}

      {!loading && error && (
        <div className={s.panelError}>
          <span>{error}</span>
          <button type="button" className={s.retryBtn} onClick={load}>
            <RefreshCw size={14} /> Повторить
          </button>
        </div>
      )}

      {!loading && !error && items.length === 0 && (
        <div className={s.attnEmpty}>
          <AlertTriangle size={18} className={s.attnEmptyIcon} />
          <span>Нет сигналов, требующих внимания</span>
        </div>
      )}

      {!loading && !error && items.length > 0 && (
        <ul className={s.attnList}>
          {items.map((item, idx) => (
            <li
              // kind+patient_id+created_at гарантирует уникальность без id из бэкенда
              key={`${item.kind}-${item.patient_id}-${item.created_at}-${idx}`}
              className={s.attentionRow}
              role="button"
              tabIndex={0}
              onClick={handleRowClick}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleRowClick();
                }
              }}
            >
              <span
                className={s.sevDot}
                style={{ background: severityColor(item.severity) }}
                aria-label={`severity ${item.severity}`}
              />
              <div className={s.attnText}>
                <div className={s.attnSummary}>{item.summary}</div>
                <div className={s.attnMeta}>
                  {item.patient_name} · {item.instructor_name} ·{' '}
                  {new Date(item.created_at).toLocaleDateString('ru-RU')}
                </div>
              </div>
              <ChevronRight size={16} className={s.attnChevron} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default AttentionPanel;
