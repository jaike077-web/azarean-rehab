// =====================================================
// RoadmapScreen v12 — Путь восстановления
// Reference: azarean-v12-final.jsx функция Roadmap (L961-1182)
// -----------------------------------------------------
// Layout:
//  1. Header (заголовок + subtitle с датой операции + AvatarBtn)
//  2. Timeline — 6 фаз (вертикальный список). Past: checkmark, current:
//     icon + pulse-dot animation, future: grayed icon.
//  3. Current phase — expanded card с 4 pill-табами (Цели/Нельзя/Можно/Боль)
//     и exit-criteria списком под ним (Вариант A: просто список строк из
//     rehab_phases.criteria_next, без cur/met индикаторов).
//  4. Future phases — collapsed, тап «Подробнее» → accordion с описанием.
//  5. Info note внизу: «Сроки ориентировочные».
//
// Данные:
//  - rehab.getPhases() → все 6 фаз ACL
//  - dashboardData.program.current_phase (integer 1..6) — активная фаза
//  - dashboardData.program.surgery_date → currentWeek для subtitle.
// =====================================================
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import {
  Shield, Sprout, Dumbbell, Activity, Zap, Trophy,
  Target, Ban, CheckCircle2, Snowflake, Check, ChevronDown,
  Info, AlertTriangle,
} from 'lucide-react';
import { rehab } from '../../../services/api';
import './RoadmapScreen.css';

// Маппинг seed-иконок на lucide компоненты
const PHASE_ICONS = {
  shield: Shield,
  move: Sprout,
  sprout: Sprout,
  dumbbell: Dumbbell,
  activity: Activity,
  trophy: Zap,
  star: Trophy,
};

// v12-палитра фаз (indigo/sky/green/amber/orange/violet) — всегда используется
// вместо seed-колоров БД, т.к. последние — bold-семантика (#EF4444 и т.д.),
// которая перегружает тон экрана. Цвета по индексу phase_number-1.
const PHASE_COLORS = [
  '#818CF8', '#38BDF8', '#4ADE80', '#FBBF24', '#FB923C', '#A78BFA',
];
const getPhaseColor = (phaseNumber) =>
  PHASE_COLORS[(phaseNumber - 1) % PHASE_COLORS.length] || '#0D9488';

// 4 таба в expanded card текущей фазы
const TABS = [
  { id: 'goals', label: 'Цели', field: 'goals', Icon: Target, iconTone: 'phase' },
  { id: 'restrictions', label: 'Нельзя', field: 'restrictions', Icon: Ban, iconTone: 'err' },
  { id: 'allowed', label: 'Можно', field: 'allowed', Icon: CheckCircle2, iconTone: 'ok' },
  { id: 'pain', label: 'Боль', field: 'pain', Icon: Snowflake, iconTone: 'warn' },
];

// Недель с момента операции (для subtitle)
const getWeeksSinceSurgery = (surgeryDate) => {
  if (!surgeryDate) return null;
  const diff = Date.now() - new Date(surgeryDate).getTime();
  if (Number.isNaN(diff)) return null;
  return Math.max(0, Math.floor(diff / (7 * 24 * 60 * 60 * 1000)));
};

// Вытащить элементы в массив: принимает массив ИЛИ строку со \n / bullet'ами
const toBullets = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === 'string') {
    return value
      .split(/\r?\n/)
      .map((s) => s.replace(/^[-*•]\s*/, '').trim())
      .filter(Boolean);
  }
  return [];
};

// --- Pill (inline, т.к. в общем Pill нет active+color пропсов) ---
const PhasePill = ({ active, color, onClick, children }) => (
  <button
    type="button"
    className={`pd-rm-pill ${active ? 'pd-rm-pill--active' : ''}`}
    onClick={onClick}
    style={active ? { backgroundColor: color, borderColor: color } : undefined}
    aria-pressed={active}
  >
    {children}
  </button>
);

PhasePill.propTypes = {
  active: PropTypes.bool,
  color: PropTypes.string,
  onClick: PropTypes.func,
  children: PropTypes.node,
};

