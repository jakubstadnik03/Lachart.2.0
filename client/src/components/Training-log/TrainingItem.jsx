import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getStravaActivityDetail } from '../../services/api';

const INTERVALS_PER_PAGE = 10;

/* ─── helpers ───────────────────────────────────────────────────────────────── */
const getSportIcon = (sport) => {
  const s = String(sport || '').toLowerCase();
  if (s.includes('run'))  return '/icon/run.svg';
  if (s.includes('ride') || s.includes('cycle') || s.includes('bike')) return '/icon/bike.svg';
  if (s.includes('swim')) return '/icon/swim.svg';
  if (s.includes('walk') || s.includes('hike')) return '/icon/walk.svg';
  if (s.includes('workout') || s.includes('weight') || s.includes('strength') ||
      s.includes('gym') || s.includes('crossfit') || s.includes('hiit') ||
      s.includes('yoga') || s.includes('pilates') || s.includes('elliptical') ||
      s.includes('rowing') || s.includes('ski') || s.includes('snow'))
    return '/icon/workout.svg';
  return '/icon/default.svg';
};

const sportColor = (sport) => {
  const s = String(sport || '').toLowerCase();
  if (s.includes('run'))  return '#f97316';
  if (s.includes('ride') || s.includes('cycle') || s.includes('bike')) return '#767EB5';
  if (s.includes('swim')) return '#38bdf8';
  if (s.includes('walk') || s.includes('hike')) return '#84cc16';
  if (s.includes('workout') || s.includes('weight') || s.includes('strength') ||
      s.includes('gym') || s.includes('crossfit') || s.includes('hiit') ||
      s.includes('yoga') || s.includes('pilates') || s.includes('elliptical') ||
      s.includes('rowing') || s.includes('ski') || s.includes('snow'))
    return '#a855f7';
  return '#9ca3af';
};

const categoryLabel = (cat) => {
  if (!cat) return null;
  return cat.charAt(0).toUpperCase() + cat.slice(1);
};

const categoryColor = (cat) => {
  const map = {
    endurance: '#4299e1',
    tempo:     '#f6ad55',
    threshold: '#ed8936',
    vo2max:    '#e53e3e',
    anaerobic: '#9f7aea',
    recovery:  '#68d391',
  };
  return map[cat] || '#9ca3af';
};

/**
 * Normalize FIT or Strava laps into the same shape as manual results[].
 * Detects format by field names present on the first lap.
 */
const normalizeLaps = (laps, sport) => {
  if (!Array.isArray(laps) || laps.length === 0) return [];
  const s = String(sport || '').toLowerCase();
  const isRun  = s.includes('run');
  const isSwim = s.includes('swim');

  return laps.map((lap, i) => {
    // Detect format by which fields are present
    // FIT: camelCase (avgPower, avgHeartRate, avgSpeed, totalElapsedTime)
    // Strava: snake_case (average_watts, average_heartrate, average_speed, elapsed_time)
    const fitHR   = lap.avgHeartRate;
    const strHR   = lap.average_heartrate;
    const fitPwr  = lap.avgPower ?? lap.normalizedPower;
    const strPwr  = lap.average_watts;
    const fitSpd  = lap.avgSpeed;
    const strSpd  = lap.average_speed;

    let power = null;
    if (isRun || isSwim) {
      // Convert m/s → pace sec/km (run) or sec/100m (swim)
      const speedMs = fitSpd ?? strSpd;
      if (speedMs && speedMs > 0) {
        power = isSwim ? Math.round(100 / speedMs) : Math.round(1000 / speedMs);
      }
    } else {
      // Bike/other → watts
      power = fitPwr ?? strPwr ?? null;
    }

    const heartRate = fitHR ?? strHR ?? null;

    const duration = lap.totalElapsedTime ?? lap.totalTimerTime
                  ?? lap.elapsed_time ?? lap.moving_time ?? null;

    return {
      interval: i + 1,
      power,
      heartRate,
      lactate: lap.lactate ?? null,
      duration,
      durationType: 'time',
      RPE: null,
      _fromLaps: true,
    };
  }).filter(r => r.power != null || r.heartRate != null); // keep if has any data
};

/** Convert any power/pace value to a comparable number (higher = more intense). */
const toPowerNum = (val, sport) => {
  if (!val && val !== 0) return 0;
  const n = Number(val);
  if (!isNaN(n) && n > 0) {
    // For run/swim the stored value is pace (sec/km or sec/100m) — lower = faster = more intense
    const s = String(sport || '').toLowerCase();
    if (s.includes('run') || s.includes('swim')) return n > 0 ? 1 / n : 0; // invert so higher = faster
    return n; // watts — higher = more intense
  }
  // "MM:SS" string pace
  if (typeof val === 'string' && val.includes(':')) {
    const [m, sec] = val.split(':').map(Number);
    const secs = (m || 0) * 60 + (sec || 0);
    return secs > 0 ? 1 / secs : 0; // invert
  }
  return 0;
};

