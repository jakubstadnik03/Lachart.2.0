/**
 * RouteStatsTemplate — route polyline + 3 stat tiles.
 * Same navy gradient / brand chrome as StatsOnlyTemplate.
 */

import React, { useMemo } from 'react';
import ShareSportGlyph from './ShareSportGlyph';
import {
  ACT_W as W,
  ACT_H as H,
  ACT_FONT,
  ActivityShareBackground,
} from './activityShareChrome';
import { buildRoutePath as routePathFromGps } from '../shareRoutePath';

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
  accent = '#FC4C02',
  transparent = false,
  theme = 'dark',
}) {
  const distance = Number(activity.distance || 0);
  const elev = Number(activity.totalElevationGain ?? activity.total_elevation_gain ?? activity.elevationGain ?? 0);
  const dur = Number(activity.movingTime || activity.moving_time || activity.duration || activity.elapsed_time || 0);
  const isLight = theme === 'light';
  const valueFill = isLight ? '#0F172A' : '#FFFFFF';
  const labelFill = isLight ? 'rgba(15,23,42,0.55)' : 'rgba(255,255,255,0.65)';

  const routePath = useMemo(() => routePathFromGps(gpsPoints, {
    boxX: (W - 800) / 2,
    boxY: 280,
    boxW: 800,
    boxH: 980,
  }), [gpsPoints]);

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      style={{ display: 'block' }}
    >
      <ActivityShareBackground transparent={transparent} theme={theme} />

      {routePath && (
        <>
          <path d={routePath} fill="none" stroke="rgba(0,0,0,.45)" strokeWidth="22" strokeLinecap="round" strokeLinejoin="round" />
          <path d={routePath} fill="none" stroke={accent} strokeWidth="14" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}

      <g transform={`translate(${W / 2 - 50}, 1352) scale(4.2)`}>
        <ShareSportGlyph sport={activity.sport} color={valueFill} strokeWidth={2} />
      </g>

      <text
        x={W / 2}
        y="1560"
        textAnchor="middle"
        style={{ fontFamily: ACT_FONT, fontSize: 88, fontWeight: 800, fill: valueFill, letterSpacing: '-0.01em' }}
      >
        LaChart
      </text>

      <g transform="translate(0, 1660)">
        {[
          { label: 'Distance', value: fmtDist(distance) },
          { label: 'Elevation', value: fmtElev(elev) },
          { label: 'Time', value: fmtDur(dur) },
        ].map(({ label, value }, i) => {
          const x = 60 + i * 320;
          return (
            <g key={label} transform={`translate(${x}, 0)`}>
              <text x="0" y="0" style={{ fontFamily: ACT_FONT, fontSize: 28, fontWeight: 600, fill: labelFill, letterSpacing: '0.04em' }}>
                {label}
              </text>
              <text x="0" y="60" style={{ fontFamily: ACT_FONT, fontSize: 56, fontWeight: 800, fill: valueFill }}>
                {value}
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}
