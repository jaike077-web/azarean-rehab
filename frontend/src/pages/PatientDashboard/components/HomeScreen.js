import React, { useMemo, useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { Shield, RefreshCw, Dumbbell, Activity, Zap, Trophy, Target, Lightbulb, Video, ClipboardList, AlertTriangle, Hand, Map, FileText, Play } from 'lucide-react';
import { rehab } from '../../../services/api';
import { ProgressRing, Card } from './ui';

// Phase icon mapping — lucide components
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

// ProgressArc wrapper — теперь использует shared ProgressRing
const ProgressArcWrapper = ({ currentWeek, totalWeeks, phase }) => {
  const percentage = useMemo(() => {
    if (!totalWeeks || totalWeeks === 0) return 0;
    return Math.min(100, Math.round((currentWeek / totalWeeks) * 100));
  }, [currentWeek, totalWeeks]);

  return (
    <div className="pd-progress-arc">
      <ProgressRing
        value={percentage}
        size={140}
        strokeWidth={12}
        color={phase?.color || 'var(--pd-primary, #0D9488)'}
        color2={phase?.color2 || '#06B6D4'}
        sublabel={`${phase?.name || 'Фаза'} · Неделя ${currentWeek}`}
      />
    </div>
  );
};

ProgressArcWrapper.propTypes = {
  currentWeek: PropTypes.number.isRequired,
  totalWeeks: PropTypes.number.isRequired,
  phase: PropTypes.shape({
    name: PropTypes.string,
    color: PropTypes.string,
    color2: PropTypes.string,
  }),
};

// StatusCard Component - Phase info card
const StatusCard = ({ phase, currentWeek }) => {
  const PhaseIcon = PHASE_ICONS[phase?.icon] || Target;
  const bgColor = phase?.color || '#1A8A6A';

  return (
    <div
      className="pd-status-card"
      style={{
        background: `linear-gradient(135deg, ${bgColor}15 0%, ${bgColor}08 100%)`,
        borderLeft: `4px solid ${bgColor}`
      }}
    >
      <div className="pd-status-card-icon">
        <PhaseIcon size={28} />
      </div>
      <div className="pd-status-card-content">
        <div className="pd-status-card-title">
          {phase?.name || 'Фаза реабилитации'}
        </div>
        <div className="pd-status-card-week">
          Неделя {currentWeek} · {phase?.duration_weeks || 0} недель всего
        </div>
        <div className="pd-status-card-desc">
          {phase?.description || 'Следуйте рекомендациям вашего специалиста'}
        </div>
        <div className="pd-status-card-note">
          <em>Сроки ориентировочные и могут корректироваться специалистом</em>
        </div>
      </div>
    </div>
  );
};

StatusCard.propTypes = {
  phase: PropTypes.shape({
    name: PropTypes.string,
    icon: PropTypes.string,
    color: PropTypes.string,
    description: PropTypes.string,
    duration_weeks: PropTypes.number,
  }),
  currentWeek: PropTypes.number.isRequired,
};

// TipCard Component
const TipCard = ({ tip }) => {
  if (!tip) return null;

  return (
    <div className="pd-tip">
      <div className="pd-tip-header">
        <Lightbulb size={18} className="pd-tip-icon" />
        <span className="pd-tip-label">Совет дня</span>
      </div>
      <div className="pd-tip-title">{tip.title}</div>
      {tip.body && <div className="pd-tip-body">{tip.body}</div>}
    </div>
  );
};

TipCard.propTypes = {
  tip: PropTypes.shape({
    title: PropTypes.string.isRequired,
    body: PropTypes.string,
  }),
};

// VideoCard Component
const VideoCard = ({ video, phaseColor }) => {
  const handleVideoClick = () => {
    if (video.url) {
      window.open(video.url, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div
      className="pd-video-card"
      onClick={handleVideoClick}
      role="button"
      tabIndex={0}
      onKeyPress={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          handleVideoClick();
        }
      }}
    >
      <div className="pd-video-card-thumbnail">
        {video.thumbnail ? (
          <img src={video.thumbnail} alt={video.title} />
        ) : (
          <div
            className="pd-video-card-placeholder"
            style={{ background: `linear-gradient(135deg, ${phaseColor}40, ${phaseColor}20)` }}
          >
            <Video size={24} />
          </div>
        )}
        <div className="pd-video-card-play"><Play size={16} /></div>
      </div>
      <div className="pd-video-card-info">
        <div className="pd-video-card-title">{video.title}</div>
        {video.duration && (
          <div className="pd-video-card-duration">{video.duration}</div>
        )}
      </div>
    </div>
  );
};

VideoCard.propTypes = {
  video: PropTypes.shape({
    title: PropTypes.string.isRequired,
    url: PropTypes.string,
    thumbnail: PropTypes.string,
    duration: PropTypes.string,
  }).isRequired,
  phaseColor: PropTypes.string,
};

// SectionCard Component
const SectionCard = ({ icon, title, children }) => (
  <div className="pd-section">
    <div className="pd-section-header">
      <span className="pd-section-icon">{icon}</span>
      <h3 className="pd-section-title">{title}</h3>
    </div>
    {children}
  </div>
);

SectionCard.propTypes = {
  icon: PropTypes.string.isRequired,
  title: PropTypes.string.isRequired,
  children: PropTypes.node,
};

// LoadingSkeleton Component
const LoadingSkeleton = () => (
  <div className="pd-loading">
    <div className="pd-skeleton" style={{ height: '60px', marginBottom: '16px' }} />
    <div className="pd-skeleton" style={{ height: '200px', marginBottom: '16px' }} />
    <div className="pd-skeleton" style={{ height: '150px', marginBottom: '16px' }} />
    <div className="pd-skeleton" style={{ height: '100px', marginBottom: '16px' }} />
  </div>
);

// EmptyState Component
const EmptyState = ({ goTo }) => (
  <div className="pd-empty-state">
    <div className="pd-empty-state-icon"><ClipboardList size={36} /></div>
    <h3 className="pd-empty-state-title">Программа не создана</h3>
    <p className="pd-empty-state-text">
      Ваш инструктор ещё не создал программу реабилитации.
      Пожалуйста, свяжитесь с ним для получения подробностей.
    </p>
    <button
      className="pd-empty-state-btn"
      onClick={() => goTo(3)}
    >
      Связаться
    </button>
  </div>
);

EmptyState.propTypes = {
  goTo: PropTypes.func.isRequired,
};

// Main HomeScreen Component
const HomeScreen = ({ dashboardData, goTo }) => {
  const program = dashboardData?.program;
  const phase = dashboardData?.phase;
  const streak = dashboardData?.streak;
  const tip = dashboardData?.tip;
  const diaryFilledToday = dashboardData?.diaryFilledToday;

  // Сегодняшний комплекс для блока "Начать тренировку"
  const [todayComplex, setTodayComplex] = useState(null);
  useEffect(() => {
    rehab.getMyExercises()
      .then((res) => setTodayComplex(res.data || null))
      .catch(() => {});
  }, []);

  // Calculate current week (must be before any early returns)
  const currentWeek = useMemo(() =>
    getWeeksSinceSurgery(program?.surgery_date),
    [program?.surgery_date]
  );

  // Loading state
  if (dashboardData === null) {
    return <LoadingSkeleton />;
  }

  // Empty state - no program
  if (!program) {
    return <EmptyState goTo={goTo} />;
  }

  // Get patient name
  const patientName = program.patient_name || 'Пациент';

  // Get total weeks from phase
  const totalWeeks = phase?.duration_weeks || 12;

  return (
    <div className="pd-home-screen">
      {/* Training Card — блок "Начать тренировку" (самый верх) */}
      {todayComplex && (
        <Card variant="hero" className="pd-training-card" gradient="var(--pd-gradient-primary, linear-gradient(135deg, #0D9488, #06B6D4))">
          <div className="pd-training-header">
            <Dumbbell size={22} className="pd-training-icon" />
            <div className="pd-training-info">
              <div className="pd-training-title">
                {todayComplex.complex_title || 'Комплекс упражнений'}
              </div>
              {todayComplex.exercise_count && (
                <div className="pd-training-sub">{todayComplex.exercise_count} упражнений</div>
              )}
            </div>
          </div>
          <button
            className="pd-training-btn"
            onClick={() => goTo(4, { autoStart: true, complexId: todayComplex.complex_id })}
          >
            <Play size={18} />
            Начать тренировку
          </button>
        </Card>
      )}

      {/* Greeting */}
      <div className="pd-greeting">
        <h2 className="pd-greeting-text">
          Добрый день, <strong>{patientName}</strong>
        </h2>
        <Hand size={22} className="pd-greeting-emoji" />
      </div>

      {/* Progress Ring */}
      <ProgressArcWrapper
        currentWeek={currentWeek}
        totalWeeks={totalWeeks}
        phase={phase}
      />

      {/* Status Card */}
      {phase && (
        <StatusCard
          phase={phase}
          currentWeek={currentWeek}
        />
      )}

      {/* Tip Card */}
      {tip && <TipCard tip={tip} />}

      {/* Quick Actions */}
      <div className="pd-quick-actions">
        <button
          className="pd-quick-action"
          onClick={() => goTo(4)}
          aria-label="Упражнения"
        >
          <Dumbbell size={20} className="pd-quick-action-icon" />
          <span className="pd-quick-action-label">Упражнения</span>
        </button>
        <button
          className="pd-quick-action"
          onClick={() => goTo(2)}
          aria-label="Дневник"
        >
          <FileText size={20} className="pd-quick-action-icon" />
          <span className="pd-quick-action-label">Дневник</span>
          {diaryFilledToday && (
            <span className="pd-quick-action-badge">✓</span>
          )}
        </button>
        <button
          className="pd-quick-action"
          onClick={() => goTo(1)}
          aria-label="Дорожная карта"
        >
          <Map size={20} className="pd-quick-action-icon" />
          <span className="pd-quick-action-label">Путь</span>
        </button>
      </div>

      {/* Videos Section */}
      {phase?.videos && phase.videos.length > 0 && (
        <SectionCard icon={<Video size={18} />} title="Видео для вас">
          <div className="pd-video-grid">
            {phase.videos.map((video, index) => (
              <VideoCard
                key={video.id || index}
                video={video}
                phaseColor={phase.color}
              />
            ))}
          </div>
        </SectionCard>
      )}

      {/* Emergency Button */}
      <button
        className="pd-emergency-btn"
        onClick={() => goTo(3)}
      >
        <AlertTriangle size={18} className="pd-emergency-icon" />
        <span className="pd-emergency-text">Экстренная связь</span>
      </button>
    </div>
  );
};

HomeScreen.propTypes = {
  dashboardData: PropTypes.shape({
    program: PropTypes.shape({
      patient_name: PropTypes.string,
      surgery_date: PropTypes.string,
      current_phase: PropTypes.number,
    }),
    phase: PropTypes.shape({
      name: PropTypes.string,
      icon: PropTypes.string,
      color: PropTypes.string,
      color2: PropTypes.string,
      description: PropTypes.string,
      duration_weeks: PropTypes.number,
      videos: PropTypes.arrayOf(PropTypes.shape({
        id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
        title: PropTypes.string.isRequired,
        url: PropTypes.string,
        thumbnail: PropTypes.string,
        duration: PropTypes.string,
      })),
    }),
    streak: PropTypes.shape({
      current: PropTypes.number,
      best: PropTypes.number,
      atRisk: PropTypes.bool,
    }),
    lastDiary: PropTypes.string,
    tip: PropTypes.shape({
      title: PropTypes.string,
      body: PropTypes.string,
    }),
    diaryFilledToday: PropTypes.bool,
  }),
  goTo: PropTypes.func.isRequired,
};

export default HomeScreen;
