import axios from 'axios';

// Базовый URL для API (через proxy)
const API_URL = '/api';

// Создаём axios инстанс
const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Добавляем токен к каждому запросу
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Обработка ответов
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Токен невалиден - выходим
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// API методы

// Аутентификация
export const auth = {
  login: (credentials) => api.post('/auth/login', credentials),
  register: (userData) => api.post('/auth/register', userData),
  getMe: () => api.get('/auth/me'),
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
};



// Комплексы
export const complexes = {
  create: (data) => api.post('/complexes', data),
  getOne: (id) => api.get(`/complexes/${id}`),
  getByToken: (token) => axios.get(`${API_URL}/complexes/token/${token}`),
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
  create: (data) => axios.post(`${API_URL}/progress`, data), // БЕЗ авторизации (для пациента)
  getByComplex: (complexId) => axios.get(`${API_URL}/progress/complex/${complexId}`), // БЕЗ авторизации
  getByComplexAuth: (complexId) => api.get(`/progress/complex/${complexId}`), // С авторизацией (для инструктора)
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
    // тут оставляем как было — возвращаем полный axios-response,
    // чтобы не ломать существующий код в списке упражнений
    return api.get(`/exercises?${params.toString()}`);
  },

  // ⚠️ НОРМАЛИЗОВАННАЯ ФУНКЦИЯ
  // Возвращает СРАЗУ объект упражнения, а не axios-response
  getById: async (id) => {
    const res = await api.get(`/exercises/${id}`);
    const data = res.data;
    // поддерживаем оба варианта ответа бекенда:
    // { exercise: {...} } или просто {...}
    return data.exercise || data;
  },

  // здесь можно оставить как было — create возвращает axios-response,
  // потому что в модалке мы уже используем res.data.exercise
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
  getAll: () => api.get('/templates'),
  getById: (id) => api.get(`/templates/${id}`),
  create: (data) => api.post('/templates', data),
  update: (id, data) => api.put(`/templates/${id}`, data),
  delete: (id) => api.delete(`/templates/${id}`)
};