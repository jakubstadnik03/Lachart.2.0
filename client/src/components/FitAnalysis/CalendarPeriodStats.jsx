import React, { useMemo, useState, useEffect, useRef } from 'react';
import EChartsModule from 'echarts-for-react';
import { formatDuration, formatDistance } from '../../utils/fitAnalysisUtils';
import { resolveActivityTss } from '../../utils/computeTss';
import {
  activityCalendarDateKey,
  localWeekStartKey,
} from '../../utils/formFitnessFromActivities';
import { mergeProfileZones, enrichProfileForTss } from '../../utils/inferThresholdsFromActivities';
import { getMonthlyPowerAnalysis } from '../../services/api';
import { useCategories } from '../../context/CategoryContext';
import PmcCombinedChart from '../shared/PmcCombinedChart';
import {
  resolveSportKey,
  SportGlyph,
  SPORT_LABELS,
  SPORT_ICON_COLORS,
  SPORT_TOGGLE_ORDER,
} from '../shared/SportIcon';

const ReactECharts = EChartsModule?.default ?? EChartsModule;

const ZONE_KEYS = ['zone1', 'zone2', 'zone3', 'zone4', 'zone5'];
const PROFILE_SPORTS = ['cycling', 'running', 'swimming'];
const SPORT_LABEL = { cycling: 'Bike', running: 'Run', swimming: 'Swim' };

