import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthProvider';
import { GoogleLogin } from '@react-oauth/google';
import { useNotification } from '../context/NotificationContext';
import { API_ENDPOINTS } from '../config/api.config';
import { Mail, User, Calendar, Info, UserPlus, UserMinus } from 'lucide-react';
import FitUploadSection from '../components/FitAnalysis/FitUploadSection';
import { getIntegrationStatus, listExternalActivities, uploadFitFile } from '../services/api';

const SettingsPage = () => {
  const { user } = useAuth();
  const { addNotification } = useNotification();
  const [linkedAccounts, setLinkedAccounts] = useState({
    google: false
  });
  const [stravaConnected, setStravaConnected] = useState(false);
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);

  const [formData, setFormData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
    newEmail: '',
    newCoachEmail: ''
  });

  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false
  });

  const [currentCoach, setCurrentCoach] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const togglePasswordVisibility = (field) => {
    setShowPasswords(prev => ({
      ...prev,
      [field]: !prev[field]
    }));
  };

  const fetchCurrentCoach = useCallback(async () => {
    try {
      const response = await fetch(API_ENDPOINTS.COACH_PROFILE, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      if (response.ok) {
        const coachData = await response.json();
        setCurrentCoach(coachData);
      }
    } catch (error) {
      console.error('Error fetching coach:', error);
      addNotification('Failed to load coach data', 'error');
    }
  }, [addNotification]);

  useEffect(() => {
    if (user) {
      setLinkedAccounts({
        google: !!user.googleId
      });
    }
  }, [user]);

  useEffect(() => {
    // Always try to fetch on mount; backend returns 404 if none
    fetchCurrentCoach();
    if (!user?.coachId) {
      setCurrentCoach(null);
    }
  }, [user?.coachId, fetchCurrentCoach]);

  // Refresh coach data when window regains focus (e.g., after accepting invitation in another tab)
  useEffect(() => {
    const handleFocus = () => {
      fetchCurrentCoach();
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [fetchCurrentCoach]);

  // Load integration status for admin
  useEffect(() => {
    const checkIntegrationStatus = async () => {
      if (user?.admin) {
        try {
          const status = await getIntegrationStatus();
          setStravaConnected(Boolean(status.stravaConnected));
        } catch (e) {
          // ignore if not logged
        }
      }
    };
    checkIntegrationStatus();
  }, [user?.admin]);

  const handleFileSelect = (e) => {
    const selectedFiles = Array.from(e.target.files);
    setFiles(selectedFiles);
  };

  const handleUpload = async () => {
    if (files.length === 0) return;

    try {
      setUploading(true);
      for (const file of files) {
        await uploadFitFile(file);
      }
      setFiles([]);
      addNotification('Trainings uploaded successfully!', 'success');
    } catch (error) {
      console.error('Upload error:', error);
      addNotification('Error uploading file: ' + (error.response?.data?.message || error.message), 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleSyncComplete = async () => {
    try {
      await listExternalActivities();
    } catch (e) {
      // ignore
    }
  };

  const handleRemoveCoach = async () => {
    if (!window.confirm('Are you sure you want to remove your coach?')) {
      return;
    }

    try {
      setIsLoading(true);
      const response = await fetch(API_ENDPOINTS.REMOVE_COACH, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (response.ok) {
        setCurrentCoach(null);
        addNotification('Coach successfully removed', 'success');
      } else {
        const data = await response.json();
        addNotification(data.error || 'Failed to remove coach', 'error');
      }
    } catch (error) {
      console.error('Error removing coach:', error);
      addNotification('Failed to remove coach', 'error');
    } finally {
      setIsLoading(false);
    }
  };

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
    
    // Validate passwords match
    if (formData.newPassword !== formData.confirmPassword) {
      addNotification('New passwords do not match', 'error');
      return;
    }

    // Validate password length
    if (formData.newPassword.length < 6) {
      addNotification('New password must be at least 6 characters long', 'error');
      return;
    }

    try {
      const response = await fetch(API_ENDPOINTS.CHANGE_PASSWORD, {
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

      const data = await response.json();

      if (response.ok) {
        addNotification('Password changed successfully', 'success');
        setFormData(prev => ({ ...prev, currentPassword: '', newPassword: '', confirmPassword: '' }));
      } else {
        addNotification(data.error || 'Failed to change password', 'error');
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
    setIsLoading(true);
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('No authentication token found');
      }

      console.log('Sending coach invitation with token:', token); // Debug log

      const response = await fetch(`${API_ENDPOINTS.AUTH}/athlete/invite-coach`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          email: formData.newCoachEmail
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Server response:', errorData); // Debug log
        throw new Error(errorData.error || 'Failed to invite coach');
      }

      await response.json();
      addNotification('Coach invitation sent successfully', 'success');
      setFormData(prev => ({ ...prev, newCoachEmail: '' }));
      // In case the backend immediately assigns a coach, refresh coach data
      fetchCurrentCoach();
    } catch (error) {
      console.error('Error inviting coach:', error);
      addNotification(error.message || 'Failed to invite coach', 'error');
    } finally {
      setIsLoading(false);
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
                  <div className="relative">
                    <label className="block text-sm font-medium text-gray-700">Current Password</label>
                    <input
                      type={showPasswords.current ? "text" : "password"}
                      value={formData.currentPassword}
                      onChange={(e) => setFormData(prev => ({ ...prev, currentPassword: e.target.value }))}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring-primary pr-10"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => togglePasswordVisibility('current')}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center mt-6"
                    >
                      <img
                        src={showPasswords.current ? "/icon/eye-on.svg" : "/icon/eye-off.svg"}
                        alt={showPasswords.current ? "Hide password" : "Show password"}
                        className="h-5 w-5 text-gray-400"
                      />
                    </button>
                  </div>
                  <div className="relative">
                    <label className="block text-sm font-medium text-gray-700">New Password</label>
                    <input
                      type={showPasswords.new ? "text" : "password"}
                      value={formData.newPassword}
                      onChange={(e) => setFormData(prev => ({ ...prev, newPassword: e.target.value }))}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring-primary pr-10"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => togglePasswordVisibility('new')}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center mt-6"
                    >
                      <img
                        src={showPasswords.new ? "/icon/eye-on.svg" : "/icon/eye-off.svg"}
                        alt={showPasswords.new ? "Hide password" : "Show password"}
                        className="h-5 w-5 text-gray-400"
                      />
                    </button>
                  </div>
                  <div className="relative">
                    <label className="block text-sm font-medium text-gray-700">Confirm New Password</label>
                    <input
                      type={showPasswords.confirm ? "text" : "password"}
                      value={formData.confirmPassword}
                      onChange={(e) => setFormData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring-primary pr-10"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => togglePasswordVisibility('confirm')}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center mt-6"
                    >
                      <img
                        src={showPasswords.confirm ? "/icon/eye-on.svg" : "/icon/eye-off.svg"}
                        alt={showPasswords.confirm ? "Hide password" : "Show password"}
                        className="h-5 w-5 text-gray-400"
                      />
                    </button>
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
                <h3 className="text-lg font-medium text-gray-900 mb-4">Coach Management</h3>
                
                {currentCoach ? (
                  <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                    <h4 className="font-medium text-gray-900 mb-2">Current Coach</h4>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-gray-600">{currentCoach.name} {currentCoach.surname}</p>
                        <p className="text-sm text-gray-500">{currentCoach.email}</p>
                      </div>
                      <button
                        onClick={handleRemoveCoach}
                        disabled={isLoading}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-600 hover:text-red-700 focus:outline-none"
                      >
                        <UserMinus className="h-5 w-5" />
                        Remove Coach
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-gray-600 mb-4">You currently don't have an assigned coach.</p>
                )}

                <form onSubmit={handleCoachChange} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">New Coach Email</label>
                    <div className="mt-1 flex rounded-md shadow-sm">
                      <input
                        type="email"
                        value={formData.newCoachEmail}
                        onChange={(e) => setFormData(prev => ({ ...prev, newCoachEmail: e.target.value }))}
                        className="flex-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring-primary"
                        placeholder="coach@email.com"
                        required
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
                  >
                    <UserPlus className="h-5 w-5" />
                    {isLoading ? 'Sending...' : 'Invite New Coach'}
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

          {/* Integrations Section - Only for Admin */}
          {user?.admin && (
            <div className="bg-white shadow rounded-lg p-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">Integrations & Sync</h2>
              <FitUploadSection
                files={files}
                uploading={uploading}
                stravaConnected={stravaConnected}
                onFileSelect={handleFileSelect}
                onUpload={handleUpload}
                onSyncComplete={handleSyncComplete}
              />
            </div>
          )}

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
                <span className="text-gray-600">© 2025 LaChart. All rights reserved.</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;