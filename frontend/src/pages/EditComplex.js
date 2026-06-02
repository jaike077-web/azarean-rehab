import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { exercises, complexes, admin } from '../services/api';
import { useAuth } from '../context/AuthContext';
import ComplexCueSounds from '../components/ComplexCueSounds';
import ExerciseAudioControl from '../components/ExerciseAudioControl';
import useAudioPreview from '../hooks/useAudioPreview';
import { emptyCueState, cueStateFromBindings, buildCueSoundsPayload } from '../utils/audioCues';
import BackButton from '../components/BackButton';
import ComplexPreviewModal from '../components/ComplexPreviewModal';
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
  X,
  Volume2,
  Eye,
  AlertTriangle
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
import { validateExerciseRow, normalizeExerciseForPayload, TEMPO_BOUNDS } from '../utils/exerciseValidation';

// Компонент для перетаскиваемого упражнения
function SortableExercise({ exercise, errors, onRemove, onUpdate, onUpdateAudio, trackPresets, isAdmin, onPreviewTrack }) {
  const stop = (e) => e.stopPropagation();
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
          data-testid={`reps-${exercise.id}`}
        />
        <input
          type="number"
          placeholder="Отдых (сек)"
          title="Отдых между подходами."
          value={exercise.rest_seconds ?? ''}
          onChange={(e) => onUpdate(exercise.id, 'rest_seconds', e.target.value)}
          min="0"
          max="9999"
          data-testid={`rest-${exercise.id}`}
        />
        <input
          type="number"
          placeholder="Время подхода (сек)"
          title="Длительность одного подхода. При включённом авто-завершении — countdown с сигналом конца."
          value={exercise.duration_seconds || ''}
          onChange={(e) => onUpdate(exercise.id, 'duration_seconds', e.target.value)}
          min="1"
          data-testid={`duration-${exercise.id}`}
        />
        <input
          type="text"
          placeholder="Примечание"
          value={exercise.notes || ''}
          onChange={(e) => onUpdate(exercise.id, 'notes', e.target.value)}
          className={s.notesInput}
        />
      </div>
      {/* CP2b: auto_complete + темп (зеркало CreateComplex.SortableExercise). */}
      <div
        className={s.exerciseExtra}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {Number(exercise.duration_seconds) > 0 && (
          <label
            className={s.autoCompleteLabel}
            title="При истечении таймера: завершить подход и автоматически начать отдых (со звуковым сигналом). Выкл — обычный секундомер."
          >
            <input
              type="checkbox"
              checked={exercise.auto_complete !== false}
              onChange={(e) => onUpdate(exercise.id, 'auto_complete', e.target.checked)}
              data-testid={`auto-complete-${exercise.id}`}
            />
            <span>Авто-завершение</span>
          </label>
        )}
        <div className={s.tempoGroup} title={`Темп повтора (опционально, всё или ничего). ecc ${TEMPO_BOUNDS.ECC_MIN}–${TEMPO_BOUNDS.ECC_MAX}с / пауза ${TEMPO_BOUNDS.PAUSE_MIN}–${TEMPO_BOUNDS.PAUSE_MAX}с / conc ${TEMPO_BOUNDS.CON_MIN}–${TEMPO_BOUNDS.CON_MAX}с`}>
          <span className={s.tempoLabel}>Темп:</span>
          <input
            type="number"
            placeholder="ecc"
            value={exercise.tempo_eccentric_s ?? ''}
            onChange={(e) => onUpdate(exercise.id, 'tempo_eccentric_s', e.target.value)}
            min={TEMPO_BOUNDS.ECC_MIN}
            max={TEMPO_BOUNDS.ECC_MAX}
            data-testid={`tempo-ecc-${exercise.id}`}
          />
          <input
            type="number"
            placeholder="пауза"
            value={exercise.tempo_pause_s ?? ''}
            onChange={(e) => onUpdate(exercise.id, 'tempo_pause_s', e.target.value)}
            min={TEMPO_BOUNDS.PAUSE_MIN}
            max={TEMPO_BOUNDS.PAUSE_MAX}
            data-testid={`tempo-pause-${exercise.id}`}
          />
          <input
            type="number"
            placeholder="conc"
            value={exercise.tempo_concentric_s ?? ''}
            onChange={(e) => onUpdate(exercise.id, 'tempo_concentric_s', e.target.value)}
            min={TEMPO_BOUNDS.CON_MIN}
            max={TEMPO_BOUNDS.CON_MAX}
            data-testid={`tempo-con-${exercise.id}`}
          />
        </div>
      </div>
      {/* EA4: трек-звук упражнения (admin-only). stopPropagation — карта целиком draggable. */}
      {isAdmin && (
        <div onPointerDown={stop} onClick={stop}>
          <ExerciseAudioControl
            row={exercise}
            presets={trackPresets}
            onChange={(patch) => onUpdateAudio(exercise.id, patch)}
            onPreview={onPreviewTrack}
          />
        </div>
      )}
      {errors && (errors.prescription || errors.tempo) && (
        <div className={s.exerciseErrors} data-testid={`errors-${exercise.id}`}>
          {errors.prescription && <span>{errors.prescription}</span>}
          {errors.tempo && <span>{errors.tempo}</span>}
        </div>
      )}
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
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [loading, setLoading] = useState(true);
  const [patientName, setPatientName] = useState('');
  const [complexTitle, setComplexTitle] = useState('');
  const [diagnosisId, setDiagnosisId] = useState('');
  const [recommendations, setRecommendations] = useState('');
  const [warnings, setWarnings] = useState('');
  const [availableExercises, setAvailableExercises] = useState([]);
  const [selectedExercises, setSelectedExercises] = useState([]);
  // AA4: «Звуки комплекса» (admin-only). cueDirty гейтит отправку:
  // omit cue_sounds = сохранить привязки; send (даже []) = replace.
  const [cueState, setCueState] = useState(emptyCueState());
  const [cueDirty, setCueDirty] = useState(false);
  const [audioPresets, setAudioPresets] = useState([]);
  const [audioDefaults, setAudioDefaults] = useState([]);
  // CP2b: inline-ошибки валидации по строкам (см. handleSave / normalize)
  const [exerciseErrors, setExerciseErrors] = useState({});
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState('');
  const [exercisesLoading, setExercisesLoading] = useState(true);
  const [showPreview, setShowPreview] = useState(false); // превью «глазами пациента»

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
      setWarnings(complexData.warnings || '');

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
          // Фикс data-loss: rest_seconds не грузился → handleSave дефолтил 30 →
          // отдых всех упражнений сбрасывался при каждом сохранении. Грузим, чтобы
          // normalizeExerciseForPayload сохранил исходное значение.
          rest_seconds: item.rest_seconds,
          notes: item.notes,
          order_number: item.order_number,
          // Для превью «глазами пациента» (миниатюра существующих упражнений).
          thumbnail_url: item.exercise.thumbnail_url,
          // CP2b: 4 поля из миграции 20260527. На legacy строках до
          // применения CP2a backend вернёт auto_complete=true (DEFAULT),
          // tempo_*=null — нормально для UI (showing as пустые).
          auto_complete: item.auto_complete !== false,
          tempo_eccentric_s: item.tempo_eccentric_s ?? '',
          tempo_pause_s: item.tempo_pause_s ?? '',
          tempo_concentric_s: item.tempo_concentric_s ?? '',
          // EA4: per-комплекс override звука + дефолт библиотеки (для метки «наследовать»).
          audio_preset_id: item.audio_preset_id ?? null,
          audio_loop: item.audio_loop === true,
          audio_off: item.audio_off === true,
          lib_audio_preset_id: item.lib_audio_preset_id ?? null,
          lib_audio_loop: item.lib_audio_loop === true,
        }));

      setSelectedExercises(formattedExercises);

      // AA4: pre-fill секции «Звуки комплекса» из raw-привязок (cue_sounds от GET /:id).
      // cueDirty сбрасываем — нетронутая секция не отправит cue_sounds (сохранит привязки).
      setCueState(cueStateFromBindings(complexData.cue_sounds));
      setCueDirty(false);
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

  const previewPreset = useAudioPreview(); // прослушка звука в секции «Звуки комплекса»
  const previewTrack = useAudioPreview();  // прослушка трека в per-упражнение контроле (EA4)

  // EA4: библиотека содержит cue + track — разводим по kind.
  const cuePresets = useMemo(() => audioPresets.filter((p) => p.kind !== 'track'), [audioPresets]);
  const trackPresets = useMemo(() => audioPresets.filter((p) => p.kind === 'track'), [audioPresets]);

  // AA4: библиотека пресетов + дом-карта для секции «Звуки комплекса» (admin-only).
  useEffect(() => {
    if (!isAdmin) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const [pRes, dRes] = await Promise.all([
          admin.getAudioPresets(),
          admin.getAudioCueDefaults(),
        ]);
        if (cancelled) return;
        setAudioPresets(pRes.data || []);
        setAudioDefaults(dRes.data || []);
      } catch {
        /* секция деградирует — не блокер редактирования */
      }
    })();
    return () => { cancelled = true; };
  }, [isAdmin]);

  // AA4: пометить секцию звуков «грязной» при любом изменении (для omit-vs-send семантики).
  const handleCueChange = (next) => {
    setCueState(next);
    setCueDirty(true);
  };

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
      notes: '',
      // CP2b: дефолты как в CreateComplex.
      auto_complete: true,
      tempo_eccentric_s: '',
      tempo_pause_s: '',
      tempo_concentric_s: '',
      // EA4: звук — дефолт библиотеки в lib_*, override пуст (наследуем).
      lib_audio_preset_id: exercise.audio_preset_id ?? null,
      lib_audio_loop: exercise.audio_loop ?? false,
      audio_preset_id: null,
      audio_loop: false,
      audio_off: false,
    }]);
  };

  const handleRemoveExercise = (exerciseId) => {
    setSelectedExercises(selectedExercises.filter(e => e.id !== exerciseId));
  };

  const handleUpdateExercise = (exerciseId, field, value) => {
    // CP2b: числовые поля — валидация диапазона. auto_complete — boolean
    // (приходит из onChange checkbox). Темп — числа в [0..30] (CHECK).
    if (['sets', 'reps', 'duration_seconds', 'rest_seconds',
         'tempo_eccentric_s', 'tempo_pause_s', 'tempo_concentric_s'].includes(field)) {
      if (value !== '' && value != null) {
        const numValue = parseInt(value, 10);
        if (isNaN(numValue) || numValue < 0 || numValue > 9999) {
          return;
        }
      }
    }
    setSelectedExercises(selectedExercises.map(exercise =>
      exercise.id === exerciseId
        ? { ...exercise, [field]: value }
        : exercise
    ));
    // CP2b: очищаем inline-ошибку для этой строки при правке (re-validate на submit).
    if (exerciseErrors[exerciseId]) {
      setExerciseErrors((prev) => {
        const next = { ...prev };
        delete next[exerciseId];
        return next;
      });
    }
  };

  // EA4: батч-патч audio-полей строки (функциональный setState — несколько полей сразу).
  const handleUpdateExerciseAudio = (exerciseId, patch) => {
    setSelectedExercises((prev) =>
      prev.map((e) => (e.id === exerciseId ? { ...e, ...patch } : e))
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
    if (selectedExercises.length === 0) {
      setError('Добавьте хотя бы одно упражнение');
      return;
    }

    // CP2b: pre-submit валидация (зеркало DB CHECK'ов).
    const errorsByRow = {};
    let hasErrors = false;
    selectedExercises.forEach((ex) => {
      const e = validateExerciseRow(ex);
      if (e.prescription || e.tempo) {
        errorsByRow[ex.id] = e;
        hasErrors = true;
      }
    });
    setExerciseErrors(errorsByRow);
    if (hasErrors) {
      setError('Исправьте ошибки в упражнениях перед сохранением');
      toast.error('Есть незаполненные подходы или некорректный темп');
      return;
    }

    try {
      const updateData = {
        title: complexTitle.trim() || null,
        diagnosis_id: diagnosisId || null,
        recommendations: recommendations || null,
        // Фикс data-loss: EditComplex не слал warnings → PUT (SET warnings=$4)
        // писал NULL → предупреждения стирались при каждом сохранении. Шлём явно.
        warnings: warnings || null,
        // CP2b: shared normalizer (тот же что в CreateComplex). reps:null
        // для time-only, all-or-nothing для tempo, auto_complete default true.
        exercises: selectedExercises.map((ex, index) =>
          normalizeExerciseForPayload(ex, index + 1)
        ),
      };

      // AA4: cue_sounds шлём только если админ тронул секцию (replace; [] = очистка→наследование).
      // Не тронули секцию — omit, чтобы backend сохранил существующие привязки.
      if (isAdmin && cueDirty) {
        updateData.cue_sounds = buildCueSoundsPayload(cueState);
      }

      await complexes.update(id, updateData);
      toast.success('Комплекс успешно обновлён! ✓');
      navigate('/my-complexes');
    } catch (err) {
      console.error('Ошибка обновления комплекса:', err);
      // AA4: пробрасываем серверное сообщение (зеркало CreateComplex) — иначе 400 от
      // валидации cue_sounds («Пресет не найден или неактивен», «Дубль cue_name»)
      // показывался бы как недиагностируемый generic-текст.
      setError(err.response?.data?.message || 'Не удалось обновить комплекс');
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
            <AlertTriangle size={20} />
            <span>Внимание</span>
          </h3>
          <textarea
            value={warnings}
            onChange={(e) => setWarnings(e.target.value)}
            placeholder="Предупреждения для пациента (при усилении боли прекратить и т.п.)..."
            rows="3"
          />
        </div>

        {isAdmin && (
          <div className={s.formSection}>
            <h3>
              <Volume2 size={20} />
              <span>Звуки комплекса</span>
            </h3>
            <ComplexCueSounds
              cueState={cueState}
              onChange={handleCueChange}
              presets={cuePresets}
              defaults={audioDefaults}
              onPreview={previewPreset}
            />
          </div>
        )}

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
                      errors={exerciseErrors[exercise.id]}
                      onRemove={handleRemoveExercise}
                      onUpdate={handleUpdateExercise}
                      onUpdateAudio={handleUpdateExerciseAudio}
                      trackPresets={trackPresets}
                      isAdmin={isAdmin}
                      onPreviewTrack={previewTrack}
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
          <button
            className={s.btnSecondary}
            onClick={() => setShowPreview(true)}
            disabled={selectedExercises.length === 0}
          >
            <Eye size={18} />
            <span>Предпросмотр</span>
          </button>
          <button className={s.btnPrimary} onClick={handleSave}>
            <Save size={18} />
            <span>Сохранить изменения</span>
          </button>
        </div>
      </div>

      {/* Превью «глазами пациента» — из текущего состояния формы */}
      <ComplexPreviewModal
        isOpen={showPreview}
        onClose={() => setShowPreview(false)}
        title={complexTitle}
        recommendations={recommendations}
        warnings={warnings}
        instructorName={user?.full_name}
        exercises={selectedExercises}
      />
    </div>
  );
}

export default EditComplex;
