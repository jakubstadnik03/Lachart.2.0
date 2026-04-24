import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';

const CompleteRegistrationPage = () => {
  const { token } = useParams();
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [formData, setFormData] = useState({
    password: '',
    confirmPassword: '',
  });
  // tokenError = fatal (link expired/invalid) → replaces the form
  // formError  = inline (wrong passwords, API error) → shown inside the form
  const [tokenError, setTokenError] = useState(null);
  const [formError, setFormError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const verifyToken = async () => {
      try {
        await api.get(`/user/verify-registration-token/${token}`);
        setLoading(false);
      } catch {
        setTokenError('This registration link is invalid or has expired.');
        setLoading(false);
      }
    };

    verifyToken();
  }, [token]);

  const handleChange = (field) => (e) => {
    setFormData((prev) => ({ ...prev, [field]: e.target.value }));
    // Clear inline error as soon as the user starts typing
    if (formError) setFormError(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError(null);

    if (formData.password !== formData.confirmPassword) {
      setFormError("Passwords do not match");
      return;
    }
    if (formData.password.length < 8) {
      setFormError("Password must be at least 8 characters");
      return;
    }

    setIsSubmitting(true);
    try {
      await api.post(`/user/complete-registration/${token}`, {
        password: formData.password
      });
      navigate('/login', {
        state: {
          message: 'Registration completed successfully. You can now log in.'
        }
      });
    } catch (err) {
      setFormError(err.response?.data?.message || 'Error completing registration. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#EEF2FF]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (tokenError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#EEF2FF]">
        <div className="text-center max-w-sm px-6">
          <div className="text-red-600 text-lg font-medium mb-3">{tokenError}</div>
          <p className="text-sm text-gray-500 mb-5">Ask your coach to resend the registration email.</p>
          <a href="/login" className="text-primary hover:text-primary-dark text-sm font-medium">
            Go to login →
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-[#EEF2FF]">
      {/* Left side - Background */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-r from-[#EEF2FF] via-[#E5E9FF] to-transparent">
        {/* You can add an image or graphics here */}
      </div>

      {/* Right side - Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center px-8">
        <div className="max-w-md w-full space-y-8">
          <div>
            <div className='mx-auto flex items-center gap-2 justify-center'>
            <img
                className="h-12 w-auto"
              src="/images/LaChart.png"
              alt="LaChart Logo"
            />
              <h1 className='text-2xl font-bold text-primary'>LaChart</h1>
            </div>
            <h2 className="mt-6 text-center text-3xl font-bold text-gray-900">
              Complete Registration
            </h2>
            <p className="mt-2 text-center text-sm text-gray-600">
              Set your password to complete registration
            </p>
          </div>

          <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
            <div className="rounded-md shadow-sm -space-y-px">
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  required
                  className="appearance-none rounded-lg relative block w-full pl-10 pr-10 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-primary focus:border-primary"
                  placeholder="Password"
                  value={formData.password}
                  onChange={handleChange('password')}
                />
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400">
                  <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                  </svg>
                </span>
                <button
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
                </button>
              </div>

              <div className="relative">
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  required
                  className="appearance-none rounded-lg relative block w-full pl-10 pr-10 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-primary focus:border-primary"
                  placeholder="Confirm password"
                  value={formData.confirmPassword}
                  onChange={handleChange('confirmPassword')}
                />
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400">
                  <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                  </svg>
                </span>
                <button
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
                </button>
              </div>
            </div>

            <p className="text-xs text-gray-500">
              Password must be at least 8 characters long
            </p>

            {formError && (
              <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                {formError}
              </div>
            )}

            <div>
              <button
                type="submit"
                disabled={isSubmitting}
                className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-primary hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isSubmitting ? 'Setting password…' : 'Complete Registration'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default CompleteRegistrationPage; 