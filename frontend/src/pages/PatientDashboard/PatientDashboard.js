import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Home, Map, Dumbbell, FileText, MessageCircle, Flame, Shield } from 'lucide-react';
import { rehab } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { usePatientAuth } from '../../context/PatientAuthContext';
import HomeScreen from './components/HomeScreen';
import RoadmapScreen from './components/RoadmapScreen';
import DiaryScreen from './components/DiaryScreen';
import ContactScreen from './components/ContactScreen';
import ExercisesScreen from './components/ExercisesScreen';
import ProfileScreen from './components/ProfileScreen';
import { TabBar, AvatarBtn } from './components/ui';
import './PatientDashboard.css';

const NAV = [
  { id: 0, Icon: Home, label: 'Главная' },
  { id: 1, Icon: Map, label: 'Путь' },
  { id: 4, Icon: Dumbbell, label: 'Упражнения', accent: true },
  { id: 2, Icon: FileText, label: 'Дневник' },
  { id: 3, Icon: MessageCircle, label: 'Связь' },
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
      <Flame size={16} className="pd-streak-emoji" />
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
  const [screenParams, setScreenParams] = useState(null);
  const [dashboardData, setDashboardData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  // Profile теперь не таб, а full-screen overlay поверх любого экрана.
  const [profileOpen, setProfileOpen] = useState(false);
  const scrollRef = useRef(null);
  const toast = useToast();
  const navigate = useNavigate();
  const { patient, logout: ctxLogout } = usePatientAuth();
  const initial = (patient?.full_name || '?').trim().charAt(0).toUpperCase() || '?';

  useEffect(() => {
    const disclaimerAccepted = localStorage.getItem('patient_disclaimer_accepted');
    if (!disclaimerAccepted) {
      setShowDisclaimer(true);
    }
  }, []);

  useEffect(() => {
    const link = document.createElement('link');
    link.href = 'https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Nunito+Sans:opsz,wght@6..12,400;6..12,500;6..12,600;6..12,700&display=swap';
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
        setDashboardData(response.data);
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

  const handleLogout = async () => {
    await ctxLogout();
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

    const goTo = (id, params = null) => {
      setScreen(id);
      setScreenParams(params);
    };

    // onOpenProfile передаётся в каждый экран — внутри они вызывают
    // через AvatarBtn в правом верхнем углу. Profile рендерится отдельно
    // как overlay (см. ниже), поэтому в switch его больше нет.
    const screenProps = {
      dashboardData,
      goTo,
      screenParams,
      handleLogout,
      onOpenProfile: () => setProfileOpen(true),
      patient,
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
                <Shield size={18} className="pd-disclaimer-icon-emoji" />
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
          {/* Avatar в правом верхнем — единая точка входа в Profile overlay
              со всех экранов. AvatarBtn также появится в шапках каждого
              экрана при их редизайне (Checkpoints 4–7). */}
          <AvatarBtn
            initial={initial}
            onClick={() => setProfileOpen(true)}
            ariaLabel="Профиль"
          />
        </div>
      </header>

      <div className="pd-content" ref={scrollRef}>
        <div className="pd-fade-in">
          {renderScreen()}
        </div>
      </div>

      <TabBar
        items={NAV}
        activeId={screen}
        onChange={(id) => { setScreen(id); setScreenParams(null); }}
      />

      {/* Profile overlay — full-screen, поверх дашборда. Закрывается стрелкой
          назад в шапке Profile (передаётся через onClose). */}
      {profileOpen && (
        <ProfileScreen
          onClose={() => setProfileOpen(false)}
          handleLogout={handleLogout}
          goTo={(id) => { setProfileOpen(false); setScreen(id); setScreenParams(null); }}
        />
      )}
    </div>
  );
}
