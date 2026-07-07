import React, { useMemo, useState, useEffect, useCallback } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from 'recharts';
import { motion } from 'framer-motion';
import api from '../../services/api';

const STORAGE_PRESET = 'intensityDistribution_windowPreset';
const STORAGE_SPORT = 'intensityDistribution_sportMode';

const BIN_POWER = 10;
/** Slightly narrower than bin width × 4 so distinct pace/power clusters can show as separate humps. */
const KDE_POWER = 30;
const BIN_PACE = 5;
const KDE_PACE = 8;

/** Three non-overlapping date windows: [now−daysStart, now−daysEnd) */
const WINDOW_PRESETS = [
  {
    id: 'classic',
    name: 'Classic',
    desc: '2 wk · ~7 wk gap · 6–12 mo ago',
    windows: [
      { key: 'recent', daysEnd: 0, daysStart: 14 },
      { key: 'mid', daysEnd: 14, daysStart: 60 },
      { key: 'old', daysEnd: 180, daysStart: 365 },
    ],
  },
  {
    id: 'stacked',
    name: 'Stacked',
    desc: 'Back-to-back: 2 wk · +4 wk · +8 wk',
    windows: [
      { key: 'recent', daysEnd: 0, daysStart: 14 },
      { key: 'mid', daysEnd: 14, daysStart: 42 },
      { key: 'old', daysEnd: 42, daysStart: 98 },
    ],
  },
  {
    id: 'seasonal',
    name: 'Seasonal',
    desc: '4 wk · ~3 mo · rest of year',
    windows: [
      { key: 'recent', daysEnd: 0, daysStart: 28 },
      { key: 'mid', daysEnd: 28, daysStart: 120 },
      { key: 'old', daysEnd: 120, daysStart: 365 },
    ],
  },
  {
    id: 'short',
    name: 'Short',
    desc: '1 wk · 5 wk · 6–12 mo ago',
    windows: [
      { key: 'recent', daysEnd: 0, daysStart: 7 },
      { key: 'mid', daysEnd: 7, daysStart: 42 },
      { key: 'old', daysEnd: 180, daysStart: 365 },
    ],
  },
];

const CHART_SERIES_STYLES = [
  { stroke: '#767EB5', fill: 'rgba(118, 126, 181, 0.22)' },
  { stroke: '#599FD0', fill: 'rgba(89, 159, 208, 0.2)' },
  { stroke: '#7BC2EB', fill: 'rgba(123, 194, 235, 0.18)' },
];

function readStoredPreset() {
  try {
    const v = localStorage.getItem(STORAGE_PRESET);
    if (v && WINDOW_PRESETS.some((p) => p.id === v)) return v;
  } catch {
    /* ignore */
  }
  return 'classic';
}

function readStoredSportMode() {
  try {
    const v = localStorage.getItem(STORAGE_SPORT);
    if (v === 'bike' || v === 'run') return v;
  } catch {
    /* ignore */
  }
  return 'bike';
}

function isCyclingPowerSport(sport) {
  const s = String(sport || '').toLowerCase();
  if (!s) return false;
  if (s.includes('run') || s.includes('swim') || s.includes('walk') || s.includes('hike')) return false;
  return (
    s.includes('ride') ||
    s.includes('bike') ||
    s.includes('cycling') ||
    (s.includes('virtual') && s.includes('ride')) ||
    s.includes('ebike') ||
    s.includes('gravel') ||
    s.includes('bmx')
  );
}

function isRunPaceSport(sport) {
  const s = String(sport || '').toLowerCase();
  if (!s) return false;
  if (s.includes('ride') || s.includes('bike') || s.includes('cycle') || s.includes('swim')) return false;
  return (
    s.includes('run') ||
    s.includes('walk') ||
    s.includes('hike') ||
    s.includes('trail') ||
    s === 'virtualrun' ||
    (s.includes('virtual') && s.includes('run'))
  );
}

