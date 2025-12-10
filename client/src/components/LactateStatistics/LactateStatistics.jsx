import React, { useState, useEffect, useCallback, useRef } from 'react';
import { getTrainingsWithLactate, getMonthlyPowerAnalysis, getLatestPowerZones } from '../../services/api';
import { useAuth } from '../../context/AuthProvider';
import { formatDuration } from '../../utils/fitAnalysisUtils';

// Power zones definition (based on FTP)
const POWER_ZONES = [
  { zone: 1, label: 'Zone 1', description: 'Recovery', color: '#4A90E2' },
  { zone: 2, label: 'Zone 2', description: 'Aerobic', color: '#50C878' },
  { zone: 3, label: 'Zone 3', description: 'Tempo', color: '#FFD700' },
  { zone: 4, label: 'Zone 4', description: 'Threshold', color: '#FF8C00' },
  { zone: 5, label: 'Zone 5', description: 'VO2max', color: '#FF4500' }
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
  const [selectedZoneType, setSelectedZoneType] = useState('power'); // 'power', 'heartrate', 'running', 'swimming'
  const [selectedHrZoneSport, setSelectedHrZoneSport] = useState('bike'); // 'bike' or 'run' for HR zones
  const [forceRefresh, setForceRefresh] = useState(0); // Force refresh counter
  const zoneTypeInitialized = useRef(new Map()); // Track which months have had zone type auto-selected
  
  // Format pace for display (seconds to mm:ss)
  const formatPace = (seconds) => {
    if (!seconds || seconds === 0 || isNaN(seconds)) return '';
    const minutes = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  const loadTrainings = useCallback(async () => {
    try {
      setLoading(true);
      const athleteId = user?.role === 'athlete' ? null : (selectedAthleteId || (user?.role === 'coach' ? user._id : null));
      const data = await getTrainingsWithLactate(athleteId);
      setTrainings(data || []);
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
      
      // Check localStorage first (skip if force refresh)
      if (forceRefresh === 0) {
        try {
          const cached = localStorage.getItem(cacheKey);
          if (cached) {
            const { data, timestamp } = JSON.parse(cached);
            const cacheAge = Date.now() - timestamp;
            const cacheMaxAge = 60 * 60 * 1000; // 1 hour
            
            if (cacheAge < cacheMaxAge && data && data.length > 0) {
              console.log('Using cached metadata');
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
  }, [user, selectedAthleteId, forceRefresh]);

  // Clear cache function
  const clearCache = useCallback(() => {
    const athleteId = user?.role === 'athlete' ? null : (selectedAthleteId || (user?.role === 'coach' ? user._id : null));
    const cachePrefix = `monthlyAnalysis_${athleteId || 'default'}_`;
    
    try {
      // Clear all cached months
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith(cachePrefix) || key === `monthlyAnalysis_metadata_${athleteId || 'default'}`)) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => localStorage.removeItem(key));
      
      // Clear loaded months from state
      setLoadedMonths(new Map());
      setAvailableMonths([]);
      setSelectedMonth(null);
      
      // Force refresh
      setForceRefresh(prev => prev + 1);
      
      // Reload data
      loadAvailableMonths();
    } catch (e) {
      console.error('Error clearing cache:', e);
    }
  }, [user, selectedAthleteId, loadAvailableMonths]);

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
      console.error('Error loading user zones:', error);
    }
  }, []);


  useEffect(() => {
    loadTrainings();
    loadAvailableMonths();
    loadUserZones();
    
    // Load cached month data from localStorage on mount (skip if force refresh)
    if (forceRefresh === 0) {
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
    }
  }, [loadTrainings, loadAvailableMonths, loadUserZones, user, selectedAthleteId, forceRefresh]);

  // Load month data when selected month changes
  useEffect(() => {
    if (selectedMonth && !loadedMonths.has(selectedMonth)) {
      loadMonthData(selectedMonth);
    }
  }, [selectedMonth, loadMonthData, loadedMonths]);

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
      <div className="bg-white/60 backdrop-blur-lg rounded-3xl border border-white/30 shadow-xl p-6 md:p-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Lactate Statistics</h2>
        <div className="text-center py-8 text-gray-500">
          <p>No trainings with lactate values found.</p>
          <p className="text-sm mt-2">Add lactate values to your training intervals to see statistics here.</p>
        </div>
      </div>
    );
  }


  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white/60 backdrop-blur-lg rounded-3xl border border-white/30 shadow-xl p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold text-gray-900 mb-2">Měsíční analýza podle wattů</h2>
            <p className="text-gray-600">Analýza tréninků podle power zón s predikcí laktátu</p>
          </div>
          <button
            onClick={clearCache}
            className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors text-sm font-medium"
            title="Obnovit data (vymazat cache)"
          >
            🔄 Obnovit
          </button>
        </div>
      </div>

      {/* Monthly Analysis */}
      {activeTab === 'monthly' && (
        <div className="space-y-6">
          {/* Month Selector */}
          {availableMonths.length > 0 && (
            <div className="bg-white/60 backdrop-blur-lg rounded-3xl border border-white/30 shadow-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700">
                  Vyberte měsíc:
                </label>
                {selectedMonth && (
                  <button
                    onClick={() => loadMonthData(selectedMonth, true)}
                    className="text-xs text-primary hover:text-primary-dark font-medium"
                    title="Znovu načíst data pro tento měsíc"
                  >
                    🔄 Obnovit měsíc
                  </button>
                )}
              </div>
              <select
                value={selectedMonth || ''}
                onChange={(e) => setSelectedMonth(e.target.value || null)}
                className="w-full md:w-auto px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
              >
                {availableMonths.map((month) => (
                  <option key={month.monthKey} value={month.monthKey}>
                    {month.month} ({month.trainings} tréninků)
                  </option>
                ))}
              </select>
            </div>
          )}

          {loadingMonthly ? (
            <div className="flex items-center justify-center p-8">
              <div className="text-gray-500">Načítání měsíční analýzy...</div>
            </div>
          ) : availableMonths.length === 0 ? (
            <div className="bg-white/60 backdrop-blur-lg rounded-3xl border border-white/30 shadow-xl p-6 md:p-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Měsíční analýza podle wattů</h2>
              <div className="text-center py-8 text-gray-500">
                <p>Žádné FIT soubory s wattovými daty nenalezeny.</p>
                <p className="text-sm mt-2">Nahrajte cyklistické FIT soubory s wattovými daty pro zobrazení analýzy.</p>
              </div>
            </div>
          ) : loadingMonthData ? (
            <div className="flex items-center justify-center p-8">
              <div className="text-gray-500">Načítání dat pro vybraný měsíc...</div>
            </div>
          ) : selectedMonth && loadedMonths.has(selectedMonth) ? (
            (() => {
              const month = loadedMonths.get(selectedMonth);
              
              // Debug logging for month data
              console.log('=== MONTH DATA DEBUG ===', {
                monthKey: month.monthKey,
                month: month.month,
                bikeTrainings: month.bikeTrainings,
                bikeTime: month.bikeTime,
                bikeTSS: month.bikeTSS,
                runningTSS: month.runningTSS,
                totalTSS: month.totalTSS,
                bikeHrZones: month.bikeHrZones,
                runningHrZones: month.runningHrZones,
                bikeHeartRateZones: month.bikeHeartRateZones,
                runningHeartRateZones: month.runningHeartRateZones,
                bikeAvgPower: month.bikeAvgPower,
                bikeMaxPower: month.bikeMaxPower,
                runningTrainings: month.runningTrainings,
                runningTime: month.runningTime,
                runningAvgPace: month.runningAvgPace,
                runningMaxPace: month.runningMaxPace,
                runningZones: month.runningZones ? Object.keys(month.runningZones).map(k => ({
                  zone: k,
                  min: month.runningZones[k]?.min,
                  max: month.runningZones[k]?.max,
                  minFormatted: month.runningZones[k]?.min ? formatPace(month.runningZones[k].min) : null,
                  maxFormatted: month.runningZones[k]?.max && month.runningZones[k].max !== Infinity ? formatPace(month.runningZones[k].max) : '∞'
                })) : null,
                runningZoneTimes: month.runningZoneTimes ? Object.keys(month.runningZoneTimes).map(k => ({
                  zone: k,
                  time: month.runningZoneTimes[k]?.time,
                  avgPace: month.runningZoneTimes[k]?.avgPace,
                  avgPaceFormatted: month.runningZoneTimes[k]?.avgPace ? formatPace(month.runningZoneTimes[k].avgPace) : null,
                  paceCount: month.runningZoneTimes[k]?.paceCount,
                  zoneMin: month.runningZones?.[k]?.min,
                  zoneMax: month.runningZones?.[k]?.max,
                  inZone: month.runningZones?.[k] ? 
                    (month.runningZoneTimes[k]?.avgPace >= month.runningZones[k].min && 
                     (month.runningZones[k].max === Infinity || month.runningZoneTimes[k]?.avgPace <= month.runningZones[k].max)) : 
                    null
                })) : null
              });
              
              // Use bikeMaxPower for FTP estimation (bike-specific)
              const bikeMaxPower = Number(month.bikeMaxPower) || Number(month.maxPower) || 0;
              const estimatedFTP = bikeMaxPower * 0.75;
              
              // Use bikeTrainings and bikeTime from backend (already calculated)
              const bikeTrainings = Number(month.bikeTrainings) || 0;
              const bikeTime = Number(month.bikeTime) || 0;
              const hasBikeData = bikeTrainings > 0 || bikeTime > 0;
              
              // Check for running data - either trainings, time, or zone data
              const runningTrainings = Number(month.runningTrainings) || 0;
              const runningTime = Number(month.runningTime) || 0;
              const hasRunningZoneData = month.runningZoneTimes && Object.values(month.runningZoneTimes).some(z => z && z.time > 0);
              const hasRunData = runningTrainings > 0 || runningTime > 0 || month.runningZones || hasRunningZoneData;

              return (
                <div key={month.monthKey} className="bg-white/60 backdrop-blur-lg rounded-3xl border border-white/30 shadow-xl p-6 md:p-8">
                  <h3 className="text-2xl font-bold text-gray-900 mb-4 capitalize">{month.month}</h3>
                  
                  {/* Bike Summary Cards */}
                  {hasBikeData && (
                    <div className="mb-6">
                      <h4 className="text-lg font-semibold text-gray-900 mb-3">🚴 Cyklistika - Statistiky</h4>
                      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
                        <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-4 border border-blue-200">
                          <div className="text-sm text-blue-600 font-medium mb-1">Tréninky</div>
                          <div className="text-3xl font-bold text-blue-900">{bikeTrainings}</div>
                        </div>
                        <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-4 border border-purple-200">
                          <div className="text-sm text-purple-600 font-medium mb-1">Čas</div>
                          <div className="text-3xl font-bold text-purple-900">{formatDuration(bikeTime)}</div>
                        </div>
                        {(month.bikeAvgPower !== undefined && month.bikeAvgPower !== null && month.bikeAvgPower > 0) && (
                          <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-4 border border-green-200">
                            <div className="text-sm text-green-600 font-medium mb-1">Průměrný výkon</div>
                            <div className="text-3xl font-bold text-green-900">{Math.round(month.bikeAvgPower)}W</div>
                          </div>
                        )}
                        {(month.bikeMaxPower !== undefined && month.bikeMaxPower !== null && month.bikeMaxPower > 0) && (
                          <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-xl p-4 border border-orange-200">
                            <div className="text-sm text-orange-600 font-medium mb-1">Max. výkon</div>
                            <div className="text-3xl font-bold text-orange-900">{Math.round(month.bikeMaxPower)}W</div>
                          </div>
                        )}
                        {(month.bikeTSS > 0 || month.runningTSS > 0 || month.totalTSS > 0) && (
                          <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-xl p-4 border border-red-200">
                            <div className="text-sm text-red-600 font-medium mb-1">TSS</div>
                            {month.bikeTSS > 0 && (
                              <div className="text-2xl font-bold text-red-900">Bike: {month.bikeTSS || 0}</div>
                            )}
                            {month.runningTSS > 0 && (
                              <div className="text-2xl font-bold text-red-900 mt-1">Run: {month.runningTSS || 0}</div>
                            )}
                            {month.totalTSS > 0 && (month.bikeTSS > 0 || month.runningTSS > 0) && (
                              <div className="text-xs text-red-700 mt-2">Celkem: {month.totalTSS}</div>
                            )}
                            {month.totalTSS > 0 && month.bikeTSS === 0 && month.runningTSS === 0 && (
                            <div className="text-3xl font-bold text-red-900">{month.totalTSS}</div>
                            )}
                          </div>
                        )}
                        {/* Bike heart rate - show if available */}
                        {hasBikeData && month.avgHeartRate > 0 && (
                          <div className="bg-gradient-to-br from-pink-50 to-pink-100 rounded-xl p-4 border border-pink-200">
                            <div className="text-sm text-pink-600 font-medium mb-1">Průměrný tep</div>
                            <div className="text-3xl font-bold text-pink-900">{Math.round(month.avgHeartRate)} bpm</div>
                            {month.maxHeartRate > 0 && (
                              <div className="text-xs text-pink-700 mt-1">Max: {Math.round(month.maxHeartRate)} bpm</div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Running Summary Cards */}
                  {hasRunData && (runningTime > 0 || hasRunningZoneData) && (
                    <div className="mb-6">
                      <h4 className="text-lg font-semibold text-gray-900 mb-3">🏃 Běh - Statistiky</h4>
                      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
                        {runningTrainings > 0 && (
                        <div className="bg-gradient-to-br from-cyan-50 to-cyan-100 rounded-xl p-4 border border-cyan-200">
                          <div className="text-sm text-cyan-600 font-medium mb-1">Tréninky</div>
                            <div className="text-3xl font-bold text-cyan-900">{runningTrainings}</div>
                        </div>
                        )}
                        {runningTime > 0 && (
                        <div className="bg-gradient-to-br from-teal-50 to-teal-100 rounded-xl p-4 border border-teal-200">
                          <div className="text-sm text-teal-600 font-medium mb-1">Čas</div>
                            <div className="text-3xl font-bold text-teal-900">{formatDuration(runningTime)}</div>
                        </div>
                        )}
                        {month.runningDistance > 0 && (
                          <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-xl p-4 border border-emerald-200">
                            <div className="text-sm text-emerald-600 font-medium mb-1">Vzdálenost</div>
                            <div className="text-3xl font-bold text-emerald-900">{(month.runningDistance / 1000).toFixed(1)} km</div>
                          </div>
                        )}
                        {month.runningAvgPace > 0 && month.runningAvgPace !== Infinity && !isNaN(month.runningAvgPace) && (
                          <div className="bg-gradient-to-br from-lime-50 to-lime-100 rounded-xl p-4 border border-lime-200">
                            <div className="text-sm text-lime-600 font-medium mb-1">Průměrné tempo</div>
                            <div className="text-3xl font-bold text-lime-900">{formatPace(month.runningAvgPace)} /km</div>
                            {month.runningMaxPace > 0 && month.runningMaxPace < Infinity && !isNaN(month.runningMaxPace) && (
                              <div className="text-xs text-lime-700 mt-1">Nejrychlejší: {formatPace(month.runningMaxPace)} /km</div>
                            )}
                          </div>
                        )}
                        {month.runningAvgHeartRate > 0 && (
                          <div className="bg-gradient-to-br from-rose-50 to-rose-100 rounded-xl p-4 border border-rose-200">
                            <div className="text-sm text-rose-600 font-medium mb-1">Průměrný tep</div>
                            <div className="text-3xl font-bold text-rose-900">{Math.round(month.runningAvgHeartRate)} bpm</div>
                            {month.runningMaxHeartRate > 0 && (
                              <div className="text-xs text-rose-700 mt-1">Max: {Math.round(month.runningMaxHeartRate)} bpm</div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Zone Type Toggle */}
                  {(month.powerZones || (month.hrZones && month.heartRateZones) || month.runningZones || month.runningZoneTimes || month.swimmingZones || month.swimmingZoneTimes) && (
                    <div className="mb-4 flex items-center gap-3">
                      <span className="text-sm font-medium text-gray-700">Zobrazit zóny:</span>
                      <div className="flex gap-2 flex-wrap">
                        {month.powerZones && (
                          <button
                            onClick={() => setSelectedZoneType('power')}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                              selectedZoneType === 'power'
                                ? 'bg-primary text-white shadow-md'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                          >
                            Power Zóny
                          </button>
                        )}
                        {month.hrZones && month.heartRateZones && (
                          <button
                            onClick={() => setSelectedZoneType('heartrate')}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                              selectedZoneType === 'heartrate'
                                ? 'bg-primary text-white shadow-md'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                          >
                            Heart Rate Zóny
                          </button>
                        )}
                        {(month.runningZones || month.runningZoneTimes) && (
                          <button
                            onClick={() => setSelectedZoneType('running')}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                              selectedZoneType === 'running'
                                ? 'bg-primary text-white shadow-md'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                          >
                            Běh Zóny
                          </button>
                        )}
                        {(month.swimmingZones || month.swimmingZoneTimes) && (
                          <button
                            onClick={() => setSelectedZoneType('swimming')}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                              selectedZoneType === 'swimming'
                                ? 'bg-primary text-white shadow-md'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                          >
                            Plavání Zóny
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Power Zones */}
                  {selectedZoneType === 'power' && month.powerZones && (
                    <div className="mb-6 p-4 bg-gray-50 rounded-xl">
                      <h4 className="text-lg font-semibold text-gray-900 mb-3">
                        Power Zóny
                        {month.usesProfileZones ? ' (z vašeho profilu)' : bikeMaxPower > 0 ? ` (odhadovaný FTP: ${Math.round(estimatedFTP)}W)` : ' (výchozí zóny)'}
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-5 gap-2 mb-4">
                        {POWER_ZONES.map(powerZone => {
                          const zone = month.powerZones[powerZone.zone];
                          if (!zone) return null;
                          const maxDisplay = zone.max === Infinity || zone.max === null || zone.max === undefined 
                            ? '∞' 
                            : Math.round(zone.max);
                          return (
                            <div key={powerZone.zone} className="text-center p-2 bg-white rounded-lg">
                              <div className="font-semibold text-sm text-gray-900">{powerZone.label}</div>
                              <div className="text-xs text-gray-600">{powerZone.description}</div>
                              <div className="text-xs text-gray-500 mt-1">
                                {Math.round(zone.min)}-{maxDisplay}W
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <div className="space-y-3">
                        {POWER_ZONES.map(powerZone => {
                          const zone = month.zones[powerZone.zone];
                          if (!zone) return null;
                          // Use bikeTime from backend (already calculated)
                          const bikeTimeForZones = Number(month.bikeTime) || 0;
                          const maxZoneTime = Math.max(...Object.values(month.zones).map(z => z.time || 0));
                          const percentage = bikeTimeForZones > 0 
                            ? (zone.time / bikeTimeForZones) * 100 
                            : 0;
                          const barWidth = maxZoneTime > 0 ? (zone.time / maxZoneTime) * 100 : 0;

                          return (
                            <div key={powerZone.zone} className="flex items-center gap-4">
                              <div className="w-24 flex-shrink-0">
                                <div className="font-semibold text-sm text-gray-900">{powerZone.label}</div>
                                <div className="text-xs text-gray-500">{powerZone.description}</div>
                              </div>
                              <div className="flex-1 relative">
                                <div className="h-8 bg-gray-100 rounded-lg overflow-hidden">
                                  <div
                                    className="h-full rounded-lg transition-all duration-500 flex items-center justify-between px-2"
                                    style={{
                                      width: `${barWidth}%`,
                                      backgroundColor: powerZone.color,
                                      opacity: 0.8
                                    }}
                                  >
                                    {zone.time > 0 && (
                                      <>
                                        <span className="text-xs font-semibold text-white">
                                          {formatDuration(zone.time)}
                                        </span>
                                        {zone.avgPower > 0 && (
                                          <span className="text-xs font-semibold text-white">
                                            {Math.round(zone.avgPower)}W
                                          </span>
                                        )}
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>
                              <div className="w-32 text-right flex-shrink-0">
                                <div className="text-sm font-semibold text-gray-900">
                                  {percentage.toFixed(1)}%
                                </div>
                                {zone.predictedLactate > 0 && (
                                  <div className="text-xs text-gray-600">
                                    Pred. laktát: {zone.predictedLactate.toFixed(1)} mmol/L
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Heart Rate Zones */}
                  {selectedZoneType === 'heartrate' && ((month.hrZones && month.heartRateZones) || month.bikeHrZones || month.runningHrZones) && (
                    <div className="mb-6">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-lg font-semibold text-gray-900">
                        Heart Rate Zóny
                          {selectedHrZoneSport === 'bike' && month.maxHeartRate > 0 && (
                          <span className="text-sm font-normal text-gray-600 ml-2">
                            (Max HR: {Math.round(month.maxHeartRate)} bpm)
                          </span>
                        )}
                          {selectedHrZoneSport === 'run' && month.runningMaxHeartRate > 0 && (
                            <span className="text-sm font-normal text-gray-600 ml-2">
                              (Max HR: {Math.round(month.runningMaxHeartRate)} bpm)
                            </span>
                          )}
                      </h4>
                        {((month.bikeHrZones && Object.values(month.bikeHrZones).some(z => z && z.time > 0)) || 
                          (month.runningHrZones && Object.values(month.runningHrZones).some(z => z && z.time > 0))) && (
                          <div className="flex gap-2">
                            {month.bikeHrZones && Object.values(month.bikeHrZones).some(z => z && z.time > 0) && (
                              <button
                                onClick={() => setSelectedHrZoneSport('bike')}
                                className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                                  selectedHrZoneSport === 'bike'
                                    ? 'bg-primary text-white shadow-md'
                                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                }`}
                              >
                                🚴 Bike
                              </button>
                            )}
                            {month.runningHrZones && Object.values(month.runningHrZones).some(z => z && z.time > 0) && (
                              <button
                                onClick={() => setSelectedHrZoneSport('run')}
                                className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                                  selectedHrZoneSport === 'run'
                                    ? 'bg-primary text-white shadow-md'
                                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                }`}
                              >
                                🏃 Run
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="mb-4 p-3 bg-gray-50 rounded-xl">
                        <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
                          {POWER_ZONES.map(powerZone => {
                            const hrZones = selectedHrZoneSport === 'bike' 
                              ? (month.bikeHeartRateZones || month.heartRateZones)
                              : (month.runningHeartRateZones || month.heartRateZones);
                            const hrZone = hrZones?.[powerZone.zone];
                            if (!hrZone) return null;
                            const maxDisplay = hrZone.max === Infinity || hrZone.max === null || hrZone.max === undefined 
                              ? '∞' 
                              : Math.round(hrZone.max);
                            return (
                              <div key={powerZone.zone} className="text-center p-2 bg-white rounded-lg">
                                <div className="font-semibold text-sm text-gray-900">{powerZone.label}</div>
                                <div className="text-xs text-gray-600">{powerZone.description}</div>
                                <div className="text-xs text-gray-500 mt-1">
                                  {Math.round(hrZone.min)}-{maxDisplay} bpm
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      <div className="space-y-3">
                        {POWER_ZONES.map(powerZone => {
                          const hrZones = selectedHrZoneSport === 'bike' 
                            ? (month.bikeHrZones || month.hrZones || {})
                            : (month.runningHrZones || month.hrZones || {});
                          const hrZone = hrZones?.[powerZone.zone];
                          if (!hrZone) return null;
                          const totalTime = selectedHrZoneSport === 'bike' ? month.bikeTime : month.runningTime;
                          const maxHrZoneTime = Math.max(...Object.values(hrZones).map(z => z?.time || 0));
                          const percentage = totalTime > 0 
                            ? (hrZone.time / totalTime) * 100 
                            : 0;
                          const barWidth = maxHrZoneTime > 0 ? (hrZone.time / maxHrZoneTime) * 100 : 0;

                          return (
                            <div key={powerZone.zone} className="flex items-center gap-4">
                              <div className="w-24 flex-shrink-0">
                                <div className="font-semibold text-sm text-gray-900">{powerZone.label}</div>
                                <div className="text-xs text-gray-500">{powerZone.description}</div>
                              </div>
                              <div className="flex-1 relative">
                                <div className="h-8 bg-gray-100 rounded-lg overflow-hidden">
                                  <div
                                    className="h-full rounded-lg transition-all duration-500 flex items-center justify-between px-2"
                                    style={{
                                      width: `${barWidth}%`,
                                      backgroundColor: powerZone.color,
                                      opacity: 0.8
                                    }}
                                  >
                                    {hrZone.time > 0 && (
                                      <>
                                        <span className="text-xs font-semibold text-white">
                                          {formatDuration(hrZone.time)}
                                        </span>
                                        {hrZone.avgHeartRate > 0 && (
                                          <span className="text-xs font-semibold text-white">
                                            {Math.round(hrZone.avgHeartRate)} bpm
                                          </span>
                                        )}
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>
                              <div className="w-32 text-right flex-shrink-0">
                                <div className="text-sm font-semibold text-gray-900">
                                  {percentage.toFixed(1)}%
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Running Zones */}
                  {selectedZoneType === 'running' && (month.runningZones || month.runningZoneTimes) && (
                    <div className="mb-6 p-4 bg-gray-50 rounded-xl">
                      <h4 className="text-lg font-semibold text-gray-900 mb-3">
                        Běh Zóny (Pace)
                        {month.usesProfileRunningZones ? ' (z vašeho profilu)' : month.runningZones ? ' (výchozí zóny)' : ' (z dat tréninků)'}
                      </h4>
                      {month.runningZones && Object.keys(month.runningZones).length > 0 && (
                        <div className="grid grid-cols-1 md:grid-cols-5 gap-2 mb-4">
                          {POWER_ZONES.map(powerZone => {
                            const zone = month.runningZones[powerZone.zone];
                            if (!zone) return null;
                            const maxDisplay = zone.max === Infinity || zone.max === null || zone.max === undefined || isNaN(zone.max)
                              ? '∞' 
                              : formatPace(zone.max);
                            const minDisplay = zone.min === null || zone.min === undefined || isNaN(zone.min)
                              ? '0:00'
                              : formatPace(zone.min);
                            return (
                              <div key={powerZone.zone} className="text-center p-2 bg-white rounded-lg">
                                <div className="font-semibold text-sm text-gray-900">{powerZone.label}</div>
                                <div className="text-xs text-gray-600">{powerZone.description}</div>
                                <div className="text-xs text-gray-500 mt-1">
                                  {minDisplay}-{maxDisplay} /km
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {month.runningZoneTimes && (() => {
                        // Check if there are any zones with time > 0
                        const hasZoneData = Object.values(month.runningZoneTimes).some(z => z && z.time > 0);
                        
                        // Debug logging for running zones
                        console.log('=== RUNNING ZONES DEBUG ===', {
                          hasZoneData,
                          runningZoneTimes: month.runningZoneTimes,
                          runningTime: month.runningTime,
                          zonesWithData: Object.entries(month.runningZoneTimes).filter(([_, z]) => z && z.time > 0).map(([zone, data]) => ({
                            zone,
                            time: data.time,
                            avgPace: data.avgPace,
                            paceCount: data.paceCount
                          }))
                        });
                        
                        if (!hasZoneData) return null;
                        
                        return (
                        <div className="space-y-3">
                          {POWER_ZONES.map(powerZone => {
                            const zone = month.runningZoneTimes[powerZone.zone];
                            if (!zone || zone.time === 0) return null;
                              
                              // Debug logging for each zone
                              console.log(`Zone ${powerZone.zone}:`, {
                                time: zone.time,
                                avgPace: zone.avgPace,
                                paceCount: zone.paceCount,
                                formattedPace: zone.avgPace > 0 ? formatPace(zone.avgPace) : 'N/A'
                              });
                              
                              const maxZoneTime = Math.max(...Object.values(month.runningZoneTimes).map(z => z && z.time ? z.time : 0));
                            const percentage = month.runningTime > 0 
                              ? (zone.time / month.runningTime) * 100 
                              : 0;
                            const barWidth = maxZoneTime > 0 ? (zone.time / maxZoneTime) * 100 : 0;

                            return (
                              <div key={powerZone.zone} className="flex items-center gap-4">
                                <div className="w-24 flex-shrink-0">
                                  <div className="font-semibold text-sm text-gray-900">{powerZone.label}</div>
                                  <div className="text-xs text-gray-500">{powerZone.description}</div>
                                </div>
                                <div className="flex-1 relative">
                                  <div className="h-8 bg-gray-100 rounded-lg overflow-hidden">
                                    <div
                                      className="h-full rounded-lg transition-all duration-500 flex items-center justify-between px-2"
                                      style={{
                                        width: `${barWidth}%`,
                                        backgroundColor: powerZone.color,
                                        opacity: 0.8
                                      }}
                                    >
                                      {zone.time > 0 && (
                                        <>
                                          <span className="text-xs font-semibold text-white">
                                            {formatDuration(zone.time)}
                                          </span>
                                            {zone.avgPace && zone.avgPace > 0 && zone.avgPace !== Infinity && !isNaN(zone.avgPace) && (
                                              <span className="text-xs font-semibold text-white ml-2">
                                              {formatPace(zone.avgPace)} /km
                                            </span>
                                          )}
                                        </>
                                      )}
                                    </div>
                                  </div>
                                </div>
                                <div className="w-32 text-right flex-shrink-0">
                                  <div className="text-sm font-semibold text-gray-900">
                                    {percentage.toFixed(1)}%
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        );
                      })()}
                      {(!month.runningZoneTimes || !Object.values(month.runningZoneTimes).some(z => z && z.time > 0)) && !month.runningZones && (
                        <div className="text-center py-4 text-gray-500 text-sm">
                          {month.runningTrainings > 0 
                            ? `Běh tréninky nalezeny (${month.runningTrainings}), ale bez pace dat v records. Zkontrolujte, zda FIT soubory obsahují speed data.`
                            : 'Žádné běh tréninky s pace daty v tomto měsíci.'}
                        </div>
                      )}
                      {month.runningZones && (!month.runningZoneTimes || !Object.values(month.runningZoneTimes).some(z => z && z.time > 0)) && (
                        <div className="text-center py-4 text-gray-500 text-sm">
                          <p>Definice zón jsou k dispozici, ale zatím nejsou žádná data o čase stráveném v jednotlivých zónách.</p>
                          <p className="text-xs mt-1">Data se zobrazí po nahrání běžeckých tréninků s pace daty.</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Swimming Zones */}
                  {selectedZoneType === 'swimming' && (month.swimmingZones || month.swimmingZoneTimes) && (
                    <div className="mb-6 p-4 bg-gray-50 rounded-xl">
                      <h4 className="text-lg font-semibold text-gray-900 mb-3">
                        Plavání Zóny (Pace)
                        {month.usesProfileZones && month.swimmingZones ? ' (z vašeho profilu)' : ' (z dat tréninků)'}
                      </h4>
                      {month.swimmingZones && (
                        <div className="grid grid-cols-1 md:grid-cols-5 gap-2 mb-4">
                          {POWER_ZONES.map(powerZone => {
                            const zone = month.swimmingZones[powerZone.zone];
                            if (!zone) return null;
                            const maxDisplay = zone.max === Infinity || zone.max === null || zone.max === undefined 
                              ? '∞' 
                              : formatPace(zone.max);
                            return (
                              <div key={powerZone.zone} className="text-center p-2 bg-white rounded-lg">
                                <div className="font-semibold text-sm text-gray-900">{powerZone.label}</div>
                                <div className="text-xs text-gray-600">{powerZone.description}</div>
                                <div className="text-xs text-gray-500 mt-1">
                                  {formatPace(zone.min)}-{maxDisplay} /100m
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {month.swimmingZoneTimes && (
                        <div className="space-y-3">
                          {POWER_ZONES.map(powerZone => {
                            const zone = month.swimmingZoneTimes[powerZone.zone];
                            if (!zone || zone.time === 0) return null;
                            const maxZoneTime = Math.max(...Object.values(month.swimmingZoneTimes).map(z => z.time || 0));
                            const percentage = month.totalTime > 0 
                              ? (zone.time / month.totalTime) * 100 
                              : 0;
                            const barWidth = maxZoneTime > 0 ? (zone.time / maxZoneTime) * 100 : 0;

                            return (
                              <div key={powerZone.zone} className="flex items-center gap-4">
                                <div className="w-24 flex-shrink-0">
                                  <div className="font-semibold text-sm text-gray-900">{powerZone.label}</div>
                                  <div className="text-xs text-gray-500">{powerZone.description}</div>
                                </div>
                                <div className="flex-1 relative">
                                  <div className="h-8 bg-gray-100 rounded-lg overflow-hidden">
                                    <div
                                      className="h-full rounded-lg transition-all duration-500 flex items-center justify-between px-2"
                                      style={{
                                        width: `${barWidth}%`,
                                        backgroundColor: powerZone.color,
                                        opacity: 0.8
                                      }}
                                    >
                                      {zone.time > 0 && (
                                        <>
                                          <span className="text-xs font-semibold text-white">
                                            {formatDuration(zone.time)}
                                          </span>
                                          {zone.avgPace && zone.avgPace > 0 && (
                                            <span className="text-xs font-semibold text-white">
                                              {formatPace(zone.avgPace)} /100m
                                            </span>
                                          )}
                                        </>
                                      )}
                                    </div>
                                  </div>
                                </div>
                                <div className="w-32 text-right flex-shrink-0">
                                  <div className="text-sm font-semibold text-gray-900">
                                    {percentage.toFixed(1)}%
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {month.swimmingZoneTimes && Object.values(month.swimmingZoneTimes).every(z => !z || z.time === 0) && (
                        <div className="text-center py-4 text-gray-500 text-sm">
                          Žádné plavání tréninky s pace daty v tomto měsíci.
                        </div>
                      )}
                    </div>
                  )}

                  {/* Training Comparison */}
                  {selectedTrainings.length > 0 && (
                    <div className="mb-6 p-4 bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl border border-blue-200">
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="text-lg font-semibold text-gray-900">
                          Porovnání tréninků ({selectedTrainings.length})
                        </h4>
                        <button
                          onClick={() => setSelectedTrainings([])}
                          className="text-sm text-red-600 hover:text-red-800"
                        >
                          Zrušit výběr
                        </button>
                      </div>
                      
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-gray-300">
                              <th className="text-left py-2 px-3">Trénink</th>
                              <th className="text-right py-2 px-3">Průměrný výkon</th>
                              <th className="text-right py-2 px-3">Max. výkon</th>
                              <th className="text-right py-2 px-3">Prům. HR</th>
                              <th className="text-right py-2 px-3">Max HR</th>
                              <th className="text-right py-2 px-3">Čas</th>
                              <th className="text-right py-2 px-3">Vzdálenost</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selectedTrainings.map((training, idx) => (
                              <tr key={`compare-${training.type}-${training.id}-${idx}`} className="border-b border-gray-200">
                                <td className="py-2 px-3">
                                  <div className="font-medium">{training.title}</div>
                                  <div className="text-xs text-gray-500">
                                    {new Date(training.date).toLocaleDateString('cs-CZ')} • {training.type === 'fit' ? 'FIT' : training.type === 'strava' ? 'Strava' : 'Manual'}
                                  </div>
                                  {training.similarTrainings && training.similarTrainings.length > 0 && (
                                    <div className="text-xs text-blue-600 mt-1">
                                      {training.similarTrainings.length} podobný{training.similarTrainings.length > 1 ? 'ch' : ''} trénink{training.similarTrainings.length > 1 ? 'ů' : ''}
                                    </div>
                                  )}
                                </td>
                                <td className="text-right py-2 px-3 font-semibold">{Math.round(training.avgPower)}W</td>
                                <td className="text-right py-2 px-3 font-semibold">{Math.round(training.maxPower)}W</td>
                                <td className="text-right py-2 px-3">
                                  {training.avgHeartRate > 0 ? `${Math.round(training.avgHeartRate)}` : '-'}
                                </td>
                                <td className="text-right py-2 px-3">
                                  {training.maxHeartRate > 0 ? `${Math.round(training.maxHeartRate)}` : '-'}
                                </td>
                                <td className="text-right py-2 px-3">{formatDuration(training.totalTime)}</td>
                                <td className="text-right py-2 px-3">
                                  {training.totalDistance > 0 ? `${(training.totalDistance / 1000).toFixed(1)} km` : '-'}
                                </td>
                              </tr>
                            ))}
                            {selectedTrainings.length > 1 && (
                              <tr className="bg-gray-100 font-semibold">
                                <td className="py-2 px-3">Průměr</td>
                                <td className="text-right py-2 px-3">
                                  {Math.round(selectedTrainings.reduce((sum, t) => sum + t.avgPower, 0) / selectedTrainings.length)}W
                                </td>
                                <td className="text-right py-2 px-3">
                                  {Math.round(selectedTrainings.reduce((sum, t) => sum + t.maxPower, 0) / selectedTrainings.length)}W
                                </td>
                                <td className="text-right py-2 px-3">
                                  {selectedTrainings.some(t => t.avgHeartRate > 0)
                                    ? `${Math.round(selectedTrainings.filter(t => t.avgHeartRate > 0).reduce((sum, t) => sum + t.avgHeartRate, 0) / selectedTrainings.filter(t => t.avgHeartRate > 0).length)}`
                                    : '-'}
                                </td>
                                <td className="text-right py-2 px-3">
                                  {selectedTrainings.some(t => t.maxHeartRate > 0)
                                    ? `${Math.round(selectedTrainings.filter(t => t.maxHeartRate > 0).reduce((sum, t) => sum + t.maxHeartRate, 0) / selectedTrainings.filter(t => t.maxHeartRate > 0).length)}`
                                    : '-'}
                                </td>
                                <td className="text-right py-2 px-3">
                                  {formatDuration(selectedTrainings.reduce((sum, t) => sum + t.totalTime, 0) / selectedTrainings.length)}
                                </td>
                                <td className="text-right py-2 px-3">
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
            <div className="bg-white/60 backdrop-blur-lg rounded-3xl border border-white/30 shadow-xl p-6 md:p-8">
              <div className="text-center py-8 text-gray-500">
                <p>Vyberte měsíc pro zobrazení analýzy.</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default LactateStatistics;

