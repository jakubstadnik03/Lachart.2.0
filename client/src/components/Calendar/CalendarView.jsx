import React, { useMemo, useState } from 'react';

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

export default function CalendarView({ activities = [], onSelectActivity }) {
  const [view, setView] = useState('month'); // 'month' | 'week'
  const [anchorDate, setAnchorDate] = useState(new Date());
  const [sportFilter, setSportFilter] = useState('all');

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
      const key = d.toISOString().slice(0,10);
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
    <div className="bg-white rounded-lg shadow-md p-4 mb-6">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <button onClick={prev} className="px-2 py-1 rounded border">◀</button>
          <button onClick={today} className="px-2 py-1 rounded border">Today</button>
          <button onClick={next} className="px-2 py-1 rounded border">▶</button>
        </div>
        <div className="text-lg font-semibold">
          {anchorDate.toLocaleString(undefined, { month: 'long', year: 'numeric' })}
        </div>
        <div className="flex items-center gap-2">
          <select value={sportFilter} onChange={(e) => setSportFilter(e.target.value)} className="px-2 py-1 text-sm border rounded">
            {uniqueSports.map(s => (
              <option key={s} value={s}>{s === 'all' ? 'All sports' : s}</option>
            ))}
          </select>
          <button onClick={() => setView('week')} className={`px-3 py-1 rounded border ${view==='week'?'bg-gray-100':''}`}>Week</button>
          <button onClick={() => setView('month')} className={`px-3 py-1 rounded border ${view==='month'?'bg-gray-100':''}`}>Month</button>
        </div>
      </div>

      <div className={`grid ${view==='week' ? 'grid-cols-7' : 'grid-cols-7'} gap-px bg-gray-200 rounded`}> 
        {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((d) => (
          <div key={d} className="bg-gray-50 text-xs font-medium p-2 text-center">{d}</div>
        ))}
        {days.map((dayDate, idx) => {
          const key = dayDate.toISOString().slice(0,10);
          const isCurrentMonth = dayDate.getMonth() === anchorDate.getMonth();
          const acts = activitiesByDay.get(key) || [];
          return (
            <div key={idx} className={`bg-white p-2 min-h-[90px] ${isCurrentMonth ? '' : 'opacity-50'}`}>
              <div className={`text-xs font-semibold mb-1 ${isSameDay(dayDate, new Date()) ? 'text-blue-600' : 'text-gray-600'}`}>
                {dayDate.getDate()}
              </div>
              <div className="space-y-1">
                {acts.slice(0,3).map((a, i) => (
                  <button key={i} onClick={() => onSelectActivity && onSelectActivity(a)} className="w-full text-left text-[11px] truncate px-2 py-1 rounded bg-blue-50 hover:bg-blue-100 text-blue-700">
                    <span className="mr-1">{sportBadge(a.sport)}</span>
                    {a.title || a.name || a.originalFileName || 'Activity'}
                  </button>
                ))}
                {acts.length > 3 && (
                  <div className="text-[11px] text-gray-500">+ {acts.length - 3} more</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
