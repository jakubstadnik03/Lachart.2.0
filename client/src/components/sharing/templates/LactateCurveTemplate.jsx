/**
 * LactateCurveTemplate — share a lactate test as a clean curve with the
 * computed LT1 / LT2 markers. Used from the testing detail flow.
 *
 * Props
 *   test:  { results: [{ power, lactate, heartRate }], sport, date, title }
 *   thresholds: { lt1, lt2 }  (optional — falls back to first ≥2 / ≥4 mmol)
 *   accent
 */

import React, { useMemo } from 'react';

const W = 1080;
const H = 1920;

function fmtPace(secPerKm) {
  if (!secPerKm) return '—';
  return `${Math.floor(secPerKm / 60)}:${String(Math.round(secPerKm % 60)).padStart(2, '0')}`;
}

export default function LactateCurveTemplate({ test = {}, thresholds = null, accent = '#7C3AED' }) {
  const sport   = String(test.sport || '').toLowerCase();
  const isPace  = sport.includes('run') || sport.includes('swim');
  const results = Array.isArray(test.results) ? test.results : [];

  // Build (x, lactate) pairs. x = power (watts) or pace (sec/km)
  const points = useMemo(() => {
    return results
      .map(r => {
        const lac = Number(r?.lactate ?? r?.lactateValue);
        let x = null;
        if (isPace) {
          if (typeof r?.power === 'string') {
            const m = r.power.match(/^(\d+):(\d{2})$/);
            if (m) x = Number(m[1]) * 60 + Number(m[2]);
          } else if (typeof r?.power === 'number') x = Number(r.power);
        } else {
          x = Number(r?.power ?? r?.interval);
        }
        return Number.isFinite(x) && Number.isFinite(lac) ? { x, y: lac } : null;
      })
      .filter(Boolean)
      .sort((a, b) => (isPace ? b.x - a.x : a.x - b.x));
  }, [results, isPace]);

  const lt1 = Number(thresholds?.lt1) || null;
  const lt2 = Number(thresholds?.lt2) || null;

  // Chart geometry
  const CHART_X0 = 90;
  const CHART_X1 = W - 90;
  const CHART_Y0 = 700;
  const CHART_Y1 = 1600;
  const innerW  = CHART_X1 - CHART_X0;
  const innerH  = CHART_Y1 - CHART_Y0;

  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);
  const minX = xs.length ? Math.min(...xs) : 0;
  const maxX = xs.length ? Math.max(...xs) : 1;
  const maxY = ys.length ? Math.max(...ys, 8) : 8;
  const dx = (maxX - minX) || 1;

  const px = (v) => isPace
    ? CHART_X0 + ((maxX - v) / dx) * innerW
    : CHART_X0 + ((v - minX) / dx) * innerW;
  const py = (v) => CHART_Y1 - (v / maxY) * innerH;

  const linePath = points.length >= 2
    ? points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${px(p.x).toFixed(1)} ${py(p.y).toFixed(1)}`).join(' ')
    : null;

  const dateStr = test.date
    ? new Date(test.date).toLocaleDateString('en', { day: 'numeric', month: 'long', year: 'numeric' })
    : '';

  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ display: 'block' }}>
      <defs>
        <radialGradient id="lcVignette" cx="50%" cy="55%" r="70%">
          <stop offset="0%" stopColor="rgba(0,0,0,0.0)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0.55)" />
        </radialGradient>
        <linearGradient id="lcArea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={accent} stopOpacity="0.5" />
          <stop offset="100%" stopColor={accent} stopOpacity="0.05" />
        </linearGradient>
      </defs>
      <rect width={W} height={H} fill="url(#lcVignette)" />

      {/* Wordmark + meta */}
      <text x={W / 2} y="220" textAnchor="middle"
        style={{ fontFamily: '-apple-system, "SF Pro Display", system-ui, sans-serif', fontSize: 84, fontWeight: 800, fill: '#fff', letterSpacing: '-0.01em' }}>
        LaChart
      </text>
      <rect x={W / 2 - 60} y="258" width="120" height="6" rx="3" fill={accent} />
      <text x={W / 2} y="360" textAnchor="middle"
        style={{ fontFamily: '-apple-system, "SF Pro Display", system-ui, sans-serif', fontSize: 48, fontWeight: 700, fill: 'rgba(255,255,255,.92)' }}>
        Lactate test · {sport.charAt(0).toUpperCase() + sport.slice(1)}
      </text>
      {dateStr && (
        <text x={W / 2} y="430" textAnchor="middle"
          style={{ fontFamily: '-apple-system, "SF Pro Display", system-ui, sans-serif', fontSize: 32, fontWeight: 500, fill: 'rgba(255,255,255,.6)' }}>
          {dateStr}
        </text>
      )}

      {/* Y-axis grid (2, 4 mmol reference lines) */}
      {[2, 4].map(v => v <= maxY && (
        <g key={v}>
          <line x1={CHART_X0} y1={py(v)} x2={CHART_X1} y2={py(v)}
            stroke="rgba(255,255,255,.18)" strokeWidth="1.5" strokeDasharray="6 6" />
          <text x={CHART_X0 - 14} y={py(v) + 12} textAnchor="end"
            style={{ fontFamily: '-apple-system, "SF Pro Display", system-ui, sans-serif', fontSize: 28, fontWeight: 700, fill: 'rgba(255,255,255,.5)' }}>
            {v} mmol
          </text>
        </g>
      ))}

      {/* Curve fill */}
      {linePath && (
        <path d={`${linePath} L ${px(points[points.length - 1].x).toFixed(1)} ${CHART_Y1} L ${px(points[0].x).toFixed(1)} ${CHART_Y1} Z`}
          fill="url(#lcArea)" />
      )}

      {/* Curve line */}
      {linePath && (
        <path d={linePath} fill="none" stroke={accent} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      )}

      {/* Data points */}
      {points.map((p, i) => (
        <circle key={i} cx={px(p.x)} cy={py(p.y)} r="12" fill="#fff" stroke={accent} strokeWidth="4" />
      ))}

      {/* LT1 + LT2 markers */}
      {lt1 && (
        <g>
          <line x1={px(lt1)} y1={CHART_Y0 - 20} x2={px(lt1)} y2={CHART_Y1}
            stroke="#22c55e" strokeWidth="3" strokeDasharray="10 6" />
          <text x={px(lt1)} y={CHART_Y0 - 30} textAnchor="middle"
            style={{ fontFamily: '-apple-system, "SF Pro Display", system-ui, sans-serif', fontSize: 30, fontWeight: 800, fill: '#22c55e' }}>
            LT1 {isPace ? fmtPace(lt1) : `${Math.round(lt1)} W`}
          </text>
        </g>
      )}
      {lt2 && (
        <g>
          <line x1={px(lt2)} y1={CHART_Y0 - 20} x2={px(lt2)} y2={CHART_Y1}
            stroke="#ef4444" strokeWidth="3" strokeDasharray="10 6" />
          <text x={px(lt2)} y={CHART_Y0 - 30} textAnchor="middle"
            style={{ fontFamily: '-apple-system, "SF Pro Display", system-ui, sans-serif', fontSize: 30, fontWeight: 800, fill: '#ef4444' }}>
            LT2 {isPace ? fmtPace(lt2) : `${Math.round(lt2)} W`}
          </text>
        </g>
      )}

      {/* X-axis label */}
      <text x={W / 2} y={CHART_Y1 + 60} textAnchor="middle"
        style={{ fontFamily: '-apple-system, "SF Pro Display", system-ui, sans-serif', fontSize: 32, fontWeight: 700, fill: 'rgba(255,255,255,.6)' }}>
        {isPace ? 'Pace' : 'Power (W)'}
      </text>
    </svg>
  );
}
