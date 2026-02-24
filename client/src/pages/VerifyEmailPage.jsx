import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../services/api';

const VerifyEmailPage = () => {
  const { token } = useParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState('verifying'); // 'verifying', 'success', 'error', 'already-verified'
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const verifyEmail = async () => {
      try {
        const response = await api.get(`/user/verify-email/${token}`);
        setStatus('success');
        setMessage(response.data.message || 'Email successfully verified!');
        setLoading(false);
        
        // Redirect to login after 3 seconds
        setTimeout(() => {
          navigate('/login', { 
            state: { 
              message: 'Email verified successfully. You can now log in.' 
            }
          });
        }, 3000);
      } catch (error) {
        setLoading(false);
        const errorData = error.response?.data;
        
        if (errorData?.error === 'Email already verified') {
          setStatus('already-verified');
          setMessage('This email address has already been verified.');
        } else {
          setStatus('error');
          setMessage(errorData?.message || errorData?.error || 'Invalid or expired verification link.');
        }
      }
    };

    if (token) {
      verifyEmail();
    } else {
      setStatus('error');
      setMessage('Invalid verification link.');
      setLoading(false);
    }
  }, [token, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#EEF2FF]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-gray-600">Verifying your email...</p>
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

      {/* Right side - Content */}
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
              {status === 'success' && 'Email Verified!'}
              {status === 'already-verified' && 'Already Verified'}
              {status === 'error' && 'Verification Failed'}
            </h2>
          </div>

          <div className="text-center">
            {status === 'success' && (
              <div className="space-y-4">
                <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-green-100">
                  <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-gray-600">{message}</p>
                <p className="text-sm text-gray-500">Redirecting to login page...</p>
                <Link
                  to="/login"
                  className="inline-block mt-4 text-primary hover:text-primary-dark font-medium"
                >
                  Go to login now →
                </Link>
              </div>
            )}

            {status === 'already-verified' && (
              <div className="space-y-4">
                <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-blue-100">
                  <svg className="h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <p className="text-gray-600">{message}</p>
                <Link
                  to="/login"
                  className="inline-block mt-4 px-6 py-2 bg-primary text-white rounded-md hover:bg-primary-dark transition-colors"
                >
                  Go to Login
                </Link>
              </div>
            )}

            {status === 'error' && (
              <div className="space-y-4">
                <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-red-100">
                  <svg className="h-8 w-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </div>
                <p className="text-gray-600">{message}</p>
                <div className="space-y-2">
                  <Link
                    to="/login"
                    className="inline-block w-full px-6 py-2 bg-primary text-white rounded-md hover:bg-primary-dark transition-colors text-center"
                  >
                    Go to Login
                  </Link>
                  <p className="text-sm text-gray-500">
                    Need a new verification email?{' '}
                    <Link to="/resend-verification" className="text-primary hover:text-primary-dark font-medium">
                      Request one here
                    </Link>
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default VerifyEmailPage;
