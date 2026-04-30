// ExerciseViewModal.js - Модалка просмотра упражнения (для CreateComplex)
// Azarean Network - Exercise Library

import React, { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Ban,
  BookOpen,
  CheckCircle2,
  Dumbbell,
  FileText,
  Info,
  Lightbulb,
  Link2,
  MapPin,
  MessageCircle,
  Move,
  Plus,
  Repeat,
  Shield,
  ShieldCheck,
  Star,
  Tag,
  Target,
  Video,
  VideoOff,
  X
} from 'lucide-react';
import {
  getExerciseTypeLabel,
  getBodyRegionLabel,
  getDifficultyLabel,
  getEquipmentLabel,
  getPositionLabel,
  getChainTypeLabel,
  getRehabPhaseLabel,
  getPresetGoalLabel
} from '../../../utils/exerciseConstants';
import s from './ExerciseViewModal.module.css';

function ExerciseViewModal({ exercise, onClose, onAdd }) {
  const [currentTab, setCurrentTab] = useState('video');

  const getVideoUrl = (url) => {
    if (!url) return null;
    
    // Kinescope
    if (url.includes('kinescope.io/embed/')) {
      return url;
    }
    const kinescopeMatch = url.match(/kinescope\.io\/(?:watch\/)?([a-zA-Z0-9]+)/);
    if (kinescopeMatch) {
      return `https://kinescope.io/embed/${kinescopeMatch[1]}`;
    }
    
    // YouTube
    const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/);
    if (ytMatch) {
      return `https://www.youtube.com/embed/${ytMatch[1]}`;
    }
    
    return url;
  };

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className={s.modalOverlay} onClick={handleOverlayClick}>
      <div className={s.exerciseViewModal}>
        {/* Header */}
        <div className={s.modalHeader}>
          <div className={s.modalTitleSection}>
            <h2>{exercise.title}</h2>
            {exercise.short_title && (
              <p className={s.modalSubtitle}>{exercise.short_title}</p>
            )}
          </div>
          <div className={s.modalHeaderActions}>
            {onAdd && (
              <button className={s.btnAdd} onClick={() => onAdd(exercise)}>
                <Plus size={16} />
                Добавить
              </button>
            )}
            <button className={s.btnClose} onClick={onClose} aria-label="Закрыть">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className={s.modalTabs}>
          <button
            className={`${s.tab} ${currentTab === 'video' ? s.active : ''}`}
            onClick={() => setCurrentTab('video')}
          >
            <Video size={16} />
            Видео
          </button>
          <button
            className={`${s.tab} ${currentTab === 'details' ? s.active : ''}`}
            onClick={() => setCurrentTab('details')}
          >
            <Info size={16} />
            Детали
          </button>
          <button
            className={`${s.tab} ${currentTab === 'safety' ? s.active : ''}`}
            onClick={() => setCurrentTab('safety')}
          >
            <Shield size={16} />
            Безопасность
          </button>
          <button
            className={`${s.tab} ${currentTab === 'presets' ? s.active : ''}`}
            onClick={() => setCurrentTab('presets')}
          >
            <Target size={16} />
            Пресеты
          </button>
        </div>

        {/* Content */}
        <div className={s.modalBody}>
          {/* TAB 1: Видео */}
          {currentTab === 'video' && (
            <div className={s.tabContent}>
              {exercise.video_url ? (
                <div className={s.videoContainer}>
                  <iframe
                    src={getVideoUrl(exercise.video_url)}
                    title={exercise.title}
                    frameBorder="0"
                    allow="autoplay; fullscreen; picture-in-picture; encrypted-media; gyroscope; accelerometer; clipboard-write; screen-wake-lock"
                    allowFullScreen
                  />
                </div>
              ) : (
                <div className={s.noVideo}>
                  <p>
                    <VideoOff size={18} />
                    Видео не загружено
                  </p>
                </div>
              )}

              {exercise.description && (
                <div className={s.contentBlock}>
                  <h3>
                    <FileText size={16} />
                    Описание
                  </h3>
                  <p>{exercise.description}</p>
                </div>
              )}

              {exercise.instructions && (
                <div className={`${s.contentBlock} ${s.instructions}`}>
                  <h3>
                    <BookOpen size={16} />
                    Инструкции
                  </h3>
                  <div className={s.instructionsText}>
                    {exercise.instructions.split('\n').map((line, i) => (
                      <p key={i}>{line}</p>
                    ))}
                  </div>
                </div>
              )}

              {exercise.cues && (
                <div className={`${s.contentBlock} ${s.cues}`}>
                  <h3>
                    <MessageCircle size={16} />
                    Вербальные подсказки
                  </h3>
                  <p>{exercise.cues}</p>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: Детали */}
          {currentTab === 'details' && (
            <div className={s.tabContent}>
              <div className={s.infoGrid}>
                <div className={s.infoItem}>
                  <span className={s.label}>
                    <MapPin size={14} />
                    Регион:
                  </span>
                  <span className={s.value}>{getBodyRegionLabel(exercise.body_region)}</span>
                </div>
                {exercise.exercise_type && (
                  <div className={s.infoItem}>
                    <span className={s.label}>
                      <Activity size={14} />
                      Тип:
                    </span>
                    <span className={s.value}>{getExerciseTypeLabel(exercise.exercise_type)}</span>
                  </div>
                )}
                {exercise.difficulty_level && (
                  <div className={s.infoItem}>
                    <span className={s.label}>
                      <Star size={14} />
                      Сложность:
                    </span>
                    <span className={s.value}>{getDifficultyLabel(exercise.difficulty_level)}</span>
                  </div>
                )}
                {exercise.equipment && (
                  <div className={s.infoItem}>
                    <span className={s.label}>
                      <Dumbbell size={14} />
                      Оборудование:
                    </span>
                    <span className={s.value}>{getEquipmentLabel(exercise.equipment)}</span>
                  </div>
                )}
                {exercise.position && (
                  <div className={s.infoItem}>
                    <span className={s.label}>
                      <Move size={14} />
                      Позиция:
                    </span>
                    <span className={s.value}>{getPositionLabel(exercise.position)}</span>
                  </div>
                )}
                {exercise.chain_type && (
                  <div className={s.infoItem}>
                    <span className={s.label}>
                      <Link2 size={14} />
                      Цепь:
                    </span>
                    <span className={s.value}>{getChainTypeLabel(exercise.chain_type)}</span>
                  </div>
                )}
                <div className={s.infoItem}>
                  <span className={s.label}>
                    <Repeat size={14} />
                    Одностороннее:
                  </span>
                  <span className={s.value}>{exercise.is_unilateral ? 'Да' : 'Нет'}</span>
                </div>
              </div>

              {exercise.muscle_groups && exercise.muscle_groups.length > 0 && (
                <div className={s.contentBlock}>
                  <h3>
                    <Activity size={16} />
                    Мышечные группы
                  </h3>
                  <div className={s.muscleGroups}>
                    <div className={s.muscleCategory}>
                      <h4>Первичные</h4>
                      <ul>
                        {exercise.muscle_groups
                          .filter(mg => mg.is_primary)
                          .map(mg => (
                            <li key={mg.id}>{mg.name_ru}</li>
                          ))}
                      </ul>
                    </div>
                    {exercise.muscle_groups.filter(mg => !mg.is_primary).length > 0 && (
                      <div className={s.muscleCategory}>
                        <h4>Вторичные</h4>
                        <ul>
                          {exercise.muscle_groups
                            .filter(mg => !mg.is_primary)
                            .map(mg => (
                              <li key={mg.id}>{mg.name_ru}</li>
                            ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {exercise.tips && (
                <div className={`${s.contentBlock} ${s.tips}`}>
                  <h3>
                    <ShieldCheck size={16} />
                    Советы инструктору
                  </h3>
                  <p>{exercise.tips}</p>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: Безопасность */}
          {currentTab === 'safety' && (
            <div className={s.tabContent}>
              {exercise.rehab_phases && exercise.rehab_phases.length > 0 && (
                <div className={s.contentBlock}>
                  <h3>
                    <Repeat size={16} />
                    Периоды реабилитации
                  </h3>
                  <div className={s.phaseBadges}>
                    {exercise.rehab_phases.map(phase => (
                      <span key={phase} className={`${s.badge} ${s.phaseBadge}`}>
                        <CheckCircle2 size={14} />
                        {getRehabPhaseLabel(phase)}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {exercise.safe_with_inflammation && (
                <div className={`${s.contentBlock} ${s.safe}`}>
                  <div className={s.safetyBadge}>
                    <ShieldCheck size={16} />
                    Безопасно при воспалении
                  </div>
                </div>
              )}

              {exercise.red_flags && (
                <div className={`${s.contentBlock} ${s.warning}`}>
                  <h3>
                    <AlertTriangle size={16} />
                    Красные флаги
                  </h3>
                  <p>{exercise.red_flags}</p>
                </div>
              )}

              {exercise.absolute_contraindications && (
                <div className={`${s.contentBlock} ${s.danger}`}>
                  <h3>
                    <Ban size={16} />
                    Абсолютные противопоказания
                  </h3>
                  <p>{exercise.absolute_contraindications}</p>
                </div>
              )}

              {exercise.contraindications && (
                <div className={`${s.contentBlock} ${s.warning}`}>
                  <h3>
                    <AlertTriangle size={16} />
                    Общие противопоказания
                  </h3>
                  <p>{exercise.contraindications}</p>
                </div>
              )}

              {exercise.tags && exercise.tags.length > 0 && (
                <div className={s.contentBlock}>
                  <h3>
                    <Tag size={16} />
                    Теги безопасности
                  </h3>
                  <div className={s.tagsList}>
                    {exercise.tags.map(tag => (
                      <span key={tag.id} className={s.tag} title={tag.description}>
                        {tag.name_ru || tag.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: Пресеты */}
          {currentTab === 'presets' && (
            <div className={s.tabContent}>
              {exercise.presets && exercise.presets.length > 0 ? (
                <div className={s.presetsGrid}>
                  {exercise.presets.map((preset, index) => (
                    <div key={index} className={s.presetCard}>
                      <div className={s.presetHeader}>
                        <span className={s.presetGoal}>
                          {getPresetGoalLabel(preset.goal)}
                        </span>
                        {preset.phase && (
                          <span className={s.presetPhase}>
                            {getRehabPhaseLabel(preset.phase)}
                          </span>
                        )}
                      </div>
                      <div className={s.presetParams}>
                        {preset.sets && <span>Подходы: {preset.sets}</span>}
                        {preset.reps && <span>Повторения: {preset.reps}</span>}
                        {preset.time_sec && <span>Время: {preset.time_sec} сек</span>}
                        {preset.rest_sec && <span>Отдых: {preset.rest_sec} сек</span>}
                      </div>
                      {preset.notes && (
                        <p className={s.presetNotes}>
                          <Lightbulb size={14} />
                          {preset.notes}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className={s.noPresets}>
                  <p>
                    <Target size={18} />
                    Пресеты не созданы
                  </p>
                  <p className={s.hint}>Вы можете добавить упражнение и настроить параметры вручную</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={s.modalFooter}>
          <button className={s.btnSecondary} onClick={onClose}>
            Закрыть
          </button>
          {onAdd && (
            <button className={s.btnPrimary} onClick={() => onAdd(exercise)}>
              <Plus size={16} />
              Добавить в комплекс
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default ExerciseViewModal;
