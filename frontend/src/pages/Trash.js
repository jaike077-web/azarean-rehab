import React, { useState, useEffect } from 'react';
import { patients, complexes } from '../services/api';
import './Trash.css';
import BackButton from '../components/BackButton';
import Breadcrumbs from '../components/Breadcrumbs';
import { useToast } from '../context/ToastContext';
import {
  FileText,
  LayoutDashboard,
  RotateCcw,
  Trash2,
  UserX
} from 'lucide-react';
import { TableSkeleton } from '../components/Skeleton';


function Trash() {
  const toast = useToast();
  const [deletedPatients, setDeletedPatients] = useState([]);
  const [deletedComplexes, setDeletedComplexes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('patients');

  useEffect(() => {
    loadTrash();
  }, []);

  const loadTrash = async () => {
    try {
      setLoading(true);
      const [patientsRes, complexesRes] = await Promise.all([
        patients.getTrash(),
        complexes.getTrash()
      ]);
      setDeletedPatients(patientsRes.data.patients);
      setDeletedComplexes(complexesRes.data.complexes);
    } catch (err) {
      console.error('Ошибка загрузки корзины:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRestorePatient = async (patientId, patientName) => {
    const confirmed = window.confirm(
      `Восстановить пациента "${patientName}"?`
    );
    if (!confirmed) return;

    try {
      await patients.restore(patientId);
      toast.success('Пациент восстановлен');
      loadTrash();
    } catch (err) {
      console.error('Ошибка восстановления:', err);
      toast.error('Ошибка при восстановлении');
    }
  };

  const handleDeletePatientPermanent = async (patientId, patientName) => {
    const confirmed = window.confirm(
      `ВНИМАНИЕ! Вы собираетесь НАВСЕГДА удалить пациента "${patientName}".\n\nВсе связанные комплексы и прогресс будут удалены БЕЗВОЗВРАТНО!\n\nПродолжить?`
    );
    if (!confirmed) return;

    const doubleConfirm = window.confirm(
      `Вы уверены? Это действие НЕЛЬЗЯ отменить!`
    );
    if (!doubleConfirm) return;

    try {
      await patients.deletePermanent(patientId);
      toast.success('Пациент удалён навсегда');
      loadTrash();
    } catch (err) {
      console.error('Ошибка удаления:', err);
      toast.error('Ошибка при удалении');
    }
  };

  const handleRestoreComplex = async (complexId, patientName) => {
    const confirmed = window.confirm(
      `Восстановить комплекс для пациента "${patientName}"?`
    );
    if (!confirmed) return;

    try {
      await complexes.restore(complexId);
      toast.success('Комплекс восстановлен');
      loadTrash();
    } catch (err) {
      console.error('Ошибка восстановления:', err);
      toast.error('Ошибка при восстановлении');
    }
  };

  const handleDeleteComplexPermanent = async (complexId, patientName) => {
    const confirmed = window.confirm(
      `ВНИМАНИЕ! Вы собираетесь НАВСЕГДА удалить комплекс для "${patientName}".\n\nВесь прогресс будет удалён БЕЗВОЗВРАТНО!\n\nПродолжить?`
    );
    if (!confirmed) return;

    try {
      await complexes.deletePermanent(complexId);
      toast.success('Комплекс удалён навсегда');
      loadTrash();
    } catch (err) {
      console.error('Ошибка удаления:', err);
      toast.error('Ошибка при удалении');
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

  if (loading) {
    return <TableSkeleton rows={5} columns={4} />;
  }

  return (
    <div className="trash-page">
      <Breadcrumbs
        items={[
          {
            icon: <LayoutDashboard size={16} />,
            label: 'Главная',
            path: '/dashboard'
          },
          {
            icon: <Trash2 size={16} />,
            label: 'Корзина'
          }
        ]}
      />

      
      <BackButton to="/" label="На главную" />

      <div className="page-header">
        <div>
          <h1>
            <Trash2 size={28} />
            Корзина
          </h1>
          <p>Удалённые пациенты и комплексы</p>
        </div>
      </div>

      <div className="trash-tabs">
        <button 
          className={`tab-btn ${activeTab === 'patients' ? 'active' : ''}`}
          onClick={() => setActiveTab('patients')}
        >
          <UserX size={16} />
          Пациенты ({deletedPatients.length})
        </button>
        <button 
          className={`tab-btn ${activeTab === 'complexes' ? 'active' : ''}`}
          onClick={() => setActiveTab('complexes')}
        >
          <FileText size={16} />
          Комплексы ({deletedComplexes.length})
        </button>
      </div>

      {activeTab === 'patients' && (
        <>
          {deletedPatients.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">
                <UserX size={56} />
              </div>
              <h2>Корзина пуста</h2>
              <p>Нет удалённых пациентов</p>
            </div>
          ) : (
            <div className="trash-grid">
              {deletedPatients.map((patient) => (
                <div key={patient.id} className="trash-item">
                  <div className="item-icon">
                    <UserX size={24} />
                  </div>
                  <div className="item-info">
                    <h4>{patient.full_name}</h4>
                    <p className="deleted-date">
                      Удалён: {formatDate(patient.updated_at)}
                    </p>
                    <div className="trash-details">
                      <div className="detail-row">
                        <span className="detail-label">Email:</span>
                        <span className="detail-value">
                          {patient.email || 'Не указан'}
                        </span>
                      </div>
                      <div className="detail-row">
                        <span className="detail-label">Телефон:</span>
                        <span className="detail-value">
                          {patient.phone || 'Не указан'}
                        </span>
                      </div>
                      <div className="detail-row">
                        <span className="detail-label">Комплексов:</span>
                        <span className="detail-value">
                          {patient.complexes_count || 0}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="item-actions">
                    <button 
                      className="btn-restore"
                      onClick={() => handleRestorePatient(patient.id, patient.full_name)}
                    >
                      <RotateCcw size={16} />
                      Восстановить
                    </button>
                    <button 
                      className="btn-delete-permanent"
                      onClick={() => handleDeletePatientPermanent(patient.id, patient.full_name)}
                    >
                      <Trash2 size={16} />
                      Удалить навсегда
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {activeTab === 'complexes' && (
        <>
          {deletedComplexes.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">
                <FileText size={56} />
              </div>
              <h2>Корзина пуста</h2>
              <p>Нет удалённых комплексов</p>
            </div>
          ) : (
            <div className="trash-grid">
              {deletedComplexes.map((complex) => (
                <div key={complex.id} className="trash-item">
                  <div className="item-icon">
                    <FileText size={24} />
                  </div>
                  <div className="item-info">
                    <h4>{complex.patient_name}</h4>
                    <p className="deleted-date">
                      {complex.diagnosis_name || 'Без диагноза'}
                    </p>
                    <div className="trash-details">
                      <div className="detail-row">
                        <span className="detail-label">Упражнений:</span>
                        <span className="detail-value">
                          {complex.exercises_count || 0}
                        </span>
                      </div>
                      <div className="detail-row">
                        <span className="detail-label">Создан:</span>
                        <span className="detail-value">
                          {formatDate(complex.created_at)}
                        </span>
                      </div>
                      <div className="detail-row">
                        <span className="detail-label">Удалён:</span>
                        <span className="detail-value">
                          {formatDate(complex.updated_at)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="item-actions">
                    <button 
                      className="btn-restore"
                      onClick={() => handleRestoreComplex(complex.id, complex.patient_name)}
                    >
                      <RotateCcw size={16} />
                      Восстановить
                    </button>
                    <button 
                      className="btn-delete-permanent"
                      onClick={() => handleDeleteComplexPermanent(complex.id, complex.patient_name)}
                    >
                      <Trash2 size={16} />
                      Удалить навсегда
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default Trash;
