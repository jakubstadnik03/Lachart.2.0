/**
 * InteractiveChart — one chart, used everywhere.
 *
 * LaChart currently draws charts with three different libraries (recharts,
 * chart.js and echarts), which is why no two charts look or behave alike and
 * why none of them pan, zoom or read out exact values. This is the shared
 * primitive they can converge on: plain SVG, no fourth dependency, and the same
 * interactions on desktop and inside the Capacitor shell.
 *
 * All the maths lives in utils/chartInteraction.js, where it can be tested —
 * this file is projection, pointers and paint.
 */
import React, { useCallback, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import {
  ArrowsPointingInIcon,
  ArrowsPointingOutIcon,
  ArrowUturnLeftIcon,
} from '@heroicons/react/24/outline';
import {
  FULL_WINDOW,
  downsample,
  isFullWindow,
  lapBands,
  nearestIndex,
  niceTicks,
  panWindow,
  visibleRange,
  windowToDomain,
  zoomWindow,
} from '../../utils/chartInteraction';

const PAD = { top: 10, right: 8, bottom: 18, left: 34 };

/** One palette for every chart in the app — see the file header. */
export const SERIES_COLORS = {
  power: '#6366F1',
  pace: '#6366F1',
  heartRate: '#F43F5E',
  lactate: '#7C3AED',
  cadence: '#0EA5E9',
  altitude: '#94A3B8',
  default: '#475569',
};

function fmt(value, decimals = 0) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return Number(value).toFixed(decimals);
}

