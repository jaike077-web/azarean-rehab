// ExerciseDetail.js - Страница детального просмотра упражнения
// Azarean Network - Exercise Library

// src/pages/Exercises/ExerciseDetail.js

import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { exercises } from '../../services/api';
import MDEditor from '@uiw/react-md-editor';
import { AlertTriangle, ArrowLeft, Footprints, Heart, Move, User, Video, Zap } from 'lucide-react';
import s from './ExerciseDetail.module.css';

import {
  getBodyRegionLabel,
  getExerciseTypeLabel,
  getDifficultyLabel,
  getEquipmentLabel,
  getPositionLabel,
  getRehabPhaseLabel,
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

        const ex = response.data;

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

  const getBodyRegionIcon = (region) => {
    const icons = {
      shoulder: <User size={16} />,
      knee: <Footprints size={16} />,
      spine: <Zap size={16} />,
      hip: <Move size={16} />,
      ankle: <Footprints size={16} />,
      elbow: <User size={16} />,
      wrist: <User size={16} />,
      neck: <User size={16} />,
      full_body: <Move size={16} />
    };
    return icons[region] || <Heart size={16} />;
  };

  const renderChips = (items, getLabelFn, colorFn) => {
    if (!items || items.length === 0) return <span className={s.mutedText}>Не указано</span>;

    return (
      <div className={s.chipsRow}>
        {items.map((value) => (
          <span
            key={value}
            className={`${s.chip} ${s.chipSoft}`}
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
        <div className={s.videoPlaceholder}>
          <div className={s.videoPlaceholderIcon} aria-hidden="true">
            <Video size={32} />
          </div>
          <p>Видео не прикреплено</p>
        </div>
      );
    }

    // Простейшая попытка встроить
    return (
      <div className={s.videoFrameWrapper}>
        <iframe
          src={url}
          title="Видео упражнения"
          className={s.videoFrame}
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
      <div className={s.exerciseDetailPage}>
        <div className={`${s.exerciseDetailInner} ${s.loadingState}`}>
          <div className={s.loaderSpinner} />
          <p>Загружаем упражнение...</p>
        </div>
      </div>
    );
  }

  if (error || !exercise) {
    return (
      <div className={s.exerciseDetailPage}>
        <div className={`${s.exerciseDetailInner} ${s.errorState}`}>
          <div className={s.errorIcon} aria-hidden="true">
            <AlertTriangle size={32} />
          </div>
          <h2>Не удалось загрузить упражнение</h2>
          <p className={s.mutedText}>{error || 'Неизвестная ошибка'}</p>
          <button
            className={s.btnPrimaryOutline}
            onClick={() => navigate('/exercises')}
          >
            <ArrowLeft size={16} />
            Вернуться к списку упражнений
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
  const typeLabel = exercise_type ? getExerciseTypeLabel(exercise_type) : 'Не указан';
  const difficultyLabel = getDifficultyLabel(difficulty_level || 1);
  const difficultyColor = getDifficultyColor(difficulty_level || 1);
  const regionIcon = body_region ? getBodyRegionIcon(body_region) : null;

  return (
    <div className={s.exerciseDetailPage}>
      <div className={s.exerciseDetailInner}>
        {/* HEADER */}
        <div className={s.exerciseDetailHeader}>
          <button
            className={s.backButton}
            type="button"
            onClick={() => navigate('/exercises')}
          >
            <ArrowLeft size={16} />
            Назад к библиотеке
          </button>

          <div className={s.exerciseBreadcrumb}>
            <span className={s.crumb}>Библиотека упражнений</span>
            <span className={s.crumbSeparator}>/</span>
            <span className={s.crumbActive}>
              {short_title || title}
            </span>
          </div>
        </div>

        {/* MAIN CARD LAYOUT */}
        <div className={s.exerciseDetailGrid}>
          {/* Левая колонка — видео + ключевые параметры */}
          <section className={s.exerciseMainCard}>
            <div className={s.exerciseMainHeader}>
              <div className={s.titleBlock}>
                <div className={s.titleRow}>
                  {regionIcon && (
                    <span className={s.regionIcon}>
                      {regionIcon}
                    </span>
                  )}
                  <h1 className={s.exerciseTitle}>
                    {title}
                  </h1>
                </div>
                {short_title && (
                  <p className={s.exerciseSubtitle}>
                    {short_title}
                  </p>
                )}
              </div>

              <div className={s.pillRow}>
                <span className={`${s.pill} ${s.pillRegion}`}>
                  {regionIcon && <span className={s.pillIcon}>{regionIcon}</span>}
                  {regionLabel}
                </span>
                <span className={`${s.pill} ${s.pillType}`}>
                  {typeLabel}
                </span>
              </div>

              <div className={s.difficultyBadge}>
                <div className={s.difficultyLabel}>
                  Сложность:
                  <span style={{ color: difficultyColor, marginLeft: 6 }}>
                    {difficultyLabel}
                  </span>
                </div>
                <div className={s.difficultyMeter}>
                  {[1, 2, 3, 4, 5].map((lvl) => (
                    <span
                      key={lvl}
                      className={`${s.difficultyDot} ${difficulty_level && lvl <= difficulty_level ? s.difficultyDotActive : ''}`}
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

            <div className={s.exerciseVideoCard}>
              {thumbnail_url && (
                <div className={s.thumbnailOverlay}>
                  <img
                    src={thumbnail_url}
                    alt={title}
                    className={s.thumbnailImage}
                    onError={(e) => {
                      e.target.style.display = 'none';
                    }}
                  />
                </div>
              )}
              {renderVideo(video_url)}
            </div>

            {description && (
              <div className={s.exerciseSection}>
                <h3 className={s.sectionTitle}>Описание</h3>
                <div className={`${s.sectionText} ${s.markdownContent}`} data-color-mode="light">
                  <MDEditor.Markdown source={description} />
                </div>
              </div>
            )}
          </section>

          {/* Правая колонка — карточки с деталями */}
          <section className={s.exerciseSideColumn}>
            {/* Параметры выполнения */}
            <div className={s.infoCard}>
              <h3 className={s.cardTitle}>Параметры выполнения</h3>

              <div className={s.infoRow}>
                <span className={s.infoLabel}>Оборудование</span>
                <div className={s.infoValue}>
                  {renderChips(equipment, getEquipmentLabel)}
                </div>
              </div>

              <div className={s.infoRow}>
                <span className={s.infoLabel}>Положение тела</span>
                <div className={s.infoValue}>
                  {renderChips(position, getPositionLabel)}
                </div>
              </div>

              <div className={s.infoRow}>
                <span className={s.infoLabel}>Фазы реабилитации</span>
                <div className={s.infoValue}>
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
              <div className={s.infoCard}>
                <h3 className={s.cardTitle}>Инструкции и подсказки</h3>

                {instructions && (
                  <div className={s.infoBlock}>
                    <div className={s.infoBlockLabel}>Пошаговая инструкция</div>
                    <p className={s.infoBlockText} style={{ whiteSpace: s.preLine }}>
                      {instructions}
                    </p>
                  </div>
                )}

                {cues && (
                  <div className={s.infoBlock}>
                    <div className={s.infoBlockLabel}>Вербальные подсказки</div>
                    <p className={s.infoBlockText} style={{ whiteSpace: s.preLine }}>
                      {cues}
                    </p>
                  </div>
                )}

                {tips && (
                  <div className={s.infoBlock}>
                    <div className={s.infoBlockLabel}>Советы инструктору</div>
                    <p className={s.infoBlockText} style={{ whiteSpace: s.preLine }}>
                      {tips}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Безопасность */}
            {contraindications && (
              <div className={`${s.infoCard} ${s.infoCardDanger}`}>
                <h3 className={`${s.cardTitle} ${s.cardTitleDanger}`}>
                  Противопоказания
                </h3>
                <p className={s.infoBlockText} style={{ whiteSpace: s.preLine }}>
                  {contraindications}
                </p>
              </div>
            )}

            {!instructions && !cues && !tips && !contraindications && (
              <div className={`${s.infoCard} ${s.mutedCard}`}>
                <h3 className={s.cardTitle}>Дополнительная информация</h3>
                <p className={s.mutedText}>
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
