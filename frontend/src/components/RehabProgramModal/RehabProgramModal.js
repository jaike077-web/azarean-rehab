import React, { useState, useEffect, useCallback } from 'react';
import { X, Activity } from 'lucide-react';
import { rehabPrograms, complexes as complexesApi } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import CreateWizard from './CreateWizard';
import EditForm from './EditForm';
import s from './RehabProgramModal.module.css';

/**
 * RehabProgramModal — dual-mode роутер.
 * Wave 1 #1.08b (вариант A, согласован 2026-05-13):
 *   - create-режим (нет активной программы у пациента) → CreateWizard (3 шага)
 *   - edit-режим (программа есть) → EditForm (1 step + delete)
 *
 * Props:
 *   patient  — { id, full_name, diagnosis? }
 *   onClose  — закрыть модалку
 *   onSaved  — успех create/update/delete (родитель refresh'ит список)
 *
 * Импорт-site `import RehabProgramModal from '.../RehabProgramModal'`
 * продолжает работать через `./index.js` re-export.
 */
function RehabProgramModal({ patient, onClose, onSaved }) {
  const toast = useToast();

  const [mode, setMode] = useState(null); // 'create' | 'edit' | null
  const [program, setProgram] = useState(null);
  const [complexes, setComplexes] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [programResp, complexesResp] = await Promise.all([
        rehabPrograms.getByPatient(patient.id, 'active'),
        complexesApi.getByPatient(patient.id),
      ]);

      const list = Array.isArray(complexesResp.data) ? complexesResp.data : [];
      setComplexes(list);

      const existing = Array.isArray(programResp.data) ? programResp.data[0] : null;
      if (existing) {
        setProgram(existing);
        setMode('edit');
      } else {
        setProgram(null);
        setMode('create');
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

  return (
    <div className={s.modalOverlay} onClick={onClose}>
        <div
          className={`${s.modalContent} ${s.rehabProgramModal}`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className={s.modalHeader}>
            <h2>
              <Activity size={20} className={s.pageIcon} />
              <span>Программа реабилитации</span>
            </h2>
            <button className={s.modalClose} onClick={onClose} aria-label="Закрыть">
              <X size={20} />
            </button>
          </div>

          <div className={s.rehabProgramModalBody}>
            <p className={s.rehabProgramPatient}>
              Пациент: <strong>{patient.full_name}</strong>
            </p>

            {loading && (
              <div className={s.rehabProgramLoading}>
                <div className={s.rehabProgramSpinner} />
                <span>Загрузка…</span>
              </div>
            )}

            {!loading && mode === null && (
              <div className={s.rehabProgramError}>
                <p>Не удалось загрузить данные.</p>
                <button type="button" className={s.btnSecondary} onClick={loadData}>
                  Повторить
                </button>
              </div>
            )}

            {!loading && mode === 'create' && (
              <CreateWizard
                patient={patient}
                complexes={complexes}
                onCreated={onSaved}
                onClose={onClose}
              />
            )}

            {!loading && mode === 'edit' && program && (
              <EditForm
                patient={patient}
                program={program}
                complexes={complexes}
                onSaved={onSaved}
                onDeleted={onSaved}
                onClose={onClose}
              />
            )}
        </div>
      </div>
    </div>
  );
}

export default RehabProgramModal;
