import React, { useState, useEffect, useMemo } from 'react';
import { patients, diagnoses, exercises, complexes, templates } from '../services/api';
import { useToast } from '../context/ToastContext';
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
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ClipboardList,
  Search,
  Plus,
  GripVertical,
  X,
  Check,
  Home,
  ChevronLeft,
  ChevronRight,
  Save,
  Folder,
} from 'lucide-react';
import s from './CreateComplex.module.css';
import TemplateSelector from '../components/TemplateSelector';

// Компонент для перетаскиваемого упражнения
const SortableExercise = React.memo(function SortableExercise({ exercise, onRemove, onUpdate }) {
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

  // Обработчик для предотвращения всплытия событий от инпутов
  const handleInputClick = (e) => {
    e.stopPropagation();
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`${s.selectedExercise} ${isDragging ? s.isDragging : ''}`}
    >
      <div className={s.dragHandle} {...attributes} {...listeners}>
        <GripVertical size={20} />
      </div>
      <div className={s.exerciseInfo}>
        <strong>{exercise.title}</strong>
        {(exercise.body_region || exercise.category) && (
          <span className={s.exerciseMeta}>{exercise.body_region || exercise.category}</span>
        )}
      </div>
      <div className={s.exerciseParams}>
        <input
          type="number"
          placeholder="Подходы"
          value={exercise.sets || ''}
          onChange={(e) => onUpdate(exercise.id, 'sets', e.target.value)}
          onClick={handleInputClick}
          onPointerDown={handleInputClick}
          min="1"
          max="99"
        />
        <input
          type="number"
          placeholder="Повторы"
          value={exercise.reps || ''}
          onChange={(e) => onUpdate(exercise.id, 'reps', e.target.value)}
          onClick={handleInputClick}
          onPointerDown={handleInputClick}
          min="1"
          max="999"
          disabled={Number(exercise.duration_seconds) > 0}
        />
        <input
          type="number"
          placeholder="Отдых (сек)"
          value={exercise.rest_seconds || ''}
          onChange={(e) => onUpdate(exercise.id, 'rest_seconds', e.target.value)}
          onClick={handleInputClick}
          onPointerDown={handleInputClick}
          min="0"
          max="9999"
        />
        <input
          type="number"
          placeholder="Время (сек)"
          value={exercise.duration_seconds || ''}
          onChange={(e) => onUpdate(exercise.id, 'duration_seconds', e.target.value)}
          onClick={handleInputClick}
          onPointerDown={handleInputClick}
          min="1"
          max="9999"
        />
        <input
          type="text"
          placeholder="Заметка..."
          value={exercise.notes || ''}
          onChange={(e) => onUpdate(exercise.id, 'notes', e.target.value)}
          onClick={handleInputClick}
          onPointerDown={handleInputClick}
          className={s.notesInput}
        />
      </div>
      <button
        className={s.removeExerciseBtn}
        onClick={(e) => {
          e.stopPropagation();
          onRemove(exercise.id);
        }}
        title="Удалить"
      >
        <X size={16} />
      </button>
    </div>
  );
});

