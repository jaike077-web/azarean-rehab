import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { admin } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import AdminUserModal from './AdminUserModal';
import { TableSkeleton } from '../../components/Skeleton';
import ConfirmModal from '../../components/ConfirmModal';
import { Users, Plus, Pencil, UserX, UserCheck, Unlock, Search } from 'lucide-react';
import s from './AdminUsers.module.css';

function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);
  const toast = useToast();
  const { user: currentUser, logout } = useAuth();
  const navigate = useNavigate();

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
    const isSelf = currentUser && editUser && editUser.id === currentUser.id;
    const changedPassword = !!data.new_password;
    await admin.updateUser(editUser.id, data);
    setEditUser(null);
    // Если меняем СВОЙ пароль — backend инвалидирует все refresh_tokens.
    // Принудительно logout + redirect, иначе access_token продолжит работать
    // до expiry и UX будет рассинхронизирован.
    if (isSelf && changedPassword) {
      toast.success('Пароль обновлён — войдите с новым');
      logout();
      navigate('/login');
      return;
    }
    toast.success('Пользователь обновлён');
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
      return <span className={`${s.adminBadge} ${s.badgeLocked}`}>Заблокирован</span>;
    }
    if (!user.is_active) {
      return <span className={`${s.adminBadge} ${s.badgeInactive}`}>Неактивен</span>;
    }
    return <span className={`${s.adminBadge} ${s.badgeActive}`}>Активен</span>;
  };

  return (
    <div className={s.adminUsers}>
      <div className={s.adminSectionHeader}>
        <h2 className={s.adminSectionTitle}>
          <Users size={22} strokeWidth={1.8} />
          <span>Управление пользователями</span>
        </h2>
        <button className={s.adminBtnPrimary} onClick={() => setShowModal(true)}>
          <Plus size={16} strokeWidth={1.8} /> Создать
        </button>
      </div>

      <div className={s.adminSearchBar}>
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
          <div className={s.adminTableWrap}>
            <table className={s.adminTable}>
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
                  <tr key={user.id} className={!user.is_active ? s.rowInactive : ''}>
                    <td className={s.tdName}>{user.full_name}</td>
                    <td className={s.tdEmail}>{user.email}</td>
                    <td>
                      <span className={`${s.adminBadge} ${user.role === 'admin' ? s.badgeAdmin : s.badgeInstructor}`}>
                        {user.role === 'admin' ? 'Админ' : 'Инструктор'}
                      </span>
                    </td>
                    <td>{getStatusBadge(user)}</td>
                    <td className={s.tdDate}>{new Date(user.created_at).toLocaleDateString('ru-RU')}</td>
                    <td className={s.tdActions}>
                      <button className={s.adminActionBtn} title="Редактировать" onClick={() => setEditUser(user)}>
                        <Pencil size={14} strokeWidth={1.8} />
                      </button>
                      {user.is_active ? (
                        <button className={`${s.adminActionBtn} ${s.btnDanger}`} title="Деактивировать"
                          onClick={() => setConfirmAction({ type: 'deactivate', user })}>
                          <UserX size={14} strokeWidth={1.8} />
                        </button>
                      ) : (
                        <button className={`${s.adminActionBtn} ${s.btnSuccess}`} title="Активировать"
                          onClick={() => handleActivate(user)}>
                          <UserCheck size={14} strokeWidth={1.8} />
                        </button>
                      )}
                      {user.locked_until && new Date(user.locked_until) > new Date() && (
                        <button className={`${s.adminActionBtn} ${s.btnWarning}`} title="Разблокировать"
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
            <div className={s.adminEmptyState}>
              <div className={s.emptyStateContent}>
                <div className={s.emptyStateIcon}>
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
