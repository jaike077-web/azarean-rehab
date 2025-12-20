# AGENTS.md — Инструкции для AI-агентов

## Проект: Azarean Network

Платформа реабилитации для физиотерапевтических студий. Специализация: плечо и колено.

### Роли пользователей:
- **Администраторы** — управление системой
- **Инструкторы** — создание комплексов упражнений для пациентов
- **Пациенты** — доступ к программам по уникальной ссылке (без регистрации)

---

## Технический стек

### Frontend:
- React 19 (Create React App)
- React Router DOM
- Axios для API
- @dnd-kit для drag-and-drop
- lucide-react для иконок
- CSS (без препроцессоров)

### Backend:
- Node.js + Express
- PostgreSQL
- JWT авторизация
- Helmet.js, express-rate-limit

### Видео:
- Kinescope (внешний хостинг)

---

## Структура проекта
```
Azarean_rehab/
├── frontend/
│   └── src/
│       ├── pages/           # Страницы (роуты)
│       ├── components/      # Переиспользуемые компоненты
│       ├── context/         # React Context (Toast, Auth)
│       ├── services/        # API клиент (api.js)
│       └── App.js           # Роутинг
├── backend/
│   ├── routes/              # API эндпоинты
│   ├── middleware/          # auth.js
│   ├── database/            # db.js (PostgreSQL)
│   └── server.js            # Express сервер
└── AGENTS.md                # Этот файл
```

---

## Правила и паттерны

### Иконки:
- Использовать ТОЛЬКО `lucide-react`
- НЕ использовать эмодзи в UI
- Пример: `import { Check, X, Folder } from 'lucide-react';`

### CSS:
- Fluid design с `clamp()` для размеров
- CSS Grid с `auto-fit` для сеток
- Относительные единицы (rem, vw, vh)
- Минимум медиа-запросов (только критичные)
- Единый радиус: `8px`, `10px`, `12px`
- Единые тени: `0 2px 8px rgba(0,0,0,0.08)`

### Компоненты:
- Toast уведомления через `useToast()` из `ToastContext`
- Loading состояния через `Skeleton` компоненты
- BackButton и Breadcrumbs для навигации на отдельных страницах

### API:
- Все запросы через `frontend/src/services/api.js`
- Паттерн ответа: `response.data.items` или `response.data`
- Fallback: `const data = response.data.items || response.data || []`

### База данных:
- Использовать `query()` из `../database/db`
- НЕ использовать `pool.query` напрямую

---

## Что МОЖНО делать

✅ Очищать unused imports
✅ Заменять эмодзи на lucide-react
✅ Добавлять aria-label на кнопки
✅ Улучшать CSS стили (сохраняя паттерны)
✅ Добавлять loading skeletons
✅ Исправлять ESLint warnings
✅ Оптимизировать производительность

---

## Что НЕЛЬЗЯ трогать без согласования

❌ Структуру роутинга (App.js)
❌ Логику авторизации (auth.js, ProtectedRoute)
❌ Схему базы данных
❌ API эндпоинты (изменение контрактов)
❌ Конфигурацию сервера (server.js)
❌ Удаление функционала

---

## Ключевые файлы

### Frontend (часто редактируемые):
- `pages/PatientView.js` — страница пациента (приоритет UX)
- `pages/CreateComplex.js` — создание комплекса
- `pages/MyComplexes.js` — список комплексов и шаблонов
- `pages/Patients.js` — управление пациентами
- `components/Skeleton.js` — loading состояния

### Backend (осторожно):
- `routes/complexes.js` — CRUD комплексов
- `routes/templates.js` — CRUD шаблонов
- `routes/progress.js` — прогресс пациента

---

## Текущие задачи (backlog)

### P0 (критично):
- [x] Loading skeletons
- [x] Шаблоны комплексов
- [x] Пагинация/поиск в MyComplexes

### P1 (важно):
- [ ] PatientView редизайн (светлый фон, мобильная адаптация)
- [ ] Редактирование упражнений в шаблоне
- [ ] Заменить эмодзи на lucide в PatientView

### P2 (улучшения):
- [ ] Очистить ESLint warnings
- [ ] Security: проверка доступа к прогрессу
- [ ] Конфигурируемый URL для production

---

## Команды
```bash
# Frontend
cd frontend
npm start        # Dev server (localhost:3000)
npm run build    # Production build
npm run lint     # ESLint

# Backend
cd backend
npm run dev      # Dev server с nodemon (localhost:5000)
npm start        # Production
```

---

## Контакты

Разработчик: Вадим
Проект: Azarean Network
Статус: Активная разработка