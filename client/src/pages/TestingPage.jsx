import React, { useState, useEffect, useMemo, useRef } from "react";
import { useAthleteSelection } from '../context/AthleteSelectionContext';
import { useAuth } from '../context/AuthProvider';
import { useNotification } from '../context/NotificationContext';
import api, { invalidateCache, addTest } from '../services/api';
import SportsSelector from "../components/Header/SportsSelector";
import PreviousTestingComponent from "../components/Testing-page/PreviousTestingComponent";
import ErrorBoundary from "../components/common/ErrorBoundary";
import NewTestingComponent from "../components/Testing-page/NewTestingComponent";
import CPTestPanel from "../components/Testing-page/CPTestPanel";
import VLamaxPanel from "../components/Testing-page/VLamaxPanel";
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { isCapacitorNative } from '../utils/isNativeApp';
import NativeTestingPage from './NativeTestingPage';
import TrainingGlossary from '../components/DashboardPage/TrainingGlossary';
import { listExternalActivities, getStravaActivityDetail, getIntegrationStatus } from '../services/api';
import { logTestCreated } from '../utils/eventLogger';
import { generateHRTestPlan } from '../utils/hrTestPlanner';
import { XMarkIcon, UserPlusIcon, PresentationChartLineIcon, PlusIcon, InformationCircleIcon, LockClosedIcon, SparklesIcon } from '@heroicons/react/24/outline';
import AddAthleteAndTestModal from '../components/Testing-page/AddAthleteAndTestModal';
import StravaIntegrationModal from '../components/Testing-page/StravaIntegrationModal';
import { usePremium } from '../hooks/usePremium';
import UpgradeModal from '../components/UpgradeModal';
import PopulationInsights from '../components/Testing-page/PopulationInsights';
import ThresholdHistory from '../components/Testing-page/ThresholdHistory';
import TestRecommendationCard from '../components/Testing-page/TestRecommendationCard';

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
  const isCoachLikeRole = role === 'coach' || isTestingRole || isTesterRole ||
    role === 'admin' || (user?.admin === true && role !== 'athlete');
  const { addNotification } = useNotification();
  // ── Single source of truth for athlete selection ─────────────────────────────
  const { selectedAthleteId: _globalAthleteId, setSelectedAthleteId: _setGlobalAthleteId } = useAthleteSelection();
  const selectedAthleteId = isCoachLikeRole
    ? (_globalAthleteId || (user?.role === 'coach' ? user?._id : null) || null)
    : null;
  const setSelectedAthleteId = _setGlobalAthleteId;
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
  // showRecommendations removed — TestRecommendationCard is always visible
  const [pendingAthleteIds, setPendingAthleteIds] = useState([]);
  const [pendingAthletesLoaded, setPendingAthletesLoaded] = useState(false);
  const [hrTestPlan, setHrTestPlan] = useState(null);
  const [hrTestPlanLoading, setHrTestPlanLoading] = useState(false);
  const [showAddAthleteModal, setShowAddAthleteModal] = useState(false);
  const [showStravaModal, setShowStravaModal] = useState(false);
  const [coachAthleteCount, setCoachAthleteCount] = useState(0);
  const { isPremium, gate, UpgradeModalProps } = usePremium();
  const [mobileTab, setMobileTab] = useState('tests');
  const [planLimitModal, setPlanLimitModal] = useState({ isOpen: false, feature: '' });
  const navigate = useNavigate();
  const lastLoadedTestIdFromUrlRef = useRef(null);
  const lastLoadedTestsForAthleteRef = useRef(null);
  const addNotificationRef = useRef(addNotification);
  addNotificationRef.current = addNotification;
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  const userRef = useRef(user);
  userRef.current = user;

  // Native-mode scroll-snap: when this page is shown inside the native app
  // (?full=1 path), enable y-proximity snap on the parent NativeLayout scroll
  // container so each major section lands cleanly. No-op on desktop.
  const pageRootRef = useRef(null);
  useEffect(() => {
    if (!isCapacitorNative()) return;
    const el = pageRootRef.current;
    if (!el) return;
    let node = el.parentElement;
    while (node && node !== document.body) {
      const cs = window.getComputedStyle(node);
      if (cs.overflowY === 'auto' || cs.overflowY === 'scroll') break;
      node = node.parentElement;
    }
    if (!node || node === document.body) return;
    const prev = {
      st: node.style.scrollSnapType,
      sp: node.style.scrollPaddingTop,
      sb: node.style.scrollBehavior,
    };
    node.style.scrollSnapType   = 'y proximity';
    // Sticky top bar inside this page is ~52px tall — snap targets should land below it.
    node.style.scrollPaddingTop = '60px';
    node.style.scrollBehavior   = 'smooth';
    return () => {
      node.style.scrollSnapType   = prev.st || '';
      node.style.scrollPaddingTop = prev.sp || '';
      node.style.scrollBehavior   = prev.sb || '';
    };
  }, []);
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

  // Honor ?new=1 from the native testing page's "+ New" button — open the
  // new-test form on first paint, then strip the flag so back-navigation
  // doesn't keep re-opening it.
  useEffect(() => {
    if (searchParams.get('new') !== '1') return;
    setShowNewTesting(true);
    setMobileTab('tests');
    const next = new URLSearchParams(searchParams);
    next.delete('new');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // Keep a stable ref to isTestingRole so loadTests doesn't need it as dep
  const isTestingRoleRef = useRef(isTestingRole);
  isTestingRoleRef.current = isTestingRole;

  // Stable loadTests — uses refs for volatile values so the callback identity never changes.
  // This prevents the useEffect below from re-running on every render and causing a retry loop.
  const loadTests = React.useCallback(async (targetId) => {
    try {
      setError(null);

      const response = isTestingRoleRef.current
        ? await api.get('/test')
        : await api.get(`/test/list/${targetId}`);

      const testsData = Array.isArray(response.data) ? response.data : [];

      const seenIds = new Set();
      const uniqueTests = [];
      const duplicateIds = [];

      testsData.forEach((test, index) => {
        if (!test || !test._id) {
          console.warn(`[TestingPage] Test at index ${index} is missing _id, skipping`);
          return;
        }
        const testIdStr = String(test._id);
        if (seenIds.has(testIdStr)) {
          duplicateIds.push(testIdStr);
          return;
        }
        seenIds.add(testIdStr);
        uniqueTests.push(test);
      });

      if (duplicateIds.length > 0) {
        console.warn(`[TestingPage] Found ${duplicateIds.length} duplicate test IDs:`, duplicateIds);
        addNotificationRef.current(`Warning: Found ${duplicateIds.length} duplicate test(s). Only showing unique tests.`, 'warning');
      }

      // Limit tests to prevent memory issues
      const limitedTests = uniqueTests.slice(0, MAX_TESTS);

      // Ignore responses if user switched athlete or list was superseded
      if (String(effectiveAthleteIdRef.current) !== String(targetId)) {
        return;
      }

      setTests(limitedTests);
    } catch (err) {
      // Silently ignore aborted/cancelled requests (user switched athlete mid-flight)
      if (err?.code === 'ERR_CANCELED' || err?.name === 'CanceledError') return;

      console.error('Error loading tests:', err);
      setError('Failed to load tests');
      // Only show notification if this athlete is still the current one
      // (avoids stale-request errors firing for the previous user after re-login)
      if (String(effectiveAthleteIdRef.current) === String(targetId)) {
        addNotificationRef.current('Failed to load tests. Please refresh the page.', 'error');
        // Do NOT reset lastLoadedTestsForAthleteRef here — that caused an infinite retry loop
        // where each failure cleared the guard and immediately triggered another fetch attempt.
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // stable — all volatile values accessed via refs

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
    // Only update when URL provides a new explicit athlete — never reset to self
    // when URL has no athlete (that would wipe the localStorage selection).
    if (athleteId && athleteId !== selectedAthleteId) {
      setSelectedAthleteId(athleteId);
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
  }, [athleteId, user, selectedAthleteId, isAuthenticated, navigate, addNotification, isCoachLikeRole, isTestingRole, pendingAthleteIds]); // eslint-disable-line react-hooks/exhaustive-deps

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
        setCoachAthleteCount(list.length);
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
        const currentRole = String(u.role || '').toLowerCase();
        // Coach-like roles: trust the backend auth; also check selected athlete matches test
        const isCoachLikeForTest = ['coach', 'tester', 'testing', 'admin'].includes(currentRole) ||
          (u.admin === true && currentRole !== 'athlete');
        // The backend already enforces that the coach is linked to the athlete;
        // on the frontend we just verify the test belongs to the currently-selected athlete
        // (or allow any coach-like role — backend is the authoritative gatekeeper)
        const isAthleteTest = isCoachLikeForTest;
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
          setSelectedAthleteId(testAthleteId); // context also writes to localStorage
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
  }, [testIdFromUrl, isAuthenticated, user?._id, selectedAthleteId, setSearchParams]); // eslint-disable-line react-hooks/exhaustive-deps

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
      // Coaches test athletes — don't prompt them to connect their own Strava
      if (isCoachLikeRole) return;
      
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
  }, [user, isAuthenticated, isPendingSelectedAthlete, isCoachLikeRole]);

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
  }, [isAuthenticated, effectiveTargetAthleteId, isCoachLikeRole, user?._id, user?.role, isPendingSelectedAthlete, pendingAthletesLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const daysSince = (dateLike) => {
    if (!dateLike) return null;
    const d = new Date(dateLike);
    if (Number.isNaN(d.getTime())) return null;
    const diff = Date.now() - d.getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
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

  // Athlete change events are handled centrally by AthleteSelectionContext.
  // When CoachAthleteBar navigates to /testing/:athleteId, the URL-sync effect below picks it up.

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

      // Free-tier coaches: max 1 test per athlete
      if (!isPremium && isCoachLikeRole && tests.length >= 1) {
        gate('Unlimited tests — upgrade to add more', 'coach');
        return;
      }

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
      // Free-plan test cap. The middleware returns code 'QUOTA_EXCEEDED'; the
      // older inline check returned error 'FREE_PLAN_LIMIT' — match both so the
      // contextual upgrade modal fires reliably at this high-intent moment.
      const d = err?.response?.data;
      if (err?.response?.status === 403 && (d?.code === 'QUOTA_EXCEEDED' || d?.error === 'FREE_PLAN_LIMIT')) {
        setPlanLimitModal({ isOpen: true, feature: 'Unlimited Tests' });
        return;
      }
      // Must rethrow so TestingForm does not show a false "saved successfully" toast after a failed POST
      throw err;
    }
  };

  const handleAthleteCreated = (athleteId, athleteData) => {
    // Select the newly created athlete globally (context writes to localStorage + broadcasts)
    setSelectedAthleteId(athleteId);
    navigate(`/testing/${athleteId}`, { replace: true });
    
    // Open the test form
    setShowNewTesting(true);
    
    // Refresh tests list
    loadTests(athleteId);
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

  // Native app: show the mobile-optimised test list / curve view.
  // Desktop view stays accessible via `?full=1` query param (used by "Open full data" button).
  if (isCapacitorNative() && !searchParams.get('full')) {
    return <NativeTestingPage user={user} athleteId={selectedAthleteId || user?._id} />;
  }

  // activeTab drives both mobile and desktop — 'tests' | 'history'
  const activeTab = mobileTab; // reuse existing state
  const setActiveTab = setMobileTab;

  // When opened in native mode (?full=1), each major section should snap into
  // view as the user scrolls — matches the native dashboard / testing pages.
  // Pure styling helper; no-op on desktop.
  const isNativeFull = isCapacitorNative();
  const sectionSnap = isNativeFull
    ? { scrollSnapAlign: 'start', scrollSnapStop: 'normal' }
    : {};

  return (
    <motion.div
      ref={pageRootRef}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col w-full max-w-[1600px] mx-auto min-h-0 overflow-x-hidden"
    >
      {/* ── Sticky top bar ──────────────────────────────────────── */}
      <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-sm border-b border-gray-100">

        {/* Pending banner */}
        {isPendingSelectedAthlete && (
          <div className="px-4 pt-2">
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-800">
              Athlete pending confirmation — tests can be added but profile data is hidden.
            </div>
          </div>
        )}

        {/* Main toolbar */}
        <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-5 py-2.5">

          {/* Tab pills — Tests / History / CP. Lactate tests + their history
              live in the first two; the third surfaces Critical Power tests,
              which give a non-invasive cross-check on LT2 (trainer feature). */}
          <div className="flex items-center bg-gray-100 rounded-xl p-1 gap-0.5 shrink-0">
            {[
              { id: 'tests', label: 'Tests' },
              { id: 'history', label: 'History' },
              { id: 'cp', label: 'CP' },
              { id: 'vlamax', label: 'VLamax' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 sm:px-4 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all touch-manipulation ${
                  activeTab === tab.id
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Sport selector — flex grows to fill remaining space, scrollable on mobile */}
          <div className="flex-1 min-w-0 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
            <SportsSelector
              sports={sports}
              selectedSport={selectedSport}
              onSportChange={setSelectedSport}
            />
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => setShowGlossary(true)}
              className="w-9 h-9 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 transition-colors touch-manipulation"
              title="Glossary"
            >
              <InformationCircleIcon className="w-5 h-5" />
            </button>

            {user?.role === 'coach' && (
              <button
                onClick={() => {
                  if (!isPremium && coachAthleteCount >= 1) {
                    gate('Multiple athletes — upgrade to add more', 'coach');
                    return;
                  }
                  setShowAddAthleteModal(true);
                }}
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl hover:bg-emerald-100 transition-colors touch-manipulation"
                title="Add Athlete & Test"
              >
                <UserPlusIcon className="w-4 h-4" />
                <span>Add Athlete</span>
              </button>
            )}
            {user?.role === 'coach' && (
              <button
                onClick={() => {
                  if (!isPremium && coachAthleteCount >= 1) {
                    gate('Multiple athletes — upgrade to add more', 'coach');
                    return;
                  }
                  setShowAddAthleteModal(true);
                }}
                className="sm:hidden w-9 h-9 flex items-center justify-center rounded-full text-emerald-600 hover:bg-emerald-50 transition-colors touch-manipulation"
              >
                <UserPlusIcon className="w-5 h-5" />
              </button>
            )}

            {/* New Test button — always visible */}
            <button
              data-tour="tour-new-testing"
              onClick={() => {
                // Free-tier coaches: max 1 test; gate before opening the form
                if (!showNewTesting && !isPremium && isCoachLikeRole && tests.length >= 1) {
                  gate('Unlimited tests — upgrade to add more', 'coach');
                  return;
                }
                setShowNewTesting(prev => !prev);
                setActiveTab('tests');
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all touch-manipulation ${
                showNewTesting
                  ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  : 'bg-primary text-white shadow-sm hover:bg-primary-dark'
              }`}
            >
              {showNewTesting
                ? <><XMarkIcon className="w-4 h-4" /><span className="hidden sm:inline">Cancel</span></>
                : <><PlusIcon className="w-4 h-4" /><span className="hidden sm:inline">New Test</span></>
              }
            </button>
          </div>
        </div>
      </div>

      {/* ── Tab content ─────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 px-3 sm:px-5 py-4 space-y-4 overflow-x-hidden">
        <AnimatePresence mode="wait">

          {/* ── TESTS tab ─────────────────────────────────────── */}
          {activeTab === 'tests' && (
            <motion.div
              key="tab-tests"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
              className="space-y-4"
            >
              {/* New test form — height auto-animation removed because it
                  was janky on mobile (the form is ~1500px tall and
                  animating height to/from 0 caused layout thrash plus a
                  rendering glitch where the inputs flickered). Plain fade
                  is enough. */}
              {showNewTesting && (
                <motion.div
                  key="new-test-form"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  style={sectionSnap}
                >
                  <NewTestingComponent
                    selectedSport={selectedSport}
                    onSubmit={handleAddTest}
                  />
                </motion.div>
              )}

              {/* Free-plan usage banner removed — all users have unlimited tests */}

              {/* Tests list — wrapped in ErrorBoundary so a single bad
                  test (NaN, weird lactate sequence, etc.) can't freeze
                  the whole page like Federico's did. */}
              <div data-tour="tour-test-list" style={sectionSnap}>
                <ErrorBoundary
                  fallback={(
                    <div style={{ padding: 24, textAlign: 'center', color: '#B84238', fontSize: 13 }}>
                      Couldn't render this test — try selecting a different one from the list.
                    </div>
                  )}
                >
                  <PreviousTestingComponent
                    key={effectiveTargetAthleteId || user?._id}
                    selectedSport={selectedSport}
                    tests={tests}
                    setTests={setTests}
                    selectedTestId={testIdFromUrl}
                    onSelectTestId={handleUrlTestSelection}
                    externalActivities={externalActivities}
                    athleteId={effectiveTargetAthleteId}
                  />
                </ErrorBoundary>
              </div>
            </motion.div>
          )}

          {/* ── HISTORY tab ───────────────────────────────────── */}
          {activeTab === 'history' && (
            <motion.div
              key="tab-history"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
              className="space-y-4"
            >
              {tests.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <PresentationChartLineIcon className="w-14 h-14 text-gray-200 mb-4" />
                  <p className="text-gray-500 font-medium mb-1">No tests yet</p>
                  <p className="text-sm text-gray-400 mb-4">Add your first lactate test to start tracking your history.</p>
                  <button
                    onClick={() => { setShowNewTesting(true); setActiveTab('tests'); }}
                    className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary-dark transition-colors"
                  >
                    <PlusIcon className="w-4 h-4" /> Add first test
                  </button>
                </div>
              ) : (
                <>
                  {!isPremium ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                        <LockClosedIcon className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <p className="text-base font-bold text-gray-900">Threshold History &amp; Insights</p>
                        <p className="text-sm text-gray-500 mt-1 max-w-sm">Upgrade to Pro to see your LT1/LT2 progression, test recommendations and population benchmarks.</p>
                      </div>
                      <button
                        onClick={() => gate('Threshold History & Insights', 'pro')}
                        className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white text-sm font-semibold rounded-xl hover:bg-primary/90 transition-colors shadow-sm"
                      >
                        <SparklesIcon className="w-4 h-4" /> Upgrade to Pro
                      </button>
                    </div>
                  ) : (
                    <>
                      {/* Threshold progression */}
                      <div style={sectionSnap}>
                        <ThresholdHistory
                          tests={tests}
                          onSelectTestId={(id) => { handleUrlTestSelection(id); setActiveTab('tests'); }}
                          externalActivities={externalActivities}
                          bikePowerMetrics={bikePowerMetrics}
                          onClose={null}
                        />
                      </div>

                      {/* Desktop: two-column for protocol + insights */}
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4" style={sectionSnap}>
                        {recommendationsEligible && (
                          <TestRecommendationCard
                            sportsWithPastTests={sportsWithPastTests}
                            latestBySport={latestBySport}
                            advisor={advisor}
                            hrTestPlan={hrTestPlan}
                            hrTestPlanLoading={hrTestPlanLoading}
                            bikePowerMetrics={bikePowerMetrics}
                            externalActivities={externalActivities}
                            advisorLoading={advisorLoading}
                            onStartTest={(sport) => {
                              setSelectedSport(sport === 'bike' ? 'bike' : sport === 'run' ? 'run' : 'swim');
                              setShowNewTesting(true);
                              setActiveTab('tests');
                            }}
                            onClose={null}
                          />
                        )}

                        {athleteProfile && selectedSport !== 'all' && (
                          <PopulationInsights
                            athleteProfile={athleteProfile}
                            selectedSport={selectedSport}
                          />
                        )}
                      </div>

                      {/* Prompt if no insights available */}
                      {(!recommendationsEligible && (!athleteProfile || selectedSport === 'all')) && (
                        <div className="rounded-2xl border border-dashed border-gray-200 p-8 text-center text-sm text-gray-400">
                          Select a specific sport above to see protocol recommendations and population insights.
                        </div>
                      )}
                    </>
                  )}
                </>
              )}
            </motion.div>
          )}

          {/* ── CP tab ────────────────────────────────────────── */}
          {activeTab === 'cp' && (
            <motion.div
              key="tab-cp"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
            >
              {selectedSport === 'all' ? (
                <div className="rounded-2xl border border-dashed border-gray-200 p-8 text-center text-sm text-gray-400">
                  Pick a specific sport above (Bike / Run / Swim) to manage Critical Power tests.
                </div>
              ) : (
                <CPTestPanel
                  athleteId={selectedAthleteId || user?._id}
                  sport={selectedSport}
                />
              )}
            </motion.div>
          )}

          {/* ── VLamax tab ────────────────────────────────────── */}
          {activeTab === 'vlamax' && (
            <motion.div
              key="tab-vlamax"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
            >
              {selectedSport === 'all' ? (
                <div className="rounded-2xl border border-dashed border-gray-200 p-8 text-center text-sm text-gray-400">
                  Pick a specific sport above to manage VLamax (sprint) tests.
                </div>
              ) : (
                <VLamaxPanel
                  athleteId={selectedAthleteId || user?._id}
                  sport={selectedSport}
                />
              )}
            </motion.div>
          )}

        </AnimatePresence>
      </div>

      {/* ── Modals ──────────────────────────────────────────────── */}
      <TrainingGlossary
        isOpen={showGlossary}
        onClose={() => setShowGlossary(false)}
        initialTerm="Lactate Testing"
        initialCategory="Lactate"
      />
      {user?.role === 'coach' && (
        <AddAthleteAndTestModal
          isOpen={showAddAthleteModal}
          onClose={() => setShowAddAthleteModal(false)}
          onAthleteCreated={handleAthleteCreated}
          athleteCount={coachAthleteCount}
        />
      )}
      <UpgradeModal {...UpgradeModalProps} />
      <UpgradeModal
        isOpen={planLimitModal.isOpen}
        onClose={() => setPlanLimitModal(s => ({ ...s, isOpen: false }))}
        feature={planLimitModal.feature}
        requiredPlan="pro"
      />
      <StravaIntegrationModal
        isOpen={showStravaModal}
        onClose={handleStravaModalClose}
      />
    </motion.div>
  );
};

export default TestingPage;
