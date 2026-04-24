// =====================================================
// PATIENT AUTH CONTEXT
// =====================================================
// После миграции Patient JWT из localStorage в httpOnly cookie (баг #11)
// "залогинен ли пациент" определяется через GET /me на mount.
// Если cookie валидна — getMe вернёт patient объект, иначе 401.
// =====================================================

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { patientAuth } from '../services/api';

const PatientAuthContext = createContext(null);

export function PatientAuthProvider({ children }) {
  const [patient, setPatient] = useState(null);
  const [loading, setLoading] = useState(true);

  // Начальная проверка cookie через /me
  const refresh = useCallback(async () => {
    try {
      const res = await patientAuth.getMe();
      // После unwrap interceptor res.data = patient объект напрямую
      const data = res.data || null;
      setPatient(data);
      setLoading(false);
      return data;
    } catch (_) {
      setPatient(null);
      setLoading(false);
      return null;
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Вызывается PatientLogin/PatientRegister после успешного API-ответа.
  // Backend уже поставил cookie, нам остаётся только обновить локальный state.
  const login = useCallback((patientData) => {
    setPatient(patientData || null);
  }, []);

  const logout = useCallback(async () => {
    try {
      await patientAuth.logout();
    } catch (_) {
      // всё равно очищаем клиентский state
    }
    setPatient(null);
  }, []);

  // Обновление профиля через PUT /patient-auth/me.
  // Используется messenger picker'ом и другими местами, где нужно
  // синхронно обновить patient в контексте после мутации на сервере.
  // Отдельно от login() чтобы не смешивать семантику (login — после логин-флоу).
  const updatePatient = useCallback(async (partial) => {
    const res = await patientAuth.updateMe(partial);
    const data = res.data || null;
    if (data) setPatient(data);
    return data;
  }, []);

  const value = { patient, loading, login, logout, refresh, updatePatient };

  return (
    <PatientAuthContext.Provider value={value}>
      {children}
    </PatientAuthContext.Provider>
  );
}

export function usePatientAuth() {
  const ctx = useContext(PatientAuthContext);
  if (!ctx) {
    throw new Error('usePatientAuth must be used inside PatientAuthProvider');
  }
  return ctx;
}

export default PatientAuthContext;
