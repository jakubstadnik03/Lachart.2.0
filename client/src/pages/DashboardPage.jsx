import React, { useEffect, useState, useCallback } from "react";
import ReactDOM from 'react-dom';
import { isCapacitorNative } from '../utils/isNativeApp';
import NativeDashboardPage from './NativeDashboardPage';
import { useAthleteSelection } from '../context/AthleteSelectionContext';
import { useNavigate, useParams } from 'react-router-dom';
import { usePremium } from '../hooks/usePremium';
import UpgradeModal from '../components/UpgradeModal';
import { LockClosedIcon } from '@heroicons/react/24/outline';
// import SportsSelector from "../components/Header/SportsSelector";
import TrainingLoadHeatmap from "../components/DashboardPage/TrainingLoadHeatmap";
import { TrainingStats } from "../components/DashboardPage/TrainingStats";
import TrainingGraph from "../components/DashboardPage/TrainingGraph";
import SpiderChart from "../components/DashboardPage/SpiderChart";
import FormFitnessChart from "../components/DashboardPage/FormFitnessChart";
import WeeklyTrainingLoad from "../components/DashboardPage/WeeklyTrainingLoad";
import { useAuth } from '../context/AuthProvider';
import api, { getFitTrainings, listExternalActivities, autoSyncStravaActivities, getIntegrationStatus, getStravaAuthUrl, addTraining, updateTraining, getStravaActivityDetail, getFormFitnessData, getTodayMetrics } from '../services/api';
import { maybeNotifyStravaActivitiesImported } from '../utils/stravaImportLocalNotification';
import { useNotification } from '../context/NotificationContext';
import LactateCurveCalculator from "../components/Testing-page/LactateCurveCalculator";
import DateSelector from "../components/DateSelector";
import LactateStatistics from "../components/LactateStatistics/LactateStatistics";
import WeeklyCalendar from "../components/DashboardPage/WeeklyCalendar";
import WorkoutPlanModal from "../components/WorkoutPlanner/WorkoutPlanModal";
import { getPlannedWorkouts, createPlannedWorkout, updatePlannedWorkout, deletePlannedWorkout } from '../services/workoutPlannerApi';
import DashboardEmptyWelcome from "../components/DashboardPage/DashboardEmptyWelcome";
import LT2TrendSparkline from '../components/DashboardPage/LT2TrendSparkline';
import ZoneDistributionChart from '../components/DashboardPage/ZoneDistributionChart';
import IntensityDistributionChart from '../components/DashboardPage/IntensityDistributionChart';
import TrainingForm from '../components/TrainingForm';
import { motion, AnimatePresence } from 'framer-motion';
//import { useNotification } from '../context/NotificationContext';
// import { 
//   CalendarIcon, 
//   ClockIcon, 
//   FireIcon, 
//   HeartIcon, 
//   ChartBarIcon,
//   ArrowTrendingUpIcon,
//   ArrowTrendingDownIcon
// } from '@heroicons/react/24/outline';

/** API může vrátit { error } nebo objekt místo pole — ochrana před .map/.forEach */
function normalizeApiList(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.trainings)) return payload.trainings;
  if (payload && Array.isArray(payload.activities)) return payload.activities;
  if (payload && Array.isArray(payload.data)) return payload.data;
  if (payload && Array.isArray(payload.items)) return payload.items;
  return [];
}

/** Aligns with integrations `/activities` cap (~2000); was 100 so older weeks looked empty. */
const MAX_DASHBOARD_CALENDAR_ACTIVITIES = 2000;

function sortAndLimitCalendarActivities(combined) {
  if (!Array.isArray(combined) || combined.length === 0) return [];
  const tMs = (act) => {
    const d = new Date(act?.date ?? act?.timestamp ?? act?.startDate ?? 0);
    const x = d.getTime();
    return Number.isNaN(x) ? 0 : x;
  };
  return [...combined].sort((a, b) => tMs(b) - tMs(a)).slice(0, MAX_DASHBOARD_CALENDAR_ACTIVITIES);
}

// ── Premium locked placeholder (shown in place of gated widgets) ──────────────
function PremiumLockedCard({ title, description, onUpgrade }) {
  return (
    <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8 flex flex-col items-center justify-center gap-3 text-center h-full min-h-[220px]">
      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
        <LockClosedIcon className="w-5 h-5 text-primary" />
      </div>
      <div>
        <h3 className="font-semibold text-gray-900 text-sm mb-1">{title}</h3>
        <p className="text-xs text-gray-500 max-w-[220px]">{description}</p>
      </div>
      <button
        onClick={onUpgrade}
        className="mt-1 px-4 py-1.5 bg-primary text-white text-xs font-semibold rounded-lg hover:bg-primary/90 transition-colors"
      >
        Upgrade to Pro
      </button>
    </div>
  );
}