function CreateComplex() {
  const toast = useToast();
  const [step, setStep] = useState(1);
  const [patientsList, setPatientsList] = useState([]);
  const [diagnosesList, setDiagnosesList] = useState([]);
  const [exercisesList, setExercisesList] = useState([]);
  
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [complexTitle, setComplexTitle] = useState('');
  const [selectedDiagnosis, setSelectedDiagnosis] = useState(null);
  const [diagnosisNote, setDiagnosisNote] = useState('');
  const [recommendations, setRecommendations] = useState('');
  const [warnings, setWarnings] = useState('');
  
  const [selectedExercises, setSelectedExercises] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // Шаблоны
  const [showSaveTemplateModal, setShowSaveTemplateModal] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const [templateSelectorOpen, setTemplateSelectorOpen] = useState(false);
  const [patientSearch, setPatientSearch] = useState('');

  // Определяем тач-устройство
  const isTouchDevice =
    typeof window !== 'undefined' &&
    ('ontouchstart' in window || navigator.maxTouchPoints > 0);

  // Сенсоры dnd-kit
  const mouseSensor = useSensor(MouseSensor, {
    activationConstraint: { distance: 5 },
  });

  const touchSensor = useSensor(TouchSensor, {
    activationConstraint: { delay: 150, tolerance: 8 },
  });

  const keyboardSensor = useSensor(KeyboardSensor, {
    coordinateGetter: sortableKeyboardCoordinates,
  });

  const sensors = useSensors(
    mouseSensor,
    touchSensor,
    keyboardSensor
  );

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [patientsRes, diagnosesRes, exercisesRes] = await Promise.all([
        patients.getAll(),
        diagnoses.getAll(),
        exercises.getAll(),
      ]);
      setPatientsList(patientsRes.data);
      setDiagnosesList(diagnosesRes.data);
      setExercisesList(exercisesRes.data);
    } catch (err) {
      console.error('Ошибка загрузки данных:', err);
      setError('Не удалось загрузить данные');
    }
  };

  // Мемоизированная фильтрация упражнений
  const filteredExercises = useMemo(() => {
    return exercisesList.filter((ex) => {
      const matchesSearch = !searchTerm ||
        ex.title.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = categoryFilter === 'all' ||
        ex.body_region === categoryFilter ||
        ex.category === categoryFilter;
      return matchesSearch && matchesCategory;
    });
  }, [exercisesList, searchTerm, categoryFilter]);

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

  const addExercise = (exercise) => {
    if (selectedExercises.find(e => e.id === exercise.id)) {
      toast.warning('Упражнение уже добавлено');
      return;
    }
    setSelectedExercises([...selectedExercises, {
      ...exercise,
      sets: 3,
      reps: 10,
      rest_seconds: 30,
      order_number: selectedExercises.length + 1
    }]);
    toast.success('Упражнение добавлено');
  };

  const removeExercise = (exerciseId) => {
    setSelectedExercises(selectedExercises.filter(e => e.id !== exerciseId));
  };

  const updateExercise = (exerciseId, field, value) => {
    // Валидация числовых полей
    if (['sets', 'reps', 'duration_seconds', 'rest_seconds'].includes(field)) {
      const numValue = parseInt(value, 10);
      if (value && (isNaN(numValue) || numValue < 0 || numValue > 9999)) {
        return;
      }
    }
    setSelectedExercises(selectedExercises.map(e => {
      if (e.id !== exerciseId) {
        return e;
      }
      const updatedExercise = { ...e, [field]: value };
      if (field === 'duration_seconds' && Number(value) > 0) {
        updatedExercise.reps = '';
      }
      return updatedExercise;
    }));
  };

  const handleSubmit = async () => {
    if (!selectedPatient || selectedExercises.length === 0) {
      setError('Выберите пациента и добавьте хотя бы одно упражнение');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const complexData = {
        patient_id: selectedPatient.id,
        title: complexTitle.trim() || null,
        diagnosis_id: selectedDiagnosis?.id || null,
        diagnosis_note: diagnosisNote,
        recommendations: recommendations || 'Выполняйте упражнения регулярно 3-4 раза в неделю',
        warnings: warnings || 'При усилении боли прекратите выполнение',
        exercises: selectedExercises.map((ex, index) => {
          const durationSeconds = Number(ex.duration_seconds) || 0;
          return {
            exercise_id: ex.id,
            order_number: index + 1,
            sets: parseInt(ex.sets, 10) || 3,
            reps: durationSeconds > 0 ? 0 : parseInt(ex.reps, 10) || 10,
            duration_seconds: durationSeconds,
            rest_seconds: parseInt(ex.rest_seconds, 10) || 30,
            notes: ex.notes || null
          };
        })
      };

      await complexes.create(complexData);
      setStep(4);
      toast.success('Комплекс успешно создан!');
    } catch (err) {
      console.error('Ошибка создания комплекса:', err);
      setError(err.response?.data?.message || 'Ошибка при создании комплекса');
      toast.error('Не удалось создать комплекс');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setStep(1);
    setSelectedPatient(null);
    setSelectedDiagnosis(null);
    setDiagnosisNote('');
    setRecommendations('');
    setWarnings('');
    setSelectedExercises([]);
    setError('');
  };

  // =====================================================
  // ФУНКЦИИ ШАБЛОНОВ
  // =====================================================
  
  const loadTemplate = async (templateId) => {
    try {
      const response = await templates.getById(templateId);
      const templateExercises = response.data.exercises || [];
      const exercisesToAdd = templateExercises.map((exercise) => ({
        id: exercise.exercise_id,
        title: exercise.title,
        body_region: exercise.body_region,
        category: exercise.category,
        sets: exercise.sets,
        reps: exercise.reps,
        duration_seconds: exercise.duration_seconds,
        rest_seconds: exercise.rest_seconds || 30,
        notes: exercise.notes
      }));

      const existingIds = new Set(selectedExercises.map((item) => item.id));
      const uniqueExercises = exercisesToAdd.filter((exercise) => !existingIds.has(exercise.id));
      if (uniqueExercises.length === 0) {
        toast.warning('Все упражнения из шаблона уже добавлены');
      } else {
        setSelectedExercises([...selectedExercises, ...uniqueExercises]);
        toast.success(`Добавлено упражнений: ${uniqueExercises.length}`);
      }

      setTemplateSelectorOpen(false);
    } catch (err) {
      console.error('Ошибка загрузки шаблона:', err);
      toast.error('Не удалось загрузить шаблон');
    }
  };

  const saveAsTemplate = async () => {
    if (!templateName.trim()) {
      toast.error('Введите название шаблона');
      return;
    }

    if (selectedExercises.length === 0) {
      toast.error('Добавьте упражнения в комплекс');
      return;
    }

    try {
      const templateData = {
        name: templateName.trim(),
        description: templateDescription.trim() || null,
        diagnosis_id: selectedDiagnosis?.id || null,
        exercises: selectedExercises.map((ex, index) => ({
          exercise_id: ex.id,
          order_number: index + 1,
          sets: ex.sets || 3,
          reps: ex.reps || 10,
          duration_seconds: ex.duration_seconds || null,
          rest_seconds: ex.rest_seconds || 30,
          notes: ex.notes || null
        }))
      };

      await templates.create(templateData);
      toast.success('Шаблон сохранён!');
      setShowSaveTemplateModal(false);
      setTemplateName('');
      setTemplateDescription('');
    } catch (err) {
      console.error('Ошибка сохранения шаблона:', err);
      toast.error('Не удалось сохранить шаблон');
    }
  };

  const openTemplatesModal = () => {
    setTemplateSelectorOpen(true);
  };

  const stepLabels = [
    { num: 1, label: 'Пациент' },
    { num: 2, label: 'Диагноз' },
    { num: 3, label: 'Упражнения' },
    { num: 4, label: 'Готово' },
  ];

  return (
    <div className={s.createComplexPage}>
      {/* Header */}
      <div className={s.pageHeader}>
        <h1>
          <ClipboardList size={28} />
          Создать комплекс
        </h1>
      </div>

      {/* Steps indicator */}
      <div className={s.stepsIndicator}>
        {stepLabels.map((s) => (
          <div 
            key={s.num} 
            className={`step ${step === s.num ? 'active' : ''} ${step > s.num ? 'completed' : ''}`}
          >
            {s.num}. {s.label}
          </div>
        ))}
      </div>

      {error && <div className={s.errorMessage}>{error}</div>}

      {/* Step 1: Patient selection */}
      {step === 1 && (
        <div className={s.stepContent}>
          <h2>Выберите пациента</h2>
          
          <div className={s.searchBox}>
            <input
              type="text"
              className={s.searchInput}
              placeholder="Поиск по имени или телефону..."
              value={patientSearch}
              onChange={(e) => setPatientSearch(e.target.value)}
            />
            {patientSearch && (
              <button 
                className={s.clearSearch} 
                onClick={() => setPatientSearch('')}
              >
                <X size={16} />
              </button>
            )}
          </div>

          <p className={s.resultsCount}>
            Найдено: <strong>{patientsList.filter(p => 
              p.full_name.toLowerCase().includes(patientSearch.toLowerCase()) ||
              (p.phone && p.phone.includes(patientSearch))
            ).length}</strong> из {patientsList.length}
          </p>

          <div className={s.createPatientsList}>
            {patientsList
              .filter(p => 
                !patientSearch || 
                p.full_name.toLowerCase().includes(patientSearch.toLowerCase()) ||
                (p.phone && p.phone.includes(patientSearch))
              )
              .map((patient) => (
                <div
                  key={patient.id}
                  className={`${s.patientItem} ${selectedPatient?.id === patient.id ? s.selected : ''}`}
                  onClick={() => setSelectedPatient(patient)}
                >
                  <div className={s.patientAvatar}>
                    {patient.full_name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                  </div>
                  <div className={s.patientDetails}>
                    <strong>{patient.full_name}</strong>
                    <span>{patient.phone || '—'}</span>
                  </div>
                  {selectedPatient?.id === patient.id && (
                    <span className={s.checkMark}><Check size={20} /></span>
                  )}
                </div>
              ))}
          </div>

          <div className={s.stepButtons}>
            <div></div>
            <button
              className={`${s.btnPrimary} ${s.btnNext}`}
              disabled={!selectedPatient}
              onClick={() => setStep(2)}
            >
              Далее <ChevronRight size={18} />
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Diagnosis */}
      {step === 2 && (
        <div className={s.stepContent}>
          <h2>Диагноз и рекомендации</h2>

          <div className={s.formGroup}>
            <label htmlFor="complex-title-input">Название комплекса</label>
            <input
              id="complex-title-input"
              type="text"
              placeholder="Например: Утренний комплекс плеча"
              value={complexTitle}
              onChange={(e) => setComplexTitle(e.target.value)}
              maxLength={255}
              autoComplete="off"
            />
            <small style={{ color: 'var(--color-text-muted)', fontSize: '12px', display: 'block', marginTop: '4px' }}>
              Опционально. Если оставить пустым — название соберётся из первых двух упражнений.
            </small>
          </div>

          <div className={s.formGroup}>
            <label>Диагноз (опционально)</label>
            <select
              value={selectedDiagnosis?.id || ''}
              onChange={(e) => {
                const diagnosis = diagnosesList.find(d => d.id === parseInt(e.target.value));
                setSelectedDiagnosis(diagnosis || null);
                if (diagnosis) {
                  setRecommendations(diagnosis.recommendations || '');
                  setWarnings(diagnosis.warnings || '');
                }
              }}
            >
              <option value="">Без диагноза</option>
              {diagnosesList.map((diagnosis) => (
                <option key={diagnosis.id} value={diagnosis.id}>
                  {diagnosis.name}
                </option>
              ))}
            </select>
          </div>

          <div className={s.formGroup}>
            <label>Примечание</label>
            <input
              type="text"
              placeholder="Например: правое плечо"
              value={diagnosisNote}
              onChange={(e) => setDiagnosisNote(e.target.value)}
            />
          </div>

          <div className={s.formGroup}>
            <label>Рекомендации</label>
            <textarea
              rows="3"
              placeholder="Рекомендации по выполнению..."
              value={recommendations}
              onChange={(e) => setRecommendations(e.target.value)}
            />
          </div>

          <div className={s.formGroup}>
            <label>Предостережения</label>
            <textarea
              rows="3"
              placeholder="Что нужно избегать..."
              value={warnings}
              onChange={(e) => setWarnings(e.target.value)}
            />
          </div>

          <div className={s.stepButtons}>
            <button className={s.btnSecondary} onClick={() => setStep(1)}>
              <ChevronLeft size={18} /> Назад
            </button>
            <button className={s.btnPrimary} onClick={() => setStep(3)}>
              Далее <ChevronRight size={18} />
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Exercises */}
      {step === 3 && (
        <div className={`${s.stepContent} ${s.stepExercises}`}>
          <div className={s.exercisesSection}>
          <div className={s.sectionHeader}>
  <h2><Search size={20} /> Упражнения</h2>
  <button className={s.btnTemplate} onClick={openTemplatesModal}>
    <Folder size={16} /> Загрузить из шаблона
  </button>
</div>
            <div className={s.searchFilters}>
              <input
                type="text"
                placeholder="Поиск..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
                <option value="all">Все</option>
                <option value="shoulder">Плечо</option>
                <option value="knee">Колено</option>
                <option value="spine">Спина</option>
                <option value="hip">Бедро</option>
              </select>
            </div>
            <div className={s.availableExercises}>
            {filteredExercises.map((exercise) => {
  const isAdded = selectedExercises.some(e => e.id === exercise.id);
  return (
    <div key={exercise.id} className={`${s.exerciseItem} ${isAdded ? s.isAdded : ''}`}>
      <div className={s.exerciseInfo}>
        <strong>{exercise.title}</strong>
        <span className={s.exerciseMeta}>{exercise.body_region || exercise.category}</span>
      </div>
      {isAdded ? (
        <button className={s.btnAdded} disabled>
          <Check size={16} /> Добавлено
        </button>
      ) : (
        <button className={s.btnAdd} onClick={() => addExercise(exercise)}>
          <Plus size={16} /> Добавить
        </button>
      )}
    </div>
  );
})}
            </div>
          </div>

          <div className={s.selectedSection}>
            <h2>Комплекс ({selectedExercises.length})</h2>
            {selectedExercises.length === 0 ? (
              <div className={s.emptyComplex}>
                <p>Добавьте упражнения из списка</p>
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
                        onRemove={removeExercise}
                        onUpdate={updateExercise}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </div>

          <div className={`${s.stepButtons} ${s.fullWidth}`}>
            <button className={s.btnSecondary} onClick={() => setStep(2)}>
              <ChevronLeft size={18} /> Назад
            </button>
            <button
              className={s.btnPrimary}
              onClick={handleSubmit}
              disabled={loading || selectedExercises.length === 0}
            >
              {loading ? 'Создание...' : 'Создать комплекс'}
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Success */}
      {step === 4 && (
        <div className={`${s.stepContent} ${s.successStep}`}>
          <div className={s.successIcon}>
            <Check size={64} color="#48bb78" />
          </div>
          <h2>Комплекс создан</h2>
          <p>
            Пациент <strong>{selectedPatient?.full_name}</strong> увидит его в личном кабинете
          </p>
          <p>Упражнений: <strong>{selectedExercises.length}</strong></p>

          {!selectedPatient?.is_registered && (
            <div className={s.infoHint}>
              <strong>Пациент ещё не зарегистрирован</strong><br/>
              Передайте ему ссылку для регистрации:<br/>
              <code className={s.infoHintCode}>
                {window.location.origin}/patient-register
              </code><br/>
              При регистрации он должен указать email <strong>{selectedPatient?.email || '—'}</strong>
            </div>
          )}

          <div className={s.successActions} style={{ marginTop: 20 }}>
            <button
              className={s.btnSaveTemplate}
              onClick={() => setShowSaveTemplateModal(true)}
            >
              <Save size={18} /> Сохранить как шаблон
            </button>

            <div className={s.navigationButtons}>
              <button className={s.btnSecondary} onClick={resetForm}>
                <Plus size={18} /> Новый комплекс
              </button>
              <button className={s.btnSecondary} onClick={() => window.location.href = '/'}>
                <Home size={18} /> В Dashboard
              </button>
            </div>
          </div>
        </div>
      )}

{/* Модалка выбора шаблона */}
<TemplateSelector
  isOpen={templateSelectorOpen}
  onClose={() => setTemplateSelectorOpen(false)}
  onSelect={loadTemplate}
  diagnosisId={selectedDiagnosis?.id || null}
/>

{/* Модалка сохранения шаблона */}
{showSaveTemplateModal && (
  <div className={s.modalOverlay} onClick={() => setShowSaveTemplateModal(false)}>
    <div className={`${s.modalContent} ${s.saveTemplateModal}`} onClick={e => e.stopPropagation()}>
      <div className={s.modalHeader}>
        <h3><Save size={20} /> Сохранить как шаблон</h3>
        <button className={s.modalClose} onClick={() => setShowSaveTemplateModal(false)}>
          <X size={20} />
        </button>
      </div>
      <div className={s.modalBody}>
        <div className={s.formField}>
          <label>Название шаблона *</label>
          <input
            type="text"
            placeholder="Например: Реабилитация плеча - начальный этап"
            value={templateName}
            onChange={e => setTemplateName(e.target.value)}
            autoFocus
          />
        </div>
        <div className={s.formField}>
          <label>Описание (необязательно)</label>
          <textarea
            placeholder="Краткое описание шаблона..."
            value={templateDescription}
            onChange={e => setTemplateDescription(e.target.value)}
            rows={3}
          />
        </div>
        <div className={s.templateSummary}>
          <p>Будет сохранено: <strong>{selectedExercises.length}</strong> упражнений</p>
          {selectedDiagnosis && (
            <p>Диагноз: <strong>{selectedDiagnosis.name}</strong></p>
          )}
        </div>
      </div>
      <div className={s.modalFooter}>
        <button className={s.btnSecondary} onClick={() => setShowSaveTemplateModal(false)}>
          Отмена
        </button>
        <button className={s.btnPrimary} onClick={saveAsTemplate}>
          <Save size={16} /> Сохранить
        </button>
      </div>
    </div>
  </div>
)}
</div>
);
}

export default CreateComplex;
