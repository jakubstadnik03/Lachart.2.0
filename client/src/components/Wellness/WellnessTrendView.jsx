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
  days, valueFor, min, max, height = 120, bands = [], ticks = [], colorFor, ariaLabel, line = '#94a3b8',
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
      {path && <path d={path} fill="none" stroke={line} strokeWidth="1.5" strokeLinejoin="round" />}
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

function ScoreTrend({ days, byDate, line }) {
  return (
    <TrendChart
      line={line}
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

function AreaTrend({ area, days, byDate, line }) {
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
      line={line}
    />
  );
}

/**
 * The native app speaks its own visual language (glass cards, lavender
 * accent, small uppercase labels), so the native variant swaps the chrome
 * while the numbers and structure stay identical to the web.
 */
const N = {
  ink: '#0A0E1A',
  accent: '#5E6590',
  muted: '#9CA3AF',
  label: {
    fontSize: 9.5, fontWeight: 800, color: '#9CA3AF', letterSpacing: '0.06em', textTransform: 'uppercase',
  },
  tile: { background: 'rgba(118,126,181,.06)', borderRadius: 12, padding: '8px 10px' },
  tileActive: { background: 'rgba(118,126,181,.16)', boxShadow: 'inset 0 0 0 1px rgba(94,101,144,.35)' },
};

function AreaTile({ area, info, active, onClick, native }) {
  const trend = TREND_STYLE[info?.trend || 'same'];
  const value = info?.value;
  if (native) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-expanded={active}
        style={{
          ...N.tile, ...(active ? N.tileActive : null),
          border: 'none', textAlign: 'left', fontFamily: 'inherit', minWidth: 0,
          cursor: 'pointer', WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
        }}
      >
        <div style={{ ...N.label, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{area.label}</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, marginTop: 2 }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: N.ink, fontVariantNumeric: 'tabular-nums' }}>{value ?? '—'}</span>
          <span style={{ fontSize: 11.5, fontWeight: 800, color: trend.hex, fontVariantNumeric: 'tabular-nums' }}>
            {formatDelta(info?.delta)}
          </span>
        </div>
        <div style={{ fontSize: 10.5, color: '#6B7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {value ? area.scale[value - 1] : ''}
        </div>
      </button>
    );
  }
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

function Flag({ children, native }) {
  if (native) {
    return (
      <span style={{
        fontSize: 11, fontWeight: 800, color: '#B91C1C', background: '#FEF2F2',
        border: '1px solid #FECACA', borderRadius: 999, padding: '3px 9px',
      }}
      >
        {children}
      </span>
    );
  }
  return (
    <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 ring-1 ring-rose-200">
      {children}
    </span>
  );
}

export default function WellnessTrendView({ summary, variant = 'web' }) {
  const [openArea, setOpenArea] = useState(null);
  const { latest, deltas, band, rows = [], today, trendFrom } = summary || {};
  const native = variant === 'native';

  const days = useMemo(
    () => (trendFrom && today ? dayKeys(trendFrom, today) : []),
    [trendFrom, today],
  );
  const byDate = useMemo(() => Object.fromEntries((rows || []).map((r) => [r.date, r])), [rows]);

  if (!latest) return null;

  const bandStyle = BAND_STYLE[band] || null;
  const scoreTrend = TREND_STYLE[deltas?.score?.trend || 'same'];
  const area = openArea ? areaByKey(openArea) : null;
  const logged = latest.linkedEpisodeId ? ' · logged' : '';

  const scoreBlock = native ? (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
        <div style={{
          fontSize: 38, lineHeight: 1, fontWeight: 800, letterSpacing: '-0.03em',
          color: bandStyle?.hex || N.ink, fontVariantNumeric: 'tabular-nums',
        }}
        >
          {latest.score}
        </div>
        <div style={{ paddingBottom: 2 }}>
          {bandStyle && (
            <span style={{
              fontSize: 10.5, fontWeight: 800, color: bandStyle.hex, background: `${bandStyle.hex}1A`,
              borderRadius: 8, padding: '3px 8px',
            }}
            >
              {bandStyle.label}
            </span>
          )}
          <div style={{ fontSize: 11.5, color: '#6B7280', marginTop: 5 }}>{relativeDay(latest.date, today)}</div>
        </div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: scoreTrend.hex, fontVariantNumeric: 'tabular-nums' }}>
          {formatDelta(deltas?.score?.delta)}
        </div>
        <div style={N.label}>since last</div>
      </div>
    </div>
  ) : (
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
  );

  return (
    <div style={native ? { display: 'flex', flexDirection: 'column', gap: 12 } : undefined} className={native ? undefined : 'space-y-3'}>
      {scoreBlock}

      {(latest.pain || latest.illness) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {latest.pain && <Flag native={native}>Pain reported{logged}</Flag>}
          {latest.illness && <Flag native={native}>Feeling ill{logged}</Flag>}
        </div>
      )}

      {latest.note && (native ? (
        <div style={{
          fontSize: 12.5, lineHeight: 1.45, color: '#374151', background: 'rgba(118,126,181,.06)',
          borderLeft: '2px solid rgba(94,101,144,.45)', borderRadius: 10, padding: '8px 11px',
        }}
        >
          {latest.note}
        </div>
      ) : (
        <blockquote className="text-sm text-gray-700 bg-slate-50 rounded-xl px-3 py-2 border-l-2 border-slate-300">
          {latest.note}
        </blockquote>
      ))}

      {days.length > 0 && <ScoreTrend days={days} byDate={byDate} line={native ? '#767EB5' : undefined} />}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: native ? 6 : 8 }}>
        {WELLNESS_AREAS.map((a) => (
          <AreaTile
            key={a.key}
            area={a}
            info={deltas?.areas?.[a.key]}
            active={openArea === a.key}
            native={native}
            onClick={() => setOpenArea((cur) => (cur === a.key ? null : a.key))}
          />
        ))}
      </div>

      {area && (
        <div
          className={native ? undefined : 'rounded-xl ring-1 ring-slate-200 p-3'}
          style={native ? { borderRadius: 14, border: '1px solid rgba(118,126,181,.18)', background: 'rgba(255,255,255,.55)', padding: '10px 10px 6px' } : undefined}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
            <div style={native ? { fontSize: 13, fontWeight: 800, color: N.ink } : undefined} className={native ? undefined : 'text-sm font-semibold text-gray-900'}>
              {area.label} · 14 days
            </div>
            <button
              type="button"
              onClick={() => setOpenArea(null)}
              style={native ? { background: 'none', border: 'none', fontFamily: 'inherit', fontSize: 12, fontWeight: 700, color: N.accent, padding: 4 } : undefined}
              className={native ? undefined : 'text-xs text-gray-500'}
            >
              Close
            </button>
          </div>
          <div style={native ? { fontSize: 11, color: '#6B7280', marginBottom: 2 } : undefined} className={native ? undefined : 'text-[11px] text-gray-500 mb-1'}>
            1 = {area.scale[0]}, 5 = {area.scale[4]}
            {area.higherIsBetter ? '' : ' · lower is better'}
          </div>
          <AreaTrend area={area} days={days} byDate={byDate} line={native ? '#767EB5' : undefined} />
        </div>
      )}

      <p
        style={native ? { fontSize: 10.5, lineHeight: 1.4, color: N.muted, margin: 0 } : undefined}
        className={native ? undefined : 'text-[11px] text-gray-400'}
      >
        {GUIDANCE_NOTE}
      </p>
    </div>
  );
}
