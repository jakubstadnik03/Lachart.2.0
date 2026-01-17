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
import TrainingZonesModal from '../components/Profile/TrainingZonesModal';
import StravaConnectModal from '../components/Onboarding/StravaConnectModal';

const LoginPage = () => {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    rememberMe: false
  });
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showBasicProfileModal, setShowBasicProfileModal] = useState(false);
  const [showTrainingZonesModal, setShowTrainingZonesModal] = useState(false);
  const [showStravaModal, setShowStravaModal] = useState(false);
  const [loggedInUser, setLoggedInUser] = useState(null);
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { addNotification } = useNotification();

  // Získáme původní cíl navigace, pokud existuje
  const from = location.state?.from?.pathname || "/dashboard";

  // Check for invitation token in URL
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
    if (isAuthenticated && !showBasicProfileModal && !showTrainingZonesModal && !showStravaModal) {
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
  }, [isAuthenticated, navigate, from, showBasicProfileModal, showTrainingZonesModal, showStravaModal]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isLoading) return; // Prevent multiple submissions

    setIsLoading(true);
    addNotification("Attempting to log in...", "info");

    try {
      console.log("Sending login request to:", API_ENDPOINTS.AUTH + "/login");
      console.log("Login data:", { email: formData.email, password: "***" });

      const result = await api.post(API_ENDPOINTS.AUTH + "/login", {
        email: formData.email,
        password: formData.password
      });
      
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
            
            if (isBasicProfileIncomplete) {
              // Store user for modal
              setLoggedInUser(user);
              // Show basic profile modal first
              setTimeout(() => {
                setShowBasicProfileModal(true);
              }, 3000); // 3 seconds delay
            } else if (hasNoTrainingZones) {
              // Store user for modal
              setLoggedInUser(user);
              // Show training zones modal
              setTimeout(() => {
                setShowTrainingZonesModal(true);
              }, 3000); // 3 seconds delay
            } else if (!user.strava?.athleteId) {
              // Store user for modal
              setLoggedInUser(user);
              // Show Strava connect modal
              setTimeout(() => {
                setShowStravaModal(true);
              }, 3000); // 3 seconds delay
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
      
      if (error.response) {
        console.log("Error response:", error.response);
        if (error.response.status === 429) {
          errorMessage = "Too many login attempts. Please wait a few minutes before trying again.";
        } else {
          errorMessage = error.response.data.message || "Login failed";
        }
      } else if (error.request) {
        console.log("No response received:", error.request);
        errorMessage = "No response from server. Please check your internet connection.";
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
            
            if (isBasicProfileIncomplete) {
              // Store user for modal
              setLoggedInUser(user);
              // Show basic profile modal first
              setTimeout(() => {
                setShowBasicProfileModal(true);
              }, 3000); // 3 seconds delay
            } else if (hasNoTrainingZones) {
              // Store user for modal
              setLoggedInUser(user);
              // Show training zones modal
              setTimeout(() => {
                setShowTrainingZonesModal(true);
              }, 3000); // 3 seconds delay
            } else if (!user.strava?.athleteId) {
              // Store user for modal
              setLoggedInUser(user);
              // Show Strava connect modal
              setTimeout(() => {
                setShowStravaModal(true);
              }, 3000); // 3 seconds delay
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
          addNotification("Error during login process", "error");
        }
      }
    } catch (error) {
      console.error("Google login error:", error);
      let errorMessage = "Google login failed";
      
      if (error.response) {
        console.log("Error response:", error.response);
        errorMessage = error.response.data.message || "Google login failed";
      } else if (error.request) {
        console.log("No response received:", error.request);
        errorMessage = "No response from server. Please check your internet connection.";
      } else {
        console.log("Error setting up request:", error.message);
        errorMessage = "Error setting up Google login request.";
      }
      
      addNotification(errorMessage, "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleError = () => {
    console.error("Google login error occurred");
    addNotification("Google login failed", "error");
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="min-h-screen flex flex-col bg-gradient-to-br from-[#EEF2FF] via-[#E5E9FF] to-[#D6DCFF] pt-safe-top"
    >
      <div className="flex flex-1 min-h-0" style={{ minHeight: '100vh' }}>
        {/* Left side - Background with Image and SEO Content */}
        <motion.div 
          initial={{ x: -100, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="hidden lg:flex lg:w-1/2 overflow-hidden relative"
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
        className="w-full lg:w-1/2 flex items-center justify-center px-8 overflow-hidden"
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
                  required
                  disabled={isLoading}
                  className="appearance-none rounded-lg relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-primary focus:border-primary disabled:bg-gray-100 disabled:cursor-not-allowed"
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
                  required
                  disabled={isLoading}
                  className="appearance-none rounded-lg relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-primary focus:border-primary disabled:bg-gray-100 disabled:cursor-not-allowed"
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
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed relative"
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

              <div className="mt-6 flex justify-center">
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
              </div>
            </motion.div>
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
            setShowBasicProfileModal(false);
            // After closing basic profile, check if training zones are missing
            const hasNoZones = !loggedInUser.powerZones?.cycling?.lt1 && !loggedInUser.powerZones?.running?.lt1 && !loggedInUser.powerZones?.swimming?.lt1;
            if (hasNoZones) {
              setShowTrainingZonesModal(true);
            } else if (!loggedInUser.strava?.athleteId) {
              setShowStravaModal(true);
            }
          }}
          onSubmit={async (formData) => {
            try {
              const response = await api.put('/user/edit-profile', formData);
              if (response.data) {
                // Update user in state
                setLoggedInUser(response.data);
                // Dispatch user update event to update global state
                window.dispatchEvent(new CustomEvent('userUpdated', { detail: response.data }));
                // Close basic profile modal and show training zones modal if missing
                setShowBasicProfileModal(false);
                const hasNoZones = !response.data.powerZones?.cycling?.lt1 && !response.data.powerZones?.running?.lt1 && !response.data.powerZones?.swimming?.lt1;
                if (hasNoZones) {
                  setShowTrainingZonesModal(true);
                } else if (!response.data.strava?.athleteId) {
                  setShowStravaModal(true);
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

      {/* Training Zones Modal - second step */}
      {loggedInUser && (
        <TrainingZonesModal
          isOpen={showTrainingZonesModal}
          onClose={() => {
            setShowTrainingZonesModal(false);
            // After closing training zones, check if Strava is not connected
            if (!loggedInUser.strava?.athleteId) {
              setShowStravaModal(true);
            }
          }}
          onSubmit={async (formData) => {
            try {
              const response = await api.put('/user/edit-profile', formData);
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

export default LoginPage;
