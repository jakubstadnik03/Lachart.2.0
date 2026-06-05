/**
 * LiveWorkoutChart — live workout metrics over time (SVG, no Recharts).
 * Supports power, HR, cadence, CORE; stack or side-by-side layout.
 */
import React, { useMemo, useRef, useState, useEffect, useCallback } from 'react';

const COL = {
  power: '#a78bfa',
  powerFill: 'rgba(167, 139, 250, 0.18)',
  hr: '#fb7185',
  cadence: '#38bdf8',
  core: '#f97316',
  axis: '#4b5563',
  axisText: '#9ca3af',
  grid: 'rgba(255,255,255,0.04)',
  stepBoundary: 'rgba(255,255,255,0.12)',
  targetBand: 'rgba(167, 139, 250, 0.10)',
  targetEdge: 'rgba(167, 139, 250, 0.45)',
  lactate: '#fbbf24',
};

const SERIES_META = {
  power: { label: 'W', color: COL.power, fill: true, scale: 'power' },
  hr: { label: 'BPM', color: COL.hr, fill: false, scale: 'hr' },
  cadence: { label: 'RPM', color: COL.cadence, fill: false, scale: 'cadence' },
  coreTemp: { label: 'CORE °C', color: COL.core, fill: false, scale: 'core' },
};

function buildPath(points, x, y) {
  if (!points.length) return '';
  let d = '';
  let started = false;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (!Number.isFinite(p.v)) continue;
    const px = x(p.t);
    const py = y(p.v);
    d += started ? ` L ${px} ${py}` : `M ${px} ${py}`;
    started = true;
  }
  return d;
}

function fmtTime(s) {
  const sec = Math.max(0, Math.round(s));
  const m = Math.floor(sec / 60);
  const r = sec % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

function sliceVisible(samples, xMin) {
  if (!samples.length) return [];
  let lo = 0;
  let hi = samples.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].t < xMin) lo = mid + 1;
    else hi = mid;
  }
  const visible = samples.slice(Math.max(0, lo - 1));
  const stride = Math.max(1, Math.ceil(visible.length / 400));
  const out = [];
  for (let i = 0; i < visible.length; i += stride) out.push(visible[i]);
  if (visible.length && (visible.length - 1) % stride !== 0) out.push(visible[visible.length - 1]);
  return out;
}

function computeScales(samples, currentStepTarget) {
  let pMax = 200;
  let hMin = 60;
  let hMax = 200;
  let cMax = 120;
  let coreMin = 36;
  let coreMax = 40;

  for (const s of samples) {
    if (Number.isFinite(s.power) && s.power > pMax) pMax = s.power;
    if (Number.isFinite(s.hr)) {
      if (s.hr > hMax) hMax = s.hr;
      if (s.hr > 0 && s.hr < hMin) hMin = s.hr;
    }
    if (Number.isFinite(s.cadence) && s.cadence > cMax) cMax = s.cadence;
    if (Number.isFinite(s.coreTemp)) {
      if (s.coreTemp > coreMax) coreMax = s.coreTemp;
      if (s.coreTemp < coreMin) coreMin = s.coreTemp;
    }
  }
  if (currentStepTarget?.max && currentStepTarget.max > pMax) pMax = currentStepTarget.max;
  pMax = Math.ceil(pMax * 1.1 / 20) * 20;
  cMax = Math.ceil(cMax * 1.1 / 10) * 10;
  const corePad = Math.max(0.5, (coreMax - coreMin) * 0.15);
  return {
    powerYMax: pMax,
    hrYMin: Math.max(50, hMin - 5),
    hrYMax: hMax + 5,
    cadenceYMax: Math.max(100, cMax),
    coreYMin: coreMin - corePad,
    coreYMax: coreMax + corePad,
  };
}

