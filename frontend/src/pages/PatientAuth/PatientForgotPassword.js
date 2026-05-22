import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, ArrowLeft } from 'lucide-react';
import { patientAuth } from '../../services/api';
import s from './PatientLogin.module.css';
import sf from './PatientForgotPassword.module.css';

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
    <div className={s.patientAuthContainer}>
      <div className={s.patientAuthCard}>
        <div className={s.patientAuthLogo}>
          <img
            src="/logo_az.png"
            alt="Azarean"
            className={s.patientAuthLogoImg}
          />
        </div>

        <h1 className={s.patientAuthHeading}>Восстановление пароля</h1>

        <p className={sf.patientAuthSubtitle}>
          Введите email, на который зарегистрирован аккаунт
        </p>

        {error && (
          <div className={s.patientAuthError}>
            {error}
          </div>
        )}

        {!sent ? (
          <form className={s.patientAuthForm} onSubmit={handleSubmit}>
            <div className={s.patientAuthField}>
              <label htmlFor="email" className={s.patientAuthLabel}>
                Email
              </label>
              <div className={s.patientAuthInputWrapper}>
                <Mail className={s.patientAuthInputIcon} size={20} />
                <input
                  id="email"
                  type="email"
                  className={s.patientAuthInput}
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
              className={s.patientAuthBtnPrimary}
              disabled={loading}
            >
              {loading ? 'Отправка...' : 'Отправить ссылку'}
            </button>
          </form>
        ) : (
          <div>
            <div className={s.patientAuthSuccess}>
              Ссылка для сброса пароля отправлена на {email}
            </div>

            <p className={sf.patientAuthDevHint}>
              Проверьте консоль сервера (dev mode)
            </p>

            <button
              type="button"
              className={sf.patientAuthBtnOutlined}
              onClick={handleResend}
              disabled={loading}
            >
              {loading ? 'Отправка...' : 'Отправить повторно'}
            </button>
          </div>
        )}

        <div className={s.patientAuthFooter}>
          <Link to="/patient-login" className={`${s.patientAuthLink} ${sf.patientAuthBackLink}`}>
            <ArrowLeft size={16} />
            Вернуться на вход
          </Link>
        </div>
      </div>
    </div>
  );
};

export default PatientForgotPassword;
