import React, { useMemo } from 'react';
import PropTypes from 'prop-types';

// Phase icon mapping
const PHASE_ICONS = {
  shield: '🛡️',
  move: '🔄',
  dumbbell: '💪',
  activity: '🏃',
  trophy: '⚡',
  star: '🏆',
};

// Calculate weeks since surgery
const getWeeksSinceSurgery = (surgeryDate) => {
  if (!surgeryDate) return 0;
  const diff = Date.now() - new Date(surgeryDate).getTime();
  return Math.max(0, Math.floor(diff / (7 * 24 * 60 * 60 * 1000)));
};

// ProgressArc Component - SVG semi-circle progress visualization
const ProgressArc = ({ currentWeek, totalWeeks, phase }) => {
  const percentage = useMemo(() => {
    if (!totalWeeks || totalWeeks === 0) return 0;
    return Math.min(100, Math.round((currentWeek / totalWeeks) * 100));
  }, [currentWeek, totalWeeks]);

  // SVG Arc calculations
  const size = 200;
  const strokeWidth = 12;
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * Math.PI; // Half circle
  const offset = circumference - (circumference * percentage) / 100;

  return (
    <div className="pd-progress-arc">
      <svg width={size} height={size / 2 + 20} viewBox={`0 0 ${size} ${size / 2 + 20}`}>
        <defs>
          <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={phase?.color || '#1A8A6A'} />
            <stop offset="100%" stopColor={phase?.color2 || '#2B7CB8'} />
          </linearGradient>
        </defs>

        {/* Background arc */}
        <path
          d={`M ${strokeWidth / 2} ${size / 2} A ${radius} ${radius} 0 0 1 ${size - strokeWidth / 2} ${size / 2}`}
          fill="none"
          stroke="#E2E8F0"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />

        {/* Progress arc */}
        <path
          d={`M ${strokeWidth / 2} ${size / 2} A ${radius} ${radius} 0 0 1 ${size - strokeWidth / 2} ${size / 2}`}
          fill="none"
          stroke="url(#progressGradient)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
      </svg>

      <div className="pd-progress-arc-text">
        <div className="pd-progress-arc-percentage">{percentage}%</div>
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

// StatusCard Component - Phase info card
const StatusCard = ({ phase, currentWeek }) => {
  const icon = PHASE_ICONS[phase?.icon] || '🎯';
  const bgColor = phase?.color || '#1A8A6A';

  return (
    <div
      className="pd-status-card"
      style={{
        background: `linear-gradient(135deg, ${bgColor}15 0%, ${bgColor}08 100%)`,
        borderLeft: `4px solid ${bgColor}`
      }}
    >
      <div className="pd-status-card-icon" style={{ fontSize: '32px' }}>
        {icon}
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
        <span className="pd-tip-icon">💡</span>
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
            🎬
          </div>
        )}
        <div className="pd-video-card-play">▶</div>
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
    <div className="pd-empty-state-icon">📋</div>
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
      {/* Greeting */}
      <div className="pd-greeting">
        <h2 className="pd-greeting-text">
          Добрый день, <strong>{patientName}</strong>
        </h2>
        <span className="pd-greeting-emoji">👋</span>
      </div>

      {/* Progress Arc */}
      <ProgressArc
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
          <span className="pd-quick-action-icon">🏋️</span>
          <span className="pd-quick-action-label">Упражнения</span>
        </button>
        <button
          className="pd-quick-action"
          onClick={() => goTo(2)}
          aria-label="Дневник"
        >
          <span className="pd-quick-action-icon">📝</span>
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
          <span className="pd-quick-action-icon">🗺️</span>
          <span className="pd-quick-action-label">Путь</span>
        </button>
      </div>

      {/* Videos Section */}
      {phase?.videos && phase.videos.length > 0 && (
        <SectionCard icon="🎬" title="Видео для вас">
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
        <span className="pd-emergency-icon">🚨</span>
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
