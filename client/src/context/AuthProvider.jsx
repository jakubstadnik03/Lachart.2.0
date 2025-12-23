"use client";
import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import api from '../services/api';
import WelcomeModal from '../components/WelcomeModal';
import { saveUserToStorage } from '../utils/userStorage';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showWelcome, setShowWelcome] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const removeToken = useCallback(() => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    delete api.defaults.headers.common["Authorization"];
    setToken(null);
    setUser(null);
    setIsAuthenticated(false);
  }, []);

  useEffect(() => {
    const checkAuth = async () => {
      const storedToken = localStorage.getItem("token");
      const storedUser = localStorage.getItem("user");
      
      if (storedToken) {
        try {
          // Nastavení autorizační hlavičky pro API
          api.defaults.headers.common["Authorization"] = `Bearer ${storedToken}`;
          
          // Ověření tokenu pomocí profilového endpointu
          const response = await api.get('/user/profile');
          
          // Aktualizace stavu
          setToken(storedToken);
          setUser(response.data);
          setIsAuthenticated(true);
          // Update localStorage with fresh user data (using optimized storage)
          saveUserToStorage(response.data);
        } catch (error) {
          console.error("Token verification failed:", error);
          removeToken();
        }
      } else if (storedUser) {
        // Pokud máme uloženého uživatele, ale ne token, odstraníme uživatele
        localStorage.removeItem("user");
      }
      
      setLoading(false);
    };

    checkAuth();
  }, [removeToken]);

  // Listen for user updates (e.g., from SettingsPage after auto-sync change)
  useEffect(() => {
    const handleUserUpdate = (event) => {
      const updatedUser = event.detail;
      if (updatedUser) {
        setUser(updatedUser);
        saveUserToStorage(updatedUser);
      }
    };

    window.addEventListener('userUpdated', handleUserUpdate);
    return () => window.removeEventListener('userUpdated', handleUserUpdate);
  }, []);

  const saveToken = useCallback((token) => {
    localStorage.setItem("token", token);
    api.defaults.headers.common["Authorization"] = `Bearer ${token}`;
    setToken(token);
    setIsAuthenticated(true);
  }, []);

  const login = useCallback(async (email, password, token, user) => {
    try {
      if (token && user) {
        setToken(token);
        setUser(user);
        saveToken(token);
        saveUserToStorage(user);
        setIsAuthenticated(true);
        if (!sessionStorage.getItem('welcomed')) {
          setTimeout(() => {
            setShowWelcome(true);
            sessionStorage.setItem('welcomed', '1');
          }, 10000); // show after 10 seconds
        }
        return Promise.resolve({ success: true });
      } else {
        const response = await api.post("/user/login", { email, password });
        const { token: loginToken, user: loginUser } = response.data;
        
        setToken(loginToken);
        setUser(loginUser);
        saveToken(loginToken);
        saveUserToStorage(loginUser);
        setIsAuthenticated(true);
        if (!sessionStorage.getItem('welcomed')) {
          setTimeout(() => {
            setShowWelcome(true);
            sessionStorage.setItem('welcomed', '1');
          }, 10000); // show after 10 seconds
        }
        return Promise.resolve({ success: true });
      }
    } catch (error) {
      console.error("Login error:", error);
      removeToken();
      return Promise.reject({ 
        success: false, 
        error: error.response?.data?.message || "Login failed" 
      });
    }
  }, [removeToken, saveToken]);

  const logout = useCallback(async () => {
    try {
      await api.post('/user/logout');
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      removeToken();
      // Při odhlášení přesměrujeme na login stránku s informací o původní URL
      navigate('/login', { 
        replace: true,
        state: { from: location.pathname }
      });
    }
  }, [navigate, removeToken, location]);

  const value = {
    user,
    token,
    isAuthenticated,
    loading,
    login,
    logout,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
      <WelcomeModal open={showWelcome} onClose={() => setShowWelcome(false)} />
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