/**
 * Laps share card — mirrors LapsBarChart (in-app laps tab): Y-axis, coloured
 * duration/distance-proportional bars, lactate caps. No elevation overlay.
 */

import React, { useMemo } from 'react';
import {
  ACT_W as W,
  ACT_H as H,
  ActivityShareBackground,
  ActivityShareHeader,
} from './activityShareChrome';
import {
  buildLapShareEntries,
  lapShareScales,
  lapShareBarColor,
  formatLapMetricY,
  lapMetricTitle,
  resolveLapSport,
} from '../lapsShareModel';

const PAD_X = 60;
const CHART_Y = 500;
const CHART_H = 720;
const Y_AXIS_W = 88;
const STATS_BAND_Y = 1380;
const FONT = '-apple-system, "SF Pro Display", system-ui, sans-serif';

const SWIM_BAR_W = 34;
const SWIM_GAP = 4;
const BIKE_GAP = 3;

function fmtDist(m) { return m ? `${(m / 1000).toFixed(2)} km` : '—'; }
function fmtDur(s) {
  if (!s) return '—';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h === 0 ? `${m} min` : `${h}h ${m}min`;
}
function fmtSwimPace(mps) {
  if (!mps) return '—';
  const sec = 100 / mps;
  return `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}/100m`;
}
function fmtRunPace(mps) {
  if (!mps) return '—';
  const secPerKm = 1000 / mps;
  return `${Math.floor(secPerKm / 60)}:${String(Math.round(secPerKm % 60)).padStart(2, '0')}/km`;
}
function lapAvgPower(lap) {
  return Number(lap?.average_watts ?? lap?.avgPower ?? lap?.average_power ?? 0);
}

