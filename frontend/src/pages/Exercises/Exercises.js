import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  Inbox,
  Plus,
  Search
} from 'lucide-react';
import { exercises } from '../../services/api';
import ExerciseFilters from './components/ExerciseFilters';
import ExerciseCard from './components/ExerciseCard';
import ExerciseModal from './components/ExerciseModal';
import DeleteConfirmModal from './components/DeleteConfirmModal';
import s from './Exercises.module.css';
import { Skeleton } from '../../components/Skeleton';
import ExerciseCardSkeleton from '../../components/skeletons/ExerciseCardSkeleton';

function Exercises() {
  const navigate = useNavigate();
  const [exercisesList, setExercisesList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Состояние фильтров
  const [filters, setFilters] = useState({
    search: '',
    body_region: '',
    exercise_type: '',
    difficulty_level: '',
    equipment: '',
    position: '',
    rehab_phase: '',
    sort_by: 'created_at',
    sort_order: 'desc'
  });

  // Модалки
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedExercise, setSelectedExercise] = useState(null);

  useEffect(() => {
    const isModalOpen = showCreateModal || showEditModal;
    if (isModalOpen) {
      document.body.classList.add('modal-open');
    } else {
      document.body.classList.remove('modal-open');
    }

    return () => {
      document.body.classList.remove('modal-open');
    };
  }, [showCreateModal, showEditModal]);

  useEffect(() => {
    loadExercises();
  }, []);

  const loadExercises = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await exercises.getAll();
      setExercisesList(response.data || []);
    } catch (err) {
      console.error('Ошибка загрузки упражнений:', err);
      setError(err.response?.data?.message || 'Не удалось загрузить упражнения');
    } finally {
      setLoading(false);
    }
  };

  // Мемоизированная фильтрация и сортировка упражнений
  const filteredExercises = useMemo(() => {
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

    return filtered;
  }, [exercisesList, filters]);

  // Обработчик изменения фильтров
  const handleFilterChange = (newFilters) => {
    setFilters(newFilters);
  };

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
    return (
      <div className={s.exercisesPage}>
        <div className={s.exercisesPageHeader}>
          <div className={s.headerLeft}>
            <Skeleton width="180px" height="32px" />
            <Skeleton width="240px" height="18px" style={{ marginTop: '10px' }} />
          </div>
          <div className={s.headerActions}>
            <Skeleton width="140px" height="42px" borderRadius="10px" />
          </div>
        </div>
        <div className={s.exercisesContent}>
          <div className={s.filtersRow}>
            <Skeleton width="220px" height="40px" borderRadius="8px" />
            <Skeleton width="160px" height="40px" borderRadius="8px" />
            <Skeleton width="160px" height="40px" borderRadius="8px" />
          </div>
          <div className={s.exercisesGrid}>
            {Array.from({ length: 8 }).map((_, index) => (
              <ExerciseCardSkeleton key={index} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={s.exercisesPage}>
        <div className={s.exercisesPageHeader}>
          <div className={s.headerLeft}>
            <button className={s.backButton} onClick={() => navigate('/dashboard')}>
              <ArrowLeft size={20} />
              Назад в меню
            </button>
            <h1 className={s.pageTitle}>Библиотека упражнений</h1>
          </div>
        </div>
        <div className={s.exercisesContent}>
          <div className={s.exercisesError}>
            <div className={s.errorIcon}>
              <AlertTriangle size={32} />
            </div>
            <h2 className={s.errorTitle}>Ошибка загрузки</h2>
            <p className={s.errorMessage}>{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={s.exercisesPage}>
      {/* Header */}
      <div className={s.exercisesPageHeader}>
        <div className={s.headerLeft}>
          <button className={s.backButton} onClick={() => navigate('/dashboard')}>
            <ArrowLeft size={20} />
            Назад в меню
          </button>
          <h1 className={s.pageTitle}>Библиотека упражнений</h1>
        </div>
        <div className={s.headerActions}>
          <button className={s.btnPrimary} onClick={handleCreate}>
            <Plus size={20} />
            Создать упражнение
          </button>
        </div>
      </div>

      {/* Content */}
      <div className={s.exercisesContent}>
        {/* Фильтры */}
        <ExerciseFilters
          onFilterChange={handleFilterChange}
          totalCount={exercisesList.length}
          filteredCount={filteredExercises.length}
        />

        {/* Упражнения */}
        {exercisesList.length === 0 ? (
          // Пусто совсем
          <div className={s.exercisesEmpty}>
            <div className={s.emptyIcon}>
              <Inbox size={56} />
            </div>
            <h2 className={s.emptyTitle}>Упражнений пока нет</h2>
            <p className={s.emptyMessage}>
              Создайте первое упражнение для библиотеки
            </p>
            <button className={s.btnPrimary} onClick={handleCreate}>
              <Plus size={20} />
              Создать первое упражнение
            </button>
          </div>
        ) : filteredExercises.length === 0 ? (
          // Нет результатов фильтрации
          <div className={s.noResults}>
            <div className={s.noResultsIcon}>
              <Search size={32} />
            </div>
            <h3 className={s.noResultsTitle}>Ничего не найдено</h3>
            <p className={s.noResultsMessage}>
              Попробуйте изменить параметры поиска
            </p>
            <button 
              className={s.btnClearFilters}
              onClick={() => handleFilterChange({})}
            >
              Сбросить фильтры
            </button>
          </div>
        ) : (
          // Сетка карточек
          <div className={s.exercisesGrid}>
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
