/**
 * SummaryShareTemplate — a daily or weekly training summary card, sized for an
 * Instagram story (1080 × 1920). Pure SVG so it captures cleanly to PNG via the
 * shared canvas pipeline, and honours the `transparent` toggle (skips its own
 * background) so it can be dropped onto a story background.
 *
 * summary = {
 *   title:     'Today' | 'This week' | …
 *   subtitle:  'Mon 16 Jun' | 'Jun 15 – 21'
 *   sport?:    string  (icon for the header badge)
 *   kpis?:     { fitness, form, fatigue }    // optional CTL / TSB / ATL
 *   totals:    { count, secs, distM, tss }   // any subset
 *   workouts?: [{ title, sport, subtitle, done }]   // up to 5 shown
 * }
 */
import React from 'react';
import ShareSportGlyph from './ShareSportGlyph';

const W = 1080;
const H = 1920;
const FONT = '-apple-system, "SF Pro Display", system-ui, sans-serif';

function fmtDur(s) {
  s = Number(s) || 0;
  const totalMin = Math.round(s / 60);
  const h = Math.floor(totalMin / 60), m = totalMin % 60;
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  return `${m}m`;
}
function fmtDist(m) {
  m = Number(m) || 0;
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : m > 0 ? `${Math.round(m)} m` : '—';
}

