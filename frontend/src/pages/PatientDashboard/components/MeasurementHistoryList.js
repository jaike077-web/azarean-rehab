// =====================================================
// Wave 2 #2.08 + #2.09 — MeasurementHistoryList
// =====================================================
// Sorted список карточек. Cyrillic labels из NumericInputForm export.
// measured_at — backend через ::text шлёт 'YYYY-MM-DD' string
// (timezone rule #27), отображаем без preprocessing.
//
// 2.09 photo capture: для ROM entries — "Добавить фото" (если photo_url
// пуст) или thumbnail (если есть). Consent gate: ConsentDialog при
// patient.photo_consent_at==null, иначе file picker напрямую. Girth
// entries не имеют photo поддержки (schema 2.01 — нет photo_url column).
// =====================================================

import React, { useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { Camera, Image as ImageIcon } from 'lucide-react';
import { rehab } from '../../../services/api';
import { useToast } from '../../../context/ToastContext';
import { usePatientAuth } from '../../../context/PatientAuthContext';
import { ROM_TYPES, GIRTH_TYPES, HBB_VERTEBRAE } from './NumericInputForm';
import ConsentDialog from './ConsentDialog';
import PhotoViewerModal from './PhotoViewerModal';
import './MeasurementHistoryList.css';

const ROM_LABEL_MAP = Object.fromEntries(ROM_TYPES.map((t) => [t.value, t.label]));
const GIRTH_LABEL_MAP = Object.fromEntries(GIRTH_TYPES.map((t) => [t.value, t.label]));
const HBB_LABEL_MAP = Object.fromEntries(HBB_VERTEBRAE.map((v) => [v.value, v.label]));
const ROM_UNIT_MAP = Object.fromEntries(ROM_TYPES.map((t) => [t.value, t.unit]));

function formatValue(m, isRom) {
  if (isRom) {
    if (m.value_degrees != null) return `${m.value_degrees}°`;
    if (m.value_cm != null) return `${m.value_cm} см`;
    if (m.value_categorical) {
      return HBB_LABEL_MAP[m.value_categorical] || m.value_categorical;
    }
    return '—';
  }
  return m.value_cm != null ? `${m.value_cm} см` : '—';
}

function MeasurementCard({ m, isRom, onAddPhoto, onViewPhoto, uploadingRomId }) {
  const labelMap = isRom ? ROM_LABEL_MAP : GIRTH_LABEL_MAP;
  const typeLabel = labelMap[m.measurement_type] || m.measurement_type;
  const unit = isRom ? (ROM_UNIT_MAP[m.measurement_type] || '') : 'см';
  const isUploading = uploadingRomId === m.id;

  return (
    <article className="pd-measurement-card">
      <div className="pd-measurement-card__row pd-measurement-card__row--meta">
        <span className="pd-measurement-card__date">{m.measured_at}</span>
        <span className="pd-measurement-card__side">
          {m.side === 'L' ? 'Левая' : m.side === 'R' ? 'Правая' : '—'}
        </span>
      </div>
      <div className="pd-measurement-card__row pd-measurement-card__row--main">
        <span className="pd-measurement-card__type">{typeLabel}</span>
        <span className="pd-measurement-card__value" aria-label={`Значение ${formatValue(m, isRom)}`}>
          {formatValue(m, isRom)}
        </span>
      </div>
      {m.notes && <div className="pd-measurement-card__notes">{m.notes}</div>}

      {/* 2.09 photo capture — только для ROM entries */}
      {isRom && (
        <div className="pd-measurement-card__photo-row">
          {m.photo_url ? (
            <button
              type="button"
              className="pd-measurement-card__photo-thumb"
              onClick={() => onViewPhoto(m.id)}
              aria-label="Открыть фото"
            >
              <ImageIcon size={16} aria-hidden="true" />
              <span>Фото</span>
            </button>
          ) : (
            <button
              type="button"
              className="pd-measurement-card__photo-add"
              onClick={() => onAddPhoto(m.id)}
              disabled={isUploading}
              aria-label="Добавить фото"
            >
              <Camera size={16} aria-hidden="true" />
              <span>{isUploading ? 'Загрузка…' : 'Добавить фото'}</span>
            </button>
          )}
        </div>
      )}

      {unit && <span className="pd-measurement-card__unit-srhint" hidden>{unit}</span>}
    </article>
  );
}

MeasurementCard.propTypes = {
  m: PropTypes.shape({
    id: PropTypes.number.isRequired,
    measurement_type: PropTypes.string.isRequired,
    side: PropTypes.string,
    value_degrees: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    value_cm: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    value_categorical: PropTypes.string,
    notes: PropTypes.string,
    measured_at: PropTypes.string,
    photo_url: PropTypes.string,
  }).isRequired,
  isRom: PropTypes.bool.isRequired,
  onAddPhoto: PropTypes.func.isRequired,
  onViewPhoto: PropTypes.func.isRequired,
  uploadingRomId: PropTypes.number,
};

export default function MeasurementHistoryList({ items, onReload }) {
  const { rom = [], girth = [] } = items || {};
  const fileInputRef = useRef(null);
  const [consentOpen, setConsentOpen] = useState(false);
  const [pendingRomId, setPendingRomId] = useState(null);
  const [viewingRomId, setViewingRomId] = useState(null);
  const [uploadingRomId, setUploadingRomId] = useState(null);
  const toast = useToast();
  const { patient } = usePatientAuth();

  const triggerFilePicker = (romId) => {
    if (!fileInputRef.current) return;
    fileInputRef.current.dataset.romId = String(romId);
    fileInputRef.current.click();
  };

  const handleAddPhoto = (romId) => {
    if (!romId) return;
    if (!patient?.photo_consent_at) {
      setPendingRomId(romId);
      setConsentOpen(true);
      return;
    }
    triggerFilePicker(romId);
  };

  const handleConsent = () => {
    setConsentOpen(false);
    if (pendingRomId) {
      const id = pendingRomId;
      setPendingRomId(null);
      // Refresh уже обновил patient context — пускаем file picker
      triggerFilePicker(id);
    }
  };

  const handleConsentCancel = () => {
    setConsentOpen(false);
    setPendingRomId(null);
  };

  const handleFileSelected = async (e) => {
    const file = e.target.files && e.target.files[0];
    const romId = parseInt(e.target.dataset.romId, 10);
    e.target.value = ''; // reset input для повторного выбора того же файла
    if (!file || !Number.isFinite(romId)) return;

    setUploadingRomId(romId);
    try {
      const fd = new FormData();
      fd.append('photo', file);
      await rehab.uploadRomPhoto(romId, fd);
      toast.success('Фото загружено');
      if (typeof onReload === 'function') await onReload();
    } catch (err) {
      const msg = err?.response?.data?.message || 'Не удалось загрузить фото';
      toast.error(msg);
    } finally {
      setUploadingRomId(null);
    }
  };

  const all = [
    ...rom.map((m) => ({ ...m, _isRom: true })),
    ...girth.map((m) => ({ ...m, _isRom: false })),
  ].sort((a, b) => {
    const dateA = String(a.measured_at || '');
    const dateB = String(b.measured_at || '');
    if (dateA !== dateB) return dateB.localeCompare(dateA);
    return (b.id || 0) - (a.id || 0);
  });

  return (
    <>
      {all.length === 0 ? (
        <div className="pd-measurement-history-empty">
          Пока нет замеров. Добавьте первый через форму выше.
        </div>
      ) : (
        <div className="pd-measurement-history-list">
          {all.map((m) => (
            <MeasurementCard
              key={`${m._isRom ? 'rom' : 'girth'}-${m.id}`}
              m={m}
              isRom={m._isRom}
              onAddPhoto={handleAddPhoto}
              onViewPhoto={setViewingRomId}
              uploadingRomId={uploadingRomId}
            />
          ))}
        </div>
      )}

      {/* Hidden input + dialog + viewer */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        style={{ display: 'none' }}
        onChange={handleFileSelected}
        data-testid="rom-photo-input"
      />
      <ConsentDialog
        open={consentOpen}
        onConsent={handleConsent}
        onCancel={handleConsentCancel}
      />
      {viewingRomId && (
        <PhotoViewerModal
          romId={viewingRomId}
          onClose={() => setViewingRomId(null)}
        />
      )}
    </>
  );
}

MeasurementHistoryList.propTypes = {
  items: PropTypes.shape({
    rom: PropTypes.array,
    girth: PropTypes.array,
  }),
  onReload: PropTypes.func,
};
