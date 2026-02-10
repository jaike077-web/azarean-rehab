import React, { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Lock, Eye, EyeOff, CheckCircle } from 'lucide-react';
import { patientAuth } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import './PatientLogin.css';
import './PatientResetPassword.css';

const PatientResetPassword = () => {
  const { token } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const getPasswordStrength = (pwd) => {
    if (pwd.length === 0) return { strength: 'none', label: '', color: '' };
    if (pwd.length < 6) return { strength: 'weak', label: 'Слабый', color: '#E53E3E' };
    if (pwd.length < 10) return { strength: 'medium', label: 'Средний', color: '#DD6B20' };
    return { strength: 'strong', label: 'Надёжный', color: '#38A169' };
  };

  const passwordStrength = getPasswordStrength(password);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Пароль должен содержать минимум 8 символов');
      return;
    }

    if (password !== confirmPassword) {
      setError('Пароли не совпадают');
      return;
    }

    setLoading(true);
    try {
      await patientAuth.resetPassword({ token, new_password: password });
      setSuccess(true);
      toast.success('Пароль успешно изменён!');
    } catch (err) {
      setError(err.response?.data?.message || 'Ссылка недействительна или истекла');
    } finally {
      setLoading(false);
    }
  };

  const handleLoginClick = () => {
    navigate('/patient-login');
  };

  if (success) {
    return (
      <div className="patient-auth-container">
        <div className="patient-auth-card">
          <div className="patient-auth-logo">
            <div className="patient-auth-logo-dot" />
            <span className="patient-auth-logo-text">Azarean</span>
          </div>

          <div className="patient-auth-success-icon">
            <CheckCircle size={64} />
          </div>

          <h1 className="patient-auth-success-heading">
            Пароль успешно изменён!
          </h1>

          <p className="patient-auth-success-text">
            Теперь вы можете войти с новым паролем
          </p>

          <button
            type="button"
            className="patient-auth-btn-primary"
            onClick={handleLoginClick}
          >
            Войти
          </button>

          <div className="patient-auth-footer">
            <Link to="/patient-login" className="patient-auth-link">
              Вернуться на вход
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="patient-auth-container">
      <div className="patient-auth-card">
        <div className="patient-auth-logo">
          <div className="patient-auth-logo-dot" />
          <span className="patient-auth-logo-text">Azarean</span>
        </div>

        <h1 className="patient-auth-heading">Новый пароль</h1>

        {error && (
          <div className="patient-auth-error">
            {error}
          </div>
        )}

        <form className="patient-auth-form" onSubmit={handleSubmit}>
          <div className="patient-auth-field">
            <label htmlFor="password" className="patient-auth-label">
              Новый пароль
            </label>
            <div className="patient-auth-input-wrapper">
              <Lock className="patient-auth-input-icon" size={20} />
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                className="patient-auth-input"
                placeholder="Минимум 8 символов"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
                minLength={8}
              />
              <button
                type="button"
                className="patient-auth-password-toggle"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
            {password && (
              <div className="patient-auth-password-strength">
                <div className="patient-auth-password-strength-bar">
                  <div
                    className={`patient-auth-password-strength-fill patient-auth-password-strength-${passwordStrength.strength}`}
                    style={{ backgroundColor: passwordStrength.color }}
                  />
                </div>
                <span
                  className="patient-auth-password-strength-label"
                  style={{ color: passwordStrength.color }}
                >
                  {passwordStrength.label}
                </span>
              </div>
            )}
          </div>

          <div className="patient-auth-field">
            <label htmlFor="confirmPassword" className="patient-auth-label">
              Подтвердите пароль
            </label>
            <div className="patient-auth-input-wrapper">
              <Lock className="patient-auth-input-icon" size={20} />
              <input
                id="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                className="patient-auth-input"
                placeholder="Повторите пароль"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                disabled={loading}
              />
              <button
                type="button"
                className="patient-auth-password-toggle"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                tabIndex={-1}
              >
                {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="patient-auth-btn-primary"
            disabled={loading}
          >
            {loading ? 'Сохранение...' : 'Сохранить пароль'}
          </button>
        </form>

        <div className="patient-auth-footer">
          <Link to="/patient-login" className="patient-auth-link">
            Вернуться на вход
          </Link>
        </div>
      </div>
    </div>
  );
};

export default PatientResetPassword;
