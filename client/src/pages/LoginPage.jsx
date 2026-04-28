// src/pages/LoginPage.js
import React, { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthProvider';
import { motion } from 'framer-motion';
import { useNotification } from '../context/NotificationContext';
import { GoogleLogin } from '@react-oauth/google';
import api from '../services/api';
import { API_ENDPOINTS } from '../config/api.config';
import { trackEvent, trackConversionFunnel } from '../utils/analytics';
import { logUserLogin } from '../utils/eventLogger';
import BasicProfileModal from '../components/Profile/BasicProfileModal';
import UnitsPreferencesModal from '../components/Profile/UnitsPreferencesModal';
import TrainingZonesModal from '../components/Profile/TrainingZonesModal';
import StravaConnectModal from '../components/Onboarding/StravaConnectModal';
import AuthSideCarousel from '../components/Auth/AuthSideCarousel';
import { isCapacitorNative } from '../utils/isNativeApp';
import { signInWithGoogleNative } from '../utils/nativeGoogleAuth';

/** Shown after Google sign-in errors so users can recover without Google (same email in LaChart). */
function withGoogleLoginPasswordHint(message) {
  if (message == null || typeof message !== 'string') return message;
  if (/forgot\s+password|obnovit\s+heslo|reset.*password|email\+heslo/i.test(message)) return message;
  const hint =
    ' If you already have a LaChart account on this email, use “Forgot password?” above to set or reset your password and sign in with email.';
  const trimmed = message.trim();
  if (!trimmed) return hint.trim();
  return /[.!?…]$/.test(trimmed) ? `${trimmed}${hint}` : `${trimmed}.${hint}`;
}

const LoginPage = () => {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    rememberMe: false
  });
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showBasicProfileModal, setShowBasicProfileModal] = useState(false);
  const [showUnitsPreferencesModal, setShowUnitsPreferencesModal] = useState(false);
  const [showTrainingZonesModal, setShowTrainingZonesModal] = useState(false);
  const [showStravaModal, setShowStravaModal] = useState(false);
  const [loggedInUser, setLoggedInUser] = useState(null);
  const [googleAuthError, setGoogleAuthError] = useState(null);
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { addNotification } = useNotification();

  // Získáme původní cíl navigace, pokud existuje
  const from = location.state?.from?.pathname || "/dashboard";

  // Check for invitation token in URL
  // Lock body scroll on native so WKWebView doesn't rubber-band
  useEffect(() => {
    if (!isCapacitorNative()) return;
    const html = document.documentElement;
    const body = document.body;
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = body.style.overflow;
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    return () => {
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
    };
  }, []);

  useEffect(() => {
    // Nejprve zkusit získat token z query stringu
    const urlParams = new URLSearchParams(window.location.search);
    let invitationToken = urlParams.get('token');
    // Pokud není v query stringu, zkusit získat z pathname
    if (!invitationToken) {
      const match = window.location.pathname.match(/accept-coach-invitation\/([a-zA-Z0-9]+)/);
      if (match && match[1]) {
        invitationToken = match[1];
      }
    }
    if (invitationToken) {
      console.log("Found invitation token in URL or path:", invitationToken);
      localStorage.setItem('pendingInvitationToken', invitationToken);
    }
  }, []);

  useEffect(() => {
    // Don't navigate if modals are showing (profile incomplete)
    if (isAuthenticated && !showBasicProfileModal && !showUnitsPreferencesModal && !showTrainingZonesModal && !showStravaModal) {
      const pendingInvitationToken = localStorage.getItem('pendingInvitationToken');
      console.log("Checking for pending invitation token:", pendingInvitationToken);
      
      if (pendingInvitationToken) {
        console.log("Found pending invitation token, redirecting to:", `/accept-coach-invitation/${pendingInvitationToken}`);
        localStorage.removeItem('pendingInvitationToken');
        navigate(`/accept-coach-invitation/${pendingInvitationToken}`, { replace: true });
      } else {
        navigate(from, { replace: true });
      }
    }
  }, [isAuthenticated, navigate, from, showBasicProfileModal, showUnitsPreferencesModal, showTrainingZonesModal, showStravaModal]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isLoading) return; // Prevent multiple submissions

    setIsLoading(true);
    setGoogleAuthError(null);
    addNotification("Attempting to log in...", "info");

    try {
      console.log("Sending login request to:", API_ENDPOINTS.AUTH + "/login");
      console.log("Login data:", { email: formData.email, password: "***" });

      // Render (and similar) cold start + DB connect can exceed default 60s — allow longer wait for login only
      const result = await api.post(
        API_ENDPOINTS.AUTH + "/login",
        { email: formData.email, password: formData.password },
        { timeout: 120000 }
      );
      
      if (result.data.token) {
        console.log("Login successful, token received");
        console.log("User data:", result.data.user);
        
        // Uložení tokenu a uživatelských dat do localStorage
        localStorage.setItem("token", result.data.token);
        const { saveUserToStorage: saveUserToStorage2 } = await import('../utils/userStorage');
        saveUserToStorage2(result.data.user);
        
        // Nastavení autorizační hlavičky pro API
        api.defaults.headers.common["Authorization"] = `Bearer ${result.data.token}`;
        
        try {
          // First call login to update auth state
          await login(formData.email, formData.password, result.data.token, result.data.user);
          addNotification("Successfully logged in", "success");
          trackEvent('login_success', { method: 'email' });
          trackConversionFunnel('login_complete', { method: 'email' });
          
          // Log login event
          await logUserLogin('email', result.data.user?._id);

          // Check if user profile is incomplete (only for athletes)
          const user = result.data.user;
          if (user.role === 'athlete') {
            const isBasicProfileIncomplete = !user.dateOfBirth || !user.height || !user.weight || !user.sport;
            const hasNoTrainingZones = !user.powerZones?.cycling?.lt1 && !user.powerZones?.running?.lt1 && !user.powerZones?.swimming?.lt1;
            const basicProfileDone = user.onboarding?.basicProfileDone || (user._id && localStorage.getItem(`basicProfileModalDone_${user._id}`) === 'true');
            const unitsDone = user.onboarding?.unitsDone || (user._id && localStorage.getItem(`unitsPreferencesModalDone_${user._id}`) === 'true');
            const trainingZonesDone = user.onboarding?.trainingZonesDone || (user._id && localStorage.getItem(`trainingZonesModalDone_${user._id}`) === 'true');
            const needsBasic = isBasicProfileIncomplete && !basicProfileDone;
            const needsUnits = !unitsDone;
            const needsZones = hasNoTrainingZones && !trainingZonesDone;
            
            if (needsBasic) {
              setLoggedInUser(user);
              setTimeout(() => setShowBasicProfileModal(true), 3000);
            } else if (needsUnits) {
              setLoggedInUser(user);
              setTimeout(() => setShowUnitsPreferencesModal(true), 3000);
            } else if (needsZones) {
              setLoggedInUser(user);
              setTimeout(() => setShowTrainingZonesModal(true), 3000);
            } else if (!user.strava?.athleteId) {
              setLoggedInUser(user);
              setTimeout(() => setShowStravaModal(true), 3000);
            } else {
              // Profile is complete, proceed with normal navigation
              const pendingInvitationToken = localStorage.getItem('pendingInvitationToken');
              console.log("Checking for pending invitation after login:", pendingInvitationToken);
              
              if (pendingInvitationToken) {
                console.log("Found pending invitation token after login, redirecting to:", `/accept-coach-invitation/${pendingInvitationToken}`);
                // Don't remove the token yet, let the AcceptCoachInvitation page handle it
                navigate(`/accept-coach-invitation/${pendingInvitationToken}`, { replace: true });
              } else {
                navigate("/dashboard", { replace: true });
              }
            }
          } else {
            // Profile is complete, proceed with normal navigation
            const pendingInvitationToken = localStorage.getItem('pendingInvitationToken');
            console.log("Checking for pending invitation after login:", pendingInvitationToken);
            
            if (pendingInvitationToken) {
              console.log("Found pending invitation token after login, redirecting to:", `/accept-coach-invitation/${pendingInvitationToken}`);
              // Don't remove the token yet, let the AcceptCoachInvitation page handle it
              navigate(`/accept-coach-invitation/${pendingInvitationToken}`, { replace: true });
            } else {
              navigate("/dashboard", { replace: true });
            }
          }
        } catch (loginError) {
          console.error("Error updating auth state:", loginError);
          addNotification("Error during login process", "error");
        }
      }
    } catch (error) {
      console.error("Login error:", error);
      let errorMessage = "Login failed";

      if (error.code === "ECONNABORTED") {
        errorMessage =
          "Server neodpověděl včas (timeout). Na Renderu často první požadavek po pauze „probouzí“ službu a může trvat i 1–2 minuty — zkus to znovu. " +
          "Ověř v prohlížeči https://lachart.onrender.com/health . Pro vývoj proti lokálnímu API nastav v client/.env REACT_APP_API_URL=http://localhost:PORT.";
      } else if (error.response) {
        console.log("Error response:", error.response);
        if (error.response.status === 429) {
          errorMessage = "Too many login attempts. Please wait a few minutes before trying again.";
        } else {
          errorMessage = error.response.data?.error || error.response.data?.message || "Login failed";
          // Friendly hint for Google-created accounts that don't have a password yet.
          if (error.response.data?.reason === 'no_password_set') {
            errorMessage = "Tenhle účet nemá heslo (byl vytvořen přes Google). Klikni na 'Forgot password' a nastav si heslo přes email, nebo se přihlas přes Google.";
          }
        }
      } else if (error.request || error.code === "ERR_NETWORK") {
        console.log("No response received:", error.request);
        errorMessage =
          "Server unreachable. Check your connection. " +
          "If the app is hosted (e.g. Render), the server may be starting up—try again in a minute. " +
          "For local development, run the backend and set REACT_APP_API_URL=http://localhost:8000 in .env.development.";
      } else {
        console.log("Error setting up request:", error.message);
        errorMessage = "Error setting up login request.";
      }
      
      addNotification(errorMessage, "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSuccess = async (credentialResponse) => {
    if (isLoading) return;
    setIsLoading(true);
    setGoogleAuthError(null);
    addNotification("Attempting to log in with Google...", "info");

    try {
      console.log("Google credential response received");
      const result = await api.post(`${API_ENDPOINTS.AUTH}/google-auth`, {
        credential: credentialResponse.credential,
      });
      
      if (result.data.token) {
        console.log("Google login successful, token received");
        console.log("User data:", result.data.user);
        trackEvent('login_success', { method: 'google' });
        trackConversionFunnel('login_complete', { method: 'google' });
        
        // Log login event
        await logUserLogin('google', result.data.user?._id);
        
        // Uložení tokenu a uživatelských dat do localStorage
        localStorage.setItem("token", result.data.token);
        const { saveUserToStorage: saveUserToStorageGoogle } = await import('../utils/userStorage');
        saveUserToStorageGoogle(result.data.user);
        
        // Nastavení autorizační hlavičky pro API
        api.defaults.headers.common["Authorization"] = `Bearer ${result.data.token}`;
        
        try {
          // First call login to update auth state
          await login(null, null, result.data.token, result.data.user);
          addNotification("Successfully logged in with Google", "success");

          // Check if user profile is incomplete (only for athletes)
          const user = result.data.user;
          if (user.role === 'athlete') {
            const isBasicProfileIncomplete = !user.dateOfBirth || !user.height || !user.weight || !user.sport;
            const hasNoTrainingZones = !user.powerZones?.cycling?.lt1 && !user.powerZones?.running?.lt1 && !user.powerZones?.swimming?.lt1;
            const basicProfileDone = user.onboarding?.basicProfileDone || (user._id && localStorage.getItem(`basicProfileModalDone_${user._id}`) === 'true');
            const unitsDone = user.onboarding?.unitsDone || (user._id && localStorage.getItem(`unitsPreferencesModalDone_${user._id}`) === 'true');
            const trainingZonesDone = user.onboarding?.trainingZonesDone || (user._id && localStorage.getItem(`trainingZonesModalDone_${user._id}`) === 'true');
            const needsBasic = isBasicProfileIncomplete && !basicProfileDone;
            const needsUnits = !unitsDone;
            const needsZones = hasNoTrainingZones && !trainingZonesDone;
            
            if (needsBasic) {
              setLoggedInUser(user);
              setTimeout(() => setShowBasicProfileModal(true), 3000);
            } else if (needsUnits) {
              setLoggedInUser(user);
              setTimeout(() => setShowUnitsPreferencesModal(true), 3000);
            } else if (needsZones) {
              setLoggedInUser(user);
              setTimeout(() => setShowTrainingZonesModal(true), 3000);
            } else if (!user.strava?.athleteId) {
              setLoggedInUser(user);
              setTimeout(() => setShowStravaModal(true), 3000);
            } else {
              // Profile is complete, proceed with normal navigation
              const pendingInvitationToken = localStorage.getItem('pendingInvitationToken');
              console.log("Checking for pending invitation after Google login:", pendingInvitationToken);
              
              if (pendingInvitationToken) {
                console.log("Found pending invitation token after Google login, redirecting to:", `/accept-coach-invitation/${pendingInvitationToken}`);
                // Don't remove the token yet, let the AcceptCoachInvitation page handle it
                navigate(`/accept-coach-invitation/${pendingInvitationToken}`, { replace: true });
              } else {
                navigate("/dashboard", { replace: true });
              }
            }
          } else {
            // Profile is complete, proceed with normal navigation
            const pendingInvitationToken = localStorage.getItem('pendingInvitationToken');
            console.log("Checking for pending invitation after Google login:", pendingInvitationToken);
            
            if (pendingInvitationToken) {
              console.log("Found pending invitation token after Google login, redirecting to:", `/accept-coach-invitation/${pendingInvitationToken}`);
              // Don't remove the token yet, let the AcceptCoachInvitation page handle it
              navigate(`/accept-coach-invitation/${pendingInvitationToken}`, { replace: true });
            } else {
              navigate("/dashboard", { replace: true });
            }
          }
        } catch (loginError) {
          console.error("Error updating auth state:", loginError);
          const msg = withGoogleLoginPasswordHint("Error during login process");
          addNotification(msg, "error");
          setGoogleAuthError(msg);
        }
      } else {
        const msg = withGoogleLoginPasswordHint(
          "Google sign-in did not return a valid session. Please try again."
        );
        addNotification(msg, "error");
        setGoogleAuthError(msg);
      }
    } catch (error) {
      console.error("Google login error:", error);
      let errorMessage = "Google login failed";
      
      if (error.response) {
        console.log("Error response:", error.response);
        errorMessage = error.response.data?.error || error.response.data?.message || "Google login failed";
        if (error.response.status === 503) {
          errorMessage = "Google login je teď na serveru vypnutý / špatně nakonfigurovaný. Zkus to později nebo se přihlas přes email+heslo (případně 'Forgot password').";
        }
      } else if (error.request) {
        console.log("No response received:", error.request);
        errorMessage = "No response from server. Please check your internet connection.";
      } else {
        console.log("Error setting up request:", error.message);
        errorMessage = "Error setting up Google login request.";
      }
      
      const fullMsg = withGoogleLoginPasswordHint(errorMessage);
      addNotification(fullMsg, "error");
      setGoogleAuthError(fullMsg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleError = () => {
    console.error("Google login error occurred");
    const msg = withGoogleLoginPasswordHint(
      "Google sign-in was cancelled or could not start."
    );
    addNotification(msg, "error");
    setGoogleAuthError(msg);
  };

  // Native Google Sign-In (uses iOS native SDK via @codetrix-studio/capacitor-google-auth)
  const handleNativeGoogleSignIn = async () => {
    if (isLoading) return;
    try {
      setIsLoading(true);
      setGoogleAuthError(null);
      addNotification("Signing in with Google…", "info");
      const credentialResponse = await signInWithGoogleNative();
      await handleGoogleSuccess(credentialResponse);
    } catch (err) {
      console.error("Native Google Sign-In error:", err);
      const msg = withGoogleLoginPasswordHint(
        err?.message?.includes("cancel") || err?.message?.includes("Cancel")
          ? "Google sign-in was cancelled."
          : "Google sign-in failed. Please try again."
      );
      addNotification(msg, "error");
      setGoogleAuthError(msg);
      setIsLoading(false);
    }
  };

  // ── Native iOS layout ──────────────────────────────────────────
  if (isCapacitorNative()) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'white', overflow: 'hidden' }}>
        {/* Inner layer: scrollable with rubber-band contained, respects safe areas */}
        <div style={{
          height: '100%',
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          overscrollBehavior: 'contain',
          paddingTop: 'env(safe-area-inset-top)',
          paddingBottom: 'env(safe-area-inset-bottom)',
          display: 'flex',
          flexDirection: 'column',
        }}>
        <div className="flex-1 flex flex-col justify-center px-6" style={{ minHeight: '100%' }}>

          {/* Logo */}
          <div className="mb-8 text-center">
            <div className="mx-auto h-16 w-16 rounded-2xl overflow-hidden shadow-md mb-3">
              <picture>
                <source type="image/webp" srcSet="/images/LaChart-96.webp 96w, /images/LaChart-192.webp 192w" sizes="64px" />
                <img className="h-16 w-16 object-cover" src="/images/LaChart.png" alt="LaChart" />
              </picture>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">LaChart</h1>
            <p className="mt-1 text-sm text-gray-500">Sign in to your account</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-2.5">
            <input
              type="email"
              name="email"
              autoComplete="email"
              required
              disabled={isLoading}
              placeholder="Email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="w-full px-4 py-3.5 bg-gray-100 rounded-2xl text-base text-gray-900 placeholder-gray-400 outline-none focus:bg-gray-200 transition-colors disabled:opacity-50"
            />

            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                name="password"
                autoComplete="current-password"
                required
                disabled={isLoading}
                placeholder="Password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="w-full px-4 py-3.5 bg-gray-100 rounded-2xl text-base text-gray-900 placeholder-gray-400 outline-none focus:bg-gray-200 transition-colors pr-12 disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400"
              >
                {showPassword ? (
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                ) : (
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                )}
              </button>
            </div>

            <div className="flex justify-end pt-1">
              <Link to="/forgot-password" className="text-sm font-medium text-primary">
                Forgot Password?
              </Link>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3.5 rounded-2xl bg-primary text-white text-base font-semibold mt-1 disabled:opacity-50 active:opacity-70 transition-opacity"
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Signing in…
                </span>
              ) : 'Sign In'}
            </button>
          </form>

          {/* Divider */}
          <div className="mt-5 flex items-center gap-3">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-xs text-gray-400 font-medium">nebo</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          {/* Native Google Sign-In */}
          <button
            type="button"
            onClick={handleNativeGoogleSignIn}
            disabled={isLoading}
            className="mt-3 w-full flex items-center justify-center gap-3 py-3 px-4 bg-white border border-gray-300 rounded-2xl shadow-sm active:bg-gray-50 transition-colors disabled:opacity-50"
          >
            {/* Google G logo */}
            <svg width="20" height="20" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            <span className="text-base font-medium text-gray-700">
              {isLoading ? 'Signing in…' : 'Continue with Google'}
            </span>
          </button>

          <p className="mt-5 text-center text-sm text-gray-500">
            Don't have an account?{' '}
            <Link to="/signup" className="font-semibold text-primary">Sign Up</Link>
          </p>

          {/* Privacy & Terms inline */}
          <div className="mt-4 mb-2 flex items-center justify-center gap-3 text-xs text-gray-400">
            <a href="https://lachart.net/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>
            <span>·</span>
            <a href="/terms">Terms of Use</a>
          </div>
        </div>
        </div>{/* end scrollable */}

        {/* Onboarding modals (same as web) */}
        {loggedInUser && (
          <BasicProfileModal
            isOpen={showBasicProfileModal}
            onClose={() => {
              if (loggedInUser._id) {
                localStorage.setItem(`basicProfileModalDone_${loggedInUser._id}`, 'true');
                api.put('/user/edit-profile', { onboarding: { basicProfileDone: true } })
                  .then((res) => res.data && (setLoggedInUser(res.data), window.dispatchEvent(new CustomEvent('userUpdated', { detail: res.data }))))
                  .catch(() => {});
              }
              setShowBasicProfileModal(false);
              const zonesDone = loggedInUser.onboarding?.trainingZonesDone || (loggedInUser._id && localStorage.getItem(`trainingZonesModalDone_${loggedInUser._id}`) === 'true');
              const hasNoZones = !zonesDone && !loggedInUser.powerZones?.cycling?.lt1 && !loggedInUser.powerZones?.running?.lt1 && !loggedInUser.powerZones?.swimming?.lt1;
              if (hasNoZones) setShowTrainingZonesModal(true);
              else if (!loggedInUser.strava?.athleteId) setShowStravaModal(true);
            }}
            onSubmit={async (fd) => {
              try {
                const response = await api.put('/user/edit-profile', { ...fd, onboarding: { basicProfileDone: true } });
                if (response.data) {
                  if (response.data._id) localStorage.setItem(`basicProfileModalDone_${response.data._id}`, 'true');
                  setLoggedInUser(response.data);
                  window.dispatchEvent(new CustomEvent('userUpdated', { detail: response.data }));
                  setShowBasicProfileModal(false);
                  const unitsAlreadyDone = response.data.onboarding?.unitsDone || localStorage.getItem(`unitsPreferencesModalDone_${response.data._id}`) === 'true';
                  if (unitsAlreadyDone) {
                    const zonesDone = response.data.onboarding?.trainingZonesDone || localStorage.getItem(`trainingZonesModalDone_${response.data._id}`) === 'true';
                    const hasNoZones = !zonesDone && !response.data.powerZones?.cycling?.lt1 && !response.data.powerZones?.running?.lt1 && !response.data.powerZones?.swimming?.lt1;
                    if (hasNoZones) setShowTrainingZonesModal(true);
                    else if (!response.data.strava?.athleteId) setShowStravaModal(true);
                  } else {
                    setShowUnitsPreferencesModal(true);
                  }
                  addNotification('Profile updated successfully', 'success');
                }
              } catch (e) { addNotification('Error updating profile', 'error'); }
            }}
            userData={loggedInUser}
          />
        )}
        {loggedInUser && (
          <UnitsPreferencesModal
            isOpen={showUnitsPreferencesModal}
            onClose={() => {
              if (loggedInUser._id) {
                localStorage.setItem(`unitsPreferencesModalDone_${loggedInUser._id}`, 'true');
                api.put('/user/edit-profile', { onboarding: { unitsDone: true } }).catch(() => {});
              }
              setShowUnitsPreferencesModal(false);
              const zonesDone = loggedInUser.onboarding?.trainingZonesDone || (loggedInUser._id && localStorage.getItem(`trainingZonesModalDone_${loggedInUser._id}`) === 'true');
              const hasNoZones = !zonesDone && !loggedInUser.powerZones?.cycling?.lt1 && !loggedInUser.powerZones?.running?.lt1 && !loggedInUser.powerZones?.swimming?.lt1;
              if (hasNoZones) setShowTrainingZonesModal(true);
              else if (!loggedInUser.strava?.athleteId) setShowStravaModal(true);
            }}
            onSubmit={async (fd) => {
              try {
                const response = await api.put('/user/edit-profile', { ...fd, onboarding: { unitsDone: true } });
                if (response.data) {
                  localStorage.setItem(`unitsPreferencesModalDone_${response.data._id}`, 'true');
                  setLoggedInUser(response.data);
                  window.dispatchEvent(new CustomEvent('userUpdated', { detail: response.data }));
                  setShowUnitsPreferencesModal(false);
                  const hasNoZones = !response.data.powerZones?.cycling?.lt1 && !response.data.powerZones?.running?.lt1 && !response.data.powerZones?.swimming?.lt1;
                  if (hasNoZones) setShowTrainingZonesModal(true);
                  else if (!response.data.strava?.athleteId) setShowStravaModal(true);
                  addNotification('Units saved', 'success');
                }
              } catch (e) { addNotification('Error updating units', 'error'); }
            }}
            userData={loggedInUser}
          />
        )}
        {loggedInUser && (
          <TrainingZonesModal
            isOpen={showTrainingZonesModal}
            onClose={() => {
              if (loggedInUser._id) {
                localStorage.setItem(`trainingZonesModalDone_${loggedInUser._id}`, 'true');
                api.put('/user/edit-profile', { onboarding: { trainingZonesDone: true } }).catch(() => {});
              }
              setShowTrainingZonesModal(false);
              if (!loggedInUser.strava?.athleteId) setShowStravaModal(true);
            }}
            onSubmit={async (fd) => {
              try {
                const response = await api.put('/user/edit-profile', { ...fd, onboarding: { trainingZonesDone: true } });
                if (response.data) {
                  setLoggedInUser(response.data);
                  window.dispatchEvent(new CustomEvent('userUpdated', { detail: response.data }));
                  setShowTrainingZonesModal(false);
                  if (!response.data.strava?.athleteId) setShowStravaModal(true);
                  addNotification('Training zones updated successfully', 'success');
                }
              } catch (e) { addNotification('Error updating training zones', 'error'); }
            }}
            userData={loggedInUser}
          />
        )}
        <StravaConnectModal
          isOpen={showStravaModal}
          onClose={() => {
            setShowStravaModal(false);
            const pendingToken = localStorage.getItem('pendingInvitationToken');
            if (pendingToken) navigate(`/accept-coach-invitation/${pendingToken}`, { replace: true });
            else navigate('/dashboard', { replace: true });
          }}
          onSkip={() => {
            setShowStravaModal(false);
            const pendingToken = localStorage.getItem('pendingInvitationToken');
            if (pendingToken) navigate(`/accept-coach-invitation/${pendingToken}`, { replace: true });
            else navigate('/dashboard', { replace: true });
          }}
        />
      </div>
    );
  }

  // ── Web layout ──────────────────────────────────────────────────
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="min-h-screen flex flex-col bg-gradient-to-br from-[#EEF2FF] via-[#E9ECFF] to-[#D6DCFF] pt-safe-top"
    >
      <div className="flex flex-1 min-h-0" style={{ minHeight: '100vh' }}>
        {/* Left side - Background with Image and SEO Content */}
        <motion.div 
          initial={{ x: -100, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="hidden lg:flex lg:w-1/2 overflow-hidden relative"
        >
          <div className="w-full h-full p-8 flex items-center justify-center">
            <div className="w-full max-w-2xl">
              <AuthSideCarousel />
            </div>
          </div>
      </motion.div>

      {/* Right side - Form */}
      <motion.div 
        initial={{ x: 100, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.2 }}
        className="w-full lg:w-1/2 flex items-center justify-center px-6 sm:px-8 overflow-hidden"
      >
        <motion.div 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="max-w-md w-full space-y-8 overflow-hidden"
        >
          <motion.div
            initial={{ scale: 0.9 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.5, delay: 0.6 }}
          >
            <div className="mx-auto flex items-center gap-2 justify-center">
              <div className="h-11 w-11 rounded-2xl bg-white/70 border border-white shadow-sm flex items-center justify-center">
                <picture>
                  <source
                    type="image/webp"
                    srcSet="/images/LaChart-96.webp 96w, /images/LaChart-192.webp 192w, /images/LaChart-320.webp 320w"
                    sizes="28px"
                  />
                  <img className="h-7 w-7" src="/images/LaChart.png" alt="LaChart" />
                </picture>
              </div>
              <h1 className="text-2xl font-bold text-primary-dark tracking-tight">LaChart</h1>
            </div>

            <h2 className="mt-6 text-center text-3xl font-bold text-gray-900">
              Sign In to your Account
            </h2>
            <p className="mt-2 text-center text-sm text-gray-600">
              Welcome back! please enter your detail
            </p>
          </motion.div>

          <motion.form 
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.8 }}
            className="mt-8 space-y-6" 
            onSubmit={handleSubmit}
          >
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.5, delay: 1 }}
              className="space-y-4"
            >
              <motion.div
                whileHover={{ scale: 1.02 }}
                transition={{ duration: 0.2 }}
              >
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  disabled={isLoading}
                  className="appearance-none rounded-xl relative block w-full px-4 py-3 border border-gray-200 placeholder-gray-400 text-gray-900 bg-white/80 backdrop-blur-md focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/50 disabled:bg-gray-100 disabled:cursor-not-allowed shadow-sm"
                  placeholder="Email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </motion.div>
              <motion.div 
                className="relative"
                whileHover={{ scale: 1.02 }}
                transition={{ duration: 0.2 }}
              >
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  disabled={isLoading}
                  className="appearance-none rounded-xl relative block w-full px-4 py-3 border border-gray-200 placeholder-gray-400 text-gray-900 bg-white/80 backdrop-blur-md focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/50 disabled:bg-gray-100 disabled:cursor-not-allowed shadow-sm"
                  placeholder="Password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                />
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  type="button"
                  disabled={isLoading}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center disabled:opacity-50"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  ) : (
                    <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  )}
                </motion.button>
              </motion.div>
            </motion.div>

            <motion.div 
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.5, delay: 1.2 }}
              className="flex items-center justify-between"
            >
              <div className="flex items-center">
                <input
                  id="remember-me"
                  name="remember-me"
                  type="checkbox"
                  disabled={isLoading}
                  className="h-4 w-4 text-blue-600 focus:ring-primary border-gray-300 rounded disabled:opacity-50"
                  checked={formData.rememberMe}
                  onChange={(e) => setFormData({ ...formData, rememberMe: e.target.checked })}
                />
                <label htmlFor="remember-me" className="ml-2 block text-sm text-gray-900">
                  Remember me
                </label>
              </div>
              <div className="text-sm">
                <Link 
                  to="/forgot-password" 
                  className="font-medium text-primary hover:text-primary-dark"
                >
                  Forgot Password?
                </Link>
              </div>
            </motion.div>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              type="submit"
              disabled={isLoading}
              className="w-full flex justify-center py-3 px-4 border border-transparent rounded-xl shadow-lg text-sm font-semibold text-white bg-primary-dark hover:bg-primary focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary/50 disabled:opacity-50 disabled:cursor-not-allowed relative"
            >
              {isLoading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Signing in...
                </>
              ) : (
                'Sign In'
              )}
            </motion.button>

            {!isCapacitorNative() && (
            <motion.div 
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.5, delay: 1.4 }}
              className="mt-6"
            >
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-300"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-white text-gray-500">Or sign in with</span>
                </div>
              </div>

              <div className="mt-6 flex flex-col items-center">
                <GoogleLogin
                  onSuccess={handleGoogleSuccess}
                  onError={handleGoogleError}
                  useOneTap={false}
                  auto_select={false}
                  theme="filled_white"
                  size="large"
                  text="signin_with"
                  shape="rectangular"
                  logo_alignment="left"
                  width="300"
                  cancel_on_tap_outside={true}
                  prompt_parent_id="google-login-button"
                  nonce={crypto.randomUUID()}
                  ux_mode="popup"
                  context="signin"
                  disabled={isLoading}
                />
                {googleAuthError && (
                  <p className="mt-3 max-w-sm text-center text-sm text-gray-600">
                    <span className="text-gray-700 font-medium">Can’t use Google?</span>{' '}
                    <Link
                      to="/forgot-password"
                      className="text-primary font-semibold hover:text-primary-dark underline"
                    >
                      Reset or set your password by email
                    </Link>
                    {' — '}then sign in with email above.
                  </p>
                )}
              </div>
            </motion.div>
            )}
          </motion.form>

          <motion.p 
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.5, delay: 1.6 }}
            className="text-center text-sm text-gray-600"
          >
            Don't have an account?{' '}
            <motion.span
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <Link 
                to="/signup" 
                className="font-medium text-primary hover:text-primary-dark"
                onClick={() => {
                  console.log('Navigating to Sign Up page...');
                  console.log('Current path:', window.location.pathname);
                  console.log('Target path: /signup');
                }}
              >
              Sign Up
            </Link>
            </motion.span>
          </motion.p>

          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.5, delay: 1.8 }}
            className="mt-4 text-center"
          >
            <Link 
              to="/lactate-curve-calculator" 
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              Continue without login (Demo Mode)
            </Link>
          </motion.div>
        </motion.div>
      </motion.div>
      </div>

      {/* Basic Profile Modal - first step */}
      {loggedInUser && (
        <BasicProfileModal
          isOpen={showBasicProfileModal}
          onClose={() => {
            if (loggedInUser._id) {
              localStorage.setItem(`basicProfileModalDone_${loggedInUser._id}`, 'true');
              api.put('/user/edit-profile', { onboarding: { basicProfileDone: true } })
                .then((res) => res.data && (setLoggedInUser(res.data), window.dispatchEvent(new CustomEvent('userUpdated', { detail: res.data }))))
                .catch(() => {});
            }
            setShowBasicProfileModal(false);
            const zonesDone = loggedInUser.onboarding?.trainingZonesDone || (loggedInUser._id && localStorage.getItem(`trainingZonesModalDone_${loggedInUser._id}`) === 'true');
            const hasNoZones = !zonesDone && !loggedInUser.powerZones?.cycling?.lt1 && !loggedInUser.powerZones?.running?.lt1 && !loggedInUser.powerZones?.swimming?.lt1;
            if (hasNoZones) {
              setShowTrainingZonesModal(true);
            } else if (!loggedInUser.strava?.athleteId) {
              setShowStravaModal(true);
            }
          }}
          onSubmit={async (formData) => {
            try {
              const response = await api.put('/user/edit-profile', { ...formData, onboarding: { basicProfileDone: true } });
              if (response.data) {
                if (response.data._id) localStorage.setItem(`basicProfileModalDone_${response.data._id}`, 'true');
                setLoggedInUser(response.data);
                window.dispatchEvent(new CustomEvent('userUpdated', { detail: response.data }));
                setShowBasicProfileModal(false);
                const unitsAlreadyDone = response.data.onboarding?.unitsDone || localStorage.getItem(`unitsPreferencesModalDone_${response.data._id}`) === 'true';
                if (unitsAlreadyDone) {
                  const zonesDone = response.data.onboarding?.trainingZonesDone || localStorage.getItem(`trainingZonesModalDone_${response.data._id}`) === 'true';
                  const hasNoZones = !zonesDone && !response.data.powerZones?.cycling?.lt1 && !response.data.powerZones?.running?.lt1 && !response.data.powerZones?.swimming?.lt1;
                  if (hasNoZones) setShowTrainingZonesModal(true);
                  else if (!response.data.strava?.athleteId) setShowStravaModal(true);
                } else {
                  setShowUnitsPreferencesModal(true);
                }
                addNotification('Profile updated successfully', 'success');
              }
            } catch (error) {
              console.error('Error updating profile:', error);
              addNotification('Error updating profile', 'error');
            }
          }}
          userData={loggedInUser}
        />
      )}

      {/* Units Preferences Modal - after basic profile (only once per user) */}
      {loggedInUser && (
        <UnitsPreferencesModal
          isOpen={showUnitsPreferencesModal}
          onClose={() => {
            if (loggedInUser._id) {
              localStorage.setItem(`unitsPreferencesModalDone_${loggedInUser._id}`, 'true');
              api.put('/user/edit-profile', { onboarding: { unitsDone: true } })
                .then((res) => res.data && (setLoggedInUser(res.data), window.dispatchEvent(new CustomEvent('userUpdated', { detail: res.data }))))
                .catch(() => {});
            }
            setShowUnitsPreferencesModal(false);
            const zonesDone = loggedInUser.onboarding?.trainingZonesDone || (loggedInUser._id && localStorage.getItem(`trainingZonesModalDone_${loggedInUser._id}`) === 'true');
            const hasNoZones = !zonesDone && !loggedInUser.powerZones?.cycling?.lt1 && !loggedInUser.powerZones?.running?.lt1 && !loggedInUser.powerZones?.swimming?.lt1;
            if (hasNoZones) {
              setShowTrainingZonesModal(true);
            } else if (!loggedInUser.strava?.athleteId) {
              setShowStravaModal(true);
            }
          }}
          onSubmit={async (formData) => {
            try {
              const response = await api.put('/user/edit-profile', { ...formData, onboarding: { unitsDone: true } });
              if (response.data) {
                localStorage.setItem(`unitsPreferencesModalDone_${response.data._id}`, 'true');
                setLoggedInUser(response.data);
                window.dispatchEvent(new CustomEvent('userUpdated', { detail: response.data }));
                setShowUnitsPreferencesModal(false);
                const hasNoZones = !response.data.powerZones?.cycling?.lt1 && !response.data.powerZones?.running?.lt1 && !response.data.powerZones?.swimming?.lt1;
                if (hasNoZones) {
                  setShowTrainingZonesModal(true);
                } else if (!response.data.strava?.athleteId) {
                  setShowStravaModal(true);
                }
                addNotification('Units saved', 'success');
              }
            } catch (error) {
              console.error('Error updating units:', error);
              addNotification('Error updating units', 'error');
            }
          }}
          userData={loggedInUser}
        />
      )}

      {/* Training Zones Modal - after units */}
      {loggedInUser && (
        <TrainingZonesModal
          isOpen={showTrainingZonesModal}
          onClose={() => {
            if (loggedInUser._id) {
              localStorage.setItem(`trainingZonesModalDone_${loggedInUser._id}`, 'true');
              api.put('/user/edit-profile', { onboarding: { trainingZonesDone: true } })
                .then((res) => res.data && (setLoggedInUser(res.data), window.dispatchEvent(new CustomEvent('userUpdated', { detail: res.data }))))
                .catch(() => {});
            }
            setShowTrainingZonesModal(false);
            if (!loggedInUser.strava?.athleteId) {
              setShowStravaModal(true);
            }
          }}
          onSubmit={async (formData) => {
            try {
              const response = await api.put('/user/edit-profile', { ...formData, onboarding: { trainingZonesDone: true } });
              if (response.data) {
                // Update user in state
                setLoggedInUser(response.data);
                // Dispatch user update event to update global state
                window.dispatchEvent(new CustomEvent('userUpdated', { detail: response.data }));
                // Close training zones modal and show Strava modal if not connected
                setShowTrainingZonesModal(false);
                if (!response.data.strava?.athleteId) {
                  setShowStravaModal(true);
                }
                addNotification('Training zones updated successfully', 'success');
              }
            } catch (error) {
              console.error('Error updating training zones:', error);
              addNotification('Error updating training zones', 'error');
            }
          }}
          userData={loggedInUser}
        />
      )}

      {/* Strava Connect Modal for users with incomplete profile */}
      <StravaConnectModal
        isOpen={showStravaModal}
        onClose={() => {
          setShowStravaModal(false);
          // Navigate to dashboard after onboarding
          const pendingInvitationToken = localStorage.getItem('pendingInvitationToken');
          if (pendingInvitationToken) {
            navigate(`/accept-coach-invitation/${pendingInvitationToken}`, { replace: true });
          } else {
            navigate("/dashboard", { replace: true });
          }
        }}
        onSkip={() => {
          setShowStravaModal(false);
          // Navigate to dashboard after skipping
          const pendingInvitationToken = localStorage.getItem('pendingInvitationToken');
          if (pendingInvitationToken) {
            navigate(`/accept-coach-invitation/${pendingInvitationToken}`, { replace: true });
          } else {
            navigate("/dashboard", { replace: true });
          }
        }}
      />

      {/* Footer */}
      <motion.footer 
        className="bg-white py-12 border-t mt-auto"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div>
              <a href="/" className="flex items-center gap-2">
                <picture>
                  <source
                    type="image/webp"
                    srcSet="/images/LaChart-96.webp 96w, /images/LaChart-192.webp 192w, /images/LaChart-320.webp 320w"
                    sizes="44px"
                  />
                  <img src="/images/LaChart.png" alt="LaChart Logo" className="h-9 w-11" />
                </picture>
                <span className="text-2xl font-bold text-primary-dark tracking-tight">LaChart</span>
              </a>
              <p className="mt-4 text-gray-600">
                Advanced lactate testing and analysis for athletes and coaches.
              </p>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900 tracking-wider uppercase">Quick Links</h3>
              <ul className="mt-4 space-y-4">
                <li>
                  <Link to="/lactate-curve-calculator" className="text-base text-gray-600 hover:text-primary">
                    Try Demo
                  </Link>
                </li>
                <li>
                  <a href="/lactate-guide" className="text-base text-gray-600 hover:text-primary">
                    Lactate Guide
                  </a>
                </li>
                <li>
                  <a href="/login" className="text-base text-gray-600 hover:text-primary">
                    Login
                  </a>
                </li>
                <li>
                  <a href="/signup" className="text-base text-gray-600 hover:text-primary">
                    Register
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900 tracking-wider uppercase">Contact</h3>
              <ul className="mt-4 space-y-4">
                <li className="flex items-center">
                  <svg className="h-6 w-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <a href="mailto:lachart@lachart.net" className="ml-2 text-gray-600 hover:text-primary">
                    lachart@lachart.net
                  </a>
                </li>
                <li className="flex items-center">
                  <svg className="h-6 w-6 text-primary" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M7.75 2h8.5A5.75 5.75 0 0 1 22 7.75v8.5A5.75 5.75 0 0 1 16.25 22h-8.5A5.75 5.75 0 0 1 2 16.25v-8.5A5.75 5.75 0 0 1 7.75 2Zm0 1.5A4.25 4.25 0 0 0 3.5 7.75v8.5A4.25 4.25 0 0 0 7.75 20.5h8.5A4.25 4.25 0 0 0 20.5 16.25v-8.5A4.25 4.25 0 0 0 16.25 3.5h-8.5Zm8.75 2a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5ZM12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 1.5A3.5 3.5 0 1 0 12 15a3.5 3.5 0 0 0 0-7Z" />
                  </svg>
                  <a
                    href="https://www.instagram.com/lachartapp/?igsh=MXUwZWF3MnU2OXE0dg%3D%3D"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-2 text-gray-600 hover:text-primary"
                  >
                    @lachartapp on Instagram
                  </a>
                </li>
              </ul>
            </div>
          </div>
          <div className="mt-8 border-t border-gray-200 pt-8 text-center space-y-3">
            <p className="text-base text-gray-600">
              &copy; {new Date().getFullYear()} LaChart. All rights reserved.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3 text-sm text-gray-500">
              <a
                href="https://lachart.net/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-primary transition-colors"
              >
                Privacy Policy
              </a>
              <span className="text-gray-300">•</span>
              <a
                href="/terms"
                className="hover:text-primary transition-colors"
              >
                Terms of Use
              </a>
            </div>
            <p className="text-sm text-gray-500">
              Need help or have questions?{" "}
              <a
                href="/about#contact"
                className="text-primary-dark hover:text-primary font-medium"
              >
                Contact us
              </a>
              .
            </p>
          </div>
        </div>
      </motion.footer>
    </motion.div>
  );
};

export default LoginPage;
