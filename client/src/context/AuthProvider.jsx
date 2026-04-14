"use client";
import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import api, { clearApiCache } from '../services/api';
import WelcomeModal from '../components/WelcomeModal';
import { saveUserToStorage } from '../utils/userStorage';
import {
  PREMIUM_PREVIEW_NO_ACCESS_KEY,
  readPremiumPreviewNoAccess,
  writePremiumPreviewNoAccess,
  userWithPremiumPreviewApplied,
} from '../utils/premiumPreview';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showWelcome, setShowWelcome] = useState(false);
  /** UI-only: pretend the account has no premium (localStorage, this browser only). */
  const [premiumPreviewNoAccess, setPremiumPreviewNoAccessState] = useState(readPremiumPreviewNoAccess);
  const navigate = useNavigate();
  const location = useLocation();

  const setPremiumPreviewNoAccess = useCallback((enabled) => {
    writePremiumPreviewNoAccess(Boolean(enabled));
    setPremiumPreviewNoAccessState(Boolean(enabled));
  }, []);

  useEffect(() => {
    // Only re-render auth context for the specific premium-preview key (not every localStorage change)
    let debounceTimer;
    const onStorage = (e) => {
      if (e.key !== PREMIUM_PREVIEW_NO_ACCESS_KEY && e.key !== null) return;
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => setPremiumPreviewNoAccessState(readPremiumPreviewNoAccess()), 80);
    };
    window.addEventListener('storage', onStorage);
    return () => { window.removeEventListener('storage', onStorage); clearTimeout(debounceTimer); };
  }, []);

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
          key.startsWith('testing_recommendations_open_') ||
          key === 'lachart:lastTestId' ||
          key.startsWith('lachart:lastTestId:') ||
          key.startsWith('strava_modal_dismissed_')
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
    writePremiumPreviewNoAccess(false);
    setPremiumPreviewNoAccessState(false);
  }, []);

  // Run only once on mount – avoid re-running on pathname change so we never overwrite
  // the user set by login() with a stale or wrong profile (e.g. previous user after re-login).
  useEffect(() => {
    const checkAuth = async () => {
      const storedToken = localStorage.getItem("token") || localStorage.getItem("authToken");
      const storedUser = localStorage.getItem("user");

      // Set a timeout to ensure we don't wait forever (10 seconds max)
      const timeoutId = setTimeout(() => {
        console.warn('[AuthProvider] Auth check timeout - using fallback');
        if (storedUser) {
          try {
            const parsedUser = JSON.parse(storedUser);
            setToken(storedToken);
            setUser(parsedUser);
            setIsAuthenticated(true);
          } catch {
            // pokud by JSON selhal, prostě necháme uživatele v „nenačteném“ stavu
          }
        }
        setLoading(false);
      }, 10000); // 10 second timeout

      if (storedToken) {
        const tokenAtStart = storedToken;
        try {
          api.defaults.headers.common["Authorization"] = `Bearer ${storedToken}`;
          // Capacitor on slow 3G can need up to 12s; web uses 8s
          const isNative = typeof window !== 'undefined' && !!(window.Capacitor?.isNativePlatform?.());
          const response = await api.get('/user/profile', {
            noCache: true,
            timeout: isNative ? 12000 : 8000,
          });

          clearTimeout(timeoutId);

          // Ignore response if token changed in the meantime (e.g. user logged out and another logged in).
          const currentToken = localStorage.getItem("token") || localStorage.getItem("authToken");
          if (currentToken !== tokenAtStart) {
            setLoading(false);
            return;
          }

          setToken(storedToken);
          setUser(response.data);
          setIsAuthenticated(true);
          saveUserToStorage(response.data);

          if (!localStorage.getItem("token")) {
            localStorage.setItem("token", storedToken);
          }
          if (!localStorage.getItem("authToken")) {
            localStorage.setItem("authToken", storedToken);
          }

          if (location.pathname === '/') {
            const lastRoute = localStorage.getItem('lastRoute');
            if (lastRoute && lastRoute !== '/' && lastRoute !== '/login' && lastRoute !== '/signup') {
              navigate(lastRoute, { replace: true });
            }
          }
          setLoading(false);
        } catch (error) {
          clearTimeout(timeoutId);
          
          if (error.response?.status === 401) {
            console.error("Token verification failed (401 Unauthorized):", error);
            removeToken();
            setLoading(false);
          } else if (error.message === 'Request timeout' || error.code === 'ECONNABORTED') {
            // Timeout error - use fallback
            console.warn("Token verification timeout, falling back to stored user if available:", error);
            if (storedUser) {
              try {
                const parsedUser = JSON.parse(storedUser);
                setToken(storedToken);
                setUser(parsedUser);
                setIsAuthenticated(true);
              } catch {
                // pokud by JSON selhal, prostě necháme uživatele v „nenačteném“ stavu
              }
            }
            setLoading(false);
          } else {
            // Network / 5xx / CORS errors – nechceme uživatele odhlašovat, jen fallback na uložená data
            console.warn("Token verification failed (non-401 error), keeping token and falling back to stored user if available:", error);
            if (storedUser) {
              try {
                const parsedUser = JSON.parse(storedUser);
                setToken(storedToken);
                setUser(parsedUser);
                setIsAuthenticated(true);
              } catch {
                // pokud by JSON selhal, prostě necháme uživatele v „nenačteném“ stavu
              }
            }
            setLoading(false);
          }
        }
      } else if (storedUser) {
        clearTimeout(timeoutId);
        localStorage.removeItem("user");
        setLoading(false);
      } else {
        clearTimeout(timeoutId);
        setLoading(false);
      }
    };

    checkAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run only on mount; location.pathname omitted so we don't re-run on route change and overwrite user with stale profile
  }, [removeToken, navigate]);

  // Při 401 (neplatný/odhlášený token) sjednotit stav a přesměrovat na login
  useEffect(() => {
    const handleUnauthorized = () => {
      removeToken();
      navigate('/login', { replace: true });
    };
    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', handleUnauthorized);
  }, [removeToken, navigate]);

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

      const applyLogin = (loginToken, loginUser) => {
        setToken(loginToken);
        setUser(loginUser);
        saveToken(loginToken);
        saveUserToStorage(loginUser);
        setIsAuthenticated(true);
        clearApiCache();
        if (!sessionStorage.getItem('welcomed')) {
          setTimeout(() => {
            setShowWelcome(true);
            sessionStorage.setItem('welcomed', '1');
          }, 10000);
        }
        // Navigate to dashboard (or last route) without full reload — preserves in-memory cache
        const lastRoute = localStorage.getItem('lastRoute');
        const target = lastRoute && lastRoute !== '/' && lastRoute !== '/login' && lastRoute !== '/signup'
          ? lastRoute
          : '/dashboard';
        navigate(target, { replace: true });
      };

      if (token && user) {
        applyLogin(token, user);
        return Promise.resolve({ success: true });
      } else {
        const response = await api.post("/user/login", { email, password });
        const { token: loginToken, user: loginUser } = response.data;
        applyLogin(loginToken, loginUser);
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
  }, [removeToken, saveToken, navigate]);

  const userForUi = useMemo(
    () => userWithPremiumPreviewApplied(user, premiumPreviewNoAccess),
    [user, premiumPreviewNoAccess]
  );

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
      // Navigate to login — no reload needed; removeToken() clears all localStorage cache
      // and React state (setUser(null), setToken(null)) resets the in-memory state cleanly.
      navigate('/login', { replace: true });
    }
  }, [navigate, removeToken]);

  const value = {
    user: userForUi,
    token,
    isAuthenticated,
    loading,
    login,
    logout,
    premiumPreviewNoAccess,
    setPremiumPreviewNoAccess,
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