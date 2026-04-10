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

import React, { useState, useEffect, useCallback } from 'react';
import { rehab, patientAuth } from '../../../services/api';
import { useToast } from '../../../context/ToastContext';
import ComplexDetailView from './ComplexDetailView';
import ExerciseRunner from './ExerciseRunner';

const ExercisesScreen = () => {
  const toast = useToast();

  // Данные
  const [todayComplex, setTodayComplex] = useState(null); // из rehab.getMyExercises
  const [myComplexes, setMyComplexes] = useState([]); // из patientAuth.getMyComplexes
  const [loading, setLoading] = useState(true);

  // Навигация подэкранов
  const [view, setView] = useState('list'); // 'list' | 'complex' | 'runner'
  const [selectedComplexId, setSelectedComplexId] = useState(null);
  const [selectedExercise, setSelectedExercise] = useState(null);
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

  // Открытие комплекса
  const openComplex = (id) => {
    setSelectedComplexId(id);
    setSessionId(Date.now()); // новая тренировочная сессия
    setView('complex');
  };

  const backToList = () => {
    setView('list');
    setSelectedComplexId(null);
    setSelectedExercise(null);
  };

  const openRunner = (complexExercise) => {
    setSelectedExercise(complexExercise);
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
        complexExercise={selectedExercise}
        sessionId={sessionId}
        onBack={backToComplex}
        onComplete={backToComplex}
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
      <div>
        <h1 style={titleStyle}>Упражнения</h1>
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
    <div>
      <h1 style={titleStyle}>Упражнения</h1>

      {!hasAnything && (
        // State C — ничего нет
        <div className="pd-empty-state">
          <div className="pd-empty-icon">
            <span style={{ fontSize: 36 }}>🏋️</span>
          </div>
          <h2 className="pd-empty-title">Комплекс не назначен</h2>
          <p className="pd-empty-text">
            Инструктор ещё не назначил вам комплекс. Свяжитесь с ним через раздел «Связь».
          </p>
        </div>
      )}

      {todayComplex && (
        // State A — сегодняшний комплекс (крупно)
        <div className="pd-section">
          <div style={todayIconStyle}>
            <span style={{ fontSize: 36 }}>🏋️</span>
          </div>
          <h2 style={todayTitleStyle}>Ваш комплекс на сегодня</h2>
          <p style={todaySubStyle}>
            {todayComplex.complex_title || todayComplex.program_title || 'Комплекс упражнений'}
            {todayComplex.exercise_count ? ` · ${todayComplex.exercise_count} упражнений` : ''}
          </p>
          <button
            onClick={() => openComplex(todayComplex.complex_id)}
            style={todayButtonStyle}
            data-testid="start-today-btn"
          >
            Начать тренировку
          </button>
          <p style={todayHintStyle}>
            Отмечайте выполнение и уровень боли для каждого упражнения
          </p>
        </div>
      )}

      {otherComplexes.length > 0 && (
        <>
          <h2 style={{ ...titleStyle, fontSize: 16, marginTop: 24, marginBottom: 8 }}>
            {todayComplex ? 'Другие комплексы' : 'Мои комплексы'}
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {otherComplexes.map((c) => (
              <button
                key={c.id}
                onClick={() => openComplex(c.id)}
                style={cardStyle}
                data-testid={`complex-card-${c.id}`}
              >
                <div style={{ flex: 1, textAlign: 'left' }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--pd-text)', marginBottom: 4 }}>
                    {c.diagnosis_name || c.title || 'Комплекс'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--pd-text2)' }}>
                    {c.instructor_name ? `${c.instructor_name} · ` : ''}
                    {c.exercises_count || 0} упражнений
                  </div>
                </div>
                <div style={{ fontSize: 20, color: 'var(--pd-text3)' }}>›</div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

// Стили
const titleStyle = {
  fontSize: 20,
  fontWeight: 800,
  fontFamily: 'var(--pd-font-display)',
  color: 'var(--pd-text)',
  marginBottom: 16,
};

const todayIconStyle = {
  width: 80,
  height: 80,
  borderRadius: '50%',
  background: 'linear-gradient(135deg, var(--pd-accent), var(--pd-accent2))',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  margin: '0 auto 16px',
};

const todayTitleStyle = {
  fontSize: 17,
  fontWeight: 700,
  fontFamily: 'var(--pd-font-display)',
  color: 'var(--pd-text)',
  textAlign: 'center',
  marginBottom: 8,
};

const todaySubStyle = {
  fontSize: 13,
  color: 'var(--pd-text2)',
  textAlign: 'center',
  marginBottom: 20,
};

const todayButtonStyle = {
  width: '100%',
  padding: 16,
  borderRadius: 'var(--pd-radius)',
  border: 'none',
  background: 'linear-gradient(135deg, var(--pd-accent), var(--pd-accent2))',
  color: 'white',
  fontSize: 15,
  fontWeight: 700,
  fontFamily: 'var(--pd-font)',
  cursor: 'pointer',
  boxShadow: '0 4px 14px rgba(26, 138, 106, 0.35)',
  minHeight: 48,
};

const todayHintStyle = {
  fontSize: 12,
  color: 'var(--pd-text3)',
  textAlign: 'center',
  marginTop: 14,
  lineHeight: 1.5,
};

const cardStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: 14,
  background: 'var(--pd-surface)',
  border: '1px solid var(--pd-border)',
  borderRadius: 'var(--pd-radius-sm)',
  cursor: 'pointer',
  width: '100%',
  minHeight: 64,
  textAlign: 'left',
  fontFamily: 'inherit',
};

export default ExercisesScreen;
