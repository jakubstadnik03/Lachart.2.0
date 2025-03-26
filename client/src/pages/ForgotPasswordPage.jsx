import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { API_BASE_URL } from '../config/api.config';

const ForgotPasswordPage = () => {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState({ type: '', message: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setStatus({ type: '', message: '' });

    try {
      const response = await axios.post(`${API_BASE_URL}/user/forgot-password`, 
        { email },
        {
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );
      
      console.log('Response:', response.data);
      setShowConfirmation(true);
      setEmail('');
    } catch (error) {
      console.error('Error details:', error.response?.data || error.message);
      setStatus({
        type: 'error',
        message: error.response?.data?.error || 'There was an error processing your request. Please try again.'
      });
      setShowConfirmation(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResend = async () => {
    setIsSubmitting(true);
    try {
      const response = await axios.post(`${API_BASE_URL}/user/forgot-password`, 
        { email },
        {
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );
      
      setStatus({
        type: 'success',
        message: 'Reset instructions have been resent to your email.'
      });
    } catch (error) {
      console.error('Resend error:', error.response?.data || error.message);
      setStatus({
        type: 'error',
        message: error.response?.data?.error || 'Failed to resend. Please try again.'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left side - Background with pink gradient */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-r from-pink-50 via-pink-100 to-transparent">
      </div>

      {/* Right side - Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center px-8">
        <div className="max-w-md w-full space-y-8">
          {!showConfirmation ? (
            <>
              <div>
                <h2 className="text-center text-3xl font-bold text-gray-900">
                  Forgot Password
                </h2>
                <p className="mt-2 text-center text-sm text-gray-600">
                  Enter the email address associated with your account and we will send you a link to reset your password.
                </p>
              </div>

              <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
                {status.message && (
                  <div className={`p-4 rounded-md ${
                    status.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
                  }`}>
                    {status.message}
                  </div>
                )}

                <div>
                  <div className="relative">
                    <input
                      id="email"
                      name="email"
                      type="email"
                      required
                      className="appearance-none rounded-lg relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-blue-500 focus:border-blue-500 pl-10"
                      placeholder="Enter email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400">
                      <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                        <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
                      </svg>
                    </span>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  Continue
                </button>
              </form>
            </>
          ) : (
            // Confirmation Modal
            <div className="text-center">
              <div className="mx-auto flex items-center justify-center h-24 w-24 rounded-full bg-blue-100 mb-8">
                <svg className="h-12 w-12 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold mb-4">Verify your Email</h2>
              <p className="text-gray-600 mb-8">
                Thank you, check your email for instructions to reset your password
              </p>
              <button
                onClick={() => setShowConfirmation(false)}
                className="w-full mb-4 py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
              >
                Skip
              </button>
              <p className="text-sm text-gray-600">
                Don't receive an email?{' '}
                <button
                  onClick={handleResend}
                  className="text-blue-600 hover:text-blue-500 font-medium"
                >
                  Resend
                </button>
              </p>
            </div>
          )}

          <div className="text-center">
            <Link
              to="/login"
              className="font-medium text-blue-600 hover:text-blue-500"
            >
              Back to Sign In
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ForgotPasswordPage; 