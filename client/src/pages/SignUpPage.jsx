import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { register } from '../services/api';
import { GoogleLogin } from '@react-oauth/google';
import { useNotification } from '../context/NotificationContext';
import { useAuth } from '../context/AuthProvider';
import { API_ENDPOINTS } from '../config/api.config';
import { motion } from 'framer-motion';
import { trackEvent, trackUserRegistration, trackConversionFunnel } from '../utils/analytics';
import { logUserRegistration } from '../utils/eventLogger';
import { AnimatePresence, motion as m } from 'framer-motion';
import EditProfileModal from '../components/Profile/EditProfileModal';
import StravaConnectModal from '../components/Onboarding/StravaConnectModal';
import api from '../services/api';
import AuthSideCarousel from '../components/Auth/AuthSideCarousel';
import { isCapacitorNative } from '../utils/isNativeApp';
import { signInWithGoogleNative } from '../utils/nativeGoogleAuth';
import { signInWithAppleNative } from '../utils/nativeAppleAuth';
import { signInWithAppleWeb } from '../utils/webAppleAuth';

const SignUpPage = () => {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    name: '',
    surname: '',
    role: 'athlete'
  });
  const [error, setError] = useState(null);
  const [emailExists, setEmailExists] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [showEditProfileModal, setShowEditProfileModal] = useState(false);
  const [showStravaModal, setShowStravaModal] = useState(false);
  const [newUser, setNewUser] = useState(null);
  const [showGoogleRoleModal, setShowGoogleRoleModal] = useState(false);
  const [pendingGoogleCredential, setPendingGoogleCredential] = useState(null);
  const [googleRoleChoice, setGoogleRoleChoice] = useState('athlete');
  const [googleModalAcceptedTerms, setGoogleModalAcceptedTerms] = useState(false);
  const { addNotification } = useNotification();
  const { login } = useAuth();
  const navigate = useNavigate();

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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setEmailExists(false);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      setError('Please enter a valid email address.');
      return;
    }
    if (formData.password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }
    if (formData.password !== formData.confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    if (!acceptedTerms) {
      setError('You must accept the Terms and Privacy Policy.');
      return;
    }
    try {
      const response = await register(formData);
      trackUserRegistration('email', formData.role);
      trackConversionFunnel('signup_complete', { method: 'email', role: formData.role });
      
      // Log registration event
      await logUserRegistration('email', response?.data?.user?._id);

      // Redirect to login flow (LoginPage handles onboarding modals).
      // We still auto-auth so user doesn't need to re-enter credentials.
      if (response?.data?.token && response?.data?.user) {
        navigate('/login', { replace: true });
        await login(null, null, response.data.token, response.data.user);
        return;
      }

      navigate('/login', { replace: true });
    } catch (error) {
      const data = error.response?.data;
      if (data?.code === 'EMAIL_EXISTS') setEmailExists(true);
      const message = data?.error || data?.message || data?.details || 'Registration failed';
      setError(message);
      trackEvent('register_error', {
        method: 'email',
        error: data?.code || message,
      });
    }
  };

  const handleGoogleSuccess = async (response) => {
    try {
      setError(null);
      // Inherit the terms checkbox from the main form so users who already
      // accepted don't have to tick it again in the modal.
      setGoogleModalAcceptedTerms(acceptedTerms);
      setPendingGoogleCredential(response.credential);
      setGoogleRoleChoice(formData.role || 'athlete');
      setShowGoogleRoleModal(true);
    } catch (error) {
      console.error('Google auth error:', error);
      addNotification('Google authentication failed', 'error');
    }
  };

  // Native Google Sign-Up (uses iOS native SDK)
  const handleNativeGoogleSignUp = async () => {
    try {
      setError(null);
      const credentialResponse = await signInWithGoogleNative();
      await handleGoogleSuccess(credentialResponse);
    } catch (err) {
      console.error('Native Google Sign-Up error:', err);
      const msg = err?.message?.includes('cancel') || err?.message?.includes('Cancel')
        ? 'Google sign-up was cancelled.'
        : 'Google sign-up failed. Please try again.';
      addNotification(msg, 'error');
      setError(msg);
    }
  };

  // Native Apple Sign-Up (iOS). Apple requires Sign in with Apple as an
  // equivalent option to any third-party login (App Store guideline 4.8),
  // so we expose it on signup too — not just login.
  const handleNativeAppleSignUp = async () => {
    try {
      setError(null);
      if (!acceptedTerms) {
        setError('Please accept the Terms & Privacy Policy first.');
        return;
      }
      const { identityToken, user: appleUser } = await signInWithAppleNative();
      const result = await api.post(`${API_ENDPOINTS.AUTH}/apple-auth`, {
        identityToken,
        user: appleUser,
        role: formData.role || 'athlete',
      });
      if (result?.data?.token) {
        trackUserRegistration('apple', formData.role);
        trackConversionFunnel('signup_complete', { method: 'apple', role: formData.role });
        await logUserRegistration('apple', result.data.user?._id);
        navigate('/login', { replace: true });
        await login(null, null, result.data.token, result.data.user);
        return;
      }
      addNotification('Apple authentication failed', 'error');
    } catch (err) {
      // ASAuthorizationError.canceled = 1001 — silent on cancel.
      const msg = String(err?.message || err || '').toLowerCase();
      const code = String(err?.code ?? err?.errorCode ?? '');
      const isCancel =
        code === '1001' || code === '1000' ||
        msg.includes('cancel') ||
        msg.includes('error 1001') ||
        msg.includes('error 1000');
      if (!isCancel) {
        const serverErr = err?.response?.data;
        const detail = serverErr?.reason || serverErr?.error || err?.message;
        addNotification(detail || 'Apple sign-up failed', 'error');
        setError(detail || 'Apple sign-up failed');
      }
    }
  };

  // Web Apple Sign-Up (browser popup)
  const handleWebAppleSignUp = async () => {
    try {
      const { identityToken, user: appleUser } = await signInWithAppleWeb();
      const result = await api.post(`${API_ENDPOINTS.AUTH}/apple-auth`, {
        identityToken,
        user: appleUser,
      });
      if (result.data.token) {
        trackUserRegistration('apple_web', formData.role);
        trackConversionFunnel('signup_complete', { method: 'apple_web', role: formData.role });
        localStorage.setItem('token', result.data.token);
        const { saveUserToStorage } = await import('../utils/userStorage');
        saveUserToStorage(result.data.user);
        api.defaults.headers.common['Authorization'] = `Bearer ${result.data.token}`;
        await login(null, null, result.data.token, result.data.user);
        addNotification('Signed up with Apple', 'success');
        navigate('/dashboard', { replace: true });
      }
    } catch (err) {
      if (!err?.cancelled) {
        const serverErr = err?.response?.data;
        const detail = serverErr?.reason || serverErr?.error || err?.message || 'Apple sign-up failed';
        addNotification(detail, 'error');
      }
    }
  };

  const finalizeGoogleSignup = async () => {
    if (!pendingGoogleCredential) return;
    if (!googleModalAcceptedTerms) {
      addNotification('Please accept the Terms & Conditions and Privacy Policy to continue.', 'error');
      return;
    }

    try {
      const res = await fetch(`${API_ENDPOINTS.AUTH}/google-auth`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          credential: pendingGoogleCredential,
          role: googleRoleChoice,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok && data.token) {
        trackUserRegistration('google', googleRoleChoice);
        trackConversionFunnel('signup_complete', { method: 'google', role: googleRoleChoice });

        // Log registration event
        await logUserRegistration('google', data.user?._id);

        setShowGoogleRoleModal(false);
        setPendingGoogleCredential(null);
        setGoogleModalAcceptedTerms(false);

        // Redirect to login flow (LoginPage handles onboarding modals).
        navigate('/login', { replace: true });
        await login(null, null, data.token, data.user);
        return;
      }

      // Surface the real server error (and its code) instead of a generic
      // message — both so the user knows what to do and so analytics can
      // finally tell us WHY Google sign-ups fail.
      const message = data.error || 'Google sign-up failed. Please try again.';
      addNotification(message, 'error');
      setError(message);
      trackEvent('register_error', { method: 'google', error: data.code || message });
    } catch (error) {
      console.error('Google finalize error:', error);
      const message = 'Network error during Google sign-up. Please check your connection and try again.';
      addNotification(message, 'error');
      setError(message);
      trackEvent('register_error', { method: 'google', error: 'network_error' });
    }
  };

  // ── Native iOS layout ──────────────────────────────────────────
  if (isCapacitorNative()) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'white', overflow: 'hidden' }}>
        <div style={{
          height: '100%',
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          overscrollBehavior: 'contain',
          paddingTop: 'env(safe-area-inset-top)',
          paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)',
        }}>

        <div className="px-5 pt-1 pb-2">
          <button
            type="button"
            onClick={() => navigate('/login')}
            className="flex items-center gap-1 text-primary text-sm font-medium active:opacity-60"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Sign In
          </button>
        </div>

        <div className="px-5 pb-4">
          <div className="mb-3 text-center">
            <div className="mx-auto h-14 w-14 rounded-xl shadow-sm mb-2 flex items-center justify-center bg-white p-2.5">
              <img className="w-full h-full object-contain" src="/images/LaChart.png" alt="LaChart" />
            </div>
            <h1 className="text-xl font-bold text-primary tracking-tight">LaChart</h1>
            <p className="mt-0.5 text-xs text-gray-500">Join LaChart to start tracking</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-2">
            <div className="flex gap-2">
              <input
                type="text"
                autoComplete="given-name"
                required
                placeholder="First Name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="flex-1 min-w-0 px-3.5 py-2.5 bg-gray-100 rounded-xl text-[15px] text-gray-900 placeholder-gray-400 outline-none focus:bg-gray-200 transition-colors"
              />
              <input
                type="text"
                autoComplete="family-name"
                required
                placeholder="Last Name"
                value={formData.surname}
                onChange={(e) => setFormData({ ...formData, surname: e.target.value })}
                className="flex-1 min-w-0 px-3.5 py-2.5 bg-gray-100 rounded-xl text-[15px] text-gray-900 placeholder-gray-400 outline-none focus:bg-gray-200 transition-colors"
              />
            </div>

            <input
              type="email"
              autoComplete="email"
              required
              placeholder="Email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="w-full px-3.5 py-2.5 bg-gray-100 rounded-xl text-[15px] text-gray-900 placeholder-gray-400 outline-none focus:bg-gray-200 transition-colors"
            />

            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                required
                placeholder="Password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-gray-100 rounded-xl text-[15px] text-gray-900 placeholder-gray-400 outline-none focus:bg-gray-200 transition-colors pr-11"
              />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400">
                {showPassword
                  ? <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                  : <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                }
              </button>
            </div>

            <div className="relative">
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                autoComplete="new-password"
                required
                placeholder="Confirm Password"
                value={formData.confirmPassword}
                onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-gray-100 rounded-xl text-[15px] text-gray-900 placeholder-gray-400 outline-none focus:bg-gray-200 transition-colors pr-11"
              />
              <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400">
                {showConfirmPassword
                  ? <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                  : <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                }
              </button>
            </div>

            <div>
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide px-0.5 mb-1.5">I am a...</p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'athlete', icon: '🏃', label: 'Athlete' },
                  { id: 'coach', icon: '📋', label: 'Coach' },
                  { id: 'tester', icon: '🔬', label: 'Lab' },
                ].map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setFormData({ ...formData, role: r.id })}
                    className={`flex flex-col items-center justify-center gap-1 px-2 py-2.5 rounded-xl border-2 text-center transition-all min-h-[72px] ${
                      formData.role === r.id
                        ? 'border-primary bg-primary/5 text-gray-900'
                        : 'border-gray-200 bg-white text-gray-600'
                    }`}
                  >
                    <span className="text-lg leading-none">{r.icon}</span>
                    <span className="text-[11px] font-semibold leading-tight">{r.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-start gap-2.5 pt-0.5">
              <input
                type="checkbox"
                id="nativeAcceptTerms"
                checked={acceptedTerms}
                onChange={(e) => setAcceptedTerms(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-primary shrink-0"
                required
              />
              <label htmlFor="nativeAcceptTerms" className="text-xs text-gray-500 leading-snug">
                I agree to the{' '}
                <button type="button" onClick={() => setShowTermsModal(true)} className="text-primary font-medium">
                  Terms &amp; Conditions
                </button>{' '}
                and{' '}
                <a href="https://lachart.net/privacy" target="_blank" rel="noopener noreferrer" className="text-primary font-medium">
                  Privacy Policy
                </a>
              </label>
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">
                {error}
                {emailExists && (
                  <>
                    {' '}
                    <Link to="/login" className="font-semibold underline">Log in instead</Link>.
                  </>
                )}
              </p>
            )}

            <button
              type="submit"
              disabled={!acceptedTerms}
              className="w-full py-3 rounded-xl bg-primary text-white text-[15px] font-semibold disabled:opacity-40 active:opacity-70 transition-opacity"
            >
              Create Account
            </button>
          </form>

          <div className="mt-3 flex items-center gap-3">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-[11px] text-gray-400 font-medium">nebo</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          <button
            type="button"
            onClick={handleNativeGoogleSignUp}
            className="mt-2.5 w-full flex items-center justify-center gap-2.5 py-2.5 px-4 bg-white border border-gray-300 rounded-xl shadow-sm active:bg-gray-50 transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            <span className="text-[15px] font-medium text-gray-700">Continue with Google</span>
          </button>

          <button
            type="button"
            onClick={handleNativeAppleSignUp}
            className="mt-2 w-full flex items-center justify-center gap-2.5 py-2.5 px-4 bg-black rounded-xl shadow-sm active:opacity-80 transition-opacity"
          >
            <svg width="16" height="20" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg">
              <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.54 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09z"/>
              <path d="M15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701z"/>
            </svg>
            <span className="text-[15px] font-medium text-white">Continue with Apple</span>
          </button>

          <p className="mt-3 text-center text-xs text-gray-500">
            Already have an account?{' '}
            <Link to="/login" className="font-semibold text-primary">Sign In</Link>
          </p>

          <div className="mt-2 flex items-center justify-center gap-2 text-[11px] text-gray-400">
            <a href="https://lachart.net/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>
            <span>·</span>
            <a href="/terms">Terms of Use</a>
          </div>
        </div>
        </div>

        {/* Terms modal */}
        <AnimatePresence>
          {showTermsModal && (
            <m.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100000] bg-black/50 flex items-end justify-center"
              onClick={() => setShowTermsModal(false)}
            >
              <m.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                className="bg-white w-full max-h-[85vh] rounded-t-3xl p-6 overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5" />
                <h2 className="text-xl font-bold mb-4 text-gray-900">Terms &amp; Conditions</h2>
                <div className="text-sm text-gray-600 space-y-3 mb-6">
                  <p><strong>Welcome to LaChart!</strong> To use our application, you must accept the following Terms and Privacy Policy.</p>
                  <ol className="list-decimal ml-5 space-y-2">
                    <li><strong>Data Storage:</strong> Your account and test entries are stored securely.</li>
                    <li><strong>Privacy:</strong> See our <a href="/privacy" className="text-primary underline">Privacy Policy</a> for full details.</li>
                    <li><strong>Usage:</strong> You agree to use the application for lawful purposes only.</li>
                    <li><strong>Account:</strong> You are responsible for keeping your password safe.</li>
                    <li><strong>Analytics:</strong> The app collects anonymous usage stats to improve the product.</li>
                    <li><strong>Consent:</strong> By signing up, you consent to receive transactional emails.</li>
                  </ol>
                  <p>Contact: <a href="mailto:lachart@lachart.net" className="text-primary underline">lachart@lachart.net</a></p>
                </div>
                <button
                  className="w-full py-4 rounded-2xl bg-primary text-white font-semibold"
                  onClick={() => { setAcceptedTerms(true); setShowTermsModal(false); }}
                >
                  I Accept
                </button>
                <button className="w-full py-3 mt-2 text-sm text-gray-500" onClick={() => setShowTermsModal(false)}>
                  Close
                </button>
              </m.div>
            </m.div>
          )}
        </AnimatePresence>

        {/* Google role selection modal – also needed on native */}
        <AnimatePresence>
          {showGoogleRoleModal && (
            <m.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-[99999] bg-black/50 flex items-end justify-center"
              onClick={() => { setShowGoogleRoleModal(false); setPendingGoogleCredential(null); setGoogleModalAcceptedTerms(false); }}
            >
              <m.div
                initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                className="bg-white w-full max-h-[85vh] rounded-t-3xl p-6 overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
                style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 24px)' }}
              >
                <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5" />
                <h2 className="text-2xl font-bold mb-2 text-gray-900">Choose your role</h2>
                <p className="text-sm text-gray-500 mb-5">How will you use LaChart? You can update this later.</p>
                <div className="space-y-3 mb-5">
                  {[
                    { id: 'athlete', icon: '🏃', label: 'Athlete', desc: 'Track my own training & tests' },
                    { id: 'coach', icon: '📋', label: 'Coach', desc: 'Manage athletes & analyse training' },
                    { id: 'tester', icon: '🔬', label: 'Tester / Lab', desc: 'Run lactate tests & generate reports' },
                  ].map((r) => (
                    <label key={r.id} className={`flex items-center gap-3 rounded-2xl border-2 p-4 cursor-pointer ${googleRoleChoice === r.id ? 'border-primary bg-primary/5' : 'border-gray-200'}`}>
                      <input type="radio" name="nativeGoogleRole" value={r.id} checked={googleRoleChoice === r.id} onChange={() => setGoogleRoleChoice(r.id)} className="h-4 w-4 text-primary" />
                      <span className="text-xl shrink-0">{r.icon}</span>
                      <div className="min-w-0">
                        <div className="font-semibold text-gray-900">{r.label}</div>
                        <div className="text-xs text-gray-500 truncate">{r.desc}</div>
                      </div>
                    </label>
                  ))}
                </div>
                <label className="flex items-start gap-3 mb-5">
                  <input type="checkbox" checked={googleModalAcceptedTerms} onChange={(e) => setGoogleModalAcceptedTerms(e.target.checked)} className="mt-0.5 h-4 w-4 accent-primary shrink-0" />
                  <span className="text-sm text-gray-500">I agree to the <button type="button" className="text-primary font-medium" onClick={() => setShowTermsModal(true)}>Terms &amp; Conditions</button> and <a href="https://lachart.net/privacy" target="_blank" rel="noopener noreferrer" className="text-primary font-medium">Privacy Policy</a></span>
                </label>
                <button
                  disabled={!googleModalAcceptedTerms}
                  onClick={finalizeGoogleSignup}
                  className="w-full py-4 rounded-2xl bg-primary text-white font-semibold disabled:opacity-40 active:opacity-70"
                >
                  Continue with Google
                </button>
              </m.div>
            </m.div>
          )}
        </AnimatePresence>

        {/* Strava modal */}
        <StravaConnectModal
          isOpen={showStravaModal}
          onClose={() => { setShowStravaModal(false); navigate('/dashboard', { replace: true }); }}
          onSkip={() => { setShowStravaModal(false); navigate('/dashboard', { replace: true }); }}
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
          className="hidden lg:flex lg:w-1/2 overflow-y-auto"
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
          className="w-full lg:w-1/2 flex items-center justify-center px-8"
          style={{ overflow: 'visible' }}
        >
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="max-w-md w-full space-y-8 px-2 py-2"
          style={{ overflow: 'visible' }}
        >
          <motion.div
            initial={{ scale: 0.9 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.5, delay: 0.6 }}
          >
            <div className="mx-auto flex items-center gap-2 justify-center">
              <div className="h-11 w-11 rounded-2xl shadow-sm flex items-center justify-center">
                <picture>
                  
                  <img className="h-11 w-11 object-contain" src="/images/LaChart.png" alt="LaChart" />
                </picture>
              </div>
              <h1 className="text-2xl font-bold text-primary-dark tracking-tight">LaChart</h1>
            </div>
            <h2 className="mt-6 text-center text-3xl font-bold text-gray-900">
              Sign Up for an Account
            </h2>
            <p className="mt-2 text-center text-sm text-gray-600">
              Please enter your details
            </p>
          </motion.div>

          <motion.form
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.8 }}
            className="mt-6 sm:mt-8 space-y-4 sm:space-y-6"
            style={{ overflow: 'visible' }}
            onSubmit={handleSubmit}
          >
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.5, delay: 1 }}
              className="space-y-4 py-1"
              style={{ overflow: 'visible' }}
            >
              <motion.div
                whileHover={{ scale: 1.02 }}
                transition={{ duration: 0.2 }}
                className="flex space-x-4"
                style={{ overflow: 'visible' }}
              >
                <div className="relative">
                  <input
                    id="name"
                    name="name"
                    type="text"
                    autoComplete="off"
                    required
                    className="appearance-none rounded-lg relative block w-full pl-10 pr-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-violet-500 focus:border-violet-500"
                    placeholder="First Name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400">
                    <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                    </svg>
                  </span>
                </div>
        
                <div className="relative">
                  <input
                    id="surname"
                    name="surname"
                    type="text"
                    autoComplete="off"
                    required
                    className="appearance-none rounded-lg relative block w-full pl-10 pr-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-violet-500 focus:border-violet-500"
                    placeholder="Last Name"
                    value={formData.surname}
                    onChange={(e) => setFormData({ ...formData, surname: e.target.value })}
                  />
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400">
                    <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                    </svg>
                  </span>
                </div>
              </motion.div>

              <motion.div
                whileHover={{ scale: 1.02 }}
                transition={{ duration: 0.2 }}
                className="relative"
                style={{ overflow: 'visible' }}
              >
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="off"
                  required
                  className="appearance-none rounded-lg relative block w-full pl-10 pr-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-violet-500 focus:border-violet-500"
                  style={{ margin: '5px', width: 'calc(100% - 10px)' }}
                  placeholder="Email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400">
                  <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                    <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
                  </svg>
                </span>
              </motion.div>

              <motion.div
                whileHover={{ scale: 1.02 }}
                transition={{ duration: 0.2 }}
                className="relative"
                style={{ overflow: 'visible' }}
              >
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  className="appearance-none rounded-lg relative block w-full pl-10 pr-10 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-violet-500 focus:border-violet-500"
                  style={{ margin: '5px', width: 'calc(100% - 10px)' }}
                  placeholder="Password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                />
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400">
                  <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                  </svg>
                </span>
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  type="button"
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
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

              <motion.div
                whileHover={{ scale: 1.02 }}
                transition={{ duration: 0.2 }}
                className="relative"
                style={{ overflow: 'visible' }}
              >
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  className="appearance-none rounded-lg relative block w-full pl-10 pr-10 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-violet-500 focus:border-violet-500"
                  style={{ margin: '5px', width: 'calc(100% - 10px)' }}
                  placeholder="Confirm Password"
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                />
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400">
                  <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                  </svg>
                </span>
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  type="button"
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                >
                  {showConfirmPassword ? (
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

            <motion.p 
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.5, delay: 1.2 }}
              className="text-xs text-gray-500"
            >
              Your password must have at least 8 characters
            </motion.p>

            <motion.div 
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.5, delay: 1.4 }}
              className='flex space-x-4'
            >
              <div className="flex items-center">
                <input
                  id="role-athlete"
                  name="role"
                  type="radio"
                  value="athlete"
                  checked={formData.role === 'athlete'}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  className="h-4 w-4 text-violet-600 focus:ring-violet-500 border-gray-300 rounded"
                />
                <label htmlFor="role-athlete" className="ml-2 block text-sm text-gray-900">
                  Athlete
                </label>
              </div>
      
              <div className="flex items-center">
                <input
                  id="role-coach"
                  name="role"
                  type="radio"
                  value="coach"
                  checked={formData.role === 'coach'}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  className="h-4 w-4 text-violet-600 focus:ring-violet-500 border-gray-300 rounded"
                />
                <label htmlFor="role-coach" className="ml-2 block text-sm text-gray-900">
                  Coach
                </label>
              </div>
            </motion.div>

            {error && (
              <motion.div 
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.5, delay: 1.6 }}
                className="text-red-500 text-sm text-center"
              >
                {error}
                {emailExists && (
                  <>
                    {' '}
                    <Link to="/login" className="font-semibold underline">Log in instead</Link>.
                  </>
                )}
              </motion.div>
            )}

            {/* Terms & Conditions checkbox */}
            <motion.div
              className="flex items-start gap-2 text-sm text-gray-600 mb-1 mt-4"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 1.5 }}
            >
              <input
                type="checkbox"
                id="acceptTerms"
                name="acceptTerms"
                checked={acceptedTerms}
                onChange={e => setAcceptedTerms(e.target.checked)}
                className="h-4 w-4 mt-1 accent-primary"
                required
              />
              <label htmlFor="acceptTerms">
                I agree to the{' '}
                <button type="button" className="underline text-primary-dark hover:text-primary mr-1" onClick={() => setShowTermsModal(true)}>
                  Terms & Conditions
                </button>
                and <a href="/privacy" target="_blank" rel="noopener noreferrer" className="underline text-primary-dark hover:text-primary">Privacy Policy</a>.
              </label>
            </motion.div>

            <motion.div
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <button
                type="submit"
                className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-primary-dark hover:bg-primary focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-violet-500"
                disabled={!acceptedTerms}
              >
                Sign Up
              </button>
            </motion.div>

            {!isCapacitorNative() && (
            <motion.div 
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.5, delay: 1.8 }}
              className="mt-6"
            >
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-300"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-white text-gray-500">Or sign up with</span>
                </div>
              </div>

              <p className="text-xs text-center text-gray-500 mt-2">
                After Google sign-in you&apos;ll choose your role and accept the Terms &amp; Privacy Policy.
              </p>

              <div className="mt-4 flex flex-col items-center gap-3">
                <GoogleLogin
                  onSuccess={handleGoogleSuccess}
                  onError={() => addNotification('Google authentication failed', 'error')}
                  useOneTap={false}
                  auto_select={false}
                  theme="filled_white"
                  size="large"
                  text="signup_with"
                  shape="rectangular"
                  logo_alignment="left"
                  width="300"
                  cancel_on_tap_outside={true}
                  prompt_parent_id="google-signup-button"
                  nonce={crypto.randomUUID()}
                  ux_mode="popup"
                  context="signup"
                />

                {/* Apple Sign Up — web popup */}
                <button
                  type="button"
                  onClick={handleWebAppleSignUp}
                  style={{ width: 300 }}
                  className="flex items-center justify-center gap-2.5 py-2.5 px-4 bg-black hover:bg-gray-900 active:bg-gray-800 rounded-md shadow-sm transition-colors text-white text-sm font-medium"
                >
                  <svg width="16" height="20" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.54 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09z"/>
                    <path d="M15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701z"/>
                  </svg>
                  <span>Sign up with Apple</span>
                </button>
              </div>
            </motion.div>
            )}
          </motion.form>

          <motion.p 
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.5, delay: 2 }}
            className="text-center text-sm text-gray-600"
          >
            Already have an account?{' '}
            <Link to="/login" className="font-medium text-primary-dark hover:text-primary">
              Sign In
            </Link>
          </motion.p>
        </motion.div>
      </motion.div>

      {/* Google role selection modal (first step for google signup) */}
      <AnimatePresence>
        {showGoogleRoleModal && (
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[99999] bg-black/50 flex items-center justify-center px-3"
            onClick={() => setShowGoogleRoleModal(false)}
          >
            <m.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 sm:p-8 rounded-xl shadow-xl relative"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                className="absolute top-3 right-3 text-gray-500 hover:text-primary-dark font-bold text-lg z-10"
                onClick={() => {
                  setShowGoogleRoleModal(false);
                  setPendingGoogleCredential(null);
                  setGoogleModalAcceptedTerms(false);
                }}
                type="button"
              >
                &times;
              </button>
              <h2 className="text-2xl font-bold mb-2 text-primary-dark pr-8">Choose your role</h2>
              <p className="text-sm text-gray-600 mb-5">
                Pick how you&apos;ll use LaChart. You can change details later in your profile.
              </p>

              <div className="space-y-3">
                <label
                  className={`block rounded-xl border-2 p-4 cursor-pointer transition-colors ${
                    googleRoleChoice === 'athlete'
                      ? 'border-primary bg-violet-50/80'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="radio"
                      name="googleRole"
                      value="athlete"
                      checked={googleRoleChoice === 'athlete'}
                      onChange={() => setGoogleRoleChoice('athlete')}
                      className="mt-1 h-4 w-4 text-primary"
                    />
                    <div>
                      <span className="font-semibold text-gray-900">Athlete</span>
                      <p className="text-sm text-gray-600 mt-2 leading-relaxed">
                        For your own training and testing. You can create and manage your lactate tests, view curves and
                        results, set up training zones, and keep everything in one place. Ideal if you&apos;re testing
                        yourself and tracking your progress over time.
                      </p>
                    </div>
                  </div>
                </label>

                <label
                  className={`block rounded-xl border-2 p-4 cursor-pointer transition-colors ${
                    googleRoleChoice === 'coach'
                      ? 'border-primary bg-violet-50/80'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="radio"
                      name="googleRole"
                      value="coach"
                      checked={googleRoleChoice === 'coach'}
                      onChange={() => setGoogleRoleChoice('coach')}
                      className="mt-1 h-4 w-4 text-primary"
                    />
                    <div>
                      <span className="font-semibold text-gray-900">Coach</span>
                      <p className="text-sm text-gray-600 mt-2 leading-relaxed">
                        For coaches and practitioners working with athletes. You can create athletes, assign tests, follow
                        their profiles and results, send test outcomes by email, generate PDF reports, and keep a clear
                        overview of each athlete&apos;s lactate data.
                      </p>
                    </div>
                  </div>
                </label>
              </div>

              <div className="mt-5 flex items-start gap-2 text-sm text-gray-600 border-t border-gray-100 pt-5">
                <input
                  type="checkbox"
                  id="googleModalAcceptTerms"
                  checked={googleModalAcceptedTerms}
                  onChange={(e) => setGoogleModalAcceptedTerms(e.target.checked)}
                  className="h-4 w-4 mt-0.5 accent-primary shrink-0"
                />
                <label htmlFor="googleModalAcceptTerms" className="leading-snug">
                  I agree to the{' '}
                  <button
                    type="button"
                    className="underline text-primary-dark hover:text-primary"
                    onClick={() => setShowTermsModal(true)}
                  >
                    Terms &amp; Conditions
                  </button>{' '}
                  and{' '}
                  <a
                    href="/privacy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline text-primary-dark hover:text-primary"
                  >
                    Privacy Policy
                  </a>
                  .
                </label>
              </div>

              <div className="mt-6 flex flex-col-reverse sm:flex-row gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowGoogleRoleModal(false);
                    setPendingGoogleCredential(null);
                    setGoogleModalAcceptedTerms(false);
                  }}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-lg bg-gray-200 text-gray-800 font-semibold hover:bg-gray-300"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={finalizeGoogleSignup}
                  disabled={!googleModalAcceptedTerms}
                  className="flex-1 px-5 py-2.5 rounded-lg bg-primary-dark text-white font-semibold hover:bg-primary disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Continue
                </button>
              </div>
            </m.div>
          </m.div>
        )}
      </AnimatePresence>
      </div>

      {/* Terms Modal */}
      <AnimatePresence>
        {showTermsModal && (
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100000] bg-black/50 flex items-center justify-center px-3"
            onClick={() => setShowTermsModal(false)}
          >
            <m.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white max-w-xl w-full p-8 rounded-xl shadow-xl relative"
              onClick={e => e.stopPropagation()}
            >
              <button className="absolute top-3 right-3 text-gray-500 hover:text-primary-dark font-bold text-lg" onClick={() => setShowTermsModal(false)}>&times;</button>
              <h2 className="text-2xl font-bold mb-4 text-primary-dark">Terms & Conditions</h2>
              <div className="prose max-w-none text-sm text-gray-700 mb-4 overflow-y-auto max-h-[50vh]">
                <p><b>Welcome to LaChart!</b> To use our application, you must accept the following Terms and Privacy Policy. Please read carefully:</p>
                <ol className="list-decimal ml-6">
                  <li><b>Data Storage:</b> Your account and test entries are stored securely. Data is not shared with third parties except as required by law.</li>
                  <li><b>Privacy:</b> See our <a href="/privacy" className="underline text-primary-dark">Privacy Policy</a> for full details.</li>
                  <li><b>Usage:</b> You agree to use the application for lawful purposes. No abusive, fraudulent, or unauthorized activities are allowed.</li>
                  <li><b>Account:</b> Users are responsible for keeping passwords safe. LaChart is not liable for unauthorized access caused by user negligence.</li>
                  <li><b>Analytics:</b> The app collects anonymous usage stats to improve the product.</li>
                  <li><b>Consent:</b> By signing up, you consent to receive transactional emails (activation, password, notifications).</li>
                </ol>
                <p>For more details or concerns, contact us at <a href="mailto:lachart@lachart.net" className="underline text-primary-dark">lachart@lachart.net</a>.</p>
                <p className="text-xs text-gray-600 mt-2">This is a demo EULA. Your real legal text goes here.</p>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  className="px-5 py-2 rounded-lg bg-primary-dark text-white font-semibold hover:bg-primary"
                  onClick={() => {
                    setAcceptedTerms(true);
                    if (showGoogleRoleModal) setGoogleModalAcceptedTerms(true);
                    setShowTermsModal(false);
                  }}
                >
                  I Accept
                </button>
                <button
                  className="px-5 py-2 rounded-lg bg-gray-200 text-gray-800 font-semibold hover:bg-gray-300"
                  onClick={() => setShowTermsModal(false)}
                >
                  Close
                </button>
              </div>
            </m.div>
          </m.div>
        )}
      </AnimatePresence>

      {/* Edit Profile Modal for new users */}
      {newUser && (
        <EditProfileModal
          isOpen={showEditProfileModal}
          onClose={() => {
            setShowEditProfileModal(false);
            // After closing edit profile, show Strava connect modal
            setShowStravaModal(true);
          }}
          onSubmit={async (formData) => {
            try {
              const response = await api.put('/user/edit-profile', formData);
              if (response.data) {
                // Update user in state
                setNewUser(response.data);
                // Dispatch user update event to update global state
                window.dispatchEvent(new CustomEvent('userUpdated', { detail: response.data }));
                // Close edit profile modal and show Strava modal
                setShowEditProfileModal(false);
                setShowStravaModal(true);
              }
            } catch (error) {
              console.error('Error updating profile:', error);
              addNotification('Error updating profile', 'error');
            }
          }}
          userData={newUser}
        />
      )}

      {/* Strava Connect Modal for new users */}
      <StravaConnectModal
        isOpen={showStravaModal}
        onClose={() => {
          setShowStravaModal(false);
          // Navigate to dashboard after onboarding
          navigate('/dashboard', { replace: true });
        }}
        onSkip={() => {
          setShowStravaModal(false);
          // Navigate to dashboard after skipping
          navigate('/dashboard', { replace: true });
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
                  
                  <img src="/images/LaChart.png" alt="LaChart Logo" className="h-9 w-auto object-contain" />
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
                  <a href="/lactate-curve-calculator" className="text-base text-gray-600 hover:text-primary">
                    Try Demo
                  </a>
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

export default SignUpPage; 