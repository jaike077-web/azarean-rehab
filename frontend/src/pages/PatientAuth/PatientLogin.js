import React, { useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { Eye, EyeOff, Mail, Lock } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { patientAuth } from '../../services/api';
import './PatientLogin.css';

const PatientLogin = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const response = await patientAuth.login({ email, password });
      const data = response.data || response;
      if (data.token) {
        localStorage.setItem('patient_token', data.token);
      }
      const name = data.patient?.full_name || '';
      toast.success(name ? `Добро пожаловать, ${name}!` : 'Вход выполнен!');
      // Переход на пациентский дашборд или на страницу, откуда пришли
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
    alert('В разработке');
  };

  return (
    <div className="patient-auth-container">
      <div className="patient-auth-card">
        {/* Logo */}
        <div className="patient-auth-logo">
          <div className="patient-auth-logo-dot"></div>
          <div className="patient-auth-logo-text">Azarean</div>
        </div>

        {/* Heading */}
        <h1 className="patient-auth-heading">Вход в личный кабинет</h1>

        {/* Error Message */}
        {error && (
          <div className="patient-auth-error">
            {error}
          </div>
        )}

        {/* Success Message */}
        {location.state?.message && (
          <div className="patient-auth-success">
            {location.state.message}
          </div>
        )}

        {/* Login Form */}
        <form className="patient-auth-form" onSubmit={handleSubmit}>
          {/* Email Field */}
          <div className="patient-auth-field">
            <label htmlFor="email" className="patient-auth-label">
              Email
            </label>
            <div className="patient-auth-input-wrapper">
              <Mail className="patient-auth-input-icon" size={20} />
              <input
                type="email"
                id="email"
                className="patient-auth-input"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
          </div>

          {/* Password Field */}
          <div className="patient-auth-field">
            <label htmlFor="password" className="patient-auth-label">
              Пароль
            </label>
            <div className="patient-auth-input-wrapper">
              <Lock className="patient-auth-input-icon" size={20} />
              <input
                type={showPassword ? 'text' : 'password'}
                id="password"
                className="patient-auth-input"
                placeholder="Введите пароль"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
              <button
                type="button"
                className="patient-auth-password-toggle"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>

          {/* Forgot Password Link */}
          <Link to="/patient-forgot-password" className="patient-auth-forgot-link">
            Забыли пароль?
          </Link>

          {/* Submit Button */}
          <button
            type="submit"
            className="patient-auth-btn-primary"
            disabled={loading}
          >
            {loading ? 'Вход...' : 'Войти'}
          </button>
        </form>

        {/* Divider */}
        <div className="patient-auth-divider">
          <span>или</span>
        </div>

        {/* OAuth Buttons */}
        <div className="patient-auth-oauth-grid">
          <button
            type="button"
            className="patient-auth-oauth-btn"
            onClick={() => handleOAuthClick('yandex')}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" fill="#FC3F1D"/>
            </svg>
            Яндекс
          </button>
          <button
            type="button"
            className="patient-auth-oauth-btn"
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
            className="patient-auth-oauth-btn"
            onClick={() => handleOAuthClick('telegram')}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="#0088cc">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69.01-.03.01-.14-.07-.2s-.18-.04-.26-.02c-.11.02-1.8 1.14-5.1 3.35-.48.33-.92.49-1.32.48-.43-.01-1.27-.24-1.89-.44-.76-.24-1.37-.37-1.32-.78.03-.21.37-.43 1.02-.65 3.99-1.73 6.66-2.87 8-3.43 3.81-1.59 4.6-1.87 5.12-1.88.11 0 .37.03.54.17.14.11.18.26.2.37.01.08.03.29.01.45z"/>
            </svg>
            Telegram
          </button>
          <button
            type="button"
            className="patient-auth-oauth-btn"
            onClick={() => handleOAuthClick('vk')}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="#0077FF">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm3.5 13.5c.39 0 .47-.34.46-.5-.03-1.13-.46-1.65-.84-2.11-.21-.25-.38-.46-.38-.77 0-.31.17-.52.38-.77.38-.46.81-.98.84-2.11.01-.16-.07-.5-.46-.5h-1.25c-.28 0-.43.19-.48.38-.15.57-.49 1.26-1.27 1.26-.78 0-1.12-.69-1.27-1.26-.05-.19-.2-.38-.48-.38H9.5c-.39 0-.47.34-.46.5.03 1.13.46 1.65.84 2.11.21.25.38.46.38.77 0 .31-.17.52-.38.77-.38.46-.81.98-.84 2.11-.01.16.07.5.46.5h1.25c.28 0 .43-.19.48-.38.15-.57.49-1.26 1.27-1.26.78 0 1.12.69 1.27 1.26.05.19.2.38.48.38h1.25z"/>
            </svg>
            VK
          </button>
        </div>

        {/* Footer */}
        <div className="patient-auth-footer">
          Нет аккаунта?{' '}
          <Link to="/patient-register" className="patient-auth-link">
            Зарегистрироваться
          </Link>
        </div>
      </div>
    </div>
  );
};

export default PatientLogin;