function formatClock(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

export default function InteractiveChart({
  /** [{ key, label, unit, color, decimals, points: [{x, y}] }] — x ascending, shared domain */
  series = [],
  /** [{ start, end, label?, hard? }] in x units */
  laps = [],
  xFormat = formatClock,
  height = 200,
  title = null,
  /** Rendered inside the read-out, for units the caller formats itself. */
  valueFormat = null,
  className = '',
}) {
  const [win, setWin] = useState(FULL_WINDOW);
  const [cursor, setCursor] = useState(null); // 0..1 across the viewport
  const [fullscreen, setFullscreen] = useState(false);
  const svgRef = useRef(null);
  const dragRef = useRef(null);
  const pinchRef = useRef(null);

  const usable = useMemo(
    () => series.filter((s) => Array.isArray(s.points) && s.points.length > 1),
    [series],
  );

  const domain = useMemo(() => {
    if (!usable.length) return [0, 1];
    let lo = Infinity;
    let hi = -Infinity;
    for (const s of usable) {
      lo = Math.min(lo, s.points[0].x);
      hi = Math.max(hi, s.points[s.points.length - 1].x);
    }
    return Number.isFinite(lo) && hi > lo ? [lo, hi] : [0, 1];
  }, [usable]);

  const H = fullscreen ? Math.max(260, Math.min(520, height * 2)) : height;
  const W = 1000; // viewBox units; the SVG scales to its container
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  /** Visible slice per series, thinned to what the canvas can show. */
  const rendered = useMemo(() => usable.map((s) => {
    const xs = s.points.map((p) => p.x);
    const [lo, hi] = visibleRange(xs, win, domain);
    const slice = s.points.slice(lo, hi + 1);
    const thinned = downsample(slice, plotW / 2);
    const ys = thinned.map((p) => p.y).filter((y) => Number.isFinite(y));
    return {
      ...s,
      slice: thinned,
      min: ys.length ? Math.min(...ys) : 0,
      max: ys.length ? Math.max(...ys) : 1,
      xs,
    };
  }), [usable, win, domain, plotW]);

  // Each series keeps its own y-scale: power in watts and heart rate in bpm on
  // one axis makes both unreadable.
  const paths = useMemo(() => rendered.map((s) => {
    const span = Math.max(1e-6, s.max - s.min);
    const x0 = windowToDomain(win, 0, domain);
    const x1 = windowToDomain(win, 1, domain);
    const xSpan = Math.max(1e-6, x1 - x0);
    const d = s.slice
      .map((p, i) => {
        const x = PAD.left + ((p.x - x0) / xSpan) * plotW;
        const y = PAD.top + (1 - (p.y - s.min) / span) * plotH;
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
    return { ...s, d };
  }), [rendered, win, domain, plotW, plotH]);

  const bands = useMemo(() => lapBands(laps, domain), [laps, domain]);

  /** Values under the cursor, read from the full series rather than the thinned one. */
  const readout = useMemo(() => {
    if (cursor === null || !rendered.length) return null;
    const x = windowToDomain(win, cursor, domain);
    return {
      x,
      values: rendered.map((s) => {
        const i = nearestIndex(s.xs, x);
        return { key: s.key, label: s.label, unit: s.unit, color: s.color, decimals: s.decimals, y: s.points[i]?.y };
      }),
    };
  }, [cursor, rendered, win, domain]);

  const toFraction = useCallback((clientX) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 0;
    const px = (clientX - rect.left) / rect.width;
    // The plot area is inset by the axis gutter, so a raw fraction of the
    // element would report the wrong sample near the edges.
    return Math.max(0, Math.min(1, (px * W - PAD.left) / plotW));
  }, [plotW]);

  const onPointerDown = useCallback((e) => {
    svgRef.current?.setPointerCapture?.(e.pointerId);
    dragRef.current = { x: e.clientX, win };
    setCursor(toFraction(e.clientX));
  }, [win, toFraction]);

  const onPointerMove = useCallback((e) => {
    const drag = dragRef.current;
    if (drag) {
      const rect = svgRef.current?.getBoundingClientRect();
      if (rect?.width) {
        const moved = (e.clientX - drag.x) / rect.width;
        // Drag right pulls earlier data into view, like moving a sheet of paper.
        if (Math.abs(moved) > 0.002) setWin(panWindow(drag.win, -moved));
      }
    }
    setCursor(toFraction(e.clientX));
  }, [toFraction]);

  const endDrag = useCallback((e) => {
    svgRef.current?.releasePointerCapture?.(e?.pointerId);
    dragRef.current = null;
  }, []);

  const onWheel = useCallback((e) => {
    if (!e.deltaY) return;
    e.preventDefault();
    setWin((w) => zoomWindow(w, e.deltaY > 0 ? 1.15 : 1 / 1.15, toFraction(e.clientX)));
  }, [toFraction]);

  // Pinch, for the native shell where there is no wheel.
  const onTouchMove = useCallback((e) => {
    if (e.touches.length !== 2) return;
    const [a, b] = [e.touches[0], e.touches[1]];
    const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    const mid = toFraction((a.clientX + b.clientX) / 2);
    const prev = pinchRef.current;
    if (prev?.dist) setWin((w) => zoomWindow(w, prev.dist / dist, mid));
    pinchRef.current = { dist };
    dragRef.current = null; // a pinch is not a pan
  }, [toFraction]);

  if (!usable.length) return null;

  const primary = paths[0];
  const yTicks = niceTicks(primary.min, primary.max, 3);
  const ySpan = Math.max(1e-6, primary.max - primary.min);

  const chart = (
    <div className={`relative ${className}`}>
      {(title || !isFullWindow(win)) && (
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-bold text-gray-900">{title}</span>
          <div className="flex items-center gap-1">
            {!isFullWindow(win) && (
              <button
                type="button"
                onClick={() => setWin(FULL_WINDOW)}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold text-gray-500 hover:bg-gray-100"
              >
                <ArrowUturnLeftIcon className="w-3 h-3" /> Reset
              </button>
            )}
            <button
              type="button"
              onClick={() => setFullscreen((f) => !f)}
              className="p-1 rounded hover:bg-gray-100"
              aria-label={fullscreen ? 'Exit full screen' : 'Full screen'}
            >
              {fullscreen
                ? <ArrowsPointingInIcon className="w-3.5 h-3.5 text-gray-400" />
                : <ArrowsPointingOutIcon className="w-3.5 h-3.5 text-gray-400" />}
            </button>
          </div>
        </div>
      )}

      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="w-full touch-none select-none cursor-crosshair"
        style={{ height: H }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={(e) => { endDrag(e); setCursor(null); }}
        onWheel={onWheel}
        onTouchMove={onTouchMove}
        onTouchEnd={() => { pinchRef.current = null; }}
        onDoubleClick={() => setWin(FULL_WINDOW)}
      >
        {/* Lap bands, numbered from one regardless of what the device called them */}
        {bands.map((b) => {
          const x = PAD.left + ((b.from - win.start) / (win.end - win.start)) * plotW;
          const w = ((b.to - b.from) / (win.end - win.start)) * plotW;
          if (x + w < PAD.left || x > W - PAD.right) return null;
          return (
            <g key={b.number}>
              <rect
                x={Math.max(PAD.left, x)}
                y={PAD.top}
                width={Math.max(0, Math.min(x + w, W - PAD.right) - Math.max(PAD.left, x))}
                height={plotH}
                fill={b.hard ? '#F97316' : '#94A3B8'}
                opacity={b.number % 2 ? 0.07 : 0.03}
              />
              {w > 26 ? (
                <text
                  x={Math.max(PAD.left, x) + 3}
                  y={PAD.top + 9}
                  fontSize="9"
                  fill="#94A3B8"
                  fontWeight="700"
                >
                  {b.number}
                </text>
              ) : null}
            </g>
          );
        })}

        {/* Y grid, scaled to the first series */}
        {yTicks.map((t) => {
          const y = PAD.top + (1 - (t - primary.min) / ySpan) * plotH;
          return (
            <g key={t}>
              <line x1={PAD.left} y1={y} x2={W - PAD.right} y2={y} stroke="#E5E7EB" strokeWidth="0.5" />
              <text x={PAD.left - 4} y={y + 3} fontSize="9" fill="#9CA3AF" textAnchor="end">
                {fmt(t, primary.decimals ?? 0)}
              </text>
            </g>
          );
        })}

        {paths.map((s) => (
          <path
            key={s.key}
            d={s.d}
            fill="none"
            stroke={s.color || SERIES_COLORS[s.key] || SERIES_COLORS.default}
            strokeWidth="1.4"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}

        {cursor !== null ? (
          <line
            x1={PAD.left + cursor * plotW}
            y1={PAD.top}
            x2={PAD.left + cursor * plotW}
            y2={PAD.top + plotH}
            stroke="#111827"
            strokeWidth="0.6"
            strokeDasharray="2 2"
          />
        ) : null}

        <text x={PAD.left} y={H - 5} fontSize="9" fill="#9CA3AF">
          {xFormat(windowToDomain(win, 0, domain))}
        </text>
        <text x={W - PAD.right} y={H - 5} fontSize="9" fill="#9CA3AF" textAnchor="end">
          {xFormat(windowToDomain(win, 1, domain))}
        </text>
      </svg>

      {/* Exact values — the point of tapping the chart at all */}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 mt-1 min-h-[18px]">
        {readout ? (
          <>
            <span className="text-[11px] font-bold text-gray-900 tabular-nums">{xFormat(readout.x)}</span>
            {readout.values.map((v) => (
              <span key={v.key} className="text-[11px] tabular-nums" style={{ color: v.color || SERIES_COLORS[v.key] || SERIES_COLORS.default }}>
                <span className="font-bold">
                  {valueFormat ? valueFormat(v.y, v.key) : fmt(v.y, v.decimals ?? 0)}
                </span>
                {v.unit ? <span className="opacity-70"> {v.unit}</span> : null}
              </span>
            ))}
          </>
        ) : (
          <span className="text-[10px] text-gray-400">
            Drag to pan · scroll or pinch to zoom · double-tap to reset
          </span>
        )}
      </div>
    </div>
  );

  if (!fullscreen) return chart;

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[70] bg-white p-4 overflow-y-auto">
      <div className="max-w-5xl mx-auto">{chart}</div>
    </div>,
    document.body,
  );
}
