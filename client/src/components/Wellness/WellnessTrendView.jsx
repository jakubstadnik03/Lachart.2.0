/**
 * WellnessTrendView - what a coach reads from the daily wellness check-in.
 *
 * Purely presentational: it renders the summary the server builds
 * (GET /api/wellness-check-ins/summary) and owns only which tile is open.
 *
 *   - the latest score, its band, and the change since the previous check-in;
 *   - pain and illness as separate flags, never folded into the score;
 *   - a 14-day score trend with the 60 / 35 band lines;
 *   - a tile per area with its value and change (green better, red worse);
 *     tapping a tile opens that area's own 14-day chart.
 */
import React, { useMemo, useState } from 'react';
import {
  WELLNESS_AREAS, areaByKey, BAND_GOOD, BAND_LOW, BAND_STYLE, TREND_STYLE, formatDelta, GUIDANCE_NOTE,
} from './wellnessCopy';

const DAY_MS = 86400000;

function dayKeys(from, to) {
  const out = [];
  const end = Date.parse(`${to}T00:00:00Z`);
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= end; t += DAY_MS) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

function daysAgo(date, today) {
  if (!date || !today) return null;
  return Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / DAY_MS);
}

export function relativeDay(date, today) {
  const n = daysAgo(date, today);
  if (n == null) return '';
  if (n <= 0) return 'Today';
  if (n === 1) return 'Yesterday';
  return `${n} days ago`;
}

function shortDay(key) {
  const d = new Date(`${key}T00:00:00Z`);
  return `${d.getUTCDate()}.${d.getUTCMonth() + 1}.`;
}

const W = 320;
const PAD_L = 22;
const PAD_R = 8;
const PAD_T = 8;
const PAD_B = 18;

/**
 * One line over 14 day slots. Missing days are gaps in the slots but the line
 * joins the answers either side: on an every-third-day schedule a gap is the
 * plan, not missing data.
 */
