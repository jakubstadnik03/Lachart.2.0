/**
 * IOSGalleryCarousel — slideshow for the "Real screens, not mockups"
 * gallery on the About page. Replaces the static 8-up grid that previously
 * sat there. One phone at a time front-and-center, the previous + next
 * shots peek in on the sides so users see there's more to browse without
 * a separate "X of N" chrome.
 *
 * Auto-advances every `autoMs` ms, pauses on hover / focus / active touch.
 * Honours prefers-reduced-motion by disabling auto-advance entirely (still
 * works manually via arrows / dots / swipe).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const COLORS = {
  primary:     '#5E6590',
  primaryDark: '#4B5278',
  primaryTint: '#EEF0F8',
  ink:         '#0A0E1A',
  muted:       '#6B7280',
  border:      'rgba(180,190,210,.35)',
};

export default function IOSGalleryCarousel({
  shots,
  autoMs = 4500,
  onAppStoreClick,
}) {
  const safe = useMemo(() => (Array.isArray(shots) && shots.length ? shots : []), [shots]);
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchRef = useRef({ x: 0, y: 0, active: false });

  // Honour prefers-reduced-motion — kills auto-advance only, manual controls
  // continue to work.
  const reducedMotion = useMemo(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  // Preload neighbours so the next swipe is instant.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    safe.forEach((s) => {
      if (!s?.src) return;
      const img = new Image();
      img.src = s.src;
    });
  }, [safe]);

  useEffect(() => {
    if (paused || reducedMotion || safe.length <= 1) return;
    const t = window.setInterval(() => setIdx((i) => (i + 1) % safe.length), autoMs);
    return () => window.clearInterval(t);
  }, [paused, autoMs, safe.length, reducedMotion]);

  const go = useCallback((next) => {
    const n = safe.length;
    if (!n) return;
    setIdx(((next % n) + n) % n);
  }, [safe.length]);

  const onTouchStart = (e) => {
    const t = e.touches?.[0]; if (!t) return;
    touchRef.current = { x: t.clientX, y: t.clientY, active: true };
    setPaused(true);
  };
  const onTouchEnd = (e) => {
    const s = touchRef.current; if (!s.active) return;
    s.active = false;
    setPaused(false);
    const t = e.changedTouches?.[0]; if (!t) return;
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    // Horizontal swipe of at least 40 px, mostly horizontal
    if (Math.abs(dx) < 40 || Math.abs(dy) > Math.abs(dx)) return;
    if (dx < 0) go(idx + 1); else go(idx - 1);
  };

  if (!safe.length) return null;

  const current = safe[idx];
  const prev = safe[(idx - 1 + safe.length) % safe.length];
  const next = safe[(idx + 1) % safe.length];

  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      style={{ position: 'relative' }}
    >
      {/* ── Stage ───────────────────────────────────────────────────── */}
      <div
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        style={{
          position: 'relative',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: 'clamp(380px, 60vw, 580px)',
          padding: '12px 0',
          overflow: 'hidden',
        }}
      >
        {/* Side peeks — only render on wider viewports via the side classes;
            on phone they're hidden by CSS below so the center phone has
            room to breathe. */}
        <PhoneCard shot={prev} role="prev" onClick={() => go(idx - 1)} />
        <PhoneCard shot={current} role="current" />
        <PhoneCard shot={next} role="next" onClick={() => go(idx + 1)} />

        {/* Arrows */}
        {safe.length > 1 && (
          <>
            <ArrowButton
              dir="prev"
              onClick={() => go(idx - 1)}
              aria-label="Previous screen"
            />
            <ArrowButton
              dir="next"
              onClick={() => go(idx + 1)}
              aria-label="Next screen"
            />
          </>
        )}
      </div>

      {/* ── Caption (fades w/ slide) ───────────────────────────────── */}
      <div style={{ textAlign: 'center', marginTop: 18, minHeight: 56 }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: COLORS.ink, letterSpacing: '-0.005em' }}>
          {current.title}
        </div>
        <div style={{ fontSize: 13, color: COLORS.muted, lineHeight: 1.5, marginTop: 4, maxWidth: 460, marginInline: 'auto' }}>
          {current.caption}
        </div>
      </div>

      {/* ── Dots ──────────────────────────────────────────────────── */}
      {safe.length > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 14 }}>
          {safe.map((s, i) => (
            <button
              key={s.src}
              type="button"
              onClick={() => go(i)}
              aria-label={`Go to ${s.title}`}
              style={{
                height: 6, width: i === idx ? 24 : 6,
                borderRadius: 999,
                background: i === idx ? COLORS.primary : 'rgba(94,101,144,0.25)',
                border: 'none', padding: 0,
                cursor: 'pointer',
                transition: 'width .25s ease, background .2s ease',
                WebkitTapHighlightColor: 'transparent',
              }}
            />
          ))}
        </div>
      )}

      {/* App Store CTA */}
      <div style={{ textAlign: 'center', marginTop: 26 }}>
        <a
          href="https://apps.apple.com/cz/app/lachart/id6764768876?l=cs"
          target="_blank"
          rel="noopener noreferrer"
          onClick={onAppStoreClick}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 10,
            padding: '12px 22px', borderRadius: 12,
            background: '#000', color: '#fff', textDecoration: 'none',
            fontWeight: 700,
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M17.05 12.04c-.03-2.8 2.29-4.15 2.4-4.21-1.31-1.92-3.35-2.18-4.07-2.21-1.73-.17-3.38 1.02-4.26 1.02-.89 0-2.24-1-3.69-.97-1.9.03-3.65 1.1-4.62 2.8-1.97 3.42-.5 8.47 1.41 11.24.94 1.36 2.04 2.88 3.48 2.83 1.41-.06 1.94-.91 3.64-.91 1.69 0 2.18.91 3.65.88 1.51-.02 2.46-1.37 3.38-2.74 1.07-1.57 1.51-3.09 1.53-3.17-.03-.01-2.93-1.12-2.95-4.46zM14.4 4.34c.78-.95 1.31-2.28 1.17-3.59-1.13.05-2.49.75-3.29 1.7-.72.84-1.36 2.18-1.19 3.48 1.26.1 2.54-.64 3.31-1.59z"/>
          </svg>
          Get it on the App Store
        </a>
      </div>

      <style>{`
        @media (max-width: 720px) {
          /* Hide the side-peek phones on phone-width screens so the active
             phone has the full stage. Arrows + swipe still drive navigation. */
          .lc-gallery-side { display: none !important; }
          .lc-gallery-current { transform: scale(1) !important; }
        }
      `}</style>
    </div>
  );
}

