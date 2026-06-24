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
  generateInviteCode: (id) => api.post(`/patients/${id}/invite-code`),
  // Передача пациента другому инструктору (Wave 3 C1, admin-only)
  // body: { instructor_id, reason? } → audit logAudit('PATIENT_REASSIGNED', ...)
  assignInstructor: (id, data) => api.patch(`/patients/${id}/assign-instructor`, data),
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

  // AI-надиктовка: расшифровка → { fields, warnings, review?, fixed? } для предзаполнения формы (не-PII).
  // review=true включает проверку качества (faithfulness + автофикс) — дороже и дольше.
  structure: (transcript, { review = false } = {}) => api.post('/exercises/structure', { transcript, review }),

  // Планировщик скрипта (этап 4): черновые данные → { script, review_points } (не-PII).
  // Генерация на deepseek-v4-pro — оператор вычитывает скрипт и затем диктует/разбирает.
  planScript: (input) => api.post('/exercises/plan-script', input || {}),

  // Распознавание речи (Yandex SpeechKit): аудио-Blob → { text }. По умолчанию raw PCM 16кГц.
  transcribe: (blob, { format = 'lpcm', sampleRateHertz = 16000 } = {}) => {
    const fd = new FormData();
    fd.append('audio', blob, 'speech.pcm');
    fd.append('format', format);
    fd.append('sampleRateHertz', String(sampleRateHertz));
    return api.post('/exercises/transcribe', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

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
  update: (id, data) => api.put(`/templates/${id}`, data),
  delete: (id) => api.delete(`/templates/${id}`)
};

export const rehabPrograms = {
  getByPatient: (patientId, status) => {
    const params = new URLSearchParams({ patient_id: String(patientId) });
    if (status) params.set('status', status);
    return api.get(`/rehab/programs?${params.toString()}`);
  },
  create: (data) => api.post('/rehab/programs', data),
  update: (id, data) => api.put(`/rehab/programs/${id}`, data),
  delete: (id) => api.delete(`/rehab/programs/${id}`),
  // ARC-CYCLE AC3: блоки программы (микроцикл). Инструктор, api (Bearer).
  // К AC2-эндпоинтам: GET/POST /rehab/programs/:id/blocks, PUT/DELETE /rehab/blocks/:blockId.
  getProgramBlocks: (programId) => api.get(`/rehab/programs/${programId}/blocks`),
  createBlock: (programId, data) => api.post(`/rehab/programs/${programId}/blocks`, data),
  updateBlock: (blockId, data) => api.put(`/rehab/blocks/${blockId}`, data),
  deleteBlock: (blockId) => api.delete(`/rehab/blocks/${blockId}`),
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
// 152-ФЗ ст.21 — soft delete + 30 дней grace period перед hard delete.
// Body: { confirm: true, current_password?: string, reason?: string }
patientAuth.deleteAccount = (data) => patientApi.delete('/patient-auth/me', { data });
// FormData uploads. patientApi имеет default Content-Type: application/json
// на instance level, который перебивает auto-detection axios v1 для FormData.
// Решение: явно стереть instance default через Content-Type: undefined →
// браузер сам выставит multipart/form-data с правильным boundary,
// multer на бэке корректно распарсит файл.
patientAuth.uploadAvatar = (formData) => patientApi.post('/patient-auth/upload-avatar', formData, {
  headers: { 'Content-Type': undefined },
});
patientAuth.deleteAvatar = () => patientApi.delete('/patient-auth/avatar');
// Cache-buster по avatar_url — backend ставит max-age=300 на ответ,
// без буста смена аватара не подхватится в течение 5 минут (URL endpoint
// один и тот же, физический файл другой). Передаём filename из avatar_url
// как ?v= параметр, чтобы новый аватар = новый URL = новый кеш-entry.
patientAuth.fetchAvatarBlob = (cacheKey) => {
  const url = cacheKey
    ? `/patient-auth/avatar?v=${encodeURIComponent(cacheKey)}`
    : '/patient-auth/avatar';
  return patientApi.get(url, { responseType: 'blob' });
};
patientAuth.getMyComplexes = () => patientApi.get('/patient-auth/my-complexes');
patientAuth.getMyComplex = (id) => patientApi.get(`/patient-auth/my-complexes/${id}`);
// Custom Audio (CA2/CA3): override'ы звуковых cue'ов раннера.
// uploadSound — FormData (file + cue_name), Content-Type: undefined как у avatar
// (чтобы axios v1 сам выставил multipart boundary, не instance-default json).
patientAuth.listSounds = () => patientApi.get('/patient-auth/audio-sounds');
patientAuth.uploadSound = (formData) => patientApi.post('/patient-auth/audio-sounds', formData, {
  headers: { 'Content-Type': undefined },
});
patientAuth.deleteSound = (cue) => patientApi.delete(`/patient-auth/audio-sounds/${cue}`);
patientAuth.fetchSoundBlob = (cue) =>
  patientApi.get(`/patient-auth/audio-sounds/${cue}/file`, { responseType: 'blob' });
// AA5: program-пресет (дом-карта / звук комплекса) — scoped serve (AA3).
// Для предекода в раннере (loadProgramCues). Blob, как fetchSoundBlob.
patientAuth.fetchProgramPresetBlob = (presetId) =>
  patientApi.get(`/patient-auth/audio-presets/${presetId}/file`, { responseType: 'blob' });
patientAuth.getOAuthProviders = () => patientApi.get('/patient-auth/oauth/providers');

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
  // ARC-CYCLE AC5: продвижение тренировочного дня. Вызывается из ExercisesScreen
  // на границе завершения раннера (НЕ из LOCKED раннера). { block_id, session_id }.
  // Идемпотентно на бэке через last_advanced_session_id.
  advanceTraining: (data) => patientApi.post('/rehab/my/training/advance', data),

  // Фазы (публичные). Wave 1 #1.04: тип обязателен, дефолт 'acl' убран.
  // Caller обязан передать program_type из активной программы пациента.
  getPhases: (type) => api.get(`/rehab/phases?type=${encodeURIComponent(type)}`),
  getProgramTypes: () => api.get('/rehab/program-types'),
  // Шаблоны программ (Wave 1 #1.06 + #1.08b) — публичные endpoints для wizard'а
  // RehabProgramModal. AdminContent CRUD остаётся через admin.*.
  getProgramTemplates: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return api.get(qs ? `/rehab/program-templates?${qs}` : '/rehab/program-templates');
  },
  getProgramTemplatePhases: (id) => api.get(`/rehab/program-templates/${id}/phases`),
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

  // Тренд боли (sparkline) — Checkpoint 6
  getDiaryTrend: (days = 14) =>
    patientApi.get(`/rehab/my/diary/trend?days=${encodeURIComponent(days)}`),

  // Фото дневника (Checkpoint 6)
  uploadDiaryPhoto: (entryId, formData) =>
    patientApi.post(`/rehab/my/diary/${entryId}/photos`, formData, {
      headers: { 'Content-Type': undefined }, // axios сам поставит boundary
    }),
  deleteDiaryPhoto: (entryId, photoId) =>
    patientApi.delete(`/rehab/my/diary/${entryId}/photos/${photoId}`),
  fetchDiaryPhotoBlob: (entryId, photoId) =>
    patientApi.get(`/rehab/my/diary/${entryId}/photos/${photoId}`, {
      responseType: 'blob',
    }),

  // Стрик
  getMyStreak: () => patientApi.get('/rehab/my/streak'),

  // Wave 0 commit 06: статус «застрял ли пациент на фазе»
  getStuckStatus: () => patientApi.get('/rehab/my/stuck-status'),

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

  // Wave 2 #2.05 — Pain tracking
  getPainLocations: () => patientApi.get('/rehab/my/pain-locations'),
  // Pre-load existing daily запись за сегодня (UPSERT pattern в UI)
  getDailyPainToday: () => patientApi.get('/rehab/my/pain?type=daily&limit=1'),
  createDailyPain: (data) => patientApi.post('/rehab/my/pain/daily', data),
  createPainEvent: (data) => patientApi.post('/rehab/my/pain/event', data),
  getPainHistory: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return patientApi.get(qs ? `/rehab/my/pain?${qs}` : '/rehab/my/pain');
  },
  // Recent red-flag alerts для dedup-UX (баннер в PainEventForm)
  getRecentRedFlagAlerts: (hours = 1) =>
    patientApi.get(`/rehab/my/ops-alerts/recent?hours=${encodeURIComponent(hours)}`),

  // Wave 2 #2.06 — Tier 1 measurements (ROM + girth). Flat namespace
  // consistent с pain endpoints выше (drift #28: TZ предлагал nested
  // rehab.measurements.{...}, реально все existing rehab exports — flat).
  // Bilateral L/R pair: один measurement_session_id (BIGINT millis) для пары,
  // два sequential POST'а с side='L' и 'R' (HF#11 закрыл int4 overflow).
  postRomMeasurement: (payload) => patientApi.post('/rehab/my/measurements/rom', payload),
  postGirthMeasurement: (payload) => patientApi.post('/rehab/my/measurements/girth', payload),
  getMeasurements: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return patientApi.get(qs ? `/rehab/my/measurements?${qs}` : '/rehab/my/measurements');
  },

  // Wave 2 #2.09 — Photo capture + consent для ROM measurements.
  // Flat exports per memory #25. Drift #29: blob fetch (не direct <img src=url>)
  // для consistency с uploadDiaryPhoto/fetchDiaryPhotoBlob pattern (line 491+).
  // Drift #30: uploadRomPhoto принимает уже готовый FormData (caller строит),
  // как uploadDiaryPhoto. TZ предлагал принимать `file` напрямую — repo pattern
  // даёт caller'у больше контроля (e.g., можно прикладывать metadata).
  postPhotoConsent: () => patientApi.post('/patient-auth/photo-consent'),
  uploadRomPhoto: (romId, formData) =>
    patientApi.post(`/rehab/my/rom/${romId}/photo`, formData, {
      headers: { 'Content-Type': undefined }, // axios сам поставит boundary
    }),
  fetchRomPhotoBlob: (romId) =>
    patientApi.get(`/rehab/my/rom/${romId}/photo`, { responseType: 'blob' }),
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

  // Критерии перехода фаз (Wave 2 коммит 2.03) — sub-CRUD под каждой фазой.
  // Three types: measurement / self_report / instructor_check (conditional fields).
  // DELETE 409 если есть ссылки из patient_criterion_answers — рекомендует is_active=false.
  getPhaseCriteria: (phaseId, params = {}) => api.get(`/admin/phases/${phaseId}/criteria`, { params }),
  createPhaseCriterion: (phaseId, data) => api.post(`/admin/phases/${phaseId}/criteria`, data),
  updateCriterion: (id, data) => api.put(`/admin/criteria/${id}`, data),
  deleteCriterion: (id) => api.delete(`/admin/criteria/${id}`),

  // Типы программ (Wave 1 #1.05) — CRUD справочника program_types.
  // GET admin/program-types отдаёт всё (включая is_active=false);
  // публичный /rehab/program-types (rehab.getProgramTypes) — только active.
  getProgramTypes: () => api.get('/admin/program-types'),
  createProgramType: (data) => api.post('/admin/program-types', data),
  updateProgramType: (code, data) => api.put(`/admin/program-types/${code}`, data),
  deleteProgramType: (code) => api.delete(`/admin/program-types/${code}`),

  // Шаблоны программ (Wave 1 #1.07) — CRUD program_templates + junction phase_complexes.
  // Используются wizard'ом в RehabProgramModal (1.08b).
  getProgramTemplates: () => api.get('/admin/program-templates'),
  createProgramTemplate: (data) => api.post('/admin/program-templates', data),
  updateProgramTemplate: (id, data) => api.put(`/admin/program-templates/${id}`, data),
  deleteProgramTemplate: (id) => api.delete(`/admin/program-templates/${id}`),
  getPhaseComplexes: (templateId) => api.get(`/admin/program-templates/${templateId}/phase-complexes`),
  upsertPhaseComplex: (templateId, phaseNumber, data) =>
    api.put(`/admin/program-templates/${templateId}/phase-complexes/${phaseNumber}`, data),
  deletePhaseComplex: (templateId, phaseNumber) =>
    api.delete(`/admin/program-templates/${templateId}/phase-complexes/${phaseNumber}`),

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

  // Локации боли (Wave 2 коммит 2.02) — справочник для DiaryScreen multi-select + Pain Event SOS.
  // GET admin/pain-locations отдаёт все (включая is_active=false); фильтр через params.
  // Public endpoint для пациента добавляется в 2.04.
  getPainLocations: (params = {}) => api.get('/admin/pain-locations', { params }),
  getPainLocation: (code) => api.get(`/admin/pain-locations/${encodeURIComponent(code)}`),
  createPainLocation: (data) => api.post('/admin/pain-locations', data),
  updatePainLocation: (code, data) => api.put(`/admin/pain-locations/${encodeURIComponent(code)}`, data),
  deletePainLocation: (code) => api.delete(`/admin/pain-locations/${encodeURIComponent(code)}`),

  // Командный центр (Wave 3 C2/C3/C4) — admin-only, glob authenticateToken + requireAdmin.
  // Параметры (period: '7d'|'30d'|'all', instructor_id, limit, severity) — из API-контракта.
  // Период влияет только на адхеренс-окно и динамику; воронка/сегменты — current-state.
  commandCenter: {
    getSummary:     (params = {}) => api.get('/admin/command-center', { params }),
    getInstructors: (params = {}) => api.get('/admin/command-center/instructors', { params }),
    getAttention:   (params = {}) => api.get('/admin/command-center/attention', { params }),
    getDynamics:    (params = {}) => api.get('/admin/command-center/dynamics', { params }),
  },

  // Custom Audio (AA4) — библиотека пресетов + дом-карта cue (admin-only glob).
  // createAudioPreset/updateAudioPreset принимают уже готовый FormData (caller строит).
  // Content-Type: undefined → axios v1 сам выставит multipart boundary (как uploadAvatar),
  // иначе instance-default application/json блокирует авто-детект FormData. PUT принимает
  // FormData даже для name-only правки (multer парсит текстовые поля).
  getAudioPresets: (params = {}) => api.get('/admin/audio-presets', { params }),
  // kind ('track') идёт в QUERY (бэкенд EA2 читает req.query.kind для выбора multer-
  // лимита 10МБ + хранит kind). Без kind → cue (512КБ, back-compat).
  createAudioPreset: (formData, kind) => api.post('/admin/audio-presets', formData, {
    params: kind ? { kind } : {},
    headers: { 'Content-Type': undefined },
  }),
  updateAudioPreset: (id, formData, kind) => api.put(`/admin/audio-presets/${id}`, formData, {
    params: kind ? { kind } : {},
    headers: { 'Content-Type': undefined },
  }),
  deleteAudioPreset: (id) => api.delete(`/admin/audio-presets/${id}`),
  fetchAudioPresetBlob: (id) =>
    api.get(`/admin/audio-presets/${id}/file`, { responseType: 'blob' }),
  getAudioCueDefaults: () => api.get('/admin/audio-cue-defaults'),
  setAudioCueDefault: (cue, body) => api.put(`/admin/audio-cue-defaults/${cue}`, body),

  // Система
  getSystemInfo: () => api.get('/admin/system'),
};

// =====================================================
// ЭКСПОРТ УТИЛИТ
// =====================================================
export { setTokens, clearTokens, getToken, getRefreshToken, createPatientJwtApi, patientApi };
