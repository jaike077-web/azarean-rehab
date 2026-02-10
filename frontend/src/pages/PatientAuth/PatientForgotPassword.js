import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, ArrowLeft } from 'lucide-react';
import { patientAuth } from '../../services/api';
import './PatientLogin.css';
import './PatientForgotPassword.css';

const PatientForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await patientAuth.forgotPassword(email);
      setSent(true);
    } catch (err) {
      setError(err.response?.data?.message || 'Ошибка при отправке');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setError('');
    setLoading(true);
    try {
      await patientAuth.forgotPassword(email);
      setError('');
    } catch (err) {
      setError(err.response?.data?.message || 'Ошибка при отправке');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="patient-auth-container">
      <div className="patient-auth-card">
        <div className="patient-auth-logo">
          <div className="patient-auth-logo-dot" />
          <span className="patient-auth-logo-text">Azarean</span>
        </div>

        <h1 className="patient-auth-heading">Восстановление пароля</h1>

        <p className="patient-auth-subtitle">
          Введите email, на который зарегистрирован аккаунт
        </p>

        {error && (
          <div className="patient-auth-error">
            {error}
          </div>
        )}

        {!sent ? (
          <form className="patient-auth-form" onSubmit={handleSubmit}>
            <div className="patient-auth-field">
              <label htmlFor="email" className="patient-auth-label">
                Email
              </label>
              <div className="patient-auth-input-wrapper">
                <Mail className="patient-auth-input-icon" size={20} />
                <input
                  id="email"
                  type="email"
                  className="patient-auth-input"
                  placeholder="mail@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>
            </div>

            <button
              type="submit"
              className="patient-auth-btn-primary"
              disabled={loading}
            >
              {loading ? 'Отправка...' : 'Отправить ссылку'}
            </button>
          </form>
        ) : (
          <div>
            <div className="patient-auth-success">
              Ссылка для сброса пароля отправлена на {email}
            </div>

            <p className="patient-auth-dev-hint">
              Проверьте консоль сервера (dev mode)
            </p>

            <button
              type="button"
              className="patient-auth-btn-outlined"
              onClick={handleResend}
              disabled={loading}
            >
              {loading ? 'Отправка...' : 'Отправить повторно'}
            </button>
          </div>
        )}

        <div className="patient-auth-footer">
          <Link to="/patient-login" className="patient-auth-link patient-auth-back-link">
            <ArrowLeft size={16} />
            Вернуться на вход
          </Link>
        </div>
      </div>
    </div>
  );
};

export default PatientForgotPassword;