export default function DashboardPage() {
  const { athleteId } = useParams();
  const { user, isAuthenticated } = useAuth();
  const role = String(user?.role || '').toLowerCase();
  const isTestingRole = role === 'testing' || role === 'tester';
  // Admin with role='athlete' should see athlete UI, not coach UI
  const isCoachLikeRole = ['admin', 'coach', 'testing', 'tester'].includes(role) ||
    (user?.admin === true && role !== 'athlete');
  const { addNotification } = useNotification();
  const { isPremium, gate, UpgradeModalProps } = usePremium();
  const [stravaConnected, setStravaConnected] = useState(false);
  const [showStravaBanner, setShowStravaBanner] = useState(false);
  // ── Single source of truth for athlete selection ─────────────────────────────
  const { selectedAthleteId: _globalAthleteId, setSelectedAthleteId: _setGlobalAthleteId } = useAthleteSelection();
  // For non-coach roles use own ID; for coach/tester roles use global selection.
  const selectedAthleteId = isCoachLikeRole ? (_globalAthleteId || user?._id || null) : (user?._id || null);
  const setSelectedAthleteId = _setGlobalAthleteId;
  /** Atletes never had `selectedAthleteId` set (it stayed null); charts used `athleteId` and bailed out. Coaches use selection. */
  const dashboardDataAthleteId = selectedAthleteId || user?._id || null;
  const [trainings, setTrainings] = useState([]);
  const [regularTrainings, setRegularTrainings] = useState([]); // Trainings from /training route
  // eslint-disable-next-line no-unused-vars
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  // Dashboard sport filter should not be shared with TrainingPage/TrainingStats localStorage key.
  // Use per-athlete dashboard key so it won't "randomly" flip to run/bike when another page saves its selection.
  const dashboardSportStorageKey = `dashboard_selectedSport_${selectedAthleteId || athleteId || user?._id || 'unknown'}`;
  const [selectedSport, setSelectedSport] = useState('all');
  
  // Load selectedSport per athlete
  useEffect(() => {
    if (!dashboardSportStorageKey) return;
    const saved = localStorage.getItem(dashboardSportStorageKey);
    const nextSport = saved || 'all';
    // Guard against state churn loops when key changes rapidly.
    setSelectedSport((prev) => (prev === nextSport ? prev : nextSport));
  }, [dashboardSportStorageKey]);
  
  // Listen for activity title renames (from CalendarView modal) and patch
  // the local trainings array so TrainingStats / TrainingGraph re-render with
  // the new title without a full refetch. Also patch the on-disk cache so
  // the change survives a reload (cache TTL is 10 min).
  useEffect(() => {
    const cachePatch = (matcher, patcher) => {
      try {
        Object.keys(localStorage).forEach(key => {
          if (!key.startsWith('athleteTrainings_v3_')) return;
          const raw = localStorage.getItem(key);
          if (!raw) return;
          try {
            const arr = JSON.parse(raw);
            if (!Array.isArray(arr)) return;
            let changed = false;
            const next = arr.map(t => {
              if (matcher(t)) { changed = true; return patcher(t); }
              return t;
            });
            if (changed) localStorage.setItem(key, JSON.stringify(next));
          } catch { /* corrupt entry — ignore */ }
        });
      } catch { /* localStorage unavailable — ignore */ }
    };

    const buildMatcher = (id) => {
      const rawId = String(id).replace(/^(strava-|fit-|regular-|training-)/, '');
      return (t) => String(t._id) === rawId || String(t.id) === rawId
                 || String(t.stravaId) === rawId || `strava-${t.stravaId}` === String(id)
                 || `fit-${t._id}` === String(id) || `regular-${t._id}` === String(id);
    };

    const onTitleUpdated = (e) => {
      const { id, title } = e?.detail || {};
      if (!id || !title) return;
      const matches = buildMatcher(id);
      const patch = (t) => ({ ...t, title, titleManual: title });
      setTrainings(prev => prev.map(t => matches(t) ? patch(t) : t));
      cachePatch(matches, patch);
    };
    const onCategoryUpdated = (e) => {
      const { id, category } = e?.detail || {};
      if (!id) return;
      const matches = buildMatcher(id);
      const patch = (t) => ({ ...t, category: category || null });
      setTrainings(prev => prev.map(t => matches(t) ? patch(t) : t));
      cachePatch(matches, patch);
    };
    window.addEventListener('activityTitleUpdated', onTitleUpdated);
    window.addEventListener('activityCategoryUpdated', onCategoryUpdated);
    return () => {
      window.removeEventListener('activityTitleUpdated', onTitleUpdated);
      window.removeEventListener('activityCategoryUpdated', onCategoryUpdated);
    };
  }, []);

  // Persist selectedSport per athlete
  useEffect(() => {
    if (!dashboardSportStorageKey) return;
    localStorage.setItem(dashboardSportStorageKey, selectedSport);
  }, [dashboardSportStorageKey, selectedSport]);
  const [selectedTitle, setSelectedTitle] = useState(null);
  const [selectedTraining, setSelectedTraining] = useState(null);
  const [currentTest, setCurrentTest] = useState(null);
  const [tests, setTests] = useState([]);
  const [pendingAthleteIds, setPendingAthleteIds] = useState([]);
  const navigate = useNavigate();  /** Avoid flashing the empty-state hero while API/cache is still settling */
  const [showEmptyWelcomeDelayed, setShowEmptyWelcomeDelayed] = useState(false);
  /** True once trainings + calendar have been fetched at least once (avoids flash on initial load) */
  const [trainingsInitialized, setTrainingsInitialized] = useState(false);

  // Check Strava connection status (athletes + coaches — own Strava / profile photo)
  useEffect(() => {
    const checkStravaConnection = async () => {
      if (!user) return;
      const hasLocalStravaConnection = Boolean(user?.strava?.accessToken || user?.strava?.athleteId);

      // Trust local profile first to avoid false banner flashes on slow/intermittent API.
      if (hasLocalStravaConnection) {
        setStravaConnected(true);
        setShowStravaBanner(false);
      }
      
      try {
        const status = await getIntegrationStatus();
        // Prefer positive local state over transient API false.
        const isConnected = Boolean(status?.stravaConnected) || hasLocalStravaConnection;
        setStravaConnected(isConnected);
        if (isConnected) {
          setShowStravaBanner(false);
        }
        
        // Show banner if not connected and user hasn't dismissed it recently
        if (!isConnected) {
          const dismissedKey = `strava_banner_dismissed_${user._id}`;
          const dismissedTimestamp = localStorage.getItem(dismissedKey);
          const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
          
          if (!dismissedTimestamp || parseInt(dismissedTimestamp) < oneWeekAgo) {
            setShowStravaBanner(true);
          }
        }
      } catch (error) {
        console.warn('Failed to check Strava connection:', error);
        // Keep banner hidden when local profile already says connected.
        if (hasLocalStravaConnection) {
          setStravaConnected(true);
          setShowStravaBanner(false);
        }
      }
    };
    
    checkStravaConnection();
  }, [user]);

  useEffect(() => {
    const loadCoachAthletes = async () => {
      if (!isCoachLikeRole) return;
      try {
        const response = await api.get('/user/coach/athletes');
        const list = Array.isArray(response?.data) ? response.data : [];
        const pendingIds = list
          .filter((a) => a?.invitationPending || a?.coachLinkStatus === 'pending')
          .map((a) => String(a._id));
        setPendingAthleteIds(pendingIds);
      } catch (e) {
        console.warn('Failed to load coach athletes for pending-state checks:', e?.message || e);
      }
    };
    loadCoachAthletes();
  }, [isCoachLikeRole]);
  
  const handleConnectStrava = async () => {
    try {
      const url = await getStravaAuthUrl();
      window.location.href = url;
    } catch (error) {
      console.error('Strava connect error:', error);
      addNotification('Failed to start Strava connection', 'error');
    }
  };
  
  const handleDismissBanner = () => {
    if (user) {
      const dismissedKey = `strava_banner_dismissed_${user._id}`;
      localStorage.setItem(dismissedKey, Date.now().toString());
      setShowStravaBanner(false);
    }
  };
  
  // Training calendar data (FIT files and Strava activities)
  const [calendarData, setCalendarData] = useState([]); // Combined data from calendar
  const [plannedWorkouts, setPlannedWorkouts] = useState([]);
  const [planModal, setPlanModal] = useState(null);
  // Native mobile dashboard — fitness metrics
  const [todayMetrics, setTodayMetrics] = useState({});
  const [sparklineData, setSparklineData] = useState([]);
  const [isTrainingFormOpen, setIsTrainingFormOpen] = useState(false);

  // For heavy dashboard widgets (TrainingTable, TrainingStats, TrainingGraph, SpiderChart),
  // work only with a limited number of the most recent trainings to keep calculations fast.
  const MAX_DASHBOARD_TRAININGS = 40;
  const recentTrainings = React.useMemo(() => {
    if (!trainings || trainings.length === 0) return [];
    return [...trainings]
      .filter(t => {
        // Strava activities (id or stravaId set)
        if (t.stravaId || t.id || t.raw?.id) return true;
        // FIT file trainings (have timestamp)
        if (t.timestamp) return true;
        // Regular trainings with exported lap results
        if (Array.isArray(t.results) && t.results.length > 0) return true;
        // Regular trainings with a title and some duration/date — include them too
        if ((t.title || t.titleManual) && (t.date || t.duration)) return true;
        return false;
      })
      .sort((a, b) => {
        const dateA = new Date(a.date || a.startDate || a.timestamp || 0);
        const dateB = new Date(b.date || b.startDate || b.timestamp || 0);
        return dateB - dateA;
      })
      .slice(0, MAX_DASHBOARD_TRAININGS);
  }, [trainings]);

  // Subset for "Training History" / TrainingGraph — only the user-curated
  // Training-collection records (manual entries + Strava/FIT activities the
  // user explicitly exported via Add Lactate). Filter is intentionally
  // identical to TrainingPage's filteredTrainings so both pages show the
  // same dropdown.
  //
  // Important: apply the filter to the FULL `trainings` array (not
  // recentTrainings, which is capped at 40 raw-imports-included). Then sort
  // by date and cap. Otherwise a flood of recent Strava imports could
  // squeeze older exported records out of the 40-item window before the
  // filter even ran.
  const exportedTrainings = React.useMemo(() => {
    if (!trainings || trainings.length === 0) return [];
    return [...trainings]
      .filter(t => {
        if (!t) return false;
        if (t.source === 'strava' || t.source === 'fit') return false;
        const idStr = String(t.id || '');
        if (idStr.startsWith('strava-') || idStr.startsWith('fit-')) return false;
        return !!t._id || !t.source;
      })
      .sort((a, b) => {
        const dateA = new Date(a.date || a.startDate || a.timestamp || 0);
        const dateB = new Date(b.date || b.startDate || b.timestamp || 0);
        return dateB - dateA;
      })
      .slice(0, MAX_DASHBOARD_TRAININGS);
  }, [trainings]);

  // Load athlete trainings with localStorage caching (shared with TrainingPage).
  // Also sets regularTrainings state so loadCalendarData can be called without
  // a separate /user/athlete/:id/trainings round-trip.
  const loadTrainings = useCallback(async (targetId) => {
    // v3 — titleManual now wins over .title/.name in the merged mapping.
    const cacheKey = `athleteTrainings_v3_${targetId}`;
    const tsKey = `${cacheKey}_ts`;
    const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

    let usedCache = false;

    // 1) Try to load trainings from cache for fast initial render
    try {
      const cached = localStorage.getItem(cacheKey);
      const ts = localStorage.getItem(tsKey);
      if (cached && ts) {
        const age = Date.now() - parseInt(ts, 10);
        if (!Number.isNaN(age) && age < CACHE_TTL) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed)) {
            setTrainings(parsed);
            setTrainingsInitialized(true);
            usedCache = true;
            setLoading(false);
          }
        }
      }
    } catch (e) {
      console.warn('Error reading trainings cache (dashboard):', e);
    }

    // 2) Always try to refresh from API (stale-while-revalidate)
    try {
      if (!usedCache) {
        setLoading(true);
      }
      setError(null);

      const response = await api.get(`/user/athlete/${targetId}/trainings`, {
        // Shorter TTL in axios cache – protects server on quick navigations
        cacheTtlMs: 60000,
      });

      // Extract and store regular trainings before merging with FIT/Strava data.
      // This avoids a second fetch of the same endpoint by loadRegularTrainings.
      const regularTrainingsData = normalizeApiList(response.data);
      setRegularTrainings(regularTrainingsData);

      // Optionally enrich with FIT trainings and Strava activities (same as TrainingPage)
      const [fitResponse, stravaResponse] = await Promise.all([
        api.get(`/api/fit/trainings`, { params: { athleteId: targetId } }).catch(() => ({ data: [] })),
        api.get(`/api/integrations/activities`, { params: { athleteId: targetId } }).catch(() => ({ data: [] }))
      ]);

      const allTrainings = [
        ...regularTrainingsData,
        ...normalizeApiList(fitResponse?.data).map(t => ({
          ...t,
          category: t.category || null,
          // User-renamed title (titleManual) wins so the renames done via the
          // Planned dialog actually show up everywhere (TrainingHistory,
          // TrainingStats, TrainingGraph, etc.). Falls back through auto
          // titles → original filename.
          title: t.titleManual || t.title || t.titleAuto || t.originalFileName || null,
          // FIT trainings use timestamp as their date anchor
          date: t.date || t.timestamp || null,
          // Normalize sport from FIT values to short form
          sport: (() => {
            const s = String(t.sport || '').toLowerCase();
            if (s === 'cycling' || s.includes('cycle') || s.includes('bike') || s.includes('ride')) return 'bike';
            if (s === 'running' || s.includes('run')) return 'run';
            if (s === 'swimming' || s.includes('swim')) return 'swim';
            return t.sport || null;
          })(),
        })),
        ...normalizeApiList(stravaResponse?.data).map(a => ({
          ...a,
          category: a.category || null,
          // Strava uses startDate; all rendering/sorting code reads .date
          date: a.date || a.startDate || a.timestamp || null,
          // titleManual (user rename) takes precedence over the original
          // Strava name — otherwise the rename done from CalendarView never
          // shows up in TrainingHistory / TrainingStats / TrainingGraph.
          title: a.titleManual || a.name || a.title || null,
        }))
      ];

      setTrainings(allTrainings);
      setTrainingsInitialized(true);

      // 3) Save to localStorage so next dashboard/TrainingPage open is instant
      try {
        const payload = JSON.stringify(allTrainings);
        if (payload.length < 300000) {
          localStorage.setItem(cacheKey, payload);
          localStorage.setItem(tsKey, Date.now().toString());
        }
      } catch (e) {
        console.warn('Error saving trainings cache (dashboard):', e);
      }

      // Return both merged list and raw regular trainings so callers can pass
      // regularTrainings directly to loadCalendarData without another fetch.
      return { allTrainings, regularTrainings: regularTrainingsData };
    } catch (error) {
      console.error('Error loading trainings (dashboard):', error);
      // setError(error.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [setLoading]);

  const loadTests = useCallback(async (targetId) => {
    try {
      setLoading(true);
      setError(null);
      // Coach-like roles must load only selected athlete tests.
      const testId = targetId;
      const response = await api.get(`/test/list/${testId}`);
      if (response && response.data) {
        setTests(response.data);
        return response.data;
      }
    } catch (error) {
      console.error('Error loading tests:', error);
      setError('Failed to load tests');
      return null;
    } finally {
      setLoading(false);
    }
  }, [setLoading]);

  const loadAthlete = useCallback(async (targetId) => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.get(`/user/athlete/${targetId}`);
      if (response && response.data) {
        return response.data;
      }
    } catch (error) {
      console.error('Error loading athlete:', error);
    //  setError(error.message);
    } finally {
      setLoading(false);
    }
  }, [setLoading]);

  // Load training calendar data (FIT files and Strava activities) with localStorage caching.
  // Accepts optional regularTrainingsParam so the main loader can pass data directly
  // without waiting for a state update cycle.
  const loadCalendarData = useCallback(async (targetId, regularTrainingsParam) => {
    const regTrainings = regularTrainingsParam || regularTrainings;
    try {
      // Check localStorage cache first
      const cacheKey = `calendarData_${targetId}`;
      const cacheTimestampKey = `calendarData_timestamp_${targetId}`;
      const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours - long cache to reduce API calls
      
      const cachedData = localStorage.getItem(cacheKey);
      const cacheTimestamp = localStorage.getItem(cacheTimestampKey);
      const now = Date.now();
      
      // Use cache if it exists and is less than 24 hours old
      // Also use cache if it exists but is expired (as fallback while loading)
      if (cachedData) {
        try {
          const parsed = JSON.parse(cachedData);
          const isCacheValid = cacheTimestamp && (now - parseInt(cacheTimestamp)) < CACHE_DURATION;
          
          if (isCacheValid) {
            // Cache is valid, use it immediately
            setCalendarData(parsed);
            console.log('[DashboardPage] Using valid cached calendar data:', parsed.length, 'activities');
            // Still load from API in background to refresh cache, but don't wait
            // Continue to load from API to refresh cache
          } else if (parsed.length > 0) {
            // Cache is expired but has data, use it as fallback while loading
            setCalendarData(parsed);
            console.log('[DashboardPage] Using expired cache as fallback:', parsed.length, 'activities');
          }
        } catch (e) {
          console.error('Error parsing cached calendar data:', e);
          // Continue to load from API
        }
      } else {
        console.log('[DashboardPage] No cached calendar data found');
      }
      
      const [fitData, stravaData] = await Promise.all([
        getFitTrainings(targetId).catch(err => {
          console.error('Error loading FIT trainings:', err);
          return [];
        }),
        listExternalActivities({ athleteId: targetId }).catch(err => {
          // Silently handle 429 (Too Many Requests) and network errors - don't log
          if (err.response?.status !== 429 && err.code !== 'ERR_NETWORK' && err.code !== 'ERR_EMPTY_RESPONSE') {
            console.error('Error loading Strava activities:', err);
          }
          // Return empty array on error - will use cached data if available
          return [];
        })
      ]);

      const trainingByStravaId = new Map();
      (regTrainings || []).forEach(t => {
        const sid = t?.sourceStravaActivityId;
        if (sid) trainingByStravaId.set(String(sid), t);
      });

      const combined = [
        ...(fitData || []).map(t => ({
          ...t,
          type: 'fit',
          date: t.timestamp,
          title: t.titleManual || t.titleAuto || t.originalFileName || 'Untitled Training',
          sport: t.sport,
          avgPower: t.avgPower,
          maxPower: t.maxPower,
          avgHeartRate: t.avgHeartRate,
          maxHeartRate: t.maxHeartRate,
          totalTime: t.totalElapsedTime || t.totalTimerTime,
          distance: t.totalDistance,
          tss: t.tss || t.totalTSS || t.trainingStressScore
        })),
        ...(regTrainings || [])
          .filter(t => !t?.sourceStravaActivityId)
          .map(t => ({ 
            ...t,
            id: `regular-${t._id}`, 
            type: 'regular',
            date: t.date || t.timestamp, 
            title: t.title || 'Untitled Training', 
            sport: t.sport,
            category: t.category || null,
            distance: t.totalDistance || t.distance,
            totalTime: t.totalElapsedTime || t.totalTimerTime || t.duration,
            tss: t.tss || t.totalTSS,
            avgPower: t.avgPower || t.averagePower || null,
            avgSpeed: t.avgSpeed || t.averageSpeed || null
          })),
        ...(stravaData || []).map(a => {
          const stravaId = a.stravaId || a.id;
          // If there's a linked Training-model entry, use its title (but keep Strava data)
          const linkedTraining = trainingByStravaId.get(String(stravaId));
          return {
          ...a,
          type: 'strava',
          date: a.startDate,
            title: linkedTraining?.title || a.titleManual || a.name || 'Untitled Activity',
            linkedTrainingTitle: linkedTraining?.title || null,
          sport: a.sport,
            stravaId: stravaId, // Ensure stravaId is set (raw ID)
            id: `strava-${stravaId}`, // Use prefixed ID to match FitAnalysisPage format
          avgPower: a.averagePower || a.average_watts,
          weightedAveragePower: a.weightedAveragePower ?? a.weighted_average_watts ?? null,
          avgSpeed: a.averageSpeed || a.average_speed,
          maxPower: a.maxPower || a.max_watts,
          avgHeartRate: a.averageHeartRate || a.average_heartrate,
          maxHeartRate: a.maxHeartRate || a.max_heartrate,
          totalTime: a.movingTime || a.elapsedTime,
          distance: a.distance,
          tss:
            linkedTraining?.tss ||
            linkedTraining?.totalTSS ||
            a.tss ||
            a.totalTSS ||
            a.total_tss ||
            null,
          kilojoules: a.kilojoules ?? a.raw?.kilojoules
          };
        })
      ];

      const limitedForView = sortAndLimitCalendarActivities(combined);

      // Cache the combined data
      try {
        const dataToCache = JSON.stringify(limitedForView);
        if (dataToCache.length < 450000) {
          localStorage.setItem(cacheKey, dataToCache);
          localStorage.setItem(cacheTimestampKey, now.toString());
        }
      } catch (e) {
        if (e.name === 'QuotaExceededError' || e.code === 22) {
          // Try to clear old calendar cache entries
          try {
            const keysToRemove = [];
            for (let i = 0; i < localStorage.length; i++) {
              const key = localStorage.key(i);
              if (key && key.startsWith('calendarData_')) {
                keysToRemove.push(key);
              }
            }
            // Remove oldest entries first (keep only the most recent 3)
            keysToRemove.sort().slice(0, Math.max(0, keysToRemove.length - 3)).forEach(key => {
              localStorage.removeItem(key);
              localStorage.removeItem(key.replace('calendarData_', 'calendarTimestamp_'));
            });
            // Retry caching with limited data
            try {
              const smaller = limitedForView.slice(0, 400);
              localStorage.setItem(cacheKey, JSON.stringify(smaller));
              localStorage.setItem(cacheTimestampKey, now.toString());
            } catch (retryError) {
              console.error('Error caching calendar data after cleanup:', retryError);
            }
          } catch (cleanupError) {
            console.error('Error during localStorage cleanup:', cleanupError);
          }
        } else {
          console.error('Error caching calendar data:', e);
        }
      }

      setCalendarData(limitedForView);
      console.log('[DashboardPage] Calendar data loaded and set:', limitedForView.length, 'activities');
      if (limitedForView.length > 0) {
        console.log('[DashboardPage] Sample activity:', limitedForView[0]);
      }
      return limitedForView;
    } catch (error) {
      console.error('Error loading calendar data:', error);
      
      // Try to use cached data even if expired on error
      try {
        const cacheKey = `calendarData_${targetId}`;
        const cachedData = localStorage.getItem(cacheKey);
        if (cachedData) {
          const parsed = JSON.parse(cachedData);
          setCalendarData(parsed);
          return parsed;
        }
      } catch (e) {
        // Ignore cache errors
      }
      
      return [];
    }
  }, [regularTrainings]);

  // Listen for activity updates from other pages (e.g., FitAnalysisPage)
  useEffect(() => {
    const handleActivityUpdate = (event) => {
      const updatedActivity = event.detail;
      console.log('[DashboardPage] Received activityUpdated event:', updatedActivity);
      // Track if we found and updated the activity
      let found = false;
      // Update the activity in calendarData
      setCalendarData(prev => {
        const updated = prev.map(act => {
          // Match by type and id
          if (updatedActivity.type === 'fit' && act.type === 'fit' && act._id === updatedActivity._id) {
            found = true;
            // For FIT trainings, update title from titleManual or title
            const newTitle = updatedActivity.title || updatedActivity.titleManual || act.title;
            return { 
              ...act, 
              ...updatedActivity,
              title: newTitle,
              titleManual: updatedActivity.titleManual || updatedActivity.title || act.titleManual
            };
          } else if (updatedActivity.type === 'strava' && act.type === 'strava') {
            // Match by stravaId or id (handle both string and number comparisons)
            // In DashboardPage, id is `strava-${stravaId}`, stravaId is raw ID
            // In FitAnalysisPage event, id can be raw ID or `strava-${id}`
            const actStravaId = String(act.stravaId || '');
            const actId = String(act.id || '');
            const updatedStravaId = String(updatedActivity.stravaId || updatedActivity.id || '');
            const updatedId = String(updatedActivity.id || '');
            
            // Remove 'strava-' prefix if present for comparison
            const actIdClean = actId.replace(/^strava-/, '');
            const updatedIdClean = updatedId.replace(/^strava-/, '');
            
            // Match if:
            // 1. Raw stravaIds match
            // 2. act.id (with prefix) matches updatedId (with or without prefix)
            // 3. act.stravaId matches updatedId (with or without prefix)
            const matches = (actStravaId && updatedStravaId && actStravaId === updatedStravaId) ||
                          (actIdClean && updatedIdClean && actIdClean === updatedIdClean) ||
                          (actStravaId && updatedIdClean && actStravaId === updatedIdClean) ||
                          (actId && updatedId && actId === updatedId) ||
                          (actIdClean && updatedStravaId && actIdClean === updatedStravaId);
            
            if (matches) {
              found = true;
              // For Strava activities, update title from titleManual, name, or title
              const newTitle = updatedActivity.title || updatedActivity.titleManual || updatedActivity.name || act.title;
              console.log('[DashboardPage] Updating Strava activity:', {
                actId: act.id,
                actStravaId: act.stravaId,
                actIdClean: actIdClean,
                updatedId: updatedActivity.id,
                updatedStravaId: updatedStravaId,
                updatedIdClean: updatedIdClean,
                oldTitle: act.title,
                newTitle: newTitle,
                matches: matches
              });
              return { 
                ...act, 
                ...updatedActivity,
                title: newTitle,
                titleManual: updatedActivity.titleManual || updatedActivity.title || updatedActivity.name || act.titleManual,
                name: updatedActivity.name || updatedActivity.title || updatedActivity.titleManual || act.name
              };
            }
          }
          return act;
        });
        console.log('[DashboardPage] Updated calendarData after activity update:', {
          found: found,
          totalActivities: updated.length,
          sampleActivity: updated.length > 0 ? updated[0] : null
        });
        // Return new array to ensure React detects the change
        return [...updated];
      });
      // Invalidate cache to force reload on next refresh
      const targetId = isCoachLikeRole && selectedAthleteId ? selectedAthleteId : user?._id;
      const cacheKey = `calendarData_${targetId}`;
      const cacheTimestampKey = `calendarData_timestamp_${targetId}`;
      localStorage.removeItem(cacheKey);
      localStorage.removeItem(cacheTimestampKey);
      
      // Don't reload immediately - the state update above should be enough
      // Only reload if we didn't find the activity (to ensure we have the latest data)
      if (targetId && !found) {
        console.log('[DashboardPage] Activity not found in calendarData, reloading...');
        setTimeout(() => {
          loadCalendarData(targetId);
        }, 100);
      } else if (found) {
        console.log('[DashboardPage] Activity found and updated, no reload needed');
      }
    };

    window.addEventListener('activityUpdated', handleActivityUpdate);
    return () => window.removeEventListener('activityUpdated', handleActivityUpdate);
  }, [selectedAthleteId, user?._id, user?.role, isCoachLikeRole, loadCalendarData]);

  // Removed: cascade useEffect that re-triggered loadCalendarData on regularTrainings change.
  // The main loader now passes regularTrainings directly to loadCalendarData.

  // Sync selectedAthleteId when URL athlete param changes.
  // NOTE: Do NOT reset to coach-self when URL has no athlete — that wipes the selection
  // that was stored in localStorage when the coach navigated via menu.
  useEffect(() => {
    if (athleteId && athleteId !== selectedAthleteId) {
      setSelectedAthleteId(athleteId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [athleteId]);

  // Load calendar data from cache on mount
  useEffect(() => {
    if (!user?._id) return;
    
    const targetId = isCoachLikeRole ? selectedAthleteId : user._id;
    if (!targetId) return;
    const cacheKey = `calendarData_${targetId}`;
    
    try {
      const cachedData = localStorage.getItem(cacheKey);
      if (cachedData) {
        const parsed = JSON.parse(cachedData);
        if (parsed && parsed.length > 0) {
          setCalendarData(parsed);
          console.log('[DashboardPage] Loaded calendar data from cache on mount:', parsed.length, 'activities');
        }
      }
    } catch (e) {
      console.error('Error loading calendar data from cache on mount:', e);
    }
  }, [user?._id, selectedAthleteId, user?.role, isCoachLikeRole]);

  // Athlete change events are now handled centrally by AthleteSelectionContext.

  // Track last loaded athleteId to prevent duplicate loads
  const lastLoadedAthleteIdRef = React.useRef(null);
  const lastLoadTimeRef = React.useRef(null);
  const hasLoadedOnceRef = React.useRef(false);

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login', { replace: true });
      return;
    }

    // Determine target athlete ID
    const targetAthleteId = isCoachLikeRole ? selectedAthleteId : user?._id;
    
    if (!targetAthleteId) {
      return;
    }

    const isPendingAthleteSelection =
      isCoachLikeRole &&
      String(targetAthleteId) !== String(user?._id || '') &&
      pendingAthleteIds.includes(String(targetAthleteId));
    if (isPendingAthleteSelection) {
      const fallbackAthleteId = String(user?._id || '');
      if (fallbackAthleteId && String(selectedAthleteId || '') !== fallbackAthleteId) {
        setSelectedAthleteId(fallbackAthleteId); // context also writes to localStorage
        if (athleteId) {
          navigate('/dashboard', { replace: true });
        }
      }
      setError('Waiting for athlete confirmation');
      return;
    }

    // selectedAthleteId already defaults to user._id via the context-derived value above.

    // Skip if we already loaded data for this athlete recently (5 minutes minimum between loads)
    // BUT always load at least once
    const MIN_LOAD_INTERVAL = 5 * 60 * 1000;
    const now = Date.now();
    const shouldSkip = lastLoadedAthleteIdRef.current === targetAthleteId && 
                      lastLoadTimeRef.current && 
                      (now - lastLoadTimeRef.current) < MIN_LOAD_INTERVAL &&
                      hasLoadedOnceRef.current;
    
    if (shouldSkip) {
      return;
    }

    const loadData = async () => {
      try {
        lastLoadedAthleteIdRef.current = targetAthleteId;
        lastLoadTimeRef.current = now;
        hasLoadedOnceRef.current = true;
        
        // Testing role: dashboard is focused on tests only (no training widgets/calendar).
        if (isTestingRole) {
          const athleteData = await loadAthlete(targetAthleteId);
          await loadTests(targetAthleteId);
          if (athleteData && athleteData._id !== selectedAthleteId) {
            // Keep current selection stable to avoid effect loops.
          }

          return;
        }

        // loadTrainings fetches /user/athlete/:id/trainings AND sets regularTrainings state,
        // so we no longer need a separate loadRegularTrainings call for that endpoint.
        const trainingsResult = await loadTrainings(targetAthleteId);

        // Load the remaining data in parallel, passing regularTrainings directly to
        // loadCalendarData so it doesn't need to wait for state to propagate.
        const [athleteData] = await Promise.all([
          loadAthlete(targetAthleteId),
          loadTests(targetAthleteId),
          loadCalendarData(targetAthleteId, trainingsResult?.regularTrainings)
        ]);

        if (athleteData && athleteData._id !== selectedAthleteId) {
          // Keep current selection stable to avoid effect loops.
        }
      } catch (error) {
        console.error('Error loading data:', error);
      }
    };

    loadData();
  // selectedSport intentionally excluded — sport is a client-side filter, not a data-load trigger.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [athleteId, user?._id, user?.role, selectedAthleteId, isAuthenticated, navigate, loadTrainings, loadAthlete, loadTests, loadCalendarData, isTestingRole, isCoachLikeRole, pendingAthleteIds]);

  // Auto-sync Strava activities if enabled
  useEffect(() => {
    if (!user?._id || !user?.strava?.autoSync) {
      return;
    }

    // Only auto-sync for the current user (not for coach viewing athlete)
    const targetAthleteId = isCoachLikeRole ? selectedAthleteId : user?._id;
    if (targetAthleteId !== user._id) {
      return; // Don't auto-sync when viewing another athlete
    }

    // Check if we've already synced in this session
    const syncKey = `strava_auto_sync_dashboard_${user._id}`;
    const lastSync = sessionStorage.getItem(syncKey);
    const now = Date.now();
    if (lastSync && (now - parseInt(lastSync)) < 5 * 60 * 1000) { // Don't sync more than once per 5 minutes
      return;
    }

    // Auto-sync on mount and when user changes
    const performAutoSync = async () => {
      try {
        const result = await autoSyncStravaActivities();
        sessionStorage.setItem(syncKey, now.toString());
        // Only surface a toast when ACTUAL new activities arrived. Bumping
        // on updated>0 with imported===0 produced the noisy
        // "Strava: 0 new activities imported" banner on every dashboard load,
        // because re-fetching the same window almost always updates the most
        // recent ride's stats without importing anything new.
        if (result.imported > 0) {
          console.log(`Auto-sync completed: ${result.imported} imported, ${result.updated} updated`);
          maybeNotifyStravaActivitiesImported(result.imported, user?.notifications, result.latestActivityId);
          addNotification(`Strava: ${result.imported} new ${result.imported === 1 ? 'activity' : 'activities'} imported`, 'success');
          // Reload all data after sync — loadTrainings sets regularTrainings state internally,
          // so one call replaces the old loadRegularTrainings + loadTrainings pair.
          const trainingsResult = await loadTrainings(user._id);
          loadCalendarData(user._id, trainingsResult?.regularTrainings);

          // Auto-open the newest imported activity on first sight. We dedupe
          // via localStorage so the same activity doesn't pop up repeatedly
          // on every reload — only the first time the user lands on the
          // dashboard after it was imported.
          if (result.latestActivityId) {
            const seenKey = `strava_lastSeenAutoOpen_${user._id}`;
            const previouslySeen = localStorage.getItem(seenKey);
            const candidate = String(result.latestActivityId);
            if (previouslySeen !== candidate) {
              localStorage.setItem(seenKey, candidate);
              // Native dashboard's `?openActivity=` watcher opens the
              // ActivityFullModal once activities arrive in state. Use
              // React Router's navigate so its history listener fires.
              navigate(
                `${window.location.pathname}?openActivity=${encodeURIComponent(`strava-${candidate}`)}`,
                { replace: true },
              );
            }
          }
        } else if (result.updated > 0) {
          // Silent refresh — Strava updated an existing ride (e.g. lap names,
          // power averages re-processed). No toast, but reload data so the
          // user sees the latest numbers on next render.
          const trainingsResult = await loadTrainings(user._id);
          loadCalendarData(user._id, trainingsResult?.regularTrainings);
        }
      } catch (error) {
        // 429 errors are already handled in autoSyncStravaActivities
        console.log('Auto-sync failed:', error);
        // Silent fail - don't show errors to user
      }
    };

    // Delay auto-sync slightly to avoid blocking page load
    const timeoutId = setTimeout(performAutoSync, 2000);
    
    return () => clearTimeout(timeoutId);
  }, [user?._id, user?.strava?.autoSync, user?.notifications, selectedAthleteId, user?.role, loadCalendarData, loadTrainings, addNotification, isCoachLikeRole, navigate]);

  // ── Manual Strava sync (used by NativeDashboardPage refresh button) ─────
  // Bypasses the auto-sync `user.strava.autoSync` gate and the 5-minute
  // sessionStorage throttle — the server still enforces its own cooldown so
  // we won't hammer Strava. Reloads trainings + calendar on success.
  const performManualStravaSync = useCallback(async () => {
    if (!user?._id || !user?.strava?.accessToken) {
      return { imported: 0, updated: 0, error: 'Strava not connected' };
    }
    try {
      // Pull-to-refresh / button-tap → force=true bypasses the server's
      // 60-second cooldown so the user always sees fresh data, even right
      // after a webhook event.
      const result = await autoSyncStravaActivities({ force: true });
      if (result?.error) {
        addNotification(`Strava sync: ${result.error}`, 'error');
        return result;
      }
      if (result?.imported > 0 || result?.updated > 0) {
        maybeNotifyStravaActivitiesImported(result.imported, user?.notifications, result.latestActivityId);
        addNotification(
          `Strava: ${result.imported || 0} new ${result.imported === 1 ? 'activity' : 'activities'} imported`,
          'success'
        );
        const trainingsResult = await loadTrainings(user._id);
        loadCalendarData(user._id, trainingsResult?.regularTrainings);
      } else if (result?.skipped) {
        addNotification('Synced recently — please wait a few minutes before trying again.', 'info');
      } else {
        addNotification('Strava: no new activities.', 'info');
      }
      return result;
    } catch (e) {
      console.log('Manual Strava sync failed:', e);
      addNotification('Strava sync failed. Please try again later.', 'error');
      return { imported: 0, updated: 0, error: e?.message };
    }
  }, [user, addNotification, loadTrainings, loadCalendarData]);

  // ── Planned workouts for dashboard calendar ───────────────────────────────
  const loadDashboardPlannedWorkouts = useCallback(async () => {
    try {
      const role = String(user?.role || '').toLowerCase();
      const isCoachLike = ['coach', 'tester', 'testing', 'admin'].includes(role);
      const opts = isCoachLike && selectedAthleteId ? { athleteId: selectedAthleteId } : {};
      const data = await getPlannedWorkouts(opts);
      setPlannedWorkouts(Array.isArray(data) ? data : []);
    } catch (_) {}
  }, [selectedAthleteId, user?.role]);

  useEffect(() => { loadDashboardPlannedWorkouts(); }, [loadDashboardPlannedWorkouts]);

  // ── Native dashboard: fitness/form metrics (only fetched when native) ─────
  const loadFormFitness = useCallback(async (targetId) => {
    if (!targetId) return;
    try {
      const [todayRes, sparkRes] = await Promise.all([
        getTodayMetrics(targetId).catch(() => ({ data: {} })),
        getFormFitnessData(targetId, 90, 'all').catch(() => ({ data: [] })),
      ]);
      if (todayRes?.data) setTodayMetrics(todayRes.data);
      if (sparkRes?.data) {
        const raw = Array.isArray(sparkRes.data) ? sparkRes.data : (sparkRes.data?.data || []);
        setSparklineData(raw);
      }
    } catch (_) {}
  }, []);

  useEffect(() => {
    if (!isCapacitorNative()) return;
    loadFormFitness(dashboardDataAthleteId);
  }, [dashboardDataAthleteId, loadFormFitness]);

  const handleDashboardPlanSave = useCallback(async (data) => {
    try {
      const role = String(user?.role || '').toLowerCase();
      const isCoachLike = ['coach', 'tester', 'testing', 'admin'].includes(role);
      const opts = isCoachLike && selectedAthleteId ? { athleteId: selectedAthleteId } : {};
      if (planModal?.workout?._id) {
        const updated = await updatePlannedWorkout(planModal.workout._id, data);
        setPlannedWorkouts(prev => prev.map(p => p._id === updated._id ? updated : p));
      } else {
        const created = await createPlannedWorkout({ ...data, ...opts });
        setPlannedWorkouts(prev => [...prev, created]);
      }
      setPlanModal(null);
    } catch (_) {}
  }, [planModal, selectedAthleteId, user?.role]);

  const handleDashboardPlanDelete = useCallback(async (pw) => {
    if (!window.confirm('Delete this planned workout?')) return;
    try {
      await deletePlannedWorkout(pw._id);
      setPlannedWorkouts(prev => prev.filter(p => p._id !== pw._id));
      setPlanModal(null);
    } catch (_) {}
  }, []);

  const handleDashboardCopyPlan = useCallback(async (pw, newDateStr) => {
    try {
      const role = String(user?.role || '').toLowerCase();
      const isCoachLike = ['coach', 'tester', 'testing', 'admin'].includes(role);
      const opts = isCoachLike && selectedAthleteId ? { athleteId: selectedAthleteId } : {};
      const { _id, status, executionData, ...rest } = pw;
      const created = await createPlannedWorkout({ ...rest, date: newDateStr, status: 'planned', ...opts });
      setPlannedWorkouts(prev => [...prev, created]);
    } catch (_) {}
  }, [selectedAthleteId, user?.role]);
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (recentTrainings.length > 0) {
      // Get available sports from recent trainings only (keeps UI snappy)
      const availableSports = [...new Set(recentTrainings.map(t => t.sport))].filter(Boolean);
      
      // If current selectedSport is not available and is not 'all', switch to first available
      // 'all' is always valid, so we don't reset it
      if (availableSports.length > 0 && selectedSport !== 'all' && !availableSports.includes(selectedSport)) {
        setSelectedSport(availableSports[0]);
        return;
      }
      
      const sportTrainings = selectedSport === 'all'
        ? recentTrainings
        : recentTrainings.filter(t => t.sport === selectedSport);

      // Preserve the user's pick across both sport and "raw vs exported"
      // boundaries. recentTrainings is capped at 40 and includes raw
      // Strava/FIT imports, so a Training-collection record the user just
      // picked from the dropdown (which is built from exportedTrainings —
      // a different 40-slice) may legitimately be absent here. Validate
      // against the full \`trainings\` array instead.
      const titleExists = !!selectedTitle && (trainings || []).some(t => t.title === selectedTitle);
      if (!titleExists) {
        const latest = [...sportTrainings].sort((a, b) =>
          new Date(b.date || b.startDate || b.timestamp || 0) - new Date(a.date || a.startDate || a.timestamp || 0)
        )[0];
        if (latest) {
          setSelectedTitle(latest.title);
          setSelectedTraining(latest._id || latest.id);
        }
      }
    }
  }, [selectedSport, recentTrainings, selectedTitle, trainings]);

  // Reset initialization flag whenever the viewed athlete changes so the banner
  // doesn't flash while the new athlete's data is still being fetched.
  useEffect(() => {
    setTrainingsInitialized(false);
    setShowEmptyWelcomeDelayed(false);
  }, [selectedAthleteId]);

  useEffect(() => {
    // Don't start the timer until we've received at least one response from the API/cache
    // — this prevents the welcome panel from flashing on initial load when data isn't ready yet
    if (!trainingsInitialized) return;
    const noTrainings = !recentTrainings || recentTrainings.length === 0;
    const noCalendar = !calendarData || calendarData.length === 0;
    if (!noTrainings || !noCalendar) {
      setShowEmptyWelcomeDelayed(false);
      return undefined;
    }
    // Short extra delay after data confirms empty (avoids a brief flash if calendar loads slightly later)
    const t = window.setTimeout(() => setShowEmptyWelcomeDelayed(true), 800);
    return () => clearTimeout(t);
  }, [recentTrainings, calendarData, trainingsInitialized]);

  const showAthleteEmptyWelcome =
    !isTestingRole &&
    user?.role === 'athlete' &&
    String(selectedAthleteId || '') === String(user._id || '') &&
    showEmptyWelcomeDelayed &&
    (!recentTrainings || recentTrainings.length === 0) &&
    (!calendarData || calendarData.length === 0);

  // Filter tests based on selected sport
  const filteredTests = selectedSport === 'all' 
    ? tests 
    : tests.filter(test => test.sport === selectedSport);

  // Update currentTest when filteredTests or selectedSport changes
  useEffect(() => {
    if (filteredTests.length === 0) {
      setCurrentTest(null);
      return;
    }
    // If current test is not in filtered tests, select the most recent one
    if (currentTest && !filteredTests.find(t => t._id === currentTest._id)) {
      const mostRecent = filteredTests.reduce((latest, cur) =>
        new Date(cur.date) > new Date(latest.date) ? cur : latest
      );
      setCurrentTest(mostRecent);
    } else if (!currentTest) {
      // If no current test, select the most recent one
      const mostRecent = filteredTests.reduce((latest, cur) =>
        new Date(cur.date) > new Date(latest.date) ? cur : latest
      );
      setCurrentTest(mostRecent);
    }
  }, [filteredTests, selectedSport]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDateSelectorTestSelect = (testId) => {
    const selectedTest = filteredTests.find(test => test._id === testId);
    if (selectedTest) {
      setCurrentTest(selectedTest);
    }
  };

  const handleDashboardAddTraining = async (formData) => {
    if (!user?._id) return;
    const targetId = dashboardDataAthleteId || user._id;
    const trainingData = { ...formData, athleteId: targetId, coachId: user._id };
    await addTraining(trainingData);
    setIsTrainingFormOpen(false);
  };

  // ── + Lactate from WeeklyCalendar activity modal: open TrainingForm prefilled
  // with Strava laps (and scroll to the lap the user clicked) ────────────────
  const [lactateFormModal, setLactateFormModal] = useState({ isOpen: false, initialData: null });
  const [lactateFormSubmitting, setLactateFormSubmitting] = useState(false);
  const [lactateFormError, setLactateFormError] = useState(null);

  const closeLactateForm = useCallback(() => {
    setLactateFormModal({ isOpen: false, initialData: null });
    setLactateFormError(null);
  }, []);

  // Map an array of Strava/FIT laps to TrainingForm `results` rows. Pulled
  // out as a helper so both the Strava-detail path and the FIT/regular
  // fallback share it.
  const lapsToResults = useCallback((laps, sportKey) => {
    const isRun = sportKey === 'run';
    const isSwim = sportKey === 'swim';
    const fmtDur = (sec) => {
      const s = Number(sec) || 0;
      const m = Math.floor(s / 60);
      const ss = Math.round(s % 60);
      return `${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
    };
    return (Array.isArray(laps) ? laps : []).map((lap, idx) => {
      const durationSec = Math.round(
        lap.moving_time ?? lap.totalTimerTime ?? lap.totalElapsedTime ?? lap.elapsed_time ?? lap.duration ?? 0
      );
      const distM = Math.round(lap.distance ?? lap.totalDistance ?? lap.distanceMeters ?? 0);
      const speed = lap.average_speed ?? lap.avgSpeed ?? lap.avg_speed ?? lap.enhancedAvgSpeed ?? 0;
      let powerValue = '';
      if (isRun || isSwim) {
        const eff = speed > 0.05 ? speed : (distM > 0 && durationSec > 0 ? distM / durationSec : 0);
        if (eff > 0.05) {
          const paceSec = isSwim ? Math.round(100 / eff) : Math.round(1000 / eff);
          powerValue = fmtDur(paceSec);
        }
      } else {
        const w = lap.average_watts ?? lap.avgPower ?? lap.average_power ?? 0;
        powerValue = w > 0 ? String(Math.round(w)) : '';
      }
      const isSwimRest = isSwim && distM < 10;
      return {
        interval: idx + 1,
        power: powerValue,
        heartRate: String(Math.round(lap.average_heartrate ?? lap.avgHeartRate ?? lap.avg_heart_rate ?? 0) || ''),
        lactate: lap.lactate != null ? String(lap.lactate) : '',
        RPE: '',
        elevation: (() => {
          const g = lap.total_elevation_gain ?? lap.elevation_gain ?? null;
          return g != null && Number.isFinite(Number(g)) ? String(Math.round(Number(g))) : '';
        })(),
        duration: fmtDur(durationSec),
        durationSeconds: durationSec,
        durationType: 'time',
        distanceMeters: distM > 0 ? distM : undefined,
        repeatCount: 1,
        isRecovery: isSwimRest,
        isSelected: !isSwimRest,
      };
    });
  }, []);

  const handleDashboardAddLactate = useCallback(async (activity, lapIndex = null) => {
    if (!activity) return;
    setLactateFormError(null);

    const rawId = String(activity?.id || activity?.stravaId || activity?._id || '');
    const stravaNumericId = rawId.replace(/^strava-/i, '');
    const isStrava = activity?.type === 'strava' || !!activity?.stravaId ||
                     /^strava-/i.test(String(activity?.id || ''));
    const sportRaw = String(activity?.sport || activity?.sport_type || activity?.sportType || 'bike').toLowerCase();
    const sport = sportRaw.includes('swim') ? 'swim' : sportRaw.includes('run') ? 'run' : 'bike';

    // Open the modal IMMEDIATELY with whatever data the activity already
    // carries. Enrich asynchronously. This matches the native dashboard
    // behaviour and stops the "+ Lactate does nothing" silent failure when
    // the Strava detail fetch errors out.
    const baseLaps = Array.isArray(activity.laps) ? activity.laps : [];
    const existing = Array.isArray(activity.results) ? activity.results : [];
    const initialResults = existing.length > 0 ? existing : lapsToResults(baseLaps, sport);
    const activityDate = activity.date || activity.startDate || activity.timestamp || new Date();
    const parsedDate = new Date(activityDate);
    const dateStr = (Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate).toISOString().slice(0, 16);
    const initialData = {
      ...(activity._id && !isStrava ? { _id: activity._id } : {}),
      sport,
      type: 'interval',
      category: activity.category || '',
      title: activity.titleManual || activity.title || activity.name || 'Untitled Training',
      customTitle: '',
      description: activity.description || '',
      date: dateStr,
      ...(isStrava && stravaNumericId ? { sourceStravaActivityId: stravaNumericId } : {}),
      specifics: { specific: '', weather: '', customSpecific: '', customWeather: '' },
      results: initialResults,
      ...(lapIndex != null ? { _initialSelectedLap: lapIndex + 1 } : {}),
    };
    setLactateFormModal({ isOpen: true, initialData });

    // Best-effort enrichment from Strava detail. Errors are soft (toast).
    if (isStrava && stravaNumericId && initialResults.length === 0) {
      try {
        const isCoachViewing = dashboardDataAthleteId && user && String(dashboardDataAthleteId) !== String(user._id);
        const integAthleteId = isCoachViewing ? String(dashboardDataAthleteId) : null;
        const data = await getStravaActivityDetail(stravaNumericId, integAthleteId);
        const detail = data.detail || {};
        const laps = Array.isArray(data.laps) ? data.laps : [];
        if (laps.length === 0) return;
        const detailSport = (detail.sport_type || detail.sport || sport).toLowerCase();
        const finalSport = detailSport.includes('swim') ? 'swim' : detailSport.includes('run') ? 'run' : 'bike';
        const enrichedDate = detail.start_date_local || detail.start_date || activityDate;
        const enrichedParsed = new Date(enrichedDate);
        const enrichedDateStr = (Number.isNaN(enrichedParsed.getTime()) ? parsedDate : enrichedParsed).toISOString().slice(0, 16);
        setLactateFormModal({
          isOpen: true,
          initialData: {
            ...initialData,
            sport: finalSport,
            category: data.category || initialData.category,
            title: data.titleManual || detail.name || initialData.title,
            description: data.description || detail.description || initialData.description,
            date: enrichedDateStr,
            sourceStravaActivityId: String(detail.id || detail.stravaId || stravaNumericId),
            results: lapsToResults(laps, finalSport),
          },
        });
      } catch (err) {
        setLactateFormError(
          "Couldn't load Strava laps automatically — you can add rows manually."
        );
      }
    }
  }, [dashboardDataAthleteId, user, lapsToResults]);

  const handleLactateFormSubmit = useCallback(async (formData) => {
    try {
      setLactateFormSubmitting(true);
      setLactateFormError(null);
      const targetId = dashboardDataAthleteId || user?._id;
      const payload = { ...formData, athleteId: targetId, coachId: user?._id };
      if (formData._id) {
        await updateTraining(formData._id, payload);
      } else {
        await addTraining(payload);
      }
      // Refresh dashboard data so the new training appears in the calendar
      try {
        const trainingsResult = await loadTrainings(targetId);
        loadCalendarData(targetId, trainingsResult?.regularTrainings);
      } catch (_) {}
      closeLactateForm();
    } catch (err) {
      setLactateFormError(
        err?.response?.data?.message ||
          err?.response?.data?.error ||
          err?.message ||
          'Save failed'
      );
    } finally {
      setLactateFormSubmitting(false);
    }
  }, [dashboardDataAthleteId, user, loadTrainings, loadCalendarData, closeLactateForm]);

  // ── Mobile/Native: render the redesigned native dashboard ──────────────────
  if (isCapacitorNative()) return (
    <NativeDashboardPage
      activities={calendarData}
      plannedWorkouts={plannedWorkouts}
      tests={tests}
      todayMetrics={todayMetrics}
      sparklineData={sparklineData}
      loading={loading}
      user={user}
      athleteId={dashboardDataAthleteId}
      onPlannedWorkoutChanged={({ type, planned, id }) => {
        if (type === 'updated' && planned?._id) {
          setPlannedWorkouts(prev => prev.map(p => p._id === planned._id ? planned : p));
        } else if (type === 'deleted' && id) {
          setPlannedWorkouts(prev => prev.filter(p => p._id !== id));
        }
      }}
      stravaConnected={stravaConnected}
      onRequestStravaSync={performManualStravaSync}
    />
  );

  if (error) return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-6 text-red-600 bg-red-50 rounded-lg shadow-lg"
    >
      {error}
    </motion.div>
  );

  if (!user) return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="p-6 text-gray-600"
    >
      Please log in to view this page
    </motion.div>
  );

  return (
    <>
    <UpgradeModal {...UpgradeModalProps} />
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="mx-auto w-full max-w-[1600px] px-2 sm:px-4 py-4 md:p-6"
    >
      {/* CoachDashboardHeader is now shown globally in Layout (CoachAthleteBar) */}
      {isCoachLikeRole &&
        selectedAthleteId &&
        String(selectedAthleteId) !== String(user?._id || '') &&
        pendingAthleteIds.includes(String(selectedAthleteId)) && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            This athlete is waiting for confirmation. Profile and historical data will unlock after the athlete accepts the invitation.
          </div>
        )}
      
      {showAthleteEmptyWelcome && (
        <DashboardEmptyWelcome
          user={user}
          stravaConnected={stravaConnected}
          onConnectStrava={handleConnectStrava}
          hasTests={Array.isArray(tests) && tests.length > 0}
        />
      )}

      {/* Strava Connection Banner */}
      {!isTestingRole && showStravaBanner && !stravaConnected && (user?.role === 'athlete' || user?.role === 'coach') && !showAthleteEmptyWelcome && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 bg-gradient-to-r from-orange-50 to-orange-100 border-2 border-orange-300 rounded-xl p-4 sm:p-6 shadow-lg"
        >
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 bg-orange-200 rounded-full flex items-center justify-center flex-shrink-0">
                  <img src="/icon/strava.png" alt="Strava" className="w-6 h-6" />
                </div>
                <h3 className="text-lg sm:text-xl font-bold text-gray-900">Connect Strava to Unlock More Features</h3>
              </div>
              <p className="text-sm sm:text-base text-gray-700 mb-3">
                Connect your Strava account to automatically sync your training activities and get personalized insights!
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-gray-600">
                <div className="flex items-center gap-2">
                  <span className="text-orange-600 font-bold">✓</span>
                  <span>Auto-import all your activities</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-orange-600 font-bold">✓</span>
                  <span>Smart test recommendations</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-orange-600 font-bold">✓</span>
                  <span>Track progress over time</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-orange-600 font-bold">✓</span>
                  <span>Sync profile picture</span>
                </div>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
              <button
                onClick={handleConnectStrava}
                className="px-6 py-3 bg-orange-600 text-white font-semibold rounded-lg hover:bg-orange-700 transition-colors shadow-md hover:shadow-lg whitespace-nowrap"
              >
                Connect Strava
              </button>
              <button
                onClick={handleDismissBanner}
                className="px-4 py-3 bg-white text-gray-700 font-medium rounded-lg hover:bg-gray-50 border border-gray-300 transition-colors whitespace-nowrap"
              >
                Maybe Later
              </button>
            </div>
          </div>
        </motion.div>
      )}
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        {!isTestingRole && (
          <>
        {!showAthleteEmptyWelcome && (
          <>
        {/* Weekly Calendar — at the top */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="lg:col-span-5 md:col-span-2"
        >
          <WeeklyCalendar
            selectedAthleteId={dashboardDataAthleteId}
            activities={calendarData || []}
            onSelectActivity={(activity) => {
              console.log('Selected activity:', activity);
            }}
            onActivityUpdate={(updatedActivity) => {
              setCalendarData(prev => {
                const updated = prev.map(act => {
                  if (updatedActivity.type === 'fit' && act.type === 'fit' && act._id === updatedActivity._id) {
                    return { ...act, ...updatedActivity, title: updatedActivity.title || updatedActivity.titleManual || act.title };
                  } else if (updatedActivity.type === 'strava' && act.type === 'strava' &&
                             (act.id === updatedActivity.id || act.stravaId === updatedActivity.stravaId || act.stravaId === updatedActivity.id)) {
                    return { ...act, ...updatedActivity, title: updatedActivity.title || updatedActivity.titleManual || updatedActivity.name || act.title };
                  }
                  return act;
                });
                console.log('[DashboardPage] Updated calendarData after activity update:', updatedActivity);
                return updated;
              });
              const cacheKey = `calendarData_${dashboardDataAthleteId}`;
              const cacheTimestampKey = `calendarData_timestamp_${dashboardDataAthleteId}`;
              localStorage.removeItem(cacheKey);
              localStorage.removeItem(cacheTimestampKey);
            }}
            plannedWorkouts={plannedWorkouts}
            onPlanWorkout={(date) => setPlanModal({ date, workout: null })}
            onSelectPlannedWorkout={(pw) => {
              // pw.date may be a full ISO datetime ('2026-05-04T00:00:00.000Z')
              // or a date-only 'YYYY-MM-DD' — slice to date-only first.
              const dateOnly = String(pw.date || '').slice(0, 10);
              const d = dateOnly ? new Date(`${dateOnly}T12:00:00`) : new Date();
              setPlanModal({ date: isNaN(d.getTime()) ? new Date() : d, workout: pw });
            }}
            onStartWorkout={(pw) => navigate(`/workout-execution/${pw._id}${selectedAthleteId ? `?athleteId=${selectedAthleteId}` : ''}`)}
            onCopyPlannedWorkout={handleDashboardCopyPlan}
            onDeletePlannedWorkout={handleDashboardPlanDelete}
            onAddTraining={() => setIsTrainingFormOpen(true)}
            onAddLactate={handleDashboardAddLactate}
          />
        </motion.div>

        {/* Form & Fitness Chart + Weekly Training Load — side by side, equal height */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="lg:col-span-3 md:col-span-2 flex flex-col"
        >
          <FormFitnessChart
            key={`ffc-${dashboardDataAthleteId}`}
            athleteId={dashboardDataAthleteId}
          />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.27 }}
          className="lg:col-span-2 md:col-span-2 flex flex-col"
        >
          <WeeklyTrainingLoad
            key={`wtl-${dashboardDataAthleteId}`}
            athleteId={dashboardDataAthleteId}
          />
        </motion.div>

        {/* Intensity distribution */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.29 }}
          className="lg:col-span-5 md:col-span-2"
        >
          <IntensityDistributionChart athleteId={dashboardDataAthleteId} activities={calendarData || []} />
        </motion.div>

        {/* LT2 Trend Sparkline + Zone Distribution — side by side on large screens */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.32 }}
          className="lg:col-span-3 md:col-span-2 flex flex-col"
        >
          <LT2TrendSparkline tests={tests} sport={selectedSport} />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.34 }}
          className="lg:col-span-2 md:col-span-2 flex flex-col"
        >
          <ZoneDistributionChart trainings={trainings} tests={tests} period="90d" />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 }}
          className="lg:col-span-3 md:col-span-2 flex flex-col"
        >
          <TrainingLoadHeatmap
            calendarData={calendarData}
            trainings={recentTrainings}
          />
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4 }}
          className="lg:col-span-2 md:col-span-2"
        >
          {isPremium ? (
            <SpiderChart
              trainings={recentTrainings}
              selectedSport={selectedSport}
              setSelectedSport={setSelectedSport}
              calendarData={calendarData}
              athleteId={selectedAthleteId}
            />
          ) : (
            <PremiumLockedCard
              title="Performance Profile"
              description="Unlock the radar chart to see your power / pace profile across sprint, VO₂max, threshold and endurance efforts."
              onUpgrade={() => gate('Performance Profile (Spider Chart)', 'pro')}
            />
          )}
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="lg:col-span-3 md:col-span-2"
        >
          <TrainingStats
            trainings={exportedTrainings}
            selectedSport={selectedSport}
            onSportChange={setSelectedSport}
            selectedTitle={selectedTitle}
            setSelectedTitle={setSelectedTitle}
            selectedTrainingId={selectedTraining}
            setSelectedTrainingId={setSelectedTraining}
            user={user}
          />
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="lg:col-span-2 md:col-span-2"
        >
          {isPremium ? (
            <TrainingGraph
              trainingList={exportedTrainings}
              selectedSport={selectedSport}
              setSelectedSport={setSelectedSport}
              selectedTitle={selectedTitle}
              setSelectedTitle={setSelectedTitle}
              selectedTraining={selectedTraining}
              setSelectedTraining={setSelectedTraining}
            />
          ) : (
            <PremiumLockedCard
              title="Training Graph"
              description="Upgrade to Pro to view power, pace and heart rate trends across your training sessions."
              onUpgrade={() => gate('Training Graph', 'pro')}
            />
          )}
        </motion.div>
          </>
        )}

        {showAthleteEmptyWelcome && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="lg:col-span-5 md:col-span-2 rounded-xl border border-dashed border-slate-200 bg-white/60 px-4 py-8 text-center"
          >
            <p className="text-sm text-slate-600 max-w-lg mx-auto">
              Form &amp; Fitness, weekly load, calendar, and training charts will appear here after you add activities (upload FIT or sync from Strava).
            </p>
          </motion.div>
        )}
          </>
        )}

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
          className="lg:col-span-5 md:col-span-2 overflow-visible min-h-0"
        >
          <div className="space-y-6 overflow-visible">
            {/* Lactate Statistics Component */}
            <LactateStatistics key={`ls-${selectedAthleteId}`} selectedAthleteId={selectedAthleteId} />
            
            {filteredTests && filteredTests.length > 0 ? (
              <>
                <DateSelector
                  tests={filteredTests}
                  onSelectTest={handleDateSelectorTestSelect}
                  selectedTestId={currentTest?._id}
                />
                {currentTest && currentTest.results && (
                  <>
                    <LactateCurveCalculator mockData={currentTest} />
                  </>
                )}
              </>
            ) : (
              <div className="text-center py-8 px-4 rounded-xl border border-white/15 bg-white/10 backdrop-blur-md text-lighterText">
                <p className="text-sm font-semibold text-text">No lactate tests yet</p>
                <p className="mt-1 text-sm text-lighterText">
                  {showAthleteEmptyWelcome
                    ? 'When you log a test under Testing, charts and comparisons show up here.'
                    : `No tests available${selectedSport !== 'all' ? ` for ${selectedSport}` : ''}.`}
                </p>
                {showAthleteEmptyWelcome && (
                  <button
                    type="button"
                    onClick={() => navigate('/testing')}
                    className="mt-4 inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90 transition-colors"
                  >
                    Open Testing
                  </button>
                )}
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </motion.div>

    {planModal && (
      <WorkoutPlanModal
        date={planModal.date}
        workout={planModal.workout}
        athleteId={selectedAthleteId}
        onSave={handleDashboardPlanSave}
        onDelete={handleDashboardPlanDelete}
        onClose={() => setPlanModal(null)}
      />
    )}

    <AnimatePresence>
      {isTrainingFormOpen && ReactDOM.createPortal(
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{ position: 'fixed', inset: 0, zIndex: 200, pointerEvents: 'auto', backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
        >
          <motion.div
            initial={{ y: '100%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="w-full sm:max-w-2xl"
          >
            <TrainingForm
              onClose={() => setIsTrainingFormOpen(false)}
              onSubmit={handleDashboardAddTraining}
            />
          </motion.div>
        </motion.div>,
        document.getElementById('app-modal-root') || document.body
      )}
    </AnimatePresence>

    {/* Error banner for + Lactate failures (no laps, network, etc.) */}
    {lactateFormError && (
      <div
        role="alert"
        className="fixed left-4 right-4 bottom-4 z-[9998] flex items-center justify-between gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 shadow-lg"
      >
        <span className="flex-1">{lactateFormError}</span>
        <button
          type="button"
          onClick={() => setLactateFormError(null)}
          className="shrink-0 rounded-lg border border-red-300 bg-white px-3 py-1 text-xs font-medium text-red-900 hover:bg-red-100"
        >
          Dismiss
        </button>
      </div>
    )}

    {/* + Lactate modal — mirrors FitAnalysisPage's pattern: plain
        conditional render, no AnimatePresence + portal combo. The earlier
        portal+AnimatePresence wrapper had a render race where the modal
        sometimes failed to mount when the parent ActivityFullModal was
        closing simultaneously. */}
    {lactateFormModal.isOpen && lactateFormModal.initialData && (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4"
        style={{ zIndex: 99998 }}
      >
        <div className="w-full sm:max-w-2xl">
          <TrainingForm
            key={lactateFormModal.initialData.sourceStravaActivityId || lactateFormModal.initialData._id || 'dash-lac'}
            onClose={closeLactateForm}
            onSubmit={handleLactateFormSubmit}
            initialData={lactateFormModal.initialData}
            isEditing={false}
            isLoading={lactateFormSubmitting}
            initialSelectedLap={lactateFormModal.initialData?._initialSelectedLap ?? null}
          />
        </div>
      </motion.div>
    )}
    </>
  );
}
