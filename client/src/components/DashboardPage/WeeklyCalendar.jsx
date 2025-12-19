import React, { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeftIcon, ChevronRightIcon, PencilIcon, CheckIcon, XMarkIcon } from '@heroicons/react/24/outline';
import TrainingStats from '../FitAnalysis/TrainingStats';
import TrainingChart from '../FitAnalysis/TrainingChart';
import IntervalChart from '../FitAnalysis/IntervalChart';
import { getFitTraining, getStravaActivityDetail, updateFitTraining, updateStravaActivity } from '../../services/api';
import api from '../../services/api';
import { useAuth } from '../../context/AuthProvider';

function startOfWeek(date) {
  const d = new Date(date);
  const day = (d.getDay() + 6) % 7; // Monday=0
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && 
         a.getMonth() === b.getMonth() && 
         a.getDate() === b.getDate();
}

function getLocalDateString(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function sportBadge(sport) {
  if (!sport) return '';
  const s = String(sport).toLowerCase();
  if (s.includes('run') || s === 'running') return '🏃‍♂️';
  if (s.includes('ride') || s.includes('cycle') || s.includes('bike') || s === 'cycling') return '🚴‍♂️';
  if (s.includes('swim') || s === 'swimming') return '🏊‍♂️';
  return '🏋️';
}

function categoryColor(category) {
  const colors = {
    endurance: 'bg-blue-100 border-blue-300 text-blue-800',
    tempo: 'bg-green-100 border-green-300 text-green-800',
    threshold: 'bg-yellow-100 border-yellow-300 text-yellow-800',
    vo2max: 'bg-orange-100 border-orange-300 text-orange-800',
    anaerobic: 'bg-red-100 border-red-300 text-red-800',
    recovery: 'bg-gray-100 border-gray-300 text-gray-800'
  };
  return colors[category] || 'bg-gray-100 border-gray-300 text-gray-800';
}

function categoryLabel(category) {
  const labels = {
    endurance: 'Endurance',
    tempo: 'Tempo',
    threshold: 'Threshold',
    vo2max: 'VO2max',
    anaerobic: 'Anaerobic',
    recovery: 'Recovery'
  };
  return labels[category] || 'Uncategorized';
}

const WeeklyCalendar = ({ activities = [], onSelectActivity, selectedActivityId }) => {
  const { user } = useAuth();
  const [currentWeek, setCurrentWeek] = useState(startOfWeek(new Date()));
  const [selectedTraining, setSelectedTraining] = useState(null);
  const [trainingDetail, setTrainingDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [userProfile, setUserProfile] = useState(null);
  const [cachedActivities, setCachedActivities] = useState([]);
  const [chartView, setChartView] = useState('training'); // 'training' or 'interval'
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [isEditingCategory, setIsEditingCategory] = useState(false);
  const [editingTitle, setEditingTitle] = useState('');
  const [editingCategory, setEditingCategory] = useState('');
  const [saving, setSaving] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [showLeftScroll, setShowLeftScroll] = useState(false);
  const [showRightScroll, setShowRightScroll] = useState(true);
  const [showLeftScrollNoTraining, setShowLeftScrollNoTraining] = useState(false);
  const [showRightScrollNoTraining, setShowRightScrollNoTraining] = useState(true);
  const scrollContainerRef = useRef(null);
  const scrollContainerNoTrainingRef = useRef(null);
  
  // Ref to store handleActivityClick function for event listener
  const handleActivityClickRef = useRef(null);
  
  // Detect mobile
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const weekDays = useMemo(() => {
    const start = startOfWeek(currentWeek);
    return Array.from({ length: 7 }).map((_, i) => addDays(start, i));
  }, [currentWeek]);

  // Load activities from localStorage on mount
  useEffect(() => {
    const loadCachedActivities = () => {
      try {
        const cached = localStorage.getItem('weeklyCalendar_activities');
        if (cached) {
          const parsed = JSON.parse(cached);
          // Check if cache is not too old (e.g., 1 hour)
          const cacheTime = localStorage.getItem('weeklyCalendar_cacheTime');
          if (cacheTime && Date.now() - parseInt(cacheTime) < 3600000) {
            setCachedActivities(parsed);
          }
        }
      } catch (error) {
        console.error('Error loading cached activities:', error);
      }
    };
    loadCachedActivities();
  }, []);

  // Save activities to localStorage when they change
  useEffect(() => {
    if (activities && activities.length > 0) {
      try {
        localStorage.setItem('weeklyCalendar_activities', JSON.stringify(activities));
        localStorage.setItem('weeklyCalendar_cacheTime', Date.now().toString());
        setCachedActivities(activities);
      } catch (error) {
        console.error('Error saving activities to cache:', error);
      }
    }
  }, [activities]);

  // Use cached activities if current activities are empty
  const effectiveActivities = activities && activities.length > 0 ? activities : cachedActivities;

  // Debug logging
  useEffect(() => {
    console.log('[WeeklyCalendar] Props received - activities:', activities?.length || 0, 'cachedActivities:', cachedActivities?.length || 0);
    if (activities && activities.length > 0) {
      console.log('[WeeklyCalendar] Activities received:', activities.length);
      console.log('[WeeklyCalendar] Sample activity:', activities[0]);
    } else if (cachedActivities && cachedActivities.length > 0) {
      console.log('[WeeklyCalendar] Using cached activities:', cachedActivities.length);
    } else {
      console.log('[WeeklyCalendar] No activities available - activities:', activities, 'cachedActivities:', cachedActivities);
    }
  }, [activities, cachedActivities]);

  const activitiesByDay = useMemo(() => {
    const map = new Map();
    if (effectiveActivities && Array.isArray(effectiveActivities)) {
    effectiveActivities.forEach(act => {
        try {
      const d = new Date(act.date || act.timestamp || act.startDate || Date.now());
          if (isNaN(d.getTime())) {
            console.warn('[WeeklyCalendar] Invalid date for activity:', act);
            return;
          }
      const key = getLocalDateString(d);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(act);
        } catch (e) {
          console.warn('[WeeklyCalendar] Error processing activity:', e, act);
        }
    });
    }
    return map;
  }, [effectiveActivities]);

  // Store handleActivityClick in ref whenever it changes
  useEffect(() => {
    handleActivityClickRef.current = handleActivityClick;
  });

  // Check scroll position for mobile scroll indicators (with selectedTraining)
  useEffect(() => {
    if (!isMobile || !scrollContainerRef.current) return;
    
    const checkScroll = () => {
      const container = scrollContainerRef.current;
      if (!container) return;
      
      const { scrollLeft, scrollWidth, clientWidth } = container;
      setShowLeftScroll(scrollLeft > 10);
      setShowRightScroll(scrollLeft < scrollWidth - clientWidth - 10);
    };
    
    const container = scrollContainerRef.current;
    container.addEventListener('scroll', checkScroll, { passive: true });
    checkScroll(); // Initial check
    
    // Also check on resize
    window.addEventListener('resize', checkScroll);
    
    return () => {
      container.removeEventListener('scroll', checkScroll);
      window.removeEventListener('resize', checkScroll);
    };
  }, [isMobile, weekDays, selectedTraining]);

  // Check scroll position for mobile scroll indicators (without selectedTraining)
  useEffect(() => {
    if (!isMobile || !scrollContainerNoTrainingRef.current) return;
    
    const checkScroll = () => {
      const container = scrollContainerNoTrainingRef.current;
      if (!container) return;
      
      const { scrollLeft, scrollWidth, clientWidth } = container;
      setShowLeftScrollNoTraining(scrollLeft > 10);
      setShowRightScrollNoTraining(scrollLeft < scrollWidth - clientWidth - 10);
    };
    
    const container = scrollContainerNoTrainingRef.current;
    container.addEventListener('scroll', checkScroll, { passive: true });
    checkScroll(); // Initial check
    
    // Also check on resize
    window.addEventListener('resize', checkScroll);
    
    return () => {
      container.removeEventListener('scroll', checkScroll);
      window.removeEventListener('resize', checkScroll);
    };
  }, [isMobile, weekDays, selectedTraining]);

  // Listen for activity selection from TrainingTable
  useEffect(() => {
    const handleSelectActivity = (event) => {
      const activity = event.detail;
      if (activity && handleActivityClickRef.current) {
        // Set the week to show the activity's date
        const activityDate = new Date(activity.date || activity.startDate || activity.timestamp || Date.now());
        setCurrentWeek(startOfWeek(activityDate));
        // Trigger activity click to show details after week is set
        setTimeout(() => {
          if (handleActivityClickRef.current) {
            handleActivityClickRef.current(activity);
          }
        }, 200);
      }
    };

    window.addEventListener('selectCalendarActivity', handleSelectActivity);
    return () => window.removeEventListener('selectCalendarActivity', handleSelectActivity);
  }, []); // Only set up listener once

  // Load user profile for TrainingChart
  useEffect(() => {
    const loadProfile = async () => {
      try {
        const response = await api.get('/user/profile');
        if (response && response.data) {
          setUserProfile(response.data);
        }
      } catch (error) {
        console.error('Error loading user profile:', error);
      }
    };
    loadProfile();
  }, []);

  // Sync editing values with trainingDetail
  useEffect(() => {
    if (trainingDetail) {
      setEditingTitle(trainingDetail.title || trainingDetail.titleManual || trainingDetail.titleAuto || trainingDetail.name || '');
      setEditingCategory(trainingDetail.category || '');
    }
  }, [trainingDetail]);

  const handleActivityClick = async (activity) => {
    setSelectedTraining(activity);
    setLoadingDetail(true);
    setTrainingDetail(null);
    
    if (onSelectActivity) {
      onSelectActivity(activity);
    }

    // Load detailed training data if it's a FIT or Strava activity
    try {
      if (activity.type === 'fit' && activity._id) {
        // FIT training - get full detail with records
        const trainingId = activity._id;
        if (!trainingId) {
          console.error('FIT training missing _id:', activity);
          setTrainingDetail(activity);
          return;
        }
        const detail = await getFitTraining(trainingId);
        // Ensure we have records for TrainingChart
        if (detail && (!detail.records || detail.records.length === 0)) {
          console.warn('FIT training has no records:', trainingId);
        }
        setTrainingDetail({ ...detail, type: 'fit' });
      } else if (activity.type === 'strava' && (activity.stravaId || activity.id)) {
        // Strava activity
        const stravaId = activity.stravaId || activity.id;
        if (!stravaId) {
          console.error('Strava activity missing stravaId:', activity);
          setTrainingDetail(activity);
          return;
        }
        const detail = await getStravaActivityDetail(stravaId);
        // Convert Strava detail to training format (same as FitAnalysisPage)
        if (detail.detail && detail.streams) {
          const startDate = new Date(detail.detail.start_date);
          
          // Handle streams format - can be { time: { data: [...] } } or { time: [...] }
          const timeArray = detail.streams.time?.data || detail.streams.time || [];
          const wattsArray = detail.streams.watts?.data || detail.streams.watts || [];
          const heartrateArray = detail.streams.heartrate?.data || detail.streams.heartrate || [];
          const velocityArray = detail.streams.velocity_smooth?.data || detail.streams.velocity_smooth || [];
          const cadenceArray = detail.streams.cadence?.data || detail.streams.cadence || [];
          const distanceArray = detail.streams.distance?.data || detail.streams.distance || [];
          
          // Ensure all arrays are actually arrays
          if (!Array.isArray(timeArray)) {
            console.error('Time array is not an array:', timeArray);
            setTrainingDetail(activity);
            return;
          }
          
          const records = timeArray.map((t, i) => ({
            timestamp: new Date(startDate.getTime() + (t * 1000)),
            power: wattsArray[i] || null,
            heartRate: heartrateArray[i] || null,
            speed: velocityArray[i] || null,
            cadence: cadenceArray[i] || null,
            distance: distanceArray[i] || null
          }));
          
          const trainingData = {
            ...activity,
            type: 'strava',
            records,
            laps: detail.laps || [],
            totalElapsedTime: detail.detail.elapsed_time || 0,
            totalTimerTime: detail.detail.moving_time || detail.detail.elapsed_time || 0,
            totalDistance: detail.detail.distance || 0,
            avgPower: detail.detail.average_watts || null,
            maxPower: detail.detail.max_watts || null,
            avgHeartRate: detail.detail.average_heartrate || null,
            maxHeartRate: detail.detail.max_heartrate || null,
            avgSpeed: detail.detail.average_speed || null,
            maxSpeed: detail.detail.max_speed || null,
            avgCadence: detail.detail.average_cadence || null,
            maxCadence: detail.detail.max_cadence || null,
            sport: activity.sport || detail.detail.type || 'cycling',
            title: detail.detail.name || activity.title || '',
            category: detail.category || activity.category || ''
          };
          setTrainingDetail(trainingData);
        } else {
          setTrainingDetail(activity);
        }
      } else {
        // Regular training - use as is
        setTrainingDetail(activity);
      }
    } catch (error) {
      // Handle rate limiting (429) errors gracefully
      if (error.response?.status === 429) {
        console.warn('Strava API rate limit exceeded. Please try again in a few minutes.');
        // Show basic activity data without streams
        setTrainingDetail(activity);
        // Optionally show a notification to the user
        // You can add a toast notification here if you have one
      } else {
      console.error('Error loading training detail:', error);
      setTrainingDetail(activity); // Fallback to basic activity data
      }
    } finally {
      setLoadingDetail(false);
    }
  };

  const prevWeek = () => setCurrentWeek(d => addDays(d, -7));
  const nextWeek = () => setCurrentWeek(d => addDays(d, 7));
  const today = () => setCurrentWeek(startOfWeek(new Date()));

  const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  return (
    <div className="bg-white/10 backdrop-blur-xl rounded-xl border border-white/20 shadow-md p-2 sm:p-3 md:p-4">
      <div className="flex items-center justify-between mb-2 sm:mb-3">
        <h3 className="text-base sm:text-lg font-semibold text-text">Weekly Calendar</h3>
        <div className="flex items-center gap-1 sm:gap-1.5">
          <button
            onClick={prevWeek}
            className="p-1 sm:p-1.5 rounded-lg bg-white/10 backdrop-blur-md hover:bg-white/20 border border-white/15 transition-colors"
          >
            <ChevronLeftIcon className="w-3 h-3 sm:w-4 sm:h-4 text-text" />
          </button>
          <button
            onClick={today}
            className="px-2 sm:px-2.5 py-0.5 sm:py-1 text-[10px] sm:text-xs bg-white/20 backdrop-blur-md text-text rounded-lg hover:bg-white/30 border border-white/20 transition-colors font-medium"
          >
            Today
          </button>
          <button
            onClick={nextWeek}
            className="p-1 sm:p-1.5 rounded-lg bg-white/10 backdrop-blur-md hover:bg-white/20 border border-white/15 transition-colors"
          >
            <ChevronRightIcon className="w-3 h-3 sm:w-4 sm:h-4 text-text" />
          </button>
        </div>
      </div>

      {selectedTraining ? (
        <div className={`grid ${isMobile ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-6'} gap-3 sm:gap-4`}>
          {/* Calendar - Mobile: Horizontal scroll, Desktop: Vertical Layout */}
          {isMobile ? (
            <div className="relative">
              {/* Left scroll indicator */}
              {showLeftScroll && (
                <button
                  onClick={() => {
                    if (scrollContainerRef.current) {
                      scrollContainerRef.current.scrollBy({ left: -200, behavior: 'smooth' });
                    }
                  }}
                  className="absolute left-0 top-0 bottom-0 w-12 bg-gradient-to-r from-white/80 via-white/40 to-transparent z-10 flex items-center justify-start pl-2"
                >
                  <div className="w-6 h-6 rounded-full bg-primary/20 backdrop-blur-sm flex items-center justify-center">
                    <ChevronLeftIcon className="w-4 h-4 text-primary" />
                  </div>
                </button>
              )}
              
              {/* Right scroll indicator */}
              {showRightScroll && (
                <button
                  onClick={() => {
                    if (scrollContainerRef.current) {
                      scrollContainerRef.current.scrollBy({ left: 200, behavior: 'smooth' });
                    }
                  }}
                  className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-white/80 via-white/40 to-transparent z-10 flex items-center justify-end pr-2"
                >
                  <div className="w-6 h-6 rounded-full bg-primary/20 backdrop-blur-sm flex items-center justify-center">
                    <ChevronRightIcon className="w-4 h-4 text-primary" />
                  </div>
                </button>
              )}
              
              <div 
                ref={scrollContainerRef}
                className="overflow-x-auto -mx-2 sm:mx-0 px-2 sm:px-0" 
                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}
              >
                <div className="flex gap-2 min-w-max">
                {weekDays.map((day, idx) => {
                  const key = getLocalDateString(day);
                  const dayActivities = activitiesByDay.get(key) || [];
                  const isToday = isSameDay(day, new Date());
                  
                  return (
                    <div
                      key={idx}
                      className={`bg-white/10 backdrop-blur-md rounded-lg border p-2 min-w-[120px] flex-shrink-0 ${
                        isToday ? 'border-white/30 shadow-md bg-white/15' : 'border-white/15'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1">
                          <div className={`text-xs font-bold ${isToday ? 'text-primary' : 'text-text'}`}>
                            {day.getDate()}
                          </div>
                          <div className="text-[9px] text-lighterText">
                            {dayNames[idx].substring(0, 3)}
                          </div>
                        </div>
                      </div>
                      <div className="space-y-1">
                        {dayActivities.length === 0 ? (
                          <div className="text-[9px] text-lighterText italic">-</div>
                        ) : (
                          dayActivities.slice(0, 2).map((act, i) => {
                            const activityId = act.id || act._id;
                            const isSelected = selectedTraining && (
                              (selectedTraining.id && String(activityId) === String(selectedTraining.id)) ||
                              (selectedTraining._id && String(activityId) === String(selectedTraining._id))
                            );
                            return (
                              <button
                                key={i}
                                onClick={() => handleActivityClick(act)}
                                className={`w-full text-left px-1.5 py-1 rounded border transition-colors text-[9px] ${
                                  isSelected
                                    ? 'bg-white/30 backdrop-blur-md text-text border-white/30 shadow-sm'
                                    : 'bg-white/10 backdrop-blur-sm hover:bg-white/20 text-text border-white/15'
                                }`}
                                title={act.title || act.name || 'Activity'}
                              >
                                <div className="flex items-center gap-1 mb-0.5">
                                  <span className="text-[10px]">{sportBadge(act.sport)}</span>
                                  <span className="truncate font-medium text-[9px]">{act.title || act.name || 'Activity'}</span>
                                </div>
                              </button>
                            );
                          })
                        )}
                        {dayActivities.length > 2 && (
                          <div className="text-[8px] text-lighterText text-center">
                            +{dayActivities.length - 2}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                </div>
              </div>
            </div>
          ) : (
          <div className="flex flex-col gap-2 lg:col-span-1 max-w-[280px]">
            {weekDays.map((day, idx) => {
              const key = getLocalDateString(day);
              const dayActivities = activitiesByDay.get(key) || [];
              const isToday = isSameDay(day, new Date());

              return (
                <div
                  key={idx}
                  className={`bg-white/10 backdrop-blur-md rounded-lg border p-1.5 ${
                    isToday ? 'border-white/30 shadow-md bg-white/15' : 'border-white/15'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5">
                      <div className={`text-sm font-bold ${isToday ? 'text-primary' : 'text-text'}`}>
                        {day.getDate()}
                      </div>
                      <div className="text-[10px] text-lighterText">
                        {dayNames[idx].substring(0, 3)}
                      </div>
                    </div>
                  </div>
                  <div className="space-y-1">
                    {dayActivities.length === 0 ? (
                      <div className="text-[10px] text-lighterText italic">-</div>
                    ) : (
                      dayActivities.slice(0, 2).map((act, i) => {
                        const activityId = act.id || act._id;
                        const isSelected = selectedTraining && (
                          (selectedTraining.id && String(activityId) === String(selectedTraining.id)) ||
                          (selectedTraining._id && String(activityId) === String(selectedTraining._id))
                        );
                        return (
                          <button
                            key={i}
                            onClick={() => handleActivityClick(act)}
                            className={`w-full text-left px-1.5 py-1 rounded border transition-colors ${
                              isSelected
                                ? 'bg-white/30 backdrop-blur-md text-text border-white/30 shadow-sm'
                                : 'bg-white/10 backdrop-blur-sm hover:bg-white/20 text-text border-white/15'
                            }`}
                            title={act.title || act.name || 'Activity'}
                          >
                            <div className="flex items-center justify-between gap-1 mb-0.5">
                              <div className="flex items-center gap-1 flex-1 min-w-0">
                                <span className="text-xs">{sportBadge(act.sport)}</span>
                                <span className="truncate font-medium text-[10px]">{act.title || act.name || 'Activity'}</span>
                              </div>
                              {act.category && (
                                <div className={`text-[9px] px-1 py-0.5 rounded flex-shrink-0 ${categoryColor(act.category)}`}>
                                  {categoryLabel(act.category).substring(0, 4)}
                                </div>
                              )}
                            </div>
                            {act.description && (
                              <div className={`text-[8px] ${isSelected ? 'text-text/70' : 'text-lighterText'} truncate`}>
                                {act.description}
                              </div>
                            )}
                          </button>
                        );
                      })
                    )}
                    {dayActivities.length > 2 && (
                      <div className="text-[9px] text-lighterText text-center">
                        +{dayActivities.length - 2}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          )}
          
          {/* Training Details - Right Side - Much Wider */}
          <AnimatePresence>
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className={`bg-white/10 backdrop-blur-xl rounded-xl border border-white/20 shadow-md p-2 sm:p-3 md:p-4 ${isMobile ? 'w-full mt-3' : 'lg:col-span-5'}`}
            >
              <div className="flex items-center justify-between gap-3 mb-3">
                <div className="flex items-center gap-3 flex-1">
                  {isEditingTitle ? (
                    <div className="flex items-center gap-2 flex-1">
                      <input
                        type="text"
                        value={editingTitle}
                        onChange={(e) => setEditingTitle(e.target.value)}
                        className="flex-1 px-3 py-2 border-2 border-white/30 rounded-lg text-base font-semibold focus:outline-none focus:ring-2 focus:ring-white/30 focus:border-transparent bg-white/10 backdrop-blur-md text-text shadow-sm"
                        autoFocus
                      />
                      <button
                        onClick={async () => {
                          try {
                            setSaving(true);
                            const title = editingTitle.trim();
                            if (trainingDetail.type === 'fit' && trainingDetail._id) {
                              await updateFitTraining(trainingDetail._id, { title });
                              // Reload FIT training detail
                              const detail = await getFitTraining(trainingDetail._id);
                              setTrainingDetail({ ...detail, type: 'fit' });
                            } else if (trainingDetail.type === 'strava' && trainingDetail.id) {
                              await updateStravaActivity(trainingDetail.id, { title });
                              // Reload Strava activity detail
                              const detail = await getStravaActivityDetail(trainingDetail.id);
                              // Convert Strava detail to training format
                              if (detail.detail && detail.streams) {
                                const startDate = new Date(detail.detail.start_date);
                                const timeArray = detail.streams.time?.data || detail.streams.time || [];
                                const wattsArray = detail.streams.watts?.data || detail.streams.watts || [];
                                const heartrateArray = detail.streams.heartrate?.data || detail.streams.heartrate || [];
                                const velocityArray = detail.streams.velocity_smooth?.data || detail.streams.velocity_smooth || [];
                                const cadenceArray = detail.streams.cadence?.data || detail.streams.cadence || [];
                                const distanceArray = detail.streams.distance?.data || detail.streams.distance || [];
                                
                                if (Array.isArray(timeArray)) {
                                  const records = timeArray.map((t, i) => ({
                                    timestamp: new Date(startDate.getTime() + (t * 1000)),
                                    power: wattsArray[i] || null,
                                    heartRate: heartrateArray[i] || null,
                                    speed: velocityArray[i] || null,
                                    cadence: cadenceArray[i] || null,
                                    distance: distanceArray[i] || null
                                  }));
                                  
                                  setTrainingDetail({
                                    ...selectedTraining,
                                    type: 'strava',
                                    records,
                                    laps: detail.laps || [],
                                    totalElapsedTime: detail.detail.elapsed_time || 0,
                                    totalTimerTime: detail.detail.moving_time || detail.detail.elapsed_time || 0,
                                    totalDistance: detail.detail.distance || 0,
                                    avgPower: detail.detail.average_watts || null,
                                    maxPower: detail.detail.max_watts || null,
                                    avgHeartRate: detail.detail.average_heartrate || null,
                                    maxHeartRate: detail.detail.max_heartrate || null,
                                    avgSpeed: detail.detail.average_speed || null,
                                    maxSpeed: detail.detail.max_speed || null,
                                    avgCadence: detail.detail.average_cadence || null,
                                    maxCadence: detail.detail.max_cadence || null,
                                    sport: trainingDetail.sport || detail.detail.type || 'cycling',
                                    title: detail.detail.name || title || '',
                                    category: detail.category || trainingDetail.category || ''
                                  });
                                } else {
                                  setTrainingDetail({ ...selectedTraining, type: 'strava', ...detail });
                                }
                              } else {
                                setTrainingDetail({ ...selectedTraining, type: 'strava', ...detail });
                              }
                            }
                            setIsEditingTitle(false);
                          } catch (error) {
                            console.error('Error saving title:', error);
                            alert('Error saving title');
                          } finally {
                            setSaving(false);
                          }
                        }}
                        disabled={saving}
                        className="p-1.5 bg-white/30 backdrop-blur-md text-text rounded-lg hover:bg-white/40 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm border border-white/20"
                        title="Save title"
                      >
                        <CheckIcon className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          setIsEditingTitle(false);
                          setEditingTitle(trainingDetail?.title || trainingDetail?.name || '');
                        }}
                        className="p-1.5 bg-white/20 backdrop-blur-md text-text rounded-lg hover:bg-white/30 transition-all shadow-sm border border-white/15"
                        title="Cancel"
                      >
                        <XMarkIcon className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 flex-1 group">
                      <h4 
                        className="text-base font-semibold text-text flex-1 cursor-pointer"
                        onClick={() => {
                          setEditingTitle(trainingDetail?.title || trainingDetail?.name || '');
                          setIsEditingTitle(true);
                        }}
                      >
                        {trainingDetail?.title || trainingDetail?.name || selectedTraining?.title || selectedTraining?.name || 'Training Details'}
                      </h4>
                      <button
                        onClick={() => {
                          setEditingTitle(trainingDetail?.title || trainingDetail?.name || '');
                          setIsEditingTitle(true);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1.5 text-lighterText hover:text-text hover:bg-white/20 rounded-lg transition-all"
                        title="Edit title"
                      >
                        <PencilIcon className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                  
                  {/* Category */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {isEditingCategory ? (
                      <>
                        <select
                          value={editingCategory}
                          onChange={(e) => setEditingCategory(e.target.value)}
                          className="px-2 py-1.5 border border-white/20 rounded-lg bg-white/10 backdrop-blur-md text-xs text-text focus:outline-none focus:ring-2 focus:ring-white/30 focus:border-transparent"
                          autoFocus
                        >
                          <option value="">None</option>
                          <option value="endurance">Endurance</option>
                          <option value="tempo">Tempo</option>
                          <option value="threshold">Threshold</option>
                          <option value="vo2max">VO2max</option>
                          <option value="anaerobic">Anaerobic</option>
                          <option value="recovery">Recovery</option>
                        </select>
                        <button
                          onClick={async () => {
                            try {
                              setSaving(true);
                              const category = editingCategory || null;
                              if (trainingDetail.type === 'fit' && trainingDetail._id) {
                                await updateFitTraining(trainingDetail._id, { category });
                                // Reload FIT training detail
                                const detail = await getFitTraining(trainingDetail._id);
                                setTrainingDetail({ ...detail, type: 'fit' });
                              } else if (trainingDetail.type === 'strava' && trainingDetail.id) {
                                await updateStravaActivity(trainingDetail.id, { category });
                                // Reload Strava activity detail
                                const detail = await getStravaActivityDetail(trainingDetail.id);
                                // Convert Strava detail to training format
                                if (detail.detail && detail.streams) {
                                  const startDate = new Date(detail.detail.start_date);
                                  const timeArray = detail.streams.time?.data || detail.streams.time || [];
                                  const wattsArray = detail.streams.watts?.data || detail.streams.watts || [];
                                  const heartrateArray = detail.streams.heartrate?.data || detail.streams.heartrate || [];
                                  const velocityArray = detail.streams.velocity_smooth?.data || detail.streams.velocity_smooth || [];
                                  const cadenceArray = detail.streams.cadence?.data || detail.streams.cadence || [];
                                  const distanceArray = detail.streams.distance?.data || detail.streams.distance || [];
                                  
                                  if (Array.isArray(timeArray)) {
                                    const records = timeArray.map((t, i) => ({
                                      timestamp: new Date(startDate.getTime() + (t * 1000)),
                                      power: wattsArray[i] || null,
                                      heartRate: heartrateArray[i] || null,
                                      speed: velocityArray[i] || null,
                                      cadence: cadenceArray[i] || null,
                                      distance: distanceArray[i] || null
                                    }));
                                    
                                    setTrainingDetail({
                                      ...selectedTraining,
                                      type: 'strava',
                                      records,
                                      laps: detail.laps || [],
                                      totalElapsedTime: detail.detail.elapsed_time || 0,
                                      totalTimerTime: detail.detail.moving_time || detail.detail.elapsed_time || 0,
                                      totalDistance: detail.detail.distance || 0,
                                      avgPower: detail.detail.average_watts || null,
                                      maxPower: detail.detail.max_watts || null,
                                      avgHeartRate: detail.detail.average_heartrate || null,
                                      maxHeartRate: detail.detail.max_heartrate || null,
                                      avgSpeed: detail.detail.average_speed || null,
                                      maxSpeed: detail.detail.max_speed || null,
                                      avgCadence: detail.detail.average_cadence || null,
                                      maxCadence: detail.detail.max_cadence || null,
                                      sport: trainingDetail.sport || detail.detail.type || 'cycling',
                                      title: detail.detail.name || trainingDetail.title || '',
                                      category: detail.category || category || ''
                                    });
                                  } else {
                                    setTrainingDetail({ ...selectedTraining, type: 'strava', ...detail });
                                  }
                                } else {
                                  setTrainingDetail({ ...selectedTraining, type: 'strava', ...detail });
                                }
                              }
                              setIsEditingCategory(false);
                            } catch (error) {
                              console.error('Error saving category:', error);
                              alert('Error saving category');
                            } finally {
                              setSaving(false);
                            }
                          }}
                          disabled={saving}
                          className="p-1.5 bg-white/30 backdrop-blur-md text-text rounded-lg hover:bg-white/40 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm border border-white/20"
                          title="Save category"
                        >
                          <CheckIcon className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            setIsEditingCategory(false);
                            setEditingCategory(trainingDetail?.category || '');
                          }}
                          className="p-1.5 bg-white/20 backdrop-blur-md text-text rounded-lg hover:bg-white/30 transition-all shadow-sm border border-white/15"
                          title="Cancel"
                        >
                          <XMarkIcon className="w-4 h-4" />
                        </button>
                      </>
                    ) : (
                      <div className="flex items-center gap-2 group">
                        <span className={`px-2.5 py-1 rounded-lg text-xs font-medium ${
                          trainingDetail?.category === 'endurance' ? 'bg-blue-100 text-blue-800' :
                          trainingDetail?.category === 'tempo' ? 'bg-green-100 text-green-800' :
                          trainingDetail?.category === 'threshold' ? 'bg-yellow-100 text-yellow-800' :
                          trainingDetail?.category === 'vo2max' ? 'bg-orange-100 text-orange-800' :
                          trainingDetail?.category === 'anaerobic' ? 'bg-red-100 text-red-800' :
                          trainingDetail?.category === 'recovery' ? 'bg-gray-100 text-gray-800' :
                          'bg-gray-100 text-gray-500'
                        }`}>
                          {trainingDetail?.category ? categoryLabel(trainingDetail.category) : 'Category'}
                        </span>
                        <button
                          onClick={() => {
                            setEditingCategory(trainingDetail?.category || '');
                            setIsEditingCategory(true);
                          }}
                          className="opacity-0 group-hover:opacity-100 p-1.5 text-lighterText hover:text-text hover:bg-white/20 rounded-lg transition-all"
                          title="Edit category"
                        >
                          <PencilIcon className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Close button */}
                <button
                  onClick={() => {
                    setSelectedTraining(null);
                    setTrainingDetail(null);
                    setIsEditingTitle(false);
                    setIsEditingCategory(false);
                  }}
                  className="text-lighterText hover:text-text p-1.5 rounded-lg hover:bg-white/20 flex-shrink-0 transition-all"
                  title="Close"
                >
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>

              {loadingDetail ? (
                <div className="flex items-center justify-center py-8 sm:py-12">
                  <div className="animate-spin rounded-full h-6 w-6 sm:h-8 sm:w-8 border-b-2 border-primary"></div>
                </div>
              ) : trainingDetail ? (
                <div className="space-y-3 sm:space-y-4">
                  {/* Training Stats */}
                  <TrainingStats 
                    training={trainingDetail} 
                    user={user}
                    onUpdate={async () => {
                      // Reload detail if needed
                      try {
                        if (trainingDetail.type === 'fit' && trainingDetail._id) {
                          const detail = await getFitTraining(trainingDetail._id);
                          setTrainingDetail({ ...detail, type: 'fit' });
                        } else if (trainingDetail.type === 'strava' && trainingDetail.id) {
                          const detail = await getStravaActivityDetail(trainingDetail.id);
                          // Convert Strava detail to training format
                          if (detail.detail && detail.streams) {
                            const startDate = new Date(detail.detail.start_date);
                            const timeArray = detail.streams.time?.data || detail.streams.time || [];
                            const wattsArray = detail.streams.watts?.data || detail.streams.watts || [];
                            const heartrateArray = detail.streams.heartrate?.data || detail.streams.heartrate || [];
                            const velocityArray = detail.streams.velocity_smooth?.data || detail.streams.velocity_smooth || [];
                            const cadenceArray = detail.streams.cadence?.data || detail.streams.cadence || [];
                            const distanceArray = detail.streams.distance?.data || detail.streams.distance || [];
                            
                            if (Array.isArray(timeArray)) {
                              const records = timeArray.map((t, i) => ({
                                timestamp: new Date(startDate.getTime() + (t * 1000)),
                                power: wattsArray[i] || null,
                                heartRate: heartrateArray[i] || null,
                                speed: velocityArray[i] || null,
                                cadence: cadenceArray[i] || null,
                                distance: distanceArray[i] || null
                              }));
                              
                              setTrainingDetail({
                                ...selectedTraining,
                                type: 'strava',
                                records,
                                laps: detail.laps || [],
                                totalElapsedTime: detail.detail.elapsed_time || 0,
                                totalTimerTime: detail.detail.moving_time || detail.detail.elapsed_time || 0,
                                totalDistance: detail.detail.distance || 0,
                                avgPower: detail.detail.average_watts || null,
                                maxPower: detail.detail.max_watts || null,
                                avgHeartRate: detail.detail.average_heartrate || null,
                                maxHeartRate: detail.detail.max_heartrate || null,
                                avgSpeed: detail.detail.average_speed || null,
                                maxSpeed: detail.detail.max_speed || null,
                                avgCadence: detail.detail.average_cadence || null,
                                maxCadence: detail.detail.max_cadence || null,
                                sport: trainingDetail.sport || detail.detail.type || 'cycling',
                                title: detail.detail.name || trainingDetail.title || '',
                                category: detail.category || trainingDetail.category || ''
                              });
                            } else {
                              setTrainingDetail({ ...selectedTraining, type: 'strava', ...detail });
                            }
                          } else {
                            setTrainingDetail({ ...selectedTraining, type: 'strava', ...detail });
                          }
                        }
                      } catch (error) {
                        console.error('Error reloading training detail:', error);
                      }
                    }}
                  />

                  {/* Chart Toggle */}
                  {(trainingDetail.records && trainingDetail.records.length > 0) || 
                   (trainingDetail.laps && trainingDetail.laps.length > 0) ? (
                    <div className="mt-4 sm:mt-6">
                      <div className="flex items-center gap-1.5 sm:gap-2">
                        <button
                          onClick={() => setChartView('training')}
                          className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg text-[10px] sm:text-xs font-medium transition-all ${
                            chartView === 'training'
                              ? 'bg-white/30 backdrop-blur-md text-text shadow-sm border border-white/30'
                              : 'bg-white/10 backdrop-blur-md text-text hover:bg-white/20 border border-white/15'
                          }`}
                        >
                          Training Chart
                        </button>
                        <button
                          onClick={() => setChartView('interval')}
                          className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg text-[10px] sm:text-xs font-medium transition-all ${
                            chartView === 'interval'
                              ? 'bg-white/30 backdrop-blur-md text-text shadow-sm border border-white/30'
                              : 'bg-white/10 backdrop-blur-md text-text hover:bg-white/20 border border-white/15'
                          }`}
                        >
                          Interval Chart
                        </button>
                      </div>

                      {/* Training Chart */}
                      {chartView === 'training' && trainingDetail.records && trainingDetail.records.length > 0 && (
                        <div className="bg-white/10 backdrop-blur-md rounded-lg sm:rounded-xl p-1 border border-white/20 mt-2 sm:mt-3 overflow-x-auto -mx-2 sm:mx-0 px-2 sm:px-0">
                          <TrainingChart 
                            training={trainingDetail} 
                            userProfile={userProfile}
                            user={user}
                          />
                        </div>
                      )}

                      {/* Interval Chart */}
                      {chartView === 'interval' && trainingDetail.laps && trainingDetail.laps.length > 0 && (
                        <div className="bg-white/10 backdrop-blur-md rounded-lg sm:rounded-xl p-1 border border-white/20 mt-2 sm:mt-3 overflow-x-auto -mx-2 sm:mx-0 px-2 sm:px-0">
                          <IntervalChart 
                            laps={trainingDetail.laps}
                            sport={trainingDetail.sport || 'cycling'}
                            user={user}
                          />
                        </div>
                      )}

                      {chartView === 'training' && (!trainingDetail.records || trainingDetail.records.length === 0) && (
                        <div className="text-lighterText text-center py-8 bg-white/10 backdrop-blur-md rounded-xl p-4 border border-white/20">
                          Training has no records data to display chart
                        </div>
                      )}

                      {chartView === 'interval' && (!trainingDetail.laps || trainingDetail.laps.length === 0) && (
                        <div className="text-lighterText text-center py-8 bg-white/10 backdrop-blur-md rounded-xl p-4 border border-white/20">
                          Training has no intervals (laps) to display chart
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-lighterText text-center py-8 bg-white/10 backdrop-blur-md rounded-xl p-4 border border-white/20">
                      Training has no data to display charts (no records or laps)
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-lighterText text-center py-8">
                  Loading training details...
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      ) : (
        /* Calendar - Mobile: Horizontal scroll, Desktop: Grid Layout */
        isMobile ? (
          <div className="relative">
            {/* Left scroll indicator */}
            {showLeftScrollNoTraining && (
              <button
                onClick={() => {
                  if (scrollContainerNoTrainingRef.current) {
                    scrollContainerNoTrainingRef.current.scrollBy({ left: -200, behavior: 'smooth' });
                  }
                }}
                className="absolute left-0 top-0 bottom-0 w-12 bg-gradient-to-r from-white/80 via-white/40 to-transparent z-10 flex items-center justify-start pl-2"
              >
                <div className="w-6 h-6 rounded-full bg-primary/20 backdrop-blur-sm flex items-center justify-center">
                  <ChevronLeftIcon className="w-4 h-4 text-primary" />
                </div>
              </button>
            )}
            
            {/* Right scroll indicator */}
            {showRightScrollNoTraining && (
              <button
                onClick={() => {
                  if (scrollContainerNoTrainingRef.current) {
                    scrollContainerNoTrainingRef.current.scrollBy({ left: 200, behavior: 'smooth' });
                  }
                }}
                className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-white/80 via-white/40 to-transparent z-10 flex items-center justify-end pr-2"
              >
                <div className="w-6 h-6 rounded-full bg-primary/20 backdrop-blur-sm flex items-center justify-center">
                  <ChevronRightIcon className="w-4 h-4 text-primary" />
                </div>
              </button>
            )}
            
            <div 
              ref={scrollContainerNoTrainingRef}
              className="overflow-x-auto -mx-2 sm:mx-0 px-2 sm:px-0" 
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}
            >
              <div className="flex gap-2 min-w-max">
          {weekDays.map((day, idx) => {
            const key = getLocalDateString(day);
            const dayActivities = activitiesByDay.get(key) || [];
            const isToday = isSameDay(day, new Date());

            return (
              <div
                key={idx}
                    className={`bg-white/10 backdrop-blur-md rounded-lg border p-2 min-w-[140px] flex-shrink-0 ${
                      isToday ? 'border-white/30 shadow-md bg-white/15' : 'border-white/15'
                }`}
              >
                <div className="flex flex-col items-center mb-2">
                      <div className={`text-sm font-bold ${isToday ? 'text-primary' : 'text-text'}`}>
                    {day.getDate()}
                  </div>
                      <div className="text-[10px] text-lighterText">
                        {dayNames[idx].substring(0, 3)}
                      </div>
                    </div>
                    <div className="space-y-1">
                      {dayActivities.length === 0 ? (
                        <div className="text-[9px] text-lighterText italic text-center">-</div>
                      ) : (
                        dayActivities.slice(0, 2).map((act, i) => {
                          const activityId = act.id || act._id;
                          return (
                            <button
                              key={i}
                              onClick={() => handleActivityClick(act)}
                              className="w-full text-left px-1.5 py-1 rounded border transition-colors bg-white/10 backdrop-blur-sm hover:bg-white/20 text-text border-white/15"
                              title={act.title || act.name || 'Activity'}
                            >
                              <div className="flex items-center justify-between gap-1 mb-0.5">
                                <div className="flex items-center gap-1 flex-1 min-w-0">
                                  <span className="text-xs">{sportBadge(act.sport)}</span>
                                  <span className="truncate font-medium text-[9px]">{act.title || act.name || 'Activity'}</span>
                                </div>
                                {act.category && (
                                  <div className={`text-[8px] px-1 py-0.5 rounded flex-shrink-0 ${categoryColor(act.category)}`}>
                                    {categoryLabel(act.category).substring(0, 4)}
                                  </div>
                                )}
                              </div>
                            </button>
                          );
                        })
                      )}
                      {dayActivities.length > 2 && (
                        <div className="text-[8px] text-lighterText text-center">
                          +{dayActivities.length - 2}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-7 gap-2 sm:gap-3">
            {weekDays.map((day, idx) => {
              const key = getLocalDateString(day);
              const dayActivities = activitiesByDay.get(key) || [];
              const isToday = isSameDay(day, new Date());

              return (
                <div
                  key={idx}
                  className={`bg-white/10 backdrop-blur-md rounded-lg border p-2 ${
                    isToday ? 'border-white/30 shadow-md bg-white/15' : 'border-white/15'
                  }`}
                >
                  <div className="flex flex-col items-center mb-2">
                    <div className={`text-base font-bold ${isToday ? 'text-primary' : 'text-text'}`}>
                      {day.getDate()}
                    </div>
                    <div className="text-xs text-lighterText">
                    {dayNames[idx]}
                  </div>
                </div>
                <div className="space-y-1.5">
                  {dayActivities.length === 0 ? (
                      <div className="text-xs text-lighterText italic text-center">-</div>
                  ) : (
                    dayActivities.map((act, i) => {
                      const activityId = act.id || act._id;
                      return (
                        <button
                          key={i}
                          onClick={() => handleActivityClick(act)}
                            className="w-full text-left px-2 py-1.5 rounded border transition-colors bg-white/10 backdrop-blur-sm hover:bg-white/20 text-text border-white/15"
                          title={act.title || act.name || 'Activity'}
                        >
                          <div className="flex items-center justify-between gap-1 mb-0.5">
                            <div className="flex items-center gap-1 flex-1 min-w-0">
                              <span className="text-sm">{sportBadge(act.sport)}</span>
                              <span className="truncate font-medium text-xs">{act.title || act.name || 'Activity'}</span>
                            </div>
                            {act.category && (
                              <div className={`text-[10px] px-1.5 py-0.5 rounded flex-shrink-0 ${categoryColor(act.category)}`}>
                                {categoryLabel(act.category)}
                              </div>
                            )}
                          </div>
                          {act.description && (
                              <div className="text-[9px] text-lighterText truncate">
                              {act.description}
                            </div>
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
        )
      )}
    </div>
  );
};

export default WeeklyCalendar;
