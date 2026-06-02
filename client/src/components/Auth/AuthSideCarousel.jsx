import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

const RESPONSIVE_SOURCES = {
  '/images/lactate_curve_calculator_lachart.jpg': {
    webpSrcSet: '/images/lactate_curve_calculator_lachart-640.webp 640w, /images/lactate_curve_calculator_lachart-960.webp 960w, /images/lactate_curve_calculator_lachart-1280.webp 1280w',
    srcSet: '/images/lactate_curve_calculator_lachart.jpg 1536w',
  },
  '/images/lactate_curve.jpg': {
    webpSrcSet: '/images/lactate_curve-640.webp 640w, /images/lactate_curve-960.webp 960w, /images/lactate_curve-1280.webp 1280w',
    srcSet: '/images/lactate_curve.jpg 1536w',
  },
  '/images/lachart_training.png': {
    webpSrcSet: '/images/lachart_training-640.webp 640w, /images/lachart_training-960.webp 960w, /images/lachart_training-1280.webp 1280w',
  },
  '/images/lactate_testing.png': {
    webpSrcSet: '/images/lactate_testing-640.webp 640w, /images/lactate_testing-960.webp 960w, /images/lactate_testing-1280.webp 1280w',
  },
  '/images/lachart5.jpeg': {
    webpSrcSet: '/images/lachart5-640.webp 640w, /images/lachart5-960.webp 960w, /images/lachart5-1280.webp 1280w',
  },
};

const CAROUSEL_SIZES = '(min-width: 1280px) 42rem, (min-width: 1024px) 38rem, 100vw';

const DEFAULT_SLIDES = [
  {
    // iOS launch slide — first impression for everyone hitting the login
    // screen. `fit: 'contain'` so the portrait phone shows whole instead of
    // being cropped by the landscape card, and `bg` provides the matching
    // backdrop. `cta` renders the App Store badge in the bottom card.
    src: '/images/ios-launch/iphone-lactate-test.png',
    fit: 'contain',
    bg: 'linear-gradient(135deg, #5E6590 0%, #767EB5 55%, #599FD0 100%)',
    tag: 'iPhone app — Just launched',
    title: 'Take LaChart with you',
    subtitle: 'Lactate tests, threshold zones, Apple Health sync — straight from your iPhone.',
    accent: 'from-primary/40 to-secondary/30',
    cta: {
      href: 'https://apps.apple.com/cz/app/lachart/id6764768876?l=cs',
      label: 'Download on the App Store',
      analytics: 'login_carousel_appstore_click',
    },
  },
  {
    src: '/images/lachart_training.png',
    tag: 'Training',
    title: 'Training analysis',
    subtitle: 'Understand sessions in seconds with clear charts & intervals.',
    accent: 'from-blue-500/30 to-primary/20',
  },
  {
    src: '/images/lactate_curve_calculator_lachart.jpg',
    tag: 'Lactate Testing',
    title: 'Progress, not guesswork',
    subtitle: 'Track improvements and stay consistent with science-based structure.',
    accent: 'from-primary/30 to-secondary/20',
    stat: { label: 'LT2 Threshold', value: '340 W' },
  },
  {
    src: '/images/lactate_testing.png',
    tag: 'Thresholds',
    title: 'Lactate testing',
    subtitle: 'Turn data into actionable thresholds and training zones.',
    accent: 'from-violet-500/25 to-primary/20',
  },
  {
    src: '/images/lachart5.jpeg',
    tag: 'Coaching',
    title: 'Coach + athlete workflow',
    subtitle: 'Share insights and keep everything in one place.',
    accent: 'from-secondary/30 to-teal-500/20',
  },
  {
    src: '/images/lactate_curve.jpg',
    tag: 'Zones',
    title: 'Better workouts',
    subtitle: 'Make every interval count with the right intensity.',
    accent: 'from-emerald-500/25 to-secondary/20',
    stat: { label: 'Zone 2 pace', value: '4:45 /km' },
  },
];

