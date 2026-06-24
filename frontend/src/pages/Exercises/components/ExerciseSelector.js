import React, { useState, useEffect } from 'react';
import {
  Check,
  Eye,
  Loader2,
  Plus,
  Search,
  X
} from 'lucide-react';
import { exercises } from '../../../services/api';
import ExerciseViewModal from '../../Exercises/components/ExerciseViewModal';
import {
  BODY_REGIONS,
  EXERCISE_TYPES,
  DIFFICULTY_LEVELS,
  bodyRegionMatches,
  formatBodyRegions
} from '../../../utils/exerciseConstants';
import s from './ExerciseSelector.module.css';

function ExerciseSelector({ onSelect, selectedIds = [] }) {
  const [exercisesList, setExercisesList] = useState([]);
  const [filteredList, setFilteredList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Фильтры
  const [search, setSearch] = useState('');
  const [bodyRegion, setBodyRegion] = useState('');
  const [exerciseType, setExerciseType] = useState('');
  
  // Модалка просмотра
  const [viewExercise, setViewExercise] = useState(null);

  useEffect(() => {
    loadExercises();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [search, bodyRegion, exerciseType, exercisesList]);

  const loadExercises = async () => {
    try {
      setLoading(true);
      const response = await exercises.getAll();
      setExercisesList(response.data || []);
    } catch (err) {
      console.error('Ошибка загрузки:', err);
      setError('Не удалось загрузить упражнения');
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...exercisesList];

    if (search) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter(ex =>
        ex.title?.toLowerCase().includes(searchLower) ||
        ex.short_title?.toLowerCase().includes(searchLower)
      );
    }

    if (bodyRegion) {
      filtered = filtered.filter(ex => bodyRegionMatches(ex.body_region, bodyRegion));
    }

    if (exerciseType) {
      filtered = filtered.filter(ex => ex.exercise_type === exerciseType);
    }

    setFilteredList(filtered);
  };

  const handleSelect = (exercise) => {
    if (onSelect) {
      onSelect(exercise);
    }
  };

  const isSelected = (id) => selectedIds.includes(id);

  const getDifficultyColor = (level) => {
    const colors = {
      1: '#48bb78',
      2: '#ed8936',
      3: '#f56565'
    };
    return colors[level] || '#a0aec0';
  };

  if (loading) {
    return (
      <div className={`${s.exerciseSelector} ${s.loading}`}>
        <Loader2 className={s.spinner} size={32} />
        <p>Загрузка упражнений...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`${s.exerciseSelector} ${s.error}`}>
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className={s.exerciseSelector}>
      {/* Фильтры */}
      <div className={s.selectorFilters}>
        <div className={s.filterSearchWrapper}>
          <span className={s.searchIcon} aria-hidden="true">
            <Search size={16} />
          </span>
          <input
            type="text"
            placeholder="Поиск упражнений..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={s.filterSearch}
          />
        </div>

        <select
          value={bodyRegion}
          onChange={(e) => setBodyRegion(e.target.value)}
          className={s.filterSelect}
        >
          <option value="">Все регионы</option>
          {Object.entries(BODY_REGIONS).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>

        <select
          value={exerciseType}
          onChange={(e) => setExerciseType(e.target.value)}
          className={s.filterSelect}
        >
          <option value="">Все типы</option>
          {Object.entries(EXERCISE_TYPES).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>

        {(search || bodyRegion || exerciseType) && (
          <button
            className={s.btnClear}
            onClick={() => {
              setSearch('');
              setBodyRegion('');
              setExerciseType('');
            }}
          >
            <X size={14} />
            Сбросить
          </button>
        )}
      </div>

      {/* Результаты */}
      <div className={s.selectorResults}>
        <p className={s.resultsCount}>
          Найдено: <strong>{filteredList.length}</strong> упражнений
        </p>
      </div>

      {/* Список упражнений */}
      {filteredList.length === 0 ? (
        <div className={s.selectorEmpty}>
          <p>Упражнений не найдено</p>
          {(search || bodyRegion || exerciseType) && (
            <button
              className={s.btnClear}
              onClick={() => {
                setSearch('');
                setBodyRegion('');
                setExerciseType('');
              }}
            >
              Сбросить фильтры
            </button>
          )}
        </div>
      ) : (
        <div className={s.selectorList}>
          {filteredList.map(exercise => (
            <div
              key={exercise.id}
              className={`${s.selectorItem} ${isSelected(exercise.id) ? s.selected : ''}`}
            >
              <div className={s.itemInfo}>
                <h4 className={s.itemTitle}>{exercise.short_title || exercise.title}</h4>
                
                <div className={s.itemMeta}>
                  <span className={`${s.metaBadge} ${s.region}`}>
                    {formatBodyRegions(exercise.body_region)}
                  </span>
                  
                  {exercise.exercise_type && (
                    <span className={`${s.metaBadge} ${s.type}`}>
                      {EXERCISE_TYPES[exercise.exercise_type]}
                    </span>
                  )}
                  
                  <span
                    className={`${s.metaBadge} ${s.difficulty}`}
                    style={{ backgroundColor: getDifficultyColor(exercise.difficulty_level) }}
                  >
                    {DIFFICULTY_LEVELS[exercise.difficulty_level]}
                  </span>
                </div>

                {exercise.muscle_groups && exercise.muscle_groups.length > 0 && (
                  <div className={s.itemMuscles}>
                    {exercise.muscle_groups.slice(0, 3).map(muscle => (
                      <span key={muscle.id} className={s.muscleBadge}>
                        {muscle.name_ru}
                      </span>
                    ))}
                    {exercise.muscle_groups.length > 3 && (
                      <span className={`${s.muscleBadge} ${s.more}`}>
                        +{exercise.muscle_groups.length - 3}
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div className={s.itemActions}>
                <button
                  className={s.btnView}
                  onClick={() => setViewExercise(exercise)}
                  title="Просмотр"
                  aria-label="Просмотр"
                >
                  <Eye size={18} />
                </button>
                
                <button
                  className={`${s.btnSelect} ${isSelected(exercise.id) ? s.selected : ''}`}
                  onClick={() => handleSelect(exercise)}
                  title={isSelected(exercise.id) ? 'Убрать' : 'Добавить'}
                >
                  {isSelected(exercise.id) ? (
                    <>
                      <Check size={16} />
                      Добавлено
                    </>
                  ) : (
                    <>
                      <Plus size={16} />
                      Добавить
                    </>
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Модалка просмотра */}
      {viewExercise && (
        <ExerciseViewModal
          exercise={viewExercise}
          onClose={() => setViewExercise(null)}
          onSelect={() => {
            handleSelect(viewExercise);
            setViewExercise(null);
          }}
          isSelected={isSelected(viewExercise.id)}
        />
      )}
    </div>
  );
}

export default ExerciseSelector;
