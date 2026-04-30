import React, { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Lock, Eye, EyeOff, CheckCircle } from 'lucide-react';
import { patientAuth } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import s from './PatientLogin.module.css';
import sr from './PatientResetPassword.module.css';

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
      <div className={s.patientAuthContainer}>
        <div className={s.patientAuthCard}>
          <div className={s.patientAuthLogo}>
            <div className={s.patientAuthLogoDot} />
            <span className={s.patientAuthLogoText}>Azarean</span>
          </div>

          <div className={sr.patientAuthSuccessIcon}>
            <CheckCircle size={64} />
          </div>

          <h1 className={sr.patientAuthSuccessHeading}>
            Пароль успешно изменён!
          </h1>

          <p className={sr.patientAuthSuccessText}>
            Теперь вы можете войти с новым паролем
          </p>

          <button
            type="button"
            className={s.patientAuthBtnPrimary}
            onClick={handleLoginClick}
          >
            Войти
          </button>

          <div className={s.patientAuthFooter}>
            <Link to="/patient-login" className={s.patientAuthLink}>
              Вернуться на вход
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={s.patientAuthContainer}>
      <div className={s.patientAuthCard}>
        <div className={s.patientAuthLogo}>
          <div className={s.patientAuthLogoDot} />
          <span className={s.patientAuthLogoText}>Azarean</span>
        </div>

        <h1 className={s.patientAuthHeading}>Новый пароль</h1>

        {error && (
          <div className={s.patientAuthError}>
            {error}
          </div>
        )}

        <form className={s.patientAuthForm} onSubmit={handleSubmit}>
          <div className={s.patientAuthField}>
            <label htmlFor="password" className={s.patientAuthLabel}>
              Новый пароль
            </label>
            <div className={s.patientAuthInputWrapper}>
              <Lock className={s.patientAuthInputIcon} size={20} />
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                className={s.patientAuthInput}
                placeholder="Минимум 8 символов"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
                minLength={8}
              />
              <button
                type="button"
                className={s.patientAuthPasswordToggle}
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
            {password && (
              <div className={sr.patientAuthPasswordStrength}>
                <div className={sr.patientAuthPasswordStrengthBar}>
                  <div
                    className={`${sr.patientAuthPasswordStrengthFill} ${sr[`patientAuthPasswordStrength${passwordStrength.strength.charAt(0).toUpperCase()}${passwordStrength.strength.slice(1)}`]}`}
                    style={{ backgroundColor: passwordStrength.color }}
                  />
                </div>
                <span
                  className={sr.patientAuthPasswordStrengthLabel}
                  style={{ color: passwordStrength.color }}
                >
                  {passwordStrength.label}
                </span>
              </div>
            )}
          </div>

          <div className={s.patientAuthField}>
            <label htmlFor="confirmPassword" className={s.patientAuthLabel}>
              Подтвердите пароль
            </label>
            <div className={s.patientAuthInputWrapper}>
              <Lock className={s.patientAuthInputIcon} size={20} />
              <input
                id="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                className={s.patientAuthInput}
                placeholder="Повторите пароль"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                disabled={loading}
              />
              <button
                type="button"
                className={s.patientAuthPasswordToggle}
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                tabIndex={-1}
              >
                {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className={s.patientAuthBtnPrimary}
            disabled={loading}
          >
            {loading ? 'Сохранение...' : 'Сохранить пароль'}
          </button>
        </form>

        <div className={s.patientAuthFooter}>
          <Link to="/patient-login" className={s.patientAuthLink}>
            Вернуться на вход
          </Link>
        </div>
      </div>
    </div>
  );
};

export default PatientResetPassword;
