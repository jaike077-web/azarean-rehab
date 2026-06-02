// =====================================================
// EXERCISE RUNNER v4 — design system integration
// PainScale, DifficultyScale, RestTimer, CelebrationOverlay
// =====================================================

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { progressPatient } from '../../../services/api';
import { useToast } from '../../../context/ToastContext';
import { useAudioCue, useExerciseAudio } from '../context/AudioContext';
import { PainScale, DifficultyScale, RestTimer, CelebrationOverlay, PhaseRing } from './ui';

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
  // EA5: узкий unlock — старт/стоп трека упражнения (вне канона раннера).
  const { startExerciseAudio, stopExerciseAudio } = useExerciseAudio();

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

  // EA5 music-плеер перенесён НИЖЕ (после объявления setPhase) — завязан на фазу
  // work, а не на вход в упражнение (фикс iOS-фидбэка: не играть на интро-экране).

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

  // EA5 (фикс iOS-фидбэка #2): трек упражнения = звук НА ВРЕМЯ ВЫПОЛНЕНИЯ подхода,
  // НЕ фон на всю тренировку (может быть голос/ритм/музыка для упражнения).
  //  - Таймерные (usesPerSetGuide): играет только в фазе 'work'; на интро «Начать
  //    подход» (ready), 3-2-1 (preroll), отдыхе (rest) и done — стоп. Каждый подход
  //    стартует заново (не нонстоп между подходами).
  //  - Rep-only (нет гейта work): играет пока пациент на упражнении.
  // Стоп на смене упражнения / выходе. Узкий unlock — канон раннера не трогаем.
  const exAudio = ce.audio || null;
  const musicActive = !!exAudio && (usesPerSetGuide ? setPhase === 'work' : true);
  useEffect(() => {
    if (musicActive) startExerciseAudio(exAudio);
    else stopExerciseAudio();
  }, [musicActive, exAudio, startExerciseAudio, stopExerciseAudio]);
  useEffect(() => () => { stopExerciseAudio(); }, [stopExerciseAudio]); // анмаунт раннера → стоп

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
  //
  // WARN (2026-05-29): pre-end предупреждение cue('count_tick'), когда отсчёт
  // ДОСТИГАЕТ 10 и 5 секунд (next === 10 / next === 5 — тот же принцип, что
  // set_end ассоциирован с «0», который он производит). Монотонный отсчёт
  // пересекает каждое значение ровно один раз → guard не нужен. Уважает
  // mute/volume (gate внутри cue). Фаза ≤10с не даёт 10-бип, ≤5с — ни одного
  // (стартовое значение не проходит через updater). Count-up (open-hold) сюда
  // не заходит — isCountdownMode=false. set_end на 0 — без изменений.
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
        const next = prev - 1;
        if (cueRef.current && (next === 10 || next === 5)) cueRef.current('count_tick');
        return next;
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

          {/* CP3a + CP3c: per-set гайд для timed-упражнений. Поведенческая
              цепочка ready → preroll → work → (rest →) ready/done — CP3c.1.
              Визуал: крупное PhaseRing 170px + фаз-цвета (work/preroll=coral,
              rest=teal, ready/done=neutral) — CP3c.2. Новый CSS — только
              таймерная зона (PhaseRing.css) под существующими токенами
              (--pd-accent-warm, --pd-primary, --pd-neutral-500). */}
          {usesPerSetGuide && (() => {
            // DA2: контекстная шапка. Top = «ПОДХОД N ИЗ M» (work/ready/preroll/done)
            // или «ОТДЫХ» (rest). Right context — фаз-зависимый:
            //   ready/preroll/done → «цель M:SS» (formatTime, не «155с»)
            //   countdown work     → «осталось»
            //   open-hold work     → «удержание»
            //   rest               → «до подхода N+1»
            // CSS .pd-runner .sec-t уже text-transform: uppercase — case в JSX
            // natural, отображение CAPS через CSS. testid phase-label заменил CP3a/d set-indicator.
            const topLabel = setPhase === 'rest'
              ? 'Отдых'
              : `Подход ${currentSetIndex + 1} из ${sets}`;
            const contextLabel = (() => {
              if (setPhase === 'rest') return `до подхода ${currentSetIndex + 2}`;
              if (setPhase === 'work' && isCountdownMode) return 'осталось';
              if (setPhase === 'work' && isOpenHoldMode) return 'удержание';
              return `цель ${formatTime(ce.duration_seconds || 0)}`;
            })();
            return (
            <div className="sec">
              <div className="sec-t">
                <span data-testid="phase-label">{topLabel}</span>
                <span className="sw-target" data-testid="phase-context-label">{contextLabel}</span>
              </div>
              {setPhase === 'ready' && (
                <div data-testid="ready-state">
                  <PhaseRing
                    phase="ready"
                    label={formatTime(ce.duration_seconds || 0)}
                    progress={1}
                    valueTestId="ready-target"
                    ariaLabel={`Готов к подходу ${currentSetIndex + 1}, цель ${ce.duration_seconds || 0} секунд`}
                  />
                  <div className="pd-phase-actions">
                    <button type="button" className="pd-phase-btn pd-phase-btn--start" onClick={handleStartSet} data-testid="start-set-btn">
                      Начать подход
                    </button>
                  </div>
                </div>
              )}
              {setPhase === 'preroll' && (
                <PhaseRing
                  phase="preroll"
                  label={String(prerollCountdown)}
                  progress={prerollCountdown / 3}
                  valueTestId="preroll-indicator"
                  ariaLabel={`Преролл, ${prerollCountdown}`}
                />
              )}
              {setPhase === 'work' && isCountdownMode && (
                <>
                  <PhaseRing
                    phase="work"
                    label={formatTime(setRemaining)}
                    progress={(ce.duration_seconds || 0) > 0 ? setRemaining / ce.duration_seconds : 0}
                    valueTestId="set-countdown"
                    ariaLabel={`Подход ${currentSetIndex + 1}, осталось ${setRemaining} секунд`}
                  />
                  <div className="pd-phase-actions">
                    <button type="button" className="pd-phase-btn pd-phase-btn--finish" onClick={handleFinishEarly} data-testid="finish-set-btn">
                      Завершить подход
                    </button>
                  </div>
                </>
              )}
              {setPhase === 'work' && isOpenHoldMode && (
                <>
                  <PhaseRing
                    phase="work"
                    label={formatTime(swElapsed)}
                    progress={1}
                    valueTestId="set-stopwatch"
                    ariaLabel={`Подход ${currentSetIndex + 1}, прошло ${swElapsed} секунд`}
                  />
                  <div className="pd-phase-actions">
                    <button type="button" className={`sw-btn ${swRunning ? 'sw-stop' : 'sw-go'}`} onClick={() => setSwRunning(!swRunning)} data-testid="set-stopwatch-toggle" aria-label={swRunning ? 'Пауза' : 'Старт'}>
                      {swRunning ? '⏸' : '▶'}
                    </button>
                    <button type="button" className="pd-phase-btn pd-phase-btn--finish" onClick={handleFinishEarly} data-testid="finish-set-btn">
                      Завершить подход
                    </button>
                  </div>
                </>
              )}
              {setPhase === 'rest' && (
                <div data-testid="auto-rest-block">
                  <RestTimer
                    key={`set-rest-${currentSetIndex}`}
                    autoStart
                    hidePresets
                    defaultSeconds={ce.rest_seconds || 60}
                    presets={[30, 60, 90, 120]}
                    onComplete={handleRestComplete}
                  />
                  {/* CP3d: skip-rest — переиспользует handleRestComplete (та же
                      транзишн, что авто-конец отдыха). cue('rest_end') живёт
                      ВНУТРИ RestTimer setInterval (срабатывает только на
                      remaining=0); смена setPhase('ready') разворачивает
                      RestTimer → clearInterval → callback не запустится → skip
                      не играет звук (ручной финал, следующий сигнал — «Начать
                      подход»). POST не дёргается, progress_logs не трогаем. */}
                  <div className="pd-phase-actions">
                    <button type="button" className="pd-phase-btn pd-phase-btn--skip-rest" onClick={handleRestComplete} data-testid="skip-rest-btn">
                      Пропустить отдых
                    </button>
                  </div>
                </div>
              )}
            </div>
            );
          })()}

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
