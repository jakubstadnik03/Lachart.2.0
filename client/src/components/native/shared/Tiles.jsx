// Reusable native UI tiles. Mirrors the visual language of the dashboard cards
// (frosted-glass card style, sport-tinted SVG icons, animated entry).
// Designed to be dropped into any native page (Profile, Training, Tests, etc.).

import React from 'react';

// ─── sport metadata ───────────────────────────────────────────────────────────

export const SPORT_ICONS = {
  bike: '/icon/bike.svg',
  run:  '/icon/run.svg',
  swim: '/icon/swim.svg',
};

export const SPORT_TINT = {
  bike:  '#3b82f6',
  run:   '#f97316',
  swim:  '#06b6d4',
  walk:  '#22c55e',
  gym:   '#8b5cf6',
  other: '#9ca3af',
};

export const SPORT_BG = {
  bike:  '#EFF6FF',
  run:   '#FFF7ED',
  swim:  '#ECFEFF',
  walk:  '#F0FDF4',
  gym:   '#F5F3FF',
  other: '#F9FAFB',
};

export function normSport(sport) {
  const s = String(sport || '').toLowerCase();
  if (s.includes('bike') || s.includes('ride') || s.includes('cycle') || s.includes('virtual')) return 'bike';
  if (s.includes('run'))  return 'run';
  if (s.includes('swim')) return 'swim';
  if (s.includes('walk')) return 'walk';
  if (s.includes('gym') || s.includes('weight') || s.includes('strength') || s.includes('workout') ||
      s.includes('crossfit') || s.includes('yoga') || s.includes('elliptical') || s.includes('fitness'))
    return 'gym';
  return 'other';
}

// ─── SportTile ───────────────────────────────────────────────────────────────
// Rounded soft-tinted square with the SVG sport icon centered inside.
// Useful as an avatar-style icon for tests, activities, summary rows.

export function SportTile({ sport, size = 32, style }) {
  const key  = normSport(sport);
  const src  = SPORT_ICONS[key];
  const tint = SPORT_TINT[key] || SPORT_TINT.other;
  const bg   = SPORT_BG[key]   || SPORT_BG.other;
  return (
    <div style={{
      width: size, height: size, borderRadius: size * 0.3,
      background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0,
      ...style,
    }}>
      {src ? (
        <span style={{
          width: size * 0.6, height: size * 0.6, display: 'block',
          background: tint,
          WebkitMaskImage: `url(${src})`,
          maskImage:       `url(${src})`,
          WebkitMaskRepeat: 'no-repeat',
          maskRepeat: 'no-repeat',
          WebkitMaskPosition: 'center',
          maskPosition: 'center',
          WebkitMaskSize: 'contain',
          maskSize: 'contain',
        }} />
      ) : key === 'gym' ? (
        // Dumbbell icon for gym / workout
        <svg width={size * 0.62} height={size * 0.62} viewBox="0 0 24 24" fill="none" stroke={tint} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 5v14M18 5v14"/>
          <path d="M3 8h3M3 16h3M18 8h3M18 16h3"/>
          <line x1="6" y1="12" x2="18" y2="12"/>
        </svg>
      ) : (
        // Lightning-bolt SVG fallback for unknown sport
        <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 24 24" fill={tint} stroke="none">
          <path d="M13 2L4.5 13h6L9 22l9-12h-6z" />
        </svg>
      )}
    </div>
  );
}

// ─── LacValueChip ────────────────────────────────────────────────────────────
// Vertical chip showing a label, big mmol/L value, "mmol/L" subtitle.
// Used for LT1 / LT2 lactate display.

export function LacValueChip({ label, value, color = '#5E6590', style }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
      padding: '8px 12px', borderRadius: 12,
      background: color + '12', flex: 1,
      ...style,
    }}>
      <span style={{
        fontSize: 9, fontWeight: 700, color: '#6B7280',
        letterSpacing: '0.08em', textTransform: 'uppercase',
      }}>{label}</span>
      <span style={{
        fontSize: 17, fontWeight: 700, color,
        fontVariantNumeric: 'tabular-nums', lineHeight: 1,
      }}>
        {value != null ? Number(value).toFixed(1) : '—'}
      </span>
      <span style={{ fontSize: 9, color: '#9CA3AF', fontWeight: 600 }}>mmol/L</span>
    </div>
  );
}

// ─── ThresholdChip ───────────────────────────────────────────────────────────
// Inline horizontal chip: LABEL · VALUE · UNIT — colored background+border.
// Used for "LT1 → 245 W" / "LT2 → 280 W" displays.

export function ThresholdChip({ label, value, unit = 'W', color = '#5E6590' }) {
  return (
    <div style={{
      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 5,
      padding: '6px 10px', borderRadius: 10,
      background: color + '14',
      border: `1px solid ${color}33`,
    }}>
      <span style={{
        fontSize: 9.5, fontWeight: 700, color: '#6B7280',
        textTransform: 'uppercase', letterSpacing: '0.06em',
      }}>{label}</span>
      <span style={{
        fontSize: 13, fontWeight: 700, color,
        fontVariantNumeric: 'tabular-nums',
      }}>
        {value != null ? `${Math.round(value)} ${unit}` : '—'}
      </span>
    </div>
  );
}

// ─── KpiTile ─────────────────────────────────────────────────────────────────
// Small white-glass tile with an UPPERCASE label and large bold value.
// Used in 2- or 4-column KPI grids on the dashboard.

export function KpiTile({ label, value, style }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 1,
      padding: '7px 5px', borderRadius: 10,
      background: 'rgba(255,255,255,.45)',
      border: '1px solid rgba(255,255,255,.5)',
      ...style,
    }}>
      <span style={{
        fontSize: 9, fontWeight: 700, color: '#6B7280',
        letterSpacing: '0.06em', textTransform: 'uppercase',
      }}>{label}</span>
      <span style={{
        fontSize: 13.5, fontWeight: 700, color: '#0A0E1A',
        fontVariantNumeric: 'tabular-nums',
      }}>
        {value}
      </span>
    </div>
  );
}

// ─── GlassCard ───────────────────────────────────────────────────────────────
// The frosted-glass card style used everywhere on the native dashboard.

export function GlassCard({ children, style }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,.65)',
      backdropFilter: 'blur(22px) saturate(170%)',
      WebkitBackdropFilter: 'blur(22px) saturate(170%)',
      border: '1px solid rgba(255,255,255,.7)',
      boxShadow: '0 1px 0 rgba(255,255,255,.7) inset, 0 8px 24px -10px rgba(10,14,26,.08)',
      borderRadius: 18,
      padding: '14px 14px',
      ...style,
    }}>
      {children}
    </div>
  );
}

// ─── SectionTitle ────────────────────────────────────────────────────────────

export function SectionTitle({ children, style }) {
  return (
    <span style={{
      fontSize: 10.5, fontWeight: 700, color: '#0A0E1A',
      textTransform: 'uppercase', letterSpacing: '0.06em',
      ...style,
    }}>
      {children}
    </span>
  );
}
