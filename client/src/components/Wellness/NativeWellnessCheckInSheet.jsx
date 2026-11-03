/**
 * NativeWellnessCheckInSheet - "How are you today?" as a native bottom sheet.
 *
 * Same questions, rules and copy as WellnessCheckInSheet on the web (both run
 * on useWellnessCheckInForm); only the chrome changes, and it is the chrome of
 * NativeCheckInSheet: drag handle, swipe down to close, lavender accent.
 *
 * Every scale button carries its words as well as its number, and the whole
 * form fits a one-handed thumb: six rows of five, two yes/no, one line.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import useWellnessCheckInForm from './useWellnessCheckInForm';
import { WELLNESS_AREAS, BAND_STYLE, GUIDANCE_NOTE } from './wellnessCopy';

const SHEET_KEYFRAMES = `
@keyframes nwSheetIn  { from { transform: translateY(100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
@keyframes nwSheetOut { from { transform: translateY(0);    opacity: 1; } to { transform: translateY(100%); opacity: 0; } }
@keyframes nwScrimIn  { from { opacity: 0; } to { opacity: 1; } }
@keyframes nwScrimOut { from { opacity: 1; } to { opacity: 0; } }
`;

const SWIPE_THRESHOLD = 90;
const SWIPE_VEL_THRESHOLD = 400;

const ACCENT = '#5E6590';
const INK = '#0A0E1A';
const tap = { cursor: 'pointer', WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' };

function ScaleRow({ area, value, onChange }) {
  return (
    <div>
      <div style={sx.question}>{area.question}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 5 }}>
        {area.scale.map((label, i) => {
          const n = i + 1;
          const active = value === n;
          return (
            <button
              key={n}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(n)}
              style={{
                ...tap,
                padding: '9px 2px 8px', borderRadius: 12, minHeight: 54,
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                fontFamily: 'inherit',
                background: active ? ACCENT : 'rgba(255,255,255,.7)',
                color: active ? '#fff' : ACCENT,
                border: `1px solid ${active ? ACCENT : 'rgba(118,126,181,.22)'}`,
                boxShadow: active ? '0 4px 12px -6px rgba(94,101,144,.6)' : 'none',
                transition: 'background .15s ease, color .15s ease',
              }}
            >
              <span style={{ fontSize: 15, fontWeight: 800, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{n}</span>
              <span style={{
                fontSize: 9.5, fontWeight: 600, lineHeight: 1.15, textAlign: 'center',
                color: active ? 'rgba(255,255,255,.85)' : '#6B7280',
              }}
              >
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function YesNo({ question, hint, value, onChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ ...sx.question, marginBottom: 0 }}>{question}</div>
        {hint && <div style={{ fontSize: 11.5, color: '#6B7280', marginTop: 2, lineHeight: 1.35 }}>{hint}</div>}
      </div>
      <div style={{
        display: 'flex', flexShrink: 0, padding: 3, gap: 3, borderRadius: 12,
        background: 'rgba(118,126,181,.10)',
      }}
      >
        {[false, true].map((v) => {
          const active = value === v;
          const bg = active ? (v ? '#DC2626' : ACCENT) : 'transparent';
          return (
            <button
              key={String(v)}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(v)}
              style={{
                ...tap,
                minWidth: 52, padding: '8px 12px', borderRadius: 9, border: 'none',
                fontFamily: 'inherit', fontSize: 13.5, fontWeight: 800,
                background: bg, color: active ? '#fff' : ACCENT,
                transition: 'background .15s ease, color .15s ease',
              }}
            >
              {v ? 'Yes' : 'No'}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function HandoffButton({ children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...tap,
        width: '100%', textAlign: 'left', padding: '12px 13px', borderRadius: 12,
        fontFamily: 'inherit', fontSize: 13.5, fontWeight: 700, color: '#B91C1C',
        background: 'rgba(255,255,255,.85)', border: '1px solid #FECACA',
      }}
    >
      {children}
    </button>
  );
}

export default function NativeWellnessCheckInSheet({
  open,
  onClose,
  onSaved,
  onHandoff,
  existing = null,
  sharedWithCoach = true,
}) {
  const f = useWellnessCheckInForm({ open, existing, onSaved });

  const [closing, setClosing] = useState(false);
  const [dragY, setDragY] = useState(0);
  const touchStartYRef = useRef(0);
  const touchStartTimeRef = useRef(0);
  const isDraggingRef = useRef(false);

  // NativeLayout scrolls its own container, so locking document.body alone
  // leaves the page scrolling under the open sheet on iOS.
  useEffect(() => {
    if (!open) return undefined;
    const prevBody = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const scrollEl = document.getElementById('nl-content-scroll');
    const prevScroll = scrollEl?.style.overflow;
    if (scrollEl) scrollEl.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevBody;
      if (scrollEl) scrollEl.style.overflow = prevScroll ?? '';
    };
  }, [open]);

  useEffect(() => {
    if (open) { setClosing(false); setDragY(0); }
  }, [open]);

  const triggerClose = useCallback(() => {
    if (closing) return;
    setClosing(true);
    setDragY(0);
    setTimeout(() => {
      setClosing(false);
      onClose?.();
    }, 300);
  }, [closing, onClose]);

  const handleTouchStart = (e) => {
    touchStartYRef.current = e.touches[0].clientY;
    touchStartTimeRef.current = Date.now();
    isDraggingRef.current = true;
    setDragY(0);
  };
  const handleTouchMove = (e) => {
    if (!isDraggingRef.current) return;
    const dy = e.touches[0].clientY - touchStartYRef.current;
    if (dy > 0) {
      setDragY(dy);
      e.preventDefault();
    }
  };
  const handleTouchEnd = () => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    const dt = (Date.now() - touchStartTimeRef.current) / 1000;
    const vel = dt > 0 ? dragY / dt : 0;
    if (dragY > SWIPE_THRESHOLD || vel > SWIPE_VEL_THRESHOLD) triggerClose();
    else setDragY(0);
  };

  if (!open && !closing) return null;
  const modalRoot = (typeof document !== 'undefined' && document.getElementById('app-modal-root'))
    || (typeof document !== 'undefined' ? document.body : null);
  if (!modalRoot) return null;

  const scrimOpacity = dragY > 0 ? Math.max(0.05, 0.45 - dragY / 500) : (closing ? 0 : 0.45);
  const sheetAnimation = closing
    ? 'nwSheetOut .30s cubic-bezier(.4,0,1,1) both'
    : (dragY === 0 ? 'nwSheetIn .32s cubic-bezier(.22,1,.36,1) both' : 'none');

  const { saved } = f;
  const band = saved ? BAND_STYLE[saved.band] : null;
  const drag = { onTouchStart: handleTouchStart, onTouchMove: handleTouchMove, onTouchEnd: handleTouchEnd };

  const content = (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, pointerEvents: 'auto' }}>
      <style>{SHEET_KEYFRAMES}</style>

      <div
        onClick={triggerClose}
        role="presentation"
        style={{
          position: 'absolute', inset: 0,
          background: `rgba(10,14,26,${scrimOpacity.toFixed(2)})`,
          backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)',
          animation: closing ? 'nwScrimOut .30s ease both' : 'nwScrimIn .25s ease both',
        }}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Wellness check-in"
        style={{
          position: 'absolute', left: 0, right: 0, bottom: 0,
          maxHeight: 'calc(100dvh - env(safe-area-inset-top, 0px) - 12px)',
          background: 'linear-gradient(180deg, rgba(255,255,255,.97), rgba(238,240,244,.99))',
          backdropFilter: 'blur(28px) saturate(170%)', WebkitBackdropFilter: 'blur(28px) saturate(170%)',
          borderTopLeftRadius: 22, borderTopRightRadius: 22,
          boxShadow: '0 -10px 32px -8px rgba(10,14,26,.18)',
          paddingBottom: 'env(safe-area-inset-bottom)',
          display: 'flex', flexDirection: 'column',
          animation: sheetAnimation,
          transform: dragY > 0 ? `translateY(${dragY}px)` : undefined,
          transition: dragY > 0 || closing ? 'none' : 'transform .3s cubic-bezier(.22,1,.36,1)',
          fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif',
          willChange: 'transform',
        }}
      >
        <div {...drag} style={{ padding: '10px 0 6px', cursor: 'grab', flexShrink: 0, touchAction: 'none' }}>
          <div style={{ width: 44, height: 4, borderRadius: 9999, background: 'rgba(118,126,181,.3)', margin: '0 auto' }} />
        </div>

        <div
          {...drag}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
            padding: '4px 18px 12px', borderBottom: '1px solid rgba(118,126,181,.12)',
            flexShrink: 0, touchAction: 'none', cursor: 'grab',
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: ACCENT, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              Daily check-in{sharedWithCoach ? ' · shared with your coach' : ''}
            </div>
            <div style={{ fontSize: 17, fontWeight: 800, color: INK, letterSpacing: '-0.02em', marginTop: 1 }}>
              How are you today?
            </div>
          </div>
          <button
            type="button"
            onClick={triggerClose}
            onTouchStart={(e) => e.stopPropagation()}
            aria-label="Close"
            style={{
              ...tap,
              width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
              background: 'rgba(118,126,181,.12)', border: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: ACCENT,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
              <line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" />
            </svg>
          </button>
        </div>

        {/* The save button sits at the end of the scroll rather than pinned:
            there is no keyboard-avoidance layer, so a pinned button would hide
            under the keyboard while typing the note. */}
        <div
          style={{
            flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch',
            overscrollBehavior: 'contain', touchAction: 'pan-y',
            padding: '14px 18px calc(20px + env(safe-area-inset-bottom))',
            display: 'flex', flexDirection: 'column', gap: 18,
          }}
        >
          {!saved ? (
            <>
              {WELLNESS_AREAS.map((area) => (
                <ScaleRow key={area.key} area={area} value={f.answers[area.key]} onChange={(v) => f.setAnswer(area.key, v)} />
              ))}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 2 }}>
                <YesNo
                  question="Do you have any pain?"
                  hint="Joint, tendon or anything that isn't normal muscle soreness"
                  value={f.pain}
                  onChange={f.setPain}
                />
                <YesNo question="Are you feeling ill?" value={f.illness} onChange={f.setIllness} />
              </div>

              <div>
                <div style={sx.question}>
                  Anything else we should know?
                  <span style={{ fontWeight: 600, color: '#9CA3AF' }}> Optional</span>
                </div>
                <textarea
                  value={f.note}
                  onChange={(e) => f.setNote(e.target.value)}
                  rows={2}
                  placeholder="Travel, exams, a bad night…"
                  style={{ ...sx.input, resize: 'none' }}
                />
              </div>

              {f.error && <div style={sx.warnRed}>{f.error}</div>}

              <button
                type="button"
                onClick={f.save}
                disabled={!f.complete || f.saving}
                style={{
                  ...tap,
                  width: '100%', padding: '14px 16px', borderRadius: 14,
                  background: f.complete ? ACCENT : 'rgba(118,126,181,.25)',
                  border: `1px solid ${f.complete ? ACCENT : 'transparent'}`,
                  color: '#fff', fontFamily: 'inherit', fontSize: 14, fontWeight: 800,
                  opacity: f.saving ? 0.6 : 1,
                  boxShadow: f.complete ? '0 4px 12px -4px rgba(94,101,144,.5)' : 'none',
                  cursor: f.complete ? 'pointer' : 'default',
                }}
              >
                {f.saving ? 'Saving…' : f.complete ? 'Save check-in' : `${f.answered} of ${f.total} answered`}
              </button>
            </>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{
                  fontSize: 44, lineHeight: 1, fontWeight: 800, letterSpacing: '-0.03em',
                  color: band?.hex || INK, fontVariantNumeric: 'tabular-nums',
                }}
                >
                  {saved.checkIn.score}
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: INK }}>Thanks, saved</div>
                  {band && (
                    <span style={{
                      display: 'inline-block', marginTop: 4, fontSize: 10.5, fontWeight: 800,
                      color: band.hex, background: `${band.hex}1A`, borderRadius: 8, padding: '3px 8px',
                    }}
                    >
                      {band.label}
                    </span>
                  )}
                </div>
              </div>

              {f.handoffNeeded ? (
                <div style={{ ...sx.warnRed, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div>
                    {saved.checkIn.pain && saved.checkIn.illness
                      ? 'You mentioned pain and feeling ill.'
                      : saved.checkIn.pain ? 'You mentioned pain.' : 'You mentioned feeling ill.'}
                    {' '}Logging it gives you and your coach a plan for getting back to full training.
                  </div>
                  {!f.episodesLoaded ? (
                    <div style={{ fontSize: 11.5 }}>Checking what is already logged…</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                      {f.relevantEpisodes.map((item) => (
                        <HandoffButton key={item.episode._id} onClick={() => onHandoff?.({ type: 'episode', item }, saved.checkIn)}>
                          Update: {item.catalogEntry?.shortLabel || item.catalogEntry?.label || 'open episode'}
                        </HandoffButton>
                      ))}
                      {saved.checkIn.pain && (
                        <HandoffButton onClick={() => onHandoff?.({ type: 'new', kind: 'injury' }, saved.checkIn)}>
                          Log a new injury or pain
                        </HandoffButton>
                      )}
                      {saved.checkIn.illness && (
                        <HandoffButton onClick={() => onHandoff?.({ type: 'new', kind: 'illness' }, saved.checkIn)}>
                          Log an illness
                        </HandoffButton>
                      )}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={triggerClose}
                    style={{ ...tap, alignSelf: 'flex-start', background: 'none', border: 'none', padding: '2px 0', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700, color: '#B91C1C' }}
                  >
                    Not now
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={triggerClose}
                  style={{
                    ...tap,
                    width: '100%', padding: '14px 16px', borderRadius: 14, border: 'none',
                    background: ACCENT, color: '#fff', fontFamily: 'inherit', fontSize: 14, fontWeight: 800,
                  }}
                >
                  Done
                </button>
              )}
              <div style={{ fontSize: 10.5, lineHeight: 1.4, color: '#9CA3AF' }}>{GUIDANCE_NOTE}</div>
            </>
          )}
        </div>
      </div>
    </div>
  );

  return ReactDOM.createPortal(content, modalRoot);
}

// Same tokens as NativeCheckInSheet. Inputs stay at 14px: smaller triggers
// iOS focus-zoom.
const sx = {
  question: { fontSize: 13.5, fontWeight: 700, color: INK, marginBottom: 9, lineHeight: 1.35 },
  input: {
    width: '100%', fontFamily: 'inherit', fontSize: 14, fontWeight: 600, color: INK,
    padding: '11px 12px', borderRadius: 10, border: '1px solid rgba(118,126,181,.22)',
    background: 'rgba(255,255,255,.8)', outline: 'none', WebkitAppearance: 'none', appearance: 'none',
  },
  warnRed: {
    fontSize: 12.5, lineHeight: 1.5, color: '#B91C1C',
    background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 12, padding: '11px 13px',
  },
};
