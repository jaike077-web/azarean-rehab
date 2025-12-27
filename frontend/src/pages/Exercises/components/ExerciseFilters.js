import React, { useState, useEffect } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Search,
  X
} from 'lucide-react';
import {
  BODY_REGIONS,
  EXERCISE_TYPES,
  DIFFICULTY_LEVELS,
  EQUIPMENT_OPTIONS,
  POSITION_OPTIONS,
  REHAB_PHASES
} from '../../../utils/exerciseConstants';
import './ExerciseFilters.css';

function ExerciseFilters({ 
  onFilterChange, 
  totalCount = 0,
  filteredCount = 0 
}) {
  const [isExpanded, setIsExpanded] = useState(false);
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

  // Применяем фильтры с задержкой для поиска
  useEffect(() => {
    const timer = setTimeout(() => {
      onFilterChange(filters);
    }, 300);

    return () => clearTimeout(timer);
  }, [filters, onFilterChange]);

  const handleInputChange = (name, value) => {
    setFilters(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleReset = () => {
    const resetFilters = {
      search: '',
      body_region: '',
      exercise_type: '',
      difficulty_level: '',
      equipment: '',
      position: '',
      rehab_phase: '',
      sort_by: 'created_at',
      sort_order: 'desc'
    };
    setFilters(resetFilters);
  };

  const hasActiveFilters = () => {
    return filters.search || 
           filters.body_region || 
           filters.exercise_type || 
           filters.difficulty_level ||
           filters.equipment ||
           filters.position ||
           filters.rehab_phase;
  };

  const activeFiltersCount = () => {
    let count = 0;
    if (filters.search) count++;
    if (filters.body_region) count++;
    if (filters.exercise_type) count++;
    if (filters.difficulty_level) count++;
    if (filters.equipment) count++;
    if (filters.position) count++;
    if (filters.rehab_phase) count++;
    return count;
  };

  return (
    <div className="exercise-filters">
      {/* Основная строка */}
      <div className="filters-main">
        {/* Поиск */}
        <div className="filter-search">
          <span className="search-icon" aria-hidden="true">
            <Search size={16} />
          </span>
          <input
            type="text"
            placeholder="Поиск упражнений..."
            value={filters.search}
            onChange={(e) => handleInputChange('search', e.target.value)}
            className="search-input"
          />
          {filters.search && (
            <button 
              className="clear-search"
              onClick={() => handleInputChange('search', '')}
              title="Очистить поиск"
              aria-label="Очистить поиск"
            >
              <X size={12} />
            </button>
          )}
        </div>

        {/* Быстрые фильтры */}
        <div className="filters-quick">
          <select
            value={filters.body_region}
            onChange={(e) => handleInputChange('body_region', e.target.value)}
            className="filter-select"
          >
            <option value="">Все регионы</option>
            {Object.entries(BODY_REGIONS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>

          <select
            value={filters.exercise_type}
            onChange={(e) => handleInputChange('exercise_type', e.target.value)}
            className="filter-select"
          >
            <option value="">Все типы</option>
            {Object.entries(EXERCISE_TYPES).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>

          <select
            value={filters.difficulty_level}
            onChange={(e) => handleInputChange('difficulty_level', e.target.value)}
            className="filter-select"
          >
            <option value="">Любая сложность</option>
            {Object.entries(DIFFICULTY_LEVELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>

        {/* Кнопки управления */}
        <div className="filters-actions">
          <button
            className={`btn-expand ${isExpanded ? 'active' : ''}`}
            onClick={() => setIsExpanded(!isExpanded)}
            title={isExpanded ? 'Скрыть фильтры' : 'Показать все фильтры'}
          >
            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            Фильтры
            {activeFiltersCount() > 0 && (
              <span className="filter-badge">{activeFiltersCount()}</span>
            )}
          </button>

          {hasActiveFilters() && (
            <button
              className="btn-reset"
              onClick={handleReset}
              title="Сбросить все фильтры"
            >
              <X size={14} />
              Сбросить
            </button>
          )}

          {/* Сортировка */}
          <select
            value={`${filters.sort_by}-${filters.sort_order}`}
            onChange={(e) => {
              const [sort_by, sort_order] = e.target.value.split('-');
              setFilters(prev => ({
                ...prev,
                sort_by,
                sort_order
              }));
            }}
            className="filter-select sort-select"
          >
            <option value="created_at-desc">Новые первые</option>
            <option value="created_at-asc">Старые первые</option>
            <option value="title-asc">По названию (А-Я)</option>
            <option value="title-desc">По названию (Я-А)</option>
            <option value="difficulty_level-asc">Сложность ↑</option>
            <option value="difficulty_level-desc">Сложность ↓</option>
          </select>
        </div>
      </div>

      {/* Расширенные фильтры */}
      {isExpanded && (
        <div className="filters-expanded">
          <div className="filters-grid">
            {/* Оборудование */}
            <div className="filter-group">
              <label>Оборудование</label>
              <select
                value={filters.equipment}
                onChange={(e) => handleInputChange('equipment', e.target.value)}
                className="filter-select"
              >
                <option value="">Любое</option>
                {Object.entries(EQUIPMENT_OPTIONS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>

            {/* Позиция */}
            <div className="filter-group">
              <label>Позиция</label>
              <select
                value={filters.position}
                onChange={(e) => handleInputChange('position', e.target.value)}
                className="filter-select"
              >
                <option value="">Любая</option>
                {Object.entries(POSITION_OPTIONS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>

            {/* Фаза реабилитации */}
            <div className="filter-group">
              <label>Фаза реабилитации</label>
              <select
                value={filters.rehab_phase}
                onChange={(e) => handleInputChange('rehab_phase', e.target.value)}
                className="filter-select"
              >
                <option value="">Любая фаза</option>
                {Object.entries(REHAB_PHASES).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Активные фильтры */}
          {hasActiveFilters() && (
            <div className="active-filters">
              <span className="active-filters-label">Активные фильтры:</span>
              <div className="active-filters-list">
                {filters.search && (
                  <span className="active-filter">
                    Поиск: "{filters.search}"
                    <button
                      onClick={() => handleInputChange('search', '')}
                      aria-label="Убрать фильтр по поиску"
                    >
                      <X size={12} />
                    </button>
                  </span>
                )}
                {filters.body_region && (
                  <span className="active-filter">
                    {BODY_REGIONS[filters.body_region]}
                    <button
                      onClick={() => handleInputChange('body_region', '')}
                      aria-label="Убрать фильтр по региону"
                    >
                      <X size={12} />
                    </button>
                  </span>
                )}
                {filters.exercise_type && (
                  <span className="active-filter">
                    {EXERCISE_TYPES[filters.exercise_type]}
                    <button
                      onClick={() => handleInputChange('exercise_type', '')}
                      aria-label="Убрать фильтр по типу упражнения"
                    >
                      <X size={12} />
                    </button>
                  </span>
                )}
                {filters.difficulty_level && (
                  <span className="active-filter">
                    {DIFFICULTY_LEVELS[filters.difficulty_level]}
                    <button
                      onClick={() => handleInputChange('difficulty_level', '')}
                      aria-label="Убрать фильтр по сложности"
                    >
                      <X size={12} />
                    </button>
                  </span>
                )}
                {filters.equipment && (
                  <span className="active-filter">
                    {EQUIPMENT_OPTIONS[filters.equipment]}
                    <button
                      onClick={() => handleInputChange('equipment', '')}
                      aria-label="Убрать фильтр по оборудованию"
                    >
                      <X size={12} />
                    </button>
                  </span>
                )}
                {filters.position && (
                  <span className="active-filter">
                    {POSITION_OPTIONS[filters.position]}
                    <button
                      onClick={() => handleInputChange('position', '')}
                      aria-label="Убрать фильтр по позиции"
                    >
                      <X size={12} />
                    </button>
                  </span>
                )}
                {filters.rehab_phase && (
                  <span className="active-filter">
                    {REHAB_PHASES[filters.rehab_phase]}
                    <button
                      onClick={() => handleInputChange('rehab_phase', '')}
                      aria-label="Убрать фильтр по фазе реабилитации"
                    >
                      <X size={12} />
                    </button>
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Результаты */}
      <div className="filters-results">
        Показано: <strong>{filteredCount}</strong> из <strong>{totalCount}</strong> упражнений
      </div>
    </div>
  );
}

export default ExerciseFilters;
