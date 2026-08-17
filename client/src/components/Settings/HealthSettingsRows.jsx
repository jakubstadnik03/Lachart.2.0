import React from 'react';
import { Check } from 'lucide-react';

/**
 * Building blocks for the Apple Health settings screen — grouped rows under a
 * small uppercase caption, the layout iOS users know from Health/Strava
 * settings. Shared by AppleHealthCard and AppleHealthWorkoutList so the
 * permission, automation and workout sections line up pixel for pixel.
 */

export function SettingsSection({ title, trailing, children, isMobile = false, className = '' }) {
  return (
    <section className={className}>
      <div className={`flex items-end justify-between gap-2 px-1 ${isMobile ? 'mb-1' : 'mb-1.5'}`}>
        <h5 className={`${isMobile ? 'text-[10px]' : 'text-xs'} font-bold uppercase tracking-wide text-gray-500`}>
          {title}
        </h5>
        {trailing != null && (
          <div className={`${isMobile ? 'text-[10px]' : 'text-xs'} font-semibold text-gray-500`}>{trailing}</div>
        )}
      </div>
      <div className="rounded-xl border border-gray-200 bg-white divide-y divide-gray-100 overflow-hidden">
        {children}
      </div>
    </section>
  );
}

/** One row: leading icon, title + subtitle, and whatever the caller puts on the right. */
export function SettingsRow({ icon, title, subtitle, trailing, isMobile = false, onClick }) {
  const Wrapper = onClick ? 'button' : 'div';
  return (
    <Wrapper
      {...(onClick ? { type: 'button', onClick } : {})}
      className={`w-full flex items-center gap-3 text-left ${isMobile ? 'px-2.5 py-2' : 'px-4 py-3'} ${onClick ? 'hover:bg-gray-50' : ''}`}
    >
      {icon && <div className="flex-shrink-0 flex items-center justify-center w-7">{icon}</div>}
      <div className="min-w-0 flex-1">
        <div className={`${isMobile ? 'text-[11px]' : 'text-sm'} font-semibold text-gray-900 truncate`}>{title}</div>
        {subtitle && (
          <div className={`${isMobile ? 'text-[9px]' : 'text-xs'} text-gray-500 leading-snug`}>{subtitle}</div>
        )}
      </div>
      {trailing != null && <div className="flex-shrink-0">{trailing}</div>}
    </Wrapper>
  );
}

/** Green check — "this is done", the tick in the screenshot. */
export function DoneCheck({ isMobile = false, label = 'Done' }) {
  return (
    <Check
      className={`${isMobile ? 'w-4 h-4' : 'w-5 h-5'} text-green-600`}
      strokeWidth={3}
      aria-label={label}
    />
  );
}

/** iOS-style switch, same markup as the notification toggles in Settings. */
export function ToggleRow({ title, subtitle, checked, onChange, disabled = false, isMobile = false }) {
  return (
    <SettingsRow
      isMobile={isMobile}
      title={title}
      subtitle={subtitle}
      trailing={(
        <label className={`relative inline-flex items-center ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}>
          <input
            type="checkbox"
            className="sr-only peer"
            checked={checked}
            disabled={disabled}
            onChange={(e) => onChange(e.target.checked)}
          />
          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary" />
        </label>
      )}
    />
  );
}

/** Small pill button used for row-level actions (Connect, Import, …). */
export function RowButton({ children, onClick, disabled = false, isMobile = false, variant = 'primary' }) {
  const styles = {
    primary: 'bg-primary text-white hover:bg-primary-dark',
    ghost: 'border border-gray-200 text-gray-600 hover:bg-gray-50',
  }[variant] || '';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`${isMobile ? 'px-2.5 py-1 text-[10px]' : 'px-3 py-1.5 text-xs'} rounded-full font-semibold disabled:opacity-50 disabled:cursor-not-allowed ${styles}`}
    >
      {children}
    </button>
  );
}