const fmtDuration = (dur, type) => {
  if (!dur && dur !== 0) return '';
  const s = String(dur);
  if (type === 'time') {
    if (!s.includes(':')) {
      const secs = parseInt(dur, 10);
      if (!isNaN(secs)) return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
    }
    return s;
  }
  return `${s} m`;
};

const fmtPower = (val, sport) => {
  if (!val) return '—';
  const sp = String(sport || '').toLowerCase();
  if (sp.includes('bike')) return `${val} W`;
  if (typeof val === 'string' && val.includes(':')) return val;
  const n = Number(val);
  if (!isNaN(n) && n > 0) return `${Math.floor(n / 60)}:${String(Math.round(n % 60)).padStart(2, '0')}`;
  return String(val);
};

/* ─── zone colour by % of max ──────────────────────────────────────────────── */
const zoneColor = (pct) => {
  if (pct >= 0.92) return { fill: '#e53e3e', label: 'Z5' };
  if (pct >= 0.82) return { fill: '#f97316', label: 'Z4' };
  if (pct >= 0.72) return { fill: '#48bb78', label: 'Z3' };
  if (pct >= 0.55) return { fill: '#4299e1', label: 'Z2' };
  return { fill: '#a0aec0', label: 'Z1' };
};

/** Colour for a given intervalType — matches LapsBarChart palette exactly. */
const INTERVAL_TYPE_COLOR = {
  warmup:   { fill: '#fbbf24', text: '#92400e', bg: '#fffbeb' }, // amber
  recovery: { fill: '#d1d5db', text: '#6b7280', bg: '#f9fafb' }, // gray
  cooldown: { fill: '#38bdf8', text: '#0369a1', bg: '#f0f9ff' }, // sky
  work:     null, // null = use zoneColor
};
const intervalTypeMeta = (itype) => INTERVAL_TYPE_COLOR[itype] ?? null;

