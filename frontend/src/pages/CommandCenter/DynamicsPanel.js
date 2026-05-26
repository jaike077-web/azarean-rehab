// =====================================================
// DynamicsPanel — Динамика (Wave 3 C5.3)
// 3 оси показываются РАЗДЕЛЬНО (MEMORY_RULES §9): боль / приверженность /
// фазы. Не сводятся в один балл. insufficient_data — честной корзиной.
// overtraining_candidates — first-class additive-сигнал, отдельным бейджем.
//
// КРИТИЧНО: у боли и приверженности «улучшение» = противоположные направления.
// Боль падает → хорошо (TrendingDown). Приверженность растёт → хорошо (TrendingUp).
// НЕ копипастить иконки между осями — разные named-export pure functions
// painTrendMeta / adherenceTrendMeta.
//
// JSDOM-урок из C5.2: маппинги цвет/иконка/значение — named-export pure
// functions; inline-style с CSS-переменными в JSDOM через style.X /
// getAttribute('style') не ассертится, тестируется через функцию + текст.
// =====================================================

import React, { useState, useEffect, useCallback } from 'react';
import { TrendingUp, TrendingDown, Minus, AlertTriangle, RefreshCw } from 'lucide-react';
import { admin } from '../../services/api';
import { plural } from '../../utils/plural';
import s from './CommandCenter.module.css';

// Боль: improving = боль снижается (TrendingDown + success).
export function painTrendMeta(key) {
  if (key === 'improving') return { Icon: TrendingDown, color: 'var(--color-success)',    label: 'Улучшение' };
  if (key === 'worsening') return { Icon: TrendingUp,   color: 'var(--color-danger)',     label: 'Ухудшение' };
  // stable + fallback (включая unknown ключи)
  return { Icon: Minus, color: 'var(--color-text-muted)', label: 'Стабильно' };
}

// Приверженность: improving = активность растёт (TrendingUp + success).
// Направления ПРОТИВОПОЛОЖНЫ painTrendMeta — НЕ копипастить.
export function adherenceTrendMeta(key) {
  if (key === 'improving') return { Icon: TrendingUp,   color: 'var(--color-success)',    label: 'Улучшение' };
  if (key === 'worsening') return { Icon: TrendingDown, color: 'var(--color-danger)',     label: 'Ухудшение' };
  return { Icon: Minus, color: 'var(--color-text-muted)', label: 'Стабильно' };
}

// Рендер одной trend-строки (improving/stable/worsening) с иконкой+цветом из меты.
function TrendRow({ meta, count }) {
  const { Icon, color, label } = meta;
  return (
    <div className={s.trendRow}>
      <Icon size={16} className={s.trendIcon} style={{ color }} />
      <span className={s.trendLabel} style={{ color }}>{label}</span>
      <span className={s.trendCount}>{count}</span>
    </div>
  );
}

// Блок одной оси (боль или приверженность) — 3 trend-строки + insufficient row.
function AxisBlock({ title, axisData, metaFn, hint }) {
  return (
    <div className={s.axisBlock}>
      <h4 className={s.axisTitle}>{title}</h4>
      <TrendRow meta={metaFn('improving')} count={axisData.improving ?? 0} />
      <TrendRow meta={metaFn('stable')}    count={axisData.stable ?? 0} />
      <TrendRow meta={metaFn('worsening')} count={axisData.worsening ?? 0} />
      {axisData.insufficient_data > 0 && (
        <div className={s.insufficientRow}>
          недостаточно данных: <b>{axisData.insufficient_data}</b>
        </div>
      )}
      {hint && <p className={s.axisHint}>{hint}</p>}
    </div>
  );
}

function DynamicsPanel({ period }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadDynamics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await admin.commandCenter.getDynamics({ period });
      setData(r.data || null);
    } catch (e) {
      setError(e?.response?.data?.message || 'Не удалось загрузить динамику');
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { loadDynamics(); }, [loadDynamics]);

  const cohort = data?.cohort ?? 0;
  const overtrain = data?.conflicts?.overtraining_candidates ?? 0;

  return (
    <section className={s.panel}>
      <div className={s.panelHeader}>
        <h3 className={s.panelTitle}>Динамика</h3>
        {/* Overtraining — additive, НЕ вычитается из осей (§9). Скрыт при 0. */}
        {!loading && !error && overtrain > 0 && (
          <span className={s.overtrainBadge}>
            <AlertTriangle size={14} />
            возможный перетрен: {overtrain}
          </span>
        )}
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
          <button type="button" className={s.retryBtn} onClick={loadDynamics}>
            <RefreshCw size={14} /> Повторить
          </button>
        </div>
      )}

      {!loading && !error && data && cohort === 0 && (
        <div className={s.attnEmpty}>
          <span>Пока некого анализировать — нет активных программ</span>
        </div>
      )}

      {!loading && !error && data && cohort > 0 && (
        <>
          <p className={s.cohortNote}>
            когорта: <b>{cohort}</b>{' '}
            {plural(cohort, ['пациент', 'пациента', 'пациентов'])} с активной программой
          </p>

          <div className={s.dynamicsGrid}>
            <AxisBlock
              title="Боль"
              axisData={data.pain || {}}
              metaFn={painTrendMeta}
              hint="боль начнём оценивать после ~2 недель записей дневника"
            />
            <AxisBlock
              title="Приверженность"
              axisData={data.adherence || {}}
              metaFn={adherenceTrendMeta}
            />
            <div className={s.axisBlock}>
              <h4 className={s.axisTitle}>Фазы</h4>
              <div className={s.phasePair}>
                <div
                  className={s.phaseChip}
                  style={{ color: 'var(--color-success)' }}
                >
                  <span className={s.trendLabel} style={{ color: 'var(--color-success)' }}>
                    По плану
                  </span>
                  <span className={s.trendCount}>{data.phase?.on_track ?? 0}</span>
                </div>
                <div
                  className={s.phaseChip}
                  style={{ color: 'var(--color-warning)' }}
                >
                  <span className={s.trendLabel} style={{ color: 'var(--color-warning)' }}>
                    Застряли
                  </span>
                  <span className={s.trendCount}>{data.phase?.stalled ?? 0}</span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

export default DynamicsPanel;
