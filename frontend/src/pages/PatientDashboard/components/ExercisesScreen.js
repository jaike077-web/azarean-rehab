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
import ComplexDetailView from './ComplexDetailView';
import ExerciseRunner from './ExerciseRunner';

const ExercisesScreen = ({ screenParams }) => {
  const toast = useToast();

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
        onComplete={backToList}
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

  // "Другие" комплексы = всё из myComplexes КРОМЕ сегодняшнего
  const otherComplexes = todayComplex
    ? myComplexes.filter((c) => c.id !== todayComplex.complex_id)
    : myComplexes;

  const hasAnything = todayComplex || myComplexes.length > 0;

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

      {todayComplex && (
        // State A — сегодняшний комплекс (hero)
        <div className="pd-today-card">
          <div className="pd-today-badge">
            <Dumbbell size={18} />
            <span>Сегодня</span>
          </div>
          <h2 className="pd-today-title">Ваш комплекс на сегодня</h2>
          <p className="pd-today-sub">
            {todayComplex.complex_title || todayComplex.program_title || 'Комплекс упражнений'}
            {todayComplex.exercise_count ? ` · ${todayComplex.exercise_count} упражнений` : ''}
          </p>
          <button
            onClick={() => openComplex(todayComplex.complex_id)}
            className="pd-today-btn"
            data-testid="start-today-btn"
          >
            <Play size={18} />
            Начать тренировку
          </button>
          <p className="pd-today-hint">
            Отмечайте выполнение и уровень боли для каждого упражнения
          </p>
        </div>
      )}

      {otherComplexes.length > 0 && (
        <>
          <h2 className="pd-screen-subtitle">
            {todayComplex ? 'Другие комплексы' : 'Мои комплексы'}
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