export default function SummaryShareTemplate({ summary = {}, accent = '#5E6590', transparent = false }) {
  const { title = 'Summary', subtitle = '', sport, kpis = null, totals = {}, workouts = [] } = summary;
  const shown = (Array.isArray(workouts) ? workouts : []).slice(0, 5);
  const moreCount = (workouts?.length || 0) - shown.length;

  // Stat tiles — only the ones that have a value.
  const stats = [
    Number(totals.count) > 0 ? { label: 'Activities', value: String(totals.count) } : null,
    Number(totals.secs) > 0 ? { label: 'Time', value: fmtDur(totals.secs) } : null,
    Number(totals.distM) > 0 ? { label: 'Distance', value: fmtDist(totals.distM) } : null,
    Number(totals.tss) > 0 ? { label: 'TSS', value: String(Math.round(totals.tss)) } : null,
  ].filter(Boolean);

  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ display: 'block' }}>
      <defs>
        <radialGradient id="ssVignette" cx="50%" cy="42%" r="75%">
          <stop offset="0%" stopColor="rgba(0,0,0,0.0)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0.35)" />
        </radialGradient>
      </defs>
      {!transparent && <rect x="0" y="0" width={W} height={H} fill="url(#ssVignette)" />}

      {/* Header: logo badge + wordmark */}
      <g transform={`translate(${W / 2 - 46}, 150)`}>
        <rect x="0" y="0" width="92" height="92" rx="24" fill="rgba(255,255,255,.12)" stroke={accent} strokeWidth="3" />
        <g transform="translate(14, 14) scale(2.67)">
          <ShareSportGlyph sport={sport} color="#fff" strokeWidth={2} />
        </g>
      </g>
      <text x={W / 2} y="320" textAnchor="middle" style={{ fontFamily: FONT, fontSize: 72, fontWeight: 800, fill: '#fff', letterSpacing: '-0.01em' }}>LaChart</text>

      {/* Period title + subtitle */}
      <text x={W / 2} y="470" textAnchor="middle" style={{ fontFamily: FONT, fontSize: 88, fontWeight: 800, fill: '#fff' }}>{title}</text>
      {subtitle && (
        <text x={W / 2} y="540" textAnchor="middle" style={{ fontFamily: FONT, fontSize: 40, fontWeight: 600, fill: 'rgba(255,255,255,.62)' }}>{subtitle}</text>
      )}

      {/* KPI row (Fitness / Form / Fatigue) */}
      {kpis && (kpis.fitness != null || kpis.form != null || kpis.fatigue != null) && (
        <g transform="translate(0, 680)">
          {[
            { label: 'FITNESS', value: kpis.fitness, color: '#5E6590' },
            { label: 'FORM', value: kpis.form, color: (Number(kpis.form) >= 0 ? '#10b981' : '#ef4444') },
            { label: 'FATIGUE', value: kpis.fatigue, color: '#ef4444' },
          ].map((k, i) => (
            <g key={k.label} transform={`translate(${180 + i * 270}, 0)`}>
              <text x="0" y="0" textAnchor="middle" style={{ fontFamily: FONT, fontSize: 96, fontWeight: 800, fill: '#fff' }}>
                {k.value == null ? '—' : (k.label === 'FORM' && Number(k.value) > 0 ? `+${Math.round(k.value)}` : String(Math.round(k.value)))}
              </text>
              <text x="0" y="54" textAnchor="middle" style={{ fontFamily: FONT, fontSize: 30, fontWeight: 700, fill: k.color, letterSpacing: '1.5px' }}>{k.label}</text>
            </g>
          ))}
        </g>
      )}

      {/* Totals row */}
      {stats.length > 0 && (
        <g transform={`translate(0, ${kpis ? 880 : 760})`}>
          {stats.map((s, i) => {
            const n = stats.length;
            const x = (W / (n + 1)) * (i + 1);
            return (
              <g key={s.label} transform={`translate(${x}, 0)`}>
                <text x="0" y="0" textAnchor="middle" style={{ fontFamily: FONT, fontSize: 26, fontWeight: 700, fill: 'rgba(255,255,255,.55)', letterSpacing: '1.2px' }}>{s.label.toUpperCase()}</text>
                <text x="0" y="64" textAnchor="middle" style={{ fontFamily: FONT, fontSize: 56, fontWeight: 800, fill: '#fff' }}>{s.value}</text>
              </g>
            );
          })}
        </g>
      )}

      {/* Workout list */}
      {shown.length > 0 && (
        <g transform={`translate(90, ${(kpis ? 880 : 760) + (stats.length > 0 ? 160 : 0)})`}>
          {shown.map((w, i) => {
            const y = i * 132;
            return (
              <g key={i} transform={`translate(0, ${y})`}>
                <rect x="0" y="0" width={W - 180} height="112" rx="24" fill="rgba(255,255,255,.08)" />
                <g transform="translate(30, 30) scale(2.16)">
                  <ShareSportGlyph sport={w.sport} color="#fff" strokeWidth={2} />
                </g>
                <text x="110" y="50" style={{ fontFamily: FONT, fontSize: 40, fontWeight: 700, fill: '#fff' }}>{(w.title || 'Activity').slice(0, 26)}</text>
                {w.subtitle && (
                  <text x="110" y="92" style={{ fontFamily: FONT, fontSize: 30, fontWeight: 500, fill: 'rgba(255,255,255,.6)' }}>{String(w.subtitle).slice(0, 34)}</text>
                )}
                {w.done && (
                  <circle cx={W - 230} cy="56" r="26" fill="#10b981" />
                )}
                {w.done && (
                  <path d={`M ${W - 244} 56 l 10 10 l 18 -20`} fill="none" stroke="#fff" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
                )}
              </g>
            );
          })}
          {moreCount > 0 && (
            <text x={(W - 180) / 2} y={shown.length * 132 + 50} textAnchor="middle" style={{ fontFamily: FONT, fontSize: 34, fontWeight: 700, fill: 'rgba(255,255,255,.55)' }}>+{moreCount} more</text>
          )}
        </g>
      )}

      {/* Footer wordmark line */}
      <rect x={W / 2 - 60} y={H - 110} width="120" height="6" rx="3" fill={accent} />
      <text x={W / 2} y={H - 60} textAnchor="middle" style={{ fontFamily: FONT, fontSize: 28, fontWeight: 600, fill: 'rgba(255,255,255,.5)', letterSpacing: '0.5px' }}>lachart.net</text>
    </svg>
  );
}
