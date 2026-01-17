import React, { useState } from 'react';
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
import { saveUserToStorage } from '../utils/userStorage';

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
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [showEditProfileModal, setShowEditProfileModal] = useState(false);
  const [showStravaModal, setShowStravaModal] = useState(false);
  const [newUser, setNewUser] = useState(null);
  const { addNotification } = useNotification();
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!acceptedTerms) {
      setError('You must accept the Terms and Privacy Policy.');
      return;
    }
    if (formData.password !== formData.confirmPassword) {
      setError("Passwords don't match");
      return;
    }
    try {
      const response = await register(formData);
      trackUserRegistration('email', formData.role);
      trackConversionFunnel('signup_complete', { method: 'email', role: formData.role });
      
      // Log registration event
      await logUserRegistration('email', response?.data?.user?._id);
      
      // Automatically log in the user after registration
      if (response?.data?.token && response?.data?.user) {
        // Save token and user
        localStorage.setItem('token', response.data.token);
        saveUserToStorage(response.data.user);
        api.defaults.headers.common["Authorization"] = `Bearer ${response.data.token}`;
        
        // Update auth state
        await login(formData.email, formData.password, response.data.token, response.data.user);
        
        // Store new user for onboarding modals
        setNewUser(response.data.user);
        
        // Show edit profile modal first
        setShowEditProfileModal(true);
      } else {
        // Fallback to login page if auto-login fails
      navigate('/login');
      }
    } catch (error) {
      setError(error.response?.data?.message || 'Registration failed');
      trackEvent('register_error', { 
        method: 'email', 
        error: error.response?.data?.message || 'Registration failed' 
      });
    }
  };

  const handleGoogleSuccess = async (response) => {
    try {
      const res = await fetch(`${API_ENDPOINTS.API_URL}/auth/google`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          googleId: response.credential,
          email: response.email,
          name: response.given_name,
          surname: response.family_name,
        }),
      });

      const data = await res.json();
      if (data.token) {
        trackUserRegistration('google', 'athlete');
        trackConversionFunnel('signup_complete', { method: 'google', role: 'athlete' });
        
        // Log registration event
        await logUserRegistration('google', data.user?._id);
        
        // Save token and user
        localStorage.setItem('token', data.token);
        saveUserToStorage(data.user);
        api.defaults.headers.common["Authorization"] = `Bearer ${data.token}`;
        
        // Update auth state
        await login(null, null, data.token, data.user);
        
        // Store new user for onboarding modals
        setNewUser(data.user);
        
        // Show edit profile modal first
        setShowEditProfileModal(true);
      } else {
        addNotification('Google authentication failed', 'error');
        trackEvent('register_error', { method: 'google', error: 'Authentication failed' });
      }
    } catch (error) {
      console.error('Google auth error:', error);
      addNotification('Google authentication failed', 'error');
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="min-h-screen flex flex-col bg-[#EEF2FF] pt-safe-top"
    >
      <div className="flex flex-1 min-h-0" style={{ minHeight: '100vh' }}>
        {/* Left side - Background with Image and SEO Content */}
        <motion.div 
          initial={{ x: -100, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="hidden lg:flex lg:w-1/2 overflow-y-auto"
        >
          <div className="flex flex-col items-center justify-center w-full min-h-full px-8 py-8 space-y-4">
            {/* Image */}
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.4 }}
              className="w-full max-w-md"
            >
              <img
                src="/images/testing.png"
                alt="LaChart - Advanced Lactate Testing and Training Analysis"
                className="w-full h-auto rounded-2xl shadow-2xl object-contain"
              />
            </motion.div>

            {/* SEO Content */}
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.6 }}
              className="text-center space-y-4 max-w-xl"
            >
              <h1 className="text-3xl font-bold text-gray-900 leading-tight">
                Advanced Lactate Testing & Training Analysis
              </h1>
              <p className="text-base text-gray-700 leading-relaxed">
                LaChart is a comprehensive platform for endurance athletes and coaches to analyze lactate threshold tests, 
                track training progress, and optimize performance through data-driven insights.
              </p>
              <div className="grid grid-cols-2 gap-4 mt-4">
                <div className="bg-white/60 backdrop-blur-sm rounded-xl p-3 shadow-lg">
                  <h3 className="font-semibold text-gray-900 mb-1 text-sm">Lactate Testing</h3>
                  <p className="text-xs text-gray-600">
                    Perform accurate lactate threshold tests and analyze results with advanced curve fitting algorithms.
                  </p>
                </div>
                <div className="bg-white/60 backdrop-blur-sm rounded-xl p-3 shadow-lg">
                  <h3 className="font-semibold text-gray-900 mb-1 text-sm">Training Zones</h3>
                  <p className="text-xs text-gray-600">
                    Calculate personalized training zones based on your lactate thresholds for optimal training intensity.
                  </p>
                </div>
                <div className="bg-white/60 backdrop-blur-sm rounded-xl p-3 shadow-lg">
                  <h3 className="font-semibold text-gray-900 mb-1 text-sm">Strava Integration</h3>
                  <p className="text-xs text-gray-600">
                    Seamlessly sync your training data from Strava for comprehensive performance tracking.
                  </p>
                </div>
                <div className="bg-white/60 backdrop-blur-sm rounded-xl p-3 shadow-lg">
                  <h3 className="font-semibold text-gray-900 mb-1 text-sm">Progress Tracking</h3>
                  <p className="text-xs text-gray-600">
                    Monitor your training progress over time with detailed analytics and visualizations.
                  </p>
                </div>
              </div>
            </motion.div>
          </div>
        </motion.div>

        {/* Right side - Form */}
        <motion.div 
          initial={{ x: 100, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="w-full lg:w-1/2 flex items-center justify-center px-8 overflow-y-auto"
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
            <div className='mx-auto flex items-center gap-2 justify-center'>
              <img
                className="h-12 w-auto"
                src="/images/LaChart.png"
                alt="Your Logo"
              />
              <h1 className='text-2xl font-bold text-primary'>LaChart</h1>
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
                className="flex space-x-4"
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
              >
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="off"
                  required
                  className="appearance-none rounded-lg relative block w-full pl-10 pr-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-violet-500 focus:border-violet-500"
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
              >
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  className="appearance-none rounded-lg relative block w-full pl-10 pr-10 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-violet-500 focus:border-violet-500"
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
              >
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  className="appearance-none rounded-lg relative block w-full pl-10 pr-10 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-violet-500 focus:border-violet-500"
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
                <button type="button" className="underline text-primary hover:text-primary-dark mr-1" onClick={() => setShowTermsModal(true)}>
                  Terms & Conditions
                </button>
                and <a href="/privacy" target="_blank" rel="noopener noreferrer" className="underline text-primary hover:text-primary-dark">Privacy Policy</a>.
              </label>
            </motion.div>

            <motion.div
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <button
                type="submit"
                className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-primary hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-violet-500"
                disabled={!acceptedTerms}
              >
                Sign Up
              </button>
            </motion.div>

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

              <div className="mt-6 flex justify-center">
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
              </div>
            </motion.div>
          </motion.form>

          <motion.p 
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.5, delay: 2 }}
            className="text-center text-sm text-gray-600"
          >
            Already have an account?{' '}
            <Link to="/login" className="font-medium text-primary hover:text-primary-dark">
              Sign In
            </Link>
          </motion.p>
        </motion.div>
      </motion.div>
      </div>

      {/* Terms Modal */}
      <AnimatePresence>
        {showTermsModal && (
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[99999] bg-black/50 flex items-center justify-center px-3"
            onClick={() => setShowTermsModal(false)}
          >
            <m.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white max-w-xl w-full p-8 rounded-xl shadow-xl relative"
              onClick={e => e.stopPropagation()}
            >
              <button className="absolute top-3 right-3 text-gray-500 hover:text-primary font-bold text-lg" onClick={() => setShowTermsModal(false)}>&times;</button>
              <h2 className="text-2xl font-bold mb-4 text-primary">Terms & Conditions</h2>
              <div className="prose max-w-none text-sm text-gray-700 mb-4 overflow-y-auto max-h-[50vh]">
                <p><b>Welcome to LaChart!</b> To use our application, you must accept the following Terms and Privacy Policy. Please read carefully:</p>
                <ol className="list-decimal ml-6">
                  <li><b>Data Storage:</b> Your account and test entries are stored securely. Data is not shared with third parties except as required by law.</li>
                  <li><b>Privacy:</b> See our <a href="/privacy" className="underline text-primary">Privacy Policy</a> for full details.</li>
                  <li><b>Usage:</b> You agree to use the application for lawful purposes. No abusive, fraudulent, or unauthorized activities are allowed.</li>
                  <li><b>Account:</b> Users are responsible for keeping passwords safe. LaChart is not liable for unauthorized access caused by user negligence.</li>
                  <li><b>Analytics:</b> The app collects anonymous usage stats to improve the product.</li>
                  <li><b>Consent:</b> By signing up, you consent to receive transactional emails (activation, password, notifications).</li>
                </ol>
                <p>For more details or concerns, contact us at <a href="mailto:lachart@lachart.net" className="underline text-primary">lachart@lachart.net</a>.</p>
                <p className="text-xs text-gray-400 mt-2">This is a demo EULA. Your real legal text goes here.</p>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  className="px-5 py-2 rounded-lg bg-primary text-white font-semibold hover:bg-primary-dark"
                  onClick={() => { setAcceptedTerms(true); setShowTermsModal(false); }}
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
                <img src="/images/LaChart.png" alt="LaChart Logo" className="h-9 w-11" />
                <span className="text-2xl font-bold text-primary tracking-tight">LaChart</span>
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
            <p className="text-base text-gray-400">
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
                href="mailto:lachart@lachart.net"
                className="text-primary hover:text-primary-dark font-medium"
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