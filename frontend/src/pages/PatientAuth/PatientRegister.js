import React, { useState, useEffect } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { User, Mail, Phone, Lock, EyeOff, Eye, Check, KeyRound } from 'lucide-react';
import { patientAuth } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { usePatientAuth } from '../../context/PatientAuthContext';
import s from './PatientLogin.module.css';
import sr from './PatientRegister.module.css';

function PatientRegister() {
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const { login } = usePatientAuth();

  // Pre-fill из OAuth-callback'а: backend редиректит сюда с
  // ?phone=...&full_name=...&email=...&oauth_provider=yandex|telegram
  // если phone-match не нашёл существующего пациента. Юзер вводит invite-code,
  // остальное pre-filled. Telegram email не отдаёт — будет пусто, Yandex отдаёт.
  const queryParams = new URLSearchParams(location.search);
  const oauthProvider = queryParams.get('oauth_provider');
  const prefillPhone = queryParams.get('phone') || '';
  const prefillFullName = queryParams.get('full_name') || '';
  const prefillEmail = queryParams.get('email') || '';
  // Wave 1 hot-fix #4: код приглашения может прийти из share-link
  // (/patient-register?code=ABCDEFGH). Pre-fill для 1-click flow.
  const prefillCode = queryParams.get('code') || '';

  const [full_name, setFullName] = useState(prefillFullName);
  const [email, setEmail] = useState(prefillEmail);
  const [phone, setPhone] = useState(prefillPhone);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [inviteCode, setInviteCode] = useState(prefillCode);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // OAuth-callback пришёл сюда → информируем юзера почему он тут
  useEffect(() => {
    if (oauthProvider) {
      // Не toast — он улетает быстро. Показываем как info-блок.
      setError('');
    }
  }, [oauthProvider]);

  // Wave 1 hot-fix #4: показать info-toast если код подставлен из ссылки
  useEffect(() => {
    if (prefillCode) {
      toast.info('Код приглашения подставлен из ссылки', null, 3000);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillCode]);

  const getPasswordStrength = () => {
    if (password.length === 0) return null;
    if (password.length < 8) return 'weak';
    if (password.length <= 12) return 'medium';
    return 'strong';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!inviteCode.trim()) {
      setError('Введите код приглашения от вашего специалиста');
      return;
    }
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
        password,
        invite_code: inviteCode.trim(),
      });
      // unwrap interceptor разворачивает { data: <patient>, message } → response.data = <patient>
      // Бэк отдаёт patient плоско в data (не data.patient), см. backend/routes/patientAuth.js:189
      const patientData = response.data || null;
      // Backend на регистрации уже поставил cookie — сразу залогиниваем
      login(patientData);
      toast.success('Аккаунт создан!');
      navigate('/patient-dashboard');
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Ошибка при регистрации';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const passwordStrength = getPasswordStrength();

  return (
    <div className={s.patientAuthContainer}>
      <div className={s.patientAuthCard}>
        <div className={s.patientAuthLogo}>
          <div className={s.patientAuthLogoDot}></div>
          <div className={s.patientAuthLogoText}>Azarean</div>
        </div>

        <h1 className={s.patientAuthHeading}>Создание аккаунта</h1>

        {oauthProvider && (
          <div className={sr.patientAuthInfo}>
            Мы не нашли вашу карточку у инструктора. Попросите его сгенерировать
            код приглашения и введите его ниже — после этого ваш Telegram
            автоматически свяжется с профилем.
          </div>
        )}

        {error && (
          <div className={s.patientAuthError}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className={s.patientAuthForm}>
          <div className={s.patientAuthField}>
            <label className={s.patientAuthLabel}>
              Код приглашения <span className={sr.patientAuthRequired}>*</span>
            </label>
            <div className={s.patientAuthInputWrapper}>
              <KeyRound className={s.patientAuthInputIcon} size={20} />
              <input
                type="text"
                className={s.patientAuthInput}
                placeholder="Введите код от инструктора"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                disabled={loading}
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                maxLength={12}
                required
              />
            </div>
            <p className={sr.patientAuthHint}>
              Код вам должен передать ваш специалист
            </p>
          </div>

          <div className={s.patientAuthField}>
            <label className={s.patientAuthLabel}>
              Имя <span className={sr.patientAuthRequired}>*</span>
            </label>
            <div className={s.patientAuthInputWrapper}>
              <User className={s.patientAuthInputIcon} size={20} />
              <input
                type="text"
                className={s.patientAuthInput}
                placeholder="Введите ваше имя"
                value={full_name}
                onChange={(e) => setFullName(e.target.value)}
                disabled={loading}
                required
              />
            </div>
          </div>

          <div className={s.patientAuthField}>
            <label className={s.patientAuthLabel}>
              Email <span className={sr.patientAuthRequired}>*</span>
            </label>
            <div className={s.patientAuthInputWrapper}>
              <Mail className={s.patientAuthInputIcon} size={20} />
              <input
                type="email"
                className={s.patientAuthInput}
                placeholder="example@mail.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                required
              />
            </div>
          </div>

          <div className={s.patientAuthField}>
            <label className={s.patientAuthLabel}>
              Телефон
            </label>
            <div className={s.patientAuthInputWrapper}>
              <Phone className={s.patientAuthInputIcon} size={20} />
              <input
                type="tel"
                className={s.patientAuthInput}
                placeholder="+7 (___) ___-__-__"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={loading}
              />
            </div>
          </div>

          <div className={s.patientAuthField}>
            <label className={s.patientAuthLabel}>
              Пароль <span className={sr.patientAuthRequired}>*</span>
            </label>
            <div className={s.patientAuthInputWrapper}>
              <Lock className={s.patientAuthInputIcon} size={20} />
              <input
                type={showPassword ? 'text' : 'password'}
                className={s.patientAuthInput}
                placeholder="Минимум 8 символов"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                required
              />
              <button
                type="button"
                className={s.patientAuthPasswordToggle}
                onClick={() => setShowPassword(!showPassword)}
                disabled={loading}
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
            {passwordStrength && (
              <>
                <div className={sr.patientAuthPasswordStrength}>
                  <div className={`${sr.patientAuthPasswordStrengthBar} ${sr[passwordStrength]}`}></div>
                </div>
                <p className={sr.patientAuthPasswordHint}>
                  {passwordStrength === 'weak' && 'Слабый пароль'}
                  {passwordStrength === 'medium' && 'Средний пароль'}
                  {passwordStrength === 'strong' && 'Надёжный пароль'}
                </p>
              </>
            )}
          </div>

          <div className={s.patientAuthField}>
            <label className={s.patientAuthLabel}>
              Подтверждение пароля <span className={sr.patientAuthRequired}>*</span>
            </label>
            <div className={s.patientAuthInputWrapper}>
              <Lock className={s.patientAuthInputIcon} size={20} />
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                className={s.patientAuthInput}
                placeholder="Повторите пароль"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={loading}
                required
              />
              <button
                type="button"
                className={s.patientAuthPasswordToggle}
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                disabled={loading}
              >
                {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>

          <div className={sr.patientAuthConsent}>
            <label className={sr.patientAuthConsentCheckboxWrapper}>
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                disabled={loading}
                className={sr.patientAuthConsentCheckboxInput}
              />
              <span className={sr.patientAuthConsentCheckbox}>
                {consent && <Check size={14} />}
              </span>
            </label>
            <label className={sr.patientAuthConsentLabel}>
              Я согласен на обработку персональных данных
            </label>
          </div>

          <button
            type="submit"
            className={s.patientAuthBtnPrimary}
            disabled={loading}
          >
            {loading ? 'Создание аккаунта...' : 'Создать аккаунт'}
          </button>

          <div className={s.patientAuthFooter}>
            <span>Уже есть аккаунт?</span>
            <Link to="/patient-login" className={s.patientAuthLink}>
              Войти
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}

export default PatientRegister;
