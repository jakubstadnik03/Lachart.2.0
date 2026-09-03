/**
 * AtpChart — the season on one screen.
 *
 * Drawn as raw SVG rather than through a chart library because the three
 * layers have to register against each other exactly: the month bands behind
 * everything, one bar column per week, and the period ribbon underneath whose
 * segments must start and end on the same pixel as the bars they describe. A
 * generic chart component gives you the bars and then fights you on the rest.
 *
 * Reading it: grey bar is what the plan asks of the week, the coloured bar is
 * what was actually done and its colour is the training period. The filled
 * blue and gold shapes are the plan's projected fitness and form; the lines
 * over them are the real ones. Where line drops away from fill, the season is
 * behind.
 */
import React, { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { periodColor, PERIOD_META, periodLabel, PRIORITY_COLOR } from './atpPeriods';
import { formatWeekRange, parseDayKey } from '../../utils/atpProjection';

const COLORS = {
  atpCtlFill: 'rgba(147, 197, 253, 0.55)',
  atpCtlStroke: '#93c5fd',
  actualCtl: '#1d4ed8',
  atpTsbFill: 'rgba(234, 179, 8, 0.30)',
  atpTsbStroke: '#eab308',
  actualTsb: '#f97316',
  targetBar: '#e2e8f0',
  grid: '#eef2f7',
  monthBand: '#f8fafc',
  axis: '#94a3b8',
};

/** The bars can read as load or as hours; the sports keep the app's colours. */
const VOLUME_SPORTS = [
  { key: 'bike', label: 'Bike', color: '#767EB5' },
  { key: 'run', label: 'Run', color: '#f97316' },
  { key: 'swim', label: 'Swim', color: '#599FD0' },
  { key: 'strength', label: 'Strength', color: '#8b5cf6' },
];

/** Hours in a week's sport, done and still planned. */
function sportSecs(row, key) {
  const s = row?.sports?.[key];
  return { done: s?.sec || 0, planned: s?.plannedSec || 0 };
}
function weekVolumeSecs(row) {
  return VOLUME_SPORTS.reduce((sum, sp) => {
    const { done, planned } = sportSecs(row, sp.key);
    return sum + done + planned;
  }, 0);
}
const fmtH = (sec) => (sec > 0 ? `${Math.floor(sec / 3600)}:${String(Math.round((sec % 3600) / 60)).padStart(2, '0')}` : '—');

const M = { top: 18, right: 46, bottom: 0, left: 46 };
const PLOT_H = 300;
const MONTH_H = 20;
const BAND_H = 22;
const LABEL_H = 46;
const MIN_COL = 13;
const TIP_W = 178;
const TIP_H = 200;

/** Build an SVG path along the tops of the week columns. */
function linePath(rows, valueFor, xFor, yFor) {
  let d = '';
  rows.forEach((r, i) => {
    const v = valueFor(r);
    if (v == null || Number.isNaN(v)) return;
    d += `${d ? 'L' : 'M'}${xFor(i).toFixed(1)},${yFor(v).toFixed(1)}`;
  });
  return d;
}

/** Same path, closed down to the baseline so it can be filled. */
function areaPath(rows, valueFor, xFor, yFor, baseY) {
  const top = linePath(rows, valueFor, xFor, yFor);
  if (!top) return '';
  const first = xFor(0);
  const last = xFor(rows.length - 1);
  return `${top}L${last.toFixed(1)},${baseY.toFixed(1)}L${first.toFixed(1)},${baseY.toFixed(1)}Z`;
}

/**
 * Which series the legend can switch off. The keys are the legend's, so the
 * two cannot drift apart without the chart losing a series outright.
 */
export const ATP_SERIES = ['planTss', 'completed', 'ctlAtp', 'ctlActual', 'tsbAtp', 'tsbActual'];

export default function AtpChart({ rows = [], totals = {}, onWeekClick, mode = 'load', hidden = [] }) {
  const off = (key) => hidden.includes(key);
  const wrapRef = useRef(null);
  const [width, setWidth] = useState(1100);
  const [hover, setHover] = useState(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([entry]) => {
      const w = entry?.contentRect?.width;
      if (w) setWidth(Math.max(320, Math.round(w)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const geo = useMemo(() => {
    const n = rows.length;
    if (!n) return null;

    // Fit the season to the pane when it can, otherwise scroll horizontally.
    const availW = width - M.left - M.right;
    const colW = Math.max(MIN_COL, availW / n);
    const plotW = colW * n;
    const svgW = plotW + M.left + M.right;
    const svgH = M.top + MONTH_H + PLOT_H + BAND_H + LABEL_H;

    const plotTop = M.top + MONTH_H;
    const plotBottom = plotTop + PLOT_H;

    const tssMax = Math.max(
      1,
      ...rows.map((r) => Math.max(r.targetTss || 0, r.completedTss || 0, (r.completedTss || 0) + (r.plannedTss || 0))),
    ) * 1.12;

    // Fitness and form share the right axis the way TrainingPeaks draws them,
    // so a form swing reads against the fitness it came from.
    const metricVals = rows.flatMap((r) => [r.atpCtl, r.actualCtl, r.atpTsb, r.actualTsb])
      .filter((v) => Number.isFinite(v));
    const metricMax = Math.max(10, ...metricVals) * 1.1;
    const metricMin = Math.min(0, ...metricVals) * 1.15;

    const volMax = Math.max(3600, ...rows.map(weekVolumeSecs)) * 1.12;

    const xFor = (i) => M.left + i * colW + colW / 2;
    const yTss = (v) => plotBottom - (v / tssMax) * PLOT_H;
    const yVol = (v) => plotBottom - (v / volMax) * PLOT_H;
    const yMetric = (v) => plotBottom - ((v - metricMin) / (metricMax - metricMin)) * PLOT_H;

    // Month bands: consecutive weeks whose start falls in the same month.
    const months = [];
    rows.forEach((r, i) => {
      const d = parseDayKey(r.weekStart);
      const key = d ? `${d.getFullYear()}-${d.getMonth()}` : 'x';
      const last = months[months.length - 1];
      if (last && last.key === key) last.end = i;
      else months.push({ key, start: i, end: i, label: d ? d.toLocaleDateString('en-GB', { month: 'long' }) : '' });
    });

    // Period ribbon: consecutive weeks sharing a period become one segment.
    const bands = [];
    rows.forEach((r, i) => {
      const last = bands[bands.length - 1];
      if (last && last.period === r.period) last.end = i;
      else bands.push({ period: r.period, start: i, end: i });
    });

    return {
      n, colW, plotW, svgW, svgH, plotTop, plotBottom,
      tssMax, volMax, metricMax, metricMin, xFor, yTss, yVol, yMetric, months, bands,
    };
  }, [rows, width]);

  const pointAt = useCallback((clientX, clientY, box) => {
    if (!geo) return;
    const x = clientX - box.left - M.left;
    const i = Math.floor(x / geo.colW);
    if (i < 0 || i >= geo.n) { setHover(null); return; }
    // Client coordinates too: the readout is portalled out of this box, which
    // scrolls horizontally and is clipped by the card around it — drawn inside,
    // it was cut off at the card's edge exactly when it had most to say.
    setHover({ i, x: clientX - box.left, y: clientY - box.top, cx: clientX, cy: clientY });
  }, [geo]);

  const handleMove = useCallback((e) => {
    pointAt(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect());
  }, [pointAt]);

  // On a phone there is no hover, and the week readout is the only way to find
  // out what a 13px column says. A finger held on the chart stands in for it.
  const handleTouch = useCallback((e) => {
    const t = e.touches?.[0];
    if (!t) return;
    pointAt(t.clientX, t.clientY, e.currentTarget.getBoundingClientRect());
  }, [pointAt]);

  if (!geo || !rows.length) {
    return (
      <div ref={wrapRef} className="h-[220px] flex items-center justify-center text-sm text-slate-400">
        No weeks in this plan yet.
      </div>
    );
  }

  const {
    colW, svgW, svgH, plotTop, plotBottom, xFor, yTss, yVol, yMetric, months, bands, metricMin,
  } = geo;
  const volumeMode = mode === 'volume';
  const zeroY = yMetric(0);
  const hoverRow = hover ? rows[hover.i] : null;

  return (
    <div ref={wrapRef} className="relative w-full overflow-x-auto">
      <svg
        width={svgW}
        height={svgH}
        className="block select-none"
        onMouseMove={handleMove}
        onMouseLeave={() => setHover(null)}
        onTouchStart={handleTouch}
        onTouchMove={handleTouch}
        onTouchEnd={() => setHover(null)}
        onClick={() => { if (hoverRow && onWeekClick) onWeekClick(hoverRow); }}
      >
        {/* Alternating month bands, so a week can be placed in the year at a glance */}
        {months.map((m, idx) => {
          const x = M.left + m.start * colW;
          const w = (m.end - m.start + 1) * colW;
          return (
            <g key={m.key}>
              {idx % 2 === 1 && (
                <rect x={x} y={M.top} width={w} height={MONTH_H + PLOT_H} fill={COLORS.monthBand} />
              )}
              <text
                x={x + 5} y={M.top + 13}
                fontSize="11" fill="#64748b" fontWeight="600"
              >
                {w > 34 ? m.label : ''}
              </text>
              <line x1={x} y1={M.top} x2={x} y2={plotBottom} stroke="#e2e8f0" strokeWidth="1" />
            </g>
          );
        })}

        {/* Left axis — whatever the bars are measured in */}
        {[0.25, 0.5, 0.75, 1].map((f) => {
          const y = plotBottom - f * PLOT_H;
          return (
            <g key={f}>
              <line x1={M.left} y1={y} x2={M.left + geo.plotW} y2={y} stroke={COLORS.grid} strokeWidth="1" />
              <text x={M.left - 6} y={y + 3} fontSize="9" fill={COLORS.axis} textAnchor="end">
                {volumeMode
                  ? `${Math.round((geo.volMax * f) / 3600)}h`
                  : Math.round(geo.tssMax * f)}
              </text>
            </g>
          );
        })}

        {/* Right axis — CTL / TSB, with the form zero line called out */}
        {[0, 0.5, 1].map((f) => {
          const val = metricMin + (geo.metricMax - metricMin) * f;
          const y = plotBottom - f * PLOT_H;
          return (
            <text key={`r${f}`} x={M.left + geo.plotW + 6} y={y + 3} fontSize="9" fill={COLORS.axis}>
              {Math.round(val)}
            </text>
          );
        })}
        {metricMin < 0 && (
          <line
            x1={M.left} y1={zeroY} x2={M.left + geo.plotW} y2={zeroY}
            stroke="#cbd5e1" strokeWidth="1" strokeDasharray="3 3"
          />
        )}

        {/* The plan's projected fitness and form sit behind the bars — they are
            context for the weekly load, not the subject of the chart. */}
        {!off('ctlAtp') && <path d={areaPath(rows, (r) => r.atpCtl, xFor, yMetric, plotBottom)} fill={COLORS.atpCtlFill} />}
        {!off('tsbAtp') && <path d={areaPath(rows, (r) => r.atpTsb, xFor, yMetric, zeroY)} fill={COLORS.atpTsbFill} />}

        {/* The bars, read one of two ways. Load is the season's own currency —
            one number per week, coloured by the period it belongs to. Volume
            is what the week is made of: the same hours stacked by sport, which
            is how a coach checks that a base block is actually mostly bike.
            The fitness and form layers are unchanged either way; they hang off
            the right axis and are the plan's spine whichever bars are shown. */}
        {rows.map((r, i) => {
          const x = M.left + i * colW;
          const bw = Math.max(3, colW * 0.62);
          const bx = x + (colW - bw) / 2;

          if (volumeMode) {
            let cursor = 0;
            return (
              <g key={r.weekStart}>
                {VOLUME_SPORTS.map((sp) => {
                  const { done, planned } = sportSecs(r, sp.key);
                  const segs = [];
                  if (done > 0) {
                    const y0 = yVol(cursor + done);
                    const y1 = yVol(cursor);
                    segs.push(
                      <rect key={`${sp.key}-d`} x={bx} y={y0} width={bw} height={Math.max(0, y1 - y0)} fill={sp.color} rx="1" />,
                    );
                    cursor += done;
                  }
                  if (planned > 0) {
                    const y0 = yVol(cursor + planned);
                    const y1 = yVol(cursor);
                    segs.push(
                      <rect key={`${sp.key}-p`} x={bx} y={y0} width={bw} height={Math.max(0, y1 - y0)} fill={sp.color} opacity="0.35" rx="1" />,
                    );
                    cursor += planned;
                  }
                  return segs;
                })}
              </g>
            );
          }

          const tgtY = yTss(r.targetTss || 0);
          const doneY = yTss(r.completedTss || 0);
          const planY = yTss((r.completedTss || 0) + (r.plannedTss || 0));
          return (
            <g key={r.weekStart}>
              {r.targetTss > 0 && !off('planTss') && (
                <rect
                  x={bx} y={tgtY} width={bw} height={Math.max(0, plotBottom - tgtY)}
                  fill={COLORS.targetBar} rx="1"
                />
              )}
              {/* Scheduled-but-not-yet-done sits on top of done, lightly tinted */}
              {r.plannedTss > 0 && !off('completed') && (
                <rect
                  x={bx} y={planY} width={bw} height={Math.max(0, doneY - planY)}
                  fill={periodColor(r.period)} opacity="0.35" rx="1"
                />
              )}
              {r.completedTss > 0 && !off('completed') && (
                <rect
                  x={bx} y={doneY} width={bw} height={Math.max(0, plotBottom - doneY)}
                  fill={periodColor(r.period)} rx="1"
                />
              )}
            </g>
          );
        })}

        {/* Lines last, so neither fill can mute them */}
        {!off('ctlAtp') && <path d={linePath(rows, (r) => r.atpCtl, xFor, yMetric)} fill="none" stroke={COLORS.atpCtlStroke} strokeWidth="1.5" />}

        {/* What is really happening */}
        {!off('tsbActual') && (
          <path
            d={linePath(rows, (r) => r.actualTsb, xFor, yMetric)}
            fill="none" stroke={COLORS.actualTsb} strokeWidth="1.6"
          />
        )}
        {!off('ctlActual') && (
          <path
            d={linePath(rows, (r) => r.actualCtl, xFor, yMetric)}
            fill="none" stroke={COLORS.actualCtl} strokeWidth="2"
          />
        )}

        {/* Today */}
        {(() => {
          const i = rows.findIndex((r) => r.isCurrent);
          if (i < 0) return null;
          const x = xFor(i);
          return (
            <g>
              <line x1={x} y1={plotTop} x2={x} y2={plotBottom} stroke="#0f172a" strokeWidth="1" strokeDasharray="4 3" opacity="0.55" />
              <text x={x + 3} y={plotTop + 10} fontSize="9" fill="#0f172a" opacity="0.7" fontWeight="700">today</text>
            </g>
          );
        })()}

        {/* Races */}
        {rows.map((r, i) => r.races.map((race, k) => {
          const x = xFor(i);
          const color = PRIORITY_COLOR[String(race.priority || 'A').toUpperCase()] || PRIORITY_COLOR.C;
          return (
            <g key={`${r.weekStart}-race-${k}`}>
              <line x1={x} y1={plotTop} x2={x} y2={plotBottom} stroke={color} strokeWidth="1" opacity="0.35" />
              <polygon
                points={`${x},${plotTop - 7} ${x - 4},${plotTop - 1} ${x + 4},${plotTop - 1}`}
                fill={color}
              />
            </g>
          );
        }))}

        {/* Period ribbon — the season's shape, in one strip */}
        {bands.map((b) => {
          const x = M.left + b.start * colW;
          const w = (b.end - b.start + 1) * colW;
          const meta = PERIOD_META[b.period];
          if (!meta) return null;
          return (
            <g key={`${b.period}-${b.start}`}>
              <rect
                x={x + 1} y={plotBottom + 6} width={Math.max(1, w - 2)} height={BAND_H - 8}
                fill={meta.color} rx="2"
              />
              {w > 40 && (
                <text
                  x={x + w / 2} y={plotBottom + 6 + (BAND_H - 8) / 2 + 3}
                  fontSize="9" fontWeight="700" fill={meta.text} textAnchor="middle"
                >
                  {w > 70 ? meta.label : meta.short}
                </text>
              )}
            </g>
          );
        })}

        {/* Week ticks — every 4th when the columns get tight */}
        {rows.map((r, i) => {
          const every = colW < 22 ? 4 : colW < 34 ? 2 : 1;
          if (i % every !== 0) return null;
          const d = parseDayKey(r.weekStart);
          if (!d) return null;
          const x = xFor(i);
          const y = plotBottom + BAND_H + 12;
          return (
            <text
              key={`t${r.weekStart}`}
              x={x} y={y} fontSize="8" fill={COLORS.axis} textAnchor="end"
              transform={`rotate(-45 ${x} ${y})`}
            >
              {d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
            </text>
          );
        })}

        {/* Hover column */}
        {hoverRow && (
          <rect
            x={M.left + hover.i * colW} y={plotTop} width={colW} height={PLOT_H}
            fill="#0f172a" opacity="0.05" pointerEvents="none"
          />
        )}
      </svg>

      {hoverRow && ReactDOM.createPortal(
        <div
          className="pointer-events-none fixed z-[10050] rounded-lg bg-white shadow-xl ring-1 ring-slate-200 px-2.5 py-2 text-[11px] leading-tight"
          style={{
            // Right of the cursor when there is room, otherwise left of it, and
            // never off the bottom.
            left: hover.cx + 14 + TIP_W <= window.innerWidth
              ? hover.cx + 14
              : Math.max(8, hover.cx - 14 - TIP_W),
            top: Math.max(8, Math.min(hover.cy - 90, window.innerHeight - TIP_H - 8)),
            width: TIP_W,
          }}
        >
          <div className="font-bold text-slate-800">
            {formatWeekRange(hoverRow.weekStart, hoverRow.weekEnd)}
          </div>
          {hoverRow.period && (
            <div className="mt-0.5 mb-1 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-bold"
              style={{ backgroundColor: periodColor(hoverRow.period), color: PERIOD_META[hoverRow.period]?.text }}
            >
              {periodLabel(hoverRow.period, hoverRow.periodWeek)}
            </div>
          )}
          <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 tabular-nums">
            {volumeMode ? VOLUME_SPORTS.map((sp) => {
              const { done, planned } = sportSecs(hoverRow, sp.key);
              if (!done && !planned) return null;
              return (
                <React.Fragment key={sp.key}>
                  <span style={{ color: sp.color }}>{sp.label}</span>
                  <span className="font-semibold text-slate-700 text-right">
                    {fmtH(done)}{planned > 0 && <span className="text-slate-400"> / {fmtH(done + planned)}</span>}
                  </span>
                </React.Fragment>
              );
            }) : (
              <>
                <span className="text-slate-400">Plan</span>
                <span className="font-semibold text-slate-700 text-right">{hoverRow.targetTss} TSS</span>
                <span className="text-slate-400">Done</span>
                <span className="font-semibold text-slate-700 text-right">{hoverRow.completedTss} TSS</span>
              </>
            )}
            <span className="text-blue-500">CTL plan</span>
            <span className="font-semibold text-right text-blue-600">{hoverRow.atpCtl}</span>
            <span className="text-blue-700">CTL actual</span>
            <span className="font-semibold text-right text-blue-800">{hoverRow.actualCtl}</span>
            <span className="text-amber-500">TSB plan</span>
            <span className="font-semibold text-right text-amber-600">
              {hoverRow.atpTsb > 0 ? `+${hoverRow.atpTsb}` : hoverRow.atpTsb}
            </span>
            <span className="text-orange-500">TSB actual</span>
            <span className="font-semibold text-right text-orange-600">
              {hoverRow.actualTsb > 0 ? `+${hoverRow.actualTsb}` : hoverRow.actualTsb}
            </span>
          </div>
          {hoverRow.races.map((r, k) => (
            <div key={k} className="mt-1 pt-1 border-t border-slate-100 font-semibold text-slate-700 truncate">
              🏁 {r.name}
            </div>
          ))}
        </div>,
        document.getElementById('app-modal-root') || document.body,
      )}
    </div>
  );
}
