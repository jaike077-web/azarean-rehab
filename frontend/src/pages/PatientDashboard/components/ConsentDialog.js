// =====================================================
// Wave 2 #2.09 — ConsentDialog
// =====================================================
// Согласие пациента на обработку медицинских фото. Required перед
// первым upload ROM photo. Idempotent — POST `/patient-auth/photo-consent`
// возвращает свежий `photo_consent_at` и обновляет patient context.
//
// Drift #32 от TZ: TZ предлагал создать новый overlay компонент в
// frontend/src/components/. Repo pattern — PatientModal (Wave 2 #2.05)
// для всех patient-side диалогов (z-index 9000, Esc, click-outside,
// body scroll lock). Оборачиваю PatientModal + контент.
// =====================================================

import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { Check } from 'lucide-react';
import { rehab } from '../../../services/api';
import { useToast } from '../../../context/ToastContext';
import { usePatientAuth } from '../../../context/PatientAuthContext';
import PatientModal from './PatientModal';
import './ConsentDialog.css';

export default function ConsentDialog({ open, onConsent, onCancel }) {
  const [checked, setChecked] = useState(false);
  const [loading, setLoading] = useState(false);
  const toast = useToast();
  const { refresh } = usePatientAuth();

  const handleAccept = async () => {
    if (!checked || loading) return;
    setLoading(true);
    try {
      const res = await rehab.postPhotoConsent();
      const consentAt = res.data?.photo_consent_at || null;
      // Drift #31: backend GET /me теперь возвращает photo_consent_at —
      // refresh() подтягивает свежий patient объект, включая поле.
      await refresh();
      toast.success('Согласие получено');
      if (typeof onConsent === 'function') onConsent(consentAt);
    } catch (err) {
      const msg = err?.response?.data?.message || 'Не удалось сохранить согласие';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (loading) return; // блокируем закрытие пока pending
    setChecked(false);
    if (typeof onCancel === 'function') onCancel();
  };

  return (
    <PatientModal isOpen={open} onClose={handleClose} title="Согласие на обработку фото">
      <div className="pd-consent-body">
        <p className="pd-consent-text">
          Вы загружаете фотографию для медицинского наблюдения за прогрессом
          реабилитации. Фото хранятся на серверах в России (152-ФЗ).
          Доступ имеют только вы и ваш инструктор.
        </p>
        <p className="pd-consent-text">
          Вы можете отозвать согласие в любой момент в настройках профиля.
        </p>
        <p className="pd-consent-text-note">
          <em>Заглушка legal-текста (v1). Финальная версия после consult'а юриста.</em>
        </p>

        <label className="pd-consent-checkbox">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            disabled={loading}
          />
          <span>Я согласен(а) на обработку фотографий</span>
        </label>

        <div className="pd-consent-actions">
          <button
            type="button"
            className="pd-consent-btn pd-consent-btn--secondary"
            onClick={handleClose}
            disabled={loading}
          >
            Отмена
          </button>
          <button
            type="button"
            className="pd-consent-btn pd-consent-btn--primary"
            onClick={handleAccept}
            disabled={!checked || loading}
          >
            <Check size={16} aria-hidden="true" />
            <span>{loading ? 'Сохранение…' : 'Принять'}</span>
          </button>
        </div>
      </div>
    </PatientModal>
  );
}

ConsentDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  onConsent: PropTypes.func,
  onCancel: PropTypes.func,
};
