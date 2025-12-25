import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { complexes, templates } from '../services/api';
import './MyComplexes.css';
import BackButton from '../components/BackButton';
import Breadcrumbs from '../components/Breadcrumbs';
import { useToast } from '../context/ToastContext';
import { 
  LayoutDashboard, 
  ClipboardList, 
  BarChart3, 
  FileText, 
  Edit2, 
  Link2, 
  Trash2,
  X,
  Lightbulb,
  CheckSquare,
  Square,
  Search,
  SortAsc,
  Folder,
  ChevronLeft,
  ChevronRight,
  Eye,
} from 'lucide-react';
import ComplexCardSkeleton from '../components/skeletons/ComplexCardSkeleton';
import TemplateCardSkeleton from '../components/skeletons/TemplateCardSkeleton';
import TemplateViewModal from '../components/TemplateViewModal';
import DeleteTemplateModal from '../components/DeleteTemplateModal';


function MyComplexes() {
  const toast = useToast();
  const [complexesList, setComplexesList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCompositionModal, setShowCompositionModal] = useState(false);
  const [selectedComplex, setSelectedComplex] = useState(null);
  const [complexExercises, setComplexExercises] = useState([]);
  const navigate = useNavigate();
  const [selectedIds, setSelectedIds] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
const itemsPerPage = 10;
const [searchTerm, setSearchTerm] = useState('');
const [sortBy, setSortBy] = useState('date_desc'); // date_desc, date_asc, name_asc, name_desc
const [activeTab, setActiveTab] = useState('complexes'); // complexes, templates
const [templatesList, setTemplatesList] = useState([]);
const [templatesLoading, setTemplatesLoading] = useState(true);
const [viewTemplateId, setViewTemplateId] = useState(null);
const [viewTemplateModalOpen, setViewTemplateModalOpen] = useState(false);
const [deleteTemplateModalOpen, setDeleteTemplateModalOpen] = useState(false);
const [templateToDelete, setTemplateToDelete] = useState(null);
const location = useLocation();

useEffect(() => {
  loadComplexes();
  loadTemplates();
}, []);

useEffect(() => {
  const params = new URLSearchParams(location.search);
  const tab = params.get('tab');
  if (tab === 'templates' || tab === 'complexes') {
    setActiveTab(tab);
  }
}, [location.search]);

// Сброс страницы при изменении поиска
useEffect(() => {
  setCurrentPage(1);
}, [searchTerm, sortBy]);

  const loadComplexes = async () => {
    try {
      setLoading(true);
      const response = await complexes.getAll();
      setComplexesList(response.data.complexes || []);
    } catch (err) {
      console.error('Ошибка загрузки комплексов:', err);
      setError('Не удалось загрузить комплексы');
    } finally {
      setLoading(false);
    }
  };

  const loadTemplates = async () => {
    try {
      setTemplatesLoading(true);
      const response = await templates.getAll();
      const data = response.data?.items || response.data?.templates || response.data || [];
      setTemplatesList(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Ошибка загрузки шаблонов:', err);
    } finally {
      setTemplatesLoading(false);
    }
  };


  const handleViewTemplate = (template) => {
    setViewTemplateId(template.id);
    setViewTemplateModalOpen(true);
  };


  const handleEditTemplate = (template) => {
    navigate(`/templates/${template.id}/edit`);
  };



  const handleDeleteTemplate = (template) => {
    setTemplateToDelete(template);
    setDeleteTemplateModalOpen(true);
  };

  const handleConfirmTemplateDelete = async () => {
    setDeleteTemplateModalOpen(false);
    setTemplateToDelete(null);
    await loadTemplates();
  };


  // Массовое выделение
  const toggleSelect = (id) => {
    setSelectedIds(prev => 
      prev.includes(id) 
        ? prev.filter(i => i !== id)
        : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === complexesList.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(complexesList.map(c => c.id));
    }
  };

  const clearSelection = () => {
    setSelectedIds([]);
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    
    if (!window.confirm(`Удалить ${selectedIds.length} комплекс(ов)?`)) return;

    try {
      let deleted = 0;
      for (const id of selectedIds) {
        await complexes.delete(id);
        deleted++;
      }
      toast.success(`Удалено комплексов: ${deleted}`);
      setSelectedIds([]);
      loadComplexes();
    } catch (err) {
      console.error('Ошибка удаления:', err);
      toast.error('Не удалось удалить некоторые комплексы');
      loadComplexes();
    }
  };

  const handleCopyLink = (token) => {
    const link = `${window.location.origin}/patient/${token}`;
    navigator.clipboard.writeText(link);
    toast.success('Ссылка скопирована! 📋');
  };

  const handleViewProgress = (complexId) => {
    navigate(`/progress/${complexId}`);
  };

  const handleViewComposition = async (complex) => {
    try {
      setSelectedComplex(complex);
      // Загружаем детали комплекса с упражнениями
      const response = await complexes.getOne(complex.id);
      console.log('Complex data:', response.data); // Для отладки
      
      // Backend возвращает { complex: { exercises: [...] } }
      const exercisesData = response.data.complex?.exercises || [];
      
      // Преобразуем формат данных
      const formattedExercises = exercisesData
        .filter(item => item.exercise) // Убираем null записи
        .map(item => ({
          exercise_id: item.exercise.id,
          exercise_title: item.exercise.title,
          exercise_description: item.exercise.description,
          sets: item.sets,
          reps: item.reps,
          duration: item.duration_seconds,
          notes: item.notes,
          order_number: item.order_number
        }));
      
      setComplexExercises(formattedExercises);
      setShowCompositionModal(true);
    } catch (err) {
      console.error('Ошибка загрузки состава комплекса:', err);
      toast.error('Ошибка при загрузке упражнений');
    }
  };

  const handleEdit = (complexId) => {
    navigate(`/complex/edit/${complexId}`);
  };

  const handleDelete = async (complexId, patientName) => {
    const confirmed = window.confirm(
      `Вы уверены, что хотите удалить комплекс для пациента "${patientName}"?`
    );

    if (!confirmed) return;

    try {
      await complexes.delete(complexId);
      toast.success('Комплекс успешно удален! 🗑️');
      loadComplexes();
    } catch (err) {
      console.error('Ошибка удаления комплекса:', err);
      toast.error('Ошибка при удалении комплекса');
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  if (error) {
    return <div className="error-message">{error}</div>;
  }

  // Фильтрация и сортировка комплексов
  const filteredComplexes = complexesList
    .filter(c => {
      if (!searchTerm) return true;
      const search = searchTerm.toLowerCase();
      return (
        c.patient_name?.toLowerCase().includes(search) ||
        c.diagnosis_name?.toLowerCase().includes(search)
      );
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'date_asc':
          return new Date(a.created_at) - new Date(b.created_at);
        case 'date_desc':
          return new Date(b.created_at) - new Date(a.created_at);
        case 'name_asc':
          return a.patient_name.localeCompare(b.patient_name);
        case 'name_desc':
          return b.patient_name.localeCompare(a.patient_name);
        default:
          return 0;
      }
    });

  // Пагинация
  const totalPages = Math.ceil(filteredComplexes.length / itemsPerPage);
  const paginatedComplexes = filteredComplexes.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  

  return (
    <div className="my-complexes-page">
      <Breadcrumbs
  items={[
    { 
      icon: <LayoutDashboard size={16} />, 
      label: 'Главная', 
      path: '/dashboard' 
    },
    { 
      icon: <ClipboardList size={16} />, 
      label: 'Мои комплексы' 
    }
  ]}
/>

      
      <div className="back-button-wrapper">
        <BackButton to="/" label="На главную" />
      </div>

      <div className="page-header">
        <div>
          <h1>
            <ClipboardList className="page-icon" size={28} />
            <span>Мои комплексы</span>
          </h1>
          <p>Управление комплексами упражнений</p>
        </div>
      </div>
{/* Вкладки */}
<div className="tabs-container">
        <button 
          className={`tab-btn ${activeTab === 'complexes' ? 'active' : ''}`}
          onClick={() => setActiveTab('complexes')}
        >
          <ClipboardList size={18} /> Комплексы ({complexesList.length})
        </button>
        <button 
          className={`tab-btn ${activeTab === 'templates' ? 'active' : ''}`}
          onClick={() => setActiveTab('templates')}
        >
          <Folder size={18} /> Шаблоны ({templatesList.length})
        </button>
      </div>

      {/* Поиск и сортировка — только для комплексов */}
      {activeTab === 'complexes' && complexesList.length > 0 && (
        <div className="filters-bar">
          <div className="search-box">
            <Search size={18} className="search-icon" />
            <input
              type="text"
              placeholder="Поиск по пациенту или диагнозу..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button className="clear-search" onClick={() => setSearchTerm('')}>
                <X size={16} />
              </button>
            )}
          </div>
          <div className="sort-box">
            <SortAsc size={18} />
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              <option value="date_desc">Сначала новые</option>
              <option value="date_asc">Сначала старые</option>
              <option value="name_asc">По имени А-Я</option>
              <option value="name_desc">По имени Я-А</option>
            </select>
          </div>
        </div>
      )}
{activeTab === 'complexes' && (
        <>
{/* Панель массового выбора */}
{complexesList.length > 0 && (
        <div className="bulk-actions-bar">
          <button className="btn-select-all" onClick={toggleSelectAll}>
            {selectedIds.length === complexesList.length ? (
              <><CheckSquare size={18} /> Снять выделение</>
            ) : (
              <><Square size={18} /> Выбрать все</>
            )}
          </button>
          
          {selectedIds.length > 0 && (
            <div className="bulk-actions">
              <span className="selected-count">Выбрано: {selectedIds.length}</span>
              <button className="btn-bulk-delete" onClick={handleBulkDelete}>
                <Trash2 size={16} /> Удалить
              </button>
              <button className="btn-clear-selection" onClick={clearSelection}>
                <X size={16} />
              </button>
            </div>
          )}
        </div>
      )}

      

      {loading ? (
        <div className="complexes-grid">
          {Array.from({ length: 6 }).map((_, index) => (
            <ComplexCardSkeleton key={index} />
          ))}
        </div>
      ) : complexesList.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">
            <ClipboardList size={64} />
          </div>
          <h2>Комплексов пока нет</h2>
          <p>Создайте первый комплекс для пациента</p>
        </div>
      ) : (
        <div className="complexes-grid">
          {paginatedComplexes.map((complex) => (
            <div key={complex.id} className={`complex-card ${selectedIds.includes(complex.id) ? 'selected' : ''}`}>
            <div 
              className="card-checkbox" 
              onClick={(e) => { e.stopPropagation(); toggleSelect(complex.id); }}
            >
              {selectedIds.includes(complex.id) ? (
                <CheckSquare size={20} className="checked" />
              ) : (
                <Square size={20} />
              )}
            </div>
              <div className="complex-header">
                
                <div className="complex-info">
                  <h3>{complex.patient_name}</h3>
                  <p className="complex-meta">
                    {complex.diagnosis_name || 'Без диагноза'}
                  </p>
                </div>
              </div>

              <div className="complex-details">
                <div className="detail-row">
                  <span className="detail-label">Упражнений:</span>
                  <span className="detail-value">{complex.exercises_count || 0}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Создан:</span>
                  <span className="detail-value">{formatDate(complex.created_at)}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Выполнений:</span>
                  <span className="detail-value">{complex.completions_count || 0}</span>
                </div>
              </div>

              {complex.recommendations && (
                <div className="complex-notes">
                  <strong>
                    <Lightbulb size={14} style={{ display: 'inline', marginRight: '4px' }} />
                    Рекомендации:
                  </strong>
                  <p>{complex.recommendations}</p>
                </div>
              )}

<div className="complex-actions">
  <button
    type="button"
    className="btn-progress btn-primary-action"
    onClick={() => handleViewProgress(complex.id)}
    title="Посмотреть прогресс пациента"
  >
    <BarChart3 size={16} />
    <span>Прогресс</span>
  </button>

  <button
    type="button"
    className="btn-composition btn-primary-action"
    onClick={() => handleViewComposition(complex)}
    title="Посмотреть состав комплекса"
  >
    <FileText size={16} />
    <span>Состав</span>
  </button>

  <button
    type="button"
    className="btn-edit icon-btn"
    onClick={() => handleEdit(complex.id)}
    title="Редактировать"
    aria-label="Редактировать"
  >
    <Edit2 size={18} />
  </button>

  <button
    type="button"
    className="btn-copy-link icon-btn"
    onClick={() => handleCopyLink(complex.access_token)}
    title="Скопировать ссылку"
    aria-label="Скопировать ссылку"
  >
    <Link2 size={18} />
  </button>

  <button
    type="button"
    className="btn-delete icon-btn"
    onClick={() => handleDelete(complex.id, complex.patient_name)}
    title="Удалить"
    aria-label="Удалить"
  >
    <Trash2 size={18} />
  </button>
</div>

            </div>
          ))}
        </div>
      )}

      {/* Пагинация */}
      {totalPages > 1 && (
        <div className="pagination">
          <button 
            className="pagination-btn"
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
          >
            <ChevronLeft size={18} />
          </button>
          
          {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
            <button
              key={page}
              className={`pagination-btn ${currentPage === page ? 'active' : ''}`}
              onClick={() => setCurrentPage(page)}
            >
              {page}
            </button>
          ))}
          
          <button 
            className="pagination-btn"
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
          >
            <ChevronRight size={18} />
          </button>
        </div>
      )}

      {/* Результаты поиска */}
      {searchTerm && (
        <p className="search-results-count">
          Найдено: {filteredComplexes.length} из {complexesList.length}
        </p>
      )}
        </>
      )}

      {/* Вкладка Шаблоны */}
      {activeTab === 'templates' && (
        <div className="templates-section">
          {templatesLoading ? (
            <div className="templates-grid">
              {Array.from({ length: 6 }).map((_, index) => (
                <TemplateCardSkeleton key={index} />
              ))}
            </div>
          ) : templatesList.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">
                <Folder size={64} />
              </div>
              <h2>Шаблонов пока нет</h2>
              <p>Создайте комплекс и сохраните его как шаблон</p>
            </div>
          ) : (
            <div className="templates-grid">
              {templatesList.map(template => (
                <div key={template.id} className="template-card">
                  <div className="template-header">
                    <Folder size={24} className="template-icon" />
                    <div className="template-info">
                      <h3>{template.name}</h3>
                      {template.description && <p>{template.description}</p>}
                    </div>
                  </div>
                  <div className="template-meta">
                    <span>{template.exercises_count} упражнений</span>
                    {template.diagnosis_name && <span>• {template.diagnosis_name}</span>}
                  </div>
                  <div className="template-actions">
  <button
    className="btn-view icon-btn"
    onClick={() => handleViewTemplate(template)}
    title="Просмотр"
    aria-label="Просмотр"
    type="button"
  >
    <Eye size={18} />
  </button>

  <button
    className="btn-edit icon-btn"
    onClick={() => handleEditTemplate(template)}
    title="Редактировать"
    aria-label="Редактировать"
    type="button"
  >
    <Edit2 size={18} />
  </button>

  <button
    className="btn-delete icon-btn"
    onClick={() => handleDeleteTemplate(template)}
    title="Удалить"
    aria-label="Удалить"
    type="button"
  >
    <Trash2 size={18} />
  </button>
</div>

                </div>
              ))}
            </div>
          )}
        </div>
      )}


      {/* Модальное окно состава комплекса */}
      {showCompositionModal && selectedComplex && (
        <div className="modal-overlay" onClick={() => setShowCompositionModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>
                <FileText size={24} style={{ display: 'inline', marginRight: '8px', verticalAlign: 'middle' }} />
                Состав комплекса: {selectedComplex.patient_name}
              </h2>
              <button className="modal-close" onClick={() => setShowCompositionModal(false)}>
                <X size={20} />
              </button>
            </div>

            <div className="modal-body">
              <div className="complex-info-block">
                <div className="info-row">
                  <span className="info-label">Диагноз:</span>
                  <span className="info-value">{selectedComplex.diagnosis_name || 'Не указан'}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Создан:</span>
                  <span className="info-value">{formatDate(selectedComplex.created_at)}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Всего упражнений:</span>
                  <span className="info-value">{complexExercises.length}</span>
                </div>
              </div>

              {selectedComplex.recommendations && (
                <div className="recommendations-block">
                  <strong>
                    <Lightbulb size={16} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle' }} />
                    Рекомендации:
                  </strong>
                  <p>{selectedComplex.recommendations}</p>
                </div>
              )}

              <div className="exercises-list-modal">
                <h3>Упражнения:</h3>
                {complexExercises.length === 0 ? (
                  <p className="empty-text">Нет упражнений в комплексе</p>
                ) : (
                  complexExercises.map((ex, index) => (
                    <div key={ex.exercise_id} className="exercise-item-modal">
                      <div className="exercise-number">{index + 1}</div>
                      <div className="exercise-details-modal">
                        <h4>{ex.exercise_title}</h4>
                        <p className="exercise-description">{ex.exercise_description}</p>
                        <div className="exercise-params-modal">
                          <span className="param-badge">
                            <strong>Подходы:</strong> {ex.sets || '-'}
                          </span>
                          <span className="param-badge">
                            <strong>Повторения:</strong> {ex.reps || '-'}
                          </span>
                          <span className="param-badge">
                            <strong>Длительность:</strong> {ex.duration ? `${ex.duration} сек` : '-'}
                          </span>
                        </div>
                        {ex.notes && (
                          <div className="exercise-notes">
                            <strong>📝 Примечание:</strong> {ex.notes}
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowCompositionModal(false)}>
                Закрыть
              </button>
              <button 
                className="btn-primary" 
                onClick={() => {
                  setShowCompositionModal(false);
                  handleEdit(selectedComplex.id);
                }}
              >
                <Edit2 size={18} style={{ marginRight: '6px' }} />
                Редактировать комплекс
              </button>
            </div>
          </div>
        </div>
      )}

<TemplateViewModal
  templateId={viewTemplateId}
  isOpen={viewTemplateModalOpen}
  onClose={() => {
    setViewTemplateModalOpen(false);
    setViewTemplateId(null);
  }}
/>

<DeleteTemplateModal
  template={templateToDelete}
  isOpen={deleteTemplateModalOpen}
  onClose={() => {
    setDeleteTemplateModalOpen(false);
    setTemplateToDelete(null);
  }}
  onConfirm={handleConfirmTemplateDelete}
/>
    </div>
  );
}

export default MyComplexes;
