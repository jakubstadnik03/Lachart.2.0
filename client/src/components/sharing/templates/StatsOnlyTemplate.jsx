/**
 * StatsOnlyTemplate — 6-tile grid with avg pace/power, HR, kcal, etc.
 * Pure SVG. Navy gradient + glass tiles (activity share style).
 */

import React from 'react';
import {
  ACT_W,
  ACT_H,
  ActivityShareBackground,
  ActivityShareHeader,
  ActivityStatTile,
} from './activityShareChrome';

function fmtDist(m) { return m ? `${(m / 1000).toFixed(2)} km` : '—'; }
function fmtElev(m) { return (m || m === 0) ? `${Math.round(m).toLocaleString('en')} m` : '—'; }
function fmtDur(s) {
  if (!s) return '—';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h === 0 ? `${m} min` : `${h}h ${m}min`;
}
function fmtSpeed(mps) { return mps ? `${(mps * 3.6).toFixed(1)} km/h` : '—'; }
function fmtPace(secPerKm) {
  if (!secPerKm) return '—';
  return `${Math.floor(secPerKm / 60)}:${String(Math.round(secPerKm % 60)).padStart(2, '0')}/km`;
}
function fmtSwimPace(mps) {
  if (!mps) return '—';
  const sec = 100 / mps;
  return `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}/100m`;
}
function fmtKcal(k) { return k ? `${Math.round(k).toLocaleString('en')} kcal` : '—'; }
function fmtCad(c, isRun) { return c ? `${Math.round(c)} ${isRun ? 'spm' : 'rpm'}` : '—'; }

export default function StatsOnlyTemplate({
  activity = {},
  accent = '#FC4C02',
  transparent = false,
  theme = 'dark',
}) {
  const sport = String(activity.sport || '').toLowerCase();
  const isRun = sport.includes('run');
  const isSwim = sport.includes('swim');
  const distance = Number(activity.distance || 0);
  const dur = Number(activity.movingTime || activity.moving_time || activity.duration || activity.elapsed_time || 0);
  const elev = Number(activity.totalElevationGain ?? activity.total_elevation_gain ?? activity.elevationGain ?? 0);
  const avgSpeed = Number(activity.averageSpeed || activity.average_speed || activity.avgSpeed || 0);
  const avgPower = Number(activity.averagePower || activity.average_watts || activity.avgPower || 0);
  const avgHr = Number(activity.averageHeartRate || activity.average_heartrate || activity.avgHeartRate || 0);
  const kcal = Number(activity.calories || activity.kcal || 0);
  const cadence = Number(activity.averageCadence || activity.average_cadence || activity.avgCadence || 0);

  const secondaryMetric = isRun
    ? { label: 'Pace', value: avgSpeed > 0 ? fmtPace(1000 / avgSpeed) : '—' }
    : isSwim
      ? { label: 'Pace', value: fmtSwimPace(avgSpeed) }
      : { label: 'Speed', value: fmtSpeed(avgSpeed) };

  const tiles = [
    { label: 'Distance', value: fmtDist(distance) },
    { label: 'Time', value: fmtDur(dur) },
    { label: 'Elevation', value: fmtElev(elev) },
    secondaryMetric,
    avgPower > 0
      ? { label: 'Avg power', value: `${Math.round(avgPower)} W` }
      : { label: 'Calories', value: fmtKcal(kcal) },
    avgHr > 0
      ? { label: 'Avg HR', value: `${Math.round(avgHr)} bpm` }
      : { label: 'Cadence', value: fmtCad(cadence, isRun) },
  ];

  const title = activity.titleManual || activity.title || activity.name;

  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${ACT_W} ${ACT_H}`} width={ACT_W} height={ACT_H} style={{ display: 'block' }}>
      <ActivityShareBackground transparent={transparent} theme={theme} />
      <ActivityShareHeader accent={accent} title={title} theme={theme} />

      <g transform="translate(80, 600)">
        {tiles.map((t, i) => {
          const col = i % 2;
          const row = Math.floor(i / 2);
          return (
            <ActivityStatTile
              key={t.label}
              x={col * 470}
              y={row * 350}
              label={t.label}
              value={t.value}
              theme={theme}
            />
          );
        })}
      </g>
    </svg>
  );
}
