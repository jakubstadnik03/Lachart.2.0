import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { motion } from 'framer-motion';
import { Bike, WavesLadder } from 'lucide-react';
import { RunnerSvg } from '../shared/SportIcon';
import { getMonthlyPowerAnalysis } from '../../services/api';
import { useAuth } from '../../context/AuthProvider';

// ─── Constants ────────────────────────────────────────────────────────────────

const PERIODS = [
  { label: 'Wk',      week: 0  },   // this week (Mon–Sun)
  { label: 'Last wk', week: -1 },   // previous week
  { label: '1m',      months: 1  },
  { label: '3m',      months: 3  },
  { label: '6m',      months: 6  },
  { label: '12m',     months: 12 },
];

/** Returns { startDate, endDate } for week offset 0 (this week) or -1 (last week). */
function weekBounds(offset = 0) {
  const now = new Date();
  const day = now.getDay(); // 0=Sun
  const monday = new Date(now);
  monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1) + offset * 7);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return { startDate: monday, endDate: sunday };
}

const ZONES = [
  { zone: 1, label: 'Z1', name: 'Recovery',  color: '#60A5FA' },
  { zone: 2, label: 'Z2', name: 'Aerobic',   color: '#34D399' },
  { zone: 3, label: 'Z3', name: 'Tempo',     color: '#FBBF24' },
  { zone: 4, label: 'Z4', name: 'Threshold', color: '#F97316' },
  { zone: 5, label: 'Z5', name: 'VO2max',    color: '#F43F5E' },
];

const CACHE_TTL = 60 * 60 * 1000; // 1 hour

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Return YYYY-MM keys for the last N months, newest first. */
function lastNMonthKeys(n) {
  const keys = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return keys;
}

/** Pick a zone bucket by numeric or string key. */
function pickBucket(map, num) {
  if (!map) return null;
  return map[num] ?? map[String(num)] ?? null;
}

/** Sum zone times (field: "time") across multiple month objects. */
function aggregateZoneTimes(months, accessor) {
  const totals = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const m of months) {
    const zoneMap = accessor(m);
    if (!zoneMap) continue;
    for (let z = 1; z <= 5; z++) {
      const b = pickBucket(zoneMap, z);
      totals[z] += Number(b?.time) || 0;
    }
  }
  return totals;
}

/**
 * Compute per-zone weighted average across months.
 * The server already finalises averages before sending (avgPace = Σ/count),
 * so we must re-weight per month: weightedSum += avg × count, then divide.
 *
 * valueField – field holding the finalised average  (e.g. "avgPace", "avgPower")
 * countField – field holding the total time weight  (e.g. "paceCount", "powerCount")
 */
function aggregateZoneAvgs(months, accessor, valueField, countField) {
  const weightedSums = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const totalCounts  = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const m of months) {
    const zoneMap = accessor(m);
    if (!zoneMap) continue;
    for (let z = 1; z <= 5; z++) {
      const b = pickBucket(zoneMap, z);
      if (!b) continue;
      const avg = Number(b[valueField]) || 0;
      const cnt = Number(b[countField]) || 0;
      if (cnt > 0 && avg > 0) {
        weightedSums[z] += avg * cnt;   // re-weight: avg × time = partial sum
        totalCounts[z]  += cnt;
      }
    }
  }
  const result = {};
  for (let z = 1; z <= 5; z++) {
    result[z] = totalCounts[z] > 0 ? weightedSums[z] / totalCounts[z] : null;
  }
  return result;
}

/** Return zone boundary definitions from the first month that has them. */
function getZoneBoundaries(months, accessor) {
  for (const m of months) {
    const defs = accessor(m);
    if (!defs) continue;
    if (pickBucket(defs, 1)) return defs;
  }
  return null;
}

