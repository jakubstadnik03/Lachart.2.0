// LaChart marketing / About landing page.
//
// Structure lifted from the high-fidelity design handoff
// (design_handoff_lachart_about_page) — tokens in :root via index.css,
// Hind Vadodara loaded globally, all sections rendered in React with
// IntersectionObserver-driven reveals and prefers-reduced-motion
// honoured by .lc-reveal in index.css.
//
// Sections (top → bottom):
//   1.  Top utility banner (free demo CTA)
//   2.  Sticky nav
//   3.  Hero — blobs + grid background, gradient h1, floating badges
//   4.  Social-proof strip
//   5.  Audiences (Coaches · Athletes · Cyclists · Triathletes)
//   6.  Features grid w/ filter chips
//   7-13. Seven feature deep-dives in BrowserFrame
//   14. Methodology — 4 threshold methods
//   15. Integrations (Strava / FIT / Manual)
//   16. Testimonials
//   17. What's new (changelog)
//   5b. Workspaces tabs (Athlete / Coach / Tester) — moved up
//   19. App download (App Store + Play badges)
//   20. Pricing — Free / Pro / Coach (kept verbatim from prior About so
//       any IAP-sensitive copy stays unchanged for the web)
//   21. FAQ accordion (reuses prior faqItems data)
//   22. CTA card
//   23. Footer
import React, { useEffect, useRef, useState, Suspense } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { useReducedMotion } from 'framer-motion';
import { useAuth } from '../context/AuthProvider';
import { isCapacitorNative } from '../utils/isNativeApp';
import { trackEvent } from '../utils/analytics';

const AboutGallerySection = React.lazy(() => import('../components/About/AboutGallerySection'));

/* ─── design-handoff palette mapped to short JS constants ─────────────── */
const LC = {
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

/* ─── Reveal — single IntersectionObserver hook ───────────────────────── */
function useReveal(refs) {
  const reduce = useReducedMotion();
  useEffect(() => {
    if (reduce) return;
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) e.target.classList.add('lc-in'); }),
      { threshold: 0.15, rootMargin: '0px 0px -10% 0px' }
    );
    refs.forEach((el) => { if (el) io.observe(el); });
    return () => io.disconnect();
  }, [refs, reduce]);
}

