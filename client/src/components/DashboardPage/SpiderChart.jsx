"use client";
import React, { useState, useEffect, useMemo, useRef } from "react";
import { Radar } from "react-chartjs-2";
import { useNavigate } from "react-router-dom";
import api from "../../services/api";
import { useAuth } from "../../context/AuthProvider";
import {
  Chart as ChartJS,
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
} from "chart.js";

ChartJS.register(RadialLinearScale, PointElement, LineElement, Filler, Tooltip, Legend);

// ── Bike axes ─────────────────────────────────────────────────────────────────
const BIKE_KEYS = ['sprint5s', 'attack1min', 'vo2max5min', 'threshold20min', 'endurance60min'];
const BIKE_AXES = [
  { id: 'sprint5s',       label: '5s',    name: 'Sprint',    unit: 'W' },
  { id: 'attack1min',     label: '1min',  name: 'Attack',    unit: 'W' },
  { id: 'vo2max5min',     label: '5min',  name: 'VO₂max',    unit: 'W' },
  { id: 'threshold20min', label: '20min', name: 'Threshold', unit: 'W' },
  { id: 'endurance60min', label: '60min', name: 'Endurance', unit: 'W' },
];

// ── Run axes ──────────────────────────────────────────────────────────────────
const RUN_AXES = [
  { id: 'run400m',  label: '400m',  name: 'Sprint',    unit: '/km', minDist: 200,   maxDist: 700   },
  { id: 'run1km',   label: '1km',   name: '1km',       unit: '/km', minDist: 700,   maxDist: 2500  },
  { id: 'run5km',   label: '5km',   name: '5km',       unit: '/km', minDist: 2500,  maxDist: 9000  },
  { id: 'run10km',  label: '10km',  name: '10km',      unit: '/km', minDist: 9000,  maxDist: 18000 },
  { id: 'runHalf',  label: 'Half+', name: 'Endurance', unit: '/km', minDist: 18000, maxDist: null  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Parse "YYYY-MM" key into a LOCAL-timezone Date (1st of month).
 * Avoids the UTC-midnight bug: new Date('2024-03-01') is interpreted as
 * midnight UTC and renders as Feb 29 in UTC+1/+2 timezones.
 */
function mkToLocalDate(mk) {
  const [y, m] = mk.split('-').map(Number);
  return new Date(y, m - 1, 1);
}

/**
 * Format a date string / Date object without timezone shift.
 * ISO date-only strings ('2024-03-15') must not be passed to new Date()
 * directly — they parse as UTC midnight which shifts a day backwards in EU.
 */
function fmtDate(dateVal, opts = { month: 'short', day: 'numeric', year: 'numeric' }) {
  if (!dateVal) return '—';
  let d;
  if (dateVal instanceof Date) {
    d = dateVal;
  } else {
    const s = String(dateVal);
    // Full ISO with time-zone info → safe to pass directly
    if (s.includes('T') || s.includes('Z')) {
      d = new Date(s);
    } else {
      // Date-only 'YYYY-MM-DD' → parse as local midnight to avoid day shift
      const [y, mo, day] = s.split('-').map(Number);
      d = new Date(y, (mo || 1) - 1, day || 1);
    }
  }
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-US', opts);
}

function parseDurSec(v) {
  if (!v && v !== 0) return 0;
  if (typeof v === 'number') return v;
  const s = String(v);
  const parts = s.split(':');
  if (parts.length === 2) return (parseInt(parts[0], 10) || 0) * 60 + (parseFloat(parts[1]) || 0);
  if (parts.length === 3) return (parseInt(parts[0], 10) || 0) * 3600 + (parseInt(parts[1], 10) || 0) * 60 + (parseFloat(parts[2]) || 0);
  return parseFloat(s) || 0;
}

function fmtPace(secPerKm) {
  if (!secPerKm || secPerKm <= 0) return '—';
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Extract numeric value from allTime / compare entry (may be object or number). */
function extractVal(v) {
  if (v == null) return 0;
  if (typeof v === 'object') return Number(v.value || 0);
  return Number(v || 0);
}

/** Compute run pace metrics from training objects (manual training form data). */
function computeRunMetrics(trainings) {
  const runT = (trainings || []).filter(t =>
    t.sport === 'run' || t.sport === 'running'
  );

  const intervals = [];
  runT.forEach(training => {
    const date = new Date(training.date || training.timestamp || Date.now());
    (training.results || []).forEach(r => {
      if (r.intervalType && !['work', undefined, null, ''].includes(r.intervalType)) return;
      if (r.isRecovery) return;

      const distMeters = parseFloat(r.distanceMeters) || 0;
      const durSec = parseDurSec(r.durationSeconds || r.duration);

      let paceSecPerKm = 0;
      const rawPower = r.power != null ? String(r.power) : '';
      if (rawPower.includes(':')) {
        paceSecPerKm = parseDurSec(rawPower);
      } else if (rawPower && !isNaN(parseFloat(rawPower))) {
        paceSecPerKm = parseFloat(rawPower);
      } else if (distMeters > 0 && durSec > 0) {
        paceSecPerKm = durSec / (distMeters / 1000);
      }

      // Infer distance from pace+duration if missing
      let effDist = distMeters;
      if (effDist === 0 && paceSecPerKm > 60 && durSec > 0) {
        effDist = (durSec / paceSecPerKm) * 1000;
      }

      // Sanity: pace must be realistic (2:00–15:00 /km = 120–900 sec/km)
      if (paceSecPerKm >= 120 && paceSecPerKm <= 900 && effDist > 0) {
        intervals.push({ date, distMeters: effDist, paceSecPerKm, trainingId: training._id });
      }
    });
  });

  const getBest = (list, axis) => {
    const f = list.filter(i => {
      if (i.distMeters < axis.minDist) return false;
      if (axis.maxDist !== null && i.distMeters > axis.maxDist) return false;
      return true;
    });
    if (!f.length) return null;
    return f.reduce((a, b) => a.paceSecPerKm < b.paceSecPerKm ? a : b);
  };

  const now = new Date();
  const ago90 = new Date(now - 90 * 86400000);
  const ago30 = new Date(now - 30 * 86400000);

  const allTimeBest = {}, best90 = {}, best30 = {};
  const monthlyBests = {};

  RUN_AXES.forEach(axis => {
    const a = getBest(intervals, axis);
    const b90 = getBest(intervals.filter(i => i.date >= ago90), axis);
    const b30 = getBest(intervals.filter(i => i.date >= ago30), axis);
    allTimeBest[axis.id] = a ? a.paceSecPerKm : null;
    best90[axis.id] = b90 ? b90.paceSecPerKm : null;
    best30[axis.id] = b30 ? b30.paceSecPerKm : null;
  });

  // Monthly
  intervals.forEach(i => {
    const mk = `${i.date.getFullYear()}-${String(i.date.getMonth() + 1).padStart(2, '0')}`;
    if (!monthlyBests[mk]) monthlyBests[mk] = {};
    RUN_AXES.forEach(axis => {
      if (i.distMeters >= axis.minDist && (axis.maxDist === null || i.distMeters <= axis.maxDist)) {
        if (!monthlyBests[mk][axis.id] || i.paceSecPerKm < monthlyBests[mk][axis.id]) {
          monthlyBests[mk][axis.id] = i.paceSecPerKm;
        }
      }
    });
  });

  const hasData = Object.values(allTimeBest).some(v => v !== null);

  return { allTimeBest, compareBest: { '90days': best90, '30days': best30 }, monthlyBests, hasData };
}

/** Validate bike power metrics API response shape. */
function isBikePayload(m) {
  if (!m || typeof m !== 'object') return false;
  if (typeof m.error === 'string' && m.error) return false;
  if (!m.allTime || typeof m.allTime !== 'object') return false;
  return BIKE_KEYS.every(k => m.allTime[k] !== undefined && m.allTime[k] !== null);
}

// ── Palette for monthly datasets ─────────────────────────────────────────────
const MONTH_COLORS = [
  '#2596be', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1',
];

// ── Component ─────────────────────────────────────────────────────────────────
export default function SpiderChart({
  trainings = [],
  userTrainings = [],
  selectedSport,
  setSelectedSport,
  calendarData = [],
  athleteId = null,
}) {
  const navigate = useNavigate();
  const { user } = useAuth();

  const isCoachLike =
    ['coach', 'tester', 'testing', 'admin'].includes(user?.role) ||
    (user?.admin === true && user?.role !== 'athlete');
  // Only pass athleteId when a coach/tester views someone else's dashboard.
  const targetAthleteId = (
    isCoachLike &&
    athleteId &&
    user?._id &&
    String(athleteId) !== String(user._id)
  ) ? athleteId : null;

  const emptyBikeMetrics = () => ({
    allTime: BIKE_KEYS.reduce((o, k) => ({ ...o, [k]: 0 }), {}),
    compare: BIKE_KEYS.reduce((o, k) => ({ ...o, [k]: { value: 0, trainingId: null, trainingType: null, stravaId: null } }), {}),
    personalRecords: {},
    improvements: {},
    monthlyMetrics: {},
  });

  // ── Local state ─────────────────────────────────────────────────────────────
  const [sport, setSport] = useState(() => {
    try { return localStorage.getItem('powerRadar_sport') || 'bike'; } catch { return 'bike'; }
  });
  const [comparePeriod, setComparePeriod] = useState(() => {
    try { return localStorage.getItem('powerRadar_comparePeriod') || '90days'; } catch { return '90days'; }
  });
  const [selectedMonths, setSelectedMonths] = useState(() => {
    try { const s = localStorage.getItem('powerRadar_selectedMonths'); return s ? JSON.parse(s) : []; } catch { return []; }
  });
  const [isTableExpanded, setIsTableExpanded] = useState(false);

  // Bike API state
  const [bikeMetrics, setBikeMetrics] = useState(emptyBikeMetrics);
  const [bikeAllTimeRef, setBikeAllTimeRef] = useState(null);
  // bikeReady: true once we've received real bike data (cache or API).
  // Prevents the chart from flashing with all-zero data on first render.
  const [bikeReady, setBikeReady] = useState(false);
  // refreshKey: bump to force-reload both allTime and compare effects.
  const [refreshKey, setRefreshKey] = useState(0);
  const [, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(null);

  // Persist prefs
  useEffect(() => { try { localStorage.setItem('powerRadar_sport', sport); } catch {} }, [sport]);
  useEffect(() => { try { localStorage.setItem('powerRadar_comparePeriod', comparePeriod); } catch {} }, [comparePeriod]);
  useEffect(() => { try { localStorage.setItem('powerRadar_selectedMonths', JSON.stringify(selectedMonths)); } catch {} }, [selectedMonths]);

  // ── Run metrics (client-side fallback for manual trainings) ─────────────────
  const manualRunMetrics = useMemo(() => computeRunMetrics(trainings), [trainings]);

  // ── Run metrics (server-side: FIT + Strava runs) ──────────────────────────
  const [serverRunMetrics, setServerRunMetrics] = useState(null);
  const [runReady, setRunReady] = useState(false);
  const runReqRef = useRef(0);
  const allTimeReqRef = useRef(0);
  const metricsReqRef = useRef(0);
  useEffect(() => {
    if (sport !== 'run') return;
    const load = async () => {
      const reqId = ++runReqRef.current;
      const athletePart = targetAthleteId ? `_${targetAthleteId}` : '';
      const cacheKey = `runRadar_metrics_v1_${comparePeriod}_${selectedMonths.join(',')}${athletePart}`;
      const cacheTsKey = cacheKey + '_ts';
      const CACHE_TTL = 600000; // 10 min
      try {
        const now = Date.now();
        const cached = localStorage.getItem(cacheKey);
        const ts = Number(localStorage.getItem(cacheTsKey) || 0);
        if (cached && (now - ts) < CACHE_TTL) {
          try {
            const parsed = JSON.parse(cached);
            if (parsed && parsed.allTime) {
              setServerRunMetrics(parsed);
              setRunReady(true);
              return;
            }
          } catch {}
        }
        const params = new URLSearchParams();
        if (comparePeriod) params.append('comparePeriod', comparePeriod);
        selectedMonths.forEach(m => params.append('selectedMonths', m));
        if (targetAthleteId) params.append('athleteId', targetAthleteId);
        const resp = await api.get(`/api/fit/run-metrics?${params}`);
        if (reqId !== runReqRef.current) return;
        const data = resp.data;
        if (data && data.allTime) {
          setServerRunMetrics(data);
          setRunReady(true);
          try {
            localStorage.setItem(cacheKey, JSON.stringify(data));
            localStorage.setItem(cacheTsKey, String(Date.now()));
          } catch {}
        } else {
          setServerRunMetrics(null);
          setRunReady(true);
        }
      } catch {
        setRunReady(true);
      }
    };
    load();
  }, [sport, comparePeriod, selectedMonths, targetAthleteId, refreshKey]);

  // Merge server run metrics with manual run metrics (prefer server for FIT/Strava, add manual)
  const runMetrics = useMemo(() => {
    if (!serverRunMetrics && !manualRunMetrics?.hasData) return manualRunMetrics;
    if (!serverRunMetrics) return manualRunMetrics;

    // Build merged allTimeBest: for each axis, use server pace if available, else manual
    const merged = {
      allTimeBest: {},
      compareBest: { [comparePeriod]: {} },
      monthlyBests: {},
      hasData: false,
    };

    RUN_AXES.forEach(axis => {
      // allTime: prefer server (lower = faster)
      const srv = serverRunMetrics.allTime?.[axis.id]?.value || null;
      const man = manualRunMetrics?.allTimeBest?.[axis.id] || null;
      merged.allTimeBest[axis.id] = srv && man ? Math.min(srv, man) : (srv || man);

      // compare
      const srvC = serverRunMetrics.compare?.[axis.id]?.value || null;
      const manC = manualRunMetrics?.compareBest?.[comparePeriod]?.[axis.id]
        || manualRunMetrics?.compareBest?.['90days']?.[axis.id] || null;
      merged.compareBest[comparePeriod] = merged.compareBest[comparePeriod] || {};
      merged.compareBest[comparePeriod][axis.id] = srvC && manC ? Math.min(srvC, manC) : (srvC || manC);

      // monthly
      Object.keys(serverRunMetrics.monthlyMetrics || {}).forEach(mk => {
        if (!merged.monthlyBests[mk]) merged.monthlyBests[mk] = {};
        const srvM = serverRunMetrics.monthlyMetrics[mk]?.[axis.id] || null;
        const manM = manualRunMetrics?.monthlyBests?.[mk]?.[axis.id] || null;
        merged.monthlyBests[mk][axis.id] = srvM && manM ? Math.min(srvM, manM) : (srvM || manM);
      });
    });

    merged.hasData = Object.values(merged.allTimeBest).some(v => v !== null && v > 0);
    return merged;
  }, [serverRunMetrics, manualRunMetrics, comparePeriod]);

  // Reset all radar state when the viewed athlete changes.
  useEffect(() => {
    setBikeReady(false);
    setRunReady(false);
    setBikeAllTimeRef(null);
    setBikeMetrics(emptyBikeMetrics());
    setServerRunMetrics(null);
    setLoadError(null);
    allTimeReqRef.current += 1;
    metricsReqRef.current += 1;
    runReqRef.current += 1;
  }, [targetAthleteId]);

  // ── Bike: all-time reference load ─────────────────────────────────────────
  // NOTE: do NOT call setBikeAllTimeRef(null) at the top — that would briefly
  // use bikeMetrics as the normalization fallback, which could have a different
  // allTime value and make the radar flash with wrong maxima.
  useEffect(() => {
    if (sport !== 'bike') return;
    const load = async () => {
      const reqId = ++allTimeReqRef.current;
      const cacheKey = `powerRadar_allTimeRef_v3${targetAthleteId ? `_${targetAthleteId}` : ''}`;
      const cacheTsKey = cacheKey + '_ts';
      const CACHE_TTL = 900000; // 15 min (reduced from 1h so fresh PRs appear quickly)
      try {
        const now = Date.now();
        const cached = localStorage.getItem(cacheKey);
        const ts = Number(localStorage.getItem(cacheTsKey) || 0);
        if (cached && (now - ts) < CACHE_TTL) {
          try {
            const parsed = JSON.parse(cached);
            if (isBikePayload(parsed)) {
              setBikeAllTimeRef(parsed);
              setBikeReady(true);
              return; // cache is fresh — skip the API call entirely
            }
          } catch {}
        }
        // Cache stale or missing — fetch from server
        const params = new URLSearchParams({ comparePeriod: 'alltime' });
        if (targetAthleteId) params.append('athleteId', targetAthleteId);
        const resp = await api.get(`/api/fit/power-metrics?${params}`);
        if (reqId !== allTimeReqRef.current) return;
        if (isBikePayload(resp.data)) {
          setBikeAllTimeRef(resp.data);
          setBikeReady(true);
          try {
            localStorage.setItem(cacheKey, JSON.stringify(resp.data));
            localStorage.setItem(cacheTsKey, String(Date.now()));
          } catch {}
        } else {
          setBikeAllTimeRef(null);
          setBikeReady(true);
        }
      } catch {
        setBikeReady(true);
      }
    };
    load();
  }, [sport, targetAthleteId, refreshKey]);

  // ── Bike: compare metrics load ────────────────────────────────────────────
  useEffect(() => {
    if (sport !== 'bike') return;
    const load = async () => {
      const reqId = ++metricsReqRef.current;
      const athletePart = targetAthleteId ? `_${targetAthleteId}` : '';
      const cacheKey = `powerRadar_metrics_v3_${comparePeriod}_${selectedMonths.join(',')}${athletePart}`;
      const cacheTsKey = cacheKey + '_ts';
      const CACHE_DUR = 600000; // 10 min
      try {
        const now = Date.now();
        const cached = localStorage.getItem(cacheKey);
        const ts = Number(localStorage.getItem(cacheTsKey) || 0);
        if (cached && ts && (now - ts) < CACHE_DUR) {
          try {
            const parsed = JSON.parse(cached);
            if (isBikePayload(parsed)) {
              setBikeMetrics(parsed);
              setBikeReady(true);
              setLoadError(null);
              return; // cache is fresh — skip the API call entirely
            }
          } catch {}
        }

        // Cache stale or missing — fetch from server
        if (!bikeReady) setLoading(true);
        else setRefreshing(true);
        const params = new URLSearchParams();
        if (comparePeriod) params.append('comparePeriod', comparePeriod);
        selectedMonths.forEach(m => params.append('selectedMonths', m));
        if (targetAthleteId) params.append('athleteId', targetAthleteId);

        setLoadError(null);
        const resp = await api.get(`/api/fit/power-metrics?${params}`);
        if (reqId !== metricsReqRef.current) return;
        const metrics = resp.data;

        if (metrics?.error) {
          setLoadError(metrics.error);
          setLoading(false); setRefreshing(false);
          return;
        }
        if (!isBikePayload(metrics)) {
          setBikeMetrics(emptyBikeMetrics());
          setLoadError(null);
          setBikeReady(true);
          setLoading(false); setRefreshing(false);
          return;
        }
        if (!metrics.compare) {
          metrics.compare = BIKE_KEYS.reduce((o, k) => ({ ...o, [k]: { value: 0, trainingId: null, trainingType: null, stravaId: null } }), {});
        }
        try {
          if (JSON.stringify(metrics).length < 50000) {
            localStorage.setItem(cacheKey, JSON.stringify(metrics));
            localStorage.setItem(cacheTsKey, String(Date.now()));
          }
        } catch {}
        if (reqId !== metricsReqRef.current) return;
        setBikeMetrics(metrics);
        setBikeReady(true);
      } catch (err) {
        const status = err.response?.status;
        if (status === 404 || status === 403) {
          setLoadError(err.response?.data?.error || (status === 404 ? 'Athlete not found' : 'Access denied'));
        }
        setBikeReady(true);
      } finally {
        setLoading(false); setRefreshing(false);
      }
    };
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sport, comparePeriod, selectedMonths, targetAthleteId, refreshKey]);

  // ── Derived: bike all-time best (stable normalisation) ────────────────────
  // Takes the maximum across every available source so compare values can
  // never exceed 100% in the radar (which would happen if the all-time cache
  // is stale but compare data has fresh uploads).
  const bikeAllTimeBest = useMemo(() => {
    const best = {};
    BIKE_KEYS.forEach(k => {
      const v1 = extractVal(bikeAllTimeRef?.allTime?.[k]);
      const v2 = extractVal(bikeMetrics?.allTime?.[k]);
      const v3 = extractVal(bikeMetrics?.compare?.[k]);         // compare ≤ allTime but use as safety net
      const pr = Number(bikeMetrics?.personalRecords?.[k]?.value || 0);
      best[k] = Math.max(v1, v2, v3, pr, 0);
    });
    return best;
  }, [bikeMetrics, bikeAllTimeRef]);

  // ── Available months (bike or run) ────────────────────────────────────────
  // Use mkToLocalDate() instead of new Date(mk+'-01') to avoid the UTC-midnight
  // timezone bug that shifts months back by one in UTC+ timezones.
  const availableMonths = useMemo(() => {
    const toEntry = mk => {
      const d = mkToLocalDate(mk); // local-timezone 1st of month
      return { key: mk, label: d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }), date: d };
    };
    let keys;
    if (sport === 'bike') {
      keys = Object.keys(bikeMetrics.monthlyMetrics || {});
    } else {
      // Use allMonthKeys from server (all months with any run data), fall back to
      // monthlyBests keys from combined metrics (manual trainings).
      const srvKeys = serverRunMetrics?.allMonthKeys || Object.keys(serverRunMetrics?.monthlyMetrics || {});
      const manKeys = Object.keys(manualRunMetrics?.monthlyBests || {});
      keys = [...new Set([...srvKeys, ...manKeys])];
    }
    return keys.map(toEntry).filter(m => !isNaN(m.date)).sort((a, b) => b.date - a.date);
  }, [sport, bikeMetrics, serverRunMetrics, manualRunMetrics]);

  // Auto-select all months when switching to monthly
  useEffect(() => {
    if (comparePeriod === 'monthly' && availableMonths.length > 0 && selectedMonths.length === 0) {
      setSelectedMonths(availableMonths.map(m => m.key));
    }
  }, [comparePeriod, availableMonths, selectedMonths.length]);

  // ── Chart data ────────────────────────────────────────────────────────────
  const chartData = useMemo(() => {
    if (sport === 'bike') {
      if (!bikeMetrics?.allTime || typeof bikeMetrics.allTime !== 'object') return null;
      const labels = BIKE_AXES.map(a => a.label);
      const normBike = (val, k) => {
        const max = bikeAllTimeBest[k] || 0;
        const v = extractVal(val);
        // Cap at 100 — compare can't exceed all-time by definition, but stale
        // cache + fresh compare upload could cause it to briefly exceed the stored max.
        return max > 0 ? Math.min(100, (v / max) * 100) : 0;
      };

      if (comparePeriod === 'monthly' && selectedMonths.length > 0) {
        return {
          labels,
          datasets: [
            { label: 'All Time', data: [100, 100, 100, 100, 100], borderColor: '#60a5fa', backgroundColor: 'rgba(96,165,250,0.15)', borderWidth: 2, pointBackgroundColor: '#60a5fa', pointRadius: 4, fill: true, __kind: 'alltime' },
            ...selectedMonths.map((mk, i) => {
              const md = bikeMetrics.monthlyMetrics?.[mk];
              const lbl = availableMonths.find(m => m.key === mk)?.label || mk;
              if (!md) return null;
              return {
                label: lbl,
                data: BIKE_KEYS.map(k => normBike(md[k], k)),
                borderColor: MONTH_COLORS[i % MONTH_COLORS.length],
                backgroundColor: MONTH_COLORS[i % MONTH_COLORS.length] + '26',
                borderWidth: 2, pointBackgroundColor: MONTH_COLORS[i % MONTH_COLORS.length], pointRadius: 3, fill: true,
                __kind: 'month', __monthKey: mk,
              };
            }).filter(Boolean),
          ],
        };
      }

      return {
        labels,
        datasets: [
          { label: 'All Time', data: [100, 100, 100, 100, 100], borderColor: '#60a5fa', backgroundColor: 'rgba(96,165,250,0.15)', borderWidth: 2, pointBackgroundColor: '#60a5fa', pointRadius: 4, fill: true, __kind: 'alltime' },
          ...(comparePeriod !== 'alltime' && comparePeriod !== 'monthly' ? [{
            label: comparePeriod === '90days' ? 'Past 90 days' : 'Past 30 days',
            data: BIKE_KEYS.map(k => normBike(bikeMetrics.compare?.[k], k)),
            borderColor: 'rgba(239,68,68,0.85)', backgroundColor: 'rgba(239,68,68,0.15)',
            borderWidth: 2, pointBackgroundColor: 'rgba(239,68,68,1)', pointRadius: 4, fill: true, __kind: 'compare',
          }] : []),
        ],
      };
    }

    // ── Run ──
    if (!runMetrics?.hasData) return null;
    const labels = RUN_AXES.map(a => a.label);

    // For run: normalize as (allTimeBestPace / currentPace) * 100
    // so fastest pace = 100%
    const normRun = (paceSecPerKm, axisId) => {
      const best = runMetrics.allTimeBest[axisId];
      if (!best || !paceSecPerKm) return 0;
      return (best / paceSecPerKm) * 100;
    };

    if (comparePeriod === 'monthly' && selectedMonths.length > 0) {
      return {
        labels,
        datasets: [
          { label: 'All Time', data: [100, 100, 100, 100, 100], borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.15)', borderWidth: 2, pointBackgroundColor: '#10b981', pointRadius: 4, fill: true, __kind: 'alltime' },
          ...selectedMonths.map((mk, i) => {
            const md = runMetrics.monthlyBests?.[mk];
            const lbl = availableMonths.find(m => m.key === mk)?.label || mk;
            if (!md) return null;
            return {
              label: lbl,
              data: RUN_AXES.map(a => normRun(md[a.id], a.id)),
              borderColor: MONTH_COLORS[i % MONTH_COLORS.length],
              backgroundColor: MONTH_COLORS[i % MONTH_COLORS.length] + '26',
              borderWidth: 2, pointBackgroundColor: MONTH_COLORS[i % MONTH_COLORS.length], pointRadius: 3, fill: true,
              __kind: 'month', __monthKey: mk,
            };
          }).filter(Boolean),
        ],
      };
    }

    const comparePaces = comparePeriod === '30days'
      ? runMetrics.compareBest['30days']
      : runMetrics.compareBest['90days'];

    return {
      labels,
      datasets: [
        { label: 'All Time', data: [100, 100, 100, 100, 100], borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.15)', borderWidth: 2, pointBackgroundColor: '#10b981', pointRadius: 4, fill: true, __kind: 'alltime' },
        ...(comparePeriod !== 'alltime' && comparePeriod !== 'monthly' ? [{
          label: comparePeriod === '90days' ? 'Past 90 days' : 'Past 30 days',
          data: RUN_AXES.map(a => normRun(comparePaces?.[a.id], a.id)),
          borderColor: 'rgba(239,68,68,0.85)', backgroundColor: 'rgba(239,68,68,0.15)',
          borderWidth: 2, pointBackgroundColor: 'rgba(239,68,68,1)', pointRadius: 4, fill: true, __kind: 'compare',
        }] : []),
      ],
    };
  }, [sport, bikeMetrics, bikeAllTimeBest, runMetrics, comparePeriod, selectedMonths, availableMonths]);

  // ── Chart options ─────────────────────────────────────────────────────────
  const chartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 400 },
    layout: { padding: { top: -16, bottom: -8, left: 0, right: 0 } },
    scales: {
      r: {
        beginAtZero: true,
        max: 100,
        ticks: {
          stepSize: 25,
          font: { size: 9 },
          callback: v => v + '%',
          backdropPadding: 0,
          color: '#9ca3af',
        },
        pointLabels: { font: { size: 11, weight: '600' }, color: '#374151', padding: 4 },
        grid: { color: 'rgba(0,0,0,0.06)', lineWidth: 1 },
        angleLines: { color: 'rgba(0,0,0,0.06)' },
      },
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        mode: 'index',
        intersect: false,
        backgroundColor: 'rgba(255,255,255,0.97)',
        titleColor: '#111827',
        titleFont: { weight: '700', size: 12 },
        bodyColor: '#374151',
        bodyFont: { size: 12 },
        borderColor: '#e5e7eb',
        borderWidth: 1,
        padding: 10,
        cornerRadius: 10,
        displayColors: true,
        callbacks: {
          title: items => {
            if (!items?.[0]) return '';
            const axes = sport === 'bike' ? BIKE_AXES : RUN_AXES;
            return axes[items[0].dataIndex]?.name || '';
          },
          label: item => {
            if (!item?.dataset) return '';
            const lbl = item.dataset.label || '';
            const kind = item.dataset.__kind;
            const mk = item.dataset.__monthKey;
            const axes = sport === 'bike' ? BIKE_AXES : RUN_AXES;
            const axis = axes[item.dataIndex];
            if (!axis) return lbl;

            if (sport === 'bike') {
              const k = axis.id;
              let raw = 0;
              if (kind === 'alltime') raw = bikeAllTimeBest[k] || 0;
              else if (kind === 'compare') raw = extractVal(bikeMetrics?.compare?.[k]);
              else if (kind === 'month') raw = Number(bikeMetrics.monthlyMetrics?.[mk]?.[k] || 0);
              return `${lbl}: ${Math.round(raw)} W`;
            } else {
              const id = axis.id;
              let pace = null;
              if (kind === 'alltime') pace = runMetrics?.allTimeBest?.[id];
              else if (kind === 'compare') {
                const cp = comparePeriod === '30days' ? runMetrics?.compareBest?.['30days'] : runMetrics?.compareBest?.['90days'];
                pace = cp?.[id];
              } else if (kind === 'month') pace = runMetrics?.monthlyBests?.[mk]?.[id];
              return pace ? `${lbl}: ${fmtPace(pace)} /km` : `${lbl}: —`;
            }
          },
          afterBody: items => {
            if (!items?.[0] || comparePeriod === 'alltime' || comparePeriod === 'monthly') return [];
            const axes = sport === 'bike' ? BIKE_AXES : RUN_AXES;
            const axis = axes[items[0].dataIndex];
            if (!axis) return [];
            if (sport === 'bike') {
              const k = axis.id;
              const allV = bikeAllTimeBest[k] || 0;
              const cmpV = extractVal(bikeMetrics?.compare?.[k]);
              if (cmpV > 0 && allV > 0) return [`${Math.min(100, Math.round((cmpV / allV) * 100))}% of All Time`];
            }
            return [];
          },
        },
      },
    },
  }), [sport, bikeMetrics, bikeAllTimeBest, runMetrics, comparePeriod]);

  // ── Table data ────────────────────────────────────────────────────────────
  const tableRows = useMemo(() => {
    if (sport === 'bike') {
      // Prefer bikeAllTimeRef for all-time values (loaded with comparePeriod=alltime).
      // Fall back to bikeMetrics if ref hasn't loaded yet.
      const atSrc = bikeAllTimeRef?.allTime || bikeMetrics?.allTime || {};
      return BIKE_AXES.map(ax => {
        const k = ax.id;
        const atEntry  = atSrc[k];
        const cmpEntry = bikeMetrics?.compare?.[k];
        const allTimeVal = bikeAllTimeBest[k] || 0;
        const cmpVal     = extractVal(cmpEntry);
        // For the PR date, prefer personalRecords (has explicit date); fall back to allTime date
        const prEntry  = bikeMetrics?.personalRecords?.[k] || null;
        const atDate   = typeof atEntry === 'object' ? atEntry?.date : null;
        const pct      = allTimeVal > 0 ? Math.min(100, Math.round((cmpVal / allTimeVal) * 100)) : 0;
        const delta    = allTimeVal > 0 ? cmpVal - allTimeVal : null;
        return {
          ...ax,
          allTimeVal,
          compareVal: cmpVal,
          pct,
          delta,
          allTimeDate: prEntry?.date || atDate || null,
          allTimeTrainingId:   typeof atEntry === 'object' ? atEntry?.trainingId  : null,
          allTimeTrainingType: typeof atEntry === 'object' ? atEntry?.trainingType : null,
          allTimeStravaId:     typeof atEntry === 'object' ? atEntry?.stravaId     : null,
          cmpTrainingId:   typeof cmpEntry === 'object' ? cmpEntry?.trainingId  : null,
          cmpTrainingType: typeof cmpEntry === 'object' ? cmpEntry?.trainingType : null,
          cmpStravaId:     typeof cmpEntry === 'object' ? cmpEntry?.stravaId     : null,
          pr: prEntry,
        };
      });
    }

    // Run
    const comparePaces = comparePeriod === '30days'
      ? runMetrics?.compareBest?.['30days']
      : runMetrics?.compareBest?.['90days'];

    return RUN_AXES.map(ax => {
      const atPace = runMetrics?.allTimeBest?.[ax.id];
      const cmpPace = comparePaces?.[ax.id];
      // Pct for run: lower pace = faster = better; cmpPace <= atPace means better
      const pct = atPace && cmpPace ? Math.round((atPace / cmpPace) * 100) : 0;
      const delta = (cmpPace && atPace) ? (atPace - cmpPace) : null; // positive = faster (good)
      return {
        ...ax,
        allTimeVal: atPace,
        compareVal: cmpPace,
        pct,
        delta,
      };
    });
  }, [sport, bikeMetrics, bikeAllTimeBest, bikeAllTimeRef, runMetrics, comparePeriod]);

  // ── Navigation helper (bike) ──────────────────────────────────────────────
  const handleTrainingClick = (trainingId, trainingType, stravaId, metricKey, claimedWatts) => {
    if (!trainingId && !stravaId) return;
    try {
      const athletePart = targetAthleteId ? `/${targetAthleteId}` : '';
      const params = new URLSearchParams();
      if (metricKey) params.set('highlightMetric', metricKey);
      if (claimedWatts) params.set('radarWatts', String(Math.round(claimedWatts)));
      const qs = params.toString() ? `?${params}` : '';
      const base = `/training-calendar${athletePart}`;
      if (stravaId) navigate(`${base}/${encodeURIComponent(`strava-${stravaId}`)}${qs}`);
      else if (trainingType === 'strava' && trainingId) navigate(`${base}/${encodeURIComponent(`strava-${trainingId}`)}${qs}`);
      else navigate(`${base}/${encodeURIComponent(`fit-${trainingId}`)}${qs}`);
    } catch {}
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  const periodOptions = [
    { value: '30days',  label: '30d' },
    { value: '90days',  label: '90d' },
    { value: 'monthly', label: 'Monthly' },
    { value: 'alltime', label: 'All time' },
  ];

  const runHasData = runMetrics?.hasData;

  // For bike: show loading spinner until we have real data (bikeReady).
  // This prevents the chart from flashing with all-zero placeholder values
  // before the first API response or cache read arrives.
  const isLoadingBike = sport === 'bike' && !bikeReady;
  const isLoadingRun  = sport === 'run'  && !runReady && !manualRunMetrics?.hasData;
  const isEmpty = sport === 'run' ? (!runHasData && !isLoadingRun) : (!bikeReady || !chartData);

  return (
    <div className="w-full h-full flex flex-col bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="px-4 pt-4 pb-3 border-b border-gray-50">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div>
            <h2 className="text-base font-bold text-gray-900 leading-tight">
              {sport === 'bike' ? 'Power Radar' : 'Pace Radar'}
            </h2>
            <p className="text-[11px] text-gray-400 mt-0.5">
              {sport === 'bike' ? 'Peak power across durations' : 'Best pace across distances'}
            </p>
          </div>

          {/* Sport toggle */}
          <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1 shrink-0">
            {[{ id: 'bike', label: 'Bike', icon: '/icon/bike.svg' }, { id: 'run', label: 'Run', icon: '/icon/run.svg' }].map(s => (
              <button
                key={s.id}
                onClick={() => setSport(s.id)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  sport === s.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
                style={{ touchAction: 'manipulation' }}
              >
                <img
                  src={s.icon}
                  alt=""
                  className={`w-3.5 h-3.5 ${sport === s.id ? '' : 'opacity-50'}`}
                />
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Period pills */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mr-0.5">Compare</span>
          {periodOptions.map(opt => (
            <button
              key={opt.value}
              onClick={() => { setComparePeriod(opt.value); if (opt.value !== 'monthly') setSelectedMonths([]); }}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                comparePeriod === opt.value
                  ? 'bg-primary text-white'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700'
              }`}
              style={{ touchAction: 'manipulation' }}
            >
              {opt.label}
            </button>
          ))}
          {refreshing && (
            <span className="text-[10px] text-gray-400 ml-1 animate-spin inline-block">↻</span>
          )}
          {/* Force-refresh: clears all local caches and re-fetches */}
          {!refreshing && (
            <button
              title="Force refresh — clears cache and re-fetches all bests"
              onClick={() => {
                try {
                  Object.keys(localStorage)
                    .filter(k => k.startsWith('powerRadar_') || k.startsWith('runRadar_'))
                    .forEach(k => localStorage.removeItem(k));
                } catch {}
                if (sport === 'bike') {
                  setBikeAllTimeRef(null);
                  setBikeReady(false);
                  setBikeMetrics({
                    allTime: BIKE_KEYS.reduce((o, k) => ({ ...o, [k]: 0 }), {}),
                    compare: BIKE_KEYS.reduce((o, k) => ({ ...o, [k]: { value: 0, trainingId: null, trainingType: null, stravaId: null } }), {}),
                    personalRecords: {},
                    improvements: {},
                    monthlyMetrics: {},
                  });
                } else {
                  setServerRunMetrics(null);
                  setRunReady(false);
                }
                setRefreshKey(k => k + 1);
              }}
              className="ml-1 text-[10px] text-gray-400 hover:text-primary transition-colors"
            >
              ↻
            </button>
          )}
        </div>
      </div>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto min-h-0 px-4 pb-4">

        {/* Month picker */}
        {comparePeriod === 'monthly' && (
          <div className="mt-3 mb-1 bg-gray-50 rounded-xl border border-gray-100 p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-600">Select Months</span>
              <button
                onClick={() => setSelectedMonths(
                  selectedMonths.length === availableMonths.length ? [] : availableMonths.map(m => m.key)
                )}
                className="text-[11px] text-primary font-semibold hover:underline"
              >
                {selectedMonths.length === availableMonths.length ? 'Deselect all' : 'Select all'}
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {availableMonths.map(m => (
                <label key={m.key} className="flex items-center gap-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedMonths.includes(m.key)}
                    onChange={e => setSelectedMonths(
                      e.target.checked ? [...selectedMonths, m.key] : selectedMonths.filter(k => k !== m.key)
                    )}
                    className="w-3 h-3 text-primary rounded border-gray-300 focus:ring-primary"
                  />
                  <span className="text-xs text-gray-700">{m.label}</span>
                </label>
              ))}
              {availableMonths.length === 0 && (
                <span className="text-xs text-gray-400">No monthly data available</span>
              )}
            </div>
          </div>
        )}

        {/* Error banner */}
        {loadError && (
          <div className="mt-3 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs">
            {loadError}
          </div>
        )}

        {/* Loading skeleton */}
        {(isLoadingBike || isLoadingRun) && (
          <div className="mt-4 flex items-center justify-center h-56 text-gray-400 text-sm">
            <svg className="w-4 h-4 mr-2 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
            </svg>
            Loading…
          </div>
        )}

        {/* Empty state */}
        {!isLoadingBike && !isLoadingRun && isEmpty && (
          <div className="mt-4 flex flex-col items-center justify-center h-48 text-center gap-2">
            <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
              <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.5l4-4 4 3 4-7 4 4.5"/>
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-500">No {sport === 'bike' ? 'power' : 'pace'} data yet</p>
            <p className="text-xs text-gray-400 max-w-[200px]">
              {sport === 'bike'
                ? 'Upload cycling activities with power data to see your radar.'
                : 'Log run training sessions with interval data to see your pace radar.'}
            </p>
          </div>
        )}

        {/* Radar chart */}
        {!isLoadingBike && !isLoadingRun && !isEmpty && (
          <>
            <div className="w-full relative mt-2" style={{ height: '280px' }}>
              {chartData && (
                <Radar data={chartData} options={chartOptions} />
              )}
              {(!chartData && comparePeriod === 'monthly' && selectedMonths.length === 0) && (
                <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-400">
                  Select months to display
                </div>
              )}
            </div>

            {/* Legend */}
            {chartData && (
              <div className="flex items-center justify-center gap-4 mt-1 mb-2 flex-wrap">
                {chartData.datasets.map((ds, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: typeof ds.borderColor === 'string' ? ds.borderColor.replace('rgba(', 'rgb(').replace(/, *[\d.]+\)$/, ')') : ds.borderColor }}
                    />
                    <span className="text-[11px] text-gray-600 font-medium">{ds.label}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Stats table */}
            <div className="rounded-2xl border border-gray-100 overflow-hidden mt-2">
              <button
                onClick={() => setIsTableExpanded(v => !v)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
              >
                <span className="text-sm font-semibold text-gray-800">
                  {sport === 'bike' ? 'Power Bests' : 'Pace Bests'}
                </span>
                <svg
                  className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${isTableExpanded ? 'rotate-180' : ''}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              <div className={`overflow-hidden transition-all duration-300 ${isTableExpanded ? 'max-h-[900px]' : 'max-h-0'}`}>
                <div className="divide-y divide-gray-50">
                  {tableRows.map((row, i) => {
                    const hasAllTime = row.allTimeVal && row.allTimeVal > 0;
                    const hasCmp = row.compareVal && row.compareVal > 0;
                    const showPeriod = comparePeriod !== 'alltime' && comparePeriod !== 'monthly';

                    // Format display values
                    const allTimeDisplay = sport === 'bike'
                      ? (hasAllTime ? `${Math.round(row.allTimeVal)} W` : '—')
                      : (hasAllTime ? `${fmtPace(row.allTimeVal)} /km` : '—');
                    const cmpDisplay = sport === 'bike'
                      ? (hasCmp ? `${Math.round(row.compareVal)} W` : '—')
                      : (hasCmp ? `${fmtPace(row.compareVal)} /km` : '—');

                    // Delta: positive = improvement
                    const deltaPositive = row.delta !== null && row.delta > 0;
                    const deltaDisplay = row.delta !== null && row.delta !== 0
                      ? (sport === 'bike'
                          ? `${row.delta > 0 ? '+' : ''}${Math.round(row.delta)} W`
                          : `${row.delta > 0 ? '+' : ''}${fmtPace(Math.abs(row.delta))} faster`)
                      : null;

                    return (
                      <div key={i} className="px-4 py-3 bg-white">
                        {/* Row header */}
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-gray-900 w-10 shrink-0">{row.label}</span>
                            <span className="text-xs text-gray-500">{row.name}</span>
                          </div>
                          {showPeriod && hasCmp && hasAllTime && (
                            <div className="flex items-center gap-1.5">
                              {deltaDisplay && (
                                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${
                                  deltaPositive ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
                                }`}>
                                  {deltaPositive ? '↑' : '↓'} {deltaDisplay}
                                </span>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Values row */}
                        <div className="flex items-center gap-3 mb-1.5">
                          {showPeriod && (
                            <div className="flex-1">
                              <div className="text-[10px] text-gray-400 mb-0.5 uppercase tracking-wide">
                                {comparePeriod === '90days' ? '90 days' : '30 days'}
                              </div>
                              {sport === 'bike' && (row.cmpTrainingId || row.cmpStravaId) ? (
                                <button
                                  onClick={() => handleTrainingClick(row.cmpTrainingId, row.cmpTrainingType, row.cmpStravaId, row.id, row.compareVal)}
                                  className="text-xs font-semibold text-primary hover:underline"
                                >
                                  {cmpDisplay}
                                </button>
                              ) : (
                                <span className="text-xs font-semibold text-gray-800">{cmpDisplay}</span>
                              )}
                            </div>
                          )}
                          <div className="flex-1">
                            <div className="text-[10px] text-gray-400 mb-0.5 uppercase tracking-wide">All time</div>
                            {sport === 'bike' && (row.allTimeTrainingId || row.allTimeStravaId) ? (
                              <button
                                onClick={() => handleTrainingClick(row.allTimeTrainingId, row.allTimeTrainingType, row.allTimeStravaId, row.id, row.allTimeVal)}
                                className="text-xs font-semibold text-primary hover:underline"
                              >
                                {allTimeDisplay}
                              </button>
                            ) : (
                              <span className="text-xs font-semibold text-gray-800">{allTimeDisplay}</span>
                            )}
                          </div>
                        </div>

                        {/* Progress bar */}
                        {showPeriod && hasAllTime && hasCmp && (
                          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${row.pct >= 90 ? 'bg-green-400' : row.pct >= 70 ? 'bg-blue-400' : 'bg-orange-400'}`}
                              style={{ width: `${Math.min(100, Math.max(0, row.pct))}%` }}
                            />
                          </div>
                        )}

                        {/* All-time date (bike only) — use fmtDate to avoid UTC-midnight shift */}
                        {sport === 'bike' && hasAllTime && row.allTimeDate && (
                          <div className="mt-1.5 text-[10px] text-gray-400">
                            <span className="font-semibold text-amber-600">PR</span>{' '}
                            {Math.round(row.allTimeVal)} W · {fmtDate(row.allTimeDate)}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
