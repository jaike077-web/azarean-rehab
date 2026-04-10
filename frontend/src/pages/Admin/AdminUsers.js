import React, { useState, useEffect } from 'react';
import { admin } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import AdminUserModal from './AdminUserModal';
import { TableSkeleton } from '../../components/Skeleton';
import ConfirmModal from '../../components/ConfirmModal';
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
      setUsers(response.data || []);
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
          <Users size={22} strokeWidth={1.8} />
          <span>Управление пользователями</span>
        </h2>
        <button className="admin-btn-primary" onClick={() => setShowModal(true)}>
          <Plus size={16} strokeWidth={1.8} /> Создать
        </button>
      </div>

      <div className="admin-search-bar">
        <Search size={16} strokeWidth={1.8} />
        <input
          type="text"
          placeholder="Поиск по имени или email..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <TableSkeleton rows={8} columns={6} />
      ) : (
        <>
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
                        <Pencil size={14} strokeWidth={1.8} />
                      </button>
                      {user.is_active ? (
                        <button className="admin-action-btn btn-danger" title="Деактивировать"
                          onClick={() => setConfirmAction({ type: 'deactivate', user })}>
                          <UserX size={14} strokeWidth={1.8} />
                        </button>
                      ) : (
                        <button className="admin-action-btn btn-success" title="Активировать"
                          onClick={() => handleActivate(user)}>
                          <UserCheck size={14} strokeWidth={1.8} />
                        </button>
                      )}
                      {user.locked_until && new Date(user.locked_until) > new Date() && (
                        <button className="admin-action-btn btn-warning" title="Разблокировать"
                          onClick={() => handleUnlock(user)}>
                          <Unlock size={14} strokeWidth={1.8} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!loading && filteredUsers.length === 0 && (
            <div className="admin-empty-state">
              <div className="empty-state-content">
                <div className="empty-state-icon">
                  <Users size={48} strokeWidth={1.8} />
                </div>
                <h3>{search ? 'Пользователи не найдены' : 'Нет пользователей'}</h3>
                <p>{search ? 'Попробуйте изменить условия поиска' : 'Создайте первого пользователя'}</p>
              </div>
            </div>
          )}
        </>
      )}

      {(showModal || editUser) && (
        <AdminUserModal
          user={editUser}
          onSave={editUser ? handleUpdate : handleCreate}
          onClose={() => { setShowModal(false); setEditUser(null); }}
        />
      )}

      <ConfirmModal
        isOpen={!!confirmAction}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => {
          if (confirmAction?.type === 'deactivate') handleDeactivate(confirmAction.user);
        }}
        title="Деактивация пользователя"
        message={`Деактивировать пользователя "${confirmAction?.user?.full_name}"? Он потеряет доступ к системе.`}
        confirmText="Деактивировать"
        variant="danger"
        icon={UserX}
      />
    </div>
  );
}

export default AdminUsers;
