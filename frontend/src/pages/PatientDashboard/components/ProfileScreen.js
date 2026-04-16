// =====================================================
// PROFILE SCREEN - Patient Dashboard
// Avatar, personal data, password change, logout
// Sprint 2
// =====================================================

import React, { useState, useEffect, useRef } from 'react';
import { Camera, ClipboardList, Lock, Info, ChevronDown, LogOut } from 'lucide-react';
import { patientAuth } from '../../../services/api';
import { useToast } from '../../../context/ToastContext';

const ProfileScreen = ({ handleLogout }) => {
  const toast = useToast();
  const fileInputRef = useRef(null);

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  // Blob URL для аватара (endpoint теперь защищён JWT, <img> не может слать header напрямую)
  const [avatarBlobUrl, setAvatarBlobUrl] = useState(null);

  // Form fields
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [birthDate, setBirthDate] = useState('');

  // Password change
  const [showPasswordSection, setShowPasswordSection] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  // Load profile data
  useEffect(() => {
    const loadProfile = async () => {
      setLoading(true);
      try {
        const response = await patientAuth.getMe();
        const patient = response.data;
        setProfile(patient);
        setFullName(patient.full_name || '');
        setPhone(patient.phone || '');
        setBirthDate(patient.birth_date ? patient.birth_date.split('T')[0] : '');
      } catch (error) {
        toast.error('Ошибка', 'Не удалось загрузить профиль');
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, [toast]);

  // Загрузка аватара как blob когда появляется/меняется avatar_url
  useEffect(() => {
    if (!profile?.avatar_url) {
      setAvatarBlobUrl(null);
      return;
    }

    let cancelled = false;
    let createdUrl = null;

    patientAuth
      .fetchAvatarBlob()
      .then((response) => {
        if (cancelled) return;
        createdUrl = URL.createObjectURL(response.data);
        setAvatarBlobUrl(createdUrl);
      })
      .catch(() => {
        if (!cancelled) setAvatarBlobUrl(null);
      });

    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [profile?.avatar_url]);

  // Save profile
  const handleSaveProfile = async () => {
    if (!fullName.trim()) {
      toast.error('Ошибка', 'Имя не может быть пустым');
      return;
    }

    setSaving(true);
    try {
      const response = await patientAuth.updateMe({
        full_name: fullName.trim(),
        phone: phone.trim() || null,
        birth_date: birthDate || null,
      });
      const updated = response.data;
      setProfile(updated);
      toast.success('Сохранено', 'Профиль обновлён');
    } catch (error) {
      toast.error('Ошибка', error.response?.data?.message || 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  };

  // Avatar upload
  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate client-side
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
      const formData = new FormData();
      formData.append('avatar', file);
      const response = await patientAuth.uploadAvatar(formData);
      const avatarUrl = response.data?.avatar_url;
      if (avatarUrl) {
        setProfile((prev) => ({ ...prev, avatar_url: avatarUrl }));
        toast.success('Готово', 'Фото обновлено');
      }
    } catch (error) {
      toast.error('Ошибка', error.response?.data?.message || 'Не удалось загрузить фото');
    } finally {
      setAvatarUploading(false);
      // Reset file input
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Delete avatar
  const handleDeleteAvatar = async () => {
    setAvatarUploading(true);
    try {
      await patientAuth.deleteAvatar();
      setProfile((prev) => ({ ...prev, avatar_url: null }));
      toast.success('Готово', 'Фото удалено');
    } catch (error) {
      toast.error('Ошибка', 'Не удалось удалить фото');
    } finally {
      setAvatarUploading(false);
    }
  };

  // Change password
  const handleChangePassword = async () => {
    if (!oldPassword || !newPassword || !confirmPassword) {
      toast.error('Ошибка', 'Заполните все поля');
      return;
    }
    if (newPassword.length < 8) {
      toast.error('Ошибка', 'Новый пароль — минимум 8 символов');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('Ошибка', 'Пароли не совпадают');
      return;
    }

    setChangingPassword(true);
    try {
      await patientAuth.changePassword({
        old_password: oldPassword,
        new_password: newPassword,
      });
      toast.success('Пароль изменён', 'Выход через 2 секунды...');
      setTimeout(() => {
        handleLogout();
      }, 2000);
    } catch (error) {
      toast.error('Ошибка', error.response?.data?.message || 'Не удалось сменить пароль');
    } finally {
      setChangingPassword(false);
    }
  };

  // Helpers
  const getAvatarUrl = () => {
    if (!profile?.avatar_url) return null;
    // Внешние URL (OAuth-провайдеры) отдаём как есть
    if (profile.avatar_url.startsWith('http')) return profile.avatar_url;
    // Локальные файлы — blob URL, полученный через защищённый endpoint
    return avatarBlobUrl;
  };

  const getInitials = () => {
    if (!profile?.full_name) return '?';
    return profile.full_name
      .split(' ')
      .map((w) => w[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    try {
      return new Date(dateStr).toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  // Loading skeleton
  if (loading) {
    return (
      <div className="pd-profile-screen">
        <h1 className="pd-screen-title">Профиль</h1>
        <div className="pd-section pd-profile-loading-hero">
          <div className="pd-skeleton pd-skeleton--circle pd-profile-loading-avatar"></div>
          <div className="pd-skeleton pd-skeleton--title pd-profile-loading-title"></div>
          <div className="pd-skeleton pd-skeleton--text pd-profile-loading-text"></div>
        </div>
        <div className="pd-section">
          <div className="pd-skeleton pd-skeleton--text pd-profile-loading-field"></div>
          <div className="pd-skeleton pd-skeleton--card pd-profile-loading-input"></div>
          <div className="pd-skeleton pd-skeleton--text pd-profile-loading-field"></div>
          <div className="pd-skeleton pd-skeleton--card pd-profile-loading-input"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="pd-profile-screen">
      {/* Title */}
      <h1 className="pd-screen-title">Профиль</h1>

      {/* ===== Avatar Section ===== */}
      <div className="pd-section pd-profile-avatar-section">
        <div className="pd-profile-avatar-wrapper" onClick={handleAvatarClick}>
          {avatarUploading ? (
            <div className="pd-profile-avatar pd-profile-avatar--loading">
              <span>…</span>
            </div>
          ) : getAvatarUrl() ? (
            <img
              src={getAvatarUrl()}
              alt="Аватар"
              className="pd-profile-avatar"
            />
          ) : (
            <div className="pd-profile-avatar pd-profile-avatar--placeholder">
              <span className="pd-profile-avatar-initials">{getInitials()}</span>
            </div>
          )}
          <div className="pd-profile-avatar-badge">
            <Camera size={14} />
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleAvatarChange}
          style={{ display: 'none' }}
          data-testid="avatar-file-input"
        />

        <h2 className="pd-profile-name">{profile?.full_name || 'Пациент'}</h2>
        <p className="pd-profile-email">{profile?.email}</p>

        <div className="pd-profile-avatar-actions">
          <button
            className="pd-profile-avatar-btn"
            onClick={handleAvatarClick}
            disabled={avatarUploading}
          >
            Изменить фото
          </button>
          {profile?.avatar_url && (
            <button
              className="pd-profile-avatar-btn pd-profile-avatar-btn--danger"
              onClick={handleDeleteAvatar}
              disabled={avatarUploading}
            >
              Удалить
            </button>
          )}
        </div>
      </div>

      {/* ===== Personal Data ===== */}
      <div className="pd-section">
        <div className="pd-section-header">
          <ClipboardList size={18} className="pd-section-icon" />
          <h3 className="pd-section-title">Личные данные</h3>
        </div>

        <div className="pd-profile-field">
          <label className="pd-profile-label">Имя</label>
          <input
            type="text"
            className="pd-profile-input"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Ваше имя"
          />
        </div>

        <div className="pd-profile-field">
          <label className="pd-profile-label">Email</label>
          <input
            type="email"
            className="pd-profile-input pd-profile-input--readonly"
            value={profile?.email || ''}
            readOnly
          />
        </div>

        <div className="pd-profile-field">
          <label className="pd-profile-label">Телефон</label>
          <input
            type="tel"
            className="pd-profile-input"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+7 (___) ___-__-__"
          />
        </div>

        <div className="pd-profile-field">
          <label className="pd-profile-label">Дата рождения</label>
          <input
            type="date"
            className="pd-profile-input"
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
          />
        </div>

        <button
          className="pd-profile-save-btn"
          onClick={handleSaveProfile}
          disabled={saving}
        >
          {saving ? 'Сохранение...' : 'Сохранить изменения'}
        </button>
      </div>

      {/* ===== Change Password ===== */}
      <div className="pd-section">
        <button
          className="pd-profile-collapse-btn"
          onClick={() => setShowPasswordSection(!showPasswordSection)}
        >
          <div className="pd-profile-collapse-head">
            <Lock size={18} className="pd-section-icon" />
            <span className="pd-section-title">Сменить пароль</span>
          </div>
          <ChevronDown
            size={18}
            className={`pd-profile-collapse-chevron ${showPasswordSection ? 'pd-profile-collapse-chevron--open' : ''}`}
          />
        </button>

        {showPasswordSection && (
          <div className="pd-profile-password-section">
            <div className="pd-profile-field">
              <label className="pd-profile-label">Текущий пароль</label>
              <input
                type="password"
                className="pd-profile-input"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                placeholder="Введите текущий пароль"
              />
            </div>

            <div className="pd-profile-field">
              <label className="pd-profile-label">Новый пароль</label>
              <input
                type="password"
                className="pd-profile-input"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Минимум 8 символов"
              />
            </div>

            <div className="pd-profile-field">
              <label className="pd-profile-label">Подтвердите пароль</label>
              <input
                type="password"
                className="pd-profile-input"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Повторите новый пароль"
              />
            </div>

            <button
              className="pd-profile-save-btn"
              onClick={handleChangePassword}
              disabled={changingPassword}
            >
              {changingPassword ? 'Сменяем...' : 'Сменить пароль'}
            </button>
          </div>
        )}
      </div>

      {/* ===== Account Info ===== */}
      <div className="pd-section">
        <div className="pd-section-header">
          <Info size={18} className="pd-section-icon" />
          <h3 className="pd-section-title">Информация</h3>
        </div>

        <div className="pd-profile-info-row">
          <span className="pd-profile-info-label">Дата регистрации</span>
          <span className="pd-profile-info-value">{formatDate(profile?.created_at)}</span>
        </div>
        <div className="pd-profile-info-row">
          <span className="pd-profile-info-label">Последний вход</span>
          <span className="pd-profile-info-value">{formatDate(profile?.last_login_at)}</span>
        </div>
        <div className="pd-profile-info-row">
          <span className="pd-profile-info-label">Провайдер</span>
          <span className="pd-profile-info-value">
            {profile?.auth_provider === 'local' ? 'Email/пароль' : profile?.auth_provider || '—'}
          </span>
        </div>
      </div>

      {/* ===== Logout ===== */}
      <button className="pd-profile-logout-btn" onClick={handleLogout}>
        <LogOut size={16} />
        <span>Выйти из аккаунта</span>
      </button>

      {/* Bottom spacer */}
      <div className="pd-bottom-spacer" />
    </div>
  );
};

export default ProfileScreen;
