/**
 * StatsOnlyTemplate — 6-tile grid with avg pace/power, HR, kcal, etc.
 * Pure SVG, transparent background. Good for activities where the route
 * isn't the story (indoor trainer, lap pool swim, treadmill run).
 */

import React from 'react';

const W = 1080;
const H = 1920;

function fmtDist(m) { return m ? `${(m / 1000).toFixed(2)} km` : '—'; }
function fmtElev(m) { return (m || m === 0) ? `${Math.round(m).toLocaleString('en')} m` : '—'; }
function fmtDur(s) {
  if (!s) return '—';
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h === 0 ? `${m} min` : `${h}h ${m}min`;
}
function fmtSpeed(mps) { return mps ? `${(mps * 3.6).toFixed(1)} km/h` : '—'; }
function fmtPace(secPerKm) {
  if (!secPerKm) return '—';
  return `${Math.floor(secPerKm / 60)}:${String(Math.round(secPerKm % 60)).padStart(2, '0')}/km`;
}
function fmtKcal(k) { return k ? `${Math.round(k).toLocaleString('en')} kcal` : '—'; }
function fmtCad(c, isRun) { return c ? `${Math.round(c)} ${isRun ? 'spm' : 'rpm'}` : '—'; }

export default function StatsOnlyTemplate({ activity = {}, accent = '#FC4C02', transparent = false }) {
  const sport = String(activity.sport || '').toLowerCase();
  const isRun = sport.includes('run');
  const isSwim = sport.includes('swim');
  const distance = Number(activity.distance || 0);
  const dur      = Number(activity.movingTime || activity.moving_time || activity.duration || activity.elapsed_time || 0);
  const elev     = Number(activity.totalElevationGain ?? activity.total_elevation_gain ?? activity.elevationGain ?? 0);
  const avgSpeed = Number(activity.averageSpeed || activity.average_speed || activity.avgSpeed || 0);
  const avgPower = Number(activity.averagePower || activity.average_watts || activity.avgPower || 0);
  const avgHr    = Number(activity.averageHeartRate || activity.average_heartrate || activity.avgHeartRate || 0);
  const kcal     = Number(activity.calories || activity.kcal || 0);
  const cadence  = Number(activity.averageCadence || activity.average_cadence || activity.avgCadence || 0);

  // Pick the four most relevant secondary metrics
  const secondaryMetric = isRun
    ? { label: 'Pace', value: avgSpeed > 0 ? fmtPace(1000 / avgSpeed) : '—' }
    : isSwim
    ? { label: 'Pace', value: avgSpeed > 0 ? `${Math.floor(100 / avgSpeed / 60)}:${String(Math.round(100 / avgSpeed % 60)).padStart(2, '0')}/100m` : '—' }
    : { label: 'Speed', value: fmtSpeed(avgSpeed) };

  const tiles = [
    { label: 'Distance',  value: fmtDist(distance) },
    { label: 'Time',      value: fmtDur(dur) },
    { label: 'Elevation', value: fmtElev(elev) },
    secondaryMetric,
    avgPower > 0
      ? { label: 'Avg power', value: `${Math.round(avgPower)} W` }
      : { label: 'Calories',  value: fmtKcal(kcal) },
    avgHr > 0
      ? { label: 'Avg HR',    value: `${Math.round(avgHr)} bpm` }
      : { label: 'Cadence',   value: fmtCad(cadence, isRun) },
  ];

  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ display: 'block' }}>
      <defs>
        <radialGradient id="soVignette" cx="50%" cy="50%" r="70%">
          <stop offset="0%" stopColor="rgba(0,0,0,0.0)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0.55)" />
        </radialGradient>
      </defs>
      {!transparent && <rect width={W} height={H} fill="url(#soVignette)" />}

      {/* Wordmark — anchor to top so the grid feels grounded */}
      <text x={W / 2} y="220" textAnchor="middle"
        style={{ fontFamily: '-apple-system, "SF Pro Display", system-ui, sans-serif', fontSize: 96, fontWeight: 800, fill: '#fff', letterSpacing: '-0.01em' }}>
        LaChart
      </text>
      <rect x={W / 2 - 60} y="270" width="120" height="6" rx="3" fill={accent} />

      {/* Activity title (if present) */}
      {(activity.titleManual || activity.title || activity.name) && (
        <text x={W / 2} y="370" textAnchor="middle"
          style={{ fontFamily: '-apple-system, "SF Pro Display", system-ui, sans-serif', fontSize: 44, fontWeight: 700, fill: 'rgba(255,255,255,.85)' }}>
          {String(activity.titleManual || activity.title || activity.name).slice(0, 28)}
        </text>
      )}

      {/* Tile grid — 2 cols × 3 rows */}
      <g transform="translate(80, 600)">
        {tiles.map((t, i) => {
          const col = i % 2, row = Math.floor(i / 2);
          const x = col * 470;
          const y = row * 350;
          return (
            <g key={i} transform={`translate(${x}, ${y})`}>
              <rect x="0" y="0" width="440" height="300" rx="28"
                fill="rgba(255,255,255,.06)" stroke="rgba(255,255,255,.18)" strokeWidth="2" />
              <text x="32" y="68" style={{ fontFamily: '-apple-system, "SF Pro Display", system-ui, sans-serif', fontSize: 30, fontWeight: 600, fill: 'rgba(255,255,255,.55)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                {t.label}
              </text>
              <text x="32" y="200" style={{ fontFamily: '-apple-system, "SF Pro Display", system-ui, sans-serif', fontSize: 72, fontWeight: 800, fill: '#fff' }}>
                {t.value}
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}