function TrendChart({
  days, valueFor, min, max, height = 120, bands = [], ticks = [], colorFor, ariaLabel,
}) {
  const plotW = W - PAD_L - PAD_R;
  const plotH = height - PAD_T - PAD_B;
  const x = (i) => PAD_L + (days.length > 1 ? (i * plotW) / (days.length - 1) : plotW / 2);
  const y = (v) => PAD_T + plotH - ((v - min) / (max - min)) * plotH;

  const points = days
    .map((d, i) => ({ d, i, v: valueFor(d) }))
    .filter((p) => p.v != null);
  const path = points.map((p, k) => `${k ? 'L' : 'M'}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const labelIdx = [0, Math.floor((days.length - 1) / 2), days.length - 1];

  return (
    <svg viewBox={`0 0 ${W} ${height}`} className="w-full h-auto" role="img" aria-label={ariaLabel}>
      {bands.map((b) => (
        <rect
          key={`${b.from}-${b.to}`}
          x={PAD_L}
          width={plotW}
          y={y(b.to)}
          height={y(b.from) - y(b.to)}
          fill={b.fill}
        />
      ))}
      {ticks.map((t) => (
        <g key={t.value}>
          <line
            x1={PAD_L}
            x2={W - PAD_R}
            y1={y(t.value)}
            y2={y(t.value)}
            stroke={t.stroke || '#e5e7eb'}
            strokeDasharray={t.dashed ? '3 3' : undefined}
            strokeWidth="1"
          />
          <text x={PAD_L - 4} y={y(t.value) + 3} textAnchor="end" fontSize="9" fill="#9ca3af">
            {t.label ?? t.value}
          </text>
        </g>
      ))}
      {path && <path d={path} fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeLinejoin="round" />}
      {points.map((p) => (
        <circle key={p.d} cx={x(p.i)} cy={y(p.v)} r="3.5" fill={colorFor(p.v)} stroke="#fff" strokeWidth="1.5">
          <title>{`${p.d}: ${p.v}`}</title>
        </circle>
      ))}
      {labelIdx.map((i) => (
        <text
          key={i}
          x={x(i)}
          y={height - 4}
          textAnchor={i === 0 ? 'start' : i === days.length - 1 ? 'end' : 'middle'}
          fontSize="9"
          fill="#9ca3af"
        >
          {shortDay(days[i])}
        </text>
      ))}
    </svg>
  );
}

function bandHex(score) {
  if (score >= BAND_GOOD) return BAND_STYLE.good.hex;
  if (score < BAND_LOW) return BAND_STYLE.low.hex;
  return BAND_STYLE.watch.hex;
}

function ScoreTrend({ days, byDate }) {
  return (
    <TrendChart
      days={days}
      valueFor={(d) => byDate[d]?.score ?? null}
      min={0}
      max={100}
      height={130}
      ariaLabel="Wellness score, last 14 days"
      bands={[
        { from: BAND_GOOD, to: 100, fill: 'rgba(16,185,129,0.07)' },
        { from: BAND_LOW, to: BAND_GOOD, fill: 'rgba(245,158,11,0.07)' },
        { from: 0, to: BAND_LOW, fill: 'rgba(244,63,94,0.07)' },
      ]}
      ticks={[
        { value: 100 },
        { value: BAND_GOOD, stroke: '#10b981', dashed: true },
        { value: BAND_LOW, stroke: '#f43f5e', dashed: true },
        { value: 0 },
      ]}
      colorFor={bandHex}
    />
  );
}

function AreaTrend({ area, days, byDate }) {
  // Colour each answer by whether it is a good or a bad one for this area.
  const colorFor = (v) => {
    const goodness = area.higherIsBetter ? v : 6 - v;
    if (goodness >= 4) return BAND_STYLE.good.hex;
    if (goodness <= 2) return BAND_STYLE.low.hex;
    return BAND_STYLE.watch.hex;
  };
  return (
    <TrendChart
      days={days}
      valueFor={(d) => byDate[d]?.[area.key] ?? null}
      min={1}
      max={5}
      height={120}
      ariaLabel={`${area.label}, last 14 days`}
      ticks={[1, 2, 3, 4, 5].map((v) => ({ value: v }))}
      colorFor={colorFor}
    />
  );
}

function AreaTile({ area, info, active, onClick }) {
  const trend = TREND_STYLE[info?.trend || 'same'];
  const value = info?.value;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={active}
      className={`rounded-xl p-2.5 text-left transition-shadow ring-1 ${
        active ? 'ring-blue-400 bg-blue-50/60' : 'ring-transparent bg-slate-50 hover:ring-slate-300'
      }`}
    >
      <div className="text-[11px] font-medium text-gray-500 truncate">{area.label}</div>
      <div className="flex items-baseline gap-1.5 mt-0.5">
        <span className="text-lg font-bold text-gray-900 tabular-nums">{value ?? '—'}</span>
        <span className={`text-xs font-semibold tabular-nums ${trend.text}`}>{formatDelta(info?.delta)}</span>
      </div>
      <div className="text-[10px] text-gray-400 truncate">{value ? area.scale[value - 1] : ''}</div>
    </button>
  );
}

export default function WellnessTrendView({ summary }) {
  const [openArea, setOpenArea] = useState(null);
  const { latest, deltas, band, rows = [], today, trendFrom } = summary || {};

  const days = useMemo(
    () => (trendFrom && today ? dayKeys(trendFrom, today) : []),
    [trendFrom, today],
  );
  const byDate = useMemo(() => Object.fromEntries((rows || []).map((r) => [r.date, r])), [rows]);

  if (!latest) return null;

  const bandStyle = BAND_STYLE[band] || null;
  const scoreTrend = TREND_STYLE[deltas?.score?.trend || 'same'];
  const area = openArea ? areaByKey(openArea) : null;

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div className="flex items-end gap-3">
          <div className="text-4xl font-bold leading-none tabular-nums" style={{ color: bandStyle?.hex }}>
            {latest.score}
          </div>
          <div className="pb-0.5">
            {bandStyle && (
              <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ring-1 ${bandStyle.pill}`}>
                {bandStyle.label}
              </span>
            )}
            <div className="text-xs text-gray-500 mt-1">{relativeDay(latest.date, today)}</div>
          </div>
        </div>
        <div className="text-right">
          <div className={`text-sm font-semibold tabular-nums ${scoreTrend.text}`}>
            {formatDelta(deltas?.score?.delta)}
          </div>
          <div className="text-[11px] text-gray-400">since last check-in</div>
        </div>
      </div>

      {(latest.pain || latest.illness) && (
        <div className="flex flex-wrap gap-1.5">
          {latest.pain && (
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 ring-1 ring-rose-200">
              Pain reported{latest.linkedEpisodeId ? ' · logged' : ''}
            </span>
          )}
          {latest.illness && (
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 ring-1 ring-rose-200">
              Feeling ill{latest.linkedEpisodeId ? ' · logged' : ''}
            </span>
          )}
        </div>
      )}

      {latest.note && (
        <blockquote className="text-sm text-gray-700 bg-slate-50 rounded-xl px-3 py-2 border-l-2 border-slate-300">
          {latest.note}
        </blockquote>
      )}

      {days.length > 0 && <ScoreTrend days={days} byDate={byDate} />}

      <div className="grid grid-cols-3 gap-2">
        {WELLNESS_AREAS.map((a) => (
          <AreaTile
            key={a.key}
            area={a}
            info={deltas?.areas?.[a.key]}
            active={openArea === a.key}
            onClick={() => setOpenArea((cur) => (cur === a.key ? null : a.key))}
          />
        ))}
      </div>

      {area && (
        <div className="rounded-xl ring-1 ring-slate-200 p-3">
          <div className="flex items-center justify-between mb-1">
            <div className="text-sm font-semibold text-gray-900">{area.label} · 14 days</div>
            <button type="button" onClick={() => setOpenArea(null)} className="text-xs text-gray-500">
              Close
            </button>
          </div>
          <div className="text-[11px] text-gray-500 mb-1">
            1 = {area.scale[0]}, 5 = {area.scale[4]}
            {area.higherIsBetter ? '' : ' · lower is better'}
          </div>
          <AreaTrend area={area} days={days} byDate={byDate} />
        </div>
      )}

      <p className="text-[11px] text-gray-400">{GUIDANCE_NOTE}</p>
    </div>
  );
}
