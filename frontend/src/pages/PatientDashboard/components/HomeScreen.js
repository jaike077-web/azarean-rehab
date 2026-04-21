// =====================================================
// HomeScreen v12 — порт из azarean-v12-final.jsx (L740-944)
// =====================================================
// Blocks:
//  1. Greeting row (приветствие + имя + AvatarBtn справа)
//  2. Hero card — gradient, specialist chip, IllKnee, CTA по allDone:
//       !allDone: «Сегодня · ПКС Фаза N» + «Начать» → Упражнения
//        allDone: «Готово · Комплекс завершён» + «Заполнить дневник» → Дневник
//     + week goal row (tap → Roadmap)
//  3. PGIC card («Как вы сейчас?» — 3 кнопки, state поднят в PatientDashboard)
//  4. Next visit card (пока нет API — hide graceful)
//  5. Phase progress ring + stats (Боль/Отёк/Дней)
//  6. Daily tip row
//
// Маппинг tab id (наши ≠ v12):
//   0 Home, 1 Roadmap, 2 Diary, 3 Contact, 4 Exercises.
// =====================================================

import React, { useState } from 'react';
import PropTypes from 'prop-types';
import {
  Check, ChevronRight, Play, Target, Calendar, Info, Lightbulb,
  Smile, Meh, Frown, ClipboardList, Shield, RefreshCw, Dumbbell,
  Activity, Zap, Trophy,
} from 'lucide-react';
import { AvatarBtn, IllKnee } from './ui';
import usePatientAvatarBlob from '../hooks/usePatientAvatarBlob';
import { rehab } from '../../../services/api';
import './HomeScreen.css';

// Маппинг имени иконки фазы из БД (rehab_phases.icon) → lucide-компонент.
const PHASE_ICONS = {
  shield: Shield, move: RefreshCw, dumbbell: Dumbbell,
  activity: Activity, trophy: Zap, star: Trophy,
};

const getGreeting = () => {
  const hr = new Date().getHours();
  if (hr < 12) return 'Доброе утро';
  if (hr < 18) return 'Добрый день';
  return 'Добрый вечер';
};

const getWeeksSinceSurgery = (surgeryDate) => {
  if (!surgeryDate) return 0;
  const diff = Date.now() - new Date(surgeryDate).getTime();
  return Math.max(0, Math.floor(diff / (7 * 24 * 60 * 60 * 1000)));
};

