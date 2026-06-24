import React, { useState, useEffect } from 'react';
import { ChevronDown, ChevronRight, X, Info, Play, Sparkles, Mic, Square, CheckCircle2, Circle, Pause, Loader2 } from 'lucide-react';
import MDEditor from '@uiw/react-md-editor';
import { exercises as exercisesApi, admin } from '../../../services/api';
import s from './ExerciseModal.module.css';
import { useModalOverlayClose } from '../../../hooks/useModalOverlayClose';
import { useAuth } from '../../../context/AuthContext';
import useAudioPreview from '../../../hooks/useAudioPreview';
import useAudioRecorder from '../../../hooks/useAudioRecorder';

// Wave 0 commit 05 — hint-метки рядом с полями, видимые инструктору.
// Помогают понять где в пациентском UI отрисуется значение поля,
// не оставляет cues/tips/red_flags как «dead» в БД. Inline-стили потому
// что s.fieldHint в module.css не определён (existing inconsistency).
const PatientHint = ({ children }) => (
  <span style={{
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    marginLeft: 8,
    fontSize: 11,
    fontWeight: 400,
    color: 'var(--color-text-muted, #6b7280)',
  }}>
    <Info size={11} aria-hidden="true" style={{ opacity: 0.7 }} />
    {children}
  </span>
);

