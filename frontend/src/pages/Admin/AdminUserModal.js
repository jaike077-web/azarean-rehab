import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';

function AdminUserModal({ user, onSave, onClose }) {
  const isEdit = !!user;
  const [form, setForm] = useState({
    email: '',
    full_name: '',
    role: 'instructor',
    password: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (user) {
      setForm({
        email: user.email || '',
        full_name: user.full_name || '',
        role: user.role || 'instructor',
        password: '',
      });
    }
  }, [user]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!form.full_name.trim()) {
      setError('Введите ФИО');
      return;
    }
    if (!isEdit && !form.email.trim()) {
      setError('Введите email');
      return;
    }
    if (!isEdit && !form.password) {
      setError('Введите пароль');
      return;
    }

    setSaving(true);
    try {
      const data = isEdit
        ? { full_name: form.full_name, role: form.role }
        : { email: form.email, password: form.password, full_name: form.full_name, role: form.role };
      await onSave(data);
    } catch (err) {
      setError(err.response?.data?.message || 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <div className="admin-modal" onClick={e => e.stopPropagation()}>
        <div className="admin-modal-header">
          <h3>{isEdit ? 'Редактировать пользователя' : 'Создать пользователя'}</h3>
          <button className="admin-modal-close" onClick={onClose}><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} className="admin-modal-form">
          {error && <div className="admin-form-error">{error}</div>}

          <div className="admin-form-group">
            <label>ФИО</label>
            <input
              type="text"
              value={form.full_name}
              onChange={e => setForm(prev => ({ ...prev, full_name: e.target.value }))}
              placeholder="Иванов Иван Иванович"
            />
          </div>

          {!isEdit && (
            <div className="admin-form-group">
              <label>Email</label>
              <input
                type="email"
                value={form.email}
                onChange={e => setForm(prev => ({ ...prev, email: e.target.value }))}
                placeholder="email@example.com"
              />
            </div>
          )}

          {!isEdit && (
            <div className="admin-form-group">
              <label>Пароль</label>
              <input
                type="password"
                value={form.password}
                onChange={e => setForm(prev => ({ ...prev, password: e.target.value }))}
                placeholder="Минимум 8 символов, A-Z, a-z, 0-9"
              />
            </div>
          )}

          <div className="admin-form-group">
            <label>Роль</label>
            <select
              value={form.role}
              onChange={e => setForm(prev => ({ ...prev, role: e.target.value }))}
            >
              <option value="instructor">Инструктор</option>
              <option value="admin">Администратор</option>
            </select>
          </div>

          <div className="admin-modal-actions">
            <button type="button" className="admin-btn-secondary" onClick={onClose}>Отмена</button>
            <button type="submit" className="admin-btn-primary" disabled={saving}>
              {saving ? 'Сохранение...' : isEdit ? 'Сохранить' : 'Создать'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default AdminUserModal;
