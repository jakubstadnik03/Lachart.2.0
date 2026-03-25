import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';

const DEFAULT_SLIDES = [
  {
    src: '/images/lachart_training.png',
    title: 'Training analysis',
    subtitle: 'Understand sessions in seconds with clear charts & intervals.',
  },
  {
    src: '/images/lachart3.jpeg',
    title: 'Progress, not guesswork',
    subtitle: 'Track improvements and stay consistent with structure.',
  },
  {
    src: '/images/lactate_testing.png',
    title: 'Lactate testing',
    subtitle: 'Turn data into actionable thresholds and zones.',
  },
  {
    src: '/images/lachart5.jpeg',
    title: 'Coach + athlete workflow',
    subtitle: 'Share insights and keep everything in one place.',
  },
  {
    src: '/images/testing.png',
    title: 'Better workouts',
    subtitle: 'Make every interval count with the right intensity.',
  },
];

export default function AuthSideCarousel({
  slides = DEFAULT_SLIDES,
  autoMs = 5500,
  className = '',
  overlay = true,
}) {
  const safeSlides = useMemo(() => (Array.isArray(slides) && slides.length ? slides : DEFAULT_SLIDES), [slides]);
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);

  // Preload slide images to avoid "white flash" during transitions
  useEffect(() => {
    try {
      safeSlides.forEach((s) => {
        if (!s?.src) return;
        const img = new Image();
        img.src = s.src;
      });
    } catch {
      // ignore
    }
  }, [safeSlides]);

  useEffect(() => {
    if (paused || safeSlides.length <= 1) return;
    const t = window.setInterval(() => {
      setIdx((i) => (i + 1) % safeSlides.length);
    }, autoMs);
    return () => window.clearInterval(t);
  }, [paused, autoMs, safeSlides.length]);

  const go = (nextIdx) => {
    const n = safeSlides.length;
    if (n <= 0) return;
    const normalized = ((nextIdx % n) + n) % n;
    setIdx(normalized);
  };

  const current = safeSlides[idx] || safeSlides[0];

  return (
    <div
      className={[
        // Dark base prevents bright flashes between images
        // NOTE: children are absolutely positioned, so we must give the container an explicit height
        // otherwise it can collapse to 0px and appear "invisible".
        'relative w-full overflow-hidden rounded-3xl border border-white/20 bg-gray-900 shadow-2xl h-[600px] max-h-[600px] min-h-[420px]',
        className,
      ].join(' ')}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={current?.src || idx}
          initial={{ opacity: 0, scale: 1.03 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.99 }}
          transition={{ duration: 0.45, ease: 'easeOut' }}
          className="absolute inset-0 bg-gray-900"
        >
          <img
            src={current?.src}
            alt={current?.title || 'LaChart'}
            className="w-full h-full object-cover bg-gray-900"
            loading="eager"
            draggable={false}
          />
          {overlay && (
            <>
              <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/35 to-black/70" />
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(255,255,255,0.22),transparent_40%)]" />
            </>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Top brand */}
      <div className="absolute left-5 top-5 flex items-center gap-2">
        <div className="h-9 w-9 rounded-2xl bg-white/15 backdrop-blur-md border border-white/20 flex items-center justify-center shadow-lg">
          <img src="/images/LaChart.png" alt="LaChart" className="h-6 w-6 object-contain" draggable={false} />
        </div>
        <div className="text-white">
          <div className="text-sm font-semibold tracking-tight">LaChart</div>
          <div className="text-[11px] text-white/75">Testing • Zones • Training</div>
        </div>
      </div>

      {/* Copy */}
      <div className="absolute left-6 right-6 bottom-6">
        <div className="rounded-2xl border border-white/15 bg-white/10 backdrop-blur-md p-4 shadow-xl">
          <div className="text-white text-base font-semibold leading-tight">{current?.title}</div>
          {current?.subtitle && <div className="mt-1 text-white/80 text-sm leading-snug">{current.subtitle}</div>}

          {/* Dots */}
          {safeSlides.length > 1 && (
            <div className="mt-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-1.5">
                {safeSlides.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    aria-label={`Go to slide ${i + 1}`}
                    onClick={() => go(i)}
                    className={[
                      'h-2.5 rounded-full transition-all',
                      i === idx ? 'w-7 bg-white' : 'w-2.5 bg-white/40 hover:bg-white/60',
                    ].join(' ')}
                  />
                ))}
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  aria-label="Previous slide"
                  onClick={() => go(idx - 1)}
                  className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-white/90 transition-colors"
                >
                  <ChevronLeftIcon className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  aria-label="Next slide"
                  onClick={() => go(idx + 1)}
                  className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-white/90 transition-colors"
                >
                  <ChevronRightIcon className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

