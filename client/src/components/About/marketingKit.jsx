/**
 * Shared marketing design kit — the LaChart brand tokens, page CSS, scroll
 * reveal hook and small primitives used by the About page and other marketing
 * pages (e.g. /for-coaches) so they render as one identical system.
 *
 * Extracted verbatim from About.jsx; About and ForCoaches both import from here.
 */
import React, { useEffect } from 'react';
import { useReducedMotion } from 'framer-motion';

export const LC = {
  primary:      '#767EB5',
  primaryDark:  '#5E6590',
  primaryLight: '#B8BDDB',
  primaryTint:  '#EEF0F8',
  secondary:    '#599FD0',
  tertiary:     '#7BC2EB',
  accent:       '#7C3AED',
  ink:          '#0F1729',
  text:         '#1F2738',
  muted:        '#6B7280',
  border:       'rgba(180,190,210,.30)',
  green:        '#10B981',
};

/* ─── Reveal — single IntersectionObserver hook ─────────────────────────
   `will-change: transform, opacity` is only set on elements that are
   actually animating. We add `.lc-arming` just before flipping `.lc-in`
   (so the compositor promotes the layer for the duration of the fade),
   then clear it once the transition ends. Without this trick, a permanent
   `will-change` on every reveal element created ~40 persistent GPU layers
   that Safari struggles to schedule — the visible result was the sticky
   nav "skipping" on every scroll frame. */
export function useReveal(refs) {
  const reduce = useReducedMotion();
  useEffect(() => {
    if (reduce) return;
    const onEnd = (e) => {
      if (e.propertyName !== 'opacity') return;
      e.currentTarget.classList.remove('lc-arming');
      e.currentTarget.removeEventListener('transitionend', onEnd);
    };
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => {
        if (!e.isIntersecting) return;
        const el = e.target;
        el.classList.add('lc-arming');
        // Next frame: flip to .lc-in so the browser has the layer ready.
        requestAnimationFrame(() => el.classList.add('lc-in'));
        el.addEventListener('transitionend', onEnd);
        io.unobserve(el);
      }),
      { threshold: 0.15, rootMargin: '0px 0px -10% 0px' }
    );
    refs.forEach((el) => { if (el) io.observe(el); });
    return () => io.disconnect();
  }, [refs, reduce]);
}

/* ─── Eyebrow pill (with pulsing dot) ─────────────────────────────────── */
export const Eyebrow = ({ children }) => (
  <span
    className="lc-eb"
    style={{
      display: 'inline-flex', alignItems: 'center', gap: 8,
      fontSize: 11, fontWeight: 700, color: LC.primaryDark,
      letterSpacing: '0.14em', textTransform: 'uppercase',
      padding: '6px 12px', borderRadius: 9999,
      background: LC.primaryTint, border: '1px solid rgba(118,126,181,.20)',
    }}
  >
    <i className="lc-pulse" style={{ width: 6, height: 6, borderRadius: '50%', background: LC.primary, display: 'inline-block' }} />
    {children}
  </span>
);

/* ─── Browser-style frame for product screenshots ─────────────────────── */
export const BrowserFrame = ({ label, children }) => (
  <div style={{
    borderRadius: 20, overflow: 'hidden',
    border: '1px solid rgba(255,255,255,.7)',
    boxShadow: '0 30px 60px -20px rgba(15,23,41,.25)',
    background: '#fff',
  }}>
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '10px 14px',
      background: '#F8FAFD', borderBottom: '1px solid rgba(180,190,210,.18)',
    }}>
      <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#FF6058' }} />
      <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#FFBD2E' }} />
      <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#28C840' }} />
      {label && (
        <span style={{ marginLeft: 10, fontSize: 11, fontWeight: 600, color: LC.muted, fontVariantNumeric: 'tabular-nums' }}>
          {label}
        </span>
      )}
    </div>
    {children}
  </div>
);

