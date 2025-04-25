// src/pages/LoginPage.js
import React, { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthProvider';
import { motion } from 'framer-motion';
import { useNotification } from '../context/NotificationContext';
import { GoogleLogin } from '@react-oauth/google';
import api from '../services/api';
import { API_ENDPOINTS } from '../config/api.config';

const LoginPage = () => {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    rememberMe: false
  });
  const [showPassword, setShowPassword] = useState(false);
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { addNotification } = useNotification();

  // Získáme původní cíl navigace, pokud existuje
  const from = location.state?.from?.pathname || "/dashboard";

  useEffect(() => {
    if (isAuthenticated) {
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, navigate, from]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const result = await api.post(API_ENDPOINTS.AUTH + "/login", {
        email: formData.email,
        password: formData.password
      });
      
      if (result.data.token) {
        console.log("Login successful, token received:", result.data.token);
        console.log("User data:", result.data.user);
        
        // Uložení tokenu a uživatelských dat do localStorage
        localStorage.setItem("token", result.data.token);
        localStorage.setItem("user", JSON.stringify(result.data.user));
        
        // Nastavení autorizační hlavičky pro API
        api.defaults.headers.common["Authorization"] = `Bearer ${result.data.token}`;
        
        login(formData.email, formData.password, result.data.token, result.data.user);
        addNotification("Successfully logged in", "success");
        navigate("/dashboard", { replace: true });
      }
    } catch (error) {
      console.error("Login error:", error);
      addNotification(
        error.response?.data?.message || "Login failed",
        "error"
      );
    }
  };

  const handleGoogleSuccess = async (credentialResponse) => {
    try {
      console.log("Google credential response:", credentialResponse);
      const result = await api.post(`${API_ENDPOINTS.AUTH}/google-auth`, {
        credential: credentialResponse.credential,
      });
      
      if (result.data.token) {
        console.log("Google login successful, token received:", result.data.token);
        console.log("User data:", result.data.user);
        
        login(null, null, result.data.token, result.data.user);
        addNotification("Successfully logged in with Google", "success");
        navigate("/dashboard", { replace: true });
      }
    } catch (error) {
      console.error("Google login error:", error);
      addNotification(
        error.response?.data?.message || "Google login failed",
        "error"
      );
    }
  };

  const handleGoogleError = () => {
    addNotification("Google login failed", "error");
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="min-h-screen flex bg-[#EEF2FF] pt-safe-top pb-safe-bottom overflow-hidden"
    >
      {/* Left side - Background */}
      <motion.div 
        initial={{ x: -100, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.2 }}
        className="hidden lg:flex lg:w-1/2 bg-gradient-to-r from-[#EEF2FF] via-[#E5E9FF] to-transparent overflow-hidden"
      >
        {/* Zde můžete přidat obrázek nebo grafiku */}
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
                  className="appearance-none rounded-lg relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
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
                  className="appearance-none rounded-lg relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                />
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
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
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
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Sign In
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
            <Link to="/signup" className="font-medium text-primary hover:text-primary-dark">
              Sign Up
            </Link>
          </motion.p>
        </motion.div>
      </motion.div>
    </motion.div>
  );
};

export default LoginPage;
