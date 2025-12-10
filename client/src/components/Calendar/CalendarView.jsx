import React, { useMemo, useState, useEffect } from 'react';

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

export default function CalendarView({ activities = [], onSelectActivity, selectedActivityId, initialAnchorDate }) {
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
  
  // Initialize sportFilter from localStorage or default to 'all'
  const getInitialSportFilter = () => {
    const saved = localStorage.getItem('calendarView_sportFilter');
    return saved || 'all';
  };
  
  const [sportFilter, setSportFilter] = useState(getInitialSportFilter);
  const [expandedDays, setExpandedDays] = useState(new Set()); // Track which days are expanded
  
  // Save sportFilter to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('calendarView_sportFilter', sportFilter);
  }, [sportFilter]);
  
  // Save anchorDate to localStorage when it changes (but not when initialAnchorDate prop changes)
  useEffect(() => {
    if (!initialAnchorDate) {
      // Only save if we're not being controlled by initialAnchorDate prop
      localStorage.setItem('calendarView_anchorDate', anchorDate.toISOString());
    }
  }, [anchorDate, initialAnchorDate]);

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
      const d = new Date(act.date || act.timestamp || act.startDate || act.start_time || Date.now());
      // Use local date string instead of ISO to avoid timezone offset issues
      const key = getLocalDateString(d);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(act);
    });
    return map;
  }, [filteredActivities]);

  const days = useMemo(() => {
    if (view === 'week') {
      const start = startOfWeek(anchorDate);
      return Array.from({ length: 7 }).map((_, i) => addDays(start, i));
    }
    const start = startOfWeek(startOfMonth(anchorDate));
    return Array.from({ length: 42 }).map((_, i) => addDays(start, i));
  }, [view, anchorDate]);

  const prev = () => setAnchorDate(d => view==='week' ? addDays(d, -7) : new Date(d.getFullYear(), d.getMonth()-1, 1));
  const next = () => setAnchorDate(d => view==='week' ? addDays(d, 7) : new Date(d.getFullYear(), d.getMonth()+1, 1));
  const today = () => setAnchorDate(new Date());

  return (
    <div className="bg-white/60 backdrop-blur-lg rounded-3xl border border-white/30 shadow-xl p-4 md:p-6 mb-4 md:mb-6">
      <div className="flex flex-col sm:flex-row flex-wrap items-start sm:items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <button 
            onClick={prev} 
            className="px-3 py-1.5 rounded-xl border border-white/40 bg-white/70 hover:bg-white/90 text-gray-700 shadow-sm transition-colors"
            style={{ 
              WebkitAppearance: 'none', 
              appearance: 'none',
              border: '1px solid rgba(255, 255, 255, 0.4)',
              background: 'rgba(255, 255, 255, 0.7)',
              fontFamily: 'inherit',
              fontSize: 'inherit',
              lineHeight: 'inherit',
              cursor: 'pointer',
              userSelect: 'none'
            }}
          >
            ◀
          </button>
          <button 
            onClick={today} 
            className="px-3 py-1.5 rounded-xl border border-white/40 bg-white/70 hover:bg-white/90 text-gray-700 shadow-sm transition-colors text-sm"
            style={{ 
              WebkitAppearance: 'none', 
              appearance: 'none',
              border: '1px solid rgba(255, 255, 255, 0.4)',
              background: 'rgba(255, 255, 255, 0.7)',
              fontFamily: 'inherit',
              fontSize: '0.875rem',
              lineHeight: 'inherit',
              cursor: 'pointer',
              userSelect: 'none'
            }}
          >
            Today
          </button>
          <button 
            onClick={next} 
            className="px-3 py-1.5 rounded-xl border border-white/40 bg-white/70 hover:bg-white/90 text-gray-700 shadow-sm transition-colors"
            style={{ 
              WebkitAppearance: 'none', 
              appearance: 'none',
              border: '1px solid rgba(255, 255, 255, 0.4)',
              background: 'rgba(255, 255, 255, 0.7)',
              fontFamily: 'inherit',
              fontSize: 'inherit',
              lineHeight: 'inherit',
              cursor: 'pointer',
              userSelect: 'none'
            }}
          >
            ▶
          </button>
        </div>
        <div className="text-base md:text-lg font-semibold text-gray-900">
          {anchorDate.toLocaleString(undefined, { month: 'long', year: 'numeric' })}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <select 
              value={sportFilter} 
              onChange={(e) => setSportFilter(e.target.value)} 
              className="appearance-none pr-8 pl-3 py-1.5 text-sm border border-white/40 rounded-xl bg-white/80 hover:bg-white focus:bg-white text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary transition-all"
            >
              {uniqueSports.map(s => (
                <option key={s} value={s}>{s === 'all' ? 'All sports' : s}</option>
              ))}
            </select>
            <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-gray-400 text-xs">⌄</span>
          </div>
          <button 
            onClick={() => setView('week')} 
            className={`px-3 py-1.5 rounded-xl border border-white/40 shadow-sm transition-colors text-sm ${view==='week'?'bg-primary text-white hover:bg-primary-dark':'bg-white/70 hover:bg-white/90 text-gray-700'}`}
            style={{ 
              WebkitAppearance: 'none', 
              appearance: 'none',
              border: '1px solid rgba(255, 255, 255, 0.4)',
              fontFamily: 'inherit',
              fontSize: '0.875rem',
              lineHeight: 'inherit',
              cursor: 'pointer',
              userSelect: 'none'
            }}
          >
            Week
          </button>
          <button 
            onClick={() => setView('month')} 
            className={`px-3 py-1.5 rounded-xl border border-white/40 shadow-sm transition-colors text-sm ${view==='month'?'bg-primary text-white hover:bg-primary-dark':'bg-white/70 hover:bg-white/90 text-gray-700'}`}
            style={{ 
              WebkitAppearance: 'none', 
              appearance: 'none',
              border: '1px solid rgba(255, 255, 255, 0.4)',
              fontFamily: 'inherit',
              fontSize: '0.875rem',
              lineHeight: 'inherit',
              cursor: 'pointer',
              userSelect: 'none'
            }}
          >
            Month
          </button>
        </div>
      </div>

      <div className={`grid ${view==='week' ? 'grid-cols-7' : 'grid-cols-7'} gap-px bg-gray-200/50 rounded-xl overflow-hidden`}> 
        {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((d) => (
          <div key={d} className="bg-white/80 backdrop-blur-sm text-xs md:text-sm font-medium p-2 md:p-3 text-center text-gray-700">{d}</div>
        ))}
        {days.map((dayDate, idx) => {
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
            <div key={idx} className={`bg-white/60 backdrop-blur-sm p-2 min-h-[80px] md:min-h-[90px] transition-colors ${isCurrentMonth ? '' : 'opacity-40'}`}>
              <div className={`text-xs md:text-sm font-semibold mb-1 ${isToday ? 'text-primary font-bold' : 'text-gray-700'}`}>
                {dayDate.getDate()}
              </div>
              <div className="space-y-1">
                {visibleActs.map((a, i) => {
                  const activityId = a.id || a._id;
                  const isSelected = selectedActivityId && String(activityId) === String(selectedActivityId);
                  return (
                    <button 
                      key={i} 
                      onClick={() => onSelectActivity && onSelectActivity(a)} 
                      className={`w-full text-left text-[10px] md:text-[11px] truncate px-1.5 md:px-2 py-1 rounded-lg border shadow-sm transition-colors ${
                        isSelected 
                          ? 'bg-primary text-white border-primary hover:bg-primary-dark' 
                          : 'bg-primary/10 hover:bg-primary/20 text-primary-dark border-primary/30'
                      }`}
                    >
                      <span className="mr-1">{sportBadge(a.sport)}</span>
                      {a.title || a.name || a.originalFileName || 'Activity'}
                    </button>
                  );
                })}
                {remainingCount > 0 && (
                  <button
                    onClick={toggleExpand}
                    className="w-full text-left text-[10px] md:text-[11px] px-1.5 md:px-2 py-1 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary-dark border border-primary/30 shadow-sm transition-colors font-medium"
                  >
                    {isExpanded ? `▼ Show less (${remainingCount})` : `+ ${remainingCount} more`}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
