import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Patients from './Patients';
import CreateComplex from './CreateComplex';
import MyComplexes from './MyComplexes';
import Trash from './Trash';
import ImportExercises from './ImportExercises';
import ProgressDashboard from './ProgressDashboard';
import s from './Dashboard.module.css';
import Diagnoses from './Diagnoses';
import { dashboard } from '../services/api';
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
import ThemeToggle from '../components/ThemeToggle';

function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState('home');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    let alive = true;
    dashboard.getStats()
      .then((res) => { if (alive) setStats(res.data || null); })
      .catch(() => { if (alive) setStats(null); });
    return () => { alive = false; };
  }, []);

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
          <div className={s.welcomeSection}>
            <h2 className={s.welcomeTitle}>
              <span>Добро пожаловать, {user?.full_name}!</span>
              <HeartHandshake className={s.welcomeIcon} size={26} />
            </h2>

            <p>Выберите раздел в меню для начала работы</p>

            <div className={s.statsGrid}>
              <div className={s.statCard}>
                <div className={s.statIcon}>
                  <Users size={24} />
                </div>
                <div className={s.statInfo}>
                  <div className={s.statValue}>{stats?.patients_count ?? '—'}</div>
                  <div className={s.statLabel}>Пациентов</div>
                </div>
              </div>

              <div className={s.statCard}>
                <div className={s.statIcon}>
                  <ClipboardList size={24} />
                </div>
                <div className={s.statInfo}>
                  <div className={s.statValue}>{stats?.complexes_count ?? '—'}</div>
                  <div className={s.statLabel}>Комплексов</div>
                </div>
              </div>

              <div className={s.statCard}>
                <div className={s.statIcon}>
                  <Activity size={24} />
                </div>
                <div className={s.statInfo}>
                  <div className={s.statValue}>
                    {stats?.completion_percent != null ? `${stats.completion_percent}%` : '—'}
                  </div>
                  <div className={s.statLabel}>Выполнение</div>
                </div>
              </div>

              <div
                className={s.statCard}
                onClick={() => navigate('/exercises')}
                style={{ cursor: s.pointer }}
              >
                <div className={s.statIcon}>
                  <Dumbbell size={24} />
                </div>
                <div className={s.statInfo}>
                  <div className={s.statValue}>{stats?.exercises_count ?? '—'}</div>
                  <div className={s.statLabel}>Упражнений</div>
                </div>
              </div>
            </div>

            <div className={s.quickActions}>
              <h3>Быстрые действия</h3>
              <div className={s.actionsGrid}>
                <button className={s.actionCard} onClick={() => handleNavClick('patients')}>
                  <UserPlus className={s.actionIcon} size={20} />
                  <span className={s.actionText}>Добавить пациента</span>
                </button>

                <button className={s.actionCard} onClick={() => handleNavClick('complexes')}>
                  <ListPlus className={s.actionIcon} size={20} />
                  <span className={s.actionText}>Создать комплекс</span>
                </button>

                <button className={s.actionCard} onClick={handleExercisesClick}>
                  <Search className={s.actionIcon} size={20} />
                  <span className={s.actionText}>Найти упражнение</span>
                </button>
              </div>
            </div>
          </div>
        );
    }
  };

  return (
    <div className={s.dashboardContainer}>
      <header className={s.dashboardHeader}>
        <div className={s.headerLeft}>
          {/* Бургер-кнопка для мобильных */}
          <button 
            className={`${s.burgerMenuBtn} ${isMobileMenuOpen ? s.active : ''}`}
            onClick={toggleMobileMenu}
            aria-label="Открыть меню"
          >
            <div className={s.burgerIcon}>
              <span></span>
              <span></span>
              <span></span>
            </div>
          </button>

          <div className={s.appBrand}>
            <img
              src="/logo_az.png"
              alt="Azarean Network"
              className={s.appLogo}
            />
            <div className={s.appBrandText}>
              <div className={s.appBrandTitle}>Azarean Network</div>
              <div className={s.appBrandSubtitle}>Система реабилитации</div>
            </div>
          </div>
        </div>

        <div className={s.headerRight}>
          <ThemeToggle hideOnMobile />
          <span className={s.userName}>{user?.full_name}</span>
          <span className={s.userRole}>
            {user?.role === 'admin' ? 'Администратор' : 'Инструктор'}
          </span>
          <button onClick={handleLogout} className={s.btnLogout}>
            Выйти
          </button>
        </div>
      </header>

      <div className={s.dashboardContent}>
        {/* Overlay для закрытия меню */}
        <div 
          className={`${s.navOverlay} ${isMobileMenuOpen ? s.visible : ''}`}
          onClick={() => setIsMobileMenuOpen(false)}
        />

        {/* Навигация */}
        <nav className={`${s.dashboardNav} ${isMobileMenuOpen ? s.open : ''}`}>
          <button 
            className={`${s.navItem} ${activeTab === 'home' ? s.active : ''}`}
            onClick={() => handleNavClick('home')}
          >
            <LayoutDashboard className={s.navIcon} size={18} />
            <span>Главная</span>
          </button>

          <button 
            className={`${s.navItem} ${activeTab === 'patients' ? s.active : ''}`}
            onClick={() => handleNavClick('patients')}
          >
            <Users className={s.navIcon} size={18} />
            <span>Пациенты</span>
          </button>

          <button
            className={`${s.navItem} ${activeTab === 'progress' ? s.active : ''}`}
            onClick={() => handleNavClick('progress')}
          >
            <BarChart3 className={s.navIcon} size={18} />
            <span>Прогресс пациентов</span>
          </button>

          <button 
            className={`${s.navItem} ${activeTab === 'exercises' ? s.active : ''}`}
            onClick={handleExercisesClick}
          >
            <Dumbbell className={s.navIcon} size={18} />
            <span>Библиотека упражнений</span>
          </button>

          <button 
  className={`${s.navItem} ${activeTab === 'diagnoses' ? s.active : ''}`}
  onClick={() => handleNavClick('diagnoses')}
>
  <FileText className={s.navIcon} size={18} />
  <span>Диагнозы</span>
</button>

          <button 
            className={`${s.navItem} ${activeTab === 'complexes' ? s.active : ''}`}
            onClick={() => handleNavClick('complexes')}
          >
            <ListPlus className={s.navIcon} size={18} />
            <span>Создать комплекс</span>
          </button>

          <button 
            className={`${s.navItem} ${activeTab === 'my-complexes' ? s.active : ''}`}
            onClick={() => handleNavClick('my-complexes')}
          >
            <ClipboardList className={s.navIcon} size={18} />
            <span>Мои комплексы</span>
          </button>

          <button 
            className={`${s.navItem} ${activeTab === 'import' ? s.active : ''}`}
            onClick={() => handleNavClick('import')}
          >
            <Upload className={s.navIcon} size={18} />
            <span>Импорт упражнений</span>
          </button>

          <button 
            className={`${s.navItem} ${activeTab === 'trash' ? s.active : ''}`}
            onClick={() => handleNavClick('trash')}
          >
            <Trash2 className={s.navIcon} size={18} />
            <span>Корзина</span>
          </button>

          {user?.role === 'admin' && (
            <>
              <div className={s.navDivider} />
              <button className={`${s.navItem} ${activeTab === 'admin-stats' ? s.active : ''}`} onClick={() => handleNavClick('admin-stats')}>
                <Shield className={s.navIcon} size={18} strokeWidth={1.8} />
                <span>Статистика</span>
              </button>
              <button className={`${s.navItem} ${activeTab === 'admin-users' ? s.active : ''}`} onClick={() => handleNavClick('admin-users')}>
                <Users className={s.navIcon} size={18} strokeWidth={1.8} />
                <span>Пользователи</span>
              </button>
              <button className={`${s.navItem} ${activeTab === 'admin-audit' ? s.active : ''}`} onClick={() => handleNavClick('admin-audit')}>
                <ScrollText className={s.navIcon} size={18} strokeWidth={1.8} />
                <span>Журнал аудита</span>
              </button>
              <button className={`${s.navItem} ${activeTab === 'admin-content' ? s.active : ''}`} onClick={() => handleNavClick('admin-content')}>
                <Database className={s.navIcon} size={18} strokeWidth={1.8} />
                <span>Контент</span>
              </button>
              <button className={`${s.navItem} ${activeTab === 'admin-system' ? s.active : ''}`} onClick={() => handleNavClick('admin-system')}>
                <Server className={s.navIcon} size={18} strokeWidth={1.8} />
                <span>Система</span>
              </button>
            </>
          )}

          {/* Тема (видна на mobile/tablet, где ThemeToggle в header'е скрыт) */}
          <div className={s.navDivider} />
          <div className={s.navThemeBlock}>
            <span className={s.navThemeLabel}>Тема</span>
            <ThemeToggle />
          </div>
        </nav>

        <main className={s.dashboardMain}>{renderContent()}</main>
      </div>
    </div>
  );
}

export default Dashboard;
