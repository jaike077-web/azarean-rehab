// Единый парсер видео-ссылок упражнения → embed-URL для <iframe> и URL постера.
// Поддержка: Kinescope, YouTube (watch / youtu.be / shorts / embed), VK Video,
// Rutube, а также прямые ссылки/файлы (отдаются как есть).
//
// Зачем общий util: раньше каждый экран имел свой регэксп (ExerciseRunner,
// ExerciseViewModal, ExerciseDetail, ExerciseCard). Кабинет пациента
// (ExerciseRunner) понимал только Kinescope и наивную замену '/watch/'→'/embed/',
// поэтому обычные YouTube-ссылки у пациента НЕ встраивались, хотя у инструктора
// в превью — да. Теперь один источник правды для всех экранов.

/**
 * embed-URL из произвольной video-ссылки.
 * @param {string} raw
 * @returns {string|null}
 */
export function embedFromUrl(raw) {
  const url = (raw || '').trim();
  if (!url) return null;

  // Kinescope — уже готовый embed
  if (url.includes('kinescope.io/embed/')) return url;
  const kine = url.match(/kinescope\.io\/(?:watch\/|video\/|preview\/)?([a-zA-Z0-9]+)/);
  if (kine) return `https://kinescope.io/embed/${kine[1]}`;

  // YouTube — watch?v= / youtu.be/ / shorts/ / embed/
  const yt = url.match(
    /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{6,})/
  );
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;

  // VK Video — уже готовый external-плеер
  if (url.includes('video_ext.php')) return url;
  // vk.com/video-OID_ID, vkvideo.ru/video-OID_ID, clip-OID_ID
  const vk = url.match(/vk(?:video)?\.(?:ru|com)\/(?:video|clip)(-?\d+)_(\d+)/);
  if (vk) return `https://vk.com/video_ext.php?oid=${vk[1]}&id=${vk[2]}&hd=2`;

  // Rutube — rutube.ru/video/HASH или уже /play/embed/HASH
  const rt = url.match(/rutube\.ru\/(?:video|play\/embed)\/([a-f0-9]+)/i);
  if (rt) return `https://rutube.ru/play/embed/${rt[1]}`;

  // Прямой файл (.mp4/.webm) или неизвестный хост — отдаём как есть
  return url;
}

/**
 * embed-URL для упражнения (kinescope_id имеет приоритет над video_url).
 * @param {{kinescope_id?: string, video_url?: string}} exercise
 * @returns {string|null}
 */
export function toEmbedUrl(exercise) {
  if (!exercise) return null;
  if (exercise.kinescope_id) return `https://kinescope.io/embed/${exercise.kinescope_id}`;
  return embedFromUrl(exercise.video_url);
}

/**
 * URL постера-превью. Сохранённый thumbnail_url приоритетнее.
 * Для VK/Rutube постер недоступен без API → null (рендерим заглушку).
 * @param {{thumbnail_url?: string, kinescope_id?: string, video_url?: string}} exercise
 * @returns {string|null}
 */
export function toThumbnailUrl(exercise) {
  if (!exercise) return null;
  if (exercise.thumbnail_url) return exercise.thumbnail_url;
  if (exercise.kinescope_id) return `https://kinescope.io/preview/${exercise.kinescope_id}/poster`;

  const url = (exercise.video_url || '').trim();
  if (!url) return null;

  const kine = url.match(/kinescope\.io\/(?:watch\/|embed\/|preview\/|video\/)?([a-zA-Z0-9]+)/);
  if (kine) return `https://kinescope.io/preview/${kine[1]}/poster`;

  const yt = url.match(
    /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{6,})/
  );
  if (yt) return `https://img.youtube.com/vi/${yt[1]}/mqdefault.jpg`;

  return null;
}
