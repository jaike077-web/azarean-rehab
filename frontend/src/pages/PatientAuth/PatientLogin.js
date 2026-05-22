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
          <img
            src="/logo_az.png"
            alt="Azarean"
            className={s.patientAuthLogoImg}
          />
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
            {/* Яндекс — официальный brand mark: красный круг + белая «Я» */}
            <svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <circle cx="12" cy="12" r="12" fill="#FC3F1D"/>
              <path d="M13.32 18.33h-1.71V7.36h-.76c-1.4 0-2.13.7-2.13 1.74 0 1.18.5 1.72 1.54 2.42l.86.58-2.47 3.69H6.81l2.21-3.3c-1.27-.91-1.98-1.8-1.98-3.29 0-1.87 1.3-3.14 3.79-3.14h2.49v12.27z" fill="#fff"/>
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
            {/* VK — официальный rounded-square brand mark (rebrand 2021): синий фон + белый знак */}
            <svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path d="M15.07 2H8.93C3.33 2 2 3.33 2 8.93v6.14C2 20.67 3.33 22 8.93 22h6.14c5.6 0 6.93-1.33 6.93-6.93V8.93C22 3.33 20.67 2 15.07 2z" fill="#0077FF"/>
              <path d="M18.67 16.27h-1.5c-.55 0-.72-.45-1.7-1.43-.86-.83-1.23-.93-1.44-.93-.3 0-.39.09-.39.5v1.36c0 .35-.11.55-1.02.55-1.51 0-3.18-.91-4.36-2.6-1.77-2.48-2.26-4.35-2.26-4.73 0-.21.08-.4.5-.4h1.5c.37 0 .51.16.65.55.74 2.15 1.97 4.04 2.48 4.04.19 0 .28-.09.28-.57V10.5c-.06-1.02-.61-1.11-.61-1.47 0-.17.14-.34.37-.34h2.36c.31 0 .42.16.42.53v2.97c0 .31.13.42.22.42.19 0 .35-.11.7-.46 1.07-1.2 1.83-3.05 1.83-3.05.1-.21.27-.41.64-.41h1.5c.45 0 .55.23.45.55-.19.86-2 3.41-2 3.41-.16.26-.22.37 0 .67.16.21.67.66 1.01 1.05.63.72 1.11 1.32 1.24 1.74.13.4-.08.61-.49.61z" fill="#fff"/>
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
