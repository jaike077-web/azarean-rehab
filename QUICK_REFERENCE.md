# ⚡ QUICK REFERENCE - AZAREAN NETWORK

## 🚀 Быстрый старт в новом чате

### 1. Загрузи этот файл Claude:
```
ПРОЕКТ_ПОЛНЫЙ_КОНТЕКСТ.md (главный файл)
```

### 2. Скажи Claude:
```
"Я продолжаю разработку Azarean Network. 
Контекст проекта в прикреплённом файле. 
Готов к работе?"
```

---

## 🔑 КРИТИЧЕСКИ ВАЖНЫЕ МОМЕНТЫ

### Backend Routes Pattern
```javascript
// ✅ ВСЕГДА ТАК
const { query } = require('../database/db');
const { authenticateToken } = require('../middleware/auth');

const result = await query('SELECT...', [params]);
```

### API Service Pattern
```javascript
// В api.js
export const name = {
  getAll: () => api.get('/endpoint'),
  // ...
};
```

### Dashboard Integration
```javascript
import Component from './Component';
import { IconName } from 'lucide-react';

case 'tab': return <Component />;

<button className={`nav-item ${activeTab === 'tab' ? 'active' : ''}`}>
  <IconName className="nav-icon" size={18} />
  <span>Название</span>
</button>
```

### Response Handling
```javascript
const response = await api.call();
const data = response.data?.field || response.field || [];
```

---

## 📁 СТРУКТУРА ПРОЕКТА

```
backend/
├── database/db.js ← query() здесь
├── middleware/auth.js ← authenticateToken
├── routes/*.js
└── server.js

frontend/src/
├── pages/
│   ├── Dashboard.js ← главный контейнер
│   ├── [Tab].js + [Tab].css ← вкладки Dashboard
│   └── [Page].js + [Page].css ← отдельные роуты
├── services/api.js
└── context/ToastContext.js
```

---

## 🗄️ БАЗА ДАННЫХ

### Главные таблицы:
- `users` (email, password_hash, role)
- `patients` (full_name, created_by)
- `diagnoses` (name, recommendations, warnings) ← НОВАЯ
- `exercises` (title, video_url, body_region)
- `complexes` (patient_id, diagnosis_id, access_token)
- `complex_exercises` (complex_id, exercise_id, order_number)
- `progress_logs` (complex_id, exercise_id, completed)

### Soft Delete:
```sql
UPDATE table SET deleted_at = NOW() WHERE id = $1
```

---

## 🎨 ДИЗАЙН СИСТЕМА

### Цвета:
- Primary: `#667eea` (фиолетовый)
- Edit button: `#ebf8ff` (голубой фон), `#3182ce` (синий текст)
- Delete button: `#fff5f5` (розовый фон), `#c53030` (красный текст)

### Responsive:
```css
/* ✅ Используй */
font-size: clamp(14px, 2vw, 16px);
padding: clamp(12px, 3vw, 20px);
grid-template-columns: repeat(auto-fill, minmax(min(320px, 100%), 1fr));

/* ❌ Избегай */
@media (max-width: 768px) { ... }
```

### Кнопки:
```css
min-height: 44px; /* Touch-friendly */
border-radius: 10px;
transition: all 0.2s;
```

---

## 🐛 ТИПИЧНЫЕ ОШИБКИ

### 1. Module not found in backend
```javascript
// ❌ НЕПРАВИЛЬНО
const pool = require('../config/database');

// ✅ ПРАВИЛЬНО
const { query } = require('../database/db');
```

### 2. App before initialization
```javascript
// ❌ НЕПРАВИЛЬНО
const route = require('./routes/...');
app.use('/api/...', route);
const app = express(); // app создан ПОСЛЕ

// ✅ ПРАВИЛЬНО
const app = express(); // СНАЧАЛА создать app
// ... middleware ...
app.use('/api/...', require('./routes/...'));
```

### 3. Duplicate exports
```javascript
// ❌ НЕПРАВИЛЬНО
export const name = { ... }; // строка 50
export const name = { ... }; // строка 150 - ДУБЛИКАТ!

// ✅ ПРАВИЛЬНО
// Оставить только ОДИН export
```

### 4. API response
```javascript
// ❌ НЕПРАВИЛЬНО
const data = response.data;

// ✅ ПРАВИЛЬНО
const data = response.data?.field || response.field || [];
```

---

## 🔧 ЧАСТЫЕ КОМАНДЫ

```bash
# Backend
cd backend && npm run dev

# Frontend
cd frontend && npm start

# Clear cache
npm cache clean --force
rm -rf node_modules && npm install

# Hard reload browser
Ctrl + Shift + R

# PostgreSQL
psql -U postgres -d azarean_db
```

---

## 📊 ТЕКУЩИЙ СТАТУС

- ✅ Authentication (JWT)
- ✅ Patients CRUD
- ✅ Diagnoses CRUD ← НОВОЕ (18.12.2024)
- ✅ Exercises library
- ✅ Complex creation (DnD)
- ✅ Progress tracking
- ✅ Trash/restore
- ✅ Toast notifications
- ✅ Security (helmet, rate-limit)
- 🟡 Loading skeletons (partial)
- ⬜ Testing (not implemented)

**Overall: 85/100**

---

## 🎯 API ENDPOINTS QUICK LIST

```
AUTH:      POST /api/auth/login|register, GET /api/auth/me
PATIENTS:  GET|POST /api/patients, GET /api/patients/trash
DIAGNOSES: GET|POST /api/diagnoses ← NEW!
COMPLEXES: GET|POST /api/complexes, GET /api/complexes/token/:token
EXERCISES: GET|POST /api/exercises
PROGRESS:  POST /api/progress, GET /api/progress/complex/:id
```

---

## 💡 ПОЛЕЗНЫЕ ССЫЛКИ

- Полный контекст: `ПРОЕКТ_ПОЛНЫЙ_КОНТЕКСТ.md`
- Сводка сессии: `СЕССИЯ_СВОДКА.md`
- Backend: `localhost:5000`
- Frontend: `localhost:3000`

---

## 🚨 ВАЖНО ПОМНИТЬ

1. **Backend импорты:** `const { query } = require('../database/db');`
2. **API fallback:** `response.data?.field || response.field || []`
3. **Soft delete:** `deleted_at` вместо DELETE
4. **Dashboard tabs:** Внутри Dashboard, отдельные страницы - вне
5. **Touch-friendly:** `min-height: 44px` для всех кнопок
6. **Fluid design:** `clamp()` вместо медиа-запросов
7. **Toast:** `toast.success()` / `toast.error()`

---

**Этого достаточно для 80% типичных задач! 🎯**
