import React, { useState, useEffect } from 'react';
import { useNavigate, Link, useLocation, Navigate } from 'react-router-dom';
import { Eye, EyeOff, Mail, Lock } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { usePatientAuth } from '../../context/PatientAuthContext';
import { patientAuth } from '../../services/api';
import PatientSplash from '../../components/PatientSplash';
import ThemeToggle from '../../components/ThemeToggle';
import s from './PatientLogin.module.css';

const PatientLogin = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const { patient, login, loading: authLoading } = usePatientAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [providers, setProviders] = useState({
    telegram: { enabled: false },
    yandex: { enabled: false },
    google: { enabled: false },
    vk: { enabled: false },
  });

  // Подгружаем список enabled-провайдеров (Telegram если в .env есть OIDC creds)
  useEffect(() => {
    patientAuth
      .getOAuthProviders()
      .then((res) => setProviders(res.data || {}))
      .catch(() => { /* fallback: всё disabled — кнопки покажут «скоро» */ });
  }, []);

  // Если callback фейлнул — backend редиректит сюда с ?oauth_error=...
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const oauthError = params.get('oauth_error');
    if (oauthError) {
      setError(`Вход через соцсеть: ${oauthError}`);
      // Чистим query чтоб при F5 не повторялось
      navigate(location.pathname, { replace: true });
    }
  }, [location, navigate]);

  // Пока контекст проверяет cookie через getMe() — показываем splash,
  // иначе при F5 на /patient-login авторизованного пользователя мелькает форма.
  if (authLoading) {
    return <PatientSplash />;
  }

  // Если пациент уже в контексте — редирект на дашборд
  if (patient) {
    return <Navigate to="/patient-dashboard" replace />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const response = await patientAuth.login({ email, password });
      // unwrap interceptor разворачивает { data: <patient>, message } → response.data = <patient>
      // Бэк отдаёт patient плоско в data (не data.patient), см. backend/routes/patientAuth.js:321
      const patientData = response.data || null;
      const name = patientData?.full_name || '';
      toast.success(name ? `Добро пожаловать, ${name}!` : 'Вход выполнен!');
      // Cookie установлена backend'ом — обновляем контекст (один провайдер с dashboard)
      login(patientData);
      // Навигация — теперь в одном провайдере, PatientRoute увидит patient
      const redirectTo = location.state?.from;
      navigate(redirectTo && redirectTo !== '/patient-login' ? redirectTo : '/patient-dashboard');
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Ошибка при входе';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleOAuthClick = (provider) => {
    if (!providers[provider]?.enabled) {
      toast.info('Этот способ входа пока в разработке');
      return;
    }
    // Полный navigation на backend OAuth-start, который 302-нет на провайдера.
    // CRA proxy в dev пробрасывает /api на :5000, в prod — nginx.
    window.location.href = `/api/patient-auth/oauth/${provider}`;
  };

  return (
    <div className={s.patientAuthContainer}>
      <div className={s.patientAuthThemeToggle}>
        <ThemeToggle />
      </div>
      <div className={s.patientAuthCard}>
        {/* Logo */}
        <div className={s.patientAuthLogo}>
          <div className={s.patientAuthLogoDot}></div>
          <div className={s.patientAuthLogoText}>Azarean</div>
        </div>

        {/* Heading */}
        <h1 className={s.patientAuthHeading}>Вход в личный кабинет</h1>

        {/* Error Message */}
        {error && (
          <div className={s.patientAuthError}>
            {error}
          </div>
        )}

        {/* Success Message */}
        {location.state?.message && (
          <div className={s.patientAuthSuccess}>
            {location.state.message}
          </div>
        )}

        {/* Login Form */}
        <form className={s.patientAuthForm} onSubmit={handleSubmit}>
          {/* Email Field */}
          <div className={s.patientAuthField}>
            <label htmlFor="email" className={s.patientAuthLabel}>
              Email
            </label>
            <div className={s.patientAuthInputWrapper}>
              <Mail className={s.patientAuthInputIcon} size={20} />
              <input
                type="email"
                id="email"
                className={s.patientAuthInput}
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
          </div>

          {/* Password Field */}
          <div className={s.patientAuthField}>
            <label htmlFor="password" className={s.patientAuthLabel}>
              Пароль
            </label>
            <div className={s.patientAuthInputWrapper}>
              <Lock className={s.patientAuthInputIcon} size={20} />
              <input
                type={showPassword ? 'text' : 'password'}
                id="password"
                className={s.patientAuthInput}
                placeholder="Введите пароль"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
              <button
                type="button"
                className={s.patientAuthPasswordToggle}
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>

          {/* Forgot Password Link */}
          <Link to="/patient-forgot-password" className={s.patientAuthForgotLink}>
            Забыли пароль?
          </Link>

          {/* Submit Button */}
          <button
            type="submit"
            className={s.patientAuthBtnPrimary}
            disabled={loading}
          >
            {loading ? 'Вход...' : 'Войти'}
          </button>
        </form>

        {/* Divider */}
        <div className={s.patientAuthDivider}>
          <span>или</span>
        </div>

        {/* OAuth Buttons */}
        <div className={s.patientAuthOauthGrid}>
          <button
            type="button"
            className={s.patientAuthOauthBtn}
            onClick={() => handleOAuthClick('yandex')}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" fill="#FC3F1D"/>
            </svg>
            Яндекс
          </button>
          <button
            type="button"
            className={s.patientAuthOauthBtn}
            onClick={() => handleOAuthClick('google')}
          >
            <svg width="24" height="24" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Google
          </button>
          <button
            type="button"
            className={s.patientAuthOauthBtn}
            onClick={() => handleOAuthClick('telegram')}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="#0088cc">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69.01-.03.01-.14-.07-.2s-.18-.04-.26-.02c-.11.02-1.8 1.14-5.1 3.35-.48.33-.92.49-1.32.48-.43-.01-1.27-.24-1.89-.44-.76-.24-1.37-.37-1.32-.78.03-.21.37-.43 1.02-.65 3.99-1.73 6.66-2.87 8-3.43 3.81-1.59 4.6-1.87 5.12-1.88.11 0 .37.03.54.17.14.11.18.26.2.37.01.08.03.29.01.45z"/>
            </svg>
            Telegram
          </button>
          <button
            type="button"
            className={s.patientAuthOauthBtn}
            onClick={() => handleOAuthClick('vk')}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="#0077FF">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm3.5 13.5c.39 0 .47-.34.46-.5-.03-1.13-.46-1.65-.84-2.11-.21-.25-.38-.46-.38-.77 0-.31.17-.52.38-.77.38-.46.81-.98.84-2.11.01-.16-.07-.5-.46-.5h-1.25c-.28 0-.43.19-.48.38-.15.57-.49 1.26-1.27 1.26-.78 0-1.12-.69-1.27-1.26-.05-.19-.2-.38-.48-.38H9.5c-.39 0-.47.34-.46.5.03 1.13.46 1.65.84 2.11.21.25.38.46.38.77 0 .31-.17.52-.38.77-.38.46-.81.98-.84 2.11-.01.16.07.5.46.5h1.25c.28 0 .43-.19.48-.38.15-.57.49-1.26 1.27-1.26.78 0 1.12.69 1.27 1.26.05.19.2.38.48.38h1.25z"/>
            </svg>
            VK
          </button>
        </div>

        {providers.telegram?.enabled && (
          <p className={s.patientAuthOauthHint}>
            Если после авторизации в Telegram страница не вернулась — нажмите
            «Telegram» ещё раз. Иногда браузер не получает сигнал от Telegram
            Desktop, и редирект приходится повторить вручную.
          </p>
        )}

        {/* Footer */}
        <div className={s.patientAuthFooter}>
          Нет аккаунта?{' '}
          <Link to="/patient-register" className={s.patientAuthLink}>
            Зарегистрироваться
          </Link>
        </div>
      </div>
    </div>
  );
};

export default PatientLogin;
