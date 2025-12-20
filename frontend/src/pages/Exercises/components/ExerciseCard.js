import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BODY_REGIONS,
  EXERCISE_TYPES,
  DIFFICULTY_LEVELS,
  EQUIPMENT_OPTIONS
} from '../../../utils/exerciseConstants';
import './ExerciseCard.css';

function ExerciseCard({ exercise, onEdit, onDelete, onView }) {
  const navigate = useNavigate();

  const handleCardClick = () => {
    if (onView) {
      onView(exercise.id);
    } else {
      navigate(`/exercises/${exercise.id}`);
    }
  };

  const handleEdit = (e) => {
    e.stopPropagation();
    if (onEdit) onEdit(exercise);
  };

  const handleDelete = (e) => {
    e.stopPropagation();
    if (onDelete) onDelete(exercise);
  };

  // Получаем thumbnail для видео
  const getVideoThumbnail = () => {
    // Сначала проверяем, есть ли сохранённый thumbnail
    if (exercise.thumbnail_url) {
      return exercise.thumbnail_url;
    }

    if (!exercise.video_url) return null;

    // Kinescope - правильный формат для превью
    // Формат URL: https://kinescope.io/5mMZxKZzxAQ7f1hJnAxa7x
    // Превью: https://kinescope.io/preview/5mMZxKZzxAQ7f1hJnAxa7x/poster
    const kinescopeMatch = exercise.video_url.match(/kinescope\.io\/(?:watch\/|embed\/)?([a-zA-Z0-9]+)/);
    if (kinescopeMatch) {
      return `https://kinescope.io/preview/${kinescopeMatch[1]}/poster`;
    }

    // YouTube
    const ytMatch = exercise.video_url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/);
    if (ytMatch) {
      return `https://img.youtube.com/vi/${ytMatch[1]}/mqdefault.jpg`;
    }

    // Vimeo
    // Для Vimeo нужен API, поэтому просто возвращаем null

    return null;
  };

  const thumbnail = getVideoThumbnail();

  // Получаем иконку для региона
  const getRegionIcon = () => {
    const icons = {
      shoulder: '💪',
      knee: '🦵',
      spine: '🧠',
      hip: '🏃',
      ankle: '🦶',
      elbow: '💪',
      wrist: '✋',
      neck: '🧒',
      full_body: '🏋️'
    };
    return icons[exercise.body_region] || '🏋️';
  };

  // Цвет для сложности
  const getDifficultyColor = () => {
    const colors = {
      1: '#48bb78',  // зелёный - очень легко
      2: '#68d391',  // светло-зелёный - легко
      3: '#ed8936',  // оранжевый - средне
      4: '#f56565',  // красный - сложно
      5: '#c53030'   // тёмно-красный - очень сложно
    };
    return colors[exercise.difficulty_level] || '#a0aec0';
  };

  return (
    <div className="exercise-card" onClick={handleCardClick}>
      {/* Превью видео */}
      <div className="card-thumbnail">
        {thumbnail ? (
          <img 
            src={thumbnail} 
            alt={exercise.title}
            onError={(e) => {
              // Если картинка не загрузилась, показываем placeholder
              e.target.style.display = 'none';
              e.target.nextSibling.style.display = 'flex';
            }}
          />
        ) : null}
        <div 
          className="card-thumbnail-placeholder"
          style={{ display: thumbnail ? 'none' : 'flex' }}
        >
          <span className="placeholder-icon">{getRegionIcon()}</span>
        </div>
        
        {/* Бадж сложности */}
        <div 
          className="difficulty-badge" 
          style={{ backgroundColor: getDifficultyColor() }}
        >
          {DIFFICULTY_LEVELS[exercise.difficulty_level] || 'Не указано'}
        </div>

        {/* Overlay с кнопками */}
        <div className="card-overlay">
          <button 
            className="btn-card-action btn-view"
            onClick={handleCardClick}
            title="Открыть"
          >
            👁️
          </button>
          {onEdit && (
            <button 
              className="btn-card-action btn-edit"
              onClick={handleEdit}
              title="Редактировать"
            >
              ✏️
            </button>
          )}
          {onDelete && (
            <button 
              className="btn-card-action btn-delete"
              onClick={handleDelete}
              title="Удалить"
            >
              🗑️
            </button>
          )}
        </div>
      </div>

      {/* Информация */}
      <div className="card-content">
        {/* Заголовок */}
        <h3 className="card-title">
          {exercise.short_title || exercise.title}
        </h3>

        {/* Метаданные */}
        <div className="card-meta">
          <span className="meta-item">
            <span className="meta-icon">📍</span>
            {BODY_REGIONS[exercise.body_region] || exercise.body_region || 'Не указано'}
          </span>
          
          {exercise.exercise_type && (
            <span className="meta-item">
              <span className="meta-icon">🎯</span>
              {EXERCISE_TYPES[exercise.exercise_type]}
            </span>
          )}
        </div>

        {/* Оборудование */}
        {exercise.equipment && exercise.equipment.length > 0 && (
          <div className="card-equipment">
            <span className="equipment-icon">🔧</span>
            {Array.isArray(exercise.equipment) 
              ? exercise.equipment.map(eq => EQUIPMENT_OPTIONS[eq] || eq).join(', ')
              : EQUIPMENT_OPTIONS[exercise.equipment] || exercise.equipment
            }
          </div>
        )}

        {/* Мышечные группы */}
        {exercise.muscle_groups && exercise.muscle_groups.length > 0 && (
          <div className="card-muscles">
            {exercise.muscle_groups.slice(0, 3).map((muscle, index) => (
              <span 
                key={muscle.id || index} 
                className={`muscle-tag ${muscle.is_primary ? 'primary' : 'secondary'}`}
              >
                {muscle.name_ru}
              </span>
            ))}
            {exercise.muscle_groups.length > 3 && (
              <span className="muscle-tag more">
                +{exercise.muscle_groups.length - 3}
              </span>
            )}
          </div>
        )}

        {/* Фазы реабилитации */}
        {exercise.rehab_phases && exercise.rehab_phases.length > 0 && (
          <div className="card-phases">
            {exercise.rehab_phases.slice(0, 2).map((phase, index) => (
              <span key={index} className="phase-tag">
                {phase}
              </span>
            ))}
            {exercise.rehab_phases.length > 2 && (
              <span className="phase-tag more">
                +{exercise.rehab_phases.length - 2}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="card-footer">
        <span className="card-date">
          {exercise.created_at ? new Date(exercise.created_at).toLocaleDateString('ru-RU') : ''}
        </span>
        {exercise.is_unilateral && (
          <span className="unilateral-badge" title="Одностороннее">
            ⚖️
          </span>
        )}
      </div>
    </div>
  );
}

export default ExerciseCard;