// --- TabBullets: список с мелкой иконкой у каждого пункта ---
const TabBullets = ({ items, Icon, color }) => {
  if (!items || items.length === 0) {
    return <p className="pd-rm-empty">Информация отсутствует</p>;
  }
  return (
    <ul className="pd-rm-bullets">
      {items.map((it, idx) => (
        <li key={idx} className="pd-rm-bullet">
          <span className="pd-rm-bullet-icon" style={{ color }} aria-hidden="true">
            <Icon size={13} strokeWidth={2.2} />
          </span>
          <span className="pd-rm-bullet-text">{it}</span>
        </li>
      ))}
    </ul>
  );
};

TabBullets.propTypes = {
  items: PropTypes.arrayOf(PropTypes.string),
  Icon: PropTypes.elementType.isRequired,
  color: PropTypes.string,
};

// --- PhaseExpandedCard: полный контент фазы (description + 4 таба + exit-criteria).
// Используется как для current, так и для любой развёрнутой future-фазы.
// Локальный activeTab state — у каждой фазы свой, не шарится.
// dim=true для future — лёгкое приглушение чтобы визуально отличалось от current.
const PhaseExpandedCard = ({ phase, color, dim = false, testId = 'pd-rm-card' }) => {
  const [activeTab, setActiveTab] = useState('goals');
  const activeTabDef = TABS.find((t) => t.id === activeTab) || TABS[0];
  const items = toBullets(phase[activeTabDef.field]);
  const iconColor =
    activeTabDef.iconTone === 'err' ? 'var(--pd-color-err)' :
    activeTabDef.iconTone === 'ok' ? 'var(--pd-color-ok)' :
    activeTabDef.iconTone === 'warn' ? 'var(--pd-color-warn)' :
    color;
  const exitCriteria = toBullets(phase.criteria_next);

  return (
    <div
      className={`pd-rm-card ${dim ? 'pd-rm-card--dim' : ''}`}
      style={{ borderLeftColor: color }}
      data-testid={testId}
    >
      {phase.description && (
        <p className="pd-rm-card-desc">{phase.description}</p>
      )}

      <div className="pd-rm-tabs" role="tablist">
        {TABS.map((t) => (
          <PhasePill
            key={t.id}
            active={activeTab === t.id}
            color={color}
            onClick={() => setActiveTab(t.id)}
          >
            {t.label}
          </PhasePill>
        ))}
      </div>

      <div className="pd-rm-tab-content">
        {activeTab === 'pain' ? (
          <div className="pd-rm-pain-note">
            <AlertTriangle size={14} color="var(--pd-color-warn)" aria-hidden="true" />
            <div>
              {items.length > 0
                ? items.join(' · ')
                : 'Контролируйте уровень боли. При 5+/10 свяжитесь со специалистом.'}
            </div>
          </div>
        ) : (
          <TabBullets items={items} Icon={activeTabDef.Icon} color={iconColor} />
        )}
      </div>

      {exitCriteria.length > 0 && (
        <div className="pd-rm-criteria" data-testid="pd-rm-criteria">
          <div className="pd-rm-criteria-head">
            <Target size={13} color="var(--pd-n600)" aria-hidden="true" />
            <span>Критерии перехода</span>
          </div>
          <ul className="pd-rm-criteria-list">
            {exitCriteria.map((c, idx) => (
              <li key={idx} className="pd-rm-criteria-item">
                <span className="pd-rm-criteria-dot" aria-hidden="true" />
                <span>{c}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

PhaseExpandedCard.propTypes = {
  phase: PropTypes.object.isRequired,
  color: PropTypes.string.isRequired,
  dim: PropTypes.bool,
  testId: PropTypes.string,
};

// --- PhaseRow: одна строка timeline'а ---
const PhaseRow = ({
  phase,
  color,
  PhaseIcon,
  isPast,
  isCurrent,
  isFuture,
  isLast,
  expanded,
  onToggleExpand,
}) => {
  return (
    <div className="pd-rm-row">
      {/* Левая колонка: icon circle + соединительная линия + pulse-dot */}
      <div className="pd-rm-left">
        {!isLast && (
          <div
            className={`pd-rm-line ${isPast ? 'pd-rm-line--past' : ''}`}
            style={isPast ? { backgroundColor: color } : undefined}
          />
        )}
        <div
          className={`pd-rm-circle ${isCurrent ? 'pd-rm-circle--current' : ''} ${isPast ? 'pd-rm-circle--past' : ''} ${isFuture ? 'pd-rm-circle--future' : ''}`}
          style={{
            backgroundColor: isPast
              ? color
              : isCurrent
                ? `color-mix(in srgb, ${color} 14%, transparent)`
                : undefined,
            borderColor: isCurrent ? color : 'transparent',
            color: isPast ? '#fff' : isCurrent ? color : undefined,
          }}
        >
          {isPast ? (
            <Check size={20} strokeWidth={3} aria-hidden="true" />
          ) : (
            <PhaseIcon size={20} aria-hidden="true" />
          )}
        </div>
        {isCurrent && (
          <span className="pd-rm-pulse" aria-hidden="true" data-testid="pd-rm-pulse" />
        )}
      </div>

      {/* Правая колонка: название + субтитл + expanded card / accordion */}
      <div className="pd-rm-body">
        <div className="pd-rm-title-row">
          <div
            className={`pd-rm-name ${isCurrent ? 'pd-rm-name--current' : ''} ${isFuture ? 'pd-rm-name--future' : ''}`}
          >
            {phase.name || phase.title}
          </div>
          {isCurrent && <span className="pd-rm-badge">Сейчас</span>}
        </div>
        <div
          className="pd-rm-subtitle"
          style={isCurrent ? { color } : undefined}
        >
          {formatWeekRange(phase)}{isPast ? ' · завершена' : ''}
        </div>

        {isCurrent && (
          <PhaseExpandedCard
            phase={phase}
            color={color}
            testId="pd-rm-current-card"
          />
        )}

        {isFuture && (
          <>
            <button
              type="button"
              className="pd-rm-more-btn"
              onClick={onToggleExpand}
              aria-expanded={expanded}
            >
              {expanded ? 'Скрыть план' : 'План этой фазы'}
              <ChevronDown
                size={11}
                strokeWidth={2}
                className={`pd-rm-more-chev ${expanded ? 'pd-rm-more-chev--open' : ''}`}
                aria-hidden="true"
              />
            </button>
            {expanded && (
              <PhaseExpandedCard
                phase={phase}
                color={color}
                dim
                testId={`pd-rm-future-card-${phase.phase_number}`}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
};

PhaseRow.propTypes = {
  phase: PropTypes.object.isRequired,
  color: PropTypes.string.isRequired,
  PhaseIcon: PropTypes.elementType.isRequired,
  isPast: PropTypes.bool,
  isCurrent: PropTypes.bool,
  isFuture: PropTypes.bool,
  isLast: PropTypes.bool,
  expanded: PropTypes.bool,
  onToggleExpand: PropTypes.func,
};

// Формат диапазона недель: "Нед. 1–12" или "Нед. 60+"
const formatWeekRange = (phase) => {
  const start = phase.week_start ?? null;
  const end = phase.week_end ?? null;
  if (start == null && end == null) {
    if (phase.duration_weeks) return `~${phase.duration_weeks} нед.`;
    return '';
  }
  if (start != null && end == null) return `Нед. ${start}+`;
  if (start != null && end != null) {
    if (start === end) return `Нед. ${start}`;
    return `Нед. ${start}–${end}`;
  }
  return '';
};

// --- Главный компонент ---
export default function RoadmapScreen({ dashboardData, patient, onOpenProfile }) {
  const [phases, setPhases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedFutureId, setExpandedFutureId] = useState(null);


  // Загрузка фаз
  useEffect(() => {
    let alive = true;
    setLoading(true);
    rehab.getPhases()
      .then((res) => {
        if (!alive) return;
        const list = Array.isArray(res?.data) ? res.data : [];
        // Сортируем по phase_number — на всякий случай
        list.sort((a, b) => (a.phase_number || 0) - (b.phase_number || 0));
        setPhases(list);
      })
      .catch(() => { if (alive) setPhases([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const currentPhaseNumber = dashboardData?.program?.current_phase || 1;
  const currentPhase = useMemo(
    () => phases.find((p) => p.phase_number === currentPhaseNumber) || null,
    [phases, currentPhaseNumber]
  );

  const currentWeek = useMemo(
    () => getWeeksSinceSurgery(dashboardData?.program?.surgery_date),
    [dashboardData?.program?.surgery_date]
  );

  // Subtitle под заголовком: "Диагноз · Сторона · Сейчас: N-я неделя"
  const subtitle = useMemo(() => {
    const parts = [];
    const diag = dashboardData?.program?.diagnosis;
    if (diag) parts.push(diag);
    if (currentPhase?.title || currentPhase?.name) {
      parts.push(currentPhase.title || currentPhase.name);
    }
    if (currentWeek != null) parts.push(`Сейчас: ${currentWeek}-я неделя`);
    return parts.join(' · ');
  }, [dashboardData?.program?.diagnosis, currentPhase, currentWeek]);

  const toggleFuture = useCallback((phaseId) => {
    setExpandedFutureId((prev) => (prev === phaseId ? null : phaseId));
  }, []);

  if (loading) {
    return (
      <div className="pd-rm">
        <div className="pd-skeleton" style={{ height: 72, borderRadius: 12, marginBottom: 14 }} />
        <div className="pd-skeleton" style={{ height: 320, borderRadius: 12 }} />
      </div>
    );
  }

  return (
    <div className="pd-rm pd-roadmap-screen">
      {/* Header — заголовок + subtitle. Аватар единый в pd-header сверху. */}
      <header className="pd-rm-header">
        <div className="pd-rm-header-text">
          <h1 className="pd-rm-title">Путь восстановления</h1>
          {subtitle && <div className="pd-rm-subtitle-top">{subtitle}</div>}
        </div>
      </header>

      {/* Timeline */}
      <div className="pd-rm-timeline">
        {phases.length === 0 && (
          <p className="pd-rm-empty">Фазы реабилитации недоступны</p>
        )}
        {phases.map((phase, idx) => {
          const phaseNumber = phase.phase_number;
          const isPast = phaseNumber < currentPhaseNumber;
          const isCurrent = phaseNumber === currentPhaseNumber;
          const isFuture = phaseNumber > currentPhaseNumber;
          const isLast = idx === phases.length - 1;
          const PhaseIcon = PHASE_ICONS[phase.icon] || Target;
          const color = getPhaseColor(phaseNumber);

          return (
            <PhaseRow
              key={phase.id ?? `phase-${phaseNumber}`}
              phase={phase}
              color={color}
              PhaseIcon={PhaseIcon}
              isPast={isPast}
              isCurrent={isCurrent}
              isFuture={isFuture}
              isLast={isLast}
              expanded={expandedFutureId === (phase.id ?? phaseNumber)}
              onToggleExpand={() => toggleFuture(phase.id ?? phaseNumber)}
            />
          );
        })}
      </div>

      {/* Info note */}
      <div className="pd-rm-info">
        <Info size={14} color="var(--pd-n400)" aria-hidden="true" />
        <p>Сроки ориентировочные. Переход по решению специалиста при достижении критериев.</p>
      </div>
    </div>
  );
}

RoadmapScreen.propTypes = {
  dashboardData: PropTypes.shape({
    program: PropTypes.shape({
      surgery_date: PropTypes.string,
      current_phase: PropTypes.number,
      diagnosis: PropTypes.string,
    }),
  }),
  patient: PropTypes.shape({
    full_name: PropTypes.string,
    avatar_url: PropTypes.string,
  }),
  onOpenProfile: PropTypes.func,
};

RoadmapScreen.defaultProps = {
  onOpenProfile: () => {},
};
