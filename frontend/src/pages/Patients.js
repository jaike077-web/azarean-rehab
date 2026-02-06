import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { patients } from '../services/api';
import { formatDateNumeric } from '../utils/dateUtils';
import BackButton from '../components/BackButton';
import Breadcrumbs from '../components/Breadcrumbs';
import ConfirmModal from '../components/ConfirmModal';
import useConfirm from '../hooks/useConfirm';
import './Patients.css';
import { useToast } from '../context/ToastContext';
import { PatientsPageSkeleton } from '../components/Skeleton';

import {
  Users,
  UserPlus,
  Search,
  AlertTriangle,
  ClipboardList,
  BarChart3,
  Edit2,
  Trash2,
  Eye,
  LayoutDashboard,
  LayoutGrid,
  List as ListIcon,
} from 'lucide-react';

function Patients() {
  const toast = useToast();
  const navigate = useNavigate();
  const { confirmState, confirm, closeConfirm } = useConfirm();
  const [patientsList, setPatientsList] = useState([]);
  const [loading, setLoading] = useState(true);

  const [showModal, setShowModal] = useState(false);
  const [editingPatient, setEditingPatient] = useState(null);

  const [showComplexesModal, setShowComplexesModal] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [patientComplexes, setPatientComplexes] = useState([]);

  // UI состояния
  const [viewMode, setViewMode] = useState('grid'); // 'grid' или 'list'
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('date'); // 'date', 'name'

  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    phone: '',
    birth_date: '',
    diagnosis: '',
    notes: '',
  });

  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({
    full_name: '',
    email: '',
    phone: '',
    birth_date: '',
  });

  useEffect(() => {
    loadPatients();
  }, []);

  // Автоматическое переключение на grid для мобильных
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth <= 768) {
        setViewMode('grid');
      }
    };

    handleResize(); // проверяем при загрузке
    window.addEventListener('resize', handleResize);

    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const loadPatients = async () => {
    try {
      setLoading(true);
      const response = await patients.getAll();
      setPatientsList(response.data.patients || []);
    } catch (err) {
      console.error('Ошибка загрузки пациентов:', err);
      setError('Не удалось загрузить список пациентов');
    } finally {
      setLoading(false);
    }
  };

  // Мемоизированная фильтрация и сортировка пациентов
  const filteredPatients = useMemo(() => {
    let filtered = [...patientsList];

    // Поиск
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((patient) => {
        const name = (patient.full_name || '').toLowerCase();
        const email = (patient.email || '').toLowerCase();
        const phone = (patient.phone || '').toLowerCase();
        return (
          name.includes(query) ||
          (email && email.includes(query)) ||
          (phone && phone.includes(query))
        );
      });
    }

    // Сортировка
    if (sortBy === 'name') {
      filtered.sort((a, b) =>
        (a.full_name || '').localeCompare(b.full_name || '')
      );
    } else if (sortBy === 'date') {
      filtered.sort(
        (a, b) =>
          new Date(b.created_at || 0).getTime() -
          new Date(a.created_at || 0).getTime()
      );
    }

    return filtered;
  }, [patientsList, searchQuery, sortBy]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const validateForm = () => {
    const errors = {
      full_name: '',
      email: '',
      phone: '',
      birth_date: '',
    };
    let isValid = true;

    // Проверка ФИО
    if (formData.full_name.trim().length === 0) {
      errors.full_name = 'ФИО обязательно для заполнения';
      isValid = false;
    }

    // Проверка email (если заполнен)
    if (formData.email && formData.email.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(formData.email)) {
        errors.email = 'Некорректный формат email';
        isValid = false;
      }
    }

    // Проверка телефона (если заполнен)
    if (formData.phone && formData.phone.trim()) {
      const digitsOnly = formData.phone.replace(/\D/g, '');
      if (digitsOnly.length < 10 || digitsOnly.length > 15) {
        errors.phone = 'Телефон должен содержать от 10 до 15 цифр';
        isValid = false;
      }
    }

    // Проверка даты рождения (если заполнена)
    if (formData.birth_date && formData.birth_date.trim()) {
      const birthDate = new Date(formData.birth_date);
      const today = new Date();
      
      // Проверяем что дата валидна
      if (isNaN(birthDate.getTime())) {
        errors.birth_date = 'Введите корректную дату';
        isValid = false;
      } else {
        const age =
          (today.getTime() - birthDate.getTime()) /
          (1000 * 60 * 60 * 24 * 365);

        if (age < 0) {
          errors.birth_date = 'Дата рождения не может быть в будущем';
          isValid = false;
        } else if (age > 120) {
          errors.birth_date = 'Проверьте корректность даты рождения';
          isValid = false;
        }
      }
    }

    setFieldErrors(errors);
    return isValid;
  };

  const handleOpenAddModal = () => {
    setEditingPatient(null);
    setFormData({
      full_name: '',
      email: '',
      phone: '',
      birth_date: '',
      diagnosis: '',
      notes: '',
    });
    setError('');
    setFieldErrors({ full_name: '', email: '', phone: '', birth_date: '' });
    setShowModal(true);
  };

  const handleOpenEditModal = (patient) => {
    setEditingPatient(patient);
    setFormData({
      full_name: patient.full_name || '',
      email: patient.email || '',
      phone: patient.phone || '',
      birth_date: patient.birth_date
        ? patient.birth_date.split('T')[0]
        : '',
        diagnosis: patient.diagnosis || '',
      notes: patient.notes || '',
    });
    setError('');
    setFieldErrors({ full_name: '', email: '', phone: '', birth_date: '' });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setFieldErrors({ full_name: '', email: '', phone: '', birth_date: '' });

    if (!validateForm()) {
      return;
    }

    try {
      if (editingPatient) {
        await patients.update(editingPatient.id, formData);
        toast.success('Данные пациента обновлены! ✓');
      } else {
        await patients.create(formData);
        toast.success('Пациент добавлен! ✓');
      }

      setShowModal(false);
      setEditingPatient(null);
      setFormData({
        full_name: '',
        email: '',
        phone: '',
        birth_date: '',
        notes: '',
      });
      loadPatients();
    } catch (err) {
      console.error('Ошибка при сохранении пациента:', err);
      
      // Пытаемся извлечь конкретную ошибку от сервера
      const serverError = err.response?.data?.message || err.response?.data?.error;
      
      if (serverError) {
        setError(serverError);
      } else {
        setError('Ошибка при сохранении данных. Проверьте правильность заполнения всех полей.');
      }
      
      toast.error('Не удалось сохранить данные пациента');
    }
  };

  const handleViewComplexes = async (patient) => {
    try {
      setSelectedPatient(patient);
      const response = await patients.getOne(patient.id);
      setPatientComplexes(response.data.complexes || []);
      setShowComplexesModal(true);
    } catch (err) {
      console.error('Ошибка загрузки комплексов:', err);
      toast.error('Ошибка при загрузке комплексов пациента');
    }
  };

  const handleDelete = (patientId, patientName) => {
    confirm({
      title: 'Удалить пациента?',
      message: `Вы уверены, что хотите удалить пациента "${patientName}"? Все комплексы этого пациента также будут удалены.`,
      confirmText: 'Удалить',
      variant: 'danger',
      onConfirm: async () => {
        try {
          await patients.delete(patientId);
          toast.success('Пациент успешно удален!');
          loadPatients();
        } catch (err) {
          toast.error('Ошибка при удалении пациента');
        }
      }
    });
  };

  // Используем formatDateNumeric из utils/dateUtils.js
  const formatDate = formatDateNumeric;

  const calculateAge = (dateString) => {
    if (!dateString) return null;
    const birthDate = new Date(dateString);
    if (Number.isNaN(birthDate.getTime())) return null;

    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    
    // Если день рождения ещё не наступил в этом году
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }

    return age;
  };

  if (loading) {
    return <PatientsPageSkeleton count={6} />;
  }

  return (
    <div className="patients-page">
      <Breadcrumbs
  items={[
    {
      icon: <LayoutDashboard size={16} />,
      label: 'Главная',
      path: '/dashboard?home=1',
    },
    {
      icon: <Users size={16} />,
      label: 'Пациенты',
    },
  ]}
/>

<div className="back-button-wrapper">
  <BackButton to="/dashboard?home=1" label="На главную" />
</div>


      <div className="page-header">
        <div>
          <h1>
            <Users className="page-icon" size={22} />
            <span>Пациенты</span>
          </h1>
          <p>Управление списком пациентов</p>
        </div>
        <button className="btn-primary" onClick={handleOpenAddModal}>
          <UserPlus className="btn-icon" size={18} />
          <span>Добавить пациента</span>
        </button>
      </div>

      {patientsList.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">
            <Users size={32} />
          </div>
          <h2>Пока нет пациентов</h2>
          <p>Добавьте первого пациента, чтобы начать работу</p>
          <button className="btn-primary" onClick={handleOpenAddModal}>
            <UserPlus className="btn-icon" size={18} />
            <span>Добавить пациента</span>
          </button>
        </div>
      ) : (
        <>
          {/* Панель управления: поиск, сортировка, вид */}
          <div className="patients-controls">
            <div className="search-box">
              <Search className="search-icon" size={18} />
              <input
                type="text"
                placeholder="Поиск по имени, email, телефону..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="search-input"
              />
              {searchQuery && (
                <button
                  className="clear-search"
                  onClick={() => setSearchQuery('')}
                >
                  ✕
                </button>
              )}
            </div>

            <div className="controls-group">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="sort-select"
              >
                <option value="date">Сортировка: По дате</option>
                <option value="name">Сортировка: По имени</option>
              </select>

              <div className="view-toggle">
                <button
                  className={`view-btn ${
                    viewMode === 'grid' ? 'active' : ''
                  }`}
                  onClick={() => setViewMode('grid')}
                  title="Сетка"
                >
                  <LayoutGrid size={18} />
                </button>
                <button
                  className={`view-btn ${
                    viewMode === 'list' ? 'active' : ''
                  }`}
                  onClick={() => setViewMode('list')}
                  title="Список"
                >
                  <ListIcon size={18} />
                </button>
              </div>
            </div>
          </div>

          {/* Результаты поиска */}
          {searchQuery && (
            <div className="search-results-info">
              Найдено: {filteredPatients.length} из {patientsList.length}
            </div>
          )}

          {filteredPatients.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">
                <Search size={32} />
              </div>
              <h2>Ничего не найдено</h2>
              <p>Попробуйте изменить параметры поиска</p>
              <button
                className="btn-secondary"
                onClick={() => setSearchQuery('')}
              >
                Очистить поиск
              </button>
            </div>
          ) : (
            <div
              className={
                viewMode === 'grid' ? 'patients-grid' : 'patients-list'
              }
              style={
                viewMode === 'list'
                  ? {
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px',
                    }
                  : {}
              }
            >
              {filteredPatients.map((patient) => (
                  <div
                    key={patient.id}
                    className={
                      viewMode === 'grid' ? 'patient-card' : 'patient-row'
                    }
                    style={
                      viewMode === 'list'
                        ? {
                            display: 'flex',
                            alignItems: 'center',
                            gap: '24px',
                          }
                        : {}
                    }
                  >
                    <div className="patient-header">
                      
                      <div className="patient-info">
                        <h3 className="patient-name">
                          {patient.full_name || 'Без имени'}
                        </h3>
                        
                      </div>
                    </div>

                    <div className="patient-details">
  {/* 1️⃣ ДАТА РОЖДЕНИЯ */}
  <div className="detail-row">
    <span className="detail-label">Дата рождения:</span>
    <span className="detail-value">
      {formatDate(patient.birth_date)}
      {calculateAge(patient.birth_date) !== null && (
        <span style={{ color: '#718096', fontWeight: 400, marginLeft: '6px' }}>
          ({calculateAge(patient.birth_date)}{' '}
          {calculateAge(patient.birth_date) === 1
            ? 'год'
            : calculateAge(patient.birth_date) >= 2 &&
              calculateAge(patient.birth_date) <= 4
            ? 'года'
            : 'лет'})
        </span>
      )}
    </span>
  </div>

  {/* 2️⃣ ДИАГНОЗ - ОТДЕЛЬНЫЙ БЛОК */}
  {patient.diagnosis && (
    <div className="detail-row">
      <span className="detail-label">Диагноз:</span>
      <span className="detail-value">{patient.diagnosis}</span>
    </div>
  )}

  {/* 3️⃣ КОМПЛЕКСОВ */}
  <div className="detail-row">
    <span className="detail-label">Комплексов:</span>
    <span className="detail-value">
      {patient.complexes_count || 0}
    </span>
  </div>

  {/* 4️⃣ ЗАМЕТКИ */}
  {patient.notes && viewMode === 'grid' && (
    <div className="patient-notes">
      <span className="detail-label">Заметки:</span>
      <p>{patient.notes}</p>
    </div>
  )}
</div>

                    <div className="patient-actions">
                      <button
                        className="btn-secondary"
                        onClick={() => handleViewComplexes(patient)}
                      >
                        <ClipboardList className="btn-icon" size={16} />
                        <span>Комплексы</span>
                      </button>
                      <button
                        className="btn-secondary"
                        onClick={(event) => {
                          event.stopPropagation();
                          navigate(`/patient-progress/${patient.id}`);
                        }}
                      >
                        <BarChart3 className="btn-icon" size={16} />
                        <span>Прогресс</span>
                      </button>
                      <button
                        className="btn-secondary"
                        onClick={() => handleOpenEditModal(patient)}
                      >
                        <Edit2 className="btn-icon" size={16} />
                        <span>Редактировать</span>
                      </button>
                      <button
                        className="btn-delete"
                        onClick={() =>
                          handleDelete(patient.id, patient.full_name)
                        }
                        title="Удалить пациента"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </>
      )}

      {/* Модальное окно добавления/редактирования */}
      {showModal && (
        <div
          className="modal-overlay"
          onClick={() => setShowModal(false)}
        >
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h2>
                {editingPatient ? (
                  <>
                    <Edit2 className="page-icon" size={20} />
                    <span>Редактировать пациента</span>
                  </>
                ) : (
                  <>
                    <UserPlus className="page-icon" size={20} />
                    <span>Добавить пациента</span>
                  </>
                )}
              </h2>
              <button
                className="modal-close"
                onClick={() => setShowModal(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="modal-form">
              {error && (
                <div className="error-message">
                  <AlertTriangle className="error-icon" size={16} />
                  <span>{error}</span>
                </div>
              )}

              <div className="form-group">
                <label htmlFor="full_name">ФИО *</label>
                <input
                  type="text"
                  id="full_name"
                  name="full_name"
                  value={formData.full_name}
                  onChange={handleInputChange}
                  placeholder="Иванов Иван Иванович"
                  required
                  autoFocus
                  className={fieldErrors.full_name ? 'input-error' : ''}
                />
                {fieldErrors.full_name && (
                  <span className="field-error">{fieldErrors.full_name}</span>
                )}
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="email">Email</label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    placeholder="ivan@mail.ru"
                    className={fieldErrors.email ? 'input-error' : ''}
                  />
                  {fieldErrors.email && (
                    <span className="field-error">{fieldErrors.email}</span>
                  )}
                </div>

                <div className="form-group">
                  <label htmlFor="phone">Телефон</label>
                  <input
                    type="tel"
                    id="phone"
                    name="phone"
                    value={formData.phone}
                    onChange={handleInputChange}
                    placeholder="+7 (900) 123-45-67"
                    className={fieldErrors.phone ? 'input-error' : ''}
                  />
                  {fieldErrors.phone ? (
                    <span className="field-error">{fieldErrors.phone}</span>
                  ) : (
                    <small
                      style={{
                        fontSize: '12px',
                        color: '#718096',
                        marginTop: '4px',
                        display: 'block',
                      }}
                    >
                      От 10 до 15 цифр
                    </small>
                  )}
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="birth_date">Дата рождения</label>
                <input
                  type="date"
                  id="birth_date"
                  name="birth_date"
                  value={formData.birth_date}
                  onChange={handleInputChange}
                  className={fieldErrors.birth_date ? 'input-error' : ''}
                />
                {fieldErrors.birth_date && (
                  <span className="field-error">{fieldErrors.birth_date}</span>
                )}
              </div>

              <div className="form-group">
  <label htmlFor="diagnosis">Диагноз или проблема</label>
  <input
    type="text"
    id="diagnosis"
    name="diagnosis"
    value={formData.diagnosis}
    onChange={handleInputChange}
    placeholder="Грыжа межпозвоночного диска, Боль в пояснице..."
  />
</div>

              <div className="form-group">
                <label htmlFor="notes">Заметки</label>
                <textarea
                  id="notes"
                  name="notes"
                  value={formData.notes}
                  onChange={handleInputChange}
                  placeholder="Жалобы, особенности, противопоказания..."
                  rows="4"
                />
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowModal(false)}
                >
                  Отмена
                </button>
                <button type="submit" className="btn-primary">
                  {editingPatient
                    ? 'Сохранить изменения'
                    : 'Добавить пациента'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Модальное окно комплексов пациента */}
      {showComplexesModal && selectedPatient && (
        <div
          className="modal-overlay"
          onClick={() => setShowComplexesModal(false)}
        >
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h2>
                <ClipboardList className="page-icon" size={20} />
                <span>Комплексы: {selectedPatient.full_name}</span>
              </h2>
              <button
                className="modal-close"
                onClick={() => setShowComplexesModal(false)}
              >
                ✕
              </button>
            </div>

            <div className="modal-form">
              {patientComplexes.length === 0 ? (
                <div
                  className="empty-state"
                  style={{ padding: '40px 20px' }}
                >
                  <div
                    className="empty-icon"
                    style={{ fontSize: '48px' }}
                  >
                    <ClipboardList size={32} />
                  </div>
                  <p>У этого пациента пока нет комплексов</p>
                </div>
              ) : (
                <div className="complexes-list">
                  {patientComplexes.map((complex) => (
                    <div
                      key={complex.id}
                      className="complex-item clickable"
                      onClick={() => {
                        window.open(
                          `/progress/${complex.id}`,
                          '_blank'
                        );
                      }}
                    >
                      <div className="complex-item-header">
                        <h4>
                          {complex.diagnosis_name || 'Без диагноза'}
                        </h4>
                        <span className="complex-date">
                          {formatDate(complex.created_at)}
                        </span>
                      </div>
                      <div className="complex-item-details">
                        <span>
                          Упражнений:{' '}
                          {complex.exercises_count || 0}
                        </span>
                        <span className="view-progress-hint">
                          <Eye
                            size={16}
                            style={{ marginRight: 6 }}
                          />
                          Посмотреть прогресс →
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Confirm Modal */}
      <ConfirmModal {...confirmState} onClose={closeConfirm} />
    </div>
  );
}

export default Patients;
