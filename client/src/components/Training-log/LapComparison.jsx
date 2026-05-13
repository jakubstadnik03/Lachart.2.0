import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';
import { ChartBarIcon } from '@heroicons/react/24/outline';
import { getStravaActivityDetail, getFitTraining } from '../../services/api';

// ─── constants ────────────────────────────────────────────────────────────────

const SERIES_COLORS = ['#6366F1', '#22C55E', '#F97316', '#06B6D4', '#EF4444', '#A855F7', '#0EA5E9'];

const METRICS = [
  { id: 'pace',  label: 'Pace' },
  { id: 'hr',    label: 'Heart Rate' },
  { id: 'power', label: 'Power' },
];

// ─── helpers ──────────────────────────────────────────────────────────────────

function getSessionId(t) {
  return String(t._id || t.stravaId || t.id || Math.random());
}

function getSessionDate(t) {
  return new Date(t.date || t.startDate || t.timestamp || t.createdAt || 0);
}

function fmtDate(t) {
  const d = getSessionDate(t);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('cs-CZ', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

/** Lap metric value (null if not available for this lap). */
function getLapValue(lap, metric, sport) {
  if (!lap) return null;
  const s = String(sport || '').toLowerCase();
  const isSwim = s.includes('swim');
  const isRun  = s.includes('run') || s.includes('hike') || s.includes('walk') || s.includes('trail');
  const isBike = s.includes('ride') || s.includes('cycle') || s.includes('bike') || s.includes('virtual');

  if (metric === 'hr') {
    const hr = Number(lap.average_heartrate || lap.averageHeartRate || lap.avgHR || lap.avg_heart_rate || 0);
    return hr > 0 ? hr : null;
  }
  if (metric === 'power') {
    const w = Number(lap.average_watts || lap.avgPower || lap.avg_power || 0);
    return w > 0 ? w : null;
  }
  if (metric === 'pace') {
    const dur  = Number(lap.elapsed_time || lap.totalElapsedTime || lap.duration || 0);
    const dist = Number(lap.distance || lap.totalDistance || 0);
    // Pace = sec / km (run) or sec / 100m (swim)
    if (isSwim && dist > 0 && dur > 0) return dur / (dist / 100);
    if ((isRun || isBike) && dist > 0 && dur > 0) return dur / (dist / 1000);
    // Fallback: use average_speed if present
    const spd = Number(lap.average_speed || lap.avgSpeed || lap.avg_speed || 0);
    if (spd > 0) return 1000 / spd; // sec/km
    return null;
  }
  return null;
}

function fmtPaceLabel(sec, sport) {
  if (!sec || sec <= 0) return '—';
  const s = String(sport || '').toLowerCase();
  const isSwim = s.includes('swim');
  const min = Math.floor(sec / 60);
  const rem = Math.round(sec % 60);
  return `${min}:${String(rem).padStart(2, '0')}${isSwim ? '/100m' : '/km'}`;
}

function fmtMetricLabel(val, metric, sport) {
  if (val === null || val === undefined) return '—';
  if (metric === 'hr') return `${Math.round(val)} bpm`;
  if (metric === 'power') return `${Math.round(val)} W`;
  if (metric === 'pace') return fmtPaceLabel(val, sport);
  return String(val);
}

/**
 * Detect "work" laps by duration clustering — skips warmup / cooldown.
 * Returns filtered array of laps (NOT indexed).
 */
function filterWorkLaps(laps) {
  if (!laps || laps.length <= 2) return laps || [];
  const durs = laps.map(l => Number(l.elapsed_time || l.totalElapsedTime || l.duration || 0)).filter(d => d > 0);
  if (durs.length < 2) return laps;
  const sorted = [...durs].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const filtered = laps.filter(l => {
    const d = Number(l.elapsed_time || l.totalElapsedTime || l.duration || 0);
    return d > 0 && Math.abs(d - median) / median <= 0.35;
  });
  return filtered.length >= 2 ? filtered : laps;
}

// ─── Custom recharts tooltip ──────────────────────────────────────────────────

function LapTooltip({ active, payload, label, series, metric, sport }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg px-3 py-2 text-xs min-w-[120px]">
      <p className="font-bold text-gray-700 mb-1">Lap {label}</p>
      {payload.map((p, i) => {
        const s = series.find(x => x.key === p.dataKey);
        return (
          <div key={i} className="flex items-center gap-2 py-0.5">
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
            <span className="text-gray-500 truncate max-w-[80px]">{s?.label || p.dataKey}</span>
            <span className="font-semibold ml-auto pl-2" style={{ color: p.color }}>
              {fmtMetricLabel(p.value, metric, sport)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

// Match the filter from TrainingComparison: only annotated Strava/FIT/Garmin
// exports (user-renamed title OR category) are treated as intervals.
function isAnnotatedExport(t) {
  if (!t) return false;
  const idStr = String(t.id || t._id || '');
  const isExport = !!t.stravaId
    || t.source === 'strava' || t.source === 'fit' || t.source === 'garmin' || t.source === 'apple'
    || t.type === 'strava'   || t.type === 'fit'   || t.type === 'garmin'   || t.type === 'apple'
    || idStr.startsWith('strava-') || idStr.startsWith('fit-') || idStr.startsWith('garmin-') || idStr.startsWith('apple-')
    || !!t.timestamp;
  if (!isExport) return false;
  const hasManualTitle = !!(t.titleManual && String(t.titleManual).trim());
  const hasCategory    = !!(t.category && String(t.category).trim());
  return hasManualTitle || hasCategory;
}

export default function LapComparison({ trainings: rawTrainings, selectedTitle: externalTitle, setSelectedTitle: setExternalTitle }) {
  const trainings = useMemo(
    () => (Array.isArray(rawTrainings) ? rawTrainings.filter(isAnnotatedExport) : []),
    [rawTrainings]
  );
  const [localTitle, setLocalTitle]     = useState('');
  const [selectedIds, setSelectedIds]   = useState([]);
  const [lapsCache, setLapsCache]       = useState({}); // id -> laps[] | 'loading' | 'error'
  const [metric, setMetric]             = useState('pace');
  const [filterWork, setFilterWork]     = useState(true);
  const [collapsed, setCollapsed]       = useState(false);
  const loadingRef = useRef(new Set());

  // Use external title if provided (keeps in sync with TrainingGraph selector)
  const selectedTitle = externalTitle !== undefined ? externalTitle : localTitle;
  const setSelectedTitle = useCallback((v) => {
    if (setExternalTitle) setExternalTitle(v);
    setLocalTitle(v);
    setSelectedIds([]); // reset selection on title change
  }, [setExternalTitle]);

  // All unique titles
  const titles = useMemo(() => {
    const s = new Set();
    (trainings || []).forEach(t => { if (t.title) s.add(t.title); });
    return Array.from(s).sort();
  }, [trainings]);

  // Sessions matching selectedTitle, sorted oldest→newest
  const sessions = useMemo(() => {
    if (!selectedTitle || selectedTitle === 'all') return [];
    return (trainings || [])
      .filter(t => t.title === selectedTitle)
      .sort((a, b) => getSessionDate(a) - getSessionDate(b));
  }, [trainings, selectedTitle]);

  // Auto-select the two most recent sessions when title changes
  useEffect(() => {
    if (sessions.length === 0) { setSelectedIds([]); return; }
    const ids = sessions.slice(-2).map(getSessionId);
    setSelectedIds(ids);
  }, [sessions.map(getSessionId).join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  // Lazily fetch laps for a session
  const loadLaps = useCallback(async (session) => {
    const id = getSessionId(session);
    if (lapsCache[id] || loadingRef.current.has(id)) return;
    loadingRef.current.add(id);
    setLapsCache(prev => ({ ...prev, [id]: 'loading' }));
    try {
      let laps = [];
      const isStrava = session.type === 'strava' || !!session.stravaId || !!session.stravaActivityId;
      const isFit    = session.type === 'fit' && !!session._id;
      if (isStrava) {
        const stravaId = session.stravaId || session.id || session.stravaActivityId;
        const data = await getStravaActivityDetail(stravaId);
        laps = Array.isArray(data?.laps) ? data.laps : [];
      } else if (isFit) {
        const data = await getFitTraining(session._id);
        laps = Array.isArray(data?.laps) ? data.laps : [];
      } else if (Array.isArray(session.results) && session.results.length > 0) {
        // Manual training — convert results to lap shape
        laps = session.results.map(r => ({
          elapsed_time: (() => {
            if (r.durationSeconds > 0) return r.durationSeconds;
            if (typeof r.duration === 'number') return r.duration;
            if (typeof r.duration === 'string') {
              const p = r.duration.split(':');
              if (p.length === 2) return +p[0] * 60 + +p[1];
              if (p.length === 3) return +p[0] * 3600 + +p[1] * 60 + +p[2];
            }
            return 0;
          })(),
          distance: Number(r.distanceMeters || r.distance || 0),
          average_heartrate: Number(r.heartRate || 0),
          average_watts: Number(r.power || 0),
        }));
      }
      setLapsCache(prev => ({ ...prev, [id]: laps }));
    } catch {
      setLapsCache(prev => ({ ...prev, [id]: 'error' }));
    } finally {
      loadingRef.current.delete(id);
    }
  }, [lapsCache]);

  // Auto-fetch laps for all sessions when they appear
  useEffect(() => {
    sessions.forEach(s => loadLaps(s));
  }, [sessions]); // eslint-disable-line react-hooks/exhaustive-deps

  // Toggle a session in/out of selectedIds
  const toggleSession = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  // Selected sessions + their laps
  const selectedSessions = useMemo(() =>
    sessions.filter(s => selectedIds.includes(getSessionId(s))),
    [sessions, selectedIds]
  );

  const sport = selectedSessions[0]?.sport || '';

  // Auto-switch metric when sport changes
  useEffect(() => {
    if (!sport) return;
    const s = sport.toLowerCase();
    const isBike = s.includes('ride') || s.includes('cycle') || s.includes('bike') || s.includes('virtual');
    const isSwim = s.includes('swim');
    setMetric(isBike ? 'power' : isSwim ? 'pace' : 'pace');
  }, [sport]);

  // Chart series + data
  const { series, chartData } = useMemo(() => {
    if (selectedSessions.length === 0) return { series: [], chartData: [] };

    const sessionLaps = selectedSessions.map(s => {
      const id = getSessionId(s);
      const raw = Array.isArray(lapsCache[id]) ? lapsCache[id] : [];
      return { session: s, laps: filterWork ? filterWorkLaps(raw) : raw };
    });

    const maxLaps = Math.max(...sessionLaps.map(sl => sl.laps.length), 0);
    if (maxLaps === 0) return { series: [], chartData: [] };

    const data = Array.from({ length: maxLaps }, (_, i) => {
      const point = { lap: i + 1 };
      sessionLaps.forEach((sl, idx) => {
        const v = getLapValue(sl.laps[i], metric, sl.session.sport || sport);
        if (v !== null) point[`s${idx}`] = v;
      });
      return point;
    });

    const sr = sessionLaps.map((sl, idx) => ({
      key: `s${idx}`,
      color: SERIES_COLORS[idx % SERIES_COLORS.length],
      label: fmtDate(sl.session),
      session: sl.session,
    }));

    return { series: sr, chartData: data };
  }, [selectedSessions, lapsCache, metric, filterWork, sport]);

  // Y-axis formatter (pace is inverted for display)
  const yAxisTickFmt = useCallback((val) => {
    if (metric === 'pace') return fmtPaceLabel(val, sport);
    if (metric === 'hr')   return `${Math.round(val)}`;
    if (metric === 'power') return `${Math.round(val)}`;
    return val;
  }, [metric, sport]);

  const isAnyLoading = selectedSessions.some(s => lapsCache[getSessionId(s)] === 'loading');
  const hasData = chartData.length > 0 && series.length > 0;

  return (
    <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2 min-w-0">
          <ChartBarIcon className="w-4 h-4 text-primary flex-shrink-0" />
          <h3 className="text-sm font-bold text-gray-900">Lap Comparison</h3>
          {selectedTitle && selectedTitle !== 'all' && (
            <span className="text-xs text-gray-400 truncate hidden sm:inline">— {selectedTitle}</span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Metric pills */}
          <div className="hidden sm:flex gap-1">
            {METRICS.map(m => (
              <button key={m.id} onClick={() => setMetric(m.id)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all ${metric === m.id ? 'bg-primary text-white border-primary' : 'bg-white text-gray-500 border-gray-200 hover:border-primary/40'}`}>
                {m.label}
              </button>
            ))}
          </div>
          {/* Work-only toggle */}
          <button onClick={() => setFilterWork(v => !v)}
            className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all ${filterWork ? 'bg-primary/10 text-primary border-primary/30' : 'bg-white text-gray-400 border-gray-200'}`}>
            Work laps
          </button>
          {/* Collapse */}
          <button onClick={() => setCollapsed(v => !v)}
            className="w-7 h-7 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-400 transition-colors">
            <svg viewBox="0 0 24 24" className={`w-4 h-4 transition-transform ${collapsed ? '' : 'rotate-180'}`} fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M18 15l-6-6-6 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>

      <AnimatePresence initial={false}>
      {!collapsed && (
        <motion.div key="body" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}>
          <div className="p-4 space-y-4">

            {/* Title selector */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-gray-500 shrink-0">Title:</span>
              <select
                value={selectedTitle || ''}
                onChange={e => setSelectedTitle(e.target.value)}
                className="flex-1 min-w-[140px] max-w-[260px] text-xs rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">— choose title —</option>
                {titles.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              {/* Mobile metric selector */}
              <div className="flex sm:hidden gap-1">
                {METRICS.map(m => (
                  <button key={m.id} onClick={() => setMetric(m.id)}
                    className={`px-2 py-1 rounded-full text-[11px] font-semibold border transition-all ${metric === m.id ? 'bg-primary text-white border-primary' : 'bg-white text-gray-500 border-gray-200'}`}>
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Session chips */}
            {sessions.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-gray-500">{sessions.length} sessions — tap to compare</span>
                  <div className="flex gap-1">
                    <button onClick={() => setSelectedIds(sessions.map(getSessionId))}
                      className="text-[10px] px-2 py-0.5 rounded-full border border-green-200 bg-green-50 text-green-700 hover:bg-green-100">All</button>
                    <button onClick={() => setSelectedIds(sessions.slice(-2).map(getSessionId))}
                      className="text-[10px] px-2 py-0.5 rounded-full border border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100">Last 2</button>
                    <button onClick={() => setSelectedIds([])}
                      className="text-[10px] px-2 py-0.5 rounded-full border border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100">Clear</button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {sessions.map((s, idx) => {
                    const id = getSessionId(s);
                    const checked = selectedIds.includes(id);
                    const color = SERIES_COLORS[sessions.indexOf(s) % SERIES_COLORS.length];
                    const lapStatus = lapsCache[id];
                    const lapCount = Array.isArray(lapStatus) ? lapStatus.length : null;
                    return (
                      <button key={id} onClick={() => toggleSession(id)}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs border transition-all touch-manipulation ${checked ? 'font-semibold shadow-sm' : 'border-gray-200 bg-gray-50 text-gray-500 hover:bg-gray-100'}`}
                        style={checked ? { backgroundColor: `${color}18`, borderColor: `${color}50`, color } : {}}>
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: checked ? color : '#d1d5db' }} />
                        {fmtDate(s)}
                        {lapStatus === 'loading' && <span className="opacity-50 animate-pulse">…</span>}
                        {lapCount !== null && <span className="opacity-60">{lapCount} laps</span>}
                        {lapStatus === 'error' && <span className="text-red-400">!</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Empty states */}
            {!selectedTitle && (
              <div className="text-center py-8 text-sm text-gray-400">
                Choose a title above to compare laps across sessions
              </div>
            )}

            {selectedTitle && sessions.length === 0 && (
              <div className="text-center py-8 text-sm text-gray-400">
                No sessions found for <strong>"{selectedTitle}"</strong>
              </div>
            )}

            {selectedTitle && selectedIds.length === 0 && sessions.length > 0 && (
              <div className="text-center py-6 text-sm text-gray-400">
                Select at least one session above
              </div>
            )}

            {isAnyLoading && !hasData && (
              <div className="flex items-center justify-center py-8 gap-2 text-sm text-gray-400">
                <div className="w-4 h-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                Loading laps…
              </div>
            )}

            {/* Chart */}
            {hasData && (
              <div>
                {/* Legend chips */}
                <div className="flex flex-wrap gap-2 mb-3">
                  {series.map(s => (
                    <span key={s.key} className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-1 rounded-lg"
                      style={{ backgroundColor: `${s.color}12`, color: s.color }}>
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                      {s.label}
                    </span>
                  ))}
                  {isAnyLoading && <span className="text-[11px] text-gray-400 animate-pulse">Loading…</span>}
                </div>

                <div className="w-full overflow-x-auto">
                  <div style={{ minWidth: Math.max(300, chartData.length * 52), height: 220 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: 4, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis
                          dataKey="lap"
                          tickFormatter={v => `L${v}`}
                          tick={{ fontSize: 10, fill: '#9ca3af' }}
                          axisLine={false} tickLine={false}
                        />
                        <YAxis
                          tickFormatter={yAxisTickFmt}
                          tick={{ fontSize: 10, fill: '#9ca3af' }}
                          axisLine={false} tickLine={false}
                          width={metric === 'pace' ? 52 : 36}
                          reversed={metric === 'pace'} // lower pace = faster = better → show at top
                        />
                        <Tooltip
                          content={<LapTooltip series={series} metric={metric} sport={sport} />}
                          cursor={{ stroke: '#e5e7eb', strokeWidth: 1 }}
                        />
                        {series.map(s => (
                          <Line
                            key={s.key}
                            type="monotone"
                            dataKey={s.key}
                            stroke={s.color}
                            strokeWidth={2}
                            dot={{ r: 3, fill: s.color, strokeWidth: 0 }}
                            activeDot={{ r: 5 }}
                            connectNulls={false}
                          />
                        ))}
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Per-session lap table — collapsible on mobile */}
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="text-gray-400 text-left border-b border-gray-100">
                        <th className="py-1.5 pr-3 font-semibold">Lap</th>
                        {series.map(s => (
                          <th key={s.key} className="py-1.5 px-2 font-semibold text-right" style={{ color: s.color }}>{s.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {chartData.map(row => (
                        <tr key={row.lap} className="hover:bg-gray-50 transition-colors">
                          <td className="py-1.5 pr-3 font-semibold text-gray-600">L{row.lap}</td>
                          {series.map(s => (
                            <td key={s.key} className="py-1.5 px-2 text-right font-medium text-gray-800">
                              {row[s.key] != null ? fmtMetricLabel(row[s.key], metric, sport) : <span className="text-gray-300">—</span>}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

          </div>
        </motion.div>
      )}
      </AnimatePresence>
    </div>
  );
}