const ExerciseModal = ({ exercise, onClose, onSave }) => {
  // ========================================
  // STATE
  // ========================================

  // ОБЯЗАТЕЛЬНЫЕ поля
  const [title, setTitle] = useState('');
  const [videoUrl, setVideoUrl] = useState('');

  // ОПЦИОНАЛЬНЫЕ основные поля
  const [shortTitle, setShortTitle] = useState('');
  const [description, setDescription] = useState('');
  const [thumbnailUrl, setThumbnailUrl] = useState('');

  // ОПЦИОНАЛЬНЫЕ классификация
  const [exerciseType, setExerciseType] = useState('');
  const [bodyRegion, setBodyRegion] = useState('');
  const [difficultyLevel, setDifficultyLevel] = useState(1);

  // МНОЖЕСТВЕННЫЙ ВЫБОР
  const [equipment, setEquipment] = useState([]);
  const [position, setPosition] = useState([]);
  const [rehabPhases, setRehabPhases] = useState([]);

  // ОПЦИОНАЛЬНЫЕ инструкции
  const [instructions, setInstructions] = useState('');
  const [cues, setCues] = useState('');
  const [tips, setTips] = useState('');
  const [contraindications, setContraindications] = useState('');
  const [variations, setVariations] = useState('');
  const [progression, setProgression] = useState('');

  // ЗВУК УПРАЖНЕНИЯ (EA4) — дефолт библиотеки (длинный трек). audioPresetId
  // round-trip'ится у всех ролей (сохраняется при правке не-админом), редактируется
  // только админом (пресеты под admin-glob).
  const [audioPresetId, setAudioPresetId] = useState(null);
  const [audioLoop, setAudioLoop] = useState(false);
  const [trackPresets, setTrackPresets] = useState([]);

  // UI state
  const [errors, setErrors] = useState({});
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // AI-надиктовка (is*ai) — текст → поля. По умолчанию раскрыто для нового упражнения.
  const [showDictation, setShowDictation] = useState(!exercise);
  const [transcript, setTranscript] = useState('');
  const [structuring, setStructuring] = useState(false);
  const [structureWarnings, setStructureWarnings] = useState([]);
  const [structureError, setStructureError] = useState(null);
  const [transcribing, setTranscribing] = useState(false);
  // Проверка качества (faithfulness + автофикс) — опция, дольше/дороже.
  const [reviewQuality, setReviewQuality] = useState(false);
  const [structureReview, setStructureReview] = useState(null);
  const [structureFixed, setStructureFixed] = useState(false);
  const [structureSanity, setStructureSanity] = useState(null); // клинические советы [{severity,field,message}]

  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const previewTrack = useAudioPreview();
  const recorder = useAudioRecorder();

  // ========================================
  // INITIALIZATION
  // ========================================

  useEffect(() => {
    if (exercise) {
      // ОБЯЗАТЕЛЬНЫЕ
      setTitle(exercise.title || '');
      setVideoUrl(exercise.video_url || '');

      // ОПЦИОНАЛЬНЫЕ
      setShortTitle(exercise.short_title || '');
      setDescription(exercise.description || '');
      setThumbnailUrl(exercise.thumbnail_url || '');
      setExerciseType(exercise.exercise_type || '');
      setBodyRegion(exercise.body_region || '');
      setDifficultyLevel(exercise.difficulty_level || 1);

      // МНОЖЕСТВЕННЫЙ ВЫБОР (из JSONB)
      setEquipment(exercise.equipment || []);
      setPosition(exercise.position || []);
      setRehabPhases(exercise.rehab_phases || []);

      // ИНСТРУКЦИИ
      setInstructions(exercise.instructions || '');
      setCues(exercise.cues || '');
      setTips(exercise.tips || '');
      setContraindications(exercise.contraindications || '');
      setVariations(exercise.variations || '');
      setProgression(exercise.progression || '');

      // ЗВУК (EA4) — pre-fill (round-trip даже для не-админа).
      setAudioPresetId(exercise.audio_preset_id ?? null);
      setAudioLoop(exercise.audio_loop === true);

      // Показать расширенные поля если они заполнены
      if (
        exercise.instructions ||
        exercise.cues ||
        exercise.tips ||
        exercise.contraindications ||
        exercise.variations ||
        exercise.progression
      ) {
        setShowAdvanced(true);
      }
    }
  }, [exercise]);

  // EA4: трек-пресеты для select (admin-only — эндпоинт под admin-glob).
  // Ошибка не блокирует редактор: select просто без опций (кроме «нет звука»).
  useEffect(() => {
    if (!isAdmin) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const res = await admin.getAudioPresets({ kind: 'track' });
        if (!cancelled) setTrackPresets(res.data || []);
      } catch {
        /* секция деградирует — не блокер */
      }
    })();
    return () => { cancelled = true; };
  }, [isAdmin]);

  // ========================================
  // VALIDATION
  // ========================================

  const validate = () => {
    const newErrors = {};

    // Проверка ТОЛЬКО обязательных полей
    if (!title.trim()) {
      newErrors.title = 'Название упражнения обязательно';
    }

    if (!videoUrl.trim()) {
      newErrors.videoUrl = 'Ссылка на видео обязательна';
    } else if (!isValidUrl(videoUrl)) {
      newErrors.videoUrl = 'Введите корректную ссылку';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const isValidUrl = (string) => {
    try {
      new URL(string);
      return true;
    } catch (_) {
      return false;
    }
  };

  // ========================================
  // HANDLERS
  // ========================================

  // Множественный выбор - toggle значения
  const toggleArrayValue = (array, setArray, value) => {
    if (array.includes(value)) {
      setArray(array.filter((item) => item !== value));
    } else {
      setArray([...array, value]);
    }
  };

  // Применить разобранные is*ai поля к форме (только присутствующие ключи — не затираем
  // то, чего модель не вернула). Источник клиники = эксперт; модель только структурирует.
  const applyStructured = (fields) => {
    if (!fields || typeof fields !== 'object') return;
    if (fields.title != null) setTitle(fields.title);
    if (fields.short_title != null) setShortTitle(fields.short_title);
    if (fields.description != null) setDescription(fields.description);
    if (fields.exercise_type != null) setExerciseType(fields.exercise_type);
    if (fields.body_region != null) setBodyRegion(fields.body_region);
    if (fields.difficulty_level != null) setDifficultyLevel(fields.difficulty_level);
    if (Array.isArray(fields.equipment)) setEquipment(fields.equipment);
    if (Array.isArray(fields.position)) setPosition(fields.position);
    if (Array.isArray(fields.rehab_phases)) setRehabPhases(fields.rehab_phases);
    if (fields.instructions != null) setInstructions(fields.instructions);
    if (fields.cues != null) setCues(fields.cues);
    if (fields.tips != null) setTips(fields.tips);
    if (fields.contraindications != null) setContraindications(fields.contraindications);
    if (fields.variations != null) setVariations(fields.variations);
    if (fields.progression != null) setProgression(fields.progression);
    if (fields.instructions || fields.cues || fields.tips || fields.contraindications
      || fields.variations || fields.progression) {
      setShowAdvanced(true);
    }
  };

  const handleStructure = async () => {
    const text = transcript.trim();
    if (text.length < 3 || structuring) return;
    setStructuring(true);
    setStructureError(null);
    setStructureWarnings([]);
    setStructureReview(null);
    setStructureFixed(false);
    setStructureSanity(null);
    try {
      const res = await exercisesApi.structure(text, { review: reviewQuality });
      const payload = res.data || {};
      applyStructured(payload.fields);
      setStructureWarnings(Array.isArray(payload.warnings) ? payload.warnings : []);
      setStructureReview(payload.review || null);
      setStructureFixed(Boolean(payload.fixed));
      setStructureSanity(Array.isArray(payload.sanity) ? payload.sanity : null);
    } catch (err) {
      setStructureError(
        err.response?.data?.message || 'Не удалось разобрать надиктовку. Попробуйте ещё раз.'
      );
    } finally {
      setStructuring(false);
    }
  };

  // Запись голосом: старт → (пауза/продолжить) → стоп + распознавание SpeechKit.
  // Распознанный текст ДОПИСЫВАЕТСЯ к уже введённому (не затирает); сброс — только «Очистить».
  const handleStartRecord = async () => {
    setStructureError(null);
    await recorder.start();
  };

  const handleStopRecognize = async () => {
    setStructureError(null);
    setTranscribing(true);
    try {
      const result = await recorder.stop();
      if (!result || !result.blob || !result.blob.size) {
        return;
      }
      const res = await exercisesApi.transcribe(result.blob, {
        format: 'lpcm',
        sampleRateHertz: result.sampleRateHertz,
      });
      const text = (res.data && res.data.text) || '';
      if (text) {
        setTranscript((prev) => (prev.trim() ? `${prev.trim()} ${text}` : text));
      }
    } catch (err) {
      setStructureError(
        err.response?.data?.message || 'Не удалось распознать аудио. Попробуйте ещё раз.'
      );
    } finally {
      setTranscribing(false);
    }
  };

  // Заполнен ли пункт чек-листа надиктовки (для галочек прогресса).
  const isDictItemFilled = (key) => {
    switch (key) {
      case 'title': return title.trim() !== '';
      case 'body_region': return bodyRegion !== '';
      case 'exercise_type': return exerciseType !== '';
      case 'difficulty_level': return true; // слайдер всегда 1..5
      case 'equipment': return equipment.length > 0;
      case 'position': return position.length > 0;
      case 'rehab_phases': return rehabPhases.length > 0;
      case 'description': return description.trim() !== '';
      case 'instructions': return instructions.trim() !== '';
      case 'cues': return cues.trim() !== '';
      case 'tips': return tips.trim() !== '';
      case 'contraindications': return contraindications.trim() !== '';
      case 'variations': return variations.trim() !== '';
      case 'progression': return progression.trim() !== '';
      default: return false;
    }
  };

  const buildPayload = () => {
    return {
      // ОБЯЗАТЕЛЬНЫЕ поля
      title: title.trim(),
      video_url: videoUrl.trim(),

      // ОПЦИОНАЛЬНЫЕ - отправляем только если заполнены
      ...(shortTitle.trim() && { short_title: shortTitle.trim() }),
      ...(description.trim() && { description: description.trim() }),
      ...(thumbnailUrl.trim() && { thumbnail_url: thumbnailUrl.trim() }),
      ...(exerciseType && { exercise_type: exerciseType }),
      ...(bodyRegion && { body_region: bodyRegion }),

      difficulty_level: Number(difficultyLevel) || 1,

      // МНОЖЕСТВЕННЫЙ ВЫБОР - всегда отправляем как массивы
      equipment,
      position,
      rehab_phases: rehabPhases,

      // ИНСТРУКЦИИ - только если заполнены
      ...(instructions.trim() && { instructions: instructions.trim() }),
      ...(cues.trim() && { cues: cues.trim() }),
      ...(tips.trim() && { tips: tips.trim() }),
      ...(contraindications.trim() && {
        contraindications: contraindications.trim(),
      }),
      ...(variations.trim() && { variations: variations.trim() }),
      ...(progression.trim() && { progression: progression.trim() }),

      // ЗВУК (EA4) — ВСЕГДА шлём (а не conditional spread): чтобы правка
      // упражнения не-админом не затёрла привязку (backend PUT ставит null при
      // отсутствии поля). audioLoop осмыслен только при заданном пресете.
      audio_preset_id: audioPresetId,
      audio_loop: audioPresetId != null ? audioLoop : false,
    };
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validate()) {
      return;
    }

    const payload = buildPayload();
    setIsSubmitting(true);
    setErrors((prev) => ({ ...prev, form: null }));

    try {
      const isEdit = Boolean(exercise && exercise.id);

      // Используем централизованный API сервис (токен добавляется автоматически)
      const response = isEdit
        ? await exercisesApi.update(exercise.id, payload)
        : await exercisesApi.create(payload);

      const savedExercise = response.data?.exercise || response.data;

      // Сообщаем родителю, если нужно
      if (typeof onSave === 'function') {
        onSave(savedExercise);
      }

      onClose();
    } catch (err) {
      const errorMessage =
        err.response?.data?.message ||
        err.message ||
        'Ошибка при сохранении упражнения';

      setErrors((prev) => ({
        ...prev,
        form: errorMessage,
      }));
    } finally {
      setIsSubmitting(false);
    }
  };

  // ========================================
  // RENDER
  // ========================================

  return (
    <div className={s.modalOverlay} {...useModalOverlayClose(onClose)}>
      <div
        className={`${s.modalContent} ${s.exerciseModal}`}
      >
        {/* HEADER */}
        <div className={s.modalHeader}>
          <h2>{exercise ? 'Редактировать упражнение' : 'Новое упражнение'}</h2>
          <button className={s.closeBtn} onClick={onClose} aria-label="Закрыть">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className={s.modalBody}>
            {/* AI-НАДИКТОВКА — текст → поля через is*ai (не-PII контент библиотеки) */}
            <div className={s.formSection}>
              <button
                type="button"
                className={s.toggleAdvancedBtn}
                onClick={() => setShowDictation((v) => !v)}
              >
                {showDictation ? <ChevronDown size={16} /> : <ChevronRight size={16} />}{' '}
                <Sparkles size={16} /> Заполнить надиктовкой{' '}
                <span className={s.optional}>(голос / текст → поля)</span>
              </button>

              {showDictation && (
                <div className={s.advancedFields}>
                  <p style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--color-text, #1f2937)', lineHeight: 1.5 }}>
                    Продиктуйте голосом или впишите/вставьте текст об упражнении.
                    Галочки ниже подсказывают, что назвать, и отмечают, что уже распознано.
                  </p>

                  {/* Чек-лист: что продиктовать + прогресс заполнения */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                      gap: '6px 16px',
                      padding: '12px 14px',
                      marginBottom: 14,
                      background: 'var(--color-surface, #fff)',
                      border: '1px solid var(--color-border, #e5e7eb)',
                      borderRadius: 10,
                    }}
                  >
                    {DICTATION_CHECKLIST.map((item) => {
                      const filled = isDictItemFilled(item.key);
                      return (
                        <div
                          key={item.key}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 7,
                            fontSize: 13,
                            color: filled ? '#1a7f5a' : 'var(--color-text-muted, #6b7280)',
                          }}
                        >
                          {filled
                            ? <CheckCircle2 size={16} color="#1a7f5a" style={{ flexShrink: 0 }} />
                            : <Circle size={16} color="#cbd5e1" style={{ flexShrink: 0 }} />}
                          <span>{item.label}</span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Запись голосом: старт / пауза-продолжить / стоп-распознать */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
                    {!recorder.recording && !transcribing && (
                      <button
                        type="button"
                        className={s.btnSecondary}
                        onClick={handleStartRecord}
                        disabled={structuring}
                      >
                        <Mic size={15} /> Записать голос
                      </button>
                    )}
                    {recorder.recording && (
                      <>
                        <button
                          type="button"
                          className={s.btnSecondary}
                          onClick={() => (recorder.paused ? recorder.resume() : recorder.pause())}
                        >
                          {recorder.paused
                            ? (<><Play size={15} /> Продолжить</>)
                            : (<><Pause size={15} /> Пауза</>)}
                        </button>
                        <button
                          type="button"
                          className={s.btnSecondary}
                          onClick={handleStopRecognize}
                          style={{ background: '#fde8e8', borderColor: '#f56565', color: '#c53030' }}
                        >
                          <Square size={15} /> Остановить и распознать
                        </button>
                      </>
                    )}
                    {transcribing && (
                      <span style={{ fontSize: 13, color: 'var(--color-text-muted, #6b7280)' }}>Распознаю…</span>
                    )}
                    {recorder.recording && (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          fontWeight: 700,
                          fontSize: 15,
                          fontVariantNumeric: 'tabular-nums',
                          color: recorder.elapsedSec >= 28 ? '#c53030' : recorder.elapsedSec >= 22 ? '#b45309' : '#1a7f5a',
                        }}
                      >
                        {recorder.paused
                          ? <Pause size={14} />
                          : <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#c53030', display: 'inline-block' }} />}
                        {formatSec(recorder.elapsedSec)} / 0:30
                      </span>
                    )}
                    <span style={{ fontSize: 12, color: recorder.recording && recorder.elapsedSec >= 28 ? '#c53030' : 'var(--color-text-muted, #6b7280)' }}>
                      {!recorder.recording && !transcribing && 'распознанный текст добавится к уже введённому (не затрёт; сброс — «Очистить»)'}
                      {recorder.recording && recorder.paused && 'на паузе'}
                      {recorder.recording && !recorder.paused && recorder.elapsedSec >= 28 && 'пора остановить — близко к лимиту'}
                    </span>
                  </div>
                  {recorder.error && (
                    <div className={s.errorMessage} style={{ marginBottom: 8 }}>{recorder.error}</div>
                  )}

                  {/* Поле расшифровки */}
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 5 }}>
                    Текст надиктовки
                  </label>
                  <textarea
                    value={transcript}
                    onChange={(e) => setTranscript(e.target.value)}
                    placeholder="Например: «Маятник Кодмана. Регион — плечо. Тип — мобилизация. Сложность 2. Без оборудования. Положение стоя, наклон вперёд с опорой здоровой рукой о стол. Как выполнять: расслабить больную руку, дать свободно свисать и раскачивать её корпусом вперёд-назад, затем по кругу, амплитуда маленькая. Полезно знать: движение идёт за счёт корпуса, а не плеча. Противопоказания: острая боль, свежий вывих.»"
                    rows={7}
                    disabled={structuring || transcribing || recorder.recording}
                    style={{ width: '100%', boxSizing: 'border-box', minHeight: 150, resize: 'vertical' }}
                  />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className={`${s.btnPrimary}${structuring ? ` ${s.btnLoading}` : ''}`}
                      onClick={handleStructure}
                      disabled={structuring || transcript.trim().length < 3}
                    >
                      {structuring && <Loader2 size={16} className={s.spinIcon} aria-hidden="true" />}
                      {structuring
                        ? (reviewQuality ? 'Разбираю и проверяю… (~1–2 мин)' : 'Разбираю… (~30–60 сек)')
                        : 'Разобрать в поля'}
                    </button>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={reviewQuality}
                        disabled={structuring}
                        onChange={(e) => setReviewQuality(e.target.checked)}
                      />
                      Проверить качество (faithfulness + автофикс + клин. проверка)
                    </label>
                    {transcript && !structuring && (
                      <button
                        type="button"
                        className={s.btnSecondary}
                        onClick={() => {
                          setTranscript('');
                          setStructureWarnings([]);
                          setStructureError(null);
                          setStructureReview(null);
                          setStructureFixed(false);
                          setStructureSanity(null);
                        }}
                      >
                        Очистить
                      </button>
                    )}
                  </div>
                  {structureError && (
                    <div className={s.errorMessage} style={{ marginTop: 8 }}>{structureError}</div>
                  )}
                  {structureReview && (
                    <div
                      style={{
                        marginTop: 10, padding: 10, borderRadius: 8, fontSize: 12,
                        border: `1px solid ${structureReview.pass ? '#9FE1CB' : '#f0c36d'}`,
                        background: structureReview.pass ? 'rgba(15,110,86,0.06)' : 'rgba(180,120,0,0.06)',
                      }}
                    >
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>
                        Проверка качества: {structureReview.pass ? '✓ принято' : '⚠ требует внимания'}
                        {' · '}оценка {structureReview.weighted_total}/10
                        {structureFixed && ' · применён автофикс'}
                      </div>
                      {structureReview.scores && (
                        <div style={{ color: 'var(--color-text-muted, #6b7280)', marginBottom: structureReview.issues?.length ? 4 : 0 }}>
                          верность {structureReview.scores.faithfulness}/10 · безопасность {structureReview.scores.safety}/10
                          {' · '}понятность {structureReview.scores.clarity}/10 · полнота {structureReview.scores.completeness}/10
                        </div>
                      )}
                      {Array.isArray(structureReview.issues) && structureReview.issues.length > 0 && (
                        <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                          {structureReview.issues.map((it, i) => (
                            <li key={`iss-${i}`}>
                              <b>[{it.severity}]</b> {it.field ? `${it.field}: ` : ''}{it.message}
                              {it.fix ? ` — ${it.fix}` : ''}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                  {Array.isArray(structureSanity) && structureSanity.length > 0 && (
                    <div
                      style={{
                        marginTop: 10, padding: 10, borderRadius: 8, fontSize: 12,
                        border: '1px solid #e0a3a3', background: 'rgba(180,40,40,0.06)',
                      }}
                    >
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>
                        ⚕ Клиническая проверка — на ваше усмотрение (текст не изменён):
                      </div>
                      <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                        {structureSanity.map((c, i) => (
                          <li key={`san-${i}`}>
                            <b>[{c.severity}]</b> {c.field ? `${c.field}: ` : ''}{c.message}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {structureWarnings.length > 0 && (
                    <ul style={{ marginTop: 8, paddingLeft: 18, color: 'var(--color-text-muted, #6b7280)', fontSize: 12 }}>
                      {structureWarnings.map((w, i) => (<li key={`warn-${i}`}>{w}</li>))}
                    </ul>
                  )}
                </div>
              )}
            </div>

            {/* ОБЯЗАТЕЛЬНЫЕ ПОЛЯ */}
            <div className={`${s.formSection} ${s.requiredSection}`}>
              <h3 className={s.sectionTitle}>Обязательные поля</h3>
              <p className={s.sectionDescription}>
                Поля, отмеченные <span className={s.required}>*</span>, обязательны
                для заполнения
              </p>

              {/* Название упражнения */}
              <div className={s.formGroup}>
                <label>
                  Название упражнения <span className={s.required}>*</span>
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Например: Маятник"
                  className={errors.title ? s.error : ''}
                />
                {errors.title && (
                  <span className={s.errorMessage}>{errors.title}</span>
                )}
              </div>

              {/* Ссылка на видео */}
              <div className={s.formGroup}>
                <label>
                  Ссылка на видео <span className={s.required}>*</span>
                </label>
                <input
                  type="url"
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                  placeholder="https://kinescope.io/..."
                  className={errors.videoUrl ? s.error : ''}
                />
                {errors.videoUrl && (
                  <span className={s.errorMessage}>{errors.videoUrl}</span>
                )}
              </div>
            </div>

            {/* ОСНОВНАЯ ИНФОРМАЦИЯ (опционально) */}
            <div className={s.formSection}>
              <h3 className={s.sectionTitle}>
                Основная информация <span className={s.optional}>(необязательно)</span>
              </h3>

              {/* Короткое название */}
              <div className={s.formGroup}>
                <label>Короткое название</label>
                <input
                  type="text"
                  value={shortTitle}
                  onChange={(e) => setShortTitle(e.target.value)}
                  placeholder="Для отображения в списках"
                />
              </div>

              {/* Описание - MARKDOWN EDITOR */}
              <div className={s.formGroup}>
                <label>
                  Описание
                  <PatientHint>Видно пациенту в секции «Описание»</PatientHint>
                </label>
                <p className={s.fieldHint}>
                  Поддерживает форматирование: **жирный**, *курсив*, списки, заголовки
                </p>
                <div data-color-mode="light">
                  <MDEditor
                    value={description}
                    onChange={(val) => setDescription(val || '')}
                    preview="edit"
                    height={200}
                    textareaProps={{
                      placeholder: 'Описание упражнения с форматированием...',
                    }}
                  />
                </div>
              </div>

              {/* Ссылка на превью */}
              <div className={s.formGroup}>
                <label>Ссылка на превью (thumbnail)</label>
                <input
                  type="url"
                  value={thumbnailUrl}
                  onChange={(e) => setThumbnailUrl(e.target.value)}
                  placeholder="https://..."
                />
              </div>
            </div>

            {/* КЛАССИФИКАЦИЯ (опционально) */}
            <div className={s.formSection}>
              <h3 className={s.sectionTitle}>
                Классификация <span className={s.optional}>(необязательно)</span>
              </h3>

              <div className={s.formRow}>
                {/* Тип упражнения */}
                <div className={s.formGroup}>
                  <label>Тип упражнения</label>
                  <select
                    value={exerciseType}
                    onChange={(e) => setExerciseType(e.target.value)}
                  >
                    <option value="">Не выбрано</option>
                    <option value="strength">Силовое</option>
                    <option value="activation">Активация</option>
                    <option value="mobilization">Мобилизация</option>
                    <option value="stability">Стабилизация</option>
                    <option value="proprioception">Проприоцепция</option>
                    <option value="stretching">Растяжка</option>
                  </select>
                </div>

                {/* Регион тела */}
                <div className={s.formGroup}>
                  <label>Регион тела</label>
                  <select
                    value={bodyRegion}
                    onChange={(e) => setBodyRegion(e.target.value)}
                  >
                    <option value="">Не выбрано</option>
                    <option value="shoulder">Плечо</option>
                    <option value="knee">Колено</option>
                    <option value="spine">Позвоночник</option>
                    <option value="hip">Тазобедренный сустав</option>
                    <option value="ankle">Голеностоп</option>
                    <option value="elbow">Локоть</option>
                    <option value="wrist">Запястье</option>
                    <option value="full_body">Все тело</option>
                  </select>
                </div>
              </div>

              {/* Сложность */}
              <div className={s.formGroup}>
                <label>Уровень сложности: {difficultyLevel}</label>
                <div className={s.difficultySlider}>
                  <input
                    type="range"
                    min="1"
                    max="5"
                    value={difficultyLevel}
                    onChange={(e) =>
                      setDifficultyLevel(parseInt(e.target.value, 10))
                    }
                  />
                  <div className={s.difficultyLabels}>
                    <span>1 - Легко</span>
                    <span>3 - Средне</span>
                    <span>5 - Сложно</span>
                  </div>
                </div>
              </div>
            </div>

            {/* МНОЖЕСТВЕННЫЙ ВЫБОР */}
            <div className={s.formSection}>
              <h3 className={s.sectionTitle}>
                Параметры выполнения{' '}
                <span className={s.optional}>(выберите все подходящие)</span>
              </h3>

              {/* Оборудование */}
              <div className={s.formGroup}>
                <label>Оборудование (можно выбрать несколько)</label>
                <div className={s.checkboxGroup}>
                  {EQUIPMENT_OPTIONS.map((option) => (
                    <label key={option.value} className={s.checkboxLabel}>
                      <input
                        type="checkbox"
                        checked={equipment.includes(option.value)}
                        onChange={() =>
                          toggleArrayValue(equipment, setEquipment, option.value)
                        }
                      />
                      <span>{option.label}</span>
                    </label>
                  ))}
                </div>
                {equipment.length > 0 && (
                  <div className={s.selectedTags}>
                    {equipment.map((item) => {
                      const opt = EQUIPMENT_OPTIONS.find(
                        (o) => o.value === item
                      );
                      return (
                        <span key={item} className={s.tag}>
                          {opt?.label}
                          <button
                            type="button"
                            onClick={() =>
                              toggleArrayValue(
                                equipment,
                                setEquipment,
                                item
                              )
                            }
                            aria-label="Удалить оборудование"
                          >
                            <X size={14} />
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Положение */}
              <div className={s.formGroup}>
                <label>Положение тела (можно выбрать несколько)</label>
                <div className={s.checkboxGroup}>
                  {POSITION_OPTIONS.map((option) => (
                    <label key={option.value} className={s.checkboxLabel}>
                      <input
                        type="checkbox"
                        checked={position.includes(option.value)}
                        onChange={() =>
                          toggleArrayValue(position, setPosition, option.value)
                        }
                      />
                      <span>{option.label}</span>
                    </label>
                  ))}
                </div>
                {position.length > 0 && (
                  <div className={s.selectedTags}>
                    {position.map((item) => {
                      const opt = POSITION_OPTIONS.find(
                        (o) => o.value === item
                      );
                      return (
                        <span key={item} className={s.tag}>
                          {opt?.label}
                          <button
                            type="button"
                            onClick={() =>
                              toggleArrayValue(position, setPosition, item)
                            }
                            aria-label="Удалить позицию"
                          >
                            <X size={14} />
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Фазы реабилитации */}
              <div className={s.formGroup}>
                <label>Фазы реабилитации (можно выбрать несколько)</label>
                <div className={s.checkboxGroup}>
                  {REHAB_PHASE_OPTIONS.map((option) => (
                    <label key={option.value} className={s.checkboxLabel}>
                      <input
                        type="checkbox"
                        checked={rehabPhases.includes(option.value)}
                        onChange={() =>
                          toggleArrayValue(
                            rehabPhases,
                            setRehabPhases,
                            option.value
                          )
                        }
                      />
                      <span>{option.label}</span>
                    </label>
                  ))}
                </div>
                {rehabPhases.length > 0 && (
                  <div className={s.selectedTags}>
                    {rehabPhases.map((item) => {
                      const opt = REHAB_PHASE_OPTIONS.find(
                        (o) => o.value === item
                      );
                      return (
                        <span key={item} className={s.tag}>
                          {opt?.label}
                          <button
                            type="button"
                            onClick={() =>
                              toggleArrayValue(
                                rehabPhases,
                                setRehabPhases,
                                item
                              )
                            }
                            aria-label="Удалить фазу реабилитации"
                          >
                            <X size={14} />
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* РАСШИРЕННЫЕ ПОЛЯ (скрываемые) */}
            <div className={s.formSection}>
              <button
                type="button"
                className={s.toggleAdvancedBtn}
                onClick={() => setShowAdvanced(!showAdvanced)}
              >
                {showAdvanced ? (
                  <ChevronDown size={16} />
                ) : (
                  <ChevronRight size={16} />
                )}{' '}
                Расширенные настройки{' '}
                <span className={s.optional}>(инструкции, противопоказания)</span>
              </button>

              {showAdvanced && (
                <div className={s.advancedFields}>
                  {/* Инструкции */}
                  <div className={s.formGroup}>
                    <label>
                      Инструкции по выполнению
                      <PatientHint>Видно пациенту в секции «Как делать»</PatientHint>
                    </label>
                    <textarea
                      value={instructions}
                      onChange={(e) => setInstructions(e.target.value)}
                      placeholder="Пошаговая инструкция..."
                      rows="4"
                    />
                  </div>

                  {/* Подсказки */}
                  <div className={s.formGroup}>
                    <label>
                      Вербальные подсказки (cues)
                      <PatientHint>Видно пациенту как «Подсказки во время выполнения»</PatientHint>
                    </label>
                    <textarea
                      value={cues}
                      onChange={(e) => setCues(e.target.value)}
                      placeholder="Что говорить пациенту..."
                      rows="2"
                    />
                  </div>

                  {/* Советы */}
                  <div className={s.formGroup}>
                    <label>
                      Полезно знать (tips)
                      <PatientHint>Видно пациенту в секции «Полезно знать»</PatientHint>
                    </label>
                    <textarea
                      value={tips}
                      onChange={(e) => setTips(e.target.value)}
                      placeholder="Что важно учесть..."
                      rows="2"
                    />
                  </div>

                  {/* Противопоказания */}
                  <div className={s.formGroup}>
                    <label>
                      Противопоказания
                      <PatientHint>Видно пациенту в «Безопасность» → «С осторожностью при:»</PatientHint>
                    </label>
                    <textarea
                      value={contraindications}
                      onChange={(e) => setContraindications(e.target.value)}
                      placeholder="Когда НЕ делать это упражнение..."
                      rows="3"
                    />
                  </div>

                  {/* Вариации */}
                  <div className={s.formGroup}>
                    <label>
                      Вариации
                      <PatientHint>Видно пациенту в секции «Вариации»</PatientHint>
                    </label>
                    <textarea
                      value={variations}
                      onChange={(e) => setVariations(e.target.value)}
                      placeholder="Усложнение / облегчение, с весом / без, альтернативные положения..."
                      rows="3"
                    />
                  </div>

                  {/* Прогрессия */}
                  <div className={s.formGroup}>
                    <label>
                      Прогрессия
                      <PatientHint>Видно пациенту в секции «Прогрессия»</PatientHint>
                    </label>
                    <textarea
                      value={progression}
                      onChange={(e) => setProgression(e.target.value)}
                      placeholder="Как усложнять со временем: фаза 1 → фаза 2 → ..."
                      rows="3"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* ЗВУК УПРАЖНЕНИЯ (EA4) — дефолт библиотеки, admin-only */}
            {isAdmin && (
              <div className={s.formSection}>
                <h3 className={s.sectionTitle}>
                  Звук упражнения (трек)
                  <PatientHint>Музыка / голос-инструкция / медитация на всё упражнение</PatientHint>
                </h3>
                <div className={s.formGroup}>
                  <label>Трек по умолчанию</label>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <select
                      value={audioPresetId == null ? '' : String(audioPresetId)}
                      onChange={(e) => {
                        const v = e.target.value;
                        setAudioPresetId(v === '' ? null : Number(v));
                        if (v === '') setAudioLoop(false);
                      }}
                      style={{ flex: 1, minWidth: 0 }}
                    >
                      <option value="">Нет звука</option>
                      {audioPresetId != null
                        && !trackPresets.some((p) => String(p.id) === String(audioPresetId)) && (
                        <option value={String(audioPresetId)}>Трек #{audioPresetId}</option>
                      )}
                      {trackPresets.map((p) => (
                        <option key={p.id} value={String(p.id)}>
                          {p.is_active === false ? `${p.name} (неактивен)` : p.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className={s.btnSecondary}
                      onClick={() => previewTrack(audioPresetId)}
                      disabled={audioPresetId == null}
                      title="Прослушать"
                      style={{ padding: '6px 10px' }}
                    >
                      <Play size={16} />
                    </button>
                  </div>
                </div>
                <div className={s.formGroup}>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <input
                      type="checkbox"
                      checked={audioLoop}
                      disabled={audioPresetId == null}
                      onChange={(e) => setAudioLoop(e.target.checked)}
                    />
                    <span>Зациклить трек на всё упражнение</span>
                  </label>
                </div>
              </div>
            )}
          </div>

          {/* FOOTER */}
          <div className={s.modalFooter}>
            {errors.form && (
              <div className={s.formErrorMessage}>{errors.form}</div>
            )}
            <button
              type="button"
              className={s.btnSecondary}
              onClick={onClose}
              disabled={isSubmitting}
            >
              Отмена
            </button>
            <button
              type="submit"
              className={s.btnPrimary}
              disabled={isSubmitting}
            >
              {isSubmitting
                ? 'Сохраняю...'
                : exercise
                ? 'Сохранить изменения'
                : 'Создать упражнение'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ========================================
// КОНСТАНТЫ ДЛЯ МНОЖЕСТВЕННОГО ВЫБОРА
// ========================================

const EQUIPMENT_OPTIONS = [
  { value: 'no-equipment', label: 'Без оборудования' },
  { value: 'resistance-band', label: 'Резиновая лента' },
  { value: 'dumbbell', label: 'Гантели' },
  { value: 'barbell', label: 'Штанга' },
  { value: 'medicine-ball', label: 'Медицинский мяч' },
  { value: 'trx', label: s.TRX },
  { value: 'foam-roller', label: 'Ролик' },
  { value: 'swiss-ball', label: 'Фитбол' },
  { value: 'kettlebell', label: 'Гиря' },
  { value: 'cable', label: 'Кабельный тренажер' },
  { value: 'bench', label: 'Скамья' },
  { value: 'wall', label: 'Стена' },
];

const POSITION_OPTIONS = [
  { value: 'standing', label: 'Стоя' },
  { value: 'sitting', label: 'Сидя' },
  { value: 'lying', label: 'Лежа' },
  { value: 'supine', label: 'Лежа на спине' },
  { value: 'prone', label: 'Лежа на животе' },
  { value: 'side-lying', label: 'Лежа на боку' },
  { value: 'quadruped', label: 'На четвереньках' },
  { value: 'kneeling', label: 'На коленях' },
];

const REHAB_PHASE_OPTIONS = [
  { value: 'acute', label: 'Острая фаза' },
  { value: 'subacute', label: 'Подострая фаза' },
  { value: 'functional', label: 'Функциональная фаза' },
  { value: 'pre_sport', label: 'Предспортивная фаза' },
  { value: 'sport', label: 'Спортивная фаза' },
  { value: 'prevention', label: 'Профилактика' },
];

// M:SS из секунд (для таймера записи).
const formatSec = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

// Чек-лист надиктовки — что назвать (зеркало backend exerciseStructuring.CHECKLIST).
const DICTATION_CHECKLIST = [
  { key: 'title', label: 'Название' },
  { key: 'body_region', label: 'Регион тела' },
  { key: 'exercise_type', label: 'Тип упражнения' },
  { key: 'difficulty_level', label: 'Сложность (1–5)' },
  { key: 'equipment', label: 'Оборудование' },
  { key: 'position', label: 'Исходное положение' },
  { key: 'rehab_phases', label: 'Фазы реабилитации' },
  { key: 'description', label: 'Описание' },
  { key: 'instructions', label: 'Как выполнять' },
  { key: 'cues', label: 'Подсказки (cues)' },
  { key: 'tips', label: 'Полезно знать' },
  { key: 'contraindications', label: 'Противопоказания' },
  { key: 'variations', label: 'Вариации' },
  { key: 'progression', label: 'Прогрессия' },
];

export default ExerciseModal;
