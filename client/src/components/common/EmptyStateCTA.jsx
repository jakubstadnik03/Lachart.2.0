import React from 'react';
import { Link } from 'react-router-dom';

/**
 * EmptyStateCTA
 *
 * Reusable "you haven't tried this yet — try it" banner used to surface
 * recently-added features wherever the natural empty state lives:
 *   - Calendar week with no activities      → "Plan your first workout"
 *   - Coach branding form with no fields    → "Set up your studio branding"
 *   - Test interval row with no lactate     → "Add a lactate sample"
 *   - Coach dashboard with no athletes      → "Add your first athlete"
 *
 * Renders nothing on native iOS (we don't surface web-only nudges there).
 *
 * Variants:
 *   - 'card'    (default) — large clickable card with emoji + body + CTA
 *   - 'banner'            — full-width slim banner suitable above lists
 *   - 'inline'            — small chip that fits inside table rows / forms
 *
 * Always render once per user — the parent decides visibility. Dismissal
 * (via `onDismiss`) is optional; pass it for non-blocking suggestions.
 */
export default function EmptyStateCTA({
  emoji,
  title,
  body,
  ctaLabel,
  to,
  onClick,
  variant = 'card',
  onDismiss,
  compact = false,
  className = '',
}) {
  const Wrapper = to && !onClick ? Link : 'button';
  const wrapperProps = to && !onClick
    ? { to }
    : { type: 'button', onClick };

  if (variant === 'inline') {
    return (
      <Wrapper
        {...wrapperProps}
        className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium text-primary bg-primary/10 hover:bg-primary/20 transition-colors ${className}`}
      >
        <span aria-hidden>{emoji}</span>
        <span>{ctaLabel || title}</span>
      </Wrapper>
    );
  }

  if (variant === 'banner') {
    return (
      <div
        className={`relative flex flex-col sm:flex-row items-start sm:items-center gap-3 p-3 sm:p-4 rounded-xl border border-primary/30 bg-gradient-to-br from-primary/5 to-purple-50 ${className}`}
      >
        <div className="text-2xl shrink-0" aria-hidden>{emoji}</div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm text-gray-900">{title}</div>
          {body && (
            <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">{body}</p>
          )}
        </div>
        <Wrapper
          {...wrapperProps}
          className="shrink-0 px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-primary/90 transition-colors"
        >
          {ctaLabel} →
        </Wrapper>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="absolute top-1 right-1 p-1 text-gray-400 hover:text-gray-600 rounded"
            aria-label="Dismiss"
          >
            ✕
          </button>
        )}
      </div>
    );
  }

  // 'card' variant — large click-anywhere block
  return (
    <Wrapper
      {...wrapperProps}
      className={`group relative flex flex-col items-center justify-center text-center ${compact ? 'p-4' : 'p-6 sm:p-8'} rounded-2xl border-2 border-dashed border-gray-200 hover:border-primary/60 hover:bg-primary/5 transition-colors w-full ${className}`}
    >
      <span className={`${compact ? 'text-3xl' : 'text-4xl'} mb-2`} aria-hidden>{emoji}</span>
      <div className={`font-semibold text-gray-900 ${compact ? 'text-sm' : 'text-base'}`}>
        {title}
      </div>
      {body && (
        <p className={`text-gray-600 mt-1 max-w-md leading-relaxed ${compact ? 'text-xs' : 'text-sm'}`}>
          {body}
        </p>
      )}
      {ctaLabel && (
        <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-primary group-hover:underline">
          {ctaLabel} →
        </span>
      )}
      {onDismiss && (
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDismiss(); }}
          className="absolute top-2 right-2 p-1 text-gray-400 hover:text-gray-600 rounded"
          aria-label="Dismiss"
        >
          ✕
        </button>
      )}
    </Wrapper>
  );
}
