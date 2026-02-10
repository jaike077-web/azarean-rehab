import axios from 'axios';

// Базовый URL для API
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';
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
// RESPONSE INTERCEPTOR (с автообновлением токена)
// =====================================================

api.interceptors.response.use(
  (response) => response,
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

          const { token, refresh_token } = response.data;
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
// API ДЛЯ ПАЦИЕНТОВ (с X-Access-Token)
// =====================================================

// Создаём отдельный инстанс для запросов пациентов
const createPatientApi = (accessToken) => {
  const patientApi = axios.create({
    baseURL: API_BASE_URL,
    headers: {
      'Content-Type': 'application/json',
      'X-Access-Token': accessToken,
    },
  });
  return patientApi;
};

// =====================================================
// API МЕТОДЫ
// =====================================================

// Аутентификация
export const auth = {
  login: async (credentials) => {
    const response = await api.post('/auth/login', credentials);
    // Сохраняем оба токена при логине
    if (response.data.token) {
      setTokens(response.data.token, response.data.refresh_token);
    }
    return response;
  },
  register: async (userData) => {
    const response = await api.post('/auth/register', userData);
    // Сохраняем оба токена при регистрации
    if (response.data.token) {
      setTokens(response.data.token, response.data.refresh_token);
    }
    return response;
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
  getByToken: (token) => axios.get(`${API_BASE_URL}/complexes/token/${token}`),
  getByPatient: (patientId) => api.get(`/complexes/patient/${patientId}`),
  getAll: () => api.get('/complexes'),
  update: (id, data) => api.put(`/complexes/${id}`, data),
  delete: (id) => api.delete(`/complexes/${id}`),
  getTrash: () => api.get('/complexes/trash/list'),
  restore: (id) => api.patch(`/complexes/${id}/restore`),
  deletePermanent: (id) => api.delete(`/complexes/${id}/permanent`),
};

// Прогресс
export const progress = {
  // Для пациента (с access_token)
  create: (data, accessToken) => {
    if (accessToken) {
      const patientApi = createPatientApi(accessToken);
      return patientApi.post('/progress', data);
    }
    // Fallback для инструктора
    return api.post('/progress', data);
  },

  // Для пациента (с access_token)
  getByComplex: (complexId, accessToken) => {
    if (accessToken) {
      const patientApi = createPatientApi(accessToken);
      return patientApi.get(`/progress/complex/${complexId}`);
    }
    // Fallback для инструктора
    return api.get(`/progress/complex/${complexId}`);
  },

  // С авторизацией (для инструктора)
  getByComplexAuth: (complexId) => api.get(`/progress/complex/${complexId}`),

  // Прогресс пациента (только для инструктора)
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

  getById: async (id) => {
    const res = await api.get(`/exercises/${id}`);
    const data = res.data;
    return data.exercise || data;
  },

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
// =====================================================
export const patientAuth = {
  register: (data) => api.post('/patient-auth/register', data),
  login: (data) => api.post('/patient-auth/login', data),
  logout: () => api.post('/patient-auth/logout'),
  refresh: () => api.post('/patient-auth/refresh'),
  forgotPassword: (email) => api.post('/patient-auth/forgot-password', { email }),
  resetPassword: (data) => api.post('/patient-auth/reset-password', data),
  linkToken: (data) => api.post('/patient-auth/link-token', data),
  getMe: () => api.get('/patient-auth/me'),
  updateMe: (data) => api.put('/patient-auth/me', data),
};

// =====================================================
// ЭКСПОРТ УТИЛИТ
// =====================================================
export { setTokens, clearTokens, getToken, getRefreshToken, createPatientApi };
