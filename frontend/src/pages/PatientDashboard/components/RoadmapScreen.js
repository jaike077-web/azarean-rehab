import React, { useState, useEffect, useMemo, useCallback } from 'react';
import PropTypes from 'prop-types';
import {
  Shield, RefreshCw, Dumbbell, Activity, Zap, Trophy,
  Target, Ban, CheckCircle2, Snowflake, Home as HomeIcon,
  AlertTriangle, BarChart3, MessageCircle, Check, Info, Plus, Minus, PartyPopper
} from 'lucide-react';
import { rehab } from '../../../services/api';

// Phase icon mapping (lucide components)
const PHASE_ICONS = {
  shield: Shield,
  move: RefreshCw,
  dumbbell: Dumbbell,
  activity: Activity,
  trophy: Zap,
  star: Trophy,
};

// Calculate weeks since surgery
const getWeeksSinceSurgery = (surgeryDate) => {
  if (!surgeryDate) return 0;
  const diff = Date.now() - new Date(surgeryDate).getTime();
  return Math.max(0, Math.floor(diff / (7 * 24 * 60 * 60 * 1000)));
};

// Tab configuration (icons = lucide components)
const TABS = [
  { id: 'goals', label: 'Цели', Icon: Target },
  { id: 'restrictions', label: 'Нельзя', Icon: Ban },
  { id: 'allowed', label: 'Можно', Icon: CheckCircle2 },
  { id: 'pain', label: 'Боль', Icon: Snowflake },
  { id: 'daily', label: 'Быт', Icon: HomeIcon },
  { id: 'red_flags', label: 'Врач', Icon: AlertTriangle },
  { id: 'criteria_next', label: 'Переход', Icon: BarChart3 },
  { id: 'faq', label: 'FAQ', Icon: MessageCircle },
];

// ProgressArc Component (reused from HomeScreen)
const ProgressArc = ({ currentWeek, totalWeeks, phase }) => {
  const percentage = useMemo(() => {
    if (!totalWeeks || totalWeeks === 0) return 0;
    return Math.min(100, Math.round((currentWeek / totalWeeks) * 100));
  }, [currentWeek, totalWeeks]);

  const size = 140;
  const strokeWidth = 12;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (circumference * percentage) / 100;
  const center = size / 2;

  return (
    <div className="pd-progress-arc">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <linearGradient id="roadmapProgressGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={phase?.color || '#1A8A6A'} />
            <stop offset="100%" stopColor={phase?.color2 || '#3B82C8'} />
          </linearGradient>
        </defs>

        <circle cx={center} cy={center} r={radius} fill="none" stroke="#ECEEF3" strokeWidth={strokeWidth} />
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="url(#roadmapProgressGradient)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${center} ${center})`}
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
        <text
          x={center}
          y={center}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize="26"
          fontWeight="800"
          fontFamily="'Nunito Sans', sans-serif"
          fill="#171C2B"
        >
          {percentage}%
        </text>
      </svg>

      <div className="pd-progress-arc-text">
        <div className="pd-progress-arc-label">
          {phase?.name || 'Фаза'} · Неделя {currentWeek}
        </div>
      </div>
    </div>
  );
};

ProgressArc.propTypes = {
  currentWeek: PropTypes.number.isRequired,
  totalWeeks: PropTypes.number.isRequired,
  phase: PropTypes.shape({
    name: PropTypes.string,
    color: PropTypes.string,
    color2: PropTypes.string,
  }),
};

// BulletList Component
const BulletList = ({ items, color }) => {
  if (!items || items.length === 0) {
    return <p className="pd-bullet-empty">Информация отсутствует</p>;
  }

  return (
    <ul className="pd-bullet-list">
      {items.map((item, index) => (
        <li key={index} className="pd-bullet-item">
          <span
            className="pd-bullet-dot"
            style={{ backgroundColor: color || '#1A8A6A' }}
          />
          <span className="pd-bullet-text">{item}</span>
        </li>
      ))}
    </ul>
  );
};

BulletList.propTypes = {
  items: PropTypes.arrayOf(PropTypes.string),
  color: PropTypes.string,
};