/* ─── Eyebrow pill (with pulsing dot) ─────────────────────────────────── */
const Eyebrow = ({ children }) => (
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
const BrowserFrame = ({ label, children }) => (
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
const STYLE = `
  /* About uses smooth-scroll for anchor nav — scoped to .lc-page so the
     rest of the app keeps its instant scroll. */
  .lc-page { scroll-behavior: smooth; }
  html:has(.lc-page) { scroll-behavior: smooth; }

  /* Reveal: y-translate / x-translate / scale variants, generous stagger.
     Left/right use clip-safe translate so they never cause overflow-x scroll. */
  .lc-reveal { opacity: 0; transition: opacity .9s cubic-bezier(.2,.7,.2,1), transform 1s cubic-bezier(.2,.7,.2,1); will-change: transform, opacity; }
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
  .lc-page { font-family: 'Hind Vadodara', system-ui, -apple-system, sans-serif; color: ${LC.text}; background: radial-gradient(ellipse 40% 30% at 80% 0%, rgba(123,194,235,.18) 0%, transparent 70%), radial-gradient(ellipse 50% 40% at 0% 30%, rgba(118,126,181,.16) 0%, transparent 70%), linear-gradient(180deg, #FFFFFF 0%, #F8FAFD 100%); background-attachment: fixed; min-height: 100vh; overflow-x: hidden; }
  .lc-page section { scroll-margin-top: 80px; overflow-x: hidden; }
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
`;

export default function About() {
  const { isAuthenticated } = useAuth();

  // ── Hooks (must run on every render — keep above any early return so
  //    react-hooks/rules-of-hooks passes for the Capacitor short-circuit
  //    below).
  const revealRefs = useRef([]);
  const pushRef = (el) => { if (el && !revealRefs.current.includes(el)) revealRefs.current.push(el); };
  useReveal(revealRefs.current);

  // Nav-shadow on scroll
  const [navScrolled, setNavScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setNavScrolled(window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Feature filter
  const [featCat, setFeatCat] = useState('All');
  // Roles tab
  const [role, setRole] = useState('athlete');

  // Scroll-progress bar — drives the gradient bar pinned under the nav.
  useEffect(() => {
    const root = document.documentElement;
    const onScroll = () => {
      const max = (document.documentElement.scrollHeight - window.innerHeight) || 1;
      const p = Math.min(1, Math.max(0, window.scrollY / max));
      root.style.setProperty('--lc-progress', String(p));
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Scroll-spy — highlight the nav link whose section is currently in view.
  const [activeSection, setActiveSection] = useState('hero');
  useEffect(() => {
    const ids = ['hero', 'solutions', 'workspaces', 'features', 'methodology', 'connect', 'voices', 'pricing', 'faq'];
    const sections = ids
      .map(id => document.getElementById(id))
      .filter(Boolean);
    if (!sections.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        // Pick the entry closest to the top of the viewport.
        const visible = entries
          .filter(e => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveSection(visible[0].target.id);
      },
      { rootMargin: '-30% 0px -60% 0px', threshold: 0 }
    );
    sections.forEach(s => io.observe(s));
    return () => io.disconnect();
  }, []);

  const track = (label) => trackEvent?.('AboutPage', 'cta_click', label);

  // Capacitor: skip the public landing entirely, dump straight into the app.
  if (isCapacitorNative() && isAuthenticated) return <Navigate to="/dashboard" replace />;

  return (
    <>
      <Helmet>
        <title>Blood Lactate Testing App & Threshold Calculator | LaChart</title>
        <meta name="description" content="LaChart is a professional blood lactate testing app for athletes and coaches. Calculate LT1 &amp; LT2 thresholds, build training zones, and export PDF reports. Free calculator — no sign-up needed." />
        <meta name="keywords" content="lactate testing app, lactate threshold calculator, blood lactate test, LT1 LT2, OBLA, IAT, D-max, training zones, endurance training, sports performance" />
        <meta name="theme-color" content="#767EB5" />
        <link rel="canonical" href="https://lachart.net/" />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://lachart.net/" />
        <meta property="og:title" content="Blood Lactate Testing App & Threshold Calculator | LaChart" />
        <meta property="og:description" content="Professional lactate testing for athletes and coaches. Calculate LT1/LT2, build training zones, and export PDF reports. Free online calculator included." />
        <meta property="og:image" content="https://lachart.net/images/lachart-og.png" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:site_name" content="LaChart" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Blood Lactate Testing App & Threshold Calculator | LaChart" />
        <meta name="twitter:description" content="Professional lactate testing for athletes and coaches. Calculate LT1/LT2, build training zones, and export PDF reports." />
        <meta name="twitter:image" content="https://lachart.net/images/lachart-og.png" />
        <script type="application/ld+json">{`
          {
            "@context": "https://schema.org",
            "@type": "WebPage",
            "@id": "https://lachart.net/#webpage",
            "url": "https://lachart.net/",
            "name": "Blood Lactate Testing App & Threshold Calculator | LaChart",
            "description": "Professional blood lactate testing app for athletes and coaches. Calculate LT1 & LT2 thresholds, build training zones, and export PDF reports.",
            "isPartOf": { "@id": "https://lachart.net/#website" },
            "about": { "@id": "https://lachart.net/#webapp" },
            "inLanguage": "en",
            "speakable": {
              "@type": "SpeakableSpecification",
              "cssSelector": ["h1", "h2", ".hero-description"]
            },
            "breadcrumb": {
              "@type": "BreadcrumbList",
              "itemListElement": [
                {
                  "@type": "ListItem",
                  "position": 1,
                  "name": "Home",
                  "item": "https://lachart.net/"
                }
              ]
            }
          }
        `}</script>
        <script type="application/ld+json">{`
          {
            "@context": "https://schema.org",
            "@type": "FAQPage",
            "mainEntity": [
              {
                "@type": "Question",
                "name": "What is a lactate threshold?",
                "acceptedAnswer": {
                  "@type": "Answer",
                  "text": "The lactate threshold (LT) is the exercise intensity at which lactic acid starts to accumulate in the bloodstream faster than it can be cleared. LT1 is the first threshold (aerobic threshold) and LT2 is the second threshold (anaerobic threshold or MLSS). Both are key markers for structuring endurance training zones."
                }
              },
              {
                "@type": "Question",
                "name": "How does LaChart calculate LT1 and LT2?",
                "acceptedAnswer": {
                  "@type": "Answer",
                  "text": "LaChart supports multiple lactate threshold detection methods: OBLA (4 mmol/L fixed), D-max (maximum distance from baseline to curve), IAT (Individual Anaerobic Threshold), and Log-log method. Enter your step-test data (power or pace + lactate values) and LaChart instantly calculates and visualizes all thresholds."
                }
              },
              {
                "@type": "Question",
                "name": "Is LaChart free to use?",
                "acceptedAnswer": {
                  "@type": "Answer",
                  "text": "Yes. The lactate curve calculator and threshold analysis tool are completely free — no sign-up required. Advanced features like athlete management, training tracking, Strava integration, and PDF reports are available on paid plans."
                }
              },
              {
                "@type": "Question",
                "name": "Can coaches use LaChart for multiple athletes?",
                "acceptedAnswer": {
                  "@type": "Answer",
                  "text": "Yes. LaChart has dedicated coach plans that allow managing multiple athletes, tracking training data over time, importing FIT files from Garmin/Wahoo, syncing with Strava, and generating professional PDF reports for each athlete."
                }
              }
            ]
          }
        `}</script>
      </Helmet>

      <style>{STYLE}</style>

      <div className="lc-page lc-page-in" style={{ overflowX: 'hidden' }}>
        <div className="lc-progress" aria-hidden />
        {/* ── 1. Top banner ────────────────────────────────────────────── */}
        <div style={{
          background: `linear-gradient(90deg, ${LC.primary}, ${LC.secondary})`,
          color: '#fff', padding: '10px 16px', textAlign: 'center', fontSize: 13.5,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, flexWrap: 'wrap',
        }}>
          <span>Try calculating lactate thresholds for free — <b>no sign-up needed</b></span>
          <Link to="/lactate-curve-calculator" onClick={() => track('banner_try_demo')} style={{
            padding: '5px 14px', borderRadius: 8, background: '#fff', color: LC.primaryDark,
            textDecoration: 'none', fontSize: 12.5, fontWeight: 700,
          }}>Try demo</Link>
        </div>

        {/* ── 2. Sticky nav ────────────────────────────────────────────── */}
        <nav style={{
          position: 'sticky', top: 0, zIndex: 100,
          background: 'rgba(255,255,255,.95)',
          backdropFilter: 'blur(20px) saturate(170%)',
          WebkitBackdropFilter: 'blur(20px) saturate(170%)',
          borderBottom: '1px solid rgba(180,190,210,.18)',
          boxShadow: navScrolled ? '0 4px 18px -8px rgba(15,23,41,.12)' : 'none',
          transition: 'box-shadow .25s',
        }}>
          <div style={{ maxWidth: 1280, margin: '0 auto', padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <Link to="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, fontWeight: 700, color: LC.primaryDark, fontSize: 18, textDecoration: 'none' }}>
              <img src="/about-design/lachart-logo.png" alt="LaChart" style={{ height: 32, width: 'auto' }} />
              <span>LaChart</span>
            </Link>
            <div className="lc-nav-links" style={{ display: 'flex', gap: 4 }}>
              {[
                ['solutions',   'For whom'],
                ['workspaces',  'Workspaces'],
                ['features',    'Features'],
                ['methodology', 'Science'],
                ['connect',     'Connect'],
                ['voices',      'Voices'],
                ['/how-to-use', 'Tutorials'],
                ['pricing',     'Pricing'],
                ['faq',         'FAQ'],
              ].map(([id, label]) => (
                id.startsWith('/')
                  ? <Link key={id} to={id} className="lc-nav-link">{label}</Link>
                  : <a key={id} href={`#${id}`} className={`lc-nav-link${activeSection === id ? ' active' : ''}`}>{label}</a>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <Link to="/login" style={{ color: LC.muted, textDecoration: 'none', fontSize: 14, fontWeight: 500, padding: '8px 12px' }} className="lc-nav-ghost">Sign in</Link>
              <Link to="/signup" onClick={() => track('nav_start_free')} style={{
                padding: '10px 18px', borderRadius: 10, background: LC.primaryDark, color: '#fff',
                textDecoration: 'none', fontSize: 14, fontWeight: 700,
                boxShadow: '0 4px 12px -4px rgba(118,126,181,.5)',
              }}>Start free</Link>
            </div>
          </div>
          <style>{`@media (max-width: 880px) { .lc-nav-links, .lc-nav-ghost { display: none !important; } }`}</style>
        </nav>

        {/* ── 3. Hero ──────────────────────────────────────────────────── */}
        <section id="hero" style={{ position: 'relative', overflow: 'hidden' }}>
          {/* Background blobs */}
          <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
            <div style={{ position: 'absolute', top: -100, right: -50, width: 380, height: 380, borderRadius: '50%', background: `radial-gradient(circle, ${LC.tertiary}40 0%, transparent 70%)`, filter: 'blur(40px)' }} />
            <div style={{ position: 'absolute', top: 200, left: -80, width: 320, height: 320, borderRadius: '50%', background: `radial-gradient(circle, ${LC.primary}40 0%, transparent 70%)`, filter: 'blur(40px)' }} />
            <div style={{ position: 'absolute', bottom: 100, right: 200, width: 280, height: 280, borderRadius: '50%', background: `radial-gradient(circle, ${LC.accent}30 0%, transparent 70%)`, filter: 'blur(40px)' }} />
            <div style={{ position: 'absolute', inset: 0, opacity: 0.035, backgroundImage: 'linear-gradient(0deg, transparent 79px, rgba(15,23,41,.5) 80px), linear-gradient(90deg, transparent 79px, rgba(15,23,41,.5) 80px)', backgroundSize: '80px 80px' }} />
          </div>
          <div style={{ maxWidth: 1280, margin: '0 auto', padding: '80px 24px', position: 'relative', zIndex: 1 }}>
            <div className="lc-hero-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 60, alignItems: 'center' }}>
              {/* Left column */}
              <div ref={pushRef} className="lc-reveal">
                <Eyebrow>Blood lactate testing · Made simple</Eyebrow>
                <h1 className="lc-huge" style={{ margin: '18px 0 18px' }}>
                  Lactate Threshold<br /><em>Calculator & Testing App</em>
                </h1>
                <p className="lc-lead hero-description" style={{ margin: '0 0 24px' }}>
                  LaChart calculates LT1 &amp; LT2 thresholds from blood lactate test data, builds training zones, and tracks performance over time — one platform for athletes and coaches.
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
                  {[['LT1 / LT2', LC.primary], ['Zones', LC.secondary], ['PDF Report', LC.accent], ['Progress', LC.green]].map(([label, color]) => (
                    <span key={label} style={{
                      padding: '5px 12px', borderRadius: 9999,
                      background: color + '22', color: color + 'EE',
                      fontSize: 12, fontWeight: 700,
                      border: '1px solid ' + color + '44',
                    }}>{label}</span>
                  ))}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                  <Link to="/signup" onClick={() => track('hero_start_free')} className="lc-btn-primary">
                    Start free
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 5l7 7-7 7" /></svg>
                  </Link>
                  <Link to="/lactate-curve-calculator" onClick={() => track('hero_try_calc')} className="lc-btn-ghost">See the curve</Link>
                </div>
              </div>

              {/* Right column — product screenshot + floating badges */}
              <div ref={pushRef} className="lc-reveal right" style={{ position: 'relative' }}>
                <BrowserFrame label="lachart.net — Lactate Curve">
                  <img src="/about-design/hero-lactate-curve.jpg" alt="Lactate curve calculator — LaChart" style={{ display: 'block', width: '100%', height: 'auto' }} />
                </BrowserFrame>
                {/* Floating badges */}
                <FloatingBadge cls="lc-float lc-hero-badge" style={{ top: -14, left: -22 }} icon={
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
                } label="LT2 Threshold" value="340 W" tint={LC.accent} />
                <FloatingBadge cls="lc-float lc-hero-badge d2" style={{ bottom: -16, right: -18 }} icon={
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 12l2 2 4-4" /><circle cx="12" cy="12" r="9" /></svg>
                } label="Zone 2 Power" value="187–255 W" tint={LC.primary} />
                <FloatingBadge cls="lc-float lc-hero-badge d3" style={{ top: '40%', right: -34 }} icon={
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 2v7l-5 9a4 4 0 0 0 4 6h6a4 4 0 0 0 4-6l-5-9V2" /><path d="M8 2h8" /></svg>
                } label="La baseline" value="1.2 mmol/L" tint={LC.secondary} />
              </div>
            </div>
          </div>
          <style>{`@media (max-width: 960px) { .lc-hero-grid { grid-template-columns: 1fr !important; gap: 40px !important; } }`}</style>
        </section>

        {/* ── 4. Social proof strip ────────────────────────────────────── */}
        <div style={{
          padding: '18px 24px', background: 'rgba(255,255,255,.6)',
          borderTop: '1px solid ' + LC.border, borderBottom: '1px solid ' + LC.border,
        }}>
          <div style={{ maxWidth: 1280, margin: '0 auto', display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 20, color: LC.muted, fontSize: 12.5, fontWeight: 600 }}>
            {[
              'Cycling · Running · Triathlon · Swimming',
              'LT1, LT2, OBLA, IAT, D-max, Log-log',
              'Strava & FIT file sync',
              'PDF reports in seconds',
              'Coach & athlete workspace',
            ].map(t => (
              <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={LC.primary} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>
                {t}
              </span>
            ))}
          </div>
        </div>

        {/* ── 5. Audiences ─────────────────────────────────────────────── */}
        <section id="solutions">
          <div className="lc-sectpad">
            <div ref={pushRef} className="lc-reveal" style={{ textAlign: 'center', maxWidth: 680, margin: '0 auto 50px' }}>
              <Eyebrow>For whom</Eyebrow>
              <h2 className="lc-big" style={{ margin: '18px 0 12px' }}>Lactate testing for <em>cyclists, runners &amp; triathletes</em></h2>
              <p className="lc-lead" style={{ margin: '0 auto' }}>From the first home lactate test to a full coaching workspace — LaChart fits the way you train.</p>
            </div>
            <div className="lc-aud-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 18 }}>
              {[
                { img: 'coach-avatar.webp', title: 'Coaches', body: 'Manage multiple athletes, view historical lactate tests, track training calendars, and monitor lactate values from workouts.' },
                { img: 'runner-avatar.jpeg', title: 'Athletes', body: 'Generate lactate curves, calculate training zones, track progress over time, and record lactate to intervals.' },
                { img: 'cyclist-avatar.webp', title: 'Cyclists', body: 'Test with power, calculate zones, sync from Strava, and analyze TSS and training load.' },
                { img: 'triathlete.jpg', title: 'Triathletes', body: 'Test with pace, track improvements across the same workouts over time, and compare historical tests.' },
              ].map((a, i) => (
                <div key={a.title} ref={pushRef} className={`lc-reveal d${i+1} lc-card lc-aud-card`} style={{ padding: 22, borderRadius: 20, overflow: 'hidden' }}>
                  <img src={`/about-design/${a.img}`} alt="" loading="lazy" className="lc-aud-photo" style={{ width: 56, height: 56, borderRadius: 14, objectFit: 'cover', border: '2px solid #fff', boxShadow: '0 4px 12px -4px rgba(15,23,41,.15)', marginBottom: 14, display: 'block' }} />
                  <h3 style={{ fontSize: 20, fontWeight: 800, color: LC.ink, margin: '0 0 6px' }}>{a.title}</h3>
                  <p style={{ fontSize: 13.5, color: LC.muted, lineHeight: 1.55, margin: 0 }}>{a.body}</p>
                </div>
              ))}
            </div>
            <style>{`
              @media (max-width: 900px) { .lc-aud-grid { grid-template-columns: repeat(2, 1fr) !important; } }
              @media (max-width: 540px) { .lc-aud-grid { grid-template-columns: 1fr !important; } }
            `}</style>
          </div>
        </section>

        {/* ── 5b. Workspaces (was section 18) — moved up so visitors see the role split before scrolling past Audiences. */}
        <section id="workspaces">
          <div className="lc-sectpad">
            <div ref={pushRef} className="lc-reveal" style={{ textAlign: 'center', maxWidth: 760, margin: '0 auto 30px' }}>
              <Eyebrow>Three workspaces · one app</Eyebrow>
              <h2 className="lc-big" style={{ margin: '18px 0 12px' }}>Athlete, coach <em>&amp; tester workspace</em></h2>
              <p className="lc-lead" style={{ margin: '0 auto' }}>LaChart adapts to how you use it — train yourself, manage athlete lactate tests, or run tests for clients. Same data, three completely different shells.</p>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 30, flexWrap: 'wrap' }}>
              {ROLES.map(r => (
                <button key={r.id} onClick={() => setRole(r.id)} style={{
                  padding: '10px 22px', borderRadius: 9999,
                  border: role === r.id ? 'none' : '1px solid ' + LC.border,
                  background: role === r.id ? LC.primaryDark : '#fff',
                  color: role === r.id ? '#fff' : LC.muted,
                  fontSize: 14, fontWeight: 700, cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  transition: 'all .2s',
                }}>
                  {r.icon}
                  {r.label}
                </button>
              ))}
            </div>
            {ROLES.filter(r => r.id === role).map(r => (
              <div key={r.id} className="lc-role-panel" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 60, alignItems: 'center' }}>
                <div>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 14px', borderRadius: 9999, background: '#fff', border: '1px solid ' + LC.border, fontSize: 12, fontWeight: 700, color: LC.primaryDark, marginBottom: 14 }}>
                    <span style={{ width: 26, height: 26, borderRadius: '50%', background: LC.primaryTint, color: LC.primary, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{r.icon}</span>
                    For {r.label.toLowerCase()}
                  </span>
                  <h3 className="lc-big" style={{ fontSize: '28px !important', margin: '8px 0 14px' }} dangerouslySetInnerHTML={{ __html: r.heading }} />
                  <p className="lc-lead" style={{ margin: '0 0 18px' }}>{r.lead}</p>
                  <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 22px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {r.features.map(f => (
                      <li key={f.title} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 13.5, color: LC.text }}>
                        <span style={{ width: 22, height: 22, borderRadius: '50%', background: LC.primaryTint, color: LC.primary, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>
                        </span>
                        <span><b style={{ color: LC.ink }}>{f.title}</b> — {f.body}</span>
                      </li>
                    ))}
                  </ul>
                  <Link to="/signup" onClick={() => track(`role_${r.id}_start`)} className="lc-btn-primary">
                    Start as {r.label.toLowerCase()}
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 5l7 7-7 7" /></svg>
                  </Link>
                </div>
                <RoleCompGrid role={r.id} />

              </div>
            ))}
            <style>{`@media (max-width: 960px) { .lc-role-panel { grid-template-columns: 1fr !important; gap: 30px !important; } }`}</style>
          </div>
        </section>

        {/* ── 6. Features grid w/ filter chips ─────────────────────────── */}
        <section id="features">
          <div className="lc-sectpad">
            <div ref={pushRef} className="lc-reveal" style={{ textAlign: 'center', maxWidth: 760, margin: '0 auto 30px' }}>
              <Eyebrow>Platform features</Eyebrow>
              <h2 className="lc-big" style={{ margin: '18px 0 12px' }}>Lactate testing, <em>threshold analysis &amp; zone builder</em></h2>
              <p className="lc-lead" style={{ margin: '0 auto' }}>Everything for lactate-based training — blood lactate curve generation, LT1/LT2 detection, zone builder, FIT upload, and coaching tools in one place.</p>
            </div>
            <div ref={pushRef} className="lc-reveal d1" style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginBottom: 30 }}>
              {['All','Testing','Analysis','Training','Progress','Integration','Tools'].map(cat => (
                <button key={cat} onClick={() => setFeatCat(cat)} style={{
                  padding: '7px 16px', borderRadius: 9999, cursor: 'pointer',
                  background: featCat === cat ? LC.primaryDark : '#fff',
                  color: featCat === cat ? '#fff' : LC.muted,
                  fontSize: 13, fontWeight: 700,
                  border: featCat === cat ? 'none' : '1px solid ' + LC.border,
                  transition: 'all .2s',
                }}>{cat}</button>
              ))}
            </div>
            <div ref={pushRef} className="lc-reveal d2 lc-feat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
              {FEATURES.filter(f => featCat === 'All' || f.cat === featCat).map((f) => (
                <article key={f.title + featCat} className="lc-card lc-feat-card" style={{ padding: 22 }}>
                  <div className="lc-feat-icon" style={{ width: 40, height: 40, borderRadius: 12, background: LC.primaryTint, display: 'flex', alignItems: 'center', justifyContent: 'center', color: LC.primary, marginBottom: 12 }}>
                    {f.icon}
                  </div>
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: LC.primary, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{f.cat}</span>
                  <h4 style={{ fontSize: 15, fontWeight: 700, color: LC.ink, margin: '6px 0 8px' }}>{f.title}</h4>
                  <p style={{ fontSize: 13.5, color: LC.muted, lineHeight: 1.55, margin: 0 }}>{f.body}</p>
                </article>
              ))}
            </div>
            <style>{`
              @media (max-width: 900px) { .lc-feat-grid { grid-template-columns: repeat(2, 1fr) !important; } }
              @media (max-width: 540px) { .lc-feat-grid { grid-template-columns: 1fr !important; } }
            `}</style>
          </div>
        </section>

        {/* ── 7-13. Seven deep-dive sections ───────────────────────────── */}
        {DEEPDIVES.map((d, i) => (
          <section key={d.title}>
            <div className="lc-sectpad">
              <div className={'lc-deepdive'} style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 60,
                alignItems: 'center',
                direction: i % 2 === 1 ? 'rtl' : 'ltr',
              }}>
                <div ref={pushRef} className={`lc-reveal ${i % 2 === 1 ? 'right' : 'left'}`} style={{ direction: 'ltr' }}>
                  <Eyebrow>{d.eb}</Eyebrow>
                  <h2 className="lc-big" style={{ margin: '18px 0 16px' }} dangerouslySetInnerHTML={{ __html: d.title }} />
                  <p className="lc-lead" style={{ margin: '0 0 20px' }}>{d.lead}</p>
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {d.bullets.map(b => (
                      <li key={b} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 14, color: LC.text }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={LC.primary} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 3 }}><path d="M5 13l4 4L19 7" /></svg>
                        {b}
                      </li>
                    ))}
                  </ul>
                  {d.tags && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 16 }}>
                      {d.tags.map(t => <span key={t} style={{ padding: '4px 10px', borderRadius: 9999, background: LC.primaryTint, color: LC.primaryDark, fontSize: 11.5, fontWeight: 700 }}>{t}</span>)}
                    </div>
                  )}
                </div>
                <div ref={pushRef} className={`lc-reveal ${i % 2 === 1 ? 'left' : 'right'}`} style={{ direction: 'ltr' }}>
                  <BrowserFrame label={d.url}>
                    <img src={`/about-design/${d.img}`} alt={d.title.replace(/<[^>]+>/g, '')} loading="lazy" style={{ display: 'block', width: '100%', height: 'auto' }} />
                  </BrowserFrame>
                </div>
              </div>
              <style>{`@media (max-width: 960px) { .lc-deepdive { grid-template-columns: 1fr !important; gap: 30px !important; direction: ltr !important; } }`}</style>
            </div>
          </section>
        ))}

        {/* ── 14. Methodology ──────────────────────────────────────────── */}
        <section id="methodology">
          <div className="lc-sectpad">
            <div ref={pushRef} className="lc-reveal" style={{ textAlign: 'center', maxWidth: 760, margin: '0 auto 40px' }}>
              <Eyebrow>The science</Eyebrow>
              <h2 className="lc-big" style={{ margin: '18px 0 12px' }}>LT1, LT2, OBLA &amp; D-max — <em>four lactate threshold methods</em></h2>
              <p className="lc-lead" style={{ margin: '0 auto' }}>LaChart calculates lactate thresholds using OBLA, D-max, IAT and Log-log — the four most-cited methods in exercise science. Use them side by side or stick to your federation's standard.</p>
            </div>
            <div className="lc-meth-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
              {METHODS.map((m, i) => (
                <article key={m.name} ref={pushRef} className={`lc-reveal d${i+1} lc-card lc-meth-card`}>
                  {m.tag && <span style={{ display: 'inline-block', fontSize: 10, fontWeight: 800, color: LC.green, textTransform: 'uppercase', letterSpacing: '0.08em', padding: '3px 8px', borderRadius: 9999, background: LC.green + '18', marginBottom: 10 }}>{m.tag}</span>}
                  <h4 style={{ fontSize: 22, fontWeight: 800, color: LC.ink, margin: '0 0 4px' }} dangerouslySetInnerHTML={{ __html: m.name }} />
                  <p style={{ fontSize: 12, color: LC.primary, fontWeight: 600, margin: '0 0 12px' }}>{m.sub}</p>
                  <p style={{ fontSize: 13.5, color: LC.muted, lineHeight: 1.55, margin: '0 0 12px' }}>{m.body}</p>
                  <div className="lc-eq" style={{ padding: '8px 12px', borderRadius: 8, background: LC.primaryTint, fontSize: 12, fontWeight: 600, color: LC.primaryDark, fontFamily: 'monospace' }}>{m.eq}</div>
                </article>
              ))}
            </div>
            <style>{`
              @media (max-width: 900px) { .lc-meth-grid { grid-template-columns: repeat(2, 1fr) !important; } }
              @media (max-width: 540px) { .lc-meth-grid { grid-template-columns: 1fr !important; } }
            `}</style>
          </div>
        </section>

        {/* ── 14b. Learn section — SEO + organic awareness ──────────────
            Surfaces our guide articles in the About page so visitors
            evaluating LaChart can dive into the science before they
            sign up. Each card links to a long-form article that ranks
            for a specific high-intent keyword and ends with a soft
            CTA to the free calculator. */}
        <section id="learn" style={{ background: '#fafbff' }}>
          <div className="lc-sectpad">
            <div ref={pushRef} className="lc-reveal" style={{ textAlign: 'center', maxWidth: 680, margin: '0 auto 40px' }}>
              <span style={{ display: 'inline-block', padding: '6px 14px', borderRadius: 999, background: LC.primary + '15', color: LC.primaryDark, fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 14 }}>
                Learn
              </span>
              <h2 style={{ fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: 800, color: LC.text, margin: '0 0 12px', letterSpacing: '-0.02em' }}>
                Blood lactate testing — the science explained
              </h2>
              <p style={{ fontSize: 16, color: LC.muted, lineHeight: 1.6 }}>
                Long-form guides on blood lactate testing protocols, threshold detection methods (LT1, LT2, OBLA, D-max),
                and what your lactate curve actually means for training zones.
              </p>
            </div>
            <div
              className="lc-reveal"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                gap: 18,
                maxWidth: 1200,
                margin: '0 auto',
              }}
            >
              {[
                {
                  href: '/blog/lactate-test-at-home',
                  badge: 'Protocol · 14 min',
                  title: 'How to do a lactate test at home',
                  body: 'Equipment, step protocol, blood-sampling technique, and the four mistakes that ruin a test.',
                },
                {
                  href: '/blog/lactate-test-interpretation',
                  badge: 'Reading · 11 min',
                  title: 'Read your lactate curve step-by-step',
                  body: 'Spot LT1, LT2, the curve shape clues, and the red flags that mean re-test.',
                },
                {
                  href: '/blog/lt1-vs-lt2-training-zones',
                  badge: 'Zones · 9 min',
                  title: 'LT1 vs LT2 — what they mean for training',
                  body: 'The physiological difference, why both matter, and how to build zones from each.',
                },
                {
                  href: '/blog/ftp-vs-lt2',
                  badge: 'Concepts · 10 min',
                  title: 'FTP vs LT2 — are they the same?',
                  body: 'Usually yes, sometimes no. When they diverge and which one to actually train against.',
                },
                {
                  href: '/blog/obla-dmax-iat-methods-compared',
                  badge: 'Methods · 11 min',
                  title: 'OBLA, D-max, IAT, log-log compared',
                  body: 'Why no single threshold method is perfect — and why LaChart uses an ensemble of all of them.',
                },
                {
                  href: '/blog/how-lachart-calculates-lt1-lt2',
                  badge: 'Algorithm · 12 min',
                  title: 'How LaChart calculates LT1 / LT2',
                  body: 'Inside the 8-method ensemble, isotonic regression, and the noise-detection guards.',
                },
              ].map((p) => (
                <Link
                  key={p.href}
                  to={p.href}
                  onClick={() => track('learn_card_' + p.href)}
                  style={{
                    display: 'block',
                    padding: 22,
                    borderRadius: 16,
                    background: '#fff',
                    border: '1px solid ' + LC.border,
                    textDecoration: 'none',
                    color: 'inherit',
                    boxShadow: '0 1px 2px rgba(15,23,42,.04)',
                    transition: 'transform .15s ease, box-shadow .15s ease, border-color .15s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-3px)';
                    e.currentTarget.style.boxShadow = '0 10px 30px -10px rgba(94,101,144,.3)';
                    e.currentTarget.style.borderColor = LC.primary + '40';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = '';
                    e.currentTarget.style.boxShadow = '0 1px 2px rgba(15,23,42,.04)';
                    e.currentTarget.style.borderColor = LC.border;
                  }}
                >
                  <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 999, background: LC.primary + '12', color: LC.primaryDark, fontSize: 10.5, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                    {p.badge}
                  </span>
                  <h3 style={{ fontSize: 17, fontWeight: 800, color: LC.text, margin: '12px 0 8px', lineHeight: 1.3, letterSpacing: '-0.01em' }}>
                    {p.title}
                  </h3>
                  <p style={{ fontSize: 13.5, color: LC.muted, lineHeight: 1.6, margin: 0 }}>
                    {p.body}
                  </p>
                  <span style={{ display: 'inline-block', marginTop: 12, color: LC.primaryDark, fontSize: 13, fontWeight: 700 }}>
                    Read article →
                  </span>
                </Link>
              ))}
            </div>
            <div style={{ textAlign: 'center', marginTop: 32 }}>
              <Link
                to="/lactate-guide"
                onClick={() => track('learn_all')}
                style={{ display: 'inline-block', padding: '12px 24px', borderRadius: 12, background: LC.primary, color: '#fff', textDecoration: 'none', fontSize: 14, fontWeight: 700, boxShadow: '0 6px 16px -4px rgba(94,101,144,.4)' }}
              >
                Browse all articles →
              </Link>
            </div>
          </div>
        </section>

        {/* ── 15. Integrations ─────────────────────────────────────────── */}
        <section id="connect">
          <div className="lc-sectpad">
            <div ref={pushRef} className="lc-reveal" style={{ textAlign: 'center', maxWidth: 680, margin: '0 auto 40px' }}>
              <Eyebrow>Integrations</Eyebrow>
              <h2 className="lc-big" style={{ margin: '18px 0 12px' }}>Strava &amp; Garmin integration <em>for lactate tracking</em></h2>
              <p className="lc-lead" style={{ margin: '0 auto' }}>Connect Strava, upload Garmin/Wahoo FIT files, or enter data manually. Every workout and lactate value flows into one platform.</p>
            </div>
            <div className="lc-int-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
              {[
                { dot: '#FF6B4A', name: 'Strava', body: 'Auto-sync activities, full interval detection, power graphs and HR zones.' },
                { dot: '#3B82F6', name: 'FIT files', body: 'Garmin, Wahoo, Polar, Suunto, Apple Watch — every device supported.' },
                { dot: '#10B981', name: 'Manual entry', body: 'Log any workout in 30 seconds — even ones without a head unit.' },
              ].map((it, i) => (
                <div key={it.name} ref={pushRef} className={`lc-reveal d${i+1} lc-card`} style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                  <span className="lc-int-dot" style={{ width: 16, height: 16, borderRadius: '50%', background: it.dot, flexShrink: 0, marginTop: 4 }} />
                  <div>
                    <h5 style={{ fontSize: 15, fontWeight: 700, color: LC.ink, margin: '0 0 6px' }}>{it.name}</h5>
                    <p style={{ fontSize: 13.5, color: LC.muted, lineHeight: 1.55, margin: 0 }}>{it.body}</p>
                  </div>
                </div>
              ))}
            </div>
            <style>{`
              @media (max-width: 900px) { .lc-int-grid { grid-template-columns: 1fr !important; } }
            `}</style>
          </div>
        </section>

        {/* ── 16. Testimonials ─────────────────────────────────────────── */}
        <section id="voices">
          <div className="lc-sectpad">
            <div ref={pushRef} className="lc-reveal" style={{ textAlign: 'center', maxWidth: 680, margin: '0 auto 40px' }}>
              <Eyebrow>Used by</Eyebrow>
              <h2 className="lc-big" style={{ margin: '18px 0 12px' }}>Lactate testing used by <em>cyclists, runners &amp; triathletes</em></h2>
            </div>
            <div className="lc-voices-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18 }}>
              {VOICES.map((v, i) => (
                <figure key={v.name} ref={pushRef} className={`lc-reveal d${i+1} lc-card lc-voice-card`} style={{ margin: 0, padding: 22 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
                    <img src={`/about-design/${v.img}`} alt="" loading="lazy" style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover' }} />
                    <div style={{ color: '#F59E0B', fontSize: 14, letterSpacing: 2 }}>★★★★★</div>
                  </div>
                  <blockquote style={{ margin: '0 0 12px', fontStyle: 'italic', color: LC.text, fontSize: 14, lineHeight: 1.55 }}>"{v.quote}"</blockquote>
                  <figcaption style={{ fontSize: 12.5 }}>
                    <strong style={{ color: LC.ink, fontWeight: 700 }}>{v.name}</strong>
                    <span style={{ color: LC.muted, marginLeft: 6 }}>· {v.role}</span>
                  </figcaption>
                </figure>
              ))}
            </div>
            <style>{`
              @media (max-width: 900px) { .lc-voices-grid { grid-template-columns: 1fr !important; } }
            `}</style>
          </div>
        </section>

        {/* ── 17. What's new — timeline ─────────────────────────────────── */}
        <section>
          <div className="lc-sectpad">
            <div ref={pushRef} className="lc-reveal" style={{ maxWidth: 680, marginBottom: 36 }}>
              <Eyebrow>What's new</Eyebrow>
              <h2 className="lc-big" style={{ margin: '18px 0 12px' }}>Latest <em>shipping notes</em></h2>
              <p className="lc-lead" style={{ margin: 0 }}>The most-recent additions to LaChart. Quarterly releases, plus one-off updates whenever something useful is ready.</p>
            </div>
            <div className="lc-timeline" style={{ maxWidth: 720 }}>
              {[
                { date: 'May 2026',  title: 'iOS app — public TestFlight',                title2: 'Mobile',     body: 'Native iOS shell with pull-to-refresh, push notifications, Apple Health import and on-device lactate recording.', cta: 'Open mobile app', href: '/download' },
                { date: 'Mar 2026',  title: 'Professional PDF reports from lactate tests', title2: 'Reports',    body: 'Generate branded PDFs with lactate + HR curves, color-coded zones, threshold tables, previous test comparison graphs and training recommendations.', cta: 'Try the calculator →', href: '/lactate-curve-calculator' },
                { date: 'Nov 2025',  title: 'Bulk Strava interval detection',              title2: 'Integration',body: 'Detect every power fluctuation, auto-create Strava laps, and analyze threshold blocks instantly. Works on a whole month of activities at once.', cta: 'See FIT analysis →', href: '/training-calendar' },
                { date: 'Oct 2025',  title: 'Responsive lactate calculator revamp',        title2: 'Tools',      body: 'The free testing-without-login flow loads faster, scales on mobile, and preserves manual adjustments.', cta: 'Open calculator →', href: '/lactate-curve-calculator' },
              ].map((u, i) => (
                <article
                  key={u.title}
                  ref={pushRef}
                  className={`lc-reveal d${i+1} lc-timeline-item`}
                  style={{ background: 'rgba(255,255,255,.55)', border: '1px solid ' + LC.border, borderRadius: 14, marginBottom: 14 }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 10.5, fontWeight: 800, color: LC.primaryDark, textTransform: 'uppercase', letterSpacing: '0.1em', padding: '3px 10px', borderRadius: 9999, background: LC.primaryTint }}>{u.date}</span>
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: LC.muted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>· {u.title2}</span>
                  </div>
                  <h4 style={{ fontSize: 16, fontWeight: 800, color: LC.ink, margin: '0 0 8px', letterSpacing: '-0.01em' }}>{u.title}</h4>
                  <p style={{ fontSize: 13.5, color: LC.muted, lineHeight: 1.6, margin: '0 0 10px' }}>{u.body}</p>
                  {u.cta && (
                    u.href.startsWith('/')
                      ? <Link to={u.href} onClick={() => track(`whatsnew_${i}`)} style={{ fontSize: 12.5, fontWeight: 700, color: LC.primary, textDecoration: 'none' }}>{u.cta}</Link>
                      : <a href={u.href} style={{ fontSize: 12.5, fontWeight: 700, color: LC.primary, textDecoration: 'none' }}>{u.cta}</a>
                  )}
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ── 19. App download badges ──────────────────────────────────── */}
        <section id="download">
          <div className="lc-sectpad" style={{ paddingTop: 0 }}>
            <div ref={pushRef} className="lc-reveal lc-card" style={{ background: 'linear-gradient(135deg, #fff, ' + LC.primaryTint + ')', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: 32, textAlign: 'center', borderRadius: 20 }}>
              <Eyebrow>Get the app</Eyebrow>
              <h3 className="lc-big" style={{ margin: 0 }}>Take your training <em>with you</em></h3>
              <p className="lc-lead" style={{ margin: 0 }}>Native iOS app with Apple Health sync, pull-to-refresh and push notifications. Android coming soon.</p>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center', marginTop: 6 }}>
                <a href="https://apps.apple.com/app/lachart" onClick={() => track('app_store_badge')} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 22px', borderRadius: 12, background: '#000', color: '#fff', textDecoration: 'none' }}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><path d="M17.05 12.04c-.03-2.8 2.29-4.15 2.4-4.21-1.31-1.92-3.35-2.18-4.07-2.21-1.73-.17-3.38 1.02-4.26 1.02-.89 0-2.24-1-3.69-.97-1.9.03-3.65 1.1-4.62 2.8-1.97 3.42-.5 8.47 1.41 11.24.94 1.36 2.04 2.88 3.48 2.83 1.41-.06 1.94-.91 3.64-.91 1.69 0 2.18.91 3.65.88 1.51-.02 2.46-1.37 3.38-2.74 1.07-1.57 1.51-3.09 1.53-3.17-.03-.01-2.93-1.12-2.95-4.46zM14.4 4.34c.78-.95 1.31-2.28 1.17-3.59-1.13.05-2.49.75-3.29 1.7-.72.84-1.36 2.18-1.19 3.48 1.26.1 2.54-.64 3.31-1.59z"/></svg>
                  <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.1 }}>
                    <span style={{ fontSize: 10, opacity: 0.75 }}>Download on the</span>
                    <span style={{ fontSize: 18, fontWeight: 700 }}>App Store</span>
                  </span>
                </a>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 22px', borderRadius: 12, background: '#fff', color: LC.muted, textDecoration: 'none', border: '1px solid ' + LC.border, opacity: 0.7 }}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><path d="M3.18 23.07l9.21-9.21 3.05 3.05-9.13 5.27-3.13-1.11zm9.91-10l9.36-5.4c.43-.25.85-.25.85.59l.05 12.06c0 .85-.42.85-.85.59l-9.36-5.4 4.31-2.44-4.36-2.44v2.44zM3.18.93l9.13 5.27-3.05 3.05L3.18 23.07v-22.14zm9.91 10l-3.05 3.05L7 11l3.05-2.95 3.04 2.88z"/></svg>
                  <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.1 }}>
                    <span style={{ fontSize: 10, opacity: 0.75 }}>Coming to</span>
                    <span style={{ fontSize: 18, fontWeight: 700 }}>Google Play</span>
                  </span>
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* ── 20. Pricing — kept from prior About ──────────────────────── */}
        <section id="pricing" style={{ background: '#fff', borderTop: '1px solid ' + LC.border }}>
          <div className="lc-sectpad">
            <div ref={pushRef} className="lc-reveal" style={{ textAlign: 'center', maxWidth: 760, margin: '0 auto 40px' }}>
              <Eyebrow>Pricing</Eyebrow>
              <h2 className="lc-big" style={{ margin: '18px 0 12px' }}>Free lactate threshold calculator — <em>no sign-up needed</em></h2>
              <p className="lc-lead" style={{ margin: '0 auto' }}>LaChart is in <b style={{ color: LC.text }}>early access</b> — every feature is free while we build and improve. Paid plans are planned for the future.</p>
            </div>
            <div ref={pushRef} className="lc-reveal lc-card" style={{ padding: 24, marginBottom: 22, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 16, background: 'linear-gradient(135deg, ' + LC.primaryTint + ', #fff)', border: '1px solid ' + LC.primary + '33' }}>
              <div style={{ width: 48, height: 48, borderRadius: 14, background: LC.primaryTint, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={LC.primary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l3 7h7l-5.5 4.5L18 21l-6-4-6 4 1.5-7.5L2 9h7z" /></svg>
              </div>
              <div style={{ flex: 1, minWidth: 240 }}>
                <p style={{ fontWeight: 700, color: LC.ink, margin: 0 }}>Free during demo & early access</p>
                <p style={{ fontSize: 13, color: LC.muted, margin: '4px 0 0', lineHeight: 1.5 }}>All features — lactate testing, FIT analysis, Strava sync, coaching tools — are fully available at no cost. When paid plans launch, existing users will get a generous discount.</p>
              </div>
              <Link to="/signup" onClick={() => track('pricing_signup_banner')} className="lc-btn-primary" style={{ flexShrink: 0 }}>Sign up free →</Link>
            </div>
            <div className="lc-price-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18, opacity: 0.85 }}>
              <PriceCard name="Free" price="$0" features={['Up to 5 lactate tests / month', 'Basic analytics', 'FIT file upload', 'Strava & Garmin sync', 'Training calendar']} ctaLabel="Get started free" ctaTo="/signup" track={track} />
              <PriceCard name="Pro" price="$9.99" badge="Coming soon" highlighted features={['Unlimited lactate tests', 'FIT analysis — intervals & power charts', 'Advanced analytics', 'PDF report export', 'Population comparison', 'Priority support']} ctaLabel="Access free now" ctaTo="/signup" track={track} />
              <PriceCard name="Coach" price="$19.99" badge="Coming soon" features={['Everything in Pro', 'Manage up to 10 athletes', 'Coach dashboard', 'Athlete performance overview', 'Bulk data export']} ctaLabel="Access free now" ctaTo="/signup" track={track} />
            </div>
            <style>{`@media (max-width: 900px) { .lc-price-grid { grid-template-columns: 1fr !important; } }`}</style>
          </div>
        </section>

        {/* ── 21. FAQ ──────────────────────────────────────────────────── */}
        <section id="faq">
          <div className="lc-sectpad" style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 60 }}>
            <div ref={pushRef} className="lc-reveal left">
              <Eyebrow>FAQ</Eyebrow>
              <h2 className="lc-big" style={{ margin: '18px 0 12px' }}>Lactate testing — <em>common questions</em></h2>
              <p className="lc-lead" style={{ margin: 0 }}>Everything you need to know about blood lactate testing, LT1/LT2 thresholds, and LaChart. Can't find it? <a href="mailto:support@lachart.net" style={{ color: LC.primaryDark, fontWeight: 600 }}>Email us</a>.</p>
            </div>
            <div ref={pushRef} className="lc-reveal right" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {FAQ.map(item => (
                <details key={item.q} style={{ background: '#fff', border: '1px solid ' + LC.border, borderRadius: 14, padding: '14px 18px', cursor: 'pointer' }}>
                  <summary style={{ listStyle: 'none', fontSize: 15, fontWeight: 700, color: LC.ink, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                    {item.q}
                    <span style={{ width: 24, height: 24, borderRadius: '50%', background: LC.primaryTint, color: LC.primary, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 16, fontWeight: 800 }}>+</span>
                  </summary>
                  <p style={{ fontSize: 14, color: LC.muted, lineHeight: 1.6, margin: '12px 0 0' }}>{item.a}</p>
                </details>
              ))}
            </div>
          </div>
          <style>{`@media (max-width: 900px) { #faq .lc-sectpad { grid-template-columns: 1fr !important; gap: 30px !important; } }`}</style>
        </section>

        {/* ── 22. CTA ──────────────────────────────────────────────────── */}
        <section id="cta">
          <div className="lc-sectpad">
            <div ref={pushRef} className="lc-reveal scale" style={{
              padding: '60px 32px', borderRadius: 24, textAlign: 'center',
              background: `linear-gradient(135deg, ${LC.primary}, ${LC.secondary})`,
              color: '#fff',
            }}>
              <h2 className="lc-big" style={{ color: '#fff', margin: '0 0 14px' }}>Run your first blood lactate test — it's free</h2>
              <p style={{ fontSize: 17, opacity: 0.92, maxWidth: 580, margin: '0 auto 22px' }}>No credit card. No downloads. Enter your lactate test values and see your LT1 &amp; LT2 thresholds in seconds.</p>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
                <Link to="/signup" onClick={() => track('cta_start_free')} style={{ padding: '14px 28px', borderRadius: 12, background: '#fff', color: LC.primaryDark, textDecoration: 'none', fontSize: 15, fontWeight: 700, boxShadow: '0 8px 24px -6px rgba(0,0,0,.25)' }}>
                  Start free
                </Link>
                <Link to="/lactate-curve-calculator" onClick={() => track('cta_try_calc')} style={{ padding: '14px 28px', borderRadius: 12, background: 'rgba(255,255,255,.12)', color: '#fff', textDecoration: 'none', fontSize: 15, fontWeight: 700, border: '1px solid rgba(255,255,255,.3)' }}>
                  Try the calculator
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* ── About gallery (preserved from prior page) ────────────────── */}
        <Suspense fallback={null}>
          <AboutGallerySection BrowserFrame={BrowserFrame} LazyImage={LazyImg} />
        </Suspense>

        {/* ── 23. Footer ───────────────────────────────────────────────── */}
        <footer style={{ background: '#fff', borderTop: '1px solid ' + LC.border, padding: '40px 24px 24px', marginTop: 40 }}>
          <div style={{ maxWidth: 1280, margin: '0 auto', display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 30 }} className="lc-footer-grid">
            <div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <img src="/about-design/lachart-logo.png" alt="LaChart" style={{ height: 28 }} />
                <span style={{ fontSize: 16, fontWeight: 700, color: LC.primaryDark }}>LaChart</span>
              </div>
              <p style={{ fontSize: 13, color: LC.muted, lineHeight: 1.6, maxWidth: 320 }}>Lactate testing for endurance athletes and coaches. Calculate thresholds, build zones, generate PDF reports.</p>
            </div>
            {[
              { h: 'Product', l: [['Features','#features'], ['Pricing','#pricing'], ['Calculator','/lactate-curve-calculator'], ['Tutorials','/how-to-use']] },
              { h: 'Learn',   l: [
                ['Lactate Guide','/lactate-guide'],
                ['Test at home','/blog/lactate-test-at-home'],
                ['Read your curve','/blog/lactate-test-interpretation'],
                ['LT1 vs LT2','/blog/lt1-vs-lt2-training-zones'],
                ['FTP vs LT2','/blog/ftp-vs-lt2'],
              ] },
              { h: 'Company', l: [['About','#hero'], ['Blog','/lactate-guide'], ['Contact','/contact']] },
              { h: 'Legal',   l: [['Privacy','/privacy'], ['Terms','/terms']] },
            ].map(col => (
              <div key={col.h}>
                <h6 style={{ fontSize: 11.5, fontWeight: 800, color: LC.primaryDark, textTransform: 'uppercase', letterSpacing: '0.12em', margin: '0 0 12px' }}>{col.h}</h6>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {col.l.map(([label, href]) => (
                    <li key={label}>
                      {href.startsWith('/') ? <Link to={href} style={{ fontSize: 13.5, color: LC.muted, textDecoration: 'none' }}>{label}</Link>
                                            : <a href={href} style={{ fontSize: 13.5, color: LC.muted, textDecoration: 'none' }}>{label}</a>}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div style={{ maxWidth: 1280, margin: '24px auto 0', paddingTop: 18, borderTop: '1px solid ' + LC.border, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <span style={{ fontSize: 12, color: LC.muted }}>© {new Date().getFullYear()} LaChart. All rights reserved.</span>
            <span style={{ fontSize: 12, color: LC.muted }}>Made for athletes who measure.</span>
          </div>
          <style>{`@media (max-width: 720px) { .lc-footer-grid { grid-template-columns: 1fr 1fr !important; } } @media (max-width: 480px) { .lc-footer-grid { grid-template-columns: 1fr !important; } }`}</style>
        </footer>
      </div>
    </>
  );
}

/* ─── LazyImg — minimal <picture>/<img> fallback so the legacy
   AboutGallerySection (which expects a LazyImage prop) keeps working
   without pulling in the old large component definition. */
function LazyImg({ src, alt, className, webpSrcSet, sizes }) {
  return (
    <picture>
      {webpSrcSet && <source type="image/webp" srcSet={webpSrcSet} sizes={sizes} />}
      <img src={src} alt={alt} className={className} loading="lazy" />
    </picture>
  );
}

/* ─── Floating-badge subcomponent ────────────────────────────────────── */
/* ─── RoleCompGrid — illustrative product-collage fragments per role.
   Lifted from the handoff's .comp-grid / .gc cards. Each fragment is
   pure SVG / CSS — no real components — so it renders fast and avoids
   coupling marketing to live app code. */
function RoleCompGrid({ role }) {
  if (role === 'athlete') return <AthleteCompGrid />;
  if (role === 'coach')   return <CoachCompGrid />;
  return <TesterCompGrid />;
}

/* shared faux-card style */
const gcStyle = {
  background: '#fff',
  border: '1px solid ' + LC.border,
  borderRadius: 18,
  padding: 16,
  position: 'relative',
};
const gcDark = {
  ...gcStyle,
  background: 'linear-gradient(160deg, #1F2738, #0F1729)',
  color: '#fff',
  border: '1px solid rgba(255,255,255,.08)',
};
const lblC = { fontSize: 10, fontWeight: 800, color: LC.muted, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10, display: 'block' };
const numF = { fontVariantNumeric: 'tabular-nums' };

function AthleteCompGrid() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 10 }}>
      {/* Form ring */}
      <section style={{ ...gcStyle, gridColumn: 'span 6' }}>
        <span style={lblC}>Form · Today</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <svg width="100" height="100" viewBox="0 0 110 110">
            <circle cx="55" cy="55" r="44" fill="none" stroke="rgba(180,190,210,.30)" strokeWidth="9"/>
            <circle cx="55" cy="55" r="44" fill="none" stroke="#22C55E" strokeWidth="9" strokeDasharray="200 290" strokeLinecap="round" transform="rotate(-90 55 55)"/>
            <text x="55" y="60" textAnchor="middle" fontFamily="Hind Vadodara" fontSize="22" fontWeight="800" fill={LC.ink}>+25</text>
            <text x="55" y="76" textAnchor="middle" fontFamily="Hind Vadodara" fontSize="9" fontWeight="700" fill={LC.muted} letterSpacing="1.5">TSB</text>
          </svg>
          <div>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 9999, background: 'rgba(34,197,94,.14)', color: '#047857', border: '1px solid rgba(16,185,129,.3)', fontSize: 10.5, fontWeight: 700 }}>
              <i style={{ width: 6, height: 6, borderRadius: '50%', background: '#22C55E' }} />Fresh
            </span>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 8 }}>
              <div><div style={{ fontSize: 9.5, color: LC.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Fitness</div><div style={{ fontSize: 18, fontWeight: 800, color: LC.ink, ...numF }}>59</div></div>
              <div><div style={{ fontSize: 9.5, color: LC.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Fatigue</div><div style={{ fontSize: 18, fontWeight: 800, color: LC.ink, ...numF }}>31</div></div>
            </div>
          </div>
        </div>
      </section>
      {/* LT pair */}
      <section style={{ ...gcStyle, gridColumn: 'span 6' }}>
        <span style={lblC}>Thresholds · Bike</span>
        <LtPair />
      </section>
      {/* Daily TSS bars */}
      <section style={{ ...gcStyle, gridColumn: 'span 8' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <span style={{ ...lblC, margin: 0 }}>Daily TSS · this week</span>
          <span style={{ fontSize: 10.5, color: LC.muted, fontWeight: 600 }}>27.4 — 3.5</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, alignItems: 'end', height: 88 }}>
          {[['M',78,97],['T',92,109],['W',82,101],['T',85,103],['F',74,93],['S',10,14],['S',4,null]].map(([d, h, v], i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{ flex: 1, width: '100%', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                <div style={{ width: 18, height: `${h}%`, background: h < 20 ? LC.border : LC.primary, borderRadius: 3 }} />
              </div>
              <span style={{ fontSize: 9, fontWeight: 700, color: LC.muted }}>{d}</span>
              <span style={{ fontSize: 9, color: LC.muted, ...numF }}>{v ?? '·'}</span>
            </div>
          ))}
        </div>
      </section>
      {/* LT2 stat */}
      <section style={{ ...gcStyle, gridColumn: 'span 4' }}>
        <span style={lblC}>LT2 trend</span>
        <div style={{ fontSize: 32, fontWeight: 800, color: LC.ink, ...numF }}>418<small style={{ fontSize: 14, color: LC.muted, marginLeft: 4 }}>W</small></div>
        <div style={{ fontSize: 11, color: LC.muted, marginBottom: 8 }}><b style={{ color: LC.green }}>+ 12 W</b> over 8 tests</div>
        <div style={{ display: 'flex', gap: 3 }}>
          {[0,0,1,1,1,1,1,1].map((on, i) => (
            <span key={i} style={{ flex: 1, height: 8, borderRadius: 2, background: on ? LC.primary : LC.border }} />
          ))}
        </div>
      </section>
      {/* Weekly KPIs */}
      <section style={{ ...gcStyle, gridColumn: 'span 8' }}>
        <span style={lblC}>Weekly summary</span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          {[['Time','16h 42m'],['TSS','517'],['Distance','369 km'],['Sessions','13']].map(([l,v]) => (
            <div key={l} style={{ padding: '8px 10px', borderRadius: 10, background: '#F8FAFD', border: '1px solid ' + LC.border }}>
              <div style={{ fontSize: 9.5, color: LC.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{l}</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: LC.ink, ...numF }}>{v}</div>
            </div>
          ))}
        </div>
      </section>
      {/* iOS tabs (dark) */}
      <section style={{ ...gcDark, gridColumn: 'span 4' }}>
        <span style={{ ...lblC, color: 'rgba(255,255,255,.5)' }}>iOS</span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', background: 'rgba(255,255,255,.06)', borderRadius: 14, padding: 8, border: '1px solid rgba(255,255,255,.08)', marginTop: 6 }}>
          {[{ on: true, label: 'Home', d: 'M3 11l9-8 9 8M5 10v10h14V10' },
            { label: 'Test', d: 'M4 4h16v16H4zM4 12h16M12 4v16' },
            { label: 'Cal', d: 'M3 7h18v14H3zM3 11h18M8 3v4M16 3v4' },
            { label: 'Train', d: 'M13 2L4 14h7l-1 8 9-12h-7l1-8z' }].map((t, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '6px 0', color: t.on ? '#A5B4FC' : 'rgba(255,255,255,.5)' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={t.d} /></svg>
              <span style={{ fontSize: 9, fontWeight: 700 }}>{t.label}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function CoachCompGrid() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 10 }}>
      {/* Athletes header */}
      <section style={{ ...gcStyle, gridColumn: 'span 6' }}>
        <span style={lblC}>Athletes · header</span>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div>
            <h3 style={{ fontSize: 20, margin: 0, color: LC.ink, fontWeight: 800, letterSpacing: '-0.02em' }}>Athletes</h3>
            <p style={{ margin: '4px 0 0', fontSize: 11.5, color: LC.muted }}>3 athletes in your team</p>
          </div>
          <button style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 11, background: `linear-gradient(160deg, ${LC.accent}, #6D4FBE)`, color: '#fff', border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', boxShadow: '0 6px 14px -6px rgba(140,103,217,.55)' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="9" r="4"/><path d="M3 21c0-4 3-7 6-7s6 3 6 7M17 7v6M14 10h6"/></svg>
            Add
          </button>
        </div>
      </section>
      {/* Athlete switcher */}
      <section style={{ ...gcStyle, gridColumn: 'span 6' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{ ...lblC, margin: 0 }}>Coach · switcher</span>
          <span style={{ fontSize: 10.5, color: LC.muted, fontWeight: 600 }}>Manage →</span>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {[
            { name: 'Jan',   grad: 'linear-gradient(135deg,#7C3AED,#3B82F6)' },
            { name: 'Filip', grad: 'linear-gradient(135deg,#92400E,#1F2738)', dot: 'fresh', on: true },
            { name: 'Lea',   grad: 'linear-gradient(135deg,#FCD34D,#3B82F6)', dot: 'stale' },
            { name: 'Jakub', grad: 'linear-gradient(135deg,#22C55E,#3B82F6)', dot: 'fresh' },
          ].map((a, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, opacity: a.on ? 1 : 0.85 }}>
              <div style={{ position: 'relative' }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: a.grad, border: a.on ? `2px solid ${LC.accent}` : '2px solid transparent' }} />
                {a.dot && <span style={{ position: 'absolute', bottom: 0, right: 0, width: 8, height: 8, borderRadius: '50%', background: a.dot === 'fresh' ? '#22C55E' : '#F59E0B', border: '1.5px solid #fff' }} />}
              </div>
              <span style={{ fontSize: 10.5, fontWeight: 700, color: LC.text }}>{a.name}</span>
            </div>
          ))}
        </div>
      </section>
      {/* Athlete card */}
      <section style={{ ...gcStyle, gridColumn: 'span 8' }}>
        <span style={lblC}>Athlete card</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: 'linear-gradient(135deg,#92400E,#1F2738)', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: LC.ink }}>Filip Stádník</div>
            <div style={{ fontSize: 11.5, color: LC.muted, marginTop: 1 }}>fstadnik01@gmail.com</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
              <span style={{ padding: '2px 8px', borderRadius: 9999, background: 'rgba(140,103,217,.12)', color: LC.accent, fontSize: 10.5, fontWeight: 700 }}>triathlon</span>
              <span style={{ fontSize: 11, color: LC.muted }}>183 cm · 73 kg</span>
            </div>
          </div>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: LC.accent, fontWeight: 700 }}>
            Profile
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6"/></svg>
          </span>
        </div>
      </section>
      {/* Ready for lactate */}
      <section style={{ ...gcStyle, gridColumn: 'span 4' }}>
        <span style={lblC}>Ready for lactate</span>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'rgba(140,103,217,.06)', borderRadius: 12 }}>
          <span style={{ position: 'absolute', left: 0, top: 8, bottom: 8, width: 3, borderRadius: 2, background: LC.accent }} />
          <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(140,103,217,.16)', color: LC.accent, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginLeft: 4 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="17" r="3.5"/><circle cx="18" cy="17" r="3.5"/><path d="M6 17l4-8h5l3 8M10 9l-1-3h3"/></svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: LC.ink }}>Bike Threshold · Filip</div>
            <div style={{ fontSize: 10.5, color: LC.muted }}>Today · 2h 30m · 23 laps</div>
          </div>
        </div>
      </section>
      {/* Weekly KPIs */}
      <section style={{ ...gcStyle, gridColumn: 'span 8' }}>
        <span style={lblC}>Filip · this week</span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          {[['Time','12h 18m'],['TSS','432'],['Sessions','9'],['Lactate','5×']].map(([l,v]) => (
            <div key={l} style={{ padding: '8px 10px', borderRadius: 10, background: '#F8FAFD', border: '1px solid ' + LC.border }}>
              <div style={{ fontSize: 9.5, color: LC.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{l}</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: LC.ink, ...numF }}>{v}</div>
            </div>
          ))}
        </div>
      </section>
      {/* Form ring stale */}
      <section style={{ ...gcStyle, gridColumn: 'span 4' }}>
        <span style={lblC}>Filip · form</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <svg width="64" height="64" viewBox="0 0 110 110">
            <circle cx="55" cy="55" r="44" fill="none" stroke="rgba(180,190,210,.30)" strokeWidth="9"/>
            <circle cx="55" cy="55" r="44" fill="none" stroke="#F59E0B" strokeWidth="9" strokeDasharray="60 290" strokeLinecap="round" transform="rotate(-90 55 55)"/>
            <text x="55" y="62" textAnchor="middle" fontFamily="Hind Vadodara" fontSize="20" fontWeight="800" fill={LC.ink}>–8</text>
          </svg>
          <div>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 9999, background: 'rgba(254,202,202,.35)', color: '#B84238', border: '1px solid rgba(239,68,68,.30)', fontSize: 10.5, fontWeight: 700 }}>
              <i style={{ width: 6, height: 6, borderRadius: '50%', background: '#F59E0B' }} />Stale
            </span>
            <div style={{ fontSize: 10.5, color: LC.muted, marginTop: 4, lineHeight: 1.4 }}>High load over 3 weeks — suggest recovery</div>
          </div>
        </div>
      </section>
    </div>
  );
}

