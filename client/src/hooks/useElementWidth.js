import { useCallback, useRef, useState } from 'react';

/**
 * useElementWidth
 * ───────────────
 * Measure an element's live content width via ResizeObserver. Returns
 * `[ref, width]` — attach `ref` to the element you want to size against and
 * read `width` (px). `width` starts at `fallback` until the first measurement.
 *
 * Used by the dashboard / training charts: they draw into an SVG whose viewBox
 * width must equal the element's real pixel width, otherwise the fixed-320
 * viewBox + preserveAspectRatio="none" stretches everything horizontally on
 * wide screens (iPad). Feeding the measured width in keeps a 1:1 unit→pixel
 * ratio, so the chart fills the full width with NO deformation.
 *
 * It's a callback ref, so the observer re-attaches correctly even when the
 * measured node mounts later (e.g. after a loading / empty state).
 */
export default function useElementWidth(fallback = 0) {
  const [width, setWidth] = useState(fallback);
  const roRef = useRef(null);

  const ref = useCallback((el) => {
    if (roRef.current) {
      roRef.current.disconnect();
      roRef.current = null;
    }
    if (el) {
      const update = () => setWidth(el.clientWidth || fallback);
      update();
      if (typeof ResizeObserver !== 'undefined') {
        roRef.current = new ResizeObserver(update);
        roRef.current.observe(el);
      }
    }
  }, [fallback]);

  return [ref, width];
}
