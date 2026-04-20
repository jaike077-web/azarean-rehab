// =====================================================
// PROFILE SCREEN — v12 redesign (overlay)
//
// Open: AvatarBtn в шапке дашборда → setProfileOpen(true)
// Close: стрелка назад в шапке Profile (onClose) или клик «Куратор»
//        (закрывает overlay + переключает таб на Связь)
//
// Поля:
//  - editable (через bottom-sheet edit modal): full_name, phone
//  - read-only:    email, birth_date, diagnosis, surgery_date
//  - section «Связь → Основной канал связи» — disabled (Checkpoint 3)
//  - section «Напоминания от Zari» — функциональная (Telegram link)
//  - «Сменить пароль» — collapsible (как раньше, теперь внутри секции)
// =====================================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import PropTypes from 'prop-types';
import {
  ChevronLeft, ChevronDown, Camera, X, Heart, User, Mail, Phone,
  Calendar, Lock, LogOut, Info, HelpCircle, MessageSquare, Bot, Bell,
} from 'lucide-react';
import { patientAuth, rehab } from '../../../services/api';
import { useToast } from '../../../context/ToastContext';
import { usePatientAuth } from '../../../context/PatientAuthContext';
import { SettingsRow } from './ui';
import './ProfileScreen.css';

// Tab id для Contact (см. NAV в PatientDashboard.js)
const CONTACT_TAB_ID = 3;

const formatDate = (iso) => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('ru-RU', {
      day: 'numeric', month: 'long', year: 'numeric',
    });
  } catch {
    return iso;
  }
};

// =====================================================
// Bottom-sheet edit modal (для name/phone)
// =====================================================
function EditSheet({ open, field, initialValue, onSave, onClose }) {
  const [value, setValue] = useState(initialValue || '');
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setValue(initialValue || '');
      // autoFocus с маленькой задержкой чтобы анимация открытия успела
      const t = setTimeout(() => inputRef.current?.focus(), 80);
      return () => clearTimeout(t);
    }
  }, [open, initialValue]);

  // Esc — закрыть
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const titles = { name: 'Имя', phone: 'Телефон' };
  const inputType = field === 'phone' ? 'tel' : 'text';
  const placeholder = field === 'phone' ? '+7 (___) ___-__-__' : 'Ваше имя';

  return (
    <div
      className="pd-edit-sheet-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={`Редактировать ${titles[field] || ''}`}
      onClick={onClose}
    >
      <div className="pd-edit-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="pd-edit-sheet-header">
          <h2 className="pd-edit-sheet-title">{titles[field] || 'Редактирование'}</h2>
          <button
            type="button"
            className="pd-edit-sheet-close"
            onClick={onClose}
            aria-label="Закрыть"
          >
            <X size={14} />
          </button>
        </div>
        <input
          ref={inputRef}
          type={inputType}
          className="pd-edit-sheet-input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
        />
        <div className="pd-edit-sheet-actions">
          <button
            type="button"
            className="pd-edit-sheet-btn pd-edit-sheet-btn--cancel"
            onClick={onClose}
          >
            Отмена
          </button>
          <button
            type="button"
            className="pd-edit-sheet-btn pd-edit-sheet-btn--save"
            onClick={() => onSave(value.trim())}
          >
            Сохранить
          </button>
        </div>
      </div>
    </div>
  );
}

EditSheet.propTypes = {
  open: PropTypes.bool.isRequired,
  field: PropTypes.oneOf(['name', 'phone', null]),
  initialValue: PropTypes.string,
  onSave: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
};