// Кольцо прогресса фазы. Inline SVG с children-контентом — в отличие от
// общего ProgressRing, здесь нужно 2 строки по центру (процент + «Фаза N»),
// плюс совместимость с v12 layout (ring+stats в одной карточке).
function PhaseRing({ pct, size = 88, sw = 6, children }) {
  const c = size / 2;
  const r = c - sw / 2;
  const circ = 2 * Math.PI * r;
  const off = circ - (Math.min(100, Math.max(0, pct)) / 100) * circ;
  return (
    <div style={{ width: size, height: size, position: 'relative', flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={c} cy={c} r={r} fill="none" stroke="var(--pd-n200)" strokeWidth={sw} />
        <circle
          cx={c} cy={c} r={r} fill="none"
          stroke="var(--pd-color-primary)" strokeWidth={sw}
          strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={off}
          transform={`rotate(-90 ${c} ${c})`}
          style={{ transition: 'stroke-dashoffset 800ms ease' }}
        />
      </svg>
      <div style={{
        position: 'absolute', inset: 0, display: 'flex',
        flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
      }}>
        {children}
      </div>
    </div>
  );
}

PhaseRing.propTypes = {
  pct: PropTypes.number.isRequired,
  size: PropTypes.number,
  sw: PropTypes.number,
  children: PropTypes.node,
};

// Пустой state — нет программы реабилитации.
const EmptyState = ({ goTo }) => (
  <div className="pd-home-empty">
    <div className="pd-home-empty-icon"><ClipboardList size={36} /></div>
    <h3 className="pd-home-empty-title">Программа не создана</h3>
    <p className="pd-home-empty-text">
      Ваш инструктор ещё не создал программу реабилитации.
      Свяжитесь с ним для получения подробностей.
    </p>
    <button className="pd-home-empty-btn" onClick={() => goTo(3)}>Связаться</button>
  </div>
);
EmptyState.propTypes = { goTo: PropTypes.func.isRequired };

// Loading skeleton
const LoadingSkeleton = () => (
  <div className="pd-loading">
    <div className="pd-skeleton" style={{ height: 60, marginBottom: 16 }} />
    <div className="pd-skeleton" style={{ height: 220, marginBottom: 16 }} />
    <div className="pd-skeleton" style={{ height: 110, marginBottom: 16 }} />
    <div className="pd-skeleton" style={{ height: 120 }} />
  </div>
);

const PGIC_OPTIONS = [
  { v: 'better', label: 'Лучше', Icon: Smile, color: 'var(--pd-color-ok)', bg: 'var(--pd-color-ok-bg)', tx: '#166534' },
  { v: 'same',   label: 'Так же', Icon: Meh,   color: 'var(--pd-n400)',     bg: 'var(--pd-n100)',       tx: 'var(--pd-n700)' },
  { v: 'worse',  label: 'Хуже',  Icon: Frown, color: 'var(--pd-color-warn)', bg: 'var(--pd-color-warn-bg)', tx: '#92400E' },
];

export default function HomeScreen({
  dashboardData, goTo, onOpenProfile, patient, pgicFeel, setPgicFeel,
}) {
  const [feelSaved, setFeelSaved] = useState(false);
  const [showStatTip, setShowStatTip] = useState(false);

  const avatarSrc = usePatientAvatarBlob(patient?.avatar_url);
  const initial = (patient?.full_name || '?').trim().charAt(0).toUpperCase() || '?';

  if (dashboardData === null || dashboardData === undefined) return <LoadingSkeleton />;

  const { program, phase, streak, tip, diaryFilledToday, exercisesDoneToday, lastDiary, nextVisit } = dashboardData;
  if (!program) return <EmptyState goTo={goTo} />;

  // «Готово» на hero-CTA = упражнения сделаны сегодня. После комплекса hero
  // переключается в ветку «Заполнить дневник»; после заполнения дневника —
  // остаётся «Готово», но кнопка становится вторичной. Чтобы избежать двух
  // состояний в одном prop'е, сейчас ведём по exercisesDoneToday и обнуляем
  // dashboard после ExerciseRunner в PatientDashboard (refetch).
  const allDone = Boolean(exercisesDoneToday);

  const firstName = (program.patient_name || patient?.full_name || 'Пациент').split(' ')[0];
  const currentPhase = program.current_phase || 1;
  const totalWeeks = phase?.duration_weeks || 12;
  const currentWeek = getWeeksSinceSurgery(program.surgery_date);
  const phasePct = totalWeeks > 0 ? Math.min(100, Math.round((currentWeek / totalWeeks) * 100)) : 0;
  const PhaseIcon = PHASE_ICONS[phase?.icon] || Shield;

  // Последний pain_level — для строки статистики. Отсутствие данных = «—».
  const lastPain = (lastDiary && typeof lastDiary.pain_level === 'number') ? String(lastDiary.pain_level) : '—';

  const pickFeel = (v) => {
    if (setPgicFeel) setPgicFeel(v);
    setFeelSaved(true);
    setTimeout(() => setFeelSaved(false), 1500);
    // Фоновый persist в diary_entries.pgic_feel — чтобы инструктор видел
    // отметку в дашборде админа и чтобы при открытии Diary значение pain
    // было предустановлено из PGIC. Ошибку глушим — локальный state и так
    // обновился, UX не должен страдать от временного 500.
    const today = new Date().toISOString().split('T')[0];
    rehab.createDiaryEntry({ entry_date: today, pgic_feel: v }).catch(() => {});
  };

  return (
    <div className="pd-home pd-home-screen">
      {/* 1. Greeting + AvatarBtn справа */}
      <div className="pd-home-greet">
        <div>
          <div className="pd-home-greet-hello">{getGreeting()}</div>
          <div className="pd-home-greet-name">{firstName}</div>
        </div>
        <AvatarBtn
          initial={initial}
          avatarSrc={avatarSrc}
          onClick={onOpenProfile}
          ariaLabel="Профиль"
        />
      </div>

      {/* 2. Hero card — gradient + specialist chip + IllKnee + CTA */}
      <div className="pd-home-hero">
        <div className="pd-home-hero-blob pd-home-hero-blob--teal" aria-hidden="true" />
        <div className="pd-home-hero-blob pd-home-hero-blob--orange" aria-hidden="true" />

        <button
          type="button"
          className="pd-home-hero-chip"
          onClick={() => goTo(3)}
          aria-label="Перейти к куратору"
        >
          <span className="pd-home-hero-chip-ava">Т</span>
          <span className="pd-home-hero-chip-text">
            Татьяна <span className="pd-home-hero-chip-role">· куратор</span>
          </span>
          <ChevronRight size={12} color="rgba(255,255,255,0.45)" aria-hidden="true" />
        </button>

        <div className="pd-home-hero-ill"><IllKnee /></div>

        <div className="pd-home-hero-body">
          {!allDone ? (
            <>
              <span className="pd-home-hero-badge pd-home-hero-badge--today">Сегодня</span>
              <h2 className="pd-home-hero-title">
                {program.diagnosis ? `${program.diagnosis} — Фаза ${currentPhase}` : `Фаза ${currentPhase}`}
              </h2>
              <p className="pd-home-hero-sub">
                {phase?.name || 'Продолжайте по плану'} · ~15 мин
              </p>
              <button
                type="button"
                className="pd-home-hero-btn pd-home-hero-btn--primary"
                onClick={() => goTo(4)}
              >
                <span className="pd-home-hero-btn-iconwrap">
                  <Play size={12} color="#fff" aria-hidden="true" />
                </span>
                Начать
              </button>
            </>
          ) : (
            <>
              <span className="pd-home-hero-badge pd-home-hero-badge--done">
                <Check size={10} color="#fff" strokeWidth={3} aria-hidden="true" />
                Готово
              </span>
              <h2 className="pd-home-hero-title">Комплекс завершён</h2>
              <p className="pd-home-hero-sub">Отличная работа! Не забудьте записать ощущения</p>
              <button
                type="button"
                className="pd-home-hero-btn pd-home-hero-btn--ghost"
                onClick={() => goTo(2)}
              >
                Заполнить дневник
                <ChevronRight size={14} color="#fff" aria-hidden="true" />
              </button>
            </>
          )}

          <button
            type="button"
            className="pd-home-hero-goal"
            onClick={() => goTo(1)}
          >
            <Target size={14} color="var(--pd-color-accent)" aria-hidden="true" />
            <span className="pd-home-hero-goal-text">
              Цель недели: <strong>{phase?.name || 'следовать плану'}</strong>
            </span>
            <ChevronRight size={12} color="rgba(255,255,255,0.45)" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* 3. PGIC card — «Как вы сейчас?» */}
      <div className="pd-home-card pd-home-pgic">
        <div className="pd-home-pgic-head">
          <span className="pd-home-pgic-title">Как вы сейчас?</span>
          {feelSaved && (
            <span className="pd-home-pgic-saved">
              <Check size={12} color="var(--pd-color-ok)" strokeWidth={2.5} aria-hidden="true" />
              Записано
            </span>
          )}
          {pgicFeel && !feelSaved && (
            <button
              type="button"
              className="pd-home-pgic-more"
              onClick={() => goTo(2)}
            >
              Подробнее
              <ChevronRight size={11} color="var(--pd-color-primary)" strokeWidth={2.2} aria-hidden="true" />
            </button>
          )}
        </div>
        <div className="pd-home-pgic-opts" role="radiogroup" aria-label="Как вы сейчас">
          {PGIC_OPTIONS.map((o) => {
            const on = pgicFeel === o.v;
            return (
              <button
                key={o.v}
                type="button"
                role="radio"
                aria-checked={on}
                className={`pd-home-pgic-opt ${on ? 'pd-home-pgic-opt--on' : ''}`}
                onClick={() => pickFeel(o.v)}
                style={on ? { borderColor: o.color, background: o.bg, color: o.tx } : undefined}
              >
                <o.Icon size={22} color={on ? o.color : 'var(--pd-n500)'} aria-hidden="true" />
                {o.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 4. Next visit — graceful hide если бэк не прислал */}
      {nextVisit && (
        <div className="pd-home-card pd-home-nextvisit" role="button" tabIndex={0}
             onClick={() => goTo(3)}
             onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') goTo(3); }}>
          <div className="pd-home-nextvisit-icon">
            <Calendar size={18} color="var(--pd-color-warm-dark)" aria-hidden="true" />
          </div>
          <div className="pd-home-nextvisit-text">
            <div className="pd-home-nextvisit-label">Следующий визит</div>
            <div className="pd-home-nextvisit-when">{nextVisit.when}</div>
            {nextVisit.where && <div className="pd-home-nextvisit-where">{nextVisit.where}</div>}
          </div>
          <ChevronRight size={16} color="var(--pd-n400)" aria-hidden="true" />
        </div>
      )}

      {/* 5. Phase progress ring + stats */}
      <div className="pd-home-card pd-home-progress">
        <PhaseRing pct={phasePct}>
          <span className="pd-home-progress-pct">{phasePct}%</span>
          <span className="pd-home-progress-sub">Фаза {currentPhase}</span>
        </PhaseRing>
        <div className="pd-home-progress-body">
          <div>
            <div className="pd-home-progress-phase-title">{phase?.name || `Фаза ${currentPhase}`}</div>
            <div className="pd-home-progress-phase-sub">
              Неделя {currentWeek} из {totalWeeks}
              {PhaseIcon && <PhaseIcon size={11} color="var(--pd-color-primary)" aria-hidden="true" style={{ marginLeft: 6, verticalAlign: 'middle' }} />}
            </div>
          </div>
          <div className="pd-home-progress-divider" />
          <div className="pd-home-progress-stats">
            {[
              { l: 'Боль', v: lastPain, c: 'var(--pd-color-ok)', hint: 'Средний уровень боли за неделю' },
              { l: 'Отёк', v: '—', c: 'var(--pd-color-ok)', hint: 'Нет данных об отёке' },
              { l: 'Дней', v: streak?.current ? `${streak.current}/7` : '—/7', c: 'var(--pd-color-primary)', hint: 'Дней занятий за текущую неделю' },
            ].map((s, i) => (
              <button
                key={i}
                type="button"
                className="pd-home-progress-stat"
                onClick={() => setShowStatTip(showStatTip === i ? false : i)}
              >
                <div className="pd-home-progress-stat-v" style={{ color: s.c }}>{s.v}</div>
                <div className="pd-home-progress-stat-l">
                  {s.l}<Info size={9} color="var(--pd-n400)" aria-hidden="true" />
                </div>
              </button>
            ))}
            {showStatTip !== false && (
              <div
                className="pd-home-progress-tooltip"
                style={{ left: `${(showStatTip * 33.33) + 16.66}%` }}
              >
                {['Средний уровень боли за неделю','Нет данных об отёке','Дней занятий за текущую неделю'][showStatTip]}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 6. Daily tip row */}
      {tip && (
        <div className="pd-home-tip">
          <Lightbulb size={16} color="var(--pd-color-accent)" aria-hidden="true" className="pd-home-tip-icon" />
          <div className="pd-home-tip-text">
            {tip.title || tip.body || 'Перед упражнениями прогрейте мышцы 3–5 минут лёгкой ходьбой'}
          </div>
        </div>
      )}
    </div>
  );
}

HomeScreen.propTypes = {
  dashboardData: PropTypes.shape({
    program: PropTypes.object,
    phase: PropTypes.object,
    streak: PropTypes.object,
    lastDiary: PropTypes.object,
    tip: PropTypes.object,
    diaryFilledToday: PropTypes.bool,
    nextVisit: PropTypes.shape({
      when: PropTypes.string,
      where: PropTypes.string,
    }),
  }),
  goTo: PropTypes.func.isRequired,
  onOpenProfile: PropTypes.func,
  patient: PropTypes.object,
  pgicFeel: PropTypes.oneOf(['better', 'same', 'worse', null]),
  setPgicFeel: PropTypes.func,
};

HomeScreen.defaultProps = {
  onOpenProfile: () => {},
  patient: null,
  pgicFeel: null,
  setPgicFeel: null,
};
