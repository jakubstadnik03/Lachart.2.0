/**
 * PeakValuesChart — the mean-maximal curve of one session.
 *
 * For every duration on the axis it answers one question: what is the best
 * average this athlete held for that long today. Read left to right it is the
 * shape of the effort — a sprint session falls away steeply, a threshold ride
 * stays flat for twenty minutes — and it is the only chart here that can be
 * compared against another day without lining the two rides up in time.
 *
 * The x axis is logarithmic because that is how the durations matter: the
 * step from 5 to 30 seconds says as much as the step from 5 to 30 minutes,
 * and on a linear axis the first would be invisible.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';

/** Durations the curve is sampled at, in seconds. */
const DURATIONS = [
  1, 2, 3, 5, 8, 10, 15, 20, 30, 45,
  60, 90, 120, 180, 300, 420, 600, 900, 1200, 1800, 2700, 3600, 5400, 7200,
];

/** Ticks worth labelling, and how to write them. */
const TICKS = [
  { s: 5, label: '5s' },
  { s: 30, label: '30s' },
  { s: 60, label: "1'" },
  { s: 300, label: "5'" },
  { s: 900, label: "15'" },
  { s: 1800, label: "30'" },
  { s: 3600, label: '1h' },
];

const fmtDuration = (s) => {
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const sec = s % 60;
  if (m < 60) return sec ? `${m}:${String(sec).padStart(2, '0')}` : `${m}:00`;
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:00`;
};

/**
 * A per-second series from records that may be sampled unevenly.
 *
 * A record every second is the common case, but a smart-recording device
 * drops samples on a descent and a paused ride leaves a gap. Each record is
 * repeated for the seconds it covers so the rolling averages below are
 * averages over time and not over samples — which is the difference between
 * "best 5 minutes" and "best 300 records", and those are not the same ride.
 */
function perSecondSeries(records, read) {
  const out = [];
  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    const v = read(r);
    let dt = 1;
    const prev = records[i - 1];
    if (prev?.timestamp && r?.timestamp) {
      const gap = (new Date(r.timestamp).getTime() - new Date(prev.timestamp).getTime()) / 1000;
      // A gap over 30s is a pause, not a sample interval — the athlete was
      // not riding through it, so it must not dilute an average.
      if (gap > 0 && gap <= 30) dt = Math.round(gap);
    }
    for (let k = 0; k < dt; k++) out.push(Number.isFinite(v) ? v : 0);
  }
  return out;
}

/** Best rolling average at each duration, via one prefix-sum pass. */
function meanMax(series, durations) {
  const n = series.length;
  if (n < 5) return [];
  const prefix = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) prefix[i + 1] = prefix[i] + series[i];

  const out = [];
  for (const d of durations) {
    if (d > n) break;
    let best = -Infinity;
    for (let i = 0; i + d <= n; i++) {
      const avg = (prefix[i + d] - prefix[i]) / d;
      if (avg > best) best = avg;
    }
    if (best > 0) out.push({ d, v: best });
  }
  return out;
}

/**
 * @param {object}   p
 * @param {function} p.read       record → the number being averaged. For pace
 *                                this is SPEED in m/s, not seconds per km:
 *                                the curve has to fall away to the right, and
 *                                pace counts the wrong way for that.
 * @param {function} [p.format]   value → the string in the header. Defaults to
 *                                the rounded number and `unit`.
 * @param {function} [p.formatTick] value → an axis label, kept short.
 * @param {string}   [p.bestLabel] the word before the session's best figure.
 * @param {number}   [p.minDuration] shortest window worth plotting. A second
 *                                of GPS speed is a spike, not a peak.
 */
export default function PeakValuesChart({
  records,
  read,
  color,
  unit,
  title,
  format,
  formatTick,
  bestLabel = 'max',
  minDuration = 1,
  height = 120,
  actions = null,
}) {
  const [hover, setHover] = useState(null);
  const svgRef = useRef(null);

  const points = useMemo(() => {
    if (!Array.isArray(records) || records.length < 30) return [];
    const series = perSecondSeries(records, read);
    return meanMax(series, DURATIONS.filter(d => d >= minDuration));
  }, [records, read, minDuration]);

  if (points.length < 3) return null;

  const W = 320;
  const H = height;
  const padL = 34, padR = 6, padT = 8, padB = 18;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const minD = points[0].d;
  const maxD = points[points.length - 1].d;
  const logMin = Math.log(minD);
  const logSpan = Math.log(maxD) - logMin || 1;
  const x = (d) => padL + ((Math.log(d) - logMin) / logSpan) * plotW;

  const values = points.map(p => p.v);
  const vMax = Math.max(...values);
  const vMin = Math.min(...values);
  // A little air above and below, so the curve is not glued to either edge.
  const top = vMax + (vMax - vMin) * 0.08 || vMax * 1.05;
  const bottom = Math.max(0, vMin - (vMax - vMin) * 0.12);
  const y = (v) => padT + (1 - (v - bottom) / (top - bottom || 1)) * plotH;

  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.d).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const area = `${line} L${x(maxD).toFixed(1)},${padT + plotH} L${x(minD).toFixed(1)},${padT + plotH} Z`;

  const fmtValue = format || ((v) => `${Math.round(v)} ${unit}`);
  const fmtTick = formatTick || ((v) => String(Math.round(v)));

  const ticks = TICKS.filter(t => t.s >= minD && t.s <= maxD);
  const yTicks = [bottom, (bottom + top) / 2, top];

  const onMove = (e) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const px = ((e.clientX - rect.left) / rect.width) * W;
    let best = null, bestDist = Infinity;
    for (const p of points) {
      const dist = Math.abs(x(p.d) - px);
      if (dist < bestDist) { bestDist = dist; best = p; }
    }
    setHover(best);
  };

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between mb-1 gap-2">
        <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">{title}</span>
        <div className="flex items-center gap-2 min-w-0">
          {actions}
          <span className="text-[11px] font-bold tabular-nums" style={{ color }}>
            {hover
              ? `${fmtDuration(hover.d)} · ${fmtValue(hover.v)}`
              : `${bestLabel} ${fmtValue(vMax)}`}
          </span>
        </div>
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        preserveAspectRatio="xMidYMid meet"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        style={{ display: 'block', aspectRatio: `${W} / ${H}`, height: 'auto', touchAction: 'pan-y' }}
      >
        {yTicks.map((v, i) => (
          <g key={i}>
            <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} stroke="#f1f5f9" strokeWidth={1} />
            <text x={padL - 5} y={y(v) + 3} textAnchor="end" fontSize={8} fill="#94a3b8">{fmtTick(v)}</text>
          </g>
        ))}
        <path d={area} fill={color} opacity={0.14} />
        <path d={line} fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
        {ticks.map(t => (
          <text key={t.s} x={x(t.s)} y={H - 5} textAnchor="middle" fontSize={8} fill="#94a3b8">{t.label}</text>
        ))}
        {hover && (
          <g>
            <line x1={x(hover.d)} x2={x(hover.d)} y1={padT} y2={padT + plotH} stroke={color} strokeWidth={1} opacity={0.35} />
            <circle cx={x(hover.d)} cy={y(hover.v)} r={3} fill={color} />
          </g>
        )}
      </svg>
    </div>
  );
}

/** Record readers, shared with whatever else needs the same fields. */
export const readPower = (r) => {
  const v = Number(r?.power ?? r?.watts);
  return Number.isFinite(v) ? v : 0;
};
export const readHeartRate = (r) => {
  const v = Number(r?.heartRate ?? r?.heart_rate ?? r?.hr);
  return Number.isFinite(v) ? v : 0;
};
/** Metres per second — the runner's and swimmer's stand-in for watts. */
export const readSpeed = (r) => {
  const v = Number(r?.speed ?? r?.enhanced_speed ?? r?.enhancedSpeed ?? r?.velocity_smooth ?? r?.velocity);
  return Number.isFinite(v) && v > 0 ? v : 0;
};

/**
 * One peak-values chart with a Pace/HR (run) or Power/HR (bike) toggle —
 * same control language as Time in Zones, so the session modal does not
 * show two separate peak curves side by side.
 */
export function PeakValuesPanel({
  records,
  isBike = false,
  isSwim = false,
  unitSystem = 'metric',
  formatPaceFromSpeedMps,
  formatPaceMMSS,
  paceSecondsFromSpeedMps,
  paceUnitShort,
}) {
  const paceSport = isSwim ? 'swim' : 'run';
  const hasPower = useMemo(
    () => (records || []).some((r) => readPower(r) > 0),
    [records],
  );
  const hasPace = useMemo(
    () => (records || []).some((r) => readSpeed(r) > 0),
    [records],
  );
  const hasHr = useMemo(
    () => (records || []).some((r) => readHeartRate(r) > 0),
    [records],
  );

  const options = useMemo(() => {
    const out = [];
    if (isBike && hasPower) out.push({ id: 'power', label: 'Power' });
    if (!isBike && hasPace) out.push({ id: 'pace', label: 'Pace' });
    if (hasHr) out.push({ id: 'hr', label: 'HR' });
    return out;
  }, [isBike, hasPower, hasPace, hasHr]);

  const defaultMetric = isBike ? (hasPower ? 'power' : 'hr') : (hasPace ? 'pace' : 'hr');
  const [metric, setMetric] = useState(defaultMetric);

  useEffect(() => {
    if (!options.some((o) => o.id === metric)) {
      setMetric(options[0]?.id || defaultMetric);
    }
  }, [options, metric, defaultMetric]);

  if (!options.length) return null;

  const active = options.some((o) => o.id === metric) ? metric : options[0].id;

  let chartProps = null;
  if (active === 'power') {
    chartProps = {
      read: readPower,
      color: '#767EB5',
      unit: 'W',
    };
  } else if (active === 'pace') {
    chartProps = {
      read: readSpeed,
      color: '#767EB5',
      unit: paceUnitShort(unitSystem, paceSport),
      bestLabel: 'best',
      minDuration: 5,
      format: (mps) => formatPaceFromSpeedMps(mps, unitSystem, paceSport) || '—',
      formatTick: (mps) => formatPaceMMSS(paceSecondsFromSpeedMps(mps, unitSystem, paceSport)) || '',
    };
  } else {
    chartProps = {
      read: readHeartRate,
      color: '#ef4444',
      unit: 'bpm',
    };
  }

  const toggle = options.length > 1 ? (
    <div className="inline-flex p-0.5 rounded-md bg-gray-100">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => setMetric(o.id)}
          className={`text-[9.5px] font-bold px-1.5 py-0.5 rounded transition-colors ${
            active === o.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
          }`}
          style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
        >
          {o.label}
        </button>
      ))}
    </div>
  ) : null;

  return (
    <PeakValuesChart
      records={records}
      title="Peak values"
      actions={toggle}
      {...chartProps}
    />
  );
}
