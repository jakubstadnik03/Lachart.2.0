import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';
import { ChartBarIcon, ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline';
import { useNavigate } from 'react-router-dom';
import { getStravaActivityDetail, getFitTraining } from '../../services/api';
import { SearchableSelect } from '../SearchableSelect';
import { useCategories } from '../../context/CategoryContext';

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

// ─── Per-session lap bar chart ────────────────────────────────────────────────

// Same palette as TrainingStats — rank-shaded violet for plain laps,
// rank-shaded amber for laps that have a measured lactate value.
const VIOLET_PALETTE  = ["#4c1d95","#5b21b6","#6d28d9","#7c3aed","#8b5cf6","#a78bfa","#c4b5fd"];
const LACTATE_PALETTE = ["#92400e","#b45309","#d97706","#f59e0b","#fbbf24","#fcd34d","#fde68a"];

function fmtLapDuration(sec) {
  if (!sec || sec <= 0) return '—';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
function fmtLapDistance(m) {
  if (!m || m <= 0) return null;
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(m % 1000 === 0 ? 0 : 2)} km`;
}

function LapBars({ laps, sport, metric, color, scaleMin, scaleMax }) {
  const [hover, setHover] = useState(null); // { idx, x, y }
  const wrapperRef = useRef(null);

  // Compute lap durations/distances + metric values
  const items = useMemo(() => laps.map((lap, i) => {
    const dur  = Number(lap.elapsed_time || lap.totalElapsedTime || lap.duration || 0);
    const dist = Number(lap.distance || lap.totalDistance || 0);
    const val  = getLapValue(lap, metric, sport);
    const lactate = lap.lactate != null ? Number(lap.lactate) : null;
    return { i, dur, dist, val, lactate };
  }), [laps, metric, sport]);

  // Width fallback chain:
  //   1. every lap has distance > 0 → proportional by distance
  //   2. otherwise, every lap has duration > 0 → proportional by duration
  //   3. anything missing → equal widths
  // The previous "any lap has distance" check made zero-distance laps
  // collapse to the 0.5% minimum, which looked broken on bike sessions
  // where some laps are stops / pauses.
  const allHaveDist = items.length > 0 && items.every(x => x.dist > 0);
  const allHaveDur  = items.length > 0 && items.every(x => x.dur  > 0);
  const useDist   = allHaveDist;
  const useDur    = !allHaveDist && allHaveDur;
  const totalDist = useDist ? items.reduce((s, x) => s + x.dist, 0) : 0;
  const totalDur  = useDur  ? items.reduce((s, x) => s + x.dur,  0) : 0;

  // Use the global (cross-session) scale when provided so bars across cards
  // share a y-axis and a slow lap visibly looks slow next to a fast one.
  // Fall back to per-card min/max for standalone use.
  const vals = items.map(x => x.val).filter(v => v != null && v > 0);
  if (vals.length === 0) return null;
  const minV = scaleMin != null ? scaleMin : Math.min(...vals);
  const maxV = scaleMax != null ? scaleMax : Math.max(...vals);
  const span = Math.max(maxV - minV, 1);
  const isPaceLike = metric === 'pace';

  // Per-session rank: darkest shade goes to the "best" lap (highest power/HR,
  // lowest pace), lightest to the weakest. Mirrors TrainingStats' VerticalBar.
  const ranked = [...items]
    .filter(x => x.val != null && x.val > 0)
    .sort((a, b) => isPaceLike ? a.val - b.val : b.val - a.val);
  const rankByIdx = new Map(ranked.map((x, r) => [x.i, r]));

  const totalForShares = useDist ? totalDist : (useDur ? totalDur : 0);
  const equalShare = 100 / Math.max(items.length, 1);

  // Y-axis ticks (5 evenly spaced labels between min and max).
  const yTicks = Array.from({ length: 5 }, (_, i) => minV + ((maxV - minV) * (4 - i)) / 4);
  const fmtTick = (v) => {
    if (!Number.isFinite(v) || v <= 0) return '';
    if (metric === 'pace') return fmtPaceLabel(v, sport).replace(/\s.*$/, '');
    if (metric === 'hr')   return `${Math.round(v)}`;
    return `${Math.round(v)}`;
  };
  const unitLabel = metric === 'pace'
    ? (String(sport || '').toLowerCase().includes('swim') ? '/100m' : '/km')
    : (metric === 'hr' ? 'bpm' : 'W');
  const Y_AXIS_W = 42;
  const CHART_H = 140;

  return (
    <div className="relative">
      <div className="flex" style={{ height: CHART_H }}>
        {/* Y-axis labels */}
        <div className="relative shrink-0 select-none" style={{ width: Y_AXIS_W, height: CHART_H }}>
          {yTicks.map((v, i) => (
            <span key={i}
              className="absolute right-1 text-[9px] text-gray-400 tabular-nums leading-none"
              style={{ top: `${(i / 4) * 100}%`, transform: 'translateY(-50%)' }}>
              {fmtTick(v)}
            </span>
          ))}
          <span className="absolute right-1 bottom-0 text-[9px] text-gray-400 leading-none">{unitLabel}</span>
        </div>
        {/* Bars */}
        <div ref={wrapperRef} className="flex items-end gap-[2px] flex-1 min-w-0 border-l border-gray-100"
          onMouseLeave={() => setHover(null)}>
          {items.map((x, idx) => {
            const raw = useDist ? x.dist : (useDur ? x.dur : 0);
            const share = totalForShares > 0
              ? (raw / totalForShares) * 100
              : equalShare;
            const widthPct = Math.max(share, equalShare * 0.5);
            const h = x.val != null && x.val > 0
              ? (isPaceLike ? ((maxV - x.val) / span) : ((x.val - minV) / span)) * 0.85 + 0.15
              : 0;
            const rank = rankByIdx.get(idx) ?? idx;
            const hasLactate = x.lactate != null && x.lactate > 0;
            const palette = hasLactate ? LACTATE_PALETTE : VIOLET_PALETTE;
            const bg = palette[Math.min(rank, palette.length - 1)];
            const isHovered = hover && hover.idx === idx;
            return (
              <div
                key={idx}
                className="relative h-full cursor-pointer"
                style={{ flexBasis: `${widthPct}%`, flexGrow: 0, flexShrink: 1, minWidth: 3 }}
                onMouseEnter={(e) => {
                  const rect = wrapperRef.current?.getBoundingClientRect();
                  const bx = e.currentTarget.getBoundingClientRect();
                  setHover({ idx, x: bx.left - (rect?.left || 0) + bx.width / 2, y: bx.top - (rect?.top || 0) });
                }}
              >
                <div
                  className="absolute bottom-0 left-0 right-0 rounded-t-md transition-opacity"
                  style={{
                    height: `${Math.max(h * 100, 4)}%`,
                    backgroundColor: bg,
                    opacity: isHovered ? 1 : 0.85,
                    boxShadow: isHovered ? `0 0 0 1.5px ${bg}, 0 4px 12px ${bg}55` : undefined,
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>
      {hover && (() => {
        const x = items[hover.idx];
        return (
          <div className="absolute pointer-events-none z-20 px-2 py-1.5 rounded-lg shadow-lg bg-white border border-gray-200 text-[10px] leading-tight"
            style={{ left: hover.x, top: Math.max(hover.y - 10, 0), transform: 'translate(-50%, -100%)', minWidth: 110 }}>
            <div className="font-bold text-gray-800 mb-0.5">Lap #{x.i + 1}</div>
            {x.dist > 0 && <div className="flex justify-between gap-2"><span className="text-gray-400">Distance</span><span className="font-semibold text-gray-700">{fmtLapDistance(x.dist)}</span></div>}
            {x.dur > 0 && <div className="flex justify-between gap-2"><span className="text-gray-400">Time</span><span className="font-semibold text-gray-700">{fmtLapDuration(x.dur)}</span></div>}
            {x.val != null && <div className="flex justify-between gap-2"><span className="text-gray-400">{metric === 'pace' ? 'Pace' : metric === 'hr' ? 'HR' : 'Power'}</span><span className="font-semibold text-gray-700">{fmtMetricLabel(x.val, metric, sport)}</span></div>}
            {x.lactate != null && <div className="flex justify-between gap-2"><span className="text-gray-400">Lactate</span><span className="font-bold" style={{ color: '#d97706' }}>{x.lactate.toFixed(1)} mmol/L</span></div>}
          </div>
        );
      })()}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

// Parent already passes the curated Training-collection set (exports +
// regular records with explicit titles). Accept everything that has a
// title and at least one result/lap so the dropdown matches the dashboard
// Training History.
function isAnnotatedExport(t) {
  if (!t) return false;
  const hasTitle = !!((t.titleManual || t.title) && String(t.titleManual || t.title).trim());
  const hasResults = Array.isArray(t.results) && t.results.length > 0;
  const hasLaps    = Array.isArray(t.laps)    && t.laps.length    > 0;
  return hasTitle && (hasResults || hasLaps);
}

export default function LapComparison({ trainings: rawTrainings, selectedTitle: externalTitle, setSelectedTitle: setExternalTitle }) {
  const trainings = useMemo(
    () => (Array.isArray(rawTrainings) ? rawTrainings.filter(isAnnotatedExport) : []),
    [rawTrainings]
  );
  const { categories } = useCategories();
  const navigate = useNavigate();

  // Open the full activity modal (training-calendar route resolves to
  // ActivityFullModal for any id prefix — strava-, fit-, regular-, training-).
  const navigateToSession = useCallback((session) => {
    if (!session) return;
    const sid = String(session.id || session._id || '');
    let target;
    if (session.type === 'strava' || session.source === 'strava' || session.stravaId) {
      target = `strava-${session.stravaId || session.id || sid.replace(/^strava-/, '')}`;
    } else if (session.type === 'fit' || session.source === 'fit') {
      target = `fit-${session._id || sid.replace(/^fit-/, '')}`;
    } else if (sid.startsWith('strava-') || sid.startsWith('fit-') || sid.startsWith('regular-') || sid.startsWith('training-')) {
      target = sid;
    } else if (session._id) {
      target = `regular-${session._id}`;
    } else {
      return;
    }
    navigate(`/training-calendar/${encodeURIComponent(target)}`);
  }, [navigate]);

  const [localTitle, setLocalTitle]       = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedIds, setSelectedIds]   = useState([]);
  const [lapsCache, setLapsCache]       = useState({}); // id -> laps[] | 'loading' | 'error'
  const [metric, setMetric]             = useState('pace');
  const [filterWork, setFilterWork]     = useState(true);
  const [collapsed, setCollapsed]       = useState(false);
  const loadingRef = useRef(new Set());
  // Filled by the per-card bar block; the line chart below reads it so both
  // share the same y-axis bounds (max across every session of the title).
  const sharedRangeRef = useRef({ min: null, max: null });

  // Use external title if provided (keeps in sync with TrainingGraph selector)
  const selectedTitle = externalTitle !== undefined && externalTitle !== null ? externalTitle : localTitle;
  const setSelectedTitle = useCallback((v) => {
    const next = v ?? '';
    if (setExternalTitle) setExternalTitle(next);
    setLocalTitle(next);
    setSelectedIds([]); // reset selection on title change
  }, [setExternalTitle]);

  // Trainings narrowed by category
  const categoryFiltered = useMemo(() => {
    if (selectedCategory === 'all') return trainings;
    return trainings.filter(t => t.category === selectedCategory);
  }, [trainings, selectedCategory]);

  // Available categories (only those with at least one annotated export)
  const categoryOptions = useMemo(() => {
    const counts = new Map();
    trainings.forEach(t => {
      if (t.category) counts.set(t.category, (counts.get(t.category) || 0) + 1);
    });
    // Always list every defined category so the dropdown matches the global
    // category palette (LT1 / LT2 / Tempo / VO2max / Hills / Zone 2 / Endurance),
    // even when the user hasn't tagged anything in some of them yet.
    return [
      { value: 'all', label: 'All categories', count: trainings.length },
      ...categories.map(c => ({
        value: c.id,
        label: c.label,
        color: c.color,
        count: counts.get(c.id) || 0,
      })),
    ];
  }, [trainings, categories]);

  // Title options derived from the category-filtered set
  const titleOptions = useMemo(() => {
    const set = new Map();
    categoryFiltered.forEach(t => {
      const title = t.titleManual || t.title;
      if (title) set.set(title, (set.get(title) || 0) + 1);
    });
    return Array.from(set.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([title, count]) => ({ value: title, label: `${title} (${count})` }));
  }, [categoryFiltered]);

  // Reset title if it no longer exists after category narrows the set
  useEffect(() => {
    if (selectedTitle && !titleOptions.some(o => o.value === selectedTitle)) {
      setSelectedTitle('');
    }
  }, [titleOptions, selectedTitle, setSelectedTitle]);

  // Sessions matching selectedTitle, sorted oldest→newest
  const sessions = useMemo(() => {
    if (!selectedTitle || selectedTitle === 'all') return [];
    return categoryFiltered
      .filter(t => (t.titleManual || t.title) === selectedTitle)
      .sort((a, b) => getSessionDate(a) - getSessionDate(b));
  }, [categoryFiltered, selectedTitle]);

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
        // Manual training — convert each result to the lap shape that
        // getLapValue() expects. The tricky part is that for run/swim the
        // `power` field stores pace seconds (sec/km or sec/100m), and
        // `duration` may store *distance* (km or m) when durationType is
        // 'distance'. Normalize to: distance in meters, elapsed_time in
        // seconds, average_speed in m/s, average_watts only for bike.
        const sportStr = String(session.sport || '').toLowerCase();
        const isSwim   = sportStr.includes('swim');
        const isRun    = sportStr.includes('run') || sportStr.includes('walk') || sportStr.includes('hike');
        const isBike   = sportStr.includes('ride') || sportStr.includes('cycle') || sportStr.includes('bike');
        const parseMaybeTime = (v) => {
          if (v == null || v === '') return 0;
          if (typeof v === 'number') return v;
          if (typeof v === 'string') {
            const s = v.trim();
            if (s.includes(':')) {
              const p = s.split(':').map(Number);
              if (p.length === 2) return p[0] * 60 + (p[1] || 0);
              if (p.length === 3) return p[0] * 3600 + (p[1] || 0) * 60 + (p[2] || 0);
            }
            const n = Number(s);
            return isNaN(n) ? 0 : n;
          }
          return 0;
        };
        const parseDistMeters = (v) => {
          if (v == null || v === '') return 0;
          if (typeof v === 'number') return v >= 50 && Number.isInteger(v) ? v : v * 1000;
          if (typeof v === 'string') {
            const s = v.trim().toLowerCase();
            const km = s.match(/^([\d.]+)\s*km$/); if (km) return parseFloat(km[1]) * 1000;
            const m  = s.match(/^([\d.]+)\s*m$/);  if (m)  return parseFloat(m[1]);
            const n = parseFloat(s);
            if (isNaN(n)) return 0;
            return n >= 50 && Number.isInteger(n) ? n : n * 1000;
          }
          return 0;
        };

        laps = session.results.map(r => {
          // Distance in meters
          let distM = Number(r.distanceMeters || 0);
          if (!distM && r.durationType === 'distance') distM = parseDistMeters(r.duration);
          if (!distM && r.distance) distM = parseDistMeters(r.distance);

          // Pace in seconds (per km for run, per 100m for swim) lives in `power`
          const paceSec = (isRun || isSwim) ? parseMaybeTime(r.power) : 0;

          // Elapsed time
          let elapsed = Number(r.durationSeconds || 0);
          if (!elapsed && r.durationType !== 'distance') elapsed = parseMaybeTime(r.duration);
          if (!elapsed && paceSec > 0 && distM > 0) {
            elapsed = isSwim ? paceSec * (distM / 100) : paceSec * (distM / 1000);
          }

          // average_speed (m/s) — let getLapValue fall through to it
          let avgSpeed = 0;
          if (paceSec > 0) avgSpeed = isSwim ? (100 / paceSec) : (1000 / paceSec);
          else if (elapsed > 0 && distM > 0) avgSpeed = distM / elapsed;

          return {
            elapsed_time: elapsed,
            distance: distM,
            average_heartrate: Number(r.heartRate || 0),
            average_watts: isBike ? Number(r.power || 0) : 0,
            average_speed: avgSpeed,
            lactate: r.lactate != null ? Number(r.lactate) : null,
            lapNumber: r.interval,
          };
        });
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

            {/* Filters — same SearchableSelect design as TrainingStats */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-gray-500 shrink-0">Category:</span>
              <SearchableSelect
                value={selectedCategory}
                options={categoryOptions}
                onChange={(v) => { setSelectedCategory(v || 'all'); }}
                placeholder="All categories"
              />
              <span className="text-xs font-semibold text-gray-500 shrink-0 ml-1">Title:</span>
              <SearchableSelect
                value={selectedTitle || ''}
                options={titleOptions}
                onChange={(v) => setSelectedTitle(v)}
                placeholder={titleOptions.length ? '— choose title —' : 'No annotated titles'}
              />
              {/* Mobile metric selector */}
              <div className="flex sm:hidden gap-1 ml-auto">
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

                {/* Per-session lap bars — full session info + clickable to
                    open the activity. Matches the Dashboard Training History
                    bar style (140px tall, proportional widths, lactate amber).
                    Y-axis scale is shared across all selected sessions so
                    differences between same-workout repeats are visible. */}
                <div className="mb-4 space-y-3">{(() => {
                  // Compute shared min/max across EVERY session of the title
                  // (not just the selected ones) so the y-axis stays stable
                  // when the user toggles sessions on/off. Add a few percent
                  // headroom so the tallest bar never touches the top edge.
                  const allVals = [];
                  sessions.forEach((sess) => {
                    const id = getSessionId(sess);
                    const raw = Array.isArray(lapsCache[id]) ? lapsCache[id] : [];
                    const laps = filterWork ? filterWorkLaps(raw) : raw;
                    laps.forEach(l => {
                      const v = getLapValue(l, metric, sess.sport || sport);
                      if (v != null && v > 0) allVals.push(v);
                    });
                  });
                  let sharedMin = allVals.length ? Math.min(...allVals) : null;
                  let sharedMax = allVals.length ? Math.max(...allVals) : null;
                  if (sharedMin != null && sharedMax != null) {
                    const pad = Math.max((sharedMax - sharedMin) * 0.08, sharedMax * 0.03, 1);
                    sharedMin = Math.max(0, sharedMin - pad * 0.4);
                    sharedMax = sharedMax + pad;
                  }
                  // Stash on the parent component scope via a closure-friendly
                  // ref so the line chart below can use the same bounds.
                  sharedRangeRef.current = { min: sharedMin, max: sharedMax };
                  return series.map((s) => {
                    const id = getSessionId(s.session);
                    const raw = Array.isArray(lapsCache[id]) ? lapsCache[id] : [];
                    const laps = filterWork ? filterWorkLaps(raw) : raw;
                    if (laps.length === 0) return null;

                    // Aggregate session totals from the laps shown.
                    const totalDist = laps.reduce((sum, l) => sum + Number(l.distance || l.totalDistance || 0), 0);
                    const totalDur  = laps.reduce((sum, l) => sum + Number(l.elapsed_time || l.totalElapsedTime || l.duration || 0), 0);
                    const hrVals    = laps.map(l => Number(l.average_heartrate || l.averageHeartRate || l.avgHR || 0)).filter(v => v > 0);
                    const avgHr     = hrVals.length ? Math.round(hrVals.reduce((a, b) => a + b, 0) / hrVals.length) : null;
                    const laVals    = laps.map(l => (l.lactate != null ? Number(l.lactate) : null)).filter(v => v != null);
                    const avgLa     = laVals.length ? (laVals.reduce((a, b) => a + b, 0) / laVals.length).toFixed(1) : null;
                    const valVals   = laps.map(l => getLapValue(l, metric, s.session.sport || sport)).filter(v => v != null && v > 0);
                    const avgVal    = valVals.length ? valVals.reduce((a, b) => a + b, 0) / valVals.length : null;

                    const distLabel = totalDist > 0 ? (totalDist >= 1000 ? `${(totalDist/1000).toFixed(1)} km` : `${Math.round(totalDist)} m`) : null;
                    const durLabel  = totalDur > 0 ? fmtLapDuration(totalDur) : null;

                    return (
                      <div
                        key={s.key}
                        role="button"
                        tabIndex={0}
                        onClick={() => navigateToSession(s.session)}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigateToSession(s.session); } }}
                        className="rounded-xl border border-gray-100 bg-white px-4 py-3 cursor-pointer hover:border-gray-200 hover:shadow-sm transition-all group"
                      >
                        {/* Header row: date + sport + open button */}
                        <div className="flex items-center justify-between mb-2 gap-3">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                            <span className="text-[13px] font-bold text-gray-900">{s.label}</span>
                            {s.session.sport && <span className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold">{String(s.session.sport).toLowerCase()}</span>}
                            <span className="text-[10px] text-gray-400">· {laps.length} {laps.length === 1 ? 'lap' : 'laps'}</span>
                          </div>
                          <ArrowTopRightOnSquareIcon className="w-4 h-4 text-gray-300 group-hover:text-primary transition-colors flex-shrink-0" />
                        </div>

                        {/* Totals row */}
                        <div className="flex flex-wrap gap-x-4 gap-y-1 mb-2 text-[11px]">
                          {distLabel && <div><span className="text-gray-400">Distance </span><span className="font-bold text-gray-700">{distLabel}</span></div>}
                          {durLabel  && <div><span className="text-gray-400">Time </span><span className="font-bold text-gray-700">{durLabel}</span></div>}
                          {avgVal != null && <div><span className="text-gray-400">{metric === 'pace' ? 'Avg pace ' : metric === 'hr' ? 'Avg HR ' : 'Avg power '}</span><span className="font-bold text-gray-700">{fmtMetricLabel(avgVal, metric, s.session.sport || sport)}</span></div>}
                          {avgHr != null && metric !== 'hr' && <div><span className="text-gray-400">Avg HR </span><span className="font-bold text-gray-700">{avgHr} bpm</span></div>}
                          {avgLa != null && <div><span className="text-gray-400">Avg lactate </span><span className="font-bold" style={{ color: '#d97706' }}>{avgLa} mmol/L</span></div>}
                        </div>

                        {/* Bars */}
                        <div onClick={(e) => e.stopPropagation()}>
                          <LapBars laps={laps} sport={s.session.sport || sport} metric={metric} color={s.color} scaleMin={sharedMin} scaleMax={sharedMax} />
                        </div>
                      </div>
                    );
                  });
                })()}</div>

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
                          domain={[
                            sharedRangeRef.current.min != null ? sharedRangeRef.current.min : 'auto',
                            sharedRangeRef.current.max != null ? sharedRangeRef.current.max : 'auto',
                          ]}
                          allowDataOverflow={false}
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
