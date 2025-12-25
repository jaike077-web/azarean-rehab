import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { exercises, complexes } from '../services/api';
import Breadcrumbs from '../components/Breadcrumbs';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { useToast } from '../context/ToastContext';
import {
  Edit2,
  FileText,
  Dumbbell,
  Plus,
  Search,
  Save,
  Check,
  X,
} from 'lucide-react';



import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import './EditComplex.css';
import { Skeleton } from '../components/Skeleton';
import ExerciseCardSkeleton from '../components/skeletons/ExerciseCardSkeleton';

// Компонент для перетаскиваемого упражнения
function SortableExercise({ exercise, onRemove, onUpdate }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: exercise.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`selected-exercise ${isDragging ? 'is-dragging' : ''}`}
      {...attributes}
      {...listeners}
    >
      <div className="drag-handle">
        ⋮⋮
      </div>

      <div className="exercise-info">
        <strong>{exercise.title}</strong>
        {(exercise.category || exercise.difficulty) && (
          <span className="exercise-meta">
            {exercise.category}
            {exercise.category && exercise.difficulty && ' • '}
            {exercise.difficulty}
          </span>
        )}
      </div>
      <div className="exercise-params">
        <input
          type="number"
          placeholder="Подходы"
          value={exercise.sets || ''}
          onChange={(e) => onUpdate(exercise.id, 'sets', e.target.value)}
          min="1"
        />
        <input
          type="number"
          placeholder="Повторения"
          value={exercise.reps || ''}
          onChange={(e) => onUpdate(exercise.id, 'reps', e.target.value)}
          min="1"
        />
        <input
          type="number"
          placeholder="Секунд"
          value={exercise.duration_seconds || ''}
          onChange={(e) => onUpdate(exercise.id, 'duration_seconds', e.target.value)}
          min="1"
        />
        <input
          type="text"
          placeholder="Примечание"
          value={exercise.notes || ''}
          onChange={(e) => onUpdate(exercise.id, 'notes', e.target.value)}
          className="notes-input"
        />
      </div>
      <button
        className="remove-exercise-btn"
        onClick={() => onRemove(exercise.id)}
        title="Удалить упражнение"
      >
        <X size={18} />
      </button>
    </div>
  );
}

