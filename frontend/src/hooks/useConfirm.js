// =====================================================
// useConfirm Hook - Azarean Network
// Замена window.confirm() через React state
// =====================================================

import { useState, useCallback } from 'react';

/**
 * Hook для управления модалкой подтверждения
 *
 * @example
 * const { confirmState, confirm, closeConfirm } = useConfirm();
 *
 * // Вызов
 * confirm({
 *   title: 'Удалить?',
 *   message: 'Это действие нельзя отменить',
 *   onConfirm: () => handleDelete()
 * });
 *
 * // В JSX
 * <ConfirmModal {...confirmState} onClose={closeConfirm} />
 */
const useConfirm = () => {
  const [confirmState, setConfirmState] = useState({
    isOpen: false,
    title: '',
    message: '',
    confirmText: 'Подтвердить',
    cancelText: 'Отмена',
    variant: 'danger',
    onConfirm: () => {}
  });

  const confirm = useCallback((options) => {
    setConfirmState({
      isOpen: true,
      title: options.title || 'Подтверждение',
      message: options.message || '',
      confirmText: options.confirmText || 'Подтвердить',
      cancelText: options.cancelText || 'Отмена',
      variant: options.variant || 'danger',
      onConfirm: options.onConfirm || (() => {})
    });
  }, []);

  const closeConfirm = useCallback(() => {
    setConfirmState(prev => ({ ...prev, isOpen: false }));
  }, []);

  return { confirmState, confirm, closeConfirm };
};

export default useConfirm;
