/**
 * LiveWorkoutChart
 * ────────────────
 * Lightweight, dependency-free SVG chart for live workout execution.
 *
 * Renders:
 *   • Filled area for power over time (purple/primary)
 *   • Line for heart rate over time (rose, right axis)
 *   • Vertical dashed lines at step boundaries
 *   • Coloured horizontal band for the planned target of the currently
 *     visible step (so the athlete can eyeball "am I above/below target?")
 *   • Lactate sample markers (flask glyph at the timestamp)
 *
 * Performance design choices:
 *   • SVG path strings are rebuilt from a memoised slice of the sample
 *     buffer — never from the full multi-thousand-point array unless the
 *     user scrolls all the way out.
 *   • At 1Hz sampling a 90-minute workout = ~5400 points. To stay smooth,
 *     we downsample on the fly when the visible window exceeds 600 points
 *     (every Nth sample, where N = ceil(visible / 600)). Lossless for the
 *     view because adjacent samples are visually indistinguishable past
 *     that density.
 *
 * Interaction:
 *   • Default mode: auto-follow — slides to keep the latest sample on the
 *     right edge. `windowSec` controls how much history is visible.
 *   • Drag horizontally (mouse or touch) to scroll back. Releasing near
 *     the right edge resumes auto-follow.
 *   • "Live" pill in the top-right when not following — tap to re-snap.
 *
 * Props:
 *   samples            — array of { t, power, hr, stepIdx }, t in seconds
 *   currentT           — current workout elapsed seconds (used to draw the
 *                        right edge in auto-follow mode)
 *   stepBoundaries     — array of { t, label } at each step boundary
 *   lactateMarks       — array of { t, value } at each recorded sample
 *   currentStepTarget  — { min, max } planned watts for the visible step
 *                        (drawn as a coloured band)
 *   windowSec          — default 300 (5 min); -1 for "show all"
 *   height             — px height of the chart
 */
import React, { useMemo, useRef, useState, useEffect, useCallback } from 'react';

const COL = {
  power: '#a78bfa',
  powerFill: 'rgba(167, 139, 250, 0.18)',
  hr: '#fb7185',
  axis: '#4b5563',
  axisText: '#9ca3af',
  grid: 'rgba(255,255,255,0.04)',
  stepBoundary: 'rgba(255,255,255,0.12)',
  targetBand: 'rgba(167, 139, 250, 0.10)',
  targetEdge: 'rgba(167, 139, 250, 0.45)',
  lactate: '#fbbf24',
};

function buildPath(points, x, y) {
  if (!points.length) return '';
  let d = '';
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (!Number.isFinite(p.v)) continue;
    const px = x(p.t);
    const py = y(p.v);
    d += i === 0 || !Number.isFinite(points[i - 1]?.v) ? `M ${px} ${py}` : ` L ${px} ${py}`;
  }
  return d;
}

