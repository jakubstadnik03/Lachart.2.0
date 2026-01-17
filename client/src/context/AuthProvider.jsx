"use client";
import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import api, { clearApiCache } from '../services/api';
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
    // Základní auth údaje
    localStorage.removeItem("token");
    localStorage.removeItem("authToken");
    localStorage.removeItem("user");

    // Vyčistit per‑user cache a filtry, aby se data nepřenášela mezi účty
    try {
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key) continue;
        if (
          key === 'trainingStats_selectedSport' ||
          key.startsWith('dashboard_selectedSport_') ||
          key.startsWith('calendarData_') ||
          key.startsWith('calendarData_timestamp_') ||
          key === 'lastRoute' ||
          key.startsWith('weeklyTrainingLoad_') ||
          key === 'weeklyTrainingLoadTimeRange' ||
          key === 'weeklyTrainingLoadSportFilter' ||
          key.startsWith('formFitness_series_') ||
          key.startsWith('formFitness_today_') ||
          key === 'formFitnessTimeRange' ||
          key === 'formFitnessSportFilter' ||
          key === 'formFitnessDeltaMode' ||
          key.startsWith('athleteTrainings_') ||
          key.startsWith('lactateTrainings_') ||
          key.startsWith('monthlyAnalysis_') ||
          key.startsWith('powerRadar_') ||
          key.startsWith('trainingComparison_') ||
          key === 'weeklyCalendar_activities' ||
          key === 'weeklyCalendar_cacheTime' ||
          key === 'profileModalLastShown' ||
          key === 'lactateCurve_lastTest' ||
          key.startsWith('global_selectedAthleteId') ||
          key.startsWith('testing_recommendations_open_')
        ) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((k) => localStorage.removeItem(k));

      // Session‑only věci (welcome modal, auto‑sync throttling apod.)
      try {
        sessionStorage.clear();
      } catch {
        // ignore
      }
    } catch (e) {
      console.warn('Error clearing app caches on logout:', e);
    }

    // Vyčistit axios defaults a cache
    delete api.defaults.headers.common["Authorization"];
    
    // Vyčistit API cache
    clearApiCache();
    
    setToken(null);
    setUser(null);
    setIsAuthenticated(false);
  }, []);

  useEffect(() => {
    const checkAuth = async () => {
      // Check both token keys for compatibility
      const storedToken = localStorage.getItem("token") || localStorage.getItem("authToken");
      const storedUser = localStorage.getItem("user");
      
      if (storedToken) {
        try {
          // Nastavení autorizační hlavičky pro API
          api.defaults.headers.common["Authorization"] = `Bearer ${storedToken}`;
          
          // Ověření tokenu pomocí profilového endpointu (no cache for auth check)
          const response = await api.get('/user/profile', { noCache: true });
          
          // Aktualizace stavu
          setToken(storedToken);
          setUser(response.data);
          setIsAuthenticated(true);
          // Update localStorage with fresh user data (using optimized storage)
          saveUserToStorage(response.data);
          
          // Ensure both token keys are set for compatibility
          if (!localStorage.getItem("token")) {
            localStorage.setItem("token", storedToken);
          }
          if (!localStorage.getItem("authToken")) {
            localStorage.setItem("authToken", storedToken);
          }
          
          // Restore last route if we're on the home page
          if (location.pathname === '/') {
            const lastRoute = localStorage.getItem('lastRoute');
            if (lastRoute && lastRoute !== '/' && lastRoute !== '/login' && lastRoute !== '/signup') {
              navigate(lastRoute, { replace: true });
            }
          }
          // Auth check successfully completed
          setLoading(false);
        } catch (error) {
          // Only remove token if it's a 401 (Unauthorized) - not for network errors or other issues
          if (error.response?.status === 401) {
            console.error("Token verification failed (401 Unauthorized):", error);
            removeToken();
            setLoading(false);
          } else {
            // For other errors (network, timeout, etc.), keep the token but log the error
            console.warn("Token verification failed (non-401 error), keeping token:", error);
            // Still set loading to false so the app can continue
            setLoading(false);
          }
        }
      } else if (storedUser) {
        // Pokud máme uloženého uživatele, ale ne token, odstraníme uživatele
        localStorage.removeItem("user");
        setLoading(false);
      } else {
        setLoading(false);
      }
    };

    checkAuth();
  }, [removeToken, navigate, location.pathname]);

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
      // Před každým novým přihlášením vždy kompletně smažeme předchozí stav,
      // aby se nikdy „nelepil“ starý účet (jiný email / jiný uživatel).
      removeToken();
      
      // Krátké zpoždění, aby se stihlo vyčistit localStorage a cache
      await new Promise(resolve => setTimeout(resolve, 50));

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
      // Fire-and-forget – nečekáme na pomalý server, UX zůstane rychlé
      api.post('/user/logout').catch((error) => {
        console.error('Logout error (ignored for UX):', error);
      });
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      removeToken();
      // Při odhlášení přesměrujeme na login stránku a uděláme full reload,
      // aby se vyčistil veškerý in‑memory stav (proti „prolínání“ dat mezi účty).
      navigate('/login', { replace: true });
      // Malé zpoždění, aby react-router stihl přepsat URL.
      setTimeout(() => {
        window.location.reload();
      }, 0);
    }
  }, [navigate, removeToken]);

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