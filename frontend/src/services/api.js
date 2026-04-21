import axios from 'axios';

// Базовый URL для API.
// В dev CRA проксирует /api → localhost:5000 через setupProxy.js.
// Пустой default = same-origin = cookies SameSite=Strict работают.
// В production REACT_APP_API_URL задаётся явно (или пусто если single-origin за nginx).
const API_URL = process.env.REACT_APP_API_URL || '';
const API_BASE_URL = `${API_URL}/api`;

// =====================================================
// УПРАВЛЕНИЕ ТОКЕНАМИ
// =====================================================

const getToken = () => localStorage.getItem('token');
const getRefreshToken = () => localStorage.getItem('refresh_token');

const setTokens = (token, refreshToken) => {
  localStorage.setItem('token', token);
  if (refreshToken) {
    localStorage.setItem('refresh_token', refreshToken);
  }
};

const clearTokens = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('refresh_token');
};

// Флаг для предотвращения множественных refresh запросов
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach(prom => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

// =====================================================
// AXIOS ИНСТАНС
// =====================================================

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// =====================================================
// REQUEST INTERCEPTOR
// =====================================================

api.interceptors.request.use(
  (config) => {
    const token = getToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// =====================================================
// RESPONSE INTERCEPTOR (нормализация + автообновление токена)
// =====================================================

// Разворачиваем стандартный формат { data: <payload>, message?, total? }
// После interceptor: response.data = <payload>, response.meta = { message, total, ... }
const unwrapResponse = (response) => {
  if (response.data && typeof response.data === 'object' && 'data' in response.data) {
    const { data, ...meta } = response.data;
    response.data = data;
    response.meta = meta;
  }
  return response;
};

api.interceptors.response.use(
  unwrapResponse,
  async (error) => {
    const originalRequest = error.config;

    // Обработка 423 - Account Locked
    if (error.response?.status === 423) {
      const message = error.response?.data?.message || 'Аккаунт заблокирован';
      // Можно показать уведомление пользователю
      console.warn('Account locked:', message);
      return Promise.reject(error);
    }

    // Обработка 403 - токен истёк
    if (error.response?.status === 403 && !originalRequest._retry) {
      const errorMessage = error.response?.data?.message || '';

      // Проверяем что это именно истекший токен
      if (errorMessage.includes('истек') || errorMessage.includes('expired')) {
        if (isRefreshing) {
          // Если уже идёт refresh, ждём его завершения
          return new Promise((resolve, reject) => {
            failedQueue.push({ resolve, reject });
          }).then(token => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return api(originalRequest);
          }).catch(err => {
            return Promise.reject(err);
          });
        }

        originalRequest._retry = true;
        isRefreshing = true;

        const refreshToken = getRefreshToken();

        if (!refreshToken) {
          clearTokens();
          window.location.href = '/login';
          return Promise.reject(error);
        }

        try {
          // Запрос на обновление токена
          const response = await axios.post(`${API_BASE_URL}/auth/refresh`, {
            refresh_token: refreshToken
          });

          // Raw axios — без unwrap interceptor, формат { data: { token, refresh_token } }
          const { token, refresh_token } = response.data.data;
          setTokens(token, refresh_token);

          processQueue(null, token);

          originalRequest.headers.Authorization = `Bearer ${token}`;
          return api(originalRequest);
        } catch (refreshError) {
          processQueue(refreshError, null);
          clearTokens();
          window.location.href = '/login';
          return Promise.reject(refreshError);
        } finally {
          isRefreshing = false;
        }
      }
    }

    // Обработка 401 - не авторизован
    if (error.response?.status === 401) {
      clearTokens();
      window.location.href = '/login';
    }

    return Promise.reject(error);
  }
);

// =====================================================
// API МЕТОДЫ
// =====================================================

// Аутентификация
export const auth = {
  login: async (credentials) => {
    const response = await api.post('/auth/login', credentials);
    // После unwrap: response.data = { user, token, refresh_token }
    if (response.data?.token) {
      setTokens(response.data.token, response.data.refresh_token);
    }
    return response;
  },
  register: async (userData) => {
    // Регистрация: админ создаёт аккаунт, токены не выдаются
    return api.post('/auth/register', userData);
  },
  getMe: () => api.get('/auth/me'),
  logout: async () => {
    try {
      await api.post('/auth/logout');
    } catch (e) {
      // Игнорируем ошибки при logout
    }
    clearTokens();
  },
  refresh: (refreshToken) => axios.post(`${API_BASE_URL}/auth/refresh`, { refresh_token: refreshToken }),
};

// Пациенты
export const patients = {
  getAll: () => api.get('/patients'),
  getOne: (id) => api.get(`/patients/${id}`),
  create: (data) => api.post('/patients', data),
  update: (id, data) => api.put(`/patients/${id}`, data),
  delete: (id) => api.delete(`/patients/${id}`),
  getTrash: () => api.get('/patients/trash'),
  restore: (id) => api.patch(`/patients/${id}/restore`),
  deletePermanent: (id) => api.delete(`/patients/${id}/permanent`),
  getWithProgress: () => api.get('/patients/with-progress'),
};

// Комплексы
export const complexes = {
  create: (data) => api.post('/complexes', data),
  getOne: (id) => api.get(`/complexes/${id}`),
  getExercises: (id) => api.get(`/complexes/${id}/exercises`),
  getByPatient: (patientId) => api.get(`/complexes/patient/${patientId}`),
  getAll: () => api.get('/complexes'),
  update: (id, data) => api.put(`/complexes/${id}`, data),
  delete: (id) => api.delete(`/complexes/${id}`),
  getTrash: () => api.get('/complexes/trash/list'),
  restore: (id) => api.patch(`/complexes/${id}/restore`),
  deletePermanent: (id) => api.delete(`/complexes/${id}/permanent`),
};

// Прогресс (для инструктора через JWT)
// Прогресс пациента отправляется через progressPatient (ниже, использует patientApi)
export const progress = {
  create: (data) => api.post('/progress', data),
  getByComplex: (complexId) => api.get(`/progress/complex/${complexId}`),
  // Алиас для совместимости с ViewProgress.js
  getByComplexAuth: (complexId) => api.get(`/progress/complex/${complexId}`),
  getPatientProgress: (patientId) => api.get(`/progress/patient/${patientId}`),
};

// Dashboard статистика
export const dashboard = {
  getStats: () => api.get('/dashboard/stats'),
};

// =====================================================
// EXERCISES - Библиотека упражнений
// =====================================================
export const exercises = {
  getAll: (filters = {}) => {
    const params = new URLSearchParams();
    Object.keys(filters).forEach(key => {
      if (
        filters[key] !== null &&
        filters[key] !== undefined &&
        filters[key] !== ''
      ) {
        params.append(key, filters[key]);
      }
    });
    return api.get(`/exercises?${params.toString()}`);
  },

  getById: (id) => api.get(`/exercises/${id}`),

  create: (data) => api.post('/exercises', data),
  update: (id, data) => api.put(`/exercises/${id}`, data),
  delete: (id) => api.delete(`/exercises/${id}`),

  getMuscleGroups: (category = null) => {
    const params = category ? `?category=${category}` : '';
    return api.get(`/exercises/muscle-groups/all${params}`);
  },

  getTags: (type = null) => {
    const params = type ? `?type=${type}` : '';
    return api.get(`/exercises/tags/all${params}`);
  },

  createTag: (data) => api.post('/exercises/tags', data),
  getPresets: (exerciseId) => api.get(`/exercises/${exerciseId}/presets`)
};

export const importAPI = {
  kinescopePreview: () => api.get('/import/kinescope/preview'),
  kinescopeExecute: (videoIds) => api.post('/import/kinescope/execute', { videoIds }),
  csvImport: (formData) =>
    api.post('/import/csv', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  downloadTemplate: () =>
    api.get('/import/csv/template', {
      responseType: 'blob',
    }),
};

export default api;

export const diagnoses = {
  getAll: () => api.get('/diagnoses'),
  getById: (id) => api.get(`/diagnoses/${id}`),
  create: (data) => api.post('/diagnoses', data),
  update: (id, data) => api.put(`/diagnoses/${id}`, data),
  delete: (id) => api.delete(`/diagnoses/${id}`),
  restore: (id) => api.post(`/diagnoses/${id}/restore`)
};

export const templates = {
  getAll: (params = {}) => api.get('/templates', { params }),
  getById: (id) => api.get(`/templates/${id}`),
  create: (data) => api.post('/templates', data),
  update: (id, data) => api.put(`/templates/${id}`),
  delete: (id) => api.delete(`/templates/${id}`)
};

// =====================================================
// АВТОРИЗАЦИЯ ПАЦИЕНТОВ (Спринт 0.1)
// Методы определяются здесь как заглушки, переопределяются ниже
// на patientApi (withCredentials: true для cookie auth).
// =====================================================
export const patientAuth = {};

// =====================================================
// API ДЛЯ РЕАБИЛИТАЦИИ ПАЦИЕНТОВ (с JWT Bearer + auto-refresh)
// =====================================================

// Singleton axios instance для пациентов.
// После миграции #11 авторизация через httpOnly cookies:
//   - patient_access_token (SameSite=Strict, 15 мин) — ставится бэком на login/refresh
//   - patient_refresh_token (SameSite=Lax, 30 дней, path: /api/patient-auth)
// Нет ни Authorization header, ни localStorage. withCredentials обязателен.
const patientApi = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

// Флаги для предотвращения множественных refresh запросов (пациент)
let isPatientRefreshing = false;
let patientFailedQueue = [];

const processPatientQueue = (error) => {
  patientFailedQueue.forEach((prom) => {
    if (error) prom.reject(error);
    else prom.resolve();
  });
  patientFailedQueue = [];
};

// Response interceptor — unwrap + auto-refresh при 401/403 "токен истёк"
patientApi.interceptors.response.use(
  unwrapResponse,
  async (error) => {
    const originalRequest = error.config;

    // Пути к которым auto-refresh НЕ применяется (чтобы не зациклиться)
    const url = originalRequest?.url || '';
    const skipRefresh = url.includes('/patient-auth/refresh') ||
                        url.includes('/patient-auth/login') ||
                        url.includes('/patient-auth/register') ||
                        url.includes('/patient-auth/me');

    const status = error.response?.status;
    const errorMessage = error.response?.data?.message || '';
    const tokenExpired =
      (status === 401 || status === 403) &&
      (errorMessage.includes('истек') || errorMessage.includes('expired') || status === 401);

    if (tokenExpired && !originalRequest._retry && !skipRefresh) {
      if (isPatientRefreshing) {
        return new Promise((resolve, reject) => {
          patientFailedQueue.push({ resolve, reject });
        }).then(() => patientApi(originalRequest))
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isPatientRefreshing = true;

      try {
        // Refresh через httpOnly cookie (withCredentials: true)
        // Bearer больше не используется — новая cookie ставится backend'ом
        await axios.post(
          `${API_BASE_URL}/patient-auth/refresh`,
          {},
          { withCredentials: true }
        );
        processPatientQueue(null);
        return patientApi(originalRequest);
      } catch (refreshError) {
        processPatientQueue(refreshError);
        // Оповещаем приложение через кастомный event — PatientAuthContext слушает
        try {
          window.dispatchEvent(new CustomEvent('patient-auth-expired'));
        } catch (_) {}
        return Promise.reject(refreshError);
      } finally {
        isPatientRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

// Deprecated: оставлено для обратной совместимости
const createPatientJwtApi = () => patientApi;

// Все методы пациентской авторизации — через patientApi (withCredentials: true)
patientAuth.register = (data) => patientApi.post('/patient-auth/register', data);
patientAuth.login = (data) => patientApi.post('/patient-auth/login', data);
patientAuth.logout = () => patientApi.post('/patient-auth/logout');
patientAuth.refresh = () => patientApi.post('/patient-auth/refresh');
patientAuth.forgotPassword = (email) => patientApi.post('/patient-auth/forgot-password', { email });
patientAuth.resetPassword = (data) => patientApi.post('/patient-auth/reset-password', data);
patientAuth.getMe = () => patientApi.get('/patient-auth/me');
patientAuth.updateMe = (data) => patientApi.put('/patient-auth/me', data);
patientAuth.changePassword = (data) => patientApi.post('/patient-auth/change-password', data);
// FormData → axios сам выставит Content-Type: multipart/form-data с правильным
// boundary. Если задать Content-Type вручную без boundary — multer на бэке
// не сможет распарсить файл (req.file будет undefined).
patientAuth.uploadAvatar = (formData) => patientApi.post('/patient-auth/upload-avatar', formData);
patientAuth.deleteAvatar = () => patientApi.delete('/patient-auth/avatar');
patientAuth.fetchAvatarBlob = () => patientApi.get('/patient-auth/avatar', { responseType: 'blob' });
patientAuth.getMyComplexes = () => patientApi.get('/patient-auth/my-complexes');
patientAuth.getMyComplex = (id) => patientApi.get(`/patient-auth/my-complexes/${id}`);

// Прогресс пациента — отдельный объект, использует patientApi (cookie + JWT)
export const progressPatient = {
  create: (data) => patientApi.post('/progress', data),
  getByComplex: (complexId) => patientApi.get(`/progress/complex/${complexId}`),
  getByExercise: (exerciseId, complexId) =>
    patientApi.get(`/progress/exercise/${exerciseId}/complex/${complexId}`),
};

export const rehab = {
  // Dashboard (агрегированные данные)
  getDashboard: () => patientApi.get('/rehab/my/dashboard'),
  getMyProgram: () => patientApi.get('/rehab/my/program'),
  getMyExercises: () => patientApi.get('/rehab/my/exercises'),

  // Фазы (публичные)
  getPhases: (type = 'acl') => api.get(`/rehab/phases?type=${type}`),
  getPhase: (id) => api.get(`/rehab/phases/${id}`),
  getTips: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return api.get(`/rehab/tips?${query}`);
  },

  // Дневник
  getDiaryEntries: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return patientApi.get(`/rehab/my/diary?${query}`);
  },
  createDiaryEntry: (data) => patientApi.post('/rehab/my/diary', data),
  getDiaryEntry: (date) => patientApi.get(`/rehab/my/diary/${date}`),

  // Стрик
  getMyStreak: () => patientApi.get('/rehab/my/streak'),

  // Сообщения
  getMyMessages: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return patientApi.get(`/rehab/my/messages?${query}`);
  },
  sendMessage: (data) => patientApi.post('/rehab/my/messages', data),
  getUnreadCount: () => patientApi.get('/rehab/my/messages/unread'),

  // Уведомления
  getNotifications: () => patientApi.get('/rehab/my/notifications'),
  updateNotifications: (data) => patientApi.put('/rehab/my/notifications', data),

  // Telegram привязка (Sprint 3)
  getTelegramStatus: () => patientApi.get('/telegram/status'),
  generateTelegramCode: () => patientApi.post('/telegram/link-code'),
  unlinkTelegram: () => patientApi.delete('/telegram/unlink'),
};

// =====================================================
// АДМИН-ПАНЕЛЬ (Sprint 4)
// =====================================================
export const admin = {
  // Юзеры
  getUsers: (params = {}) => api.get('/admin/users', { params }),
  createUser: (data) => api.post('/admin/users', data),
  updateUser: (id, data) => api.put(`/admin/users/${id}`, data),
  deactivateUser: (id) => api.patch(`/admin/users/${id}/deactivate`),
  activateUser: (id) => api.patch(`/admin/users/${id}/activate`),
  unlockUser: (id) => api.patch(`/admin/users/${id}/unlock`),

  // Статистика
  getStats: () => api.get('/admin/stats'),

  // Аудит-логи
  getAuditLogs: (params = {}) => api.get('/admin/audit-logs', { params }),

  // Фазы
  getPhases: (params = {}) => api.get('/admin/phases', { params }),
  getPhase: (id) => api.get(`/admin/phases/${id}`),
  createPhase: (data) => api.post('/admin/phases', data),
  updatePhase: (id, data) => api.put(`/admin/phases/${id}`, data),
  deletePhase: (id) => api.delete(`/admin/phases/${id}`),

  // Советы
  getTips: (params = {}) => api.get('/admin/tips', { params }),
  createTip: (data) => api.post('/admin/tips', data),
  updateTip: (id, data) => api.put(`/admin/tips/${id}`, data),
  deleteTip: (id) => api.delete(`/admin/tips/${id}`),

  // Видео
  getVideos: (params = {}) => api.get('/admin/videos', { params }),
  createVideo: (data) => api.post('/admin/videos', data),
  updateVideo: (id, data) => api.put(`/admin/videos/${id}`, data),
  deleteVideo: (id) => api.delete(`/admin/videos/${id}`),

  // Система
  getSystemInfo: () => api.get('/admin/system'),
};

// =====================================================
// ЭКСПОРТ УТИЛИТ
// =====================================================
export { setTokens, clearTokens, getToken, getRefreshToken, createPatientJwtApi, patientApi };
