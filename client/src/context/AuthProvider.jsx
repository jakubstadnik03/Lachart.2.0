"use client";
import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      setToken(token);
      setIsAuthenticated(true);
      setLoading(false);
    } else {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Načtení tokenu a uživatele z localStorage při startu
    const storedToken = localStorage.getItem("token");
    const storedUser = localStorage.getItem("user");
    
    if (storedToken) {
      setToken(storedToken);
      setIsAuthenticated(true);
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
    localStorage.setItem("token", token);
    api.defaults.headers.common["Authorization"] = `Bearer ${token}`;
    setIsAuthenticated(true);
  }, []);

  const removeToken = useCallback(() => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    delete api.defaults.headers.common["Authorization"];
    setToken(null);
    setUser(null);
    setIsAuthenticated(false);
  }, []);

  const login = useCallback(async (email, password, token, user) => {
    try {
      if (token && user) {
        // Pro sociální přihlášení nebo přímé přihlášení s tokenem
        setToken(token);
        setUser(user);
        saveToken(token);
        localStorage.setItem("user", JSON.stringify(user));
        return { success: true };
      } else {
        // Pro běžné přihlášení
        const response = await api.post("/user/login", { email, password });
        const { token: loginToken, user: loginUser } = response.data;
        
        setToken(loginToken);
        setUser(loginUser);
        saveToken(loginToken);
        localStorage.setItem("user", JSON.stringify(loginUser));
        return { success: true };
      }
    } catch (error) {
      console.error("Login error:", error);
      removeToken();
      return { 
        success: false, 
        error: error.response?.data?.message || "Login failed" 
      };
    }
  }, [removeToken, saveToken]);

  const logout = useCallback(async () => {
    try {
      await api.post('/user/logout');
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      removeToken();
      navigate('/login', { replace: true });
    }
  }, [navigate, removeToken]);

  const value = {
    user,
    token,
    isAuthenticated,
    login,
    logout,
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