function activityDate(act) {
  const d = new Date(act?.date ?? act?.timestamp ?? act?.startDate ?? 0);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseTotalSeconds(act) {
  const raw = act?.totalTime ?? act?.movingTime ?? act?.elapsedTime ?? act?.durationSeconds;
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return raw;
  if (typeof raw === 'string' && raw.includes(':')) {
    const parts = raw.split(':').map(Number);
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
  }
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function avgPowerW(act) {
  const w = Number(act?.avgPower ?? act?.averagePower ?? act?.average_watts ?? act?.averageWatts);
  return Number.isFinite(w) && w > 0 ? w : null;
}

/** Prefer Strava weighted average watts when present (closer to variable efforts than average watts). */
function intensityPowerW(act) {
  const wW = Number(act?.weightedAveragePower ?? act?.weighted_average_watts);
  if (Number.isFinite(wW) && wW > 0) return wW;
  return avgPowerW(act);
}

function paceFromDistanceTime(act) {
  const dist = Number(act?.distance);
  const mov = parseTotalSeconds(act);
  if (!Number.isFinite(dist) || dist < 100 || mov <= 30) return null;
  const km = dist / 1000;
  if (km < 0.05) return null;
  const secPerKm = mov / km;
  if (secPerKm >= 120 && secPerKm <= 1200) return secPerKm;
  return null;
}

/** Pace in seconds per km (lower = faster). From m/s, distance/time, or explicit pace fields. */
function avgPaceSecPerKm(act) {
  const mps = Number(act?.avgSpeed ?? act?.averageSpeed ?? act?.average_speed ?? 0);
  let fromSpeed = null;
  if (Number.isFinite(mps) && mps > 0.25) {
    const secPerKm = 1000 / mps;
    if (secPerKm >= 120 && secPerKm <= 1200) fromSpeed = secPerKm;
  }
  const fromDist = paceFromDistanceTime(act);
  const p = Number(act?.avgPace ?? act?.averagePace ?? act?.paceSecPerKm ?? act?.paceSecondsPerKm);
  const fromExplicit = Number.isFinite(p) && p >= 120 && p <= 1200 ? p : null;

  if (fromSpeed != null && fromDist != null) {
    const relDiff = Math.abs(fromSpeed - fromDist) / fromDist;
    if (relDiff > 0.12) return fromDist;
    return fromSpeed;
  }
  return fromSpeed ?? fromDist ?? fromExplicit;
}

function filterIntensityActivities(activities, sportMode) {
  if (!Array.isArray(activities)) return [];
  return activities.filter((a) => {
    const t = parseTotalSeconds(a);
    if (t <= 60) return false;
    if (sportMode === 'bike') {
      if (!isCyclingPowerSport(a?.sport)) return false;
      return intensityPowerW(a) != null;
    }
    if (!isRunPaceSport(a?.sport)) return false;
    return avgPaceSecPerKm(a) != null;
  });
}

function inWindow(date, now, daysStart, daysEnd) {
  const t = date.getTime();
  const end = now.getTime() - daysEnd * 86400000;
  const start = now.getTime() - daysStart * 86400000;
  return t < end && t >= start;
}

function getIntensityValue(act, sportMode) {
  return sportMode === 'bike' ? intensityPowerW(act) : avgPaceSecPerKm(act);
}

/** Profile / Mongo may store numbers as strings or Decimal128-like objects. */
function toFinitePositive(raw) {
  if (raw == null || raw === '') return null;
  const v = typeof raw === 'object' && typeof raw?.toString === 'function' ? Number(raw.toString()) : Number(raw);
  return Number.isFinite(v) && v > 0 ? v : null;
}

/** Bins over [minX, maxX]; each row `w` is bin center (same units as power W or pace s/km). */
function buildPeriodHistogram(acts, minX, maxX, sportMode) {
  const binW = sportMode === 'bike' ? BIN_POWER : BIN_PACE;
  const kdeSigma = sportMode === 'bike' ? KDE_POWER : KDE_PACE;
  const centers = [];
  for (let i = 0; ; i += 1) {
    const c = minX + i * binW + binW / 2;
    if (c > maxX) break;
    centers.push(c);
  }
  const nBins = centers.length;
  if (nBins === 0) {
    return { rows: [], totalSec: 0, count: acts.length };
  }
  const weight = new Array(nBins).fill(0);
  let totalSec = 0;
  acts.forEach((act) => {
    const d = activityDate(act);
    if (!d) return;
    const P = getIntensityValue(act, sportMode);
    const T = parseTotalSeconds(act);
    if (P == null || T <= 0) return;
    totalSec += T;
    const gauss = [];
    let gsum = 0;
    for (let i = 0; i < nBins; i += 1) {
      const g = Math.exp(-0.5 * ((centers[i] - P) / kdeSigma) ** 2);
      gauss.push(g);
      gsum += g;
    }
    if (gsum <= 0) return;
    for (let i = 0; i < nBins; i += 1) {
      weight[i] += (T * gauss[i]) / gsum;
    }
  });
  const rows = centers.map((w, i) => ({
    w,
    pctRaw: totalSec > 0 ? (weight[i] / totalSec) * 100 : 0,
  }));
  return { rows, totalSec, count: acts.length };
}

/** Small window preserves multimodal shape; wider window merges peaks into one blob. */
function smoothSeries(rows, keyFrom = 'pctRaw') {
  const win = 1;
  return rows.map((row, i) => {
    let s = 0;
    let c = 0;
    for (let j = -win; j <= win; j++) {
      const ii = i + j;
      if (ii >= 0 && ii < rows.length) {
        s += rows[ii][keyFrom];
        c += 1;
      }
    }
    return { ...row, pct: s / c };
  });
}

function formatRange(now, daysStart, daysEnd) {
  const end = new Date(now.getTime() - daysEnd * 86400000);
  const start = new Date(now.getTime() - daysStart * 86400000);
  const opts = { month: 'short', day: 'numeric', year: 'numeric' };
  return `${start.toLocaleDateString(undefined, opts)} – ${end.toLocaleDateString(undefined, opts)}`;
}

function formatHoursPerWeek(totalSec, windowDays) {
  if (!totalSec || !windowDays) return '—';
  const weeks = windowDays / 7;
  const hrs = totalSec / 3600 / weeks;
  const h = Math.floor(hrs);
  const m = Math.round((hrs - h) * 60);
  return `${h}h ${m.toString().padStart(2, '0')}m / wk`;
}

function formatPaceTick(sec) {
  if (!Number.isFinite(sec) || sec <= 0) return '';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function CustomTooltip({ active, payload, label, sportMode }) {
  if (!active || !payload?.length) return null;
  const head =
    sportMode === 'bike'
      ? `~${Math.round(label)} W`
      : `~${formatPaceTick(label)} /km`;
  return (
    <div className="rounded-lg border border-gray-100 bg-white px-3 py-2 text-xs shadow-md">
      <div className="mb-1 font-semibold text-gray-800">{head}</div>
      {payload
        .filter((p) => p.dataKey !== 'w')
        .map((p) => (
          <div key={p.dataKey} className="flex justify-between gap-4 text-gray-600">
            <span style={{ color: p.color }}>{p.name}</span>
            <span className="font-medium text-gray-800">{typeof p.value === 'number' ? `${p.value.toFixed(1)} %` : '—'}</span>
          </div>
        ))}
    </div>
  );
}

export default function IntensityDistributionChart({ athleteId, activities = [] }) {
  const [ltProfile, setLtProfile] = useState({ lt1: null, lt2: null });
  const [presetId, setPresetId] = useState(readStoredPreset);
  const [sportMode, setSportMode] = useState(readStoredSportMode);

  const setPreset = useCallback((id) => {
    setPresetId(id);
    try {
      localStorage.setItem(STORAGE_PRESET, id);
    } catch {
      /* ignore */
    }
  }, []);

  const setSport = useCallback((mode) => {
    setSportMode(mode);
    try {
      localStorage.setItem(STORAGE_SPORT, mode);
    } catch {
      /* ignore */
    }
  }, []);

  const activePreset = WINDOW_PRESETS.find((p) => p.id === presetId) || WINDOW_PRESETS[0];

  useEffect(() => {
    let cancelled = false;
    if (!athleteId) {
      setLtProfile({ lt1: null, lt2: null });
      return undefined;
    }
    const zoneKey = sportMode === 'bike' ? 'cycling' : 'running';
    (async () => {
      try {
        const { data } = await api.get(`/user/athlete/${athleteId}/profile`);
        if (cancelled) return;
        const z = data?.powerZones?.[zoneKey];
        setLtProfile({
          lt1: toFinitePositive(z?.lt1),
          lt2: toFinitePositive(z?.lt2),
        });
      } catch {
        if (!cancelled) setLtProfile({ lt1: null, lt2: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [athleteId, sportMode]);

  // Real time-in-intensity histograms (second-by-second streams) per window.
  // Replaces the per-activity-average KDE so the curve reflects how long you
  // actually spent at each power / pace. Falls back to the KDE while loading or
  // when no stream data exists for a window.
  const [streamHist, setStreamHist] = useState({ token: null, windows: [] });
  const histToken = `${presetId}|${sportMode}`;
  useEffect(() => {
    if (!athleteId) {
      setStreamHist({ token: null, windows: [] });
      return undefined;
    }
    let cancelled = false;
    const sportParam = sportMode === 'bike' ? 'cycling' : 'running';
    const dayMs = 86400000;
    const nowMs = Date.now();
    (async () => {
      try {
        const windows = await Promise.all(
          activePreset.windows.map(async (win) => {
            const startDate = new Date(nowMs - win.daysStart * dayMs).toISOString();
            const endDate = new Date(nowMs - win.daysEnd * dayMs).toISOString();
            const { data } = await api.get('/api/fit/intensity-histogram', {
              params: { startDate, endDate, sport: sportParam, athleteId },
            });
            const map = new Map();
            (data?.bins || []).forEach((b) => {
              if (b && Number.isFinite(b.w)) map.set(Math.round(b.w * 10), b.seconds || 0);
            });
            return { key: win.key, totalSec: data?.totalSec || 0, map };
          })
        );
        if (!cancelled) setStreamHist({ token: histToken, windows });
      } catch {
        if (!cancelled) setStreamHist({ token: histToken, windows: [] });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [athleteId, presetId, sportMode, activePreset]);

  const { chartData, meta, seriesKeys, minW, maxW, yMax, hasChart } = useMemo(() => {
    const now = new Date();
    const filteredActs = filterIntensityActivities(activities, sportMode);
    const windows = activePreset.windows;

    if (filteredActs.length === 0) {
      const emptyMax = sportMode === 'bike' ? 400 : 480;
      const emptyMin = sportMode === 'bike' ? 0 : 200;
      return {
        chartData: [],
        meta: [],
        seriesKeys: [],
        minW: emptyMin,
        maxW: emptyMax,
        yMax: 8,
        hasChart: false,
      };
    }

    let minXCalc = 0;
    let maxXCalc;
    const lt1 = toFinitePositive(ltProfile.lt1);
    const lt2 = toFinitePositive(ltProfile.lt2);
    const bikeHighW = lt1 != null && lt2 != null ? Math.max(lt1, lt2) : lt1 ?? lt2 ?? null;
    const runSlowSec = lt1 != null && lt2 != null ? Math.max(lt1, lt2) : null;
    const runFastSec = lt1 != null && lt2 != null ? Math.min(lt1, lt2) : null;

    if (sportMode === 'bike') {
      const vals = filteredActs.map((a) => intensityPowerW(a)).filter(Boolean);
      const p95 = vals.slice().sort((a, b) => a - b)[Math.floor(vals.length * 0.95)] || vals[vals.length - 1];
      maxXCalc = Math.min(
        550,
        Math.max(220, Math.ceil((Math.max(p95 * 1.15, bikeHighW ? bikeHighW * 1.25 : 0) + 20) / BIN_POWER) * BIN_POWER)
      );
      if (lt1 != null) {
        maxXCalc = Math.max(maxXCalc, Math.ceil((lt1 * 1.12 + 15) / BIN_POWER) * BIN_POWER);
      }
      if (lt2 != null) {
        maxXCalc = Math.max(maxXCalc, Math.ceil((lt2 * 1.2 + 15) / BIN_POWER) * BIN_POWER);
      }
      maxXCalc = Math.min(550, maxXCalc);
    } else {
      const paces = filteredActs.map((a) => avgPaceSecPerKm(a)).filter(Boolean);
      const sorted = paces.slice().sort((a, b) => a - b);
      const n = sorted.length;
      const iLo = Math.max(0, Math.floor((n - 1) * 0.03));
      const iHi = Math.min(n - 1, Math.ceil((n - 1) * 0.97));
      const pLo = sorted[iLo];
      const pHi = sorted[iHi];
      maxXCalc = Math.min(
        900,
        Math.max(
          240,
          Math.ceil(
            (Math.max(pHi * 1.1, runSlowSec && runSlowSec > 0 ? runSlowSec * 1.12 : 0, 360) + 20) / BIN_PACE
          ) * BIN_PACE
        )
      );
      const fromData = pLo * 0.92;
      const fromFast = runFastSec && runFastSec > 0 ? runFastSec * 0.88 : Infinity;
      minXCalc = Math.floor(Math.min(fromData, fromFast) / BIN_PACE) * BIN_PACE;
      minXCalc = Math.max(120, minXCalc);
      if (maxXCalc - minXCalc < 12 * BIN_PACE) {
        minXCalc = Math.max(120, Math.floor((maxXCalc - 12 * BIN_PACE) / BIN_PACE) * BIN_PACE);
      }
      if (minXCalc >= maxXCalc - BIN_PACE) {
        minXCalc = Math.max(120, maxXCalc - 15 * BIN_PACE);
      }
      if (runSlowSec != null && runFastSec != null) {
        maxXCalc = Math.max(maxXCalc, Math.ceil((runSlowSec * 1.1 + 15) / BIN_PACE) * BIN_PACE);
        minXCalc = Math.min(minXCalc, Math.floor((runFastSec * 0.86) / BIN_PACE) * BIN_PACE);
        minXCalc = Math.max(120, minXCalc);
        maxXCalc = Math.min(900, maxXCalc);
      }
    }

    // Real stream histograms for the current preset+sport (null until loaded).
    const histWindows = streamHist.token === histToken ? streamHist.windows : null;
    const gridBinW = sportMode === 'bike' ? BIN_POWER : BIN_PACE;
    const gridCenters = [];
    for (let i = 0; ; i += 1) {
      const c = minXCalc + i * gridBinW + gridBinW / 2;
      if (c > maxXCalc) break;
      gridCenters.push(c);
    }

    const periodStats = windows.map((win, idx) => {
      const inP = filteredActs.filter((a) => {
        const d = activityDate(a);
        return d && inWindow(d, now, win.daysStart, win.daysEnd);
      });
      const windowDays = win.daysStart - win.daysEnd;

      // Prefer the real time-in-intensity histogram; fall back to the KDE of
      // per-activity averages while the stream fetch is in flight or empty.
      const hw = histWindows?.find((h) => h.key === win.key);
      let rows, totalSec, count;
      if (hw && hw.totalSec > 0) {
        rows = gridCenters.map((w) => ({
          w,
          pctRaw: (hw.map.get(Math.round(w * 10)) || 0) / hw.totalSec * 100,
        }));
        // Keep the "h / wk" label based on real activity duration, not just
        // the seconds that carried a power/pace sample.
        totalSec = inP.reduce((s, a) => s + (parseTotalSeconds(a) || 0), 0);
        count = inP.length;
      } else {
        ({ rows, totalSec, count } = buildPeriodHistogram(inP, minXCalc, maxXCalc, sportMode));
      }
      const smoothed = smoothSeries(rows);
      const style = CHART_SERIES_STYLES[idx] || CHART_SERIES_STYLES[0];
      return {
        key: win.key,
        daysEnd: win.daysEnd,
        daysStart: win.daysStart,
        color: style.stroke,
        fill: style.fill,
        rangeLabel: formatRange(now, win.daysStart, win.daysEnd),
        windowDays,
        totalSec,
        count,
        rows: smoothed,
      };
    });

    const seriesKeys = periodStats.map((p) => p.key);
    const chartData = [];
    const nBins = periodStats[0]?.rows?.length || 0;
    for (let i = 0; i < nBins; i++) {
      const row = { w: periodStats[0].rows[i].w };
      periodStats.forEach((p) => {
        row[p.key] = p.rows[i]?.pct ?? 0;
      });
      chartData.push(row);
    }

    let yMaxCalc = 0;
    chartData.forEach((r) => {
      seriesKeys.forEach((k) => {
        yMaxCalc = Math.max(yMaxCalc, r[k] || 0);
      });
    });
    yMaxCalc = Math.max(6, Math.ceil(yMaxCalc * 1.15));

    const hasChartCalc = periodStats.some((p) => p.count > 0);
    return {
      chartData,
      meta: periodStats,
      seriesKeys,
      minW: minXCalc,
      maxW: maxXCalc,
      yMax: yMaxCalc,
      hasChart: hasChartCalc,
    };
  }, [activities, ltProfile.lt1, ltProfile.lt2, activePreset, sportMode, streamHist, histToken]);

  const xAxisLabel = sportMode === 'bike' ? 'Power (W)' : 'Pace (min/km), slow to fast';
  const noLtHint =
    sportMode === 'bike'
      ? 'Set LT1/LT2 (W) in Profile → Zones for reference lines.'
      : 'Set LT1/LT2 (pace) in Profile → Zones for reference lines.';
  const emptyTitle = sportMode === 'bike' ? 'No power data yet' : 'No pace data yet';
  const emptyBody =
    sportMode === 'bike'
      ? 'Connect Strava or Garmin and sync rides with a power meter, or add average power to manual entries.'
      : 'Connect Strava or Garmin for runs with GPS/pace, or ensure average speed is present on activities.';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4, delay: 0.05 }}
      className="flex w-full flex-col self-start rounded-2xl border border-gray-100 bg-white p-3 shadow-sm"
    >
      <div className="mb-1.5 flex flex-shrink-0 flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold leading-tight text-gray-800">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-primary">Training volume</span>
            {' · '}
            Intensity ({sportMode === 'bike' ? 'power' : 'pace'})
            <span className="ml-1.5 text-[10px] font-normal text-gray-400">{activePreset.desc}</span>
          </h3>
        </div>
        <div className="flex flex-shrink-0 flex-wrap items-center justify-end gap-1.5">
          <div className="flex items-center gap-0.5 rounded-lg bg-gray-50 p-0.5">
            {(['bike', 'run']).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSport(s)}
                className={`rounded-md px-2 py-0.5 text-[11px] font-medium capitalize transition-colors ${
                  sportMode === s ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-0.5 rounded-lg bg-gray-50 p-0.5">
            {WINDOW_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPreset(p.id)}
                className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium transition-colors ${
                  presetId === p.id ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
                title={p.desc}
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {(toFinitePositive(ltProfile.lt1) == null && toFinitePositive(ltProfile.lt2) == null) ? (
        <div className="mb-1.5 rounded-md border border-amber-100 bg-amber-50/80 px-2 py-1 text-[10px] text-amber-900">
          <span className="font-medium">LT1/LT2 not set.</span> {noLtHint}
        </div>
      ) : null}

      <div className="mb-1.5 flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] leading-tight">
        {meta.map((m) => (
          <div key={m.key} className="flex min-w-0 items-center gap-1" title={m.rangeLabel}>
            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: m.color }} />
            <span className="truncate text-gray-600">
              <span className="font-medium" style={{ color: m.color }}>{m.count}</span>
              <span className="text-gray-400"> act</span>
            </span>
          </div>
        ))}
      </div>

      {!athleteId ? (
        <div className="flex flex-1 flex-col items-center justify-center py-10 text-center text-xs text-gray-500">
          Select an athlete to load history.
        </div>
      ) : !hasChart ? (
        <div className="flex flex-1 flex-col items-center justify-center py-8 text-center">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-gray-50">
            <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
            </svg>
          </div>
          <p className="text-xs font-medium text-gray-600">{emptyTitle}</p>
          <p className="mt-1 max-w-sm text-[11px] text-gray-400">{emptyBody}</p>
        </div>
      ) : (
        <>
          <div className="w-full">
            <ResponsiveContainer width="100%" height={165}>
              <ComposedChart data={chartData} margin={{ top: 22, right: 8, left: 2, bottom: 2 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                <XAxis
                  type="number"
                  dataKey="w"
                  domain={[minW, maxW]}
                  reversed={sportMode === 'run'}
                  tick={{ fontSize: 10, fill: '#6b7280' }}
                  tickFormatter={(v) => (sportMode === 'bike' ? `${Math.round(v)}` : formatPaceTick(v))}
                  label={{ value: xAxisLabel, position: 'insideBottom', offset: -2, fontSize: 10, fill: '#6b7280' }}
                  height={36}
                />
                <YAxis
                  domain={[0, yMax]}
                  tick={{ fontSize: 10, fill: '#6b7280' }}
                  width={44}
                  tickFormatter={(v) => `${Math.round(v)} %`}
                  label={{
                    value: 'Time share (%)',
                    angle: -90,
                    position: 'insideLeft',
                    style: { textAnchor: 'middle', fontSize: 10, fill: '#6b7280' },
                  }}
                />
                <Tooltip content={(props) => <CustomTooltip {...props} sportMode={sportMode} />} />
                {seriesKeys.map((key) => {
                  const m = meta.find((x) => x.key === key);
                  return (
                    <Area
                      key={key}
                      type="monotone"
                      dataKey={key}
                      name={m?.rangeLabel || key}
                      stroke={m?.color}
                      fill={m?.fill}
                      strokeWidth={1.5}
                      dot={false}
                      isAnimationActive={false}
                    />
                  );
                })}
                {toFinitePositive(ltProfile.lt1) != null &&
                  toFinitePositive(ltProfile.lt1) > minW &&
                  toFinitePositive(ltProfile.lt1) < maxW && (
                  <ReferenceLine
                    x={toFinitePositive(ltProfile.lt1)}
                    stroke="#4BA87D"
                    strokeDasharray="5 5"
                    strokeWidth={1.5}
                    isFront
                    label={{
                      value: 'LT1',
                      position: 'top',
                      fill: '#4BA87D',
                      fontSize: 11,
                      fontWeight: 600,
                      offset: 2,
                    }}
                  />
                )}
                {toFinitePositive(ltProfile.lt2) != null &&
                  toFinitePositive(ltProfile.lt2) > minW &&
                  toFinitePositive(ltProfile.lt2) < maxW && (
                  <ReferenceLine
                    x={toFinitePositive(ltProfile.lt2)}
                    stroke="#E05347"
                    strokeDasharray="5 5"
                    strokeWidth={1.5}
                    isFront
                    label={{
                      value: 'LT2',
                      position: 'top',
                      fill: '#E05347',
                      fontSize: 11,
                      fontWeight: 600,
                      offset: 2,
                    }}
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {meta.map((m) => (
              <div
                key={m.key}
                className="rounded-md border border-gray-100 bg-custom-gray px-2 py-1 text-[10px] leading-tight"
                style={{ borderLeftWidth: 2, borderLeftColor: m.color }}
                title={m.rangeLabel}
              >
                <span className="font-semibold text-gray-800">{formatHoursPerWeek(m.totalSec, m.windowDays)}</span>
                <span className="text-gray-500"> · {m.count} · {m.windowDays}d</span>
              </div>
            ))}
          </div>
        </>
      )}
    </motion.div>
  );
}
