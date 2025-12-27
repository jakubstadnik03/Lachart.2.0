import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthProvider';
import { GoogleLogin } from '@react-oauth/google';
import { useNotification } from '../context/NotificationContext';
import { API_ENDPOINTS, API_BASE_URL } from '../config/api.config';
import { Mail, User, Calendar, Info, UserPlus, UserMinus, Shield, Trash2, Settings, Bell, CreditCard, Link as LinkIcon } from 'lucide-react';
import FitUploadSection from '../components/FitAnalysis/FitUploadSection';
import { getIntegrationStatus, listExternalActivities, uploadFitFile, getStravaAuthUrl, syncStravaActivities, autoSyncStravaActivities, updateAvatarFromStrava } from '../services/api';
import { saveUserToStorage } from '../utils/userStorage';

const SettingsPage = () => {
  const { user, logout } = useAuth();
  const { addNotification } = useNotification();
  const [activeTab, setActiveTab] = useState('profile');
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  
  // Detect mobile
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  const [linkedAccounts, setLinkedAccounts] = useState({
    google: false
  });
  const [stravaConnected, setStravaConnected] = useState(false);
  const [garminConnected, setGarminConnected] = useState(false);
  const [stravaAutoSync, setStravaAutoSync] = useState(false);
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);

  // Settings state
  const [units, setUnits] = useState({
    distance: 'metric', // 'metric' or 'imperial'
    weight: 'kg', // 'kg' or 'lbs'
    temperature: 'celsius' // 'celsius' or 'fahrenheit'
  });

  const [notifications, setNotifications] = useState({
    emailNotifications: true,
    trainingReminders: true,
    weeklyReports: true,
    achievementAlerts: true
  });

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
  const [isDeleting, setIsDeleting] = useState(false);

  const tabs = [
    { id: 'profile', name: 'Profile', icon: User },
    { id: 'units', name: 'Units', icon: Settings },
    { id: 'notifications', name: 'Notifications', icon: Bell },
    { id: 'subscription', name: 'Subscription', icon: CreditCard },
    { id: 'account', name: 'Account', icon: User },
    { id: 'integrations', name: 'Integrations', icon: LinkIcon }
  ];

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
    fetchCurrentCoach();
    if (!user?.coachId) {
      setCurrentCoach(null);
    }
  }, [user?.coachId, fetchCurrentCoach]);

  useEffect(() => {
    const handleFocus = () => {
      fetchCurrentCoach();
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [fetchCurrentCoach]);

  useEffect(() => {
    const checkIntegrationStatus = async () => {
        try {
          const status = await getIntegrationStatus();
          const wasConnected = stravaConnected;
          const isNowConnected = Boolean(status.stravaConnected);
          
          setStravaConnected(isNowConnected);
          setGarminConnected(Boolean(status.garminConnected));
          
          // If Strava connection status changed (from not connected to connected), reload user profile
          if (!wasConnected && isNowConnected && user) {
            try {
              console.log('Strava connection status changed, reloading user profile...');
              const profileResponse = await fetch(`${API_BASE_URL}/user/profile`, {
                headers: {
                  'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
              });
              if (profileResponse.ok) {
                const updatedUser = await profileResponse.json();
                console.log('Reloaded user profile after Strava connection change:', {
                  hasStrava: !!updatedUser.strava,
                  autoSync: updatedUser.strava?.autoSync
                });
                saveUserToStorage(updatedUser);
                window.dispatchEvent(new CustomEvent('userUpdated', { detail: updatedUser }));
              }
            } catch (e) {
              console.error('Error reloading user profile after Strava connection:', e);
            }
          }
        } catch (e) {
          // ignore if not logged
      }
    };
    checkIntegrationStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);
  
  // Check for Strava callback in URL and reload user profile
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const isStravaConnected = urlParams.get('strava') === 'connected' || 
                               hashParams.get('strava') === 'connected' ||
                               window.location.search.includes('strava=connected');
    
    if (isStravaConnected) {
      // Reload user profile after Strava connection
      const reloadUserProfile = async () => {
        try {
          console.log('Strava connection detected, reloading user profile...');
          
          // Wait a bit for backend to process
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          const profileResponse = await fetch(`${API_BASE_URL}/user/profile`, {
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
          });
          
          if (profileResponse.ok) {
            const updatedUser = await profileResponse.json();
            console.log('Reloaded user profile after Strava connection:', {
              hasStrava: !!updatedUser.strava,
              autoSync: updatedUser.strava?.autoSync,
              athleteId: updatedUser.strava?.athleteId
            });
            
            saveUserToStorage(updatedUser);
            window.dispatchEvent(new CustomEvent('userUpdated', { detail: updatedUser }));
            
            // Update integration status
            try {
              const status = await getIntegrationStatus();
              setStravaConnected(Boolean(status.stravaConnected));
              console.log('Integration status updated:', status.stravaConnected);
            } catch (e) {
              console.error('Error checking integration status:', e);
            }
            
            // Clean up URL
            const cleanPath = window.location.pathname;
            window.history.replaceState({}, document.title, cleanPath);
            
            addNotification('Strava account connected successfully', 'success');
          } else {
            console.error('Failed to reload user profile:', profileResponse.status);
          }
        } catch (e) {
          console.error('Error reloading user profile after Strava callback:', e);
        }
      };
      reloadUserProfile();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load Strava auto-sync setting from user profile
  useEffect(() => {
    // Load from user profile if available
    if (user?.strava) {
      // Check if autoSync is explicitly set (can be false, true, or undefined)
      if (user.strava.autoSync !== undefined) {
        console.log('Loading autoSync from user profile:', user.strava.autoSync);
        setStravaAutoSync(user.strava.autoSync);
      } else {
        // If strava is connected but autoSync is undefined, default to false
        console.log('Strava connected but autoSync undefined, defaulting to false');
        setStravaAutoSync(false);
      }
    } else {
      // If strava is not connected, default to false
      setStravaAutoSync(false);
    }
  }, [user?.strava?.autoSync, user?.strava]);
  
  // Listen for user updates from AuthProvider
  useEffect(() => {
    const handleUserUpdate = (event) => {
      const updatedUser = event.detail;
      if (updatedUser?.strava) {
        console.log('User updated event received, autoSync:', updatedUser.strava.autoSync);
        if (updatedUser.strava.autoSync !== undefined) {
          setStravaAutoSync(updatedUser.strava.autoSync);
        }
        setStravaConnected(true);
      } else if (updatedUser && !updatedUser.strava) {
        setStravaConnected(false);
        setStravaAutoSync(false);
      }
    };
    
    window.addEventListener('userUpdated', handleUserUpdate);
    return () => window.removeEventListener('userUpdated', handleUserUpdate);
  }, []);

  // Load settings from user profile or localStorage (fallback)
  useEffect(() => {
    // Load units from user profile first
    if (user?.units) {
      setUnits(user.units);
    } else {
      // Fallback to localStorage for backward compatibility
      const savedUnits = localStorage.getItem('userUnits');
      if (savedUnits) {
        try {
          const parsed = JSON.parse(savedUnits);
          setUnits(parsed);
          // Also save to backend if user is logged in
          if (user?._id) {
            saveUnitsToBackend(parsed);
          }
        } catch (e) {
          console.error('Error loading units:', e);
        }
      }
    }
    
    // Notifications still use localStorage
    const savedNotifications = localStorage.getItem('userNotifications');
    if (savedNotifications) {
      try {
        setNotifications(JSON.parse(savedNotifications));
      } catch (e) {
        console.error('Error loading notifications:', e);
      }
    }
  }, [user?.units, user?._id]);

  // Save units to backend
  const saveUnitsToBackend = async (newUnits) => {
    try {
      const response = await fetch(API_ENDPOINTS.EDIT_PROFILE, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ units: newUnits })
      });

      if (response.ok) {
        const updatedUser = await response.json();
        // Update user in localStorage (using optimized storage)
        saveUserToStorage(updatedUser);
        // Trigger event to update AuthProvider
        window.dispatchEvent(new CustomEvent('userUpdated', { detail: updatedUser }));
      } else {
        throw new Error('Failed to save units');
      }
    } catch (error) {
      console.error('Error saving units to backend:', error);
      throw error;
    }
  };

  // Save settings to backend and localStorage
  const saveUnits = async (newUnits) => {
    try {
      setUnits(newUnits);
      // Save to backend
      await saveUnitsToBackend(newUnits);
      // Also save to localStorage as backup
      localStorage.setItem('userUnits', JSON.stringify(newUnits));
      addNotification('Units saved successfully', 'success');
    } catch (error) {
      console.error('Error saving units:', error);
      addNotification('Failed to save units', 'error');
    }
  };

  const saveNotifications = (newNotifications) => {
    setNotifications(newNotifications);
    localStorage.setItem('userNotifications', JSON.stringify(newNotifications));
    addNotification('Notification preferences saved', 'success');
  };

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

  const handleConnectStrava = async () => {
    try {
      const url = await getStravaAuthUrl();
      window.location.href = url;
    } catch (e) {
      console.error('Strava connect error:', e);
      addNotification('Failed to start Strava connection', 'error');
    }
  };

  const handleSyncStrava = async () => {
    try {
      const res = await syncStravaActivities();
      addNotification(`Strava sync: imported ${res.imported || 0}, updated ${res.updated || 0}`, 'success');
      await handleSyncComplete();
    } catch (e) {
      console.error('Strava sync error:', e);
      addNotification('Failed to sync Strava activities', 'error');
    }
  };

  const handleToggleAutoSync = async (enabled) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/integrations/strava/auto-sync`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ autoSync: enabled })
      });

      if (response.ok) {
        const result = await response.json();
        setStravaAutoSync(enabled);
        addNotification(`Auto-sync ${enabled ? 'enabled' : 'disabled'}`, 'success');
        
        // Update user object in localStorage and AuthProvider
        try {
          const profileResponse = await fetch(`${API_BASE_URL}/user/profile`, {
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
          });
          if (profileResponse.ok) {
            const updatedUser = await profileResponse.json();
            console.log('Updated user profile with autoSync:', updatedUser.strava?.autoSync);
            saveUserToStorage(updatedUser);
            // Trigger a custom event to update AuthProvider
            window.dispatchEvent(new CustomEvent('userUpdated', { detail: updatedUser }));
          } else {
            console.error('Failed to reload user profile:', profileResponse.status);
          }
        } catch (e) {
          console.error('Error reloading user profile:', e);
        }
        
        // If enabling, trigger immediate sync
        if (enabled) {
          try {
            const syncRes = await autoSyncStravaActivities();
            if (syncRes.imported > 0 || syncRes.updated > 0) {
              addNotification(`Auto-sync: ${syncRes.imported || 0} imported, ${syncRes.updated || 0} updated`, 'success');
            }
            await handleSyncComplete();
          } catch (e) {
            // Silent fail for auto-sync
            console.log('Auto-sync failed:', e);
          }
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error('Failed to update auto-sync:', errorData);
        addNotification(errorData.error || 'Failed to update auto-sync setting', 'error');
      }
    } catch (error) {
      console.error('Error updating auto-sync:', error);
      addNotification('Failed to update auto-sync setting', 'error');
    }
  };

  const handleUpdateAvatar = async () => {
    try {
      setIsLoading(true);
      const result = await updateAvatarFromStrava();
      if (result.success) {
        addNotification('Profile picture updated from Strava', 'success');
        // Reload user profile to get updated avatar
        try {
          const profileResponse = await fetch(API_ENDPOINTS.PROFILE, {
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
          });
          if (profileResponse.ok) {
            const updatedUser = await profileResponse.json();
            console.log('Updated user profile with avatar:', updatedUser.avatar);
            // Update localStorage
            saveUserToStorage(updatedUser);
            // Trigger a custom event to update AuthProvider (instead of page reload)
            window.dispatchEvent(new CustomEvent('userUpdated', { detail: updatedUser }));
          } else {
            console.error('Failed to reload user profile:', profileResponse.status);
          }
        } catch (e) {
          console.error('Error reloading user profile:', e);
        }
      } else {
        addNotification(result.error || 'Failed to update profile picture', 'error');
      }
    } catch (error) {
      console.error('Error updating avatar:', error);
      addNotification('Failed to update profile picture from Strava', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteProfile = async () => {
    const confirmMessage = 'Are you sure you want to delete your profile? This action cannot be undone. All your data will be permanently deleted.';
    if (!window.confirm(confirmMessage)) {
      return;
    }

    const doubleConfirm = window.prompt('Type "DELETE" to confirm account deletion:');
    if (doubleConfirm !== 'DELETE') {
      addNotification('Account deletion cancelled', 'info');
      return;
    }

    try {
      setIsDeleting(true);
      const response = await fetch(`${API_ENDPOINTS.AUTH}/delete-account`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (response.ok) {
        // Clear all localStorage data
        localStorage.clear();
        sessionStorage.clear();
        
        addNotification('Account deleted successfully', 'success');
        logout();
        
        // Redirect to home page after a short delay
        setTimeout(() => {
          window.location.href = '/';
        }, 1000);
      } else {
        const data = await response.json();
        addNotification(data.error || 'Failed to delete account', 'error');
      }
    } catch (error) {
      console.error('Error deleting account:', error);
      addNotification('Failed to delete account', 'error');
    } finally {
      setIsDeleting(false);
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
        const currentUser = JSON.parse(localStorage.getItem('user'));
        const updatedUser = { ...currentUser, googleId: response.credential };
        saveUserToStorage(updatedUser);
        
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
        throw new Error(errorData.error || 'Failed to invite coach');
      }

      await response.json();
      addNotification('Coach invitation sent successfully', 'success');
      setFormData(prev => ({ ...prev, newCoachEmail: '' }));
      fetchCurrentCoach();
    } catch (error) {
      console.error('Error inviting coach:', error);
      addNotification(error.message || 'Failed to invite coach', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'profile':
  return (
          <div className={`${isMobile ? 'space-y-3' : 'space-y-6'}`}>
            <div className={`bg-white ${isMobile ? 'rounded-md' : 'rounded-lg'} shadow-md ${isMobile ? 'p-2.5' : 'p-6'}`}>
              <h3 className={`${isMobile ? 'text-sm' : 'text-xl'} font-bold text-gray-900 ${isMobile ? 'mb-2' : 'mb-4'}`}>Profile Information</h3>
              <div className={`${isMobile ? 'space-y-1.5' : 'space-y-4'}`}>
                <div>
                  <label className={`block ${isMobile ? 'text-[10px]' : 'text-sm'} font-medium text-gray-700 ${isMobile ? 'mb-0.5' : 'mb-1'}`}>Name</label>
                  <p className={`${isMobile ? 'text-xs' : 'text-base'} text-gray-900 break-words`}>{user?.name || 'N/A'}</p>
                </div>
                <div>
                  <label className={`block ${isMobile ? 'text-[10px]' : 'text-sm'} font-medium text-gray-700 ${isMobile ? 'mb-0.5' : 'mb-1'}`}>Email</label>
                  <p className={`${isMobile ? 'text-xs' : 'text-base'} text-gray-900 break-words`}>{user?.email || 'N/A'}</p>
                </div>
                <div>
                  <label className={`block ${isMobile ? 'text-[10px]' : 'text-sm'} font-medium text-gray-700 ${isMobile ? 'mb-0.5' : 'mb-1'}`}>Role</label>
                  <p className={`${isMobile ? 'text-xs' : 'text-base'} text-gray-900 capitalize`}>{user?.role || 'N/A'}</p>
                </div>
              </div>
            </div>

            <div className={`bg-white ${isMobile ? 'rounded-md' : 'rounded-lg'} shadow-md ${isMobile ? 'p-2.5' : 'p-6'}`}>
              <h3 className={`${isMobile ? 'text-sm' : 'text-xl'} font-bold text-gray-900 ${isMobile ? 'mb-2' : 'mb-4'}`}>Danger Zone</h3>
              <div className={`border border-red-200 ${isMobile ? 'rounded-md p-2' : 'rounded-lg p-4'} bg-red-50`}>
                <div className={`flex ${isMobile ? 'flex-col' : 'items-center justify-between'} ${isMobile ? 'gap-2' : ''}`}>
                  <div className={isMobile ? 'mb-2' : ''}>
                    <h4 className={`${isMobile ? 'text-xs' : 'text-base'} font-medium text-red-900`}>Delete Account</h4>
                    <p className={`${isMobile ? 'text-[10px]' : 'text-sm'} text-red-700 ${isMobile ? 'mt-0.5' : 'mt-1'}`}>Once you delete your account, there is no going back. Please be certain.</p>
                  </div>
                  <button
                    onClick={handleDeleteProfile}
                    disabled={isDeleting}
                    className={`flex items-center ${isMobile ? 'justify-center w-full' : 'gap-2'} ${isMobile ? 'px-2.5 py-1.5 text-[10px]' : 'px-4 py-2'} bg-red-600 text-white ${isMobile ? 'rounded-md' : 'rounded-lg'} hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    <Trash2 className={isMobile ? 'h-3 w-3' : 'h-5 w-5'} />
                    {isDeleting ? 'Deleting...' : 'Delete Account'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );

      case 'units':
        return (
          <div className={`bg-white ${isMobile ? 'rounded-md' : 'rounded-lg'} shadow-md ${isMobile ? 'p-2.5' : 'p-6'}`}>
            <h3 className={`${isMobile ? 'text-sm' : 'text-xl'} font-bold text-gray-900 ${isMobile ? 'mb-2' : 'mb-6'}`}>Units Preferences</h3>
            <div className={`${isMobile ? 'space-y-2.5' : 'space-y-6'}`}>
              <div>
                <label className={`block ${isMobile ? 'text-[10px]' : 'text-sm'} font-medium text-gray-700 ${isMobile ? 'mb-1' : 'mb-2'}`}>Distance</label>
                <div className={`flex ${isMobile ? 'flex-col gap-1.5' : 'gap-4'}`}>
                  <label className={`flex items-center ${isMobile ? 'text-xs' : ''}`}>
                    <input
                      type="radio"
                      name="distance"
                      value="metric"
                      checked={units.distance === 'metric'}
                      onChange={(e) => saveUnits({ ...units, distance: e.target.value })}
                      className={isMobile ? 'mr-1.5' : 'mr-2'}
                    />
                    <span>Metric (km, m)</span>
                  </label>
                  <label className={`flex items-center ${isMobile ? 'text-xs' : ''}`}>
                    <input
                      type="radio"
                      name="distance"
                      value="imperial"
                      checked={units.distance === 'imperial'}
                      onChange={(e) => saveUnits({ ...units, distance: e.target.value })}
                      className={isMobile ? 'mr-1.5' : 'mr-2'}
                    />
                    <span>Imperial (miles, feet)</span>
                  </label>
                </div>
              </div>

              <div>
                <label className={`block ${isMobile ? 'text-[10px]' : 'text-sm'} font-medium text-gray-700 ${isMobile ? 'mb-1' : 'mb-2'}`}>Weight</label>
                <div className={`flex ${isMobile ? 'flex-col gap-1.5' : 'gap-4'}`}>
                  <label className={`flex items-center ${isMobile ? 'text-xs' : ''}`}>
                    <input
                      type="radio"
                      name="weight"
                      value="kg"
                      checked={units.weight === 'kg'}
                      onChange={(e) => saveUnits({ ...units, weight: e.target.value })}
                      className={isMobile ? 'mr-1.5' : 'mr-2'}
                    />
                    <span>Kilograms (kg)</span>
                  </label>
                  <label className={`flex items-center ${isMobile ? 'text-xs' : ''}`}>
                    <input
                      type="radio"
                      name="weight"
                      value="lbs"
                      checked={units.weight === 'lbs'}
                      onChange={(e) => saveUnits({ ...units, weight: e.target.value })}
                      className={isMobile ? 'mr-1.5' : 'mr-2'}
                    />
                    <span>Pounds (lbs)</span>
                  </label>
                </div>
              </div>

              <div>
                <label className={`block ${isMobile ? 'text-[10px]' : 'text-sm'} font-medium text-gray-700 ${isMobile ? 'mb-1' : 'mb-2'}`}>Temperature</label>
                <div className={`flex ${isMobile ? 'flex-col gap-1.5' : 'gap-4'}`}>
                  <label className={`flex items-center ${isMobile ? 'text-xs' : ''}`}>
                    <input
                      type="radio"
                      name="temperature"
                      value="celsius"
                      checked={units.temperature === 'celsius'}
                      onChange={(e) => saveUnits({ ...units, temperature: e.target.value })}
                      className={isMobile ? 'mr-1.5' : 'mr-2'}
                    />
                    <span>Celsius (°C)</span>
                  </label>
                  <label className={`flex items-center ${isMobile ? 'text-xs' : ''}`}>
                    <input
                      type="radio"
                      name="temperature"
                      value="fahrenheit"
                      checked={units.temperature === 'fahrenheit'}
                      onChange={(e) => saveUnits({ ...units, temperature: e.target.value })}
                      className={isMobile ? 'mr-1.5' : 'mr-2'}
                    />
                    <span>Fahrenheit (°F)</span>
                  </label>
                </div>
              </div>
            </div>
          </div>
        );

      case 'notifications':
        return (
          <div className={`bg-white ${isMobile ? 'rounded-md' : 'rounded-lg'} shadow-md ${isMobile ? 'p-2.5' : 'p-6'}`}>
            <h3 className={`${isMobile ? 'text-sm' : 'text-xl'} font-bold text-gray-900 ${isMobile ? 'mb-2' : 'mb-6'}`}>Email Notifications</h3>
            <div className={`${isMobile ? 'space-y-1.5' : 'space-y-4'}`}>
              <div className={`flex items-center justify-between ${isMobile ? 'py-1.5' : 'py-3'} border-b`}>
                <div className="flex-1 min-w-0 pr-2">
                  <label className={`${isMobile ? 'text-[10px]' : 'text-sm'} font-medium text-gray-900`}>Email Notifications</label>
                  <p className={`${isMobile ? 'text-[9px]' : 'text-sm'} text-gray-500`}>Receive email notifications from LaChart</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={notifications.emailNotifications}
                    onChange={(e) => saveNotifications({ ...notifications, emailNotifications: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                </label>
              </div>

              <div className={`flex items-center justify-between ${isMobile ? 'py-1.5' : 'py-3'} border-b`}>
                <div className="flex-1 min-w-0 pr-2">
                  <label className={`${isMobile ? 'text-[10px]' : 'text-sm'} font-medium text-gray-900`}>Training Reminders</label>
                  <p className={`${isMobile ? 'text-[9px]' : 'text-sm'} text-gray-500`}>Get reminders for scheduled trainings</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={notifications.trainingReminders}
                    onChange={(e) => saveNotifications({ ...notifications, trainingReminders: e.target.checked })}
                    disabled={!notifications.emailNotifications}
                    className="sr-only peer"
                  />
                  <div className={`w-11 h-6 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all ${
                    !notifications.emailNotifications 
                      ? 'bg-gray-100 cursor-not-allowed' 
                      : 'bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 peer-checked:bg-primary'
                  }`}></div>
                </label>
              </div>

              <div className={`flex items-center justify-between ${isMobile ? 'py-1.5' : 'py-3'} border-b`}>
                <div className="flex-1 min-w-0 pr-2">
                  <label className={`${isMobile ? 'text-[10px]' : 'text-sm'} font-medium text-gray-900`}>Weekly Reports</label>
                  <p className={`${isMobile ? 'text-[9px]' : 'text-sm'} text-gray-500`}>Receive weekly training summaries</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={notifications.weeklyReports}
                    onChange={(e) => saveNotifications({ ...notifications, weeklyReports: e.target.checked })}
                    disabled={!notifications.emailNotifications}
                    className="sr-only peer"
                  />
                  <div className={`w-11 h-6 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all ${
                    !notifications.emailNotifications 
                      ? 'bg-gray-100 cursor-not-allowed' 
                      : 'bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 peer-checked:bg-primary'
                  }`}></div>
                </label>
              </div>

              <div className={`flex items-center justify-between ${isMobile ? 'py-1.5' : 'py-3'}`}>
                <div className="flex-1 min-w-0 pr-2">
                  <label className={`${isMobile ? 'text-[10px]' : 'text-sm'} font-medium text-gray-900`}>Achievement Alerts</label>
                  <p className={`${isMobile ? 'text-[9px]' : 'text-sm'} text-gray-500`}>Get notified about your achievements</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={notifications.achievementAlerts}
                    onChange={(e) => saveNotifications({ ...notifications, achievementAlerts: e.target.checked })}
                    disabled={!notifications.emailNotifications}
                    className="sr-only peer"
                  />
                  <div className={`w-11 h-6 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all ${
                    !notifications.emailNotifications 
                      ? 'bg-gray-100 cursor-not-allowed' 
                      : 'bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 peer-checked:bg-primary'
                  }`}></div>
                </label>
              </div>
            </div>
          </div>
        );

      case 'subscription':
        return (
          <div className={`bg-white ${isMobile ? 'rounded-md' : 'rounded-lg'} shadow-md ${isMobile ? 'p-2.5' : 'p-6'}`}>
            <div className={`text-center ${isMobile ? 'mb-2' : 'mb-6'}`}>
              <p className={`${isMobile ? 'text-[9px]' : 'text-sm'} text-gray-500 uppercase tracking-wide ${isMobile ? 'mb-0.5' : 'mb-2'}`}>Your Membership</p>
              <h3 className={`${isMobile ? 'text-base' : 'text-3xl'} font-bold text-gray-900`}>LaChart Free</h3>
            </div>
            
            <div className={`${isMobile ? 'w-full' : 'max-w-md'} mx-auto bg-white border border-gray-200 ${isMobile ? 'rounded-md p-2' : 'rounded-lg p-6'}`}>
              <div className={`text-center ${isMobile ? 'mb-1.5' : 'mb-4'}`}>
                <span className={`inline-block ${isMobile ? 'px-1.5 py-0.5 text-[9px]' : 'px-3 py-1 text-xs'} bg-gray-500 text-white font-semibold ${isMobile ? 'rounded-full mb-1.5' : 'rounded-full mb-3'}`}>
                  FREE
                </span>
                <h4 className={`${isMobile ? 'text-xs' : 'text-lg'} font-semibold text-gray-900 ${isMobile ? 'mb-0.5' : 'mb-2'}`}>Free Plan</h4>
                <div className={`${isMobile ? 'text-lg' : 'text-4xl'} font-bold text-gray-900 ${isMobile ? 'mb-0.5' : 'mb-1'}`}>$0.00</div>
                <p className={`${isMobile ? 'text-[9px]' : 'text-sm'} text-gray-500`}>USD / MONTH</p>
              </div>
              
              <div className={`border-t border-gray-200 ${isMobile ? 'pt-1.5 mt-1.5' : 'pt-4 mt-4'}`}>
                <p className={`${isMobile ? 'text-[9px]' : 'text-sm'} text-gray-600 text-center`}>
                  You are currently on the free plan
                </p>
              </div>
            </div>

            <div className={`${isMobile ? 'mt-2' : 'mt-6'} ${isMobile ? 'space-y-1.5' : 'space-y-4'}`}>
              <div className="text-center">
                <p className={`${isMobile ? 'text-[9px]' : 'text-sm'} text-gray-600 ${isMobile ? 'mb-1.5' : 'mb-4'}`}>
                  Premium features coming soon! Upgrade to unlock advanced analytics, unlimited data storage, and priority support.
                </p>
                <button 
                  className={`${isMobile ? 'px-3 py-1 text-[10px]' : 'px-6 py-2'} bg-primary text-white ${isMobile ? 'rounded-md' : 'rounded-lg'} hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed`}
                  disabled
                  title="Coming soon"
                >
                  Upgrade to Premium
                </button>
              </div>
              
              <div className={`${isMobile ? 'mt-2 pt-2' : 'mt-6 pt-6'} border-t border-gray-200`}>
                <h4 className={`${isMobile ? 'text-[10px]' : 'text-sm'} font-semibold text-gray-900 ${isMobile ? 'mb-1.5' : 'mb-3'}`}>Premium Features (Coming Soon)</h4>
                <ul className={`${isMobile ? 'space-y-1 text-[9px]' : 'space-y-2 text-sm'} text-gray-600`}>
                  <li className="flex items-center gap-2">
                    <span className="text-primary">✓</span>
                    <span>Advanced analytics and insights</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-primary">✓</span>
                    <span>Unlimited data storage</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-primary">✓</span>
                    <span>Priority support</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-primary">✓</span>
                    <span>Export data in multiple formats</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-primary">✓</span>
                    <span>Custom training plans</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        );

      case 'account':
        return (
          <div className={`${isMobile ? 'space-y-2.5' : 'space-y-6'}`}>
            <div className={`bg-white ${isMobile ? 'rounded-md' : 'rounded-lg'} shadow-md ${isMobile ? 'p-2.5' : 'p-6'}`}>
              <h3 className={`${isMobile ? 'text-sm' : 'text-xl'} font-bold text-gray-900 ${isMobile ? 'mb-2' : 'mb-6'}`}>Change Password</h3>
                <form onSubmit={handlePasswordChange} className={`${isMobile ? 'space-y-1.5' : 'space-y-4'}`}>
                  <div className="relative">
                    <label className={`block ${isMobile ? 'text-[10px]' : 'text-sm'} font-medium text-gray-700`}>Current Password</label>
                    <input
                      type={showPasswords.current ? "text" : "password"}
                      value={formData.currentPassword}
                      onChange={(e) => setFormData(prev => ({ ...prev, currentPassword: e.target.value }))}
                      className={`${isMobile ? 'mt-0.5 text-xs' : 'mt-1'} block w-full ${isMobile ? 'rounded-md' : 'rounded-md'} border-gray-300 shadow-sm focus:border-primary focus:ring-primary ${isMobile ? 'pr-7' : 'pr-10'}`}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => togglePasswordVisibility('current')}
                      className={`absolute inset-y-0 right-0 ${isMobile ? 'pr-1.5' : 'pr-3'} flex items-center ${isMobile ? 'mt-4' : 'mt-6'}`}
                    >
                      <img
                        src={showPasswords.current ? "/icon/eye-on.svg" : "/icon/eye-off.svg"}
                        alt={showPasswords.current ? "Hide password" : "Show password"}
                        className={isMobile ? 'h-3.5 w-3.5' : 'h-5 w-5 text-gray-400'}
                      />
                    </button>
                  </div>
                  <div className="relative">
                    <label className={`block ${isMobile ? 'text-[10px]' : 'text-sm'} font-medium text-gray-700`}>New Password</label>
                    <input
                      type={showPasswords.new ? "text" : "password"}
                      value={formData.newPassword}
                      onChange={(e) => setFormData(prev => ({ ...prev, newPassword: e.target.value }))}
                      className={`${isMobile ? 'mt-0.5 text-xs' : 'mt-1'} block w-full ${isMobile ? 'rounded-md' : 'rounded-md'} border-gray-300 shadow-sm focus:border-primary focus:ring-primary ${isMobile ? 'pr-7' : 'pr-10'}`}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => togglePasswordVisibility('new')}
                      className={`absolute inset-y-0 right-0 ${isMobile ? 'pr-1.5' : 'pr-3'} flex items-center ${isMobile ? 'mt-4' : 'mt-6'}`}
                    >
                      <img
                        src={showPasswords.new ? "/icon/eye-on.svg" : "/icon/eye-off.svg"}
                        alt={showPasswords.new ? "Hide password" : "Show password"}
                        className={isMobile ? 'h-3.5 w-3.5' : 'h-5 w-5 text-gray-400'}
                      />
                    </button>
                  </div>
                  <div className="relative">
                    <label className={`block ${isMobile ? 'text-[10px]' : 'text-sm'} font-medium text-gray-700`}>Confirm New Password</label>
                    <input
                      type={showPasswords.confirm ? "text" : "password"}
                      value={formData.confirmPassword}
                      onChange={(e) => setFormData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                      className={`${isMobile ? 'mt-0.5 text-xs' : 'mt-1'} block w-full ${isMobile ? 'rounded-md' : 'rounded-md'} border-gray-300 shadow-sm focus:border-primary focus:ring-primary ${isMobile ? 'pr-7' : 'pr-10'}`}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => togglePasswordVisibility('confirm')}
                      className={`absolute inset-y-0 right-0 ${isMobile ? 'pr-1.5' : 'pr-3'} flex items-center ${isMobile ? 'mt-4' : 'mt-6'}`}
                    >
                      <img
                        src={showPasswords.confirm ? "/icon/eye-on.svg" : "/icon/eye-off.svg"}
                        alt={showPasswords.confirm ? "Hide password" : "Show password"}
                        className={isMobile ? 'h-3.5 w-3.5' : 'h-5 w-5 text-gray-400'}
                      />
                    </button>
                  </div>
                  <button
                    type="submit"
                    className={`w-full flex justify-center ${isMobile ? 'py-1.5 px-2.5 text-[10px]' : 'py-2 px-4 text-sm'} border border-transparent ${isMobile ? 'rounded-md' : 'rounded-md'} shadow-sm font-medium text-white bg-primary hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary`}
                  >
                    Change Password
                  </button>
                </form>
              </div>

            <div className={`bg-white ${isMobile ? 'rounded-md' : 'rounded-lg'} shadow-md ${isMobile ? 'p-2.5' : 'p-6'}`}>
              <h3 className={`${isMobile ? 'text-sm' : 'text-xl'} font-bold text-gray-900 ${isMobile ? 'mb-2' : 'mb-6'}`}>Change Email</h3>
                <form onSubmit={handleEmailChange} className={`${isMobile ? 'space-y-1.5' : 'space-y-4'}`}>
                  <div>
                    <label className={`block ${isMobile ? 'text-[10px]' : 'text-sm'} font-medium text-gray-700`}>New Email</label>
                    <input
                      type="email"
                      value={formData.newEmail}
                      onChange={(e) => setFormData(prev => ({ ...prev, newEmail: e.target.value }))}
                      className={`${isMobile ? 'mt-0.5 text-xs' : 'mt-1'} block w-full ${isMobile ? 'rounded-md' : 'rounded-md'} border-gray-300 shadow-sm focus:border-primary focus:ring-primary`}
                      required
                    />
                  </div>
                  <button
                    type="submit"
                    className={`w-full flex justify-center ${isMobile ? 'py-1.5 px-2.5 text-[10px]' : 'py-2 px-4 text-sm'} border border-transparent ${isMobile ? 'rounded-md' : 'rounded-md'} shadow-sm font-medium text-white bg-primary hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary`}
                  >
                    Change Email
                  </button>
                </form>
              </div>

            <div className={`bg-white ${isMobile ? 'rounded-md' : 'rounded-lg'} shadow-md ${isMobile ? 'p-2.5' : 'p-6'}`}>
              <h3 className={`${isMobile ? 'text-sm' : 'text-xl'} font-bold text-gray-900 ${isMobile ? 'mb-2' : 'mb-6'}`}>Coach Management</h3>
                
                {currentCoach ? (
                  <div className={`${isMobile ? 'mb-2 p-1.5' : 'mb-6 p-4'} bg-gray-50 ${isMobile ? 'rounded-md' : 'rounded-lg'}`}>
                    <h4 className={`${isMobile ? 'text-xs' : 'text-base'} font-medium text-gray-900 ${isMobile ? 'mb-1' : 'mb-2'}`}>Current Coach</h4>
                    <div className={`flex ${isMobile ? 'flex-col' : 'items-center justify-between'} ${isMobile ? 'gap-1.5' : ''}`}>
                      <div>
                        <p className={`${isMobile ? 'text-[10px]' : 'text-sm'} text-gray-600 break-words`}>{currentCoach.name} {currentCoach.surname}</p>
                        <p className={`${isMobile ? 'text-[9px]' : 'text-sm'} text-gray-500 break-words`}>{currentCoach.email}</p>
                      </div>
                      <button
                        onClick={handleRemoveCoach}
                        disabled={isLoading}
                        className={`flex items-center ${isMobile ? 'justify-center w-full' : 'gap-2'} ${isMobile ? 'px-2.5 py-1 text-[10px]' : 'px-4 py-2 text-sm'} font-medium text-red-600 hover:text-red-700 focus:outline-none ${isMobile ? 'mt-1' : ''}`}
                      >
                        <UserMinus className={isMobile ? 'h-3.5 w-3.5' : 'h-5 w-5'} />
                        Remove Coach
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className={`${isMobile ? 'text-[10px]' : 'text-sm'} text-gray-600 ${isMobile ? 'mb-1.5' : 'mb-4'}`}>You currently don't have an assigned coach.</p>
                )}

                <form onSubmit={handleCoachChange} className={`${isMobile ? 'space-y-1.5' : 'space-y-4'}`}>
                  <div>
                    <label className={`block ${isMobile ? 'text-[10px]' : 'text-sm'} font-medium text-gray-700`}>New Coach Email</label>
                      <input
                        type="email"
                        value={formData.newCoachEmail}
                        onChange={(e) => setFormData(prev => ({ ...prev, newCoachEmail: e.target.value }))}
                    className={`${isMobile ? 'mt-0.5 text-xs' : 'mt-1'} block w-full ${isMobile ? 'rounded-md' : 'rounded-md'} border-gray-300 shadow-sm focus:border-primary focus:ring-primary`}
                        placeholder="coach@email.com"
                        required
                      />
                  </div>
                  <button
                    type="submit"
                    disabled={isLoading}
                    className={`w-full flex items-center justify-center ${isMobile ? 'gap-1 px-2.5 py-1.5 text-[10px]' : 'gap-2 px-4 py-2 text-sm'} border border-transparent ${isMobile ? 'rounded-md' : 'rounded-md'} shadow-sm font-medium text-white bg-primary hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary`}
                  >
                    <UserPlus className={isMobile ? 'h-3.5 w-3.5' : 'h-5 w-5'} />
                    {isLoading ? 'Sending...' : 'Invite New Coach'}
                  </button>
                </form>
              </div>

            <div className={`bg-white ${isMobile ? 'rounded-md' : 'rounded-lg'} shadow-md ${isMobile ? 'p-2.5' : 'p-6'}`}>
              <h3 className={`${isMobile ? 'text-sm' : 'text-xl'} font-bold text-gray-900 ${isMobile ? 'mb-2' : 'mb-6'}`}>Linked Social Accounts</h3>
                <div className={`flex ${isMobile ? 'flex-col' : 'items-center justify-between'} ${isMobile ? 'gap-2' : ''}`}>
                  <div className="flex items-center">
                    <img src="/icon/google.svg" alt="Google" className={isMobile ? 'h-4 w-4 mr-1' : 'h-6 w-6 mr-2'} />
                    <span className={isMobile ? 'text-xs' : ''}>Google</span>
                  </div>
                  {linkedAccounts.google ? (
                    <span className={`${isMobile ? 'text-xs' : ''} text-green-500`}>Connected</span>
                  ) : (
                    <div className={isMobile ? 'w-full' : ''}>
                    <GoogleLogin
                      onSuccess={handleGoogleSuccess}
                      onError={() => addNotification('Google authentication failed', 'error')}
                      useOneTap={false}
                        width={isMobile ? "100%" : "200"}
                      theme="outline"
                        size={isMobile ? "medium" : "large"}
                      text="signin_with"
                      shape="rectangular"
                    />
                    </div>
                  )}
                </div>
              </div>
            </div>
        );

      case 'integrations':
        return (
          <div className={`${isMobile ? 'space-y-2.5' : 'space-y-6'}`}>
            <div className={`bg-white ${isMobile ? 'rounded-md' : 'rounded-lg'} shadow-md ${isMobile ? 'p-2.5' : 'p-6'}`}>
              <h3 className={`${isMobile ? 'text-sm' : 'text-xl'} font-bold text-gray-900 ${isMobile ? 'mb-2' : 'mb-6'}`}>Integrations & Sync</h3>
              <div className={`grid ${isMobile ? 'grid-cols-1 gap-2.5' : 'grid-cols-1 md:grid-cols-2 gap-4'}`}>
                <div className={`bg-white ${isMobile ? 'rounded-md' : 'rounded-lg'} border border-gray-200 ${isMobile ? 'p-2.5' : 'p-6'}`}>
                  <div className={`flex items-center justify-between ${isMobile ? 'mb-2' : 'mb-4'}`}>
                    <div className="flex items-center gap-2">
                      {/* Strava Logo */}
                      <div className="flex items-center justify-center w-8 h-8 bg-orange-500 rounded-lg">
                        <span className="text-white font-bold text-sm">S</span>
                      </div>
                      <h4 className={`${isMobile ? 'text-xs' : 'text-lg'} font-semibold`}>Strava</h4>
                    </div>
                    <span className={`${isMobile ? 'text-[10px]' : 'text-sm'} font-medium ${stravaConnected ? 'text-green-600' : 'text-gray-500'}`}>
                      {stravaConnected ? 'Connected' : 'Not connected'}
                    </span>
                  </div>
                  
                  {stravaConnected && (
                    <>
                      <div className={`${isMobile ? 'mb-2 pb-2' : 'mb-4 pb-4'} border-b`}>
                        <div className={`flex items-center justify-between ${isMobile ? 'flex-col gap-1.5' : ''}`}>
                          <div className={isMobile ? 'w-full' : ''}>
                            <label className={`${isMobile ? 'text-[10px]' : 'text-sm'} font-medium text-gray-900`}>Auto-sync</label>
                            <p className={`${isMobile ? 'text-[9px]' : 'text-xs'} text-gray-500`}>Automatically sync new activities</p>
                          </div>
                          <label className={`relative inline-flex items-center cursor-pointer ${isMobile ? 'self-end' : ''}`}>
                            <input
                              type="checkbox"
                              checked={stravaAutoSync}
                              onChange={(e) => handleToggleAutoSync(e.target.checked)}
                              className="sr-only peer"
                            />
                            <div className={[
                              `${isMobile ? 'w-9 h-5' : 'w-11 h-6'} bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full`,
                              `${isMobile ? 'after:h-4 after:w-4' : 'after:h-5 after:w-5'} after:transition-all peer-checked:bg-primary`,
                              "after:content-['']"
                            ].join(' ')}></div>
                          </label>
                        </div>
                      </div>
                      <div className={`${isMobile ? 'mb-2 pb-2' : 'mb-4 pb-4'} border-b`}>
                        <div>
                          <label className={`${isMobile ? 'text-[10px]' : 'text-sm'} font-medium text-gray-900 ${isMobile ? 'mb-0.5' : 'mb-2'} block`}>Profile Picture</label>
                          <p className={`${isMobile ? 'text-[9px]' : 'text-xs'} text-gray-500 ${isMobile ? 'mb-1.5' : 'mb-3'}`}>Update your profile picture from Strava</p>
                          <button
                            onClick={handleUpdateAvatar}
                            disabled={isLoading}
                            className={`${isMobile ? 'px-2 py-1 text-[10px] w-full' : 'px-3 py-2 text-sm'} bg-gray-100 text-gray-800 ${isMobile ? 'rounded-md' : 'rounded'} hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed`}
                          >
                            {isLoading ? 'Updating...' : 'Update from Strava'}
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                  
                  <div className={`flex ${isMobile ? 'flex-col gap-1.5' : 'gap-2'}`}>
                    <button
                      onClick={handleConnectStrava}
                      className={`${isMobile ? 'px-2.5 py-1.5 text-[10px] w-full' : 'px-3 py-2'} bg-primary text-white ${isMobile ? 'rounded-md' : 'rounded'} hover:bg-primary-dark`}
                    >
                      {stravaConnected ? 'Reconnect' : 'Connect'}
                    </button>
                    <button
                      onClick={handleSyncStrava}
                      className={`${isMobile ? 'px-2.5 py-1.5 text-[10px] w-full' : 'px-3 py-2'} bg-gray-100 text-gray-800 ${isMobile ? 'rounded-md' : 'rounded'} hover:bg-gray-200`}
                    >
                      Sync Now
                    </button>
                  </div>
                </div>
           
                  <FitUploadSection
                    files={files}
                    uploading={uploading}
                    stravaConnected={stravaConnected}
                    garminConnected={garminConnected}
                    onFileSelect={handleFileSelect}
                    onUpload={handleUpload}
                    onSyncComplete={handleSyncComplete}
                  />
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className={`${isMobile ? 'px-2' : 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8'}`}>
          <div className={`${isMobile ? 'py-2' : 'py-6'}`}>
            <h1 className={`${isMobile ? 'text-base' : 'text-2xl sm:text-3xl'} font-bold text-gray-900`}>Settings</h1>
            <p className={`${isMobile ? 'text-[10px]' : 'text-sm sm:text-base'} text-gray-600 ${isMobile ? 'mt-0.5' : 'mt-1'}`}>Manage your account settings and preferences</p>
              </div>
              </div>
              </div>

      {/* Tabs */}
      <div className="bg-white border-b">
        <div className={`${isMobile ? 'px-0' : 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8'}`}>
          <nav className={`flex ${isMobile ? 'space-x-0' : 'space-x-2 sm:space-x-8'} overflow-x-auto ${isMobile ? '-mx-2 px-2' : ''}`} style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
            <style>{`
              nav::-webkit-scrollbar {
                display: none;
              }
            `}</style>
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  title={isMobile ? tab.name : ''}
                  className={`${isMobile ? 'py-2 px-3' : 'py-4 px-1 text-sm'} border-b-2 font-medium whitespace-nowrap flex items-center ${isMobile ? 'justify-center' : 'gap-2'} ${
                    activeTab === tab.id
                      ? 'border-primary text-primary'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <Icon className={isMobile ? 'h-5 w-5' : 'h-5 w-5'} />
                  {!isMobile && <span>{tab.name}</span>}
                </button>
              );
            })}
          </nav>
            </div>
          </div>

      {/* Content */}
      <div className={`${isMobile ? 'px-2' : 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8'} ${isMobile ? 'py-2' : 'py-8'}`}>
        {renderTabContent()}
      </div>
    </div>
  );
};

export default SettingsPage;