export default function AuthSideCarousel({
  slides = DEFAULT_SLIDES,
  autoMs = 5500,
  className = '',
}) {
  const safeSlides = useMemo(() => (Array.isArray(slides) && slides.length ? slides : DEFAULT_SLIDES), [slides]);
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    try {
      safeSlides.forEach((s) => {
        if (!s?.src) return;
        const img = new Image();
        img.src = s.src;
      });
    } catch { /* ignore */ }
  }, [safeSlides]);

  useEffect(() => {
    if (paused || safeSlides.length <= 1) return;
    const t = window.setInterval(() => setIdx((i) => (i + 1) % safeSlides.length), autoMs);
    return () => window.clearInterval(t);
  }, [paused, autoMs, safeSlides.length]);

  const go = (nextIdx) => {
    const n = safeSlides.length;
    setIdx(((nextIdx % n) + n) % n);
  };

  const current = safeSlides[idx] || safeSlides[0];
  const currentSources = RESPONSIVE_SOURCES[current?.src] || {};

  return (
    <div
      className={['relative w-full overflow-hidden rounded-3xl bg-gray-950 shadow-2xl h-[600px] max-h-[600px] min-h-[420px]', className].join(' ')}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* ── Image layer ── */}
      <AnimatePresence mode="wait">
        <motion.div
          key={current?.src || idx}
          initial={{ opacity: 0, scale: 1.04 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="absolute inset-0"
        >
          {/* Optional solid/gradient backdrop for `fit: 'contain'` slides so
              the empty edges around a portrait phone don't look like a void. */}
          {current?.bg && (
            <div className="absolute inset-0" style={{ background: current.bg }} />
          )}
          <picture>
            {currentSources.webpSrcSet && (
              <source
                type="image/webp"
                srcSet={currentSources.webpSrcSet}
                sizes={CAROUSEL_SIZES}
              />
            )}
            <img
              src={current?.src}
              srcSet={currentSources.srcSet}
              sizes={CAROUSEL_SIZES}
              alt={current?.title || 'LaChart'}
              className={`w-full h-full ${current?.fit === 'contain' ? 'object-contain p-8' : 'object-cover'}`}
              loading="eager"
              decoding="async"
              draggable={false}
              style={current?.fit === 'contain' ? { filter: 'drop-shadow(0 20px 32px rgba(0,0,0,0.35))' } : undefined}
            />
          </picture>
          {/* Multi-layer gradient for depth — skip on `contain` slides so the
              phone screenshot isn't washed out. */}
          {current?.fit !== 'contain' && (
            <>
              <div className="absolute inset-0 bg-gradient-to-t from-gray-950/90 via-gray-950/40 to-gray-950/10" />
              <div className="absolute inset-0 bg-gradient-to-r from-gray-950/50 to-transparent" />
            </>
          )}
          {/* Lighter bottom-only gradient on contain slides so the copy card is still legible. */}
          {current?.fit === 'contain' && (
            <div className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-gray-950/75 via-gray-950/30 to-transparent" />
          )}
        </motion.div>
      </AnimatePresence>

      {/* ── Accent glow matching slide colour ── */}
      <motion.div
        key={`glow-${idx}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6 }}
        className={`absolute bottom-0 left-0 right-0 h-64 bg-gradient-to-t ${current.accent} blur-2xl opacity-60`}
      />

      {/* ── Top brand ── */}
      <div className="absolute left-6 top-6 flex items-center gap-2.5 z-10">
        <div className="h-9 w-9 rounded-2xl bg-white/15 backdrop-blur-md border border-white/20 flex items-center justify-center shadow-lg">
          <picture>
            
            <img src="/images/LaChart.png" alt="LaChart" className="h-6 w-6 object-contain" draggable={false} />
          </picture>
        </div>
        <div className="text-white">
          <div className="text-sm font-bold tracking-tight">LaChart</div>
          <div className="text-[10px] text-white/60 tracking-wide uppercase">Lactate · Zones · Training</div>
        </div>
      </div>

      {/* ── Floating stat badge (optional per slide) ── */}
      <AnimatePresence>
        {current.stat && (
          <motion.div
            key={`stat-${idx}`}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.4, delay: 0.3 }}
            className="absolute top-6 right-6 z-10 bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl px-4 py-2.5 shadow-xl"
          >
            <div className="text-[10px] text-white/60 uppercase tracking-wider mb-0.5">{current.stat.label}</div>
            <div className="text-white font-extrabold text-lg leading-none">{current.stat.value}</div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Bottom content ── */}
      <div className="absolute left-6 right-6 bottom-6 z-10">
        <AnimatePresence mode="wait">
          <motion.div
            key={`copy-${idx}`}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.4 }}
          >
            {/* Tag pill */}
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 backdrop-blur-sm border border-white/20 text-white text-[11px] font-semibold uppercase tracking-widest mb-3">
              <span className="w-1.5 h-1.5 rounded-full bg-white/80" />
              {current.tag}
            </div>

            {/* Title */}
            <h3 className="text-white text-2xl font-extrabold leading-tight tracking-tight mb-1.5">
              {current.title}
            </h3>

            {/* Subtitle */}
            <p className="text-white/70 text-sm leading-relaxed mb-4">{current.subtitle}</p>

            {/* Optional CTA — currently used by the iOS-launch slide. Stops
                pointer events from bubbling so clicking the button doesn't
                also re-trigger the slideshow pause/resume handlers. */}
            {current.cta && (
              <a
                href={current.cta.href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => {
                  e.stopPropagation();
                  try { window.gtag && current.cta.analytics && window.gtag('event', current.cta.analytics); } catch {}
                }}
                className="inline-flex items-center gap-2 mb-4 px-4 py-2.5 rounded-xl bg-black text-white text-sm font-bold shadow-lg hover:shadow-xl active:scale-[0.98] transition-all"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M17.05 12.04c-.03-2.8 2.29-4.15 2.4-4.21-1.31-1.92-3.35-2.18-4.07-2.21-1.73-.17-3.38 1.02-4.26 1.02-.89 0-2.24-1-3.69-.97-1.9.03-3.65 1.1-4.62 2.8-1.97 3.42-.5 8.47 1.41 11.24.94 1.36 2.04 2.88 3.48 2.83 1.41-.06 1.94-.91 3.64-.91 1.69 0 2.18.91 3.65.88 1.51-.02 2.46-1.37 3.38-2.74 1.07-1.57 1.51-3.09 1.53-3.17-.03-.01-2.93-1.12-2.95-4.46zM14.4 4.34c.78-.95 1.31-2.28 1.17-3.59-1.13.05-2.49.75-3.29 1.7-.72.84-1.36 2.18-1.19 3.48 1.26.1 2.54-.64 3.31-1.59z"/>
                </svg>
                {current.cta.label}
              </a>
            )}

            {/* Progress + arrows */}
            <div className="flex items-center justify-between gap-3">
              {/* Progress bar style indicator */}
              <div className="flex items-center gap-1.5 flex-1">
                {safeSlides.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    aria-label={`Go to slide ${i + 1}`}
                    onClick={() => go(i)}
                    className="relative h-1 rounded-full bg-white/25 overflow-hidden transition-all duration-300"
                    style={{ width: i === idx ? '2rem' : '0.5rem' }}
                  >
                    {i === idx && (
                      <motion.div
                        className="absolute inset-0 bg-white rounded-full"
                        initial={{ scaleX: 0 }}
                        animate={{ scaleX: 1 }}
                        transition={{ duration: autoMs / 1000, ease: 'linear' }}
                        style={{ transformOrigin: 'left' }}
                      />
                    )}
                  </button>
                ))}
              </div>

              {/* Arrows */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => go(idx - 1)}
                  className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-white flex items-center justify-center transition-colors"
                  aria-label="Previous"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => go(idx + 1)}
                  className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-white flex items-center justify-center transition-colors"
                  aria-label="Next"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