function TesterCompGrid() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 10 }}>
      {/* PDF hero */}
      <section style={{ ...gcStyle, gridColumn: 'span 12' }}>
        <span style={lblC}>PDF report · ready to export</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 14, borderRadius: 14, background: 'linear-gradient(135deg, #fff, ' + LC.primaryTint + ')', border: '1px solid ' + LC.border }}>
          <div style={{ width: 56, height: 70, borderRadius: 8, background: '#fff', border: '1px solid ' + LC.border, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: LC.secondary }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/></svg>
            <span style={{ fontSize: 8, fontWeight: 800, marginTop: 4, letterSpacing: '0.1em' }}>PDF</span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h5 style={{ margin: 0, fontSize: 13, fontWeight: 800, color: LC.ink }}>test_filip_2026-04-12.pdf</h5>
            <p style={{ fontSize: 11.5, color: LC.muted, margin: '4px 0 0', lineHeight: 1.4 }}>Lactate curve · HR overlay · 5 zones · 4 thresholds · stage table · recommendations</p>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
              {['9 stages','LT1 374 W','LT2 418 W','2 pages'].map(t => (
                <span key={t} style={{ fontSize: 9.5, fontWeight: 700, color: LC.primaryDark, padding: '2px 8px', borderRadius: 9999, background: 'rgba(118,126,181,.12)' }}>{t}</span>
              ))}
            </div>
          </div>
          <button style={{ padding: '9px 14px', borderRadius: 11, background: LC.primaryDark, color: '#fff', border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5, boxShadow: '0 6px 14px -4px rgba(118,126,181,.55)' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v14M5 12l7 7 7-7"/></svg>
            Export
          </button>
        </div>
      </section>
      {/* Lactate curve SVG */}
      <section style={{ ...gcStyle, gridColumn: 'span 7' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 13.5, fontWeight: 800, color: LC.ink, letterSpacing: '-0.01em' }}>Last lactate test</h3>
            <div style={{ fontSize: 10.5, color: LC.muted, marginTop: 2 }}>Mar 9 · 9 stages · 230→470 W</div>
          </div>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 9999, background: 'rgba(239,68,68,.10)', color: '#B84238', fontSize: 10.5, fontWeight: 700 }}>
            <i style={{ width: 5, height: 5, borderRadius: '50%', background: '#EF4444' }} />LT2 418 W
          </span>
        </div>
        <svg viewBox="0 0 420 160" preserveAspectRatio="none" style={{ width: '100%', height: 130 }}>
          <defs>
            <linearGradient id="lc-fill-about" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={LC.primaryDark} stopOpacity="0.20"/>
              <stop offset="100%" stopColor={LC.primaryDark} stopOpacity="0"/>
            </linearGradient>
          </defs>
          <line x1="14" y1="142" x2="406" y2="142" stroke="rgba(15,23,41,.10)" strokeWidth="1"/>
          <line x1="245" y1="20" x2="245" y2="142" stroke="#10B981" strokeWidth="1.8" strokeDasharray="4 4"/>
          <line x1="310" y1="20" x2="310" y2="142" stroke="#EF4444" strokeWidth="1.8" strokeDasharray="4 4"/>
          <path d="M 14 130 C 50 128 80 126 110 124 C 140 122 170 116 200 106 C 230 96 260 76 290 56 C 320 36 350 24 406 14 L 406 142 L 14 142 Z" fill="url(#lc-fill-about)"/>
          <path d="M 14 130 C 50 128 80 126 110 124 C 140 122 170 116 200 106 C 230 96 260 76 290 56 C 320 36 350 24 406 14" fill="none" stroke={LC.primaryDark} strokeWidth="2.6" strokeLinecap="round"/>
          <g fill="#fff" stroke={LC.primaryDark} strokeWidth="2">
            <circle cx="22" cy="130" r="4"/><circle cx="62" cy="128" r="4"/><circle cx="106" cy="124" r="4"/><circle cx="155" cy="119" r="4"/><circle cx="200" cy="106" r="4"/><circle cx="245" cy="92" r="4"/><circle cx="280" cy="74" r="4"/><circle cx="320" cy="50" r="4"/><circle cx="370" cy="26" r="4"/><circle cx="402" cy="14" r="4"/>
          </g>
          <text x="245" y="14" textAnchor="middle" fontFamily="Hind Vadodara" fontSize="9" fontWeight="800" fill="#047857">LT1</text>
          <text x="310" y="14" textAnchor="middle" fontFamily="Hind Vadodara" fontSize="9" fontWeight="800" fill="#B84238">LT2</text>
        </svg>
      </section>
      {/* Zones table */}
      <section style={{ ...gcStyle, gridColumn: 'span 5' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ ...lblC, margin: 0 }}>Zones · Power · HR</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {[
            { z: 'Z1', col: '#3B82F6', pwr: '175–315 W', hr: '71–127' },
            { z: 'Z2', col: '#10B981', pwr: '315–350 W', hr: '127–141' },
            { z: 'Z3', col: '#F59E0B', pwr: '350–392 W', hr: '141–150' },
            { z: 'Z4', col: '#F97316', pwr: '396–429 W', hr: '152–164' },
            { z: 'Z5', col: '#EF4444', pwr: '433–536 W', hr: '166–205' },
          ].map(r => (
            <div key={r.z} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 8, alignItems: 'center', padding: '4px 0', borderBottom: '1px dashed ' + LC.border, fontSize: 11 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: r.col, fontWeight: 800 }}>
                <i style={{ width: 6, height: 6, borderRadius: '50%', background: r.col }} />{r.z}
              </span>
              <span style={{ fontWeight: 700, color: LC.ink, ...numF }}>{r.pwr}</span>
              <span style={{ color: LC.muted, ...numF }}>{r.hr}</span>
            </div>
          ))}
        </div>
      </section>
      {/* LT pair */}
      <section style={{ ...gcStyle, gridColumn: 'span 12' }}>
        <span style={lblC}>Thresholds</span>
        <LtPair />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}>
          {[['Base La','1.2 mmol'],['Peak La','8.0 mmol']].map(([l,v]) => (
            <div key={l} style={{ padding: '8px 12px', borderRadius: 10, background: 'rgba(255,255,255,.55)', border: '1px solid ' + LC.border, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 9.5, fontWeight: 700, color: LC.muted, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{l}</span>
              <span style={{ fontSize: 14, fontWeight: 800, color: LC.ink, ...numF }}>{v}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

/* Shared LT1 / LT2 pair card */
function LtPair() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
      <div style={{ padding: 12, borderRadius: 12, background: 'rgba(16,185,129,.08)', border: '1px solid rgba(16,185,129,.25)' }}>
        <div style={{ fontSize: 10.5, fontWeight: 800, color: '#047857', letterSpacing: '0.08em', textTransform: 'uppercase' }}>LT1</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: LC.ink, ...numF }}>374<small style={{ fontSize: 11, color: LC.muted, marginLeft: 3 }}>W</small></div>
        <div style={{ fontSize: 10.5, color: LC.muted }}><b style={{ color: LC.text }}>2.7</b> mmol · <b style={{ color: LC.text }}>146</b> bpm</div>
      </div>
      <div style={{ padding: 12, borderRadius: 12, background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.25)' }}>
        <div style={{ fontSize: 10.5, fontWeight: 800, color: '#B84238', letterSpacing: '0.08em', textTransform: 'uppercase' }}>LT2</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: LC.ink, ...numF }}>418<small style={{ fontSize: 11, color: LC.muted, marginLeft: 3 }}>W</small></div>
        <div style={{ fontSize: 10.5, color: LC.muted }}><b style={{ color: LC.text }}>4.2</b> mmol · <b style={{ color: LC.text }}>160</b> bpm</div>
      </div>
    </div>
  );
}

