// ExerciseViewModal.js - Модалка просмотра упражнения (для CreateComplex)
// Azarean Network - Exercise Library

import React, { useState } from 'react';
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
import './ExerciseViewModal.css';

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
    <div className="modal-overlay" onClick={handleOverlayClick}>
      <div className="exercise-view-modal">
        {/* Header */}
        <div className="modal-header">
          <div className="modal-title-section">
            <h2>{exercise.title}</h2>
            {exercise.short_title && (
              <p className="modal-subtitle">{exercise.short_title}</p>
            )}
          </div>
          <div className="modal-header-actions">
            {onAdd && (
              <button className="btn-add" onClick={() => onAdd(exercise)}>
                ➕ Добавить
              </button>
            )}
            <button className="btn-close" onClick={onClose}>
              ✕
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="modal-tabs">
          <button
            className={`tab ${currentTab === 'video' ? 'active' : ''}`}
            onClick={() => setCurrentTab('video')}
          >
            🎥 Видео
          </button>
          <button
            className={`tab ${currentTab === 'details' ? 'active' : ''}`}
            onClick={() => setCurrentTab('details')}
          >
            💪 Детали
          </button>
          <button
            className={`tab ${currentTab === 'safety' ? 'active' : ''}`}
            onClick={() => setCurrentTab('safety')}
          >
            🛡️ Безопасность
          </button>
          <button
            className={`tab ${currentTab === 'presets' ? 'active' : ''}`}
            onClick={() => setCurrentTab('presets')}
          >
            🎯 Пресеты
          </button>
        </div>

        {/* Content */}
        <div className="modal-body">
          {/* TAB 1: Видео */}
          {currentTab === 'video' && (
            <div className="tab-content">
              {exercise.video_url ? (
                <div className="video-container">
                  <iframe
                    src={getVideoUrl(exercise.video_url)}
                    title={exercise.title}
                    frameBorder="0"
                    allow="autoplay; fullscreen; picture-in-picture; encrypted-media; gyroscope; accelerometer; clipboard-write; screen-wake-lock"
                    allowFullScreen
                  />
                </div>
              ) : (
                <div className="no-video">
                  <p>🎥 Видео не загружено</p>
                </div>
              )}

              {exercise.description && (
                <div className="content-block">
                  <h3>📝 Описание</h3>
                  <p>{exercise.description}</p>
                </div>
              )}

              {exercise.instructions && (
                <div className="content-block instructions">
                  <h3>📖 Инструкции</h3>
                  <div className="instructions-text">
                    {exercise.instructions.split('\n').map((line, i) => (
                      <p key={i}>{line}</p>
                    ))}
                  </div>
                </div>
              )}

              {exercise.cues && (
                <div className="content-block cues">
                  <h3>💬 Вербальные подсказки</h3>
                  <p>{exercise.cues}</p>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: Детали */}
          {currentTab === 'details' && (
            <div className="tab-content">
              <div className="info-grid">
                <div className="info-item">
                  <span className="label">📍 Регион:</span>
                  <span className="value">{getBodyRegionLabel(exercise.body_region)}</span>
                </div>
                {exercise.exercise_type && (
                  <div className="info-item">
                    <span className="label">🏋️ Тип:</span>
                    <span className="value">{getExerciseTypeLabel(exercise.exercise_type)}</span>
                  </div>
                )}
                {exercise.difficulty_level && (
                  <div className="info-item">
                    <span className="label">⭐ Сложность:</span>
                    <span className="value">{getDifficultyLabel(exercise.difficulty_level)}</span>
                  </div>
                )}
                {exercise.equipment && (
                  <div className="info-item">
                    <span className="label">🎯 Оборудование:</span>
                    <span className="value">{getEquipmentLabel(exercise.equipment)}</span>
                  </div>
                )}
                {exercise.position && (
                  <div className="info-item">
                    <span className="label">🧘 Позиция:</span>
                    <span className="value">{getPositionLabel(exercise.position)}</span>
                  </div>
                )}
                {exercise.chain_type && (
                  <div className="info-item">
                    <span className="label">🔗 Цепь:</span>
                    <span className="value">{getChainTypeLabel(exercise.chain_type)}</span>
                  </div>
                )}
                <div className="info-item">
                  <span className="label">🤸 Одностороннее:</span>
                  <span className="value">{exercise.is_unilateral ? 'Да' : 'Нет'}</span>
                </div>
              </div>

              {exercise.muscle_groups && exercise.muscle_groups.length > 0 && (
                <div className="content-block">
                  <h3>💪 Мышечные группы</h3>
                  <div className="muscle-groups">
                    <div className="muscle-category">
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
                      <div className="muscle-category">
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
                <div className="content-block tips">
                  <h3>👨‍⚕️ Советы инструктору</h3>
                  <p>{exercise.tips}</p>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: Безопасность */}
          {currentTab === 'safety' && (
            <div className="tab-content">
              {exercise.rehab_phases && exercise.rehab_phases.length > 0 && (
                <div className="content-block">
                  <h3>🔄 Периоды реабилитации</h3>
                  <div className="phase-badges">
                    {exercise.rehab_phases.map(phase => (
                      <span key={phase} className="badge phase-badge">
                        ✅ {getRehabPhaseLabel(phase)}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {exercise.safe_with_inflammation && (
                <div className="content-block safe">
                  <div className="safety-badge">
                    ✅ Безопасно при воспалении
                  </div>
                </div>
              )}

              {exercise.red_flags && (
                <div className="content-block warning">
                  <h3>⚠️ Красные флаги</h3>
                  <p>{exercise.red_flags}</p>
                </div>
              )}

              {exercise.absolute_contraindications && (
                <div className="content-block danger">
                  <h3>🚫 Абсолютные противопоказания</h3>
                  <p>{exercise.absolute_contraindications}</p>
                </div>
              )}

              {exercise.contraindications && (
                <div className="content-block warning">
                  <h3>⚠️ Общие противопоказания</h3>
                  <p>{exercise.contraindications}</p>
                </div>
              )}

              {exercise.tags && exercise.tags.length > 0 && (
                <div className="content-block">
                  <h3>🏷️ Теги безопасности</h3>
                  <div className="tags-list">
                    {exercise.tags.map(tag => (
                      <span key={tag.id} className="tag" title={tag.description}>
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
            <div className="tab-content">
              {exercise.presets && exercise.presets.length > 0 ? (
                <div className="presets-grid">
                  {exercise.presets.map((preset, index) => (
                    <div key={index} className="preset-card">
                      <div className="preset-header">
                        <span className="preset-goal">
                          {getPresetGoalLabel(preset.goal)}
                        </span>
                        {preset.phase && (
                          <span className="preset-phase">
                            {getRehabPhaseLabel(preset.phase)}
                          </span>
                        )}
                      </div>
                      <div className="preset-params">
                        {preset.sets && <span>Подходы: {preset.sets}</span>}
                        {preset.reps && <span>Повторения: {preset.reps}</span>}
                        {preset.time_sec && <span>Время: {preset.time_sec} сек</span>}
                        {preset.rest_sec && <span>Отдых: {preset.rest_sec} сек</span>}
                      </div>
                      {preset.notes && (
                        <p className="preset-notes">💡 {preset.notes}</p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="no-presets">
                  <p>🎯 Пресеты не созданы</p>
                  <p className="hint">Вы можете добавить упражнение и настроить параметры вручную</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>
            Закрыть
          </button>
          {onAdd && (
            <button className="btn-primary" onClick={() => onAdd(exercise)}>
              ➕ Добавить в комплекс
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default ExerciseViewModal;