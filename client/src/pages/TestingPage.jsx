import React, { useState, useEffect, useMemo, useRef } from "react";
import { useAuth } from '../context/AuthProvider';
import { useNotification } from '../context/NotificationContext';
import api, { invalidateCache, addTest } from '../services/api';
import SportsSelector from "../components/Header/SportsSelector";
import PreviousTestingComponent from "../components/Testing-page/PreviousTestingComponent";
import NewTestingComponent from "../components/Testing-page/NewTestingComponent";
import NotificationBadge from "../components/Testing-page/NotificationBadge";
import AthleteSelector from "../components/AthleteSelector";
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { InformationCircleIcon } from '@heroicons/react/24/outline';
import TrainingGlossary from '../components/DashboardPage/TrainingGlossary';
import { listExternalActivities, getStravaActivityDetail, getIntegrationStatus } from '../services/api';
import { logTestCreated } from '../utils/eventLogger';
import { generateHRTestPlan } from '../utils/hrTestPlanner';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { XMarkIcon, UserPlusIcon } from '@heroicons/react/24/outline';
import AddAthleteAndTestModal from '../components/Testing-page/AddAthleteAndTestModal';
import StravaIntegrationModal from '../components/Testing-page/StravaIntegrationModal';
import PopulationInsights from '../components/Testing-page/PopulationInsights';
import { resolveDistanceUnitSystem } from '../utils/unitsConverter';

/** Map saved test sport to run | bike | swim for UI + advisor */
function normalizeTestSportKey(sport) {
  const s = String(sport || '').trim().toLowerCase();
  if (!s) return null;
  if (s === 'run' || s === 'running' || s.includes('run')) return 'run';
  if (s === 'bike' || s === 'cycling' || s === 'cycle' || s.includes('bike')) return 'bike';
  if (s === 'swim' || s === 'swimming' || s.includes('swim')) return 'swim';
  return null;
}

