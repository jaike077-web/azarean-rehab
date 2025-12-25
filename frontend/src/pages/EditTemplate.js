import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  BookOpen,
  Check,
  Dumbbell,
  FileText,
  GripVertical,
  Plus,
  Save,
  Search,
  X,
} from 'lucide-react';
import { diagnoses, exercises, templates } from '../services/api';
import Breadcrumbs from '../components/Breadcrumbs';
import { useToast } from '../context/ToastContext';
import './EditComplex.css';
import './EditTemplate.css';

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
    >
      <div className="drag-handle" {...attributes} {...listeners}>
        <GripVertical size={18} />
      </div>

      <div className="exercise-info">
        <strong>{exercise.title}</strong>
        {(exercise.body_region || exercise.category) && (
          <span className="exercise-meta">
            {exercise.body_region || exercise.category}
          </span>
        )}
      </div>
      <div className="exercise-params">
        <input
          type="number"
          placeholder="Подходы"
          value={exercise.sets || ''}
          onChange={(event) => onUpdate(exercise.id, 'sets', event.target.value)}
          min="1"
          max="99"
        />
        <input
          type="number"
          placeholder="Повторы"
          value={exercise.reps || ''}
          onChange={(event) => onUpdate(exercise.id, 'reps', event.target.value)}
          min="1"
          max="999"
          disabled={Number(exercise.duration_seconds) > 0}
        />
        <input
          type="number"
          placeholder="Отдых (сек)"
          value={exercise.rest_seconds || ''}
          onChange={(event) => onUpdate(exercise.id, 'rest_seconds', event.target.value)}
          min="0"
          max="9999"
        />
        <input
          type="number"
          placeholder="Время (сек)"
          value={exercise.duration_seconds || ''}
          onChange={(event) => onUpdate(exercise.id, 'duration_seconds', event.target.value)}
          min="1"
          max="9999"
        />
        <input
          type="text"
          placeholder="Примечание"
          value={exercise.notes || ''}
          onChange={(event) => onUpdate(exercise.id, 'notes', event.target.value)}
          className="notes-input"
        />
      </div>
      <button
        className="remove-exercise-btn"
        onClick={() => onRemove(exercise.id)}
        title="Удалить упражнение"
        type="button"
      >
        <X size={18} />
      </button>
    </div>
  );
}

