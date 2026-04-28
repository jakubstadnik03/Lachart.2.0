import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { motion } from 'framer-motion';
import { API_BASE_URL } from '../config/api.config';
import AuthSideCarousel from '../components/Auth/AuthSideCarousel';
import { isCapacitorNative } from '../utils/isNativeApp';

const ForgotPasswordPage = () => {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState({ type: '', message: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [emailError, setEmailError] = useState('');

  const validateEmail = (value) => {
    if (!value) return 'Email is required';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'Enter a valid email address';
    return '';
  };

  const handleEmailChange = (e) => {
    const val = e.target.value;
    setEmail(val);
    setEmailError(validateEmail(val));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const err = validateEmail(email);
    if (err) { setEmailError(err); return; }
    setIsSubmitting(true);
    setStatus({ type: '', message: '' });
    setEmailError('');
    try {
      await axios.post(`${API_BASE_URL}/user/forgot-password`, { email }, {
        headers: { 'Content-Type': 'application/json' },
      });
      setShowConfirmation(true);
      setEmail('');
    } catch (error) {
      let msg = 'An error occurred while processing the request. Please try again later.';
      if (error.response?.data?.error) msg = error.response.data.error;
      else if (error.response?.status === 404) msg = 'User with this email was not found.';
      setStatus({ type: 'error', message: msg });
      setShowConfirmation(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResend = async () => {
    const err = validateEmail(email);
    if (err) { setEmailError(err); return; }
    setIsSubmitting(true);
    setEmailError('');
    try {
      await axios.post(`${API_BASE_URL}/user/forgot-password`, { email }, {
        headers: { 'Content-Type': 'application/json' },
      });
      setStatus({ type: 'success', message: 'Password reset instructions were sent again to your email.' });
    } catch (error) {
      let msg = 'An error occurred while resending. Please try again later.';
      if (error.response?.data?.error) msg = error.response.data.error;
      else if (error.response?.status === 404) msg = 'User with this email was not found.';
      setStatus({ type: 'error', message: msg });
    } finally {
      setIsSubmitting(false);
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
              <p className="mt-1 text-sm text-gray-500">Reset your password</p>
            </div>

            {!showConfirmation ? (
              <>
                <p className="text-sm text-gray-500 text-center mb-6">
                  Enter your email and we'll send you a reset link.
                </p>
                {status.message && (
                  <div className={`mb-4 px-4 py-3 rounded-xl text-sm ${status.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>
                    {status.message}
                  </div>
                )}
                <form onSubmit={handleSubmit} className="space-y-3">
                  <input
                    type="email"
                    autoComplete="email"
                    required
                    disabled={isSubmitting}
                    placeholder="Email"
                    value={email}
                    onChange={handleEmailChange}
                    className="w-full px-4 py-3.5 bg-gray-100 rounded-2xl text-base text-gray-900 placeholder-gray-400 outline-none focus:bg-gray-200 transition-colors disabled:opacity-50"
                  />
                  {emailError && <p className="text-sm text-red-600 pl-1">{emailError}</p>}
                  <button
                    type="submit"
                    disabled={isSubmitting || !!emailError}
                    className="w-full py-3.5 rounded-2xl bg-primary text-white text-base font-semibold mt-1 disabled:opacity-50 active:opacity-70 transition-opacity"
                  >
                    {isSubmitting ? 'Sending…' : 'Send Reset Link'}
                  </button>
                </form>
              </>
            ) : (
              <div className="text-center">
                <div className="mx-auto flex items-center justify-center h-20 w-20 rounded-full bg-primary/10 mb-6">
                  <svg className="h-10 w-10 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <h2 className="text-xl font-bold text-gray-900 mb-2">Check your email</h2>
                <p className="text-sm text-gray-500 mb-6">We've sent password reset instructions to your email.</p>
                {status.message && (
                  <div className={`mb-4 px-4 py-3 rounded-xl text-sm ${status.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>
                    {status.message}
                  </div>
                )}
                <button
                  onClick={() => setShowConfirmation(false)}
                  className="w-full py-3.5 rounded-2xl bg-primary text-white text-base font-semibold mb-3 active:opacity-70"
                >
                  Back
                </button>
                <p className="text-sm text-gray-500">
                  Didn't receive it?{' '}
                  <button
                    onClick={handleResend}
                    disabled={isSubmitting}
                    className="font-semibold text-primary disabled:opacity-50"
                  >
                    {isSubmitting ? 'Sending…' : 'Resend'}
                  </button>
                </p>
              </div>
            )}

            <p className="mt-8 text-center text-sm text-gray-500">
              Remember your password?{' '}
              <Link to="/login" className="font-semibold text-primary">Sign In</Link>
            </p>
          </div>
        </div>
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
        {/* Left side — AuthSideCarousel (desktop only) */}
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

        {/* Right side — Form */}
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
            {/* Logo + heading */}
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

              {!showConfirmation ? (
                <>
                  <h2 className="mt-6 text-center text-3xl font-bold text-gray-900">
                    Forgot Password?
                  </h2>
                  <p className="mt-2 text-center text-sm text-gray-600">
                    Enter your email and we'll send you a reset link.
                  </p>
                </>
              ) : (
                <>
                  <h2 className="mt-6 text-center text-3xl font-bold text-gray-900">
                    Check your email
                  </h2>
                  <p className="mt-2 text-center text-sm text-gray-600">
                    We've sent password reset instructions to your inbox.
                  </p>
                </>
              )}
            </motion.div>

            {!showConfirmation ? (
              <motion.form
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.8 }}
                className="mt-8 space-y-6"
                onSubmit={handleSubmit}
              >
                {status.message && (
                  <div className={`px-4 py-3 rounded-xl text-sm ${
                    status.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'
                  }`}>
                    {status.message}
                  </div>
                )}

                <motion.div
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ duration: 0.5, delay: 1 }}
                  className="space-y-1"
                >
                  <motion.div whileHover={{ scale: 1.02 }} transition={{ duration: 0.2 }}>
                    <div className="relative">
                      <input
                        id="email"
                        name="email"
                        type="email"
                        autoComplete="email"
                        required
                        disabled={isSubmitting}
                        className={`appearance-none rounded-xl relative block w-full px-4 py-3 pl-10 border placeholder-gray-400 text-gray-900 bg-white/80 backdrop-blur-md focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/50 disabled:bg-gray-100 disabled:cursor-not-allowed shadow-sm ${
                          emailError ? 'border-red-300' : 'border-gray-200'
                        }`}
                        placeholder="Email"
                        value={email}
                        onChange={handleEmailChange}
                      />
                      <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400 pointer-events-none">
                        <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                          <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                          <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
                        </svg>
                      </span>
                    </div>
                    {emailError && (
                      <p className="mt-1 text-sm text-red-600 pl-1">{emailError}</p>
                    )}
                  </motion.div>
                </motion.div>

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  type="submit"
                  disabled={isSubmitting || !!emailError}
                  className="w-full flex justify-center py-3 px-4 border border-transparent rounded-xl shadow-lg text-sm font-semibold text-white bg-primary-dark hover:bg-primary focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary/50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Sending…
                    </>
                  ) : (
                    'Send Reset Link'
                  )}
                </motion.button>
              </motion.form>
            ) : (
              /* Confirmation state */
              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.8 }}
                className="mt-8 space-y-6"
              >
                {/* Email icon */}
                <div className="flex justify-center">
                  <div className="flex items-center justify-center h-20 w-20 rounded-full bg-primary/10">
                    <svg className="h-10 w-10 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                </div>

                {status.message && (
                  <div className={`px-4 py-3 rounded-xl text-sm ${
                    status.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'
                  }`}>
                    {status.message}
                  </div>
                )}

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setShowConfirmation(false)}
                  className="w-full flex justify-center py-3 px-4 border border-transparent rounded-xl shadow-lg text-sm font-semibold text-white bg-primary-dark hover:bg-primary"
                >
                  Back
                </motion.button>

                <p className="text-center text-sm text-gray-600">
                  Didn't receive an email?{' '}
                  <button
                    onClick={handleResend}
                    disabled={isSubmitting}
                    className="font-medium text-primary hover:text-primary-dark disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSubmitting ? 'Sending…' : 'Resend'}
                  </button>
                </p>
              </motion.div>
            )}

            {/* Back to login */}
            <motion.p
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.5, delay: 1.6 }}
              className="text-center text-sm text-gray-600"
            >
              Remember your password?{' '}
              <Link to="/login" className="font-medium text-primary hover:text-primary-dark">
                Sign In
              </Link>
            </motion.p>
          </motion.div>
        </motion.div>
      </div>
    </motion.div>
  );
};

export default ForgotPasswordPage;
