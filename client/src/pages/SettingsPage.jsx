import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthProvider';
import { GoogleLogin } from '@react-oauth/google';
import { useNotification } from '../context/NotificationContext';
import { API_ENDPOINTS } from '../config/api.config';
import { Lock, Mail, User, Phone, MapPin, Calendar, Info } from 'lucide-react';

const SettingsPage = () => {
  const { user } = useAuth();
  const { addNotification } = useNotification();
  const [linkedAccounts, setLinkedAccounts] = useState({
    google: false
  });

  const [formData, setFormData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
    newEmail: '',
    newCoachEmail: ''
  });

  useEffect(() => {
    if (user) {
      setLinkedAccounts({
        google: !!user.googleId
      });
    }
  }, [user]);

  const handleGoogleSuccess = async (response) => {
    try {
      // First, authenticate with Google
      const authResult = await fetch(`${API_ENDPOINTS.AUTH}/google-auth`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          credential: response.credential
        }),
      });

      if (!authResult.ok) {
        throw new Error('Google authentication failed');
      }

      const authData = await authResult.json();
      
      // Then link the account
      const linkResult = await fetch(`${API_ENDPOINTS.AUTH}/link-social`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          provider: 'google',
          providerId: response.credential
        }),
      });

      if (linkResult.ok) {
        // Update the stored user data with the new Google ID
        const currentUser = JSON.parse(localStorage.getItem('user'));
        const updatedUser = { ...currentUser, googleId: response.credential };
        localStorage.setItem('user', JSON.stringify(updatedUser));
        
        setLinkedAccounts(prev => ({ ...prev, google: true }));
        addNotification('Google account linked successfully', 'success');
      } else {
        const errorData = await linkResult.json();
        addNotification(errorData.message || 'Failed to link Google account', 'error');
      }
    } catch (error) {
      console.error('Link Google error:', error);
      addNotification('Failed to link Google account', 'error');
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    if (formData.newPassword !== formData.confirmPassword) {
      addNotification('New passwords do not match', 'error');
      return;
    }

    try {
      const response = await fetch(`${API_ENDPOINTS.AUTH}/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          currentPassword: formData.currentPassword,
          newPassword: formData.newPassword
        }),
      });

      if (response.ok) {
        addNotification('Password changed successfully', 'success');
        setFormData(prev => ({ ...prev, currentPassword: '', newPassword: '', confirmPassword: '' }));
      } else {
        addNotification('Failed to change password', 'error');
      }
    } catch (error) {
      console.error('Password change error:', error);
      addNotification('Failed to change password', 'error');
    }
  };

  const handleEmailChange = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch(`${API_ENDPOINTS.AUTH}/change-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          newEmail: formData.newEmail
        }),
      });

      if (response.ok) {
        addNotification('Email change request sent successfully', 'success');
        setFormData(prev => ({ ...prev, newEmail: '' }));
      } else {
        addNotification('Failed to change email', 'error');
      }
    } catch (error) {
      console.error('Email change error:', error);
      addNotification('Failed to change email', 'error');
    }
  };

  const handleCoachChange = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch(`${API_ENDPOINTS.AUTH}/change-coach`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          newCoachEmail: formData.newCoachEmail
        }),
      });

      if (response.ok) {
        addNotification('Coach change request sent successfully', 'success');
        setFormData(prev => ({ ...prev, newCoachEmail: '' }));
      } else {
        addNotification('Failed to change coach', 'error');
      }
    } catch (error) {
      console.error('Coach change error:', error);
      addNotification('Failed to change coach', 'error');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="space-y-8">
          {/* Account Settings Section */}
          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Account Settings</h2>
            
            <div className="space-y-6">
              {/* Password Change */}
              <div className="border-b pb-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Change Password</h3>
                <form onSubmit={handlePasswordChange} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Current Password</label>
                    <input
                      type="password"
                      value={formData.currentPassword}
                      onChange={(e) => setFormData(prev => ({ ...prev, currentPassword: e.target.value }))}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring-primary"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">New Password</label>
                    <input
                      type="password"
                      value={formData.newPassword}
                      onChange={(e) => setFormData(prev => ({ ...prev, newPassword: e.target.value }))}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring-primary"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Confirm New Password</label>
                    <input
                      type="password"
                      value={formData.confirmPassword}
                      onChange={(e) => setFormData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring-primary"
                      required
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
                  >
                    Change Password
                  </button>
                </form>
              </div>

              {/* Email Change */}
              <div className="border-b pb-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Change Email</h3>
                <form onSubmit={handleEmailChange} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">New Email</label>
                    <input
                      type="email"
                      value={formData.newEmail}
                      onChange={(e) => setFormData(prev => ({ ...prev, newEmail: e.target.value }))}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring-primary"
                      required
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
                  >
                    Change Email
                  </button>
                </form>
              </div>

              {/* Coach Change */}
              <div className="border-b pb-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Change Coach</h3>
                <form onSubmit={handleCoachChange} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">New Coach Email</label>
                    <input
                      type="email"
                      value={formData.newCoachEmail}
                      onChange={(e) => setFormData(prev => ({ ...prev, newCoachEmail: e.target.value }))}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring-primary"
                      required
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
                  >
                    Request Coach Change
                  </button>
                </form>
              </div>

              {/* Social Account Linking */}
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">Linked Social Accounts</h3>
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <img src="/icon/google.svg" alt="Google" className="h-6 w-6 mr-2" />
                    <span>Google</span>
                  </div>
                  {linkedAccounts.google ? (
                    <span className="text-green-500">Connected</span>
                  ) : (
                    <GoogleLogin
                      onSuccess={handleGoogleSuccess}
                      onError={() => addNotification('Google authentication failed', 'error')}
                      useOneTap={false}
                      width="200"
                      theme="outline"
                      size="large"
                      text="signin_with"
                      shape="rectangular"
                    />
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Contact Information Section */}
          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Contact Information</h2>
            <div className="space-y-4">
              <div className="flex items-center">
                <User className="h-5 w-5 text-gray-400 mr-3" />
                <span className="text-gray-600">Jakub Stádník</span>
              </div>
              <div className="flex items-center">
                <Mail className="h-5 w-5 text-gray-400 mr-3" />
                <a href="mailto:jakub.stadnik01@gmail.com" className="text-primary hover:text-primary-dark">
                  jakub.stadnik01@gmail.com
                </a>
              </div>
              <div className="flex items-center">
                <Info className="h-5 w-5 text-gray-400 mr-3" />
                <span className="text-gray-600">Developer & Support</span>
              </div>
            </div>
          </div>

          {/* App Information Section */}
          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">About LaChart</h2>
            <div className="space-y-4">
              <div className="flex items-center">
                <Info className="h-5 w-5 text-gray-400 mr-3" />
                <span className="text-gray-600">Version 2.0</span>
              </div>
              <div className="flex items-center">
                <Calendar className="h-5 w-5 text-gray-400 mr-3" />
                <span className="text-gray-600">© 2024 LaChart. All rights reserved.</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;