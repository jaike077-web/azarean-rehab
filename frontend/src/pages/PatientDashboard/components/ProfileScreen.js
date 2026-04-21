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
  Calendar, Lock, LogOut, Info, HelpCircle, Bot, Bell, Loader,
} from 'lucide-react';
import { patientAuth, rehab } from '../../../services/api';
import { useToast } from '../../../context/ToastContext';
import { usePatientAuth } from '../../../context/PatientAuthContext';
import {
  SettingsRow,
  MessengerCTA,
  MESSENGERS,
  MESSENGER_ICONS,
  MESSENGER_KEYS,
} from './ui';
import usePatientAvatarBlob from '../hooks/usePatientAvatarBlob';
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
            <X size={18} strokeWidth={2.4} />
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
  const { patient: ctxPatient, refresh, updatePatient } = usePatientAuth();
  const fileInputRef = useRef(null);

  const [profile, setProfile] = useState(ctxPatient || null);
  const [loading, setLoading] = useState(!ctxPatient);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const avatarBlobUrl = usePatientAvatarBlob(profile?.avatar_url);

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

  // Messenger picker (Checkpoint 3)
  const [showMessengerPicker, setShowMessengerPicker] = useState(false);
  const [messengerSaving, setMessengerSaving] = useState(false);

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

  // Avatar blob теперь через usePatientAvatarBlob (см. выше) — единый
  // источник истины и для шапки дашборда, и для identity-блока.

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

  // Re-entry guard через ref — setState не успеет обновиться синхронно если
  // onChange сработает дважды (React 18 StrictMode + быстрый клик).
  const uploadingRef = useRef(false);

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    // Сброс input СРАЗУ — чтобы переключение того же файла снова дёргало onChange.
    // Делаем до await чтобы повторный вызов с пустыми files (если такой возможен)
    // не уходил на бэк с empty form.
    if (fileInputRef.current) fileInputRef.current.value = '';

    if (!file) return;
    if (uploadingRef.current) return; // защита от двойного click

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      toast.error('Не подходит формат', 'Разрешены только JPEG, PNG или WEBP (без GIF)');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Файл слишком большой', 'Максимальный размер — 10 МБ');
      return;
    }

    uploadingRef.current = true;
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
      uploadingRef.current = false;
      setAvatarUploading(false);
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

  // Смена предпочитаемого канала связи. Optimistic update UI + rollback
  // на ошибке (правило паттерна из плана checkpoint 3).
  // updatePatient() сам синкает PatientAuthContext → все остальные экраны
  // получат новый preferred_messenger через usePatientAuth().
  const handleMessengerChange = useCallback(async (key) => {
    if (!profile) return;
    if (key === profile.preferred_messenger) return; // no-op
    if (!MESSENGER_KEYS.includes(key)) return;

    const prev = profile.preferred_messenger;
    setProfile((p) => ({ ...p, preferred_messenger: key }));
    setMessengerSaving(true);
    try {
      if (updatePatient) {
        await updatePatient({ preferred_messenger: key });
      } else {
        // Fallback если контекст ещё не расширен — прямой PUT + refresh
        await patientAuth.updateMe({ preferred_messenger: key });
        if (refresh) refresh();
      }
      toast.success('Канал связи изменён', `Теперь: ${MESSENGERS[key].name}`);
    } catch (err) {
      setProfile((p) => ({ ...p, preferred_messenger: prev }));
      toast.error('Ошибка', err?.response?.data?.message || 'Не удалось сохранить. Попробуйте ещё раз.');
    } finally {
      setMessengerSaving(false);
    }
  }, [profile, updatePatient, refresh, toast]);

  // usePatientAvatarBlob уже разруливает оба варианта (http vs локальный)
  const avatarSrc = avatarBlobUrl;

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
          <ChevronLeft size={20} strokeWidth={2.4} />
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
            {/* ===== Identity =====
                Аватар = кнопка. Тап в любом месте круга открывает file-picker
                (стандартный паттерн Telegram/Instagram/iOS). На desktop показывается
                hover-overlay с иконкой камеры — на мобиле опираемся на конвенцию. */}
            <div className="pd-profile-identity">
              <button
                type="button"
                className="pd-profile-identity-avatar-btn"
                onClick={handleAvatarPick}
                disabled={avatarUploading}
                aria-label="Изменить фото"
                title="Нажмите чтобы изменить фото"
              >
                {avatarSrc ? (
                  <img src={avatarSrc} alt="Аватар" className="pd-profile-identity-avatar" />
                ) : (
                  <div className="pd-profile-identity-avatar pd-profile-identity-avatar--initial">
                    {initial}
                  </div>
                )}
                <span className="pd-profile-identity-avatar-overlay" aria-hidden="true">
                  {avatarUploading
                    ? <Loader size={20} className="pd-profile-identity-avatar-spinner" />
                    : <Camera size={20} />}
                </span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleAvatarChange}
                className="pd-profile-identity-file"
                data-testid="avatar-file-input"
              />
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
            <div className="pd-profile-avatar-hint">
              <Camera size={12} aria-hidden="true" />
              <span>Нажмите на фото для смены аватара · JPEG, PNG или WEBP, до 10&nbsp;МБ</span>
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

              {/* Основной канал связи — tap раскрывает picker с 3 мессенджерами.
                  Optimistic update + rollback на ошибке (см. handleMessengerChange). */}
              <div className="pd-profile-section-card">
                {(() => {
                  const currentKey = MESSENGER_KEYS.includes(profile?.preferred_messenger)
                    ? profile.preferred_messenger
                    : 'telegram';
                  const CurrentIcon = MESSENGER_ICONS[currentKey];
                  const currentMsg = MESSENGERS[currentKey];
                  return (
                    <>
                      <SettingsRow
                        label="Основной канал связи"
                        value={currentMsg.name}
                        Icon={CurrentIcon}
                        iconColor={currentMsg.color}
                        onClick={() => setShowMessengerPicker((v) => !v)}
                        last
                      />
                      {showMessengerPicker && (
                        <div className="pd-messenger-picker" role="radiogroup" aria-label="Выбор канала связи">
                          {MESSENGER_KEYS.map((key) => {
                            const m = MESSENGERS[key];
                            const Icon = MESSENGER_ICONS[key];
                            const active = currentKey === key;
                            return (
                              <button
                                key={key}
                                type="button"
                                role="radio"
                                aria-checked={active}
                                className={`pd-messenger-card ${active ? 'pd-messenger-card--active' : ''}`}
                                onClick={() => handleMessengerChange(key)}
                                disabled={messengerSaving}
                                style={active ? { background: m.color } : undefined}
                              >
                                <Icon size={22} color={active ? '#fff' : m.color} />
                                <span className="pd-messenger-card-label">{m.name}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>

              {/* Демо-блок: «Связаться с куратором сейчас» — использует
                  выбранный канал. Полезен в Profile, т.к. пациент часто
                  открывает именно отсюда, чтобы обновить контакты. */}
              <div className="pd-profile-cta-wrap">
                <MessengerCTA
                  primary={
                    MESSENGER_KEYS.includes(profile?.preferred_messenger)
                      ? profile.preferred_messenger
                      : 'telegram'
                  }
                  label="Связаться с куратором"
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