const TestingPage = () => {
  const { athleteId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, isAuthenticated } = useAuth();
  const role = String(user?.role || '').toLowerCase();
  const isTestingRole = role === 'testing';
  const isTesterRole = role === 'tester';
  // Coach-like roles operate on selected athlete's data (zones + tests).
  const isCoachLikeRole = role === 'coach' || isTestingRole || isTesterRole;
  const { addNotification } = useNotification();
  const [selectedAthleteId, setSelectedAthleteId] = useState(() => {
    if (athleteId) return athleteId;
    if (isCoachLikeRole) {
      try {
        const globalId = localStorage.getItem('global_selectedAthleteId');
        if (globalId) return globalId;
      } catch {
        // ignore storage errors
      }
      // Only "coach" defaults to self if nothing selected; tester/testing start with no athlete.
      if (user?.role === 'coach') return user?._id || null;
      return null;
    }
    return null;
  });
  const [showNewTesting, setShowNewTesting] = useState(false);
  const [selectedSport, setSelectedSport] = useState("all");
  const [tests, setTests] = useState([]);
  
  // Limit tests to prevent memory issues (max 500)
  const MAX_TESTS = 500;
  const [error, setError] = useState(null);
  const [showGlossary, setShowGlossary] = useState(false);
  const [athleteProfile, setAthleteProfile] = useState(null);
  const [externalActivities, setExternalActivities] = useState([]);
  
  // Limit external activities to prevent memory issues (max 1000)
  const MAX_EXTERNAL_ACTIVITIES = 1000;
  const [bikePowerMetrics, setBikePowerMetrics] = useState(null);
  const [advisorLoading, setAdvisorLoading] = useState(false);
  const [showRecommendations, setShowRecommendations] = useState(false);
  const [pendingAthleteIds, setPendingAthleteIds] = useState([]);
  const [pendingAthletesLoaded, setPendingAthletesLoaded] = useState(false);
  const [hrTestPlan, setHrTestPlan] = useState(null);
  const [hrTestPlanLoading, setHrTestPlanLoading] = useState(false);
  const [showAddAthleteModal, setShowAddAthleteModal] = useState(false);
  const [showStravaModal, setShowStravaModal] = useState(false);
  const navigate = useNavigate();
  const lastLoadedTestIdFromUrlRef = useRef(null);
  const lastLoadedTestsForAthleteRef = useRef(null);
  const addNotificationRef = useRef(addNotification);
  addNotificationRef.current = addNotification;
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  const userRef = useRef(user);
  userRef.current = user;
  /**
   * Same rule as DashboardPage: coach/tester use selected athlete (or coach self);
   * plain athletes always use user._id (selectedAthleteId state stays null for them).
   */
  const effectiveTargetAthleteId = useMemo(() => {
    if (isTestingRole) return user?._id ?? null;
    if (isCoachLikeRole) {
      return selectedAthleteId || (user?.role === 'coach' ? user._id : null);
    }
    return user?._id ?? null;
  }, [isTestingRole, isCoachLikeRole, selectedAthleteId, user?.role, user?._id]);
  const isPendingSelectedAthlete = useMemo(() => {
    if (!isCoachLikeRole) return false;
    if (!selectedAthleteId) return false;
    if (String(selectedAthleteId) === String(user?._id || '')) return false;
    return pendingAthleteIds.includes(String(selectedAthleteId));
  }, [isCoachLikeRole, selectedAthleteId, user?._id, pendingAthleteIds]);

  /** Current effective athlete for data loads — used to drop stale / out-of-order list responses */
  const effectiveAthleteIdRef = useRef(effectiveTargetAthleteId);
  effectiveAthleteIdRef.current = effectiveTargetAthleteId;
  
  // Get testId from URL
  const testIdFromUrl = searchParams.get('testId');

  const handleUrlTestSelection = (nextTestId) => {
    setSearchParams((prev) => {
      const newParams = new URLSearchParams(prev);
      if (nextTestId) newParams.set('testId', String(nextTestId));
      else newParams.delete('testId');
      return newParams;
    });
  };

  const sports = [
    { id: "all", name: "All Sports" },
    { id: "run", name: "Running" },
    { id: "bike", name: "Cycling" },
    { id: "swim", name: "Swimming" },
  ];

  const loadTests = React.useCallback(async (targetId) => {
    try {
      setError(null);
      const testId = targetId;

      const response = isTestingRole
        ? await api.get('/test')
        : await api.get(`/test/list/${testId}`);
      
      const testsData = Array.isArray(response.data) ? response.data : [];
      
      const seenIds = new Set();
      const uniqueTests = [];
      const duplicateIds = [];
      
      testsData.forEach((test, index) => {
        if (!test || !test._id) {
          console.warn(`[TestingPage] Test at index ${index} is missing _id, skipping`);
          return;
        }
        
        // Normalize ID for comparison (handle both string and ObjectId)
        const testIdStr = String(test._id);
        
        if (seenIds.has(testIdStr)) {
          console.warn(`[TestingPage] Duplicate test ID found: ${testIdStr}, skipping duplicate`);
          duplicateIds.push(testIdStr);
          return;
        }
        
        seenIds.add(testIdStr);
        uniqueTests.push(test);
      });
      
      if (duplicateIds.length > 0) {
        console.warn(`[TestingPage] Found ${duplicateIds.length} duplicate test IDs:`, duplicateIds);
        addNotification(`Warning: Found ${duplicateIds.length} duplicate test(s). Only showing unique tests.`, 'warning');
      }
      
      // Limit tests to prevent memory issues
      const limitedTests = uniqueTests.slice(0, MAX_TESTS);
      if (uniqueTests.length > MAX_TESTS) {
        console.warn(`[TestingPage] Limited ${uniqueTests.length} tests to ${MAX_TESTS} to prevent memory issues`);
      }

      // Ignore responses if user switched athlete or list was superseded
      if (String(effectiveAthleteIdRef.current) !== String(targetId)) {
        return;
      }

      setTests(limitedTests);
    } catch (err) {
      console.error('Error loading tests:', err);
      setError('Failed to load tests');
      addNotification('Failed to load tests. Please refresh the page.', 'error');
      // Allow the effect to retry the same athlete (ref was set before the request)
      if (String(effectiveAthleteIdRef.current) === String(targetId)) {
        lastLoadedTestsForAthleteRef.current = null;
      }
    }
  }, [addNotification, isTestingRole]);

  // If backend says the selected test doesn't exist anymore, the UI might be holding a stale testId.
  // Reload the test list, clear the URL param and localStorage selection.
  useEffect(() => {
    if (!isAuthenticated) return;

    const handler = (e) => {
      const athleteIdFromEvent = e?.detail?.athleteId;

      const targetAthleteId =
        athleteIdFromEvent ||
        (isCoachLikeRole ? selectedAthleteId : user?._id);

      if (!targetAthleteId) return;
      if (isPendingSelectedAthlete) {
        setTests([]);
        return;
      }

      try {
        invalidateCache('/test/list/');
        invalidateCache('/test/');
        invalidateCache('api_cache_tests');
      } catch {
        // ignore
      }

      // Clear URL param so PreviousTestingComponent can fall back to a valid test.
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete('testId');
        return next;
      });

      // Clear saved selection(s) that could point to missing test.
      try {
        localStorage.removeItem('lachart:lastTestId');
        localStorage.removeItem(`lachart:lastTestId:${selectedSport}`);
        localStorage.removeItem('lachart:lastTestId:all');
      } catch {
        // ignore
      }

      loadTests(targetAthleteId);
    };

    window.addEventListener('lachart:testNotFound', handler);
    return () => window.removeEventListener('lachart:testNotFound', handler);
  }, [isAuthenticated, user?.role, user?._id, selectedAthleteId, selectedSport, loadTests, setSearchParams, isCoachLikeRole, isPendingSelectedAthlete]);

  // Synchronizace selectedAthleteId s URL parametrem + validation
  useEffect(() => {
    if (athleteId) {
      setSelectedAthleteId(athleteId);
    } else if (user?.role === 'coach' && !selectedAthleteId) {
      // Pokud je trenér a není vybraný atlet, nastav sebe jako výchozí
      setSelectedAthleteId(user._id);
    }
    
    // Validate selected athlete - if profile fails to load, reset to safe state
    const validateAthlete = async () => {
      if (!user || !selectedAthleteId || selectedAthleteId === user._id || !isAuthenticated) return;
      if (isTestingRole) return;
      if (pendingAthleteIds.includes(String(selectedAthleteId))) return;
      
      try {
        // Try to load athlete profile - if it fails, athlete might be deleted/problematic
        if (isCoachLikeRole) {
          await api.get(`/user/athlete/${selectedAthleteId}/profile`);
        }
      } catch (error) {
        console.warn('Selected athlete validation failed, resetting:', error);
        // Clear problematic athlete selection
        try {
          localStorage.removeItem('global_selectedAthleteId');
          localStorage.removeItem(`testing_recommendations_open_${selectedAthleteId}`);
        } catch {}
        setSelectedAthleteId(user?.role === 'coach' ? user._id : null);
        navigate('/testing', { replace: true });
        addNotification('Athlete data could not be loaded. Reset to your profile.', 'warning');
      }
    };
    
    if (isAuthenticated && user) {
      validateAthlete();
    }
  }, [athleteId, user, selectedAthleteId, isAuthenticated, navigate, addNotification, isCoachLikeRole, isTestingRole, pendingAthleteIds]);

  useEffect(() => {
    const loadCoachAthletes = async () => {
      if (!isCoachLikeRole) return;
      try {
        const response = await api.get('/user/coach/athletes');
        const list = Array.isArray(response?.data) ? response.data : [];
        const pendingIds = list
          .filter((a) =>
            a?.invitationPending ||
            a?.coachLinkStatus === 'pending' ||
            a?.status === 'pending' ||
            a?.pending === true
          )
          .map((a) => String(a._id));
        setPendingAthleteIds(pendingIds);
      } catch (e) {
        console.warn('Failed to load coach athletes for pending checks:', e?.message || e);
      } finally {
        setPendingAthletesLoaded(true);
      }
    };
    loadCoachAthletes();
  }, [isCoachLikeRole]);

  // Load test by ID from URL if present (before loading all tests)
  useEffect(() => {
    const u = userRef.current;
    if (!isAuthenticated || !u || !testIdFromUrl) return;
    // Guard: avoid reloading the same testId (helps with dev StrictMode + rerenders)
    if (String(lastLoadedTestIdFromUrlRef.current) === String(testIdFromUrl)) return;

    const ac = new AbortController();
    const notify = (...args) => addNotificationRef.current(...args);

    const loadTestFromUrl = async () => {
      try {
        console.log('[TestingPage] Loading test from URL:', testIdFromUrl);
        const response = await api.get(`/test/${testIdFromUrl}`, {
          signal: ac.signal,
          timeout: 120000,
        });
        const test = response.data;
        
        if (!test || !test._id) {
          console.warn('[TestingPage] Test from URL not found or invalid');
          notify('Test not found', 'error');
          // Remove testId from URL if test doesn't exist
          setSearchParams(prev => {
            const newParams = new URLSearchParams(prev);
            newParams.delete('testId');
            return newParams;
          });
          return;
        }

        console.log('[TestingPage] Test loaded:', {
          _id: test._id,
          athleteId: test.athleteId,
          sport: test.sport
        });

        // Check permissions: test must belong to current user or their athlete
        const testAthleteId = String(test.athleteId);
        const currentUserId = String(u._id);
        const isOwnTest = testAthleteId === currentUserId;
        const isAthleteTest = u.role === 'coach' && u.athletes?.some(a => String(a._id || a) === testAthleteId);
        const currentRole = String(u.role || '').toLowerCase();
        const isTester = currentRole === 'testing'; // testing sees all tests; others scoped by ownership/coach relation
        
        if (!isOwnTest && !isAthleteTest && !isTester) {
          // Avoid console spam in loops; notify once and remove testId from URL
          notify('You do not have permission to view this test', 'error');
          // Remove testId from URL
          setSearchParams(prev => {
            const newParams = new URLSearchParams(prev);
            newParams.delete('testId');
            return newParams;
          });
          return;
        }

        // Mark loaded AFTER permission checks (so we still retry if permissions change)
        lastLoadedTestIdFromUrlRef.current = testIdFromUrl;

        // Set selected athlete to test's athlete (if different)
        if (testAthleteId !== String(selectedAthleteId)) {
          console.log('[TestingPage] Setting selectedAthleteId to test athlete:', testAthleteId);
          setSelectedAthleteId(testAthleteId);
          // Save to localStorage
          try {
            localStorage.setItem('global_selectedAthleteId', testAthleteId);
          } catch (e) {
            console.warn('Failed to save selectedAthleteId to localStorage:', e);
          }
        }

        // Load all tests for this athlete (will trigger loadTests)
        // The test will be selected by PreviousTestingComponent based on testIdFromUrl
      } catch (error) {
        if (ac.signal.aborted || error?.code === 'ERR_CANCELED') return;
        const isTimeout =
          error?.code === 'ECONNABORTED' ||
          (typeof error?.message === 'string' && error.message.includes('timeout'));
        if (isTimeout) {
          console.warn('[TestingPage] Timeout loading test from URL (server slow or overloaded):', testIdFromUrl);
          notify(
            'Loading the test timed out. The list may still load from cache — try refreshing in a moment.',
            'warning'
          );
          return;
        }
        console.error('[TestingPage] Error loading test from URL:', error);
        if (error.response?.status === 404) {
          notify('Test not found', 'error');
        } else {
          notify('Failed to load test', 'error');
        }
        setSearchParams(prev => {
          const newParams = new URLSearchParams(prev);
          newParams.delete('testId');
          return newParams;
        });
      }
    };

    loadTestFromUrl();
    return () => ac.abort();
  }, [testIdFromUrl, isAuthenticated, user?._id, selectedAthleteId, setSearchParams]);

  // Načtení dat při prvním načtení stránky nebo změně atleta
  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login', { replace: true });
      return;
    }

    const targetId = effectiveTargetAthleteId;
    if (!targetId) return;
    if (
      isCoachLikeRole &&
      String(targetId) !== String(user?._id || '') &&
      !pendingAthletesLoaded
    ) {
      return;
    }
    if (isPendingSelectedAthlete) {
      setTests([]);
      return;
    }
    // One fetch per athlete selection. Do NOT depend on `tests` here: when the API returns []
    // that would retrigger the effect forever (guard used to require tests.length > 0).
    if (String(lastLoadedTestsForAthleteRef.current) === String(targetId)) {
      return;
    }
    lastLoadedTestsForAthleteRef.current = targetId;
    loadTests(targetId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tests intentionally omitted; see comment above
  }, [user, isAuthenticated, navigate, effectiveTargetAthleteId, loadTests, isCoachLikeRole, pendingAthletesLoaded, isPendingSelectedAthlete]);

  // Check Strava connection status and show modal if not connected
  useEffect(() => {
    const checkStravaConnection = async () => {
      if (!isAuthenticated || !user) return;
      if (isPendingSelectedAthlete) return;
      
      try {
        const status = await getIntegrationStatus();
        const isConnected = Boolean(status.stravaConnected);
        
        // Show modal if not connected and user hasn't dismissed it (or dismissal expired)
        if (!isConnected) {
          const dismissedKey = `strava_modal_dismissed_${user._id}`;
          const dismissedExpiry = localStorage.getItem(dismissedKey);
          
          // Check if dismissal has expired (7 days)
          const shouldShow = !dismissedExpiry || (Date.now() > parseInt(dismissedExpiry, 10));
          
          if (shouldShow) {
            // Small delay to let page load first
            setTimeout(() => {
              setShowStravaModal(true);
            }, 1000);
          }
        } else {
          // If connected, clear any dismissal flag
          const dismissedKey = `strava_modal_dismissed_${user._id}`;
          localStorage.removeItem(dismissedKey);
        }
      } catch (e) {
        console.warn('Failed to check Strava connection status:', e);
      }
    };

    checkStravaConnection();
  }, [user, isAuthenticated, isPendingSelectedAthlete]);

  // Listen for Strava connection updates (e.g., after connecting)
  useEffect(() => {
    const handleUserUpdate = (event) => {
      const updatedUser = event.detail;
      if (updatedUser?.strava) {
        setShowStravaModal(false);
      }
    };

    window.addEventListener('userUpdated', handleUserUpdate);
    return () => window.removeEventListener('userUpdated', handleUserUpdate);
  }, []);

  // Product walkthrough: open "New testing" panel before create-test steps
  useEffect(() => {
    const openNewTesting = () => setShowNewTesting(true);
    window.addEventListener('lachart:ensureNewTesting', openNewTesting);
    return () => window.removeEventListener('lachart:ensureNewTesting', openNewTesting);
  }, []);

  const handleStravaModalClose = () => {
    setShowStravaModal(false);
    // Remember that user dismissed the modal (for 7 days)
    if (user?._id) {
      const dismissedKey = `strava_modal_dismissed_${user._id}`;
      const expiry = Date.now() + (7 * 24 * 60 * 60 * 1000); // 7 days
      localStorage.setItem(dismissedKey, expiry.toString());
    }
  };
  
  // Listen for URL changes (including testId parameter)
  useEffect(() => {
    const handlePopState = () => {
      // Force re-render when URL changes
      const newParams = new URLSearchParams(window.location.search);
      setSearchParams(newParams);
    };
    
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load zones/profile + Strava/FIT summary data for recommendations
  useEffect(() => {
    const ac = new AbortController();
    const notify = (...args) => addNotificationRef.current(...args);
    const nav = (to, opts) => navigateRef.current(to, opts);

    const loadAdvisor = async () => {
      const u = userRef.current;
      if (!isAuthenticated || !u) return;
      const targetId = effectiveTargetAthleteId;
      if (!targetId) return;
      if (
        isCoachLikeRole &&
        String(targetId) !== String(u?._id || '') &&
        !pendingAthletesLoaded
      ) {
        return;
      }
      if (isPendingSelectedAthlete) {
        setAthleteProfile(null);
        setExternalActivities([]);
        setBikePowerMetrics(null);
        return;
      }

      try {
        setAdvisorLoading(true);

        // ── Wave 1: profile + integration-status in parallel (independent) ────
        const profileUrl = (isCoachLikeRole && String(targetId) !== String(u._id))
          ? `/user/athlete/${targetId}/profile`
          : '/user/profile';

        const [profileResult, statusResult] = await Promise.allSettled([
          api.get(profileUrl, { signal: ac.signal }),
          getIntegrationStatus({ signal: ac.signal, timeout: 30000 }),
        ]);
        if (ac.signal.aborted) return;

        // Handle profile result
        if (profileResult.status === 'fulfilled') {
          setAthleteProfile(profileResult.value?.data ?? null);
        } else {
          const profileErr = profileResult.reason;
          if (ac.signal.aborted || profileErr?.code === 'ERR_CANCELED') return;
          console.error('Failed to load athlete profile:', profileErr);
          if (isCoachLikeRole && String(targetId) !== String(u._id)) {
            console.warn('Clearing problematic athlete selection');
            try {
              localStorage.removeItem('global_selectedAthleteId');
              localStorage.removeItem(`testing_recommendations_open_${targetId}`);
            } catch {}
            setSelectedAthleteId(u?.role === 'coach' ? u._id : null);
            nav('/testing', { replace: true });
            notify('Failed to load athlete data. Please try again.', 'error');
            return;
          }
          setAthleteProfile(null);
        }

        // ── Wave 2: activities (Strava, if connected) + power-metrics — parallel
        const isConnected = statusResult.status === 'fulfilled'
          ? Boolean(statusResult.value?.stravaConnected)
          : false;

        const powerParams = new URLSearchParams();
        if (isCoachLikeRole) powerParams.set('athleteId', targetId);
        powerParams.set('comparePeriod', '90days');

        const activityParams = isCoachLikeRole
          ? { athleteId: targetId, hrTestPlan: 'true' }
          : { hrTestPlan: 'true' };

        const [actsResult, powerResult] = await Promise.allSettled([
          isConnected
            ? listExternalActivities(activityParams, { signal: ac.signal, timeout: 180000 })
            : Promise.resolve([]),
          api.get(`/api/fit/power-metrics?${powerParams.toString()}`, { signal: ac.signal, timeout: 120000 }),
        ]);
        if (ac.signal.aborted) return;

        // Handle activities
        if (actsResult.status === 'fulfilled') {
          const activitiesArray = Array.isArray(actsResult.value) ? actsResult.value : [];
          const limited = activitiesArray.slice(0, MAX_EXTERNAL_ACTIVITIES);
          if (activitiesArray.length > MAX_EXTERNAL_ACTIVITIES) {
            console.warn(`[TestingPage] Limited ${activitiesArray.length} activities to ${MAX_EXTERNAL_ACTIVITIES}`);
          }
          console.log(`[TestingPage] Loaded ${limited.length} external activities for HR test plan`);
          setExternalActivities(limited);
        } else {
          const err = actsResult.reason;
          if (ac.signal.aborted || err?.code === 'ERR_CANCELED') return;
          const isTimeout = err?.code === 'ECONNABORTED' ||
            (typeof err?.message === 'string' && err.message.includes('timeout'));
          if (isTimeout) console.warn('[TestingPage] External activities timed out — HR recommendations limited.');
          else console.warn('Failed to load external activities:', err?.message || err);
          setExternalActivities([]);
        }

        // Handle power metrics
        if (powerResult.status === 'fulfilled') {
          setBikePowerMetrics(powerResult.value?.data || null);
        } else {
          const err = powerResult.reason;
          if (ac.signal.aborted || err?.code === 'ERR_CANCELED') return;
          console.warn('Failed to load power metrics:', err?.message || err);
          setBikePowerMetrics(null);
        }

      } catch (e) {
        if (ac.signal.aborted || e?.code === 'ERR_CANCELED') return;
        console.error('Failed to load testing advisor data:', e);
        setBikePowerMetrics(null);
        setAthleteProfile(null);
        setExternalActivities([]);
      } finally {
        setAdvisorLoading(false);
      }
    };

    loadAdvisor();
    return () => ac.abort();
  }, [isAuthenticated, effectiveTargetAthleteId, isCoachLikeRole, user?._id, user?.role, isPendingSelectedAthlete, pendingAthletesLoaded]);

  // Load HR-first test plan from Strava activities - with error handling
  useEffect(() => {
    let isMounted = true; // Track if component is still mounted
    
    const loadHRTestPlan = async () => {
      if (!isAuthenticated || !user || !externalActivities || externalActivities.length === 0) {
        if (isMounted) setHrTestPlan(null);
        return;
      }

      try {
        if (isMounted) setHrTestPlanLoading(true);

        // Filter activities with HR data and get recent ones (last 42-180 days)
        const now = Date.now();
        const cutoff42 = now - (42 * 24 * 60 * 60 * 1000);
        const cutoff90 = now - (90 * 24 * 60 * 60 * 1000);
        const cutoff180 = now - (180 * 24 * 60 * 60 * 1000);

        // First, filter by sport (only Run and Ride/Bike, exclude Swim)
        const runAndBikeActivities = externalActivities.filter(act => {
          const actSport = (act.sport || act.type || '').toLowerCase();
          return actSport.includes('run') || actSport === 'running' || 
                 actSport.includes('ride') || actSport.includes('bike') || 
                 actSport.includes('cycling') || actSport === 'virtualride';
        });

        const recentActivities = runAndBikeActivities.filter(act => {
          const actDate = new Date(act.startDate || act.date || act.start_date).getTime();
          return actDate >= cutoff42;
        });

        // Expand time window if not enough activities: 90 days, then 180 days
        let activitiesToUse = recentActivities;
        if (recentActivities.length < 8) {
          activitiesToUse = runAndBikeActivities.filter(act => {
              const actDate = new Date(act.startDate || act.date || act.start_date).getTime();
              return actDate >= cutoff90;
            });
        }
        if (activitiesToUse.length < 8) {
          activitiesToUse = runAndBikeActivities.filter(act => {
            const actDate = new Date(act.startDate || act.date || act.start_date).getTime();
            return actDate >= cutoff180;
          });
        }

        // Filter activities that likely have HR
        // Don't slice here - we want to check all available activities
        const activitiesWithHR = activitiesToUse.filter(act => 
          act.averageHeartRate || 
          act.heartRateZones || 
          (act.stravaId && act.sport && (act.sport.toLowerCase().includes('run') || act.sport.toLowerCase().includes('ride')))
        );

        console.log(`[HRTestPlan] Found ${activitiesWithHR.length} activities with HR indicators (from ${activitiesToUse.length} total run/bike activities)`);

        if (activitiesWithHR.length === 0) {
          console.warn('[HRTestPlan] No activities with HR indicators found');
          setHrTestPlan(null);
          return;
        }

        // Load streams sequentially with delay to avoid 429 (Strava rate limit)
        // Strava rate limit: 600 requests per 15 minutes = 1 request per 1.5 seconds
        // We'll use 2-3 seconds delay to be safe, and limit to 15 activities to avoid hitting rate limit
        const maxToFetch = Math.min(15, activitiesWithHR.length);
        const baseDelayMs = 2500; // 2.5 seconds base delay
        const activitiesWithStreams = [];
        let rateLimitHit = false;
        
        // Sort activities by date (newest first) to prioritize recent data
        const sortedActivities = [...activitiesWithHR]
          .filter(act => act.stravaId)
          .sort((a, b) => {
            const dateA = new Date(a.startDate || a.date || a.start_date || 0).getTime();
            const dateB = new Date(b.startDate || b.date || b.start_date || 0).getTime();
            return dateB - dateA; // Newest first
          })
          .slice(0, maxToFetch);
        
        console.log(`[HRTestPlan] Loading streams for ${sortedActivities.length} activities (newest first)`);
        
        for (let i = 0; i < sortedActivities.length; i++) {
          const act = sortedActivities[i];
          if (!act.stravaId || rateLimitHit) continue;
          
          // Delay between requests (longer delay after first few requests)
          if (i > 0) {
            const delay = i < 5 ? baseDelayMs : baseDelayMs * 1.5; // Slower after first 5
            await new Promise(r => setTimeout(r, delay));
          }

          // Retry mechanism with exponential backoff
          let retries = 0;
          const maxRetries = 3;
          let success = false;
          
          while (retries <= maxRetries && !success) {
          try {
            const detail = await getStravaActivityDetail(act.stravaId, isCoachLikeRole ? selectedAthleteId : null);
            if (detail && detail.streams) {
              // Convert Strava streams format to our format
              const streams = {
                time: detail.streams.time?.data || [],
                heartrate: detail.streams.heartrate?.data || [],
                watts: detail.streams.watts?.data || [],
                velocity_smooth: detail.streams.velocity_smooth?.data || [],
                distance: detail.streams.distance?.data || []
              };

                // Check if streams have HR data (required for HR test plan)
                const hrData = streams.heartrate || streams.hr;
                if (!hrData || !Array.isArray(hrData) || hrData.length === 0) {
                  console.warn(`Activity ${act.stravaId} has no HR data in streams`);
                  success = true; // Don't retry if no HR data
                  break;
                }

                // Get sport from detail object first, then fallback to act
                const sportFromDetail = detail.detail?.sport || detail.detail?.type || detail.sport || detail.type;
                const sportFromAct = act.sport || act.type;
                let finalSport = sportFromDetail || sportFromAct || 'Ride';
                
                // Normalize sport names for better matching - exclude Swim
                const sportLower = finalSport.toLowerCase();
                if (sportLower.includes('swim')) {
                  // Skip swim activities - they don't have power data and aren't useful for HR test plan
                  console.warn(`Skipping swim activity ${act.stravaId}`);
                  success = true; // Don't retry
                  break;
                } else if (sportLower.includes('run') || sportLower === 'running') {
                  finalSport = 'Run';
                } else if (sportLower.includes('ride') || sportLower.includes('bike') || sportLower.includes('cycling') || sportLower === 'virtualride') {
                  finalSport = 'Ride';
                } else {
                  // Skip unknown sports
                  console.warn(`Skipping unknown sport activity ${act.stravaId}: ${finalSport}`);
                  success = true; // Don't retry
                  break;
                }

              activitiesWithStreams.push({
                id: act.stravaId || act.id || act._id,
                stravaId: act.stravaId,
                  sport: finalSport,
                  type: finalSport, // Also set type for compatibility
                startDate: act.startDate || act.date || act.start_date,
                date: act.startDate || act.date || act.start_date,
                streams
              });
                success = true; // Successfully loaded
              } else {
                // No streams in response
                success = true; // Don't retry if no streams
            }
          } catch (e) {
              // Check if it's a rate limit error (429)
              if (e.response?.status === 429 || e.message?.includes('429') || (e.code === 'ERR_BAD_REQUEST' && e.response?.status === 429)) {
                rateLimitHit = true;
                console.warn(`[HRTestPlan] Rate limit hit (429) after ${i + 1} activities. Stopping stream loading.`);
                break; // Stop loading more streams
              }
              
              retries++;
              if (retries <= maxRetries) {
                // Exponential backoff: wait 2^retries seconds
                const backoffDelay = Math.min(1000 * Math.pow(2, retries), 10000); // Max 10 seconds
                console.warn(`[HRTestPlan] Retry ${retries}/${maxRetries} for activity ${act.stravaId} after ${backoffDelay}ms delay`);
                await new Promise(r => setTimeout(r, backoffDelay));
              } else {
                console.warn(`[HRTestPlan] Failed to load streams for activity ${act.stravaId} after ${maxRetries} retries:`, e.message);
                success = true; // Stop retrying
              }
            }
          }
        }
        
        if (rateLimitHit) {
          console.warn(`[HRTestPlan] Rate limit reached. Loaded ${activitiesWithStreams.length} activities with streams out of ${sortedActivities.length} attempted.`);
        }

        // Generate HR test plan for both run and bike - with individual error handling
        let runPlan = null;
        let bikePlan = null;
        
        if (activitiesWithStreams.length > 0) {
          const runActivities = activitiesWithStreams.filter(a => {
            const sport = (a.sport || a.type || '').toLowerCase();
            return sport.includes('run') || sport === 'running';
          });
          const bikeActivities = activitiesWithStreams.filter(a => {
            const sport = (a.sport || a.type || '').toLowerCase();
            return sport.includes('ride') || sport.includes('bike') || sport.includes('cycling') || sport === 'virtualride';
          });
          
          console.log(`[HRTestPlan] Loaded ${activitiesWithStreams.length} activities with streams:`, 
            activitiesWithStreams.map(a => ({ sport: a.sport, id: a.stravaId, hrLength: (a.streams?.heartrate || a.streams?.hr || []).length, date: a.startDate || a.date }))
          );
          console.log(`[HRTestPlan] Run activities: ${runActivities.length}, Bike activities: ${bikeActivities.length}`);
          
          try {
            runPlan = await generateHRTestPlan(activitiesWithStreams, 'run');
            console.log('[HRTestPlan] Run plan result:', runPlan);
          } catch (runError) {
            console.warn('Failed to generate run HR test plan:', runError);
            runPlan = null;
          }
          
          try {
            bikePlan = await generateHRTestPlan(activitiesWithStreams, 'bike');
            console.log('[HRTestPlan] Bike plan result:', bikePlan);
          } catch (bikeError) {
            console.warn('Failed to generate bike HR test plan:', bikeError);
            bikePlan = null;
          }
        } else {
          console.warn('[HRTestPlan] No activities with streams loaded');
        }

        if (isMounted) {
          setHrTestPlan({
            run: runPlan,
            bike: bikePlan
          });
        }
      } catch (e) {
        console.error('Failed to generate HR test plan:', e);
        if (isMounted) setHrTestPlan(null);
      } finally {
        if (isMounted) setHrTestPlanLoading(false);
      }
    };
    
    // Only load if we have external activities
    if (externalActivities && externalActivities.length > 0) {
      loadHRTestPlan();
    } else {
      setHrTestPlan(null);
    }
    
    // Cleanup function
    return () => {
      isMounted = false;
    };
  }, [externalActivities, user, isAuthenticated, selectedAthleteId, isCoachLikeRole]);

  // Persist "recommendations panel" visibility per athlete (default: closed)
  useEffect(() => {
    const targetId = selectedAthleteId || user?._id;
    if (!targetId) return;
    const key = `testing_recommendations_open_${targetId}`;
    const saved = localStorage.getItem(key);
    if (saved !== null) {
      setShowRecommendations(saved === 'true');
    } else {
      setShowRecommendations(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAthleteId, user?._id]);

  useEffect(() => {
    const targetId = selectedAthleteId || user?._id;
    if (!targetId) return;
    const key = `testing_recommendations_open_${targetId}`;
    localStorage.setItem(key, String(showRecommendations));
  }, [showRecommendations, selectedAthleteId, user?._id]);

  const formatDateShort = (dateLike) => {
    if (!dateLike) return '';
    try {
      return new Date(dateLike).toLocaleDateString('cs-CZ', { day: '2-digit', month: '2-digit', year: '2-digit' });
    } catch {
      return '';
    }
  };

  const daysSince = (dateLike) => {
    if (!dateLike) return null;
    const d = new Date(dateLike);
    if (Number.isNaN(d.getTime())) return null;
    const diff = Date.now() - d.getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  };

  // Get unitSystem from user profile
  const unitSystem = resolveDistanceUnitSystem(user, 'metric');

  const formatPace = (secondsPerKm) => {
    if (!secondsPerKm || secondsPerKm <= 0) return '-';
    const m = Math.floor(secondsPerKm / 60);
    const s = Math.round(secondsPerKm % 60);
    const unit = unitSystem === 'imperial' ? '/mile' : '/km';
    return `${m}:${String(s).padStart(2, '0')}${unit}`;
  };

  // Simple LT2 estimate from test: interpolate power/pace at 4.0 mmol/L if possible
  // Wrapped in try/catch to prevent freeze on problematic test data
  const estimateLt2FromTest = (test) => {
    try {
    if (!test?.results || test.results.length < 3) return null;
    const sport = test.sport;
    const isPaceSport = sport === 'run' || sport === 'swim';
    const baseLactate = Number(test.baseLactate || 1.0);
    const targetLac = 4.0;

    const pts = test.results
      .map(r => ({
        x: Number(String(r.power ?? '').replace(',', '.')),
        y: Number(String(r.lactate ?? '').replace(',', '.')),
        hr: Number(String(r.heartRate ?? '').replace(',', '.'))
      }))
      .filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));

    if (pts.length < 3) return null;

    // sort: bike ascending power; run/swim descending pace-seconds (slow->fast in seconds means higher seconds is slower)
    pts.sort((a, b) => isPaceSport ? (b.x - a.x) : (a.x - b.x));

    // Find segment crossing target lactate
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      if ((a.y <= targetLac && b.y >= targetLac) || (a.y >= targetLac && b.y <= targetLac)) {
        const t = (targetLac - a.y) / (b.y - a.y || 1);
        const x = a.x + t * (b.x - a.x);
        const hr = (Number.isFinite(a.hr) && Number.isFinite(b.hr)) ? (a.hr + t * (b.hr - a.hr)) : null;
        return { x, hr, lac: targetLac };
      }
    }

    // Fallback: D-max-ish fallback: use point where lactate is ~ base*3 (classic), otherwise max x
    const target2 = baseLactate * 3.0;
    const closest = pts.reduce((best, p) => {
      const d = Math.abs(p.y - target2);
      if (!best || d < best.d) return { p, d };
      return best;
    }, null);
    if (closest?.p) return { x: closest.p.x, hr: closest.p.hr, lac: closest.p.y };

    return { x: pts[pts.length - 1].x, hr: pts[pts.length - 1].hr, lac: pts[pts.length - 1].y };
    } catch (error) {
      console.error('Error estimating LT2 from test:', error, test);
      return null; // Return null instead of crashing
    }
  };

  const latestBySport = useMemo(() => {
    const by = { bike: null, run: null, swim: null };
    (tests || []).forEach(t => {
      const s = normalizeTestSportKey(t?.sport);
      if (!s) return;
      const d = new Date(t.date || t.createdAt || t.updatedAt);
      if (Number.isNaN(d.getTime())) return;
      const prev = by[s];
      if (!prev || d > new Date(prev.date || prev.createdAt || prev.updatedAt || 0)) by[s] = t;
    });
    return by;
  }, [tests]);

  /** Sports the athlete has at least one lactate test for — drives recommendation panel */
  const sportsWithPastTests = useMemo(() => {
    const set = new Set();
    for (const t of tests || []) {
      const k = normalizeTestSportKey(t?.sport);
      if (k) set.add(k);
    }
    return Array.from(set);
  }, [tests]);

  const recommendationsEligible = sportsWithPastTests.length > 0;
  const recRun = sportsWithPastTests.includes('run');
  const recBike = sportsWithPastTests.includes('bike');
  const recSwim = sportsWithPastTests.includes('swim');
  const recSingleSport = sportsWithPastTests.length === 1;

  const runRecentPerf = useMemo(() => {
    // Estimate threshold pace from fastest recent longish run avg speed
    const runs = (externalActivities || []).filter(a => (a?.sport || '').toLowerCase().includes('run'));
    const recent = runs
      .filter(a => (a?.totalElapsedTime || a?.movingTime || 0) >= 20 * 60)
      .slice()
      .sort((a, b) => new Date(b.date || b.startDate || 0) - new Date(a.date || a.startDate || 0));
    const best = recent.reduce((acc, a) => {
      const v = Number(a.avgSpeed || a.averageSpeed || 0);
      if (!v || v <= 0) return acc;
      // keep fastest avg speed among last 90d list (acts are already limited by DB, but ok)
      if (!acc || v > acc.avgSpeed) return { avgSpeed: v, date: a.date || a.startDate, id: a.id };
      return acc;
    }, null);
    if (!best) return null;
    const pace = Math.round(1000 / best.avgSpeed); // sec/km
    const estThreshold = Math.round(pace * 1.05); // threshold pace slightly slower than fastest sustained avg
    return { bestAvgPaceSecPerKm: pace, estThresholdPaceSecPerKm: estThreshold, date: best.date };
  }, [externalActivities]);

  const bikeFtpEstimate = useMemo(() => {
    const p20 = bikePowerMetrics?.personalRecords?.threshold20min || bikePowerMetrics?.allTime?.threshold20min || null;
    if (!p20 || p20 <= 0) return null;
    return Math.round(p20 * 0.95);
  }, [bikePowerMetrics]);

  const advisor = useMemo(() => {
    try {
    const zones = athleteProfile?.powerZones || {};

    // Bike recommendation
    const bikeLt2 = zones?.cycling?.lt2 || null;
    const bikeFtp = bikeFtpEstimate || bikeLt2 || null;
    const bikeStart = bikeFtp ? Math.max(80, Math.round((bikeFtp * 0.55) / 10) * 10) : null;
    const bikeEnd = bikeFtp ? Math.round((bikeFtp * 1.15) / 10) * 10 : null;
    const bikeStep = 25;
    const bikeStageMin = 4;
    const bikeRestMin = 1;
    const bikeStages = bikeStart && bikeEnd ? Math.max(1, Math.round((bikeEnd - bikeStart) / bikeStep) + 1) : null;

    // Run recommendation
    const runLt2 = zones?.running?.lt2 || null; // seconds per km
    const runThr = runLt2 || runRecentPerf?.estThresholdPaceSecPerKm || null;
    const runStart = runThr ? (runThr + 75) : null;
    const runEnd = runThr ? Math.max(120, runThr - 20) : null;
    const runStep = 15; // sec/km
    const runStageMin = 3;
    const runRestMin = 1;
      const runStages = runStart != null && runEnd != null && runStart > runEnd
        ? Math.max(1, Math.round((runStart - runEnd) / runStep) + 1)
        : null;

      // Freshness + drift - with error handling
    const lastBikeTest = latestBySport.bike;
    const lastRunTest = latestBySport.run;
    const bikeTestDays = daysSince(lastBikeTest?.date);
    const runTestDays = daysSince(lastRunTest?.date);
      
      let bikeLt2FromTest = null;
      let runLt2FromTest = null;
      
      try {
        bikeLt2FromTest = estimateLt2FromTest(lastBikeTest)?.x || null;
      } catch (e) {
        console.warn('Error estimating bike LT2 from test:', e);
      }
      
      try {
        runLt2FromTest = estimateLt2FromTest(lastRunTest)?.x || null;
      } catch (e) {
        console.warn('Error estimating run LT2 from test:', e);
      }

    const bikeZoneShift = (bikeLt2 && bikeLt2FromTest)
      ? (Math.abs(bikeLt2 - bikeLt2FromTest) / bikeLt2) > 0.05
      : (bikeLt2 && bikeFtpEstimate) ? (Math.abs(bikeLt2 - bikeFtpEstimate) / bikeLt2) > 0.05 : false;

    const runZoneShift = (runLt2 && runLt2FromTest)
      ? (Math.abs(runLt2 - runLt2FromTest) / runLt2) > 0.05
      : (runLt2 && runRecentPerf?.estThresholdPaceSecPerKm) ? (Math.abs(runLt2 - runRecentPerf.estThresholdPaceSecPerKm) / runLt2) > 0.05 : false;

    return {
      bike: {
        ftp: bikeFtp,
        start: bikeStart,
        end: bikeEnd,
        step: bikeStep,
        stageMin: bikeStageMin,
        restMin: bikeRestMin,
        stages: bikeStages,
        lastTest: lastBikeTest,
        lastTestDays: bikeTestDays,
        lt2FromLastTest: bikeLt2FromTest,
        zoneShift: bikeZoneShift
      },
      run: {
        thresholdPaceSecPerKm: runThr,
        startPaceSecPerKm: runStart,
        endPaceSecPerKm: runEnd,
        stepSecPerKm: runStep,
        stageMin: runStageMin,
        restMin: runRestMin,
          stages: runStages,
        lastTest: lastRunTest,
        lastTestDays: runTestDays,
        lt2FromLastTest: runLt2FromTest,
        zoneShift: runZoneShift
      }
    };
    } catch (error) {
      console.error('Error calculating advisor:', error);
      // Return safe default values instead of crashing
      return {
        bike: {
          ftp: null,
          start: null,
          end: null,
          step: 25,
          stageMin: 4,
          restMin: 1,
          stages: null,
          lastTest: null,
          lastTestDays: null,
          lt2FromLastTest: null,
          zoneShift: false
        },
        run: {
          thresholdPaceSecPerKm: null,
          startPaceSecPerKm: null,
          endPaceSecPerKm: null,
          stepSecPerKm: 15,
          stageMin: 3,
          restMin: 1,
          stages: null,
          lastTest: null,
          lastTestDays: null,
          lt2FromLastTest: null,
          zoneShift: false
        }
      };
    }
  }, [athleteProfile, latestBySport, bikeFtpEstimate, runRecentPerf]);

  const lt2History = useMemo(() => {
    try {
    const bySport = { bike: [], run: [] };
    (tests || []).forEach(t => {
        try {
      const s = normalizeTestSportKey(t?.sport);
      if (s !== 'bike' && s !== 'run') return;
      const d = t.date || t.createdAt;
      const lt2 = estimateLt2FromTest(t)?.x;
      if (!lt2) return;
      bySport[s].push({ date: d, lt2 });
        } catch (testError) {
          console.warn('Error processing test for LT2 history:', testError, t);
          // Skip problematic test, continue with others
        }
    });
    bySport.bike.sort((a, b) => new Date(a.date) - new Date(b.date));
    bySport.run.sort((a, b) => new Date(a.date) - new Date(b.date));
    return bySport;
    } catch (error) {
      console.error('Error calculating LT2 history:', error);
      return { bike: [], run: [] };
    }
  }, [tests]);

  // Posluchač pro změnu atleta z menu
  useEffect(() => {
    const handleAthleteChange = (event) => {
      const { athleteId } = event.detail;
      setSelectedAthleteId(athleteId);
      navigate(`/testing/${athleteId}`, { replace: true });
    };

    window.addEventListener('athleteChanged', handleAthleteChange);
    return () => window.removeEventListener('athleteChanged', handleAthleteChange);
  }, [navigate]);

  const handleAddTest = async (newTest) => {
    try {
      const role = String(user?.role || '').toLowerCase();
      let athleteIdForSave;
      if (role === 'athlete') {
        athleteIdForSave = user._id;
      } else if (role === 'coach') {
        athleteIdForSave = selectedAthleteId || user._id;
      } else if (role === 'tester' || role === 'testing') {
        if (!selectedAthleteId || String(selectedAthleteId) === String(user._id)) {
          throw new Error(
            'Select an athlete in the header before saving a test (tester/testing accounts cannot save a test to their own user).'
          );
        }
        athleteIdForSave = selectedAthleteId;
      } else {
        athleteIdForSave = selectedAthleteId || user._id;
      }

      if (!athleteIdForSave) {
        throw new Error('Could not determine which athlete this test belongs to.');
      }

      const processedTest = {
        ...newTest,
        athleteId: athleteIdForSave,
        results: newTest.results.map(result => ({
          ...result,
          power: Number(result.power) || 0,
          heartRate: Number(result.heartRate) || 0,
          lactate: Number(result.lactate) || 0,
          glucose: Number(result.glucose) || 0,
          RPE: Number(result.RPE) || 0
        }))
      };

      const response = await addTest(processedTest);
      const testId = response.data._id;
      setTests(prev => [...prev, response.data]);
      setShowNewTesting(false);
      try {
        await logTestCreated(processedTest.sport || 'bike', (processedTest.results || []).length, user?._id);
      } catch (e) {
        // non-blocking
      }

      // If coach created test for an athlete, offer to send email
      if (user?.role === 'coach' && selectedAthleteId && selectedAthleteId !== user._id && !isPendingSelectedAthlete) {
        try {
          // Get athlete profile to check for email
          const athleteProfile = await api.get(`/user/athlete/${selectedAthleteId}/profile`);
          const athleteEmail = athleteProfile?.data?.email;
          
          if (athleteEmail) {
            // Ask user if they want to send email
            if (window.confirm(`Test created successfully! Would you like to send the test results to ${athleteEmail}?`)) {
              try {
                await api.post(`/test/${testId}/send-report-email`, {
                  toEmail: athleteEmail
                });
                addNotification('Test sent to athlete\'s email!', 'success');
              } catch (emailError) {
                console.error('Error sending email:', emailError);
                addNotification('Test created, but failed to send email', 'warning');
              }
            }
          }
        } catch (profileError) {
          console.warn('Could not fetch athlete profile for email:', profileError);
        }
      }
    } catch (err) {
      console.error('Error adding test:', err);
      // Must rethrow so TestingForm does not show a false "saved successfully" toast after a failed POST
      throw err;
    }
  };

  const handleAthleteCreated = (athleteId, athleteData) => {
    // Persist newly created athlete as global selection (Dashboard / Training / Testing)
    try {
      localStorage.setItem('global_selectedAthleteId', athleteId);
    } catch {
      // ignore storage errors
    }

    // Select the newly created athlete in Testing page
    setSelectedAthleteId(athleteId);
    navigate(`/testing/${athleteId}`, { replace: true });
    
    // Open the test form
    setShowNewTesting(true);
    
    // Refresh tests list
    loadTests(athleteId);
  };

  const handleAthleteChange = (newAthleteId) => {
    setSelectedAthleteId(newAthleteId);
    navigate(`/testing/${newAthleteId}`, { replace: true });
  };

  if (error) return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-6 text-red-600 bg-red-50 rounded-lg shadow-lg"
    >
      {error}
    </motion.div>
  );

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="w-full max-w-[1600px] mx-auto md:p-6 min-w-0"
    >
      {isCoachLikeRole && (
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mb-2 sm:mb-4 md:mt-6"
        >
          <AthleteSelector
            selectedAthleteId={selectedAthleteId}
            onAthleteChange={handleAthleteChange}
            user={user}
            allowPendingSelection
          />
        </motion.div>
      )}
      {isPendingSelectedAthlete && (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Athlete is waiting for confirmation. You can add tests, but profile and training data are hidden until invitation is accepted.
        </div>
      )}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1 sm:gap-4 mb-3 sm:mb-6">
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 }}
          className="w-full sm:w-auto sm:flex-1 min-w-0"
        >
          <SportsSelector
            sports={sports}
            selectedSport={selectedSport}
            onSportChange={setSelectedSport}
          />
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4 }}
          className="w-full sm:w-auto min-w-0 flex items-center gap-2"
        >
          <button
            onClick={() => setShowGlossary(true)}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center hover:bg-gray-100 rounded-full transition-colors touch-manipulation"
            aria-label="Show glossary"
            title="Training Glossary"
          >
            <InformationCircleIcon className="w-5 h-5 text-gray-500" />
          </button>
          {recommendationsEligible && !showRecommendations && (
            <button
              onClick={() => setShowRecommendations(true)}
              className="px-4 py-2.5 text-sm font-semibold bg-primary text-white rounded-xl hover:bg-primary-dark shadow-md hover:shadow-lg transition-all flex items-center gap-2"
              title="Show Recommendations"
            >
              <InformationCircleIcon className="w-4 h-4" />
              <span className="hidden sm:inline">Show Recommendations</span>
            </button>
          )}
          {user?.role === 'coach' && (
            <button
              onClick={() => setShowAddAthleteModal(true)}
              className="px-4 py-2.5 text-sm font-semibold bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl hover:from-green-600 hover:to-emerald-700 shadow-md hover:shadow-lg transition-all flex items-center gap-2"
              title="Add New Athlete & Create Test"
            >
              <UserPlusIcon className="w-4 h-4" />
              <span className="hidden sm:inline">Add Athlete & Test</span>
            </button>
          )}
          <div data-tour="tour-new-testing" className="w-full sm:w-auto">
            <NotificationBadge
              isActive={showNewTesting}
              onToggle={() => setShowNewTesting((prev) => !prev)}
            />
          </div>
        </motion.div>
      </div>

      {/* Lactate Test Advisor — only after at least one saved test; content filtered by sport(s) tested */}
      {recommendationsEligible && showRecommendations && (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
        transition={{ delay: 0.2 }}
        className="w-full mb-3 sm:mb-4"
      >
          <div className="bg-white rounded-xl shadow border border-gray-100 p-3 sm:p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-gray-900">
                  Lactate Test Recommendations
                </h2>
                <p className="text-[11px] sm:text-xs text-gray-500 mt-0.5 leading-snug">
                  {recSingleSport
                    ? `Next test ideas for ${recRun ? 'running' : recBike ? 'cycling' : 'swimming'} (zones + Strava when connected).`
                    : 'Next test ideas for your tested sports (zones + Strava when connected).'}
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {advisorLoading && (
                  <div className="text-xs text-gray-500 whitespace-nowrap">Loading…</div>
                )}
                <button
                  onClick={() => setShowRecommendations(false)}
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center hover:bg-gray-100 rounded-full transition-colors touch-manipulation"
                  aria-label="Hide recommendations"
                  title="Hide recommendations"
                >
                  <XMarkIcon className="w-4 h-4 text-gray-500" />
                </button>
              </div>
            </div>

          {/* HR-First Test Plan — only for run/bike if that sport has a past test */}
          {(recRun || recBike) && hrTestPlanLoading && (
            <div className="mt-2 text-[11px] text-gray-500">Analyzing HR data from Strava…</div>
          )}
          {hrTestPlan && ((recRun && hrTestPlan.run) || (recBike && hrTestPlan.bike)) && (
            <div className="mt-2 p-2.5 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <h3 className="text-xs font-semibold text-blue-900">HR-first plan (Strava)</h3>
                <div className="text-xs text-blue-600 shrink-0">42–180 d</div>
              </div>
              <div className={`grid gap-2 ${recRun && recBike ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
                {recRun && hrTestPlan.run && (
                  <div className="text-[11px] text-blue-800 leading-snug">
                    <div className="font-semibold mb-1">Running:</div>
                    {(!hrTestPlan.run.hrMax?.value && !hrTestPlan.run.lt1?.hr?.value && !hrTestPlan.run.lt2?.hr?.value) && (
                      <div className="text-blue-600 italic">No HR data available for running activities</div>
                    )}
                    {hrTestPlan.run.hrMax?.value && (
                    <div>HRmax: {hrTestPlan.run.hrMax.value} bpm ({hrTestPlan.run.hrMax.confidence})</div>
                    )}
                    {hrTestPlan.run.lt1?.hr?.value && (
                      <div>
                        LT1: {hrTestPlan.run.lt1.hr.value} bpm ({hrTestPlan.run.lt1.confidence})
                        {hrTestPlan.run.lt1.pace && ` • Pace: ${hrTestPlan.run.lt1.pace}`}
                        {hrTestPlan.run.lt1.power && !hrTestPlan.run.lt1.pace && ` • Power: ${hrTestPlan.run.lt1.power}W`}
                      </div>
                    )}
                    {hrTestPlan.run.lt2?.hr?.value && (
                      <div>
                        LT2: {hrTestPlan.run.lt2.hr.value} bpm ({hrTestPlan.run.lt2.confidence})
                        {hrTestPlan.run.lt2.pace && ` • Pace: ${hrTestPlan.run.lt2.pace}`}
                        {hrTestPlan.run.lt2.power && !hrTestPlan.run.lt2.pace && ` • Power: ${hrTestPlan.run.lt2.power}W`}
                      </div>
                    )}
                    {hrTestPlan.run.protocol && (
                      <div className="mt-2 pt-2 border-t border-blue-300">
                        <div className="font-semibold">Protocol ({hrTestPlan.run.protocol.stageDurationMin} min stages):</div>
                        {hrTestPlan.run.protocol.stages.slice(0, 3).map(stage => (
                          <div key={stage.stage} className="text-xs">
                            Stage {stage.stage}: HR {stage.targetHR} bpm
                            {stage.suggestedPace && ` → ${stage.suggestedPace}`}
                            {stage.suggestedPower && !stage.suggestedPace && ` → ${stage.suggestedPower}W`}
                          </div>
                        ))}
                        {hrTestPlan.run.protocol.stages.length > 3 && (
                          <div className="text-xs text-blue-600">+ {hrTestPlan.run.protocol.stages.length - 3} more</div>
                        )}
                      </div>
                    )}
                  </div>
                )}
                {recBike && hrTestPlan.bike && (
                  <div className="text-[11px] text-blue-800 leading-snug">
                    <div className="font-semibold mb-1">Cycling:</div>
                    {(!hrTestPlan.bike.hrMax?.value && !hrTestPlan.bike.lt1?.hr?.value && !hrTestPlan.bike.lt2?.hr?.value) && (
                      <div className="text-blue-600 italic">No HR data available for cycling activities</div>
                    )}
                    {hrTestPlan.bike.hrMax?.value && (
                    <div>HRmax: {hrTestPlan.bike.hrMax.value} bpm ({hrTestPlan.bike.hrMax.confidence})</div>
                    )}
                    {hrTestPlan.bike.lt1?.hr?.value && (
                      <div>
                        LT1: {hrTestPlan.bike.lt1.hr.value} bpm ({hrTestPlan.bike.lt1.confidence})
                        {hrTestPlan.bike.lt1.power && ` • Power: ${hrTestPlan.bike.lt1.power}W`}
                        {hrTestPlan.bike.lt1.pace && !hrTestPlan.bike.lt1.power && ` • Pace: ${hrTestPlan.bike.lt1.pace}`}
                      </div>
                    )}
                    {hrTestPlan.bike.lt2?.hr?.value && (
                      <div>
                        LT2: {hrTestPlan.bike.lt2.hr.value} bpm ({hrTestPlan.bike.lt2.confidence})
                        {hrTestPlan.bike.lt2.power && ` • Power: ${hrTestPlan.bike.lt2.power}W`}
                        {hrTestPlan.bike.lt2.pace && !hrTestPlan.bike.lt2.power && ` • Pace: ${hrTestPlan.bike.lt2.pace}`}
                      </div>
                    )}
                    {hrTestPlan.bike.protocol && (
                      <div className="mt-2 pt-2 border-t border-blue-300">
                        <div className="font-semibold">Protocol ({hrTestPlan.bike.protocol.stageDurationMin} min stages):</div>
                        {hrTestPlan.bike.protocol.stages.slice(0, 3).map(stage => (
                          <div key={stage.stage} className="text-xs">
                            Stage {stage.stage}: HR {stage.targetHR} bpm
                            {stage.suggestedPower && ` → ${stage.suggestedPower}W`}
                            {stage.suggestedPace && !stage.suggestedPower && ` → ${stage.suggestedPace}`}
                          </div>
                        ))}
                        {hrTestPlan.bike.protocol.stages.length > 3 && (
                          <div className="text-xs text-blue-600">+ {hrTestPlan.bike.protocol.stages.length - 3} more</div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Protocol + LT2 chart side-by-side on md+ (full width, lower height) */}
          <div className="mt-2 space-y-2">
            {recBike && (
              <div className="flex flex-col md:flex-row md:items-stretch gap-2 md:gap-3 rounded-lg border border-gray-200 bg-gray-50/60 p-2 md:p-2.5">
                <div className="flex-1 min-w-0 rounded-md border border-gray-200 bg-gray-50 p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-semibold text-gray-900 text-xs">Bike</div>
                    <div className="text-[10px] text-gray-500 shrink-0">
                      Last: {advisor.bike.lastTest?.date ? `${formatDateShort(advisor.bike.lastTest.date)} (${advisor.bike.lastTestDays ?? '-'}d)` : '—'}
                    </div>
                  </div>
                  <div className="mt-1.5 text-[11px] text-gray-700 space-y-0.5 leading-snug">
                    <div>
                      <span className="font-semibold">Protocol:</span>{' '}
                      {advisor.bike.start && advisor.bike.end
                        ? `${advisor.bike.start}→${advisor.bike.end}W (+${advisor.bike.step}W), ${advisor.bike.stageMin}min + ${advisor.bike.restMin}min rest`
                        : 'Add zones or Strava/FIT power to suggest watt range.'}
                    </div>
                    <div>
                      <span className="font-semibold">Duration:</span>{' '}
                      {advisor.bike.stages
                        ? `~${advisor.bike.stages * (advisor.bike.stageMin + advisor.bike.restMin)} min`
                        : '—'}
                    </div>
                    {(advisor.bike.lastTestDays != null && advisor.bike.lastTestDays > 90) && (
                      <div className="text-rose-600 font-medium text-[11px]">⚠ Last bike test &gt;90d</div>
                    )}
                    {advisor.bike.zoneShift && (
                      <div className="text-amber-700 font-medium text-[11px]">⚠ Check zones vs last test / power</div>
                    )}
                  </div>
                </div>
                {lt2History.bike.length >= 2 && (
                  <div className="w-full md:w-[min(40%,320px)] md:shrink-0 flex flex-col justify-center border border-gray-200 rounded-md bg-white p-1.5">
                    <div className="text-[10px] font-semibold text-gray-800 px-0.5">Bike LT2</div>
                    <div className="h-[100px] md:h-[110px] w-full min-h-[100px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={lt2History.bike.map(p => ({ ...p, dateLabel: formatDateShort(p.date) }))}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="dateLabel" tick={{ fontSize: 8 }} interval="preserveStartEnd" />
                          <YAxis tick={{ fontSize: 8 }} width={32} />
                          <Tooltip />
                          <Line type="monotone" dataKey="lt2" stroke="#ef4444" strokeWidth={1.5} dot={{ r: 2 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="text-[9px] text-gray-500 px-0.5">≈4.0 mmol/L</div>
                  </div>
                )}
              </div>
            )}

            {recRun && (
              <div className="flex flex-col md:flex-row md:items-stretch gap-2 md:gap-3 rounded-lg border border-gray-200 bg-gray-50/60 p-2 md:p-2.5">
                <div className="flex-1 min-w-0 rounded-md border border-gray-200 bg-gray-50 p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-semibold text-gray-900 text-xs">Run</div>
                    <div className="text-[10px] text-gray-500 shrink-0">
                      Last: {advisor.run.lastTest?.date ? `${formatDateShort(advisor.run.lastTest.date)} (${advisor.run.lastTestDays ?? '-'}d)` : '—'}
                    </div>
                  </div>
                  <div className="mt-1.5 text-[11px] text-gray-700 space-y-0.5 leading-snug">
                    <div>
                      <span className="font-semibold">Protocol:</span>{' '}
                      {advisor.run.startPaceSecPerKm != null && advisor.run.endPaceSecPerKm != null
                        ? `${formatPace(advisor.run.startPaceSecPerKm)}→${formatPace(advisor.run.endPaceSecPerKm)} (−${advisor.run.stepSecPerKm}s/km), ${advisor.run.stageMin}min + ${advisor.run.restMin}min rest`
                        : 'Set threshold pace or sync Strava runs for pace range.'}
                    </div>
                    <div>
                      <span className="font-semibold">Duration:</span>{' '}
                      {advisor.run.stages
                        ? `~${advisor.run.stages * (advisor.run.stageMin + advisor.run.restMin)} min`
                        : '—'}
                    </div>
                    <div className="text-gray-600">Sample lactate same point each stage; short rest between steps.</div>
                    {(advisor.run.lastTestDays != null && advisor.run.lastTestDays > 90) && (
                      <div className="text-rose-600 font-medium text-[11px]">⚠ Last run test &gt;90d</div>
                    )}
                    {advisor.run.zoneShift && (
                      <div className="text-amber-700 font-medium text-[11px]">⚠ Check zones vs last test / pace</div>
                    )}
                  </div>
                </div>
                {lt2History.run.length >= 2 && (
                  <div className="w-full md:w-[min(40%,320px)] md:shrink-0 flex flex-col justify-center border border-gray-200 rounded-md bg-white p-1.5">
                    <div className="text-[10px] font-semibold text-gray-800 px-0.5">Run LT2</div>
                    <div className="h-[100px] md:h-[110px] w-full min-h-[100px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={lt2History.run.map(p => ({ ...p, dateLabel: formatDateShort(p.date) }))}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="dateLabel" tick={{ fontSize: 8 }} interval="preserveStartEnd" />
                          <YAxis tick={{ fontSize: 8 }} width={32} reversed />
                          <Tooltip formatter={(v) => formatPace(v)} />
                          <Line type="monotone" dataKey="lt2" stroke="#3b82f6" strokeWidth={1.5} dot={{ r: 2 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="text-[9px] text-gray-500 px-0.5">Lower = faster</div>
                  </div>
                )}
              </div>
            )}

            {recSwim && (
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-semibold text-gray-900 text-xs">Swim</div>
                  <div className="text-[10px] text-gray-500 shrink-0">
                    Last: {latestBySport.swim?.date ? `${formatDateShort(latestBySport.swim.date)} (${daysSince(latestBySport.swim.date) ?? '-'}d)` : '—'}
                  </div>
                </div>
                <p className="mt-1.5 text-[11px] text-gray-700 leading-snug">
                  Stepped pace or send-off times like running; keep stroke and turns consistent between lactate samples.
                </p>
              </div>
            )}
          </div>
          </div>
        </motion.div>
        )}

      {/* Population Insights - Below LT2 charts, for selected sport */}
      {athleteProfile && selectedSport !== 'all' && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="w-full mb-3 sm:mb-6"
        >
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-3 sm:p-4 md:p-6">
            <PopulationInsights 
              athleteProfile={athleteProfile} 
              selectedSport={selectedSport}
            />
          </div>
        </motion.div>
        )}

      <AnimatePresence>
        {showNewTesting && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
            className="mb-3 sm:mb-6 w-full"
          >
            <NewTestingComponent 
              selectedSport={selectedSport}
              onSubmit={handleAddTest}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        data-tour="tour-test-list"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="w-full min-w-0"
      >
        <PreviousTestingComponent 
          key={selectedAthleteId || user?._id} // Reset component when athlete changes
          selectedSport={selectedSport}
          tests={tests}
          setTests={setTests}
          selectedTestId={testIdFromUrl}
          onSelectTestId={handleUrlTestSelection}
          externalActivities={externalActivities}
        />
      </motion.div>

      {/* Glossary Modal */}
      <TrainingGlossary 
        isOpen={showGlossary} 
        onClose={() => setShowGlossary(false)} 
        initialTerm="Lactate Testing"
        initialCategory="Lactate"
      />

      {/* Add Athlete & Test Modal */}
      {user?.role === 'coach' && (
        <AddAthleteAndTestModal
          isOpen={showAddAthleteModal}
          onClose={() => setShowAddAthleteModal(false)}
          onAthleteCreated={handleAthleteCreated}
        />
      )}

      {/* Strava Integration Modal */}
      <StravaIntegrationModal
        isOpen={showStravaModal}
        onClose={handleStravaModalClose}
      />
    </motion.div>
  );
};

export default TestingPage;
