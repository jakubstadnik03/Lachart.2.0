import React, { useMemo, useState, useEffect, useRef } from 'react';
import { 
  ChevronLeftIcon, 
  ChevronRightIcon, 
  ChevronDownIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  MinusIcon,
  BoltIcon,
  FireIcon
} from '@heroicons/react/24/outline';
import api from '../../services/api';
import { formatDistanceForUser } from '../../utils/unitsConverter';

function startOfWeek(date) {
  const d = new Date(date);
  const day = (d.getDay() + 6) % 7; // Monday=0
  d.setDate(d.getDate() - day);
  d.setHours(0,0,0,0);
  return d;
}

function startOfMonth(date) {
  const d = new Date(date);
  d.setDate(1);
  d.setHours(0,0,0,0);
  return d;
}

function addDays(date, n) { const d = new Date(date); d.setDate(d.getDate()+n); return d; }
function isSameDay(a,b){ return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate(); }

// Helper function to get local date string (YYYY-MM-DD) without timezone issues
function getLocalDateString(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Sport icon component with SVG icons
const SportIcon = ({ sport, className = "w-4 h-4" }) => {
  if (!sport) return null;
  const s = String(sport).toLowerCase();
  
  if (s.includes('run')) {
    return (
      <div className={`${className} rounded-full bg-orange-100 p-0.5 flex items-center justify-center`}>
        <img src="/icon/run.svg" alt="Run" className="w-3 h-3" />
      </div>
    );
  }
  if (s.includes('ride') || s.includes('cycle') || s.includes('bike')) {
    return (
      <div className={`${className} rounded-full bg-blue-100 p-0.5 flex items-center justify-center`}>
        <img src="/icon/bike.svg" alt="Bike" className="w-3 h-3" />
      </div>
    );
  }
  if (s.includes('swim')) {
    return (
      <div className={`${className} rounded-full bg-cyan-100 p-0.5 flex items-center justify-center`}>
        <img src="/icon/swim.svg" alt="Swim" className="w-3 h-3" />
      </div>
    );
  }
  if (s.includes('gym') || s.includes('weight') || s.includes('strength')) {
    return (
      <div className={`${className} rounded-full bg-primary/10 p-0.5 flex items-center justify-center`}>
        <BoltIcon className="w-3 h-3 text-primary" />
      </div>
    );
  }
  return (
    <div className={`${className} rounded-full bg-gray-100 p-0.5 flex items-center justify-center`}>
      <BoltIcon className="w-3 h-3 text-gray-600" />
    </div>
  );
};


// Category helper functions
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

function categoryBorderColor(category) {
  const borderColors = {
    endurance: 'border-blue-400',
    tempo: 'border-green-400',
    threshold: 'border-yellow-400',
    vo2max: 'border-orange-400',
    anaerobic: 'border-red-400',
    recovery: 'border-gray-400'
  };
  return borderColors[category] || 'border-gray-300';
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

export default function CalendarView({ activities = [], onSelectActivity, selectedActivityId, initialAnchorDate, user = null, onMonthChange = null }) {
  // Initialize anchorDate from localStorage, initialAnchorDate prop, or today
  const getInitialAnchorDate = () => {
    if (initialAnchorDate) return initialAnchorDate;
    const saved = localStorage.getItem('calendarView_anchorDate');
    if (saved) {
      const parsed = new Date(saved);
      if (!isNaN(parsed.getTime())) return parsed;
    }
    return new Date();
  };

  // Initialize view from localStorage or default to 'month'
  const getInitialView = () => {
    const saved = localStorage.getItem('calendarView_view');
    return (saved === 'week' || saved === 'month') ? saved : 'month';
  };

  const [view, setView] = useState(getInitialView);
  const [anchorDate, setAnchorDate] = useState(getInitialAnchorDate);
  const initialDate = getInitialAnchorDate();
  const lastMonthRef = useRef(`${initialDate.getFullYear()}-${initialDate.getMonth()}`);
  
  // Initialize sportFilter from localStorage or default to 'all'
  const getInitialSportFilter = () => {
    const saved = localStorage.getItem('calendarView_sportFilter');
    return saved || 'all';
  };
  
  const [sportFilter, setSportFilter] = useState(getInitialSportFilter);
  const [expandedDays, setExpandedDays] = useState(new Set());
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  
  // User profile data for TSS calculation
  const [userProfile, setUserProfile] = useState(null);
  
  // Detect mobile
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  
  
  // Load user profile for FTP and threshold pace
  useEffect(() => {
    const loadUserProfile = async () => {
      try {
        const response = await api.get('/user/profile');
        setUserProfile(response.data);
      } catch (error) {
        console.error('Error loading user profile:', error);
      }
    };
    loadUserProfile();
  }, []);
  
  // Save sportFilter to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('calendarView_sportFilter', sportFilter);
  }, [sportFilter]);
  
  // Save anchorDate to localStorage when it changes (but not when initialAnchorDate prop changes)
  // Also detect month change and notify parent
  useEffect(() => {
    if (!initialAnchorDate) {
      // Only save if we're not being controlled by initialAnchorDate prop
      localStorage.setItem('calendarView_anchorDate', anchorDate.toISOString());
    }
    
    // Check if month changed and notify parent
    const currentMonth = `${anchorDate.getFullYear()}-${anchorDate.getMonth()}`;
    if (lastMonthRef.current !== null && lastMonthRef.current !== currentMonth && onMonthChange) {
      console.log('Month changed, calling onMonthChange:', { year: anchorDate.getFullYear(), month: anchorDate.getMonth() });
      onMonthChange({ year: anchorDate.getFullYear(), month: anchorDate.getMonth() });
    }
    lastMonthRef.current = currentMonth;
  }, [anchorDate, initialAnchorDate, onMonthChange]);

  // Save view to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('calendarView_view', view);
  }, [view]);
  
  // Update anchorDate when initialAnchorDate changes (e.g., when navigating to a specific training)
  useEffect(() => {
    if (initialAnchorDate) {
      setAnchorDate(initialAnchorDate);
      // Also save to localStorage when navigating to specific training
      localStorage.setItem('calendarView_anchorDate', initialAnchorDate.toISOString());
    }
  }, [initialAnchorDate]);
  
  // Auto-expand the day containing the selected activity
  useEffect(() => {
    if (selectedActivityId && activities.length > 0) {
      const selectedActivity = activities.find(a => {
        const id = a.id || a._id;
        return String(id) === String(selectedActivityId);
      });
      if (selectedActivity) {
        const activityDate = new Date(selectedActivity.date || selectedActivity.timestamp || selectedActivity.startDate || Date.now());
        const dateKey = getLocalDateString(activityDate);
        setExpandedDays(prev => new Set([...prev, dateKey]));
      }
    }
  }, [selectedActivityId, activities]);

  const uniqueSports = useMemo(() => {
    const set = new Set();
    activities.forEach(a => { if (a?.sport) set.add(String(a.sport)); });
    return ['all', ...Array.from(set).sort()];
  }, [activities]);

  const filteredActivities = useMemo(() => {
    if (sportFilter === 'all') return activities;
    return activities.filter(a => String(a.sport) === sportFilter);
  }, [activities, sportFilter]);

  const activitiesByDay = useMemo(() => {
    const map = new Map();
    filteredActivities.forEach(act => {
      const dateValue = act.date || act.timestamp || act.startDate || act.start_time;
      if (!dateValue) {
        console.warn('Activity missing date:', act);
        return;
      }
      const d = new Date(dateValue);
      if (isNaN(d.getTime())) {
        console.warn('Invalid date for activity:', { act, dateValue, parsed: d });
        return;
      }
      // Use local date string instead of ISO to avoid timezone offset issues
      const key = getLocalDateString(d);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(act);
    });
    return map;
  }, [filteredActivities]);

  const days = useMemo(() => {
    if (view === 'week' && !isMobile) {
      // Desktop week view
      const start = startOfWeek(anchorDate);
      return Array.from({ length: 7 }).map((_, i) => addDays(start, i));
    }
    // Mobile: always show month, Desktop: show month or week based on view
    const start = startOfWeek(startOfMonth(anchorDate));
    return Array.from({ length: 42 }).map((_, i) => addDays(start, i));
  }, [view, anchorDate, isMobile]);

  const prev = () => {
    if (isMobile && view === 'week') {
      setAnchorDate(d => addDays(d, -7));
    } else if (view === 'week' && !isMobile) {
      setAnchorDate(d => addDays(d, -7));
    } else {
      setAnchorDate(d => new Date(d.getFullYear(), d.getMonth()-1, 1));
    }
  };
  const next = () => {
    if (isMobile && view === 'week') {
      setAnchorDate(d => addDays(d, 7));
    } else if (view === 'week' && !isMobile) {
      setAnchorDate(d => addDays(d, 7));
    } else {
      setAnchorDate(d => new Date(d.getFullYear(), d.getMonth()+1, 1));
    }
  };
  const today = () => setAnchorDate(new Date());
  
  const [selectedDay, setSelectedDay] = useState(null); // YYYY-MM-DD key of selected day on mobile

  // Handle day click on mobile - select day and show activities below
  const handleDayClick = (dayDate) => {
    if (isMobile) {
      const key = getLocalDateString(dayDate);
      setSelectedDay(prev => prev === key ? null : key); // toggle
    }
  };

  // Weekly summary (last 4 weeks)
  // Weekly summary only for weeks currently visible in the calendar grid
  // In week view, show only the current week
  const weeklySummary = useMemo(() => {
    if (!days || days.length === 0) return [];

    // In week view, only show the current week
    let visibleWeekKeys;
    if (isMobile && view === 'week') {
      // Only the current week
      const currentWeekStart = startOfWeek(anchorDate);
      visibleWeekKeys = new Set([currentWeekStart.toISOString().slice(0,10)]);
    } else {
    // Which week starts are visible in the current grid
      visibleWeekKeys = new Set(
      days.map(d => startOfWeek(d).toISOString().slice(0,10))
    );
    }

    // Get FTP and threshold pace from user profile
    const ftp = userProfile?.powerZones?.cycling?.lt2 || 
                userProfile?.powerZones?.cycling?.zone5?.min || 
                250; // Default estimate
    const thresholdPace = userProfile?.runningZones?.lt2 || 
                          userProfile?.powerZones?.running?.lt2 || 
                          null;
    const thresholdSwimPace = userProfile?.powerZones?.swimming?.lt2 || null; // Threshold pace in seconds per 100m

    const summary = filteredActivities.reduce((acc, act) => {
      const actDate = act.date ? new Date(act.date) : null;
      if (!actDate || isNaN(actDate.getTime())) return acc;
      const weekStart = startOfWeek(actDate);
      const key = weekStart.toISOString().slice(0,10);
      if (!visibleWeekKeys.has(key)) return acc; // skip weeks not visible now

      if (!acc[key]) {
        acc[key] = {
          weekStart,
          totalSeconds: 0,
          runSeconds: 0,
          bikeSeconds: 0,
          swimSeconds: 0,
          distanceRun: 0,
          distanceBike: 0,
          distanceSwim: 0,
          tssRun: 0,
          tssBike: 0,
          tssSwim: 0,
          totalTSS: 0,
          hasTss: false
        };
      }

      const entry = acc[key];
      const sport = (act.sport || '').toLowerCase();
      const duration = Number(act.totalTimerTime || act.moving_time || act.movingTime || act.totalElapsedTime || act.elapsedTime || act.duration || 0);
      const distance = Number(act.distance || 0);
      
      // Calculate TSS for this activity
      let tssVal = Number(act.tss || act.TSS || act.totalTSS || 0);
      
      // If TSS is not available, calculate it based on sport type
      if ((!tssVal || tssVal === 0) && duration > 0) {
        if (sport.includes('ride') || sport.includes('cycle') || sport.includes('bike')) {
          // Bike TSS: TSS = (seconds * NP^2) / (FTP^2 * 3600) * 100
          const avgPower = Number(act.avgPower || 0);
          if (avgPower > 0 && ftp > 0) {
            const np = avgPower; // Using avgPower as NP approximation
            tssVal = Math.round((duration * Math.pow(np, 2)) / (Math.pow(ftp, 2) * 3600) * 100);
          }
        } else if (sport.includes('run')) {
          // Running TSS: TSS = (seconds * (referencePace / avgPace)^2) / 3600 * 100
          const avgSpeed = Number(act.avgSpeed || 0); // m/s
          if (avgSpeed > 0) {
            const avgPaceSeconds = Math.round(1000 / avgSpeed); // seconds per km
            let referencePace = thresholdPace;
            // If no threshold pace from profile, use average pace as reference (intensity = 1.0)
            if (!referencePace || referencePace <= 0) {
              referencePace = avgPaceSeconds;
            }
            // Faster pace (lower seconds) = higher intensity = higher TSS
            const intensityRatio = referencePace / avgPaceSeconds; // > 1 if faster than reference
            tssVal = Math.round((duration * Math.pow(intensityRatio, 2)) / 3600 * 100);
          }
        } else if (sport.includes('swim')) {
          // Swimming TSS: TSS = (seconds * (referencePace / avgPace)^2) / 3600 * 100
          // Swimming pace is per 100m (not per km)
          const avgSpeed = Number(act.avgSpeed || 0); // m/s
          if (avgSpeed > 0) {
            const avgPaceSeconds = Math.round(100 / avgSpeed); // seconds per 100m
            let referencePace = thresholdSwimPace;
            // If no threshold pace from profile, use average pace as reference (intensity = 1.0)
            if (!referencePace || referencePace <= 0) {
              referencePace = avgPaceSeconds;
            }
            // Faster pace (lower seconds) = higher intensity = higher TSS
            const intensityRatio = referencePace / avgPaceSeconds; // > 1 if faster than reference
            tssVal = Math.round((duration * Math.pow(intensityRatio, 2)) / 3600 * 100);
          }
        }
      }

      entry.totalSeconds += duration;
      if (sport.includes('run')) {
        entry.runSeconds += duration;
        entry.distanceRun += distance;
        if (!isNaN(tssVal) && tssVal > 0) {
          entry.tssRun += tssVal;
          entry.totalTSS += tssVal;
        }
      } else if (sport.includes('swim')) {
        entry.swimSeconds += duration;
        entry.distanceSwim += distance;
        if (!isNaN(tssVal) && tssVal > 0) {
          entry.tssSwim += tssVal;
          entry.totalTSS += tssVal;
        }
      } else if (sport.includes('ride') || sport.includes('cycle') || sport.includes('bike')) {
        entry.bikeSeconds += duration;
        entry.distanceBike += distance;
        if (!isNaN(tssVal) && tssVal > 0) {
          entry.tssBike += tssVal;
          entry.totalTSS += tssVal;
        }
      }
      if (!isNaN(tssVal) && tssVal > 0) {
        entry.hasTss = true;
      }
      return acc;
    }, {});

    const sorted = Object.values(summary)
      .sort((a, b) => b.weekStart - a.weekStart);
    
    // Add comparison with previous week
    return sorted.map((week, index) => {
      const prevWeek = index < sorted.length - 1 ? sorted[index + 1] : null;
      let volumeChange = null; // 'up', 'down', 'same', or null
      
      if (prevWeek) {
        if (week.totalSeconds > prevWeek.totalSeconds) {
          volumeChange = 'up';
        } else if (week.totalSeconds < prevWeek.totalSeconds) {
          volumeChange = 'down';
        } else {
          volumeChange = 'same';
        }
      }
      
      return {
        ...week,
        volumeChange,
        prevWeekTotalSeconds: prevWeek?.totalSeconds || null
      };
    });
  }, [filteredActivities, days, userProfile, isMobile, view, anchorDate]);

  const formatWeekRange = (weekStart) => {
    const end = new Date(weekStart);
    end.setDate(end.getDate() + 6);
    const options = { month: 'short', day: '2-digit' };
    return `${weekStart.toLocaleDateString(undefined, options)} – ${end.toLocaleDateString(undefined, options)}`;
  };

  const formatHours = (seconds) => {
    if (!seconds || isNaN(seconds)) return '0h';
    return `${(seconds / 3600).toFixed(1)}h`;
  };

  const formatKm = (meters) => {
    if (!meters || isNaN(meters)) return '0 km';
    if (user) {
      return formatDistanceForUser(meters, user);
    }
    // Fallback to metric
    return `${(meters / 1000).toFixed(1)} km`;
  };

  return (
    <div className={`${isMobile ? 'bg-white rounded-xl border border-gray-100 shadow-sm p-3 mb-3' : 'bg-white/10 backdrop-blur-xl rounded-2xl md:rounded-3xl border border-white/20 shadow-md p-3 md:p-4 lg:p-4 mb-4 md:mb-6'} overflow-hidden`}>
      {/* Header */}
      {isMobile ? (
        <div className="flex items-center justify-between mb-2 px-1">
          <button onClick={prev} className="p-1.5 rounded-full active:bg-gray-100 transition-colors touch-manipulation" style={{ WebkitTapHighlightColor: 'transparent' }}>
            <ChevronLeftIcon className="w-5 h-5 text-gray-600" />
          </button>
          <button onClick={today} className="text-sm font-bold text-gray-900 uppercase tracking-wide active:text-primary transition-colors touch-manipulation" style={{ WebkitTapHighlightColor: 'transparent' }}>
            {anchorDate.toLocaleString(undefined, { month: 'long', year: 'numeric' })}
          </button>
          <button onClick={next} className="p-1.5 rounded-full active:bg-gray-100 transition-colors touch-manipulation" style={{ WebkitTapHighlightColor: 'transparent' }}>
            <ChevronRightIcon className="w-5 h-5 text-gray-600" />
          </button>
        </div>
      ) : (
      <div className="flex flex-col sm:flex-row flex-wrap items-start sm:items-center justify-between gap-2 md:gap-3 mb-3 md:mb-4">
        <div className="flex items-center gap-1.5 md:gap-2">
          <button 
            onClick={prev} 
            className="px-2 md:px-3 py-1 md:py-1.5 rounded-lg md:rounded-xl border border-white/20 bg-white/10 backdrop-blur-md hover:bg-white/20 text-gray-700 shadow-sm transition-colors flex items-center justify-center"
            aria-label="Previous"
          >
            <ChevronLeftIcon className="w-4 h-4 md:w-5 md:h-5" />
          </button>
          <button 
            onClick={today} 
            className="px-2 md:px-3 py-1 md:py-1.5 rounded-lg md:rounded-xl border border-white/20 bg-white/10 backdrop-blur-md hover:bg-white/20 text-gray-700 shadow-sm transition-colors text-xs md:text-sm"
          >
            Today
          </button>
          <button 
            onClick={next} 
            className="px-2 md:px-3 py-1 md:py-1.5 rounded-lg md:rounded-xl border border-white/20 bg-white/10 backdrop-blur-md hover:bg-white/20 text-gray-700 shadow-sm transition-colors flex items-center justify-center"
            aria-label="Next"
          >
            <ChevronRightIcon className="w-4 h-4 md:w-5 md:h-5" />
          </button>
        </div>
        <div className="text-sm md:text-base lg:text-lg font-semibold text-gray-900">
          {anchorDate.toLocaleString(undefined, { month: 'long', year: 'numeric' })}
        </div>
        <div className="flex items-center gap-1.5 md:gap-2">
          <div className="relative">
            <select 
              value={sportFilter} 
              onChange={(e) => setSportFilter(e.target.value)} 
              className="appearance-none pr-6 md:pr-8 pl-2 md:pl-3 py-1 md:py-1.5 text-xs md:text-sm border border-white/20 bg-white/10 backdrop-blur-md hover:bg-white/20 rounded-lg md:rounded-xl text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary transition-all"
            >
              {uniqueSports.map(s => (
                <option key={s} value={s}>{s === 'all' ? 'All sports' : s}</option>
              ))}
            </select>
            <ChevronDownIcon className="pointer-events-none absolute inset-y-0 right-1 md:right-2 flex items-center text-gray-400 w-4 h-4 md:w-5 md:h-5" />
          </div>
          <button 
            onClick={() => setView('week')} 
            className={`px-2 md:px-3 py-1 md:py-1.5 rounded-lg md:rounded-xl border border-white/20 shadow-sm transition-colors text-xs md:text-sm ${view==='week'?'bg-primary text-white hover:bg-primary-dark':'bg-white/10 backdrop-blur-md hover:bg-white/20 text-gray-700'}`}
          >
            Week
          </button>
          <button 
            onClick={() => setView('month')} 
            className={`px-2 md:px-3 py-1 md:py-1.5 rounded-lg md:rounded-xl border border-white/20 shadow-sm transition-colors text-xs md:text-sm ${view==='month'?'bg-primary text-white hover:bg-primary-dark':'bg-white/10 backdrop-blur-md hover:bg-white/20 text-gray-700'}`}
          >
            Month
          </button>
        </div>
      </div>
      )}

      {/* Mobile: Strava-like compact month grid */}
      {isMobile ? (
        <div>
          {/* Compact month grid */}
          <div className="grid grid-cols-7 gap-0">
            {/* Day name headers */}
            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
              <div key={i} className="text-center text-[10px] font-semibold text-gray-400 py-1">{d}</div>
            ))}
            {/* Day cells */}
            {days.map((dayDate, dayIdx) => {
              const key = getLocalDateString(dayDate);
              const isCurrentMonth = dayDate.getMonth() === anchorDate.getMonth();
              const acts = activitiesByDay.get(key) || [];
              const isToday = isSameDay(dayDate, new Date());
              const isSelected = selectedDay === key;

              const sportDots = acts.slice(0, 4).map(a => {
                const s = (a.sport || '').toLowerCase();
                if (s.includes('run')) return '#f97316';
                if (s.includes('ride') || s.includes('cycle') || s.includes('bike')) return '#3b82f6';
                if (s.includes('swim')) return '#06b6d4';
                if (s.includes('strength') || s.includes('gym') || s.includes('weight')) return '#8b5cf6';
                return '#9ca3af';
              });

              return (
                <button
                  key={dayIdx}
                  onClick={() => {
                    handleDayClick(dayDate);
                    if (acts.length === 1 && onSelectActivity) {
                      onSelectActivity(acts[0]);
                    }
                  }}
                  className={`flex flex-col items-center py-1.5 touch-manipulation transition-colors relative ${
                    !isCurrentMonth ? 'opacity-30' : ''
                  } ${isSelected ? 'bg-primary/10 rounded-lg' : ''}`}
                  style={{ WebkitTapHighlightColor: 'transparent', minHeight: '44px' }}
                >
                  <span className={`text-xs font-medium leading-none ${
                    isToday
                      ? 'bg-primary text-white w-6 h-6 rounded-full flex items-center justify-center font-bold'
                      : isSelected
                        ? 'text-primary font-bold'
                        : 'text-gray-800'
                  }`}>
                    {dayDate.getDate()}
                  </span>
                  {/* Activity dots */}
                  {sportDots.length > 0 && (
                    <div className="flex items-center gap-[3px] mt-1">
                      {sportDots.map((color, i) => (
                        <div key={i} className="w-[5px] h-[5px] rounded-full" style={{ backgroundColor: color }} />
                      ))}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Selected day activities - show below calendar */}
          {selectedDay && (() => {
            const dayActs = activitiesByDay.get(selectedDay) || [];
            if (dayActs.length === 0) return null;
            const dayDate = new Date(selectedDay + 'T12:00:00');
            const dayLabel = dayDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

            return (
              <div className="mt-3 space-y-2">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-1">{dayLabel}</div>
                {dayActs.map((a, i) => {
                  const activityId = a.id || a._id;
                  const isActSelected = selectedActivityId && String(activityId) === String(selectedActivityId);
                  const title = a.title || a.name || a.originalFileName || 'Activity';
                  const duration = Number(a.totalTimerTime || a.moving_time || a.movingTime || a.totalElapsedTime || a.elapsedTime || a.duration || 0);
                  const distance = Number(a.distance || 0);
                  const durationStr = duration > 0
                    ? `${Math.floor(duration / 3600)}:${String(Math.floor((duration % 3600) / 60)).padStart(2, '0')}:${String(Math.floor(duration % 60)).padStart(2, '0')}`
                    : '';
                  const distanceStr = distance > 0 ? formatKm(distance) : '';
                  const tss = Number(a.tss || a.TSS || a.totalTSS || 0);

                  return (
                    <button
                      key={i}
                      onClick={() => onSelectActivity && onSelectActivity(a)}
                      className={`w-full text-left rounded-xl border p-3 transition-all touch-manipulation ${
                        isActSelected
                          ? 'border-primary bg-primary/5 shadow-md ring-1 ring-primary/20'
                          : 'border-gray-200 bg-white shadow-sm active:bg-gray-50'
                      }`}
                      style={{ WebkitTapHighlightColor: 'transparent' }}
                    >
                      <div className="flex items-center gap-3">
                        <SportIcon sport={a.sport} className="w-8 h-8" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold text-gray-900 truncate">{title}</div>
                          <div className="flex items-center gap-2 mt-0.5">
                            {durationStr && <span className="text-xs text-gray-500">{durationStr}</span>}
                            {distanceStr && <><span className="text-xs text-gray-300">•</span><span className="text-xs text-gray-500">{distanceStr}</span></>}
                            {tss > 0 && <><span className="text-xs text-gray-300">•</span><span className="text-xs text-gray-500">{Math.round(tss)} TSS</span></>}
                          </div>
                        </div>
                        <ChevronRightIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      </div>
                      {a.category && (
                        <div className={`mt-2 inline-block text-[10px] px-2 py-0.5 rounded-full border ${categoryColor(a.category)}`}>
                          {categoryLabel(a.category)}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })()}
        </div>
      ) : (
        /* Desktop: Original grid layout */
        <div className={`grid gap-px bg-white/10 rounded-xl overflow-hidden`} style={{ gridTemplateColumns: view==='week' ? 'repeat(7, 1fr) 1fr' : 'repeat(7, 1fr) 1fr' }}> 
        {['Mon','Tue','Wed','Thu','Fri','Sat','Sun', 'Summary'].map((d) => (
          <div key={d} className="bg-white/10 backdrop-blur-md text-xs md:text-sm font-medium p-1 md:p-3 text-center text-gray-700">{d}</div>
        ))}
        {(() => {
          // Group days into weeks
          const weeks = [];
          for (let i = 0; i < days.length; i += 7) {
            weeks.push(days.slice(i, i + 7));
          }
          
          return weeks.flatMap((weekDays, weekIdx) => {
            const weekStart = startOfWeek(weekDays[0]);
            const weekKey = weekStart.toISOString().slice(0, 10);
            const weekSummary = weeklySummary.find(w => w.weekStart.toISOString().slice(0, 10) === weekKey);
            
            return [
              // Week days
              ...weekDays.map((dayDate, dayIdx) => {
                const key = getLocalDateString(dayDate);
                const isCurrentMonth = dayDate.getMonth() === anchorDate.getMonth();
                const acts = activitiesByDay.get(key) || [];
                const isToday = isSameDay(dayDate, new Date());
                const isExpanded = expandedDays.has(key);
                const hasOverflow = acts.length > 3;
                const visibleActs = isExpanded
                  ? acts
                  : (hasOverflow ? acts.slice(0, 2) : acts.slice(0, 3));
                const remainingCount = hasOverflow ? (acts.length - 2) : 0;
                
                const toggleExpand = (e) => {
                  e.stopPropagation();
                  setExpandedDays(prev => {
                    const newSet = new Set(prev);
                    if (newSet.has(key)) {
                      newSet.delete(key);
                    } else {
                      newSet.add(key);
                    }
                    return newSet;
                  });
                };
                
                return (
                  <div key={`day-${weekIdx}-${dayIdx}`} className={`bg-white/10 backdrop-blur-md p-1 md:p-2.5 min-h-[80px] md:min-h-[90px] transition-all ${isCurrentMonth ? '' : 'opacity-40'} ${isToday ? 'ring-2 ring-primary/30 ring-offset-1 bg-gradient-to-br from-primary/5 to-primary/10' : 'hover:bg-white/20'} rounded-lg`} style={{ width: '100%', maxWidth: '100%', overflow: 'hidden' }}>
                    <div className={`text-xs md:text-sm font-semibold mb-1.5 ${isToday ? 'text-primary font-bold' : 'text-gray-700'}`}>
                      {dayDate.getDate()}
                    </div>
                    <div className="space-y-1 w-full" style={{ maxWidth: '100%', overflow: 'hidden' }}>
                      {visibleActs.map((a, i) => {
                        const activityId = a.id || a._id;
                        const isSelected = selectedActivityId && String(activityId) === String(selectedActivityId);
                        const activityTitle = a.title || a.name || a.originalFileName || 'Activity';
                        return (
                          <button 
                            key={i} 
                            onClick={() => onSelectActivity && onSelectActivity(a)} 
                            className={`w-full max-w-full text-left text-[10px] md:text-[11px] px-2 md:px-2.5 py-1.5 rounded-lg border transition-all flex items-center gap-2 ${
                              isSelected 
                                ? `bg-gradient-to-r from-primary to-primary-dark text-white shadow-md hover:shadow-lg ${a.category ? categoryBorderColor(a.category) : 'border-primary'} ring-2 ring-primary/20` 
                                : `bg-white hover:bg-gray-50 text-gray-800 shadow-sm hover:shadow-md ${a.category ? categoryBorderColor(a.category) : 'border-gray-200'} ${a.category ? 'hover:border-opacity-70' : 'hover:border-primary/30'}`
                            }`}
                            style={{ minWidth: 0, overflow: 'hidden' }}
                            title={activityTitle}
                          >
                            <SportIcon sport={a.sport} className="w-3.5 h-3.5 flex-shrink-0" />
                            <span className="truncate min-w-0 flex-1 font-medium" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{activityTitle}</span>
                            {a.category && (
                              <div className={`text-[8px] px-1 py-0.5 rounded flex-shrink-0 ${categoryColor(a.category)}`}>
                                {categoryLabel(a.category).substring(0, 4)}
                              </div>
                            )}
                          </button>
                        );
                      })}
                      {hasOverflow && (
                        <button
                          onClick={toggleExpand}
                          className="w-full text-left text-[10px] md:text-[11px] px-2 md:px-2.5 py-1.5 rounded-lg bg-gray-50 hover:bg-gray-100 text-gray-700 border border-gray-200 shadow-sm transition-all font-medium flex items-center gap-1.5"
                        >
                          {isExpanded ? (
                            <>
                              <ChevronDownIcon className="w-3 h-3 flex-shrink-0 text-gray-500" />
                              <span className="text-gray-600">Show less</span>
                            </>
                          ) : (
                            <>
                              <span className="text-primary font-bold">+</span>
                              <span className="text-gray-600">{remainingCount} more</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                );
              }),
              // Week summary column - smaller and more compact
              weekSummary ? (
                <div key={`summary-${weekIdx}`} className="bg-white/10 backdrop-blur-md p-1 border-l-4 border-primary/30 min-h-[80px] md:min-h-[90px] min-w-[160px] max-w-[180px] rounded-r-lg">
                  <div className="mb-1.5 pb-1.5 border-b border-gray-300/30">
                    <div className="text-xs font-bold text-gray-900 mb-1">
                      {formatWeekRange(weekSummary.weekStart)}
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <div className="flex items-center gap-1 px-1.5 py-0.5 bg-primary/10 rounded">
                        <span className="text-xs font-semibold text-primary">
                          {formatHours(weekSummary.totalSeconds)}
                      </span>
                      </div>
                      {weekSummary.totalTSS > 0 && (
                        <div className="flex items-center gap-1 px-1.5 py-0.5 bg-primary/10 rounded">
                          <FireIcon className="w-3.5 h-3.5 text-primary" />
                          <span className="text-xs font-bold text-primary">
                            {Math.round(weekSummary.totalTSS)} TSS
                        </span>
                        </div>
                      )}
                      {weekSummary.volumeChange && (
                        <span className="flex items-center">
                          {weekSummary.volumeChange === 'up' && (
                            <ArrowUpIcon className="w-3.5 h-3.5 text-green-600" />
                          )}
                          {weekSummary.volumeChange === 'down' && (
                            <ArrowDownIcon className="w-3.5 h-3.5 text-red-600" />
                          )}
                          {weekSummary.volumeChange === 'same' && (
                            <MinusIcon className="w-3.5 h-3.5 text-gray-400 opacity-50" />
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-xs flex-wrap">
                    {(weekSummary.distanceRun > 0 || weekSummary.runSeconds > 0) && (
                      <div className="flex items-center gap-1">
                        <img src="/icon/run.svg" alt="Run" className="w-4 h-4" />
                        <span className="text-xs font-semibold text-gray-700">{formatKm(weekSummary.distanceRun)}</span>
                        <span className="text-xs text-gray-500">•</span>
                        <span className="text-xs font-semibold text-gray-700">{formatHours(weekSummary.runSeconds)}</span>
                          {weekSummary.tssRun > 0 && (
                          <>
                            <span className="text-xs text-gray-500">•</span>
                            <FireIcon className="w-3.5 h-3.5 text-primary" />
                            <span className="text-xs font-bold text-primary">{Math.round(weekSummary.tssRun)} TSS</span>
                          </>
                        )}
                      </div>
                    )}
                    {(weekSummary.distanceBike > 0 || weekSummary.bikeSeconds > 0) && (
                      <div className="flex items-center gap-1.5">
                        <img src="/icon/bike.svg" alt="Bike" className="w-4 h-4" />
                        <span className="text-xs font-semibold text-gray-700">{formatKm(weekSummary.distanceBike)}</span>
                        <span className="text-xs text-gray-500">•</span>
                        <span className="text-xs font-semibold text-gray-700">{formatHours(weekSummary.bikeSeconds)}</span>
                          {weekSummary.tssBike > 0 && (
                          <>
                            <span className="text-xs text-gray-500">•</span>
                            <FireIcon className="w-3.5 h-3.5 text-primary" />
                            <span className="text-xs font-bold text-primary">{Math.round(weekSummary.tssBike)} TSS</span>
                          </>
                        )}
                      </div>
                    )}
                    {(weekSummary.distanceSwim > 0 || weekSummary.swimSeconds > 0) && (
                      <div className="flex items-center gap-1.5">
                        <img src="/icon/swim.svg" alt="Swim" className="w-4 h-4" />
                        <span className="text-xs font-semibold text-gray-700">{formatKm(weekSummary.distanceSwim)}</span>
                        <span className="text-xs text-gray-500">•</span>
                        <span className="text-xs font-semibold text-gray-700">{formatHours(weekSummary.swimSeconds)}</span>
                          {weekSummary.tssSwim > 0 && (
                          <>
                            <span className="text-xs text-gray-500">•</span>
                            <FireIcon className="w-3.5 h-3.5 text-primary" />
                            <span className="text-xs font-bold text-primary">{Math.round(weekSummary.tssSwim)} TSS</span>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div key={`summary-empty-${weekIdx}`} className="bg-white/10 backdrop-blur-md p-1 min-h-[80px] md:min-h-[90px] min-w-[160px]"></div>
              )
            ].filter(Boolean);
          });
        })()}
      </div>
      )}
    </div>
  );
}
