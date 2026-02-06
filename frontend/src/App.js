import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import LoadingSpinner from './components/LoadingSpinner';
import ErrorBoundary from './components/ErrorBoundary';

// Критические страницы - загружаются сразу
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';

// Ленивая загрузка страниц
const Patients = lazy(() => import('./pages/Patients'));
const PatientView = lazy(() => import('./pages/PatientView'));
const ViewProgress = lazy(() => import('./pages/ViewProgress'));
const PatientProgress = lazy(() => import('./pages/PatientProgress'));
const MyComplexes = lazy(() => import('./pages/MyComplexes'));
const EditComplex = lazy(() => import('./pages/EditComplex'));
const EditTemplate = lazy(() => import('./pages/EditTemplate'));
const CreateComplex = lazy(() => import('./pages/CreateComplex'));
const Trash = lazy(() => import('./pages/Trash'));
const Exercises = lazy(() => import('./pages/Exercises/Exercises'));
const ExerciseDetail = lazy(() => import('./pages/Exercises/ExerciseDetail'));

// Защищённый роут
function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        height: '100vh',
        fontSize: '24px',
        color: '#667eea'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>⏳</div>
          Загрузка...
        </div>
      </div>
    );
  }

  return user ? children : <Navigate to="/login" />;
}

function AppRoutes() {
  const { user } = useAuth();

  return (
    <Suspense fallback={<LoadingSpinner message="Загрузка страницы..." />}>
      <Routes>
      {/* ========================== */}
      {/* АВТОРИЗАЦИЯ */}
      {/* ========================== */}
      <Route 
        path="/login" 
        element={user ? <Navigate to="/dashboard" /> : <Login />} 
      />

      {/* ========================== */}
      {/* ГЛАВНАЯ */}
      {/* ========================== */}
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      
      <Route 
        path="/" 
        element={<Navigate to="/dashboard" />} 
      />

      {/* ========================== */}
      {/* ПАЦИЕНТЫ */}
      {/* ========================== */}
      <Route 
        path="/patients"
        element={
          <ProtectedRoute>
            <Patients />
          </ProtectedRoute>
        } 
      />

      {/* ========================== */}
      {/* КОМПЛЕКСЫ */}
      {/* ========================== */}
      <Route 
        path="/my-complexes"
        element={
          <ProtectedRoute>
            <MyComplexes />
          </ProtectedRoute>
        } 
      />

      <Route 
        path="/create-complex"
        element={
          <ProtectedRoute>
            <CreateComplex />
          </ProtectedRoute>
        } 
      />

      <Route 
        path="/create-complex/:patientId"
        element={
          <ProtectedRoute>
            <CreateComplex />
          </ProtectedRoute>
        } 
      />

      <Route 
        path="/complex/edit/:id" 
        element={
          <ProtectedRoute>
            <EditComplex />
          </ProtectedRoute>
        } 
      />

      <Route 
        path="/templates/:id/edit" 
        element={
          <ProtectedRoute>
            <EditTemplate />
          </ProtectedRoute>
        } 
      />

      {/* ========================== */}
      {/* ПРОГРЕСС */}
      {/* ========================== */}
      <Route 
        path="/progress/:complexId" 
        element={
          <ProtectedRoute>
            <ViewProgress />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/patient-progress/:patientId" 
        element={
          <ProtectedRoute>
            <PatientProgress />
          </ProtectedRoute>
        } 
      />

      {/* ========================== */}
      {/* БИБЛИОТЕКА УПРАЖНЕНИЙ */}
      {/* ========================== */}
      <Route 
        path="/exercises" 
        element={
          <ProtectedRoute>
            <Exercises />
          </ProtectedRoute>
        } 
      />

      <Route 
        path="/exercises/:id" 
        element={
          <ProtectedRoute>
            <ExerciseDetail />
          </ProtectedRoute>
        } 
      />

      {/* ========================== */}
      {/* КОРЗИНА */}
      {/* ========================== */}
      <Route 
        path="/trash"
        element={
          <ProtectedRoute>
            <Trash />
          </ProtectedRoute>
        } 
      />

      {/* ========================== */}
      {/* ПУБЛИЧНЫЕ СТРАНИЦЫ (без авторизации) */}
      {/* ========================== */}
      
      {/* Страница пациента по токену */}
      <Route 
        path="/patient/:token" 
        element={<PatientView />} 
      />

      {/* ========================== */}
      {/* 404 */}
      {/* ========================== */}
      <Route 
        path="*" 
        element={
          <div style={{ 
            display: 'flex', 
            flexDirection: 'column',
            alignItems: 'center', 
            justifyContent: 'center', 
            height: '100vh',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '72px', marginBottom: '16px' }}>🔍</div>
            <h1 style={{ fontSize: '32px', color: '#2d3748', marginBottom: '8px' }}>
              Страница не найдена
            </h1>
            <p style={{ fontSize: '18px', color: '#718096', marginBottom: '24px' }}>
              Запрашиваемая страница не существует
            </p>
            <a 
              href="/dashboard" 
              style={{ 
                padding: '12px 24px', 
                background: '#667eea', 
                color: 'white', 
                borderRadius: '8px',
                textDecoration: 'none',
                fontWeight: '600'
              }}
            >
              На главную
            </a>
          </div>
        }
      />
      </Routes>
    </Suspense>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <ToastProvider>
          <Router>
            {/* Skip link для accessibility - появляется при нажатии Tab */}
            <a href="#main-content" className="skip-link">
              Перейти к содержимому
            </a>
            <main id="main-content">
              <AppRoutes />
            </main>
          </Router>
        </ToastProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