/** Classify pcts into a training-type label. */
function getDistLabel(pcts) {
  const z1 = pcts[1] || 0, z2 = pcts[2] || 0, z3 = pcts[3] || 0, z4 = pcts[4] || 0, z5 = pcts[5] || 0;
  if (z1 + z5 >= 75) return { label: 'Polarized',       cls: 'text-indigo-600 bg-indigo-50' };
  if (z2 >= 55)       return { label: 'Zone 2 Focus',    cls: 'text-green-600 bg-green-50' };
  if (z1 > z2 && z2 > z3 && z3 > 0)
                      return { label: 'Pyramidal',       cls: 'text-amber-600 bg-amber-50' };
  if (z3 + z4 >= 45)  return { label: 'Threshold-heavy', cls: 'text-orange-600 bg-orange-50' };
  return null;
}

/** Format seconds → "2h 14m" or "45m". */
function fmtDur(secs) {
  if (!secs || secs <= 0) return '—';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  return `${m}m`;
}

/** Format seconds/km → "4:32" pace string. */
function fmtPace(sPerKm) {
  if (!sPerKm || sPerKm <= 0 || !isFinite(sPerKm)) return '∞';
  const mn = Math.floor(sPerKm / 60);
  const sc = Math.round(sPerKm % 60);
  return `${mn}:${String(sc).padStart(2, '0')}`;
}

// ─── Tooltip (Portal) ─────────────────────────────────────────────────────────

