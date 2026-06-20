/**
 * Shared chrome for single-activity share cards (Stats, Route, Laps…).
 * Matches the navy → black gradient, logo, accent bar, and glass stat tiles.
 */
import React from 'react';
import ShareBrandLogo from './ShareBrandLogo';

export const ACT_W = 1080;
export const ACT_H = 1920;
export const ACT_FONT = '-apple-system, "SF Pro Display", system-ui, sans-serif';

export const ACTIVITY_BG = {
  dark: { top: '#1E2A45', bottom: '#0A0E1A', glow: 'rgba(118,126,181,0.18)' },
  light: { top: '#E8ECF5', bottom: '#F4F6FB', glow: 'rgba(94,101,144,0.12)' },
};

export function activityCanvasColor(theme = 'dark') {
  return ACTIVITY_BG[theme]?.bottom || ACTIVITY_BG.dark.bottom;
}

export function ActivityShareBackground({ transparent, theme = 'dark' }) {
  if (transparent) return null;
  const bg = ACTIVITY_BG[theme] || ACTIVITY_BG.dark;
  return (
    <>
      <defs>
        <linearGradient id="asBg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={bg.top} />
          <stop offset="100%" stopColor={bg.bottom} />
        </linearGradient>
        <radialGradient id="asGlow" cx="50%" cy="32%" r="78%">
          <stop offset="0%" stopColor={bg.glow} />
          <stop offset="100%" stopColor="rgba(0,0,0,0)" />
        </radialGradient>
      </defs>
      <rect width={ACT_W} height={ACT_H} fill="url(#asBg)" />
      <rect width={ACT_W} height={ACT_H} fill="url(#asGlow)" />
    </>
  );
}

export function ActivityShareHeader({ accent, title, theme = 'dark' }) {
  const isLight = theme === 'light';
  const logoH = 58;
  const logoW = Math.round(logoH * (600 / 418));
  const accentY = 198;
  const titleY = title ? 280 : 0;
  const titleFill = isLight ? 'rgba(15,23,42,0.88)' : 'rgba(255,255,255,0.88)';

  return (
    <g>
      <ShareBrandLogo x={ACT_W / 2 - logoW / 2} y={118} height={logoH} />
      <rect x={ACT_W / 2 - 60} y={accentY} width="120" height="6" rx="3" fill={accent} />
      {title && (
        <text
          x={ACT_W / 2}
          y={titleY}
          textAnchor="middle"
          style={{ fontFamily: ACT_FONT, fontSize: 44, fontWeight: 700, fill: titleFill }}
        >
          {String(title).slice(0, 28)}
        </text>
      )}
    </g>
  );
}

export function ActivityStatTile({
  x, y, w = 440, h = 300, label, value, theme = 'dark',
}) {
  const isLight = theme === 'light';
  const fill = isLight ? 'rgba(15,23,42,0.05)' : 'rgba(255,255,255,0.06)';
  const stroke = isLight ? 'rgba(15,23,42,0.10)' : 'rgba(255,255,255,0.18)';
  const labelFill = isLight ? 'rgba(15,23,42,0.45)' : 'rgba(255,255,255,0.55)';
  const valueFill = isLight ? '#0F172A' : '#FFFFFF';

  return (
    <g transform={`translate(${x}, ${y})`}>
      <rect x="0" y="0" width={w} height={h} rx="28" fill={fill} stroke={stroke} strokeWidth="2" />
      <text
        x="32"
        y="68"
        style={{
          fontFamily: ACT_FONT, fontSize: 30, fontWeight: 600,
          fill: labelFill, letterSpacing: '0.06em',
        }}
      >
        {String(label).toUpperCase()}
      </text>
      <text
        x="32"
        y="200"
        style={{ fontFamily: ACT_FONT, fontSize: 72, fontWeight: 800, fill: valueFill }}
      >
        {value}
      </text>
    </g>
  );
}
