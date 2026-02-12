import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { rehab } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import HomeScreen from './components/HomeScreen';
import RoadmapScreen from './components/RoadmapScreen';
import DiaryScreen from './components/DiaryScreen';
import ContactScreen from './components/ContactScreen';
import ExercisesScreen from './components/ExercisesScreen';
import ProfileScreen from './components/ProfileScreen';
import './PatientDashboard.css';

const NAV = [
  { id: 0, icon: '🏠', label: 'Главная' },
  { id: 1, icon: '🗺️', label: 'Путь' },
  { id: 4, icon: '🏋️', label: 'Упражнения', accent: true },
  { id: 2, icon: '📝', label: 'Дневник' },
  { id: 3, icon: '💬', label: 'Связь' },
];

const StreakBadge = ({ days, best, atRisk }) => {
  let statusText = '';
  if (atRisk) {
    statusText = 'Риск потери';
  } else if (days === best && days > 0) {
    statusText = 'Рекорд!';
  } else if (best > 0) {
    statusText = `Рекорд: ${best}`;
  }

  return (
    <div className="pd-streak">
      <span className="pd-streak-emoji">🔥</span>
      <div className="pd-streak-info">
        <div className="pd-streak-days">{days}</div>
        {statusText && <div className="pd-streak-status">{statusText}</div>}
      </div>
    </div>
  );
};

export { StreakBadge };

export default function PatientDashboard() {
  const [screen, setScreen] = useState(0);
  const [dashboardData, setDashboardData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const scrollRef = useRef(null);
  const toast = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    const disclaimerAccepted = localStorage.getItem('patient_disclaimer_accepted');
    if (!disclaimerAccepted) {
      setShowDisclaimer(true);
    }
  }, []);

  useEffect(() => {
    const link = document.createElement('link');
    link.href = 'https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&family=Outfit:wght@400;500;600;700&display=swap';
    link.rel = 'stylesheet';
    document.head.appendChild(link);

    return () => {
      document.head.removeChild(link);
    };
  }, []);

  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        setLoading(true);
        const response = await rehab.getDashboard();
        setDashboardData(response.data.data || response.data);
      } catch (error) {
        console.error('Failed to fetch dashboard:', error);
        toast.error('Ошибка загрузки', 'Не удалось загрузить данные панели');
      } finally {
        setLoading(false);
      }
    };

    fetchDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [screen]);

  const handleAcceptDisclaimer = () => {
    localStorage.setItem('patient_disclaimer_accepted', 'true');
    setShowDisclaimer(false);
  };

  const handleLogout = () => {
    localStorage.removeItem('patient_token');
    navigate('/patient-login');
  };

  const renderScreen = () => {
    if (loading) {
      return (
        <div className="pd-loading" data-testid="loading-skeleton">
          <div className="pd-skeleton pd-skeleton-header"></div>
          <div className="pd-skeleton pd-skeleton-card"></div>
          <div className="pd-skeleton pd-skeleton-card"></div>
        </div>
      );
    }

    const screenProps = {
      dashboardData,
      goTo: setScreen,
      handleLogout,
    };

    switch (screen) {
      case 0:
        return <HomeScreen {...screenProps} />;
      case 1:
        return <RoadmapScreen {...screenProps} />;
      case 2:
        return <DiaryScreen {...screenProps} />;
      case 3:
        return <ContactScreen {...screenProps} />;
      case 4:
        return <ExercisesScreen {...screenProps} />;
      case 5:
        return <ProfileScreen {...screenProps} />;
      default:
        return <HomeScreen {...screenProps} />;
    }
  };

  return (
    <div className="pd-container">
      {showDisclaimer && (
        <div className="pd-disclaimer">
          <div className="pd-disclaimer-content">
            <div className="pd-disclaimer-icon">
              <div className="pd-disclaimer-icon-gradient">
                <span className="pd-disclaimer-icon-emoji">🛡️</span>
              </div>
            </div>

            <h1 className="pd-disclaimer-title">Добро пожаловать в Azarean</h1>
            <p className="pd-disclaimer-subtitle">Ваш персональный помощник по реабилитации</p>

            <div className="pd-disclaimer-card">
              <h3 className="pd-disclaimer-card-title">Важная информация</h3>
              <p className="pd-disclaimer-card-text">
                Данное приложение предназначено для информационной поддержки процесса реабилитации и не заменяет консультацию
                с квалифицированным медицинским специалистом. Все рекомендации должны быть согласованы с вашим лечащим врачом или
                физиотерапевтом. Не начинайте выполнение упражнений без одобрения специалиста.
              </p>
            </div>

            <div className="pd-disclaimer-card">
              <h3 className="pd-disclaimer-card-title">Обработка данных</h3>
              <p className="pd-disclaimer-card-text">
                Мы обрабатываем ваши персональные данные в соответствии с требованиями GDPR и ФЗ-152 "О персональных данных".
                Ваши медицинские данные хранятся в зашифрованном виде и используются исключительно для обеспечения процесса
                реабилитации. Продолжая использование приложения, вы соглашаетесь с условиями обработки данных.
              </p>
            </div>

            <button className="pd-disclaimer-btn" onClick={handleAcceptDisclaimer}>
              Начать
            </button>
          </div>
        </div>
      )}

      <header className="pd-header">
        <div className="pd-header-logo">
          <div className="pd-header-logo-dot"></div>
          <span className="pd-header-logo-text">AZAREAN</span>
        </div>
        <div className="pd-header-right">
          {dashboardData?.streak && (
            <StreakBadge
              days={dashboardData.streak.current}
              best={dashboardData.streak.best}
              atRisk={dashboardData.streak.atRisk}
            />
          )}
          <button
            className={`pd-header-avatar-btn ${screen === 5 ? 'pd-header-avatar-btn--active' : ''}`}
            onClick={() => setScreen(5)}
            aria-label="Профиль"
          >
            <span className="pd-header-avatar-icon">👤</span>
          </button>
        </div>
      </header>

      <div className="pd-content" ref={scrollRef}>
        <div className="pd-fade-in">
          {renderScreen()}
        </div>
      </div>

      <nav className="pd-bottom-nav">
        {NAV.map((item) => (
          <button
            key={item.id}
            className={`pd-nav-btn ${screen === item.id ? 'pd-nav-btn--active' : ''} ${item.accent ? 'pd-nav-btn--accent' : ''}`}
            onClick={() => setScreen(item.id)}
          >
            {item.accent ? (
              <div className="pd-nav-btn-circle">
                <span className="pd-nav-btn-icon">{item.icon}</span>
              </div>
            ) : (
              <span className="pd-nav-btn-icon">{item.icon}</span>
            )}
            <span className="pd-nav-btn-label">{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
