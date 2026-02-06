// =====================================================
// DATE UTILITIES - Azarean Network
// =====================================================

/**
 * Форматирует дату в русском формате (например: "1 января 2024")
 * @param {string|Date} dateString - Дата для форматирования
 * @returns {string} Отформатированная дата или '-' если дата невалидна
 */
export const formatDate = (dateString) => {
  if (!dateString) return '-';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '-';

  return date.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
};

/**
 * Форматирует дату в коротком формате (например: "1 янв")
 * @param {string|Date} dateString - Дата для форматирования
 * @returns {string} Отформатированная дата или '-' если дата невалидна
 */
export const formatDateShort = (dateString) => {
  if (!dateString) return '-';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '-';

  return date.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short'
  });
};

/**
 * Форматирует диапазон дат (например: "1 янв — 15 янв")
 * @param {string|Date} startDate - Начальная дата
 * @param {string|Date} endDate - Конечная дата
 * @returns {string} Отформатированный диапазон или 'Нет данных'
 */
export const formatDateRange = (startDate, endDate) => {
  if (!startDate || !endDate) return 'Нет данных';
  return `${formatDateShort(startDate)} — ${formatDateShort(endDate)}`;
};

/**
 * Форматирует время (например: "14:30")
 * @param {string|Date} dateString - Дата/время для форматирования
 * @returns {string} Отформатированное время
 */
export const formatTime = (dateString) => {
  if (!dateString) return '-';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '-';

  return date.toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit'
  });
};

/**
 * Форматирует относительное время (например: "2 дня назад")
 * @param {string|Date} dateString - Дата для форматирования
 * @returns {string} Относительное время
 */
export const formatRelativeTime = (dateString) => {
  if (!dateString) return '-';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '-';

  const now = new Date();
  const diffMs = now - date;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Сегодня';
  if (diffDays === 1) return 'Вчера';
  if (diffDays < 7) return `${diffDays} дн. назад`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} нед. назад`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} мес. назад`;
  return `${Math.floor(diffDays / 365)} г. назад`;
};

/**
 * Форматирует дату в числовом формате (например: "01.02.2024")
 * @param {string|Date} dateString - Дата для форматирования
 * @returns {string} Отформатированная дата или '-' если дата невалидна
 */
export const formatDateNumeric = (dateString) => {
  if (!dateString) return '-';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '-';

  return date.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
};

/**
 * Форматирует дату в коротком формате с годом (например: "1 янв 2024")
 * @param {string|Date} dateString - Дата для форматирования
 * @returns {string} Отформатированная дата или 'Нет данных' если дата невалидна
 */
export const formatDateShortWithYear = (dateString) => {
  if (!dateString) return 'Нет данных';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return 'Нет данных';

  return date.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
};
