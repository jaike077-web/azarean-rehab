import React, { useState, useEffect } from 'react';
import { ChevronDown, ChevronRight, X } from 'lucide-react';
import MDEditor from '@uiw/react-md-editor';
import './ExerciseModal.css';

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

  // UI state
  const [errors, setErrors] = useState({});
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

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

      // Показать расширенные поля если они заполнены
      if (
        exercise.instructions ||
        exercise.cues ||
        exercise.tips ||
        exercise.contraindications
      ) {
        setShowAdvanced(true);
      }
    }
  }, [exercise]);

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
      const token =
        localStorage.getItem('token') ||
        localStorage.getItem('accessToken') ||
        localStorage.getItem('authToken');

      const isEdit = Boolean(exercise && exercise.id);
      const url = isEdit
        ? `/api/exercises/${exercise.id}`
        : '/api/exercises';
      const method = isEdit ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        let message = 'Ошибка при сохранении упражнения';
        try {
          const data = await response.json();
          if (data?.message) message = data.message;
        } catch (_) {
          // игнорируем проблемы с JSON
        }

        console.error('Exercise save error:', response.status, message);
        setErrors((prev) => ({ ...prev, form: message }));
        return;
      }

      const data = await response.json();

      // Сообщаем родителю, если нужно
      if (typeof onSave === 'function') {
        onSave(data.exercise || payload);
      }

      onClose();
    } catch (err) {
      console.error('Network error while saving exercise:', err);
      setErrors((prev) => ({
        ...prev,
        form: 'Ошибка сети при сохранении упражнения',
      }));
    } finally {
      setIsSubmitting(false);
    }
  };

  // ========================================
  // RENDER
  // ========================================

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content exercise-modal"
        onClick={(e) => e.stopPropagation()}
      >
        {/* HEADER */}
        <div className="modal-header">
          <h2>{exercise ? 'Редактировать упражнение' : 'Новое упражнение'}</h2>
          <button className="close-btn" onClick={onClose} aria-label="Закрыть">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {/* ОБЯЗАТЕЛЬНЫЕ ПОЛЯ */}
            <div className="form-section required-section">
              <h3 className="section-title">Обязательные поля</h3>
              <p className="section-description">
                Поля, отмеченные <span className="required">*</span>, обязательны
                для заполнения
              </p>

              {/* Название упражнения */}
              <div className="form-group">
                <label>
                  Название упражнения <span className="required">*</span>
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Например: Маятник"
                  className={errors.title ? 'error' : ''}
                />
                {errors.title && (
                  <span className="error-message">{errors.title}</span>
                )}
              </div>

              {/* Ссылка на видео */}
              <div className="form-group">
                <label>
                  Ссылка на видео <span className="required">*</span>
                </label>
                <input
                  type="url"
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                  placeholder="https://kinescope.io/..."
                  className={errors.videoUrl ? 'error' : ''}
                />
                {errors.videoUrl && (
                  <span className="error-message">{errors.videoUrl}</span>
                )}
              </div>
            </div>

            {/* ОСНОВНАЯ ИНФОРМАЦИЯ (опционально) */}
            <div className="form-section">
              <h3 className="section-title">
                Основная информация <span className="optional">(необязательно)</span>
              </h3>

              {/* Короткое название */}
              <div className="form-group">
                <label>Короткое название</label>
                <input
                  type="text"
                  value={shortTitle}
                  onChange={(e) => setShortTitle(e.target.value)}
                  placeholder="Для отображения в списках"
                />
              </div>

              {/* Описание - MARKDOWN EDITOR */}
              <div className="form-group">
                <label>Описание</label>
                <p className="field-hint">
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
              <div className="form-group">
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
            <div className="form-section">
              <h3 className="section-title">
                Классификация <span className="optional">(необязательно)</span>
              </h3>

              <div className="form-row">
                {/* Тип упражнения */}
                <div className="form-group">
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
                <div className="form-group">
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
              <div className="form-group">
                <label>Уровень сложности: {difficultyLevel}</label>
                <div className="difficulty-slider">
                  <input
                    type="range"
                    min="1"
                    max="5"
                    value={difficultyLevel}
                    onChange={(e) =>
                      setDifficultyLevel(parseInt(e.target.value, 10))
                    }
                  />
                  <div className="difficulty-labels">
                    <span>1 - Легко</span>
                    <span>3 - Средне</span>
                    <span>5 - Сложно</span>
                  </div>
                </div>
              </div>
            </div>

            {/* МНОЖЕСТВЕННЫЙ ВЫБОР */}
            <div className="form-section">
              <h3 className="section-title">
                Параметры выполнения{' '}
                <span className="optional">(выберите все подходящие)</span>
              </h3>

              {/* Оборудование */}
              <div className="form-group">
                <label>Оборудование (можно выбрать несколько)</label>
                <div className="checkbox-group">
                  {EQUIPMENT_OPTIONS.map((option) => (
                    <label key={option.value} className="checkbox-label">
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
                  <div className="selected-tags">
                    {equipment.map((item) => {
                      const opt = EQUIPMENT_OPTIONS.find(
                        (o) => o.value === item
                      );
                      return (
                        <span key={item} className="tag">
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
              <div className="form-group">
                <label>Положение тела (можно выбрать несколько)</label>
                <div className="checkbox-group">
                  {POSITION_OPTIONS.map((option) => (
                    <label key={option.value} className="checkbox-label">
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
                  <div className="selected-tags">
                    {position.map((item) => {
                      const opt = POSITION_OPTIONS.find(
                        (o) => o.value === item
                      );
                      return (
                        <span key={item} className="tag">
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
              <div className="form-group">
                <label>Фазы реабилитации (можно выбрать несколько)</label>
                <div className="checkbox-group">
                  {REHAB_PHASE_OPTIONS.map((option) => (
                    <label key={option.value} className="checkbox-label">
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
                  <div className="selected-tags">
                    {rehabPhases.map((item) => {
                      const opt = REHAB_PHASE_OPTIONS.find(
                        (o) => o.value === item
                      );
                      return (
                        <span key={item} className="tag">
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
            <div className="form-section">
              <button
                type="button"
                className="toggle-advanced-btn"
                onClick={() => setShowAdvanced(!showAdvanced)}
              >
                {showAdvanced ? (
                  <ChevronDown size={16} />
                ) : (
                  <ChevronRight size={16} />
                )}{' '}
                Расширенные настройки{' '}
                <span className="optional">(инструкции, противопоказания)</span>
              </button>

              {showAdvanced && (
                <div className="advanced-fields">
                  {/* Инструкции */}
                  <div className="form-group">
                    <label>Инструкции по выполнению</label>
                    <textarea
                      value={instructions}
                      onChange={(e) => setInstructions(e.target.value)}
                      placeholder="Пошаговая инструкция..."
                      rows="4"
                    />
                  </div>

                  {/* Подсказки */}
                  <div className="form-group">
                    <label>Вербальные подсказки (cues)</label>
                    <textarea
                      value={cues}
                      onChange={(e) => setCues(e.target.value)}
                      placeholder="Что говорить пациенту..."
                      rows="2"
                    />
                  </div>

                  {/* Советы */}
                  <div className="form-group">
                    <label>Советы инструктору</label>
                    <textarea
                      value={tips}
                      onChange={(e) => setTips(e.target.value)}
                      placeholder="Что важно учесть..."
                      rows="2"
                    />
                  </div>

                  {/* Противопоказания */}
                  <div className="form-group">
                    <label>Противопоказания</label>
                    <textarea
                      value={contraindications}
                      onChange={(e) => setContraindications(e.target.value)}
                      placeholder="Когда НЕ делать это упражнение..."
                      rows="3"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* FOOTER */}
          <div className="modal-footer">
            {errors.form && (
              <div className="form-error-message">{errors.form}</div>
            )}
            <button
              type="button"
              className="btn-secondary"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Отмена
            </button>
            <button
              type="submit"
              className="btn-primary"
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
  { value: 'trx', label: 'TRX' },
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

export default ExerciseModal;
