import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';

// When the app is served by the same server (backend/public), use relative path.
// When running in dev mode (React on :3000, backend on :5000), use absolute.
const DEV_MODE = window.location.port === '3000';
const API_URL = DEV_MODE
  ? (process.env.REACT_APP_API_URL || 'http://localhost:5000/api')
  : '/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);

  const api = axios.create({
    baseURL: API_URL,
    headers: { 'Content-Type': 'application/json' }
  });

  // Add token to requests
  api.interceptors.request.use((config) => {
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  });

  // Handle 401 errors
  api.interceptors.response.use(
    (response) => response,
    async (error) => {
      if (error.response?.status === 401) {
        localStorage.removeItem('token');
        setToken(null);
        setUser(null);
      }
      return Promise.reject(error);
    }
  );

  const login = useCallback(async (email, password, rememberDevice = false) => {
    const res = await api.post('/auth/login', { email, password, remember_device: rememberDevice });
    const { token: newToken, user: userData } = res.data;
    localStorage.setItem('token', newToken);
    setToken(newToken);
    setUser(userData);
    return userData;
  }, [api]);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch (e) { /* ignore */ }
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
  }, [api]);

  // Check token on mount
  useEffect(() => {
    if (token) {
      // Fetch current user info
      api.get('/employees/me').then(res => {
        setUser(res.data.employee);
        setLoading(false);
      }).catch(() => {
        localStorage.removeItem('token');
        setToken(null);
        setLoading(false);
      });
    } else {
      setLoading(false);
    }
  }, [token]); // eslint-disable-line

  const value = { user, token, login, logout, api, loading, isAdmin: user?.role === 'Admin' };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export default AuthContext;