/* ─── SVG Skyline chart ─────────────────────────────────────────────────────── */
function SkylineChart({ results, sport, width = 180, height = 52 }) {
  if (!results || results.length === 0) {
    return <div style={{ width, height }} className="bg-gray-50 rounded flex items-center justify-center text-[10px] text-gray-300">—</div>;
  }

  const vals = results.map(r => toPowerNum(r.power, sport));
  const maxVal = Math.max(...vals, 0.001);

  const BAR_AREA_H = height - 16; // reserve top 16px for lactate labels
  const gap = 2;
  const barW = Math.max(4, (width - gap * (results.length - 1)) / results.length);
  const totalW = results.length * barW + (results.length - 1) * gap;
  const offsetX = Math.max(0, (width - totalW) / 2);

  return (
    <svg width={width} height={height} style={{ overflow: 'visible' }}>
      {results.map((r, i) => {
        const val = vals[i];
        const pct = maxVal > 0 ? val / maxVal : 0;
        const barH = Math.max(3, pct * BAR_AREA_H);
        const x = offsetX + i * (barW + gap);
        const y = BAR_AREA_H - barH + 12; // +12 to shift below label area
        const typeMeta = intervalTypeMeta(r.intervalType);
        const { fill } = typeMeta ? { fill: typeMeta.fill } : zoneColor(pct);
        const lac = r.lactate != null && r.lactate !== '' ? Number(r.lactate) : null;

        return (
          <g key={i}>
            {/* Bar */}
            <rect x={x} y={y} width={barW} height={barH} fill={fill} rx={2} opacity={0.88} />
            {/* Lactate badge */}
            {lac != null && (
              <>
                <circle cx={x + barW / 2} cy={y - 6} r={7} fill="#fff" stroke={fill} strokeWidth={1.5} />
                <text
                  x={x + barW / 2}
                  y={y - 6}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={7}
                  fontWeight="700"
                  fill={fill}
                >
                  {lac % 1 === 0 ? lac : lac.toFixed(1)}
                </text>
              </>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/* ─── SVG Mini sparkline (for Power / HR / Pace columns) ───────────────────── */
function MiniSparkline({ values, color = '#767EB5', width = 80, height = 36 }) {
  const nums = values.map(Number).filter(v => !isNaN(v) && v > 0);
  if (nums.length === 0) return <div style={{ width, height }} />;

  const max = Math.max(...nums);
  const min = Math.min(...nums);
  const range = max - min || 1;
  const gap = 1.5;
  const barW = Math.max(3, (width - gap * (nums.length - 1)) / nums.length);
  const USABLE = height - 2;

  return (
    <svg width={width} height={height}>
      {nums.map((v, i) => {
        const h = Math.max(2, ((v - min) / range) * (USABLE - 2) + 2);
        const x = i * (barW + gap);
        return (
          <rect key={i} x={x} y={height - h} width={barW} height={h} fill={color} rx={1} opacity={0.65} />
        );
      })}
    </svg>
  );
}

/* ─── Metric column ─────────────────────────────────────────────────────────── */
function MetricCol({ label, values, color, formatVal, unit }) {
  const nums = values.filter(v => v != null && v !== '' && !isNaN(Number(v)) && Number(v) > 0);
  if (nums.length === 0) return (
    <div className="flex flex-col items-center gap-1">
      <MiniSparkline values={[]} color={color} />
      <span className="text-[9px] text-gray-300">—</span>
    </div>
  );

  const avg = nums.reduce((a, b) => a + Number(b), 0) / nums.length;

  return (
    <div className="flex flex-col items-center gap-0.5">
      <MiniSparkline values={nums.map(Number)} color={color} />
      <span className="text-[9px] font-medium text-gray-500">
        Ø {formatVal ? formatVal(avg) : Math.round(avg)}{unit}
      </span>
    </div>
  );
}

/* ─── Interval table (expanded) ─────────────────────────────────────────────── */
function IntervalTable({ results, sport, startIndex = 0, globalMax = null }) {
  const isRun  = String(sport || '').toLowerCase().includes('run');
  const isSwim = String(sport || '').toLowerCase().includes('swim');
  const paceUnit = isSwim ? '/100m' : '/km';

  // Use provided globalMax so zone colours are consistent across pages
  const maxV = globalMax ?? Math.max(...results.map(x => toPowerNum(x.power, sport)), 0.001);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs text-gray-600">
        <thead>
          <tr className="border-b border-gray-100 text-gray-400 text-[10px] uppercase tracking-wide">
            <th className="py-2 text-left w-6">#</th>
            <th className="py-2 text-center">{isRun || isSwim ? `Pace ${paceUnit}` : 'Power (W)'}</th>
            <th className="py-2 text-center">HR</th>
            <th className="py-2 text-center">RPE</th>
            <th className="py-2 text-center">Lactate</th>
            <th className="py-2 text-right">Duration</th>
          </tr>
        </thead>
        <tbody>
          {results.map((r, i) => {
            const absIdx  = startIndex + i;
            const prevLac = i > 0 ? Number(results[i - 1].lactate) : null;
            const curLac  = r.lactate != null ? Number(r.lactate) : null;
            const lacDelta = curLac != null && prevLac != null ? curLac - prevLac : null;
            const lacColor = lacDelta == null ? 'text-gray-600' : lacDelta > 0 ? 'text-red-500' : lacDelta < 0 ? 'text-emerald-500' : 'text-gray-500';

            const pct   = toPowerNum(r.power, sport) / maxV;
            const { fill: zoneFill } = zoneColor(pct);
            const typeMeta = intervalTypeMeta(r.intervalType);
            const badgeFill = typeMeta ? typeMeta.fill : zoneFill;
            const badgeText = typeMeta ? typeMeta.text : '#ffffff';
            const rowBg = typeMeta ? typeMeta.bg : undefined;

            return (
              <tr key={absIdx} className="border-b border-gray-50 hover:bg-gray-50 transition-colors" style={rowBg ? { backgroundColor: rowBg } : undefined}>
                <td className="py-1.5">
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded text-[9px] font-bold" style={{ backgroundColor: badgeFill, color: badgeText }}>
                    {r.interval || absIdx + 1}
                  </span>
                </td>
                <td className="py-1.5 text-center font-medium">{fmtPower(r.power, sport)}</td>
                <td className="py-1.5 text-center">{r.heartRate ? `${r.heartRate} bpm` : '—'}</td>
                <td className="py-1.5 text-center">{r.RPE || '—'}</td>
                <td className={`py-1.5 text-center font-semibold ${lacColor}`}>
                  {curLac != null ? (
                    <span className="flex items-center justify-center gap-0.5">
                      {lacDelta != null && lacDelta !== 0 && (
                        <span className="text-[8px]">{lacDelta > 0 ? '▲' : '▼'}</span>
                      )}
                      {curLac % 1 === 0 ? curLac : curLac.toFixed(1)}
                    </span>
                  ) : '—'}
                </td>
                <td className="py-1.5 text-right text-gray-500">
                  {fmtDuration(r.duration, r.durationType)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ─── field normalisation helpers ───────────────────────────────────────────── */
/** Pull the best title regardless of source (manual / Strava / FIT). */
const resolveTitle = (t) =>
  t.title || t.titleManual || t.name || t.titleAuto || null;

/** Pull sport string regardless of source. */
const resolveSport = (t) =>
  t.sport || t.sport_type || t.type || '';

/** Format seconds → "h:mm:ss" or "mm:ss". */
const fmtSeconds = (sec) => {
  if (!sec) return null;
  const s = Math.round(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
  return `${m}:${String(ss).padStart(2,'0')}`;
};

/** Format meters → "x.x km" or "x m". */
const fmtDistance = (m) => {
  if (!m) return null;
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
};

/** Format m/s speed → pace string "m:ss /km" or "m:ss /100m". */
const fmtSpeedAsPace = (mps, isSwim) => {
  if (!mps || mps <= 0) return null;
  const secPer = isSwim ? (100 / mps) : (1000 / mps);
  const m = Math.floor(secPer / 60);
  const s = Math.round(secPer % 60);
  return `${m}:${String(s).padStart(2,'0')} ${isSwim ? '/100m' : '/km'}`;
};

/* ─── Inline comparison helpers ─────────────────────────────────────────────── */

/** Return only "work" intervals. If no explicit types, fall back to all. */
function workIntervalsOnly(results) {
  if (!Array.isArray(results) || results.length === 0) return [];
  const typed = results.filter(r => r.intervalType);
  if (typed.length >= Math.ceil(results.length * 0.5)) {
    const work = results.filter(r => r.intervalType === 'work');
    if (work.length >= 1) return work;
  }
  return results;
}

/** Average a numeric field over a result array. Returns null if no data. */
function avgField(results, key) {
  const vals = results
    .map(r => { const v = r[key]; return v == null || v === '' ? NaN : Number(v); })
    .filter(v => !isNaN(v) && v > 0);
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

/** Human-readable relative date like "6 weeks ago". */
function relDate(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const weeks  = Math.round(diff / (7  * 24 * 3600 * 1000));
  const months = Math.round(diff / (30 * 24 * 3600 * 1000));
  if (weeks < 1) return 'last week';
  if (weeks === 1) return '1 wk ago';
  if (weeks < 9)  return `${weeks} wks ago`;
  if (months === 1) return '1 mo ago';
  return `${months} mo ago`;
}

/** Format a pace value (sec) → "m:ss". */
function fmtPaceSec(sec) {
  if (!sec || isNaN(sec)) return '—';
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Inline "vs. previous same workout" comparison panel.
 * Shows a dual mini-skyline + per-metric delta for work intervals.
 */
function InlineComparison({ currResults, prevResults, prevTraining, sport, accentColor }) {
  const isBike = !sport.toLowerCase().includes('run') && !sport.toLowerCase().includes('swim');

  const cWork = workIntervalsOnly(currResults);
  const pWork = workIntervalsOnly(prevResults);

  if (cWork.length === 0 && pWork.length === 0) return null;

  // ── Metric definitions ────────────────────────────────────────────────────
  const METRICS = [
    {
      key: 'power',
      label: isBike ? 'Avg power' : 'Avg pace',
      // For pace, raw value = sec/km (lower = faster). isGoodWhenPositive:
      //   bike: +watts = better (true)
      //   run/swim: −pace = faster = better (false = lower is better)
      goodWhenPositive: isBike ? true : false,
      format: (v) => isBike ? `${Math.round(v)} W` : fmtPaceSec(v),
      fmtDelta: (d) => {
        if (isBike) return `${d > 0 ? '+' : ''}${Math.round(d)} W`;
        // pace delta in sec: negative = faster
        const abs = Math.round(Math.abs(d));
        return `${d < 0 ? '−' : '+'}${abs}s`;
      },
    },
    {
      key: 'heartRate',
      label: 'Avg HR',
      goodWhenPositive: false,
      format: (v) => `${Math.round(v)} bpm`,
      fmtDelta: (d) => `${d > 0 ? '+' : ''}${Math.round(d)} bpm`,
    },
    {
      key: 'lactate',
      label: 'Lactate',
      goodWhenPositive: false,
      format: (v) => `${Number(v).toFixed(1)} mmol`,
      fmtDelta: (d) => `${d > 0 ? '+' : ''}${Number(d).toFixed(1)}`,
    },
  ];

  // Only show lactate column if either workout has lactate data
  const hasLac = [...cWork, ...pWork].some(r => r.lactate != null && r.lactate !== '');
  const visMetrics = METRICS.filter(m => m.key !== 'lactate' || hasLac);

  // ── Mini dual-skyline ─────────────────────────────────────────────────────
  const len = Math.min(cWork.length, pWork.length, 10);
  const cPwr = cWork.slice(0, len).map(r => toPowerNum(r.power, sport));
  const pPwr = pWork.slice(0, len).map(r => toPowerNum(r.power, sport));
  const maxPwr = Math.max(...cPwr, ...pPwr, 0.001);
  const CHART_H = 28;

  const prevDateStr = prevTraining?.date
    || prevTraining?.startDate || prevTraining?.start_date
    || prevTraining?.timestamp || prevTraining?.createdAt || '';

  return (
    <div className="mt-3 pt-3 border-t border-dashed border-gray-200">
      {/* ── Header ── */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <svg className="w-3 h-3 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">vs. previous same workout</span>
        {prevDateStr && (
          <>
            <span className="text-[10px] text-gray-300">·</span>
            <span className="text-[10px] text-gray-500 font-medium">
              {new Date(prevDateStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
            </span>
            <span className="text-[10px] text-gray-400">({relDate(prevDateStr)})</span>
          </>
        )}
      </div>

      {/* ── Dual skyline + delta stats ── */}
      <div className="flex items-start gap-5 flex-wrap">

        {/* Dual skyline */}
        {len >= 2 && (
          <div className="flex-shrink-0">
            <svg width={len * 14 - 2} height={CHART_H * 2 + 6} style={{ overflow: 'visible' }}>
              {/* current (top) */}
              {cPwr.map((v, i) => {
                const pct = maxPwr > 0 ? v / maxPwr : 0;
                const h = Math.max(3, pct * CHART_H);
                return (
                  <rect key={`c${i}`}
                    x={i * 14} y={CHART_H - h} width={12} height={h}
                    fill={accentColor} rx={2} opacity={0.85}
                  />
                );
              })}
              {/* previous (bottom) */}
              {pPwr.map((v, i) => {
                const pct = maxPwr > 0 ? v / maxPwr : 0;
                const h = Math.max(3, pct * CHART_H);
                return (
                  <rect key={`p${i}`}
                    x={i * 14} y={CHART_H + 6 + (CHART_H - h)} width={12} height={h}
                    fill="#d1d5db" rx={2}
                  />
                );
              })}
              {/* divider */}
              <line x1={0} y1={CHART_H + 3} x2={len * 14 - 2} y2={CHART_H + 3}
                stroke="#e5e7eb" strokeWidth={1} strokeDasharray="3 2" />
            </svg>
            <div className="flex items-center gap-3 mt-1.5">
              <span className="flex items-center gap-1 text-[9px] text-gray-500">
                <span className="inline-block w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: accentColor }} />
                Now
              </span>
              <span className="flex items-center gap-1 text-[9px] text-gray-500">
                <span className="inline-block w-2 h-2 rounded-sm bg-gray-300 flex-shrink-0" />
                Prev
              </span>
            </div>
          </div>
        )}

        {/* Metric deltas */}
        <div className="flex gap-5 flex-wrap flex-1 items-start">
          {visMetrics.map(m => {
            const cVal = avgField(cWork, m.key);
            const pVal = avgField(pWork, m.key);
            if (cVal === null && pVal === null) return null;

            const delta = cVal != null && pVal != null ? cVal - pVal : null;
            const isGood = delta !== null
              ? (m.goodWhenPositive ? delta > 0 : delta < 0)
              : null;
            const isZero = delta !== null && Math.abs(delta) < 0.05;

            return (
              <div key={m.key} className="flex flex-col gap-0.5 min-w-[72px]">
                <span className="text-[9px] font-semibold uppercase tracking-wide text-gray-400">{m.label}</span>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-sm font-semibold text-gray-800">
                    {cVal != null ? m.format(cVal) : '—'}
                  </span>
                  {delta !== null && !isZero && (
                    <span className={`text-[10px] font-semibold flex items-center gap-0.5 leading-none ${
                      isGood === true  ? 'text-emerald-500' :
                      isGood === false ? 'text-red-400' :
                                         'text-gray-400'
                    }`}>
                      {delta > 0 ? '▲' : '▼'} {m.fmtDelta(delta)}
                    </span>
                  )}
                  {isZero && (
                    <span className="text-[10px] text-gray-300 font-medium">±0</span>
                  )}
                </div>
                {pVal != null && (
                  <span className="text-[9px] text-gray-400">was {m.format(pVal)}</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ─── TrainingItem ──────────────────────────────────────────────────────────── */
const TrainingItem = ({ training, isExpanded, onToggleExpand, prevTraining = null }) => {
  const navigate = useNavigate();
  const [intervalPage, setIntervalPage] = useState(0);
  // Full detail loaded on expand (for Strava activities that don't include laps in list)
  const [fullDetail, setFullDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (!isExpanded || fetchedRef.current) return;
    // Strava activities in the list endpoint omit laps — lazy-load on expand
    const isStrava = Boolean(training.stravaId);
    const hasLaps  = Array.isArray(training.laps) && training.laps.length > 0;
    const hasResults = Array.isArray(training.results) && training.results.length > 0;
    if (!isStrava || hasLaps || hasResults) return;

    fetchedRef.current = true;
    setDetailLoading(true);
    getStravaActivityDetail(training.stravaId)
      .then(data => setFullDetail(data))
      .catch(() => {/* silently ignore */ })
      .finally(() => setDetailLoading(false));
  }, [isExpanded, training.stravaId, training.laps, training.results]);

  if (!training) return null;

  // ── Merge lazy-loaded detail (Strava laps) with base training ────────────
  const merged = fullDetail ? { ...training, ...fullDetail } : training;

  // ── Normalise fields from manual / Strava / FIT sources ──────────────────
  const title    = resolveTitle(merged);
  const sport    = resolveSport(merged);
  const date     = training.date; // already formatted by UserTrainingsTable

  const { results, laps, specifics, description, comments, category } = merged;

  // Use manual results if present; fall back to normalised FIT/Strava laps
  const safeResults = (Array.isArray(results) && results.length > 0)
    ? results
    : normalizeLaps(laps, sport);
  const safeSpec    = specifics || {};

  const isRun   = sport.toLowerCase().includes('run');
  const isSwim  = sport.toLowerCase().includes('swim');
  const isBike  = !isRun && !isSwim;

  const powerVals   = safeResults.map(r => r.power).filter(v => v != null && v !== '');
  const hrVals      = safeResults.map(r => r.heartRate).filter(v => v != null && v !== '');
  const lactateVals = safeResults.map(r => r.lactate).filter(v => v != null && v !== '');

  const hasLactate = lactateVals.length > 0;
  const accentColor = sportColor(sport);
  const catColor    = category ? categoryColor(category) : accentColor;

  // ── Activity-level summary stats (Strava / FIT top-level fields) ──────────
  // Strava stores camelCase at activity level: averageHeartRate, averagePower, averageSpeed,
  //   elapsedTime, movingTime, weightedAveragePower, total_elevation_gain
  // FIT stores: avgHeartRate, avgPower, avgSpeed, totalElapsedTime, totalDistance, totalAscent
  const activityStats = (() => {
    const stats = [];

    // Duration — Strava: movingTime / elapsedTime  |  FIT: totalElapsedTime
    const dur = merged.movingTime || merged.elapsedTime
              || merged.moving_time || merged.elapsed_time
              || merged.totalElapsedTime;
    if (dur) stats.push({ label: 'Time', value: fmtSeconds(dur) });

    // Distance — Strava: distance  |  FIT: totalDistance
    const dist = merged.distance || merged.totalDistance;
    if (dist) stats.push({ label: 'Dist', value: fmtDistance(dist) });

    // Elevation — Strava: total_elevation_gain  |  FIT: totalAscent
    const elev = merged.total_elevation_gain || merged.totalAscent;
    if (elev) stats.push({ label: 'Elev', value: `${Math.round(elev)} m` });

    // Avg HR — Strava: averageHeartRate  |  FIT: avgHeartRate
    const hr = merged.averageHeartRate || merged.avgHeartRate || merged.average_heartrate;
    if (hr) stats.push({ label: 'Avg HR', value: `${Math.round(hr)} bpm` });

    // Avg Power — Strava: weightedAveragePower / averagePower  |  FIT: avgPower
    const pwr = merged.weightedAveragePower || merged.averagePower
              || merged.average_watts || merged.avgPower;
    if (pwr && isBike) stats.push({ label: 'Avg Power', value: `${Math.round(pwr)} W` });

    // Avg Pace/Speed — Strava: averageSpeed  |  FIT: avgSpeed
    const spd = merged.averageSpeed || merged.avgSpeed || merged.average_speed;
    if (spd && !isBike) stats.push({ label: 'Avg Pace', value: fmtSpeedAsPace(spd, isSwim) });

    return stats;
  })();

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow overflow-hidden">
      {/* Accent bar */}
      <div className="h-0.5 w-full" style={{ backgroundColor: catColor }} />

      {/* Main row */}
      <div
        className="flex items-center px-4 py-3 cursor-pointer select-none" style={{ gap: 16 }}
        onClick={onToggleExpand}
      >
        {/* ── Activity info ── */}
        <div className="flex items-center gap-3 flex-shrink-0" style={{ minWidth: 180, maxWidth: 240 }}>
          <img src={getSportIcon(sport)} alt={sport} className="w-8 h-8 flex-shrink-0" />
          <div className="min-w-0">
            <div className="text-sm font-semibold text-gray-900 truncate leading-tight">
              {title || <span className="text-gray-300 italic">Untitled</span>}
            </div>
            <div className="text-[11px] text-gray-400 mt-0.5">{date}</div>
            <div className="flex flex-wrap gap-1 mt-1">
              {category && (
                <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide text-white" style={{ backgroundColor: catColor }}>
                  {categoryLabel(category)}
                </span>
              )}
              {hasLactate && (
                <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-semibold bg-orange-50 text-orange-600 border border-orange-200">
                  lactate
                </span>
              )}
              {safeResults.length > 0 && (
                <span className="inline-block px-1.5 py-0.5 rounded text-[9px] text-gray-400 bg-gray-50">
                  {safeResults.length} {safeResults[0]?._fromLaps ? 'laps' : 'int.'}
                </span>
              )}
              {/* Activity-level summary pills (distance / time / elev) */}
              {activityStats.slice(0, 2).map(s => (
                <span key={s.label} className="inline-block px-1.5 py-0.5 rounded text-[9px] text-gray-500 bg-gray-50">
                  {s.value}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* ── Metric sparklines — fixed-width columns so Skyline always aligns ── */}
        <div className="hidden md:flex flex-1 items-center min-w-0" style={{ gap: 0 }}>
          {/* Power / Pace */}
          <div className="flex flex-col items-center gap-0.5" style={{ flex: '1 1 0', minWidth: 0 }}>
            <span className="text-[9px] font-semibold uppercase tracking-wide text-gray-300 mb-0.5">
              {isBike ? 'Power' : 'Pace'}
            </span>
            {powerVals.length > 0 ? (
              <MetricCol
                values={powerVals.map(v => {
                  if (isBike) return Number(v) || 0;
                  const n = Number(v);
                  if (!isNaN(n)) return n;
                  if (typeof v === 'string' && v.includes(':')) {
                    const [m, s] = v.split(':').map(Number);
                    return (m * 60 + s) || 0;
                  }
                  return 0;
                })}
                color={accentColor}
                unit={isBike ? ' W' : ''}
                formatVal={isBike ? (v => Math.round(v)) : (v => { const s = Math.round(v); return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`; })}
              />
            ) : (() => {
              const stat = activityStats.find(s => s.label === 'Avg Power' || s.label === 'Avg Pace');
              return stat
                ? <div className="h-9 flex flex-col items-center justify-center"><span className="text-[11px] font-semibold text-gray-500">{stat.value}</span></div>
                : <div className="h-9 flex items-center text-[10px] text-gray-200">—</div>;
            })()}
          </div>

          {/* Heart Rate */}
          <div className="flex flex-col items-center gap-0.5" style={{ flex: '1 1 0', minWidth: 0 }}>
            <span className="text-[9px] font-semibold uppercase tracking-wide text-gray-300 mb-0.5">HR</span>
            {hrVals.length > 0 ? (
              <MetricCol
                values={hrVals}
                color="#f87171"
                unit=" bpm"
                formatVal={v => Math.round(v)}
              />
            ) : (() => {
              const avgHr = training.average_heartrate || training.avgHeartRate;
              return avgHr
                ? <div className="h-9 flex flex-col items-center justify-center"><span className="text-[11px] font-semibold text-gray-500">{Math.round(avgHr)} bpm</span></div>
                : <div className="h-9 flex items-center text-[10px] text-gray-200">—</div>;
            })()}
          </div>

          {/* Lactate — always rendered to keep Skyline column aligned */}
          <div className="flex flex-col items-center gap-0.5" style={{ flex: '1 1 0', minWidth: 0 }}>
            <span className="text-[9px] font-semibold uppercase tracking-wide text-gray-300 mb-0.5">Lactate</span>
            {lactateVals.length > 0 ? (
              <MetricCol
                values={lactateVals}
                color="#fb923c"
                unit=" mmol"
                formatVal={v => Number(v).toFixed(1)}
              />
            ) : <div className="h-9 flex items-center text-[10px] text-gray-200">—</div>}
          </div>
        </div>

        {/* ── Skyline ── */}
        <div className="flex-shrink-0 flex flex-col items-center gap-0.5">
          <span className="text-[9px] font-semibold uppercase tracking-wide text-gray-300 mb-0.5 hidden md:block">Skyline</span>
          {safeResults.length > 0 ? (
            <SkylineChart results={safeResults} sport={sport} />
          ) : detailLoading ? (
            <div className="w-[180px] h-[52px] rounded bg-gray-50 flex items-center justify-center">
              <svg className="w-4 h-4 text-gray-300 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
            </div>
          ) : (
            <div className="w-[180px] h-[52px] rounded bg-gray-50 flex items-center justify-center text-[10px] text-gray-300">
              No intervals
            </div>
          )}
        </div>

        {/* ── Chevron ── */}
        <div className="flex-shrink-0 ml-1">
          <svg
            className={`w-4 h-4 text-gray-300 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {/* ── Expanded detail ── */}
      {isExpanded && (
        <div className="border-t border-gray-100 px-4 py-4 space-y-4" onClick={e => e.stopPropagation()}>
          {detailLoading && (
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              Loading lap data…
            </div>
          )}
          {/* Zone legend + action buttons */}
          <div className="flex items-center gap-3 flex-wrap">
            {[
              { label: 'Z1 Recovery',  fill: '#a0aec0' },
              { label: 'Z2 Aerobic',   fill: '#4299e1' },
              { label: 'Z3 Tempo',     fill: '#48bb78' },
              { label: 'Z4 Threshold', fill: '#f97316' },
              { label: 'Z5 Max',       fill: '#e53e3e' },
            ].map(z => (
              <span key={z.label} className="flex items-center gap-1 text-[10px] text-gray-500">
                <span className="inline-block w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: z.fill }} />
                {z.label}
              </span>
            ))}
            <div className="ml-auto flex items-center gap-2">
              {/* Compare same trainings */}
              {title && (
                <button
                  onClick={() => {
                    window.dispatchEvent(new CustomEvent('lachart:compare', {
                      detail: { title, category: category || 'all' }
                    }));
                    // Scroll up to the comparison component
                    setTimeout(() => {
                      document.getElementById('training-comparison')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }, 80);
                  }}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors text-gray-600 border-gray-200 hover:border-gray-400 hover:bg-gray-50 flex items-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  Compare same
                </button>
              )}
              <button
                onClick={() => navigate(`/training-calendar?trainingId=${training._id}&title=${encodeURIComponent(title || '')}`)}
                className="px-3 py-1.5 text-xs font-medium text-white rounded-lg transition-colors"
                style={{ backgroundColor: accentColor }}
              >
                View in calendar →
              </button>
            </div>
          </div>

          {/* Description */}
          {description && (
            <div className="p-3 bg-gray-50 rounded-lg text-sm text-gray-600">
              {description}
            </div>
          )}

          {/* Interval table with pagination */}
          {safeResults.length > 0 && (() => {
            const totalPages = Math.ceil(safeResults.length / INTERVALS_PER_PAGE);
            const pageStart  = intervalPage * INTERVALS_PER_PAGE;
            const pageSlice  = safeResults.slice(pageStart, pageStart + INTERVALS_PER_PAGE);
            // Compute global max once so zone colours stay consistent across pages
            const globalMax  = Math.max(...safeResults.map(r => toPowerNum(r.power, sport)), 0.001);
            return (
              <div>
                <IntervalTable results={pageSlice} sport={sport} startIndex={pageStart} globalMax={globalMax} />
                {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-50">
                    <span className="text-[10px] text-gray-400">
                      Intervals {pageStart + 1}–{Math.min(pageStart + INTERVALS_PER_PAGE, safeResults.length)} of {safeResults.length}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        disabled={intervalPage === 0}
                        onClick={() => setIntervalPage(p => p - 1)}
                        className="w-7 h-7 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                        </svg>
                      </button>
                      {Array.from({ length: totalPages }, (_, i) => (
                        <button
                          key={i}
                          onClick={() => setIntervalPage(i)}
                          className={`w-6 h-6 rounded-full text-[10px] font-semibold transition-colors ${
                            intervalPage === i
                              ? 'text-white'
                              : 'text-gray-400 hover:bg-gray-100'
                          }`}
                          style={intervalPage === i ? { backgroundColor: accentColor } : {}}
                        >
                          {i + 1}
                        </button>
                      ))}
                      <button
                        disabled={intervalPage === totalPages - 1}
                        onClick={() => setIntervalPage(p => p + 1)}
                        className="w-7 h-7 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* ── Inline comparison with previous same workout ── */}
          {prevTraining && (() => {
            const prevSport = resolveSport(prevTraining);
            const prevRes = (Array.isArray(prevTraining.results) && prevTraining.results.length > 0)
              ? prevTraining.results
              : normalizeLaps(prevTraining.laps, prevSport);
            if (prevRes.length === 0) return null;
            return (
              <InlineComparison
                currResults={safeResults}
                prevResults={prevRes}
                prevTraining={prevTraining}
                sport={sport}
                accentColor={accentColor}
              />
            );
          })()}

          {/* Activity-level stats (full set — Strava/FIT) */}
          {activityStats.length > 0 && (
            <div className="flex flex-wrap gap-3 pt-2 border-t border-gray-50">
              {activityStats.map(s => (
                <div key={s.label} className="flex flex-col items-center px-3 py-1.5 bg-gray-50 rounded-lg">
                  <span className="text-[9px] font-semibold uppercase tracking-wide text-gray-400">{s.label}</span>
                  <span className="text-sm font-semibold text-gray-700">{s.value}</span>
                </div>
              ))}
            </div>
          )}

          {/* Meta */}
          {(safeSpec.specific || safeSpec.weather || comments || description || training.description) && (
            <div className="flex flex-wrap gap-4 text-xs text-gray-500 pt-2 border-t border-gray-50">
              {safeSpec.specific && (
                <span><span className="font-medium text-gray-700">Terrain:</span> {safeSpec.specific}</span>
              )}
              {safeSpec.weather && (
                <span><span className="font-medium text-gray-700">Weather:</span> {safeSpec.weather}</span>
              )}
              {(comments || training.description || description) && (
                <span className="w-full">
                  <span className="font-medium text-gray-700">Notes:</span>{' '}
                  {comments || training.description || description}
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default TrainingItem;
