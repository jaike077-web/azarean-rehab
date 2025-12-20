import React, { useState, useEffect } from 'react';
import { diagnoses } from '../services/api';
import { useToast } from '../context/ToastContext';
import {
  FileText,
  Plus,
  Edit2,
  Trash2,
  Search,
  X,
  AlertTriangle,
  BookOpen,
  CheckCircle
} from 'lucide-react';
import { PatientsPageSkeleton } from '../components/Skeleton';
import './Diagnoses.css';

function Diagnoses() {
  const [diagnosesList, setDiagnosesList] = useState([]);
  const [filteredDiagnoses, setFilteredDiagnoses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Модалки
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [selectedDiagnosis, setSelectedDiagnosis] = useState(null);
  
  // Форма
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    recommendations: '',
    warnings: ''
  });
  const [formErrors, setFormErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  
  const toast = useToast();

  // Загрузка диагнозов
  useEffect(() => {
    loadDiagnoses();
  }, []);

  // Фильтрация при поиске
  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredDiagnoses(diagnosesList);
    } else {
      const query = searchQuery.toLowerCase();
      const filtered = diagnosesList.filter(d =>
        d.name.toLowerCase().includes(query) ||
        (d.description && d.description.toLowerCase().includes(query))
      );
      setFilteredDiagnoses(filtered);
    }
  }, [searchQuery, diagnosesList]);

  const loadDiagnoses = async () => {
    try {
      setLoading(true);
      const response = await diagnoses.getAll();
      const data = response.data?.diagnoses || response.diagnoses || [];
      setDiagnosesList(data);
      setFilteredDiagnoses(data);
    } catch (error) {
      console.error('Ошибка загрузки диагнозов:', error);
      toast.error('Не удалось загрузить диагнозы');
      setDiagnosesList([]);
      setFilteredDiagnoses([]);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenAddModal = () => {
    setFormData({
      name: '',
      description: '',
      recommendations: 'Выполняйте упражнения регулярно 3-4 раза в неделю. Соблюдайте технику выполнения.',
      warnings: 'При усилении боли прекратите выполнение упражнений и обратитесь к врачу.'
    });
    setFormErrors({});
    setShowAddModal(true);
  };

  const handleOpenEditModal = (diagnosis) => {
    setSelectedDiagnosis(diagnosis);
    setFormData({
      name: diagnosis.name || '',
      description: diagnosis.description || '',
      recommendations: diagnosis.recommendations || '',
      warnings: diagnosis.warnings || ''
    });
    setFormErrors({});
    setShowEditModal(true);
  };

  const handleOpenViewModal = (diagnosis) => {
    setSelectedDiagnosis(diagnosis);
    setShowViewModal(true);
  };

  const handleCloseModals = () => {
    setShowAddModal(false);
    setShowEditModal(false);
    setShowViewModal(false);
    setSelectedDiagnosis(null);
    setFormData({ name: '', description: '', recommendations: '', warnings: '' });
    setFormErrors({});
  };

  const validateForm = () => {
    const errors = {};
    
    if (!formData.name.trim()) {
      errors.name = 'Название обязательно';
    }
    
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    setSubmitting(true);

    try {
      if (showEditModal && selectedDiagnosis) {
        await diagnoses.update(selectedDiagnosis.id, formData);
        toast.success('Диагноз успешно обновлен');
      } else {
        await diagnoses.create(formData);
        toast.success('Диагноз успешно добавлен');
      }
      
      handleCloseModals();
      loadDiagnoses();
    } catch (error) {
      console.error('Ошибка сохранения:', error);
      toast.error(error.response?.data?.message || 'Ошибка при сохранении диагноза');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Удалить диагноз "${name}"?`)) {
      return;
    }

    try {
      await diagnoses.delete(id);
      toast.success('Диагноз удален');
      loadDiagnoses();
    } catch (error) {
      console.error('Ошибка удаления:', error);
      toast.error(error.response?.data?.message || 'Не удалось удалить диагноз');
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    // Очистка ошибки при изменении
    if (formErrors[name]) {
      setFormErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  if (loading) {
    return <PatientsPageSkeleton count={6} />;
  }

  return (
    <div className="diagnoses-page">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1>
            <FileText className="page-icon" size={28} />
            Диагнозы
          </h1>
          <p className="page-subtitle">Управление диагнозами и патологиями</p>
        </div>
      </div>

      {/* Add Button */}
      <button className="btn-add-diagnosis" onClick={handleOpenAddModal}>
        <Plus size={20} />
        Добавить диагноз
      </button>

      {/* Search */}
      <div className="search-box">
        <Search className="search-icon" size={20} />
        <input
          type="text"
          className="search-input"
          placeholder="Поиск по названию или описанию..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {searchQuery && (
          <button className="clear-search" onClick={() => setSearchQuery('')}>
            <X size={16} />
          </button>
        )}
      </div>

      {/* Results count */}
      <p className="results-count">
        Найдено: <strong>{filteredDiagnoses.length}</strong> из {diagnosesList.length}
      </p>

      {/* Grid */}
      {filteredDiagnoses.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📋</div>
          <h2>Нет диагнозов</h2>
          <p>
            {searchQuery
              ? 'По вашему запросу ничего не найдено'
              : 'Добавьте первый диагноз, нажав кнопку выше'}
          </p>
        </div>
      ) : (
        <div className="diagnoses-grid">
          {filteredDiagnoses.map((diagnosis) => (
            <div
              key={diagnosis.id}
              className="diagnosis-card"
              onClick={() => handleOpenViewModal(diagnosis)}
            >
              <div className="card-header">
                <h3>{diagnosis.name}</h3>
              </div>

              {diagnosis.description && (
                <p className="diagnosis-description">
                  {diagnosis.description.length > 120
                    ? `${diagnosis.description.substring(0, 120)}...`
                    : diagnosis.description}
                </p>
              )}

              <div className="card-actions" onClick={(e) => e.stopPropagation()}>
                <button
                  className="btn-card-action btn-edit"
                  onClick={() => handleOpenEditModal(diagnosis)}
                  title="Редактировать"
                >
                  <Edit2 size={16} />
                  <span>Редактировать</span>
                </button>
                <button
                  className="btn-card-action btn-delete"
                  onClick={() => handleDelete(diagnosis.id, diagnosis.name)}
                  title="Удалить"
                >
                  <Trash2 size={16} />
                  <span>Удалить</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal: Add/Edit Diagnosis */}
      {(showAddModal || showEditModal) && (
        <div className="modal-overlay" onClick={handleCloseModals}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>
                <FileText size={24} />
                {showEditModal ? 'Редактировать диагноз' : 'Добавить диагноз'}
              </h2>
              <button className="modal-close" onClick={handleCloseModals}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="modal-body">
              {/* Название */}
              <div className="form-group">
                <label htmlFor="name">
                  Название диагноза <span className="required">*</span>
                </label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  className={formErrors.name ? 'input-error' : ''}
                  placeholder="Грыжа межпозвоночного диска L5-S1"
                />
                {formErrors.name && (
                  <span className="field-error">{formErrors.name}</span>
                )}
              </div>

              {/* Описание */}
              <div className="form-group">
                <label htmlFor="description">Описание</label>
                <textarea
                  id="description"
                  name="description"
                  value={formData.description}
                  onChange={handleInputChange}
                  rows="3"
                  placeholder="Подробное описание диагноза, его особенности..."
                />
              </div>

              {/* Рекомендации */}
              <div className="form-group">
                <label htmlFor="recommendations">Рекомендации</label>
                <textarea
                  id="recommendations"
                  name="recommendations"
                  value={formData.recommendations}
                  onChange={handleInputChange}
                  rows="4"
                  placeholder="Рекомендации по выполнению упражнений..."
                />
              </div>

              {/* Предостережения */}
              <div className="form-group">
                <label htmlFor="warnings">Предостережения</label>
                <textarea
                  id="warnings"
                  name="warnings"
                  value={formData.warnings}
                  onChange={handleInputChange}
                  rows="4"
                  placeholder="Предостережения и ограничения..."
                />
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-cancel"
                  onClick={handleCloseModals}
                  disabled={submitting}
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="btn-save"
                  disabled={submitting}
                >
                  {submitting ? 'Сохранение...' : 'Сохранить'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: View Diagnosis */}
      {showViewModal && selectedDiagnosis && (
        <div className="modal-overlay" onClick={handleCloseModals}>
          <div className="modal-content modal-view" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>
                <FileText size={24} />
                {selectedDiagnosis.name}
              </h2>
              <button className="modal-close" onClick={handleCloseModals}>
                <X size={20} />
              </button>
            </div>

            <div className="modal-body">
              {/* Описание */}
              {selectedDiagnosis.description && (
                <div className="view-section">
                  <h3>
                    <BookOpen size={18} />
                    Описание
                  </h3>
                  <p className="view-text">{selectedDiagnosis.description}</p>
                </div>
              )}

              {/* Рекомендации */}
              {selectedDiagnosis.recommendations && (
                <div className="view-section">
                  <h3>
                    <CheckCircle size={18} />
                    Рекомендации
                  </h3>
                  <p className="view-text">{selectedDiagnosis.recommendations}</p>
                </div>
              )}

              {/* Предостережения */}
              {selectedDiagnosis.warnings && (
                <div className="view-section warning-section">
                  <h3>
                    <AlertTriangle size={18} />
                    Предостережения
                  </h3>
                  <p className="view-text">{selectedDiagnosis.warnings}</p>
                </div>
              )}

              <div className="modal-actions">
                <button
                  className="btn-edit-full"
                  onClick={() => {
                    setShowViewModal(false);
                    handleOpenEditModal(selectedDiagnosis);
                  }}
                >
                  <Edit2 size={18} />
                  Редактировать
                </button>
                <button className="btn-close-modal" onClick={handleCloseModals}>
                  Закрыть
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Diagnoses;
