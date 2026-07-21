// Reusable native UI tiles. Mirrors the visual language of the dashboard cards
// (frosted-glass card style, sport-tinted SVG icons, animated entry).
// Designed to be dropped into any native page (Profile, Training, Tests, etc.).

import React from 'react';
import { resolveSportKey, SportGlyph, SPORT_ICON_COLORS } from '../../shared/SportIcon';

// ─── sport metadata ───────────────────────────────────────────────────────────

/** @deprecated Use SportGlyph — kept for legacy mask-based callers */
export const SPORT_ICONS = {
  bike: '/icon/bike.svg',
  run:  '/icon/run.svg',
  swim: '/icon/swim.svg',
};

export const SPORT_TINT = {
  ...SPORT_ICON_COLORS,
  hike: SPORT_ICON_COLORS.hike,
};

export const SPORT_BG = {
  bike:  '#EFF6FF',
  run:   '#FFF7ED',
  swim:  '#ECFEFF',
  hike:  '#FFFBEB',
  walk:  '#F0FDF4',
  gym:   '#F5F3FF',
  other: '#F9FAFB',
};

export const normSport = resolveSportKey;

// ─── SportTile ───────────────────────────────────────────────────────────────
// Rounded soft-tinted square with the SVG sport icon centered inside.
// Useful as an avatar-style icon for tests, activities, summary rows.

export function SportTile({ sport, size = 32, style }) {
  const key  = normSport(sport);
  const tint = SPORT_TINT[key] || SPORT_TINT.other;
  const bg   = SPORT_BG[key]   || SPORT_BG.other;
  return (
    <div style={{
      width: size, height: size, borderRadius: size * 0.3,
      background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0,
      ...style,
    }}>
      <SportGlyph sport={key} size={size * 0.58} color={tint} />
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
        {value == null
          ? '—'
          : unit === '' && typeof value === 'string'
            ? value
            : `${Math.round(Number(value))} ${unit}`.trim()}
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

export function GlassCard({ children, style, ...rest }) {
  return (
    <div {...rest} style={{
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

// ─── Native skeletons ─────────────────────────────────────────────────────────
// Inline-style friendly placeholders for Capacitor/native pages.

export function NativeSkeleton({ width = '100%', height = 12, radius = 999, style }) {
  return (
    <div
      className="animate-pulse"
      style={{
        width,
        height,
        borderRadius: radius,
        background: 'linear-gradient(90deg, rgba(118,126,181,.10), rgba(118,126,181,.18), rgba(118,126,181,.10))',
        ...style,
      }}
      aria-hidden="true"
    />
  );
}

export function NativeSkeletonRows({ rows = 3, style }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, ...style }} aria-busy="true">
      {Array.from({ length: rows }).map((_, idx) => (
        <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <NativeSkeleton width={34} height={34} radius={12} style={{ flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <NativeSkeleton width={idx % 2 === 0 ? '62%' : '48%'} height={10} style={{ marginBottom: 7 }} />
            <NativeSkeleton width={idx % 2 === 0 ? '86%' : '72%'} height={8} />
          </div>
          <NativeSkeleton width={42} height={18} radius={999} />
        </div>
      ))}
    </div>
  );
}

export function NativeSkeletonCard({ rows = 3, style }) {
  return (
    <GlassCard style={style}>
      <NativeSkeleton width="42%" height={12} style={{ marginBottom: 14 }} />
      <NativeSkeletonRows rows={rows} />
    </GlassCard>
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
