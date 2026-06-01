// =====================================================
// FunnelPanel — Воронка онбординга (Wave 3 C5.2 + ARC-CYCLE AC7)
// 4 стадии: created → registered → active_program → active.
// AC7: «Соблюдает» больше НЕ стадия воронки — приверженность теперь ДВЕ оси
// раздельно (Гимнастика / Тренировка) под воронкой (Rule #34, НЕ пулим).
// Числа берём как пришли (Rule #34 — клиент не агрегирует payload).
// Единственная арифметика — display-ширина бара + знаменатель «из скольких».
// =====================================================

import React from 'react';
import { RefreshCw, AlertTriangle } from 'lucide-react';
import { plural } from '../../utils/plural';
import { ADHERENCE_AXES, adherenceAxisValue } from './adherenceAxis';
import s from './CommandCenter.module.css';

const STAGES = [
  { key: 'created',        label: 'Заведён' },
  { key: 'registered',     label: 'Зарегистрирован' },
  { key: 'active_program', label: 'Активная программа' },
  { key: 'active',         label: 'Активен' },
];

function FunnelPanel({ summary, loading, error, onRetry }) {
  return (
    <section className={s.panel}>
      <div className={s.panelHeader}>
        <h3 className={s.panelTitle}>Воронка онбординга</h3>
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
          <button type="button" className={s.retryBtn} onClick={onRetry}>
            <RefreshCw size={14} /> Повторить
          </button>
        </div>
      )}

      {!loading && !error && summary && summary.funnel?.created === 0 && (
        <div className={s.attnEmpty}>
          <span>Пока нет заведённых пациентов</span>
        </div>
      )}

      {!loading && !error && summary && summary.funnel?.created > 0 && (
        <>
          <div className={s.funnelList}>
            {STAGES.map((stage) => {
              const count = summary.funnel[stage.key] ?? 0;
              // Display-only ширина (Rule #34: единственная арифметика на фронте,
              // guard на 0 через Math.max(created, 1) — created>0 здесь гарантирован).
              const widthPct = Math.round(
                (100 * count) / Math.max(summary.funnel.created, 1)
              );
              return (
                <div key={stage.key} className={s.funnelBar}>
                  <div className={s.funnelTrack}>
                    <div
                      className={s.funnelFill}
                      style={{ width: `${widthPct}%` }}
                    />
                    <div className={s.funnelLabel}>
                      <span className={s.funnelCount}>{count}</span>
                      <span className={s.funnelStage}>{stage.label}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {summary.funnel_gaps?.registered_no_active_program > 0 && (
            <div className={s.gapCallout}>
              <AlertTriangle size={16} className={s.gapIcon} />
              <span>
                Зарегистрированы без активной программы:{' '}
                <b>{summary.funnel_gaps.registered_no_active_program}</b>{' '}
                {plural(summary.funnel_gaps.registered_no_active_program, [
                  'пациент', 'пациента', 'пациентов',
                ])}
              </span>
            </div>
          )}

          {/* AC7: приверженность — ДВЕ оси раздельно. «—» = на оси нет целей. */}
          {summary.adherence && (
            <div className={s.axisBlock} data-testid="funnel-adherence">
              <h4 className={s.axisTitle}>Приверженность</h4>
              {ADHERENCE_AXES.map((ax) => {
                const { text } = adherenceAxisValue(
                  summary.adherence[ax.key],
                  summary.funnel.active_program
                );
                return (
                  <div
                    key={ax.key}
                    className={s.trendRow}
                    data-testid={`adherence-${ax.key}`}
                  >
                    <span className={s.trendLabel}>{ax.label}</span>
                    <span className={s.trendCount}>{text}</span>
                  </div>
                );
              })}
            </div>
          )}

          <p className={s.panelHint}>
            этапы — текущее состояние
            {summary.adherence ? '; приверженность зависит от периода' : ''}
          </p>
        </>
      )}
    </section>
  );
}

export default FunnelPanel;
