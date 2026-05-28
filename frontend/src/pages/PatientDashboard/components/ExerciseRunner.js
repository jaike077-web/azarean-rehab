// =====================================================
// EXERCISE RUNNER v4 — design system integration
// PainScale, DifficultyScale, RestTimer, CelebrationOverlay
// =====================================================

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { progressPatient } from '../../../services/api';
import { useToast } from '../../../context/ToastContext';
import { useAudioCue } from '../context/AudioContext';
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

  // --- CP3a + CP3c.1: per-set гайд для timed-упражнений ---
  // Узкий unlock LOCKED-раннера. Гайд проводит по подходам внутри карточки:
  //  - auto_complete!==false (countdown mode, CP3a.1): countdown ВНИЗ →
  //    cue('set_end') на 0 → авто-старт RestTimer → следующий подход.
  //  - auto_complete===false (open-hold mode, CP3a.2): открытый count-UP
  //    секундомер → ручное «Завершить подход» → авто-rest → следующий.
  //    Без cue('set_end') (звук только на countdown-0).
  // CP3c.1 расширения:
  //  - Фаза `ready` перед каждым work-подходом (гейт «Начать подход»).
  //    Отсчёт/секундомер НЕ стартует сам — пациент сам решает когда начать
  //    (фикс iOS-смоук-фидбэка п.4).
  //  - На «Начать подход»: 3-2-1 преролл (cue('count_tick') ×3) + cue('set_start')
  //    на «go» → переход в work. Стартовое звуковое предупреждение (фикс п.1).
  //  - Единая кнопка «Завершить подход» (countdown «Раньше» и open-hold
  //    «Готово» унифицированы по копи + testid — фикс п.3).
  // Завершение всего упражнения и POST /api/progress — НЕ трогаем (canon LOCKED).
  // Rep-only (duration_seconds==null/0) → гайд НЕ активен, прежний flow 1:1.
  const sets = Math.max(1, parseInt(ce.sets, 10) || 1);
  const usesPerSetGuide = hasDuration;
  const isCountdownMode = usesPerSetGuide && ce.auto_complete !== false;
  const isOpenHoldMode = usesPerSetGuide && ce.auto_complete === false;
  const { cue, prime } = useAudioCue();
  const cueRef = useRef(cue);
  useEffect(() => { cueRef.current = cue; }, [cue]);
  const [currentSetIndex, setCurrentSetIndex] = useState(0);
  // CP3c.1: добавлена фаза 'ready' (initial, перед каждым work) и 'preroll'
  // (3-2-1 преролл между ready и work). Поток:
  //   ready → [тап «Начать»] → preroll(3→2→1) → work → completeSet
  //     → k<N-1: rest → ready (следующий подход)
  //     → k==N-1: done (существующий feedback/submit)
  const [setPhase, setSetPhase] = useState('ready'); // 'ready'|'preroll'|'work'|'rest'|'done'
  const [setRemaining, setSetRemaining] = useState(ce.duration_seconds || 0);
  const [prerollCountdown, setPrerollCountdown] = useState(0);

  // Сброс per-set state при переходе на новое упражнение → ready phase.
  useEffect(() => {
    setCurrentSetIndex(0);
    setSetPhase('ready');
    setSetRemaining(ce.duration_seconds || 0);
    setPrerollCountdown(0);
  }, [index, ce.duration_seconds]);

  // CP3c.1: «Начать подход» → prime AudioContext (iOS safety) + первый
  // count_tick («3») сразу + переход в preroll.
  const handleStartSet = () => {
    if (!usesPerSetGuide) return;
    if (setPhase !== 'ready') return;
    if (typeof prime === 'function') prime();
    if (cueRef.current) cueRef.current('count_tick');
    setPrerollCountdown(3);
    setSetPhase('preroll');
  };

  // CP3c.1: 3-2-1 преролл-tick. На каждой секунде cue('count_tick') («2», «1»),
  // на последнем — cue('set_start') («go») + setPhase('work') + auto-start
  // секундомера для open-hold mode (countdown сам стартует через setRemaining).
  useEffect(() => {
    if (setPhase !== 'preroll') return undefined;
    const id = setInterval(() => {
      setPrerollCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(id);
          if (cueRef.current) cueRef.current('set_start');
          setSetPhase('work');
          if (ce.auto_complete === false) setSwRunning(true);
          return 0;
        }
        if (cueRef.current) cueRef.current('count_tick');
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [setPhase, ce.auto_complete]);

  // Тик countdown в work-фазе (ТОЛЬКО countdown mode). На prev<=1 →
  // cue('set_end') + переход в rest/done. cue зовём через ref чтобы
  // не пересоздавать interval при смене settings.
  useEffect(() => {
    if (!isCountdownMode) return undefined;
    if (setPhase !== 'work') return undefined;
    const id = setInterval(() => {
      setSetRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(id);
          if (cueRef.current) cueRef.current('set_end');
          if (currentSetIndex < sets - 1) setSetPhase('rest');
          else setSetPhase('done');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [isCountdownMode, setPhase, currentSetIndex, sets]);

  // CP3c.1: единая «Завершить подход» (заменяет «Раньше»/«Готово»).
  // Без cue('set_end') — звук только на countdown-0. В open-hold сначала
  // стопаем секундомер (UX: визуально фиксируем elapsed на момент клика).
  const handleFinishEarly = () => {
    if (!usesPerSetGuide) return;
    if (setPhase !== 'work') return;
    if (isOpenHoldMode) setSwRunning(false);
    if (currentSetIndex < sets - 1) setSetPhase('rest');
    else setSetPhase('done');
  };

  // RestTimer (auto-started) → onComplete → следующий подход в ready phase
  // (пациент сам жмёт «Начать подход» — НЕ авто-старт следующего work).
  // cue('rest_end') шлёт сам RestTimer, дублировать не нужно.
  // Reset открытого секундомера на каждый новый подход (no-op в countdown mode).
  const handleRestComplete = useCallback(() => {
    setCurrentSetIndex((idx) => idx + 1);
    setSetPhase('ready');
    setSetRemaining(ce.duration_seconds || 0);
    setPrerollCountdown(0);
    setSwRunning(false);
    setSwElapsed(0);
  }, [ce.duration_seconds]);

  // --- Навигация ---
  const handleCelebrationDone = useCallback(() => {
    setShowCelebration(false);
    onComplete();
  }, [onComplete]);

  const advance = () => {
    if (index < total - 1) { setDir('f'); setIndex(index + 1); }
    else setShowCelebration(true);
  };

  const submit = async (completed) => {
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
      setStatuses((s) => { const n = [...s]; n[index] = completed ? 'done' : 'skipped'; return n; });
      toast.success(completed ? 'Выполнено' : 'Пропущено', completed ? 'Прогресс сохранён' : 'Отмечено как пропущенное');
      advance();
    } catch (err) {
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

          {/* Details accordion — Wave 0 commit 05: 4 секции вместо 3.
              Description / Как делать (instructions+cues) / Полезно знать /
              Безопасность (merged contraindications + absolute + red_flags) +
              опциональный badge safe_with_inflammation. Toggle и обёртка
              .details-toggle/.details-body — НЕ ТРОНУТЫ (LOCKED). Новые
              классы добавлены рядом, не заменяют старые. */}
          {(exercise.description || exercise.instructions || exercise.cues
            || exercise.tips || exercise.contraindications
            || exercise.absolute_contraindications || exercise.red_flags
            || exercise.safe_with_inflammation) && (
            <div className="sec">
              <button type="button" onClick={() => setShowDetails(!showDetails)} className="details-toggle">
                {showDetails ? '▼ Скрыть описание' : '▶ Описание и инструкции'}
              </button>
              {showDetails && (
                <div className="details-body">
                  {/* 1. Описание */}
                  {exercise.description && (
                    <>
                      <div className="sec-t">Описание</div>
                      <p className="sec-body">{exercise.description}</p>
                    </>
                  )}

                  {/* 2. Как делать (instructions + cues подзаголовком) */}
                  {(exercise.instructions || exercise.cues) && (
                    <>
                      <div className="sec-t">Как делать</div>
                      {exercise.instructions && (
                        <p className="sec-body">{exercise.instructions}</p>
                      )}
                      {exercise.cues && (
                        <div className="sec-cues">
                          <div className="sec-subt">Подсказки во время выполнения</div>
                          <p className="sec-body">{exercise.cues}</p>
                        </div>
                      )}
                    </>
                  )}

                  {/* 3. Полезно знать (tips) */}
                  {exercise.tips && (
                    <>
                      <div className="sec-t">Полезно знать</div>
                      <p className="sec-body">{exercise.tips}</p>
                    </>
                  )}

                  {/* 4. Безопасность (merged contraindications + absolute + red_flags).
                      Градация: «нельзя» → «с осторожностью» → «прекрати и к врачу». */}
                  {(exercise.contraindications
                    || exercise.absolute_contraindications
                    || exercise.red_flags) && (
                    <>
                      <div className="sec-t sec-t--danger">Безопасность</div>

                      {exercise.absolute_contraindications && (
                        <div className="sec-block sec-block-strong">
                          <div className="sec-subt">Нельзя выполнять при:</div>
                          <p className="sec-body">{exercise.absolute_contraindications}</p>
                        </div>
                      )}

                      {exercise.contraindications && (
                        <div className="sec-block">
                          <div className="sec-subt">С осторожностью при:</div>
                          <p className="sec-body">{exercise.contraindications}</p>
                        </div>
                      )}

                      {exercise.red_flags && (
                        <div className="sec-block sec-block-stop">
                          <div className="sec-subt">Прекрати и обратись к врачу при:</div>
                          <p className="sec-body">{exercise.red_flags}</p>
                        </div>
                      )}
                    </>
                  )}

                  {/* 5. Бейдж safe_with_inflammation */}
                  {exercise.safe_with_inflammation && (
                    <div className="sec-badge sec-badge-safe">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="14" height="14" aria-hidden="true"><path d="M20 6L9 17l-5-5" /></svg>
                      <span>Безопасно при активном воспалении</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* CP3a + CP3c.1: per-set гайд для timed-упражнений. Поведенческая
              цепочка: ready → preroll → work → (rest →) ready/done. Work-фаза
              разводит две ветки по auto_complete (countdown CP3a.1 / open-hold
              CP3a.2). Класс-имена reuse существующего canon (.sec/.sec-t/.sw/
              .sw-val/.sw-target/.sw-btn/.sw-go/.sw-stop/.btn/.btn-sk/.btn-dn) —
              новых селекторов и CSS-переменных в CP3c.1 НЕ добавлено
              (визуальный апгрейд кольца+цвета — CP3c.2). */}
          {usesPerSetGuide && (
            <div className="sec">
              <div className="sec-t">
                <span data-testid="set-indicator">Подход {currentSetIndex + 1} из {sets}</span>
                <span className="sw-target">цель: {ce.duration_seconds}с</span>
              </div>
              {setPhase === 'ready' && (
                <div className="sw" data-testid="ready-state">
                  <span className="sw-val">{formatTime(ce.duration_seconds || 0)}</span>
                  <button type="button" className="btn btn-dn" onClick={handleStartSet} data-testid="start-set-btn">
                    Начать подход
                  </button>
                </div>
              )}
              {setPhase === 'preroll' && (
                <div className="sw">
                  <span className="sw-val" data-testid="preroll-indicator">{prerollCountdown}</span>
                </div>
              )}
              {setPhase === 'work' && isCountdownMode && (
                <div className="sw">
                  <span className="sw-val" data-testid="set-countdown">{formatTime(setRemaining)}</span>
                  <button type="button" className="btn btn-sk" onClick={handleFinishEarly} data-testid="finish-set-btn">
                    Завершить подход
                  </button>
                </div>
              )}
              {setPhase === 'work' && isOpenHoldMode && (
                <div className="sw">
                  <span className="sw-val" data-testid="set-stopwatch">{formatTime(swElapsed)}</span>
                  <button type="button" className={`sw-btn ${swRunning ? 'sw-stop' : 'sw-go'}`} onClick={() => setSwRunning(!swRunning)} data-testid="set-stopwatch-toggle">
                    {swRunning ? '⏸' : '▶'}
                  </button>
                  <button type="button" className="btn btn-sk" onClick={handleFinishEarly} data-testid="finish-set-btn">
                    Завершить подход
                  </button>
                </div>
              )}
              {setPhase === 'rest' && (
                <div data-testid="auto-rest-block">
                  <RestTimer
                    key={`set-rest-${currentSetIndex}`}
                    autoStart
                    defaultSeconds={ce.rest_seconds || 60}
                    presets={[30, 60, 90, 120]}
                    onComplete={handleRestComplete}
                  />
                </div>
              )}
            </div>
          )}

          {/* Rest timer (ручной) — для rep-only упражнений с rest_seconds.
              Прячется когда per-set гайд активен (timed) — там свой авто-rest. */}
          {hasRest && !usesPerSetGuide && (
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
