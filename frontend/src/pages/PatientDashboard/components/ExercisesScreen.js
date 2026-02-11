// =====================================================
// EXERCISES SCREEN - Patient Dashboard
// Exercise program display and navigation
// =====================================================

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { rehab } from '../../../services/api';
import { useToast } from '../../../context/ToastContext';

const ExercisesScreen = ({ dashboardData }) => {
  const navigate = useNavigate();
  const toast = useToast();
  const [exerciseData, setExerciseData] = useState(null);
  const [loading, setLoading] = useState(true);

  // Load exercise data on mount
  useEffect(() => {
    const loadExercises = async () => {
      setLoading(true);
      try {
        const response = await rehab.getMyExercises();
        setExerciseData(response.data?.data || response.data);
      } catch (error) {
        if (error.response?.status === 404) {
          // No program assigned
          setExerciseData(null);
        } else {
          toast.error('Ошибка', 'Не удалось загрузить упражнения');
        }
      } finally {
        setLoading(false);
      }
    };

    loadExercises();
  }, [toast]);

  // Handle start training button
  const handleStartTraining = () => {
    if (exerciseData?.access_token) {
      navigate(`/patient/${exerciseData.access_token}`);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div>
        <h1
          style={{
            fontSize: '20px',
            fontWeight: 800,
            fontFamily: 'var(--pd-font-display)',
            color: 'var(--pd-text)',
            marginBottom: '16px',
          }}
        >
          Упражнения
        </h1>

        <div className="pd-section">
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px' }}>
            <div className="pd-skeleton pd-skeleton--circle"></div>
            <div style={{ flex: 1 }}>
              <div className="pd-skeleton pd-skeleton--title"></div>
              <div className="pd-skeleton pd-skeleton--text" style={{ width: '40%' }}></div>
            </div>
          </div>
          <div className="pd-skeleton pd-skeleton--card"></div>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Title */}
      <h1
        style={{
          fontSize: '20px',
          fontWeight: 800,
          fontFamily: 'var(--pd-font-display)',
          color: 'var(--pd-text)',
          marginBottom: '16px',
        }}
      >
        Упражнения
      </h1>

      {exerciseData ? (
        // Exercise program exists
        <div className="pd-section">
          {/* Large icon circle */}
          <div
            style={{
              width: '80px',
              height: '80px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, var(--pd-accent), var(--pd-accent2))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
            }}
          >
            <span style={{ fontSize: '36px' }}>🏋️</span>
          </div>

          {/* Heading */}
          <h2
            style={{
              fontSize: '17px',
              fontWeight: 700,
              fontFamily: 'var(--pd-font-display)',
              color: 'var(--pd-text)',
              textAlign: 'center',
              marginBottom: '8px',
            }}
          >
            Ваш комплекс на сегодня
          </h2>

          {/* Program info */}
          <p
            style={{
              fontSize: '13px',
              color: 'var(--pd-text2)',
              textAlign: 'center',
              marginBottom: '20px',
            }}
          >
            {exerciseData.complex_title} · {exerciseData.exercise_count} упражнений
          </p>

          {/* Start training button */}
          <button
            onClick={handleStartTraining}
            style={{
              width: '100%',
              padding: '16px',
              borderRadius: 'var(--pd-radius)',
              border: 'none',
              background: 'linear-gradient(135deg, var(--pd-accent), var(--pd-accent2))',
              color: 'white',
              fontSize: '15px',
              fontWeight: 700,
              fontFamily: 'var(--pd-font)',
              cursor: 'pointer',
              boxShadow: '0 4px 14px rgba(26, 138, 106, 0.35)',
              transition: 'all 0.2s ease',
            }}
            onMouseDown={(e) => {
              e.currentTarget.style.transform = 'scale(0.98)';
            }}
            onMouseUp={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
            }}
          >
            Начать тренировку
          </button>

          {/* Info note */}
          <p
            style={{
              fontSize: '12px',
              color: 'var(--pd-text3)',
              textAlign: 'center',
              marginTop: '14px',
              lineHeight: 1.5,
            }}
          >
            Отмечайте выполнение и уровень боли для каждого упражнения
          </p>
        </div>
      ) : (
        // No program assigned - empty state
        <div className="pd-empty-state">
          <div className="pd-empty-icon">
            <span style={{ fontSize: '36px' }}>🏋️</span>
          </div>

          <h2 className="pd-empty-title">Комплекс не назначен</h2>

          <p className="pd-empty-text" style={{ marginBottom: '20px' }}>
            Ваш инструктор ещё не создал программу с упражнениями. Свяжитесь с ним.
          </p>

          {/* Info card */}
          <div
            style={{
              backgroundColor: '#F0F7FF',
              border: '1px solid #D4E5F7',
              borderRadius: 'var(--pd-radius-sm)',
              padding: '14px',
              textAlign: 'left',
            }}
          >
            <p
              style={{
                fontSize: '12px',
                color: 'var(--pd-text2)',
                lineHeight: 1.6,
                margin: 0,
              }}
            >
              🔗 Если у вас есть ссылка на комплекс от инструктора — откройте её напрямую
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExercisesScreen;