// Criteria Component with checkboxes
const Criteria = ({ items, color }) => {
  const [checkedItems, setCheckedItems] = useState({});

  const handleToggle = useCallback((index) => {
    setCheckedItems(prev => ({
      ...prev,
      [index]: !prev[index]
    }));
  }, []);

  const progress = useMemo(() => {
    if (!items || items.length === 0) return 0;
    const checked = Object.values(checkedItems).filter(Boolean).length;
    return Math.round((checked / items.length) * 100);
  }, [checkedItems, items]);

  const allChecked = items && items.length > 0 && progress === 100;

  if (!items || items.length === 0) {
    return <p className="pd-bullet-empty">Критерии не установлены</p>;
  }

  return (
    <div className="pd-criteria">
      <div className="pd-criteria-progress">
        <div className="pd-criteria-bar">
          <div
            className="pd-criteria-fill"
            style={{
              width: `${progress}%`,
              backgroundColor: color || '#1A8A6A',
              transition: 'width 0.3s ease'
            }}
          />
        </div>
        <span className="pd-criteria-percentage">{progress}%</span>
      </div>

      <ul className="pd-criteria-list">
        {items.map((item, index) => (
          <li
            key={index}
            className="pd-criteria-item"
            onClick={() => handleToggle(index)}
            role="checkbox"
            aria-checked={!!checkedItems[index]}
            tabIndex={0}
            onKeyPress={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleToggle(index);
              }
            }}
          >
            <span
              className={`pd-criteria-check ${checkedItems[index] ? 'pd-criteria-check--checked' : ''}`}
              style={{
                borderColor: checkedItems[index] ? color || '#1A8A6A' : '#CBD5E0',
                backgroundColor: checkedItems[index] ? color || '#1A8A6A' : 'transparent'
              }}
            >
              {checkedItems[index] && <Check size={14} strokeWidth={3} color="#fff" />}
            </span>
            <span className="pd-criteria-text">{item}</span>
          </li>
        ))}
      </ul>

      {allChecked && (
        <div className="pd-criteria-success">
          <PartyPopper size={18} />
          <span>Отлично! Вы готовы к следующей фазе. Обсудите переход со специалистом.</span>
        </div>
      )}
    </div>
  );
};

Criteria.propTypes = {
  items: PropTypes.arrayOf(PropTypes.string),
  color: PropTypes.string,
};

