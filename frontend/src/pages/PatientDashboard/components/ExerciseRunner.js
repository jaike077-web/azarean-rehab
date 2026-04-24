// =====================================================
// EXERCISE RUNNER v4 — design system integration
// PainScale, DifficultyScale, RestTimer, CelebrationOverlay
// =====================================================

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { progressPatient } from '../../../services/api';
import { useToast } from '../../../context/ToastContext';
import { PainScale, DifficultyScale, RestTimer, CelebrationOverlay } from './ui';

const formatTime = (s) => {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
};

const ExerciseRunner = ({
  complexId,
  exercises,
  startExerciseId,
  complexExercise,
  sessionId,
  onBack,
  onComplete,
}) => {
  const toast = useToast();

  const list = useMemo(() => {
    if (Array.isArray(exercises) && exercises.length > 0) return exercises;
    if (complexExercise) return [complexExercise];
    return [];
  }, [exercises, complexExercise]);

  const initialIdx = useMemo(() => {
    if (!list.length) return 0;
    if (startExerciseId != null) {
      const i = list.findIndex((ce) => ce.exercise?.id === startExerciseId);
      if (i >= 0) return i;
    }
    return 0;
  }, [list, startExerciseId]);

  const [index, setIndex] = useState(initialIdx);
  const [statuses, setStatuses] = useState(() => list.map(() => null));
  const [dir, setDir] = useState('f');
  const total = list.length;
  const ce = list[index] || {};
  const exercise = ce.exercise || {};

  const [painLevel, setPainLevel] = useState(0);
  const [difficulty, setDifficulty] = useState(0);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(true);
  const [prevSession, setPrevSession] = useState(null);
  const [showCelebration, setShowCelebration] = useState(false);

  useEffect(() => {
    setPainLevel(0);
    setDifficulty(0);
    setComment('');
    setPrevSession(null);
    setShowDetails(false);
  }, [index]);

  useEffect(() => {
    if (exercise.id && complexId) {
      progressPatient
        .getByExercise(exercise.id, complexId)
        .then((res) => {
          const logs = Array.isArray(res.data) ? res.data : res.data?.data || [];
          if (logs.length > 0) setPrevSession(logs[0]);
        })
        .catch(() => {});
    }
  }, [exercise.id, complexId]);

  // --- Секундомер ---
  const hasDuration = ce.duration_seconds > 0;
  const [swRunning, setSwRunning] = useState(false);
  const [swElapsed, setSwElapsed] = useState(0);
  const swRef = useRef(null);

  useEffect(() => { setSwRunning(false); setSwElapsed(0); }, [index]);
  useEffect(() => {
    if (swRunning) { swRef.current = setInterval(() => setSwElapsed((s) => s + 1), 1000); }
    return () => clearInterval(swRef.current);
  }, [swRunning]);

  // TEMP debug — отслеживаем mount/unmount и смену index
  useEffect(() => {
    console.log('[Runner] MOUNT', { total, initialIdx, startExerciseId });
    return () => console.log('[Runner] UNMOUNT');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    console.log('[Runner] index changed', { index, total });
  }, [index, total]);

  // --- Навигация ---
  const handleCelebrationDone = useCallback(() => {
    console.log('[Runner] celebration done → onComplete()');
    setShowCelebration(false);
    onComplete();
  }, [onComplete]);

  const advance = () => {
    // TEMP debug — диагностика auto-back после «Выполнено»
    console.log('[Runner] advance', { index, total, willCelebrate: !(index < total - 1) });
    if (index < total - 1) { setDir('f'); setIndex(index + 1); }
    else setShowCelebration(true);
  };

  const submit = async (completed) => {
    // TEMP debug
    console.log('[Runner] submit start', { index, total, completed, exerciseId: exercise.id, listLength: list.length });
    setSaving(true);
    try {
      await progressPatient.create({
        complex_id: complexId,
        exercise_id: exercise.id,
        completed,
        pain_level: painLevel,
        // difficulty=0 означает «пациент не поставил оценку» — в БД CHECK
        // на 1..10, 0 ронял запрос с 500. Шлём null в этом случае.
        difficulty_rating: difficulty > 0 ? difficulty : null,
        session_id: sessionId,
        comment: comment.trim() || null,
      });
      console.log('[Runner] submit success, about to advance', { index, total });
      setStatuses((s) => { const n = [...s]; n[index] = completed ? 'done' : 'skipped'; return n; });
      toast.success(completed ? 'Выполнено' : 'Пропущено', completed ? 'Прогресс сохранён' : 'Отмечено как пропущенное');
      advance();
    } catch (err) {
      console.log('[Runner] submit error', err);
      toast.error('Ошибка', err.response?.data?.message || 'Не удалось сохранить');
    } finally { setSaving(false); }
  };

  const goPrev = () => { if (index > 0) { setDir('b'); setIndex(index - 1); } };
  const goTo = (i) => { if (i !== index && i >= 0 && i < total) { setDir(i > index ? 'f' : 'b'); setIndex(i); } };

  // --- Хелперы ---
  const getEmbedUrl = () => {
    if (exercise.kinescope_id) return `https://kinescope.io/embed/${exercise.kinescope_id}`;
    if (exercise.video_url) return exercise.video_url.replace('/watch/', '/embed/');
    return null;
  };
  const embedUrl = getEmbedUrl();

  const paramLine = () => {
    const parts = [];
    if (ce.sets) parts.push(`${ce.sets} подх.`);
    if (ce.duration_seconds > 0) parts.push(`${ce.duration_seconds} сек`);
    else if (ce.reps) parts.push(`${ce.reps} повт.`);
    if (ce.rest_seconds > 0) parts.push(`отдых ${ce.rest_seconds}с`);
    return parts.join(' · ');
  };

  const prevHintText = () => {
    if (!prevSession) return null;
    const parts = [];
    if (prevSession.pain_level != null) parts.push(`боль ${prevSession.pain_level}`);
    if (prevSession.difficulty_rating != null) parts.push(`сложность ${prevSession.difficulty_rating}`);
    if (prevSession.completed_at) {
      parts.push(new Date(prevSession.completed_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }));
    }
    return parts.length > 0 ? parts.join(' · ') : null;
  };

  const doneCount = statuses.filter((s) => s === 'done').length;
  const progressPct = total > 0 ? (doneCount / total) * 100 : 0;
  const hasRest = ce.rest_seconds > 0;

  return (
    <div className="pd-runner">
      <div className="pg">

        {/* Progress bar */}
        <div className="prg">
          <div className="prg-info">
            <span className="prg-l">Упражнение {index + 1} из {total}</span>
            <span className="prg-r">{doneCount} из {total}</span>
          </div>
          <div className="trk"><div className="fll" style={{ width: `${progressPct}%` }} /></div>
        </div>

        {/* Dots */}
        {total > 1 && (
          <div className="dots">
            {list.map((_, i) => {
              const cls = ['dot', i === index && 'active', statuses[i] === 'done' && 'dn', statuses[i] === 'skipped' && 'sk'].filter(Boolean).join(' ');
              return <button key={i} type="button" className={cls} onClick={() => goTo(i)} aria-label={`Упражнение ${i + 1}`} />;
            })}
          </div>
        )}

        {/* Card */}
        <div key={index} className={dir === 'b' ? 'crd bk' : 'crd'}>
          {/* Badge + title */}
          <div className="crd-top">
            <span className="num">{index + 1}</span>
            <span className="nm">{exercise.title || 'Упражнение'}</span>
          </div>
          {paramLine() && <div className="rx">{paramLine()}</div>}
          {prevHintText() && (
            <div className="prev-hint">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }} width="12" height="12"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></svg>
              Прошлая: {prevHintText()}
            </div>
          )}

          {/* Video section */}
          <div className="sec">
            {embedUrl ? (
              <div className="vid">
                <iframe src={embedUrl} title={exercise.title} frameBorder="0" allow="autoplay; fullscreen; picture-in-picture; encrypted-media; gyroscope; accelerometer; clipboard-write" allowFullScreen />
              </div>
            ) : (
              <div className="vid vid--ph"><span>🏋️</span></div>
            )}
          </div>

          {/* Details accordion */}
          {(exercise.description || exercise.instructions || exercise.contraindications) && (
            <div className="sec">
              <button type="button" onClick={() => setShowDetails(!showDetails)} className="details-toggle">
                {showDetails ? '▼ Скрыть описание' : '▶ Описание и инструкции'}
              </button>
              {showDetails && (
                <div className="details-body">
                  {exercise.description && (<><div className="sec-t">Описание</div><p className="sec-body">{exercise.description}</p></>)}
                  {exercise.instructions && (<><div className="sec-t">Инструкции</div><p className="sec-body">{exercise.instructions}</p></>)}
                  {exercise.contraindications && (<><div className="sec-t sec-t--danger">Противопоказания</div><p className="sec-body">{exercise.contraindications}</p></>)}
                </div>
              )}
            </div>
          )}

          {/* Stopwatch */}
          {hasDuration && (
            <div className="sec">
              <div className="sec-t">
                <span>Секундомер</span>
                <span className="sw-target">цель: {ce.duration_seconds}с</span>
              </div>
              <div className="sw">
                <span className="sw-val">{formatTime(swElapsed)}</span>
                <button type="button" className={`sw-btn ${swRunning ? 'sw-stop' : 'sw-go'}`} onClick={() => setSwRunning(!swRunning)}>
                  {swRunning ? '⏸' : '▶'}
                </button>
              </div>
            </div>
          )}

          {/* Rest timer — новый компонент */}
          {hasRest && (
            <div className="sec">
              <div className="sec-t" style={{ marginBottom: 8 }}>Таймер отдыха</div>
              <RestTimer
                defaultSeconds={ce.rest_seconds || 60}
                presets={[30, 60, 90, 120]}
              />
            </div>
          )}

          {/* Medical warning — всегда видим при боли >= 7 */}
          {painLevel >= 7 && (
            <div className="pain-banner pain-banner--prominent">
              ⚠️ Боль {painLevel}/10 — рекомендуем остановить выполнение и связаться со специалистом.
            </div>
          )}

          {/* Feedback accordion */}
          <button type="button" className={`fb-toggle${feedbackOpen ? ' open' : ''}`} onClick={() => setFeedbackOpen(!feedbackOpen)}>
            <span>Обратная связь <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--az-secondary)', marginLeft: 4 }}>сложность · боль · комментарий</span></span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="20" height="20"><path d="M6 9l6 6 6-6" /></svg>
          </button>

          <div className={`fb-body${feedbackOpen ? ' open' : ''}`}>
            {/* DifficultyScale — новый компонент */}
            <div className="sec">
              <div className="sec-t">Сложность упражнения</div>
              <input type="hidden" value={difficulty} data-testid="difficulty-slider" readOnly />
              <DifficultyScale value={difficulty} onChange={setDifficulty} />
            </div>

            {/* PainScale — новый компонент */}
            <div className="sec">
              <div className="sec-t">Болевые ощущения</div>
              <input type="hidden" value={painLevel} data-testid="pain-slider" readOnly />
              <PainScale value={painLevel} onChange={setPainLevel} showEmoji />
            </div>

            {/* Comment */}
            <div className="sec">
              <div className="sec-t">Комментарий</div>
              <textarea value={comment} onChange={(e) => setComment(e.target.value)}
                placeholder="Ощущения, особенности..." className="cmt" data-testid="comment-input" />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="acts">
          <button type="button" onClick={goPrev} disabled={index === 0} className="btn btn-bk" aria-label="Предыдущее упражнение" data-testid="runner-back-btn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
          <button onClick={() => submit(false)} disabled={saving} className="btn btn-sk" data-testid="skip-btn">
            Пропустить
          </button>
          <button onClick={() => submit(true)} disabled={saving} className="btn btn-dn" data-testid="done-btn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
            <span>{saving ? 'Сохранение...' : index < total - 1 ? 'Выполнено' : 'Завершить'}</span>
          </button>
        </div>

        <div className="disclaimer">При боли 7+ прекратите выполнение и свяжитесь со специалистом.</div>

      </div>

      {/* Celebration overlay при завершении всего комплекса */}
      <CelebrationOverlay
        show={showCelebration}
        onDone={handleCelebrationDone}
        message="Тренировка завершена!"
      />
    </div>
  );
};

export default ExerciseRunner;