function EditTemplate() {
  const toast = useToast();
  const { id } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [templateName, setTemplateName] = useState('');
  const [description, setDescription] = useState('');
  const [diagnosisId, setDiagnosisId] = useState('');
  const [diagnosesList, setDiagnosesList] = useState([]);
  const [availableExercises, setAvailableExercises] = useState([]);
  const [selectedExercises, setSelectedExercises] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [formError, setFormError] = useState('');
  const [loadError, setLoadError] = useState('');

  const isTouchDevice =
    typeof window !== 'undefined' &&
    ('ontouchstart' in window || navigator.maxTouchPoints > 0);

  const mouseSensor = useSensor(MouseSensor, {
    activationConstraint: { distance: 5 },
  });

  const touchSensor = useSensor(TouchSensor, {
    activationConstraint: { delay: 120, tolerance: 8 },
  });

  const keyboardSensor = useSensor(KeyboardSensor, {
    coordinateGetter: sortableKeyboardCoordinates,
  });

  const sensors = useSensors(
    mouseSensor,
    ...(isTouchDevice ? [touchSensor] : []),
    keyboardSensor
  );

  const loadTemplateData = useCallback(async () => {
    try {
      setLoading(true);
      const response = await templates.getById(id);
      const templateData = response.data.template || response.data;
      const exercisesData = response.data.exercises || [];

      setTemplateName(templateData?.name || '');
      setDescription(templateData?.description || '');
      setDiagnosisId(templateData?.diagnosis_id || '');

      const formattedExercises = exercisesData.map((exercise) => ({
        id: exercise.exercise_id,
        title: exercise.title,
        body_region: exercise.body_region,
        category: exercise.category,
        sets: exercise.sets,
        reps: exercise.reps,
        duration_seconds: exercise.duration_seconds,
        rest_seconds: exercise.rest_seconds || 30,
        notes: exercise.notes,
      }));

      setSelectedExercises(formattedExercises);
    } catch (err) {
      console.error('Ошибка загрузки шаблона:', err);
      setLoadError('Не удалось загрузить шаблон');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadTemplateData();
  }, [loadTemplateData]);

  useEffect(() => {
    const loadExercises = async () => {
      try {
        const response = await exercises.getAll();
        setAvailableExercises(response.data.exercises || []);
      } catch (err) {
        console.error('Ошибка загрузки упражнений:', err);
      }
    };

    const loadDiagnoses = async () => {
      try {
        const response = await diagnoses.getAll();
        setDiagnosesList(response.data.diagnoses || []);
      } catch (err) {
        console.error('Ошибка загрузки диагнозов:', err);
      }
    };

    loadExercises();
    loadDiagnoses();
  }, []);

  const handleAddExercise = (exercise) => {
    if (selectedExercises.find((item) => item.id === exercise.id)) {
      toast.warning('Упражнение уже добавлено');
      return;
    }

    setSelectedExercises([
      ...selectedExercises,
      {
        ...exercise,
        sets: 3,
        reps: 10,
        duration_seconds: '',
        rest_seconds: 30,
        notes: '',
      },
    ]);
  };

  const handleRemoveExercise = (exerciseId) => {
    setSelectedExercises(selectedExercises.filter((exercise) => exercise.id !== exerciseId));
  };

  const handleUpdateExercise = (exerciseId, field, value) => {
    if (['sets', 'reps', 'duration_seconds', 'rest_seconds'].includes(field)) {
      const numValue = parseInt(value, 10);
      if (value && (isNaN(numValue) || numValue < 0 || numValue > 9999)) {
        return;
      }
    }

    setSelectedExercises(
      selectedExercises.map((exercise) => {
        if (exercise.id !== exerciseId) {
          return exercise;
        }
        const updatedExercise = { ...exercise, [field]: value };
        if (field === 'duration_seconds' && Number(value) > 0) {
          updatedExercise.reps = '';
        }
        return updatedExercise;
      })
    );
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
    if (!templateName.trim()) {
      setFormError('Введите название шаблона');
      return;
    }

    if (selectedExercises.length === 0) {
      setFormError('Добавьте хотя бы одно упражнение');
      return;
    }

    try {
      setFormError('');
      const updateData = {
        name: templateName.trim(),
        description: description.trim() || null,
        diagnosis_id: diagnosisId || null,
        exercises: selectedExercises.map((exercise, index) => {
          const durationSeconds = exercise.duration_seconds
            ? parseInt(exercise.duration_seconds, 10)
            : 0;
          return {
            exercise_id: exercise.id,
            order_number: index + 1,
            sets: parseInt(exercise.sets, 10) || 3,
            reps: durationSeconds > 0 ? 0 : parseInt(exercise.reps, 10) || 10,
            duration_seconds: durationSeconds || null,
            rest_seconds: parseInt(exercise.rest_seconds, 10) || 30,
            notes: exercise.notes || null,
          };
        }),
      };

      await templates.update(id, updateData);
      toast.success('Шаблон обновлён');
      navigate('/my-complexes?tab=templates');
    } catch (err) {
      console.error('Ошибка обновления шаблона:', err);
      setFormError('Не удалось обновить шаблон');
      toast.error('Не удалось сохранить изменения');
    }
  };

  const filteredExercises = availableExercises.filter((exercise) =>
    exercise.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const breadcrumbItems = [
    { label: 'Шаблоны', path: '/my-complexes?tab=templates' },
    {
      label: templateName ? `Редактирование: ${templateName}` : 'Редактирование шаблона'
    }
  ];

  if (loading) {
    return (
      <div className="edit-complex-page edit-template-page">
        <Breadcrumbs items={breadcrumbItems} />
        <div className="loading">Загрузка шаблона...</div>
      </div>
    );
  }

  if (loadError && !loading) {
    return (
      <div className="edit-complex-page edit-template-page">
        <Breadcrumbs items={breadcrumbItems} />
        <div className="error-view">
          <h2>Ошибка</h2>
          <p>{loadError}</p>
          <button className="btn-primary" onClick={() => navigate('/my-complexes?tab=templates')}>
            Вернуться к шаблонам
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="edit-complex-page edit-template-page">
      <Breadcrumbs items={breadcrumbItems} />

      <div className="page-header">
        <h1>
          <BookOpen className="page-icon" size={28} />
          <span>Редактирование шаблона</span>
        </h1>
        {templateName && <p>Шаблон: <strong>{templateName}</strong></p>}
      </div>

      {formError && <div className="error-message">{formError}</div>}

      <div className="complex-form">
        <div className="form-section">
          <h3>
            <FileText size={20} />
            <span>Данные шаблона</span>
          </h3>
          <div className="template-form-grid">
            <div className="form-field">
              <label>Название *</label>
              <input
                type="text"
                value={templateName}
                onChange={(event) => setTemplateName(event.target.value)}
                placeholder="Введите название шаблона"
              />
            </div>
            <div className="form-field">
              <label>Диагноз</label>
              <select
                value={diagnosisId}
                onChange={(event) => setDiagnosisId(event.target.value)}
              >
                <option value="">Без диагноза</option>
                {diagnosesList.map((diagnosis) => (
                  <option key={diagnosis.id} value={diagnosis.id}>
                    {diagnosis.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-field full-width">
              <label>Описание</label>
              <textarea
                rows="3"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Краткое описание шаблона"
              />
            </div>
          </div>
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
                items={selectedExercises.map((exercise) => exercise.id)}
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
              onChange={(event) => setSearchTerm(event.target.value)}
              className="search-input"
            />
          </div>

          <div className="available-exercises-grid">
            {filteredExercises.map((exercise) => (
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
                  disabled={selectedExercises.some((item) => item.id === exercise.id)}
                >
                  {selectedExercises.some((item) => item.id === exercise.id) ? (
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
          <button className="btn-secondary" onClick={() => navigate('/my-complexes?tab=templates')}>
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

export default EditTemplate;
