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
  Info, AlertTriangle, Clock,
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

// M1: ярлык сустава для заголовка зоны (зеркало ExercisesScreen).
const JOINT_LABELS = {
  knee: 'Колено',
  shoulder: 'Плечо',
  hip: 'Тазобедренный',
  elbow: 'Локоть',
  ankle: 'Голеностоп',
  spine: 'Позвоночник',
  wrist: 'Запястье',
};

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
// Wave 0 commit 06 — добавлен goTo для навигации на ContactScreen с pre-filled
// сообщением при нажатии CTA в баннере застревания. goTo уже передаётся через
// screenProps в PatientDashboard.js, не требует нового prop'а.
export default function RoadmapScreen({ dashboardData, patient, onOpenProfile, goTo }) {
  // Мультитрек (M1): { [programId]: phase[] } — фазы протокола каждой активной зоны.
  const [phasesByProgram, setPhasesByProgram] = useState({});
  const [loading, setLoading] = useState(true);
  // Составной ключ развёрнутой future-фазы: `${programId}:${phaseId}` (одна на экран).
  const [expandedFutureKey, setExpandedFutureKey] = useState(null);
  // Какая ВТОРИЧНАЯ зона развёрнута (ведущая всегда развёрнута, в это состояние не входит).
  const [expandedProgramId, setExpandedProgramId] = useState(null);
  // Wave 0 commit 06 — застрял ли пациент на текущей фазе (ведущей зоны).
  // null до загрузки, потом объект из endpoint'а или { is_stuck: false }
  // при ошибке/отсутствии программы.
  const [stuckStatus, setStuckStatus] = useState(null);

  // Активные программы пациента (мультипрограммный «Путь», M0/M1). Backend /my/dashboard
  // отдаёт programs[] (отсортированы priority ASC, ведущая = [0]). Fallback на single
  // program — для старого бандла/мока без programs[].
  const programs = useMemo(
    () => (Array.isArray(dashboardData?.programs) && dashboardData.programs.length > 0
      ? dashboardData.programs
      : (dashboardData?.program ? [dashboardData.program] : [])),
    [dashboardData]
  );
  const leading = programs[0] || null;

  // Загрузка фаз per-program в phasesByProgram. getPhases на каждый program_type
  // (разные протоколы → разные наборы фаз). program_type из rp.* (Wave 1 #1.04).
  useEffect(() => {
    if (programs.length === 0) {
      setPhasesByProgram({});
      setLoading(false);
      return undefined;
    }
    let alive = true;
    setLoading(true);
    Promise.all(programs.map((p) => (
      p.program_type
        ? rehab.getPhases(p.program_type)
            .then((res) => {
              const list = Array.isArray(res?.data) ? res.data.slice() : [];
              list.sort((a, b) => (a.phase_number || 0) - (b.phase_number || 0));
              return [p.id, list];
            })
            .catch(() => [p.id, []])
        : Promise.resolve([p.id, []])
    )))
      .then((pairs) => { if (alive) setPhasesByProgram(Object.fromEntries(pairs)); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [programs]);

  // Wave 0 commit 06 — статус застревания. Ошибка глушится: если бэкенд
  // недоступен, баннер просто не показывается, остальной экран рендерится.
  useEffect(() => {
    let alive = true;
    rehab.getStuckStatus()
      .then((res) => {
        if (!alive) return;
        setStuckStatus(res?.data || { is_stuck: false });
      })
      .catch(() => {
        if (alive) setStuckStatus({ is_stuck: false });
      });
    return () => { alive = false; };
  }, []);

  const handleContactCurator = useCallback(() => {
    if (typeof goTo !== 'function' || !stuckStatus) return;
    const weeks = Math.round(stuckStatus.actual_weeks || 0);
    const phaseLabel = stuckStatus.phase_title
      ? `«${stuckStatus.phase_title}»`
      : '';
    const msg = `Здравствуйте! Я на фазе ${stuckStatus.current_phase} ${phaseLabel} уже ${weeks} недель. Хочу обсудить прогресс.`.replace(/\s+/g, ' ').trim();
    // tab 3 = ContactScreen в маппинге PatientDashboard.js
    goTo(3, { prefilledMessage: msg });
  }, [goTo, stuckStatus]);

  const currentWeek = useMemo(
    () => getWeeksSinceSurgery(leading?.surgery_date),
    [leading]
  );

  // Текущая фаза ведущей зоны — из загруженных фаз (как в исходном коде), для subtitle.
  const leadingPhase = useMemo(() => {
    if (!leading) return null;
    const list = phasesByProgram[leading.id] || [];
    const num = leading.current_phase ?? 1;
    return list.find((p) => p.phase_number === num) || null;
  }, [leading, phasesByProgram]);

  // Subtitle под заголовком = ведущая зона: "Диагноз · Фаза · Сейчас: N-я неделя".
  const subtitle = useMemo(() => {
    const parts = [];
    if (leading?.diagnosis) parts.push(leading.diagnosis);
    if (leadingPhase?.title || leadingPhase?.name) parts.push(leadingPhase.title || leadingPhase.name);
    if (currentWeek != null) parts.push(`Сейчас: ${currentWeek}-я неделя`);
    return parts.join(' · ');
  }, [leading, leadingPhase, currentWeek]);

  const toggleFuture = useCallback((key) => {
    setExpandedFutureKey((prev) => (prev === key ? null : key));
  }, []);

  const toggleProgram = useCallback((programId) => {
    setExpandedProgramId((prev) => (prev === programId ? null : programId));
  }, []);

  // Рендер timeline фаз одной зоны (программы). Past/current/future-логика и PhaseRow
  // — 1:1 как раньше; только источник фаз и currentPhaseNumber теперь per-program.
  const renderTimeline = useCallback((program) => {
    const list = phasesByProgram[program.id] || [];
    // ?? 1 (не || 1): фаза 0 (prehab, D3) — реальная текущая, не подменяем на 1.
    const currentPhaseNumber = program.current_phase ?? 1;
    if (list.length === 0) {
      return <p className="pd-rm-empty">Фазы восстановления недоступны</p>;
    }
    return list.map((phase, idx) => {
      const phaseNumber = phase.phase_number;
      const isPast = phaseNumber < currentPhaseNumber;
      const isCurrent = phaseNumber === currentPhaseNumber;
      const isFuture = phaseNumber > currentPhaseNumber;
      const isLast = idx === list.length - 1;
      const PhaseIcon = PHASE_ICONS[phase.icon] || Target;
      const color = getPhaseColor(phaseNumber);
      // Составной ключ: phase.id может совпадать между протоколами (acl vs shoulder).
      const futureKey = `${program.id}:${phase.id ?? phaseNumber}`;
      return (
        <PhaseRow
          key={futureKey}
          phase={phase}
          color={color}
          PhaseIcon={PhaseIcon}
          isPast={isPast}
          isCurrent={isCurrent}
          isFuture={isFuture}
          isLast={isLast}
          expanded={expandedFutureKey === futureKey}
          onToggleExpand={() => toggleFuture(futureKey)}
        />
      );
    });
  }, [phasesByProgram, expandedFutureKey, toggleFuture]);

  if (loading) {
    return (
      <div className="pd-rm">
        <div className="pd-skeleton" style={{ height: 72, borderRadius: 12, marginBottom: 14 }} />
        <div className="pd-skeleton" style={{ height: 320, borderRadius: 12 }} />
      </div>
    );
  }

  // Wave 1 #1.04: пациент без активной программы (или ни одной зоны с program_type —
  // путь не построить) — пустой state вместо фаз ACL по дефолту.
  if (programs.length === 0 || !programs.some((p) => p.program_type)) {
    return (
      <div className="pd-rm pd-roadmap-screen">
        <header className="pd-rm-header">
          <h1 className="pd-rm-title">Программа восстановления</h1>
          <p className="pd-rm-sub">У вас пока нет активной программы. Куратор скоро её составит.</p>
        </header>
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

      {/* Wave 0 commit 06 — баннер застревания на фазе.
          Не агрессивный (жёлтый info-tone), CTA → переход на Связь
          с pre-filled сообщением. Inline-стили: RoadmapScreen.css
          в uncommitted dark-theme правках, не миксуем коммиты. */}
      {stuckStatus?.is_stuck && (
        <div
          role="status"
          style={{
            display: 'flex',
            gap: 12,
            padding: '14px 16px',
            margin: '0 0 16px 0',
            borderRadius: 12,
            background: 'rgba(251, 191, 36, 0.10)',
            border: '1px solid rgba(251, 191, 36, 0.32)',
          }}
        >
          <div
            aria-hidden="true"
            style={{
              flexShrink: 0,
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: '#fbbf24',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Clock size={18} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: '0.9rem', fontWeight: 600,
              color: 'var(--pd-n800, #1c1917)', marginBottom: 4,
            }}>
              Ты на этой фазе уже {Math.round(stuckStatus.actual_weeks)} недель
            </div>
            <div style={{
              fontSize: '0.8rem', lineHeight: 1.45,
              color: 'var(--pd-n600, #57534e)', marginBottom: 10,
            }}>
              Это нормально, у разных людей сроки разные.
              Если беспокоит — обсуди прогресс с куратором.
            </div>
            <button
              type="button"
              onClick={handleContactCurator}
              style={{
                background: 'transparent',
                border: '1.5px solid var(--pd-color-primary, #0d9488)',
                color: 'var(--pd-color-primary, #0d9488)',
                padding: '7px 14px',
                borderRadius: 8,
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
                minHeight: 36,
              }}
            >
              Связаться с куратором
            </button>
          </div>
        </div>
      )}

      {/* Timeline — мультитрек. Одна зона → как раньше (без аккордеон-хрома).
          Несколько зон → аккордеон: ведущая [0] развёрнута + бейдж «Ведущая»,
          вторичные свёрнуты, у каждой свой timeline и своя текущая фаза. */}
      {programs.length === 1 ? (
        <div className="pd-rm-timeline">
          {renderTimeline(programs[0])}
        </div>
      ) : (
        <div className="pd-rm-accordion">
          {programs.map((program, idx) => {
            const isLeading = idx === 0;
            const open = isLeading || expandedProgramId === program.id;
            const phaseLabel = program.phase?.name || program.phase?.title
              || `Фаза ${program.current_phase ?? 1}`;
            const zoneTitle = program.program_label || program.title || 'Программа';
            const zoneJoint = JOINT_LABELS[program.program_joint] || null;
            return (
              <div
                key={program.id}
                className={`pd-rm-track ${isLeading ? 'pd-rm-track--leading' : ''}`}
                data-testid={`pd-rm-track-${program.id}`}
              >
                {isLeading ? (
                  <div className="pd-rm-track-header pd-rm-track-header--leading">
                    <span className="pd-rm-track-title">{zoneTitle}</span>
                    {zoneJoint && <span className="pd-rm-track-joint">{zoneJoint}</span>}
                    <span className="pd-rm-track-badge">Ведущая</span>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="pd-rm-track-header"
                    onClick={() => toggleProgram(program.id)}
                    aria-expanded={open}
                  >
                    <span className="pd-rm-track-title">{zoneTitle}</span>
                    {zoneJoint && <span className="pd-rm-track-joint">{zoneJoint}</span>}
                    <span className="pd-rm-track-status">{phaseLabel}</span>
                    <ChevronDown
                      size={16}
                      strokeWidth={2}
                      className={`pd-rm-track-chev ${open ? 'pd-rm-track-chev--open' : ''}`}
                      aria-hidden="true"
                    />
                  </button>
                )}
                {open && (
                  <div className="pd-rm-track-body">
                    <div className="pd-rm-timeline">
                      {renderTimeline(program)}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

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
    programs: PropTypes.arrayOf(PropTypes.shape({
      id: PropTypes.number,
      program_type: PropTypes.string,
      program_label: PropTypes.string,
      program_joint: PropTypes.string,
      current_phase: PropTypes.number,
      priority: PropTypes.number,
      phase: PropTypes.object,
    })),
  }),
  patient: PropTypes.shape({
    full_name: PropTypes.string,
    avatar_url: PropTypes.string,
  }),
  onOpenProfile: PropTypes.func,
  goTo: PropTypes.func,
};

RoadmapScreen.defaultProps = {
  onOpenProfile: () => {},
  goTo: undefined,
};
