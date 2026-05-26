import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { complexes, templates } from '../services/api';
import { formatDateNumeric } from '../utils/dateUtils';
import s from './MyComplexes.module.css';
import BackButton from '../components/BackButton';
import Breadcrumbs from '../components/Breadcrumbs';
import ConfirmModal from '../components/ConfirmModal';
import useConfirm from '../hooks/useConfirm';
import { useModalOverlayClose } from '../hooks/useModalOverlayClose';
import { useToast } from '../context/ToastContext';
import { 
  LayoutDashboard, 
  ClipboardList, 
  BarChart3, 
  FileText, 
  Edit2,
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
  const { confirmState, confirm, closeConfirm } = useConfirm();
  const [complexesList, setComplexesList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCompositionModal, setShowCompositionModal] = useState(false);
  const compositionOverlayProps = useModalOverlayClose(() => setShowCompositionModal(false));
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
      setComplexesList(response.data || []);
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
      const data = response.data || [];
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

  const handleBulkDelete = () => {
    if (selectedIds.length === 0) return;

    confirm({
      title: 'Удалить комплексы?',
      message: `Вы уверены, что хотите удалить ${selectedIds.length} комплекс(ов)?`,
      confirmText: 'Удалить',
      variant: 'danger',
      onConfirm: async () => {
        try {
          let deleted = 0;
          for (const id of selectedIds) {
            await complexes.delete(id);
            deleted += 1;
          }
          toast.success(`Удалено комплексов: ${deleted}`);
          setSelectedIds([]);
          loadComplexes();
        } catch (err) {
          toast.error('Не удалось удалить некоторые комплексы');
          loadComplexes();
        }
      }
    });
  };

  const handleViewProgress = (complexId) => {
    navigate(`/progress/${complexId}`);
  };

  const handleViewComposition = async (complex) => {
    try {
      setSelectedComplex(complex);
      // Загружаем детали комплекса с упражнениями
      const response = await complexes.getOne(complex.id);

      // Backend возвращает { data: { exercises: [...] } }
      const exercisesData = response.data?.exercises || [];
      
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

  const handleDelete = (complexId, patientName) => {
    confirm({
      title: 'Удалить комплекс?',
      message: `Вы уверены, что хотите удалить комплекс для пациента "${patientName}"?`,
      confirmText: 'Удалить',
      variant: 'danger',
      onConfirm: async () => {
        try {
          await complexes.delete(complexId);
          toast.success('Комплекс успешно удален!');
          loadComplexes();
        } catch (err) {
          toast.error('Ошибка при удалении комплекса');
        }
      }
    });
  };

  // Используем formatDateNumeric из utils/dateUtils.js
  const formatDate = formatDateNumeric;

  if (error) {
    return <div className={s.errorMessage}>{error}</div>;
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
    <div className={s.myComplexesPage}>
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

      
      <div className={s.backButtonWrapper}>
        <BackButton to="/" label="На главную" />
      </div>

      <div className={s.pageHeader}>
        <div>
          <h1>
            <ClipboardList className={s.pageIcon} size={28} />
            <span>Мои комплексы</span>
          </h1>
          <p>Управление комплексами упражнений</p>
        </div>
      </div>
{/* Вкладки */}
<div className={s.tabsContainer}>
        <button 
          className={`${s.tabBtn} ${activeTab === 'complexes' ? s.active : ''}`}
          onClick={() => setActiveTab('complexes')}
        >
          <ClipboardList size={18} /> Комплексы ({complexesList.length})
        </button>
        <button 
          className={`${s.tabBtn} ${activeTab === 'templates' ? s.active : ''}`}
          onClick={() => setActiveTab('templates')}
        >
          <Folder size={18} /> Шаблоны ({templatesList.length})
        </button>
      </div>

      {/* Поиск и сортировка — только для комплексов */}
      {activeTab === 'complexes' && complexesList.length > 0 && (
        <div className={s.filtersBar}>
          <div className={s.searchBox}>
            <Search size={18} className={s.searchIcon} />
            <input
              type="text"
              placeholder="Поиск по пациенту или диагнозу..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button className={s.clearSearch} onClick={() => setSearchTerm('')}>
                <X size={16} />
              </button>
            )}
          </div>
          <div className={s.sortBox}>
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
        <div className={s.bulkActionsBar}>
          <button className={s.btnSelectAll} onClick={toggleSelectAll}>
            {selectedIds.length === complexesList.length ? (
              <><CheckSquare size={18} /> Снять выделение</>
            ) : (
              <><Square size={18} /> Выбрать все</>
            )}
          </button>
          
          {selectedIds.length > 0 && (
            <div className={s.bulkActions}>
              <span className={s.selectedCount}>Выбрано: {selectedIds.length}</span>
              <button className={s.btnBulkDelete} onClick={handleBulkDelete}>
                <Trash2 size={16} /> Удалить
              </button>
              <button className={s.btnClearSelection} onClick={clearSelection}>
                <X size={16} />
              </button>
            </div>
          )}
        </div>
      )}

      

      {loading ? (
        <div className={s.complexesGrid}>
          {Array.from({ length: 6 }).map((_, index) => (
            <ComplexCardSkeleton key={index} />
          ))}
        </div>
      ) : complexesList.length === 0 ? (
        <div className={s.emptyState}>
          <div className={s.emptyIcon}>
            <ClipboardList size={64} />
          </div>
          <h2>Комплексов пока нет</h2>
          <p>Создайте первый комплекс для пациента</p>
        </div>
      ) : (
        <div className={s.complexesGrid}>
          {paginatedComplexes.map((complex) => (
            <div key={complex.id} className={`complex-card ${selectedIds.includes(complex.id) ? 'selected' : ''}`}>
            <div 
              className={s.cardCheckbox} 
              onClick={(e) => { e.stopPropagation(); toggleSelect(complex.id); }}
            >
              {selectedIds.includes(complex.id) ? (
                <CheckSquare size={20} className={s.checked} />
              ) : (
                <Square size={20} />
              )}
            </div>
              <div className={s.complexHeader}>
                
                <div className={s.complexInfo}>
                  <h3>{complex.patient_name}</h3>
                  <p className={s.complexMeta}>
                    {complex.diagnosis_name || 'Без диагноза'}
                  </p>
                </div>
              </div>

              <div className={s.complexDetails}>
                <div className={s.detailRow}>
                  <span className={s.detailLabel}>Упражнений:</span>
                  <span className={s.detailValue}>{complex.exercises_count || 0}</span>
                </div>
                <div className={s.detailRow}>
                  <span className={s.detailLabel}>Создан:</span>
                  <span className={s.detailValue}>{formatDate(complex.created_at)}</span>
                </div>
                <div className={s.detailRow}>
                  <span className={s.detailLabel}>Выполнений:</span>
                  <span className={s.detailValue}>{complex.completions_count || 0}</span>
                </div>
              </div>

              {complex.recommendations && (
                <div className={s.complexNotes}>
                  <strong>
                    <Lightbulb size={14} style={{ display: 'inline', marginRight: '4px' }} />
                    Рекомендации:
                  </strong>
                  <p>{complex.recommendations}</p>
                </div>
              )}

<div className={s.complexActions}>
  <button
    type="button"
    className={`${s.btnProgress} ${s.btnPrimaryAction}`}
    onClick={() => handleViewProgress(complex.id)}
    title="Посмотреть прогресс пациента"
  >
    <BarChart3 size={16} />
    <span>Прогресс</span>
  </button>

  <button
    type="button"
    className={`${s.btnComposition} ${s.btnPrimaryAction}`}
    onClick={() => handleViewComposition(complex)}
    title="Посмотреть состав комплекса"
  >
    <FileText size={16} />
    <span>Состав</span>
  </button>

  <button
    type="button"
    className={`${s.btnEdit} ${s.iconBtn}`}
    onClick={() => handleEdit(complex.id)}
    title="Редактировать"
    aria-label="Редактировать"
  >
    <Edit2 size={18} />
  </button>

  <button
    type="button"
    className={`${s.btnDelete} ${s.iconBtn}`}
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
        <div className={s.pagination}>
          <button 
            className={s.paginationBtn}
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
          >
            <ChevronLeft size={18} />
          </button>
          
          {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
            <button
              key={page}
              className={`${s.paginationBtn} ${currentPage === page ? s.active : ''}`}
              onClick={() => setCurrentPage(page)}
            >
              {page}
            </button>
          ))}
          
          <button 
            className={s.paginationBtn}
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
          >
            <ChevronRight size={18} />
          </button>
        </div>
      )}

      {/* Результаты поиска */}
      {searchTerm && (
        <p className={s.searchResultsCount}>
          Найдено: {filteredComplexes.length} из {complexesList.length}
        </p>
      )}
        </>
      )}

      {/* Вкладка Шаблоны */}
      {activeTab === 'templates' && (
        <div className={s.templatesSection}>
          {templatesLoading ? (
            <div className={s.templatesGrid}>
              {Array.from({ length: 6 }).map((_, index) => (
                <TemplateCardSkeleton key={index} />
              ))}
            </div>
          ) : templatesList.length === 0 ? (
            <div className={s.emptyState}>
              <div className={s.emptyIcon}>
                <Folder size={64} />
              </div>
              <h2>Шаблонов пока нет</h2>
              <p>Создайте комплекс и сохраните его как шаблон</p>
            </div>
          ) : (
            <div className={s.templatesGrid}>
              {templatesList.map(template => (
                <div key={template.id} className={s.templateCard}>
                  <div className={s.templateHeader}>
                    <Folder size={24} className={s.templateIcon} />
                    <div className={s.templateInfo}>
                      <h3>{template.name}</h3>
                      {template.description && <p>{template.description}</p>}
                    </div>
                  </div>
                  <div className={s.templateMeta}>
                    <span>{template.exercises_count} упражнений</span>
                    {template.diagnosis_name && <span>• {template.diagnosis_name}</span>}
                  </div>
                  <div className={s.templateActions}>
  <button
    className={`${s.btnView} ${s.iconBtn}`}
    onClick={() => handleViewTemplate(template)}
    title="Просмотр"
    aria-label="Просмотр"
    type="button"
  >
    <Eye size={18} />
  </button>

  <button
    className={`${s.btnEdit} ${s.iconBtn}`}
    onClick={() => handleEditTemplate(template)}
    title="Редактировать"
    aria-label="Редактировать"
    type="button"
  >
    <Edit2 size={18} />
  </button>

  <button
    className={`${s.btnDelete} ${s.iconBtn}`}
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
        <div className={s.modalOverlay} {...compositionOverlayProps}>
          <div className={s.modalContent}>
            <div className={s.modalHeader}>
              <h2>
                <FileText size={24} style={{ display: 'inline', marginRight: '8px', verticalAlign: 'middle' }} />
                Состав комплекса: {selectedComplex.patient_name}
              </h2>
              <button className={s.modalClose} onClick={() => setShowCompositionModal(false)}>
                <X size={20} />
              </button>
            </div>

            <div className={s.modalBody}>
              <div className={s.complexInfoBlock}>
                <div className={s.infoRow}>
                  <span className={s.infoLabel}>Диагноз:</span>
                  <span className={s.infoValue}>{selectedComplex.diagnosis_name || 'Не указан'}</span>
                </div>
                <div className={s.infoRow}>
                  <span className={s.infoLabel}>Создан:</span>
                  <span className={s.infoValue}>{formatDate(selectedComplex.created_at)}</span>
                </div>
                <div className={s.infoRow}>
                  <span className={s.infoLabel}>Всего упражнений:</span>
                  <span className={s.infoValue}>{complexExercises.length}</span>
                </div>
              </div>

              {selectedComplex.recommendations && (
                <div className={s.recommendationsBlock}>
                  <strong>
                    <Lightbulb size={16} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle' }} />
                    Рекомендации:
                  </strong>
                  <p>{selectedComplex.recommendations}</p>
                </div>
              )}

              <div className={s.exercisesListModal}>
                <h3>Упражнения:</h3>
                {complexExercises.length === 0 ? (
                  <p className={s.emptyText}>Нет упражнений в комплексе</p>
                ) : (
                  complexExercises.map((ex, index) => (
                    <div key={ex.exercise_id} className={s.exerciseItemModal}>
                      <div className={s.exerciseNumber}>{index + 1}</div>
                      <div className={s.exerciseDetailsModal}>
                        <h4>{ex.exercise_title}</h4>
                        <p className={s.exerciseDescription}>{ex.exercise_description}</p>
                        <div className={s.exerciseParamsModal}>
                          <span className={s.paramBadge}>
                            <strong>Подходы:</strong> {ex.sets || '-'}
                          </span>
                          <span className={s.paramBadge}>
                            <strong>Повторения:</strong> {ex.reps || '-'}
                          </span>
                          <span className={s.paramBadge}>
                            <strong>Длительность:</strong> {ex.duration ? `${ex.duration} сек` : '-'}
                          </span>
                        </div>
                        {ex.notes && (
                          <div className={s.exerciseNotes}>
                            <strong>📝 Примечание:</strong> {ex.notes}
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className={s.modalFooter}>
              <button className={s.btnSecondary} onClick={() => setShowCompositionModal(false)}>
                Закрыть
              </button>
              <button 
                className={s.btnPrimary} 
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

      {/* Confirm Modal */}
      <ConfirmModal {...confirmState} onClose={closeConfirm} />
    </div>
  );
}

export default MyComplexes;
