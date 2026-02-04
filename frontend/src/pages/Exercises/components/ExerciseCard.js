import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  Dumbbell,
  Eye,
  Footprints,
  Heart,
  Move,
  Pencil,
  Scale,
  Target,
  Trash2,
  User,
  Zap
} from 'lucide-react';
import {
  BODY_REGIONS,
  EXERCISE_TYPES,
  EQUIPMENT_OPTIONS
} from '../../../utils/exerciseConstants';
import './ExerciseCard.css';

// Вспомогательные функции вынесены за пределы компонента для оптимизации
const getVideoThumbnail = (exercise) => {
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

const getBodyRegionIcon = (regionKey) => {
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
  return icons[regionKey] || <User size={16} />;
};

const getTypeIcon = (type) => {
  const icons = {
    strength: <Target size={16} />,
    activation: <Activity size={16} />,
    mobilization: <Heart size={16} />,
    proprioception: <Activity size={16} />,
    balance: <Activity size={16} />,
    plyometrics: <Activity size={16} />,
    stretching: <Heart size={16} />,
    cardio: <Activity size={16} />,
    coordination: <Activity size={16} />,
    relaxation_breathing: <Heart size={16} />,
    stabilization: <Target size={16} />,
    isometric: <Target size={16} />,
    functional_patterns: <Activity size={16} />
  };
  return icons[type] || <Target size={16} />;
};

const getDifficultyBadge = (level) => {
  const config = {
    1: { label: 'Легко', className: 'difficulty-easy' },
    2: { label: 'Умеренно', className: 'difficulty-moderate' },
    3: { label: 'Средне', className: 'difficulty-medium' },
    4: { label: 'Сложно', className: 'difficulty-hard' },
    5: { label: 'Очень сложно', className: 'difficulty-very-hard' }
  };

  const { label, className } = config[level] || config[2];

  return (
    <span className={`difficulty-badge ${className}`}>
      {label}
    </span>
  );
};

const getRehabPhaseBadge = (phase) => {
  const phases = {
    ACUTE: { label: 'Острая', className: 'phase-acute' },
    SUBACUTE: { label: 'Подострая', className: 'phase-subacute' },
    CHRONIC: { label: 'Хроническая', className: 'phase-chronic' },
    acute: { label: 'Острая', className: 'phase-acute' },
    subacute: { label: 'Подострая', className: 'phase-subacute' },
    chronic: { label: 'Хроническая', className: 'phase-chronic' }
  };

  const config = phases[phase] || phases.SUBACUTE;

  return (
    <span className={`rehab-badge ${config.className}`}>
      {config.label}
    </span>
  );
};

const getEquipmentIcon = () => (
  <span className="equipment-icon" aria-hidden="true">
    <Dumbbell size={14} />
  </span>
);

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

  const thumbnail = getVideoThumbnail(exercise);

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
          <span className="placeholder-icon">
            {getBodyRegionIcon(exercise.body_region)}
          </span>
        </div>
        
        {/* Бадж сложности */}
        {getDifficultyBadge(exercise.difficulty_level)}

        {/* Overlay с кнопками */}
        <div className="card-overlay">
          <button
            className="btn-card-action btn-view"
            onClick={handleCardClick}
            title="Открыть"
          >
            <Eye size={20} stroke="#374151" strokeWidth={2} fill="none" />
          </button>
          {onEdit && (
            <button
              className="btn-card-action btn-edit"
              onClick={handleEdit}
              title="Редактировать"
            >
              <Pencil size={20} stroke="#ffffff" strokeWidth={2} fill="none" />
            </button>
          )}
          {onDelete && (
            <button
              className="btn-card-action btn-delete"
              onClick={handleDelete}
              title="Удалить"
            >
              <Trash2 size={20} stroke="#ffffff" strokeWidth={2} fill="none" />
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
            <span className="meta-icon">
              {getBodyRegionIcon(exercise.body_region)}
            </span>
            {BODY_REGIONS[exercise.body_region] || exercise.body_region || 'Не указано'}
          </span>
          
          {exercise.exercise_type && (
            <span className="meta-item">
              <span className="meta-icon">
                {getTypeIcon(exercise.exercise_type)}
              </span>
              {EXERCISE_TYPES[exercise.exercise_type]}
            </span>
          )}
        </div>

        {/* Оборудование */}
        {exercise.equipment && exercise.equipment.length > 0 && (
          <div className="card-equipment">
            {getEquipmentIcon()}
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
              <React.Fragment key={index}>
                {getRehabPhaseBadge(phase)}
              </React.Fragment>
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
            <Scale size={16} />
          </span>
        )}
      </div>
    </div>
  );
}

// React.memo для предотвращения лишних ререндеров
export default React.memo(ExerciseCard);
