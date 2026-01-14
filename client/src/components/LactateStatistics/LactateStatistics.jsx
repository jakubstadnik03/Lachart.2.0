import React, { useState, useEffect, useCallback, useRef } from 'react';
import { getTrainingsWithLactate, getMonthlyPowerAnalysis, getLatestPowerZones } from '../../services/api';
import { useAuth } from '../../context/AuthProvider';
import { formatDuration } from '../../utils/fitAnalysisUtils';

// Power zones definition (based on FTP) - using app colors with different shades
const POWER_ZONES = [
  { zone: 1, label: 'Zone 1', description: 'Recovery', color: '#2596be' }, // Main app color - lighter
  { zone: 2, label: 'Zone 2', description: 'Aerobic', color: '#1e7a9a' }, // Darker shade
  { zone: 3, label: 'Zone 3', description: 'Tempo', color: '#185e7a' }, // Even darker
  { zone: 4, label: 'Zone 4', description: 'Threshold', color: '#0f425a' }, // Darkest
  { zone: 5, label: 'Zone 5', description: 'VO2max', color: '#08263a' } // Darkest shade
];

const LactateStatistics = ({ selectedAthleteId = null }) => {
  const { user } = useAuth();
  const [trainings, setTrainings] = useState([]);
  const [availableMonths, setAvailableMonths] = useState([]); // List of available month keys
  const [loadedMonths, setLoadedMonths] = useState(new Map()); // Cache of loaded month data
  const [loading, setLoading] = useState(true);
  const [loadingMonthly, setLoadingMonthly] = useState(true);
  const [loadingMonthData, setLoadingMonthData] = useState(false);
  const [activeTab] = useState('monthly'); // Only monthly analysis
  const [selectedMonth, setSelectedMonth] = useState(null); // null = show all months, string = specific month key
  const [selectedTrainings, setSelectedTrainings] = useState([]); // Selected trainings for comparison
  const [selectedZoneType, setSelectedZoneType] = useState('power'); // 'power', 'heartrate', 'heartrate-run', 'running', 'swimming'
  const zoneTypeInitialized = useRef(new Map()); // Track which months have had zone type auto-selected
  const [tooltipData, setTooltipData] = useState(null); // { x, y, content }
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const lastTrainingCountRef = useRef(0); // Track last known training count
  const pollingIntervalRef = useRef(null); // Reference to polling interval
  
  // Detect mobile
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  
  // Format pace for display (seconds to mm:ss)
  const formatPace = (seconds) => {
    if (!seconds || seconds === 0 || isNaN(seconds)) return '';
    const minutes = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  const loadTrainings = useCallback(async () => {
    const athleteId = user?.role === 'athlete'
      ? null
      : (selectedAthleteId || (user?.role === 'coach' ? user._id : null));

    const cacheKey = `lactateTrainings_${athleteId || 'default'}`;
    const tsKey = `${cacheKey}_ts`;
    const CACHE_TTL = 60 * 60 * 1000; // 1 hour

    let usedCache = false;

    // 1) Try to hydrate from cache first for instant render
    try {
      const cached = localStorage.getItem(cacheKey);
      const ts = localStorage.getItem(tsKey);
      if (cached && ts) {
        const age = Date.now() - parseInt(ts, 10);
        if (!Number.isNaN(age) && age < CACHE_TTL) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed)) {
            setTrainings(parsed);
            lastTrainingCountRef.current = parsed.length;
            setLoading(false);
            usedCache = true;
          }
        }
      }
    } catch (e) {
      console.warn('Error reading lactate trainings cache:', e);
    }

    try {
      if (!usedCache) {
        setLoading(true);
      }

      const data = await getTrainingsWithLactate(athleteId);
      const newTrainings = data || [];
      setTrainings(newTrainings);

      // Update training count reference
      lastTrainingCountRef.current = newTrainings.length;

      // Persist to cache for reuse on other pages / next visits
      try {
        const payload = JSON.stringify(newTrainings);
        if (payload.length < 200000) {
          localStorage.setItem(cacheKey, payload);
          localStorage.setItem(tsKey, Date.now().toString());
        }
      } catch (e) {
        console.warn('Error saving lactate trainings cache:', e);
      }
    } catch (error) {
      console.error('Error loading trainings with lactate:', error);
    } finally {
      setLoading(false);
    }
  }, [user, selectedAthleteId]);

  // Load list of available months (metadata only - no full analysis)
  const loadAvailableMonths = useCallback(async () => {
    try {
      setLoadingMonthly(true);
      const athleteId = user?.role === 'athlete' ? null : (selectedAthleteId || (user?.role === 'coach' ? user._id : null));
      const cacheKey = `monthlyAnalysis_metadata_${athleteId || 'default'}`;
      
      // Check localStorage first
      try {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          const { data, timestamp } = JSON.parse(cached);
          const cacheAge = Date.now() - timestamp;
          const cacheMaxAge = 60 * 60 * 1000; // 1 hour
          
          if (cacheAge < cacheMaxAge && data && data.length > 0) {
            setAvailableMonths(data);
            const lastMonth = data[data.length - 1];
            setSelectedMonth(lastMonth.monthKey);
            setLoadingMonthly(false);
            return;
          }
        }
      } catch (e) {
        console.log('Error reading cache:', e);
      }
      
      // Call without monthKey to get only metadata
      const data = await getMonthlyPowerAnalysis(athleteId, null);
      
      if (data && data.length > 0) {
        // Data is already in the right format (monthKey, month, trainings)
        setAvailableMonths(data);
        
        // Save to localStorage
        try {
          localStorage.setItem(cacheKey, JSON.stringify({
            data,
            timestamp: Date.now()
          }));
        } catch (e) {
          console.log('Error saving to cache:', e);
        }
        
        // Set last month as selected by default
        const lastMonth = data[data.length - 1];
        setSelectedMonth(lastMonth.monthKey);
      } else {
        setAvailableMonths([]);
      }
    } catch (error) {
      console.error('Error loading monthly analysis:', error);
    } finally {
      setLoadingMonthly(false);
    }
  }, [user, selectedAthleteId]);

  // Load data for a specific month (full analysis with zones)
  const loadMonthData = useCallback(async (monthKey, forceReload = false) => {
    // If already loaded in memory and not forcing reload, don't reload
    if (!forceReload && loadedMonths.has(monthKey)) {
      return;
    }

    try {
      setLoadingMonthData(true);
      const athleteId = user?.role === 'athlete' ? null : (selectedAthleteId || (user?.role === 'coach' ? user._id : null));
      const cacheKey = `monthlyAnalysis_${athleteId || 'default'}_${monthKey}`;
      
      // Check localStorage first (skip if force reload)
      if (!forceReload) {
        try {
          const cached = localStorage.getItem(cacheKey);
          if (cached) {
            const { data, timestamp } = JSON.parse(cached);
            const cacheAge = Date.now() - timestamp;
            const cacheMaxAge = 60 * 60 * 1000; // 1 hour
            
            if (cacheAge < cacheMaxAge && data && data.monthKey === monthKey) {
              console.log(`Using cached data for month ${monthKey}`);
              setLoadedMonths(prev => new Map(prev).set(monthKey, data));
              setLoadingMonthData(false);
              return;
            }
          }
        } catch (e) {
          console.log('Error reading cache:', e);
        }
      }
      
      // Call with monthKey to get full analysis for that month
      const data = await getMonthlyPowerAnalysis(athleteId, monthKey);
      
      if (data && data.length > 0) {
        const monthData = data[0]; // Should be only one month
        if (monthData && monthData.monthKey === monthKey) {
          
          setLoadedMonths(prev => new Map(prev).set(monthKey, monthData));
          
          // Save to localStorage
          try {
            localStorage.setItem(cacheKey, JSON.stringify({
              data: monthData,
              timestamp: Date.now()
            }));
          } catch (e) {
            console.log('Error saving to cache:', e);
          }
        }
      }
    } catch (error) {
      console.error('Error loading month data:', error);
    } finally {
      setLoadingMonthData(false);
    }
  }, [user, selectedAthleteId, loadedMonths]);

  const loadUserZones = useCallback(async () => {
    try {
      await getLatestPowerZones();
      // User zones are loaded but not used in this component
    } catch (error) {
      // Silently handle 429 (Too Many Requests) - don't log as error
      if (error.response?.status === 429) {
        console.log('Rate limited when loading user zones, will retry later');
        return;
      }
      console.error('Error loading user zones:', error);
    }
  }, []);

  // Helper function to check if selected month is current month
  const isCurrentMonth = useCallback((monthKey) => {
    if (!monthKey) return false;
    const now = new Date();
    const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return monthKey === currentMonthKey;
  }, []);
  
  // Function to refresh current month data if selected
  const refreshCurrentMonthIfSelected = useCallback(async () => {
    if (!selectedMonth || !isCurrentMonth(selectedMonth)) return;
    
    console.log('Refreshing current month data due to new training...');
    
    // Reload metadata to get updated month list
    await loadAvailableMonths();
    
    // Reload current month data with force reload
    await loadMonthData(selectedMonth, true);
  }, [selectedMonth, isCurrentMonth, loadAvailableMonths, loadMonthData]);

  useEffect(() => {
    loadTrainings();
    loadAvailableMonths();
    loadUserZones();
    
    // Load cached month data from localStorage on mount
    const athleteId = user?.role === 'athlete' ? null : (selectedAthleteId || (user?.role === 'coach' ? user._id : null));
    const cachePrefix = `monthlyAnalysis_${athleteId || 'default'}_`;
    
    try {
      const cachedMonths = new Map();
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(cachePrefix) && key !== `monthlyAnalysis_metadata_${athleteId || 'default'}`) {
          try {
            const cached = localStorage.getItem(key);
            if (cached) {
              const { data, timestamp } = JSON.parse(cached);
              const cacheAge = Date.now() - timestamp;
              const cacheMaxAge = 60 * 60 * 1000; // 1 hour
              
              if (cacheAge < cacheMaxAge && data && data.monthKey) {
                cachedMonths.set(data.monthKey, data);
              } else {
                // Remove expired cache
                localStorage.removeItem(key);
              }
            }
          } catch (e) {
            console.log('Error reading cached month:', e);
          }
        }
      }
      
      if (cachedMonths.size > 0) {
        console.log(`Loaded ${cachedMonths.size} cached months from localStorage`);
        setLoadedMonths(cachedMonths);
      }
    } catch (e) {
      console.log('Error loading cached months:', e);
    }
  }, [loadTrainings, loadAvailableMonths, loadUserZones, user, selectedAthleteId]);

  // Load month data when selected month changes
  useEffect(() => {
    if (selectedMonth && !loadedMonths.has(selectedMonth)) {
      loadMonthData(selectedMonth);
    }
  }, [selectedMonth, loadMonthData, loadedMonths]);

  // Event listener for new trainings
  useEffect(() => {
    const handleTrainingAdded = () => {
      console.log('Training added event detected, refreshing data...');
      refreshCurrentMonthIfSelected();
    };
    
    // Listen for custom events
    window.addEventListener('trainingAdded', handleTrainingAdded);
    window.addEventListener('trainingUpdated', handleTrainingAdded);
    window.addEventListener('stravaSyncComplete', handleTrainingAdded);
    
    return () => {
      window.removeEventListener('trainingAdded', handleTrainingAdded);
      window.removeEventListener('trainingUpdated', handleTrainingAdded);
      window.removeEventListener('stravaSyncComplete', handleTrainingAdded);
    };
  }, [refreshCurrentMonthIfSelected]);
  
  // Polling mechanism to check for new trainings
  useEffect(() => {
    // Only poll if current month is selected
    if (!selectedMonth || !isCurrentMonth(selectedMonth)) {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      return;
    }
    
    // Poll every 30 seconds for new trainings
    const pollForNewTrainings = async () => {
      try {
        const athleteId = user?.role === 'athlete' ? null : (selectedAthleteId || (user?.role === 'coach' ? user._id : null));
        const data = await getTrainingsWithLactate(athleteId);
        const currentCount = (data || []).length;
        
        // If training count increased, refresh data
        if (currentCount > lastTrainingCountRef.current) {
          console.log(`New trainings detected (${currentCount} vs ${lastTrainingCountRef.current}), refreshing...`);
          lastTrainingCountRef.current = currentCount;
          await refreshCurrentMonthIfSelected();
        } else {
          lastTrainingCountRef.current = currentCount;
        }
      } catch (error) {
        console.error('Error polling for new trainings:', error);
      }
    };
    
    // Initial count
    lastTrainingCountRef.current = trainings.length;
    
    // Start polling
    pollingIntervalRef.current = setInterval(pollForNewTrainings, 30000); // 30 seconds
    
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [selectedMonth, isCurrentMonth, trainings.length, user, selectedAthleteId, refreshCurrentMonthIfSelected]);

  // Auto-select zone type when month data is loaded (only once per month)
  useEffect(() => {
    if (selectedMonth && loadedMonths.has(selectedMonth)) {
      const month = loadedMonths.get(selectedMonth);
      if (month && !zoneTypeInitialized.current.has(selectedMonth)) {
        // Mark this month as initialized
        zoneTypeInitialized.current.set(selectedMonth, true);
        
        // Calculate bike vs run data
        const bikeTrainings = month.trainings - (month.runningTrainings || 0) - (month.swimmingTrainings || 0);
        const bikeTime = month.totalTime - (month.runningTime || 0) - (month.swimmingTime || 0);
        const hasBikeData = bikeTrainings > 0 && bikeTime > 0 && month.powerZones;
        const hasRunData = (month.runningTrainings && month.runningTrainings > 0) || month.runningZones || month.runningZoneTimes;
        
        // Auto-select based on available data (only on first load)
        // If both bike and run, prefer run if it has more time, otherwise bike
        if (hasRunData && hasBikeData) {
          // If run has more time, prefer run zones, otherwise bike zones
          if ((month.runningTime || 0) > bikeTime) {
            setSelectedZoneType('running');
          } else {
            setSelectedZoneType('power');
          }
        } else if (hasRunData) {
          setSelectedZoneType('running');
        } else if (hasBikeData) {
          setSelectedZoneType('power');
        } else if (month.hrZones && month.heartRateZones) {
          setSelectedZoneType('heartrate');
        } else if (month.runningZones || month.runningZoneTimes) {
          setSelectedZoneType('running');
        } else if (month.swimmingZones || month.swimmingZoneTimes) {
          setSelectedZoneType('swimming');
        } else if (month.powerZones) {
          setSelectedZoneType('power');
        }
      }
    }
  }, [selectedMonth, loadedMonths]);
  
  // Reset zone type initialization when month changes
  useEffect(() => {
    if (selectedMonth) {
      // Clear initialization flag for other months (keep current month)
      const currentMonth = selectedMonth;
      zoneTypeInitialized.current.forEach((_, monthKey) => {
        if (monthKey !== currentMonth) {
          zoneTypeInitialized.current.delete(monthKey);
        }
      });
    }
  }, [selectedMonth]);



  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-gray-500">Loading lactate statistics...</div>
      </div>
    );
  }

  if (trainings.length === 0) {
    return (
      <div className="bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20 shadow-md p-4">
        <h2 className="text-lg font-bold text-gray-900 mb-2">Lactate Statistics</h2>
        <div className="text-center py-8 text-gray-500">
          <p>No trainings with lactate values found.</p>
          <p className="text-sm mt-2">Add lactate values to your training intervals to see statistics here.</p>
        </div>
      </div>
    );
  }


  return (
    <div className="space-y-2">
      {/* Monthly Analysis */}
      {activeTab === 'monthly' && (
        <div className="space-y-2">

          {loadingMonthly ? (
            <div className="flex items-center justify-center p-4">
              <div className="text-lighterText text-sm">Loading...</div>
            </div>
          ) : availableMonths.length === 0 ? (
            <div className="bg-white/10 backdrop-blur-xl rounded-xl border border-white/20 shadow-md p-3">
              <div className="text-center py-6 text-lighterText text-sm">
                <p>No FIT files with power data found.</p>
                <p className="text-xs mt-1">Upload cycling FIT files with power data to display the analysis.</p>
              </div>
            </div>
          ) : loadingMonthData ? (
            <div className="flex items-center justify-center p-4">
              <div className="text-lighterText text-sm">Loading...</div>
            </div>
          ) : selectedMonth && loadedMonths.has(selectedMonth) ? (
            (() => {
              const month = loadedMonths.get(selectedMonth);
              
              // Debug logging for month data
              // console.log('=== MONTH DATA DEBUG ===', {
              //   monthKey: month.monthKey,
              //   month: month.month,
              //   bikeTrainings: month.bikeTrainings,
              //   bikeTime: month.bikeTime,
              //   bikeTSS: month.bikeTSS,
              //   runningTSS: month.runningTSS,
              //   totalTSS: month.totalTSS,
              //   bikeHrZones: month.bikeHrZones,
              //   runningHrZones: month.runningHrZones,
              //   bikeHeartRateZones: month.bikeHeartRateZones,
              //   runningHeartRateZones: month.runningHeartRateZones,
              //   bikeAvgPower: month.bikeAvgPower,
              //   bikeMaxPower: month.bikeMaxPower,
              //   runningTrainings: month.runningTrainings,
              //   runningTime: month.runningTime,
              //   runningAvgPace: month.runningAvgPace,
              //   runningMaxPace: month.runningMaxPace,
              //   runningZones: month.runningZones ? Object.keys(month.runningZones).map(k => ({
              //     zone: k,
              //     min: month.runningZones[k]?.min,
              //     max: month.runningZones[k]?.max,
              //     minFormatted: month.runningZones[k]?.min ? formatPace(month.runningZones[k].min) : null,
              //     maxFormatted: month.runningZones[k]?.max && month.runningZones[k].max !== Infinity ? formatPace(month.runningZones[k].max) : '∞'
              //   })) : null,
              //   runningZoneTimes: month.runningZoneTimes ? Object.keys(month.runningZoneTimes).map(k => ({
              //     zone: k,
              //     time: month.runningZoneTimes[k]?.time,
              //     avgPace: month.runningZoneTimes[k]?.avgPace,
              //     avgPaceFormatted: month.runningZoneTimes[k]?.avgPace ? formatPace(month.runningZoneTimes[k].avgPace) : null,
              //     paceCount: month.runningZoneTimes[k]?.paceCount,
              //     zoneMin: month.runningZones?.[k]?.min,
              //     zoneMax: month.runningZones?.[k]?.max,
              //     inZone: month.runningZones?.[k] ? 
              //       (month.runningZoneTimes[k]?.avgPace >= month.runningZones[k].min && 
              //        (month.runningZones[k].max === Infinity || month.runningZoneTimes[k]?.avgPace <= month.runningZones[k].max)) : 
              //       null
              //   })) : null
              // });
              
              // Use bikeMaxPower for FTP estimation (bike-specific)
              const bikeMaxPower = Number(month.bikeMaxPower) || Number(month.maxPower) || 0;
              const estimatedFTP = bikeMaxPower * 0.75;
              
              // Use bikeTrainings and bikeTime from backend (already calculated)
              const bikeTrainings = Number(month.bikeTrainings) || 0;
              const bikeTime = Number(month.bikeTime) || 0;
              const hasBikeData = bikeTrainings > 0 || bikeTime > 0 || (month.bikeTSS !== undefined && month.bikeTSS !== null);
              
              // Check for running data - either trainings, time, or zone data
              const runningTrainings = Number(month.runningTrainings) || 0;
              const runningTime = Number(month.runningTime) || 0;
              const hasRunningZoneData = month.runningZoneTimes && Object.values(month.runningZoneTimes).some(z => z && z.time > 0);
              const hasRunData = runningTrainings > 0 || runningTime > 0 || month.runningZones || hasRunningZoneData || (month.runningTSS !== undefined && month.runningTSS !== null);

              const swimmingTrainings = Number(month.swimmingTrainings) || 0;
              const swimmingTime = Number(month.swimmingTime) || 0;
              const hasSwimmingZoneData = month.swimmingZoneTimes && Object.values(month.swimmingZoneTimes).some(z => z && z.time > 0);
              const hasSwimData = swimmingTrainings > 0 || swimmingTime > 0 || month.swimmingZones || hasSwimmingZoneData || (month.swimmingTSS !== undefined && month.swimmingTSS !== null);

              // Determine which sport to show based on selectedZoneType
              const showBike = selectedZoneType === 'power' || selectedZoneType === 'heartrate';
              const showRun = selectedZoneType === 'running' || selectedZoneType === 'heartrate-run';
              const showSwim = selectedZoneType === 'swimming';

              return (
                <div key={month.monthKey} className="bg-white/10 backdrop-blur-xl rounded-xl border border-white/20 shadow-md p-2.5">
                  {/* Header with Month Selector */}
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-2 pb-1.5 border-b border-white/10">
                    <h2 className="text-sm font-semibold text-text">Monthly Analysis</h2>
                    {availableMonths.length > 0 && (
                      <select
                        value={selectedMonth || ''}
                        onChange={(e) => setSelectedMonth(e.target.value || null)}
                        className="px-2 py-0.5 text-xs border border-white/20 rounded-lg focus:ring-1 focus:ring-white/30 focus:border-white/30 bg-white/10 backdrop-blur-md text-text"
                      >
                        {availableMonths.map((m) => (
                          <option key={m.monthKey} value={m.monthKey}>
                            {m.month} ({m.trainings})
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  {/* Bike Summary Cards - Compact - Only show if selected */}
                  {showBike && hasBikeData && (
                    <div className="mb-2">
                      <div className={`${isMobile ? 'text-[9px]' : 'text-xs'} font-medium text-lighterText mb-0.5 uppercase tracking-wide`}>Bike</div>
                      <div className={`grid ${isMobile ? 'grid-cols-5 sm:grid-cols-6' : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-5'} ${isMobile ? 'gap-0.5' : 'gap-1'}`}>
                        <div className={`bg-white/10 backdrop-blur-md ${isMobile ? 'rounded p-0.5' : 'rounded-lg p-1.5'} border border-white/15 shadow-sm`}>
                          <div className={`${isMobile ? 'text-[8px]' : 'text-xs'} text-lighterText font-medium ${isMobile ? 'mb-0' : 'mb-0.5'}`}>{isMobile ? 'Tr' : 'Trainings'}</div>
                          <div className={`${isMobile ? 'text-xs' : 'text-base'} font-bold text-text`}>{bikeTrainings}</div>
                        </div>
                        <div className={`bg-white/10 backdrop-blur-md ${isMobile ? 'rounded p-0.5' : 'rounded-lg p-1.5'} border border-white/15 shadow-sm`}>
                          <div className={`${isMobile ? 'text-[8px]' : 'text-xs'} text-lighterText font-medium ${isMobile ? 'mb-0' : 'mb-0.5'}`}>Time</div>
                          <div className={`${isMobile ? 'text-[10px]' : 'text-sm'} font-bold text-text`}>{formatDuration(bikeTime)}</div>
                        </div>
                        {(month.bikeAvgPower !== undefined && month.bikeAvgPower !== null && month.bikeAvgPower > 0) && (
                          <div className={`bg-white/10 backdrop-blur-md ${isMobile ? 'rounded p-0.5' : 'rounded-lg p-1.5'} border border-white/15 shadow-sm`}>
                            <div className={`${isMobile ? 'text-[8px]' : 'text-xs'} text-lighterText font-medium ${isMobile ? 'mb-0' : 'mb-0.5'}`}>{isMobile ? 'P' : 'Avg Power'}</div>
                            <div className={`${isMobile ? 'text-xs' : 'text-base'} font-bold text-text ${isMobile ? 'flex-col' : 'flex items-center justify-between'}`}>
                              <span>{Math.round(month.bikeAvgPower)}W</span>
                              {month.bikeMaxPower > 0 && !isMobile && (
                                <span className="text-[10px] text-lighterText font-medium ml-1">Max: {Math.round(month.bikeMaxPower)}W</span>
                              )}
                            </div>
                          </div>
                        )}
                        {(month.avgHeartRate > 0 || month.maxHeartRate > 0) && (
                          <div className={`bg-white/10 backdrop-blur-md ${isMobile ? 'rounded p-0.5' : 'rounded-lg p-1.5'} border border-white/15 shadow-sm`}>
                            <div className={`${isMobile ? 'text-[8px]' : 'text-xs'} text-lighterText font-medium ${isMobile ? 'mb-0' : 'mb-0.5'}`}>{isMobile ? 'HR' : 'Avg HR'}</div>
                            <div className={`${isMobile ? 'text-xs' : 'text-base'} font-bold text-text ${isMobile ? 'flex-col' : 'flex items-center justify-between'}`}>
                              <span>{month.avgHeartRate > 0 ? Math.round(month.avgHeartRate) : '-'}</span>
                              {month.maxHeartRate > 0 && !isMobile && (
                                <span className="text-[10px] text-lighterText font-medium ml-1">Max: {Math.round(month.maxHeartRate)}</span>
                              )}
                            </div>
                          </div>
                        )}
                        {(month.bikeTSS !== undefined && month.bikeTSS !== null) && (
                          <div className={`bg-white/10 backdrop-blur-md ${isMobile ? 'rounded p-0.5' : 'rounded-lg p-1.5'} border border-white/15 shadow-sm`}>
                            <div className={`${isMobile ? 'text-[8px]' : 'text-xs'} text-lighterText font-medium ${isMobile ? 'mb-0' : 'mb-0.5'}`}>TSS</div>
                            <div className={`${isMobile ? 'text-xs' : 'text-base'} font-bold text-text`}>{Math.round(month.bikeTSS || 0)}</div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Running Summary Cards - Compact - Only show if selected */}
                  {showRun && hasRunData && (runningTime > 0 || hasRunningZoneData || (month.runningTSS !== undefined && month.runningTSS !== null)) && (
                    <div className="mb-2">
                      <div className={`${isMobile ? 'text-[9px]' : 'text-xs'} font-medium text-lighterText mb-0.5 uppercase tracking-wide`}>Run</div>
                      <div className={`grid ${isMobile ? 'grid-cols-5 sm:grid-cols-6' : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-5'} ${isMobile ? 'gap-0.5' : 'gap-1'}`}>
                        {runningTrainings > 0 && (
                        <div className={`bg-white/10 backdrop-blur-md ${isMobile ? 'rounded p-0.5' : 'rounded-lg p-1.5'} border border-white/15 shadow-sm`}>
                          <div className={`${isMobile ? 'text-[8px]' : 'text-xs'} text-lighterText font-medium ${isMobile ? 'mb-0' : 'mb-0.5'}`}>{isMobile ? 'Tr' : 'Trainings'}</div>
                            <div className={`${isMobile ? 'text-xs' : 'text-base'} font-bold text-text`}>{runningTrainings}</div>
                        </div>
                        )}
                        {runningTime > 0 && (
                        <div className={`bg-white/10 backdrop-blur-md ${isMobile ? 'rounded p-0.5' : 'rounded-lg p-1.5'} border border-white/15 shadow-sm`}>
                          <div className={`${isMobile ? 'text-[8px]' : 'text-xs'} text-lighterText font-medium ${isMobile ? 'mb-0' : 'mb-0.5'}`}>Time</div>
                            <div className={`${isMobile ? 'text-[10px]' : 'text-sm'} font-bold text-text`}>{formatDuration(runningTime)}</div>
                        </div>
                        )}
                        {month.runningAvgPace > 0 && month.runningAvgPace !== Infinity && !isNaN(month.runningAvgPace) && (
                          <div className={`bg-white/10 backdrop-blur-md ${isMobile ? 'rounded p-0.5' : 'rounded-lg p-1.5'} border border-white/15 shadow-sm`}>
                            <div className={`${isMobile ? 'text-[8px]' : 'text-xs'} text-lighterText font-medium ${isMobile ? 'mb-0' : 'mb-0.5'}`}>{isMobile ? 'Pace' : 'Avg Pace'}</div>
                            <div className={`flex ${isMobile ? 'flex-col' : 'items-center justify-between'} ${isMobile ? 'text-xs' : 'text-base'} font-bold text-text leading-tight`}>
                              <span>{formatPace(month.runningAvgPace)}</span>
                              {month.runningMaxPace > 0 && month.runningMaxPace < Infinity && !isNaN(month.runningMaxPace) && !isMobile && (
                                <span className="text-[10px] text-lighterText font-medium ml-1">Best: {formatPace(month.runningMaxPace)}</span>
                              )}
                            </div>
                          </div>
                        )}
                        {month.runningAvgHeartRate > 0 && (
                          <div className={`bg-white/10 backdrop-blur-md ${isMobile ? 'rounded p-0.5' : 'rounded-lg p-1.5'} border border-white/15 shadow-sm`}>
                            <div className={`${isMobile ? 'text-[8px]' : 'text-xs'} text-lighterText font-medium ${isMobile ? 'mb-0' : 'mb-0.5'}`}>{isMobile ? 'HR' : 'Avg HR'}</div>
                            <div className={`${isMobile ? 'text-xs' : 'text-base'} font-bold text-text ${isMobile ? 'flex-col' : 'flex items-center justify-between'}`}>
                              <span>{Math.round(month.runningAvgHeartRate)}</span>
                              {month.runningMaxHeartRate > 0 && !isMobile && (
                                <span className="text-[10px] text-lighterText font-medium ml-1">Max: {Math.round(month.runningMaxHeartRate)}</span>
                              )}
                            </div>
                          </div>
                        )}
                        {(month.runningTSS !== undefined && month.runningTSS !== null && month.runningTSS > 0) && (
                          <div className={`bg-white/10 backdrop-blur-md ${isMobile ? 'rounded p-0.5' : 'rounded-lg p-1.5'} border border-white/15 shadow-sm`}>
                            <div className={`${isMobile ? 'text-[8px]' : 'text-xs'} text-lighterText font-medium ${isMobile ? 'mb-0' : 'mb-0.5'}`}>TSS</div>
                            <div className={`${isMobile ? 'text-xs' : 'text-base'} font-bold text-text`}>{Math.round(month.runningTSS)}</div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Swim Summary Cards - Compact - Only show if selected */}
                  {showSwim && hasSwimData && (
                    <div className="mb-2">
                      <div className={`${isMobile ? 'text-[9px]' : 'text-xs'} font-medium text-lighterText mb-0.5 uppercase tracking-wide`}>Swim</div>
                      <div className={`grid ${isMobile ? 'grid-cols-5 sm:grid-cols-6' : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4'} ${isMobile ? 'gap-0.5' : 'gap-1'}`}>
                        {swimmingTrainings > 0 && (
                          <div className={`bg-white/10 backdrop-blur-md ${isMobile ? 'rounded p-0.5' : 'rounded-lg p-1.5'} border border-white/15 shadow-sm`}>
                            <div className={`${isMobile ? 'text-[8px]' : 'text-xs'} text-lighterText font-medium ${isMobile ? 'mb-0' : 'mb-0.5'}`}>{isMobile ? 'Tr' : 'Trainings'}</div>
                            <div className={`${isMobile ? 'text-xs' : 'text-base'} font-bold text-text`}>{swimmingTrainings}</div>
                          </div>
                        )}
                        {swimmingTime > 0 && (
                          <div className={`bg-white/10 backdrop-blur-md ${isMobile ? 'rounded p-0.5' : 'rounded-lg p-1.5'} border border-white/15 shadow-sm`}>
                            <div className={`${isMobile ? 'text-[8px]' : 'text-xs'} text-lighterText font-medium ${isMobile ? 'mb-0' : 'mb-0.5'}`}>Time</div>
                            <div className={`${isMobile ? 'text-[10px]' : 'text-sm'} font-bold text-text`}>{formatDuration(swimmingTime)}</div>
                          </div>
                        )}
                        {month.swimmingAvgPace > 0 && month.swimmingAvgPace !== Infinity && !isNaN(month.swimmingAvgPace) && (
                          <div className={`bg-white/10 backdrop-blur-md ${isMobile ? 'rounded p-0.5' : 'rounded-lg p-1.5'} border border-white/15 shadow-sm`}>
                            <div className={`${isMobile ? 'text-[8px]' : 'text-xs'} text-lighterText font-medium ${isMobile ? 'mb-0' : 'mb-0.5'}`}>{isMobile ? 'Pace' : 'Avg Pace'}</div>
                            <div className={`flex ${isMobile ? 'flex-col' : 'items-center justify-between'} ${isMobile ? 'text-xs' : 'text-base'} font-bold text-text leading-tight`}>
                              <span>{formatPace(month.swimmingAvgPace)}</span>
                              {month.swimmingMaxPace > 0 && month.swimmingMaxPace < Infinity && !isNaN(month.swimmingMaxPace) && !isMobile && (
                                <span className="text-[10px] text-lighterText font-medium ml-1">Best: {formatPace(month.swimmingMaxPace)}</span>
                              )}
                            </div>
                          </div>
                        )}
                        {month.swimmingAvgHeartRate > 0 && (
                          <div className={`bg-white/10 backdrop-blur-md ${isMobile ? 'rounded p-0.5' : 'rounded-lg p-1.5'} border border-white/15 shadow-sm`}>
                            <div className={`${isMobile ? 'text-[8px]' : 'text-xs'} text-lighterText font-medium ${isMobile ? 'mb-0' : 'mb-0.5'}`}>{isMobile ? 'HR' : 'Avg HR'}</div>
                            <div className={`${isMobile ? 'text-xs' : 'text-base'} font-bold text-text ${isMobile ? 'flex-col' : 'flex items-center justify-between'}`}>
                              <span>{Math.round(month.swimmingAvgHeartRate)}</span>
                              {month.swimmingMaxHeartRate > 0 && !isMobile && (
                                <span className="text-[10px] text-lighterText font-medium ml-1">Max: {Math.round(month.swimmingMaxHeartRate)}</span>
                              )}
                            </div>
                          </div>
                        )}
                        {(month.swimmingTSS !== undefined && month.swimmingTSS !== null) && (
                          <div className={`bg-white/10 backdrop-blur-md ${isMobile ? 'rounded p-0.5' : 'rounded-lg p-1.5'} border border-white/15 shadow-sm`}>
                            <div className={`${isMobile ? 'text-[8px]' : 'text-xs'} text-lighterText font-medium ${isMobile ? 'mb-0' : 'mb-0.5'}`}>TSS</div>
                            <div className={`${isMobile ? 'text-xs' : 'text-base'} font-bold text-text`}>{Math.round(month.swimmingTSS || 0)}</div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Zone Type Toggle - Compact with Bike/Run separation */}
                  {(month.powerZones || (month.hrZones && month.heartRateZones) || month.runningZones || month.runningZoneTimes || month.bikeHrZones || month.runningHrZones || month.swimmingZones || month.swimmingZoneTimes) && (
                    <div className="mb-1.5 flex items-center gap-1.5">
                      <span className="text-xs font-medium text-lighterText uppercase tracking-wide">Zones:</span>
                      <div className="flex gap-1 flex-wrap">
                        {month.powerZones && (
                          <button
                            onClick={() => setSelectedZoneType('power')}
                            className={`px-2 py-1 rounded-md text-xs font-medium transition-all ${
                              selectedZoneType === 'power'
                                ? 'bg-white/30 backdrop-blur-md text-text shadow-md border border-white/30'
                                : 'bg-white/10 backdrop-blur-md text-text hover:bg-white/20 border border-white/15'
                            }`}
                          >
                            Power (Bike)
                          </button>
                        )}
                        {(month.runningZones || month.runningZoneTimes) && (
                          <button
                            onClick={() => setSelectedZoneType('running')}
                            className={`px-2 py-1 rounded-md text-xs font-medium transition-all ${
                              selectedZoneType === 'running'
                                ? 'bg-white/30 backdrop-blur-md text-text shadow-md border border-white/30'
                                : 'bg-white/10 backdrop-blur-md text-text hover:bg-white/20 border border-white/15'
                            }`}
                          >
                            Power (Run)
                          </button>
                        )}
                        {(month.bikeHrZones || (month.hrZones && month.heartRateZones)) && (
                          <button
                            onClick={() => setSelectedZoneType('heartrate')}
                            className={`px-2 py-1 rounded-md text-xs font-medium transition-all ${
                              selectedZoneType === 'heartrate'
                                ? 'bg-white/30 backdrop-blur-md text-text shadow-md border border-white/30'
                                : 'bg-white/10 backdrop-blur-md text-text hover:bg-white/20 border border-white/15'
                            }`}
                          >
                            HR (Bike)
                          </button>
                        )}
                        {month.runningHrZones && (
                          <button
                            onClick={() => setSelectedZoneType('heartrate-run')}
                            className={`px-2 py-1 rounded-md text-xs font-medium transition-all ${
                              selectedZoneType === 'heartrate-run'
                                ? 'bg-white/30 backdrop-blur-md text-text shadow-md border border-white/30'
                                : 'bg-white/10 backdrop-blur-md text-text hover:bg-white/20 border border-white/15'
                            }`}
                          >
                            HR (Run)
                          </button>
                        )}
                        {(month.swimmingZones || month.swimmingZoneTimes) && (
                          <button
                            onClick={() => setSelectedZoneType('swimming')}
                            className={`px-2 py-1 rounded-md text-xs font-medium transition-all ${
                              selectedZoneType === 'swimming'
                                ? 'bg-white/30 backdrop-blur-md text-text shadow-md border border-white/30'
                                : 'bg-white/10 backdrop-blur-md text-text hover:bg-white/20 border border-white/15'
                            }`}
                          >
                            Swim
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Power Zones - Bike */}
                  {selectedZoneType === 'power' && month.powerZones && (
                    <div className="mb-2 p-2 bg-white/10 backdrop-blur-xl rounded-lg border border-white/20 shadow-md">
                      <h4 className="text-xs font-semibold text-text mb-2">
                        Time in Power Zone
                        {month.usesProfileZones ? ' (profile)' : bikeMaxPower > 0 ? ` (FTP: ${Math.round(estimatedFTP)}W)` : ' (default)'}
                      </h4>
                      <div className="space-y-2">
                        {POWER_ZONES.map(powerZone => {
                          const zone = month.zones[powerZone.zone];
                          const zoneDef = month.powerZones[powerZone.zone];
                          if (!zone || !zoneDef) return null;
                          
                          // Use bikeTime from backend (already calculated)
                          const bikeTimeForZones = Number(month.bikeTime) || 0;
                          const percentage = bikeTimeForZones > 0 
                            ? (zone.time / bikeTimeForZones) * 100 
                            : 0;
                          
                          const maxDisplay = zoneDef.max === Infinity || zoneDef.max === null || zoneDef.max === undefined 
                            ? '∞' 
                            : Math.round(zoneDef.max);
                          
                          // Zone labels based on description
                          const zoneLabels = {
                            'Recovery': 'Active Recovery',
                            'Aerobic': 'Endurance',
                            'Tempo': 'Tempo',
                            'Threshold': 'Lactate Threshold',
                            'VO2max': 'VO2 Max'
                          };
                          const zoneLabel = zoneLabels[powerZone.description] || powerZone.description;

                          const tooltipContent = (
                            <div className="space-y-1">
                              <div className="font-semibold text-gray-900">{zoneLabel}</div>
                              <div className="text-gray-600">Time: {formatDuration(zone.time)}</div>
                              {zone.avgPower > 0 && (
                                <div className="text-purple-600 font-medium">Avg Power: {Math.round(zone.avgPower)} W</div>
                              )}
                              <div className="text-gray-600">Percentage: {percentage.toFixed(1)}%</div>
                              {zone.predictedLactate > 0 && (
                                <div className="text-blue-600 font-medium">Lactate: {zone.predictedLactate.toFixed(1)} mmol/L</div>
                              )}
                            </div>
                          );

                          return (
                            <div key={powerZone.zone} className={`flex items-center ${isMobile ? 'gap-1' : 'gap-3'}`}>
                              {/* Zone name and range on the left */}
                              <div className={`${isMobile ? 'w-16' : 'w-48'} flex-shrink-0`}>
                                <div className={`${isMobile ? 'text-[9px]' : 'text-xs'} font-medium text-text`}>
                                  {isMobile ? `Z${powerZone.zone}: ${Math.round(zoneDef.min)}-${maxDisplay}W` : `${zoneLabel}: ${Math.round(zoneDef.min)} – ${maxDisplay} W`}
                              </div>
                              </div>
                              
                              {/* Horizontal bar with tooltip */}
                              <div 
                                className={`flex-1 relative ${isMobile ? 'h-10' : 'h-6'}`}
                                onMouseEnter={(e) => {
                                  setTooltipData({
                                    x: e.clientX,
                                    y: e.clientY,
                                    content: tooltipContent
                                  });
                                }}
                                onMouseMove={(e) => {
                                  setTooltipData({
                                    x: e.clientX,
                                    y: e.clientY,
                                    content: tooltipContent
                                  });
                                }}
                                onMouseLeave={() => setTooltipData(null)}
                              >
                                <div className="h-full bg-white/10 backdrop-blur-md rounded overflow-hidden border border-white/15">
                                  <div
                                    className="h-full transition-all duration-500 cursor-pointer hover:opacity-100"
                                    style={{
                                      width: `${percentage}%`,
                                      backgroundColor: powerZone.color,
                                      opacity: 0.8
                                    }}
                                  />
                                  </div>
                                </div>
                              
                              {/* Percentage on the right */}
                              <div className={`${isMobile ? 'w-8' : 'w-12'} text-right flex-shrink-0`}>
                                <div className={`${isMobile ? 'text-[10px]' : 'text-xs'} font-semibold text-text`}>
                                  {percentage.toFixed(0)}%
                              </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Heart Rate Zones - Bike */}
                  {selectedZoneType === 'heartrate' && ((month.hrZones && month.heartRateZones) || month.bikeHrZones) && (
                    <div className="mb-2 p-2 bg-white/10 backdrop-blur-xl rounded-lg border border-white/20 shadow-md">
                      <h4 className="text-xs font-semibold text-text mb-2">
                        Time in Heart Rate Zone
                        {month.maxHeartRate > 0 && (
                          <span className="text-xs font-normal text-lighterText ml-1">
                            (Max HR: {Math.round(month.maxHeartRate)} bpm)
                          </span>
                        )}
                      </h4>
                      <div className="space-y-2">
                        {POWER_ZONES.map(powerZone => {
                          const hrZones = month.bikeHrZones || month.hrZones || {};
                          const hrZone = hrZones?.[powerZone.zone];
                          const hrZoneDef = (month.bikeHeartRateZones || month.heartRateZones)?.[powerZone.zone];
                          if (!hrZone || !hrZoneDef) return null;
                          
                          const totalTime = Number(month.bikeTime) || 0;
                          const percentage = totalTime > 0 
                            ? (hrZone.time / totalTime) * 100 
                            : 0;
                          
                          const maxDisplay = hrZoneDef.max === Infinity || hrZoneDef.max === null || hrZoneDef.max === undefined 
                            ? '∞' 
                            : Math.round(hrZoneDef.max);
                          
                          // Zone labels based on description - shorter on mobile
                          const zoneLabels = {
                            'Recovery': isMobile ? 'Recovery' : 'Active Recovery',
                            'Aerobic': isMobile ? 'Endurance' : 'Endurance',
                            'Tempo': 'Tempo',
                            'Threshold': isMobile ? 'Threshold' : 'Lactate Threshold',
                            'VO2max': isMobile ? 'VO2 Max' : 'VO2 Max'
                          };
                          const zoneLabel = zoneLabels[powerZone.description] || powerZone.description;
                          
                          const tooltipContent = (
                            <div className="space-y-1">
                              <div className="font-semibold text-gray-900">{zoneLabel}</div>
                              <div className="text-gray-600">Time: {formatDuration(hrZone.time)}</div>
                              {hrZone.avgHeartRate > 0 && (
                                <div className="text-red-500 font-medium">Avg HR: {Math.round(hrZone.avgHeartRate)} bpm</div>
                              )}
                              <div className="text-gray-600">Percentage: {percentage.toFixed(1)}%</div>
                            </div>
                          );

                          return (
                            <div key={powerZone.zone} className={`flex items-center ${isMobile ? 'gap-1' : 'gap-3'}`}>
                              {/* Zone name and range on the left */}
                              <div className={`${isMobile ? 'w-16' : 'w-48'} flex-shrink-0`}>
                                <div className={`${isMobile ? 'text-[9px]' : 'text-xs'} font-medium text-text`}>
                                  {isMobile ? `Z${powerZone.zone}: ${Math.round(hrZoneDef.min)}-${maxDisplay}` : `${zoneLabel}: ${Math.round(hrZoneDef.min)} – ${maxDisplay} bpm`}
                              </div>
                              </div>
                              
                              {/* Horizontal bar with tooltip */}
                              <div 
                                className={`flex-1 relative ${isMobile ? 'h-10' : 'h-6'}`}
                                onMouseEnter={(e) => {
                                  setTooltipData({
                                    x: e.clientX,
                                    y: e.clientY,
                                    content: tooltipContent
                                  });
                                }}
                                onMouseMove={(e) => {
                                  setTooltipData({
                                    x: e.clientX,
                                    y: e.clientY,
                                    content: tooltipContent
                                  });
                                }}
                                onMouseLeave={() => setTooltipData(null)}
                              >
                                <div className="h-full bg-white/10 backdrop-blur-md rounded overflow-hidden border border-white/15">
                                  <div
                                    className="h-full transition-all duration-500 cursor-pointer hover:opacity-100"
                                    style={{
                                      width: `${percentage}%`,
                                      backgroundColor: powerZone.color,
                                      opacity: 0.8
                                    }}
                                  />
                                  </div>
                                </div>
                              
                              {/* Percentage on the right */}
                              <div className={`${isMobile ? 'w-8' : 'w-12'} text-right flex-shrink-0`}>
                                <div className={`${isMobile ? 'text-[10px]' : 'text-xs'} font-semibold text-text`}>
                                  {percentage.toFixed(0)}%
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Heart Rate Zones - Run */}
                  {selectedZoneType === 'heartrate-run' && month.runningHrZones && (
                    <div className="mb-2 p-2 bg-white/10 backdrop-blur-xl rounded-lg border border-white/20 shadow-md">
                      <h4 className="text-xs font-semibold text-text mb-2">
                        Time in Heart Rate Zone
                        {month.runningMaxHeartRate > 0 && (
                          <span className="text-xs font-normal text-lighterText ml-1">
                            (Max HR: {Math.round(month.runningMaxHeartRate)} bpm)
                          </span>
                        )}
                      </h4>
                      <div className="space-y-2">
                        {POWER_ZONES.map(powerZone => {
                          const hrZones = month.runningHrZones || {};
                          const hrZone = hrZones?.[powerZone.zone];
                          const hrZoneDef = (month.runningHeartRateZones || month.runningHrZones)?.[powerZone.zone];
                          if (!hrZone || !hrZoneDef) return null;
                          
                          const totalTime = Number(month.runningTime) || 0;
                          const percentage = totalTime > 0 
                            ? (hrZone.time / totalTime) * 100 
                            : 0;
                          
                          const maxDisplay = hrZoneDef.max === Infinity || hrZoneDef.max === null || hrZoneDef.max === undefined 
                            ? '∞' 
                            : Math.round(hrZoneDef.max);
                          
                          // Zone labels based on description - shorter on mobile
                          const zoneLabels = {
                            'Recovery': isMobile ? 'Recovery' : 'Active Recovery',
                            'Aerobic': isMobile ? 'Endurance' : 'Endurance',
                            'Tempo': 'Tempo',
                            'Threshold': isMobile ? 'Threshold' : 'Lactate Threshold',
                            'VO2max': isMobile ? 'VO2 Max' : 'VO2 Max'
                          };
                          const zoneLabel = zoneLabels[powerZone.description] || powerZone.description;
                          
                          const tooltipContent = (
                            <div className="space-y-1">
                              <div className="font-semibold text-gray-900">{zoneLabel}</div>
                              <div className="text-gray-600">Time: {formatDuration(hrZone.time)}</div>
                              {hrZone.avgHeartRate > 0 && (
                                <div className="text-red-500 font-medium">Avg HR: {Math.round(hrZone.avgHeartRate)} bpm</div>
                              )}
                              <div className="text-gray-600">Percentage: {percentage.toFixed(1)}%</div>
                            </div>
                          );

                          return (
                            <div key={powerZone.zone} className={`flex items-center ${isMobile ? 'gap-1' : 'gap-3'}`}>
                              {/* Zone name and range on the left */}
                              <div className={`${isMobile ? 'w-16' : 'w-48'} flex-shrink-0`}>
                                <div className={`${isMobile ? 'text-[9px]' : 'text-xs'} font-medium text-text`}>
                                  {isMobile ? `Z${powerZone.zone}: ${Math.round(hrZoneDef.min)}-${maxDisplay}` : `${zoneLabel}: ${Math.round(hrZoneDef.min)} – ${maxDisplay} bpm`}
                              </div>
                              </div>
                              
                              {/* Horizontal bar with tooltip */}
                              <div 
                                className={`flex-1 relative ${isMobile ? 'h-10' : 'h-6'}`}
                                onMouseEnter={(e) => {
                                  setTooltipData({
                                    x: e.clientX,
                                    y: e.clientY,
                                    content: tooltipContent
                                  });
                                }}
                                onMouseMove={(e) => {
                                  setTooltipData({
                                    x: e.clientX,
                                    y: e.clientY,
                                    content: tooltipContent
                                  });
                                }}
                                onMouseLeave={() => setTooltipData(null)}
                              >
                                <div className="h-full bg-white/10 backdrop-blur-md rounded overflow-hidden border border-white/15">
                                  <div
                                    className="h-full transition-all duration-500 cursor-pointer hover:opacity-100"
                                    style={{
                                      width: `${percentage}%`,
                                      backgroundColor: powerZone.color,
                                      opacity: 0.8
                                    }}
                                  />
                                  </div>
                                </div>
                              
                              {/* Percentage on the right */}
                              <div className={`${isMobile ? 'w-8' : 'w-12'} text-right flex-shrink-0`}>
                                <div className={`${isMobile ? 'text-[10px]' : 'text-xs'} font-semibold text-text`}>
                                  {percentage.toFixed(0)}%
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Running Zones - Power Zones for Run */}
                  {selectedZoneType === 'running' && (month.runningZones || month.runningZoneTimes) && (
                    <div className="mb-2 p-2 bg-white/10 backdrop-blur-xl rounded-lg border border-white/20 shadow-md">
                      <h4 className="text-xs font-semibold text-text mb-2">
                        Time in Power Zone
                        {month.usesProfileRunningZones ? ' (profile)' : month.runningZones ? ' (default)' : ' (from training data)'}
                      </h4>
                      {month.runningZoneTimes && (() => {
                        // Check if there are any zones with time > 0
                        const hasZoneData = Object.values(month.runningZoneTimes).some(z => z && z.time > 0);
                        
                        if (!hasZoneData) return null;
                        
                        return (
                          <div className="space-y-2">
                          {POWER_ZONES.map(powerZone => {
                            const zone = month.runningZoneTimes[powerZone.zone];
                              const zoneDef = month.runningZones?.[powerZone.zone];
                            if (!zone || zone.time === 0) return null;
                              
                            const percentage = month.runningTime > 0 
                              ? (zone.time / month.runningTime) * 100 
                              : 0;
                              
                              let minDisplay = '0:00';
                              let maxDisplay = '∞';
                              if (zoneDef) {
                                minDisplay = zoneDef.min === null || zoneDef.min === undefined || isNaN(zoneDef.min)
                                  ? '0:00'
                                  : formatPace(zoneDef.min);
                                maxDisplay = zoneDef.max === Infinity || zoneDef.max === null || zoneDef.max === undefined || isNaN(zoneDef.max)
                                  ? '∞' 
                                  : formatPace(zoneDef.max);
                              }
                              
                              // Zone labels based on description - shorter on mobile
                              const zoneLabels = {
                                'Recovery': isMobile ? 'Recovery' : 'Active Recovery',
                                'Aerobic': isMobile ? 'Endurance' : 'Endurance',
                                'Tempo': 'Tempo',
                                'Threshold': isMobile ? 'Threshold' : 'Lactate Threshold',
                                'VO2max': isMobile ? 'VO2 Max' : 'VO2 Max'
                              };
                              const zoneLabel = zoneLabels[powerZone.description] || powerZone.description;
                              
                              const tooltipContent = (
                                <div className="space-y-1">
                                  <div className="font-semibold text-gray-900">{zoneLabel}</div>
                                  <div className="text-gray-600">Time: {formatDuration(zone.time)}</div>
                                  {zone.avgPace && zone.avgPace > 0 && zone.avgPace !== Infinity && !isNaN(zone.avgPace) && (
                                    <div className="text-teal-600 font-medium">Avg Pace: {formatPace(zone.avgPace)} /km</div>
                                  )}
                                  <div className="text-gray-600">Percentage: {percentage.toFixed(1)}%</div>
                                </div>
                              );

                            return (
                                <div key={powerZone.zone} className={`flex items-center ${isMobile ? 'gap-1' : 'gap-3'}`}>
                                  {/* Zone name and range on the left */}
                                  <div className={`${isMobile ? 'w-16' : 'w-48'} flex-shrink-0`}>
                                    <div className={`${isMobile ? 'text-[9px]' : 'text-xs'} font-medium text-text`}>
                                      {isMobile ? `Z${powerZone.zone}: ${minDisplay}-${maxDisplay}` : `${zoneLabel}: ${minDisplay} – ${maxDisplay} /km`}
                                </div>
                                  </div>
                                  
                                  {/* Horizontal bar with tooltip */}
                                  <div 
                                    className={`flex-1 relative ${isMobile ? 'h-10' : 'h-6'}`}
                                    onMouseEnter={(e) => {
                                      setTooltipData({
                                        x: e.clientX,
                                        y: e.clientY,
                                        content: tooltipContent
                                      });
                                    }}
                                    onMouseMove={(e) => {
                                      setTooltipData({
                                        x: e.clientX,
                                        y: e.clientY,
                                        content: tooltipContent
                                      });
                                    }}
                                    onMouseLeave={() => setTooltipData(null)}
                                  >
                                    <div className="h-full bg-white/10 backdrop-blur-md rounded overflow-hidden border border-white/15">
                                    <div
                                        className="h-full transition-all duration-500 cursor-pointer hover:opacity-100"
                                      style={{
                                          width: `${percentage}%`,
                                        backgroundColor: powerZone.color,
                                          opacity: 0.8
                                      }}
                                      />
                                    </div>
                                  </div>
                                  
                                  {/* Percentage on the right */}
                                  <div className={`${isMobile ? 'w-8' : 'w-12'} text-right flex-shrink-0`}>
                                    <div className={`${isMobile ? 'text-[10px]' : 'text-xs'} font-semibold text-text`}>
                                      {percentage.toFixed(0)}%
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        );
                      })()}
                      {(!month.runningZoneTimes || !Object.values(month.runningZoneTimes).some(z => z && z.time > 0)) && !month.runningZones && (
                        <div className="text-center py-2 text-lighterText text-[10px]">
                    {month.runningTrainings > 0 
                      ? `Run trainings found (${month.runningTrainings}), but no pace data in records. Please check that FIT files contain speed data.`
                      : 'No run trainings with pace data in this month.'}
                        </div>
                      )}
                      {month.runningZones && (!month.runningZoneTimes || !Object.values(month.runningZoneTimes).some(z => z && z.time > 0)) && (
                        <div className="text-center py-2 text-lighterText text-[10px]">
                    <p>Zone definitions are available, but there is no time spent in zones yet.</p>
                    <p className="text-[9px] mt-0.5">Data will appear after uploading run trainings with pace data.</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Swimming Zones - Compact */}
                  {selectedZoneType === 'swimming' && (month.swimmingZones || month.swimmingZoneTimes) && (
                    <div className="mb-2 p-2 bg-white/10 backdrop-blur-xl rounded-lg border border-white/20 shadow-md">
                      <h4 className="text-xs font-semibold text-text mb-2">
                        Time in Pace Zone
                        {month.usesProfileZones && month.swimmingZones ? ' (from your profile)' : ' (from training data)'}
                      </h4>
                      {month.swimmingZoneTimes && (
                        <div className="space-y-2">
                          {POWER_ZONES.map(powerZone => {
                            const zone = month.swimmingZoneTimes[powerZone.zone];
                            const zoneDef = month.swimmingZones?.[powerZone.zone];
                            if (!zone || zone.time === 0) return null;
                            
                            const percentage = month.totalTime > 0 
                              ? (zone.time / month.totalTime) * 100 
                              : 0;
                            
                            let minDisplay = '0:00';
                            let maxDisplay = '∞';
                            if (zoneDef) {
                              minDisplay = formatPace(zoneDef.min);
                              maxDisplay = zoneDef.max === Infinity || zoneDef.max === null || zoneDef.max === undefined 
                                ? '∞' 
                                : formatPace(zoneDef.max);
                            }
                            
                            // Zone labels based on description - shorter on mobile
                            const zoneLabels = {
                              'Recovery': isMobile ? 'Recovery' : 'Active Recovery',
                              'Aerobic': isMobile ? 'Endurance' : 'Endurance',
                              'Tempo': 'Tempo',
                              'Threshold': isMobile ? 'Threshold' : 'Lactate Threshold',
                              'VO2max': isMobile ? 'VO2 Max' : 'VO2 Max'
                            };
                            const zoneLabel = zoneLabels[powerZone.description] || powerZone.description;
                            
                            const tooltipContent = (
                              <div className="space-y-1">
                                <div className="font-semibold text-gray-900">{zoneLabel}</div>
                                <div className="text-gray-600">Time: {formatDuration(zone.time)}</div>
                                {zone.avgPace && zone.avgPace > 0 && (
                                  <div className="text-teal-600 font-medium">Avg Pace: {formatPace(zone.avgPace)} /100m</div>
                                )}
                                <div className="text-gray-600">Percentage: {percentage.toFixed(1)}%</div>
                              </div>
                            );

                            return (
                              <div key={powerZone.zone} className={`flex items-center ${isMobile ? 'gap-1' : 'gap-3'}`}>
                                {/* Zone name and range on the left */}
                                <div className={`${isMobile ? 'w-16' : 'w-48'} flex-shrink-0`}>
                                  <div className={`${isMobile ? 'text-[9px]' : 'text-xs'} font-medium text-text`}>
                                    {isMobile ? `Z${powerZone.zone}: ${minDisplay}-${maxDisplay}` : `${zoneLabel}: ${minDisplay} – ${maxDisplay} /100m`}
                                </div>
                                </div>
                                
                                {/* Horizontal bar with tooltip */}
                                <div 
                                  className={`flex-1 relative ${isMobile ? 'h-10' : 'h-6'}`}
                                  onMouseEnter={(e) => {
                                    setTooltipData({
                                      x: e.clientX,
                                      y: e.clientY,
                                      content: tooltipContent
                                    });
                                  }}
                                  onMouseMove={(e) => {
                                    setTooltipData({
                                      x: e.clientX,
                                      y: e.clientY,
                                      content: tooltipContent
                                    });
                                  }}
                                  onMouseLeave={() => setTooltipData(null)}
                                >
                                  <div className="h-full bg-white/10 backdrop-blur-md rounded overflow-hidden border border-white/15">
                                    <div
                                      className="h-full transition-all duration-500 cursor-pointer hover:opacity-100"
                                      style={{
                                        width: `${percentage}%`,
                                        backgroundColor: powerZone.color,
                                        opacity: 0.8
                                      }}
                                    />
                                    </div>
                                  </div>
                                
                                {/* Percentage on the right */}
                                <div className={`${isMobile ? 'w-8' : 'w-12'} text-right flex-shrink-0`}>
                                  <div className={`${isMobile ? 'text-[10px]' : 'text-xs'} font-semibold text-text`}>
                                    {percentage.toFixed(0)}%
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {month.swimmingZoneTimes && Object.values(month.swimmingZoneTimes).every(z => !z || z.time === 0) && (
                        <div className="text-center py-2 text-lighterText text-[10px]">
                          No swim trainings with pace data in this month.
                        </div>
                      )}
                    </div>
                  )}

                  {/* Training Comparison - Compact */}
                  {selectedTrainings.length > 0 && (
                    <div className="mb-2 p-1.5 bg-white/10 backdrop-blur-xl rounded-lg border border-white/20 shadow-md">
                      <div className="flex items-center justify-between mb-1">
                        <h4 className="text-[10px] font-semibold text-text">
                          Training comparison ({selectedTrainings.length})
                        </h4>
                        <button
                          onClick={() => setSelectedTrainings([])}
                          className="text-[9px] text-red hover:text-red-dark"
                        >
                          Clear
                        </button>
                      </div>
                      
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-primary/20">
                              <th className="text-left py-1.5 px-2 text-[10px] font-semibold text-text">Training</th>
                              <th className="text-right py-1.5 px-2 text-[10px] font-semibold text-text">Avg power</th>
                              <th className="text-right py-1.5 px-2 text-[10px] font-semibold text-text">Max power</th>
                              <th className="text-right py-1.5 px-2 text-[10px] font-semibold text-text">Avg HR</th>
                              <th className="text-right py-1.5 px-2 text-[10px] font-semibold text-text">Max HR</th>
                              <th className="text-right py-1.5 px-2 text-[10px] font-semibold text-text">Time</th>
                              <th className="text-right py-1.5 px-2 text-[10px] font-semibold text-text">Distance</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selectedTrainings.map((training, idx) => (
                              <tr key={`compare-${training.type}-${training.id}-${idx}`} className="border-b border-primary/10">
                                <td className="py-1.5 px-2">
                                  <div className="font-medium text-text text-[10px]">{training.title}</div>
                                  <div className="text-[10px] text-lighterText">
                                    {new Date(training.date).toLocaleDateString('en-US')} • {training.type === 'fit' ? 'FIT' : training.type === 'strava' ? 'Strava' : 'Manual'}
                                  </div>
                                  {training.similarTrainings && training.similarTrainings.length > 0 && (
                                    <div className="text-[10px] text-primary mt-0.5">
                                      {training.similarTrainings.length} similar training{training.similarTrainings.length !== 1 ? 's' : ''}
                                    </div>
                                  )}
                                </td>
                                <td className="text-right py-1.5 px-2 font-semibold text-text text-[10px]">{Math.round(training.avgPower)}W</td>
                                <td className="text-right py-1.5 px-2 font-semibold text-text text-[10px]">{Math.round(training.maxPower)}W</td>
                                <td className="text-right py-1.5 px-2 text-text text-[10px]">
                                  {training.avgHeartRate > 0 ? `${Math.round(training.avgHeartRate)}` : '-'}
                                </td>
                                <td className="text-right py-1.5 px-2 text-text text-[10px]">
                                  {training.maxHeartRate > 0 ? `${Math.round(training.maxHeartRate)}` : '-'}
                                </td>
                                <td className="text-right py-1.5 px-2 text-text text-[10px]">{formatDuration(training.totalTime)}</td>
                                <td className="text-right py-1.5 px-2 text-text text-[10px]">
                                  {training.totalDistance > 0 ? `${(training.totalDistance / 1000).toFixed(1)} km` : '-'}
                                </td>
                              </tr>
                            ))}
                            {selectedTrainings.length > 1 && (
                              <tr className="bg-white/40 backdrop-blur-sm font-semibold">
                                <td className="py-1.5 px-2 text-text text-[10px]">Average</td>
                                <td className="text-right py-1.5 px-2 text-text text-[10px]">
                                  {Math.round(selectedTrainings.reduce((sum, t) => sum + t.avgPower, 0) / selectedTrainings.length)}W
                                </td>
                                <td className="text-right py-1.5 px-2 text-text text-[10px]">
                                  {Math.round(selectedTrainings.reduce((sum, t) => sum + t.maxPower, 0) / selectedTrainings.length)}W
                                </td>
                                <td className="text-right py-1.5 px-2 text-text text-[10px]">
                                  {selectedTrainings.some(t => t.avgHeartRate > 0)
                                    ? `${Math.round(selectedTrainings.filter(t => t.avgHeartRate > 0).reduce((sum, t) => sum + t.avgHeartRate, 0) / selectedTrainings.filter(t => t.avgHeartRate > 0).length)}`
                                    : '-'}
                                </td>
                                <td className="text-right py-1.5 px-2 text-text text-[10px]">
                                  {selectedTrainings.some(t => t.maxHeartRate > 0)
                                    ? `${Math.round(selectedTrainings.filter(t => t.maxHeartRate > 0).reduce((sum, t) => sum + t.maxHeartRate, 0) / selectedTrainings.filter(t => t.maxHeartRate > 0).length)}`
                                    : '-'}
                                </td>
                                <td className="text-right py-1.5 px-2 text-text text-[10px]">
                                  {formatDuration(selectedTrainings.reduce((sum, t) => sum + t.totalTime, 0) / selectedTrainings.length)}
                                </td>
                                <td className="text-right py-1.5 px-2 text-text text-[10px]">
                                  {selectedTrainings.some(t => t.totalDistance > 0)
                                    ? `${(selectedTrainings.reduce((sum, t) => sum + (t.totalDistance || 0), 0) / 1000 / selectedTrainings.length).toFixed(1)} km`
                                    : '-'}
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()
          ) : (
            <div className="bg-white/10 backdrop-blur-xl rounded-xl border border-white/20 shadow-md p-4">
              <div className="text-center py-6 text-gray-500 text-sm">
                <p>Select a month to display the analysis.</p>
              </div>
            </div>
          )}
        </div>
      )}
      
      {/* Global Tooltip */}
      {tooltipData && (
        <div
          className="fixed bg-white/95 backdrop-blur-sm rounded-lg shadow-xl border border-gray-200 p-3 z-50 pointer-events-none text-xs"
          style={{
            left: `${tooltipData.x + 15}px`,
            top: `${tooltipData.y - 10}px`,
            transform: 'translateY(-100%)',
            minWidth: '180px'
          }}
        >
          {tooltipData.content}
        </div>
      )}
    </div>
  );
};

export default LactateStatistics;

