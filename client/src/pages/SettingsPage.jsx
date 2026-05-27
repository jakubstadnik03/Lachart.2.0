import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthProvider';
import { GoogleLogin } from '@react-oauth/google';
import { useNotification } from '../context/NotificationContext';
import { API_ENDPOINTS, API_BASE_URL } from '../config/api.config';
import { User, UserPlus, UserMinus, Trash2, Bell, CreditCard, Link as LinkIcon, Compass, Globe, Tag, Database, Users, Activity, Info, AlertTriangle, BarChart2, Target, MessageCircle, TrendingUp, Sparkles } from 'lucide-react';
import FitUploadSection from '../components/FitAnalysis/FitUploadSection';
import { usePremium } from '../hooks/usePremium';
import UpgradeModal from '../components/UpgradeModal';
import CategoryManager from '../components/Settings/CategoryManager';
import { getIntegrationStatus, invalidateCache, listExternalActivities, uploadFitFile, getStravaAuthUrl, startGarminAuth, syncStravaActivities, autoSyncStravaActivities, updateAvatarFromStrava, syncGarminActivities, syncGarminHistory, autoSyncGarminActivities, fetchGdprExportJson, getCurrentSubscription, createCheckoutSession, getSubscriptionPortalUrl, cancelSubscription, reactivateSubscription, resetStravaBudget, updateUserProfile } from '../services/api';
import { saveUserToStorage } from '../utils/userStorage';
import { isCapacitorNative } from '../utils/isNativeApp';
import { maybeNotifyStravaActivitiesImported } from '../utils/stravaImportLocalNotification';
import { IntroSlides, INTRO_SEEN_KEY } from '../components/Onboarding/OnboardingFlow';
import { cancelScheduledLactateTestNotifications } from '../utils/lactateTestLocalNotifications';

const DEFAULT_NOTIFICATION_PREFS = {
  emailNotifications: true,
  trainingReminders: true,
  weeklyReports: true,
  achievementAlerts: true,
  trainingComments: true,
  pushStravaImport: true,
  pushLactateTest: true
};

const SIGNUP_METHOD_LABELS = {
  email: 'Email and password',
  google: 'Google',
  facebook: 'Facebook',
  coach_invite: 'Coach invitation',
  unknown: 'Unknown'
};

function formatAccountCreatedAt(iso) {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    return null;
  }
}

function formatRegistrationLocationLine(loc) {
  if (!loc || typeof loc !== 'object') return null;
  const parts = [loc.city, loc.region, loc.country].filter(Boolean);
  const place = parts.length ? parts.join(', ') : null;
  const extras = [];
  if (loc.timezone) extras.push(loc.timezone);
  if (loc.resolvedAt) {
    try {
      const r = new Date(loc.resolvedAt);
      if (!Number.isNaN(r.getTime())) {
        extras.push(`recorded ${r.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}`);
      }
    } catch {
      // ignore
    }
  }
  if (!place && extras.length === 0) return null;
  return [place, extras.length ? `(${extras.join(' · ')})` : null].filter(Boolean).join(' ');
}

function getStoredAuthToken() {
  return localStorage.getItem('authToken') || localStorage.getItem('token') || '';
}

