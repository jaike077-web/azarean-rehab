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
      const data = res.data?.patient || res.data?.data?.patient || null;
      setPatient(data);
      return data;
    } catch (_) {
      setPatient(null);
      return null;
    }
  }, []);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
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

  const value = { patient, loading, login, logout, refresh };

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
