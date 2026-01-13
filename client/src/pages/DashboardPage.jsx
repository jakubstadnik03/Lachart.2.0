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
  const [selectedAthleteId, setSelectedAthleteId] = useState(athleteId || (user?.role === 'coach' ? user._id : null));
  const [trainings, setTrainings] = useState([]);
  const [loading, setLoading] = useState(true);
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

  const loadTrainings = useCallback(async (targetId) => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.get(`/user/athlete/${targetId}/trainings`);
      if (response && response.data) {
        return response.data;
      }
    } catch (error) {
      console.error('Error loading trainings:', error);
     // setError(error.message);
    } finally {
      setLoading(false);
    }
  }, []);

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
  }, [user]);

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
  }, []);

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
        ...(stravaData || []).map(a => ({
          ...a,
          type: 'strava',
          date: a.startDate,
          title: a.titleManual || a.name || 'Untitled Activity',
          sport: a.sport,
          stravaId: a.stravaId || a.id, // Ensure stravaId is set
          id: a.stravaId || a.id, // Also set id for compatibility
          avgPower: a.averagePower || a.average_watts,
          maxPower: a.maxPower || a.max_watts,
          avgHeartRate: a.averageHeartRate || a.average_heartrate,
          maxHeartRate: a.maxHeartRate || a.max_heartrate,
          totalTime: a.movingTime || a.elapsedTime,
          distance: a.distance
        }))
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

      setCalendarData(combined);
      console.log('[DashboardPage] Calendar data loaded and set:', combined.length, 'activities');
      if (combined.length > 0) {
        console.log('[DashboardPage] Sample activity:', combined[0]);
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
  }, []);

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
        
        // Load all data in parallel for better performance
        const [trainingsData, athleteData] = await Promise.all([
          loadTrainings(targetAthleteId),
          loadAthlete(targetAthleteId),
          loadTests(targetAthleteId), // loadTests already sets tests state internally
          loadCalendarData(targetAthleteId) // loadCalendarData already sets calendar state internally
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
  }, [user?._id, user?.role, selectedAthleteId, isAuthenticated, navigate, loadTrainings, loadAthlete, loadTests, loadCalendarData]);

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
    if (trainings.length > 0) {
      // Get available sports from trainings
      const availableSports = [...new Set(trainings.map(t => t.sport))].filter(Boolean);
      
      // If current selectedSport is not available and is not 'all', switch to first available
      // 'all' is always valid, so we don't reset it
      if (availableSports.length > 0 && selectedSport !== 'all' && !availableSports.includes(selectedSport)) {
        setSelectedSport(availableSports[0]);
        return;
      }
      
      const sportTrainings = selectedSport === 'all' 
        ? trainings 
        : trainings.filter(t => t.sport === selectedSport);
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
  }, [selectedSport, trainings, selectedTitle]);

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

  if (loading) return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex items-center justify-center h-screen"
    >
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
    </motion.div>
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
            activities={calendarData || []}
            onSelectActivity={(activity) => {
              // Handle activity selection
              console.log('Selected activity:', activity);
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
            trainings={trainings}
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
            trainings={trainings}
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
            trainings={trainings}
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
            trainingList={trainings}
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
