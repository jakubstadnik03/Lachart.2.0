/**
 * MetricTile
 * ──────────
 * Compact rounded-tile readout used in the workout execution screen.
 * Tacx-inspired: dark surface, tight padding, dominant tabular number,
 * small label below. Supports an optional icon and an optional accent
 * colour that tints the icon and adds a left-border stripe.
 *
 * Props:
 *   label   — short label (uppercase): "WATT", "BPM", "RPM", "KM/H"
 *   value   — primary value (string/number). Show "--" when null/empty.
 *   icon    — optional ReactNode rendered top-left
 *   accent  — optional CSS colour to tint icon + left edge
 *   trend   — optional small string under the value (e.g. "+12 W" delta)
 *   trendColor — optional accent for trend text
 *   compact — bool: tighter typography for stacks of 4+ tiles
 *   onClick — optional handler (e.g. open detail/edit)
 */
import React from 'react';

export default function MetricTile({
  label,
  value,
  icon = null,
  accent = null,
  trend = null,
  trendColor = null,
  compact = false,
  onClick = null,
}) {
  const display = value == null || value === '' || Number.isNaN(value) ? '--' : value;
  const isInteractive = !!onClick;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!isInteractive}
      className={`relative w-full text-left rounded-2xl border border-white/8 bg-white/[0.04] backdrop-blur-sm overflow-hidden transition-all ${
        isInteractive ? 'hover:bg-white/[0.07] active:scale-[0.99]' : 'cursor-default'
      } ${compact ? 'p-2.5' : 'p-3'}`}
      style={{
        WebkitTapHighlightColor: 'transparent',
        // Faint coloured glow on the left edge when an accent is set.
        boxShadow: accent ? `inset 3px 0 0 ${accent}66` : undefined,
      }}
    >
      {(icon || label) && (
        <div className="flex items-center gap-1.5 mb-1">
          {icon && (
            <span className="flex-shrink-0" style={{ color: accent || '#9ca3af' }}>
              {icon}
            </span>
          )}
          {label && (
            <span className={`uppercase tracking-wider font-bold text-gray-500 ${compact ? 'text-[9px]' : 'text-[10px]'}`}>
              {label}
            </span>
          )}
        </div>
      )}
      <div
        className={`font-black tabular-nums leading-none text-white ${compact ? 'text-2xl' : 'text-3xl sm:text-4xl'}`}
        style={{ letterSpacing: '-0.02em' }}
      >
        {display}
      </div>
      {trend && (
        <div
          className={`mt-1 text-[10px] font-bold tabular-nums ${compact ? 'opacity-80' : ''}`}
          style={{ color: trendColor || '#9ca3af' }}
        >
          {trend}
        </div>
      )}
    </button>
  );
}