function fmtTime(s) {
  const sec = Math.max(0, Math.round(s));
  const m = Math.floor(sec / 60);
  const r = sec % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

export default function LiveWorkoutChart({
  samples = [],
  currentT = 0,
  stepBoundaries = [],
  lactateMarks = [],
  currentStepTarget = null,
  windowSec: windowSecProp = 300,
  height = 160,
}) {
  // ── Container width: measure with ResizeObserver so the chart adapts ─────
  const wrapRef = useRef(null);
  const [w, setW] = useState(600);
  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (cr?.width) setW(Math.max(280, Math.floor(cr.width)));
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  // ── Window state: auto-follow vs scrolled back ───────────────────────────
  const [followLive, setFollowLive] = useState(true);
  const [windowEnd, setWindowEnd] = useState(currentT);
  const [showAll, setShowAll] = useState(windowSecProp === -1);
  // When auto-following, keep windowEnd glued to currentT.
  useEffect(() => {
    if (followLive) setWindowEnd(currentT);
  }, [currentT, followLive]);

  const windowSec = showAll ? Math.max(60, currentT) : windowSecProp;
  const xMax = windowEnd;
  const xMin = Math.max(0, xMax - windowSec);

  // ── Y axes ───────────────────────────────────────────────────────────────
  // Power 0..max(target*1.4, observedMax*1.1); HR 60..200 hardcoded but
  // widens if data exceeds.
  const pad = { top: 8, right: 36, bottom: 22, left: 36 };
  const innerW = Math.max(10, w - pad.left - pad.right);
  const innerH = Math.max(10, height - pad.top - pad.bottom);

  const { powerYMax, hrYMin, hrYMax } = useMemo(() => {
    let pMax = 200;
    let hMin = 60;
    let hMax = 200;
    for (const s of samples) {
      if (Number.isFinite(s.power) && s.power > pMax) pMax = s.power;
      if (Number.isFinite(s.hr)) {
        if (s.hr > hMax) hMax = s.hr;
        if (s.hr > 0 && s.hr < hMin) hMin = s.hr;
      }
    }
    if (currentStepTarget?.max && currentStepTarget.max > pMax) pMax = currentStepTarget.max;
    pMax = Math.ceil(pMax * 1.1 / 20) * 20;
    return { powerYMax: pMax, hrYMin: Math.max(50, hMin - 5), hrYMax: hMax + 5 };
  }, [samples, currentStepTarget]);

  const x = useCallback(
    (t) => pad.left + ((t - xMin) / Math.max(1, xMax - xMin)) * innerW,
    [pad.left, xMin, xMax, innerW],
  );
  const yPower = useCallback(
    (v) => pad.top + (1 - v / powerYMax) * innerH,
    [pad.top, powerYMax, innerH],
  );
  const yHr = useCallback(
    (v) => pad.top + (1 - (v - hrYMin) / Math.max(1, hrYMax - hrYMin)) * innerH,
    [pad.top, hrYMin, hrYMax, innerH],
  );

  // ── Slice samples to visible window + downsample ─────────────────────────
  const { powerPoints, hrPoints } = useMemo(() => {
    if (!samples.length) return { powerPoints: [], hrPoints: [] };
    // Binary-search start of window — samples are ordered by t.
    let lo = 0;
    let hi = samples.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (samples[mid].t < xMin) lo = mid + 1;
      else hi = mid;
    }
    const visible = samples.slice(Math.max(0, lo - 1));
    const stride = Math.max(1, Math.ceil(visible.length / 600));
    const out = [];
    for (let i = 0; i < visible.length; i += stride) out.push(visible[i]);
    // Always include the very last sample so the right edge sticks to "now".
    if (visible.length && (visible.length - 1) % stride !== 0) out.push(visible[visible.length - 1]);
    return {
      powerPoints: out.map((s) => ({ t: s.t, v: s.power })),
      hrPoints:    out.map((s) => ({ t: s.t, v: s.hr })),
    };
  }, [samples, xMin]);

  // Build the filled area for power (closes down to baseline).
  const powerLinePath = useMemo(() => buildPath(powerPoints, x, yPower), [powerPoints, x, yPower]);
  const powerAreaPath = useMemo(() => {
    if (!powerPoints.length) return '';
    const firstX = x(powerPoints[0].t);
    const lastX  = x(powerPoints[powerPoints.length - 1].t);
    const baseY  = pad.top + innerH;
    return `${powerLinePath} L ${lastX} ${baseY} L ${firstX} ${baseY} Z`;
  }, [powerLinePath, powerPoints, x, pad.top, innerH]);

  const hrLinePath = useMemo(() => buildPath(hrPoints, x, yHr), [hrPoints, x, yHr]);

  // ── Y-axis tick labels ───────────────────────────────────────────────────
  const powerTicks = useMemo(() => {
    const step = Math.ceil(powerYMax / 4 / 50) * 50;
    const arr = [];
    for (let v = step; v < powerYMax; v += step) arr.push(v);
    return arr;
  }, [powerYMax]);

  // ── Touch / mouse pan ────────────────────────────────────────────────────
  const dragRef = useRef(null);
  const onPointerDown = (e) => {
    dragRef.current = {
      startX: e.clientX,
      startWindowEnd: windowEnd,
    };
    setFollowLive(false);
    if (e.currentTarget.setPointerCapture && e.pointerId != null) {
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {}
    }
  };
  const onPointerMove = (e) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const secPerPx = (xMax - xMin) / innerW;
    let next = dragRef.current.startWindowEnd - dx * secPerPx;
    next = Math.min(currentT, Math.max(windowSec, next));
    setWindowEnd(next);
  };
  const onPointerUp = () => {
    dragRef.current = null;
    // If user released near the right edge, resume live follow.
    if (Math.abs(windowEnd - currentT) < 4) setFollowLive(true);
  };

  return (
    <div ref={wrapRef} className="w-full select-none" style={{ touchAction: 'pan-y' }}>
      <div className="relative">
        <svg
          width={w}
          height={height}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          style={{ display: 'block', cursor: dragRef.current ? 'grabbing' : 'grab' }}
        >
          {/* Grid + power Y-axis labels (left) */}
          {powerTicks.map((v) => (
            <g key={`p-${v}`}>
              <line
                x1={pad.left} x2={w - pad.right}
                y1={yPower(v)} y2={yPower(v)}
                stroke={COL.grid} strokeDasharray="2 4"
              />
              <text
                x={pad.left - 4} y={yPower(v) + 3}
                fontSize="9" textAnchor="end" fill={COL.axisText}
              >
                {v}
              </text>
            </g>
          ))}
          {/* HR Y-axis labels (right) */}
          {[hrYMin, Math.round((hrYMin + hrYMax) / 2), hrYMax].map((v) => (
            <text
              key={`h-${v}`}
              x={w - pad.right + 4} y={yHr(v) + 3}
              fontSize="9" textAnchor="start" fill={COL.hr + 'aa'}
            >
              {v}
            </text>
          ))}

          {/* Current-step target band */}
          {currentStepTarget?.min != null && currentStepTarget?.max != null && (
            <>
              <rect
                x={pad.left}
                y={yPower(currentStepTarget.max)}
                width={innerW}
                height={Math.max(1, yPower(currentStepTarget.min) - yPower(currentStepTarget.max))}
                fill={COL.targetBand}
              />
              <line
                x1={pad.left} x2={w - pad.right}
                y1={yPower(currentStepTarget.max)} y2={yPower(currentStepTarget.max)}
                stroke={COL.targetEdge} strokeDasharray="4 3" strokeWidth="0.8"
              />
              <line
                x1={pad.left} x2={w - pad.right}
                y1={yPower(currentStepTarget.min)} y2={yPower(currentStepTarget.min)}
                stroke={COL.targetEdge} strokeDasharray="4 3" strokeWidth="0.8"
              />
            </>
          )}

          {/* Step boundary lines */}
          {stepBoundaries
            .filter((b) => b.t >= xMin && b.t <= xMax)
            .map((b, i) => (
              <line
                key={`b-${i}`}
                x1={x(b.t)} x2={x(b.t)}
                y1={pad.top} y2={pad.top + innerH}
                stroke={COL.stepBoundary} strokeDasharray="2 3" strokeWidth="0.8"
              />
            ))}

          {/* Power area */}
          <path d={powerAreaPath} fill={COL.powerFill} />
          <path d={powerLinePath} fill="none" stroke={COL.power} strokeWidth="1.5" strokeLinejoin="round" />

          {/* HR line */}
          <path d={hrLinePath} fill="none" stroke={COL.hr} strokeWidth="1.5" strokeLinejoin="round" />

          {/* Lactate sample markers */}
          {lactateMarks
            .filter((m) => m.t >= xMin && m.t <= xMax)
            .map((m, i) => {
              const px = x(m.t);
              return (
                <g key={`la-${i}`} transform={`translate(${px} ${pad.top + 2})`}>
                  <line x1={0} x2={0} y1={0} y2={innerH - 4} stroke={COL.lactate + '66'} strokeDasharray="1 2" />
                  <circle cx={0} cy={0} r={4.5} fill={COL.lactate} stroke="#0f172a" strokeWidth="1" />
                  <text
                    x={6} y={3}
                    fontSize="8.5" fontWeight="700"
                    fill={COL.lactate}
                  >
                    {Number(m.value).toFixed(1)}
                  </text>
                </g>
              );
            })}

          {/* X-axis baseline */}
          <line
            x1={pad.left} x2={w - pad.right}
            y1={pad.top + innerH} y2={pad.top + innerH}
            stroke={COL.axis} strokeWidth="0.5"
          />

          {/* X-axis time labels — start / mid / end of window */}
          {[xMin, (xMin + xMax) / 2, xMax].map((t, i) => (
            <text
              key={`t-${i}`}
              x={x(t)} y={pad.top + innerH + 12}
              fontSize="9" textAnchor={i === 0 ? 'start' : i === 2 ? 'end' : 'middle'}
              fill={COL.axisText}
            >
              {fmtTime(t)}
            </text>
          ))}
        </svg>

        {/* Live / scroll-to-end pill */}
        {!followLive && (
          <button
            onClick={() => { setFollowLive(true); setWindowEnd(currentT); }}
            className="absolute top-1.5 right-2 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 hover:bg-emerald-500/30"
          >
            Live
          </button>
        )}

        {/* Window-size toggle */}
        <button
          onClick={() => setShowAll((v) => !v)}
          className="absolute top-1.5 left-2 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-white/10 text-gray-300 border border-white/15 hover:bg-white/20"
          title={showAll ? 'Show last 5 minutes' : 'Show entire workout'}
        >
          {showAll ? 'All' : '5 min'}
        </button>
      </div>
    </div>
  );
}
