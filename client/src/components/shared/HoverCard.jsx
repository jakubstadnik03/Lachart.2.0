/**
 * HoverCard — what a calendar cell could not fit, on hover.
 *
 * A day cell is a hundred and fifty pixels wide, so a session shows its name
 * truncated and two numbers. Everything else about it — the coach's
 * instruction, the split, what it was against the plan — was only reachable by
 * opening it. This puts that within a mouse movement, without moving anything
 * on the page.
 *
 * Three things it is careful about:
 *
 * Portalled, because a day cell clips its own overflow and a card drawn inside
 * one is a card cut in half.
 *
 * Anchored to the trigger rather than the cursor, and flipped when the trigger
 * is near an edge — a card that opens off-screen is worse than none.
 *
 * Mouse only. A tap is how a session is opened; a phone that answers the tap
 * with a tooltip has swallowed the gesture and made the card unopenable.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';

const GAP = 10;
const WIDTH = 260;

export default function HoverCard({ content, children, delay = 220, className = '' }) {
  const [pos, setPos] = useState(null);
  const anchorRef = useRef(null);
  const timerRef = useRef(null);

  const clear = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
  }, []);

  useEffect(() => clear, [clear]);

  // Scrolling with a card open leaves it pointing at nothing, since it is
  // positioned against a rect that has since moved.
  useEffect(() => {
    if (!pos) return undefined;
    const close = () => setPos(null);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [pos]);

  const open = () => {
    const host = anchorRef.current;
    // The wrapper is `display: contents` so it adds no box to the layout the
    // calendar carefully built — which also means it has no box to measure.
    // The trigger is whatever it wraps.
    const el = host?.firstElementChild || host;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // Right of the trigger when there is room, otherwise left of it.
    const left = r.right + GAP + WIDTH <= vw ? r.right + GAP : Math.max(8, r.left - GAP - WIDTH);
    // Top-aligned with the trigger, pulled up only as far as the viewport needs.
    const top = Math.max(8, Math.min(r.top, vh - 8));
    setPos({ left, top });
  };

  const onEnter = (e) => {
    if (e.pointerType === 'touch') return;
    clear();
    timerRef.current = setTimeout(open, delay);
  };

  const onLeave = () => { clear(); setPos(null); };

  if (!content) return children;

  return (
    <span
      ref={anchorRef}
      className={`contents ${className}`}
      onPointerEnter={onEnter}
      onPointerLeave={onLeave}
      onPointerDown={onLeave}
    >
      {children}
      {pos && ReactDOM.createPortal(
        <div
          role="tooltip"
          style={{
            position: 'fixed',
            left: pos.left,
            top: pos.top,
            width: WIDTH,
            maxHeight: 'calc(100vh - 16px)',
            zIndex: 10050,
            pointerEvents: 'none',
          }}
          className="rounded-xl border border-gray-200 bg-white shadow-xl p-3 text-left overflow-hidden"
        >
          {content}
        </div>,
        document.getElementById('app-modal-root') || document.body,
      )}
    </span>
  );
}
