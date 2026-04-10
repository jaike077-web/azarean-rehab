// =====================================================
// COMPLEX DETAIL VIEW - Patient Dashboard
// Показывает один конкретный комплекс со списком упражнений.
// Клик на упражнение → ExerciseRunner.
// =====================================================

import React, { useState, useEffect } from 'react';
import { patientAuth } from '../../../services/api';
import { useToast } from '../../../context/ToastContext';

const ComplexDetailView = ({ complexId, onBack, onSelectExercise }) => {
  const toast = useToast();
  const [complex, setComplex] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const res = await patientAuth.getMyComplex(complexId);
        if (cancelled) return;
        const data = res.data?.data?.complex || res.data?.complex;
        setComplex(data);
      } catch (err) {
        if (cancelled) return;
        toast.error('Ошибка', 'Не удалось загрузить комплекс');
        onBack();
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [complexId, toast, onBack]);

  const formatRepsLine = (ce) => {
    const parts = [];
    if (ce.sets) parts.push(`${ce.sets} подх.`);
    if (ce.duration_seconds > 0) {
      parts.push(`${ce.duration_seconds} сек`);
    } else if (ce.reps) {
      parts.push(`${ce.reps} повт.`);
    }
    if (ce.rest_seconds > 0) parts.push(`отдых ${ce.rest_seconds}с`);
    return parts.join(' · ');
  };

  if (loading) {
    return (
      <div>
        <button className="pd-back-btn" onClick={onBack} style={backBtnStyle}>← Назад</button>
        <div className="pd-section">
          <div className="pd-skeleton pd-skeleton--title"></div>
          <div className="pd-skeleton pd-skeleton--text"></div>
          <div className="pd-skeleton pd-skeleton--card" style={{ marginTop: 12 }}></div>
          <div className="pd-skeleton pd-skeleton--card" style={{ marginTop: 12 }}></div>
        </div>
      </div>
    );
  }

  if (!complex) return null;

  return (
    <div>
      <button className="pd-back-btn" onClick={onBack} style={backBtnStyle}>← Назад</button>

      <h1 style={titleStyle}>
        {complex.diagnosis_name || complex.title || 'Комплекс упражнений'}
      </h1>

      {complex.instructor_name && (
        <p style={subTitleStyle}>Инструктор: {complex.instructor_name}</p>
      )}

      {complex.diagnosis_note && (
        <div className="pd-section" style={{ marginTop: 12 }}>
          <p style={{ fontSize: 13, color: 'var(--pd-text2)', lineHeight: 1.5, margin: 0 }}>
            {complex.diagnosis_note}
          </p>
        </div>
      )}

      {complex.recommendations && (
        <div className="pd-section" style={{ marginTop: 12, background: '#F0F9F4' }}>
          <div style={sectionHeadStyle}>💡 Рекомендации</div>
          <p style={sectionBodyStyle}>{complex.recommendations}</p>
        </div>
      )}

      {complex.warnings && (
        <div className="pd-section" style={{ marginTop: 12, background: '#FFF5F5', border: '1px solid #FECACA' }}>
          <div style={{ ...sectionHeadStyle, color: '#C53030' }}>⚠ Внимание</div>
          <p style={sectionBodyStyle}>{complex.warnings}</p>
        </div>
      )}

      <h2 style={{ ...titleStyle, fontSize: 16, marginTop: 24, marginBottom: 8 }}>
        Упражнения ({complex.exercises?.length || 0})
      </h2>

      {(!complex.exercises || complex.exercises.length === 0) ? (
        <div className="pd-empty-state">
          <p className="pd-empty-text">В комплексе пока нет упражнений</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {complex.exercises.map((ce) => (
            <button
              key={ce.id}
              onClick={() => onSelectExercise(ce)}
              style={exerciseCardStyle}
              data-testid={`exercise-card-${ce.exercise?.id}`}
            >
              {ce.exercise?.thumbnail_url ? (
                <img
                  src={ce.exercise.thumbnail_url}
                  alt={ce.exercise.title}
                  style={thumbStyle}
                />
              ) : (
                <div style={{ ...thumbStyle, background: 'var(--pd-bg2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: 24 }}>🏋️</span>
                </div>
              )}
              <div style={{ flex: 1, textAlign: 'left' }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--pd-text)', marginBottom: 4 }}>
                  {ce.exercise?.title || 'Упражнение'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--pd-text2)' }}>
                  {formatRepsLine(ce)}
                </div>
              </div>
              <div style={{ fontSize: 20, color: 'var(--pd-text3)' }}>›</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// Стили
const backBtnStyle = {
  background: 'none',
  border: 'none',
  color: 'var(--pd-accent)',
  fontSize: 14,
  fontWeight: 600,
  padding: '8px 0',
  cursor: 'pointer',
  marginBottom: 8,
};

const titleStyle = {
  fontSize: 20,
  fontWeight: 800,
  fontFamily: 'var(--pd-font-display)',
  color: 'var(--pd-text)',
  margin: '0 0 4px 0',
};

const subTitleStyle = {
  fontSize: 12,
  color: 'var(--pd-text2)',
  margin: 0,
};

const sectionHeadStyle = {
  fontSize: 13,
  fontWeight: 700,
  color: 'var(--pd-text)',
  marginBottom: 6,
};

const sectionBodyStyle = {
  fontSize: 13,
  color: 'var(--pd-text2)',
  lineHeight: 1.5,
  margin: 0,
};

const exerciseCardStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: 10,
  background: 'var(--pd-surface)',
  border: '1px solid var(--pd-border)',
  borderRadius: 'var(--pd-radius-sm)',
  cursor: 'pointer',
  width: '100%',
  minHeight: 64,
  textAlign: 'left',
  fontFamily: 'inherit',
};

const thumbStyle = {
  width: 64,
  height: 64,
  objectFit: 'cover',
  borderRadius: 8,
  flexShrink: 0,
};

export default ComplexDetailView;