function EditComplex() {
  const toast = useToast(); 
  const { id } = useParams();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [patientName, setPatientName] = useState('');
  const [diagnosisId, setDiagnosisId] = useState('');
  const [recommendations, setRecommendations] = useState('');
  const [availableExercises, setAvailableExercises] = useState([]);
  const [selectedExercises, setSelectedExercises] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState('');
  const [exercisesLoading, setExercisesLoading] = useState(true);

  // Определяем, есть ли вообще тач
  const isTouchDevice =
    typeof window !== 'undefined' &&
    ('ontouchstart' in window || navigator.maxTouchPoints > 0);

  // Сенсоры dnd-kit (хуки вызываются всегда, без условий)
  const mouseSensor = useSensor(MouseSensor, {
    activationConstraint: {
      distance: 5, // нужно чуть сдвинуть, чтобы начать drag — без long-press
    },
  });

  const touchSensor = useSensor(TouchSensor, {
    activationConstraint: {
      delay: 80, // короткий long-press для тача
      tolerance: 10,
    },
  });

  const keyboardSensor = useSensor(KeyboardSensor, {
    coordinateGetter: sortableKeyboardCoordinates,
  });

  // Здесь только решаем, включать ли тач-сенсор в список
  const sensors = useSensors(
    mouseSensor,
    ...(isTouchDevice ? [touchSensor] : []),
    keyboardSensor
  );
 

  const loadComplexData = useCallback(async () => {
    try {
      setLoading(true);
      const response = await complexes.getOne(id);
      const complexData = response.data.complex;

      setPatientName(complexData.patient_name);
      setDiagnosisId(complexData.diagnosis_id || '');
      setRecommendations(complexData.recommendations || '');

      // Преобразуем упражнения из backend формата
      const exercisesData = complexData.exercises || [];
      const formattedExercises = exercisesData
        .filter(item => item.exercise)
        .map(item => ({
          id: item.exercise.id,
          title: item.exercise.title,
          description: item.exercise.description,
          category: item.exercise.category,
          difficulty: item.exercise.difficulty,
          sets: item.sets,
          reps: item.reps,
          duration_seconds: item.duration_seconds,
          notes: item.notes,
          order_number: item.order_number
        }));

      setSelectedExercises(formattedExercises);
    } catch (err) {
      console.error('Ошибка загрузки комплекса:', err);
      setError('Не удалось загрузить комплекс');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadComplexData();
  }, [loadComplexData]);

  useEffect(() => {
    loadExercises();
  }, []);

  const loadExercises = async () => {
    try {
      setExercisesLoading(true);
      const response = await exercises.getAll();
      setAvailableExercises(response.data.exercises);
    } catch (err) {
      console.error('Ошибка загрузки упражнений:', err);
    } finally {
      setExercisesLoading(false);
    }
  };

  const handleAddExercise = (exercise) => {
    if (selectedExercises.find(e => e.id === exercise.id)) {
      toast.success('Ссылка скопирована!');
      return;
    }

    setSelectedExercises([...selectedExercises, {
      ...exercise,
      sets: 3,
      reps: 10,
      duration_seconds: 30,
      notes: ''
    }]);
  };

  const handleRemoveExercise = (exerciseId) => {
    setSelectedExercises(selectedExercises.filter(e => e.id !== exerciseId));
  };

  const handleUpdateExercise = (exerciseId, field, value) => {
    setSelectedExercises(selectedExercises.map(exercise =>
      exercise.id === exerciseId
        ? { ...exercise, [field]: value }
        : exercise
    ));
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;
  
    if (!over) return;
  
    if (active.id !== over.id) {
      setSelectedExercises((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };
  

  const handleSave = async () => {
    if (selectedExercises.length === 0) {
      setError('Добавьте хотя бы одно упражнение');
      return;
    }

    try {
      const updateData = {
        diagnosis_id: diagnosisId || null,
        recommendations: recommendations || null,
        exercises: selectedExercises.map((ex, index) => ({
          exercise_id: ex.id,
          order_number: index + 1,
          sets: parseInt(ex.sets) || null,
          reps: parseInt(ex.reps) || null,
          duration_seconds: parseInt(ex.duration_seconds) || null,
          rest_seconds: null,
          notes: ex.notes || null
        }))
      };

      await complexes.update(id, updateData);
      toast.success('Комплекс успешно обновлён! ✓');
      navigate('/my-complexes');
    } catch (err) {
      console.error('Ошибка обновления комплекса:', err);
      setError('Не удалось обновить комплекс');
    }
  };

  const filteredExercises = availableExercises.filter(ex =>
    ex.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    ex.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="edit-complex-page">
        <div className="page-header">
          <Skeleton width="260px" height="32px" />
          <Skeleton width="200px" height="18px" style={{ marginTop: '10px' }} />
        </div>
        <div className="complex-form">
          <div className="form-section">
            <Skeleton width="180px" height="20px" />
            <Skeleton width="100%" height="120px" style={{ marginTop: '12px' }} borderRadius="12px" />
          </div>
          <div className="form-section">
            <Skeleton width="220px" height="20px" />
            <div className="selected-exercises-list">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="selected-exercise">
                  <Skeleton width="32px" height="32px" borderRadius="8px" />
                  <div className="exercise-info">
                    <Skeleton width="60%" height="16px" />
                    <Skeleton width="40%" height="14px" style={{ marginTop: '6px' }} />
                  </div>
                  <Skeleton width="120px" height="32px" borderRadius="8px" />
                </div>
              ))}
            </div>
          </div>
          <div className="form-section">
            <Skeleton width="200px" height="20px" />
            <Skeleton width="100%" height="40px" borderRadius="8px" style={{ marginTop: '12px' }} />
            <div className="available-exercises-grid" style={{ marginTop: '16px' }}>
              {Array.from({ length: 6 }).map((_, index) => (
                <ExerciseCardSkeleton key={index} />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error && !loading) {
    return (
      <div className="error-view">
        <h2>❌ Ошибка</h2>
        <p>{error}</p>
        <button className="btn-primary" onClick={() => navigate('/my-complexes')}>
          ← Вернуться к комплексам
        </button>
      </div>
    );
  }

  return (
    <div className="edit-complex-page">
      <Breadcrumbs
        items={[
          { label: 'Мои комплексы', path: '/dashboard' },
          { label: `Редактирование: ${patientName || ''}` },
        ]}
      />

      <div className="page-header">
        <h1>
          <Edit2 className="page-icon" size={28} />
          <span>Редактирование комплекса</span>
        </h1>
        <p>Пациент: <strong>{patientName}</strong></p>
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="complex-form">
        <div className="form-section">
          <h3>
            <FileText size={20} />
            <span>Рекомендации</span>
          </h3>
          <textarea
            value={recommendations}
            onChange={(e) => setRecommendations(e.target.value)}
            placeholder="Рекомендации для пациента..."
            rows="4"
          />
        </div>

        <div className="form-section">
          <h3>
            <Dumbbell size={20} />
            <span>Упражнения ({selectedExercises.length})</span>
          </h3>
          
          {selectedExercises.length === 0 ? (
            <div className="empty-exercises">
              <p>Нет добавленных упражнений</p>
            </div>
          ) : (
            <DndContext
  sensors={sensors}
  collisionDetection={closestCenter}
  modifiers={[restrictToVerticalAxis]}
  onDragEnd={handleDragEnd}
>
              <SortableContext
                items={selectedExercises.map(e => e.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="selected-exercises-list">
                  {selectedExercises.map((exercise) => (
                    <SortableExercise
                      key={exercise.id}
                      exercise={exercise}
                      onRemove={handleRemoveExercise}
                      onUpdate={handleUpdateExercise}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>

        <div className="form-section">
          <h3>
            <Plus size={20} />
            <span>Добавить упражнения</span>
          </h3>
          <div className="search-wrapper">
            <Search className="search-icon-input" size={16} />
            <input
              type="text"
              placeholder="Поиск упражнений..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
          </div>

          <div className="available-exercises-grid">
            {exercisesLoading
              ? Array.from({ length: 6 }).map((_, index) => (
                  <ExerciseCardSkeleton key={index} />
                ))
              : filteredExercises.map((exercise) => (
                  <div key={exercise.id} className="exercise-card-small">
                    <h4>{exercise.title}</h4>
                    <p>{exercise.description}</p>
                    {(exercise.category || exercise.difficulty) && (
                      <div className="exercise-tags">
                        {exercise.category && <span className="tag">{exercise.category}</span>}
                        {exercise.difficulty && <span className="tag">{exercise.difficulty}</span>}
                      </div>
                    )}
                    <button
                      className="btn-add-exercise"
                      onClick={() => handleAddExercise(exercise)}
                      disabled={selectedExercises.find(e => e.id === exercise.id)}
                    >
                      {selectedExercises.find(e => e.id === exercise.id) ? (
                        <>
                          <Check size={16} />
                          <span>Добавлено</span>
                        </>
                      ) : (
                        <>
                          <Plus size={16} />
                          <span>Добавить</span>
                        </>
                      )}
                    </button>
                  </div>
                ))}
          </div>
        </div>

        <div className="form-actions">
          <button className="btn-secondary" onClick={() => navigate('/my-complexes')}>
            Отмена
          </button>
          <button className="btn-primary" onClick={handleSave}>
            <Save size={18} />
            <span>Сохранить изменения</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default EditComplex;
