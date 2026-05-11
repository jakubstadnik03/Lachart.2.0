// Shared keyframes + helpers for the native dashboard.
// Mounted once at the top of NativeDashboardPage so every card can use them.

export const NATIVE_DASHBOARD_KEYFRAMES = `
@keyframes ndFadeIn      { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
@keyframes ndScaleIn     { from { opacity: 0; transform: scale(.96); }      to { opacity: 1; transform: scale(1); } }
@keyframes ndDrawLine    { to   { stroke-dashoffset: 0; } }
@keyframes ndBarGrow     { from { transform: scaleY(0); }                   to { transform: scaleY(1); } }
@keyframes ndBarWidthIn  { from { width: 0%; }                              to { width: var(--nd-bar-w); } }
@keyframes ndPopIn       { 0% { opacity: 0; transform: scale(.85); } 60% { transform: scale(1.04); } 100% { opacity: 1; transform: scale(1); } }
@keyframes ndShimmer     { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
@keyframes ndSpin        { to { transform: rotate(360deg); } }
@keyframes ndSlideInRight{ from { opacity: 0; transform: translateX(8px); } to { opacity: 1; transform: translateX(0); } }
@keyframes ndRingSweep   { from { stroke-dashoffset: 999; } to { stroke-dashoffset: 0; } }
@keyframes ndPulse       { 0%,100% { transform: scale(1); } 50% { transform: scale(1.06); } }
@keyframes ndWave        { 0%,100% { transform: rotate(0deg); } 25% { transform: rotate(-20deg); } 75% { transform: rotate(15deg); } }
`;

// Helper for staggered card entry — one card after another
export function cardEntry(index = 0, delay = 60) {
  return {
    animation: `ndFadeIn .45s ${index * delay}ms cubic-bezier(.22,1,.36,1) both`,
  };
}

// Press-feedback handlers for any clickable element
export function pressFeedback(scale = 0.96) {
  const down = (e) => { e.currentTarget.style.transform = `scale(${scale})`; };
  const up   = (e) => { e.currentTarget.style.transform = ''; };
  return {
    onMouseDown: down, onMouseUp: up, onMouseLeave: up,
    onTouchStart: down, onTouchEnd: up,
  };
}

// Generic stagger entry helper for child elements
export function staggerEntry(index = 0, delay = 50, anim = 'ndFadeIn', duration = '.4s') {
  return {
    animation: `${anim} ${duration} ${index * delay}ms cubic-bezier(.22,1,.36,1) both`,
  };
}

// Pop-in (slight overshoot) for chips/pills/badges
export function popIn(delay = 0) {
  return {
    animation: `ndPopIn .45s ${delay}ms cubic-bezier(.22,1.5,.36,1) both`,
  };
}
