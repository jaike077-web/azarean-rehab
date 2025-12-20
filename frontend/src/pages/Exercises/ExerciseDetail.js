// ExerciseDetail.js - Страница детального просмотра упражнения
// Azarean Network - Exercise Library

// src/pages/Exercises/ExerciseDetail.js

import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { exercises } from '../../services/api';
import MDEditor from '@uiw/react-md-editor';
import './ExerciseDetail.css';

import {
  getBodyRegionLabel,
  getExerciseTypeLabel,
  getDifficultyLabel,
  getEquipmentLabel,
  getPositionLabel,
  getRehabPhaseLabel,
  BODY_REGION_ICONS,
  DIFFICULTY_COLORS,
  PHASE_COLORS,
} from '../../utils/exerciseConstants';

const ExerciseDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [exercise, setExercise] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState(null);

  // ============================
  // Загрузка данных
  // ============================
  useEffect(() => {
    let isMounted = true;

    const loadExercise = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await exercises.getById(id);

        // Поддержка разных форматов ответа API
        const payload = response.data || response;
        const ex = payload.exercise || payload;

        if (!ex) {
          throw new Error('Упражнение не найдено');
        }

        // Нормализуем массивы
        ex.equipment = Array.isArray(ex.equipment) ? ex.equipment : [];
        ex.position = Array.isArray(ex.position) ? ex.position : [];
        ex.rehab_phases = Array.isArray(ex.rehab_phases) ? ex.rehab_phases : [];

        if (isMounted) {
          setExercise(ex);
        }
      } catch (err) {
        console.error('Ошибка загрузки упражнения:', err);
        if (isMounted) {
          setError(err.response?.data?.message || err.message || 'Ошибка загрузки упражнения');
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadExercise();

    return () => {
      isMounted = false;
    };
  }, [id]);

  // ============================
  // Хелперы отображения
  // ============================

  const getDifficultyColor = (level) => {
    if (!level) return '#4f46e5';
    if (DIFFICULTY_COLORS && DIFFICULTY_COLORS[level]) {
      return DIFFICULTY_COLORS[level];
    }
    if (level <= 2) return '#22c55e';
    if (level === 3) return '#eab308';
    return '#ef4444';
  };

  const getPhaseColor = (value) => {
    if (PHASE_COLORS && PHASE_COLORS[value]) {
      return PHASE_COLORS[value];
    }
    return '#0f766e';
  };

  const renderChips = (items, getLabelFn, colorFn) => {
    if (!items || items.length === 0) return <span className="muted-text">Не указано</span>;

    return (
      <div className="chips-row">
        {items.map((value) => (
          <span
            key={value}
            className="chip chip-soft"
            style={colorFn ? { borderColor: colorFn(value), color: colorFn(value) } : {}}
          >
            {getLabelFn ? getLabelFn(value) : value}
          </span>
        ))}
      </div>
    );
  };

  const renderVideo = (url) => {
    if (!url) {
      return (
        <div className="video-placeholder">
          <div className="video-placeholder-icon">🎥</div>
          <p>Видео не прикреплено</p>
        </div>
      );
    }

    // Простейшая попытка встроить
    return (
      <div className="video-frame-wrapper">
        <iframe
          src={url}
          title="Видео упражнения"
          className="video-frame"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
        />
      </div>
    );
  };

  // ============================
  // Состояния загрузки / ошибки
  // ============================

  if (loading) {
    return (
      <div className="exercise-detail-page">
        <div className="exercise-detail-inner loading-state">
          <div className="loader-spinner" />
          <p>Загружаем упражнение...</p>
        </div>
      </div>
    );
  }

  if (error || !exercise) {
    return (
      <div className="exercise-detail-page">
        <div className="exercise-detail-inner error-state">
          <div className="error-icon">⚠️</div>
          <h2>Не удалось загрузить упражнение</h2>
          <p className="muted-text">{error || 'Неизвестная ошибка'}</p>
          <button
            className="btn-primary-outline"
            onClick={() => navigate('/exercises')}
          >
            ← Вернуться к списку упражнений
          </button>
        </div>
      </div>
    );
  }

  // ============================
  // Подготовка данных
  // ============================

  const {
    title,
    short_title,
    description,
    video_url,
    thumbnail_url,
    exercise_type,
    body_region,
    difficulty_level,
    equipment,
    position,
    rehab_phases,
    instructions,
    cues,
    tips,
    contraindications,
  } = exercise;

  const regionLabel = body_region ? getBodyRegionLabel(body_region) : 'Не указан';
  const regionIcon = body_region && BODY_REGION_ICONS ? BODY_REGION_ICONS[body_region] : null;
  const typeLabel = exercise_type ? getExerciseTypeLabel(exercise_type) : 'Не указан';
  const difficultyLabel = getDifficultyLabel(difficulty_level || 1);
  const difficultyColor = getDifficultyColor(difficulty_level || 1);

  return (
    <div className="exercise-detail-page">
      <div className="exercise-detail-inner">
        {/* HEADER */}
        <div className="exercise-detail-header">
          <button
            className="back-button"
            type="button"
            onClick={() => navigate('/exercises')}
          >
            ← Назад к библиотеке
          </button>

          <div className="exercise-breadcrumb">
            <span className="crumb">Библиотека упражнений</span>
            <span className="crumb-separator">/</span>
            <span className="crumb-active">
              {short_title || title}
            </span>
          </div>
        </div>

        {/* MAIN CARD LAYOUT */}
        <div className="exercise-detail-grid">
          {/* Левая колонка — видео + ключевые параметры */}
          <section className="exercise-main-card">
            <div className="exercise-main-header">
              <div className="title-block">
                <div className="title-row">
                  {regionIcon && (
                    <span className="region-icon">
                      {regionIcon}
                    </span>
                  )}
                  <h1 className="exercise-title">
                    {title}
                  </h1>
                </div>
                {short_title && (
                  <p className="exercise-subtitle">
                    {short_title}
                  </p>
                )}
              </div>

              <div className="pill-row">
                <span className="pill pill-region">
                  {regionIcon && <span className="pill-icon">{regionIcon}</span>}
                  {regionLabel}
                </span>
                <span className="pill pill-type">
                  {typeLabel}
                </span>
              </div>

              <div className="difficulty-badge">
                <div className="difficulty-label">
                  Сложность:
                  <span style={{ color: difficultyColor, marginLeft: 6 }}>
                    {difficultyLabel}
                  </span>
                </div>
                <div className="difficulty-meter">
                  {[1, 2, 3, 4, 5].map((lvl) => (
                    <span
                      key={lvl}
                      className={
                        'difficulty-dot' +
                        (difficulty_level && lvl <= difficulty_level
                          ? ' difficulty-dot-active'
                          : '')
                      }
                      style={
                        difficulty_level && lvl <= difficulty_level
                          ? { backgroundColor: difficultyColor }
                          : undefined
                      }
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="exercise-video-card">
              {thumbnail_url && (
                <div className="thumbnail-overlay">
                  <img
                    src={thumbnail_url}
                    alt={title}
                    className="thumbnail-image"
                    onError={(e) => {
                      e.target.style.display = 'none';
                    }}
                  />
                </div>
              )}
              {renderVideo(video_url)}
            </div>

            {description && (
              <div className="exercise-section">
                <h3 className="section-title">Описание</h3>
                <div className="section-text markdown-content" data-color-mode="light">
                  <MDEditor.Markdown source={description} />
                </div>
              </div>
            )}
          </section>

          {/* Правая колонка — карточки с деталями */}
          <section className="exercise-side-column">
            {/* Параметры выполнения */}
            <div className="info-card">
              <h3 className="card-title">Параметры выполнения</h3>

              <div className="info-row">
                <span className="info-label">Оборудование</span>
                <div className="info-value">
                  {renderChips(equipment, getEquipmentLabel)}
                </div>
              </div>

              <div className="info-row">
                <span className="info-label">Положение тела</span>
                <div className="info-value">
                  {renderChips(position, getPositionLabel)}
                </div>
              </div>

              <div className="info-row">
                <span className="info-label">Фазы реабилитации</span>
                <div className="info-value">
                  {renderChips(
                    rehab_phases,
                    getRehabPhaseLabel,
                    getPhaseColor
                  )}
                </div>
              </div>
            </div>

            {/* Инструкции и подсказки */}
            {(instructions || cues || tips) && (
              <div className="info-card">
                <h3 className="card-title">Инструкции и подсказки</h3>

                {instructions && (
                  <div className="info-block">
                    <div className="info-block-label">Пошаговая инструкция</div>
                    <p className="info-block-text" style={{ whiteSpace: 'pre-line' }}>
                      {instructions}
                    </p>
                  </div>
                )}

                {cues && (
                  <div className="info-block">
                    <div className="info-block-label">Вербальные подсказки</div>
                    <p className="info-block-text" style={{ whiteSpace: 'pre-line' }}>
                      {cues}
                    </p>
                  </div>
                )}

                {tips && (
                  <div className="info-block">
                    <div className="info-block-label">Советы инструктору</div>
                    <p className="info-block-text" style={{ whiteSpace: 'pre-line' }}>
                      {tips}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Безопасность */}
            {contraindications && (
              <div className="info-card info-card-danger">
                <h3 className="card-title card-title-danger">
                  Противопоказания
                </h3>
                <p className="info-block-text" style={{ whiteSpace: 'pre-line' }}>
                  {contraindications}
                </p>
              </div>
            )}

            {!instructions && !cues && !tips && !contraindications && (
              <div className="info-card muted-card">
                <h3 className="card-title">Дополнительная информация</h3>
                <p className="muted-text">
                  Для этого упражнения ещё не добавлены инструкции или
                  противопоказания. Можно использовать как черновик и
                  постепенно дополнять.
                </p>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};

export default ExerciseDetail;