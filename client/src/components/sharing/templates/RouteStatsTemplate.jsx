/**
 * RouteStatsTemplate — Strava-style route polyline + 3 stat tiles.
 * Pure SVG so it can be serialized → PNG without html-to-image.
 *
 * Props
 *   activity: { distance, totalElevationGain, duration/movingTime, sport }
 *   gpsPoints: array of [lat, lng] tuples (from streams.latlng or FIT records)
 *   accent: hex colour (sport tint)
 */

import React, { useMemo } from 'react';
import ShareSportGlyph from './ShareSportGlyph';

const W = 1080;
const H = 1920;

function fmtDist(meters) {
  if (!meters) return '—';
  return `${(meters / 1000).toFixed(2)} km`;
}
function fmtElev(meters) {
  if (!meters && meters !== 0) return '—';
  return `${Math.round(meters).toLocaleString('en')} m`;
}
function fmtDur(sec) {
  if (!sec) return '—';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h === 0) return `${m} min`;
  return `${h}h ${m}min`;
}
export default function RouteStatsTemplate({
  activity = {},
  gpsPoints = [],
  accent = '#FC4C02', // Strava orange default
  transparent = false,
}) {
  const distance = Number(activity.distance || 0);
  const elev     = Number(activity.totalElevationGain ?? activity.total_elevation_gain ?? activity.elevationGain ?? 0);
  const dur      = Number(activity.movingTime || activity.moving_time || activity.duration || activity.elapsed_time || 0);

  // Project GPS points into a 720×1100 box centred horizontally at the top
  // of the canvas, preserving aspect ratio so the route doesn't squash.
  const routePath = useMemo(() => {
    if (!Array.isArray(gpsPoints) || gpsPoints.length < 2) return null;
    // CRITICAL: downsample. A 4-hour ride from a FIT file ships ~14 000 GPS
    // points; serialised into a single SVG path's `d` attribute that's
    // ~200 kB of text iOS WKWebView has to parse before the sheet can
    // respond to taps. The visual difference between 400 points and 14 000
    // on a 1080-wide route is invisible at IG-story resolution.
    const MAX_POINTS = 400;
    let pts = gpsPoints;
    if (gpsPoints.length > MAX_POINTS) {
      const step = Math.ceil(gpsPoints.length / MAX_POINTS);
      pts = gpsPoints.filter((_, i) => i % step === 0 || i === gpsPoints.length - 1);
    }
    const lats = pts.map(p => p[0]);
    const lngs = pts.map(p => p[1]);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
    const dLat = maxLat - minLat || 1e-6;
    const dLng = maxLng - minLng || 1e-6;
    // Box: 800 wide × 1080 tall, centred at (W/2, 760)
    const boxW = 800, boxH = 1080;
    const boxX = (W - boxW) / 2;
    const boxY = 220;
    const scale = Math.min(boxW / dLng, boxH / dLat);
    const offsetX = boxX + (boxW - dLng * scale) / 2;
    const offsetY = boxY + (boxH - dLat * scale) / 2;
    const project = (lat, lng) => [
      offsetX + (lng - minLng) * scale,
      offsetY + (maxLat - lat) * scale, // flip Y
    ];
    return pts
      .map(p => project(p[0], p[1]))
      .map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`)
      .join(' ');
  }, [gpsPoints]);

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${W} ${H}`}
      width={W} height={H}
      style={{ display: 'block' }}
    >
      {/* Subtle vignette so the route reads against transparent backgrounds */}
      <defs>
        <radialGradient id="rsVignette" cx="50%" cy="55%" r="65%">
          <stop offset="0%" stopColor="rgba(0,0,0,0.0)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0.35)" />
        </radialGradient>
      </defs>
      {!transparent && <rect x="0" y="0" width={W} height={H} fill="url(#rsVignette)" />}

      {/* Route polyline */}
      {routePath && (
        <>
          <path d={routePath} fill="none" stroke="rgba(0,0,0,.45)" strokeWidth="22" strokeLinecap="round" strokeLinejoin="round" />
          <path d={routePath} fill="none" stroke={accent} strokeWidth="14" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}

      {/* Sport icon — centred above the wordmark (clears the LaChart text) */}
      <g transform={`translate(${W / 2 - 50}, 1352) scale(4.2)`}>
        <ShareSportGlyph sport={activity.sport} color="#fff" strokeWidth={2} />
      </g>

      {/* Wordmark */}
      <text x={W / 2} y="1560" textAnchor="middle"
        style={{ fontFamily: '-apple-system, "SF Pro Display", system-ui, sans-serif', fontSize: 88, fontWeight: 800, fill: '#fff', letterSpacing: '-0.01em' }}>
        LaChart
      </text>

      {/* Stat tiles */}
      <g transform="translate(0, 1660)">
        {[
          { label: 'Distance',  value: fmtDist(distance) },
          { label: 'Elevation', value: fmtElev(elev) },
          { label: 'Time',      value: fmtDur(dur) },
        ].map(({ label, value }, i) => {
          const x = 60 + i * 320;
          return (
            <g key={label} transform={`translate(${x}, 0)`}>
              <text x="0" y="0" style={{ fontFamily: '-apple-system, "SF Pro Display", system-ui, sans-serif', fontSize: 28, fontWeight: 600, fill: 'rgba(255,255,255,.65)', letterSpacing: '0.04em' }}>
                {label}
              </text>
              <text x="0" y="60" style={{ fontFamily: '-apple-system, "SF Pro Display", system-ui, sans-serif', fontSize: 56, fontWeight: 800, fill: '#fff' }}>
                {value}
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}
