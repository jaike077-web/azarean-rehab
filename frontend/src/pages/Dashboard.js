import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Patients from './Patients';
import CreateComplex from './CreateComplex';
import MyComplexes from './MyComplexes';
import Trash from './Trash';
import ImportExercises from './ImportExercises';
import ProgressDashboard from './ProgressDashboard';
import './Dashboard.css';
import Diagnoses from './Diagnoses';
import {
  Activity,
  BarChart3,
  LayoutDashboard,
  Users,
  Dumbbell,
  ListPlus,
  ClipboardList,
  Trash2,
  Search,
  UserPlus,
  HeartHandshake,
  FileText,
  Upload,
  Shield,
  ScrollText,
  Database,
  Server,
} from 'lucide-react';
import AdminStats from './Admin/AdminStats';
import AdminUsers from './Admin/AdminUsers';
import AdminAuditLogs from './Admin/AdminAuditLogs';
import AdminContent from './Admin/AdminContent';
import AdminSystem from './Admin/AdminSystem';

function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState('home');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('home') === '1') {
      setActiveTab('home');
    }
  }, [location.search]);

  // Закрываем меню при изменении размера окна
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 768) {
        setIsMobileMenuOpen(false);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Блокируем скролл body когда меню открыто
  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isMobileMenuOpen]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleNavClick = (tab) => {
    setActiveTab(tab);
    setIsMobileMenuOpen(false); // Закрываем меню при выборе пункта
  };

  const handleExercisesClick = () => {
    navigate('/exercises');
    setIsMobileMenuOpen(false);
  };

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'patients':
        return <Patients />;
      case 'progress':
        return <ProgressDashboard />;
      case 'complexes':
        return <CreateComplex />;
      case 'my-complexes':
        return <MyComplexes />;
      case 'diagnoses':
        return <Diagnoses />;
      case 'import':
        return <ImportExercises />;
      case 'trash':
        return <Trash />;
      case 'admin-stats':
        return <AdminStats />;
      case 'admin-users':
        return <AdminUsers />;
      case 'admin-audit':
        return <AdminAuditLogs />;
      case 'admin-content':
        return <AdminContent />;
      case 'admin-system':
        return <AdminSystem />;
      default:
        return (
          <div className="welcome-section">
            <h2 className="welcome-title">
              <span>Добро пожаловать, {user?.full_name}!</span>
              <HeartHandshake className="welcome-icon" size={26} />
            </h2>

            <p>Выберите раздел в меню для начала работы</p>

            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-icon">
                  <Users size={24} />
                </div>
                <div className="stat-info">
                  <div className="stat-value">0</div>
                  <div className="stat-label">Пациентов</div>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-icon">
                  <ClipboardList size={24} />
                </div>
                <div className="stat-info">
                  <div className="stat-value">0</div>
                  <div className="stat-label">Комплексов</div>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-icon">
                  <Activity size={24} />
                </div>
                <div className="stat-info">
                  <div className="stat-value">0%</div>
                  <div className="stat-label">Выполнение</div>
                </div>
              </div>

              <div
                className="stat-card"
                onClick={() => navigate('/exercises')}
                style={{ cursor: 'pointer' }}
              >
                <div className="stat-icon">
                  <Dumbbell size={24} />
                </div>
                <div className="stat-info">
                  <div className="stat-value">10</div>
                  <div className="stat-label">Упражнений</div>
                </div>
              </div>
            </div>

            <div className="quick-actions">
              <h3>Быстрые действия</h3>
              <div className="actions-grid">
                <button className="action-card" onClick={() => handleNavClick('patients')}>
                  <UserPlus className="action-icon" size={20} />
                  <span className="action-text">Добавить пациента</span>
                </button>

                <button className="action-card" onClick={() => handleNavClick('complexes')}>
                  <ListPlus className="action-icon" size={20} />
                  <span className="action-text">Создать комплекс</span>
                </button>

                <button className="action-card" onClick={handleExercisesClick}>
                  <Search className="action-icon" size={20} />
                  <span className="action-text">Найти упражнение</span>
                </button>
              </div>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <div className="header-left">
          {/* Бургер-кнопка для мобильных */}
          <button 
            className={`burger-menu-btn ${isMobileMenuOpen ? 'active' : ''}`}
            onClick={toggleMobileMenu}
            aria-label="Открыть меню"
          >
            <div className="burger-icon">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </button>

          <div className="app-brand">
            <img
              src="/AN-logo.jpg"
              alt="Azarean Network"
              className="app-logo"
            />
            <div className="app-brand-text">
              <div className="app-brand-title">Azarean Network</div>
              <div className="app-brand-subtitle">Система реабилитации</div>
            </div>
          </div>
        </div>

        <div className="header-right">
          <span className="user-name">{user?.full_name}</span>
          <span className="user-role">
            {user?.role === 'admin' ? 'Администратор' : 'Инструктор'}
          </span>
          <button onClick={handleLogout} className="btn-logout">
            Выйти
          </button>
        </div>
      </header>

      <div className="dashboard-content">
        {/* Overlay для закрытия меню */}
        <div 
          className={`nav-overlay ${isMobileMenuOpen ? 'visible' : ''}`}
          onClick={() => setIsMobileMenuOpen(false)}
        />

        {/* Навигация */}
        <nav className={`dashboard-nav ${isMobileMenuOpen ? 'open' : ''}`}>
          <button 
            className={`nav-item ${activeTab === 'home' ? 'active' : ''}`}
            onClick={() => handleNavClick('home')}
          >
            <LayoutDashboard className="nav-icon" size={18} />
            <span>Главная</span>
          </button>

          <button 
            className={`nav-item ${activeTab === 'patients' ? 'active' : ''}`}
            onClick={() => handleNavClick('patients')}
          >
            <Users className="nav-icon" size={18} />
            <span>Пациенты</span>
          </button>

          <button
            className={`nav-item ${activeTab === 'progress' ? 'active' : ''}`}
            onClick={() => handleNavClick('progress')}
          >
            <BarChart3 className="nav-icon" size={18} />
            <span>Прогресс пациентов</span>
          </button>

          <button 
            className={`nav-item ${activeTab === 'exercises' ? 'active' : ''}`}
            onClick={handleExercisesClick}
          >
            <Dumbbell className="nav-icon" size={18} />
            <span>Библиотека упражнений</span>
          </button>

          <button 
  className={`nav-item ${activeTab === 'diagnoses' ? 'active' : ''}`}
  onClick={() => handleNavClick('diagnoses')}
>
  <FileText className="nav-icon" size={18} />
  <span>Диагнозы</span>
</button>

          <button 
            className={`nav-item ${activeTab === 'complexes' ? 'active' : ''}`}
            onClick={() => handleNavClick('complexes')}
          >
            <ListPlus className="nav-icon" size={18} />
            <span>Создать комплекс</span>
          </button>

          <button 
            className={`nav-item ${activeTab === 'my-complexes' ? 'active' : ''}`}
            onClick={() => handleNavClick('my-complexes')}
          >
            <ClipboardList className="nav-icon" size={18} />
            <span>Мои комплексы</span>
          </button>

          <button 
            className={`nav-item ${activeTab === 'import' ? 'active' : ''}`}
            onClick={() => handleNavClick('import')}
          >
            <Upload className="nav-icon" size={18} />
            <span>Импорт упражнений</span>
          </button>

          <button 
            className={`nav-item ${activeTab === 'trash' ? 'active' : ''}`}
            onClick={() => handleNavClick('trash')}
          >
            <Trash2 className="nav-icon" size={18} />
            <span>Корзина</span>
          </button>

          {user?.role === 'admin' && (
            <>
              <div className="nav-divider" />
              <button className={`nav-item ${activeTab === 'admin-stats' ? 'active' : ''}`} onClick={() => handleNavClick('admin-stats')}>
                <Shield className="nav-icon" size={18} />
                <span>Статистика</span>
              </button>
              <button className={`nav-item ${activeTab === 'admin-users' ? 'active' : ''}`} onClick={() => handleNavClick('admin-users')}>
                <Users className="nav-icon" size={18} />
                <span>Пользователи</span>
              </button>
              <button className={`nav-item ${activeTab === 'admin-audit' ? 'active' : ''}`} onClick={() => handleNavClick('admin-audit')}>
                <ScrollText className="nav-icon" size={18} />
                <span>Журнал аудита</span>
              </button>
              <button className={`nav-item ${activeTab === 'admin-content' ? 'active' : ''}`} onClick={() => handleNavClick('admin-content')}>
                <Database className="nav-icon" size={18} />
                <span>Контент</span>
              </button>
              <button className={`nav-item ${activeTab === 'admin-system' ? 'active' : ''}`} onClick={() => handleNavClick('admin-system')}>
                <Server className="nav-icon" size={18} />
                <span>Система</span>
              </button>
            </>
          )}
        </nav>

        <main className="dashboard-main">{renderContent()}</main>
      </div>
    </div>
  );
}

export default Dashboard;