function PhoneCard({ shot, role, onClick }) {
  if (!shot) return null;
  const isCurrent = role === 'current';
  const side = role === 'prev' ? 'left' : role === 'next' ? 'right' : null;

  // Side phones peek in at reduced scale + opacity to suggest "swipeable".
  const transform = isCurrent
    ? 'scale(1)'
    : side === 'left'
      ? 'translateX(-72%) scale(0.78)'
      : 'translateX(72%) scale(0.78)';

  return (
    <button
      type="button"
      onClick={onClick}
      tabIndex={isCurrent ? -1 : 0}
      aria-hidden={!isCurrent}
      aria-label={isCurrent ? undefined : `Show ${shot.title}`}
      className={isCurrent ? 'lc-gallery-current' : 'lc-gallery-side'}
      style={{
        position: isCurrent ? 'relative' : 'absolute',
        top: isCurrent ? undefined : '50%',
        left: side === 'left' ? '50%' : undefined,
        right: side === 'right' ? '50%' : undefined,
        transform: isCurrent
          ? transform
          : `translate(${side === 'left' ? '-50%' : '50%'}, -50%) ${transform.replace(/translateX\([^)]+\)\s*/, '')}`,
        background: 'none', border: 'none', padding: 0,
        cursor: isCurrent ? 'default' : 'pointer',
        zIndex: isCurrent ? 2 : 1,
        filter: isCurrent ? 'none' : 'blur(1px)',
        opacity: isCurrent ? 1 : 0.55,
        transition: 'transform .45s cubic-bezier(.2,.7,.3,1), opacity .35s ease, filter .35s ease',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <div
        style={{
          width: 'clamp(220px, 30vw, 320px)',
          aspectRatio: '9 / 16',
          background: 'linear-gradient(160deg, #F4F5FA 0%, ' + COLORS.primaryTint + ' 100%)',
          borderRadius: 24,
          display: 'grid',
          placeItems: 'center',
          padding: 14,
          border: '1px solid ' + COLORS.border,
          overflow: 'hidden',
          boxShadow: isCurrent
            ? '0 24px 60px -24px rgba(94,101,144,0.45)'
            : '0 10px 30px -16px rgba(10,14,26,0.25)',
        }}
      >
        <img
          src={shot.src}
          alt={`LaChart iOS — ${shot.title}`}
          loading="lazy"
          style={{
            maxWidth: '100%', maxHeight: '100%', objectFit: 'contain',
            filter: 'drop-shadow(0 18px 28px rgba(10,14,26,0.18))',
          }}
        />
      </div>
    </button>
  );
}

function ArrowButton({ dir, onClick, ...aria }) {
  const isPrev = dir === 'prev';
  return (
    <button
      type="button"
      onClick={onClick}
      {...aria}
      style={{
        position: 'absolute',
        top: '50%', transform: 'translateY(-50%)',
        [isPrev ? 'left' : 'right']: 'clamp(4px, 2vw, 24px)',
        width: 40, height: 40, borderRadius: 999,
        background: '#fff',
        border: '1px solid ' + COLORS.border,
        color: COLORS.primary,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 6px 20px -8px rgba(10,14,26,0.18)',
        cursor: 'pointer',
        zIndex: 3,
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
        {isPrev
          ? <path d="M15 19l-7-7 7-7" />
          : <path d="M9 5l7 7-7 7" />}
      </svg>
    </button>
  );
}