function FloatingBadge({ icon, label, value, tint, style, cls }) {
  return (
    <div className={cls} style={{
      position: 'absolute',
      background: '#fff',
      borderRadius: 14, padding: '10px 14px',
      display: 'flex', alignItems: 'center', gap: 10,
      boxShadow: '0 12px 28px -8px rgba(15,23,41,.25)',
      ...style,
    }}>
      <span style={{ width: 32, height: 32, borderRadius: 10, background: tint + '22', color: tint, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
        {icon}
      </span>
      <div>
        <div style={{ fontSize: 10, color: LC.muted, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</div>
        <div style={{ fontSize: 14, fontWeight: 800, color: LC.ink, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      </div>
    </div>
  );
}

/* ─── Pricing card subcomponent ──────────────────────────────────────── */
function PriceCard({ name, price, badge, highlighted, features, ctaLabel, ctaTo, track }) {
  return (
    <div className="lc-card" style={{
      padding: 24, position: 'relative', display: 'flex', flexDirection: 'column', gap: 14,
      borderColor: highlighted ? LC.primary + '88' : undefined,
      borderWidth: highlighted ? 2 : 1,
    }}>
      {badge && <span style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', padding: '3px 12px', borderRadius: 9999, background: '#9CA3AF', color: '#fff', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>{badge}</span>}
      <div>
        <h3 style={{ fontSize: 18, fontWeight: 700, color: badge ? LC.muted : LC.ink, margin: 0 }}>{name}</h3>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 8 }}>
          <span style={{ fontSize: 36, fontWeight: 800, color: badge ? LC.muted : LC.ink, textDecoration: badge ? 'line-through' : 'none' }}>{price}</span>
          <span style={{ fontSize: 14, color: LC.muted }}>/ month</span>
        </div>
        {badge && <p style={{ fontSize: 12, color: LC.primary, fontWeight: 600, margin: '6px 0 0' }}>Free during early access</p>}
      </div>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
        {features.map(f => (
          <li key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13.5, color: LC.muted }}>
            <span style={{ color: LC.primary, fontWeight: 700, flexShrink: 0 }}>✓</span> {f}
          </li>
        ))}
      </ul>
      <Link to={ctaTo} onClick={() => track?.(`pricing_${name.toLowerCase()}`)} className="lc-btn-primary" style={{ justifyContent: 'center', background: highlighted ? LC.primary : '#F3F4F6', color: highlighted ? '#fff' : LC.text, boxShadow: highlighted ? undefined : 'none' }}>{ctaLabel}</Link>
    </div>
  );
}

/* ─── Data tables ─────────────────────────────────────────────────────── */
const FeatIcon = ({ d }) => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>);

const FEATURES = [
  { cat: 'Testing',     title: 'Lactate Curve Generation',  body: 'Enter test values and auto-generate your curve. Calculates LT1, LT2, LTP1, LTP2, IAT, log-log, OBLA (2.0–3.5) and baseline.', icon: <FeatIcon d="M3 20h18M5 16l3-6 4 4 5-9" /> },
  { cat: 'Testing',     title: 'Training Zone Calculation', body: 'Auto-calculate 5 training zones with precise power / pace ranges. Customised for cycling, running, swimming.', icon: <FeatIcon d="M13 10V3L4 14h7v7l9-11h-7z" /> },
  { cat: 'Analysis',    title: 'Historical Test Comparison',body: 'Store every test and compare curves over time. Overlay multiple tests to see how thresholds shift and improve.', icon: <FeatIcon d="M12 7v5l3 2" /> },
  { cat: 'Training',    title: 'Lactate Recording to Intervals', body: 'Tag any interval with a blood lactate sample. Each sample feeds back into your curve and your zones.', icon: <FeatIcon d="M12 3s7 8 7 13a7 7 0 1 1-14 0c0-5 7-13 7-13z" /> },
  { cat: 'Progress',    title: 'Training Progress Tracking', body: 'Compare the same workout type over time. Track how your pace / power improves at the same lactate level.', icon: <FeatIcon d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /> },
  { cat: 'Integration', title: 'Strava & FIT File Sync',     body: 'Sync workouts from Strava or upload FIT files from Garmin, Wahoo, Polar. Full interval detection.', icon: <FeatIcon d="M7 16a4 4 0 0 1-.88-7.9A5 5 0 0 1 15.9 6M16 16a4 4 0 1 0 0-8M12 22V10M15 13l-3-3-3 3" /> },
  { cat: 'Training',    title: 'Training Categorization',    body: 'Auto-categorize sessions by intensity: threshold, VO₂max, endurance, tempo or recovery.', icon: <FeatIcon d="M7 7h.01M3 7v5a2 2 0 0 0 .6 1.4l7 7a2 2 0 0 0 2.8 0l7-7a2 2 0 0 0 0-2.8l-7-7A2 2 0 0 0 12 3H7a4 4 0 0 0-4 4z" /> },
  { cat: 'Training',    title: 'Coach & Athlete Management', body: 'Plan, log and review every athlete from one dashboard. Status dots, athlete switcher, bulk actions.', icon: <FeatIcon d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /> },
  { cat: 'Training',    title: 'Training Calendar',          body: 'Interactive calendar — all workouts from Strava, FIT and manual entries. View load across your timeline.', icon: <FeatIcon d="M3 10h18M8 3v4M16 3v4" /> },
  { cat: 'Analysis',    title: 'TSS & Performance Analytics',body: 'Calculate Training Stress Score per workout. Analyze CTL / ATL / TSB to plan peaks and rest.', icon: <FeatIcon d="M9 19v-6H5v6M14 19v-9h-4M21 19V5h-3v14" /> },
  { cat: 'Tools',       title: 'Free Lactate Calculator',    body: 'No registration required. Instantly generate a lactate curve with all threshold calculations and PDF export.', icon: <FeatIcon d="M8 7h8M8 11h2M12 11h2M16 11h.01M8 15h2M12 15h2M16 15h.01M8 19h8" /> },
  { cat: 'Tools',       title: 'PDF Report Generation',      body: 'Branded PDF — lactate curve, HR overlay, color-coded zones, stage table and personalised recommendations.', icon: <FeatIcon d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M9 13h6M9 17h6" /> },
];

const DEEPDIVES = [
  { eb: 'Core feature', title: 'Lactate Curve <em>Generation</em>', lead: 'Enter your test values — power, heart rate, lactate, pace — and instantly generate the lactate curve. Calculate all critical thresholds in one interactive graph.', bullets: ['Step or ramp protocol — any test design', 'LT1, LT2, OBLA, IAT, D-max, log-log calculated in parallel', 'Baseline adjusts for individual resting lactate'], tags: ['LT1 & LT2', 'OBLA 2.0–3.5', 'IAT', 'D-max', 'Log-log'], img: 'lactate-testing.png', url: 'lachart.net — Lactate Curve · Power vs Lactate' },
  { eb: 'Zones',         title: 'Train <em>inside your zones</em>, not someone else\'s', lead: 'Your zones are derived from your last lactate test — power, pace and heart rate side by side. Update the test, zones update everywhere.', bullets: ['5-zone or Seiler 3-zone models', 'Power, pace and HR per sport', 'Auto-updates when a new test is recorded'], img: 'zones-generator.png', url: 'lachart.net — Training Zones' },
  { eb: 'Progress tracking', title: 'Historical <em>test comparison</em>', lead: 'Overlay multiple lactate tests to visualize your progression. Watch your LT1 and LT2 move to higher intensities as your fitness improves.', bullets: ['Compare multiple test curves on one chart', 'Track zone shifts over training seasons', 'Visualize threshold improvements', 'Export comparison PDF reports'], img: 'lactate-testing-page.png', url: 'lachart.net — Lactate Testing' },
  { eb: 'Form & fitness', title: 'Read your <em>fitness, fatigue and form</em> at a glance', lead: 'CTL, ATL and TSB tracked every day. A plain-English status word — fresh, optimal, productive, overreaching — so you always know what today\'s training should be.', bullets: ['Auto-updated from every Strava or FIT activity', '14-day, 6-week and 3-month views', 'Plan race peaks around predicted form'], img: 'dashboard-home.png', url: 'lachart.net — Dashboard' },
  { eb: 'Training log',  title: 'Every interval, with <em>a lactate dot</em>', lead: 'Open any training and tag any interval with a blood sample. Empty dots are tap-to-log. Every sample feeds back into your curve and your zones.', bullets: ['Power, HR, cadence and pace per interval', 'Auto-detected laps from FIT and Strava', '"Ready for lactate" filter surfaces untagged sessions'], img: 'training-log-page.png', url: 'lachart.net — Training' },
  { eb: 'Calendar',       title: 'Your whole training <em>week, month, season</em>', lead: 'An interactive calendar of every workout — completed, planned, with lactate, without. Click any day to see the session, intervals and zones.', bullets: ['Color-coded by sport and intensity', 'Strava and FIT activities appear automatically', 'Daily TSS bars track weekly load'], img: 'training-calendar.png', url: 'lachart.net — Calendar' },
  { eb: 'PDF reports',    title: 'Professional <em>test reports</em> in seconds', lead: 'Branded PDF with your lactate curve, HR overlay, color-coded zones, threshold table, previous-test comparison and training recommendations.', bullets: ['Curve + HR overlay on a single page', 'All thresholds (LTP1, LTP2, OBLA, IAT)', 'Stage-by-stage results table', 'Personalised training recommendations'], img: 'lachart-test-pdf.png', url: 'test_lisa_2026-04-12.pdf' },
];

const METHODS = [
  { tag: 'Most used', name: 'OBLA',       sub: 'Onset of Blood Lactate Accumulation', body: 'Fixed at 4.0 mmol/L. The power output at which your blood lactate first reaches 4 mmol/L on a graded test.', eq: 'LT₂ = pace @ 4.0 mmol/L' },
  { name: 'D<sub>max</sub>',               sub: 'Geometric inflection',                body: 'The point where your curve bends most sharply from the line connecting baseline lactate to peak. Independent of fixed values.', eq: 'LT₂ = max perpendicular distance' },
  { name: 'IAT',                            sub: 'Individual Anaerobic Threshold',     body: 'Takes your individual baseline lactate and adds 1.5 mmol/L. More accurate for highly trained athletes with low resting values.', eq: 'LT₂ = baseline + 1.5 mmol/L' },
  { name: 'Log-log',                        sub: 'First-rise inflection',              body: 'Plots log(lactate) vs log(intensity). The first clear break in slope marks LT1 — the aerobic threshold.', eq: 'LT₁ = first slope change' },
];

const VOICES = [
  { img: 'cyclist-avatar.webp', name: 'Tomáš H.',  role: 'Cat 1 cyclist · Praha',     quote: "The first lactate app that doesn't feel like Excel. I do my own home tests every 4 weeks and the curve drops into my training within seconds." },
  { img: 'coach-avatar.webp',   name: 'Markus B.', role: 'Triathlon coach · Innsbruck', quote: 'I coach 14 triathletes. The athlete switcher and the "ready for lactate" filter saved me two hours a week. Status dots are pure gold.' },
  { img: 'runner-avatar.jpeg',  name: 'Eva K.',    role: 'Sub-elite marathoner · Brno', quote: 'I switched from spreadsheets after my first test. Seeing LT1 and LT2 land on the same chart — with the previous test underneath — is a game changer for steady-state work.' },
];

const ROLES = [
  { id: 'athlete',
    label: 'Athlete',
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-7 8-7s8 3 8 7"/></svg>,
    heading: 'Train yourself. <em>Tap your numbers.</em>',
    lead: 'A calm dashboard built around today. Form and fitness at a glance, threshold trend over months, every interval ready for a lactate sample. Mobile-first.',
    features: [
      { title: 'Form ring · TSB', body: 'fresh, optimal, productive, overreaching, in plain English.' },
      { title: "Today's training", body: 'above the fold — open, do, log lactate, done.' },
      { title: 'Tap any interval', body: 'to log a blood sample — your curve learns.' },
      { title: 'Threshold trend', body: 'over weeks — LT1 and LT2 moving right.' },
      { title: 'Native iOS app', body: 'bottom tabs, swipe between sports, Apple Health sync.' },
    ],
    img: 'dashboard-home.png',
    screenLabel: 'Dashboard',
  },
  { id: 'coach',
    label: 'Coach',
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="9" r="3"/><circle cx="17" cy="11" r="2.5"/><path d="M3 19c0-3 3-5 6-5s6 2 6 5M14 19c0-2.5 2-4 4-4s4 1.5 4 4"/></svg>,
    heading: 'Coach a team. <em>Without spreadsheets.</em>',
    lead: 'Switch between athletes in one tap. Status dots show who needs attention. Plan workouts, review lactate, generate PDFs — all in one workspace.',
    features: [
      { title: 'Athlete switcher', body: 'jump between every athlete from one bar.' },
      { title: 'Status dots', body: 'green / amber / red so you see who needs help today.' },
      { title: '"Ready for lactate" filter', body: 'surfaces threshold sessions that should be measured.' },
      { title: 'Plan + log + analyse', body: 'in one calendar — no second tool needed.' },
      { title: 'Bulk PDF export', body: 'monthly summary across every athlete in one click.' },
    ],
    img: 'training-calendar.png',
    screenLabel: 'Coach calendar',
  },
  { id: 'tester',
    label: 'Lactate tester',
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 2v7l-5 9a4 4 0 0 0 4 6h6a4 4 0 0 0 4-6l-5-9V2"/><path d="M8 2h8"/></svg>,
    heading: 'Run lab-quality tests. <em>Without the lab software.</em>',
    lead: 'Enter stage values, see the curve build live, hand the athlete a branded PDF before they leave. Step-test wizard, OBLA / IAT / D-max in parallel, comparison vs previous test.',
    features: [
      { title: 'Step-test wizard', body: 'generates the stage ladder from start + increment.' },
      { title: 'Live curve preview', body: 'every sample you enter updates the chart instantly.' },
      { title: 'Branded PDF', body: 'with curve, HR overlay, zones and stage table.' },
      { title: 'Compare with previous test', body: 'overlay on the same chart.' },
      { title: 'Free public calculator', body: 'no sign-in needed — embed in your website.' },
    ],
    img: 'lactate-testing.png',
    screenLabel: 'Test analysis',
  },
];

const FAQ = [
  { q: 'What is lactate threshold and why does it matter?', a: "Lactate threshold is the intensity at which lactate accumulates in your blood faster than it's cleared. It's the single most useful number for endurance training because it sets your tempo / threshold / steady-state ceiling — and it shifts as you train. LaChart finds it from a graded test in 60 seconds." },
  { q: 'How accurate is the calculator vs a lab?', a: 'LaChart uses the same OBLA / Dmax / IAT / Log-log methods sport-science labs use. Accuracy depends on your sampling protocol — same protocol in and you get lab-comparable thresholds.' },
  { q: 'Do I need to register to use the calculator?', a: 'No. The free calculator runs without an account. A free account adds saving, history, comparison and PDF export.' },
  { q: 'Which sports does LaChart cover?', a: 'Cycling, running, swimming and triathlon. Power-based for bike, pace-based for run / swim, HR overlay on every chart.' },
  { q: 'Can I generate a PDF report from my lactate test?', a: 'Yes. After a test you can download a branded PDF with the lactate curve, HR overlay, all thresholds (LTP1, LTP2, OBLA, IAT), the five training zones, stage-by-stage results, a comparison with your previous test and personalised training recommendations.' },
  { q: 'Is my data exportable?', a: "Yes. Every account can export training history (CSV) and individual tests (PDF). We don't lock your data in." },
];
