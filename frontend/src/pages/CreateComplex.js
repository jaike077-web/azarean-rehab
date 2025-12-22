import React, { useState, useEffect } from 'react';
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
  Copy,
  Home,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  MessageCircle,
  Send,
  Save,
  Folder,
} from 'lucide-react';
import './CreateComplex.css';

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

  // Обработчик для предотвращения всплытия событий от инпутов
  const handleInputClick = (e) => {
    e.stopPropagation();
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`selected-exercise ${isDragging ? 'is-dragging' : ''}`}
    >
      <div className="drag-handle" {...attributes} {...listeners}>
        <GripVertical size={20} />
      </div>
      <div className="exercise-info">
        <strong>{exercise.title}</strong>
        {(exercise.body_region || exercise.category) && (
          <span className="exercise-meta">{exercise.body_region || exercise.category}</span>
        )}
      </div>
      <div className="exercise-params">
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
          placeholder="Сек"
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
          className="notes-input"
        />
      </div>
      <button 
        className="remove-exercise-btn"
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
}

function CreateComplex() {
  const toast = useToast();
  const [step, setStep] = useState(1);
  const [patientsList, setPatientsList] = useState([]);
  const [diagnosesList, setDiagnosesList] = useState([]);
  const [exercisesList, setExercisesList] = useState([]);
  
  const [selectedPatient, setSelectedPatient] = useState(null);
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
  const [templatesList, setTemplatesList] = useState([]);
  const [showTemplatesModal, setShowTemplatesModal] = useState(false);
  const [showSaveTemplateModal, setShowSaveTemplateModal] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const [generatedLink, setGeneratedLink] = useState('');
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
      setPatientsList(patientsRes.data.patients);
      setDiagnosesList(diagnosesRes.data.diagnoses);
      setExercisesList(exercisesRes.data.exercises);
    } catch (err) {
      console.error('Ошибка загрузки данных:', err);
      setError('Не удалось загрузить данные');
    }
  };

  // Фильтрация упражнений
  const filteredExercises = exercisesList.filter((ex) => {
    const matchesSearch = !searchTerm || 
      ex.title.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = categoryFilter === 'all' || 
      ex.body_region === categoryFilter || 
      ex.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

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
    setSelectedExercises(selectedExercises.map(e =>
      e.id === exerciseId ? { ...e, [field]: value } : e
    ));
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
        diagnosis_id: selectedDiagnosis?.id || null,
        diagnosis_note: diagnosisNote,
        recommendations: recommendations || 'Выполняйте упражнения регулярно 3-4 раза в неделю',
        warnings: warnings || 'При усилении боли прекратите выполнение',
        exercises: selectedExercises.map((ex, index) => ({
          exercise_id: ex.id,
          order_number: index + 1,
          sets: parseInt(ex.sets, 10) || 3,
          reps: parseInt(ex.reps, 10) || 10,
          rest_seconds: parseInt(ex.rest_seconds, 10) || 30,
          notes: ex.notes || null
        }))
      };

      const response = await complexes.create(complexData);
      const token = response.data.complex.access_token;
      setGeneratedLink(`${window.location.origin}/patient/${token}`);
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

  const copyLink = () => {
    navigator.clipboard.writeText(generatedLink);
    toast.success('Ссылка скопирована!');
  };

  const shareWhatsApp = () => {
    const message = `Ваша программа реабилитации готова! Перейдите по ссылке: ${generatedLink}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
  };

  const shareTelegram = () => {
    const message = `Ваша программа реабилитации готова!`;
    window.open(`https://t.me/share/url?url=${encodeURIComponent(generatedLink)}&text=${encodeURIComponent(message)}`, '_blank');
  };

  const resetForm = () => {
    setStep(1);
    setSelectedPatient(null);
    setSelectedDiagnosis(null);
    setDiagnosisNote('');
    setRecommendations('');
    setWarnings('');
    setSelectedExercises([]);
    setGeneratedLink('');
    setError('');
  };

  // =====================================================
  // ФУНКЦИИ ШАБЛОНОВ
  // =====================================================
  
  const loadTemplates = async () => {
    try {
      const response = await templates.getAll();
      setTemplatesList(response.data.templates || []);
    } catch (err) {
      console.error('Ошибка загрузки шаблонов:', err);
      toast.error('Не удалось загрузить шаблоны');
    }
  };

  const loadTemplate = async (templateId) => {
    try {
      const response = await templates.getById(templateId);
      const templateExercises = response.data.exercises || [];
      
      // Преобразуем упражнения шаблона в формат selectedExercises
      const exercisesToAdd = templateExercises.map(te => ({
        id: te.exercise_id,
        title: te.title,
        body_region: te.body_region,
        category: te.category,
        sets: te.sets,
        reps: te.reps,
        duration_seconds: te.duration_seconds,
        notes: te.notes
      }));
      
      setSelectedExercises(exercisesToAdd);
      setShowTemplatesModal(false);
      toast.success(`Шаблон "${response.data.template.name}" загружен`);
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
    loadTemplates();
    setShowTemplatesModal(true);
  };

  const stepLabels = [
    { num: 1, label: 'Пациент' },
    { num: 2, label: 'Диагноз' },
    { num: 3, label: 'Упражнения' },
    { num: 4, label: 'Готово' },
  ];

  return (
    <div className="create-complex-page">
      {/* Header */}
      <div className="page-header">
        <h1>
          <ClipboardList size={28} />
          Создать комплекс
        </h1>
      </div>

      {/* Steps indicator */}
      <div className="steps-indicator">
        {stepLabels.map((s) => (
          <div 
            key={s.num} 
            className={`step ${step === s.num ? 'active' : ''} ${step > s.num ? 'completed' : ''}`}
          >
            {s.num}. {s.label}
          </div>
        ))}
      </div>

      {error && <div className="error-message">{error}</div>}

      {/* Step 1: Patient selection */}
      {step === 1 && (
        <div className="step-content">
          <h2>Выберите пациента</h2>
          
          <div className="search-box">
            <input
              type="text"
              className="search-input"
              placeholder="Поиск по имени или телефону..."
              value={patientSearch}
              onChange={(e) => setPatientSearch(e.target.value)}
            />
            {patientSearch && (
              <button 
                className="clear-search" 
                onClick={() => setPatientSearch('')}
              >
                <X size={16} />
              </button>
            )}
          </div>

          <p className="results-count">
            Найдено: <strong>{patientsList.filter(p => 
              p.full_name.toLowerCase().includes(patientSearch.toLowerCase()) ||
              (p.phone && p.phone.includes(patientSearch))
            ).length}</strong> из {patientsList.length}
          </p>

          <div className="create-patients-list">
            {patientsList
              .filter(p => 
                !patientSearch || 
                p.full_name.toLowerCase().includes(patientSearch.toLowerCase()) ||
                (p.phone && p.phone.includes(patientSearch))
              )
              .map((patient) => (
                <div
                  key={patient.id}
                  className={`patient-item ${selectedPatient?.id === patient.id ? 'selected' : ''}`}
                  onClick={() => setSelectedPatient(patient)}
                >
                  <div className="patient-avatar">
                    {patient.full_name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                  </div>
                  <div className="patient-details">
                    <strong>{patient.full_name}</strong>
                    <span>{patient.phone || '—'}</span>
                  </div>
                  {selectedPatient?.id === patient.id && (
                    <span className="check-mark"><Check size={20} /></span>
                  )}
                </div>
              ))}
          </div>

          <div className="step-buttons">
            <div></div>
            <button
              className="btn-primary btn-next"
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
        <div className="step-content">
          <h2>Диагноз и рекомендации</h2>
          
          <div className="form-group">
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

          <div className="form-group">
            <label>Примечание</label>
            <input
              type="text"
              placeholder="Например: правое плечо"
              value={diagnosisNote}
              onChange={(e) => setDiagnosisNote(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label>Рекомендации</label>
            <textarea
              rows="3"
              placeholder="Рекомендации по выполнению..."
              value={recommendations}
              onChange={(e) => setRecommendations(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label>Предостережения</label>
            <textarea
              rows="3"
              placeholder="Что нужно избегать..."
              value={warnings}
              onChange={(e) => setWarnings(e.target.value)}
            />
          </div>

          <div className="step-buttons">
            <button className="btn-secondary" onClick={() => setStep(1)}>
              <ChevronLeft size={18} /> Назад
            </button>
            <button className="btn-primary" onClick={() => setStep(3)}>
              Далее <ChevronRight size={18} />
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Exercises */}
      {step === 3 && (
        <div className="step-content step-exercises">
          <div className="exercises-section">
          <div className="section-header">
  <h2><Search size={20} /> Упражнения</h2>
  <button className="btn-template" onClick={openTemplatesModal}>
    <Folder size={16} /> Загрузить шаблон
  </button>
</div>
            <div className="search-filters">
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
            <div className="available-exercises">
            {filteredExercises.map((exercise) => {
  const isAdded = selectedExercises.some(e => e.id === exercise.id);
  return (
    <div key={exercise.id} className={`exercise-item ${isAdded ? 'is-added' : ''}`}>
      <div className="exercise-info">
        <strong>{exercise.title}</strong>
        <span className="exercise-meta">{exercise.body_region || exercise.category}</span>
      </div>
      {isAdded ? (
        <button className="btn-added" disabled>
          <Check size={16} /> Добавлено
        </button>
      ) : (
        <button className="btn-add" onClick={() => addExercise(exercise)}>
          <Plus size={16} /> Добавить
        </button>
      )}
    </div>
  );
})}
            </div>
          </div>

          <div className="selected-section">
            <h2>Комплекс ({selectedExercises.length})</h2>
            {selectedExercises.length === 0 ? (
              <div className="empty-complex">
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
                  <div className="selected-exercises-list">
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

          <div className="step-buttons full-width">
            <button className="btn-secondary" onClick={() => setStep(2)}>
              <ChevronLeft size={18} /> Назад
            </button>
            <button
              className="btn-primary"
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
        <div className="step-content success-step">
          <div className="success-icon">
            <Check size={64} color="#48bb78" />
          </div>
          <h2>Комплекс создан!</h2>
          <p>Пациент: <strong>{selectedPatient?.full_name}</strong></p>
          <p>Упражнений: <strong>{selectedExercises.length}</strong></p>
          
          <div className="generated-link-box">
            <label>Ссылка для пациента:</label>
            <div className="link-input">
              <input
                type="text"
                value={generatedLink}
                readOnly
              />
              <button className="btn-copy" onClick={copyLink}>
                <Copy size={18} /> Копировать
              </button>
            </div>
          </div>

          <div className="success-actions">
            {/* Основные действия */}
            <button 
              className="btn-primary" 
              onClick={() => window.open(generatedLink, '_blank')}
              title="Открыть страницу пациента в новой вкладке"
            >
              <ExternalLink size={18} /> Перейти на комплекс
            </button>
            
            {/* Кнопки мессенджеров */}
            <div className="messenger-buttons">
              <button 
                className="btn-whatsapp" 
                onClick={shareWhatsApp}
                title="Отправить ссылку через WhatsApp"
              >
                <MessageCircle size={18} /> WhatsApp
              </button>
              <button 
                className="btn-telegram" 
                onClick={shareTelegram}
                title="Отправить ссылку через Telegram"
              >
                <Send size={18} /> Telegram
              </button>
            </div>

            {/* Сохранить как шаблон */}
            <button 
              className="btn-save-template" 
              onClick={() => setShowSaveTemplateModal(true)}
            >
              <Save size={18} /> Сохранить как шаблон
            </button>

            {/* Навигация */}
            <div className="navigation-buttons">
              <button className="btn-secondary" onClick={resetForm}>
                <Plus size={18} /> Новый комплекс
              </button>
              <button className="btn-secondary" onClick={() => window.location.href = '/'}>
                <Home size={18} /> В Dashboard
              </button>
            </div>
          </div>
        </div>
      )}

{/* Модалка выбора шаблона */}
{showTemplatesModal && (
  <div className="modal-overlay" onClick={() => setShowTemplatesModal(false)}>
    <div className="modal-content templates-modal" onClick={e => e.stopPropagation()}>
      <div className="modal-header">
        <h3><Folder size={20} /> Выбрать шаблон</h3>
        <button className="modal-close" onClick={() => setShowTemplatesModal(false)}>
          <X size={20} />
        </button>
      </div>
      <div className="modal-body">
        {templatesList.length === 0 ? (
          <div className="empty-templates">
            <p>У вас пока нет сохранённых шаблонов</p>
            <span>Создайте комплекс и сохраните его как шаблон</span>
          </div>
        ) : (
          <div className="templates-list">
            {templatesList.map(template => (
              <div 
                key={template.id} 
                className="template-item"
                onClick={() => loadTemplate(template.id)}
              >
                <div className="template-info">
                  <strong>{template.name}</strong>
                  {template.description && <p>{template.description}</p>}
                  <span className="template-meta">
                    {template.exercises_count} упражнений
                    {template.diagnosis_name && ` • ${template.diagnosis_name}`}
                  </span>
                </div>
                <ChevronRight size={20} className="template-arrow" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  </div>
)}

{/* Модалка сохранения шаблона */}
{showSaveTemplateModal && (
  <div className="modal-overlay" onClick={() => setShowSaveTemplateModal(false)}>
    <div className="modal-content save-template-modal" onClick={e => e.stopPropagation()}>
      <div className="modal-header">
        <h3><Save size={20} /> Сохранить как шаблон</h3>
        <button className="modal-close" onClick={() => setShowSaveTemplateModal(false)}>
          <X size={20} />
        </button>
      </div>
      <div className="modal-body">
        <div className="form-field">
          <label>Название шаблона *</label>
          <input
            type="text"
            placeholder="Например: Реабилитация плеча - начальный этап"
            value={templateName}
            onChange={e => setTemplateName(e.target.value)}
            autoFocus
          />
        </div>
        <div className="form-field">
          <label>Описание (необязательно)</label>
          <textarea
            placeholder="Краткое описание шаблона..."
            value={templateDescription}
            onChange={e => setTemplateDescription(e.target.value)}
            rows={3}
          />
        </div>
        <div className="template-summary">
          <p>Будет сохранено: <strong>{selectedExercises.length}</strong> упражнений</p>
          {selectedDiagnosis && (
            <p>Диагноз: <strong>{selectedDiagnosis.name}</strong></p>
          )}
        </div>
      </div>
      <div className="modal-footer">
        <button className="btn-secondary" onClick={() => setShowSaveTemplateModal(false)}>
          Отмена
        </button>
        <button className="btn-primary" onClick={saveAsTemplate}>
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
