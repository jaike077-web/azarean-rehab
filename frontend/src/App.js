import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { PatientAuthProvider, usePatientAuth } from './context/PatientAuthContext';
import { ToastProvider } from './context/ToastContext';
import LoadingSpinner from './components/LoadingSpinner';
import PatientSplash from './components/PatientSplash';
import ErrorBoundary from './components/ErrorBoundary';

// Критические страницы - загружаются сразу
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';

// Ленивая загрузка страниц
const Patients = lazy(() => import('./pages/Patients'));
const ViewProgress = lazy(() => import('./pages/ViewProgress'));
const PatientProgress = lazy(() => import('./pages/PatientProgress'));
const MyComplexes = lazy(() => import('./pages/MyComplexes'));
const EditComplex = lazy(() => import('./pages/EditComplex'));
const EditTemplate = lazy(() => import('./pages/EditTemplate'));
const CreateComplex = lazy(() => import('./pages/CreateComplex'));
const Trash = lazy(() => import('./pages/Trash'));
const Exercises = lazy(() => import('./pages/Exercises/Exercises'));
const ExerciseDetail = lazy(() => import('./pages/Exercises/ExerciseDetail'));

// Авторизация пациентов (Спринт 0.1)
const PatientLogin = lazy(() => import('./pages/PatientAuth/PatientLogin'));
const PatientRegister = lazy(() => import('./pages/PatientAuth/PatientRegister'));
const PatientForgotPassword = lazy(() => import('./pages/PatientAuth/PatientForgotPassword'));
const PatientResetPassword = lazy(() => import('./pages/PatientAuth/PatientResetPassword'));

// Пациентский дашборд (Спринт 1.2)
const PatientDashboard = lazy(() => import('./pages/PatientDashboard/PatientDashboard'));

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

// Защищённый роут для пациентов (после миграции #11 — через cookie + контекст).
// Пока PatientAuthProvider делает getMe() — показываем PatientSplash
// (а не Login-форму), это закрывает баг #12 (F5 flicker).
function PatientRoute({ children }) {
  const { patient, loading } = usePatientAuth();
  if (loading) {
    return <PatientSplash />;
  }
  if (!patient) {
    return <Navigate to="/patient-login" state={{ from: '/patient-dashboard' }} />;
  }
  return children;
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
      {/* ПАЦИЕНТСКИЕ РОУТЫ — один PatientAuthProvider на все */}
      {/* ========================== */}
      <Route element={<PatientAuthProvider><Outlet /></PatientAuthProvider>}>
        <Route path="/patient-login" element={<PatientLogin />} />
        <Route path="/patient-register" element={<PatientRegister />} />
        <Route path="/patient-forgot-password" element={<PatientForgotPassword />} />
        <Route path="/patient-reset-password/:token" element={<PatientResetPassword />} />
        <Route
          path="/patient-dashboard"
          element={
            <PatientRoute>
              <PatientDashboard />
            </PatientRoute>
          }
        />
      </Route>

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
