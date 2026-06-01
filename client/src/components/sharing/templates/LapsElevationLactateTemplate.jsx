/**
 * LapsElevationLactateTemplate — "the workout breakdown" layout.
 * Stack three layers from back to front:
 *   1. Elevation profile (subtle filled mountain silhouette)
 *   2. Lap bars (work laps tinted, warm-up/cool-down dimmed) coloured by
 *      relative intensity
 *   3. Lactate dots — one labelled circle per work lap that has a value,
 *      anchored above the bar
 *
 * Pure SVG so it captures cleanly to PNG via the canvas pipeline shared
 * with the other templates.
 *
 * Props
 *   activity:  { distance, duration, sport, title, ... }
 *   laps:      work + recovery, in chronological order
 *   records:   optional per-second records — used for the elevation profile
 *              when present; falls back to step-function from lap elevation
 *              gain when absent
 *   accent:    sport tint
 */

import React, { useMemo } from 'react';

const W = 1080;
const H = 1920;

// Layout slots
const PAD_X        = 60;
const TITLE_BAND_Y = 200;
const ELEV_BAND_Y  = 700;
const ELEV_BAND_H  = 720; // trimmed to leave space for the y-axis labels & legend
const STATS_BAND_Y = 1560;

// Sport-icon SVG paths (24 × 24 coord space) — clean line-art glyphs that
// scale well at 110 × 110 px in the share template header.
const SPORT_ICONS = {
  bike: 'M5.5 18.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zm13 0a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zm-6.5-3.5l-3-6h-2m5 6l4-5h-3m-2-2l1.5 2m1.5-5h3',
  run:  'M13 4a2 2 0 1 1 0 4 2 2 0 0 1 0-4zm-2 6l-3 4 3 2 1 6m4-8l-3-2 2-3 3 1',
  swim: 'M3 16c2 0 2-1.2 4-1.2s2 1.2 4 1.2 2-1.2 4-1.2 2 1.2 4 1.2 2-1.2 4-1.2 M3 20c2 0 2-1.2 4-1.2s2 1.2 4 1.2 2-1.2 4-1.2 2 1.2 4 1.2 2-1.2 4-1.2 M14 5a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM7 13l6-4',
};
function pickSport(sport) {
  const s = String(sport || '').toLowerCase();
  if (s.includes('run') || s.includes('walk') || s.includes('hike')) return 'run';
  if (s.includes('swim')) return 'swim';
  return 'bike';
}

function fmtDist(m)  { return m ? `${(m / 1000).toFixed(2)} km` : '—'; }
function fmtDur(s) {
  if (!s) return '—';
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h === 0 ? `${m} min` : `${h}h ${m}min`;
}

function lapDurSec(lap) {
  return Number(lap?.elapsed_time || lap?.totalElapsedTime || lap?.moving_time || lap?.duration || lap?.durationSeconds || 0);
}
function lapDistM(lap) {
  return Number(lap?.distance || lap?.totalDistance || lap?.distanceMeters || 0);
}
function lapLactate(lap) {
  const v = lap?.lactate ?? lap?.lactateValue ?? lap?.mmol;
  return v != null && Number.isFinite(Number(v)) ? Number(v) : null;
}
function lapElevGain(lap) {
  return Number(lap?.total_elevation_gain ?? lap?.elevation_gain ?? lap?.elevationGain ?? 0);
}
function lapAvgPower(lap) {
  return Number(lap?.average_watts ?? lap?.avgPower ?? lap?.average_power ?? 0);
}
function lapAvgHr(lap) {
  return Number(lap?.average_heartrate ?? lap?.avgHeartRate ?? lap?.average_heart_rate ?? 0);
}
function isWorkLap(lap, idx, total) {
  const t = String(lap?.intervalType || '').toLowerCase();
  if (t === 'warmup' || t === 'cooldown' || t === 'recovery' || t === 'rest') return false;
  if (t === 'work') return true;
  // Position-based fallback
  if (total >= 3 && (idx === 0 || idx === total - 1)) return false;
  return true;
}

