// =====================================================
// TOAST CONTEXT - Azarean Network
// Использование: const toast = useToast();
//               toast.success('Сохранено!');
//               toast.error('Ошибка', 'Не удалось сохранить');
// =====================================================

import React, { createContext, useContext, useState, useCallback } from 'react';
import Toast from '../components/Toast';

const ToastContext = createContext(null);

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
};

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const addToast = useCallback((type, titleOrMessage, message, duration = 4000) => {
    const id = Date.now() + Math.random();
    
    // Если передан только один аргумент после type — это message
    const toastTitle = message ? titleOrMessage : null;
    const toastMessage = message || titleOrMessage;

    const newToast = {
      id,
      type,
      title: toastTitle,
      message: toastMessage,
      duration,
    };

    setToasts((prev) => [...prev, newToast]);

    return id;
  }, []);

  const toast = {
    success: (titleOrMessage, message, duration) => 
      addToast('success', titleOrMessage, message, duration),
    
    error: (titleOrMessage, message, duration) => 
      addToast('error', titleOrMessage, message, duration),
    
    warning: (titleOrMessage, message, duration) => 
      addToast('warning', titleOrMessage, message, duration),
    
    info: (titleOrMessage, message, duration) => 
      addToast('info', titleOrMessage, message, duration),
    
    remove: removeToast,
  };

  return (
    <ToastContext.Provider value={toast}>
      {children}
      
      {/* Toast Container */}
      <div className="toast-container">
        {toasts.map((t) => (
          <Toast
            key={t.id}
            id={t.id}
            type={t.type}
            title={t.title}
            message={t.message}
            duration={t.duration}
            onClose={removeToast}
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export default ToastContext;
