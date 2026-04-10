import React, { createContext, useState, useContext, useEffect } from 'react';
import { auth, clearTokens } from '../services/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Проверяем есть ли токен при загрузке
    const token = localStorage.getItem('token');
    if (token) {
      loadUser();
    } else {
      setLoading(false);
    }
  }, []);

  const loadUser = async () => {
    try {
      const response = await auth.getMe();
      setUser(response.data);
    } catch (error) {
      console.error('Ошибка загрузки пользователя:', error);
      clearTokens();
    } finally {
      setLoading(false);
    }
  };

  const login = async (credentials) => {
    const response = await auth.login(credentials);
    // api.js auth.login() уже сохраняет token + refresh_token через setTokens()
    // После unwrap interceptor response.data = { user, token, refresh_token }
    const user = response.data?.user || response.data;
    setUser(user);
    return user;
  };

  const logout = () => {
    clearTokens(); // Удаляет и token, и refresh_token
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};