export default function LapsElevationLactateTemplate({
  activity = {},
  laps = [],
  records = null,
  accent = '#FC4C02',
}) {
  // ── Elevation polygon ──────────────────────────────────────────────────────
  const elevPath = useMemo(() => {
    const PLOT_X0 = PAD_X;
    const PLOT_X1 = W - PAD_X;
    const PLOT_Y0 = ELEV_BAND_Y;
    const PLOT_Y1 = ELEV_BAND_Y + ELEV_BAND_H;
    const innerW  = PLOT_X1 - PLOT_X0;
    const innerH  = PLOT_Y1 - PLOT_Y0;

    let series = [];
    if (Array.isArray(records) && records.length > 0) {
      // Use one out of every Nth sample so the polygon is light to render
      const step = Math.max(1, Math.floor(records.length / 280));
      for (let i = 0; i < records.length; i += step) {
        const alt = Number(records[i]?.altitude ?? records[i]?.elevation ?? NaN);
        const ts  = Number(records[i]?.timestamp ? new Date(records[i].timestamp).getTime() : i);
        if (Number.isFinite(alt)) series.push({ x: ts, y: alt });
      }
    }
    if (series.length < 2 && Array.isArray(laps) && laps.length > 0) {
      // Fallback — cumulative elevation per lap as a step function
      let cumGain = 0, cumSec = 0;
      series = [{ x: 0, y: 0 }];
      for (const lap of laps) {
        cumSec  += lapDurSec(lap);
        cumGain += lapElevGain(lap);
        series.push({ x: cumSec, y: cumGain });
      }
    }
    if (series.length < 2) return null;

    const xs = series.map(p => p.x);
    const ys = series.map(p => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const dx = (maxX - minX) || 1;
    const dy = (maxY - minY) || 1;
    const points = series.map(p => {
      const px = PLOT_X0 + ((p.x - minX) / dx) * innerW;
      const py = PLOT_Y1 - ((p.y - minY) / dy) * innerH;
      return [px, py];
    });
    const top = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
    return `${top} L ${PLOT_X1.toFixed(1)} ${PLOT_Y1.toFixed(1)} L ${PLOT_X0.toFixed(1)} ${PLOT_Y1.toFixed(1)} Z`;
  }, [records, laps]);

  // ── Lap bars ────────────────────────────────────────────────────────────────
  const lapGeom = useMemo(() => {
    if (!Array.isArray(laps) || laps.length === 0) return [];
    const PLOT_X0 = PAD_X;
    const PLOT_Y1 = ELEV_BAND_Y + ELEV_BAND_H;
    const innerW  = W - PAD_X * 2;

    const totalSec = laps.reduce((s, l) => s + lapDurSec(l), 0) || 1;
    const totalCount = laps.length;
    const items = [];
    let x = PLOT_X0;
    let maxIntensity = 0;
    laps.forEach((lap, i) => {
      const durSec = lapDurSec(lap);
      const w = (durSec / totalSec) * innerW;
      const work = isWorkLap(lap, i, totalCount);
      const intensity = work ? (lapAvgPower(lap) || lapAvgHr(lap) || lapDistM(lap) / Math.max(1, durSec)) : 0;
      if (intensity > maxIntensity) maxIntensity = intensity;
      items.push({ lap, i, x, w, durSec, work, intensity, lactate: lapLactate(lap) });
      x += w;
    });
    // Map intensity → bar height (40–460 px), warm/cool → low band
    items.forEach(it => {
      const norm = it.work && maxIntensity > 0 ? Math.min(1, it.intensity / maxIntensity) : 0.18;
      it.h = 40 + norm * 420;
      it.y = PLOT_Y1 - it.h;
    });
    return items;
  }, [laps]);

  const distance = Number(activity.distance || 0);
  const dur      = Number(activity.movingTime || activity.moving_time || activity.duration || activity.elapsed_time || 0);
  const elev     = Number(activity.totalElevationGain ?? activity.total_elevation_gain ?? activity.elevationGain ?? 0);
  const title    = String(activity.titleManual || activity.title || activity.name || '').slice(0, 32);
  const sportKey = pickSport(activity.sport);
  // The bar height label depends on what we used as the intensity metric
  const intensityLabel = lapGeom.some(g => lapAvgPower(g.lap) > 0) ? 'Power'
                       : lapGeom.some(g => lapAvgHr(g.lap) > 0) ? 'HR' : 'Pace';

  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ display: 'block' }}>
      <defs>
        <radialGradient id="leVignette" cx="50%" cy="55%" r="75%">
          <stop offset="0%" stopColor="rgba(0,0,0,0.0)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0.55)" />
        </radialGradient>
        <linearGradient id="elevFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={accent} stopOpacity="0.32" />
          <stop offset="100%" stopColor={accent} stopOpacity="0.08" />
        </linearGradient>
        <linearGradient id="barWork" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={accent} stopOpacity="1" />
          <stop offset="100%" stopColor={accent} stopOpacity="0.7" />
        </linearGradient>
      </defs>
      <rect width={W} height={H} fill="url(#leVignette)" />

      {/* Sport icon (rounded badge) + wordmark + title */}
      <g transform={`translate(${W / 2 - 55}, ${TITLE_BAND_Y - 110})`}>
        <rect x="0" y="0" width="110" height="110" rx="28"
          fill="rgba(255,255,255,.12)" stroke={accent} strokeWidth="3" />
        <g transform="translate(15, 15) scale(3.33)" stroke="#fff" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <path d={SPORT_ICONS[sportKey]} />
        </g>
      </g>
      <text x={W / 2} y={TITLE_BAND_Y + 50} textAnchor="middle"
        style={{ fontFamily: '-apple-system, "SF Pro Display", system-ui, sans-serif', fontSize: 80, fontWeight: 800, fill: '#fff', letterSpacing: '-0.01em' }}>
        LaChart
      </text>
      <rect x={W / 2 - 50} y={TITLE_BAND_Y + 86} width="100" height="5" rx="2.5" fill={accent} />
      {title && (
        <text x={W / 2} y={TITLE_BAND_Y + 170} textAnchor="middle"
          style={{ fontFamily: '-apple-system, "SF Pro Display", system-ui, sans-serif', fontSize: 44, fontWeight: 700, fill: 'rgba(255,255,255,.88)' }}>
          {title}
        </text>
      )}

      {/* Y-axis labels — left side: intensity (Power/HR/Pace) for the bars,
          right side: Elevation for the back layer. Two-axis chart needs both
          to be labelled or readers don't know what they're seeing. */}
      <g style={{ fontFamily: '-apple-system, "SF Pro Display", system-ui, sans-serif' }}>
        <text x={PAD_X} y={ELEV_BAND_Y - 18}
          style={{ fontSize: 24, fontWeight: 800, fill: accent, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          {intensityLabel}
        </text>
        <text x={W - PAD_X} y={ELEV_BAND_Y - 18} textAnchor="end"
          style={{ fontSize: 24, fontWeight: 800, fill: 'rgba(255,255,255,.55)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          Elevation
        </text>
      </g>

      {/* Baseline */}
      <line x1={PAD_X} y1={ELEV_BAND_Y + ELEV_BAND_H} x2={W - PAD_X} y2={ELEV_BAND_Y + ELEV_BAND_H}
        stroke="rgba(255,255,255,.25)" strokeWidth="2" />

      {/* Elevation profile (back layer) */}
      {elevPath && (
        <path d={elevPath} fill="url(#elevFill)" stroke="rgba(255,255,255,.4)" strokeWidth="2" />
      )}

      {/* Lap bars (middle layer) */}
      {lapGeom.map(it => (
        <rect key={it.i}
          x={it.x + 2} y={it.y} width={Math.max(2, it.w - 4)} height={it.h}
          rx="6"
          fill={it.work ? 'url(#barWork)' : 'rgba(255,255,255,.18)'}
          stroke={it.work ? accent : 'rgba(255,255,255,.3)'}
          strokeWidth={it.work ? 0 : 1.5}
        />
      ))}

      {/* Lactate dots (front layer) — only on work laps that have a value */}
      {lapGeom.filter(it => it.lactate != null).map(it => {
        const cx = it.x + it.w / 2;
        const cy = it.y - 50;
        return (
          <g key={`lac-${it.i}`}>
            <line x1={cx} y1={cy + 24} x2={cx} y2={it.y} stroke="#fff" strokeWidth="2" strokeDasharray="4 4" opacity="0.7" />
            <circle cx={cx} cy={cy} r="34" fill="#7C3AED" stroke="#fff" strokeWidth="4" />
            <text x={cx} y={cy + 12} textAnchor="middle"
              style={{ fontFamily: '-apple-system, "SF Pro Display", system-ui, sans-serif', fontSize: 30, fontWeight: 800, fill: '#fff' }}>
              {Number(it.lactate).toFixed(1)}
            </text>
          </g>
        );
      })}

      {/* Stat strip — distributed evenly across the canvas so wide values
          (e.g. "3 h 50 min" / "1,430 m") don't bump into the next column. */}
      <g transform={`translate(0, ${STATS_BAND_Y})`}>
        {[
          { label: 'Distance',  value: fmtDist(distance) },
          { label: 'Time',      value: fmtDur(dur) },
          { label: 'Elevation', value: `${Math.round(elev).toLocaleString('en')} m` },
        ].map(({ label, value }, i) => {
          // 3 evenly-spaced columns across (W - 2·PAD_X) width
          const colW = (W - PAD_X * 2) / 3;
          const cx = PAD_X + colW * i + colW / 2;
          return (
            <g key={label} transform={`translate(${cx}, 0)`}>
              <text x="0" y="0" textAnchor="middle"
                style={{ fontFamily: '-apple-system, "SF Pro Display", system-ui, sans-serif', fontSize: 26, fontWeight: 600, fill: 'rgba(255,255,255,.6)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                {label}
              </text>
              <text x="0" y="56" textAnchor="middle"
                style={{ fontFamily: '-apple-system, "SF Pro Display", system-ui, sans-serif', fontSize: 50, fontWeight: 800, fill: '#fff' }}>
                {value}
              </text>
            </g>
          );
        })}
      </g>

      {/* Lactate legend — now on its own line below the stat strip, centred,
          so it can't overlap with the Elevation column on the right. */}
      {lapGeom.some(it => it.lactate != null) && (
        <g transform={`translate(${W / 2}, ${STATS_BAND_Y + 150})`}>
          <circle cx="-110" cy="0" r="18" fill="#7C3AED" stroke="#fff" strokeWidth="3" />
          <text x="-80" y="9" textAnchor="start"
            style={{ fontFamily: '-apple-system, "SF Pro Display", system-ui, sans-serif', fontSize: 26, fontWeight: 700, fill: '#fff' }}>
            mmol/L lactate
          </text>
        </g>
      )}
    </svg>
  );
}
