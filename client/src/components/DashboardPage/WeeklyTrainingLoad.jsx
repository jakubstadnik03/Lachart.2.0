import React, { useState, useEffect, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { Bar, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ComposedChart, Legend, ReferenceArea } from 'recharts';
import { InformationCircleIcon, ChevronDownIcon, EllipsisHorizontalIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { getWeeklyTrainingLoad } from '../../services/api';
import { getPlannedWorkouts } from '../../services/workoutPlannerApi';
import { useAuth } from '../../context/AuthProvider';
import TrainingGlossary from './TrainingGlossary';
import { computeWeeklyTrainingLoadFromActivities } from '../../utils/formFitnessFromActivities';
import { mergeProfileZones } from '../../utils/inferThresholdsFromActivities';
import { TSS_DISPLAY_MODE_EVENT, clearFormFitnessCache } from '../../utils/uiPrefs';

// Total planned duration in seconds (respects interval-group repeats).
const planStepTotalSecs = (steps) => {
  if (!Array.isArray(steps)) return 0;
  const visited = new Set();
  let total = 0;
  steps.forEach((s) => {
    if (!s.groupId) { total += s.durationSeconds || 0; return; }
    if (visited.has(s.groupId)) return;
    visited.add(s.groupId);
    const group = steps.filter((x) => x.groupId === s.groupId);
    const reps = (group.find((x) => x.isGroupHeader)?.groupRepeat) || 1;
    group.forEach((gs) => { total += (gs.durationSeconds || 0) * reps; });
  });
  return total;
};

// Estimate a planned session's TSS (explicit targetTss, else ~50 TSS/h).
const estimatePlannedTss = (pw) => {
  const explicit = Number(pw?.targetTss || 0);
  if (explicit > 0) return explicit;
  let secs = Number(pw?.plannedDuration || 0);
  if (!secs && Array.isArray(pw?.steps)) secs = planStepTotalSecs(pw.steps) || 0;
  if (secs > 0 && secs < 24 * 3600) return (secs / 3600) * 50;
  return 0;
};

// Monday-based week key (matches backend bucketing).
const weekKeyFor = (date) => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const weekLabelFor = (weekKey) =>
  new Date(weekKey).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

const WeeklyTrainingLoad = ({ athleteId, activities = null, userProfile = null, activitiesLoading = false }) => {
  const { user } = useAuth();
  const profile = useMemo(
    () => mergeProfileZones(userProfile, user) || userProfile || user,
    [userProfile, user],
  );
  const calendarDriven = activities != null;
  const [showGlossary, setShowGlossary] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [tssModeTick, setTssModeTick] = useState(0);
  
  // Load time range from localStorage or default to '3 months'
  const getStoredTimeRange = () => {
    try {
      const stored = localStorage.getItem('weeklyTrainingLoadTimeRange');
      if (stored && ['3 months', '6 months', '12 months'].includes(stored)) {
        return stored;
      }
    } catch (error) {
      console.error('Error reading from localStorage:', error);
    }
    return '3 months';
  };

  // Load sport filter from localStorage or default to 'all'
  const getStoredSportFilter = () => {
    try {
      const stored = localStorage.getItem('weeklyTrainingLoadSportFilter');
      if (stored && ['all', 'bike', 'run', 'swim'].includes(stored)) {
        return stored;
      }
    } catch (error) {
      console.error('Error reading from localStorage:', error);
    }
    return 'all';
  };

  const [timeRange, setTimeRange] = useState(getStoredTimeRange());
  const [sportFilter, setSportFilter] = useState(getStoredSportFilter());
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [plannedByWeek, setPlannedByWeek] = useState({}); // future weekKey → planned TSS
  const [showProjection, setShowProjection] = useState(() => {
    try { return localStorage.getItem('weeklyTrainingLoadProjection') !== 'false'; } catch { return true; }
  });

  useEffect(() => {
    try { localStorage.setItem('weeklyTrainingLoadProjection', String(showProjection)); } catch { /* ignore */ }
  }, [showProjection]);

  useEffect(() => {
    const onTssModeChange = () => {
      clearFormFitnessCache();
      setTssModeTick((t) => t + 1);
    };
    const onMetricsUpdated = () => {
      clearFormFitnessCache();
      setTssModeTick((t) => t + 1);
    };
    window.addEventListener(TSS_DISPLAY_MODE_EVENT, onTssModeChange);
    window.addEventListener('activityMetricsUpdated', onMetricsUpdated);
    return () => {
      window.removeEventListener(TSS_DISPLAY_MODE_EVENT, onTssModeChange);
      window.removeEventListener('activityMetricsUpdated', onMetricsUpdated);
    };
  }, []);

  // Save time range to localStorage when it changes
  const handleTimeRangeChange = (newTimeRange) => {
    setTimeRange(newTimeRange);
    try {
      localStorage.setItem('weeklyTrainingLoadTimeRange', newTimeRange);
    } catch (error) {
      console.error('Error saving to localStorage:', error);
    }
  };

  // Save sport filter to localStorage when it changes
  const handleSportFilterChange = (newSportFilter) => {
    setSportFilter(newSportFilter);
    try {
      localStorage.setItem('weeklyTrainingLoadSportFilter', newSportFilter);
    } catch (error) {
      console.error('Error saving to localStorage:', error);
    }
  };

  useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      if (!athleteId) {
        if (!cancelled) {
          setChartData([]);
          setLoading(false);
        }
        return;
      }

      const months =
        timeRange === '3 months' ? 3 :
        timeRange === '6 months' ? 6 :
        12;

      if (calendarDriven) {
        if (activitiesLoading) {
          if (!cancelled) setLoading(true);
          return;
        }
        if (Array.isArray(activities) && activities.length > 0 && profile) {
          const data = computeWeeklyTrainingLoadFromActivities(activities, profile, { months, sportFilter });
          if (!cancelled) {
            setChartData(data);
            setLoading(false);
          }
          return;
        }
        // Calendar finished loading but has no activities — fall through to server API.
      }

      // Prefer calendar activities — same TSS as Training Calendar weekly summary.
      if (Array.isArray(activities) && activities.length > 0 && profile) {
        const data = computeWeeklyTrainingLoadFromActivities(activities, profile, { months, sportFilter });
        if (!cancelled) {
          setChartData(data);
          setLoading(false);
        }
        return;
      }

      // Per-athlete/time-range/sport cache shared across pages
      const cacheKey = `weeklyTrainingLoad_${athleteId}_${months}_${sportFilter}`;
      const tsKey = `${cacheKey}_ts`;
      const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

      let usedCache = false;

      // Dashboard calendar-driven mode: skip stale localStorage — wait for live calendar or API.
      if (!calendarDriven) {
      // 1) Try to paint from cache immediately
      try {
        const cached = localStorage.getItem(cacheKey);
        const ts = localStorage.getItem(tsKey);
        if (cached && ts) {
          const age = Date.now() - parseInt(ts, 10);
          if (!Number.isNaN(age) && age < CACHE_TTL) {
            const parsed = JSON.parse(cached);
            if (Array.isArray(parsed)) {
              setChartData(parsed);
              setLoading(false);
              usedCache = true;
            }
          }
        }
      } catch (e) {
        console.warn('Error reading weekly training load cache:', e);
      }
      }

      try {
        if (!usedCache) {
          setLoading(true);
        }
        const response = await getWeeklyTrainingLoad(athleteId, months, sportFilter);
        if (cancelled) return;
        if (response && response.data) {
          const data = Array.isArray(response.data) ? response.data : (response.data.data || []);
          setChartData(data);

          // 2) Save to cache so other renders/pages are instant
          try {
            const payload = JSON.stringify(data);
            if (payload.length < 100000) {
              localStorage.setItem(cacheKey, payload);
              localStorage.setItem(tsKey, Date.now().toString());
            }
          } catch (e) {
            console.warn('Error saving weekly training load cache:', e);
          }
        } else {
          setChartData([]);
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Error loading weekly training load:', error);
          setChartData([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadData();
    return () => { cancelled = true; };
  }, [athleteId, timeRange, sportFilter, activities, profile, tssModeTick, activitiesLoading, calendarDriven]);

  // Load FUTURE planned workouts → weekly planned TSS for projection.
  useEffect(() => {
    let cancelled = false;
    if (!athleteId) { setPlannedByWeek({}); return undefined; }
    (async () => {
      try {
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const from = new Date(today);
        const to = new Date(today); to.setDate(to.getDate() + 56);
        const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const data = await getPlannedWorkouts({ from: iso(from), to: iso(to), athleteId });
        const list = Array.isArray(data) ? data : [];
        const map = {};
        list.forEach((pw) => {
          if (pw?.status === 'completed' || pw?.status === 'skipped') return;
          const sport = (pw?.sport || '').toLowerCase();
          if (sportFilter !== 'all' && sport !== sportFilter) return;
          const day = typeof pw?.date === 'string' ? pw.date.slice(0, 10) : '';
          if (!day || day < iso(today)) return; // only today onwards
          const wk = weekKeyFor(day);
          map[wk] = (map[wk] || 0) + estimatePlannedTss(pw);
        });
        if (!cancelled) setPlannedByWeek(map);
      } catch { if (!cancelled) setPlannedByWeek({}); }
    })();
    return () => { cancelled = true; };
  }, [athleteId, sportFilter]);

  // Merge actual weeks with planned projection. The current week gets a stacked
  // "planned" segment for its remaining sessions; future weeks are planned-only.
  const displayData = useMemo(() => {
    const base = Array.isArray(chartData) ? chartData : [];
    if (!showProjection || Object.keys(plannedByWeek).length === 0) {
      return base.map((w) => ({ ...w, plannedLoad: 0 }));
    }
    const lastHistKey = base.length > 0 ? base[base.length - 1].weekStart : null;
    const lastOptimal = base.length > 0 ? (base[base.length - 1].optimalLoad || 0) : 0;
    const merged = base.map((w) => ({ ...w, plannedLoad: plannedByWeek[w.weekStart] ? Math.round(plannedByWeek[w.weekStart]) : 0 }));
    Object.keys(plannedByWeek)
      .filter((wk) => !lastHistKey || wk > lastHistKey)
      .sort()
      .forEach((wk) => {
        merged.push({
          weekStart: wk,
          weekLabel: weekLabelFor(wk),
          trainingLoad: 0,
          plannedLoad: Math.round(plannedByWeek[wk]),
          optimalLoad: lastOptimal,
          projected: true,
        });
      });
    return merged;
  }, [chartData, plannedByWeek, showProjection]);

  const projectedWeeks = useMemo(() => displayData.filter((w) => w.projected), [displayData]);
  const hasProjection = projectedWeeks.length > 0 || displayData.some((w) => w.plannedLoad > 0);
  const projectionBandX1 = projectedWeeks.length > 0 ? projectedWeeks[0].weekLabel : null;
  const projectionBandX2 = projectedWeeks.length > 0 ? projectedWeeks[projectedWeeks.length - 1].weekLabel : null;

  return (
    <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-lg h-full flex flex-col">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h3 className="text-lg font-semibold text-gray-900 min-w-0 truncate">Weekly Training Load</h3>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">{timeRange}</span>
          <button
            onClick={() => setShowSettings(true)}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            aria-label="Open settings"
            title="Settings"
          >
            <EllipsisHorizontalIcon className="w-6 h-6 text-gray-500" />
          </button>
          <button
            onClick={() => setShowGlossary(true)}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            aria-label="Show explanation"
            title="Glossary"
          >
            <InformationCircleIcon className="w-6 h-6 text-gray-500" />
          </button>
        </div>
      </div>

      {/* Settings modal — portal to body to escape any parent stacking context */}
      {showSettings && ReactDOM.createPortal(
        <div
          className="fixed inset-0 z-[9999] bg-black/40 flex items-end sm:items-center justify-center"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setShowSettings(false);
          }}
        >
          <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-xl border border-gray-200 max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 p-4 flex items-center justify-between">
              <div className="font-semibold text-gray-900">Settings</div>
              <button
                onClick={() => setShowSettings(false)}
                className="p-1 hover:bg-gray-100 rounded-full transition-colors"
                aria-label="Close settings"
              >
                <XMarkIcon className="w-6 h-6 text-gray-500" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div>
                <div className="text-xs font-semibold text-gray-600 mb-1">Sport</div>
                <div className="relative">
                  <select
                    value={sportFilter}
                    onChange={(e) => handleSportFilterChange(e.target.value)}
                    className="appearance-none w-full text-sm border border-gray-300 rounded-lg pl-3 pr-9 py-2 text-gray-700 bg-white h-10 leading-none focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  >
                    <option value="all">All Sports</option>
                    <option value="bike">Bike</option>
                    <option value="run">Run</option>
                    <option value="swim">Swim</option>
                  </select>
                  <ChevronDownIcon className="w-4 h-4 text-gray-400 pointer-events-none absolute right-2 top-1/2 -translate-y-1/2" />
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold text-gray-600 mb-1">Time frame</div>
                <div className="relative">
                  <select
                    value={timeRange}
                    onChange={(e) => handleTimeRangeChange(e.target.value)}
                    className="appearance-none w-full text-sm border border-gray-300 rounded-lg pl-3 pr-9 py-2 text-gray-700 bg-white h-10 leading-none focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  >
                    <option value="3 months">Past 3 months</option>
                    <option value="6 months">Past 6 months</option>
                    <option value="12 months">Past 12 months</option>
                  </select>
                  <ChevronDownIcon className="w-4 h-4 text-gray-400 pointer-events-none absolute right-2 top-1/2 -translate-y-1/2" />
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold text-gray-600 mb-1">Projection</div>
                <button
                  type="button"
                  onClick={() => setShowProjection((v) => !v)}
                  className="flex items-center justify-between w-full text-sm border border-gray-300 rounded-lg px-3 py-2 text-gray-700 bg-white h-10 hover:bg-gray-50 transition-colors"
                >
                  <span>Project planned workouts forward</span>
                  <span className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${showProjection ? 'bg-primary' : 'bg-gray-300'}`}>
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${showProjection ? 'translate-x-4' : 'translate-x-0.5'}`} />
                  </span>
                </button>
                <p className="mt-1 text-[11px] text-gray-400">Adds upcoming planned weeks (and this week&apos;s remaining sessions) as a forecast.</p>
              </div>

              <div className="flex flex-col sm:flex-row gap-2 pt-2">
                <button
                  onClick={() => {
                    setShowGlossary(true);
                    setShowSettings(false);
                  }}
                  className="h-10 px-4 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg border border-gray-200 transition-colors w-full"
                >
                  Open glossary
                </button>
                <button
                  onClick={() => setShowSettings(false)}
                  className="h-10 px-4 text-sm bg-white hover:bg-gray-50 rounded-lg border border-gray-200 transition-colors w-full"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {loading ? (
        <div className="flex-1 min-h-72 sm:min-h-96 flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      ) : (
        <div className="flex-1 min-h-72 sm:min-h-96">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={displayData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis 
              dataKey="weekLabel" 
              tick={{ fontSize: 12, fill: '#6b7280' }}
              interval="preserveStartEnd"
            />
            <YAxis 
              tick={{ fontSize: 12, fill: '#6b7280' }}
              label={{ value: 'TSS', angle: -90, position: 'insideLeft' }}
            />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: 'white', 
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '12px'
              }}
              formatter={(value, name) => {
                if (name === 'Training Load' || name === 'Optimal Load' || name === 'Planned (projected)') {
                  return [`${value} TSS`, name];
                }
                return [value, name];
              }}
            />
            {/* Shade the projected (future) region */}
            {hasProjection && projectionBandX1 && (
              <ReferenceArea x1={projectionBandX1} x2={projectionBandX2} fill="#6366f1" fillOpacity={0.05} />
            )}
            {/* Optimal Load as Area (behind bars) */}
            <Area 
              type="monotone" 
              dataKey="optimalLoad" 
              fill="#86efac" 
              fillOpacity={0.3}
              stroke="#22c55e" 
              strokeWidth={1}
              strokeDasharray="5 5"
              name="Optimal Load"
            />
            {/* Actual Training Load (stacked base) */}
            <Bar 
              dataKey="trainingLoad" 
              stackId="load"
              fill="#ef4444" 
              name="Training Load"
              radius={[4, 4, 0, 0]}
            />
            {/* Planned / projected load (stacked on top) */}
            {hasProjection && (
              <Bar
                dataKey="plannedLoad"
                stackId="load"
                fill="#fca5a5"
                fillOpacity={0.7}
                stroke="#ef4444"
                strokeOpacity={0.5}
                strokeDasharray="4 3"
                name="Planned (projected)"
                radius={[4, 4, 0, 0]}
              />
            )}
            <Legend 
              wrapperStyle={{ paddingTop: '20px' }}
              iconType="circle"
            />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Glossary Modal */}
      <TrainingGlossary 
        isOpen={showGlossary} 
        onClose={() => setShowGlossary(false)} 
        initialTerm="Training Load"
      />
    </div>
  );
};

export default WeeklyTrainingLoad;

