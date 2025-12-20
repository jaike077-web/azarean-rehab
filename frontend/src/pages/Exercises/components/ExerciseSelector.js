import React, { useState, useEffect } from 'react';
import { exercises } from '../../../services/api';
import ExerciseViewModal from '../../Exercises/components/ExerciseViewModal';
import {
  BODY_REGIONS,
  EXERCISE_TYPES,
  DIFFICULTY_LEVELS
} from '../../../utils/exerciseConstants';
import './ExerciseSelector.css';

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
      setExercisesList(response.data.exercises || []);
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
      filtered = filtered.filter(ex => ex.body_region === bodyRegion);
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
      <div className="exercise-selector loading">
        <div className="spinner">⏳</div>
        <p>Загрузка упражнений...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="exercise-selector error">
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className="exercise-selector">
      {/* Фильтры */}
      <div className="selector-filters">
        <input
          type="text"
          placeholder="🔍 Поиск упражнений..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="filter-search"
        />

        <select
          value={bodyRegion}
          onChange={(e) => setBodyRegion(e.target.value)}
          className="filter-select"
        >
          <option value="">Все регионы</option>
          {Object.entries(BODY_REGIONS).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>

        <select
          value={exerciseType}
          onChange={(e) => setExerciseType(e.target.value)}
          className="filter-select"
        >
          <option value="">Все типы</option>
          {Object.entries(EXERCISE_TYPES).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>

        {(search || bodyRegion || exerciseType) && (
          <button
            className="btn-clear"
            onClick={() => {
              setSearch('');
              setBodyRegion('');
              setExerciseType('');
            }}
          >
            ✕ Сбросить
          </button>
        )}
      </div>

      {/* Результаты */}
      <div className="selector-results">
        <p className="results-count">
          Найдено: <strong>{filteredList.length}</strong> упражнений
        </p>
      </div>

      {/* Список упражнений */}
      {filteredList.length === 0 ? (
        <div className="selector-empty">
          <p>Упражнений не найдено</p>
          {(search || bodyRegion || exerciseType) && (
            <button
              className="btn-clear"
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
        <div className="selector-list">
          {filteredList.map(exercise => (
            <div
              key={exercise.id}
              className={`selector-item ${isSelected(exercise.id) ? 'selected' : ''}`}
            >
              <div className="item-info">
                <h4 className="item-title">{exercise.short_title || exercise.title}</h4>
                
                <div className="item-meta">
                  <span className="meta-badge region">
                    {BODY_REGIONS[exercise.body_region]}
                  </span>
                  
                  {exercise.exercise_type && (
                    <span className="meta-badge type">
                      {EXERCISE_TYPES[exercise.exercise_type]}
                    </span>
                  )}
                  
                  <span
                    className="meta-badge difficulty"
                    style={{ backgroundColor: getDifficultyColor(exercise.difficulty_level) }}
                  >
                    {DIFFICULTY_LEVELS[exercise.difficulty_level]}
                  </span>
                </div>

                {exercise.muscle_groups && exercise.muscle_groups.length > 0 && (
                  <div className="item-muscles">
                    {exercise.muscle_groups.slice(0, 3).map(muscle => (
                      <span key={muscle.id} className="muscle-badge">
                        {muscle.name_ru}
                      </span>
                    ))}
                    {exercise.muscle_groups.length > 3 && (
                      <span className="muscle-badge more">
                        +{exercise.muscle_groups.length - 3}
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div className="item-actions">
                <button
                  className="btn-view"
                  onClick={() => setViewExercise(exercise)}
                  title="Просмотр"
                >
                  👁️
                </button>
                
                <button
                  className={`btn-select ${isSelected(exercise.id) ? 'selected' : ''}`}
                  onClick={() => handleSelect(exercise)}
                  title={isSelected(exercise.id) ? 'Убрать' : 'Добавить'}
                >
                  {isSelected(exercise.id) ? '✓ Добавлено' : '+ Добавить'}
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