// Total time in zones → "Xh Ym" / "Ym".
function fmtZoneTotal(sec) {
  const s = Math.max(0, Math.round(sec || 0));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

const POWER_ZONE_FILL = ['#7dd3fc', '#38bdf8', '#0ea5e9', '#0369a1', '#082f49'];
const HR_ZONE_FILL = ['#fecaca', '#f87171', '#ef4444', '#dc2626', '#991b1b'];

const POWER_ZONE_NAMES = ['Endurance', 'Moderate', 'Tempo', 'Threshold', 'VO₂max'];
const HR_ZONE_NAMES = ['Easy', 'Aerobic', 'Tempo', 'Threshold', 'Max'];

const BUCKET_COLOR = { ...SPORT_ICON_COLORS };

const UNCATEGORIZED_KEY = '__uncategorized__';

function getLocalDateString(date) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Parse a duration value that might be:
 *  • a plain number (seconds)                   → return as-is
 *  • a "HH:MM:SS" or "MM:SS" string             → parse to seconds
 *  • null / undefined / NaN                      → return 0
 *
 * The Training model stores duration as a String (e.g. "1:23:45"), while
 * FIT files and Strava supply numeric seconds. This helper handles both.
 */
function parseDurationSec(val) {
  if (val == null) return 0;
  const n = Number(val);
  if (!isNaN(n)) return n; // already numeric seconds
  // "H:MM:SS" or "MM:SS"
  const str = String(val).trim();
  const parts = str.split(':').map(Number);
  if (parts.some(isNaN)) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
}

function actDurationSec(act) {
  return parseDurationSec(
    act.totalTimerTime ||
      act.moving_time ||
      act.movingTime ||
      act.totalElapsedTime ||
      act.elapsedTime ||
      act.duration ||
      0
  );
}

function sportBucket(sport) {
  return resolveSportKey(sport);
}

function profileSportFromActivity(sport) {
  const b = sportBucket(sport);
  if (b === 'bike') return 'cycling';
  if (b === 'run' || b === 'hike' || b === 'walk' || b === 'ski') return 'running';
  if (b === 'swim') return 'swimming';
  return null;
}

function parseZoneNumber(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  const cleaned = v.trim().toLowerCase();
  if (!cleaned) return null;
  if (cleaned === '∞' || cleaned.includes('inf')) return Infinity;
  const n = Number(cleaned.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function formatZoneRangeLabel(defs, zk, unit) {
  if (!defs || !defs[zk]) return '';
  const mn = parseZoneNumber(defs[zk]?.min);
  const mxRaw = defs[zk]?.max;
  const mx = (mxRaw === undefined || mxRaw === null || mxRaw === '') ? null : parseZoneNumber(mxRaw);
  if (mn == null && mx == null) return '';
  if (mn != null && mx != null) return `${Math.round(mn)}–${Math.round(mx)} ${unit}`;
  if (mn != null) return `${Math.round(mn)}+ ${unit}`;
  return `≤${Math.round(mx)} ${unit}`;
}

function findZoneKeyForValue(value, zonesObj) {
  const val = Number(value);
  if (!Number.isFinite(val)) return null;
  for (const zKey of ZONE_KEYS) {
    const def = zonesObj?.[zKey];
    if (!def) continue;
    const min = parseZoneNumber(def?.min);
    const max = def?.max === undefined ? null : parseZoneNumber(def?.max);
    if (min === null) continue;
    const maxSafe = max === null ? Infinity : max;
    if (val >= min && val <= maxSafe) return zKey;
  }
  return null;
}

function hasZoneDefinitions(zonesObj) {
  if (!zonesObj || typeof zonesObj !== 'object') return false;
  return ZONE_KEYS.some((zKey) => {
    const def = zonesObj[zKey];
    if (!def) return false;
    return (def?.min !== '' && def?.min !== undefined) || (def?.max !== '' && def?.max !== undefined);
  });
}

function getPowerOrPaceMetric(act, profileSport) {
  if (profileSport === 'cycling') {
    const p = Number(act.avgPower ?? act.averagePower ?? act.average_watts ?? 0);
    return Number.isFinite(p) && p > 0 ? p : null;
  }
  const speedMps = Number(act.avgSpeed ?? act.averageSpeed ?? act.average_speed ?? 0);
  if (!Number.isFinite(speedMps) || speedMps <= 0) return null;
  if (profileSport === 'running') return 1000 / speedMps;
  if (profileSport === 'swimming') return 100 / speedMps;
  return null;
}

function getHeartRate(act) {
  const hr = Number(act.avgHeartRate ?? act.averageHeartRate ?? act.average_heartrate ?? 0);
  return Number.isFinite(hr) && hr > 0 ? hr : null;
}

function getNormalizedPower(act) {
  const np = Number(
    act.normalizedPower
    ?? act.NP
    ?? act.weightedAveragePower
    ?? act.weighted_average_watts
    ?? 0,
  );
  return Number.isFinite(np) && np > 0 ? np : null;
}

function fmtPaceFromSec(secPerUnit) {
  const total = Math.max(0, Math.round(secPerUnit || 0));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function fmtSignedPct(pct) {
  if (pct == null || !Number.isFinite(pct)) return '—';
  const rounded = Math.round(pct);
  if (rounded === 0) return '±0%';
  return `${rounded > 0 ? '+' : ''}${rounded}%`;
}

function fmtSportDuration(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function computeSportBucketStats(acts, profile, tssUser = null) {
  const byBucket = {};
  const empty = () => ({
    sec: 0,
    dist: 0,
    tss: 0,
    count: 0,
    powerWeighted: 0,
    powerSec: 0,
    npWeighted: 0,
    npSec: 0,
    paceWeighted: 0,
    paceSec: 0,
    hrWeighted: 0,
    hrSec: 0,
  });

  (acts || []).forEach((act) => {
    const b = sportBucket(act.sport);
    if (!byBucket[b]) byBucket[b] = empty();
    const st = byBucket[b];
    const sec = actDurationSec(act);
    if (sec <= 0) return;

    st.sec += sec;
    st.count += 1;
    const dist = Number(act.distance || 0);
    if (dist > 0) st.dist += dist;
    const tss = computeTssForAct(act, profile, tssUser);
    if (tss > 0) st.tss += tss;

    const ps = profileSportFromActivity(act.sport);
    if (b === 'bike' || ps === 'cycling') {
      const p = Number(act.avgPower ?? act.averagePower ?? act.average_watts ?? 0);
      if (Number.isFinite(p) && p > 0) {
        st.powerWeighted += p * sec;
        st.powerSec += sec;
      }
      const np = getNormalizedPower(act);
      if (np) {
        st.npWeighted += np * sec;
        st.npSec += sec;
      }
    }

    if (b === 'swim' || ps === 'swimming') {
      const pace = getPowerOrPaceMetric(act, 'swimming');
      if (pace) {
        st.paceWeighted += pace * sec;
        st.paceSec += sec;
      }
    } else if (['run', 'hike', 'walk', 'ski'].includes(b) || ps === 'running') {
      const pace = getPowerOrPaceMetric(act, 'running');
      if (pace) {
        st.paceWeighted += pace * sec;
        st.paceSec += sec;
      }
    }

    const hr = getHeartRate(act);
    if (hr) {
      st.hrWeighted += hr * sec;
      st.hrSec += sec;
    }
  });

  Object.keys(byBucket).forEach((key) => {
    const st = byBucket[key];
    st.avgPower = st.powerSec > 0 ? st.powerWeighted / st.powerSec : null;
    st.avgNp = st.npSec > 0 ? st.npWeighted / st.npSec : null;
    st.avgPace = st.paceSec > 0 ? st.paceWeighted / st.paceSec : null;
    st.avgHr = st.hrSec > 0 ? st.hrWeighted / st.hrSec : null;
  });

  return byBucket;
}

function SportSplitTooltip({ bucket, cur, prev, prevLabel, user }) {
  if (!cur) return null;

  const deltaColor = (pct) => {
    if (pct == null) return 'text-gray-500';
    if (pct > 2) return 'text-green-600';
    if (pct < -2) return 'text-red-600';
    return 'text-gray-500';
  };

  const metricRows = [];
  if (bucket === 'bike') {
    if (cur.avgPower) metricRows.push({ label: 'Avg power', value: `${Math.round(cur.avgPower)} W` });
    if (cur.avgNp && (!cur.avgPower || Math.abs(cur.avgNp - cur.avgPower) > 1)) {
      metricRows.push({ label: 'Norm. power', value: `${Math.round(cur.avgNp)} W` });
    }
  }
  if (bucket === 'swim' && cur.avgPace) {
    metricRows.push({ label: 'Avg pace', value: `${fmtPaceFromSec(cur.avgPace)} /100m` });
  }
  if (['run', 'hike', 'walk', 'ski'].includes(bucket) && cur.avgPace) {
    metricRows.push({ label: 'Avg pace', value: `${fmtPaceFromSec(cur.avgPace)} /km` });
  }
  if (cur.avgHr) metricRows.push({ label: 'Avg HR', value: `${Math.round(cur.avgHr)} bpm` });
  if (cur.tss > 0) metricRows.push({ label: 'TSS', value: String(Math.round(cur.tss)) });
  if (cur.count > 0) metricRows.push({ label: 'Activities', value: String(cur.count) });

  const cmpRows = [];
  if (prev?.sec > 0) {
    const timePct = ((cur.sec - prev.sec) / prev.sec) * 100;
    cmpRows.push({
      label: 'Time',
      value: `${fmtSportDuration(prev.sec)} → ${fmtSportDuration(cur.sec)}`,
      pct: timePct,
    });
    if (cur.dist > 0 || prev.dist > 0) {
      const distPct = prev.dist > 0 ? ((cur.dist - prev.dist) / prev.dist) * 100 : null;
      cmpRows.push({
        label: 'Distance',
        value: `${prev.dist > 0 ? formatDistance(prev.dist, user) : '—'} → ${cur.dist > 0 ? formatDistance(cur.dist, user) : '—'}`,
        pct: distPct,
      });
    }
    if (bucket === 'bike' && cur.avgPower && prev.avgPower) {
      cmpRows.push({
        label: 'Avg power',
        value: `${Math.round(prev.avgPower)} → ${Math.round(cur.avgPower)} W`,
        pct: ((cur.avgPower - prev.avgPower) / prev.avgPower) * 100,
      });
    }
    if (bucket === 'bike' && cur.avgNp && prev.avgNp) {
      cmpRows.push({
        label: 'Norm. power',
        value: `${Math.round(prev.avgNp)} → ${Math.round(cur.avgNp)} W`,
        pct: ((cur.avgNp - prev.avgNp) / prev.avgNp) * 100,
      });
    }
    if (cur.avgPace && prev.avgPace) {
      const pacePct = ((cur.avgPace - prev.avgPace) / prev.avgPace) * 100;
      cmpRows.push({
        label: 'Avg pace',
        value: bucket === 'swim'
          ? `${fmtPaceFromSec(prev.avgPace)} → ${fmtPaceFromSec(cur.avgPace)} /100m`
          : `${fmtPaceFromSec(prev.avgPace)} → ${fmtPaceFromSec(cur.avgPace)} /km`,
        pct: -pacePct,
      });
    }
    if (cur.tss > 0 || prev.tss > 0) {
      const tssPct = prev.tss > 0 ? ((cur.tss - prev.tss) / prev.tss) * 100 : null;
      cmpRows.push({
        label: 'TSS',
        value: `${Math.round(prev.tss || 0)} → ${Math.round(cur.tss || 0)}`,
        pct: tssPct,
      });
    }
  }

  if (metricRows.length === 0 && cmpRows.length === 0) return null;

  return (
    <div className="absolute left-1/2 -translate-x-1/2 bottom-full z-50 mb-1.5 w-60 rounded-xl bg-white border border-gray-200 text-gray-900 text-[11px] shadow-lg p-3 pointer-events-none opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-opacity duration-150">
      <div className="font-semibold text-gray-900 mb-1.5">{SPORT_LABELS[bucket] || bucket}</div>
      {metricRows.length > 0 && (
        <div className="space-y-0.5">
          {metricRows.map((row) => (
            <div key={row.label} className="flex items-baseline justify-between gap-2">
              <span className="text-gray-500">{row.label}</span>
              <span className="font-semibold tabular-nums text-right text-gray-900">{row.value}</span>
            </div>
          ))}
        </div>
      )}
      {cmpRows.length > 0 && (
        <div className={metricRows.length > 0 ? 'border-t border-gray-100 mt-2 pt-2' : ''}>
          <div className="text-[10px] uppercase tracking-wide text-gray-400 mb-1.5">vs {prevLabel}</div>
          <div className="space-y-1">
            {cmpRows.map((row) => (
              <div key={row.label}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-gray-500">{row.label}</span>
                  {row.pct != null && (
                    <span className={`font-semibold tabular-nums ${deltaColor(row.pct)}`}>
                      {fmtSignedPct(row.pct)}
                    </span>
                  )}
                </div>
                <div className="text-gray-700 tabular-nums">{row.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function computeTssForAct(act, profile, tssUser = null) {
  if (!profile) return 0;
  return resolveActivityTss(act, profile, { user: tssUser || profile }) || 0;
}

/** @deprecated use localWeekStartKey — kept for compare labels that need ISO week number */
function isoWeekNumber(date) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  const day = d.getDay() || 7;
  d.setDate(d.getDate() + 4 - day);
  const yearStart = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

// Fallback labels used only when the component has no access to the
// CategoryContext (legacy callers). When wrapped in a component that has
// useCategories(), the dynamic label is read from there — so renames from
// Settings → Categories propagate here automatically.
function categoryLabel(category, getCategory = null) {
  if (!category) return 'Uncategorized';
  if (getCategory) {
    const cat = getCategory(category);
    if (cat?.label) return cat.label;
  }
  const fallback = {
    endurance: 'Endurance',
    tempo: 'Tempo',
    threshold: 'Threshold',
    vo2max: 'VO2max',
    anaerobic: 'Anaerobic',
    recovery: 'Recovery',
  };
  return fallback[category] || String(category);
}

function categoryChipClass(category) {
  const colors = {
    endurance: 'bg-blue-100 border-blue-300 text-blue-800',
    tempo: 'bg-green-100 border-green-300 text-green-800',
    threshold: 'bg-yellow-100 border-yellow-300 text-yellow-800',
    vo2max: 'bg-orange-100 border-orange-300 text-orange-800',
    anaerobic: 'bg-red-100 border-red-300 text-red-800',
    recovery: 'bg-gray-100 border-gray-300 text-gray-800',
  };
  return colors[category] || 'bg-gray-100 border-gray-300 text-gray-700';
}

function makeGroupedBar(labels, curData, lyData, colorA = '#3b82f6') {
  return {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter(params) {
        if (!Array.isArray(params)) return '';
        let html = `<div style="font-size:11px"><b>${params[0]?.axisValueLabel}</b>`;
        params.forEach((p) => {
          if (p.value > 0) html += `<br/>${p.marker}${p.seriesName}: ${(+p.value).toFixed(1)}h`;
        });
        return html + '</div>';
      },
    },
    legend: { data: ['This year', 'Last year'], textStyle: { fontSize: 10, color: '#6b7280' }, top: 2, right: 0 },
    grid: { left: 0, right: 0, top: 32, bottom: 20, containLabel: true },
    xAxis: {
      type: 'category',
      data: labels,
      axisLabel: { fontSize: 9, color: '#6b7280' },
      axisLine: { lineStyle: { color: '#f3f4f6' } },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      axisLabel: { fontSize: 9, color: '#9ca3af', formatter: (v) => v + 'h' },
      splitLine: { lineStyle: { color: '#f3f4f6' } },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    series: [
      {
        name: 'This year',
        type: 'bar',
        barMaxWidth: 22,
        data: curData.map((h) => ({ value: h, itemStyle: { color: colorA, borderRadius: [3, 3, 0, 0] } })),
      },
      {
        name: 'Last year',
        type: 'bar',
        barMaxWidth: 22,
        data: lyData.map((h) => ({ value: h, itemStyle: { color: colorA + '66', borderRadius: [3, 3, 0, 0] } })),
      },
    ],
  };
}

function ZoneRows({ secMap, colors, zoneNames }) {
  const total = ZONE_KEYS.reduce((s, k) => s + (secMap[k] || 0), 0);
  if (total <= 0)
    return (
      <p className="text-xs text-gray-400 text-center py-4">
        No data — add zones in profile
      </p>
    );
  return (
    <div className="space-y-2">
      {ZONE_KEYS.map((zk, zi) => {
        const sec = secMap[zk] || 0;
        const pct = total > 0 ? (sec / total) * 100 : 0;
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        const timeStr = h > 0 ? `${h}h ${m}m` : `${m}m`;
        return (
          <div key={zk} className="flex items-center gap-2">
            <span className="w-6 text-sm font-bold text-gray-400 shrink-0">Z{zi + 1}</span>
            <span className="w-16 text-xs text-gray-500 shrink-0">{zoneNames[zi]}</span>
            <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${pct}%`, backgroundColor: colors[zi] }}
              />
            </div>
            <span className="w-8 text-xs text-right text-gray-500 shrink-0">
              {pct.toFixed(0)}%
            </span>
            <span className="w-10 text-xs text-right text-gray-600 font-medium shrink-0">
              {sec > 0 ? timeStr : '—'}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Period analytics: volume, zones (from avg power/pace/HR), TSS, distance, list by training category.
 */
export default function CalendarPeriodStats({
  activities = [],
  period,
  user = null,
  userProfile = null,
  isMobile = false,
  onSelectActivity = null,
  athleteId = null,
}) {
  const { getCategory } = useCategories();
  const effectiveProfile = useMemo(
    () => mergeProfileZones(userProfile, user) || userProfile || user,
    [userProfile, user],
  );
  const tssProfile = useMemo(
    () => (effectiveProfile && activities?.length
      ? enrichProfileForTss(effectiveProfile, activities)
      : effectiveProfile),
    [effectiveProfile, activities],
  );
  const effectiveAthleteId = athleteId || user?._id || user?.id || null;
  const periodView = period?.view === 'week' ? 'week' : 'month';

  // ── Server zone data ─────────────────────────────────────────────────────────
  // The client-side fallback assigns the WHOLE activity to a single zone based
  // on its average power/pace which is wrong (shows 100% Z1 for easy rides).
  // Instead, fetch the server's second-by-second zone distribution — the same
  // source the Home "TIME IN ZONES" card uses.
  // We fetch the FULL period (start→end) with startDate/endDate so multi-month
  // periods are covered. The API returns an array of month objects; we aggregate.
  const [monthlyZones, setMonthlyZones] = useState(null);
  useEffect(() => {
    if (!effectiveAthleteId || !period?.periodStart || !period?.periodEnd) { setMonthlyZones(null); return; }
    let cancelled = false;
    const startDate = new Date(period.periodStart);
    const endDate = new Date(period.periodEnd);
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) { setMonthlyZones(null); return; }

    // Convert API shape { 1: { time: N }, 2: ... } → { zone1: N, zone2: ... }
    const toZoneSec = (src) => {
      if (!src) return null;
      const out = {};
      for (let z = 1; z <= 5; z++) {
        const v = src[z] ?? src[String(z)];
        out[`zone${z}`] = Number(v?.time) || 0;
      }
      return Object.values(out).some(v => v > 0) ? out : null;
    };

    // Aggregate zone data across multiple month objects (API returns array)
    const aggregateZones = (months, getter) => {
      const out = Object.fromEntries(['zone1','zone2','zone3','zone4','zone5'].map(k => [k, 0]));
      months.forEach(m => {
        const src = getter(m);
        if (!src) return;
        ['zone1','zone2','zone3','zone4','zone5'].forEach(k => { out[k] += src[k] || 0; });
      });
      return Object.values(out).some(v => v > 0) ? out : null;
    };

    getMonthlyPowerAnalysis(effectiveAthleteId, null, { startDate, endDate })
      .then(res => {
        if (cancelled) return;
        // API always returns an array of month objects
        const months = Array.isArray(res) ? res : (res ? [res] : []);
        if (!months.length) { setMonthlyZones(null); return; }

        // Build per-month zone-sec objects first, then aggregate
        const monthZoneSecs = months.map(m => ({
          power: {
            cycling: toZoneSec(m.zones),
            running: toZoneSec(m.runningZoneTimes),
            swimming: toZoneSec(m.swimmingZoneTimes),
          },
          hr: {
            cycling: toZoneSec(m.bikeHrZones ?? m.hrZones),
            running: toZoneSec(m.runningHrZones),
            swimming: toZoneSec(m.swimmingHrZones),
          },
        }));

        setMonthlyZones({
          power: {
            cycling: aggregateZones(monthZoneSecs, m => m.power.cycling),
            running: aggregateZones(monthZoneSecs, m => m.power.running),
            swimming: aggregateZones(monthZoneSecs, m => m.power.swimming),
          },
          hr: {
            cycling: aggregateZones(monthZoneSecs, m => m.hr.cycling),
            running: aggregateZones(monthZoneSecs, m => m.hr.running),
            swimming: aggregateZones(monthZoneSecs, m => m.hr.swimming),
          },
        });
      })
      .catch(() => setMonthlyZones(null));
    return () => { cancelled = true; };
  }, [effectiveAthleteId, period?.periodStart, period?.periodEnd]); // eslint-disable-line react-hooks/exhaustive-deps

  // Combine monthly server zones across sports for the "All" tab
  const serverZoneSecAll = useMemo(() => {
    if (!monthlyZones) return { power: null, hr: null };
    const combine = (byPs) => {
      const out = Object.fromEntries(ZONE_KEYS.map(k => [k, 0]));
      PROFILE_SPORTS.forEach(ps => {
        const src = byPs[ps];
        if (src) ZONE_KEYS.forEach(k => { out[k] += src[k] || 0; });
      });
      return Object.values(out).some(v => v > 0) ? out : null;
    };
    return { power: combine(monthlyZones.power), hr: combine(monthlyZones.hr) };
  }, [monthlyZones]);

  const [activeTab, setActiveTab] = useState('overview');
  const [showZoneDetails, setShowZoneDetails] = useState(false);

  // Mobile only: enable vertical scroll-snap on the surrounding scroller so
  // each chart section settles into view instead of stopping mid-card. Uses
  // 'proximity' (not mandatory) so short scrolls still feel natural.
  const rootRef = useRef(null);
  useEffect(() => {
    if (!isMobile) return;
    let el = rootRef.current?.parentElement;
    while (el) {
      const cs = getComputedStyle(el);
      if (/(auto|scroll)/.test(cs.overflowY)) break;
      el = el.parentElement;
    }
    if (!el) return;
    const prev = el.style.scrollSnapType;
    el.style.scrollSnapType = 'y proximity';
    return () => { el.style.scrollSnapType = prev; };
  }, [isMobile, activeTab]);

  const [compareMode, setCompareMode] = useState(() => periodView);
  const [compareRefDate, setCompareRefDate] = useState(() =>
    period?.periodStart ? new Date(period.periodStart) : new Date()
  );

  const filtered = useMemo(() => {
    if (!period?.periodStart || !period?.periodEnd) return [];
    const startK = getLocalDateString(period.periodStart);
    const endK = getLocalDateString(period.periodEnd);
    if (!startK || !endK) return [];
    return activities.filter((act) => {
      const k = activityCalendarDateKey(act);
      return k && k >= startK && k <= endK;
    });
  }, [activities, period]);

  const aggregates = useMemo(() => {
    let totalSec = 0;
    let totalDist = 0;
    let totalTss = 0;
    const bySportSec = {};
    const byDaySec = new Map();
    const byDayCount = new Map();
    const byDayTss = new Map();
    const tssByProfileSport = { cycling: 0, running: 0, swimming: 0, other: 0 };
    const distByProfileSport = { cycling: 0, running: 0, swimming: 0, other: 0 };
    let maxTssAct = null;
    let maxDurAct = null;

    const powerZoneSec = {
      cycling: Object.fromEntries(ZONE_KEYS.map((k) => [k, 0])),
      running: Object.fromEntries(ZONE_KEYS.map((k) => [k, 0])),
      swimming: Object.fromEntries(ZONE_KEYS.map((k) => [k, 0])),
    };
    const hrZoneSec = {
      cycling: Object.fromEntries(ZONE_KEYS.map((k) => [k, 0])),
      running: Object.fromEntries(ZONE_KEYS.map((k) => [k, 0])),
      swimming: Object.fromEntries(ZONE_KEYS.map((k) => [k, 0])),
    };

    // For daily stacked bar by sport
    const byDaySportSec = new Map();

    // Intensity totals across all zone data
    let intensityEasySec = 0;
    let intensityModSec = 0;
    let intensityHardSec = 0;

    filtered.forEach((act) => {
      const sec = actDurationSec(act);
      const dist = Number(act.distance || 0);
      const tssVal = computeTssForAct(act, tssProfile, user);
      totalSec += sec;
      totalDist += dist;
      if (tssVal > 0) totalTss += tssVal;

      const b = sportBucket(act.sport);
      bySportSec[b] = (bySportSec[b] || 0) + sec;

      const ps = profileSportFromActivity(act.sport);
      const psk = ps || 'other';
      if (tssVal > 0) tssByProfileSport[psk] = (tssByProfileSport[psk] || 0) + tssVal;
      if (dist > 0) distByProfileSport[psk] = (distByProfileSport[psk] || 0) + dist;

      if (
        !maxTssAct ||
        tssVal > (Number(maxTssAct.tss || maxTssAct.TSS || maxTssAct.totalTSS) || 0)
      ) {
        if (tssVal > 0) maxTssAct = { ...act, tss: tssVal };
      }
      if (!maxDurAct || sec > actDurationSec(maxDurAct)) {
        if (sec > 0) maxDurAct = act;
      }

      const dk = activityCalendarDateKey(act);
      if (dk) {
        byDaySec.set(dk, (byDaySec.get(dk) || 0) + sec);
        byDayCount.set(dk, (byDayCount.get(dk) || 0) + 1);
        if (tssVal > 0) byDayTss.set(dk, (byDayTss.get(dk) || 0) + tssVal);

        const daySportKey = `${dk}-${b}`;
        byDaySportSec.set(daySportKey, (byDaySportSec.get(daySportKey) || 0) + sec);
      }

      if (effectiveProfile && ps) {
        const powerZones = effectiveProfile?.powerZones?.[ps] || {};
        const hrZones = effectiveProfile?.heartRateZones?.[ps] || {};
        const metric = getPowerOrPaceMetric(act, ps);
        if (metric != null && hasZoneDefinitions(powerZones)) {
          const zk = findZoneKeyForValue(metric, powerZones);
          if (zk) {
            powerZoneSec[ps][zk] += sec;
            // Accumulate intensity from power zones
            if (zk === 'zone1' || zk === 'zone2') intensityEasySec += sec;
            else if (zk === 'zone3') intensityModSec += sec;
            else if (zk === 'zone4' || zk === 'zone5') intensityHardSec += sec;
          }
        }
        const hr = getHeartRate(act);
        if (hr != null && hasZoneDefinitions(hrZones)) {
          const zk = findZoneKeyForValue(hr, hrZones);
          if (zk) {
            hrZoneSec[ps][zk] += sec;
            // If no power zone data was found, accumulate from HR zones
            if (!(metric != null && hasZoneDefinitions(powerZones))) {
              if (zk === 'zone1' || zk === 'zone2') intensityEasySec += sec;
              else if (zk === 'zone3') intensityModSec += sec;
              else if (zk === 'zone4' || zk === 'zone5') intensityHardSec += sec;
            }
          }
        }
      }
    });

    const dayKeys = [];
    if (period?.periodStart && period?.periodEnd) {
      const cur = new Date(period.periodStart);
      cur.setHours(0, 0, 0, 0);
      const endD = new Date(period.periodEnd);
      endD.setHours(0, 0, 0, 0);
      while (cur <= endD) {
        dayKeys.push(getLocalDateString(cur));
        cur.setDate(cur.getDate() + 1);
      }
    }
    const dailyHours = dayKeys.map((k) => Number(((byDaySec.get(k) || 0) / 3600).toFixed(2)));
    const dailyCounts = dayKeys.map((k) => byDayCount.get(k) || 0);
    const dailyTss = dayKeys.map((k) => Math.round(byDayTss.get(k) || 0));

    const dailyHoursBike = dayKeys.map((k) => +((byDaySportSec.get(`${k}-bike`) || 0) / 3600).toFixed(2));
    const dailyHoursRun = dayKeys.map((k) => +((byDaySportSec.get(`${k}-run`) || 0) / 3600).toFixed(2));
    const dailyHoursSwim = dayKeys.map((k) => +((byDaySportSec.get(`${k}-swim`) || 0) / 3600).toFixed(2));

    const zoneSportsWithPower = PROFILE_SPORTS.filter((ps) => {
      if (!hasZoneDefinitions(effectiveProfile?.powerZones?.[ps])) return false;
      return ZONE_KEYS.some((zk) => powerZoneSec[ps][zk] > 0);
    });
    const zoneSportsWithHr = PROFILE_SPORTS.filter((ps) => {
      if (!hasZoneDefinitions(effectiveProfile?.heartRateZones?.[ps])) return false;
      return ZONE_KEYS.some((zk) => hrZoneSec[ps][zk] > 0);
    });

    // Combined "all sports" zone totals
    const powerZoneSecAll = Object.fromEntries(ZONE_KEYS.map(zk => [
      zk,
      PROFILE_SPORTS.reduce((s, ps) => s + (powerZoneSec[ps][zk] || 0), 0)
    ]));
    const hrZoneSecAll = Object.fromEntries(ZONE_KEYS.map(zk => [
      zk,
      PROFILE_SPORTS.reduce((s, ps) => s + (hrZoneSec[ps][zk] || 0), 0)
    ]));

    return {
      count: filtered.length,
      totalSec,
      totalDist,
      totalTss,
      bySportSec,
      dayKeys,
      dailyHours,
      dailyCounts,
      dailyTss,
      dailyHoursBike,
      dailyHoursRun,
      dailyHoursSwim,
      tssByProfileSport,
      distByProfileSport,
      maxTssAct,
      maxDurAct,
      powerZoneSec,
      hrZoneSec,
      powerZoneSecAll,
      hrZoneSecAll,
      zoneSportsWithPower,
      zoneSportsWithHr,
      intensityEasySec,
      intensityModSec,
      intensityHardSec,
    };
  }, [filtered, period?.periodStart, period?.periodEnd, tssProfile, user, effectiveProfile]);

  // Weekly trend for the last 12 completed weeks + current week
  const weeklyTrend = useMemo(() => {
    if (!activities.length) return [];

    // Determine current period's week key for highlighting (Monday-based, matches dashboard)
    const currentPeriodWeekKey = period?.periodStart
      ? localWeekStartKey(period.periodStart)
      : null;

    // Build a map of weekKey -> { tss, hours }
    const weekMap = new Map();
    activities.forEach((act) => {
      const dk = activityCalendarDateKey(act);
      const wk = dk ? localWeekStartKey(`${dk}T12:00:00`) : null;
      if (!wk) return;
      if (!weekMap.has(wk)) weekMap.set(wk, { tss: 0, hours: 0 });
      const entry = weekMap.get(wk);
      const tssVal = computeTssForAct(act, tssProfile, user);
      if (tssVal > 0) entry.tss += tssVal;
      entry.hours += actDurationSec(act) / 3600;
    });

    // Sort all week keys
    const sortedKeys = Array.from(weekMap.keys()).sort();

    // Take last 13 (12 completed + current)
    const recentKeys = sortedKeys.slice(-13);

    return recentKeys.map((wk) => {
      const entry = weekMap.get(wk) || { tss: 0, hours: 0 };
      const ws = new Date(`${wk}T12:00:00`);
      const label = Number.isNaN(ws.getTime())
        ? wk
        : ws.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      return {
        weekKey: wk,
        label,
        tss: Math.round(entry.tss),
        hours: +entry.hours.toFixed(1),
        isCurrent: wk === currentPeriodWeekKey,
      };
    });
  }, [activities, tssProfile, user, period?.periodStart]);

  const weekComparison = useMemo(() => {
    if (periodView !== 'week') return null;
    if (!period?.periodStart || !period?.periodEnd) return null;

    const prevStart = new Date(period.periodStart);
    prevStart.setDate(prevStart.getDate() - 7);
    const prevEnd = new Date(period.periodEnd);
    prevEnd.setDate(prevEnd.getDate() - 7);

    const startK = getLocalDateString(prevStart);
    const endK = getLocalDateString(prevEnd);
    if (!startK || !endK) return null;

    const prevActs = activities.filter((act) => {
      const raw = act.date || act.timestamp || act.startDate || act.start_time;
      if (!raw) return false;
      const k = getLocalDateString(raw);
      return k && k >= startK && k <= endK;
    });

    let prevTss = 0;
    const prevDistByProfileSport = { cycling: 0, running: 0, swimming: 0, other: 0 };

    prevActs.forEach((act) => {
      const dist = Number(act.distance || 0);
      const ps = profileSportFromActivity(act.sport) || 'other';
      if (dist > 0) prevDistByProfileSport[ps] = (prevDistByProfileSport[ps] || 0) + dist;

      const tssVal = computeTssForAct(act, tssProfile, user);
      if (tssVal > 0) prevTss += tssVal;
    });

    const deltaTss = (aggregates.totalTss || 0) - prevTss;
    const ratio = prevTss > 0 ? (aggregates.totalTss || 0) / prevTss : null;
    const overload = ratio != null ? ratio >= 1.35 : false;

    return {
      prevCount: prevActs.length,
      prevTss,
      deltaTss,
      ratio,
      overload,
      prevDistByProfileSport,
    };
  }, [periodView, period?.periodStart, period?.periodEnd, activities, tssProfile, user, aggregates.totalTss]);

  const prevPeriodBounds = useMemo(() => {
    if (!period?.periodStart || !period?.periodEnd) return null;
    if (periodView === 'week') {
      const prevStart = new Date(period.periodStart);
      prevStart.setDate(prevStart.getDate() - 7);
      const prevEnd = new Date(period.periodEnd);
      prevEnd.setDate(prevEnd.getDate() - 7);
      return { start: prevStart, end: prevEnd, label: 'last week' };
    }
    const anchor = new Date(period.periodStart);
    const prevStart = new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1);
    const prevEnd = new Date(anchor.getFullYear(), anchor.getMonth(), 0);
    return { start: prevStart, end: prevEnd, label: 'last month' };
  }, [period?.periodStart, period?.periodEnd, periodView]);

  const filteredPrevPeriod = useMemo(() => {
    if (!prevPeriodBounds) return [];
    const s = getLocalDateString(prevPeriodBounds.start);
    const e = getLocalDateString(prevPeriodBounds.end);
    if (!s || !e) return [];
    return activities.filter((act) => {
      const k = activityCalendarDateKey(act);
      return k && k >= s && k <= e;
    });
  }, [activities, prevPeriodBounds]);

  const sportSplitStats = useMemo(() => ({
    current: computeSportBucketStats(filtered, tssProfile, user),
    previous: computeSportBucketStats(filteredPrevPeriod, tssProfile, user),
    prevLabel: prevPeriodBounds?.label || 'previous period',
  }), [filtered, filteredPrevPeriod, tssProfile, user, prevPeriodBounds?.label]);

  const byCategory = useMemo(() => {
    const m = new Map();
    filtered.forEach((act) => {
      const key = act.category && String(act.category).trim() ? act.category : UNCATEGORIZED_KEY;
      if (!m.has(key)) m.set(key, []);
      m.get(key).push(act);
    });
    for (const arr of m.values()) {
      arr.sort((a, b) => new Date(b.date || b.timestamp) - new Date(a.date || a.timestamp));
    }
    const items = Array.from(m.entries()).map(([key, acts]) => {
      const totalSec = acts.reduce((sum, a) => sum + actDurationSec(a), 0);
      return { key, acts, totalSec, count: acts.length };
    });

    items.sort((a, b) => {
      if (a.key === UNCATEGORIZED_KEY) return 1;
      if (b.key === UNCATEGORIZED_KEY) return -1;
      return (b.totalSec || 0) - (a.totalSec || 0);
    });

    return {
      map: m,
      keys: items.map((i) => i.key),
      meta: new Map(items.map((i) => [i.key, { totalSec: i.totalSec, count: i.count }])),
    };
  }, [filtered]);

  const [showAllCategories, setShowAllCategories] = useState(false);
  const [expandedCategoryKeys, setExpandedCategoryKeys] = useState(() => new Set());
  const MAX_CATEGORIES_VISIBLE = 3;
  const MAX_ACTIVITIES_PER_CATEGORY = 5;
  const visibleCategoryKeys = showAllCategories
    ? byCategory.keys
    : byCategory.keys.slice(0, MAX_CATEGORIES_VISIBLE);
  const hasMoreCategories = byCategory.keys.length > MAX_CATEGORIES_VISIBLE;

  // Zone sport toggle state — default to 'all'
  const [zoneSport, setZoneSport] = useState('all');
  // Daily training-load chart: switch the bars between Time (h, stacked by
  // sport) and TSS (single bar).
  const [dailyLoadMode, setDailyLoadMode] = useState('time'); // 'time' | 'tss'

  // Daily stacked load chart option
  const dailyStackedOption = useMemo(() => {
    if (!aggregates.dayKeys.length) return null;
    const isTss = dailyLoadMode === 'tss';
    const unit = isTss ? ' TSS' : 'h';
    const labels = aggregates.dayKeys.map((k) => {
      const [, m, d] = k.split('-');
      return `${d}.${m}.`;
    });
    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter(params) {
          if (!Array.isArray(params)) return '';
          let html = `<div style="font-size:11px"><b>${params[0]?.axisValueLabel || ''}</b>`;
          params.forEach((p) => {
            if (p.value > 0)
              html += `<br/>${p.marker}${p.seriesName}: ${p.value}${unit}`;
          });
          html += '</div>';
          return html;
        },
      },
      grid: { left: 0, right: 0, top: 4, bottom: 24, containLabel: true },
      xAxis: {
        type: 'category',
        data: labels,
        axisLabel: {
          fontSize: 9,
          color: '#9ca3af',
          rotate: periodView === 'month' ? 35 : 0,
        },
        axisLine: { lineStyle: { color: '#f3f4f6' } },
        axisTick: { show: false },
      },
      yAxis: {
        type: 'value',
        axisLabel: { fontSize: 9, color: '#9ca3af' },
        splitLine: { lineStyle: { color: '#f3f4f6' } },
        axisLine: { show: false },
        axisTick: { show: false },
      },
      series: isTss
        ? [
            {
              name: 'TSS',
              type: 'bar',
              barMaxWidth: 14,
              itemStyle: { color: '#7c6cf0', borderRadius: [3, 3, 0, 0] },
              data: aggregates.dailyTss,
            },
          ]
        : [
            {
              name: 'Bike',
              type: 'bar',
              stack: 'd',
              barMaxWidth: 14,
              itemStyle: { color: '#3b82f6', borderRadius: 0 },
              data: aggregates.dailyHoursBike,
            },
            {
              name: 'Run',
              type: 'bar',
              stack: 'd',
              barMaxWidth: 14,
              itemStyle: { color: '#f97316', borderRadius: 0 },
              data: aggregates.dailyHoursRun,
            },
            {
              name: 'Swim',
              type: 'bar',
              stack: 'd',
              barMaxWidth: 14,
              itemStyle: { color: '#06b6d4', borderRadius: 0 },
              data: aggregates.dailyHoursSwim,
            },
          ],
    };
  }, [aggregates.dayKeys, aggregates.dailyHoursBike, aggregates.dailyHoursRun, aggregates.dailyHoursSwim, aggregates.dailyTss, dailyLoadMode, periodView]);

  // Weekly trend chart option
  const weeklyTrendOption = useMemo(() => {
    if (!weeklyTrend.length) return null;
    const labels = weeklyTrend.map((w) => w.label);
    const tssData = weeklyTrend.map((w) => ({
      value: w.tss,
      itemStyle: {
        color: w.isCurrent ? '#1d4ed8' : '#3b82f6',
        borderRadius: [2, 2, 0, 0],
      },
    }));
    const hoursData = weeklyTrend.map((w) => w.hours);

    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter(params) {
          if (!Array.isArray(params)) return '';
          const tssP = params.find((p) => p.seriesName === 'TSS');
          const hrP = params.find((p) => p.seriesName === 'Hours');
          const label = params[0]?.axisValueLabel || '';
          let html = `<div style="font-size:11px"><b>${label}</b>`;
          if (tssP) html += `<br/>${tssP.marker}TSS: ${tssP.value}`;
          if (hrP) html += `<br/>${hrP.marker}Volume: ${hrP.value}h`;
          html += '</div>';
          return html;
        },
      },
      grid: { left: 36, right: 36, top: 8, bottom: 28, containLabel: false },
      xAxis: {
        type: 'category',
        data: labels,
        axisLabel: { fontSize: 9, color: '#9ca3af', rotate: 0 },
        axisLine: { lineStyle: { color: '#f3f4f6' } },
        axisTick: { show: false },
      },
      yAxis: [
        {
          type: 'value',
          name: 'TSS',
          nameTextStyle: { fontSize: 8, color: '#9ca3af' },
          axisLabel: { fontSize: 8, color: '#9ca3af' },
          splitLine: { lineStyle: { color: '#f3f4f6' } },
          axisLine: { show: false },
          axisTick: { show: false },
        },
        {
          type: 'value',
          name: 'h',
          nameTextStyle: { fontSize: 8, color: '#9ca3af' },
          axisLabel: { fontSize: 8, color: '#9ca3af' },
          splitLine: { show: false },
          axisLine: { show: false },
          axisTick: { show: false },
        },
      ],
      series: [
        {
          name: 'TSS',
          type: 'bar',
          yAxisIndex: 0,
          barMaxWidth: 18,
          data: tssData,
        },
        {
          name: 'Hours',
          type: 'line',
          yAxisIndex: 1,
          smooth: true,
          symbol: 'circle',
          symbolSize: 4,
          lineStyle: { color: '#f97316', width: 2 },
          itemStyle: { color: '#f97316' },
          data: hoursData,
        },
      ],
    };
  }, [weeklyTrend]);

  // Intensity donut option — by training zones (Z1–Z5)
  // Prefer server second-by-second data; fall back to client estimate
  const intensityDonutOption = useMemo(() => {
    const powerSec = serverZoneSecAll.power || aggregates.powerZoneSecAll || {};
    const hrSec = serverZoneSecAll.hr || aggregates.hrZoneSecAll || {};
    // Prefer power zones if available, fall back to HR zones
    const hasPower = ZONE_KEYS.some((k) => (powerSec[k] || 0) > 0);
    const secMap = hasPower ? powerSec : hrSec;
    const names = hasPower ? POWER_ZONE_NAMES : HR_ZONE_NAMES;
    const unit = hasPower ? 'W' : 'bpm';
    const zoneDefs = hasPower
      ? (effectiveProfile?.powerZones?.cycling || null)
      : (effectiveProfile?.heartRateZones?.cycling
        || effectiveProfile?.heartRateZones?.running
        || effectiveProfile?.heartRateZones?.swimming
        || null);
    const sourceLabel = hasPower ? 'Power zones' : 'Heart rate zones';
    const fills = hasPower
      ? ['#22c55e', '#84cc16', '#facc15', '#f97316', '#ef4444']  // green→red gradient by zone
      : ['#86efac', '#4ade80', '#f97316', '#dc2626', '#991b1b'];
    const total = ZONE_KEYS.reduce((s, k) => s + (secMap[k] || 0), 0);
    if (total <= 0) return null;
    const pieData = ZONE_KEYS.map((zk, i) => ({
      value: secMap[zk] || 0,
      name: `Z${i + 1} ${names[i]}`,
      zoneKey: zk,
      itemStyle: { color: fills[i] },
    })).filter((d) => d.value > 0);
    if (!pieData.length) return null;
    return {
      backgroundColor: 'transparent',
      tooltip: {
        backgroundColor: '#ffffff',
        borderColor: '#e5e7eb',
        borderWidth: 1,
        padding: [10, 12],
        textStyle: { color: '#111827', fontSize: 11 },
        extraCssText: 'box-shadow: 0 4px 12px rgba(15,23,42,.08); border-radius: 12px;',
        formatter(params) {
          const sec = params.value;
          const zk = params.data?.zoneKey;
          const pct = params.percent != null ? Number(params.percent).toFixed(1) : '0.0';
          const timeStr = fmtZoneTotal(sec);
          const totalStr = fmtZoneTotal(total);
          const range = formatZoneRangeLabel(zoneDefs, zk, unit);
          let html = `<div style="font-weight:600;margin-bottom:4px;color:#111827">${params.name}</div>`;
          html += `<div style="color:#6b7280;font-size:10px">${sourceLabel}${range ? ` · ${range}` : ''}</div>`;
          html += `<div style="margin-top:6px"><span style="font-weight:600;color:#111827">${timeStr}</span>`;
          html += `<span style="color:#6b7280"> · ${pct}% of zone time</span></div>`;
          html += `<div style="color:#9ca3af;font-size:10px;margin-top:4px">${totalStr} total across Z1–Z5</div>`;
          return html;
        },
      },
      series: [
        {
          type: 'pie',
          radius: ['50%', '80%'],
          center: ['50%', '50%'],
          data: pieData,
          label: { show: true, formatter: '{b}\n{d}%', fontSize: 9 },
          labelLine: { length: 5, length2: 4 },
        },
      ],
    };
  }, [aggregates, serverZoneSecAll, effectiveProfile]); // eslint-disable-line react-hooks/exhaustive-deps

  // Zone horizontal bar chart options (power and HR) for Zones tab
  const zoneBarOptions = useMemo(() => {
    const isAll = zoneSport === 'all';
    const profSport = { bike: 'cycling', run: 'running', swim: 'swimming' }[zoneSport] || null;
    // Week view always uses the period-reactive client aggregates; month can use
    // the more accurate server second-by-second data (which is month-keyed).
    const useServer = periodView === 'month';
    const powerSec = isAll
      ? ((useServer && serverZoneSecAll.power) || aggregates.powerZoneSecAll || {})
      : ((useServer && monthlyZones?.power?.[zoneSport]) || aggregates.powerZoneSec?.[zoneSport] || {});
    const hrSec = isAll
      ? ((useServer && serverZoneSecAll.hr) || aggregates.hrZoneSecAll || {})
      : ((useServer && monthlyZones?.hr?.[zoneSport]) || aggregates.hrZoneSec?.[zoneSport] || {});

    const powerTotal = ZONE_KEYS.reduce((s, k) => s + (powerSec[k] || 0), 0);
    const hrTotal = ZONE_KEYS.reduce((s, k) => s + (hrSec[k] || 0), 0);

    // Zone boundary ranges (only meaningful for a single sport).
    const powerDefs = zoneSport === 'bike' ? (effectiveProfile?.powerZones?.cycling || null) : null;
    const hrDefs = profSport ? (effectiveProfile?.heartRateZones?.[profSport] || null) : null;
    const rangeStr = (defs, zk, unit) => {
      if (!defs || !defs[zk]) return '';
      const mn = parseZoneNumber(defs[zk]?.min);
      const mxRaw = defs[zk]?.max;
      const mx = (mxRaw === undefined || mxRaw === null || mxRaw === '') ? null : parseZoneNumber(mxRaw);
      if (mn == null && mx == null) return '';
      if (mn != null && mx != null) return `${Math.round(mn)}–${Math.round(mx)} ${unit}`;
      if (mn != null) return `${Math.round(mn)}+ ${unit}`;
      return `≤${Math.round(mx)} ${unit}`;
    };
    const fmtZoneTime = (sec) => {
      const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
      return h > 0 ? `${h}h ${m}m` : `${m}m`;
    };

    const makeOption = (secMap, total, fills, defs, unit) => {
      if (total <= 0) return null;
      // y-axis data reversed so Z5 is top, Z1 is bottom
      const reversed = [...ZONE_KEYS].reverse(); // zone5 -> zone1
      const reversedFills = [...fills].reverse();
      return {
        backgroundColor: 'transparent',
        tooltip: {
          trigger: 'axis',
          formatter(params) {
            if (!Array.isArray(params) || !params[0]) return '';
            const p = params[0];
            const zk = reversed[p.dataIndex];
            const sec = secMap[zk] || 0;
            const range = rangeStr(defs, zk, unit);
            return `<div style="font-size:11px"><b>${p.name}${range ? ` · ${range}` : ''}</b><br/>${p.value}% · ${fmtZoneTime(sec)}</div>`;
          },
        },
        grid: { left: 60, right: 30, top: 4, bottom: 4, containLabel: false },
        xAxis: {
          type: 'value',
          max: 100,
          axisLabel: { formatter: (v) => v + '%', fontSize: 9, color: '#9ca3af' },
          splitLine: { lineStyle: { color: '#f3f4f6' } },
          axisLine: { show: false },
          axisTick: { show: false },
        },
        yAxis: {
          type: 'category',
          data: reversed.map((_, i) => `Z${5 - i}`),
          axisLabel: { fontSize: 9, color: '#9ca3af' },
          axisLine: { show: false },
          axisTick: { show: false },
        },
        series: [
          {
            type: 'bar',
            barMaxWidth: 16,
            data: reversed.map((zk, i) => ({
              value: total > 0 ? +(((secMap[zk] || 0) / total) * 100).toFixed(1) : 0,
              itemStyle: { color: reversedFills[i], borderRadius: [0, 4, 4, 0] },
            })),
            label: {
              show: true,
              position: 'right',
              fontSize: 9,
              color: '#6b7280',
              formatter: (v) => (v.value > 0 ? v.value + '%' : ''),
            },
          },
        ],
      };
    };

    return {
      power: makeOption(powerSec, powerTotal, POWER_ZONE_FILL, powerDefs, 'W'),
      hr: makeOption(hrSec, hrTotal, HR_ZONE_FILL, hrDefs, 'bpm'),
      powerTotalSec: powerTotal,
      hrTotalSec: hrTotal,
    };
  }, [zoneSport, periodView, aggregates.powerZoneSec, aggregates.hrZoneSec, aggregates.powerZoneSecAll, aggregates.hrZoneSecAll, monthlyZones, serverZoneSecAll, effectiveProfile, period?.periodStart, period?.periodEnd]); // eslint-disable-line react-hooks/exhaustive-deps

  // Activity effort scatter / timeline option
  const effortTimelineOption = useMemo(() => {
    if (filtered.length < 3 || filtered.length > 50) return null;

    const data = filtered.map((act) => {
      const raw = act.date || act.timestamp || act.startDate;
      const d = raw ? new Date(raw) : null;
      if (!d || Number.isNaN(d.getTime())) return null;
      const tss = computeTssForAct(act, tssProfile, user);
      const sec = actDurationSec(act);
      const yVal = tss > 0 ? tss : sec > 0 ? +(sec / 3600).toFixed(2) : 0;
      const bucket = sportBucket(act.sport);
      const dist = Number(act.distance || 0);
      const size = dist > 0 ? Math.min(20, Math.max(6, Math.round(dist / 2000))) : 8;
      return {
        value: [d.getTime(), yVal],
        symbolSize: size,
        itemStyle: { color: BUCKET_COLOR[bucket] || '#9ca3af', opacity: 0.85 },
        _act: act,
        _tss: tss,
        _sec: sec,
      };
    }).filter(Boolean);

    if (!data.length) return null;

    const hasTss = data.some((d) => d._tss > 0);

    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'item',
        formatter(params) {
          const raw = params.data?._act;
          if (!raw) return '';
          const tss = params.data._tss;
          const sec = params.data._sec;
          const h = Math.floor(sec / 3600);
          const m = Math.floor((sec % 3600) / 60);
          const timeStr = h > 0 ? `${h}h ${m}m` : `${m}m`;
          const dateStr = getLocalDateString(raw.date || raw.timestamp || raw.startDate) || '';
          let html = `<div style="font-size:11px"><b>${raw.title || 'Activity'}</b><br/>${dateStr}`;
          if (tss > 0) html += `<br/>TSS: ${Math.round(tss)}`;
          html += `<br/>${timeStr}`;
          html += '</div>';
          return html;
        },
      },
      grid: { left: 40, right: 10, top: 8, bottom: 28, containLabel: false },
      xAxis: {
        type: 'time',
        axisLabel: { fontSize: 9, color: '#9ca3af', formatter: (v) => {
          const d = new Date(v);
          return `${d.getDate()}.${d.getMonth() + 1}`;
        }},
        splitLine: { show: false },
        axisLine: { lineStyle: { color: '#f3f4f6' } },
        axisTick: { show: false },
      },
      yAxis: {
        type: 'value',
        name: hasTss ? 'TSS' : 'h',
        nameTextStyle: { fontSize: 8, color: '#9ca3af' },
        axisLabel: { fontSize: 9, color: '#9ca3af' },
        splitLine: { lineStyle: { color: '#f3f4f6' } },
        axisLine: { show: false },
        axisTick: { show: false },
      },
      series: [
        {
          type: 'scatter',
          data,
        },
      ],
    };
  }, [filtered, tssProfile, user]);

  // --- Zone polarization computation ---
  const zonePolarization = useMemo(() => {
    const isAll = zoneSport === 'all';
    // Prefer server data here too
    const powerSec = isAll
      ? (serverZoneSecAll.power || aggregates.powerZoneSecAll || {})
      : (monthlyZones?.power?.[zoneSport] || aggregates.powerZoneSec?.[zoneSport] || {});
    const hrSec = isAll
      ? (serverZoneSecAll.hr || aggregates.hrZoneSecAll || {})
      : (monthlyZones?.hr?.[zoneSport] || aggregates.hrZoneSec?.[zoneSport] || {});
    // Use power if available, else HR
    const secMap =
      ZONE_KEYS.some((zk) => (powerSec[zk] || 0) > 0) ? powerSec : hrSec;
    const totalSec = ZONE_KEYS.reduce((s, k) => s + (secMap[k] || 0), 0);
    if (totalSec <= 0) return null;
    const easyPct = ((secMap.zone1 || 0) + (secMap.zone2 || 0)) / totalSec * 100;
    const midPct = (secMap.zone3 || 0) / totalSec * 100;
    const hardPct = ((secMap.zone4 || 0) + (secMap.zone5 || 0)) / totalSec * 100;
    let badge = { label: 'Balanced', color: 'bg-blue-100 text-blue-800' };
    if (easyPct > 75 && hardPct >= 5) badge = { label: 'Polarized', color: 'bg-green-100 text-green-800' };
    else if (midPct > 40) badge = { label: 'High threshold load', color: 'bg-yellow-100 text-yellow-800' };
    return { easyPct, midPct, hardPct, badge };
  }, [zoneSport, aggregates.powerZoneSec, aggregates.hrZoneSec, aggregates.powerZoneSecAll, aggregates.hrZoneSecAll, monthlyZones, serverZoneSecAll]); // eslint-disable-line react-hooks/exhaustive-deps


  // ── Independent compare-tab navigation ──────────────────────────────────
  const compareBounds = useMemo(() => {
    const d = new Date(compareRefDate);
    if (compareMode === 'week') {
      const day = d.getDay() || 7;
      const mon = new Date(d);
      mon.setDate(d.getDate() - (day - 1));
      mon.setHours(0, 0, 0, 0);
      const sun = new Date(mon);
      sun.setDate(mon.getDate() + 6);
      return { start: mon, end: sun };
    }
    const start = new Date(d.getFullYear(), d.getMonth(), 1);
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return { start, end };
  }, [compareRefDate, compareMode]);

  const compareBoundsLY = useMemo(() => {
    const s = new Date(compareBounds.start);
    s.setFullYear(s.getFullYear() - 1);
    const e = new Date(compareBounds.end);
    e.setFullYear(e.getFullYear() - 1);
    return { start: s, end: e };
  }, [compareBounds]);

  const filteredCmpThis = useMemo(() => {
    const s = getLocalDateString(compareBounds.start);
    const e = getLocalDateString(compareBounds.end);
    return activities.filter((act) => {
      const k = activityCalendarDateKey(act);
      return k && k >= s && k <= e;
    });
  }, [activities, compareBounds]);

  const filteredCmpPrev = useMemo(() => {
    const s = getLocalDateString(compareBoundsLY.start);
    const e = getLocalDateString(compareBoundsLY.end);
    return activities.filter((act) => {
      const k = activityCalendarDateKey(act);
      return k && k >= s && k <= e;
    });
  }, [activities, compareBoundsLY]);

  const aggCmpThis = useMemo(() => {
    let count = 0, totalSec = 0, totalDist = 0, totalTss = 0;
    const bySportSec = {};
    filteredCmpThis.forEach((act) => {
      count++;
      const sec = actDurationSec(act);
      totalSec += sec;
      totalDist += Number(act.distance || 0);
      const tss = computeTssForAct(act, tssProfile, user);
      if (tss > 0) totalTss += tss;
      bySportSec[sportBucket(act.sport)] = (bySportSec[sportBucket(act.sport)] || 0) + sec;
    });
    return { count, totalSec, totalDist, totalTss, bySportSec };
  }, [filteredCmpThis, tssProfile, user]);

  const aggCmpPrev = useMemo(() => {
    let count = 0, totalSec = 0, totalDist = 0, totalTss = 0;
    const bySportSec = {};
    filteredCmpPrev.forEach((act) => {
      count++;
      const sec = actDurationSec(act);
      totalSec += sec;
      totalDist += Number(act.distance || 0);
      const tss = computeTssForAct(act, tssProfile, user);
      if (tss > 0) totalTss += tss;
      bySportSec[sportBucket(act.sport)] = (bySportSec[sportBucket(act.sport)] || 0) + sec;
    });
    return { count, totalSec, totalDist, totalTss, bySportSec };
  }, [filteredCmpPrev, tssProfile, user]);

  const cmpLabel = useMemo(() => {
    const d = compareBounds.start;
    if (compareMode === 'week') {
      const e = compareBounds.end;
      const wn = isoWeekNumber(d);
      return `W${wn} · ${d.getDate()}.${d.getMonth() + 1} – ${e.getDate()}.${e.getMonth() + 1}.${e.getFullYear()}`;
    }
    return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }, [compareBounds, compareMode]);

  const cmpLYLabel = useMemo(() => {
    const d = compareBoundsLY.start;
    if (compareMode === 'week') {
      const e = compareBoundsLY.end;
      return `${d.getDate()}.${d.getMonth() + 1} – ${e.getDate()}.${e.getMonth() + 1}.${e.getFullYear()}`;
    }
    return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }, [compareBoundsLY, compareMode]);

  const cmpBreakdownOption = useMemo(() => {
    if (compareMode === 'week') {
      const DOW = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
      const dayKeysThis = [];
      const dayKeysLY = [];
      const curD = new Date(compareBounds.start);
      const lyD = new Date(compareBoundsLY.start);
      for (let i = 0; i < 7; i++) {
        dayKeysThis.push(getLocalDateString(new Date(curD)));
        dayKeysLY.push(getLocalDateString(new Date(lyD)));
        curD.setDate(curD.getDate() + 1);
        lyD.setDate(lyD.getDate() + 1);
      }
      const mapThis = new Map();
      filteredCmpThis.forEach((act) => {
        const k = activityCalendarDateKey(act);
        if (k) mapThis.set(k, (mapThis.get(k) || 0) + actDurationSec(act));
      });
      const mapLY = new Map();
      filteredCmpPrev.forEach((act) => {
        const k = activityCalendarDateKey(act);
        if (k) mapLY.set(k, (mapLY.get(k) || 0) + actDurationSec(act));
      });
      const curH = dayKeysThis.map((k) => +((mapThis.get(k) || 0) / 3600).toFixed(2));
      const lyH = dayKeysLY.map((k) => +((mapLY.get(k) || 0) / 3600).toFixed(2));
      if (!curH.some((h) => h > 0) && !lyH.some((h) => h > 0)) return null;
      return makeGroupedBar(DOW, curH, lyH);
    }

    // Month mode: week-by-week breakdown
    const weekRanges = [];
    const cur = new Date(compareBounds.start);
    const dayOfW = cur.getDay() || 7;
    if (dayOfW !== 1) cur.setDate(cur.getDate() - (dayOfW - 1));
    const monthEnd = new Date(compareBounds.end);
    while (cur <= monthEnd) {
      const wStart = new Date(cur);
      const wEnd = new Date(cur);
      wEnd.setDate(cur.getDate() + 6);
      const wEndCapped = wEnd > monthEnd ? monthEnd : wEnd;
      const lyWStart = new Date(wStart);
      lyWStart.setFullYear(lyWStart.getFullYear() - 1);
      const lyWEndCapped = new Date(wEndCapped);
      lyWEndCapped.setFullYear(lyWEndCapped.getFullYear() - 1);
      weekRanges.push({
        startK: getLocalDateString(wStart),
        endK: getLocalDateString(wEndCapped),
        lyStartK: getLocalDateString(lyWStart),
        lyEndK: getLocalDateString(lyWEndCapped),
        label: `${wStart.getDate()}.${wStart.getMonth() + 1}`,
      });
      cur.setDate(cur.getDate() + 7);
    }
    if (!weekRanges.length) return null;

    const mapThis = new Map();
    filteredCmpThis.forEach((act) => {
      const k = activityCalendarDateKey(act);
      if (k) mapThis.set(k, (mapThis.get(k) || 0) + actDurationSec(act));
    });
    const mapLY = new Map();
    filteredCmpPrev.forEach((act) => {
      const k = activityCalendarDateKey(act);
      if (k) mapLY.set(k, (mapLY.get(k) || 0) + actDurationSec(act));
    });
    const sumRange = (map, s, e) => {
      let total = 0;
      map.forEach((v, k) => { if (k >= s && k <= e) total += v; });
      return total;
    };
    const curH = weekRanges.map((w) => +((sumRange(mapThis, w.startK, w.endK)) / 3600).toFixed(2));
    const lyH = weekRanges.map((w) => +((sumRange(mapLY, w.lyStartK, w.lyEndK)) / 3600).toFixed(2));
    if (!curH.some((h) => h > 0) && !lyH.some((h) => h > 0)) return null;
    return makeGroupedBar(weekRanges.map((w) => w.label), curH, lyH);
  }, [compareMode, compareBounds, compareBoundsLY, filteredCmpThis, filteredCmpPrev]);

  if (!period?.label) return null;

  const Chart = typeof ReactECharts === 'function' ? ReactECharts : null;

  const fmtActDate = (act) => {
    const raw = act.date || act.timestamp || act.startDate;
    if (!raw) return '';
    try {
      return new Date(raw).toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return '';
    }
  };

  const sportIconSrc = (bucket) => {
    if (bucket === 'bike') return '/icon/bike.svg';
    if (bucket === 'run') return '/icon/run.svg';
    if (bucket === 'swim') return '/icon/swim.svg';
    return null;
  };

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'zones', label: 'Zones' },
    { id: 'activities', label: 'Activities' },
    { id: 'compare', label: 'vs Last Year' },
  ];

  return (
    <>
    <div ref={rootRef} className="w-full mt-3 space-y-4 pb-safe-area-inset-bottom">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 sm:p-5">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div>
            <h2 className="text-sm sm:text-base font-bold text-gray-900">Period summary</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {period.label}
              <span className="text-gray-400 ml-1">
                ({periodView === 'week' ? 'week' : 'month'})
              </span>
            </p>
          </div>
          <span className="text-xs text-gray-400 font-medium">
            {aggregates.count} {aggregates.count === 1 ? 'activity' : 'activities'}
          </span>
        </div>

        {/* Tab bar — horizontally scrollable on mobile */}
        <div className="flex gap-1.5 mb-4 overflow-x-auto scrollbar-hide pb-0.5 -mx-4 px-4 sm:mx-0 sm:px-0">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                activeTab === t.id
                  ? 'bg-primary text-white'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ===================== OVERVIEW TAB ===================== */}
        {activeTab === 'overview' && (
          <div className="space-y-5">
            {/* Stat cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              {[
                {
                  label: 'Total time',
                  value: formatDuration(aggregates.totalSec),
                },
                {
                  label: 'Distance',
                  value:
                    aggregates.totalDist > 0
                      ? formatDistance(aggregates.totalDist, user)
                      : '—',
                },
                {
                  label: 'Total TSS',
                  value:
                    aggregates.totalTss > 0
                      ? Math.round(aggregates.totalTss)
                      : '—',
                },
                {
                  label: 'Activities',
                  value: aggregates.count,
                },
                {
                  label: 'Avg / activity',
                  value:
                    aggregates.count > 0
                      ? formatDuration(Math.round(aggregates.totalSec / aggregates.count))
                      : '—',
                },
                {
                  label: 'Peak TSS',
                  value: aggregates.maxTssAct
                    ? Math.round(
                        Number(
                          aggregates.maxTssAct.tss ||
                            aggregates.maxTssAct.TSS ||
                            aggregates.maxTssAct.totalTSS ||
                            0
                        )
                      )
                    : '—',
                  sub: aggregates.maxTssAct?.title || null,
                },
              ].map((card) => (
                <div key={card.label} className="bg-gray-50 rounded-xl p-3">
                  <div className="text-xs uppercase tracking-wide text-gray-400 font-semibold leading-tight">
                    {card.label}
                  </div>
                  <div className="text-sm font-bold text-gray-900 mt-1 leading-tight tabular-nums">
                    {card.value}
                  </div>
                  {card.sub && (
                    <div className="text-xs text-gray-400 truncate mt-0.5">{card.sub}</div>
                  )}
                </div>
              ))}
            </div>

            {/* Form & Fitness — combined zoomable chart, same PMC source as dashboard */}
            {effectiveAthleteId && (
              <PmcCombinedChart
                athleteId={effectiveAthleteId}
                userProfile={effectiveProfile}
                user={user}
                isMobile={isMobile}
              />
            )}

            {/* Weekly comparison */}
            {weekComparison && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="bg-gray-50 rounded-xl p-3">
                    <div className="text-xs uppercase tracking-wide text-gray-400 font-semibold">
                      Current TSS
                    </div>
                    <div className="text-sm font-bold text-gray-900 mt-1 tabular-nums">
                      {Math.round(aggregates.totalTss || 0)}
                    </div>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-3">
                    <div className="text-xs uppercase tracking-wide text-gray-400 font-semibold">
                      Previous TSS
                    </div>
                    <div className="text-sm font-bold text-gray-900 mt-1 tabular-nums">
                      {Math.round(weekComparison.prevTss || 0)}
                    </div>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-3">
                    <div className="text-xs uppercase tracking-wide text-gray-400 font-semibold">
                      Delta
                    </div>
                    <div
                      className={`text-sm font-bold mt-1 tabular-nums ${
                        weekComparison.deltaTss >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}
                    >
                      {weekComparison.deltaTss >= 0 ? '+' : ''}
                      {Math.round(weekComparison.deltaTss || 0)}
                    </div>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-3">
                    <div className="text-xs uppercase tracking-wide text-gray-400 font-semibold">
                      Overload risk
                    </div>
                    <div className="text-sm font-bold mt-1">
                      {weekComparison.overload ? (
                        <span className="text-red-600">Risk</span>
                      ) : (
                        <span className="text-green-600">OK</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Sport mileage comparison */}
                <div className="space-y-1.5">
                  {['cycling', 'running', 'swimming'].map((ps) => {
                    const cur = aggregates.distByProfileSport?.[ps] || 0;
                    const prev = weekComparison.prevDistByProfileSport?.[ps] || 0;
                    if (cur === 0 && prev === 0) return null;
                    const bucket = ps === 'cycling' ? 'bike' : ps === 'running' ? 'run' : 'swim';
                    const maxDist = Math.max(cur, prev, 1);
                    return (
                      <div key={ps} className="bg-gray-50 rounded-xl px-3 py-2">
                        <div className="flex items-center gap-2 mb-1">
                          <img src={`/icon/${bucket}.svg`} alt={bucket} className="w-3.5 h-3.5 object-contain shrink-0" />
                          <span className="text-xs uppercase tracking-wide text-gray-500 font-semibold">{SPORT_LABEL[ps]}</span>
                          <span className="ml-auto text-sm font-bold text-gray-900 tabular-nums">{cur > 0 ? formatDistance(cur, user) : '—'}</span>
                          <span className="text-xs text-gray-400 tabular-nums">vs {prev > 0 ? formatDistance(prev, user) : '—'}</span>
                        </div>
                        <div className="flex gap-1 items-center">
                          <div className="flex-1 h-1.5 rounded-full bg-gray-200 overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${(cur / maxDist) * 100}%`, backgroundColor: BUCKET_COLOR[bucket] }} />
                          </div>
                          <div className="flex-1 h-1.5 rounded-full bg-gray-200 overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${(prev / maxDist) * 100}%`, backgroundColor: BUCKET_COLOR[bucket] + '66' }} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Sport split + Intensity distribution side by side */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4" style={{ scrollSnapAlign: 'start', scrollMarginTop: 12 }}>
              {/* Sport split */}
              {aggregates.totalSec > 0 && (
                <div className="bg-gray-50 rounded-xl p-4 overflow-visible">
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                    Sport split
                  </div>
                  <div className="space-y-2.5">
                    {SPORT_TOGGLE_ORDER.filter((b) => (aggregates.bySportSec[b] || 0) > 0).map((b) => {
                      const sec = aggregates.bySportSec[b] || 0;
                      if (sec <= 0) return null;
                      const pct = (sec / aggregates.totalSec) * 100;
                      const h = Math.floor(sec / 3600);
                      const m = Math.floor((sec % 3600) / 60);
                      const timeStr = h > 0 ? `${h}h ${m}m` : `${m}m`;
                      const psKey = profileSportFromActivity(b);
                      const dist = psKey ? (aggregates.distByProfileSport?.[psKey] || 0) : 0;
                      return (
                        <div key={b} className="relative group flex items-center gap-2 rounded-lg px-1 -mx-1 py-0.5 cursor-default hover:bg-white/70">
                          <SportSplitTooltip
                            bucket={b}
                            cur={sportSplitStats.current[b]}
                            prev={sportSplitStats.previous[b]}
                            prevLabel={sportSplitStats.prevLabel}
                            user={user}
                          />
                          <div className="w-5 h-5 shrink-0 flex items-center justify-center">
                            <SportGlyph sport={b} size={16} color={BUCKET_COLOR[b] || BUCKET_COLOR.other} />
                          </div>
                          <span className="w-10 text-sm text-gray-500 shrink-0">
                            {SPORT_LABELS[b] || b}
                          </span>
                          <div className="flex-1 h-1.5 rounded-full bg-gray-200 overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{ width: `${pct}%`, backgroundColor: BUCKET_COLOR[b] }}
                            />
                          </div>
                          <span className="text-[13px] font-semibold text-gray-700 shrink-0 whitespace-nowrap tabular-nums text-right">
                            {timeStr}
                          </span>
                          {dist > 0 && (
                            <span className="w-14 text-xs text-gray-400 shrink-0 text-right whitespace-nowrap">
                              {formatDistance(dist, user)}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Intensity distribution donut */}
              {Chart && intensityDonutOption && (
                <div className="bg-gray-50 rounded-xl p-4">
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    Intensity distribution
                  </div>
                  <Chart
                    option={intensityDonutOption}
                    style={{ height: isMobile ? 130 : 160, width: '100%' }}
                    notMerge
                  />
                </div>
              )}
            </div>

            {/* Daily load stacked bar */}
            {aggregates.dayKeys.length > 0 && Chart && dailyStackedOption && (
              <div style={{ scrollSnapAlign: 'start', scrollMarginTop: 12 }}>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Daily training load ({dailyLoadMode === 'tss' ? 'TSS' : 'h'})
                  </div>
                  <div className="flex bg-gray-100 rounded-lg p-0.5 gap-0.5">
                    {[['time', 'Time'], ['tss', 'TSS']].map(([m, lbl]) => (
                      <button
                        key={m}
                        onClick={() => setDailyLoadMode(m)}
                        className={`px-2.5 py-0.5 text-[11px] font-semibold rounded-md transition-all touch-manipulation ${dailyLoadMode === m ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}
                        style={{ WebkitTapHighlightColor: 'transparent' }}
                      >{lbl}</button>
                    ))}
                  </div>
                </div>
                <Chart
                  option={dailyStackedOption}
                  style={{ height: isMobile ? 140 : 180, width: '100%' }}
                  notMerge
                />
              </div>
            )}

            {/* Load trend — last 12 weeks */}
            {Chart && weeklyTrendOption && weeklyTrend.length >= 2 && (
              <div style={{ scrollSnapAlign: 'start', scrollMarginTop: 12 }}>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Load trend (last 12 weeks)
                </div>
                <div className="bg-gray-50 rounded-xl p-3">
                  <div className="flex gap-3 mb-1 text-xs text-gray-400">
                    <span>
                      <span className="inline-block w-2.5 h-2.5 rounded-sm mr-1" style={{ backgroundColor: '#3b82f6' }} />
                      TSS (bars)
                    </span>
                    <span>
                      <span className="inline-block w-2.5 h-2.5 rounded-full mr-1" style={{ backgroundColor: '#f97316' }} />
                      Volume h (line)
                    </span>
                    <span className="text-[11px] text-gray-300">
                      Current period highlighted
                    </span>
                  </div>
                  <Chart
                    option={weeklyTrendOption}
                    style={{ height: isMobile ? 140 : 180, width: '100%' }}
                    notMerge
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* ===================== ZONES TAB ===================== */}
        {activeTab === 'zones' && (
          <div className="space-y-4">
            {/* Source note */}
            <p className="text-xs text-gray-400 leading-relaxed border border-gray-100 rounded-lg px-3 py-2 bg-gray-50">
              {monthlyZones
                ? <>Zone times are computed <span className="font-semibold text-gray-500">second-by-second</span> from your activity records — same data as the Home "Time in Zones" card.</>
                : <>Zone times are <span className="font-semibold text-gray-500">estimates</span>: each activity is counted using its average power, pace, or HR against your profile zones (not second-by-second files).</>
              }
            </p>

            {/* Sport toggle — always show All + all 3 sports */}
            {(() => {
              const zoneSportOptions = [
                { id: 'all', label: 'All', bucket: null },
                { id: 'cycling', label: 'Bike', bucket: 'bike' },
                { id: 'running', label: 'Run', bucket: 'run' },
                { id: 'swimming', label: 'Swim', bucket: 'swim' },
              ];
              return (
                <div className="flex gap-1.5 flex-wrap">
                  {zoneSportOptions.map((opt) => {
                    const hasData = opt.id === 'all'
                      ? (ZONE_KEYS.some(zk => (aggregates.powerZoneSecAll?.[zk] || 0) > 0 || (aggregates.hrZoneSecAll?.[zk] || 0) > 0))
                      : (aggregates.zoneSportsWithPower.includes(opt.id) || aggregates.zoneSportsWithHr.includes(opt.id));
                    const isActive = zoneSport === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setZoneSport(opt.id)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                          isActive
                            ? 'bg-primary text-white'
                            : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        } ${!hasData && !isActive ? 'opacity-50' : ''}`}
                      >
                        {opt.bucket ? (
                          <img
                            src={`/icon/${opt.bucket}.svg`}
                            alt={opt.bucket}
                            className={`w-3.5 h-3.5 object-contain ${isActive ? 'invert' : ''}`}
                          />
                        ) : (
                          <span className="text-xs leading-none">⊕</span>
                        )}
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              );
            })()}

            {/* Zone distribution horizontal bar charts */}
            {(zoneBarOptions.power || zoneBarOptions.hr) && Chart && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {zoneBarOptions.power && (
                  <div className="bg-gray-50 rounded-xl p-4">
                    <div className="flex items-baseline justify-between mb-2">
                      <span className="text-xs font-semibold text-gray-600">Power / Pace</span>
                      <span className="text-[11px] font-medium text-gray-400 tabular-nums">{fmtZoneTotal(zoneBarOptions.powerTotalSec)}</span>
                    </div>
                    <Chart
                      option={zoneBarOptions.power}
                      style={{ height: isMobile ? 110 : 130, width: '100%' }}
                      notMerge
                    />
                    <p className="text-[10px] text-gray-400 mt-1">
                      Tap a bar for the zone range &amp; time{zoneSport === 'all' ? ' · pick a sport for W/bpm ranges' : ''}.
                    </p>
                  </div>
                )}
                {zoneBarOptions.hr && (
                  <div className="bg-gray-50 rounded-xl p-4">
                    <div className="flex items-baseline justify-between mb-2">
                      <span className="text-xs font-semibold text-gray-600">Heart Rate</span>
                      <span className="text-[11px] font-medium text-gray-400 tabular-nums">{fmtZoneTotal(zoneBarOptions.hrTotalSec)}</span>
                    </div>
                    <Chart
                      option={zoneBarOptions.hr}
                      style={{ height: isMobile ? 110 : 130, width: '100%' }}
                      notMerge
                    />
                  </div>
                )}
              </div>
            )}

            {/* Sport breakdown table — only shown in "All" mode */}
            {zoneSport === 'all' && (() => {
              const sportRows = [
                { id: 'cycling', label: 'Bike', bucket: 'bike', isHr: false },
                { id: 'running', label: 'Run', bucket: 'run', isHr: false },
                { id: 'swimming', label: 'Swim', bucket: 'swim', isHr: false },
              ].map(row => {
                const powerTotal = ZONE_KEYS.reduce((s, zk) => s + (aggregates.powerZoneSec?.[row.id]?.[zk] || 0), 0);
                const hrTotal = ZONE_KEYS.reduce((s, zk) => s + (aggregates.hrZoneSec?.[row.id]?.[zk] || 0), 0);
                const total = powerTotal > 0 ? powerTotal : hrTotal;
                return { ...row, total, isPower: powerTotal > 0 };
              }).filter(row => row.total > 0);

              if (sportRows.length === 0) return null;
              return (
                <div className="bg-gray-50 rounded-xl p-4">
                  <div className="text-xs font-semibold text-gray-600 mb-3">Time by sport</div>
                  <div className="space-y-2">
                    {sportRows.map(row => {
                      const h = Math.floor(row.total / 3600);
                      const m = Math.floor((row.total % 3600) / 60);
                      const timeStr = h > 0 ? `${h}h ${m}m` : `${m}m`;
                      return (
                        <div key={row.id} className="flex items-center gap-2">
                          <img src={`/icon/${row.bucket}.svg`} alt={row.bucket} className="w-4 h-4 object-contain shrink-0" />
                          <span className="text-xs text-gray-600 font-medium w-10 shrink-0">{row.label}</span>
                          <span className="text-xs font-bold text-gray-800 tabular-nums">{timeStr}</span>
                          <span className="text-xs text-gray-400 ml-1">({row.isPower ? 'power/pace zones' : 'HR zones'})</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* Collapsible zone detail rows */}
            <div>
              <button
                type="button"
                onClick={() => setShowZoneDetails((v) => !v)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors mb-3"
              >
                {showZoneDetails ? 'Hide details' : 'Show details'}
                <span className="text-[10px] text-gray-400">
                  {showZoneDetails ? '▲' : '▼'}
                </span>
              </button>

              {showZoneDetails && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="bg-gray-50 rounded-xl p-4">
                    <div className="text-xs font-semibold text-gray-600 mb-3">
                      Power / Pace zones
                    </div>
                    <ZoneRows
                      secMap={zoneSport === 'all'
                        ? (serverZoneSecAll.power || aggregates.powerZoneSecAll || {})
                        : (monthlyZones?.power?.[zoneSport] || aggregates.powerZoneSec?.[zoneSport] || {})}
                      colors={POWER_ZONE_FILL}
                      zoneNames={POWER_ZONE_NAMES}
                    />
                  </div>
                  <div className="bg-gray-50 rounded-xl p-4">
                    <div className="text-xs font-semibold text-gray-600 mb-3">Heart Rate zones</div>
                    <ZoneRows
                      secMap={zoneSport === 'all'
                        ? (serverZoneSecAll.hr || aggregates.hrZoneSecAll || {})
                        : (monthlyZones?.hr?.[zoneSport] || aggregates.hrZoneSec?.[zoneSport] || {})}
                      colors={HR_ZONE_FILL}
                      zoneNames={HR_ZONE_NAMES}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Polarization badge */}
            {zonePolarization && (
              <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                <div className="text-xs font-semibold text-gray-600">Training polarization</div>
                {/* Stacked bar */}
                <div className="flex h-3 rounded-full overflow-hidden gap-px">
                  <div
                    className="h-full transition-all"
                    style={{
                      width: `${zonePolarization.easyPct}%`,
                      backgroundColor: '#3b82f6',
                    }}
                  />
                  <div
                    className="h-full transition-all"
                    style={{
                      width: `${zonePolarization.midPct}%`,
                      backgroundColor: '#f97316',
                    }}
                  />
                  <div
                    className="h-full transition-all"
                    style={{
                      width: `${zonePolarization.hardPct}%`,
                      backgroundColor: '#ef4444',
                    }}
                  />
                </div>
                <div className="flex gap-3 text-xs text-gray-500">
                  <span>
                    <span className="inline-block w-2 h-2 rounded-full bg-blue-500 mr-1" />
                    Easy {zonePolarization.easyPct.toFixed(0)}%
                  </span>
                  <span>
                    <span className="inline-block w-2 h-2 rounded-full bg-orange-500 mr-1" />
                    Tempo {zonePolarization.midPct.toFixed(0)}%
                  </span>
                  <span>
                    <span className="inline-block w-2 h-2 rounded-full bg-red-500 mr-1" />
                    Hard {zonePolarization.hardPct.toFixed(0)}%
                  </span>
                </div>
                <span
                  className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${zonePolarization.badge.color}`}
                >
                  {zonePolarization.badge.label}
                </span>
              </div>
            )}
          </div>
        )}

        {/* ===================== ACTIVITIES TAB ===================== */}
        {activeTab === 'activities' && (
          <div className="space-y-5">
            {byCategory.keys.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-8">
                No activities in this period
              </p>
            )}

            {visibleCategoryKeys.map((catKey) => {
              const acts = byCategory.map.get(catKey) || [];
              const isExpanded = expandedCategoryKeys.has(catKey);
              const visibleActs = isExpanded ? acts : acts.slice(0, MAX_ACTIVITIES_PER_CATEGORY);
              const hiddenCount = Math.max(0, acts.length - MAX_ACTIVITIES_PER_CATEGORY);
              const displayCat = catKey === UNCATEGORIZED_KEY ? null : catKey;
              const meta = byCategory.meta.get(catKey);
              return (
                <div key={catKey} className="space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`text-xs font-semibold uppercase tracking-wide px-2.5 py-1 rounded-xl border ${categoryChipClass(displayCat)}`}
                    >
                      {categoryLabel(displayCat, getCategory)}
                    </span>
                    <span className="text-xs text-gray-400">
                      {acts.length} {acts.length === 1 ? 'activity' : 'activities'}
                    </span>
                    {meta?.totalSec > 0 && (
                      <span className="text-xs text-gray-400">
                        · {formatDuration(meta.totalSec)}
                      </span>
                    )}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {visibleActs.map((act, idx) => {
                      const sec = actDurationSec(act);
                      const tss = computeTssForAct(act, tssProfile, user);
                      const dist = Number(act.distance || 0);
                      const bucket = sportBucket(act.sport);
                      const icon = sportIconSrc(bucket);
                      return (
                        <button
                          key={`${act.id}-${idx}`}
                          type="button"
                          disabled={!onSelectActivity}
                          onClick={() => onSelectActivity && onSelectActivity(act)}
                          className={`text-left bg-white border border-gray-100 rounded-xl p-3 shadow-sm transition-colors ${
                            onSelectActivity
                              ? 'cursor-pointer hover:border-gray-200 hover:shadow-md'
                              : 'cursor-default'
                          }`}
                        >
                          <div className="flex items-start gap-2">
                            <div className="mt-0.5 w-5 h-5 shrink-0 flex items-center justify-center">
                              {icon ? (
                                <img
                                  src={icon}
                                  alt={bucket}
                                  className="w-4 h-4 object-contain"
                                />
                              ) : (
                                <span
                                  className="w-3 h-3 rounded-full block"
                                  style={{ backgroundColor: BUCKET_COLOR[bucket] }}
                                />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-semibold text-gray-900 truncate">
                                {act.title || 'Activity'}
                              </div>
                              <div className="text-[13px] text-gray-400 mt-0.5">
                                {fmtActDate(act)}
                              </div>
                              <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-1.5 text-[13px] text-gray-500">
                                {sec > 0 && <span>{formatDuration(sec)}</span>}
                                {dist > 0 && <span>{formatDistance(dist, user)}</span>}
                                {tss > 0 && (
                                  <span className="text-primary font-medium">
                                    {Math.round(tss)} TSS
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {hiddenCount > 0 && !isExpanded && (
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedCategoryKeys((prev) => {
                          const next = new Set(prev);
                          next.add(catKey);
                          return next;
                        })
                      }
                      className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors"
                    >
                      Show more ({hiddenCount})
                    </button>
                  )}
                  {acts.length > MAX_ACTIVITIES_PER_CATEGORY && isExpanded && (
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedCategoryKeys((prev) => {
                          const next = new Set(prev);
                          next.delete(catKey);
                          return next;
                        })
                      }
                      className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors"
                    >
                      Show fewer
                    </button>
                  )}
                </div>
              );
            })}

            {hasMoreCategories && !showAllCategories && (
              <button
                type="button"
                onClick={() => setShowAllCategories(true)}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors"
              >
                Show more ({byCategory.keys.length - MAX_CATEGORIES_VISIBLE})
              </button>
            )}

            {hasMoreCategories && showAllCategories && (
              <button
                type="button"
                onClick={() => setShowAllCategories(false)}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors"
              >
                Show fewer
              </button>
            )}

            {/* Effort timeline scatter */}
            {Chart && effortTimelineOption && (
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Effort timeline
                </div>
                <div className="bg-gray-50 rounded-xl p-3">
                  <div className="flex gap-3 mb-1 text-xs text-gray-400">
                    {SPORT_TOGGLE_ORDER.filter((b) => (aggregates.bySportSec[b] || 0) > 0).map((b) => (
                      <span key={b} className="flex items-center gap-1">
                        <SportGlyph sport={b} size={12} color={BUCKET_COLOR[b] || BUCKET_COLOR.other} />
                        {SPORT_LABELS[b] || b}
                      </span>
                    ))}
                  </div>
                  <Chart
                    option={effortTimelineOption}
                    style={{ height: isMobile ? 110 : 140, width: '100%' }}
                    notMerge
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* ===================== COMPARE TAB ===================== */}
        {activeTab === 'compare' && (
          <div className="space-y-4">
            {/* Mode toggle + navigation — 2-row on mobile */}
            <div className="space-y-2">
              {/* Row 1: Week/Month toggle + jump button */}
              <div className="flex items-center gap-2">
                <div className="flex rounded-xl overflow-hidden border border-gray-200 shrink-0">
                  {['week', 'month'].map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setCompareMode(m)}
                      className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                        compareMode === m ? 'bg-primary text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
                      }`}
                    >
                      {m === 'week' ? 'Week' : 'Month'}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (period?.periodStart) setCompareRefDate(new Date(period.periodStart));
                    setCompareMode(periodView);
                  }}
                  className="ml-auto shrink-0 px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors whitespace-nowrap"
                >
                  ↵ Current period
                </button>
              </div>

              {/* Row 2: Prev / Period label / Next */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setCompareRefDate((prev) => {
                      const d = new Date(prev);
                      if (compareMode === 'week') d.setDate(d.getDate() - 7);
                      else d.setMonth(d.getMonth() - 1);
                      return d;
                    })
                  }
                  className="shrink-0 w-8 h-8 rounded-xl bg-gray-100 hover:bg-gray-200 active:bg-gray-300 flex items-center justify-center text-gray-600 text-lg font-bold transition-colors touch-manipulation"
                  style={{ WebkitTapHighlightColor: 'transparent' }}
                >
                  ‹
                </button>
                <span className="flex-1 text-center text-sm font-semibold text-gray-800 min-w-0 truncate">
                  {cmpLabel}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setCompareRefDate((prev) => {
                      const d = new Date(prev);
                      if (compareMode === 'week') d.setDate(d.getDate() + 7);
                      else d.setMonth(d.getMonth() + 1);
                      return d;
                    })
                  }
                  className="shrink-0 w-8 h-8 rounded-xl bg-gray-100 hover:bg-gray-200 active:bg-gray-300 flex items-center justify-center text-gray-600 text-lg font-bold transition-colors touch-manipulation"
                  style={{ WebkitTapHighlightColor: 'transparent' }}
                >
                  ›
                </button>
              </div>
            </div>

            {/* Year labels */}
            <div className="flex items-stretch gap-3">
              <div className="flex-1 bg-primary/10 border border-primary/20 rounded-xl px-3 py-2">
                <div className="text-xs uppercase tracking-wide font-semibold text-primary">This year</div>
                <div className="text-sm font-bold text-gray-900 mt-0.5">{cmpLabel}</div>
                <div className="text-xs text-gray-500">{aggCmpThis.count} {aggCmpThis.count === 1 ? 'activity' : 'activities'}</div>
              </div>
              <div className="flex items-center text-gray-300 text-xs shrink-0">vs</div>
              <div className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
                <div className="text-xs uppercase tracking-wide font-semibold text-gray-400">Last year</div>
                <div className="text-sm font-bold text-gray-600 mt-0.5">{cmpLYLabel}</div>
                <div className="text-xs text-gray-400">{aggCmpPrev.count} {aggCmpPrev.count === 1 ? 'activity' : 'activities'}</div>
              </div>
            </div>

            {aggCmpThis.count === 0 && aggCmpPrev.count === 0 && (
              <p className="text-sm text-gray-400 text-center py-6">No activities in either period.</p>
            )}

            {(aggCmpThis.count > 0 || aggCmpPrev.count > 0) && (
              <>
                {/* Metric cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { label: 'Activities', cur: aggCmpThis.count, ly: aggCmpPrev.count, fmt: (v) => v },
                    { label: 'Total time', cur: aggCmpThis.totalSec, ly: aggCmpPrev.totalSec, fmt: (v) => v > 0 ? formatDuration(v) : '—' },
                    { label: 'Distance', cur: aggCmpThis.totalDist, ly: aggCmpPrev.totalDist, fmt: (v) => v > 0 ? formatDistance(v, user) : '—' },
                    { label: 'TSS', cur: aggCmpThis.totalTss, ly: aggCmpPrev.totalTss, fmt: (v) => v > 0 ? Math.round(v) : '—' },
                  ].map((card) => {
                    const delta = card.ly > 0 ? ((card.cur - card.ly) / card.ly) * 100 : null;
                    return (
                      <div key={card.label} className="bg-gray-50 rounded-xl p-3">
                        <div className="text-xs uppercase tracking-wide text-gray-400 font-semibold mb-1">{card.label}</div>
                        <div className="text-sm font-bold text-gray-900 tabular-nums">{card.fmt(card.cur)}</div>
                        <div className="text-xs text-gray-400 mt-0.5">LY: {card.fmt(card.ly)}</div>
                        {delta !== null && (
                          <div className={`text-[13px] font-semibold mt-1 ${delta > 2 ? 'text-green-600' : delta < -2 ? 'text-red-500' : 'text-gray-400'}`}>
                            {delta > 0 ? '↑' : delta < 0 ? '↓' : ''}{Math.abs(delta).toFixed(0)}%
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Breakdown chart: day-by-day (week) or week-by-week (month) */}
                {Chart && cmpBreakdownOption && (
                  <div>
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                      {compareMode === 'week' ? 'Day-by-day training load (h)' : 'Week-by-week training load (h)'}
                    </div>
                    <div className="bg-gray-50 rounded-xl p-3">
                      <Chart option={cmpBreakdownOption} style={{ height: isMobile ? 160 : 200, width: '100%' }} notMerge />
                    </div>
                  </div>
                )}

                {/* Sport volume rows */}
                {SPORT_TOGGLE_ORDER.some(
                  (b) => (aggCmpThis.bySportSec[b] || 0) > 0 || (aggCmpPrev.bySportSec[b] || 0) > 0
                ) && (
                  <div className="bg-gray-50 rounded-xl p-4">
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Volume by sport</div>
                    <div className="space-y-3">
                      {SPORT_TOGGLE_ORDER.map((b) => {
                        const curSec = aggCmpThis.bySportSec[b] || 0;
                        const lySec = aggCmpPrev.bySportSec[b] || 0;
                        if (curSec === 0 && lySec === 0) return null;
                        const maxSec = Math.max(curSec, lySec, 1);
                        const delta = lySec > 0 ? ((curSec - lySec) / lySec) * 100 : null;
                        const fmtH = (s) => {
                          const h = Math.floor(s / 3600);
                          const m = Math.floor((s % 3600) / 60);
                          return h > 0 ? `${h}h ${m}m` : `${m}m`;
                        };
                        return (
                          <div key={b}>
                            <div className="flex items-center gap-2 mb-1">
                              <SportGlyph sport={b} size={16} color={BUCKET_COLOR[b] || BUCKET_COLOR.other} />
                              <span className="text-xs font-semibold text-gray-600">{SPORT_LABELS[b] || b}</span>
                              {delta !== null && (
                                <span className={`text-xs font-semibold ml-auto ${delta > 2 ? 'text-green-600' : delta < -2 ? 'text-red-500' : 'text-gray-400'}`}>
                                  {delta > 0 ? '↑' : delta < 0 ? '↓' : ''}{Math.abs(delta).toFixed(0)}%
                                </span>
                              )}
                            </div>
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="w-14 text-xs text-gray-500 shrink-0">This year</span>
                                <div className="flex-1 h-2 rounded-full bg-gray-200 overflow-hidden">
                                  <div className="h-full rounded-full" style={{ width: `${(curSec / maxSec) * 100}%`, backgroundColor: BUCKET_COLOR[b] }} />
                                </div>
                                <span className="w-14 text-xs text-right font-semibold text-gray-700 shrink-0 tabular-nums">{curSec > 0 ? fmtH(curSec) : '—'}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="w-14 text-xs text-gray-400 shrink-0">Last year</span>
                                <div className="flex-1 h-2 rounded-full bg-gray-200 overflow-hidden">
                                  <div className="h-full rounded-full" style={{ width: `${(lySec / maxSec) * 100}%`, backgroundColor: BUCKET_COLOR[b] + '66' }} />
                                </div>
                                <span className="w-14 text-xs text-right font-medium text-gray-400 shrink-0 tabular-nums">{lySec > 0 ? fmtH(lySec) : '—'}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Activities list for selected period */}
                {filteredCmpThis.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Activities this period</div>
                    <div className="space-y-1.5">
                      {[...filteredCmpThis]
                        .sort((a, b) => new Date(b.date || b.timestamp || b.startDate) - new Date(a.date || a.timestamp || a.startDate))
                        .map((act, idx) => {
                          const sec = actDurationSec(act);
                          const tss = computeTssForAct(act, tssProfile, user);
                          const dist = Number(act.distance || 0);
                          const b = sportBucket(act.sport);
                          return (
                            <button
                              key={`${act.id}-${idx}`}
                              type="button"
                              disabled={!onSelectActivity}
                              onClick={() => onSelectActivity && onSelectActivity(act)}
                              className={`w-full text-left flex items-center gap-3 bg-white border border-gray-100 rounded-xl px-3 py-2 ${onSelectActivity ? 'hover:border-gray-200 hover:shadow-sm cursor-pointer' : 'cursor-default'} transition-all`}
                            >
                              <img src={`/icon/${b}.svg`} alt={b} className="w-4 h-4 object-contain shrink-0" onError={(e) => { e.target.style.display = 'none'; }} />
                              <div className="min-w-0 flex-1">
                                <div className="text-xs font-semibold text-gray-900 truncate">{act.title || 'Activity'}</div>
                                <div className="text-xs text-gray-400">{fmtActDate(act)}</div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0 text-xs text-gray-500">
                                {sec > 0 && <span className="tabular-nums">{formatDuration(sec)}</span>}
                                {dist > 0 && <span className="tabular-nums">{formatDistance(dist, user)}</span>}
                                {tss > 0 && <span className="text-primary font-semibold tabular-nums">{Math.round(tss)} TSS</span>}
                              </div>
                            </button>
                          );
                        })}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  </>
  );
}
