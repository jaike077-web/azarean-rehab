import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { exercises } from '../../services/api';
import ExerciseFilters from './components/ExerciseFilters';
import ExerciseCard from './components/ExerciseCard';
import ExerciseModal from './components/ExerciseModal';
import DeleteConfirmModal from './components/DeleteConfirmModal';
import './Exercises.css';
import { ExercisesPageSkeleton } from '../../components/Skeleton';

function Exercises() {
  const navigate = useNavigate();
  const [exercisesList, setExercisesList] = useState([]);
  const [filteredExercises, setFilteredExercises] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Модалки
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedExercise, setSelectedExercise] = useState(null);

  // Фильтры
  const [currentFilters, setCurrentFilters] = useState({});

  useEffect(() => {
    loadExercises();
  }, []);

  const loadExercises = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await exercises.getAll();
      setExercisesList(response.data.exercises || []);
      setFilteredExercises(response.data.exercises || []);
    } catch (err) {
      console.error('Ошибка загрузки упражнений:', err);
      setError(err.response?.data?.message || 'Не удалось загрузить упражнения');
    } finally {
      setLoading(false);
    }
  };

  // Применение фильтров
  const handleFilterChange = useCallback((filters) => {
    setCurrentFilters(filters);
    
    let filtered = [...exercisesList];

    // Поиск
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      filtered = filtered.filter(ex => 
        ex.title?.toLowerCase().includes(searchLower) ||
        ex.short_title?.toLowerCase().includes(searchLower) ||
        ex.description?.toLowerCase().includes(searchLower)
      );
    }

    // Регион тела
    if (filters.body_region) {
      filtered = filtered.filter(ex => ex.body_region === filters.body_region);
    }

    // Тип упражнения
    if (filters.exercise_type) {
      filtered = filtered.filter(ex => ex.exercise_type === filters.exercise_type);
    }

    // Сложность
    if (filters.difficulty_level) {
      filtered = filtered.filter(ex => 
        ex.difficulty_level === parseInt(filters.difficulty_level)
      );
    }

    // Оборудование
    if (filters.equipment) {
      filtered = filtered.filter(ex => ex.equipment === filters.equipment);
    }

    // Позиция
    if (filters.position) {
      filtered = filtered.filter(ex => ex.position === filters.position);
    }

    // Фаза реабилитации
    if (filters.rehab_phase) {
      filtered = filtered.filter(ex => 
        ex.rehab_phases && ex.rehab_phases.includes(filters.rehab_phase)
      );
    }

    // Сортировка
    if (filters.sort_by) {
      filtered.sort((a, b) => {
        let aVal = a[filters.sort_by];
        let bVal = b[filters.sort_by];

        // Обработка null/undefined
        if (aVal === null || aVal === undefined) return 1;
        if (bVal === null || bVal === undefined) return -1;

        // Для строк
        if (typeof aVal === 'string') {
          aVal = aVal.toLowerCase();
          bVal = bVal.toLowerCase();
        }

        // Сравнение
        if (filters.sort_order === 'asc') {
          return aVal > bVal ? 1 : -1;
        } else {
          return aVal < bVal ? 1 : -1;
        }
      });
    }

    setFilteredExercises(filtered);
  }, [exercisesList]);

  // Создание
  const handleCreate = () => {
    setShowCreateModal(true);
  };

  // Редактирование
  const handleEdit = (exercise) => {
    setSelectedExercise(exercise);
    setShowEditModal(true);
  };

  // Удаление
  const handleDelete = (exercise) => {
    setSelectedExercise(exercise);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!selectedExercise) return;

    try {
      await exercises.delete(selectedExercise.id);
      setShowDeleteModal(false);
      setSelectedExercise(null);
      loadExercises();
    } catch (err) {
      console.error('Ошибка удаления:', err);
      alert('Не удалось удалить упражнение');
    }
  };

  // Просмотр
  const handleView = (id) => {
    navigate(`/exercises/${id}`);
  };

  // После сохранения
  const handleSave = () => {
    setShowCreateModal(false);
    setShowEditModal(false);
    setSelectedExercise(null);
    loadExercises();
  };

  if (loading) {
    return <ExercisesPageSkeleton count={6} />;
  }

  if (error) {
    return (
      <div className="exercises-page">
        <div className="exercises-page-header">
          <div className="header-left">
            <button className="btn-back" onClick={() => navigate('/dashboard')}>
              ← Назад в меню
            </button>
            <h1 className="page-title">🏋️ Библиотека упражнений</h1>
          </div>
        </div>
        <div className="exercises-content">
          <div className="exercises-error">
            <div className="error-icon">⚠️</div>
            <h2 className="error-title">Ошибка загрузки</h2>
            <p className="error-message">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="exercises-page">
      {/* Header */}
      <div className="exercises-page-header">
        <div className="header-left">
          <button className="btn-back" onClick={() => navigate('/dashboard')}>
            ← Назад в меню
          </button>
          <h1 className="page-title">🏋️ Библиотека упражнений</h1>
        </div>
        <div className="header-actions">
          <button className="btn-add" onClick={handleCreate}>
            + Создать упражнение
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="exercises-content">
        {/* Фильтры */}
        <ExerciseFilters
          onFilterChange={handleFilterChange}
          totalCount={exercisesList.length}
          filteredCount={filteredExercises.length}
        />

        {/* Упражнения */}
        {exercisesList.length === 0 ? (
          // Пусто совсем
          <div className="exercises-empty">
            <div className="empty-icon">📭</div>
            <h2 className="empty-title">Упражнений пока нет</h2>
            <p className="empty-message">
              Создайте первое упражнение для библиотеки
            </p>
            <button className="btn-create-first" onClick={handleCreate}>
              + Создать первое упражнение
            </button>
          </div>
        ) : filteredExercises.length === 0 ? (
          // Нет результатов фильтрации
          <div className="no-results">
            <div className="no-results-icon">🔍</div>
            <h3 className="no-results-title">Ничего не найдено</h3>
            <p className="no-results-message">
              Попробуйте изменить параметры поиска
            </p>
            <button 
              className="btn-clear-filters"
              onClick={() => handleFilterChange({})}
            >
              Сбросить фильтры
            </button>
          </div>
        ) : (
          // Сетка карточек
          <div className="exercises-grid">
            {filteredExercises.map(exercise => (
              <ExerciseCard
                key={exercise.id}
                exercise={exercise}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onView={handleView}
              />
            ))}
          </div>
        )}
      </div>

      {/* Модалки */}
      {showCreateModal && (
        <ExerciseModal
          onClose={() => setShowCreateModal(false)}
          onSave={handleSave}
        />
      )}

      {showEditModal && selectedExercise && (
        <ExerciseModal
          exercise={selectedExercise}
          onClose={() => {
            setShowEditModal(false);
            setSelectedExercise(null);
          }}
          onSave={handleSave}
        />
      )}

      {showDeleteModal && selectedExercise && (
        <DeleteConfirmModal
          title={selectedExercise.title}
          onConfirm={confirmDelete}
          onCancel={() => {
            setShowDeleteModal(false);
            setSelectedExercise(null);
          }}
        />
      )}
    </div>
  );
}

export default Exercises;
