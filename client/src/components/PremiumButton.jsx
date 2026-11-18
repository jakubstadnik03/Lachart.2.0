import React from 'react';
import { SparklesIcon } from '@heroicons/react/24/solid';

/** The Premium look, shared by the locked cards and the full-screen offer. */
export const PREMIUM_GRADIENT = 'linear-gradient(135deg, #8B7FF0 0%, #6C6FD6 45%, #4A4FA8 100%)';
export const PREMIUM_DEEP = 'linear-gradient(160deg, #141833 0%, #262B5C 55%, #3D3F8F 100%)';

const KEYFRAMES = `
@keyframes lcPremiumShine { 0% { transform: translateX(-120%) skewX(-20deg); } 60%, 100% { transform: translateX(260%) skewX(-20deg); } }
`;

/** A call to action with a slow light sweep, so it reads as the thing to tap. */
export function PremiumButton({ children, onClick, disabled = false, size = 'md' }) {
  const big = size === 'lg';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="touch-manipulation"
      style={{
        position: 'relative', overflow: 'hidden', width: '100%',
        padding: big ? '17px 16px' : '13px 14px', borderRadius: big ? 18 : 14, border: 'none',
        background: PREMIUM_GRADIENT, color: '#fff',
        fontSize: big ? 17 : 15, fontWeight: 800, letterSpacing: '-0.01em',
        cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
        opacity: disabled ? 0.75 : 1,
        boxShadow: '0 12px 28px -12px rgba(76,79,168,.75), inset 0 1px 0 rgba(255,255,255,.25)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
      }}
    >
      <style>{KEYFRAMES}</style>
      {!disabled && (
        <span aria-hidden="true" style={{
          position: 'absolute', top: 0, bottom: 0, left: 0, width: '40%',
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,.35), transparent)',
          animation: 'lcPremiumShine 3.2s ease-in-out infinite',
        }} />
      )}
      <SparklesIcon aria-hidden="true" style={{ width: big ? 19 : 17, height: big ? 19 : 17, position: 'relative' }} />
      <span style={{ position: 'relative' }}>{children}</span>
    </button>
  );
}

/** The small "Premium" badge at the top of a locked card. */
export function PremiumBadge() {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0,
      fontSize: 10.5, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase',
      color: '#fff', background: PREMIUM_GRADIENT, borderRadius: 999, padding: '4px 9px',
      boxShadow: '0 4px 10px -4px rgba(76,79,168,.6)',
    }}>
      <SparklesIcon style={{ width: 11, height: 11 }} />
      Premium
    </span>
  );
}