function SeriesChart({
  seriesKey,
  points,
  w,
  height,
  xMin,
  xMax,
  scales,
  pad,
  showXLabels,
  currentStepTarget,
  stepBoundaries,
  lactateMarks,
  current,
  avg,
}) {
  const meta = SERIES_META[seriesKey];
  const fmtStat = (v) => (v == null || !Number.isFinite(v)
    ? '—'
    : (meta.scale === 'core' ? v.toFixed(1) : String(Math.round(v))));
  const innerW = Math.max(10, w - pad.left - pad.right);
  const innerH = Math.max(10, height - pad.top - pad.bottom);

  const x = useCallback(
    (t) => pad.left + ((t - xMin) / Math.max(1, xMax - xMin)) * innerW,
    [pad.left, xMin, xMax, innerW],
  );

  const y = useCallback(
    (v) => {
      if (meta.scale === 'power') return pad.top + (1 - v / scales.powerYMax) * innerH;
      if (meta.scale === 'hr') {
        return pad.top + (1 - (v - scales.hrYMin) / Math.max(1, scales.hrYMax - scales.hrYMin)) * innerH;
      }
      if (meta.scale === 'cadence') return pad.top + (1 - v / scales.cadenceYMax) * innerH;
      return pad.top + (1 - (v - scales.coreYMin) / Math.max(0.1, scales.coreYMax - scales.coreYMin)) * innerH;
    },
    [meta.scale, pad.top, innerH, scales],
  );

  const linePath = useMemo(() => buildPath(points, x, y), [points, x, y]);
  const areaPath = useMemo(() => {
    if (!meta.fill || !points.length) return '';
    const firstX = x(points[0].t);
    const lastX = x(points[points.length - 1].t);
    const baseY = pad.top + innerH;
    return `${linePath} L ${lastX} ${baseY} L ${firstX} ${baseY} Z`;
  }, [meta.fill, points, linePath, x, pad.top, innerH]);

  const yTicks = useMemo(() => {
    if (meta.scale === 'power') {
      const step = Math.ceil(scales.powerYMax / 3 / 50) * 50;
      const arr = [];
      for (let v = step; v < scales.powerYMax; v += step) arr.push(v);
      return arr;
    }
    if (meta.scale === 'hr') return [scales.hrYMin, Math.round((scales.hrYMin + scales.hrYMax) / 2), scales.hrYMax];
    if (meta.scale === 'cadence') {
      const step = Math.ceil(scales.cadenceYMax / 3 / 20) * 20;
      const arr = [];
      for (let v = step; v < scales.cadenceYMax; v += step) arr.push(v);
      return arr;
    }
    const mid = (scales.coreYMin + scales.coreYMax) / 2;
    return [scales.coreYMin, mid, scales.coreYMax];
  }, [meta.scale, scales]);

  return (
    <svg width={w} height={height} style={{ display: 'block' }}>
      {yTicks.map((v) => (
        <g key={`${seriesKey}-${v}`}>
          <line
            x1={pad.left}
            x2={w - pad.right}
            y1={y(v)}
            y2={y(v)}
            stroke={COL.grid}
            strokeDasharray="2 4"
          />
          <text x={pad.left - 4} y={y(v) + 3} fontSize="8" textAnchor="end" fill={COL.axisText}>
            {meta.scale === 'core' ? v.toFixed(1) : Math.round(v)}
          </text>
        </g>
      ))}

      {seriesKey === 'power' && currentStepTarget?.min != null && currentStepTarget?.max != null && (
        <>
          <rect
            x={pad.left}
            y={y(currentStepTarget.max)}
            width={innerW}
            height={Math.max(1, y(currentStepTarget.min) - y(currentStepTarget.max))}
            fill={COL.targetBand}
          />
          <line
            x1={pad.left}
            x2={w - pad.right}
            y1={y(currentStepTarget.max)}
            y2={y(currentStepTarget.max)}
            stroke={COL.targetEdge}
            strokeDasharray="4 3"
            strokeWidth="0.8"
          />
          <line
            x1={pad.left}
            x2={w - pad.right}
            y1={y(currentStepTarget.min)}
            y2={y(currentStepTarget.min)}
            stroke={COL.targetEdge}
            strokeDasharray="4 3"
            strokeWidth="0.8"
          />
        </>
      )}

      {stepBoundaries
        .filter((b) => b.t >= xMin && b.t <= xMax)
        .map((b, i) => (
          <line
            key={`b-${seriesKey}-${i}`}
            x1={x(b.t)}
            x2={x(b.t)}
            y1={pad.top}
            y2={pad.top + innerH}
            stroke={COL.stepBoundary}
            strokeDasharray="2 3"
            strokeWidth="0.8"
          />
        ))}

      {meta.fill && areaPath && <path d={areaPath} fill={COL.powerFill} />}
      {linePath && (
        <path d={linePath} fill="none" stroke={meta.color} strokeWidth="1.5" strokeLinejoin="round" />
      )}

      {seriesKey === 'power' &&
        lactateMarks
          .filter((m) => m.t >= xMin && m.t <= xMax)
          .map((m, i) => (
            <g key={`la-${i}`} transform={`translate(${x(m.t)} ${pad.top + 2})`}>
              <circle cx={0} cy={0} r={4} fill={COL.lactate} stroke="#0f172a" strokeWidth="1" />
              <text x={6} y={3} fontSize="8" fontWeight="700" fill={COL.lactate}>
                {Number(m.value).toFixed(1)}
              </text>
            </g>
          ))}

      <line
        x1={pad.left}
        x2={w - pad.right}
        y1={pad.top + innerH}
        y2={pad.top + innerH}
        stroke={COL.axis}
        strokeWidth="0.5"
      />

      {showXLabels &&
        [xMin, (xMin + xMax) / 2, xMax].map((t, i) => (
          <text
            key={`t-${i}`}
            x={x(t)}
            y={pad.top + innerH + 11}
            fontSize="8"
            textAnchor={i === 0 ? 'start' : i === 2 ? 'end' : 'middle'}
            fill={COL.axisText}
          >
            {fmtTime(t)}
          </text>
        ))}

      {/* Corner read-out: series label + live value + ⌀ whole-workout average */}
      <text
        x={w - pad.right}
        y={pad.top + 10}
        fontSize="9"
        textAnchor="end"
      >
        <tspan fontWeight="700" fill={meta.color}>{meta.label} </tspan>
        <tspan fontWeight="800" fill="#fff">{fmtStat(current)}</tspan>
        <tspan fontWeight="600" fill={COL.axisText}> ⌀{fmtStat(avg)}</tspan>
      </text>
    </svg>
  );
}