// =====================================================
// ProfileScreen
// =====================================================
function ProfileScreen({ onClose, handleLogout, goTo }) {
  const toast = useToast();
  const { patient: ctxPatient, refresh } = usePatientAuth();
  const fileInputRef = useRef(null);

  const [profile, setProfile] = useState(ctxPatient || null);
  const [loading, setLoading] = useState(!ctxPatient);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarBlobUrl, setAvatarBlobUrl] = useState(null);

  // Edit modal
  const [editField, setEditField] = useState(null); // 'name' | 'phone' | null
  const [savingField, setSavingField] = useState(false);

  // Password collapse
  const [showPwd, setShowPwd] = useState(false);
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [changingPwd, setChangingPwd] = useState(false);

  // Telegram (Zari)
  const [showTg, setShowTg] = useState(false);
  const [tgStatus, setTgStatus] = useState(null);
  const [tgCode, setTgCode] = useState(null);
  const [tgGenerating, setTgGenerating] = useState(false);

  // Подгрузка профиля если в контексте пусто (например, прямой mount overlay)
  useEffect(() => {
    if (ctxPatient) {
      setProfile(ctxPatient);
      setLoading(false);
      return;
    }
    setLoading(true);
    patientAuth.getMe()
      .then((res) => setProfile(res.data || null))
      .catch(() => toast.error('Ошибка', 'Не удалось загрузить профиль'))
      .finally(() => setLoading(false));
  }, [ctxPatient, toast]);

  // Avatar blob — endpoint защищён cookie, <img> не сошлёт креды
  useEffect(() => {
    if (!profile?.avatar_url) {
      setAvatarBlobUrl(null);
      return undefined;
    }
    let cancelled = false;
    let createdUrl = null;
    patientAuth.fetchAvatarBlob()
      .then((res) => {
        if (cancelled) return;
        createdUrl = URL.createObjectURL(res.data);
        setAvatarBlobUrl(createdUrl);
      })
      .catch(() => { if (!cancelled) setAvatarBlobUrl(null); });
    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [profile?.avatar_url]);

  // Telegram статус — однократно при открытии overlay
  useEffect(() => {
    rehab.getTelegramStatus()
      .then((res) => setTgStatus(res.data || null))
      .catch(() => { /* нет привязки — ок, будет null */ });
  }, []);

  // Esc на overlay — закрыть
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && !editField) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editField, onClose]);

  const initial = (profile?.full_name || '?').trim().charAt(0).toUpperCase() || '?';

  const handleEditSave = useCallback(async (value) => {
    if (editField === 'name' && !value) {
      toast.error('Ошибка', 'Имя не может быть пустым');
      return;
    }
    setSavingField(true);
    const payload = editField === 'name' ? { full_name: value } : { phone: value || null };
    try {
      const res = await patientAuth.updateMe(payload);
      setProfile(res.data || profile);
      // Синхронизируем с PatientAuthContext чтобы avatar/streak в шапке тоже знали
      if (refresh) refresh();
      toast.success('Сохранено', editField === 'name' ? 'Имя обновлено' : 'Телефон обновлён');
      setEditField(null);
    } catch (err) {
      toast.error('Ошибка', err?.response?.data?.message || 'Не удалось сохранить');
    } finally {
      setSavingField(false);
    }
  }, [editField, profile, refresh, toast]);

  // Avatar upload
  const handleAvatarPick = () => fileInputRef.current?.click();
  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      toast.error('Ошибка', 'Разрешены только JPEG, PNG, WEBP');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Ошибка', 'Максимальный размер — 10MB');
      return;
    }
    setAvatarUploading(true);
    try {
      const fd = new FormData();
      fd.append('avatar', file);
      const res = await patientAuth.uploadAvatar(fd);
      const url = res.data?.avatar_url;
      if (url) {
        setProfile((p) => ({ ...p, avatar_url: url }));
        if (refresh) refresh();
        toast.success('Готово', 'Фото обновлено');
      }
    } catch (err) {
      toast.error('Ошибка', err?.response?.data?.message || 'Не удалось загрузить фото');
    } finally {
      setAvatarUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Password change
  const handleChangePwd = async () => {
    if (!oldPwd || !newPwd || !confirmPwd) {
      toast.error('Ошибка', 'Заполните все поля');
      return;
    }
    if (newPwd.length < 8) {
      toast.error('Ошибка', 'Новый пароль — минимум 8 символов');
      return;
    }
    if (newPwd !== confirmPwd) {
      toast.error('Ошибка', 'Пароли не совпадают');
      return;
    }
    setChangingPwd(true);
    try {
      await patientAuth.changePassword({ old_password: oldPwd, new_password: newPwd });
      toast.success('Пароль изменён', 'Выход через 2 секунды…');
      setTimeout(() => handleLogout(), 2000);
    } catch (err) {
      toast.error('Ошибка', err?.response?.data?.message || 'Не удалось сменить пароль');
    } finally {
      setChangingPwd(false);
    }
  };

  // Telegram — генерация кода
  const handleGenerateTgCode = async () => {
    setTgGenerating(true);
    try {
      const res = await rehab.generateTelegramCode();
      setTgCode(res.data?.code || null);
    } catch (err) {
      toast.error('Ошибка', err?.response?.data?.message || 'Не удалось получить код');
    } finally {
      setTgGenerating(false);
    }
  };

  const handleUnlinkTg = async () => {
    try {
      await rehab.unlinkTelegram();
      setTgStatus(null);
      setTgCode(null);
      toast.success('Готово', 'Telegram отвязан');
    } catch (err) {
      toast.error('Ошибка', err?.response?.data?.message || 'Не удалось отвязать');
    }
  };

  const handleCuratorClick = () => {
    if (goTo) goTo(CONTACT_TAB_ID);
    else onClose();
  };

  const avatarSrc = profile?.avatar_url
    ? (profile.avatar_url.startsWith('http') ? profile.avatar_url : avatarBlobUrl)
    : null;

  return (
    <div
      className="pd-profile-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Профиль"
    >
      {/* Header */}
      <header className="pd-profile-overlay-header">
        <button
          type="button"
          className="pd-profile-overlay-back"
          onClick={onClose}
          aria-label="Назад"
        >
          <ChevronLeft size={18} />
        </button>
        <h1 className="pd-profile-overlay-title">Профиль</h1>
      </header>

      <div className="pd-profile-overlay-body">
        {loading ? (
          <div className="pd-profile-loading-skeleton">
            <div className="pd-skeleton" style={{ height: 110, borderRadius: 18, marginBottom: 18 }} />
            <div className="pd-skeleton" style={{ height: 200, borderRadius: 16, marginBottom: 14 }} />
            <div className="pd-skeleton" style={{ height: 160, borderRadius: 16 }} />
          </div>
        ) : (
          <>
            {/* ===== Identity ===== */}
            <div className="pd-profile-identity">
              <div className="pd-profile-identity-avatar-wrap">
                {avatarSrc ? (
                  <img src={avatarSrc} alt="Аватар" className="pd-profile-identity-avatar" />
                ) : (
                  <div className="pd-profile-identity-avatar pd-profile-identity-avatar--initial">
                    {initial}
                  </div>
                )}
                <button
                  type="button"
                  className="pd-profile-identity-camera"
                  onClick={handleAvatarPick}
                  disabled={avatarUploading}
                  aria-label="Изменить фото"
                >
                  <Camera size={12} />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleAvatarChange}
                  className="pd-profile-identity-file"
                  data-testid="avatar-file-input"
                />
              </div>
              <div className="pd-profile-identity-text">
                <div className="pd-profile-identity-name">{profile?.full_name || 'Пациент'}</div>
                <div className="pd-profile-identity-email">{profile?.email}</div>
                {profile?.diagnosis && (
                  <div className="pd-profile-identity-chip">
                    <Heart size={11} aria-hidden="true" />
                    <span>{profile.diagnosis}</span>
                  </div>
                )}
              </div>
            </div>

            {/* ===== Личное ===== */}
            <div className="pd-profile-section">
              <div className="pd-profile-section-label">Личное</div>
              <div className="pd-profile-section-card">
                <SettingsRow
                  label="Имя"
                  value={profile?.full_name || '—'}
                  Icon={User}
                  onClick={() => setEditField('name')}
                />
                <SettingsRow
                  label="Email"
                  value={profile?.email || '—'}
                  Icon={Mail}
                  readonly
                />
                <SettingsRow
                  label="Телефон"
                  value={profile?.phone || 'Не указан'}
                  Icon={Phone}
                  onClick={() => setEditField('phone')}
                />
                <SettingsRow
                  label="Дата рождения"
                  value={formatDate(profile?.birth_date)}
                  Icon={Calendar}
                  readonly
                  last
                />
              </div>
            </div>

            {/* ===== Реабилитация ===== */}
            <div className="pd-profile-section">
              <div className="pd-profile-section-label">Реабилитация</div>
              <div className="pd-profile-section-card">
                <SettingsRow
                  label="Диагноз"
                  value={profile?.diagnosis || 'Не задан'}
                  Icon={Heart}
                  iconColor="var(--pd-color-primary)"
                  readonly
                />
                <SettingsRow
                  label="Дата операции"
                  value={formatDate(profile?.surgery_date)}
                  Icon={Calendar}
                  iconColor="var(--pd-color-primary)"
                  readonly
                />
                <SettingsRow
                  label="Куратор"
                  value="Татьяна"
                  Icon={User}
                  iconColor="var(--pd-color-warm-dark)"
                  onClick={handleCuratorClick}
                  last
                />
              </div>
              <div className="pd-profile-section-hint">
                Диагноз и дата операции редактируются только куратором
              </div>
            </div>

            {/* ===== Связь ===== */}
            <div className="pd-profile-section">
              <div className="pd-profile-section-label">Связь</div>

              {/* Основной канал — disabled до Checkpoint 3 */}
              <div className="pd-profile-section-card pd-profile-section-card--disabled">
                <SettingsRow
                  label="Основной канал связи"
                  value="Скоро · выбор Telegram / WhatsApp / MAX"
                  Icon={MessageSquare}
                  readonly
                  last
                />
              </div>

              {/* Telegram (Zari) — функциональный */}
              <div
                className="pd-profile-section-card"
                style={{ marginTop: 8 }}
              >
                <button
                  type="button"
                  className="pd-profile-collapse-row"
                  onClick={() => setShowTg(!showTg)}
                  aria-expanded={showTg}
                >
                  <span className="pd-profile-collapse-icon-wrap" style={{ background: 'rgba(0, 136, 204, 0.12)' }}>
                    <Bot size={16} color="var(--pd-color-tg)" />
                  </span>
                  <span className="pd-profile-collapse-text">
                    <span className="pd-profile-collapse-title">Напоминания от Zari</span>
                    <span className="pd-profile-collapse-sub">
                      <span
                        className="pd-profile-status-dot"
                        style={{ background: tgStatus?.linked ? 'var(--pd-color-ok)' : 'var(--pd-n400)' }}
                      />
                      {tgStatus?.linked ? 'Подключён · Telegram' : 'Не подключён'}
                    </span>
                  </span>
                  <ChevronDown
                    size={14}
                    className={`pd-profile-collapse-chevron ${showTg ? 'pd-profile-collapse-chevron--open' : ''}`}
                  />
                </button>

                {showTg && (
                  <div className="pd-profile-collapse-body">
                    {tgStatus?.linked ? (
                      <>
                        <div className="pd-profile-tg-row">
                          <Bell size={14} aria-hidden="true" />
                          <span>Получаешь утренние и вечерние напоминания + советы дня</span>
                        </div>
                        <button
                          type="button"
                          className="pd-profile-btn-danger"
                          onClick={handleUnlinkTg}
                        >
                          Отвязать Telegram
                        </button>
                      </>
                    ) : (
                      <>
                        <div className="pd-profile-tg-hint">
                          Умные напоминания о занятиях, дневнике и советах дня приходят в Telegram. Подключение одноразовое.
                        </div>
                        {tgCode ? (
                          <div className="pd-profile-tg-code">
                            <div className="pd-profile-tg-code-label">Код для бота:</div>
                            <div className="pd-profile-tg-code-value">{tgCode}</div>
                            <a
                              href="https://t.me/azarean_rehab_bot"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="pd-profile-btn-tg"
                            >
                              <Bot size={14} /> Открыть @azarean_rehab_bot
                            </a>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="pd-profile-btn-tg"
                            onClick={handleGenerateTgCode}
                            disabled={tgGenerating}
                          >
                            <Bot size={14} />
                            {tgGenerating ? 'Генерируем код…' : 'Подключить Telegram'}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* ===== Безопасность ===== */}
            <div className="pd-profile-section">
              <div className="pd-profile-section-label">Безопасность</div>
              <div className="pd-profile-section-card">
                <button
                  type="button"
                  className="pd-profile-collapse-row pd-profile-collapse-row--last"
                  onClick={() => setShowPwd(!showPwd)}
                  aria-expanded={showPwd}
                >
                  <span className="pd-profile-collapse-icon-wrap">
                    <Lock size={16} color="var(--pd-n500)" />
                  </span>
                  <span className="pd-profile-collapse-text">
                    <span className="pd-profile-collapse-title">Сменить пароль</span>
                  </span>
                  <ChevronDown
                    size={14}
                    className={`pd-profile-collapse-chevron ${showPwd ? 'pd-profile-collapse-chevron--open' : ''}`}
                  />
                </button>

                {showPwd && (
                  <div className="pd-profile-collapse-body">
                    <input
                      type="password"
                      className="pd-profile-input"
                      value={oldPwd}
                      onChange={(e) => setOldPwd(e.target.value)}
                      placeholder="Текущий пароль"
                      autoComplete="current-password"
                    />
                    <input
                      type="password"
                      className="pd-profile-input"
                      value={newPwd}
                      onChange={(e) => setNewPwd(e.target.value)}
                      placeholder="Новый пароль (мин. 8 символов)"
                      autoComplete="new-password"
                    />
                    <input
                      type="password"
                      className="pd-profile-input"
                      value={confirmPwd}
                      onChange={(e) => setConfirmPwd(e.target.value)}
                      placeholder="Повторите новый пароль"
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      className="pd-profile-btn-primary"
                      onClick={handleChangePwd}
                      disabled={changingPwd}
                    >
                      {changingPwd ? 'Сменяем…' : 'Сменить пароль'}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* ===== Прочее ===== */}
            <div className="pd-profile-section">
              <div className="pd-profile-section-label">Прочее</div>
              <div className="pd-profile-section-card">
                <SettingsRow label="О приложении" Icon={Info} onClick={() => { /* TODO: open About modal */ }} />
                <SettingsRow label="Помощь и FAQ" Icon={HelpCircle} onClick={() => { /* TODO: open FAQ */ }} />
                <SettingsRow label="Выйти из аккаунта" Icon={LogOut} destructive onClick={handleLogout} last />
              </div>
            </div>

            <div className="pd-profile-version">Azarean Network · v1.0.0</div>
          </>
        )}
      </div>

      {/* Edit modal — name/phone */}
      <EditSheet
        open={!!editField}
        field={editField}
        initialValue={
          editField === 'name' ? (profile?.full_name || '')
          : editField === 'phone' ? (profile?.phone || '')
          : ''
        }
        onSave={handleEditSave}
        onClose={() => { if (!savingField) setEditField(null); }}
      />
    </div>
  );
}

ProfileScreen.propTypes = {
  onClose: PropTypes.func.isRequired,
  handleLogout: PropTypes.func.isRequired,
  goTo: PropTypes.func,
};

export default ProfileScreen;
