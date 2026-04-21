import { useEffect, useState } from 'react';
import { patientAuth } from '../../../services/api';

// Получает displayable src для аватара пациента.
//
// Backend хранит avatar_url двух видов:
//  1. Полный URL (OAuth-провайдер) — отдаём как есть, <img> возьмёт сам.
//  2. /uploads/avatars/<file>.jpg — endpoint защищён cookie, нужен blob-fetch
//     через patientAuth.fetchAvatarBlob() → URL.createObjectURL(blob).
//
// Хук абстрагирует обе ситуации. Нужен в нескольких местах
// (PatientDashboard header, ProfileScreen identity, можно и шире).
//
// avatar_url берётся из patient объекта (PatientAuthContext / props).
// При смене avatar_url старый blob URL ревокается.
export default function usePatientAvatarBlob(avatarUrl) {
  const [src, setSrc] = useState(null);

  useEffect(() => {
    if (!avatarUrl) {
      setSrc(null);
      return undefined;
    }
    // Внешний URL — сразу как есть
    if (/^https?:\/\//i.test(avatarUrl)) {
      setSrc(avatarUrl);
      return undefined;
    }

    // Локальный файл — догружаем blob с куки
    let cancelled = false;
    let createdUrl = null;
    patientAuth.fetchAvatarBlob()
      .then((res) => {
        if (cancelled) return;
        createdUrl = URL.createObjectURL(res.data);
        setSrc(createdUrl);
      })
      .catch(() => {
        if (!cancelled) setSrc(null);
      });

    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [avatarUrl]);

  return src;
}
