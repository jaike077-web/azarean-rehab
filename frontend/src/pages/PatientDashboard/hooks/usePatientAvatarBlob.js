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

    // Локальный файл — догружаем blob с куки.
    // avatarUrl передаём как cache-buster — backend ставит max-age=300 на ответ,
    // без него смена фото не подхватится 5 минут (тот же URL → стейл из кеша).
    let cancelled = false;
    let createdUrl = null;
    patientAuth.fetchAvatarBlob(avatarUrl)
      .then((res) => {
        if (cancelled) return;
        createdUrl = URL.createObjectURL(res.data);
        setSrc(createdUrl);
      })
      .catch((err) => {
        if (!cancelled) setSrc(null);
        // Диагностика: пропадает ли аватарка из-за 401 / 404 / 503 / network.
        // Временный лог — снять когда поймём корневую причину.
        try {
          const apiUrl = process.env.REACT_APP_API_URL || '';
          const status = err?.response?.status;
          const standalone = window.matchMedia
            && window.matchMedia('(display-mode: standalone)').matches;
          fetch(`${apiUrl}/api/log-error`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'omit',
            keepalive: true,
            body: JSON.stringify({
              message: `avatar blob fetch failed: ${status ?? 'no-response'} ${err?.message || ''}`,
              url: window.location.href,
              userAgent: navigator.userAgent,
              context: {
                source: 'usePatientAvatarBlob',
                avatarUrl,
                status: status ?? null,
                code: err?.code || null,
                pwa: !!standalone,
              },
            }),
          }).catch(() => {});
        } catch {
          // never throw from a catch handler
        }
      });

    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [avatarUrl]);

  return src;
}