const SettingsPage = () => {
  const { user, logout, login, premiumPreviewNoAccess, setPremiumPreviewNoAccess } = useAuth();
  const location = useLocation();
  const { addNotification } = useNotification();
  const { gate, UpgradeModalProps: fitUpgradeModalProps } = usePremium(); // eslint-disable-line no-unused-vars
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
  // Real-time webhook health — populated by /api/integrations/strava/status.
  // {webhookHealthy:boolean, webhookLastEventAt:string|null}
  const [stravaWebhookStatus, setStravaWebhookStatus] = useState(null);
  const [garminAutoSync, setGarminAutoSync] = useState(false);
  const [isSyncingStrava, setIsSyncingStrava] = useState(false);
  const [isTogglingStravaAutoSync, setIsTogglingStravaAutoSync] = useState(false);
  const [isSyncingGarmin, setIsSyncingGarmin] = useState(false);
  const [isSyncingGarminHistory, setIsSyncingGarminHistory] = useState(false);
  const [garminLastSync, setGarminLastSync] = useState(null);
  const [garminTestResult, setGarminTestResult] = useState(null); // { ok, error, athleteId }
  const [isTestingGarmin, setIsTestingGarmin] = useState(false);
  const [garminSyncError, setGarminSyncError] = useState(null); // persistent error shown in UI
  const [showGarminLoginForm, setShowGarminLoginForm] = useState(false);
  const [garminLoginForm, setGarminLoginForm] = useState({ username: '', password: '' });
  const [isConnectingGarminCreds, setIsConnectingGarminCreds] = useState(false);
  const [stravaLogoError, setStravaLogoError] = useState(false);
  // Strava 429 wall — when set, Sync Now is disabled and we render a live
  // countdown. Persisted to localStorage so the wall survives page reloads.
  const [stravaRetryUntil, setStravaRetryUntil] = useState(() => {
    try {
      const v = parseInt(localStorage.getItem('strava_manual_retry_until') || '0', 10);
      return v > Date.now() ? v : 0;
    } catch { return 0; }
  });
  // 1-Hz ticker for the countdown — only mounted while a wall is active.
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!stravaRetryUntil) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [stravaRetryUntil]);
  const stravaSecondsLeft = stravaRetryUntil ? Math.max(0, Math.ceil((stravaRetryUntil - now) / 1000)) : 0;
  // Auto-clear when the wall expires.
  useEffect(() => {
    if (stravaRetryUntil && stravaSecondsLeft === 0) {
      try { localStorage.removeItem('strava_manual_retry_until'); } catch {}
      setStravaRetryUntil(0);
    }
  }, [stravaRetryUntil, stravaSecondsLeft]);
  const [garminLogoError, setGarminLogoError] = useState(false);
  // Strava backfill progress — polled every 10s while backfill is running
  const [stravaBackfill, setStravaBackfill] = useState(null); // { state, startedAt, cursorDate }
  const [polarConnected] = useState(false);
  const [corosConnected] = useState(false);
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);

  // Settings state
  const [units, setUnits] = useState({
    distance: 'metric', // 'metric' or 'imperial'
    weight: 'kg', // 'kg' or 'lbs'
    temperature: 'celsius' // 'celsius' or 'fahrenheit'
  });

  const DEFAULT_TRAINING_PREFS = useMemo(() => ({
    rpeScale: 'rpe',
    paceDisplay: 'minpkm',
    zonesMethod: 'lactate',
    customZones: {
      enabled: false,
      zone1: { min: 0, max: 55, label: 'Active Recovery' },
      zone2: { min: 55, max: 75, label: 'Endurance' },
      zone3: { min: 75, max: 87, label: 'Tempo' },
      zone4: { min: 87, max: 95, label: 'Threshold' },
      zone5: { min: 95, max: 100, label: 'VO2 Max' },
    }
  }), []);
  const [trainingPrefs, setTrainingPrefs] = useState(DEFAULT_TRAINING_PREFS);
  const [savingTrainingPrefs, setSavingTrainingPrefs] = useState(false);
  const [showIntroTutorial, setShowIntroTutorial] = useState(false);

  const [notifications, setNotifications] = useState(DEFAULT_NOTIFICATION_PREFS);

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

  /** Linked coaches (athlete can have multiple) */
  const [myCoaches, setMyCoaches] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isGdprExporting, setIsGdprExporting] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameForm, setNameForm] = useState({ name: '', surname: '' });
  const [editingRole, setEditingRole] = useState(false);
  const [roleForm, setRoleForm] = useState(user?.role || 'athlete');

  // Subscription state
  const [subData, setSubData] = useState(null);
  const [subLoading, setSubLoading] = useState(false);
  const [subActionLoading, setSubActionLoading] = useState(false);
  const [subError, setSubError] = useState(null);

  // Coach branding state
  const [coachBranding, setCoachBranding] = useState({
    logoUrl:      user?.coachBranding?.logoUrl      || '',
    title:        user?.coachBranding?.title        || '',
    trademark:    user?.coachBranding?.trademark    || '',
    primaryColor: user?.coachBranding?.primaryColor || '#767EB5',
  });
  const [brandingSaving, setBrandingSaving] = useState(false);

  // App Store guideline 3.1.1: native iOS builds must not surface external
  // subscription / payment flows. Subscription management stays on the web.
  const tabs = [
    { id: 'profile', name: 'Profile', icon: User },
    { id: 'training', name: 'Preferences', icon: Activity },
    { id: 'notifications', name: 'Notifications', icon: Bell },
    ...(isCapacitorNative() ? [] : [{ id: 'subscription', name: 'Subscription', icon: CreditCard }]),
    { id: 'branding', name: 'Branding', icon: Sparkles },
    { id: 'coach', name: 'Coach', icon: Users },
    { id: 'integrations', name: 'Integrations', icon: LinkIcon },
    { id: 'categories', name: 'Categories', icon: Tag },
  ];

  const togglePasswordVisibility = (field) => {
    setShowPasswords(prev => ({
      ...prev,
      [field]: !prev[field]
    }));
  };

  const fetchMyCoaches = useCallback(async () => {
    try {
      const token = localStorage.getItem('authToken') || localStorage.getItem('token');
      if (!token) {
        setMyCoaches([]);
        return;
      }
      const response = await fetch(API_ENDPOINTS.MY_COACHES, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        // Backward-compatible parsing: some responses may return `coach` only.
        const list = Array.isArray(data.coaches)
          ? data.coaches
          : (data.coach ? [data.coach] : []);
        setMyCoaches(list);
      } else {
        setMyCoaches([]);
      }
    } catch (error) {
      console.error('Error fetching coaches:', error);
      setMyCoaches([]);
    }
  }, []);

  useEffect(() => {
    if (user) {
      setLinkedAccounts({
        google: !!user.googleId
      });
    }
  }, [user]);

  useEffect(() => {
    try {
      const q = new URLSearchParams(location.search || '');
      const tab = q.get('tab');
      if (tab === 'integrations') setActiveTab('integrations');
      if (tab === 'subscription') setActiveTab('subscription');
      if (tab === 'coach') setActiveTab('coach');
      if (tab === 'units') setActiveTab('training'); // units merged into preferences
      // Stripe redirect feedback
      if (tab === 'subscription' && q.get('success') === '1') {
        addNotification('Payment successful! Your subscription is now active.', 'success');
      }
      if (tab === 'subscription' && q.get('canceled') === '1') {
        addNotification('Checkout was canceled. No charges were made.', 'info');
      }
    } catch {
      // ignore
    }
  }, [location.search]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!editingRole && user?.role) {
      setRoleForm(user.role);
    }
  }, [user?.role, editingRole]);

  useEffect(() => {
    if (user?.role === 'athlete') {
      fetchMyCoaches();
    } else {
      setMyCoaches([]);
    }
  }, [user?.role, user?.coachId, fetchMyCoaches]);

  useEffect(() => {
    const handleFocus = () => {
      if (user?.role === 'athlete') fetchMyCoaches();
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [fetchMyCoaches, user?.role]);

  useEffect(() => {
    const checkIntegrationStatus = async () => {
        try {
          const status = await getIntegrationStatus();
          const wasConnected = stravaConnected;
          const isNowConnected = Boolean(status.stravaConnected);

          setStravaConnected(isNowConnected);
          setGarminConnected(Boolean(status.garminConnected));
          if (status.garminLastSync) setGarminLastSync(status.garminLastSync);
          if (status.garminAutoSync !== undefined) setGarminAutoSync(Boolean(status.garminAutoSync));

          // Pull real-time webhook health so we can tell the user whether
          // their uploads should appear instantly (webhook) or with up to a
          // 15-min polling delay (scheduler fallback).
          if (isNowConnected) {
            try {
              const { fetchStravaStatus } = await import('../services/api');
              const s = await fetchStravaStatus();
              if (s) setStravaWebhookStatus(s);
            } catch (e) { /* non-fatal */ }
          } else {
            setStravaWebhookStatus(null);
          }
          
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

    // Reload user profile + integration status after a successful Strava
    // OAuth — used by both the web path (?strava=connected query string
    // when the user lands back from the callback redirect) and the iOS
    // deep-link path (com.lachart.app://strava-connected handled in
    // initCapacitorShell, which dispatches the `strava:connected` window
    // event we listen for below).
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
            
            // Automatically sync Strava activities after connection
            try {
              // 1) Enable auto-sync for new activities
              try {
                await fetch(`${API_BASE_URL}/api/integrations/strava/auto-sync`, {
                  method: 'PUT',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                  },
                  body: JSON.stringify({ autoSync: true })
                });
              } catch (e) {
                console.error('Failed to enable Strava auto-sync (ignored):', e);
              }

              // 2) Sync now (download trainings/activities)
              console.log('Starting automatic Strava sync (sync now) after connection...');
              const syncResult = await syncStravaActivities();
              console.log('Automatic sync (sync now) completed:', syncResult);

              // 3) Update profile picture from Strava
              try {
                const avatarRes = await updateAvatarFromStrava();
                console.log('Avatar updated from Strava:', avatarRes);
              } catch (e) {
                console.error('Failed to update avatar from Strava (ignored):', e);
              }

              if (syncResult.imported > 0 || syncResult.updated > 0) {
                addNotification(`Strava sync: ${syncResult.imported || 0} imported, ${syncResult.updated || 0} updated`, 'success');
              }
              if (syncResult.imported > 0) {
                maybeNotifyStravaActivitiesImported(syncResult.imported, user?.notifications, syncResult.latestActivityId);
              }

              // Reload user profile to reflect autoSync + avatar updates
              try {
                const profileResponse = await fetch(`${API_BASE_URL}/user/profile`, {
                  headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                  }
                });
                if (profileResponse.ok) {
                  const refreshedUser = await profileResponse.json();
                  saveUserToStorage(refreshedUser);
                  window.dispatchEvent(new CustomEvent('userUpdated', { detail: refreshedUser }));
                }
              } catch (e) {
                console.error('Failed to reload user profile after Strava connect actions (ignored):', e);
              }
            } catch (syncError) {
              console.error('Error during automatic Strava sync:', syncError);
              // Don't show error to user - sync can be done manually later
            }
          } else {
            console.error('Failed to reload user profile:', profileResponse.status);
          }
        } catch (e) {
          console.error('Error reloading user profile after Strava callback:', e);
        }
      };

    // Trigger the reload for the web path (query string set on callback redirect).
    if (isStravaConnected) reloadUserProfile();

    // iOS deep-link path: initCapacitorShell.js fires this event when
    // Safari hands control back via com.lachart.app://strava-connected.
    const onStravaDeepLink = () => {
      console.log('[Strava] deep-link signal received from iOS shell');
      reloadUserProfile();
    };
    window.addEventListener('strava:connected', onStravaDeepLink);
    return () => window.removeEventListener('strava:connected', onStravaDeepLink);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const garminState = urlParams.get('garmin');
    if (!garminState) return;

    const finalizeGarminCallback = async () => {
      if (garminState === 'error') {
        addNotification(urlParams.get('message') || 'Garmin connection failed', 'error');
        return;
      }

      if (garminState !== 'connected') return;

      try {
        const token = getStoredAuthToken();
        await new Promise((resolve) => setTimeout(resolve, 1000));

        const profileResponse = await fetch(`${API_BASE_URL}/user/profile`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (profileResponse.ok) {
          const updatedUser = await profileResponse.json();
          saveUserToStorage(updatedUser);
          window.dispatchEvent(new CustomEvent('userUpdated', { detail: updatedUser }));
        }

        const status = await getIntegrationStatus();
        const isConnected = Boolean(status.garminConnected);
        setGarminConnected(isConnected);

        const cleanPath = `${window.location.pathname}?tab=integrations`;
        window.history.replaceState({}, document.title, cleanPath);
        if (isConnected) {
          addNotification('Garmin account connected successfully', 'success');
        } else {
          addNotification('Garmin callback finished, but account is still not marked as connected', 'warning');
        }
      } catch (e) {
        console.error('Error finalizing Garmin callback:', e);
        addNotification('Garmin connected, but profile refresh failed', 'warning');
      }
    };

    finalizeGarminCallback();
  }, [addNotification]);

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

  // Poll backfill progress every 10s while a historical import is running.
  // Stops automatically once state turns 'done' or user disconnects.
  useEffect(() => {
    if (!user?.strava?.accessToken) { setStravaBackfill(null); return; }
    let timer = null;
    const poll = async () => {
      try {
        const { fetchStravaStatus } = await import('../services/api');
        const s = await fetchStravaStatus();
        if (!s) return;
        const state = s.backfillState || null;
        // Estimate the date we've reached based on cursor (Unix timestamp)
        const cursorDate = s.backfillCursorBefore
          ? new Date(s.backfillCursorBefore * 1000).toLocaleDateString('cs', { year: 'numeric', month: 'short' })
          : null;
        setStravaBackfill(state ? { state, startedAt: s.backfillStartedAt, cursorDate } : null);
        // Keep polling while running
        if (state === 'running') {
          timer = setTimeout(poll, 10000);
        }
      } catch (_) { /* swallow */ }
    };
    poll();
    return () => { if (timer) clearTimeout(timer); };
  }, [user?.strava?.accessToken]);

  // Load Garmin auto-sync setting from user profile
  useEffect(() => {
    if (user?.garmin) {
      setGarminAutoSync(user.garmin.autoSync !== undefined ? user.garmin.autoSync : false);
      setGarminLastSync(user.garmin.lastSyncDate || null);
    } else {
      setGarminAutoSync(false);
      setGarminLastSync(null);
    }
  }, [user?.garmin?.autoSync, user?.garmin?.lastSyncDate, user?.garmin]);
  
  // Listen for user updates from AuthProvider
  useEffect(() => {
    const handleUserUpdate = (event) => {
      const updatedUser = event.detail;
      // Strava
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
      // Garmin — update state directly from the event so stale cache can't overwrite it
      if (updatedUser?.garmin?.accessToken) {
        setGarminConnected(true);
        setGarminAutoSync(Boolean(updatedUser.garmin.autoSync));
      } else if (updatedUser) {
        // user object present but no garmin → disconnected
        setGarminConnected(false);
        setGarminAutoSync(false);
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
    // Notifications: prefer user profile, fallback to localStorage (backward compatibility)
    if (user?.notifications) {
      setNotifications({ ...DEFAULT_NOTIFICATION_PREFS, ...user.notifications });
    } else {
      const savedNotifications = localStorage.getItem('userNotifications');
      if (savedNotifications) {
        try {
          const parsed = JSON.parse(savedNotifications);
          setNotifications(parsed);
          // Also save to backend if user is logged in
          if (user?._id) {
            saveNotificationsToBackend(parsed).catch(() => {});
          }
        } catch (e) {
          console.error('Error loading notifications:', e);
        }
      }
    }
    // Load training preferences from user profile
    if (user?.trainingPreferences) {
      setTrainingPrefs(prev => ({ ...DEFAULT_TRAINING_PREFS, ...user.trainingPreferences, customZones: { ...DEFAULT_TRAINING_PREFS.customZones, ...user.trainingPreferences.customZones } }));
    }
  }, [user?.units, user?._id, user?.notifications, user?.trainingPreferences, DEFAULT_TRAINING_PREFS]);

  // Fetch subscription data when tab is active
  useEffect(() => {
    if (activeTab !== 'subscription') return;
    let cancelled = false;
    const load = async () => {
      setSubLoading(true);
      setSubError(null);
      try {
        const data = await getCurrentSubscription();
        if (!cancelled) setSubData(data);
      } catch (err) {
        if (!cancelled) setSubError(err?.response?.data?.error || 'Failed to load subscription');
      } finally {
        if (!cancelled) setSubLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [activeTab]);

  useEffect(() => {
    setCoachBranding({
      logoUrl:      user?.coachBranding?.logoUrl      || '',
      title:        user?.coachBranding?.title        || '',
      trademark:    user?.coachBranding?.trademark    || '',
      primaryColor: user?.coachBranding?.primaryColor || '#767EB5',
    });
  }, [user?.coachBranding]);

  // Handle upgrade / checkout
  const handleUpgrade = async (planId) => {
    setSubActionLoading(true);
    setSubError(null);
    try {
      const { url } = await createCheckoutSession(planId);
      if (url) window.location.href = url;
    } catch (err) {
      const msg = err?.response?.data?.message || err?.response?.data?.error || 'Checkout failed';
      setSubError(msg);
      addNotification(msg, 'error');
    } finally {
      setSubActionLoading(false);
    }
  };

  // Open Stripe customer portal
  const handlePortal = async () => {
    setSubActionLoading(true);
    try {
      const { url } = await getSubscriptionPortalUrl();
      if (url) window.location.href = url;
    } catch (err) {
      const msg = err?.response?.data?.error || 'Could not open billing portal';
      setSubError(msg);
      addNotification(msg, 'error');
    } finally {
      setSubActionLoading(false);
    }
  };

  // Cancel subscription
  const handleCancelSub = async () => {
    if (!window.confirm('Are you sure you want to cancel? You will keep access until the end of the billing period.')) return;
    setSubActionLoading(true);
    try {
      await cancelSubscription();
      addNotification('Subscription will be canceled at the end of the billing period.', 'success');
      const data = await getCurrentSubscription();
      setSubData(data);
    } catch (err) {
      addNotification(err?.response?.data?.error || 'Cancel failed', 'error');
    } finally {
      setSubActionLoading(false);
    }
  };

  // Reactivate subscription
  const handleReactivateSub = async () => {
    setSubActionLoading(true);
    try {
      await reactivateSubscription();
      addNotification('Subscription reactivated!', 'success');
      const data = await getCurrentSubscription();
      setSubData(data);
    } catch (err) {
      addNotification(err?.response?.data?.error || 'Reactivate failed', 'error');
    } finally {
      setSubActionLoading(false);
    }
  };

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

  // Save training preferences to backend
  const saveTrainingPrefs = async (newPrefs) => {
    try {
      setSavingTrainingPrefs(true);
      const response = await fetch(API_ENDPOINTS.EDIT_PROFILE, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ trainingPreferences: newPrefs })
      });
      if (response.ok) {
        const updatedUser = await response.json();
        saveUserToStorage(updatedUser);
        window.dispatchEvent(new CustomEvent('userUpdated', { detail: updatedUser }));
        setTrainingPrefs(newPrefs);
        addNotification('Training preferences saved', 'success');
      } else {
        throw new Error('Failed to save training preferences');
      }
    } catch (error) {
      console.error('Error saving training preferences:', error);
      addNotification('Failed to save training preferences', 'error');
    } finally {
      setSavingTrainingPrefs(false);
    }
  };

  // Save notification preferences to backend
  const saveNotificationsToBackend = async (newNotifications) => {
    try {
      const response = await fetch(API_ENDPOINTS.EDIT_PROFILE, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ notifications: newNotifications })
      });

      if (response.ok) {
        const updatedUser = await response.json();
        // Update user in localStorage (using optimized storage)
        saveUserToStorage(updatedUser);
        // Trigger event to update AuthProvider
        window.dispatchEvent(new CustomEvent('userUpdated', { detail: updatedUser }));
      } else {
        throw new Error('Failed to save notification preferences');
      }
    } catch (error) {
      console.error('Error saving notification preferences to backend:', error);
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

  const saveNotifications = async (newNotifications) => {
    try {
      if (newNotifications.pushLactateTest === false && notifications.pushLactateTest !== false) {
        cancelScheduledLactateTestNotifications().catch(() => {});
      }
      setNotifications(newNotifications);
      // Save to backend
      await saveNotificationsToBackend(newNotifications);
      // Also save to localStorage as backup
      localStorage.setItem('userNotifications', JSON.stringify(newNotifications));
      addNotification('Notification preferences saved', 'success');
    } catch (error) {
      console.error('Error saving notifications:', error);
      addNotification('Failed to save notification preferences', 'error');
    }
  };

  const handleFileSelect = (e) => {
    const selectedFiles = Array.from(e.target.files);
    setFiles(selectedFiles);
  };

  const handleUpload = async () => {
    if (files.length === 0) return;

    // ── Premium gate: FIT upload requires Pro plan ──────────────────────────
    if (!gate('FIT Training Upload', 'pro')) return;
    // ────────────────────────────────────────────────────────────────────────

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
      // On iOS inside Capacitor WebView, navigating window.location.href
      // to an external https URL works but leaves the user stuck on Strava
      // (or on lachart.net after the callback) with no way back to the
      // native app. Open in external Safari instead — Capacitor intercepts
      // window.open(_, '_blank') and asks UIApplication to open the URL
      // through the OS. The OAuth callback then redirects to
      // com.lachart.app://strava-connected which deep-links back to the app.
      if (isCapacitorNative()) {
        window.open(url, '_blank');
        addNotification('Opening Strava in Safari… Authorize, then tap "Open in LaChart" to return.', 'info');
      } else {
        window.location.href = url;
      }
    } catch (e) {
      console.error('Strava connect error:', e);
      addNotification('Failed to start Strava connection', 'error');
    }
  };

  // Admin-only: wipe the server's local Strava rate-limit estimator.
  // The bucket can get stuck near MAX when a backfill races overnight or
  // a second Render instance shares credentials — the user then sees
  // "try again in 600 min" even though Strava itself is fine. Reset
  // clears local state; the very next Strava response will reconcile
  // us to the real usage via X-RateLimit-Usage headers.
  const handleResetStravaBudget = async () => {
    try {
      const data = await resetStravaBudget();
      const b = data?.before;
      addNotification(
        b
          ? `Strava budget reset (was ${b.windowUsed}/${b.windowLimit} window, ${b.dayUsed}/${b.dayLimit} day). Try Sync now.`
          : 'Strava budget reset. Try Sync now.',
        'success',
      );
    } catch (e) {
      const msg = e?.response?.data?.error || e?.message || 'reset failed';
      addNotification(`Budget reset failed: ${msg}`, 'error');
    }
  };

  const handleSyncStrava = async () => {
    if (isSyncingStrava) return;
    try {
      setIsSyncingStrava(true);
      // Use a 7-day overlap window so the manual sync always re-checks recent
      // activities. Sending the raw lastSyncDate caused a chicken-and-egg bug:
      // auto-sync bumps lastSyncDate=now(), then manual sync asked Strava for
      // activities "after now" and got nothing — so a missed ride could never
      // be recovered by hitting "Sync Now". Overlap also catches rides that
      // were uploaded with delay (e.g. saved offline on the bike computer).
      const overlapMs = 7 * 24 * 60 * 60 * 1000; // 7 days
      const lastSync = user?.strava?.lastSyncDate ? new Date(user.strava.lastSyncDate).getTime() : null;
      const sinceParam = lastSync ? new Date(lastSync - overlapMs) : null;
      const res = await syncStravaActivities(sinceParam);
      if (res?.status === 'in_progress') {
        addNotification('Strava sync is already running in background. Please wait a moment.', 'info');
        return;
      }
      addNotification(`Strava sync: imported ${res.imported || 0}, updated ${res.updated || 0}`, 'success');
      if ((res.imported || 0) > 0) {
        maybeNotifyStravaActivitiesImported(res.imported, user?.notifications, res.latestActivityId);
      }
      await handleSyncComplete();
    } catch (e) {
      console.error('Strava sync error:', e);
      if (e?.response?.status === 429) {
        const imp = Number(e?.response?.data?.imported);
        if (imp > 0) {
          maybeNotifyStravaActivitiesImported(imp, user?.notifications);
        }
        const retryAfter = Number(e?.response?.data?.retryAfter || 0);
        // Persist the wall so a page reload doesn't let the user click again.
        if (retryAfter > 0) {
          const until = Date.now() + retryAfter * 1000;
          setStravaRetryUntil(until);
          try { localStorage.setItem('strava_manual_retry_until', String(until)); } catch {}
        }
        const minutes = retryAfter > 0 ? Math.max(1, Math.ceil(retryAfter / 60)) : null;
        addNotification(
          minutes
            ? `Strava rate limit reached. Try again in about ${minutes} min.`
            : 'Strava rate limit reached. Please try again later.',
          'warning'
        );
      } else {
        addNotification(e?.response?.data?.message || 'Failed to sync Strava activities', 'error');
      }
    } finally {
      setIsSyncingStrava(false);
    }
  };

  const handleConnectGarmin = async () => {
    try {
      const url = await startGarminAuth();
      window.location.href = url;
    } catch (e) {
      console.error('Garmin connect error:', e);
      addNotification(e.response?.data?.error || e.message || 'Failed to start Garmin connection', 'error');
    }
  };

  const handleConnectGarminCredentials = async (e) => {
    e.preventDefault();
    if (!garminLoginForm.username || !garminLoginForm.password) return;
    setIsConnectingGarminCreds(true);
    try {
      const token = getStoredAuthToken();
      const resp = await fetch(`${API_BASE_URL}/api/integrations/garmin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ username: garminLoginForm.username, password: garminLoginForm.password })
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || data.message || 'Login failed');
      addNotification('Garmin connected via credentials!', 'success');
      setGarminConnected(true);
      setShowGarminLoginForm(false);
      setGarminLoginForm({ username: '', password: '' });
      setGarminSyncError(null);
    } catch (err) {
      addNotification(`Garmin login failed: ${err.message}`, 'error');
    } finally {
      setIsConnectingGarminCreds(false);
    }
  };

  // Helper: extract a user-readable error from a Garmin sync response or thrown error
  const garminSyncErrorMessage = (e, res) => {
    // Server returned a 4xx/5xx with a message in the response body
    const serverMsg = e?.response?.data?.message || res?.message;
    if (serverMsg) return serverMsg;
    // Network or other error
    if (e?.message) return e.message;
    return 'Garmin sync failed. Check the server logs for details.';
  };

  const handleSyncGarmin = async () => {
    if (isSyncingGarmin) return;
    let res;
    setGarminSyncError(null);
    try {
      setIsSyncingGarmin(true);
      res = await syncGarminActivities();
      // The server may return { error, message } with HTTP 200 in auto-sync, or 502/500 (which throws)
      if (res?.error) {
        const msg = res.message || res.error;
        addNotification(`Garmin sync error: ${msg}`, 'error');
        setGarminSyncError(msg);
        return;
      }
      addNotification(`Garmin sync: imported ${res.imported || 0}, updated ${res.updated || 0}`, 'success');
      setGarminLastSync(new Date().toISOString());
      await handleSyncComplete();
    } catch (e) {
      console.error('Garmin sync error:', e);
      const msg = garminSyncErrorMessage(e, res);
      addNotification(msg, 'error');
      setGarminSyncError(msg);
    } finally {
      setIsSyncingGarmin(false);
    }
  };

  // Sync all historical Garmin data (no date filter — downloads everything)
  const handleSyncGarminHistory = async () => {
    if (isSyncingGarminHistory || isSyncingGarmin) return;
    const ok = window.confirm('This will download your full Garmin activity history (up to 5 years). This may take several minutes. Continue?');
    if (!ok) return;
    let res;
    setGarminSyncError(null);
    try {
      setIsSyncingGarminHistory(true);
      res = await syncGarminHistory(); // dedicated endpoint with 90-day chunk pagination
      if (res?.error) {
        const msg = res.message || res.error;
        addNotification(`Garmin import error: ${msg}`, 'error');
        setGarminSyncError(msg);
        return;
      }
      addNotification(`History import: ${res.imported || 0} new, ${res.updated || 0} updated`, 'success');
      setGarminLastSync(new Date().toISOString());
      await handleSyncComplete();
    } catch (e) {
      console.error('Garmin history sync error:', e);
      const msg = garminSyncErrorMessage(e, res);
      addNotification(msg, 'error');
      setGarminSyncError(msg);
    } finally {
      setIsSyncingGarminHistory(false);
    }
  };

  const handleTestGarminConnection = async () => {
    if (isTestingGarmin) return;
    setIsTestingGarmin(true);
    setGarminTestResult(null);
    try {
      const token = getStoredAuthToken();
      const r = await fetch(`${API_BASE_URL}/api/integrations/garmin/test-connection`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await r.json();
      setGarminTestResult(data);
    } catch (e) {
      setGarminTestResult({ ok: false, error: e.message });
    } finally {
      setIsTestingGarmin(false);
    }
  };

  const handleToggleGarminAutoSync = async (enabled) => {
    try {
      const token = getStoredAuthToken();
      const response = await fetch(`${API_BASE_URL}/api/integrations/garmin/auto-sync`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ autoSync: enabled })
      });

      if (response.ok) {
        const result = await response.json();
        setGarminAutoSync(result.autoSync);
        addNotification(`Garmin auto-sync ${enabled ? 'enabled' : 'disabled'}`, 'success');

        // Reload user profile
        const profileResponse = await fetch(`${API_BASE_URL}/user/profile`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (profileResponse.ok) {
          const updatedUser = await profileResponse.json();
          saveUserToStorage(updatedUser);
          window.dispatchEvent(new CustomEvent('userUpdated', { detail: updatedUser }));
        }

        // Trigger an immediate background sync when enabling — mirrors Strava behaviour
        if (enabled) {
          autoSyncGarminActivities()
            .then(r => {
              if ((r?.imported || 0) + (r?.updated || 0) > 0) {
                addNotification(`Garmin: imported ${r.imported || 0}, updated ${r.updated || 0}`, 'success');
              }
            })
            .catch(() => {});
        }
      } else {
        addNotification('Failed to update Garmin auto-sync setting', 'error');
      }
    } catch (e) {
      console.error('Error updating Garmin auto-sync:', e);
      addNotification('Failed to update Garmin auto-sync setting', 'error');
    }
  };

  const handleDisconnectGarmin = async () => {
    try {
      const ok = window.confirm('Disconnect your Garmin account? Auto-sync will be turned off.');
      if (!ok) return;

      const token = getStoredAuthToken();

      // Invalidate the integration status cache BEFORE anything else so the
      // checkIntegrationStatus effect can't overwrite our state with a stale cached response.
      invalidateCache('/api/integrations/status');

      // Update UI immediately — don't wait for profile re-fetch
      setGarminConnected(false);
      setGarminAutoSync(false);

      const resp = await fetch(`${API_BASE_URL}/api/integrations/garmin/disconnect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        // Revert UI on failure
        setGarminConnected(true);
        throw new Error(data.error || 'Failed to disconnect Garmin');
      }

      // Reload profile so AuthProvider and userUpdated listeners reflect the change
      const profileResponse = await fetch(`${API_BASE_URL}/user/profile`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (profileResponse.ok) {
        const updatedUser = await profileResponse.json();
        saveUserToStorage(updatedUser);
        window.dispatchEvent(new CustomEvent('userUpdated', { detail: updatedUser }));
      }

      addNotification('Garmin disconnected successfully', 'success');
    } catch (e) {
      console.error('Disconnect Garmin error:', e);
      addNotification(e.message || 'Failed to disconnect Garmin', 'error');
    }
  };

  const handleToggleAutoSync = async (enabled) => {
    if (isTogglingStravaAutoSync) return;
    const token = localStorage.getItem('authToken') || localStorage.getItem('token');
    if (!token) {
      addNotification('Missing auth token, please log in again', 'error');
      return;
    }

    try {
      setIsTogglingStravaAutoSync(true);
      const response = await fetch(`${API_BASE_URL}/api/integrations/strava/auto-sync`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ autoSync: enabled })
      });

      if (response.ok) {
        await response.json();
        setStravaAutoSync(enabled);
        addNotification(`Auto-sync ${enabled ? 'enabled' : 'disabled'}`, 'success');
        
        // Update user object in localStorage and AuthProvider
        try {
          const profileResponse = await fetch(`${API_BASE_URL}/user/profile`, {
            headers: {
              'Authorization': `Bearer ${token}`
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
        
        // If enabling, trigger immediate sync. User just flipped the toggle
        // → force = true so the server's cooldown doesn't swallow the call.
        if (enabled) {
          try {
            const syncRes = await autoSyncStravaActivities({ force: true });
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
    } finally {
      setIsTogglingStravaAutoSync(false);
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

  const handleSaveBranding = async () => {
    setBrandingSaving(true);
    try {
      const res = await updateUserProfile({ coachBranding });
      // Propagate updated user (with coachBranding) to AuthProvider + localStorage
      const updatedUser = res?.data ?? res;
      if (updatedUser?._id) {
        // Persist to localStorage immediately (don't rely solely on event chain)
        saveUserToStorage(updatedUser);
        window.dispatchEvent(new CustomEvent('userUpdated', { detail: updatedUser }));
        // Update local form state directly from the saved response so fields
        // remain filled even if the useEffect / event timing is off
        const saved = updatedUser.coachBranding;
        if (saved) {
          setCoachBranding({
            logoUrl:      saved.logoUrl      || '',
            title:        saved.title        || '',
            trademark:    saved.trademark    || '',
            primaryColor: saved.primaryColor || '#767EB5',
          });
        }
      }
      addNotification('Branding saved successfully', 'success');
    } catch (e) {
      addNotification('Failed to save branding', 'error');
    } finally {
      setBrandingSaving(false);
    }
  };

  const handleSaveName = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(API_ENDPOINTS.EDIT_PROFILE, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: nameForm.name.trim(), surname: nameForm.surname.trim() })
      });
      if (response.ok) {
        const updated = await response.json();
        window.dispatchEvent(new CustomEvent('userUpdated', { detail: updated }));
        saveUserToStorage(updated);
        addNotification('Name updated successfully', 'success');
        setEditingName(false);
      } else {
        addNotification('Failed to update name', 'error');
      }
    } catch (e) {
      console.error('Error updating name:', e);
      addNotification('Failed to update name', 'error');
    }
  };

  const handleSaveRole = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(API_ENDPOINTS.EDIT_PROFILE, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ role: roleForm })
      });

      if (response.ok) {
        const updated = await response.json();
        window.dispatchEvent(new CustomEvent('userUpdated', { detail: updated }));
        saveUserToStorage(updated);
        addNotification('Role updated successfully', 'success');
        setEditingRole(false);
      } else {
        addNotification('Failed to update role', 'error');
      }
    } catch (e) {
      console.error('Error updating role:', e);
      addNotification('Failed to update role', 'error');
    }
  };

  const handleGdprExport = async () => {
    try {
      setIsGdprExporting(true);
      const data = await fetchGdprExportJson();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const stamp = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `lachart-gdpr-export-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      addNotification('Your data export has been downloaded.', 'success');
    } catch (error) {
      console.error('GDPR export error:', error);
      const msg =
        error?.response?.data?.error ||
        error?.message ||
        'Failed to export data';
      addNotification(msg, 'error');
    } finally {
      setIsGdprExporting(false);
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

  const handleRemoveCoach = async (coachId = null) => {
    const msg = coachId
      ? 'Remove this coach from your account?'
      : 'Remove all coaches from your account?';
    if (!window.confirm(msg)) {
      return;
    }

    try {
      setIsLoading(true);
      const url = coachId
        ? `${API_ENDPOINTS.REMOVE_COACH}?coachId=${encodeURIComponent(coachId)}`
        : API_ENDPOINTS.REMOVE_COACH;
      const response = await fetch(url, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (response.ok) {
        await fetchMyCoaches();
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

      const authData = await authResult.json().catch(() => ({}));
      if (!authResult.ok) {
        addNotification(authData.error || 'Google authentication failed', 'error');
        return;
      }

      const { token, user: googleUser } = authData;
      if (!token || !googleUser) {
        addNotification('Google authentication failed', 'error');
        return;
      }

      // Server links Google on POST /user/google-auth; there is no separate link-social route.
      const prev = (() => {
        try {
          return JSON.parse(localStorage.getItem('user') || '{}');
        } catch {
          return {};
        }
      })();
      const merged = { ...prev, ...googleUser };

      await login(null, null, token, merged);
      setLinkedAccounts(prevState => ({ ...prevState, google: !!merged.googleId }));
      addNotification('Google account linked successfully', 'success');
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
      fetchMyCoaches();
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
                  {editingName ? (
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="text"
                        value={nameForm.name}
                        onChange={(e) => setNameForm(prev => ({ ...prev, name: e.target.value }))}
                        placeholder="First name"
                        className={`${isMobile ? 'text-xs px-2 py-1' : 'text-sm px-3 py-2'} border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary flex-1`}
                      />
                      <input
                        type="text"
                        value={nameForm.surname}
                        onChange={(e) => setNameForm(prev => ({ ...prev, surname: e.target.value }))}
                        placeholder="Last name"
                        className={`${isMobile ? 'text-xs px-2 py-1' : 'text-sm px-3 py-2'} border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary flex-1`}
                      />
                      <div className="flex gap-1.5">
                        <button
                          onClick={handleSaveName}
                          className={`${isMobile ? 'px-2 py-1 text-[10px]' : 'px-3 py-2 text-sm'} bg-primary text-white rounded-lg hover:bg-primary-dark`}
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingName(false)}
                          className={`${isMobile ? 'px-2 py-1 text-[10px]' : 'px-3 py-2 text-sm'} bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200`}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <p className={`${isMobile ? 'text-xs' : 'text-base'} text-gray-900 break-words`}>
                        {user?.name}{user?.surname ? ` ${user.surname}` : ''} {!user?.name && 'N/A'}
                      </p>
                      <button
                        onClick={() => {
                          setNameForm({ name: user?.name || '', surname: user?.surname || '' });
                          setEditingName(true);
                        }}
                        className={`${isMobile ? 'p-0.5' : 'p-1'} text-gray-400 hover:text-primary transition-colors`}
                      >
                        <svg className={`${isMobile ? 'w-3 h-3' : 'w-4 h-4'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
                <div>
                  <label className={`block ${isMobile ? 'text-[10px]' : 'text-sm'} font-medium text-gray-700 ${isMobile ? 'mb-0.5' : 'mb-1'}`}>Email</label>
                  <p className={`${isMobile ? 'text-xs' : 'text-base'} text-gray-900 break-words`}>{user?.email || 'N/A'}</p>
                </div>
                <div>
                  <label className={`block ${isMobile ? 'text-[10px]' : 'text-sm'} font-medium text-gray-700 ${isMobile ? 'mb-0.5' : 'mb-1'}`}>Role</label>
                  {!editingRole ? (
                    <div className="flex items-center gap-2">
                      <p className={`${isMobile ? 'text-xs' : 'text-base'} text-gray-900 capitalize`}>{user?.role || 'N/A'}</p>
                      <button
                        onClick={() => {
                          setRoleForm(user?.role || 'athlete');
                          setEditingRole(true);
                        }}
                        className={`${isMobile ? 'p-0.5' : 'p-1'} text-gray-400 hover:text-primary transition-colors`}
                        aria-label="Edit role"
                      >
                        <svg className={`${isMobile ? 'w-3 h-3' : 'w-4 h-4'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center gap-3">
                        <label className="flex items-center gap-2 text-sm text-gray-900">
                          <input
                            type="radio"
                            name="role"
                            value="athlete"
                            checked={roleForm === 'athlete'}
                            onChange={() => setRoleForm('athlete')}
                          />
                          Athlete
                        </label>
                        <label className="flex items-center gap-2 text-sm text-gray-900">
                          <input
                            type="radio"
                            name="role"
                            value="coach"
                            checked={roleForm === 'coach'}
                            onChange={() => setRoleForm('coach')}
                          />
                          Coach
                        </label>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={handleSaveRole}
                          className={`${isMobile ? 'px-2 py-1 text-[10px]' : 'px-3 py-2 text-sm'} bg-primary text-white rounded-lg hover:bg-primary-dark`}
                        >
                          Save
                        </button>
                        <button
                          onClick={() => {
                            setRoleForm(user?.role || 'athlete');
                            setEditingRole(false);
                          }}
                          className={`${isMobile ? 'px-2 py-1 text-[10px]' : 'px-3 py-2 text-sm'} bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200`}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className={`bg-white ${isMobile ? 'rounded-md' : 'rounded-lg'} shadow-md ${isMobile ? 'p-2.5' : 'p-6'} border border-slate-100`}>
              <div className="flex gap-3 min-w-0">
                <div className={`shrink-0 rounded-lg bg-slate-50 p-2 text-slate-600 ${isMobile ? 'mt-0.5' : ''}`}>
                  <Globe className={isMobile ? 'w-4 h-4' : 'w-5 h-5'} aria-hidden />
                </div>
                <div className="min-w-0 flex-1 space-y-2">
                  <h3 className={`${isMobile ? 'text-sm' : 'text-xl'} font-bold text-gray-900`}>Account origin</h3>
                  <div className={`${isMobile ? 'text-[10px] space-y-1' : 'text-sm space-y-1.5'} text-gray-700`}>
                    <p>
                      <span className="font-medium text-gray-800">Sign-up: </span>
                      {SIGNUP_METHOD_LABELS[user?.signupMethod] || SIGNUP_METHOD_LABELS.unknown}
                      {user?.signupMethodSource === 'inferred' && (
                        <span className="text-gray-500"> — estimated from your login method (not stored for some older accounts)</span>
                      )}
                      {user?.signupMethodSource === 'unknown' && (
                        <span className="text-gray-500"> — not enough information on file</span>
                      )}
                    </p>
                    {formatAccountCreatedAt(user?.createdAt) && (
                      <p>
                        <span className="font-medium text-gray-800">Account created: </span>
                        {formatAccountCreatedAt(user.createdAt)}
                      </p>
                    )}
                    {(() => {
                      const locLine = formatRegistrationLocationLine(user?.registrationLocation);
                      if (!locLine) return null;
                      return (
                        <p>
                          <span className="font-medium text-gray-800">Approximate location when recorded: </span>
                          {locLine}
                        </p>
                      );
                    })()}
                    {!user?.registrationLocation && user?.signupMethodSource !== 'unknown' && (
                      <p className="text-gray-500">
                        Registration location is only saved for newer sign-ups; older accounts may not show a place.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className={`bg-white ${isMobile ? 'rounded-md' : 'rounded-lg'} shadow-md ${isMobile ? 'p-2.5' : 'p-6'} border border-teal-100`}>
              <div className={`flex ${isMobile ? 'flex-col gap-2' : 'items-start justify-between gap-4'}`}>
                <div className="flex gap-3 min-w-0">
                  <div className={`shrink-0 ${isMobile ? 'mt-0.5' : 'mt-0.5'} rounded-lg bg-teal-50 p-2 text-teal-700`}>
                    <Compass className={isMobile ? 'w-4 h-4' : 'w-5 h-5'} aria-hidden />
                  </div>
                  <div>
                    <h3 className={`${isMobile ? 'text-sm' : 'text-xl'} font-bold text-gray-900`}>App walkthrough</h3>
                    <p className={`${isMobile ? 'text-[10px] mt-0.5' : 'text-sm mt-1'} text-gray-600`}>
                      Interactive tour: Strava, Testing, lactate tests, email/PDF — tailored for athletes and coaches.
                    </p>
                  </div>
                </div>
                <div className={`flex ${isMobile ? 'w-full flex-col' : ''} gap-2`}>
                  <button
                    type="button"
                    onClick={() => {
                      if (user?._id) localStorage.removeItem(INTRO_SEEN_KEY(user._id));
                      setShowIntroTutorial(true);
                    }}
                    className={`shrink-0 ${isMobile ? 'w-full' : ''} inline-flex items-center justify-center gap-2 font-semibold rounded-lg bg-[#767EB5] text-white hover:bg-[#5f6a9e] focus:outline-none focus:ring-2 focus:ring-[#767EB5] focus:ring-offset-2 ${isMobile ? 'px-3 py-2 text-xs' : 'px-4 py-2.5 text-sm'}`}
                  >
                    <svg viewBox="0 0 24 24" className={isMobile ? 'w-3 h-3' : 'w-4 h-4'} fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M5 3l14 9-14 9V3z" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    Intro Tutorial
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      window.dispatchEvent(new CustomEvent('lachart:openWalkthrough'));
                    }}
                    className={`shrink-0 ${isMobile ? 'w-full' : ''} inline-flex items-center justify-center gap-2 font-semibold rounded-lg bg-teal-600 text-white hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 ${isMobile ? 'px-3 py-2 text-xs' : 'px-4 py-2.5 text-sm'}`}
                  >
                    App Walkthrough
                  </button>
                </div>
              </div>
            </div>

            <div className={`bg-white ${isMobile ? 'rounded-md' : 'rounded-lg'} shadow-md ${isMobile ? 'p-2.5' : 'p-6'} border border-emerald-100`}>
              <div className="flex gap-3 min-w-0">
                <div className={`shrink-0 rounded-lg bg-emerald-50 p-2 text-emerald-700 ${isMobile ? 'mt-0.5' : ''}`}>
                  <Database className={isMobile ? 'w-4 h-4' : 'w-5 h-5'} aria-hidden />
                </div>
                <div className="min-w-0 flex-1 space-y-3">
                  <div>
                    <h3 className={`${isMobile ? 'text-sm' : 'text-xl'} font-bold text-gray-900`}>Export all data (GDPR)</h3>
                    <p className={`${isMobile ? 'text-[10px]' : 'text-sm'} text-gray-600 ${isMobile ? 'mt-0.5' : 'mt-1'}`}>
                      Download a complete copy of your LaChart data as JSON (machine-readable).
                    </p>
                  </div>
                  <div className={`rounded-lg border border-emerald-100 bg-emerald-50/60 ${isMobile ? 'p-2 text-[10px]' : 'p-4 text-sm'} text-gray-800 space-y-2`}>
                    <p>
                      Includes your profile (zones, preferences), training log entries, imported activities (Strava / Garmin metadata and laps),
                      lactate tests, FIT-derived summaries (per-second streams omitted), lactate sessions, protocol templates linked to you,
                      subscription summary, audit-style events, and comments on your tests.
                    </p>
                    <ul className={`${isMobile ? 'space-y-0.5' : 'space-y-1'} list-none`}>
                      <li className="flex gap-2">
                        <span className="text-emerald-600 shrink-0">✓</span>
                        <span>Structured JSON for spreadsheets or archival</span>
                      </li>
                      <li className="flex gap-2">
                        <span className="text-emerald-600 shrink-0">✓</span>
                        <span>Aligned with data removed when you delete your account</span>
                      </li>
                    </ul>
                    <p className={`flex gap-2 ${isMobile ? 'text-[9px]' : 'text-xs'} text-sky-800`}>
                      <Info className="shrink-0 mt-0.5" size={13} aria-hidden />
                      <span>FIT per-second <code className="rounded bg-white/80 px-0.5">records</code> and bulky third-party <code className="rounded bg-white/80 px-0.5">raw</code> payloads are excluded for size; contact support if you need originals.</span>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleGdprExport}
                    disabled={isGdprExporting}
                    className={`inline-flex items-center justify-center gap-2 font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${isMobile ? 'px-3 py-2 text-xs w-full' : 'px-4 py-2.5 text-sm'}`}
                  >
                    <Database className={isMobile ? 'h-3.5 w-3.5' : 'h-4 w-4'} aria-hidden />
                    {isGdprExporting ? 'Preparing export…' : 'Export all data'}
                  </button>
                </div>
              </div>
            </div>

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
              <h3 className={`${isMobile ? 'text-sm' : 'text-xl'} font-bold text-gray-900 ${isMobile ? 'mb-2' : 'mb-6'}`}>Linked Social Accounts</h3>
                <div className={`flex ${isMobile ? 'flex-col' : 'items-center justify-between'} ${isMobile ? 'gap-2' : ''}`}>
                  <div className="flex items-center">
                    <img src="/icon/google.svg" alt="Google" className={isMobile ? 'h-4 w-4 mr-1' : 'h-6 w-6 mr-2'} />
                    <span className={isMobile ? 'text-xs' : ''}>Google</span>
                  </div>
                  {linkedAccounts.google ? (
                    <span className={`${isMobile ? 'text-xs' : ''} text-green-500`}>Connected</span>
                  ) : isCapacitorNative() ? (
                    <span className={`${isMobile ? 'text-xs' : 'text-sm'} text-gray-500`}>
                      Link Google on lachart.net in a browser
                    </span>
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

      case 'units': // merged into 'training' — fall through

      case 'training':
        return (
          <div className={`bg-white ${isMobile ? 'rounded-md' : 'rounded-lg'} shadow-md ${isMobile ? 'p-2.5' : 'p-6'}`}>
            <h3 className={`${isMobile ? 'text-sm' : 'text-xl'} font-bold text-gray-900 ${isMobile ? 'mb-2' : 'mb-6'}`}>Preferences</h3>
            <div className={`${isMobile ? 'space-y-4' : 'space-y-8'}`}>

              {/* ── Units ───────────────────────────────────────────────────── */}
              <div>
                <p className={`${isMobile ? 'text-xs' : 'text-base'} font-bold text-gray-800 ${isMobile ? 'mb-2' : 'mb-4'}`}>Units</p>
                <div className={`${isMobile ? 'space-y-2.5' : 'space-y-4'}`}>
                  <div>
                    <label className={`block ${isMobile ? 'text-[10px]' : 'text-sm'} font-medium text-gray-700 ${isMobile ? 'mb-1' : 'mb-1.5'}`}>Distance</label>
                    <div className={`flex ${isMobile ? 'flex-col gap-1.5' : 'gap-4'}`}>
                      {[{ value: 'metric', label: 'Metric (km, m)' }, { value: 'imperial', label: 'Imperial (miles, feet)' }].map(opt => (
                        <label key={opt.value} className={`flex items-center gap-2 cursor-pointer ${isMobile ? 'text-xs' : 'text-sm'}`}>
                          <input type="radio" name="distance" value={opt.value} checked={units.distance === opt.value} onChange={e => saveUnits({ ...units, distance: e.target.value })} className="accent-primary" />
                          <span className="text-gray-700">{opt.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className={`block ${isMobile ? 'text-[10px]' : 'text-sm'} font-medium text-gray-700 ${isMobile ? 'mb-1' : 'mb-1.5'}`}>Weight</label>
                    <div className={`flex ${isMobile ? 'flex-col gap-1.5' : 'gap-4'}`}>
                      {[{ value: 'kg', label: 'Kilograms (kg)' }, { value: 'lbs', label: 'Pounds (lbs)' }].map(opt => (
                        <label key={opt.value} className={`flex items-center gap-2 cursor-pointer ${isMobile ? 'text-xs' : 'text-sm'}`}>
                          <input type="radio" name="weight" value={opt.value} checked={units.weight === opt.value} onChange={e => saveUnits({ ...units, weight: e.target.value })} className="accent-primary" />
                          <span className="text-gray-700">{opt.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className={`block ${isMobile ? 'text-[10px]' : 'text-sm'} font-medium text-gray-700 ${isMobile ? 'mb-1' : 'mb-1.5'}`}>Temperature</label>
                    <div className={`flex ${isMobile ? 'flex-col gap-1.5' : 'gap-4'}`}>
                      {[{ value: 'celsius', label: 'Celsius (°C)' }, { value: 'fahrenheit', label: 'Fahrenheit (°F)' }].map(opt => (
                        <label key={opt.value} className={`flex items-center gap-2 cursor-pointer ${isMobile ? 'text-xs' : 'text-sm'}`}>
                          <input type="radio" name="temperature" value={opt.value} checked={units.temperature === opt.value} onChange={e => saveUnits({ ...units, temperature: e.target.value })} className="accent-primary" />
                          <span className="text-gray-700">{opt.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* divider */}
              <div className="border-t border-gray-100" />

              {/* ── Training Preferences heading ────────────────────────────── */}
              <div className={`${isMobile ? '-mt-2' : '-mt-4'}`}>
                <p className={`${isMobile ? 'text-xs' : 'text-base'} font-bold text-gray-800 ${isMobile ? 'mb-2' : 'mb-4'}`}>Training Preferences</p>
              </div>

              {/* RPE / Borg Scale */}
              <div>
                <label className={`block ${isMobile ? 'text-xs' : 'text-sm'} font-semibold text-gray-700 mb-1`}>Perceived Exertion Scale</label>
                <p className={`${isMobile ? 'text-[10px]' : 'text-xs'} text-gray-400 mb-3`}>Choose how you rate effort during training sessions.</p>
                <div className={`flex ${isMobile ? 'flex-col gap-2' : 'gap-4'}`}>
                  {[
                    { value: 'rpe', label: 'RPE', sub: 'Rating of Perceived Exertion (1–10)', example: 'Easy = 3, Hard = 8, Max = 10' },
                    { value: 'borg', label: 'Borg Scale', sub: 'Borg CR10 / RPE (6–20)', example: 'Easy = 10, Hard = 15, Max = 20' },
                  ].map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => saveTrainingPrefs({ ...trainingPrefs, rpeScale: opt.value })}
                      className={`flex-1 text-left rounded-xl border-2 px-4 py-3 transition-all ${trainingPrefs.rpeScale === opt.value ? 'border-primary bg-primary/5' : 'border-gray-200 hover:border-gray-300'}`}
                    >
                      <div className={`font-semibold ${isMobile ? 'text-xs' : 'text-sm'} ${trainingPrefs.rpeScale === opt.value ? 'text-primary' : 'text-gray-800'}`}>{opt.label}</div>
                      <div className={`${isMobile ? 'text-[10px]' : 'text-xs'} text-gray-500 mt-0.5`}>{opt.sub}</div>
                      <div className={`${isMobile ? 'text-[9px]' : 'text-[11px]'} text-gray-400 mt-1`}>{opt.example}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Pace Display */}
              <div>
                <label className={`block ${isMobile ? 'text-xs' : 'text-sm'} font-semibold text-gray-700 mb-1`}>Running Pace Display</label>
                <p className={`${isMobile ? 'text-[10px]' : 'text-xs'} text-gray-400 mb-3`}>How running speed is shown in training logs and test results.</p>
                <div className={`flex ${isMobile ? 'flex-col gap-2' : 'gap-4'}`}>
                  {[
                    { value: 'minpkm', label: 'min/km', sub: 'Pace format', example: 'e.g. 4:30 min/km' },
                    { value: 'kmh', label: 'km/h', sub: 'Speed format', example: 'e.g. 13.3 km/h' },
                  ].map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => saveTrainingPrefs({ ...trainingPrefs, paceDisplay: opt.value })}
                      className={`flex-1 text-left rounded-xl border-2 px-4 py-3 transition-all ${trainingPrefs.paceDisplay === opt.value ? 'border-primary bg-primary/5' : 'border-gray-200 hover:border-gray-300'}`}
                    >
                      <div className={`font-semibold ${isMobile ? 'text-xs' : 'text-sm'} ${trainingPrefs.paceDisplay === opt.value ? 'text-primary' : 'text-gray-800'}`}>{opt.label}</div>
                      <div className={`${isMobile ? 'text-[10px]' : 'text-xs'} text-gray-500 mt-0.5`}>{opt.sub}</div>
                      <div className={`${isMobile ? 'text-[9px]' : 'text-[11px]'} text-gray-400 mt-1`}>{opt.example}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Zones Method */}
              <div>
                <label className={`block ${isMobile ? 'text-xs' : 'text-sm'} font-semibold text-gray-700 mb-1`}>Zones Calculation Method</label>
                <p className={`${isMobile ? 'text-[10px]' : 'text-xs'} text-gray-400 mb-3`}>How your training zones are calculated.</p>
                <div className={`flex ${isMobile ? 'flex-col gap-2' : 'gap-3'}`}>
                  {[
                    { value: 'lactate', label: 'Lactate Thresholds', sub: 'Zones based on LT1 & LT2 from your lactate tests', recommended: true },
                    { value: 'hrmax', label: 'Max Heart Rate %', sub: 'Zones based on percentage of your maximum HR' },
                    { value: 'ftp', label: 'FTP / Critical Power', sub: 'Zones based on percentage of your FTP (cycling)' },
                  ].map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => saveTrainingPrefs({ ...trainingPrefs, zonesMethod: opt.value })}
                      className={`w-full text-left rounded-xl border-2 px-4 py-3 transition-all ${trainingPrefs.zonesMethod === opt.value ? 'border-primary bg-primary/5' : 'border-gray-200 hover:border-gray-300'}`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`font-semibold ${isMobile ? 'text-xs' : 'text-sm'} ${trainingPrefs.zonesMethod === opt.value ? 'text-primary' : 'text-gray-800'}`}>{opt.label}</span>
                        {opt.recommended && <span className="text-[10px] bg-green-100 text-green-700 font-medium px-2 py-0.5 rounded-full">Recommended</span>}
                      </div>
                      <div className={`${isMobile ? 'text-[10px]' : 'text-xs'} text-gray-500 mt-0.5`}>{opt.sub}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Zone Labels & Boundaries */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className={`block ${isMobile ? 'text-xs' : 'text-sm'} font-semibold text-gray-700`}>Custom Zone Boundaries</label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <span className={`${isMobile ? 'text-[10px]' : 'text-xs'} text-gray-500`}>{trainingPrefs.customZones?.enabled ? 'Enabled' : 'Disabled'}</span>
                    <div
                      onClick={() => saveTrainingPrefs({ ...trainingPrefs, customZones: { ...trainingPrefs.customZones, enabled: !trainingPrefs.customZones?.enabled } })}
                      className={`relative w-10 h-5 rounded-full cursor-pointer transition-colors ${trainingPrefs.customZones?.enabled ? 'bg-primary' : 'bg-gray-300'}`}
                    >
                      <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${trainingPrefs.customZones?.enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </div>
                  </label>
                </div>
                <p className={`${isMobile ? 'text-[10px]' : 'text-xs'} text-gray-400 mb-3`}>Override the default zone names and % boundaries. Used in all charts and reports.</p>
                {trainingPrefs.customZones?.enabled && (
                  <div className="space-y-2">
                    {[1,2,3,4,5].map(z => {
                      const key = `zone${z}`;
                      const zone = trainingPrefs.customZones?.[key] || {};
                      const colors = ['bg-blue-50 border-blue-200','bg-green-50 border-green-200','bg-yellow-50 border-yellow-200','bg-orange-50 border-orange-200','bg-red-50 border-red-200'];
                      return (
                        <div key={key} className={`flex items-center gap-2 rounded-lg border p-2 ${colors[z-1]}`}>
                          <span className={`${isMobile ? 'text-[10px]' : 'text-xs'} font-bold text-gray-500 w-5`}>Z{z}</span>
                          <input
                            type="text"
                            defaultValue={zone.label || `Zone ${z}`}
                            onBlur={e => {
                              const updated = { ...trainingPrefs, customZones: { ...trainingPrefs.customZones, [key]: { ...zone, label: e.target.value } } };
                              saveTrainingPrefs(updated);
                            }}
                            placeholder={`Zone ${z} name`}
                            className={`flex-1 border border-gray-200 rounded px-2 py-1 ${isMobile ? 'text-[10px]' : 'text-xs'} bg-white focus:outline-none focus:ring-1 focus:ring-primary`}
                          />
                          <input
                            type="number"
                            defaultValue={zone.min ?? ''}
                            onBlur={e => {
                              const updated = { ...trainingPrefs, customZones: { ...trainingPrefs.customZones, [key]: { ...zone, min: Number(e.target.value) } } };
                              saveTrainingPrefs(updated);
                            }}
                            placeholder="Min %"
                            className={`w-14 border border-gray-200 rounded px-2 py-1 ${isMobile ? 'text-[10px]' : 'text-xs'} bg-white focus:outline-none focus:ring-1 focus:ring-primary`}
                          />
                          <span className={`${isMobile ? 'text-[10px]' : 'text-xs'} text-gray-400`}>–</span>
                          <input
                            type="number"
                            defaultValue={zone.max ?? ''}
                            onBlur={e => {
                              const updated = { ...trainingPrefs, customZones: { ...trainingPrefs.customZones, [key]: { ...zone, max: Number(e.target.value) } } };
                              saveTrainingPrefs(updated);
                            }}
                            placeholder="Max %"
                            className={`w-14 border border-gray-200 rounded px-2 py-1 ${isMobile ? 'text-[10px]' : 'text-xs'} bg-white focus:outline-none focus:ring-1 focus:ring-primary`}
                          />
                          <span className={`${isMobile ? 'text-[10px]' : 'text-xs'} text-gray-400`}>%</span>
                        </div>
                      );
                    })}
                    {savingTrainingPrefs && <p className="text-[11px] text-primary animate-pulse">Saving...</p>}
                  </div>
                )}
              </div>

            </div>

            {/* ── Strava Connection ─────────────────────────────────────────── */}
            <div className={`${isMobile ? 'mt-4 pt-4' : 'mt-8 pt-8'} border-t border-gray-100`}>
              <h4 className={`${isMobile ? 'text-xs' : 'text-sm'} font-bold text-gray-700 ${isMobile ? 'mb-2' : 'mb-4'} uppercase tracking-wider`}>Connect Strava</h4>
              <div className={`flex items-center justify-between rounded-xl border-2 ${stravaConnected ? 'border-orange-200 bg-orange-50' : 'border-gray-200 bg-gray-50'} ${isMobile ? 'px-3 py-2.5' : 'px-5 py-4'}`}>
                <div className="flex items-center gap-3 min-w-0">
                  {!stravaLogoError ? (
                    <img src="/icon/strava.png" alt="Strava" className={`${isMobile ? 'w-7 h-7' : 'w-9 h-9'} flex-shrink-0`} onError={() => setStravaLogoError(true)} />
                  ) : (
                    <div className={`${isMobile ? 'w-7 h-7' : 'w-9 h-9'} rounded-lg bg-orange-500 flex items-center justify-center flex-shrink-0`}><span className="text-white font-bold text-sm">S</span></div>
                  )}
                  <div className="min-w-0">
                    <p className={`${isMobile ? 'text-xs' : 'text-sm'} font-semibold text-gray-800`}>Strava</p>
                    <p className={`${isMobile ? 'text-[10px]' : 'text-xs'} ${stravaConnected ? 'text-orange-600' : 'text-gray-400'}`}>
                      {stravaConnected ? 'Connected — activities sync automatically' : 'Not connected'}
                    </p>
                  </div>
                </div>
                <div className={`flex items-center gap-2 flex-shrink-0 ml-2`}>
                  {stravaConnected && (user?.admin || user?.role === 'admin') && (
                    <button
                      onClick={handleResetStravaBudget}
                      title="Reset the server's Strava rate-limit estimator. Use when 'Sync now' bounces with 429 even though Strava itself is fine."
                      className={`${isMobile ? 'px-2 py-1 text-[10px]' : 'px-3 py-1.5 text-xs'} rounded-lg bg-white border border-amber-300 text-amber-700 hover:bg-amber-50 font-medium transition-colors`}
                    >
                      Reset budget
                    </button>
                  )}
                  {stravaConnected && (
                    <button
                      onClick={handleSyncStrava}
                      disabled={isSyncingStrava}
                      className={`${isMobile ? 'px-2 py-1 text-[10px]' : 'px-3 py-1.5 text-xs'} rounded-lg bg-white border border-orange-200 text-orange-600 hover:bg-orange-50 font-medium transition-colors disabled:opacity-50`}
                    >
                      {isSyncingStrava ? 'Syncing…' : 'Sync now'}
                    </button>
                  )}
                  <button
                    onClick={handleConnectStrava}
                    className={`${isMobile ? 'px-2.5 py-1 text-[10px]' : 'px-3 py-1.5 text-xs'} rounded-lg font-semibold transition-colors ${stravaConnected ? 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-100' : 'bg-primary text-white hover:bg-primary-dark'}`}
                  >
                    {stravaConnected ? 'Reconnect' : 'Connect'}
                  </button>
                </div>
              </div>
            </div>

            {/* ── Coach Connection ──────────────────────────────────────────── */}
            {user?.role === 'athlete' && (
              <div className={`${isMobile ? 'mt-4 pt-4' : 'mt-6 pt-6'} border-t border-gray-100`}>
                <h4 className={`${isMobile ? 'text-xs' : 'text-sm'} font-bold text-gray-700 ${isMobile ? 'mb-2' : 'mb-4'} uppercase tracking-wider`}>Your Coach</h4>

                {myCoaches.length > 0 ? (
                  <div className={`${isMobile ? 'space-y-2 mb-3' : 'space-y-2 mb-4'}`}>
                    {myCoaches.map(c => (
                      <div key={String(c._id)} className={`flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 ${isMobile ? 'px-3 py-2' : 'px-4 py-3'}`}>
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className={`${isMobile ? 'w-7 h-7' : 'w-8 h-8'} rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0`}>
                            <User className={`${isMobile ? 'w-3.5 h-3.5' : 'w-4 h-4'} text-primary`} />
                          </div>
                          <div className="min-w-0">
                            <p className={`${isMobile ? 'text-xs' : 'text-sm'} font-semibold text-gray-800 truncate`}>{c.name} {c.surname}</p>
                            <p className={`${isMobile ? 'text-[10px]' : 'text-xs'} text-gray-400 truncate`}>{c.email}</p>
                          </div>
                        </div>
                        <button
                          onClick={() => handleRemoveCoach(c._id)}
                          disabled={isLoading}
                          className={`flex items-center gap-1 flex-shrink-0 ml-2 ${isMobile ? 'text-[10px] px-2 py-1' : 'text-xs px-2.5 py-1.5'} text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors`}
                        >
                          <UserMinus className={`${isMobile ? 'w-3 h-3' : 'w-3.5 h-3.5'}`} />
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className={`${isMobile ? 'text-[10px]' : 'text-xs'} text-gray-400 ${isMobile ? 'mb-2' : 'mb-3'}`}>No coach connected yet. Enter your coach's email to send an invitation.</p>
                )}

                <form onSubmit={handleCoachChange} className="flex gap-2">
                  <input
                    type="email"
                    value={formData.newCoachEmail}
                    onChange={e => setFormData(prev => ({ ...prev, newCoachEmail: e.target.value }))}
                    placeholder="coach@example.com"
                    required
                    className={`flex-1 border border-gray-200 rounded-lg ${isMobile ? 'px-2.5 py-1.5 text-xs' : 'px-3 py-2 text-sm'} focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary`}
                  />
                  <button
                    type="submit"
                    disabled={isLoading}
                    className={`flex items-center gap-1.5 ${isMobile ? 'px-2.5 py-1.5 text-[10px]' : 'px-3 py-2 text-xs'} font-semibold text-white bg-primary hover:bg-primary-dark rounded-lg transition-colors disabled:opacity-50 flex-shrink-0`}
                  >
                    <UserPlus className={`${isMobile ? 'w-3 h-3' : 'w-3.5 h-3.5'}`} />
                    {isLoading ? 'Sending…' : 'Invite'}
                  </button>
                </form>
              </div>
            )}

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
                    onChange={(e) => {
                      const enabled = e.target.checked;
                      const next = enabled
                        ? { ...notifications, emailNotifications: true }
                        : {
                            ...notifications,
                            emailNotifications: false,
                            trainingReminders: false,
                            weeklyReports: false,
                            achievementAlerts: false,
                            trainingComments: false
                          };
                      saveNotifications(next);
                    }}
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

              <div className={`flex items-center justify-between ${isMobile ? 'py-1.5' : 'py-3'} border-b`}>
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

              <div className={`flex items-center justify-between ${isMobile ? 'py-1.5' : 'py-3'} border-t mt-2 pt-2`}>
                <div className="flex-1 min-w-0 pr-2">
                  <label className={`${isMobile ? 'text-[10px]' : 'text-sm'} font-medium text-gray-900`}>Training Comments</label>
                  <p className={`${isMobile ? 'text-[9px]' : 'text-sm'} text-gray-500`}>Email me when coach or athlete comments on a training</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={notifications.trainingComments !== false}
                    onChange={(e) => saveNotifications({ ...notifications, trainingComments: e.target.checked })}
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

            <div className={`${isMobile ? 'mt-4' : 'mt-8'} border-t ${isMobile ? 'pt-3' : 'pt-6'}`}>
              <h3 className={`${isMobile ? 'text-sm' : 'text-xl'} font-bold text-gray-900 ${isMobile ? 'mb-2' : 'mb-4'}`}>
                Push notifications
              </h3>
              <p className={`${isMobile ? 'text-[9px]' : 'text-sm'} text-gray-500 ${isMobile ? 'mb-2' : 'mb-4'}`}>
                Mobile app (Expo / iOS Android). You may need to allow notifications in system settings.
              </p>
              <div className={`${isMobile ? 'space-y-1.5' : 'space-y-4'}`}>
                <div className={`flex items-center justify-between ${isMobile ? 'py-1.5' : 'py-3'} border-b`}>
                  <div className="flex-1 min-w-0 pr-2">
                    <label className={`${isMobile ? 'text-[10px]' : 'text-sm'} font-medium text-gray-900`}>Strava imports</label>
                    <p className={`${isMobile ? 'text-[9px]' : 'text-sm'} text-gray-500`}>When new activities sync from Strava</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={notifications.pushStravaImport !== false}
                      onChange={(e) =>
                        saveNotifications({ ...notifications, pushStravaImport: e.target.checked })
                      }
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary" />
                  </label>
                </div>
                <div className={`flex items-center justify-between ${isMobile ? 'py-1.5' : 'py-3'}`}>
                  <div className="flex-1 min-w-0 pr-2">
                    <label className={`${isMobile ? 'text-[10px]' : 'text-sm'} font-medium text-gray-900`}>Lactate tests</label>
                    <p className={`${isMobile ? 'text-[9px]' : 'text-sm'} text-gray-500`}>When you save a test and follow-up reminders</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={notifications.pushLactateTest !== false}
                      onChange={(e) =>
                        saveNotifications({ ...notifications, pushLactateTest: e.target.checked })
                      }
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary" />
                  </label>
                </div>
              </div>
            </div>

            {(user?.admin || user?.role === 'admin') && (
              <div className={`${isMobile ? 'mt-3' : 'mt-6'} border-t pt-4`}>
                <h4 className={`${isMobile ? 'text-[10px]' : 'text-sm'} font-semibold text-gray-900 ${isMobile ? 'mb-2' : 'mb-3'}`}>Admin Tools</h4>
                <button
                  onClick={async () => {
                    try {
                      const response = await fetch(`${API_BASE_URL}/user/admin/send-weekly-reports/last-week`, {
                        method: 'POST',
                        headers: {
                          'Authorization': `Bearer ${localStorage.getItem('token')}`
                        }
                      });
                      const data = await response.json().catch(() => ({}));
                      if (!response.ok) {
                        throw new Error(data.error || 'Failed to send weekly reports');
                      }
                      addNotification(`Weekly reports sent: ${data?.result?.sent || 0}, skipped: ${data?.result?.skipped || 0}`, 'success');
                    } catch (e) {
                      console.error('Admin weekly report send failed:', e);
                      addNotification(e.message || 'Failed to send weekly reports', 'error');
                    }
                  }}
                  className={`${isMobile ? 'px-3 py-2 text-[10px] w-full' : 'px-4 py-2 text-sm'} bg-primary text-white ${isMobile ? 'rounded-md' : 'rounded-lg'} hover:bg-primary-dark transition-colors`}
                  title="Send last week's weekly report email to eligible users"
                >
                  Send mail for last week
                </button>
              </div>
            )}
          </div>
        );

      case 'subscription': {
        const currentPlan = subData?.subscription?.plan || 'free';
        const subStatus = subData?.subscription?.status;
        const isActive = subData?.subscription?.isActive;
        const cancelAtPeriodEnd = subData?.subscription?.cancelAtPeriodEnd;
        const periodEnd = subData?.subscription?.currentPeriodEnd;
        const systemEnabled = subData?.subscription?.systemEnabled;
        const hasPremium = subData?.isPremium ?? (user?.isPremium === true);
        const premiumSource = subData?.premiumSource || user?.premiumSource;
        const isManualPremium = premiumSource === 'manual';
        // User already used a trial if they have a trialStart date in their subscription
        const alreadyTrialed = !!subData?.subscription?.trialStart;
        const showTrial = !alreadyTrialed && currentPlan === 'free';

        // App Store guideline 3.1.1: iOS apps may not link to external
        // payment flows for digital content. On native we hide all
        // purchase / manage-on-Stripe buttons and show a status-only
        // view. Existing subscriptions purchased on the web continue to
        // work and unlock premium features in the app.
        const isNativeIos = isCapacitorNative();

        const PLANS_UI = [
          {
            id: 'free',
            name: 'Free',
            price: 0,
            priceLabel: '$0',
            period: '/ month',
            highlight: false,
            features: [
              'Up to 5 lactate tests/month',
              'Basic analytics',
              'Manual FIT file upload',
              'Strava & Garmin sync',
              'Calendar view',
            ],
          },
          {
            id: 'pro',
            name: 'Pro',
            price: 9.99,
            priceLabel: '$9.99',
            period: '/ month',
            highlight: true,
            badge: 'Most popular',
            trial: true,
            features: [
              'Unlimited lactate tests',
              'Advanced analytics & charts',
              'Population comparison',
              'PDF export',
              'Priority support',
              'Everything in Free',
            ],
          },
          {
            id: 'coach',
            name: 'Coach',
            price: 19.99,
            priceLabel: '$19.99',
            period: '/ month',
            highlight: false,
            trial: true,
            features: [
              'Up to 10 athletes',
              'Coach dashboard',
              'Athlete management',
              'Bulk data export',
              'Everything in Pro',
            ],
          },
        ];

        const formatPeriodEnd = (iso) => {
          if (!iso) return null;
          try {
            return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
          } catch { return null; }
        };

        return (
          <div className={`${isMobile ? 'space-y-3' : 'space-y-6'}`}>

            {/* Dev preview toggle */}
            {user?.role === 'admin' || hasPremium ? (
              <div className={`bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-900`}>
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!premiumPreviewNoAccess}
                    onChange={(e) => setPremiumPreviewNoAccess(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-amber-400 text-primary focus:ring-primary"
                  />
                  <span>
                    <span className="font-semibold block mb-0.5">Preview as non-premium user</span>
                    <span className="text-xs text-amber-700">Browser-only (localStorage). Lets you test the free-plan UI without touching the server.</span>
                  </span>
                </label>
              </div>
            ) : null}

            {/* Current plan status banner */}
            <div className={`bg-white border border-gray-200 rounded-2xl ${isMobile ? 'p-4' : 'p-6'} shadow-sm`}>
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Current plan</p>
                  <h3 className={`${isMobile ? 'text-lg' : 'text-2xl'} font-bold text-gray-900`}>
                    LaChart {currentPlan.charAt(0).toUpperCase() + currentPlan.slice(1)}
                  </h3>
                  {subStatus ? (
                    <p className="mt-1 text-xs text-gray-500 capitalize">
                      Billing status: {String(subStatus).replace(/_/g, ' ')}
                    </p>
                  ) : null}
                  {isManualPremium && (
                    <span className="inline-block mt-1 px-2 py-0.5 text-xs bg-purple-100 text-purple-700 rounded-full font-medium">Complimentary access</span>
                  )}
                  {!isManualPremium && isActive && currentPlan !== 'free' && (
                    <span className="inline-block mt-1 px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded-full font-medium">Active</span>
                  )}
                  {cancelAtPeriodEnd && periodEnd && (
                    <p className="mt-2 text-sm text-orange-600">
                      Cancels on {formatPeriodEnd(periodEnd)} — you keep access until then.
                    </p>
                  )}
                  {!cancelAtPeriodEnd && periodEnd && currentPlan !== 'free' && (
                    <p className="mt-1 text-xs text-gray-400">Renews {formatPeriodEnd(periodEnd)}</p>
                  )}
                </div>
                <div className="flex flex-col gap-2 items-end">
                  {/* Manage billing portal — web only. App Store 3.1.1
                      bans linking to Stripe customer portal from iOS apps. */}
                  {!isManualPremium && currentPlan !== 'free' && systemEnabled && !isNativeIos && (
                    <>
                      {cancelAtPeriodEnd ? (
                        <button
                          onClick={handleReactivateSub}
                          disabled={subActionLoading}
                          className="px-4 py-2 text-sm font-medium bg-primary text-white rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-50"
                        >
                          {subActionLoading ? 'Loading…' : 'Reactivate subscription'}
                        </button>
                      ) : (
                        <button
                          onClick={handlePortal}
                          disabled={subActionLoading}
                          className="px-4 py-2 text-sm font-medium border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-50"
                        >
                          {subActionLoading ? 'Loading…' : 'Manage billing'}
                        </button>
                      )}
                      {!cancelAtPeriodEnd && (
                        <button
                          onClick={handleCancelSub}
                          disabled={subActionLoading}
                          className="text-xs text-red-500 hover:text-red-700 transition-colors"
                        >
                          Cancel subscription
                        </button>
                      )}
                    </>
                  )}
                  {isNativeIos && !isManualPremium && currentPlan !== 'free' && (
                    <p className="text-xs text-gray-500">
                      Manage your subscription at lachart.net in a web browser. Apple billing isn't available in this app version.
                    </p>
                  )}
                </div>
              </div>

              {subLoading && (
                <div className="mt-4 text-sm text-gray-400 text-center">Loading subscription info…</div>
              )}
              {subError && (
                <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{subError}</div>
              )}
            </div>

            {/* Trial banner */}
            {showTrial && (
              <div className="bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/20 rounded-2xl p-4 flex items-center gap-3">
                <span className="text-2xl">🎁</span>
                <div>
                  <p className="font-semibold text-gray-900 text-sm">1 month free — no charge today</p>
                  <p className="text-xs text-gray-500 mt-0.5">Start any paid plan with a 30-day free trial. Cancel anytime before it ends and you won't be billed.</p>
                </div>
              </div>
            )}

            {/* Pricing cards */}
            <div>
              <h4 className={`${isMobile ? 'text-sm' : 'text-base'} font-semibold text-gray-900 mb-3`}>
                {currentPlan === 'free' ? 'Choose a plan' : 'Available plans'}
              </h4>
              <div className={`grid ${isMobile ? 'grid-cols-1 gap-3' : 'grid-cols-3 gap-4'}`}>
                {PLANS_UI.map((plan) => {
                  const isCurrent = plan.id === currentPlan;
                  const isUpgrade = plan.price > (PLANS_UI.find(p => p.id === currentPlan)?.price ?? 0);
                  const showTrialOnCard = showTrial && plan.trial;
                  return (
                    <div
                      key={plan.id}
                      className={`relative rounded-2xl border ${isMobile ? 'p-4' : 'p-5'} flex flex-col gap-4 ${
                        isCurrent
                          ? 'border-primary bg-primary/5 ring-2 ring-primary/30'
                          : plan.highlight
                          ? 'border-primary/40 bg-white shadow-md'
                          : 'border-gray-200 bg-white'
                      }`}
                    >
                      {plan.badge && !isCurrent && (
                        <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-3 py-0.5 text-[11px] font-semibold bg-primary text-white rounded-full whitespace-nowrap">
                          {plan.badge}
                        </span>
                      )}
                      {isCurrent && (
                        <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-3 py-0.5 text-[11px] font-semibold bg-gray-700 text-white rounded-full whitespace-nowrap">
                          Current plan
                        </span>
                      )}

                      <div>
                        <h5 className="font-bold text-gray-900 text-base">{plan.name}</h5>
                        <div className="mt-1 flex items-end gap-1">
                          {showTrialOnCard ? (
                            <>
                              <span className={`${isMobile ? 'text-2xl' : 'text-3xl'} font-bold text-primary`}>Free</span>
                              <span className="text-sm text-gray-400 mb-1">first month</span>
                            </>
                          ) : (
                            <>
                              <span className={`${isMobile ? 'text-2xl' : 'text-3xl'} font-bold text-gray-900`}>{plan.priceLabel}</span>
                              <span className="text-sm text-gray-400 mb-1">{plan.period}</span>
                            </>
                          )}
                        </div>
                        {showTrialOnCard && (
                          <p className="text-xs text-gray-400 mt-0.5">then {plan.priceLabel}/month</p>
                        )}
                      </div>

                      <ul className="space-y-1.5 flex-1">
                        {plan.features.map((f) => (
                          <li key={f} className="flex items-start gap-2 text-sm text-gray-600">
                            <span className="text-primary mt-0.5 shrink-0">✓</span>
                            <span>{f}</span>
                          </li>
                        ))}
                      </ul>

                      <div className="mt-auto">
                        {isCurrent ? (
                          <div className="text-center text-sm text-gray-400 font-medium py-2">Your current plan</div>
                        ) : plan.id === 'free' ? (
                          <div className="text-center text-sm text-gray-400 py-2">Downgrade via cancel</div>
                        ) : isNativeIos ? (
                          // App Store 3.1.1: iOS apps may not advertise or
                          // link out to external payment for paid digital
                          // content. Show a status-only note instead of a
                          // checkout button.
                          <div className="text-center text-xs text-gray-500 py-2 border border-dashed border-gray-200 rounded-xl">
                            Available at lachart.net
                          </div>
                        ) : systemEnabled ? (
                          <button
                            onClick={() => handleUpgrade(plan.id)}
                            disabled={subActionLoading || isManualPremium}
                            className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                              plan.highlight
                                ? 'bg-primary text-white hover:bg-primary/90'
                                : 'bg-gray-900 text-white hover:bg-gray-800'
                            }`}
                          >
                            {subActionLoading
                              ? 'Loading…'
                              : showTrialOnCard
                              ? `Try ${plan.name} free for 1 month`
                              : isUpgrade
                              ? `Upgrade to ${plan.name}`
                              : `Switch to ${plan.name}`}
                          </button>
                        ) : (
                          <div className="text-center text-xs text-gray-400 py-2 border border-dashed border-gray-200 rounded-xl">
                            Billing not yet activated
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {!systemEnabled && (
                <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-800">
                  <p className="font-semibold mb-1">Billing setup required</p>
                  <p className="text-xs text-blue-700">
                    Add your Stripe keys to the server <code>.env</code> file and set <code>SUBSCRIPTION_ENABLED=true</code> to activate checkout.
                  </p>
                </div>
              )}
            </div>
          </div>
        );
      }

      case 'integrations':
        return (
          <div className={`${isMobile ? 'space-y-2.5' : 'space-y-6'}`}>
            <div className={`bg-white ${isMobile ? 'rounded-md' : 'rounded-lg'} shadow-md ${isMobile ? 'p-2.5' : 'p-6'}`}>
              <h3 className={`${isMobile ? 'text-sm' : 'text-xl'} font-bold text-gray-900 ${isMobile ? 'mb-2' : 'mb-6'}`}>Integrations & Sync</h3>
              <div className={`grid ${isMobile ? 'grid-cols-1 gap-2.5' : 'grid-cols-1 md:grid-cols-2 gap-4'}`}>
                <div
                  data-tour="tour-strava-card"
                  className={`bg-white ${isMobile ? 'rounded-md' : 'rounded-lg'} border border-gray-200 ${isMobile ? 'p-2.5' : 'p-6'}`}
                >
                  <div className={`flex items-center justify-between ${isMobile ? 'mb-2' : 'mb-4'}`}>
                    <div className="flex items-center gap-2">
                      {/* Strava Logo */}
                      {!stravaLogoError ? (
                        <img 
                          src="/icon/strava.png" 
                          alt="Strava" 
                          className={`${isMobile ? 'w-6 h-6' : 'w-8 h-8'}`}
                          loading="eager"
                          decoding="async"
                          onError={() => {
                            console.error('Strava logo failed to load, trying PNG fallback');
                            setStravaLogoError(true);
                          }}
                        />
                      ) : (
                        <div className={`flex items-center justify-center ${isMobile ? 'w-6 h-6' : 'w-8 h-8'} bg-orange-500 rounded-lg`}>
                        <span className="text-white font-bold text-sm">S</span>
                      </div>
                      )}
                    <h4 className={`${isMobile ? 'text-xs' : 'text-lg'} font-semibold`}>Strava</h4>
                    </div>
                    <span className={`${isMobile ? 'text-[10px]' : 'text-sm'} font-medium ${stravaConnected ? 'text-green-600' : 'text-gray-500'}`}>
                      {stravaConnected ? 'Connected' : 'Not connected'}
                    </span>
                  </div>
                  
                  {stravaConnected && (
                    <>
                      {/* Real-time sync health pill. Green = webhook fired in
                          the last 7 days (uploads appear in seconds). Amber =
                          falling back to the 15-min polling scheduler so the
                          user knows why a fresh ride isn't showing up yet. */}
                      {stravaWebhookStatus && (
                        <div className={`${isMobile ? 'mb-2 pb-2' : 'mb-4 pb-4'} border-b flex items-center gap-2`}>
                          <span className={`inline-flex items-center gap-1.5 ${isMobile ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-1'} rounded-full font-medium ${stravaWebhookStatus.webhookHealthy ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${stravaWebhookStatus.webhookHealthy ? 'bg-green-500' : 'bg-amber-500'}`} />
                            {stravaWebhookStatus.webhookHealthy ? 'Real-time sync active' : 'Polling fallback (≤15 min)'}
                          </span>
                          {stravaWebhookStatus.webhookLastEventAt && (
                            <span className={`${isMobile ? 'text-[9px]' : 'text-xs'} text-gray-500`}>
                              last push {new Date(stravaWebhookStatus.webhookLastEventAt).toLocaleString()}
                            </span>
                          )}
                        </div>
                      )}
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
                              disabled={isTogglingStravaAutoSync}
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
                  
                  {/* Historical backfill progress banner */}
                  {stravaBackfill?.state === 'running' && (
                    <div className={`${isMobile ? 'mb-2 text-[10px]' : 'mb-3 text-xs'} flex items-center gap-2 px-3 py-2 bg-orange-50 border border-orange-200 rounded-xl text-orange-700`}>
                      <svg className="animate-spin shrink-0 w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                      </svg>
                      <span>
                        <span className="font-semibold">Importing history from Strava…</span>
                        {stravaBackfill.cursorDate && (
                          <span className="ml-1 text-orange-500">reached {stravaBackfill.cursorDate}</span>
                        )}
                        <span className="block text-orange-400 mt-0.5">Running in background — new activities appear automatically.</span>
                      </span>
                    </div>
                  )}
                  {stravaBackfill?.state === 'done' && (
                    <div className={`${isMobile ? 'mb-2 text-[10px]' : 'mb-3 text-xs'} flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 font-medium`}>
                      ✓ Full history imported from Strava
                    </div>
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
                      disabled={isSyncingStrava || stravaSecondsLeft > 0}
                      className={`${isMobile ? 'px-2.5 py-1.5 text-[10px] w-full' : 'px-3 py-2'} bg-gray-100 text-gray-800 ${isMobile ? 'rounded-md' : 'rounded'} hover:bg-gray-200 disabled:opacity-60 disabled:cursor-not-allowed`}
                      title={stravaSecondsLeft > 0 ? `Strava rate limit — retry in ${Math.ceil(stravaSecondsLeft / 60)} min` : undefined}
                    >
                      {isSyncingStrava
                        ? 'Syncing...'
                        : stravaSecondsLeft > 0
                          ? `Retry in ${Math.floor(stravaSecondsLeft / 60)}:${String(stravaSecondsLeft % 60).padStart(2, '0')}`
                          : 'Sync Now'}
                    </button>
                    <button
                      onClick={async () => {
                        try {
                          const ok = window.confirm('Disconnect your Strava account? Auto-sync will be turned off.');
                          if (!ok) return;

                          const resp = await fetch(`${API_BASE_URL}/api/integrations/strava/disconnect`, {
                            method: 'POST',
                            headers: {
                              'Content-Type': 'application/json',
                              'Authorization': `Bearer ${localStorage.getItem('token')}`
                            },
                          });

                          if (!resp.ok) {
                            const data = await resp.json().catch(() => ({}));
                            throw new Error(data.error || 'Failed to disconnect Strava');
                          }

                          // Reload profile so UI reflects disconnected state
                          const profileResponse = await fetch(`${API_BASE_URL}/user/profile`, {
                            headers: {
                              'Authorization': `Bearer ${localStorage.getItem('token')}`
                            }
                          });

                          if (profileResponse.ok) {
                            const updatedUser = await profileResponse.json();
                            saveUserToStorage(updatedUser);
                            window.dispatchEvent(new CustomEvent('userUpdated', { detail: updatedUser }));
                          }

                          setStravaConnected(false);
                          setStravaAutoSync(false);
                          addNotification('Strava disconnected successfully', 'success');
                        } catch (e) {
                          console.error('Disconnect Strava error:', e);
                          addNotification(e.message || 'Failed to disconnect Strava', 'error');
                        }
                      }}
                      className={`${isMobile ? 'px-2.5 py-1.5 text-[10px] w-full' : 'px-3 py-2'} bg-red-600 text-white ${isMobile ? 'rounded-md' : 'rounded'} hover:bg-red-700`}
                    >
                      Disconnect Strava
                    </button>
                  </div>
                </div>

                <div className={`bg-white ${isMobile ? 'rounded-md' : 'rounded-lg'} border border-gray-200 ${isMobile ? 'p-2.5' : 'p-6'}`}>
                  <div className={`flex items-center justify-between ${isMobile ? 'mb-2' : 'mb-4'}`}>
                    <div className="flex items-center gap-2">
                      {/* Garmin Logo */}
                      {!garminLogoError ? (
                        <img 
                          src="/icon/Garmin_logo_2006.svg.png" 
                          alt="Garmin" 
                          className={`${isMobile ? 'w-6 h-6' : 'w-8 h-8'} object-contain`}
                          onError={() => setGarminLogoError(true)}
                        />
                      ) : (
                        <div className={`flex items-center justify-center ${isMobile ? 'w-6 h-6' : 'w-8 h-8'} bg-blue-500 rounded-lg`}>
                          <span className="text-white font-bold text-sm">G</span>
                        </div>
                      )}
                    <h4 className={`${isMobile ? 'text-xs' : 'text-lg'} font-semibold`}>Garmin</h4>
                    </div>
                    <span className={`${isMobile ? 'text-[10px]' : 'text-sm'} font-medium ${garminConnected ? 'text-green-600' : 'text-gray-500'}`}>
                      {garminConnected ? 'Connected' : 'Not connected'}
                    </span>
                  </div>
                  
                  {(user?.admin || user?.role === 'admin') && garminConnected && (
                    <div className={`${isMobile ? 'mb-2 pb-2' : 'mb-4 pb-4'} border-b`}>
                      <div className={`flex items-center justify-between ${isMobile ? 'flex-col gap-1.5' : ''}`}>
                        <div className={isMobile ? 'w-full' : ''}>
                          <label className={`${isMobile ? 'text-[10px]' : 'text-sm'} font-medium text-gray-900`}>Auto-sync</label>
                          <p className={`${isMobile ? 'text-[9px]' : 'text-xs'} text-gray-500`}>Automatically sync new activities</p>
                        </div>
                        <label className={`relative inline-flex items-center cursor-pointer ${isMobile ? 'self-end' : ''}`}>
                          <input
                            type="checkbox"
                            checked={garminAutoSync}
                            onChange={(e) => handleToggleGarminAutoSync(e.target.checked)}
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
                  )}
                  
                  {(user?.admin || user?.role === 'admin') ? (
                    <>
                      {/* Last sync info */}
                      {garminConnected && garminLastSync && (
                        <p className={`${isMobile ? 'text-[9px]' : 'text-xs'} text-gray-400 mb-2`}>
                          Last sync: {new Date(garminLastSync).toLocaleString()}
                        </p>
                      )}
                      {!garminConnected && (
                        <div className="mb-2 space-y-1.5">
                          <p className={`flex gap-1.5 items-start ${isMobile ? 'text-[9px]' : 'text-xs'} text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-1.5`}>
                            <AlertTriangle className="shrink-0 mt-0.5" size={13} aria-hidden />
                            <span>OAuth Connect requires <strong>Health API</strong> access in your Garmin developer account. If you have an Evaluation tier, use <strong>Connect with credentials</strong> below instead.</span>
                          </p>
                        </div>
                      )}
                      {/* Garmin credentials login form */}
                      {showGarminLoginForm && !garminConnected && (
                        <form onSubmit={handleConnectGarminCredentials} className="mb-2 p-3 bg-gray-50 border border-gray-200 rounded space-y-2">
                          <p className="text-xs text-gray-600 font-medium">Connect with Garmin Connect credentials:</p>
                          <input
                            type="text"
                            placeholder="Garmin email"
                            value={garminLoginForm.username}
                            onChange={e => setGarminLoginForm(f => ({ ...f, username: e.target.value }))}
                            className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded"
                            autoComplete="username"
                          />
                          <input
                            type="password"
                            placeholder="Garmin password"
                            value={garminLoginForm.password}
                            onChange={e => setGarminLoginForm(f => ({ ...f, password: e.target.value }))}
                            className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded"
                            autoComplete="current-password"
                          />
                          <div className="flex gap-2">
                            <button type="submit" disabled={isConnectingGarminCreds} className="px-3 py-1.5 text-xs bg-primary text-white rounded hover:bg-primary-dark disabled:opacity-60">
                              {isConnectingGarminCreds ? 'Connecting…' : 'Connect'}
                            </button>
                            <button type="button" onClick={() => setShowGarminLoginForm(false)} className="px-3 py-1.5 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300">
                              Cancel
                            </button>
                          </div>
                        </form>
                      )}
                      <div className={`flex ${isMobile ? 'flex-col gap-1.5' : 'flex-wrap gap-2'}`}>
                        <button
                          onClick={handleConnectGarmin}
                          className={`${isMobile ? 'px-2.5 py-1.5 text-[10px] w-full' : 'px-3 py-2'} bg-primary text-white ${isMobile ? 'rounded-md' : 'rounded'} hover:bg-primary-dark`}
                        >
                          {garminConnected ? 'Reconnect (OAuth)' : 'Connect (OAuth)'}
                        </button>
                        {!garminConnected && (
                          <button
                            onClick={() => setShowGarminLoginForm(v => !v)}
                            className={`${isMobile ? 'px-2.5 py-1.5 text-[10px] w-full' : 'px-3 py-2'} bg-gray-700 text-white ${isMobile ? 'rounded-md' : 'rounded'} hover:bg-gray-900`}
                          >
                            Connect with credentials
                          </button>
                        )}
                        {garminConnected && (
                          <button
                            onClick={handleSyncGarmin}
                            disabled={isSyncingGarmin || isSyncingGarminHistory}
                            className={`${isMobile ? 'px-2.5 py-1.5 text-[10px] w-full' : 'px-3 py-2'} bg-gray-100 text-gray-800 ${isMobile ? 'rounded-md' : 'rounded'} hover:bg-gray-200 disabled:opacity-60 disabled:cursor-not-allowed`}
                          >
                            {isSyncingGarmin ? 'Syncing...' : 'Sync Now'}
                          </button>
                        )}
                        {garminConnected && (
                          <button
                            onClick={handleSyncGarminHistory}
                            disabled={isSyncingGarminHistory || isSyncingGarmin}
                            title="Download full Garmin activity history (all time)"
                            className={`${isMobile ? 'px-2.5 py-1.5 text-[10px] w-full' : 'px-3 py-2'} bg-gray-100 text-gray-800 ${isMobile ? 'rounded-md' : 'rounded'} hover:bg-gray-200 disabled:opacity-60 disabled:cursor-not-allowed`}
                          >
                            {isSyncingGarminHistory ? 'Importing...' : 'Import History'}
                          </button>
                        )}
                          {garminConnected && (
                          <button
                            onClick={handleTestGarminConnection}
                            disabled={isTestingGarmin || isSyncingGarmin || isSyncingGarminHistory}
                            title="Test whether the Garmin API token is valid"
                            className={`${isMobile ? 'px-2.5 py-1.5 text-[10px] w-full' : 'px-3 py-2'} bg-gray-100 text-gray-800 ${isMobile ? 'rounded-md' : 'rounded'} hover:bg-gray-200 disabled:opacity-60 disabled:cursor-not-allowed`}
                          >
                            {isTestingGarmin ? 'Testing…' : 'Test Connection'}
                          </button>
                        )}
                        {garminConnected && (
                          <button
                            onClick={handleDisconnectGarmin}
                            className={`${isMobile ? 'px-2.5 py-1.5 text-[10px] w-full' : 'px-3 py-2'} bg-red-600 text-white ${isMobile ? 'rounded-md' : 'rounded'} hover:bg-red-700`}
                          >
                            Disconnect
                          </button>
                        )}
                      </div>
                      {/* Persistent sync error display */}
                      {garminSyncError && (
                        <div className="mt-2 rounded-lg px-3 py-2 text-xs bg-red-50 text-red-700 border border-red-200 space-y-1">
                          <div className="font-semibold">Sync error:</div>
                          <div className="font-mono break-all">{garminSyncError}</div>
                          {garminSyncError.includes('InvalidPullTokenException') && (
                            <div className="mt-1 text-red-600 font-medium flex gap-1.5 items-start">
                              <AlertTriangle className="shrink-0 mt-0.5" size={13} aria-hidden />
                              <span>Your Garmin token doesn't have activity pull permissions.
                              Fix: <strong>Disconnect</strong> then <strong>Reconnect</strong> and make sure
                              to enable <strong>Activities</strong> + <strong>Historical Data</strong> toggles
                              on the Garmin consent screen. If the problem persists, your Garmin Health API app
                              may need SUMMARY_PULL enabled in the developer portal.</span>
                            </div>
                          )}
                          {garminSyncError.includes('401') || garminSyncError.includes('403') ? (
                            <div className="mt-1 text-red-600 font-medium flex gap-1.5 items-start">
                              <AlertTriangle className="shrink-0 mt-0.5" size={13} aria-hidden />
                              <span>Access denied. Try disconnecting and reconnecting your Garmin account.</span>
                            </div>
                          ) : null}
                        </div>
                      )}
                      {/* Test connection result */}
                      {garminTestResult && (
                        <div className={`mt-2 rounded-lg px-3 py-2 text-xs space-y-1 ${garminTestResult.ok ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                          <div>
                            User/ID: {garminTestResult.userIdEndpoint?.ok ? '✓ OK' : `✗ HTTP ${garminTestResult.userIdEndpoint?.status} — ${JSON.stringify(garminTestResult.userIdEndpoint?.body)}`}
                            {garminTestResult.athleteId ? ` (ID: ${garminTestResult.athleteId})` : ''}
                          </div>
                          {garminTestResult.permissionsEndpoint && (
                            <div>
                              Permissions: {garminTestResult.permissionsEndpoint.ok
                                ? <span className="text-green-700 font-mono">{JSON.stringify(garminTestResult.permissionsEndpoint.permissions)}</span>
                                : `✗ HTTP ${garminTestResult.permissionsEndpoint.status} — ${JSON.stringify(garminTestResult.permissionsEndpoint.body)}`
                              }
                            </div>
                          )}
                          <div>
                            Activities: {garminTestResult.activitiesEndpoint?.ok
                              ? `✓ OK (${garminTestResult.activitiesEndpoint.count ?? 0} in last 24h)`
                              : `✗ HTTP ${garminTestResult.activitiesEndpoint?.status} — ${JSON.stringify(garminTestResult.activitiesEndpoint?.body)}`
                            }
                          </div>
                          {garminTestResult.activitiesEndpoint && !garminTestResult.activitiesEndpoint.ok && (
                            JSON.stringify(garminTestResult.activitiesEndpoint.body).includes('InvalidPullToken') && (
                              <div className="font-medium text-red-700 border-t border-red-200 pt-1 mt-1">
                                → Your token is missing ACTIVITY pull permission. Disconnect and reconnect — enable <strong>Activities</strong> + <strong>Historical Data</strong> on the Garmin screen.
                              </div>
                            )
                          )}
                          {garminTestResult.error && <div>✗ {garminTestResult.error}</div>}
                        </div>
                      )}
                    </>
                  ) : (
                    <button
                      type="button"
                      disabled
                      className={`${isMobile ? 'px-2.5 py-1.5 text-[10px] w-full' : 'px-3 py-2'} bg-gray-100 text-gray-400 ${isMobile ? 'rounded-md' : 'rounded'} cursor-not-allowed`}
                    >
                      Coming soon
                    </button>
                  )}
                </div>

                {/* Apple Health integration removed from iOS build. */}

                <div className={`bg-white ${isMobile ? 'rounded-md' : 'rounded-lg'} border border-gray-200 ${isMobile ? 'p-2.5' : 'p-6'}`}>
                  <div className={`flex items-center justify-between ${isMobile ? 'mb-2' : 'mb-4'}`}>
                    <div className="flex items-center gap-2">
                      <div className={`flex items-center justify-center ${isMobile ? 'w-6 h-6' : 'w-8 h-8'} bg-red-50 rounded-lg`}>
                        <span className="text-red-600 font-bold text-sm">P</span>
                      </div>
                      <h4 className={`${isMobile ? 'text-xs' : 'text-lg'} font-semibold`}>Polar</h4>
                    </div>
                    <span className={`${isMobile ? 'text-[10px]' : 'text-sm'} font-medium ${polarConnected ? 'text-green-600' : 'text-amber-600'}`}>
                      {polarConnected ? 'Connected' : 'Coming soon'}
                    </span>
                  </div>
                  <p className={`${isMobile ? 'text-[9px]' : 'text-sm'} text-gray-600 ${isMobile ? 'mb-2' : 'mb-4'}`}>
                    Planned integration for Polar Flow workout sync and activity import.
                  </p>
                  <button
                    type="button"
                    disabled
                    className={`${isMobile ? 'px-2.5 py-1.5 text-[10px] w-full' : 'px-3 py-2'} bg-gray-100 text-gray-400 ${isMobile ? 'rounded-md' : 'rounded'} cursor-not-allowed`}
                  >
                    Coming soon
                  </button>
                </div>

                <div className={`bg-white ${isMobile ? 'rounded-md' : 'rounded-lg'} border border-gray-200 ${isMobile ? 'p-2.5' : 'p-6'}`}>
                  <div className={`flex items-center justify-between ${isMobile ? 'mb-2' : 'mb-4'}`}>
                    <div className="flex items-center gap-2">
                      <div className={`flex items-center justify-center ${isMobile ? 'w-6 h-6' : 'w-8 h-8'} bg-orange-50 rounded-lg`}>
                        <span className="text-orange-600 font-bold text-sm">C</span>
                      </div>
                      <h4 className={`${isMobile ? 'text-xs' : 'text-lg'} font-semibold`}>COROS</h4>
                    </div>
                    <span className={`${isMobile ? 'text-[10px]' : 'text-sm'} font-medium ${corosConnected ? 'text-green-600' : 'text-amber-600'}`}>
                      {corosConnected ? 'Connected' : 'Coming soon'}
                    </span>
                  </div>
                  <p className={`${isMobile ? 'text-[9px]' : 'text-sm'} text-gray-600 ${isMobile ? 'mb-2' : 'mb-4'}`}>
                    Planned integration for COROS training history, routes and structured endurance sessions.
                  </p>
                  <button
                    type="button"
                    disabled
                    className={`${isMobile ? 'px-2.5 py-1.5 text-[10px] w-full' : 'px-3 py-2'} bg-gray-100 text-gray-400 ${isMobile ? 'rounded-md' : 'rounded'} cursor-not-allowed`}
                  >
                    Coming soon
                  </button>
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

      case 'branding':
        return (
          <div className={`${isMobile ? 'space-y-3' : 'space-y-6'}`}>
            <div className={`bg-white ${isMobile ? 'rounded-md' : 'rounded-xl'} shadow-md ${isMobile ? 'p-3' : 'p-6'}`}>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Sparkles className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className={`${isMobile ? 'text-sm' : 'text-xl'} font-bold text-gray-900`}>PDF Report Branding</h3>
                  <p className={`${isMobile ? 'text-[10px]' : 'text-sm'} text-gray-500`}>
                    Customise the logo, title and trademark shown on exported PDF reports.
                  </p>
                </div>
              </div>

              <div className="space-y-5">
                {/* Logo URL */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Logo URL</label>
                  <p className="text-xs text-gray-400 mb-2">Paste a direct URL to your logo image (PNG/SVG, max 512×512 px recommended).</p>
                  <input
                    type="url"
                    value={coachBranding.logoUrl}
                    onChange={(e) => setCoachBranding(prev => ({ ...prev, logoUrl: e.target.value }))}
                    placeholder="https://yoursite.com/logo.png"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  {coachBranding.logoUrl && (
                    <div className="mt-2 flex items-center gap-3">
                      <img src={coachBranding.logoUrl} alt="Logo preview" className="h-10 w-auto object-contain rounded border border-gray-200 bg-gray-50 p-1" onError={(e) => { e.target.style.display = 'none'; }} />
                      <span className="text-xs text-gray-400">Preview</span>
                    </div>
                  )}
                </div>

                {/* Title */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Organisation / Club Title</label>
                  <p className="text-xs text-gray-400 mb-2">Shown in the header of the PDF (e.g. "Elite Triathlon Academy").</p>
                  <input
                    type="text"
                    value={coachBranding.title}
                    onChange={(e) => setCoachBranding(prev => ({ ...prev, title: e.target.value }))}
                    placeholder="e.g. Elite Triathlon Academy"
                    maxLength={60}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>

                {/* Trademark */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Trademark / Copyright line</label>
                  <p className="text-xs text-gray-400 mb-2">Shown in the footer of the PDF (e.g. "© 2025 John Smith Coaching").</p>
                  <input
                    type="text"
                    value={coachBranding.trademark}
                    onChange={(e) => setCoachBranding(prev => ({ ...prev, trademark: e.target.value }))}
                    placeholder="e.g. © 2025 John Smith Coaching"
                    maxLength={80}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>

                {/* Accent color */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Accent / Header colour</label>
                  <p className="text-xs text-gray-400 mb-2">Used for the PDF header bar, pill badges, table headers and section titles.</p>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={coachBranding.primaryColor || '#767EB5'}
                      onChange={(e) => setCoachBranding(prev => ({ ...prev, primaryColor: e.target.value }))}
                      className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer p-0.5 bg-white"
                      style={{ WebkitAppearance: 'none' }}
                    />
                    <input
                      type="text"
                      value={coachBranding.primaryColor || '#767EB5'}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (/^#[0-9A-Fa-f]{0,6}$/.test(v)) setCoachBranding(prev => ({ ...prev, primaryColor: v }));
                      }}
                      maxLength={7}
                      placeholder="#767EB5"
                      className="w-28 px-3 py-2 text-sm border border-gray-200 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                    {/* Preview swatch */}
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-white text-xs font-bold" style={{ backgroundColor: coachBranding.primaryColor || '#767EB5' }}>
                      Preview header
                    </div>
                    <button
                      type="button"
                      onClick={() => setCoachBranding(prev => ({ ...prev, primaryColor: '#767EB5' }))}
                      className="text-xs text-gray-400 hover:text-gray-600 underline"
                    >
                      Reset
                    </button>
                  </div>
                </div>

                <button
                  onClick={handleSaveBranding}
                  disabled={brandingSaving}
                  className="px-5 py-2 bg-primary text-white text-sm font-semibold rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-60"
                >
                  {brandingSaving ? 'Saving…' : 'Save Branding'}
                </button>
              </div>
            </div>
          </div>
        );

      case 'coach':
        return (
          <div className={`${isMobile ? 'space-y-3' : 'space-y-6'}`}>
            {/* Header card */}
            <div className={`bg-white ${isMobile ? 'rounded-md' : 'rounded-xl'} shadow-md ${isMobile ? 'p-3' : 'p-6'}`}>
              <div className="flex items-center gap-3 mb-1">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Users className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className={`${isMobile ? 'text-sm' : 'text-xl'} font-bold text-gray-900`}>Coach Management</h3>
                  <p className={`${isMobile ? 'text-[10px]' : 'text-sm'} text-gray-500`}>
                    Connect with your coach to share test results and training zones.
                  </p>
                </div>
              </div>
            </div>

            {/* Connected coaches */}
            <div className={`bg-white ${isMobile ? 'rounded-md' : 'rounded-xl'} shadow-md ${isMobile ? 'p-3' : 'p-6'}`}>
              <h4 className={`${isMobile ? 'text-xs' : 'text-base'} font-semibold text-gray-900 ${isMobile ? 'mb-2' : 'mb-4'}`}>
                Connected Coaches
              </h4>

              {myCoaches.length > 0 ? (
                <div className={`${isMobile ? 'space-y-2' : 'space-y-3'}`}>
                  {myCoaches.map((c) => (
                    <div
                      key={String(c._id)}
                      className={`flex items-center justify-between ${isMobile ? 'p-2' : 'p-4'} bg-gray-50 rounded-lg border border-gray-100`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                          <User className="w-4 h-4 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <p className={`${isMobile ? 'text-xs' : 'text-sm'} font-medium text-gray-900 truncate`}>
                            {c.name} {c.surname}
                          </p>
                          <p className={`${isMobile ? 'text-[10px]' : 'text-xs'} text-gray-500 truncate`}>{c.email}</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveCoach(c._id)}
                        disabled={isLoading}
                        className={`flex items-center gap-1.5 ${isMobile ? 'text-[10px] px-2 py-1' : 'text-sm px-3 py-1.5'} text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors shrink-0 ml-2`}
                      >
                        <UserMinus className={isMobile ? 'w-3 h-3' : 'w-4 h-4'} />
                        Remove
                      </button>
                    </div>
                  ))}
                  {myCoaches.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveCoach(null)}
                      disabled={isLoading}
                      className={`${isMobile ? 'text-[10px]' : 'text-sm'} text-red-500 hover:text-red-700 underline mt-1`}
                    >
                      Remove all coaches
                    </button>
                  )}
                </div>
              ) : (
                <div className={`${isMobile ? 'py-4' : 'py-8'} text-center`}>
                  <Users className={`${isMobile ? 'w-8 h-8' : 'w-12 h-12'} text-gray-300 mx-auto mb-3`} />
                  <p className={`${isMobile ? 'text-xs' : 'text-sm'} text-gray-500`}>
                    No coach connected yet.
                  </p>
                  <p className={`${isMobile ? 'text-[10px]' : 'text-xs'} text-gray-400 mt-1`}>
                    Invite your coach below, or ask your coach to invite you from their dashboard.
                  </p>
                </div>
              )}
            </div>

            {/* Invite form */}
            <div className={`bg-white ${isMobile ? 'rounded-md' : 'rounded-xl'} shadow-md ${isMobile ? 'p-3' : 'p-6'}`}>
              <h4 className={`${isMobile ? 'text-xs' : 'text-base'} font-semibold text-gray-900 ${isMobile ? 'mb-2' : 'mb-4'}`}>
                Invite a Coach
              </h4>
              <p className={`${isMobile ? 'text-[10px]' : 'text-sm'} text-gray-500 ${isMobile ? 'mb-2' : 'mb-4'}`}>
                Enter your coach's email. They will receive an invitation to join your team on LaChart.
                If they don't have an account yet, they'll be guided to create one.
              </p>
              <form onSubmit={handleCoachChange} className={`${isMobile ? 'space-y-2' : 'space-y-4'}`}>
                <div>
                  <label className={`block ${isMobile ? 'text-[10px]' : 'text-sm'} font-medium text-gray-700 ${isMobile ? 'mb-0.5' : 'mb-1'}`}>
                    Coach email address
                  </label>
                  <input
                    type="email"
                    value={formData.newCoachEmail}
                    onChange={(e) => setFormData(prev => ({ ...prev, newCoachEmail: e.target.value }))}
                    className={`block w-full ${isMobile ? 'text-xs' : 'text-sm'} rounded-lg border-gray-300 shadow-sm focus:border-primary focus:ring-primary`}
                    placeholder="coach@example.com"
                    required
                  />
                </div>
                <button
                  type="submit"
                  disabled={isLoading}
                  className={`w-full flex items-center justify-center gap-2 ${isMobile ? 'px-3 py-1.5 text-xs' : 'px-4 py-2.5 text-sm'} font-semibold text-white bg-primary hover:bg-primary-dark rounded-lg shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50`}
                >
                  <UserPlus className={isMobile ? 'w-3.5 h-3.5' : 'w-5 h-5'} />
                  {isLoading ? 'Sending invitation…' : 'Send Invitation'}
                </button>
              </form>
            </div>

            {/* Info card */}
            <div className={`bg-primary/5 border border-primary/20 ${isMobile ? 'rounded-md p-3' : 'rounded-xl p-5'}`}>
              <p className={`${isMobile ? 'text-[10px]' : 'text-sm'} font-semibold text-primary mb-2`}>How it works</p>
              <ul className={`${isMobile ? 'text-[10px] space-y-1' : 'text-sm space-y-2'} text-gray-600 list-none`}>
                {[
                  { icon: BarChart2, text: 'Your coach sees all your lactate test results in real time' },
                  { icon: Target, text: 'They can set personalised training zones based on your LT1 & LT2' },
                  { icon: MessageCircle, text: 'Coaches can add notes and feedback on each test' },
                  { icon: TrendingUp, text: 'Both of you track your LT2 progression over time' },
                ].map(({ icon: Icon, text }) => (
                  <li key={text} className="flex items-start gap-2">
                    <Icon className="shrink-0 mt-0.5 text-primary" size={isMobile ? 12 : 15} aria-hidden />
                    <span>{text}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        );

      case 'categories':
        return (
          <div className={`${isMobile ? 'space-y-3' : 'space-y-6'}`}>
            <div className={`bg-white ${isMobile ? 'rounded-md' : 'rounded-xl'} shadow-md ${isMobile ? 'p-3' : 'p-6'}`}>
              <CategoryManager />
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <>
    {showIntroTutorial && (
      <IntroSlides user={user} onDone={() => setShowIntroTutorial(false)} />
    )}
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
    <UpgradeModal {...fitUpgradeModalProps} />
    </>
  );
};

// AppleHealthCard removed — see App.jsx / initCapacitorShell.js comments.

export default SettingsPage;
