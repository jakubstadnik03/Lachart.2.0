"use client";
import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    // Načtení tokenu a uživatele z localStorage při startu
    const storedToken = localStorage.getItem("token");
    const storedUser = localStorage.getItem("user");
    
    if (storedToken) {
      setToken(storedToken);
      // Nastavení tokenu do API
      api.defaults.headers.common["Authorization"] = `Bearer ${storedToken}`;
    }
    
    if (storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser);
        setUser(parsedUser);
      } catch (error) {
        console.error("Error parsing user data:", error);
        localStorage.removeItem("user");
      }
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

  const login = useCallback(async (email, password, userData = null) => {
    try {
      if (userData) {
        // Pro sociální přihlášení
        const { token: socialToken, user: socialUser } = userData;
        setToken(socialToken);
        setUser(socialUser);
        localStorage.setItem("token", socialToken);
        localStorage.setItem("user", JSON.stringify(socialUser));
        api.defaults.headers.common["Authorization"] = `Bearer ${socialToken}`;
        navigate('/dashboard', { replace: true });
        return { success: true };
      } else {
        // Pro běžné přihlášení
        const response = await api.post("/user/login", { email, password });
        const { token: loginToken, user: loginUser } = response.data;
        
        setToken(loginToken);
        setUser(loginUser);
        localStorage.setItem("token", loginToken);
        localStorage.setItem("user", JSON.stringify(loginUser));
        api.defaults.headers.common["Authorization"] = `Bearer ${loginToken}`;
        navigate('/dashboard', { replace: true });
        return { success: true };
      }
    } catch (error) {
      console.error("Login error:", error);
      removeToken();
      setUser(null);
      return { 
        success: false, 
        error: error.response?.data?.message || "Login failed" 
      };
    }
  }, [navigate, removeToken]);

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
    token,
    login,
    logout,
    isAuthenticated: !!token,
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