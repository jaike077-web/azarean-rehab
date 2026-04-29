import React, { useState, useEffect, useCallback } from 'react';
import { X, Activity, Trash2 } from 'lucide-react';
import { rehabPrograms, complexes as complexesApi } from '../services/api';
import { useToast } from '../context/ToastContext';
import useConfirm from '../hooks/useConfirm';
import ConfirmModal from './ConfirmModal';
import { formatDate } from '../utils/dateUtils';
import './RehabProgramModal.css';

const EMPTY_FORM = {
  title: '',
  complex_id: '',
  diagnosis: '',
  surgery_date: '',
  current_phase: 1,
  notes: '',
  status: 'active',
};

function RehabProgramModal({ patient, onClose, onSaved }) {
  const toast = useToast();
  const { confirmState, confirm, closeConfirm } = useConfirm();

  const [mode, setMode] = useState(null); // 'create' | 'edit' | null
  const [program, setProgram] = useState(null);
  const [complexesList, setComplexesList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [programResp, complexesResp] = await Promise.all([
        rehabPrograms.getByPatient(patient.id, 'active'),
        complexesApi.getByPatient(patient.id),
      ]);

      const list = Array.isArray(complexesResp.data) ? complexesResp.data : [];
      setComplexesList(list);

      const existing = Array.isArray(programResp.data) ? programResp.data[0] : null;
      if (existing) {
        setProgram(existing);
        setMode('edit');
        setForm({
          title: existing.title || '',
          complex_id: existing.complex_id ? String(existing.complex_id) : '',
          diagnosis: existing.diagnosis || '',
          surgery_date: existing.surgery_date
            ? String(existing.surgery_date).split('T')[0]
            : '',
          current_phase: existing.current_phase || 1,
          notes: existing.notes || '',
          status: existing.status || 'active',
        });
      } else {
        setProgram(null);
        setMode('create');
        setForm({ ...EMPTY_FORM, title: 'Реабилитация' });
      }
    } catch (err) {
      toast.error('Не удалось загрузить данные программы');
      setMode(null);
    } finally {
      setLoading(false);
    }
  }, [patient.id, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const isValid =
    form.title.trim().length > 0 &&
    form.complex_id &&
    complexesList.length > 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isValid || submitting) return;

    setSubmitting(true);
    try {
      const payload = {
        title: form.title.trim(),
        complex_id: form.complex_id ? parseInt(form.complex_id, 10) : null,
        diagnosis: form.diagnosis.trim() || null,
        surgery_date: form.surgery_date || null,
        current_phase: parseInt(form.current_phase, 10) || 1,
        notes: form.notes.trim() || null,
      };

      if (mode === 'create') {
        payload.patient_id = patient.id;
        await rehabPrograms.create(payload);
        toast.success('Программа создана');
      } else {
        payload.status = form.status;
        await rehabPrograms.update(program.id, payload);
        toast.success('Программа обновлена');
      }
      onSaved();
    } catch (err) {
      const msg = err.response?.data?.message || 'Не удалось сохранить программу';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = () => {
    if (!program) return;
    confirm({
      title: 'Удалить программу?',
      message:
        'Дневник и прогресс пациента сохранятся, но он перестанет видеть «комплекс на сегодня» и Roadmap.',
      confirmText: 'Удалить',
      variant: 'danger',
      onConfirm: async () => {
        try {
          await rehabPrograms.delete(program.id);
          toast.success('Программа удалена');
          onSaved();
        } catch (err) {
          const msg = err.response?.data?.message || 'Не удалось удалить программу';
          toast.error(msg);
        }
      },
    });
  };

  return (
    <>
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content rehab-program-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2>
            <Activity size={20} className="page-icon" />
            <span>Программа реабилитации</span>
          </h2>
          <button className="modal-close" onClick={onClose} aria-label="Закрыть">
            <X size={20} />
          </button>
        </div>

        <div className="rehab-program-modal-body">
          <p className="rehab-program-patient">
            Пациент: <strong>{patient.full_name}</strong>
          </p>

          {loading && (
            <div className="rehab-program-loading">
              <div className="rehab-program-spinner" />
              <span>Загрузка…</span>
            </div>
          )}

          {!loading && mode === null && (
            <div className="rehab-program-error">
              <p>Не удалось загрузить данные.</p>
              <button type="button" className="btn-secondary" onClick={loadData}>
                Повторить
              </button>
            </div>
          )}

          {!loading && mode && (
            <form onSubmit={handleSubmit} className="rehab-program-form">
              {complexesList.length === 0 && (
                <div className="rehab-program-warn">
                  У пациента нет ни одного комплекса. Сначала создайте комплекс
                  упражнений на странице «Мои комплексы», иначе пациент не увидит
                  блок «комплекс на сегодня».
                </div>
              )}

              <div className="rehab-program-field">
                <label htmlFor="rp-title">
                  Название программы <span className="required">*</span>
                </label>
                <input
                  id="rp-title"
                  type="text"
                  name="title"
                  value={form.title}
                  onChange={handleChange}
                  maxLength={255}
                  placeholder="Например: Реабилитация ACL правого колена"
                  required
                />
              </div>

              <div className="rehab-program-field">
                <label htmlFor="rp-complex">
                  Комплекс упражнений <span className="required">*</span>
                </label>
                <select
                  id="rp-complex"
                  name="complex_id"
                  value={form.complex_id}
                  onChange={handleChange}
                  disabled={complexesList.length === 0}
                  required
                >
                  <option value="">— Выберите комплекс —</option>
                  {complexesList.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title || `Комплекс #${c.id}`}
                    </option>
                  ))}
                </select>
                <p className="rehab-program-help">
                  Этот комплекс пациент увидит как «комплекс на сегодня» в своём
                  кабинете.
                </p>
              </div>

              <div className="rehab-program-field-row">
                <div className="rehab-program-field">
                  <label htmlFor="rp-diagnosis">Диагноз</label>
                  <input
                    id="rp-diagnosis"
                    type="text"
                    name="diagnosis"
                    value={form.diagnosis}
                    onChange={handleChange}
                    placeholder="Например: ACL правое колено"
                  />
                </div>
                <div className="rehab-program-field">
                  <label htmlFor="rp-surgery">Дата операции</label>
                  <input
                    id="rp-surgery"
                    type="date"
                    name="surgery_date"
                    value={form.surgery_date}
                    onChange={handleChange}
                  />
                </div>
              </div>

              <div className="rehab-program-field-row">
                <div className="rehab-program-field">
                  <label htmlFor="rp-phase">Текущая фаза</label>
                  <select
                    id="rp-phase"
                    name="current_phase"
                    value={form.current_phase}
                    onChange={handleChange}
                  >
                    <option value={1}>1 — Фаза 1</option>
                    <option value={2}>2 — Фаза 2</option>
                    <option value={3}>3 — Фаза 3</option>
                    <option value={4}>4 — Фаза 4</option>
                  </select>
                  <p className="rehab-program-help">
                    Фазы относятся к ACL-программам.
                  </p>
                </div>

                {mode === 'edit' && (
                  <div className="rehab-program-field">
                    <label htmlFor="rp-status">Статус</label>
                    <select
                      id="rp-status"
                      name="status"
                      value={form.status}
                      onChange={handleChange}
                    >
                      <option value="active">Активна</option>
                      <option value="paused">На паузе</option>
                      <option value="completed">Завершена</option>
                    </select>
                  </div>
                )}
              </div>

              <div className="rehab-program-field">
                <label htmlFor="rp-notes">Заметки</label>
                <textarea
                  id="rp-notes"
                  name="notes"
                  value={form.notes}
                  onChange={handleChange}
                  rows={3}
                  placeholder="Например: без impact-нагрузки до 12 недели"
                />
              </div>

              {mode === 'edit' && program && (
                <p className="rehab-program-meta">
                  Создана: {formatDate(program.created_at)}
                  {program.phase_started_at && (
                    <> · Текущая фаза начата: {formatDate(program.phase_started_at)}</>
                  )}
                </p>
              )}

              <div className="rehab-program-footer">
                {mode === 'edit' ? (
                  <button
                    type="button"
                    className="btn-delete"
                    onClick={handleDelete}
                    disabled={submitting}
                  >
                    <Trash2 size={16} className="btn-icon" />
                    <span>Удалить программу</span>
                  </button>
                ) : (
                  <span />
                )}
                <div className="rehab-program-footer-right">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={onClose}
                    disabled={submitting}
                  >
                    Отмена
                  </button>
                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={!isValid || submitting}
                  >
                    {submitting
                      ? 'Сохранение…'
                      : mode === 'create'
                      ? 'Создать программу'
                      : 'Сохранить'}
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
    <ConfirmModal {...confirmState} onClose={closeConfirm} />
    </>
  );
}

export default RehabProgramModal;
