import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { motion } from 'framer-motion';
import { SportGlyph } from '../shared/SportIcon';
import { getMonthlyPowerAnalysis } from '../../services/api';
import { useAuth } from '../../context/AuthProvider';
import {
  getSportsWithZoneData,
  SPORT_LABELS,
  SPORT_ICON_COLORS,
} from '../../utils/zoneSportStats';

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

  const availableSports = useMemo(
    () => getSportsWithZoneData(periodMonths),
    [periodMonths]
  );
  const sportCount = availableSports.length;

  // Auto-switch to a sport that has data
  useEffect(() => {
    if (!periodMonths.length) return;
    const sportOk =
      (sport === 'all' && sportCount > 1) ||
      availableSports.includes(sport);
    if (!sportOk) {
      if (availableSports.length > 1) setSport('all');
      else if (availableSports[0]) setSport(availableSports[0]);
    }
  }, [availableSports, sportCount, periodMonths.length, sport]);

  // Auto-select default metric when sport changes; collapse expanded zone
  const prevSportRef = useRef(null);
  useEffect(() => {
    setExpandedZone(null);
    if (prevSportRef.current === sport) return;
    prevSportRef.current = sport;
    if (sport === 'bike')       setMetric('power');
    else if (sport === 'run')   setMetric('pace');
    else if (sport === 'swim')  setMetric('pace');
    else if (sport === 'all')  setMetric('hr');
    else                        setMetric('hr');
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
    } else if (sport !== 'all') {
      totalSecs = periodMonths.reduce((s, m) => s + (Number(m.sportStats?.[sport]?.time) || 0), 0);
      sessions  = periodMonths.reduce((s, m) => s + (Number(m.sportStats?.[sport]?.trainings) || 0), 0);
      zt = aggregateZoneTimes(periodMonths, m => m.sportStats?.[sport]?.hrZones);
      za = aggregateZoneAvgs(periodMonths, m => m.sportStats?.[sport]?.hrZones, 'avgHeartRate', 'heartRateCount');
      zd = getZoneBoundaries(periodMonths, m => m.runningHeartRateZones || m.heartRateZones);
    } else {
      // 'all' — aggregate HR zones from all sports
      totalSecs = periodMonths.reduce((s, m) => s + (Number(m.totalTime) || 0), 0);
      sessions  = periodMonths.reduce((s, m) => s + (Number(m.trainings) || 0), 0);
      const hasSportStats = periodMonths.some((m) => m?.sportStats && Object.keys(m.sportStats).length > 0);
      if (hasSportStats) {
        zt = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        const zaSum = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        const zaCount = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        periodMonths.forEach((m) => {
          if (!m?.sportStats) return;
          Object.values(m.sportStats).forEach((stat) => {
            if (!stat?.hrZones) return;
            for (let z = 1; z <= 5; z++) {
              const t = Number(stat.hrZones[z]?.time) || 0;
              zt[z] += t;
              if (t > 0 && stat.hrZones[z]?.avgHeartRate != null) {
                zaSum[z] += Number(stat.hrZones[z].avgHeartRate) * t;
                zaCount[z] += t;
              }
            }
          });
        });
        za = {};
        for (let z = 1; z <= 5; z++) {
          za[z] = zaCount[z] > 0 ? zaSum[z] / zaCount[z] : null;
        }
      } else {
        const bhr = aggregateZoneTimes(periodMonths, m => m.bikeHrZones || m.hrZones);
        const rhr = aggregateZoneTimes(periodMonths, m => m.runningHrZones);
        zt = { 1:0, 2:0, 3:0, 4:0, 5:0 };
        for (let z = 1; z <= 5; z++) zt[z] = (bhr[z] || 0) + (rhr[z] || 0);
        const bha = aggregateZoneAvgs(periodMonths, m => m.bikeHrZones || m.hrZones, 'avgHeartRate', 'heartRateCount');
        const rha = aggregateZoneAvgs(periodMonths, m => m.runningHrZones, 'avgHeartRate', 'heartRateCount');
        za = {};
        for (let z = 1; z <= 5; z++) {
          const bt = bhr[z] || 0, rt = rhr[z] || 0;
          const ba = bha[z] ?? 0,  ra = rha[z] ?? 0;
          const total = bt + rt;
          za[z] = total > 0 ? (bt * ba + rt * ra) / total : null;
        }
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
        {rng && <div className="text-gray-500 text-[13px]">{metricLabel}: {rng}</div>}
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
      className="flex w-full flex-col self-start rounded-2xl border border-gray-100 bg-white p-3 shadow-sm"
    >
      <ZoneTooltip data={tooltip} />

      {/* ── Header + controls ── */}
      <div className="mb-1.5 flex flex-shrink-0 flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <h3 className="text-sm font-semibold text-gray-800">Zone Distribution</h3>
          {distLabel && (
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${distLabel.cls}`}>
              {distLabel.label}
            </span>
          )}
          {hasData && (
            <>
              <span className="text-[10px] text-gray-500">
                <span className="font-semibold text-gray-700">{fmtDur(totalSecs)}</span> · {sessions} sess
              </span>
              <span className="text-[10px] text-green-700">
                {Math.round(aerobicPct)}% Z1+Z2
              </span>
              <span className="text-[10px] text-orange-700">
                {Math.round(highIntPct)}% Z4+Z5
              </span>
            </>
          )}
        </div>

        <div className="flex flex-shrink-0 items-center gap-1 rounded-lg bg-gray-50 p-0.5">
          {PERIODS.map(p => (
            <button
              key={p.label}
              onClick={() => setPeriod(p.label)}
              className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium transition-colors ${
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

      {/* ── Sport + metric tabs (one row) ── */}
      <div className="mb-1.5 flex flex-shrink-0 flex-wrap items-center gap-1">
        {sportCount > 1 && (
          <button
            onClick={() => setSport('all')}
            className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors ${
              sport === 'all' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            All
          </button>
        )}
        {availableSports.map((key) => {
          const active = sport === key;
          const tint = SPORT_ICON_COLORS[key] || '#6B7280';
          const bgActive = key === 'bike' ? 'bg-blue-500' : key === 'run' ? 'bg-orange-500' : key === 'swim' ? 'bg-cyan-500' : 'bg-gray-800';
          return (
            <button
              key={key}
              onClick={() => setSport(key)}
              className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors ${
                active ? `${bgActive} text-white` : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <SportGlyph sport={key} size={12} color={active ? '#fff' : tint} />
              {SPORT_LABELS[key] || key}
            </button>
          );
        })}
        {sport !== 'all' && (
          <div className="ml-1 flex items-center gap-0.5 border-l border-gray-200 pl-1.5">
            {sport === 'bike' && (
              <button
                onClick={() => setMetric('power')}
                className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                  metric === 'power' ? 'bg-purple-100 text-purple-700' : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                Power
              </button>
            )}
            {(sport === 'run' || sport === 'swim') && (
              <button
                onClick={() => setMetric('pace')}
                className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                  metric === 'pace' ? 'bg-green-100 text-green-700' : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                Pace
              </button>
            )}
            <button
              onClick={() => setMetric('hr')}
              className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                metric === 'hr' ? 'bg-red-100 text-red-700' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              HR
            </button>
          </div>
        )}
      </div>

      {/* ── Zone bars / empty state ── */}
      <div className="flex flex-col">
        {loading && !hasData ? (
          <div className="flex items-center justify-center py-6">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-200 border-t-blue-400" />
          </div>

        ) : !hasData ? (
          <div className="flex flex-col items-center justify-center py-4 text-center">
            <p className="text-[11px] font-medium text-gray-600">No zone data for this period</p>
            <p className="mt-0.5 max-w-[200px] text-[10px] text-gray-400">
              {!allLoaded
                ? 'Loading…'
                : sport === 'bike'
                  ? 'Upload FIT files with power data.'
                  : 'Record sessions with HR data.'}
            </p>
          </div>

        ) : (
          <div className="space-y-0.5">
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
                    className={`flex items-center gap-1.5 rounded-md px-0.5 py-0.5 transition-colors ${
                      t > 0 ? 'cursor-pointer hover:bg-gray-50' : 'cursor-default'
                    } ${isExpanded ? 'bg-gray-50' : ''}`}
                    onClick={() => t > 0 && setExpandedZone(isExpanded ? null : zone.zone)}
                  >
                    <div className="w-[72px] flex-shrink-0">
                      <div className="flex items-center gap-0.5 text-[11px] font-semibold leading-tight text-gray-700">
                        {zone.label}
                        {t > 0 && (
                          <svg
                            className={`h-2 w-2 flex-shrink-0 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                            fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                          </svg>
                        )}
                      </div>
                      {rng && (
                        <div className="truncate text-[9px] leading-tight text-gray-400">{rng}</div>
                      )}
                    </div>

                    <div
                      className="h-3.5 flex-1 overflow-hidden rounded-full bg-gray-100"
                      onMouseEnter={e => onHover(e, zone)}
                      onMouseMove={e  => onMove(e, zone)}
                      onMouseLeave={onLeave}
                    >
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, backgroundColor: zone.color }}
                      />
                    </div>

                    <div className="w-[44px] flex-shrink-0 text-right">
                      <div className="text-[11px] font-semibold leading-tight text-gray-800">{fmtDur(t)}</div>
                      <div className="text-[9px] leading-tight text-gray-400">{Math.round(pct)}%</div>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mb-0.5 ml-[78px] mr-[48px] flex items-center gap-1.5 rounded-md border border-gray-100 bg-white px-2 py-1 text-[10px] text-gray-600 shadow-sm">
                      <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ background: zone.color }} />
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

      {loading && hasData && (
        <div className="mt-1 text-center text-[10px] text-gray-400">Updating…</div>
      )}
    </motion.div>
  );
}