// FAQ Component with accordion
const FAQ = ({ items, color }) => {
  const [openIndex, setOpenIndex] = useState(null);

  const handleToggle = useCallback((index) => {
    setOpenIndex(prev => prev === index ? null : index);
  }, []);

  if (!items || items.length === 0) {
    return <p className="pd-bullet-empty">Вопросы и ответы не добавлены</p>;
  }

  return (
    <div className="pd-faq">
      {items.map((item, index) => {
        const isOpen = openIndex === index;
        return (
          <div
            key={index}
            className={`pd-faq-item ${isOpen ? 'pd-faq-item--open' : ''}`}
          >
            <button
              className="pd-faq-question"
              onClick={() => handleToggle(index)}
              aria-expanded={isOpen}
              style={{
                borderLeftColor: isOpen ? color || '#1A8A6A' : 'transparent'
              }}
            >
              <span className="pd-faq-question-text">{item.question}</span>
              <span
                className="pd-faq-toggle"
                style={{ color: isOpen ? color || '#1A8A6A' : '#718096' }}
              >
                {isOpen ? <Minus size={18} /> : <Plus size={18} />}
              </span>
            </button>
            {isOpen && (
              <div className="pd-faq-answer">
                {item.answer}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

FAQ.propTypes = {
  items: PropTypes.arrayOf(PropTypes.shape({
    question: PropTypes.string.isRequired,
    answer: PropTypes.string.isRequired,
  })),
  color: PropTypes.string,
};

// PhaseStepper Component - Vertical timeline
const PhaseStepper = ({ phases, currentPhaseNumber }) => {
  return (
    <div className="pd-stepper">
      {phases.map((phase, index) => {
        const phaseNumber = phase.phase_number;
        const isPast = phaseNumber < currentPhaseNumber;
        const isActive = phaseNumber === currentPhaseNumber;
        const PhaseIcon = PHASE_ICONS[phase.icon] || Target;

        return (
          <div key={phase.id ?? `phase-${index}`} className="pd-stepper-row">
            {/* Connector line */}
            {index > 0 && (
              <div
                className={`pd-stepper-line ${isPast ? 'pd-stepper-line--completed' : ''}`}
              />
            )}

            {/* Phase circle */}
            <div
              className={`pd-stepper-circle ${
                isPast ? 'pd-stepper-circle--completed' :
                isActive ? 'pd-stepper-circle--active' :
                'pd-stepper-circle--future'
              }`}
              style={{
                backgroundColor: isActive ? phase.color : isPast ? '#48BB78' : '#E2E8F0',
                borderColor: isActive ? phase.color : 'transparent',
                boxShadow: isActive ? `0 0 0 4px ${phase.color}20` : 'none',
                color: isActive || isPast ? '#fff' : '#5A6275',
              }}
            >
              {isPast ? <Check size={18} strokeWidth={3} /> : <PhaseIcon size={18} />}
            </div>

            {/* Phase info */}
            <div className="pd-stepper-content">
              <div className="pd-stepper-name">{phase.name}</div>
              <div className="pd-stepper-subtitle">
                Недели {phase.week_start}-{phase.week_end}
              </div>
              {phase.teaser && (
                <div className="pd-stepper-teaser">{phase.teaser}</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

PhaseStepper.propTypes = {
  phases: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    phase_number: PropTypes.number.isRequired,
    name: PropTypes.string.isRequired,
    icon: PropTypes.string,
    color: PropTypes.string,
    week_start: PropTypes.number,
    week_end: PropTypes.number,
    teaser: PropTypes.string,
  })).isRequired,
  currentPhaseNumber: PropTypes.number.isRequired,
};

// Main RoadmapScreen Component
const RoadmapScreen = ({ dashboardData }) => {
  const [phases, setPhases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('goals');

  // Fetch phases on mount
  useEffect(() => {
    const fetchPhases = async () => {
      try {
        setLoading(true);
        const response = await rehab.getPhases();
        setPhases(response.data || []);
      } catch (error) {
        console.error('Failed to fetch phases:', error);
        setPhases([]);
      } finally {
        setLoading(false);
      }
    };

    fetchPhases();
  }, []);

  // Calculate current week and find current phase
  const currentWeek = useMemo(() =>
    getWeeksSinceSurgery(dashboardData?.program?.surgery_date),
    [dashboardData?.program?.surgery_date]
  );

  const currentPhaseNumber = dashboardData?.program?.current_phase || 1;

  const currentPhase = useMemo(() =>
    phases.find(p => p.phase_number === currentPhaseNumber),
    [phases, currentPhaseNumber]
  );

  const totalWeeks = currentPhase?.duration_weeks || 12;

  // Render tab content
  const renderTabContent = () => {
    if (!currentPhase) {
      return <p className="pd-bullet-empty">{loading ? 'Загрузка данных фазы...' : 'Информация о фазе недоступна'}</p>;
    }

    const isFuturePhase = currentPhaseNumber < (dashboardData?.program?.current_phase || 1);

    if (isFuturePhase) {
      return (
        <div className="pd-future-phase-notice">
          <Target size={22} className="pd-future-phase-icon" />
          <p>Детали этой фазы станут доступны, когда вы до неё дойдёте</p>
        </div>
      );
    }

    const color = currentPhase.color || '#1A8A6A';

    switch (tab) {
      case 'goals':
        return <BulletList items={currentPhase.goals} color={color} />;
      case 'restrictions':
        return <BulletList items={currentPhase.restrictions} color={color} />;
      case 'allowed':
        return <BulletList items={currentPhase.allowed} color={color} />;
      case 'pain':
        return <BulletList items={currentPhase.pain} color={color} />;
      case 'daily':
        return <BulletList items={currentPhase.daily} color={color} />;
      case 'red_flags':
        return <BulletList items={currentPhase.red_flags} color={color} />;
      case 'criteria_next':
        return <Criteria items={currentPhase.criteria_next} color={color} />;
      case 'faq':
        return <FAQ items={currentPhase.faq} color={color} />;
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="pd-loading">
        <div className="pd-skeleton" style={{ height: '200px', marginBottom: '16px' }} />
        <div className="pd-skeleton" style={{ height: '300px', marginBottom: '16px' }} />
      </div>
    );
  }

  return (
    <div className="pd-roadmap-screen">
      {/* Title */}
      <h1 className="pd-screen-title">Дорожная карта</h1>

      {/* Progress Arc */}
      {dashboardData?.phase && (
        <ProgressArc
          currentWeek={currentWeek}
          totalWeeks={totalWeeks}
          phase={dashboardData.phase}
        />
      )}

      {/* Phase Stepper */}
      <PhaseStepper
        phases={phases}
        currentPhaseNumber={currentPhaseNumber}
      />

      {/* Info Note */}
      <div className="pd-info-note">
        <Info size={18} className="pd-info-note-icon" />
        <p className="pd-info-note-text">
          Сроки фаз ориентировочные. Переход происходит по готовности и решению вашего специалиста.
        </p>
      </div>

      {/* Content Tabs */}
      <div className="pd-tabs-wrapper">
        <div className="pd-tabs">
          {TABS.map((t) => {
            const TabIcon = t.Icon;
            const isActive = tab === t.id;
            return (
              <button
                key={t.id}
                className={`pd-tab ${isActive ? 'pd-tab--active' : ''}`}
                onClick={() => setTab(t.id)}
                style={{
                  borderBottomColor: isActive ? currentPhase?.color || '#1A8A6A' : 'transparent',
                  backgroundColor: isActive ? `${currentPhase?.color || '#1A8A6A'}10` : 'transparent',
                  color: isActive ? currentPhase?.color || '#1A8A6A' : undefined,
                }}
              >
                <TabIcon size={16} className="pd-tab-icon" />
                <span className="pd-tab-label">{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content */}
      <div className="pd-tab-content pd-fade-in" key={tab}>
        {renderTabContent()}
      </div>
    </div>
  );
};

RoadmapScreen.propTypes = {
  dashboardData: PropTypes.shape({
    program: PropTypes.shape({
      surgery_date: PropTypes.string,
      current_phase: PropTypes.number,
    }),
    phase: PropTypes.shape({
      name: PropTypes.string,
      color: PropTypes.string,
      color2: PropTypes.string,
      duration_weeks: PropTypes.number,
    }),
  }),
};

export default RoadmapScreen;
