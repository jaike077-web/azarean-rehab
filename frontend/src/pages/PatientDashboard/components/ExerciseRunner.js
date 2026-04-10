// =====================================================
// EXERCISE RUNNER - Patient Dashboard
// Экран выполнения одного упражнения:
//  - видео (Kinescope embed)
//  - параметры (sets, reps, duration, rest)
//  - pain slider, difficulty slider, comment
//  - "Выполнено" / "Пропустить" → POST /api/progress
// =====================================================

import React, { useState } from 'react';
import { progressPatient } from '../../../services/api';
import { useToast } from '../../../context/ToastContext';

const ExerciseRunner = ({ complexId, complexExercise, sessionId, onBack, onComplete }) => {
  const toast = useToast();
  const exercise = complexExercise?.exercise || {};

  const [painLevel, setPainLevel] = useState(0);
  const [difficulty, setDifficulty] = useState(5);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const submit = async (completed) => {
    setSaving(true);
    try {
      await progressPatient.create({
        complex_id: complexId,
        exercise_id: exercise.id,
        completed,
        pain_level: painLevel,
        difficulty_rating: difficulty,
        session_id: sessionId,
        comment: comment.trim() || null,
      });
      toast.success(
        completed ? 'Выполнено' : 'Пропущено',
        completed ? 'Прогресс сохранён' : 'Упражнение отмечено как пропущенное'
      );
      onComplete();
    } catch (err) {
      toast.error('Ошибка', err.response?.data?.message || 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  };

  // Kinescope embed
  const getEmbedUrl = () => {
    if (exercise.kinescope_id) {
      return `https://kinescope.io/embed/${exercise.kinescope_id}`;
    }
    if (exercise.video_url) {
      // Поддерживаем старые URL вида https://kinescope.io/watch/XXX → embed
      return exercise.video_url.replace('/watch/', '/embed/');
    }
    return null;
  };

  const embedUrl = getEmbedUrl();

  const paramLine = () => {
    const parts = [];
    if (complexExercise.sets) parts.push(`${complexExercise.sets} подх.`);
    if (complexExercise.duration_seconds > 0) {
      parts.push(`${complexExercise.duration_seconds} сек`);
    } else if (complexExercise.reps) {
      parts.push(`${complexExercise.reps} повт.`);
    }
    if (complexExercise.rest_seconds > 0) parts.push(`отдых ${complexExercise.rest_seconds}с`);
    return parts.join(' · ');
  };

  return (
    <div>
      <button onClick={onBack} style={backBtnStyle} data-testid="runner-back-btn">← К списку</button>

      <h1 style={titleStyle}>{exercise.title || 'Упражнение'}</h1>
      <p style={paramsStyle}>{paramLine()}</p>

      {/* Видео */}
      {embedUrl ? (
        <div style={videoWrapperStyle}>
          <iframe
            src={embedUrl}
            title={exercise.title}
            frameBorder="0"
            allow="autoplay; fullscreen; picture-in-picture; encrypted-media; gyroscope; accelerometer; clipboard-write"
            allowFullScreen
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 0 }}
          />
        </div>
      ) : (
        <div style={{ ...videoWrapperStyle, background: 'var(--pd-bg2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 48 }}>🏋️</span>
        </div>
      )}

      {/* Описание/инструкции (collapsible) */}
      {(exercise.description || exercise.instructions || exercise.contraindications) && (
        <div className="pd-section" style={{ marginTop: 12 }}>
          <button
            onClick={() => setShowDetails(!showDetails)}
            style={{
              background: 'none',
              border: 'none',
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--pd-accent)',
              padding: 0,
              cursor: 'pointer',
            }}
          >
            {showDetails ? '▼ Скрыть детали' : '▶ Показать детали'}
          </button>
          {showDetails && (
            <div style={{ marginTop: 8 }}>
              {exercise.description && (
                <>
                  <div style={sectionHeadStyle}>Описание</div>
                  <p style={sectionBodyStyle}>{exercise.description}</p>
                </>
              )}
              {exercise.instructions && (
                <>
                  <div style={{ ...sectionHeadStyle, marginTop: 8 }}>Инструкции</div>
                  <p style={sectionBodyStyle}>{exercise.instructions}</p>
                </>
              )}
              {exercise.contraindications && (
                <>
                  <div style={{ ...sectionHeadStyle, marginTop: 8, color: '#C53030' }}>Противопоказания</div>
                  <p style={sectionBodyStyle}>{exercise.contraindications}</p>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Контролы прогресса */}
      <div className="pd-section" style={{ marginTop: 12 }}>
        <div style={sectionHeadStyle}>Уровень боли (0–10)</div>
        <input
          type="range"
          min="0"
          max="10"
          value={painLevel}
          onChange={(e) => setPainLevel(parseInt(e.target.value, 10))}
          style={{ width: '100%' }}
          data-testid="pain-slider"
        />
        <div style={sliderLabelsStyle}>
          <span>Нет</span>
          <strong>{painLevel}</strong>
          <span>Максимум</span>
        </div>
      </div>

      <div className="pd-section" style={{ marginTop: 12 }}>
        <div style={sectionHeadStyle}>Сложность (1–10)</div>
        <input
          type="range"
          min="1"
          max="10"
          value={difficulty}
          onChange={(e) => setDifficulty(parseInt(e.target.value, 10))}
          style={{ width: '100%' }}
          data-testid="difficulty-slider"
        />
        <div style={sliderLabelsStyle}>
          <span>Легко</span>
          <strong>{difficulty}</strong>
          <span>Тяжело</span>
        </div>
      </div>

      <div className="pd-section" style={{ marginTop: 12 }}>
        <div style={sectionHeadStyle}>Комментарий (необязательно)</div>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Самочувствие, заметки..."
          rows={3}
          style={textareaStyle}
          data-testid="comment-input"
        />
      </div>

      {/* Кнопки действий */}
      <div style={{ display: 'flex', gap: 10, marginTop: 16, marginBottom: 16 }}>
        <button
          onClick={() => submit(false)}
          disabled={saving}
          style={{ ...actionBtnStyle, ...skipBtnStyle }}
          data-testid="skip-btn"
        >
          Пропустить
        </button>
        <button
          onClick={() => submit(true)}
          disabled={saving}
          style={{ ...actionBtnStyle, ...doneBtnStyle }}
          data-testid="done-btn"
        >
          {saving ? 'Сохранение...' : 'Выполнено'}
        </button>
      </div>
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

const paramsStyle = {
  fontSize: 13,
  color: 'var(--pd-text2)',
  margin: '0 0 12px 0',
};

const videoWrapperStyle = {
  position: 'relative',
  width: '100%',
  paddingBottom: '56.25%',
  borderRadius: 'var(--pd-radius)',
  overflow: 'hidden',
  background: '#000',
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

const sliderLabelsStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  fontSize: 12,
  color: 'var(--pd-text2)',
  marginTop: 4,
};

const textareaStyle = {
  width: '100%',
  padding: 10,
  border: '1px solid var(--pd-border)',
  borderRadius: 'var(--pd-radius-sm)',
  fontSize: 14,
  fontFamily: 'inherit',
  resize: 'vertical',
  minHeight: 60,
  boxSizing: 'border-box',
};

const actionBtnStyle = {
  flex: 1,
  padding: '14px',
  fontSize: 15,
  fontWeight: 700,
  fontFamily: 'var(--pd-font)',
  borderRadius: 'var(--pd-radius)',
  border: 'none',
  cursor: 'pointer',
  minHeight: 48,
};

const skipBtnStyle = {
  background: 'var(--pd-bg2)',
  color: 'var(--pd-text2)',
};

const doneBtnStyle = {
  background: 'linear-gradient(135deg, var(--pd-accent), var(--pd-accent2))',
  color: 'white',
  boxShadow: '0 4px 14px rgba(26, 138, 106, 0.35)',
};

export default ExerciseRunner;
