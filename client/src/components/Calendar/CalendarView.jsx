import React, { useMemo, useState, useEffect, useRef } from 'react';
import { 
  ChevronLeftIcon, 
  ChevronRightIcon, 
  ChevronDownIcon,
  ChevronUpIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  MinusIcon
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

function sportBadge(sport) {
  if (!sport) return '';
  const s = String(sport).toLowerCase();
  if (s.includes('run')) return '🏃‍♂️';
  if (s.includes('ride') || s.includes('cycle') || s.includes('bike')) return '🚴‍♂️';
  if (s.includes('swim')) return '🏊‍♂️';
  if (s.includes('ski')) return '🎿';
  if (s.includes('hike')) return '🥾';
  return '🏋️';
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
  const [expandedDays, setExpandedDays] = useState(new Set()); // Track which days are expanded
  const [expandedSummary, setExpandedSummary] = useState(new Set()); // Track which week summaries are expanded
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [hoveredActivity, setHoveredActivity] = useState(null); // Track hovered activity for tooltip
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 }); // Tooltip position
  const [showLeftScroll, setShowLeftScroll] = useState(false);
  const [showRightScroll, setShowRightScroll] = useState(true);
  const scrollContainerRef = useRef(null);
  
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

  // Check scroll position for mobile scroll indicators
  useEffect(() => {
    if (!isMobile || !scrollContainerRef.current || view !== 'week') return;
    
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
  }, [isMobile, view, anchorDate]);
  
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
    console.log('activitiesByDay map size:', map.size, 'keys:', Array.from(map.keys()).slice(0, 10));
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
  
  // Handle day click on mobile - switch to week view
  const handleDayClick = (dayDate) => {
    if (isMobile) {
      setView('week');
      setAnchorDate(dayDate);
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
      const duration = Number(act.totalElapsedTime || act.elapsedTime || act.movingTime || act.duration || 0);
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
    <div className={`${isMobile ? 'bg-white' : 'bg-white/10 backdrop-blur-xl'} ${isMobile ? 'rounded-lg' : 'rounded-2xl md:rounded-3xl'} ${isMobile ? 'border border-gray-200' : 'border border-white/20'} shadow-md ${isMobile ? 'p-2' : 'p-3 md:p-4 lg:p-6'} ${isMobile ? 'mb-2' : 'mb-4 md:mb-6'} overflow-hidden`}>
      <div className="flex flex-col sm:flex-row flex-wrap items-start sm:items-center justify-between gap-2 md:gap-3 mb-3 md:mb-4">
        <div className="flex items-center gap-1.5 md:gap-2">
          <button 
            onClick={prev} 
            className={`px-2 md:px-3 py-1 md:py-1.5 rounded-lg md:rounded-xl ${isMobile ? 'border border-gray-300 bg-white hover:bg-gray-50' : 'border border-white/20 bg-white/10 backdrop-blur-md hover:bg-white/20'} text-gray-700 shadow-sm transition-colors flex items-center justify-center`}
            aria-label="Previous"
          >
            <ChevronLeftIcon className="w-4 h-4 md:w-5 md:h-5" />
          </button>
          <button 
            onClick={today} 
            className={`px-2 md:px-3 py-1 md:py-1.5 rounded-lg md:rounded-xl ${isMobile ? 'border border-gray-300 bg-white hover:bg-gray-50' : 'border border-white/20 bg-white/10 backdrop-blur-md hover:bg-white/20'} text-gray-700 shadow-sm transition-colors text-xs md:text-sm`}
          >
            Today
          </button>
          <button 
            onClick={next} 
            className={`px-2 md:px-3 py-1 md:py-1.5 rounded-lg md:rounded-xl ${isMobile ? 'border border-gray-300 bg-white hover:bg-gray-50' : 'border border-white/20 bg-white/10 backdrop-blur-md hover:bg-white/20'} text-gray-700 shadow-sm transition-colors flex items-center justify-center`}
            aria-label="Next"
          >
            <ChevronRightIcon className="w-4 h-4 md:w-5 md:h-5" />
          </button>
        </div>
        <div className="text-sm md:text-base lg:text-lg font-semibold text-gray-900">
          {isMobile && view === 'week' 
            ? formatWeekRange(startOfWeek(anchorDate))
            : anchorDate.toLocaleString(undefined, { month: 'long', year: 'numeric' })
          }
        </div>
        <div className="flex items-center gap-1.5 md:gap-2">
          <div className="relative">
            <select 
              value={sportFilter} 
              onChange={(e) => setSportFilter(e.target.value)} 
              className={`appearance-none pr-6 md:pr-8 pl-2 md:pl-3 py-1 md:py-1.5 text-xs md:text-sm ${isMobile ? 'border border-gray-300 bg-white hover:bg-gray-50' : 'border border-white/20 bg-white/10 backdrop-blur-md hover:bg-white/20'} rounded-lg md:rounded-xl text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary transition-all`}
            >
              {uniqueSports.map(s => (
                <option key={s} value={s}>{s === 'all' ? 'All sports' : s}</option>
              ))}
            </select>
            <ChevronDownIcon className="pointer-events-none absolute inset-y-0 right-1 md:right-2 flex items-center text-gray-400 w-4 h-4 md:w-5 md:h-5" />
          </div>
          {!isMobile && (
            <>
          <button 
            onClick={() => setView('week')} 
                className={`px-2 md:px-3 py-1 md:py-1.5 rounded-lg md:rounded-xl ${isMobile ? 'border border-gray-300' : 'border border-white/20'} shadow-sm transition-colors text-xs md:text-sm ${view==='week'?'bg-primary text-white hover:bg-primary-dark':isMobile?'bg-white hover:bg-gray-50 text-gray-700':'bg-white/10 backdrop-blur-md hover:bg-white/20 text-gray-700'}`}
          >
            Week
          </button>
          <button 
            onClick={() => setView('month')} 
                className={`px-2 md:px-3 py-1 md:py-1.5 rounded-lg md:rounded-xl ${isMobile ? 'border border-gray-300' : 'border border-white/20'} shadow-sm transition-colors text-xs md:text-sm ${view==='month'?'bg-primary text-white hover:bg-primary-dark':isMobile?'bg-white hover:bg-gray-50 text-gray-700':'bg-white/10 backdrop-blur-md hover:bg-white/20 text-gray-700'}`}
          >
            Month
          </button>
            </>
          )}
        </div>
      </div>

      {/* Mobile: Month view or Week view */}
      {isMobile ? (
        <div className={view === 'week' ? 'space-y-2' : 'space-y-4'}>
          {view === 'week' ? (
            /* Week view - scrollable days */
            <>
              <button
                onClick={() => setView('month')}
                className="mb-2 px-3 py-1.5 text-xs bg-primary/20 text-primary-dark rounded-lg border border-primary/30 hover:bg-primary/30 transition-colors w-full flex items-center justify-center gap-2"
              >
                <ChevronLeftIcon className="w-4 h-4" />
                <span>Back to Month</span>
              </button>
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
                  className="overflow-x-auto -mx-2 px-2" 
                  style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}
                >
                  <style>{`
                    .overflow-x-auto::-webkit-scrollbar {
                      display: none;
                    }
                  `}</style>
                  <div className="flex gap-1.5 min-w-max pb-2">
                  {(() => {
                    const weekStart = startOfWeek(anchorDate);
                    const weekDays = Array.from({ length: 7 }).map((_, i) => addDays(weekStart, i));
                    return weekDays.map((dayDate, dayIdx) => {
                      const key = getLocalDateString(dayDate);
                      const acts = activitiesByDay.get(key) || [];
                      const isToday = isSameDay(dayDate, new Date());
                      const isExpanded = expandedDays.has(key);
                      const visibleActs = isExpanded ? acts : acts.slice(0, 2);
                      const remainingCount = acts.length - 2;
                      
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
                      
                      const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
                      
                      return (
                        <div 
                          key={dayIdx} 
                          className={`bg-white rounded-lg border border-gray-200 ${isMobile ? 'p-1.5' : 'p-1.5'} ${isMobile ? 'w-[90px] flex-shrink-0' : 'min-w-[140px]'} transition-colors shadow-sm`}
                        >
                          <div className={`${isMobile ? 'text-[9px]' : 'text-xs'} font-semibold mb-0.5 ${isToday ? 'text-primary font-bold' : 'text-gray-700'}`}>
                            {dayNames[dayDate.getDay() === 0 ? 6 : dayDate.getDay() - 1]}
                          </div>
                          <div className={`${isMobile ? 'text-xs' : 'text-base'} font-bold mb-1 ${isToday ? 'text-primary' : 'text-gray-900'}`}>
                            {dayDate.getDate()}
                          </div>
                          <div className="space-y-0.5">
                            {visibleActs.map((a, i) => {
                              const activityId = a.id || a._id;
                              const isSelected = selectedActivityId && String(activityId) === String(selectedActivityId);
                              const activityTitle = a.title || a.name || a.originalFileName || 'Activity';
                              const handleActivityClick = (e) => {
                                e.stopPropagation();
                                if (onSelectActivity) {
                                  onSelectActivity(a);
                                }
                              };
                              const handleTouchStart = (e) => {
                                e.stopPropagation();
                                if (onSelectActivity) {
                                  onSelectActivity(a);
                                }
                              };
                              return (
                                <button 
                                  key={i} 
                                  onClick={handleActivityClick}
                                  onTouchStart={handleTouchStart}
                                  onMouseEnter={(e) => {
                                    if (!isMobile) {
                                      const rect = e.currentTarget.getBoundingClientRect();
                                      setHoveredActivity({ activity: a, title: activityTitle });
                                      setTooltipPosition({ x: rect.left + rect.width / 2, y: rect.top });
                                    }
                                  }}
                                  onMouseLeave={() => {
                                    if (!isMobile) {
                                      setHoveredActivity(null);
                                    }
                                  }}
                                  onMouseMove={(e) => {
                                    if (!isMobile) {
                                      const rect = e.currentTarget.getBoundingClientRect();
                                      setTooltipPosition({ x: rect.left + rect.width / 2, y: rect.top });
                                    }
                                  }}
                                  className={`w-full text-left ${isMobile ? 'text-[8px] px-0.5 py-0.5' : 'text-[10px] px-1.5 py-1'} rounded border shadow-sm transition-colors flex items-center gap-0.5 touch-manipulation ${
                                    isSelected 
                                      ? 'bg-primary text-white border-primary hover:bg-primary-dark active:bg-primary-dark' 
                                      : 'bg-primary/10 hover:bg-primary/20 active:bg-primary/30 text-primary-dark border-primary/30'
                                  }`}
                                  style={{ WebkitTapHighlightColor: 'transparent' }}
                                >
                                  <span className={`flex-shrink-0 ${isMobile ? 'text-[8px]' : 'text-xs'}`}>{sportBadge(a.sport)}</span>
                                  <span className={`truncate ${isMobile ? 'text-[8px]' : 'text-[10px]'}`}>{activityTitle}</span>
                                </button>
                              );
                            })}
                            {remainingCount > 0 && (
                            <button
                              onClick={toggleExpand}
                              onTouchStart={(e) => {
                                e.stopPropagation();
                                toggleExpand(e);
                              }}
                              className={`w-full text-left ${isMobile ? 'text-[8px] px-0.5 py-0.5' : 'text-[10px] px-1.5 py-1'} rounded bg-primary/10 hover:bg-primary/20 active:bg-primary/30 text-primary-dark border border-primary/30 shadow-sm transition-colors font-medium touch-manipulation flex items-center gap-1`}
                              style={{ WebkitTapHighlightColor: 'transparent' }}
                            >
                                {isExpanded ? (
                                  <>
                                    <ChevronDownIcon className="w-3 h-3 flex-shrink-0" />
                                    <span>-{remainingCount}</span>
                                  </>
                                ) : (
                                  <>
                                    <span>+</span>
                                    <span>{remainingCount}</span>
                                  </>
                                )}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    });
                  })()}
                  </div>
                </div>
              </div>
              
              {/* Custom Tooltip - Only show on desktop */}
              {hoveredActivity && !isMobile && (
                <div
                  className="fixed z-[99999] bg-gray-900 text-white text-xs px-2 py-1 rounded shadow-xl pointer-events-none"
                  style={{
                    left: `${tooltipPosition.x}px`,
                    top: `${tooltipPosition.y - 5}px`,
                    transform: 'translate(-50%, -100%)',
                    maxWidth: '200px',
                    wordWrap: 'break-word',
                    whiteSpace: 'normal'
                  }}
                >
                  {hoveredActivity.title}
                  {/* Arrow */}
                  <div
                    className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-px"
                    style={{
                      width: 0,
                      height: 0,
                      borderLeft: '6px solid transparent',
                      borderRight: '6px solid transparent',
                      borderTop: '6px solid rgb(17, 24, 39)'
                    }}
                  />
                </div>
              )}
            </>
          ) : (
            /* Month view - full calendar grid */
            <div className="grid grid-cols-7 gap-0.5">
              {/* Day headers */}
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((dayName) => (
                <div key={dayName} className="text-center text-[9px] font-semibold text-gray-600 py-0.5">
                  {dayName.slice(0, 1)}
                </div>
              ))}
              {/* Calendar days */}
              {days.map((dayDate, dayIdx) => {
                const key = getLocalDateString(dayDate);
                const isCurrentMonth = dayDate.getMonth() === anchorDate.getMonth();
                const acts = activitiesByDay.get(key) || [];
                const isToday = isSameDay(dayDate, new Date());
                
                return (
                  <button
                    key={dayIdx}
                    onClick={() => handleDayClick(dayDate)}
                    className={`bg-white rounded border border-gray-200 p-1 min-h-[50px] flex flex-col items-start transition-colors ${
                      isCurrentMonth ? '' : 'opacity-30'
                    } ${isToday ? 'ring-1 ring-primary bg-primary/10' : ''} active:bg-gray-50`}
                  >
                    <div className={`text-[10px] font-semibold mb-0.5 w-full text-left ${isToday ? 'text-primary font-bold' : 'text-gray-700'}`}>
                      {dayDate.getDate()}
                    </div>
                    <div className="flex flex-wrap gap-0.5 w-full justify-start">
                      {acts.slice(0, 1).map((a, i) => {
                        const activityId = a.id || a._id;
                        const isSelected = selectedActivityId && String(activityId) === String(selectedActivityId);
                        const handleActivityClick = (e) => {
                          e.stopPropagation();
                          if (onSelectActivity) {
                            onSelectActivity(a);
                          }
                        };
                        const handleTouchStart = (e) => {
                          e.stopPropagation();
                          if (onSelectActivity) {
                            onSelectActivity(a);
                          }
                        };
                        return (
                          <button
                            key={i}
                            onClick={handleActivityClick}
                            onTouchStart={handleTouchStart}
                            className={`text-[7px] px-0.5 py-0.5 rounded border flex items-center touch-manipulation ${
                              isSelected 
                                ? 'bg-primary text-white border-primary active:bg-primary-dark' 
                                : 'bg-primary/10 text-primary-dark border-primary/30 active:bg-primary/30'
                            }`}
                            style={{ WebkitTapHighlightColor: 'transparent' }}
                          >
                            <span className="text-[7px]">{sportBadge(a.sport)}</span>
                          </button>
                        );
                      })}
                      {acts.length > 1 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDayClick(dayDate);
                          }}
                          onTouchStart={(e) => {
                            e.stopPropagation();
                            handleDayClick(dayDate);
                          }}
                          className="text-[7px] px-0.5 py-0.5 rounded bg-gray-200 text-gray-600 font-semibold touch-manipulation active:bg-gray-300"
                          style={{ WebkitTapHighlightColor: 'transparent' }}
                        >
                          {acts.length}
                        </button>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
          
          {/* Week Summary - Collapsible on mobile */}
          {/* In week view, show only current week summary; in month view, show all visible weeks */}
          {weeklySummary.length > 0 && (view === 'week' ? weeklySummary.length === 1 : true) && (
            <div className="space-y-2">
              {weeklySummary.map((weekSummary, idx) => {
                const weekKey = weekSummary.weekStart.toISOString().slice(0, 10);
                const isExpanded = expandedSummary.has(weekKey);
                
                return (
                  <div key={idx} className={`${isMobile ? 'bg-white' : 'bg-white/10 backdrop-blur-md'} rounded-lg ${isMobile ? 'border border-gray-200' : 'border border-white/20'} p-3`}>
                  <button
                    onClick={() => {
                      setExpandedSummary(prev => {
                        const newSet = new Set(prev);
                        if (newSet.has(weekKey)) {
                          newSet.delete(weekKey);
                        } else {
                          newSet.add(weekKey);
                        }
                        return newSet;
                      });
                    }}
                    onTouchStart={(e) => {
                      e.stopPropagation();
                      setExpandedSummary(prev => {
                        const newSet = new Set(prev);
                        if (newSet.has(weekKey)) {
                          newSet.delete(weekKey);
                        } else {
                          newSet.add(weekKey);
                        }
                        return newSet;
                      });
                    }}
                    className="w-full flex items-center justify-between touch-manipulation active:bg-gray-50"
                    style={{ WebkitTapHighlightColor: 'transparent' }}
                  >
                      <div className="text-left">
                        <div className="text-sm font-bold text-gray-900">
                          {formatWeekRange(weekSummary.weekStart)}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs font-semibold text-primary">
                            Total: {formatHours(weekSummary.totalSeconds)}
                          </span>
                          {weekSummary.totalTSS > 0 && (
                            <span className="text-xs font-bold text-purple-600">
                              TSS: {Math.round(weekSummary.totalTSS)}
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="text-gray-600 flex items-center">
                        {isExpanded ? (
                          <ChevronDownIcon className="w-5 h-5" />
                        ) : (
                          <ChevronRightIcon className="w-5 h-5" />
                        )}
                      </span>
                    </button>
                    
                    {isExpanded && (
                      <div className="mt-3 pt-3 border-t border-gray-300/40 space-y-2">
                        {(weekSummary.distanceRun > 0 || weekSummary.runSeconds > 0) && (
                          <div className={`${isMobile ? 'bg-gray-50' : 'bg-white/10 backdrop-blur-md'} rounded-lg px-2.5 py-1.5 ${isMobile ? 'border border-gray-200' : 'border border-white/20'}`}>
                            <div className="flex items-center justify-between text-gray-900">
                              <div className="flex items-center gap-2">
                                <span className="text-sm">🏃</span>
                                <span className="text-xs font-bold">Run</span>
                                <span className="text-xs text-gray-700">{formatKm(weekSummary.distanceRun)}</span>
                                <span className="text-xs text-gray-600">{formatHours(weekSummary.runSeconds)}</span>
                              </div>
                              {weekSummary.tssRun > 0 && (
                                <span className="text-xs text-primary font-bold">TSS: {Math.round(weekSummary.tssRun)}</span>
                              )}
                            </div>
                          </div>
                        )}
                        {(weekSummary.distanceBike > 0 || weekSummary.bikeSeconds > 0) && (
                          <div className={`${isMobile ? 'bg-gray-50' : 'bg-white/10 backdrop-blur-md'} rounded-lg px-2.5 py-1.5 ${isMobile ? 'border border-gray-200' : 'border border-white/20'}`}>
                            <div className="flex items-center justify-between text-gray-900">
                              <div className="flex items-center gap-2">
                                <span className="text-sm">🚴</span>
                                <span className="text-xs font-bold">Bike</span>
                                <span className="text-xs text-gray-700">{formatKm(weekSummary.distanceBike)}</span>
                                <span className="text-xs text-gray-600">{formatHours(weekSummary.bikeSeconds)}</span>
                              </div>
                              {weekSummary.tssBike > 0 && (
                                <span className="text-xs text-primary font-bold">TSS: {Math.round(weekSummary.tssBike)}</span>
                              )}
                            </div>
                          </div>
                        )}
                        {(weekSummary.distanceSwim > 0 || weekSummary.swimSeconds > 0) && (
                          <div className={`${isMobile ? 'bg-gray-50' : 'bg-white/10 backdrop-blur-md'} rounded-lg px-2.5 py-1.5 ${isMobile ? 'border border-gray-200' : 'border border-white/20'}`}>
                            <div className="flex items-center justify-between text-gray-900">
                              <div className="flex items-center gap-2">
                                <span className="text-sm">🏊</span>
                                <span className="text-xs font-bold">Swim</span>
                                <span className="text-xs text-gray-700">{formatKm(weekSummary.distanceSwim)}</span>
                                <span className="text-xs text-gray-600">{formatHours(weekSummary.swimSeconds)}</span>
                              </div>
                              {weekSummary.tssSwim > 0 && (
                                <span className="text-xs text-primary font-bold">TSS: {Math.round(weekSummary.tssSwim)}</span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* Desktop: Original grid layout */
        <div className={`grid gap-px bg-white/10 rounded-xl overflow-hidden`} style={{ gridTemplateColumns: view==='week' ? 'repeat(7, 1fr) 1fr' : 'repeat(7, 1fr) 1fr' }}> 
        {['Mon','Tue','Wed','Thu','Fri','Sat','Sun', 'Summary'].map((d) => (
          <div key={d} className="bg-white/10 backdrop-blur-md text-xs md:text-sm font-medium p-2 md:p-3 text-center text-gray-700">{d}</div>
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
                const visibleActs = isExpanded ? acts : acts.slice(0, 3);
                const remainingCount = acts.length - 3;
                
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
                  <div key={`day-${weekIdx}-${dayIdx}`} className={`bg-white/10 backdrop-blur-md p-2 min-h-[80px] md:min-h-[90px] transition-colors ${isCurrentMonth ? '' : 'opacity-40'}`} style={{ width: '100%', maxWidth: '100%', overflow: 'hidden' }}>
                    <div className={`text-xs md:text-sm font-semibold mb-1 ${isToday ? 'text-primary font-bold' : 'text-gray-700'}`}>
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
                            className={`w-full max-w-full text-left text-[10px] md:text-[11px] px-1.5 md:px-2 py-1 rounded-lg border shadow-sm transition-colors flex items-center gap-1 ${
                              isSelected 
                                ? 'bg-primary text-white border-primary hover:bg-primary-dark' 
                                : 'bg-primary/10 hover:bg-primary/20 text-primary-dark border-primary/30'
                            }`}
                            style={{ minWidth: 0, overflow: 'hidden' }}
                            title={activityTitle}
                          >
                            <span className="flex-shrink-0">{sportBadge(a.sport)}</span>
                            <span className="truncate min-w-0 flex-1" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{activityTitle}</span>
                          </button>
                        );
                      })}
                      {remainingCount > 0 && (
                        <button
                          onClick={toggleExpand}
                          className="w-full text-left text-[10px] md:text-[11px] px-1.5 md:px-2 py-1 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary-dark border border-primary/30 shadow-sm transition-colors font-medium flex items-center gap-1"
                        >
                          {isExpanded ? (
                            <>
                              <ChevronDownIcon className="w-3 h-3 flex-shrink-0" />
                              <span>Show less ({remainingCount})</span>
                            </>
                          ) : (
                            <>
                              <span>+</span>
                              <span>{remainingCount} more</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                );
              }),
              // Week summary column
              weekSummary ? (
                <div key={`summary-${weekIdx}`} className="bg-white/10 backdrop-blur-md p-3 md:p-2 border-l-2 border-primary/20 min-h-[80px] md:min-h-[90px] min-w-[220px]">
                  <div className="mb-1 pb-1 border-b border-gray-300/40">
                    <div className="text-sm font-bold text-gray-900 mb-0.5">
                      {formatWeekRange(weekSummary.weekStart)}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs md:text-sm font-semibold text-primary">
                        Total: {formatHours(weekSummary.totalSeconds)}
                      </span>
                      {weekSummary.totalTSS > 0 && (
                        <span className="text-xs md:text-sm font-bold text-purple-600">
                          TSS: {Math.round(weekSummary.totalTSS)}
                        </span>
                      )}
                      {weekSummary.volumeChange && (
                        <span className="flex items-center">
                          {weekSummary.volumeChange === 'up' && (
                            <ArrowUpIcon className="w-5 h-5 text-green-600" />
                          )}
                          {weekSummary.volumeChange === 'down' && (
                            <ArrowDownIcon className="w-5 h-5 text-red-600" />
                          )}
                          {weekSummary.volumeChange === 'same' && (
                            <MinusIcon className="w-5 h-5 text-gray-400 opacity-50" />
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="space-y-1 md:text-[11px] ">
                    {(weekSummary.distanceRun > 0 || weekSummary.runSeconds > 0) && (
                      <div className="bg-white/10 backdrop-blur-md rounded-lg px-2.5 py-1.5 border border-white/20">
                        <div className="flex items-center gap-2 text-gray-900">
                          <span className="text-base">🏃</span>
                          <span className="font-bold">Run</span>
                          <span className="font-semibold text-gray-700">{formatKm(weekSummary.distanceRun)}</span>
                          <span className="text-gray-600">{formatHours(weekSummary.runSeconds)}</span>
                          {weekSummary.tssRun > 0 && (
                            <span className="text-primary font-bold ml-auto">TSS: {Math.round(weekSummary.tssRun)}</span>
                          )}
                        </div>
                      </div>
                    )}
                    {(weekSummary.distanceBike > 0 || weekSummary.bikeSeconds > 0) && (
                      <div className="bg-white/10 backdrop-blur-md rounded-lg px-2.5 py-1.5 border border-white/20">
                        <div className="flex items-center gap-2 text-gray-900">
                          <span className="text-base">🚴</span>
                          <span className="font-bold">Bike</span>
                          <span className="font-semibold text-gray-700">{formatKm(weekSummary.distanceBike)}</span>
                          <span className="text-gray-600">{formatHours(weekSummary.bikeSeconds)}</span>
                          {weekSummary.tssBike > 0 && (
                            <span className="text-primary font-bold ml-auto">TSS: {Math.round(weekSummary.tssBike)}</span>
                          )}
                        </div>
                      </div>
                    )}
                    {(weekSummary.distanceSwim > 0 || weekSummary.swimSeconds > 0) && (
                      <div className="bg-white/10 backdrop-blur-md rounded-lg px-2.5 py-1.5 border border-white/20">
                        <div className="flex items-center gap-2 text-gray-900">
                          <span className="text-base">🏊</span>
                          <span className="font-bold">Swim</span>
                          <span className="font-semibold text-gray-700">{formatKm(weekSummary.distanceSwim)}</span>
                          <span className="text-gray-600">{formatHours(weekSummary.swimSeconds)}</span>
                          {weekSummary.tssSwim > 0 && (
                            <span className="text-primary font-bold ml-auto">TSS: {Math.round(weekSummary.tssSwim)}</span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div key={`summary-empty-${weekIdx}`} className="bg-white/10 backdrop-blur-md p-2 min-h-[80px] md:min-h-[90px] min-w-[200px]"></div>
              )
            ].filter(Boolean);
          });
        })()}
      </div>
      )}
    </div>
  );
}
