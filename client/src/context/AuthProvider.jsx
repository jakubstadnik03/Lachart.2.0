"use client";
import React, { createContext, useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_ENDPOINTS } from '../config/api.config';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Kontrola existujícího tokenu při načtení
    const storedToken = localStorage.getItem('token') || sessionStorage.getItem('token');
    const storedUser = localStorage.getItem('user') || sessionStorage.getItem('user');
    
    if (storedToken && storedUser) {
      setToken(storedToken);
      setUser(JSON.parse(storedUser));
      navigate('/dashboard'); // Přesměrování na dashboard pokud je uživatel přihlášen
    }
    setIsLoading(false);
  }, []);

  const login = async (newToken, userData) => {
    setToken(newToken);
    setUser(userData);
    console.log('Navigating to dashboard after login');
    navigate('/dashboard'); // Přesměrování na dashboard po přihlášení
  };

  const logout = () => {
    // Odstranění tokenu z obou úložišť
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    localStorage.removeItem('user');
    sessionStorage.removeItem('user');
    
    setToken(null);
    setUser(null);
    navigate('/login');
  };

  const checkTokenExpiration = async () => {
    if (!token) return;

    try {
      const response = await fetch('http://localhost:8000/user/verify-token', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        logout();
      }
    } catch (error) {
      console.error('Token verification error:', error);
      logout();
    }
  };

  useEffect(() => {
    // Kontrola platnosti tokenu každých 5 minut
    const interval = setInterval(checkTokenExpiration, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [token]);

  if (isLoading) {
    return <div>Loading...</div>; // nebo váš loading komponent
  }

  return (
    <AuthContext.Provider value={{ user, token, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth musí být použit uvnitř AuthProvider');
  }
  return context;
}; 