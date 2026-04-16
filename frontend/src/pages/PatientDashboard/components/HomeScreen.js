import React, { useMemo, useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import {
  Shield, RefreshCw, Dumbbell, Activity, Zap, Trophy, Target,
  Lightbulb, Moon, Video, ClipboardList, AlertTriangle, Map, FileText,
  Play, ChevronRight, Camera
} from 'lucide-react';
import { rehab } from '../../../services/api';
import { ProgressRing } from './ui';

// Phase icon mapping — lucide components
const PHASE_ICONS = {
  shield: Shield, move: RefreshCw, dumbbell: Dumbbell,
  activity: Activity, trophy: Zap, star: Trophy,
};

const getWeeksSinceSurgery = (surgeryDate) => {
  if (!surgeryDate) return 0;
  const diff = Date.now() - new Date(surgeryDate).getTime();
  return Math.max(0, Math.floor(diff / (7 * 24 * 60 * 60 * 1000)));
};

const getGreeting = () => {
  const hr = new Date().getHours();
  if (hr < 12) return 'Доброе утро';
  if (hr < 18) return 'Добрый день';
  return 'Добрый вечер';
};

// LoadingSkeleton
const LoadingSkeleton = () => (
  <div className="pd-loading">
    <div className="pd-skeleton" style={{ height: 60, marginBottom: 16 }} />
    <div className="pd-skeleton" style={{ height: 200, marginBottom: 16 }} />
    <div className="pd-skeleton" style={{ height: 100, marginBottom: 16 }} />
  </div>
);

// EmptyState
const EmptyState = ({ goTo }) => (
  <div className="pd-empty-state">
    <div className="pd-empty-state-icon"><ClipboardList size={36} /></div>
    <h3 className="pd-empty-state-title">Программа не создана</h3>
    <p className="pd-empty-state-text">
      Ваш инструктор ещё не создал программу реабилитации.
      Свяжитесь с ним для получения подробностей.
    </p>
    <button className="pd-empty-state-btn" onClick={() => goTo(3)}>Связаться</button>
  </div>
);

EmptyState.propTypes = { goTo: PropTypes.func.isRequired };

// Main HomeScreen — layout из v4-redesign reference
const HomeScreen = ({ dashboardData, goTo }) => {
  const program = dashboardData?.program;
  const phase = dashboardData?.phase;
  const streak = dashboardData?.streak;
  const tip = dashboardData?.tip;
  const diaryFilledToday = dashboardData?.diaryFilledToday;

  const [todayComplex, setTodayComplex] = useState(null);
  useEffect(() => {
    rehab.getMyExercises()
      .then((res) => setTodayComplex(res.data || null))
      .catch(() => {});
  }, []);

  const currentWeek = useMemo(() =>
    getWeeksSinceSurgery(program?.surgery_date),
    [program?.surgery_date]
  );

  if (dashboardData === null) return <LoadingSkeleton />;
  if (!program) return <EmptyState goTo={goTo} />;

  const patientName = program.patient_name || 'Пациент';
  const totalWeeks = phase?.duration_weeks || 12;
  const phasePct = totalWeeks > 0 ? Math.min(100, Math.round((currentWeek / totalWeeks) * 100)) : 0;
  const PhaseIcon = PHASE_ICONS[phase?.icon] || Shield;
  const phaseColor = phase?.color || '#0D9488';

  return (
    <div className="pd-home-screen" style={{ padding: '0 20px' }}>

      {/* ── Top bar (ref: greeting + streak) ── */}
      <div className="fi fi1" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 42, height: 42, borderRadius: 14,
            background: 'linear-gradient(135deg, #0D9488, #115E59)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontFamily: "'Manrope'", fontWeight: 800, fontSize: '1rem',
          }}>
            {patientName.charAt(0).toUpperCase()}
          </div>
          <div>
            <div style={{ fontSize: '0.7rem', color: 'var(--pd-n400, #94A3B8)', fontWeight: 500, lineHeight: 1 }}>{getGreeting()}</div>
            <div style={{ fontFamily: "'Manrope'", fontSize: '1.15rem', fontWeight: 800, color: 'var(--pd-n900, #0F172A)', lineHeight: 1.3 }}>{patientName}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {streak && streak.current > 0 && (
            <div style={{
              padding: '5px 12px', borderRadius: 20,
              background: 'var(--pd-accent-warm-50, #FFF7ED)',
              border: '1px solid rgba(249,115,22,0.12)',
              fontSize: '0.68rem', fontWeight: 700, color: 'var(--pd-accent-warm, #F97316)',
              display: 'flex', alignItems: 'center', gap: 4,
            }}>
              🔥 {streak.current} {streak.current === 1 ? 'день' : streak.current < 5 ? 'дня' : 'дней'}
            </div>
          )}
          <div style={{ width: 10, height: 10, borderRadius: 5, background: 'var(--pd-success, #22C55E)', boxShadow: '0 0 6px rgba(34,197,94,0.5)' }} />
        </div>
      </div>

      {/* ── TODAY WORKOUT — dark CTA card (ref) ── */}
      {todayComplex && (
        <div className="fi fi2" style={{
          borderRadius: 20, overflow: 'hidden', position: 'relative',
          background: 'var(--pd-gradient-dark, linear-gradient(145deg, #0F172A 0%, #1E293B 60%, #115E59 100%))',
          padding: '22px 20px 20px', marginBottom: 16,
        }}>
          {/* Декор */}
          <div style={{ position: 'absolute', top: -40, right: -20, width: 140, height: 140, borderRadius: 70, background: 'rgba(13,148,136,0.12)' }} />
          <div style={{ position: 'absolute', bottom: -50, left: -30, width: 120, height: 120, borderRadius: 60, background: 'rgba(249,115,22,0.08)' }} />

          <div style={{ position: 'relative', zIndex: 1 }}>
            <div style={{
              display: 'inline-flex', padding: '3px 10px', borderRadius: 6,
              background: 'var(--pd-accent-warm, #F97316)', marginBottom: 10,
            }}>
              <span style={{ fontSize: '0.6rem', fontWeight: 700, color: '#fff', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Сегодня</span>
            </div>
            <h2 style={{ fontFamily: "'Manrope'", fontSize: '1.2rem', fontWeight: 800, color: '#fff', lineHeight: 1.25, marginBottom: 4 }}>
              {todayComplex.complex_title || 'Комплекс упражнений'}
            </h2>
            <p style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.55)', marginBottom: 16 }}>
              {todayComplex.exercise_count ? `${todayComplex.exercise_count} упражнений` : 'Упражнения'} · ~15 мин
            </p>
            <button
              onClick={() => goTo(4, { autoStart: true, complexId: todayComplex.complex_id })}
              style={{
                width: '100%', padding: '14px 0', borderRadius: 14, border: 'none',
                background: '#fff', color: 'var(--pd-n900, #0F172A)',
                fontFamily: "'Manrope'", fontWeight: 800, fontSize: '0.9rem',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
              }}
            >
              <div style={{
                width: 28, height: 28, borderRadius: 14, background: '#0D9488',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Play size={12} color="#fff" />
              </div>
              Начать
            </button>
          </div>
        </div>
      )}

      {/* ── PROGRESS — horizontal card with ring + stats (ref) ── */}
      <div className="fi fi3" style={{
        display: 'flex', gap: 16, marginBottom: 16, padding: 16,
        background: '#fff', borderRadius: 16,
        boxShadow: '0 1px 4px rgba(0,0,0,0.04)', border: '1px solid rgba(226,232,240,0.5)',
      }}>
        <ProgressRing value={phasePct} size={88} strokeWidth={6} sublabel={`Фаза ${program.current_phase || 1}`} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--pd-n500, #64748B)' }}>Неделя</span>
            <span style={{ fontFamily: "'Manrope'", fontSize: '0.85rem', fontWeight: 800, color: 'var(--pd-primary, #0D9488)' }}>
              {currentWeek}<span style={{ fontWeight: 400, color: 'var(--pd-n400, #94A3B8)' }}>/{totalWeeks}</span>
            </span>
          </div>
          <div style={{ height: 4, borderRadius: 2, background: 'var(--pd-n200, #E2E8F0)' }}>
            <div style={{
              height: 4, borderRadius: 2, width: `${phasePct}%`,
              background: 'linear-gradient(90deg, #0D9488, #06B6D4)',
              transition: 'width 800ms ease',
            }} />
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 2 }}>
            {[
              { l: 'Боль', v: dashboardData?.lastPain ?? '—', c: 'var(--pd-success, #22C55E)' },
              { l: 'Отёк', v: '—', c: 'var(--pd-success, #22C55E)' },
              { l: 'Серия', v: streak?.current ? `${streak.current}д` : '—', c: 'var(--pd-accent-warm, #F97316)' },
            ].map((s, i) => (
              <div key={i} style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: "'Manrope'", fontSize: '0.9rem', fontWeight: 800, color: s.c }}>{s.v}</div>
                <div style={{ fontSize: '0.55rem', color: 'var(--pd-n400, #94A3B8)' }}>{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── CURRENT PHASE — compact row (ref) ── */}
      {phase && (
        <div className="fi fi4" onClick={() => goTo(1)} style={{
          padding: '14px 16px', borderRadius: 14, marginBottom: 14,
          background: '#fff', border: '1px solid rgba(226,232,240,0.5)',
          display: 'flex', gap: 14, alignItems: 'center',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)', cursor: 'pointer',
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: `${phaseColor}15`, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <PhaseIcon size={20} color={phaseColor} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "'Manrope'", fontSize: '0.82rem', fontWeight: 700, color: 'var(--pd-n800, #1E293B)', marginBottom: 2 }}>
              {phase.name || 'Защита и контроль'}
            </div>
            <div style={{ fontSize: '0.68rem', color: 'var(--pd-n400, #94A3B8)' }}>
              Нед. {currentWeek} из {totalWeeks} · Фаза {program.current_phase || 1} из 6
            </div>
          </div>
          <ChevronRight size={18} color="var(--pd-n300, #CBD5E1)" />
        </div>
      )}

      {/* ── TIP — ambient gradient (ref) ── */}
      {tip && (
        <div className="fi fi5" style={{
          padding: '16px 18px', borderRadius: 16, marginBottom: 14,
          background: 'var(--pd-gradient-ambient, linear-gradient(135deg, #F0FDFA, #FFF7ED))',
          display: 'flex', gap: 14, alignItems: 'center',
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: 14, flexShrink: 0,
            background: 'rgba(13,148,136,0.06)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Moon size={22} color="var(--pd-primary, #0D9488)" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--pd-primary, #0D9488)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 2 }}>Совет</div>
            <div style={{ fontFamily: "'Manrope'", fontSize: '0.85rem', fontWeight: 700, color: 'var(--pd-n800, #1E293B)', marginBottom: 2 }}>{tip.title}</div>
            {tip.body && <div style={{ fontSize: '0.72rem', color: 'var(--pd-n500, #64748B)', lineHeight: 1.45 }}>{tip.body}</div>}
          </div>
        </div>
      )}

      {/* ── QUICK NAV — horizontal pills (ref) ── */}
      <div className="fi fi6" style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, marginBottom: 14 }}>
        {[
          { Icon: FileText, label: 'Дневник', id: 2 },
          { Icon: Map, label: 'Путь', id: 1 },
          { Icon: AlertTriangle, label: 'Связь', id: 3 },
          { Icon: Camera, label: 'Фото', id: null },
        ].map((a, i) => (
          <button
            key={i}
            onClick={() => a.id !== null && goTo(a.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 16px', borderRadius: 14,
              background: '#fff', border: '1px solid var(--pd-n200, #E2E8F0)',
              flexShrink: 0, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            <a.Icon size={16} color="var(--pd-n500, #64748B)" />
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--pd-n700, #334155)' }}>{a.label}</span>
            {a.id === 2 && diaryFilledToday && (
              <span style={{ fontSize: '0.65rem', color: 'var(--pd-success, #22C55E)', fontWeight: 700 }}>✓</span>
            )}
          </button>
        ))}
      </div>

      {/* ── Videos ── */}
      {phase?.videos && phase.videos.length > 0 && (
        <div className="fi fi7" style={{ marginBottom: 14 }}>
          <div style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--pd-n400, #94A3B8)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>Видео для вас</div>
          <div className="pd-video-grid">
            {phase.videos.map((video, index) => (
              <div
                key={video.id || index}
                className="pd-video-card"
                onClick={() => video.url && window.open(video.url, '_blank', 'noopener,noreferrer')}
                role="button"
                tabIndex={0}
              >
                <div className="pd-video-card-thumbnail">
                  {video.thumbnail ? (
                    <img src={video.thumbnail} alt={video.title} />
                  ) : (
                    <div className="pd-video-card-placeholder" style={{ background: `linear-gradient(135deg, ${phaseColor}40, ${phaseColor}20)` }}>
                      <Video size={24} />
                    </div>
                  )}
                  <div className="pd-video-card-play"><Play size={16} /></div>
                </div>
                <div className="pd-video-card-info">
                  <div className="pd-video-card-title">{video.title}</div>
                  {video.duration && <div className="pd-video-card-duration">{video.duration}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── EMERGENCY — minimal strip (ref) ── */}
      <div className="fi fi7" onClick={() => goTo(3)} style={{
        padding: '11px 16px', borderRadius: 12, marginBottom: 20,
        background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.08)',
        display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
      }}>
        <div style={{ width: 6, height: 6, borderRadius: 3, background: 'var(--pd-error, #EF4444)' }} />
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#B91C1C' }}>Экстренная связь</span>
        <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'rgba(239,68,68,0.4)' }}>→</span>
      </div>
    </div>
  );
};

HomeScreen.propTypes = {
  dashboardData: PropTypes.shape({
    program: PropTypes.object,
    phase: PropTypes.object,
    streak: PropTypes.object,
    lastDiary: PropTypes.string,
    lastPain: PropTypes.number,
    tip: PropTypes.object,
    diaryFilledToday: PropTypes.bool,
  }),
  goTo: PropTypes.func.isRequired,
};

export default HomeScreen;