export default function LiveWorkoutChart({
  samples = [],
  currentT = 0,
  stepBoundaries = [],
  lactateMarks = [],
  currentStepTarget = null,
  windowSec: windowSecProp = 300,
  height = 160,
  layout = 'stack',
  showCadence = true,
  showCore = true,
}) {
  const wrapRef = useRef(null);
  const [w, setW] = useState(600);
  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (cr?.width) setW(Math.max(200, Math.floor(cr.width)));
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  const [followLive, setFollowLive] = useState(true);
  const [windowEnd, setWindowEnd] = useState(currentT);
  const [showAll, setShowAll] = useState(windowSecProp === -1);

  useEffect(() => {
    if (followLive) setWindowEnd(currentT);
  }, [currentT, followLive]);

  const windowSec = showAll ? Math.max(60, currentT) : windowSecProp;
  const xMax = windowEnd;
  const xMin = Math.max(0, xMax - windowSec);
  const pad = { top: 14, right: 8, bottom: showAll ? 18 : 18, left: 32 };

  const scales = useMemo(
    () => computeScales(samples, currentStepTarget),
    [samples, currentStepTarget],
  );

  const activeSeries = useMemo(() => {
    const keys = ['power', 'hr'];
    const has = (k) => samples.some((s) => Number.isFinite(s[k]));
    if (showCadence && has('cadence')) keys.push('cadence');
    if (showCore && has('coreTemp')) keys.push('coreTemp');
    return keys;
  }, [samples, showCadence, showCore]);

  const seriesPoints = useMemo(() => {
    const visible = sliceVisible(samples, xMin);
    const out = {};
    for (const key of activeSeries) {
      out[key] = visible.map((s) => ({ t: s.t, v: s[key] }));
    }
    return out;
  }, [samples, xMin, activeSeries]);

  // Live read-out per series: current (latest finite value) + whole-workout
  // average — rendered in each sub-chart's corner next to the series label.
  const seriesStats = useMemo(() => {
    const out = {};
    for (const key of activeSeries) {
      let sum = 0, n = 0, last = null;
      for (let i = 0; i < samples.length; i++) {
        const v = samples[i][key];
        if (Number.isFinite(v)) { sum += v; n += 1; last = v; }
      }
      out[key] = { current: last, avg: n ? sum / n : null };
    }
    return out;
  }, [samples, activeSeries]);

  const isRow = layout === 'row';
  const count = Math.max(1, activeSeries.length);
  const gap = isRow ? 6 : 4;
  const chartH = isRow
    ? height
    : Math.max(56, Math.floor((height - gap * (count - 1)) / count));

  const dragRef = useRef(null);
  const onPointerDown = (e) => {
    dragRef.current = { startX: e.clientX, startWindowEnd: windowEnd };
    setFollowLive(false);
    if (e.currentTarget.setPointerCapture && e.pointerId != null) {
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) { /* */ }
    }
  };
  const onPointerMove = (e) => {
    if (!dragRef.current) return;
    const innerW = Math.max(10, w - pad.left - 8);
    const dx = e.clientX - dragRef.current.startX;
    const secPerPx = (xMax - xMin) / innerW;
    let next = dragRef.current.startWindowEnd - dx * secPerPx;
    next = Math.min(currentT, Math.max(windowSec, next));
    setWindowEnd(next);
  };
  const onPointerUp = () => {
    dragRef.current = null;
    if (Math.abs(windowEnd - currentT) < 4) setFollowLive(true);
  };

  const gridClass = isRow
    ? 'grid grid-cols-2 gap-1.5 w-full'
    : 'flex flex-col gap-1 w-full';

  return (
    <div ref={wrapRef} className="w-full select-none" style={{ touchAction: 'pan-y' }}>
      <div
        className="relative"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{ cursor: dragRef.current ? 'grabbing' : 'grab' }}
      >
        <div className={gridClass} style={{ minHeight: height }}>
          {activeSeries.map((key, idx) => (
            <div key={key} className="min-w-0 min-h-0 rounded-lg overflow-hidden">
              <SeriesChart
                seriesKey={key}
                points={seriesPoints[key] || []}
                w={isRow ? Math.max(120, Math.floor((w - gap) / 2)) : w}
                height={chartH}
                xMin={xMin}
                xMax={xMax}
                scales={scales}
                pad={pad}
                showXLabels={idx === activeSeries.length - 1}
                currentStepTarget={key === 'power' ? currentStepTarget : null}
                stepBoundaries={stepBoundaries}
                lactateMarks={key === 'power' ? lactateMarks : []}
                current={seriesStats[key]?.current}
                avg={seriesStats[key]?.avg}
              />
            </div>
          ))}
        </div>

        {!followLive && (
          <button
            type="button"
            onClick={() => { setFollowLive(true); setWindowEnd(currentT); }}
            className="absolute top-1 right-2 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-400/40"
          >
            Live
          </button>
        )}
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="absolute top-1 left-2 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-white/10 text-gray-300 border border-white/15"
        >
          {showAll ? 'All' : '5 min'}
        </button>
      </div>
    </div>
  );
}
