import React, { useState, useEffect } from 'react';
import { admin } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import AdminUserModal from './AdminUserModal';
import { Users, Plus, Pencil, UserX, UserCheck, Unlock, Search } from 'lucide-react';
import './AdminUsers.css';

function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);
  const toast = useToast();

  useEffect(() => { loadUsers(); }, []);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const response = await admin.getUsers();
      setUsers(response.data?.data || response.data || []);
    } catch (error) {
      toast.error('Ошибка загрузки пользователей');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (data) => {
    await admin.createUser(data);
    toast.success('Пользователь создан');
    setShowModal(false);
    loadUsers();
  };

  const handleUpdate = async (data) => {
    await admin.updateUser(editUser.id, data);
    toast.success('Пользователь обновлён');
    setEditUser(null);
    loadUsers();
  };

  const handleDeactivate = async (user) => {
    try {
      await admin.deactivateUser(user.id);
      toast.success(`${user.full_name} деактивирован`);
      loadUsers();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Ошибка деактивации');
    }
    setConfirmAction(null);
  };

  const handleActivate = async (user) => {
    try {
      await admin.activateUser(user.id);
      toast.success(`${user.full_name} активирован`);
      loadUsers();
    } catch (error) {
      toast.error('Ошибка активации');
    }
  };

  const handleUnlock = async (user) => {
    try {
      await admin.unlockUser(user.id);
      toast.success(`${user.full_name} разблокирован`);
      loadUsers();
    } catch (error) {
      toast.error('Ошибка разблокировки');
    }
  };

  const filteredUsers = users.filter(u =>
    u.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    u.email?.toLowerCase().includes(search.toLowerCase())
  );

  const getStatusBadge = (user) => {
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      return <span className="admin-badge badge-locked">Заблокирован</span>;
    }
    if (!user.is_active) {
      return <span className="admin-badge badge-inactive">Неактивен</span>;
    }
    return <span className="admin-badge badge-active">Активен</span>;
  };

  return (
    <div className="admin-users">
      <div className="admin-section-header">
        <h2 className="admin-section-title">
          <Users size={22} />
          <span>Управление пользователями</span>
        </h2>
        <button className="admin-btn-primary" onClick={() => setShowModal(true)}>
          <Plus size={16} /> Создать
        </button>
      </div>

      <div className="admin-search-bar">
        <Search size={16} />
        <input
          type="text"
          placeholder="Поиск по имени или email..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="admin-loading">Загрузка...</div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Имя</th>
                <th>Email</th>
                <th>Роль</th>
                <th>Статус</th>
                <th>Создан</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map(user => (
                <tr key={user.id} className={!user.is_active ? 'row-inactive' : ''}>
                  <td className="td-name">{user.full_name}</td>
                  <td className="td-email">{user.email}</td>
                  <td>
                    <span className={`admin-badge ${user.role === 'admin' ? 'badge-admin' : 'badge-instructor'}`}>
                      {user.role === 'admin' ? 'Админ' : 'Инструктор'}
                    </span>
                  </td>
                  <td>{getStatusBadge(user)}</td>
                  <td className="td-date">{new Date(user.created_at).toLocaleDateString('ru-RU')}</td>
                  <td className="td-actions">
                    <button className="admin-action-btn" title="Редактировать" onClick={() => setEditUser(user)}>
                      <Pencil size={14} />
                    </button>
                    {user.is_active ? (
                      <button className="admin-action-btn btn-danger" title="Деактивировать"
                        onClick={() => setConfirmAction({ type: 'deactivate', user })}>
                        <UserX size={14} />
                      </button>
                    ) : (
                      <button className="admin-action-btn btn-success" title="Активировать"
                        onClick={() => handleActivate(user)}>
                        <UserCheck size={14} />
                      </button>
                    )}
                    {user.locked_until && new Date(user.locked_until) > new Date() && (
                      <button className="admin-action-btn btn-warning" title="Разблокировать"
                        onClick={() => handleUnlock(user)}>
                        <Unlock size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {filteredUsers.length === 0 && (
                <tr><td colSpan="6" className="td-empty">Пользователи не найдены</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {(showModal || editUser) && (
        <AdminUserModal
          user={editUser}
          onSave={editUser ? handleUpdate : handleCreate}
          onClose={() => { setShowModal(false); setEditUser(null); }}
        />
      )}

      {confirmAction && (
        <div className="admin-modal-overlay" onClick={() => setConfirmAction(null)}>
          <div className="admin-modal admin-confirm-modal" onClick={e => e.stopPropagation()}>
            <h3>Подтверждение</h3>
            <p>Деактивировать пользователя <strong>{confirmAction.user.full_name}</strong>?</p>
            <p className="admin-confirm-note">Пользователь не сможет войти в систему.</p>
            <div className="admin-modal-actions">
              <button className="admin-btn-secondary" onClick={() => setConfirmAction(null)}>Отмена</button>
              <button className="admin-btn-danger" onClick={() => handleDeactivate(confirmAction.user)}>Деактивировать</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminUsers;