export default function LapsElevationLactateTemplate({
  activity = {},
  laps = [],
  accent = '#FC4C02',
  transparent = false,
  theme = 'dark',
}) {
  const { isSwim, isBike, isRun } = resolveLapSport(activity.sport);
  const isLight = theme === 'light';
  const mutedFill = isLight ? 'rgba(15,23,42,0.45)' : 'rgba(255,255,255,0.55)';
  const tickFill = isLight ? 'rgba(15,23,42,0.38)' : 'rgba(255,255,255,0.40)';
  const baselineStroke = isLight ? 'rgba(15,23,42,0.15)' : 'rgba(255,255,255,0.22)';
  const statLabelFill = isLight ? 'rgba(15,23,42,0.55)' : 'rgba(255,255,255,0.6)';
  const statValueFill = isLight ? '#0F172A' : '#fff';

  const entries = useMemo(
    () => buildLapShareEntries(laps, activity.sport),
    [laps, activity.sport],
  );
  const { active, chartFloor, maxVal, intensityMap, yTicks } = useMemo(
    () => lapShareScales(entries),
    [entries],
  );

  const chartGeom = useMemo(() => {
    const plotX0 = PAD_X + Y_AXIS_W;
    const plotX1 = W - PAD_X;
    const plotW = plotX1 - plotX0;
    const baseline = CHART_Y + CHART_H;
    const bars = [];

    if (isSwim) {
      const totalW = entries.length * SWIM_BAR_W + Math.max(0, entries.length - 1) * SWIM_GAP;
      let x = plotX0 + Math.max(0, (plotW - totalW) / 2);
      entries.forEach((entry) => {
        const w = entry.isPause ? 8 : SWIM_BAR_W;
        if (entry.isPause) {
          bars.push({ entry, x, w, h: 6, y: baseline - 6, color: '#64748b' });
          x += w + SWIM_GAP;
          return;
        }
        const range = maxVal - chartFloor;
        const frac = range > 0 ? Math.max((entry.value - chartFloor) / range, 0.05) : 0.5;
        const h = Math.round(frac * (CHART_H - 8));
        const color = lapShareBarColor(entry, { isSwim, intensityMap });
        bars.push({ entry, x, w, h, y: baseline - h, color });
        x += SWIM_BAR_W + SWIM_GAP;
      });
    } else {
      const totalDur = entries.reduce((s, e) => s + e.duration, 0) || 1;
      let x = plotX0;
      entries.forEach((entry) => {
        const w = Math.max(4, (entry.duration / totalDur) * plotW - BIKE_GAP);
        if (entry.isPause) {
          bars.push({ entry, x, w: 6, h: 4, y: baseline - 4, color: '#64748b' });
          x += 6 + BIKE_GAP;
          return;
        }
        const range = maxVal - chartFloor;
        const frac = range > 0 ? Math.max((entry.value - chartFloor) / range, 0.08) : 0.5;
        const h = Math.round(frac * CHART_H);
        const color = lapShareBarColor(entry, { isSwim, intensityMap });
        bars.push({ entry, x, w, h, y: baseline - h, color });
        x += w + BIKE_GAP;
      });
    }
    return { bars, baseline, plotX0, plotX1 };
  }, [entries, isSwim, maxVal, chartFloor, intensityMap]);

  const distance = Number(activity.distance || 0);
  const dur = Number(activity.movingTime || activity.moving_time || activity.duration || activity.elapsed_time || 0);
  const elev = Number(activity.totalElevationGain ?? activity.total_elevation_gain ?? activity.elevationGain ?? 0);
  const avgSpeed = Number(activity.averageSpeed || activity.average_speed || activity.avgSpeed || 0);
  const title = activity.titleManual || activity.title || activity.name || '';

  const primaryMetric = active[0]?.metric || 'power';
  const chartTitle = `LAPS · ${lapMetricTitle(primaryMetric)}`;

  const thirdStat = isSwim
    ? { label: 'Pace', value: fmtSwimPace(avgSpeed || (distance / Math.max(1, dur))) }
    : isRun
      ? { label: 'Pace', value: fmtRunPace(avgSpeed || (distance / Math.max(1, dur))) }
      : isBike && elev > 0
        ? { label: 'Elevation', value: `${Math.round(elev).toLocaleString('en')} m` }
        : isBike && laps?.length
          ? { label: 'Avg power', value: `${Math.round(laps.reduce((s, l) => s + lapAvgPower(l), 0) / laps.length)} W` }
          : { label: 'Pace', value: fmtRunPace(avgSpeed || (distance / Math.max(1, dur))) };

  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ display: 'block' }}>
      <ActivityShareBackground transparent={transparent} theme={theme} />
      <ActivityShareHeader accent={accent} title={title} theme={theme} />

      {/* Chart title — same as laps tab */}
      <text
        x={PAD_X}
        y={CHART_Y - 36}
        style={{ fontFamily: FONT, fontSize: 22, fontWeight: 800, fill: mutedFill, letterSpacing: '0.14em' }}
      >
        {chartTitle}
      </text>

      {/* Y-axis ticks */}
      {yTicks.map((val, i) => {
        const y = CHART_Y + (i / 4) * CHART_H;
        return (
          <text
            key={i}
            x={PAD_X + Y_AXIS_W - 12}
            y={y + 6}
            textAnchor="end"
            style={{ fontFamily: FONT, fontSize: 22, fontWeight: 600, fill: tickFill }}
          >
            {formatLapMetricY(val, primaryMetric)}
            {primaryMetric === 'power' && val > 0 ? 'W' : ''}
          </text>
        );
      })}

      {/* Baseline */}
      <line
        x1={chartGeom.plotX0}
        y1={chartGeom.baseline}
        x2={chartGeom.plotX1}
        y2={chartGeom.baseline}
        stroke={baselineStroke}
        strokeWidth="2"
      />

      {/* Lap bars — colours + proportions match LapsBarChart */}
      {chartGeom.bars.map((b) => (
        <g key={b.entry.lapNumber}>
          <rect
            x={b.x}
            y={b.y}
            width={b.w}
            height={b.h}
            rx="8"
            fill={b.color}
            opacity={b.entry.isPause ? 0.5 : 0.92}
          />
          {b.entry.lactate != null && (
            <>
              <rect x={b.x} y={b.y} width={b.w} height={8} rx="8" fill="#7c3aed" />
              <text
                x={b.x + b.w / 2}
                y={b.y - 10}
                textAnchor="middle"
                style={{ fontFamily: FONT, fontSize: 22, fontWeight: 800, fill: '#c4b5fd' }}
              >
                {b.entry.lactate.toFixed(1)}
              </text>
            </>
          )}
        </g>
      ))}

      {/* Bottom stats */}
      <g transform={`translate(0, ${STATS_BAND_Y})`}>
        {[
          { label: 'Distance', value: fmtDist(distance) },
          { label: 'Time', value: fmtDur(dur) },
          thirdStat,
        ].map(({ label, value }, i) => {
          const colW = (W - PAD_X * 2) / 3;
          const cx = PAD_X + colW * i + colW / 2;
          return (
            <g key={label} transform={`translate(${cx}, 0)`}>
              <text
                x="0"
                y="0"
                textAnchor="middle"
                style={{ fontFamily: FONT, fontSize: 26, fontWeight: 600, fill: statLabelFill, letterSpacing: '0.06em' }}
              >
                {label.toUpperCase()}
              </text>
              <text
                x="0"
                y="56"
                textAnchor="middle"
                style={{ fontFamily: FONT, fontSize: 50, fontWeight: 800, fill: statValueFill }}
              >
                {value}
              </text>
            </g>
          );
        })}
      </g>

      {entries.some((e) => e.lactate != null) && (
        <g transform={`translate(${W / 2}, ${STATS_BAND_Y + 140})`}>
          <circle cx="-110" cy="0" r="16" fill="#7c3aed" stroke="#fff" strokeWidth="3" />
          <text
            x="-80"
            y="8"
            textAnchor="start"
            style={{ fontFamily: FONT, fontSize: 24, fontWeight: 700, fill: isLight ? '#5b21b6' : '#e9d5ff' }}
          >
            mmol/L lactate
          </text>
        </g>
      )}
    </svg>
  );
}
