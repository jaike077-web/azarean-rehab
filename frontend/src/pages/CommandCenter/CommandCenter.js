// =====================================================
// CommandCenter — admin landing (Wave 3 C5.1 + C5.2)
// C5.1: каркас + period state + 5 панелей.
// C5.2: fetch /command-center (period-зависим, проп summary в FunnelPanel +
// SegmentsPanel) + AttentionPanel со своим mount-once fetch /attention.
// Динамика и Инструкторы остаются заглушками — реальные компоненты в C5.3/C5.4.
// =====================================================

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { admin } from '../../services/api';
import s from './CommandCenter.module.css';
import AttentionPanel from './AttentionPanel';
import FunnelPanel from './FunnelPanel';
import SegmentsPanel from './SegmentsPanel';
import DynamicsPanel from './DynamicsPanel';
import InstructorsPanel from './InstructorsPanel';

const PERIOD_OPTIONS = [
  { v: '7d',  l: '7 дней' },
  { v: '30d', l: '30 дней' },
  { v: 'all', l: 'Всё время' },
];

function CommandCenter() {
  const { user } = useAuth();
  const [period, setPeriod] = useState('30d');

  // Один fetch /command-center на FunnelPanel + SegmentsPanel
  // (period-зависим — adhering зависит от окна).
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState(null);

  const loadSummary = useCallback(async () => {
    setSummaryLoading(true);
    setSummaryError(null);
    try {
      const r = await admin.commandCenter.getSummary({ period });
      setSummary(r.data || null);
    } catch (e) {
      setSummaryError(e?.response?.data?.message || 'Не удалось загрузить сводку');
    } finally {
      setSummaryLoading(false);
    }
  }, [period]);

  useEffect(() => { loadSummary(); }, [loadSummary]);

  return (
    <div className={s.commandCenter}>
      <div className={s.ccHeader}>
        <h2 className={s.welcomeTitle}>С возвращением, {user?.full_name}</h2>
        <span className={s.rolePill}>
          {user?.role === 'admin' ? 'Администратор' : 'Инструктор'}
        </span>
      </div>

      <div className={s.periodSelector} role="group" aria-label="Период">
        {PERIOD_OPTIONS.map((opt) => (
          <button
            key={opt.v}
            type="button"
            className={`${s.periodBtn} ${period === opt.v ? s.active : ''}`}
            onClick={() => setPeriod(opt.v)}
            aria-pressed={period === opt.v}
          >
            {opt.l}
          </button>
        ))}
      </div>
      <p className={s.periodHint}>период влияет на приверженность и динамику</p>

      <div className={s.panels}>
        {/* C5.2 — реальные панели */}
        <AttentionPanel />
        <FunnelPanel
          summary={summary}
          loading={summaryLoading}
          error={summaryError}
          onRetry={loadSummary}
        />
        <SegmentsPanel
          summary={summary}
          loading={summaryLoading}
          error={summaryError}
          onRetry={loadSummary}
        />

        {/* C5.3 — Динамика (3 оси раздельно + insufficient_data + overtraining-бейдж) */}
        <DynamicsPanel period={period} />

        {/* C5.4 — Срез по инструкторам (таблица + модалка + inline-переназначение) */}
        <InstructorsPanel />
      </div>
    </div>
  );
}

export default CommandCenter;
