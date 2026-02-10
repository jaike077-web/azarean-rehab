import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { User, Mail, Phone, Lock, EyeOff, Eye, Check } from 'lucide-react';
import { patientAuth } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import './PatientLogin.css';
import './PatientRegister.css';

function PatientRegister() {
  const navigate = useNavigate();
  const toast = useToast();

  const [full_name, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const getPasswordStrength = () => {
    if (password.length === 0) return null;
    if (password.length < 8) return 'weak';
    if (password.length <= 12) return 'medium';
    return 'strong';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!full_name || !email || !password || !confirmPassword) {
      setError('Заполните все обязательные поля');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Некорректный формат email');
      return;
    }
    if (password.length < 8) {
      setError('Пароль должен содержать минимум 8 символов');
      return;
    }
    if (password !== confirmPassword) {
      setError('Пароли не совпадают');
      return;
    }
    if (!consent) {
      setError('Необходимо согласие на обработку персональных данных');
      return;
    }

    setLoading(true);
    try {
      const response = await patientAuth.register({
        full_name,
        email,
        phone: phone || undefined,
        password
      });
      const data = response.data || response;
      if (data.token) {
        localStorage.setItem('patient_token', data.token);
      }
      toast.success('Аккаунт создан!');
      navigate('/patient-login');
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Ошибка при регистрации';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const passwordStrength = getPasswordStrength();

  return (
    <div className="patient-auth-container">
      <div className="patient-auth-card">
        <div className="patient-auth-logo">
          <div className="patient-auth-logo-dot"></div>
          <div className="patient-auth-logo-text">Azarean</div>
        </div>

        <h1 className="patient-auth-heading">Создание аккаунта</h1>

        {error && (
          <div className="patient-auth-error">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="patient-auth-form">
          <div className="patient-auth-field">
            <label className="patient-auth-label">
              Имя <span className="patient-auth-required">*</span>
            </label>
            <div className="patient-auth-input-wrapper">
              <User className="patient-auth-input-icon" size={20} />
              <input
                type="text"
                className="patient-auth-input"
                placeholder="Введите ваше имя"
                value={full_name}
                onChange={(e) => setFullName(e.target.value)}
                disabled={loading}
                required
              />
            </div>
          </div>

          <div className="patient-auth-field">
            <label className="patient-auth-label">
              Email <span className="patient-auth-required">*</span>
            </label>
            <div className="patient-auth-input-wrapper">
              <Mail className="patient-auth-input-icon" size={20} />
              <input
                type="email"
                className="patient-auth-input"
                placeholder="example@mail.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                required
              />
            </div>
          </div>

          <div className="patient-auth-field">
            <label className="patient-auth-label">
              Телефон
            </label>
            <div className="patient-auth-input-wrapper">
              <Phone className="patient-auth-input-icon" size={20} />
              <input
                type="tel"
                className="patient-auth-input"
                placeholder="+7 (___) ___-__-__"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={loading}
              />
            </div>
          </div>

          <div className="patient-auth-field">
            <label className="patient-auth-label">
              Пароль <span className="patient-auth-required">*</span>
            </label>
            <div className="patient-auth-input-wrapper">
              <Lock className="patient-auth-input-icon" size={20} />
              <input
                type={showPassword ? 'text' : 'password'}
                className="patient-auth-input"
                placeholder="Минимум 8 символов"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                required
              />
              <button
                type="button"
                className="patient-auth-password-toggle"
                onClick={() => setShowPassword(!showPassword)}
                disabled={loading}
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
            {passwordStrength && (
              <>
                <div className="patient-auth-password-strength">
                  <div className={`patient-auth-password-strength-bar ${passwordStrength}`}></div>
                </div>
                <p className="patient-auth-password-hint">
                  {passwordStrength === 'weak' && 'Слабый пароль'}
                  {passwordStrength === 'medium' && 'Средний пароль'}
                  {passwordStrength === 'strong' && 'Надёжный пароль'}
                </p>
              </>
            )}
          </div>

          <div className="patient-auth-field">
            <label className="patient-auth-label">
              Подтверждение пароля <span className="patient-auth-required">*</span>
            </label>
            <div className="patient-auth-input-wrapper">
              <Lock className="patient-auth-input-icon" size={20} />
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                className="patient-auth-input"
                placeholder="Повторите пароль"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={loading}
                required
              />
              <button
                type="button"
                className="patient-auth-password-toggle"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                disabled={loading}
              >
                {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>

          <div className="patient-auth-consent">
            <label className="patient-auth-consent-checkbox-wrapper">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                disabled={loading}
                className="patient-auth-consent-checkbox-input"
              />
              <span className="patient-auth-consent-checkbox">
                {consent && <Check size={14} />}
              </span>
            </label>
            <label className="patient-auth-consent-label">
              Я согласен на обработку персональных данных
            </label>
          </div>

          <button
            type="submit"
            className="patient-auth-btn-primary"
            disabled={loading}
          >
            {loading ? 'Создание аккаунта...' : 'Создать аккаунт'}
          </button>

          <div className="patient-auth-footer">
            <span>Уже есть аккаунт?</span>
            <Link to="/patient-login" className="patient-auth-link">
              Войти
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}

export default PatientRegister;
