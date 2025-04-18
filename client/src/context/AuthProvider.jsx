"use client";
import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    const savedUser = localStorage.getItem('userData');
    return savedUser ? JSON.parse(savedUser) : null;
  });
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // Initialize token on mount
  useEffect(() => {
    const token = localStorage.getItem('authToken');
    if (token) {
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    }
  }, []);

  const saveToken = useCallback((token) => {
    localStorage.setItem('authToken', token);
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  }, []);

  const removeToken = useCallback(() => {
    localStorage.removeItem('authToken');
    localStorage.removeItem('userData');
    delete api.defaults.headers.common['Authorization'];
  }, []);

  const login = useCallback(async (email, password) => {
    try {
      setLoading(true);
      const response = await api.post('/user/login', { email, password });

      if (response.data && response.data.token) {
        saveToken(response.data.token);
        setUser(response.data.user);
        localStorage.setItem('userData', JSON.stringify(response.data.user));
        navigate('/dashboard', { replace: true });
        return { success: true };
      }
      return { success: false, error: 'Invalid response from server' };
    } catch (error) {
      console.error('Login failed:', error);
      removeToken();
      setUser(null);
      return {
        success: false,
        error: error.response?.data?.message || 'Login failed'
      };
    } finally {
      setLoading(false);
    }
  }, [saveToken, removeToken, navigate]);

  const logout = useCallback(async () => {
    try {
      await api.post('/user/logout');
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      removeToken();
      setUser(null);
      navigate('/login', { replace: true });
    }
  }, [navigate, removeToken]);

  const value = {
    user,
    login,
    logout,
    loading,
    isAuthenticated: !!user,
    token: localStorage.getItem('authToken')
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthProvider;