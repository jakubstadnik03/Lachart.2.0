import React, { useEffect, useState, useCallback } from "react";
import { useNavigate, useParams } from 'react-router-dom';
// import SportsSelector from "../components/Header/SportsSelector";
import TrainingTable from "../components/DashboardPage/TrainingTable";
import { TrainingStats } from "../components/DashboardPage/TrainingStats";
import TrainingGraph from "../components/DashboardPage/TrainingGraph";
import SpiderChart from "../components/DashboardPage/SpiderChart";
import FormFitnessChart from "../components/DashboardPage/FormFitnessChart";
import WeeklyTrainingLoad from "../components/DashboardPage/WeeklyTrainingLoad";
import { useAuth } from '../context/AuthProvider';
import api, { getFitTrainings, listExternalActivities, autoSyncStravaActivities } from '../services/api';
import AthleteSelector from "../components/AthleteSelector";
import LactateCurveCalculator from "../components/Testing-page/LactateCurveCalculator";
import TestComparison from "../components/Testing-page/TestComparison";
import TestSelector from "../components/Testing-page/TestSelector";
import DateSelector from "../components/DateSelector";
import LactateStatistics from "../components/LactateStatistics/LactateStatistics";
import WeeklyCalendar from "../components/DashboardPage/WeeklyCalendar";
import { motion } from 'framer-motion';
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

const DashboardPage = () => {
  const { athleteId } = useParams();
  const { user, isAuthenticated } = useAuth();
  const [selectedAthleteId, setSelectedAthleteId] = useState(() => {
    if (athleteId) return athleteId;
    if (user?.role === 'coach') {
      // Prefer globally vybraného atleta (ze selectu/Menu), jinak sebe
      try {
        const globalId = localStorage.getItem('global_selectedAthleteId');
        if (globalId) return globalId;
      } catch {
        // ignore
      }
      return user._id;
    }
    return null;
  });
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
    setSelectedSport(saved || 'all');
  }, [dashboardSportStorageKey]);
  
  // Persist selectedSport per athlete
  useEffect(() => {
    if (!dashboardSportStorageKey) return;
    localStorage.setItem(dashboardSportStorageKey, selectedSport);
  }, [dashboardSportStorageKey, selectedSport]);
  const [selectedTitle, setSelectedTitle] = useState(null);
  const [selectedTraining, setSelectedTraining] = useState(null);
  const [currentTest, setCurrentTest] = useState(null);
  const [tests, setTests] = useState([]);
  const navigate = useNavigate();
  //const { addNotification } = useNotification();
  const [selectedTests, setSelectedTests] = useState([]);
  
  // Training calendar data (FIT files and Strava activities)
  const [calendarData, setCalendarData] = useState([]); // Combined data from calendar

  // For heavy dashboard widgets (TrainingTable, TrainingStats, TrainingGraph, SpiderChart),
  // work only with a limited number of the most recent trainings to keep calculations fast.
  const MAX_DASHBOARD_TRAININGS = 40;
  const recentTrainings = React.useMemo(() => {
    if (!trainings || trainings.length === 0) return [];
    // Sort by date (or timestamp) from newest to oldest and take only the first N
    return [...trainings]
      .sort((a, b) => {
        const dateA = new Date(a.date || a.timestamp || 0);
        const dateB = new Date(b.date || b.timestamp || 0);
        return dateB - dateA;
      })
      .slice(0, MAX_DASHBOARD_TRAININGS);
  }, [trainings]);

  // Load athlete trainings with localStorage caching (shared with TrainingPage)
  const loadTrainings = useCallback(async (targetId) => {
    const cacheKey = `athleteTrainings_${targetId}`;
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

      // Optionally enrich with FIT trainings and Strava activities (same as TrainingPage)
      const [fitResponse, stravaResponse] = await Promise.all([
        api.get(`/api/fit/trainings`, { params: { athleteId: targetId } }).catch(() => ({ data: [] })),
        api.get(`/api/integrations/activities`, { params: { athleteId: targetId } }).catch(() => ({ data: [] }))
      ]);

      const allTrainings = [
        ...(response.data || []),
        ...(fitResponse.data || []).map(t => ({ ...t, category: t.category || null })),
        ...(stravaResponse.data || []).map(a => ({ ...a, category: a.category || null }))
      ];

      setTrainings(allTrainings);

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

      return allTrainings;
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
      // For tester role, use any ID (backend will return all tests)
      const testId = user?.role === 'tester' ? user._id : targetId;
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
  }, [user, setLoading]);

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

  // Load regular trainings from /training route
  const loadRegularTrainings = useCallback(async (targetId) => {
    try {
      // For athlete, use their own ID
      // For coach, use targetId (must be selected, don't use coach's own ID)
      const athleteId = user?.role === 'athlete' ? user._id : targetId;
      
      // If coach but no athlete selected, don't load trainings
      if (user?.role === 'coach' && !athleteId) {
        setRegularTrainings([]);
        return;
      }
      
      if (!athleteId) {
        return; // Skip if no athleteId
      }
      
      const response = await api.get(`/user/athlete/${athleteId}/trainings`);
      if (response && response.data) {
        setRegularTrainings(response.data);
      }
    } catch (error) {
      // Handle rate limit errors gracefully
      if (error.response?.status === 429) {
        console.warn('Rate limit exceeded when loading regular trainings. Please wait a moment.');
        // Don't show error to user, just log it
        return;
      }
      console.error('Error loading regular trainings:', error);
    }
  }, [user?.role, user?._id]);

  // Load training calendar data (FIT files and Strava activities) with localStorage caching
  const loadCalendarData = useCallback(async (targetId) => {
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

      // Merge Training-model entries that are linked to a Strava activity into a single calendar item:
      // show the Training title, but keep all Strava-derived metrics and open Strava detail on click.
      // Use regularTrainings from state (loaded in parallel)
      const trainingByStravaId = new Map();
      (regularTrainings || []).forEach(t => {
        const sid = t?.sourceStravaActivityId;
        if (sid) trainingByStravaId.set(String(sid), t);
      });

      // Combine and format data for calendar
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
          distance: t.totalDistance
        })),
        // Only show regular trainings that are NOT linked to a Strava activity (linked ones will be merged into the Strava item below)
        ...regularTrainings
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
          maxPower: a.maxPower || a.max_watts,
          avgHeartRate: a.averageHeartRate || a.average_heartrate,
          maxHeartRate: a.maxHeartRate || a.max_heartrate,
          totalTime: a.movingTime || a.elapsedTime,
          distance: a.distance
          };
        })
      ];

      // Cache the combined data
      try {
        // Limit data size to avoid localStorage quota issues
        const limitedCombined = combined.slice(0, 100); // Only cache first 100 activities
        const dataToCache = JSON.stringify(limitedCombined);
        localStorage.setItem(cacheKey, dataToCache);
        localStorage.setItem(cacheTimestampKey, now.toString());
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
              const limitedCombined = combined.slice(0, 100);
              localStorage.setItem(cacheKey, JSON.stringify(limitedCombined));
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

      // For rendering we also limit to 100 to keep WeeklyCalendar fast
      const limitedForView = combined.slice(0, 100);
      setCalendarData(limitedForView);
      console.log('[DashboardPage] Calendar data loaded and set:', limitedForView.length, 'activities');
      if (limitedForView.length > 0) {
        console.log('[DashboardPage] Sample activity:', limitedForView[0]);
      }
      return combined;
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
      const targetId = user?.role === 'coach' && selectedAthleteId ? selectedAthleteId : user?._id;
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
  }, [selectedAthleteId, user?._id, user?.role, loadCalendarData]);

  // Reload calendar data when regularTrainings change (to update linked titles)
  useEffect(() => {
    if (regularTrainings.length > 0 && selectedAthleteId) {
      // Only reload if we have regularTrainings and an athlete selected
      // This ensures calendar data gets updated with linked training titles
      const targetId = user?.role === 'athlete' ? user._id : selectedAthleteId;
      if (targetId) {
        loadCalendarData(targetId);
      }
    }
  }, [regularTrainings, selectedAthleteId, user?._id, user?.role, loadCalendarData]);

  // Sync selectedAthleteId with URL parameter when it changes
  useEffect(() => {
    if (athleteId) {
      // If URL has athleteId, use it
      if (athleteId !== selectedAthleteId) {
        setSelectedAthleteId(athleteId);
      }
    } else if (user?.role === 'coach') {
      // If no athleteId in URL and user is coach, default to coach's own ID
      if (!selectedAthleteId || selectedAthleteId !== user._id) {
        setSelectedAthleteId(user._id);
      }
    }
  }, [athleteId, user, selectedAthleteId]);

  // Load calendar data from cache on mount
  useEffect(() => {
    if (!user?._id) return;
    
    const targetId = user?.role === 'coach' && selectedAthleteId ? selectedAthleteId : user._id;
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
  }, [user?._id, selectedAthleteId, user?.role]);

  // Listen for athlete change from Menu (for immediate update before URL changes)
  useEffect(() => {
    const handleAthleteChange = (event) => {
      const { athleteId: newAthleteId } = event.detail;
      if (newAthleteId && newAthleteId !== selectedAthleteId) {
        setSelectedAthleteId(newAthleteId);
        // Menu already navigates, so we don't need to navigate here
      }
    };

    window.addEventListener('athleteChanged', handleAthleteChange);
    return () => window.removeEventListener('athleteChanged', handleAthleteChange);
  }, [selectedAthleteId]);

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
    const targetAthleteId = user?.role === 'coach' && selectedAthleteId ? selectedAthleteId : user?._id;
    
    if (!targetAthleteId) {
      return;
    }

    // Pokud je trenér a není vybraný atlet, nastav sebe jako výchozí
    if (user?.role === 'coach' && !selectedAthleteId) {
      setSelectedAthleteId(user._id);
      return;
    }

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
        // Mark as loading for this athlete
        lastLoadedAthleteIdRef.current = targetAthleteId;
        lastLoadTimeRef.current = now;
        hasLoadedOnceRef.current = true;
        
        // Load regular trainings first (needed for calendar data linking)
        await loadRegularTrainings(targetAthleteId);
        
        // Load all other data in parallel for better performance
        const [trainingsData, athleteData] = await Promise.all([
          loadTrainings(targetAthleteId),
          loadAthlete(targetAthleteId),
          loadTests(targetAthleteId), // loadTests already sets tests state internally
          loadCalendarData(targetAthleteId) // loadCalendarData already sets calendar state internally (uses regularTrainings from state)
        ]);

        if (trainingsData) {
          setTrainings(trainingsData);
        }
        if (athleteData && athleteData._id !== selectedAthleteId) {
          setSelectedAthleteId(athleteData._id);
        }
      } catch (error) {
        console.error('Error loading data:', error);
        // Don't reset ref on error - keep the cache to prevent rapid retries
      }
    };

    loadData();
  }, [user?._id, user?.role, selectedAthleteId, isAuthenticated, navigate, loadTrainings, loadAthlete, loadTests, loadCalendarData, loadRegularTrainings]);

  // Auto-sync Strava activities if enabled
  useEffect(() => {
    if (!user?._id || !user?.strava?.autoSync) {
      return;
    }

    // Only auto-sync for the current user (not for coach viewing athlete)
    const targetAthleteId = user?.role === 'coach' && selectedAthleteId ? selectedAthleteId : user?._id;
    if (targetAthleteId !== user._id) {
      return; // Don't auto-sync when viewing another athlete
    }

    // Check if we've already synced in this session
    const syncKey = `strava_auto_sync_dashboard_${user._id}`;
    const lastSync = sessionStorage.getItem(syncKey);
    const now = Date.now();
    if (lastSync && (now - parseInt(lastSync)) < 60000) { // Don't sync more than once per minute
      return;
    }

    // Auto-sync on mount and when user changes
    const performAutoSync = async () => {
      try {
        const result = await autoSyncStravaActivities();
        sessionStorage.setItem(syncKey, now.toString());
        if (result.imported > 0 || result.updated > 0) {
          console.log(`Auto-sync completed: ${result.imported} imported, ${result.updated} updated`);
          // Reload calendar data after sync
          loadCalendarData(user._id);
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
  }, [user?._id, user?.strava?.autoSync, selectedAthleteId, user?.role, loadCalendarData]);

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
      const uniqueTitles = [...new Set(sportTrainings.map(t => t.title))];
      
      if (!selectedTitle || !sportTrainings.some(t => t.title === selectedTitle)) {
        if (uniqueTitles.length > 0) {
          setSelectedTitle(uniqueTitles[0]);
          const firstTrainingWithTitle = sportTrainings.find(t => t.title === uniqueTitles[0]);
          if (firstTrainingWithTitle) {
            setSelectedTraining(firstTrainingWithTitle._id);
          }
        }
      }
    }
  }, [selectedSport, recentTrainings, selectedTitle]);

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

  const handleTestSelect = (tests) => {
    setSelectedTests(tests);
  };

  const handleAthleteChange = (newAthleteId) => {
    setSelectedAthleteId(newAthleteId);
    navigate(`/dashboard/${newAthleteId}`);
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
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="mx-6 m-auto max-w-[1600px] mx-auto py-4 md:p-6"
    >
      {user?.role === 'coach' && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <AthleteSelector
            selectedAthleteId={selectedAthleteId}
            onAthleteChange={handleAthleteChange}
            user={user}
          />
        </motion.div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        {/* Form & Fitness Chart */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="lg:col-span-5 md:col-span-2"
        >
          <FormFitnessChart 
            athleteId={selectedAthleteId}
          />
        </motion.div>

        {/* Weekly Training Load */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="lg:col-span-5 md:col-span-2"
        >
          <WeeklyTrainingLoad 
            athleteId={selectedAthleteId}
          />
        </motion.div>

        {/* Weekly Calendar */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="lg:col-span-5 md:col-span-2 mb-6"
        >
          <WeeklyCalendar 
            selectedAthleteId={selectedAthleteId}
            activities={calendarData || []}
            onSelectActivity={(activity) => {
              // Handle activity selection
              console.log('Selected activity:', activity);
            }}
            onActivityUpdate={(updatedActivity) => {
              // Update the activity in calendarData
              setCalendarData(prev => {
                const updated = prev.map(act => {
                  // Match by type and id
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
              // Also invalidate cache to force reload on next refresh
              const cacheKey = `calendarData_${selectedAthleteId}`;
              const cacheTimestampKey = `calendarData_timestamp_${selectedAthleteId}`;
              localStorage.removeItem(cacheKey);
              localStorage.removeItem(cacheTimestampKey);
            }}
          />
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 }}
          className="lg:col-span-3 md:col-span-2"
        >
          <TrainingTable 
            trainings={recentTrainings}
            calendarData={calendarData}
            selectedSport={selectedSport}
            onSportChange={setSelectedSport}
            onActivitySelect={(activity) => {
              // Find the activity in calendarData and trigger selection in WeeklyCalendar
              const foundActivity = calendarData.find(a => 
                (a.type === 'fit' && a._id === activity._id) ||
                (a.type === 'strava' && (a.stravaId === activity.stravaId || a.id === activity.stravaId || a.id === activity.id))
              );
              if (foundActivity && window.dispatchEvent) {
                window.dispatchEvent(new CustomEvent('selectCalendarActivity', { detail: foundActivity }));
              }
            }}
          />
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4 }}
          className="lg:col-span-2 md:col-span-2"
        >
          <SpiderChart 
            trainings={recentTrainings}
            selectedSport={selectedSport}
            setSelectedSport={setSelectedSport}
            calendarData={calendarData}
          />
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="lg:col-span-3 md:col-span-2"
        >
          <TrainingStats 
            trainings={recentTrainings}
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
          <TrainingGraph 
            trainingList={recentTrainings}
            selectedSport={selectedSport}
            setSelectedSport={setSelectedSport}
            selectedTitle={selectedTitle}
            setSelectedTitle={setSelectedTitle}
            selectedTraining={selectedTraining}
            setSelectedTraining={setSelectedTraining}
          />
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
          className="lg:col-span-5 md:col-span-2"
        >
          <div className="space-y-6">
            {/* Lactate Statistics Component */}
            <LactateStatistics selectedAthleteId={selectedAthleteId} />
            
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
                    <TestSelector 
                      tests={filteredTests}
                      selectedTests={selectedTests}
                      onTestSelect={handleTestSelect}
                      selectedSport={selectedSport}
                    />
                    <TestComparison tests={selectedTests} />
                  </>
                )}
              </>
            ) : (
              <div className="text-center py-4 text-gray-500">
                No tests available{selectedSport !== 'all' ? ` for ${selectedSport}` : ''}
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
};

export default DashboardPage;
