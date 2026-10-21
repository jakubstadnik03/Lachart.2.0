/**
 * The iPhone app, one feature at a time: a phone playing the recording, its
 * name and three points beside it, and a strip of features to swipe through.
 *
 * Swipe the phone (touch or mouse drag), use the arrows or the chips, or let
 * it run — when a clip ends the next one starts. Autoplay stops for good the
 * moment the visitor takes over, so it never pulls a clip away from someone
 * who is watching it. Only the current clip loads and plays.
 */
import React, { useEffect, useRef, useState } from 'react';
import { APP_DEMOS } from './AppDemos';

const C = {
  ink: '#0F1729', text: '#1F2738', muted: '#6B7280', primary: '#767EB5', primaryDark: '#5E6590',
  tint: '#EEF0F8', border: 'rgba(180,190,210,.30)',
};

const SHORT = {
  home: 'Today', form: 'Form & zones', testing: 'Lactate curve', plan: 'Planning',
  training: 'Repeated sessions', compare: 'Compare LT2', search: 'Search',
  'coach-roster': 'Athletes', 'coach-plan': 'Plan for an athlete',
};

export default function AppDemoCarousel({ audience = 'athlete', demos = APP_DEMOS.filter((x) => x.audience === audience) }) {
  const [i, setI] = useState(0);
  const [auto, setAuto] = useState(true);
  const [dragX, setDragX] = useState(0);
  const videoRef = useRef(null);
  const boxRef = useRef(null);
  const drag = useRef(null);
  const chipsRef = useRef(null);
  const [inView, setInView] = useState(false);
  const n = demos.length;
  const d = demos[i];

  const go = (next, byUser = true) => {
    if (byUser) setAuto(false);
    setI(((next % n) + n) % n);
  };

  // Play only while the carousel is on screen.
  useEffect(() => {
    const el = boxRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setInView(true); return undefined; }
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.3 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (inView) { v.currentTime = 0; const p = v.play(); if (p && p.catch) p.catch(() => {}); } else v.pause();
  }, [i, inView]);

  // Keep the active chip in view on narrow screens.
  useEffect(() => {
    const strip = chipsRef.current;
    const chip = strip && strip.children[i];
    if (chip) strip.scrollTo({ left: chip.offsetLeft - strip.clientWidth / 2 + chip.clientWidth / 2, behavior: 'smooth' });
  }, [i]);

  const onDown = (x) => { drag.current = { x0: x }; };
  const onMove = (x) => { if (drag.current) setDragX(x - drag.current.x0); };
  const onUp = () => {
    if (!drag.current) return;
    const dx = dragX;
    drag.current = null;
    setDragX(0);
    if (Math.abs(dx) > 50) go(i + (dx < 0 ? 1 : -1));
  };

  const arrow = (dir) => (
    <button type="button" aria-label={dir < 0 ? 'Previous feature' : 'Next feature'} onClick={() => go(i + dir)} style={{
      width: 44, height: 44, borderRadius: 22, border: `1px solid ${C.border}`, background: '#fff',
      color: C.primaryDark, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      boxShadow: '0 4px 14px -6px rgba(15,23,41,.18)', flexShrink: 0,
    }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d={dir < 0 ? 'M15 19l-7-7 7-7' : 'M9 5l7 7-7 7'} />
      </svg>
    </button>
  );

  return (
    <div ref={boxRef}>
      {/* feature chips */}
      <div ref={chipsRef} role="tablist" className="lc-demo-chips" style={{
        display: 'flex', gap: 8, overflowX: 'auto', scrollbarWidth: 'none', padding: '2px 2px 6px',
        justifyContent: 'safe center', marginBottom: 28,
      }}>
        {demos.map((x, k) => (
          <button key={x.id} type="button" role="tab" aria-selected={k === i} onClick={() => go(k)} style={{
            flexShrink: 0, padding: '9px 16px', borderRadius: 9999, fontSize: 13.5, fontWeight: 700, cursor: 'pointer',
            border: k === i ? 'none' : `1px solid ${C.border}`, background: k === i ? C.primaryDark : '#fff',
            color: k === i ? '#fff' : C.muted, whiteSpace: 'nowrap', transition: 'all .2s',
          }}>
            {SHORT[x.id] || x.title}
          </button>
        ))}
      </div>

      <div className="lc-demo-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 40 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <span className="lc-demo-arrow">{arrow(-1)}</span>
          <div
            onTouchStart={(e) => onDown(e.touches[0].clientX)}
            onTouchMove={(e) => onMove(e.touches[0].clientX)}
            onTouchEnd={onUp}
            onMouseDown={(e) => { e.preventDefault(); onDown(e.clientX); }}
            onMouseMove={(e) => onMove(e.clientX)}
            onMouseUp={onUp}
            onMouseLeave={onUp}
            style={{
              width: 280, maxWidth: '72vw', borderRadius: 46, padding: 10, background: '#0F1729', flexShrink: 0,
              boxShadow: '0 30px 60px -20px rgba(15,23,41,.35), inset 0 0 0 2px #2A3147',
              transform: `translateX(${dragX * 0.6}px) rotate(${dragX * 0.01}deg)`,
              transition: drag.current ? 'none' : 'transform .3s cubic-bezier(.2,.8,.2,1)',
              cursor: 'grab', touchAction: 'pan-y', userSelect: 'none',
            }}
          >
            <video
              key={d.id}
              ref={videoRef}
              src={`${d.src}.mp4`}
              poster={`${d.src}.jpg`}
              muted
              playsInline
              preload="auto"
              loop={!auto}
              onEnded={() => { if (auto) go(i + 1, false); }}
              aria-label={d.title}
              style={{
                display: 'block', width: '100%', aspectRatio: '1206 / 2622', borderRadius: 36,
                background: '#EEF0F4', objectFit: 'cover', pointerEvents: 'none',
                animation: 'lcDemoIn .35s cubic-bezier(.2,.8,.2,1)',
              }}
            />
          </div>
          <span className="lc-demo-arrow">{arrow(1)}</span>
        </div>

        <div key={d.id} style={{ flex: '0 1 420px', minWidth: 0, animation: 'lcDemoText .4s cubic-bezier(.2,.8,.2,1)' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, letterSpacing: '.08em', textTransform: 'uppercase', fontVariantNumeric: 'tabular-nums' }}>
            {i + 1} / {n}
          </div>
          <h3 style={{ fontSize: 28, fontWeight: 800, color: C.ink, margin: '8px 0 10px', letterSpacing: '-0.02em', lineHeight: 1.15 }}>{d.title}</h3>
          <p style={{ fontSize: 15.5, lineHeight: 1.6, color: C.muted, margin: '0 0 18px' }}>{d.lead}</p>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 9 }}>
            {d.points.map((p) => (
              <li key={p} style={{ display: 'flex', gap: 10, fontSize: 14.5, color: C.text, lineHeight: 1.5 }}>
                <span aria-hidden="true" style={{ flexShrink: 0, width: 6, height: 6, borderRadius: 3, background: C.primary, marginTop: 8 }} />
                {p}
              </li>
            ))}
          </ul>
          {/* progress dots */}
          <div style={{ display: 'flex', gap: 6, marginTop: 24 }}>
            {demos.map((x, k) => (
              <button key={x.id} type="button" aria-label={x.title} onClick={() => go(k)} style={{
                width: k === i ? 22 : 7, height: 7, borderRadius: 4, border: 'none', padding: 0, cursor: 'pointer',
                background: k === i ? C.primaryDark : 'rgba(15,23,41,.15)', transition: 'all .25s',
              }} />
            ))}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes lcDemoIn { from { opacity: .3; transform: scale(.985); } to { opacity: 1; transform: none; } }
        @keyframes lcDemoText { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
        @media (max-width: 860px) {
          .lc-demo-row { flex-direction: column !important; gap: 24px !important; }
          .lc-demo-row > div:last-child { text-align: left; width: 100%; }
        }
        @media (max-width: 480px) { .lc-demo-arrow { display: none; } }
        /* One swipeable row on every width — the site's mobile rules wrap flex rows. */
        .lc-demo-chips { flex-wrap: nowrap !important; justify-content: flex-start !important; }
        @media (min-width: 861px) { .lc-demo-chips { justify-content: center !important; } }
        .lc-demo-chips::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
}
