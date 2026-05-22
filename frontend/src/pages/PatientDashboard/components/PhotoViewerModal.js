// =====================================================
// Wave 2 #2.09 — PhotoViewerModal
// =====================================================
// Full-size viewer для ROM measurement photo. Drift #29: blob fetch +
// URL.createObjectURL (НЕ <img src=API-url> direct), consistent с
// fetchDiaryPhotoBlob pattern в DiaryPhotoTile.
//
// Z-index 9000 (rule #29 — оставляем место Toast 10000).
// =====================================================

import React, { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { X } from 'lucide-react';
import { rehab } from '../../../services/api';
import './PhotoViewerModal.css';

export default function PhotoViewerModal({ romId, onClose }) {
  const [blobUrl, setBlobUrl] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!romId) return undefined;
    let cancelled = false;
    let createdUrl = null;

    rehab.fetchRomPhotoBlob(romId)
      .then((res) => {
        if (cancelled) return;
        const blob = res.data;
        if (!blob) {
          setError(true);
          return;
        }
        createdUrl = URL.createObjectURL(blob);
        setBlobUrl(createdUrl);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });

    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [romId]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  const handleOverlayClick = (e) => {
    // Только клик по overlay закрывает; клик по самой картинке/кнопке — нет
    if (e.target.classList.contains('pd-photo-viewer__overlay')) {
      onClose();
    }
  };

  return (
    <div
      className="pd-photo-viewer__overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Просмотр фото замера"
      onClick={handleOverlayClick}
    >
      <button
        type="button"
        className="pd-photo-viewer__close"
        onClick={onClose}
        aria-label="Закрыть"
      >
        <X size={24} />
      </button>
      {error ? (
        <div className="pd-photo-viewer__error">Не удалось загрузить фото</div>
      ) : blobUrl ? (
        <img
          src={blobUrl}
          alt="Замер"
          className="pd-photo-viewer__img"
        />
      ) : (
        <div className="pd-photo-viewer__loading">Загрузка…</div>
      )}
    </div>
  );
}

PhotoViewerModal.propTypes = {
  romId: PropTypes.number.isRequired,
  onClose: PropTypes.func.isRequired,
};
