import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { exercises, complexes } from '../services/api';
import BackButton from '../components/BackButton';
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
  LayoutDashboard, 
  ClipboardList, 
  Edit2,
  FileText,
  Dumbbell,
  Plus,
  Search,
  Save,
  Check,
  X
} from 'lucide-react';



import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import s from './EditComplex.module.css';
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
      className={`${s.selectedExercise} ${isDragging ? s.isDragging : ''}`}
      {...attributes}
      {...listeners}
    >
      <div className={s.dragHandle}>
        ⋮⋮
      </div>

      <div className={s.exerciseInfo}>
        <strong>{exercise.title}</strong>
        {(exercise.category || exercise.difficulty) && (
          <span className={s.exerciseMeta}>
            {exercise.category}
            {exercise.category && exercise.difficulty && ' • '}
            {exercise.difficulty}
          </span>
        )}
      </div>
      <div className={s.exerciseParams}>
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
          className={s.notesInput}
        />
      </div>
      <button
        className={s.removeExerciseBtn}
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
  const [complexTitle, setComplexTitle] = useState('');
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
      const complexData = response.data;

      setPatientName(complexData.patient_name);
      setComplexTitle(complexData.title || '');
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
      setAvailableExercises(response.data);
    } catch (err) {
      console.error('Ошибка загрузки упражнений:', err);
    } finally {
      setExercisesLoading(false);
    }
  };

  const handleAddExercise = (exercise) => {
    if (selectedExercises.find(e => e.id === exercise.id)) {
      toast.warning('Это упражнение уже добавлено');
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
        title: complexTitle.trim() || null,
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
      <div className={s.editComplexPage}>
        <div className={s.pageHeader}>
          <Skeleton width="260px" height="32px" />
          <Skeleton width="200px" height="18px" style={{ marginTop: '10px' }} />
        </div>
        <div className={s.complexForm}>
          <div className={s.formSection}>
            <Skeleton width="180px" height="20px" />
            <Skeleton width="100%" height="120px" style={{ marginTop: '12px' }} borderRadius="12px" />
          </div>
          <div className={s.formSection}>
            <Skeleton width="220px" height="20px" />
            <div className={s.selectedExercisesList}>
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className={s.selectedExercise}>
                  <Skeleton width="32px" height="32px" borderRadius="8px" />
                  <div className={s.exerciseInfo}>
                    <Skeleton width="60%" height="16px" />
                    <Skeleton width="40%" height="14px" style={{ marginTop: '6px' }} />
                  </div>
                  <Skeleton width="120px" height="32px" borderRadius="8px" />
                </div>
              ))}
            </div>
          </div>
          <div className={s.formSection}>
            <Skeleton width="200px" height="20px" />
            <Skeleton width="100%" height="40px" borderRadius="8px" style={{ marginTop: '12px' }} />
            <div className={s.availableExercisesGrid} style={{ marginTop: '16px' }}>
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
      <div className={s.errorView}>
        <h2>❌ Ошибка</h2>
        <p>{error}</p>
        <button className={s.btnPrimary} onClick={() => navigate('/my-complexes')}>
          ← Вернуться к комплексам
        </button>
      </div>
    );
  }

  return (
    <div className={s.editComplexPage}>
      <Breadcrumbs 
  items={[
    { 
      icon: <LayoutDashboard size={16} />, 
      label: 'Главная', 
      path: '/dashboard' 
    },
    { 
      icon: <ClipboardList size={16} />, 
      label: 'Мои комплексы', 
      path: '/my-complexes' 
    },
    { 
      icon: <Edit2 size={16} />, 
      label: `Редактирование: ${patientName}` 
    }
  ]}
/>

      <div className={s.backButtonWrapper}>
        <BackButton to="/my-complexes" label="К списку комплексов" />
      </div>

      <div className={s.pageHeader}>
        <h1>
          <Edit2 className={s.pageIcon} size={28} />
          <span>Редактирование комплекса</span>
        </h1>
        <p>Пациент: <strong>{patientName}</strong></p>
      </div>

      {error && <div className={s.errorMessage}>{error}</div>}

      <div className={s.complexForm}>
        <div className={s.formSection}>
          <h3>
            <FileText size={20} />
            <span>Название комплекса</span>
          </h3>
          <input
            type="text"
            value={complexTitle}
            onChange={(e) => setComplexTitle(e.target.value)}
            placeholder="Например: Утренний комплекс плеча"
            maxLength={255}
            autoComplete="off"
          />
          <small style={{ color: 'var(--color-text-muted)', fontSize: '12px', display: 'block', marginTop: '4px' }}>
            Если оставить пустым — название соберётся из первых двух упражнений.
          </small>
        </div>

        <div className={s.formSection}>
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

        <div className={s.formSection}>
          <h3>
            <Dumbbell size={20} />
            <span>Упражнения ({selectedExercises.length})</span>
          </h3>
          
          {selectedExercises.length === 0 ? (
            <div className={s.emptyExercises}>
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
                <div className={s.selectedExercisesList}>
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

        <div className={s.formSection}>
          <h3>
            <Plus size={20} />
            <span>Добавить упражнения</span>
          </h3>
          <div className={s.searchWrapper}>
            <Search className={s.searchIconInput} size={16} />
            <input
              type="text"
              placeholder="Поиск упражнений..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={s.searchInput}
            />
          </div>

          <div className={s.availableExercisesGrid}>
            {exercisesLoading
              ? Array.from({ length: 6 }).map((_, index) => (
                  <ExerciseCardSkeleton key={index} />
                ))
              : filteredExercises.map((exercise) => (
                  <div key={exercise.id} className={s.exerciseCardSmall}>
                    <h4>{exercise.title}</h4>
                    <p>{exercise.description}</p>
                    {(exercise.category || exercise.difficulty) && (
                      <div className={s.exerciseTags}>
                        {exercise.category && <span className={s.tag}>{exercise.category}</span>}
                        {exercise.difficulty && <span className={s.tag}>{exercise.difficulty}</span>}
                      </div>
                    )}
                    <button
                      className={s.btnAddExercise}
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

        <div className={s.formActions}>
          <button className={s.btnSecondary} onClick={() => navigate('/my-complexes')}>
            Отмена
          </button>
          <button className={s.btnPrimary} onClick={handleSave}>
            <Save size={18} />
            <span>Сохранить изменения</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default EditComplex;
