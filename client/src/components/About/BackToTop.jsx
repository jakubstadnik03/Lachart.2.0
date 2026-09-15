import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUpIcon } from '@heroicons/react/24/outline';

/**
 * The corner of a long page: one arrow back to the top, once the reader is
 * far enough down to want it. Sits where the donation widget used to float
 * on every page — a marketing page is where a way back up is needed, and a
 * tip jar is not what a reader comparing plans should meet.
 */
export default function BackToTop({ threshold = 600 }) {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onScroll = () => setShown(window.scrollY > threshold);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [threshold]);

  const toTop = () => {
    const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
  };

  // Through a portal: the marketing pages animate in with a transform on
  // their wrapper, and position:fixed inside a transformed element is fixed
  // to that element — the arrow ended up in the footer instead of the corner.
  if (typeof document === 'undefined') return null;
  return createPortal(
    <button
      type="button"
      onClick={toTop}
      aria-label="Back to top"
      title="Back to top"
      aria-hidden={!shown}
      tabIndex={shown ? 0 : -1}
      className="fixed z-[60] w-11 h-11 rounded-full bg-white/95 backdrop-blur ring-1 ring-slate-200 shadow-lg text-slate-600 hover:text-primary hover:ring-primary/40 flex items-center justify-center transition-all duration-200"
      style={{
        right: 18,
        bottom: 'calc(18px + env(safe-area-inset-bottom, 0px))',
        opacity: shown ? 1 : 0,
        transform: shown ? 'translateY(0)' : 'translateY(8px)',
        pointerEvents: shown ? 'auto' : 'none',
      }}
    >
      <ArrowUpIcon className="w-5 h-5" strokeWidth={2.2} />
    </button>,
    document.body,
  );
}