/* ─── Page-level keyframes (scoped, injected once) ────────────────────── */
export const STYLE = `
  /* About uses smooth-scroll for anchor nav — scoped to .lc-page so the
     rest of the app keeps its instant scroll. */
  .lc-page { scroll-behavior: smooth; }
  html:has(.lc-page) { scroll-behavior: smooth; }

  /* Reveal: y-translate / x-translate / scale variants, generous stagger.
     Left/right use clip-safe translate so they never cause overflow-x scroll. */
  /* Reveal animation. will-change was previously on every single reveal
     element — there are 40+ of them on this page, so the compositor was
     allocating 40+ GPU layers up front, which Safari handles particularly
     badly (visible as scroll jank + the sticky nav stuttering). will-change
     is now only set when the element is actually about to animate
     (.lc-arming) and cleared once it lands (.lc-in), so we keep the perf
     hint where it pays off but stop creating permanent layers everywhere. */
  .lc-reveal { opacity: 0; transition: opacity .9s cubic-bezier(.2,.7,.2,1), transform 1s cubic-bezier(.2,.7,.2,1); }
  .lc-reveal.lc-arming { will-change: transform, opacity; }
  .lc-reveal.left  { transform: translate3d(-28px, 0, 0); }
  .lc-reveal.right { transform: translate3d(28px, 0, 0); }
  .lc-reveal.scale { transform: scale(.94); }
  .lc-reveal:not(.left):not(.right):not(.scale) { transform: translate3d(0, 28px, 0); }
  .lc-reveal.lc-in { opacity: 1; transform: none; }
  .lc-reveal.d1 { transition-delay: .08s; }
  .lc-reveal.d2 { transition-delay: .16s; }
  .lc-reveal.d3 { transition-delay: .24s; }
  .lc-reveal.d4 { transition-delay: .32s; }
  .lc-reveal.d5 { transition-delay: .40s; }
  .lc-reveal.d6 { transition-delay: .48s; }

  /* Pulse dot on eyebrows + floating badges */
  @keyframes lc-pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
  .lc-pulse { animation: lc-pulse 2s ease-in-out infinite; }
  @keyframes lc-float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
  .lc-float { animation: lc-float 6s ease-in-out infinite; }
  .lc-float.d2 { animation-delay: -2s; }
  .lc-float.d3 { animation-delay: -4s; }

  /* Subtle gradient shimmer on hero <em> — kept very low-key so it doesn't
     distract on long reads. */
  @keyframes lc-gradient-shift {
    0%   { background-position:   0% 50%; }
    50%  { background-position: 100% 50%; }
    100% { background-position:   0% 50%; }
  }

  .lc-huge { font-size: clamp(36px, 6vw, 72px); font-weight: 800; letter-spacing: -0.03em; line-height: 1.05; color: ${LC.ink}; }
  .lc-huge em {
    font-style: normal;
    background: linear-gradient(135deg, ${LC.primary} 0%, ${LC.secondary} 35%, ${LC.accent} 70%, ${LC.primary} 100%);
    background-size: 200% 200%;
    animation: lc-gradient-shift 8s ease infinite;
    -webkit-background-clip: text; background-clip: text;
    -webkit-text-fill-color: transparent;
    position: relative;
  }
  .lc-huge em::after { content: ''; position: absolute; left: 0; right: 0; bottom: 4px; height: 4px; background: ${LC.primary}; opacity: 0.18; border-radius: 2px; }
  .lc-big { font-size: clamp(28px, 4vw, 44px); font-weight: 800; letter-spacing: -0.025em; line-height: 1.1; color: ${LC.ink}; }
  .lc-big em { font-style: normal; background: linear-gradient(135deg, ${LC.primary}, ${LC.secondary}); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; }
  .lc-lead { font-size: clamp(15px, 1.3vw, 18px); line-height: 1.6; color: ${LC.muted}; max-width: 580px; }
  /* overflow-x uses clip instead of hidden so position:sticky descendants
     (the top nav) still anchor to the viewport. hidden would silently
     create a scroll container and break sticky. Sections also use clip
     so a card with a negative margin or wide background doesn't kick the
     page sideways while keeping sticky alive throughout the tree. */
  /* Page background. We used to have background-attachment: fixed here so
     the radial gradients stayed parked while content scrolled — Safari
     however repaints the *entire* viewport on every scroll frame in that
     mode, which combined with the sticky nav's backdrop-filter caused the
     stuttering scroll + jumping nav. Drop the fixed attachment and pin the
     gradients to a ::before pseudo with position: fixed instead — same
     visual but isolated from the scroll repaint path. */
  .lc-page { font-family: 'Hind Vadodara', system-ui, -apple-system, sans-serif; color: ${LC.text}; background: linear-gradient(180deg, #FFFFFF 0%, #F8FAFD 100%); min-height: 100vh; overflow-x: clip; position: relative; }
  .lc-page::before {
    content: '';
    position: fixed; inset: 0;
    background:
      radial-gradient(ellipse 40% 30% at 80% 0%, rgba(123,194,235,.18) 0%, transparent 70%),
      radial-gradient(ellipse 50% 40% at 0% 30%, rgba(118,126,181,.16) 0%, transparent 70%);
    pointer-events: none;
    z-index: 0;
  }
  .lc-page > * { position: relative; z-index: 1; }
  .lc-page section { scroll-margin-top: 80px; overflow-x: clip; }
  .lc-sectpad { padding: 80px 24px; max-width: 1280px; margin: 0 auto; }
  @media (max-width: 1024px) { .lc-sectpad { padding: 60px 20px; } }
  @media (max-width: 640px)  { .lc-sectpad { padding: 44px 16px; } }

  /* CTAs — buttery hover with elevation lift + brightness bump */
  .lc-btn-primary {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 12px 22px; border-radius: 12px;
    background: ${LC.primaryDark}; color: #fff;
    text-decoration: none; font-size: 14px; font-weight: 700;
    box-shadow: 0 8px 22px -6px rgba(118,126,181,.55);
    transition: transform .25s cubic-bezier(.2,.7,.2,1),
                box-shadow .25s cubic-bezier(.2,.7,.2,1),
                background .25s ease, filter .25s ease;
  }
  .lc-btn-primary:hover { transform: translateY(-2px); background: ${LC.primary}; box-shadow: 0 14px 28px -8px rgba(118,126,181,.65); filter: brightness(1.04); }
  .lc-btn-primary:active { transform: translateY(0); transition-duration: .12s; }
  .lc-btn-ghost {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 12px 18px; border-radius: 12px;
    background: transparent; color: ${LC.primaryDark};
    text-decoration: none; font-size: 14px; font-weight: 700;
    border: 1px solid ${LC.border};
    transition: background .2s, border-color .2s, transform .2s;
  }
  .lc-btn-ghost:hover { background: ${LC.primaryTint}; border-color: ${LC.primary}; transform: translateY(-1px); }

  /* Cards — universal hover lift */
  .lc-card {
    border-radius: 18px; background: #fff;
    border: 1px solid ${LC.border}; padding: 22px;
    transition: transform .3s cubic-bezier(.2,.7,.2,1),
                box-shadow .3s cubic-bezier(.2,.7,.2,1),
                border-color .25s ease;
  }
  .lc-card:hover { transform: translateY(-4px); box-shadow: 0 22px 44px -18px rgba(15,23,41,.18); border-color: rgba(118,126,181,.5); }

  /* Nav links — underline on hover, scroll-spy active state */
  .lc-nav-link {
    position: relative; color: ${LC.muted}; text-decoration: none;
    font-size: 14px; font-weight: 500;
    padding: 8px 12px; border-radius: 8px;
    transition: color .2s, background .2s;
  }
  .lc-nav-link::after {
    content: ''; position: absolute;
    left: 12px; right: 12px; bottom: 4px;
    height: 2px; border-radius: 2px;
    background: ${LC.primary};
    transform: scaleX(0);
    transform-origin: center;
    transition: transform .25s cubic-bezier(.2,.7,.2,1);
  }
  .lc-nav-link:hover { color: ${LC.primary}; background: ${LC.primaryTint}; }
  .lc-nav-link.active { color: ${LC.primaryDark}; }
  .lc-nav-link.active::after { transform: scaleX(1); }

  /* Scroll progress bar — pinned under the nav, fills as you scroll. */
  .lc-progress {
    position: fixed; top: 0; left: 0; right: 0;
    height: 3px; z-index: 101;
    background: linear-gradient(90deg, ${LC.primary}, ${LC.secondary}, ${LC.accent});
    transform-origin: left center;
    transform: scaleX(var(--lc-progress, 0));
    transition: transform .15s linear;
  }

  /* ── Scroll snapping — opt-in, About only (.lc-snap on the page root) ──
     Proximity, never mandatory. Several sections here are taller than the
     viewport, and mandatory snapping on those traps the user: every attempt to
     scroll through the middle of a long section gets yanked back to its start.
     Proximity only engages when a section edge is already close, so a normal
     read is untouched and a flick between sections lands on one.

     scroll-padding-top clears the sticky nav — without it a snapped section's
     heading parks underneath the bar. Snapping is turned off entirely for
     reduced-motion users, for whom the pull is disorienting rather than nice. */
  html:has(.lc-snap) {
    scroll-snap-type: y proximity;
    scroll-padding-top: 76px;
  }
  .lc-snap > section {
    scroll-snap-align: start;
    scroll-snap-stop: normal;
  }
  /* The hero and the first section are deliberately NOT snap targets. With a
     snap point sitting at y = 0, the first gentle wheel tick gets pulled
     straight back to the top — which also means the back-to-top button never
     crosses its threshold. Leaving the top of the page unsnapped lets a small
     scroll be a small scroll. */
  .lc-snap > header,
  .lc-snap > section:first-of-type { scroll-snap-align: none; }
  @media (prefers-reduced-motion: reduce) {
    html:has(.lc-snap) { scroll-snap-type: none; scroll-behavior: auto; }
    .lc-snap > section { scroll-snap-align: none; }
  }

  /* Page entrance — fade the whole page in from 0.96 scale on mount. */
  @keyframes lc-page-in { from { opacity: 0; transform: scale(.985); } to { opacity: 1; transform: none; } }
  .lc-page-in { animation: lc-page-in .6s cubic-bezier(.2,.7,.2,1) both; }

  /* Audience cards — extra hover: image grows + slight tilt */
  .lc-aud-card .lc-aud-photo { transition: transform .35s cubic-bezier(.2,.7,.2,1); }
  .lc-aud-card:hover .lc-aud-photo { transform: scale(1.08) rotate(-2deg); }

  /* Feature cards — icon bumps on hover */
  .lc-feat-card .lc-feat-icon { transition: transform .3s cubic-bezier(.2,.7,.2,1), background .2s; }
  .lc-feat-card:hover .lc-feat-icon { transform: scale(1.1) rotate(-4deg); background: ${LC.primary}22; }

  /* Filter chips — soft pop animation when filter changes */
  @keyframes lc-chip-pop { 0% { transform: scale(.96); } 60% { transform: scale(1.04); } 100% { transform: none; } }
  .lc-feat-card { animation: lc-chip-pop .3s cubic-bezier(.2,.7,.2,1) both; }

  /* Methodology eq-line — slides up softly on hover */
  .lc-meth-card .lc-eq { transition: transform .25s cubic-bezier(.2,.7,.2,1), background .25s; }
  .lc-meth-card:hover .lc-eq { transform: translateY(-2px); background: ${LC.primary}28; }

  /* Integration dot pulse */
  .lc-int-dot { box-shadow: 0 0 0 0 rgba(118,126,181,.5); animation: lc-int-pulse 2.4s ease-out infinite; }
  @keyframes lc-int-pulse { 0% { box-shadow: 0 0 0 0 rgba(118,126,181,.45); } 70% { box-shadow: 0 0 0 12px rgba(118,126,181,0); } 100% { box-shadow: 0 0 0 0 rgba(118,126,181,0); } }

  /* Testimonial — quote-mark fades / slides on hover */
  .lc-voice-card { position: relative; }
  .lc-voice-card::before {
    content: '"'; position: absolute;
    top: 6px; right: 18px;
    font-size: 64px; line-height: 1;
    color: ${LC.primary}; opacity: 0.08;
    transition: opacity .3s ease, transform .3s ease;
  }
  .lc-voice-card:hover::before { opacity: 0.22; transform: translateY(-4px); }

  /* Hero badge hover — subtle tilt + lift on top of the float keyframe */
  .lc-hero-badge { transition: filter .25s ease; }
  .lc-hero-badge:hover { filter: brightness(1.05) saturate(1.1); }

  /* What's-new timeline — vertical guide + date dot */
  .lc-timeline { position: relative; padding-left: 28px; }
  .lc-timeline::before {
    content: ''; position: absolute;
    left: 10px; top: 6px; bottom: 6px; width: 2px;
    background: linear-gradient(180deg, ${LC.primary}88, ${LC.primary}11);
    border-radius: 2px;
  }
  .lc-timeline-item { position: relative; padding: 16px 18px; }
  .lc-timeline-item::before {
    content: ''; position: absolute;
    left: -23px; top: 22px;
    width: 12px; height: 12px;
    border-radius: 50%;
    background: #fff;
    border: 3px solid ${LC.primary};
    box-shadow: 0 0 0 4px rgba(118,126,181,.10);
    transition: transform .2s ease, box-shadow .2s ease, background .2s ease;
  }
  .lc-timeline-item:hover::before { transform: scale(1.15); background: ${LC.primary}; box-shadow: 0 0 0 6px rgba(118,126,181,.18); }

  /* ── Global mobile responsive safety net ───────────────────────────────
     About.jsx has ~27 inline grids (gridTemplateColumns: '1fr 1fr', '1fr 2fr',
     'repeat(3, 1fr)', etc.) and ~22 sections with hardcoded gaps and large
     paddings. Rather than hunt down each one, this block uses attribute
     selectors to force any inline grid to single-column on phones, scales
     down hardcoded gaps, and tightens section padding via .lc-sectpad.
     Only kicks in ≤ 720 px so desktop layout is unaffected. */
  @media (max-width: 720px) {
    /* All inline grid-template-columns → single col */
    section [style*="grid-template-columns"] {
      grid-template-columns: 1fr !important;
    }
    /* Tame large gaps coded for desktop spacing */
    section [style*="gap: 60"] { gap: 24px !important; }
    section [style*="gap: 50"] { gap: 22px !important; }
    section [style*="gap: 40"] { gap: 20px !important; }
    section [style*="gap: 36"] { gap: 18px !important; }
    section [style*="gap: 32"] { gap: 16px !important; }
    section [style*="gap: 30"] { gap: 16px !important; }
    /* Section vertical rhythm */
    .lc-sectpad { padding: 36px 16px !important; }
    /* Avoid huge maxWidths on phones causing weird inner overflow */
    section [style*="max-width: 1280"] { max-width: 100% !important; }
    /* Two-up button rows should wrap nicely instead of squashing */
    section [style*="display: flex"][style*="gap"] { flex-wrap: wrap; }
    /* Hero / huge text already uses clamp() but the inner H1 inline
       sometimes overrides. Cap font scaling on phones via attribute. */
    section h1[style*="font-size: 56"],
    section h1[style*="font-size: 48"],
    section h2[style*="font-size: 44"] {
      font-size: clamp(28px, 8vw, 38px) !important;
    }
    section h3[style*="font-size: 28"],
    section h3[style*="font-size: 24"] {
      font-size: 19px !important;
    }
    /* Inline padding 60px, 80px → squeeze */
    section [style*="padding: 80px"] { padding: 36px 16px !important; }
    section [style*="padding: 60px"] { padding: 30px 16px !important; }
    section [style*="padding: 40px"] { padding: 22px 16px !important; }
    /* Inline margin-bottom for big spacers → halve */
    section [style*="margin-bottom: 60"] { margin-bottom: 28px !important; }
    section [style*="margin-bottom: 50"] { margin-bottom: 24px !important; }
    section [style*="margin-bottom: 40"] { margin-bottom: 20px !important; }
    /* Carousel + image media items: never exceed viewport width */
    section img, section video, section iframe { max-width: 100%; height: auto; }
  }

  /* ── Back-to-top floating button with scroll-progress ring ────────
     Implementation: an outer rounded square holds a conic-gradient
     "ring" pseudo-element. --p (0..1) is set inline from JS on every
     scroll frame and controls the gradient's stop angle. A second
     pseudo punches a hole in the middle (the actual button surface),
     leaving just a thin progress arc visible around the edge. */
  .lc-totop {
    --p: 0;                     /* scroll progress, written from JS  */
    --ring: 3px;                /* progress-arc thickness            */
    position: fixed; bottom: 22px; right: 22px;
    width: 50px; height: 50px; border-radius: 999px;
    background: transparent;    /* the ::before pseudo holds the colour */
    color: #fff; border: none; padding: 0;
    display: inline-flex; align-items: center; justify-content: center;
    cursor: pointer;
    z-index: 200;
    opacity: 0; pointer-events: none;
    transform: translateY(8px);
    transition: opacity .25s ease, transform .25s ease;
    -webkit-tap-highlight-color: transparent;
    isolation: isolate;
  }
  /* The progress ring — conic-gradient driven by --p, masked into a
     thin band by an inner-padding inset cut-out. */
  .lc-totop::before {
    content: '';
    position: absolute; inset: 0;
    border-radius: inherit;
    background:
      conic-gradient(${LC.primary} calc(var(--p) * 360deg), rgba(255,255,255,0.55) 0);
    -webkit-mask:
      radial-gradient(farthest-side, transparent calc(100% - var(--ring) - 1px), #000 calc(100% - var(--ring)));
            mask:
      radial-gradient(farthest-side, transparent calc(100% - var(--ring) - 1px), #000 calc(100% - var(--ring)));
    z-index: 0;
  }
  /* The solid filled button surface sitting INSIDE the ring. */
  .lc-totop::after {
    content: '';
    position: absolute; inset: calc(var(--ring) + 2px);
    border-radius: inherit;
    background: ${LC.primaryDark};
    box-shadow: 0 10px 24px -8px rgba(94,101,144,0.55),
                0 2px 4px rgba(10,14,26,0.08);
    transition: background .2s ease;
    z-index: 1;
  }
  .lc-totop > svg { position: relative; z-index: 2; }
  .lc-totop:hover::after { background: ${LC.primary}; }
  .lc-totop.lc-show { opacity: 1; pointer-events: auto; transform: translateY(0); }
  /* The arrow itself drifts up and settles, on a loop, so the control reads as
     a direction rather than a dot. Pauses under the cursor — an element that
     keeps moving while you are aiming at it is a worse target. */
  @keyframes lc-totop-bob {
    0%, 62%, 100% { transform: translateY(0); }
    28%           { transform: translateY(-4px); }
  }
  /* Transform only — opacity stays owned by the .lc-show rule and its
     transition. An animation that also drove opacity left the button stuck
     invisible whenever animations were frozen (a backgrounded tab), because
     the held keyframe was the transparent one. */
  @keyframes lc-totop-pop {
    from { transform: translateY(10px) scale(.82); }
    60%  { transform: translateY(-2px) scale(1.06); }
    to   { transform: translateY(0) scale(1); }
  }
  .lc-totop.lc-show { animation: lc-totop-pop .38s cubic-bezier(.2,.7,.2,1); }
  .lc-totop.lc-show > svg { animation: lc-totop-bob 2.6s ease-in-out infinite; }
  .lc-totop:hover > svg { animation-play-state: paused; transform: translateY(-2px); }
  .lc-totop:active > svg { transform: translateY(0); }
  .lc-totop > svg { transition: transform .18s cubic-bezier(.2,.7,.2,1); }
  @media (prefers-reduced-motion: reduce) {
    .lc-totop.lc-show, .lc-totop.lc-show > svg { animation: none; }
  }
  @media (max-width: 520px) {
    .lc-totop { bottom: 16px; right: 16px; width: 46px; height: 46px; --ring: 2.5px; }
  }
`;