function ZoneTooltip({ data }) {
  if (!data) return null;
  const style = {
    position: 'fixed',
    left: data.x + 14,
    top: data.y - 12,
    zIndex: 9999,
    pointerEvents: 'none',
  };
  return ReactDOM.createPortal(
    <div style={style} className="bg-white border border-gray-200 rounded-xl shadow-xl px-3 py-2 text-xs min-w-[160px]">
      {data.content}
    </div>,
    document.body
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ZoneDistributionChart({ selectedAthleteId = null }) {
  const { user } = useAuth();
  const [period, setPeriod]           = useState('3m');
  const [sport, setSport]             = useState('bike'); // 'bike' | 'run' | 'swim' | 'all'
  const [metric, setMetric]           = useState('power'); // 'power' | 'hr' | 'pace'
  const [expandedZone, setExpandedZone] = useState(null); // zone number | null
  const [loadedMonths, setLoadedMonths] = useState(new Map());
  const [weekData, setWeekData]       = useState({}); // keyed 'Wk' | 'Last wk'
  const [loading, setLoading]         = useState(false);
  const [tooltip, setTooltip]         = useState(null);

  // Ref to track what's been fetched — avoids re-fetching mid-render cycles
  const loadedRef  = useRef(new Map());
  const weekLoaded = useRef(new Set()); // tracks fetched week keys

  const isWeekPeriod = PERIODS.find(p => p.label === period)?.week != null;

  // ── Athlete ID ─────────────────────────────────────────────────────────────
  const athleteId = user?.role === 'athlete'
    ? null
    : (selectedAthleteId ?? (user?.role === 'coach' ? user._id : null));

  const cachePrefix = `zdc_${athleteId || 'self'}_`;

  // Reset cache when athleteId changes
  useEffect(() => {
    loadedRef.current  = new Map();
    weekLoaded.current = new Set();
    setLoadedMonths(new Map());
    setWeekData({});
  }, [athleteId]);

  // ── Month keys for the selected period ────────────────────────────────────
  const monthKeys = useMemo(() => {
    const months = PERIODS.find(p => p.label === period)?.months ?? 3;
    return lastNMonthKeys(months);
  }, [period]);

  // ── Load a single month (localStorage → API) ───────────────────────────────
  const loadMonth = useCallback(async (monthKey) => {
    if (loadedRef.current.has(monthKey)) return;
    loadedRef.current.set(monthKey, 'loading');

    // Try localStorage cache
    const lsKey = `${cachePrefix}${monthKey}`;
    try {
      const raw = localStorage.getItem(lsKey);
      if (raw) {
        const { data, ts } = JSON.parse(raw);
        if (Date.now() - ts < CACHE_TTL && data?.monthKey === monthKey) {
          loadedRef.current.set(monthKey, 'done');
          setLoadedMonths(p => new Map(p).set(monthKey, data));
          return;
        }
      }
    } catch (_) { /* ignore */ }

    // Fetch from API
    try {
      const result = await getMonthlyPowerAnalysis(athleteId, monthKey);
      const mData = Array.isArray(result) ? result[0] : null;
      if (mData?.monthKey === monthKey) {
        loadedRef.current.set(monthKey, 'done');
        setLoadedMonths(p => new Map(p).set(monthKey, mData));
        try { localStorage.setItem(lsKey, JSON.stringify({ data: mData, ts: Date.now() })); } catch (_) { /* ignore */ }
      } else {
        // No data for this month — store placeholder to avoid re-fetching
        loadedRef.current.set(monthKey, 'done');
        setLoadedMonths(p => new Map(p).set(monthKey, null));
      }
    } catch (err) {
      console.warn('[ZoneDist] load failed:', monthKey, err?.message);
      loadedRef.current.set(monthKey, 'done');
      setLoadedMonths(p => new Map(p).set(monthKey, null));
    }
  }, [athleteId, cachePrefix]);

  // Load all months needed for the current period
  useEffect(() => {
    if (isWeekPeriod) return; // weeks handled separately below
    const missing = monthKeys.filter(k => !loadedRef.current.has(k));
    if (!missing.length) return;
    setLoading(true);
    Promise.all(missing.map(k => loadMonth(k))).finally(() => setLoading(false));
  }, [monthKeys, loadMonth, isWeekPeriod]);

  // ── Load week data when a week period is selected ─────────────────────────
  useEffect(() => {
    if (!isWeekPeriod) return;
    if (weekLoaded.current.has(period)) return;
    const periodDef = PERIODS.find(p => p.label === period);
    const { startDate, endDate } = weekBounds(periodDef.week);
    setLoading(true);
    getMonthlyPowerAnalysis(athleteId, null, { startDate, endDate })
      .then(raw => {
        weekLoaded.current.add(period);
        const entries = Array.isArray(raw) ? raw : (raw ? [raw] : []);
        setWeekData(prev => ({ ...prev, [period]: entries }));
      })
      .catch(() => {
        setWeekData(prev => ({ ...prev, [period]: [] }));
      })
      .finally(() => setLoading(false));
  }, [period, isWeekPeriod, athleteId]);

  // ── Invalidate current month on training events ───────────────────────────
  useEffect(() => {
    const now = new Date();
    const curKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const invalidate = () => {
      try { localStorage.removeItem(`${cachePrefix}${curKey}`); } catch (_) { /* ignore */ }
      loadedRef.current.delete(curKey);
      setLoadedMonths(p => { const n = new Map(p); n.delete(curKey); return n; });
    };
    window.addEventListener('trainingAdded', invalidate);
    window.addEventListener('trainingUpdated', invalidate);
    window.addEventListener('stravaSyncComplete', invalidate);
    return () => {
      window.removeEventListener('trainingAdded', invalidate);
      window.removeEventListener('trainingUpdated', invalidate);
      window.removeEventListener('stravaSyncComplete', invalidate);
    };
  }, [cachePrefix]);

  // ── Derived data ──────────────────────────────────────────────────────────
  const periodMonths = useMemo(
    () => isWeekPeriod
      ? (weekData[period] || [])
      : monthKeys.map(k => loadedMonths.get(k)).filter(Boolean),
    [isWeekPeriod, weekData, period, monthKeys, loadedMonths]
  );

  const hasBike = periodMonths.some(m => Number(m.bikeTime) > 0 || m.zones || Number(m.bikeTrainings) > 0);
  const hasRun  = periodMonths.some(m => Number(m.runningTime) > 0 || m.runningZoneTimes || Number(m.runningTrainings) > 0);
  const hasSwim = periodMonths.some(m => Number(m.swimmingTime) > 0 || m.swimmingZoneTimes || Number(m.swimmingTrainings) > 0);
  const sportCount = Number(hasBike) + Number(hasRun) + Number(hasSwim);

  // Auto-switch to a sport that has data
  useEffect(() => {
    if (!periodMonths.length) return;
    const sportOk =
      (sport === 'all'  && sportCount > 1) ||
      (sport === 'bike' && hasBike)        ||
      (sport === 'run'  && hasRun)         ||
      (sport === 'swim' && hasSwim);
    if (!sportOk) {
      if (hasBike) setSport('bike');
      else if (hasRun) setSport('run');
      else if (hasSwim) setSport('swim');
    }
  }, [hasBike, hasRun, hasSwim, sportCount, periodMonths.length, sport]);

  // Auto-select default metric when sport changes; collapse expanded zone
  const prevSportRef = useRef(null);
  useEffect(() => {
    setExpandedZone(null);
    if (prevSportRef.current === sport) return;
    prevSportRef.current = sport;
    if (sport === 'bike')       setMetric('power');
    else if (sport === 'run')   setMetric('pace');
    else if (sport === 'swim')  setMetric('pace');
    else /* 'all' */            setMetric('hr');
  }, [sport]);

  // Collapse expanded zone when metric changes
  useEffect(() => { setExpandedZone(null); }, [metric]);

  // ── Build zone data for current sport + metric ────────────────────────────
  const { zoneTimes, zoneAvgs, zoneDefs, totalSecs, sessions } = useMemo(() => {
    if (!periodMonths.length) {
      return { zoneTimes: { 1:0,2:0,3:0,4:0,5:0 }, zoneAvgs: {}, zoneDefs: null, totalSecs: 0, sessions: 0 };
    }
    let zt, za, zd, totalSecs, sessions;

    if (sport === 'bike') {
      totalSecs = periodMonths.reduce((s, m) => s + (Number(m.bikeTime) || 0), 0);
      sessions  = periodMonths.reduce((s, m) => s + (Number(m.bikeTrainings) || 0), 0);
      if (metric === 'power') {
        zt = aggregateZoneTimes(periodMonths, m => m.zones);
        za = aggregateZoneAvgs(periodMonths, m => m.zones, 'avgPower', 'powerCount');
        zd = getZoneBoundaries(periodMonths, m => m.powerZones);
      } else {
        zt = aggregateZoneTimes(periodMonths, m => m.bikeHrZones || m.hrZones);
        za = aggregateZoneAvgs(periodMonths, m => m.bikeHrZones || m.hrZones, 'avgHeartRate', 'heartRateCount');
        zd = getZoneBoundaries(periodMonths, m => m.bikeHeartRateZones || m.heartRateZones);
      }
    } else if (sport === 'run') {
      totalSecs = periodMonths.reduce((s, m) => s + (Number(m.runningTime) || 0), 0);
      sessions  = periodMonths.reduce((s, m) => s + (Number(m.runningTrainings) || 0), 0);
      if (metric === 'pace') {
        zt = aggregateZoneTimes(periodMonths, m => m.runningZoneTimes);
        za = aggregateZoneAvgs(periodMonths, m => m.runningZoneTimes, 'avgPace', 'paceCount');
        zd = getZoneBoundaries(periodMonths, m => m.runningZones);
      } else {
        zt = aggregateZoneTimes(periodMonths, m => m.runningHrZones);
        za = aggregateZoneAvgs(periodMonths, m => m.runningHrZones, 'avgHeartRate', 'heartRateCount');
        zd = getZoneBoundaries(periodMonths, m => m.runningHeartRateZones || m.heartRateZones);
      }
    } else if (sport === 'swim') {
      totalSecs = periodMonths.reduce((s, m) => s + (Number(m.swimmingTime) || 0), 0);
      sessions  = periodMonths.reduce((s, m) => s + (Number(m.swimmingTrainings) || 0), 0);
      if (metric === 'pace') {
        zt = aggregateZoneTimes(periodMonths, m => m.swimmingZoneTimes);
        za = aggregateZoneAvgs(periodMonths, m => m.swimmingZoneTimes, 'avgPace', 'paceCount');
        zd = getZoneBoundaries(periodMonths, m => m.swimmingZones);
      } else {
        zt = aggregateZoneTimes(periodMonths, m => m.swimmingHrZones);
        za = aggregateZoneAvgs(periodMonths, m => m.swimmingHrZones, 'avgHeartRate', 'heartRateCount');
        zd = getZoneBoundaries(periodMonths, m => m.swimmingHeartRateZones || m.heartRateZones);
      }
    } else {
      // 'all' — aggregate HR zones from all sports
      totalSecs = periodMonths.reduce((s, m) => s + (Number(m.totalTime) || 0), 0);
      sessions  = periodMonths.reduce((s, m) => s + (Number(m.trainings) || 0), 0);
      const bhr = aggregateZoneTimes(periodMonths, m => m.bikeHrZones || m.hrZones);
      const rhr = aggregateZoneTimes(periodMonths, m => m.runningHrZones);
      zt = { 1:0, 2:0, 3:0, 4:0, 5:0 };
      for (let z = 1; z <= 5; z++) zt[z] = (bhr[z] || 0) + (rhr[z] || 0);
      // Weighted avg across bike+run HR — compute sums/counts manually
      const bha = aggregateZoneAvgs(periodMonths, m => m.bikeHrZones || m.hrZones, 'avgHeartRate', 'heartRateCount');
      const rha = aggregateZoneAvgs(periodMonths, m => m.runningHrZones, 'avgHeartRate', 'heartRateCount');
      za = {};
      for (let z = 1; z <= 5; z++) {
        const bt = bhr[z] || 0, rt = rhr[z] || 0;
        const ba = bha[z] ?? 0,  ra = rha[z] ?? 0;
        const total = bt + rt;
        za[z] = total > 0 ? (bt * ba + rt * ra) / total : null;
      }
      zd = getZoneBoundaries(periodMonths, m => m.heartRateZones || m.bikeHeartRateZones);
    }

    return { zoneTimes: zt, zoneAvgs: za || {}, zoneDefs: zd, totalSecs, sessions };
  }, [periodMonths, sport, metric]);

  // Zone percentages
  const grandTotal = Object.values(zoneTimes).reduce((a, b) => a + b, 0);
  const zonePcts   = {};
  for (let z = 1; z <= 5; z++) {
    zonePcts[z] = grandTotal > 0 ? ((zoneTimes[z] || 0) / grandTotal) * 100 : 0;
  }

  const hasData    = grandTotal > 0;
  const aerobicPct = (zonePcts[1] || 0) + (zonePcts[2] || 0);
  const highIntPct = (zonePcts[4] || 0) + (zonePcts[5] || 0);
  const distLabel  = hasData ? getDistLabel(zonePcts) : null;
  const allLoaded  = isWeekPeriod
    ? weekLoaded.current.has(period)
    : monthKeys.every(k => loadedRef.current.get(k) === 'done');

  // ── Zone boundary range string ─────────────────────────────────────────────
  const getZoneRange = (zoneNum) => {
    const def = pickBucket(zoneDefs, zoneNum);
    if (!def) return '';
    const minVal = def.min;
    const maxVal = def.max;
    const maxStr = (maxVal === Infinity || maxVal === null || maxVal === undefined)
      ? '∞'
      : Math.round(maxVal);
    const minStr = Math.round(minVal) || 0;

    if (metric === 'power') return `${minStr}–${maxStr} W`;
    if (metric === 'hr')    return `${minStr}–${maxStr} bpm`;
    if (metric === 'pace') {
      // Pace zones: higher number = slower; display fast end → slow end
      const fastStr = maxVal === Infinity || !maxVal ? '∞' : fmtPace(maxVal);
      const slowStr = fmtPace(minVal);
      return `${fastStr}–${slowStr}/km`;
    }
    return '';
  };

  // ── Average value formatter ───────────────────────────────────────────────
  const formatAvg = (avg) => {
    if (avg == null || !isFinite(avg)) return '—';
    if (metric === 'power') return `${Math.round(avg)} W`;
    if (metric === 'hr')    return `${Math.round(avg)} bpm`;
    if (metric === 'pace')  return `${fmtPace(avg)}/km`;
    return String(Math.round(avg));
  };

  // ── Tooltip ───────────────────────────────────────────────────────────────
  const metricLabel = metric === 'power' ? 'Power' : metric === 'pace' ? 'Pace' : 'HR';

  const buildTooltipContent = (zone) => {
    const t   = zoneTimes[zone.zone] || 0;
    const pct = zonePcts[zone.zone]  || 0;
    const rng = getZoneRange(zone.zone);
    return (
      <div className="space-y-1">
        <div className="flex items-center gap-1.5 mb-1">
          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: zone.color }} />
          <span className="font-semibold text-gray-900">{zone.label} · {zone.name}</span>
        </div>
        {rng && <div className="text-gray-500 text-[11px]">{metricLabel}: {rng}</div>}
        <div className="text-gray-800 font-medium">Time: {fmtDur(t)}</div>
        <div className="text-gray-500">Share: {pct.toFixed(1)}%</div>
      </div>
    );
  };

  const onHover = (e, zone) => setTooltip({ x: e.clientX, y: e.clientY, content: buildTooltipContent(zone) });
  const onMove  = (e, zone) => setTooltip(t => t ? { ...t, x: e.clientX, y: e.clientY, content: buildTooltipContent(zone) } : null);
  const onLeave = ()        => setTooltip(null);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4, delay: 0.05 }}
      className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm flex flex-col h-full"
    >
      <ZoneTooltip data={tooltip} />

      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="text-sm font-semibold text-gray-800 shrink-0">Zone Distribution</h3>
          {distLabel && (
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${distLabel.cls}`}>
              {distLabel.label}
            </span>
          )}
        </div>

        {/* Period selector */}
        <div className="flex items-center rounded-lg bg-gray-50 p-0.5 gap-0.5 flex-shrink-0 ml-2">
          {PERIODS.map(p => (
            <button
              key={p.label}
              onClick={() => setPeriod(p.label)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                period === p.label
                  ? 'bg-white text-gray-800 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Sport tabs ── */}
      <div className="flex gap-1.5 mb-2 flex-shrink-0 flex-wrap">
        {sportCount > 1 && (
          <button
            onClick={() => setSport('all')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              sport === 'all' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {/* All sports — 2×2 grid */}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/>
              <rect x="3" y="13" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/>
            </svg>
            All
          </button>
        )}
        {hasBike && (
          <button
            onClick={() => setSport('bike')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              sport === 'bike' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <Bike className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={2} />
            Bike
          </button>
        )}
        {hasRun && (
          <button
            onClick={() => setSport('run')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              sport === 'run' ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <RunnerSvg className="w-3.5 h-3.5 flex-shrink-0" />
            Run
          </button>
        )}
        {hasSwim && (
          <button
            onClick={() => setSport('swim')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              sport === 'swim' ? 'bg-cyan-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <WavesLadder className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={2} />
            Swim
          </button>
        )}
      </div>

      {/* ── Metric sub-tabs ── */}
      {sport !== 'all' && (
        <div className="flex gap-1 mb-3 flex-shrink-0">
          {sport === 'bike' && (
            <button
              onClick={() => setMetric('power')}
              className={`px-2.5 py-0.5 rounded-md text-xs font-medium transition-colors ${
                metric === 'power'
                  ? 'bg-purple-100 text-purple-700 border border-purple-200'
                  : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              Power
            </button>
          )}
          {(sport === 'run' || sport === 'swim') && (
            <button
              onClick={() => setMetric('pace')}
              className={`px-2.5 py-0.5 rounded-md text-xs font-medium transition-colors ${
                metric === 'pace'
                  ? 'bg-green-100 text-green-700 border border-green-200'
                  : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              Pace
            </button>
          )}
          <button
            onClick={() => setMetric('hr')}
            className={`px-2.5 py-0.5 rounded-md text-xs font-medium transition-colors ${
              metric === 'hr'
                ? 'bg-red-100 text-red-700 border border-red-200'
                : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            HR
          </button>
        </div>
      )}

      {/* ── Summary chips ── */}
      {hasData && (
        <div className="flex flex-wrap gap-1.5 mb-3 flex-shrink-0">
          <span className="inline-flex items-center gap-1 rounded-full bg-gray-50 px-2.5 py-1 text-xs text-gray-600">
            <span className="font-semibold text-gray-800">{fmtDur(totalSecs)}</span> total
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-gray-50 px-2.5 py-1 text-xs text-gray-600">
            <span className="font-semibold text-gray-800">{sessions}</span> sessions
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-1 text-xs text-green-700">
            <span className="font-semibold">{Math.round(aerobicPct)}%</span> Z1+Z2
          </span>
          {highIntPct > 4 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2.5 py-1 text-xs text-orange-700">
              <span className="font-semibold">{Math.round(highIntPct)}%</span> Z4+Z5
            </span>
          )}
        </div>
      )}

      {/* ── Zone bars / empty state ── */}
      <div className="flex flex-col flex-1 justify-center min-h-0">
        {loading && !hasData ? (
          /* Loading spinner */
          <div className="flex items-center justify-center py-10">
            <div className="w-6 h-6 border-2 border-gray-200 border-t-blue-400 rounded-full animate-spin" />
          </div>

        ) : !hasData ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center mb-3">
              <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v18h18M7 16l4-5 4 4 4-6" />
              </svg>
            </div>
            <p className="text-xs font-medium text-gray-600 mb-1">No zone data for this period</p>
            <p className="text-xs text-gray-400 max-w-[200px]">
              {!allLoaded
                ? 'Loading…'
                : sport === 'bike'
                  ? 'Upload FIT files with power data to see bike zones.'
                  : 'Record sessions with HR data to see zone distribution.'}
            </p>
          </div>

        ) : (
          /* Zone bars */
          <div className="space-y-1">
            {ZONES.map(zone => {
              const t          = zoneTimes[zone.zone] || 0;
              const pct        = zonePcts[zone.zone]  || 0;
              const rng        = getZoneRange(zone.zone);
              const avg        = zoneAvgs?.[zone.zone] ?? null;
              const isExpanded = expandedZone === zone.zone;
              const hasAvg     = avg != null && isFinite(avg);
              return (
                <div key={zone.zone}>
                  <div
                    className={`flex items-center gap-2 rounded-lg px-1 py-0.5 transition-colors ${
                      t > 0 ? 'cursor-pointer hover:bg-gray-50' : 'cursor-default'
                    } ${isExpanded ? 'bg-gray-50' : ''}`}
                    onClick={() => t > 0 && setExpandedZone(isExpanded ? null : zone.zone)}
                  >
                    {/* Label + range */}
                    <div className="w-[88px] flex-shrink-0">
                      <div className="text-[11px] font-semibold text-gray-700 leading-tight flex items-center gap-1">
                        {zone.label} · {zone.name}
                        {t > 0 && (
                          <svg
                            className={`w-2.5 h-2.5 text-gray-400 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`}
                            fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                          </svg>
                        )}
                      </div>
                      {rng && (
                        <div className="text-[10px] text-gray-400 truncate leading-tight">{rng}</div>
                      )}
                    </div>

                    {/* Progress bar */}
                    <div
                      className="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden"
                      onMouseEnter={e => onHover(e, zone)}
                      onMouseMove={e  => onMove(e, zone)}
                      onMouseLeave={onLeave}
                    >
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, backgroundColor: zone.color }}
                      />
                    </div>

                    {/* Time + percentage */}
                    <div className="w-[52px] text-right flex-shrink-0">
                      <div className="text-[11px] font-semibold text-gray-800 leading-tight">{fmtDur(t)}</div>
                      <div className="text-[10px] text-gray-400 leading-tight">{Math.round(pct)}%</div>
                    </div>
                  </div>

                  {/* Expanded average row */}
                  {isExpanded && (
                    <div className="ml-[96px] mr-[60px] mb-1 flex items-center gap-2 text-[11px] text-gray-600 bg-white border border-gray-100 rounded-lg px-3 py-1.5 shadow-sm">
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ background: zone.color }}
                      />
                      <span className="text-gray-500">Avg {metricLabel}:</span>
                      <span className="font-semibold text-gray-800">
                        {hasAvg ? formatAvg(avg) : '—'}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Subtle updating indicator */}
      {loading && hasData && (
        <div className="mt-2 text-center text-[10px] text-gray-400">Updating…</div>
      )}
    </motion.div>
  );
}
