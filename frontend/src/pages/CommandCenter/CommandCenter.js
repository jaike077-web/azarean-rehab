// =====================================================
// CommandCenter — admin landing (Wave 3 C5.1)
// В C5.1 — только каркас: шапка + селектор периода + 5 пустых панелей.
// Payload не потребляется (Rule #34 anti-175% перенесён на фронт — клиент
// не агрегирует поверх API-payload). Реальные компоненты панелей появятся
// в C5.2 (Attention/Funnel/Segments), C5.3 (Dynamics), C5.4 (Instructors).
// =====================================================

import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import s from './CommandCenter.module.css';

const PERIOD_OPTIONS = [
  { v: '7d',  l: '7 дней' },
  { v: '30d', l: '30 дней' },
  { v: 'all', l: 'Всё время' },
];

// Порядок панелей сверху вниз — фиксирован TZ.
// title — UI label; key — для React.
const PANELS = [
  { key: 'attention',   title: 'Требует внимания' },
  { key: 'funnel',      title: 'Воронка онбординга' },
  { key: 'segments',    title: 'Сегменты активности' },
  { key: 'dynamics',    title: 'Динамика' },
  { key: 'instructors', title: 'Срез по инструкторам' },
];

function CommandCenter() {
  const { user } = useAuth();
  // period — selected ключ; в C5.1 не передаётся вниз, заглушки период не используют.
  const [period, setPeriod] = useState('30d');

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
        {PANELS.map((p) => (
          <section key={p.key} className={s.panel}>
            <h3 className={s.panelTitle}>{p.title}</h3>
            <p className={s.panelStub}>—</p>
          </section>
        ))}
      </div>
    </div>
  );
}

export default CommandCenter;
