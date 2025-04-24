import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { register } from '../services/api';
import { GoogleLogin } from '@react-oauth/google';
import { useNotification } from '../context/NotificationContext';
import { API_ENDPOINTS } from '../config/api.config';
import { motion } from 'framer-motion';

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
  const { addNotification } = useNotification();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (formData.password !== formData.confirmPassword) {
      setError("Passwords don't match");
      return;
    }
    try {
      await register(formData);
      navigate('/login');
    } catch (error) {
      setError(error.response?.data?.message || 'Registration failed');
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
        localStorage.setItem('token', data.token);
        navigate('/dashboard');
      } else {
        addNotification('Google authentication failed', 'error');
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
                  id="role"
                  name="role"
                  type="radio"
                  value="athlete"
                  checked={formData.role === 'athlete'}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  className="h-4 w-4 text-violet-600 focus:ring-violet-500 border-gray-300 rounded"
                />
                <label htmlFor="role" className="ml-2 block text-sm text-gray-900">
                  Athlete
                </label>
              </div>
      
              <div className="flex items-center">
                <input
                  id="role"
                  name="role"
                  type="radio"
                  value="coach"
                  checked={formData.role === 'coach'}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  className="h-4 w-4 text-violet-600 focus:ring-violet-500 border-gray-300 rounded"
                />
                <label htmlFor="role" className="ml-2 block text-sm text-gray-900">
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

            <motion.div
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <button
                type="submit"
                className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-primary hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-violet-500"
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
    </motion.div>
  );
};

export default SignUpPage; 