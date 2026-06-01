// =====================================================
// EXERCISES SCREEN v2 - Patient Dashboard
// Гибридная модель:
//   State A — есть активная rehab_program с complex_id → "сегодняшний" комплекс
//             крупно + список "Все мои комплексы" (без "сегодняшнего")
//   State B — нет программы, но есть my-complexes → список карточек
//   State C — ничего нет → empty state
//
// Клик по карточке → ComplexDetailView
// Клик по упражнению → ExerciseRunner
// =====================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Dumbbell, ChevronRight, Play } from 'lucide-react';
import { rehab, patientAuth } from '../../../services/api';
import { useToast } from '../../../context/ToastContext';
import { useAudioCue } from '../context/AudioContext';
import ComplexDetailView from './ComplexDetailView';
import ExerciseRunner from './ExerciseRunner';
import { Card } from './ui';

const ExercisesScreen = ({ screenParams }) => {
  const toast = useToast();
  // CP1: prime AudioContext в user-gesture (тап «Начать тренировку»)
  // — обязательно для iOS PWA, иначе RestTimer cue будет молчать
  // на проде (контекст создан, но в state='suspended').
  const { prime } = useAudioCue();

  // Данные
  const [todayComplex, setTodayComplex] = useState(null); // из rehab.getMyExercises
  const [myComplexes, setMyComplexes] = useState([]); // из patientAuth.getMyComplexes
  const [loading, setLoading] = useState(true);

  // Навигация подэкранов
  const [view, setView] = useState('list'); // 'list' | 'complex' | 'runner'
  const [selectedComplexId, setSelectedComplexId] = useState(null);
  const [selectedExercise, setSelectedExercise] = useState(null);
  const [complexExercises, setComplexExercises] = useState([]);
  const [sessionId, setSessionId] = useState(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    // Параллельно тянем оба источника; у каждого свой fallback
    const todayReq = rehab.getMyExercises().catch((err) => {
      if (err.response?.status === 404) return null;
      return Promise.reject(err);
    });
    const allReq = patientAuth.getMyComplexes().catch((err) => {
      if (err.response?.status === 404) return { data: [] };
      return Promise.reject(err);
    });

    try {
      const [todayRes, allRes] = await Promise.all([todayReq, allReq]);
      const td = todayRes?.data || null;
      const all = allRes?.data || [];
      setTodayComplex(td);
      setMyComplexes(all);
    } catch (err) {
      toast.error('Ошибка', 'Не удалось загрузить комплексы');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Автозапуск из HomeScreen (screenParams.autoStart)
  const autoStarted = useRef(false);
  useEffect(() => {
    if (screenParams?.autoStart && screenParams?.complexId && !autoStarted.current) {
      autoStarted.current = true;
      openComplex(screenParams.complexId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screenParams]);

  // Открытие комплекса → сразу Runner (минуя ComplexDetailView)
  const openComplex = async (id) => {
    setSelectedComplexId(id);
    setSessionId(Date.now());
    // iOS PWA AudioContext unlock — синхронно ДО первого await,
    // чтобы user-gesture был активен в момент создания/резюма контекста.
    prime();
    try {
      const res = await patientAuth.getMyComplex(id);
      const data = res.data;
      if (data.exercises?.length > 0) {
        setComplexExercises(data.exercises);
        setSelectedExercise(data.exercises[0]);
        setView('runner');
      } else {
        // Пустой комплекс — fallback на детальный вид
        setView('complex');
      }
    } catch {
      toast.error('Ошибка', 'Не удалось загрузить комплекс');
    }
  };

  const backToList = () => {
    setView('list');
    setSelectedComplexId(null);
    setSelectedExercise(null);
    setComplexExercises([]);
  };

  // ARC-CYCLE AC5: завершение раннера. Если закрыт комплекс ТЕКУЩЕГО тренировочного
  // дня — продвигаем день (advance) ДО рефетча, чтобы секция показала следующий день
  // («закрыл А → Б»). session_id — тот же, что раннер слал в POST /progress (мы его
  // сгенерировали в openComplex). Advance дёргается из РОДИТЕЛЯ, НЕ из LOCKED раннера.
  // best-effort: при сбое advance lazy-on-GET догонит на следующем GET /my/exercises.
  const handleComplete = useCallback(async () => {
    const training = todayComplex?.mode === 'blocks' ? todayComplex.training : null;
    const isTrainingComplex = training?.complexes?.some((c) => c.complex_id === selectedComplexId);
    if (training?.block_id && isTrainingComplex && sessionId) {
      try {
        await rehab.advanceTraining({ block_id: training.block_id, session_id: sessionId });
      } catch {
        /* lazy advance-on-GET догонит */
      }
    }
    setView('list');
    setSelectedComplexId(null);
    setSelectedExercise(null);
    setComplexExercises([]);
    await loadAll();
  }, [todayComplex, selectedComplexId, sessionId, loadAll]);

  const openRunner = (complexExercise, allExercises) => {
    setSelectedExercise(complexExercise);
    setComplexExercises(Array.isArray(allExercises) ? allExercises : [complexExercise]);
    setView('runner');
  };

  const backToComplex = () => {
    setSelectedExercise(null);
    setView('complex');
  };

  // ======================================================
  // Подэкраны (render early return)
  // ======================================================
  if (view === 'runner' && selectedExercise) {
    return (
      <ExerciseRunner
        complexId={selectedComplexId}
        exercises={complexExercises}
        startExerciseId={selectedExercise?.exercise?.id}
        sessionId={sessionId}
        onBack={backToList}
        onComplete={handleComplete}
      />
    );
  }

  if (view === 'complex' && selectedComplexId) {
    return (
      <ComplexDetailView
        complexId={selectedComplexId}
        onBack={backToList}
        onSelectExercise={openRunner}
      />
    );
  }

  // ======================================================
  // Основной список
  // ======================================================
  if (loading) {
    return (
      <div className="pd-exercises-screen">
        <h1 className="pd-screen-title">Упражнения</h1>
        <div className="pd-section">
          <div className="pd-skeleton pd-skeleton--title"></div>
          <div className="pd-skeleton pd-skeleton--card" style={{ marginTop: 12 }}></div>
        </div>
      </div>
    );
  }

  // ── ARC-CYCLE AC5: D2-разбор ответа /my/exercises ──
  // mode='blocks' → две секции (гимнастика + тренировка). Иначе (mode='legacy' или
  // старая плоская форма без mode) → legacy одиночный комплекс (прежнее поведение).
  // Boolean(...) — иначе && вернёт объект блока, а не true; legacy ниже опирается на !isBlocks.
  const isBlocks = todayComplex?.mode === 'blocks' && Boolean(todayComplex.gymnastics || todayComplex.training);
  const gymnastics = isBlocks ? todayComplex.gymnastics : null;
  const training = isBlocks ? todayComplex.training : null;
  const legacy = !isBlocks ? todayComplex : null;

  // «Другие комплексы» = myComplexes минус ВСЕ комплексы блоков (gym + все дни
  // тренировки, не только текущий). Источник — backend block_complex_ids (включает
  // будущие дни ротации, чтобы День Б/В не протекали в «Другие»). Fallback на
  // текущий вид, если поле не пришло (старый бандл/контракт).
  const blockComplexIds = new Set(
    todayComplex?.block_complex_ids || [
      ...(gymnastics?.complexes || []).map((c) => c.complex_id),
      ...(training?.complexes || []).map((c) => c.complex_id),
    ]
  );
  const otherComplexes = isBlocks
    ? myComplexes.filter((c) => !blockComplexIds.has(c.id))
    : (legacy?.complex_id ? myComplexes.filter((c) => c.id !== legacy.complex_id) : myComplexes);

  const hasAnything = isBlocks || Boolean(legacy?.complex_id) || myComplexes.length > 0;

  // ARC-CYCLE AC5+ (визуал): hero-карточка комплекса блока вместо плоской —
  // возврат «красивой» подачи (градиент + крупная кнопка «Начать»), как legacy-hero.
  // Кнопка несёт data-testid (клик → ExerciseRunner). Тренировка = основной teal-градиент,
  // гимнастика = изумруд (ежедневная, светлее). Цвета меняются одной строкой.
  const renderBlockHero = (c, { badge, gradient, testid, hint }) => (
    <Card key={c.complex_id} variant="hero" className="pd-today-card" gradient={gradient}>
      <div className="pd-today-badge">
        <Dumbbell size={18} />
        <span>{badge}</span>
      </div>
      <h2 className="pd-today-title">{c.complex_title || c.diagnosis_name || 'Комплекс'}</h2>
      <p className="pd-today-sub">
        {c.instructor_name ? `${c.instructor_name} · ` : ''}
        {c.exercise_count || 0} упражнений
      </p>
      <button onClick={() => openComplex(c.complex_id)} className="pd-today-btn" data-testid={testid}>
        <Play size={18} />
        Начать
      </button>
      {hint && <p className="pd-today-hint">{hint}</p>}
    </Card>
  );

  const TRAIN_GRADIENT = 'var(--pd-gradient-primary, linear-gradient(135deg, #0D9488, #06B6D4))';
  const GYM_GRADIENT = 'linear-gradient(135deg, #047857 0%, #10B981 55%, #34D399 100%)';

  return (
    <div className="pd-exercises-screen">
      <h1 className="pd-screen-title">Упражнения</h1>

      {!hasAnything && (
        // State C — ничего нет
        <div className="pd-empty-state">
          <div className="pd-empty-state-icon">
            <Dumbbell size={36} />
          </div>
          <h2 className="pd-empty-state-title">Комплекс не назначен</h2>
          <p className="pd-empty-state-text">
            Инструктор ещё не назначил вам комплекс. Свяжитесь с ним через раздел «Связь».
          </p>
        </div>
      )}

      {/* D2 — Гимнастика (ежедневно): hero-карточки */}
      {gymnastics && gymnastics.complexes?.length > 0 && (
        <section data-testid="gymnastics-section">
          <h2 className="pd-screen-subtitle">Гимнастика (ежедневно)</h2>
          {gymnastics.complexes.map((c) =>
            renderBlockHero(c, {
              badge: 'Гимнастика',
              gradient: GYM_GRADIENT,
              testid: `gym-complex-${c.complex_id}`,
              hint:
                gymnastics.target?.min != null
                  ? `Цель: ${gymnastics.target.min}–${gymnastics.target.max} раз/день`
                  : null,
            })
          )}
        </section>
      )}

      {/* D2 — Тренировка (микроцикл, текущий день ротации): hero-карточки */}
      {training && training.complexes?.length > 0 && (
        <section data-testid="training-section">
          <h2 className="pd-screen-subtitle">Тренировка</h2>
          <div className="pd-block-meta" data-testid="training-day-label">
            {training.day_label ? `${training.day_label} · ` : ''}
            День {training.current_day_index} из {training.num_days}
          </div>
          {training.complexes.map((c) =>
            renderBlockHero(c, {
              badge: 'Тренировка сегодня',
              gradient: TRAIN_GRADIENT,
              testid: `training-complex-${c.complex_id}`,
              hint:
                training.target?.min != null
                  ? `Цель: ${training.target.min}–${training.target.max} раз/неделю`
                  : null,
            })
          )}
        </section>
      )}

      {/* Legacy — одиночный комплекс (нет блоков). Прежний hero 1:1. */}
      {legacy?.complex_id && (
        <Card variant="hero" className="pd-today-card" gradient="var(--pd-gradient-primary, linear-gradient(135deg, #0D9488, #06B6D4))">
          <div className="pd-today-badge">
            <Dumbbell size={18} />
            <span>Сегодня</span>
          </div>
          <h2 className="pd-today-title">Ваш комплекс на сегодня</h2>
          <p className="pd-today-sub">
            {legacy.complex_title || legacy.program_title || 'Комплекс упражнений'}
            {legacy.exercise_count ? ` · ${legacy.exercise_count} упражнений` : ''}
          </p>
          <button
            onClick={() => openComplex(legacy.complex_id)}
            className="pd-today-btn"
            data-testid="start-today-btn"
          >
            <Play size={18} />
            Начать тренировку
          </button>
          <p className="pd-today-hint">
            Отмечайте выполнение и уровень боли для каждого упражнения
          </p>
        </Card>
      )}

      {otherComplexes.length > 0 && (
        <>
          <h2 className="pd-screen-subtitle">
            {(isBlocks || legacy?.complex_id) ? 'Другие комплексы' : 'Мои комплексы'}
          </h2>
          <div className="pd-complex-list">
            {otherComplexes.map((c) => (
              <button
                key={c.id}
                onClick={() => openComplex(c.id)}
                className="pd-complex-card"
                data-testid={`complex-card-${c.id}`}
              >
                <div className="pd-complex-card-icon">
                  <Dumbbell size={20} />
                </div>
                <div className="pd-complex-card-body">
                  <div className="pd-complex-card-title">
                    {c.diagnosis_name || c.title || 'Комплекс'}
                  </div>
                  <div className="pd-complex-card-meta">
                    {c.instructor_name ? `${c.instructor_name} · ` : ''}
                    {c.exercises_count || 0} упражнений
                  </div>
                </div>
                <ChevronRight size={18} className="pd-complex-card-chevron" />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default ExercisesScreen;
