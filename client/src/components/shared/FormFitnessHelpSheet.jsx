/**
 * Bottom sheet — explains Fitness / Fatigue / Form (CTL / ATL / TSB).
 * Native-friendly; also works on web dashboard.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import {
  FORM_FITNESS_INTRO,
  FORM_FITNESS_METRICS,
  TSB_STATUS_BANDS,
} from '../../utils/formFitnessMetrics';

const SWIPE_THRESHOLD = 90;
const SWIPE_VEL_THRESHOLD = 400;

function lockPageScroll() {
  const locked = [];
  const lock = (el) => {
    if (!el) return;
    locked.push({
      el,
      overflow: el.style.overflow,
      touchAction: el.style.touchAction,
    });
    el.style.overflow = 'hidden';
    el.style.touchAction = 'none';
  };
  lock(document.documentElement);
  lock(document.body);
  lock(document.getElementById('nl-content-scroll'));
  return () => {
    locked.forEach(({ el, overflow, touchAction }) => {
      el.style.overflow = overflow;
      el.style.touchAction = touchAction;
    });
  };
}

export default function FormFitnessHelpSheet({ open, onClose }) {
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const touchStartYRef = useRef(0);
  const touchStartTimeRef = useRef(0);
  const isDraggingRef = useRef(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    return lockPageScroll();
  }, [open]);

  // Block background scroll chaining on iOS — allow scroll only inside the sheet body.
  useEffect(() => {
    if (!open) return undefined;
    const onTouchMove = (e) => {
      if (scrollRef.current?.contains(e.target)) return;
      e.preventDefault();
    };
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => document.removeEventListener('touchmove', onTouchMove);
  }, [open]);

  useEffect(() => {
    if (open) setDragY(0);
  }, [open]);

  const triggerClose = useCallback(() => {
    setDragY(0);
    onClose?.();
  }, [onClose]);

  const handleTouchStart = (e) => {
    touchStartYRef.current = e.touches[0].clientY;
    touchStartTimeRef.current = Date.now();
    isDraggingRef.current = true;
    setDragging(true);
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

  const handleTouchEnd = (e) => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    setDragging(false);
    const endY = e.changedTouches?.[0]?.clientY ?? touchStartYRef.current;
    const finalDy = Math.max(0, endY - touchStartYRef.current);
    const dt = (Date.now() - touchStartTimeRef.current) / 1000;
    const vel = dt > 0 ? finalDy / dt : 0;
    if (finalDy > SWIPE_THRESHOLD || vel > SWIPE_VEL_THRESHOLD) {
      triggerClose();
    } else {
      setDragY(0);
    }
  };

  if (!open) return null;

  const sheetTransform = dragY > 0 ? `translateY(${dragY}px)` : undefined;

  return ReactDOM.createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Form and Fitness explained"
      onClick={triggerClose}
      onTouchStart={(e) => e.stopPropagation()}
      onTouchMove={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10050,
        background: 'rgba(10,14,26,.45)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        pointerEvents: 'auto',
        WebkitTapHighlightColor: 'transparent',
        animation: 'ffHelpFadeIn .2s ease both',
      }}
    >
      <style>{`
        @keyframes ffHelpFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes ffHelpSlideUp { from { transform: translateY(24px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
      `}</style>

      <div
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
        onTouchEnd={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 520,
          maxHeight: 'min(88vh, 720px)',
          height: 'min(88vh, 720px)',
          display: 'flex',
          flexDirection: 'column',
          background: '#fff',
          borderRadius: '20px 20px 0 0',
          boxShadow: '0 -8px 40px rgba(10,14,26,.12)',
          transform: sheetTransform,
          transition: dragging ? 'none' : 'transform .28s cubic-bezier(.22,1,.36,1)',
          animation: dragY === 0 && !dragging ? 'ffHelpSlideUp .28s cubic-bezier(.22,1,.36,1) both' : 'none',
          overflow: 'hidden',
          pointerEvents: 'auto',
        }}
      >
        {/* Drag handle */}
        <div
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          style={{
            flexShrink: 0,
            padding: '10px 0 4px',
            touchAction: 'none',
            cursor: 'grab',
          }}
        >
          <div
            style={{
              width: 44,
              height: 4,
              borderRadius: 9999,
              background: 'rgba(118,126,181,.3)',
              margin: '0 auto',
            }}
          />
        </div>

        {/* Header — swipe to close */}
        <div
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 18px 12px',
            borderBottom: '1px solid rgba(118,126,181,.12)',
            flexShrink: 0,
            touchAction: 'none',
            cursor: 'grab',
          }}
        >
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#0A0E1A' }}>Form &amp; Fitness</h2>
          <button
            type="button"
            onClick={triggerClose}
            onPointerDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            aria-label="Close"
            style={{
              width: 32,
              height: 32,
              borderRadius: 999,
              border: 'none',
              background: 'rgba(118,126,181,.12)',
              color: '#5E6590',
              fontSize: 18,
              fontWeight: 700,
              cursor: 'pointer',
              touchAction: 'manipulation',
            }}
          >
            ×
          </button>
        </div>

        {/* Scrollable body */}
        <div
          ref={scrollRef}
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            WebkitOverflowScrolling: 'touch',
            overscrollBehavior: 'contain',
            touchAction: 'pan-y',
            padding: '14px 18px calc(20px + env(safe-area-inset-bottom))',
          }}
        >
          <p style={{ margin: '0 0 16px', fontSize: 13, lineHeight: 1.55, color: '#4B5563' }}>
            {FORM_FITNESS_INTRO}
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
            {FORM_FITNESS_METRICS.map((m) => (
              <div
                key={m.id}
                style={{
                  padding: '12px 14px',
                  borderRadius: 14,
                  background: 'rgba(118,126,181,.06)',
                  border: '1px solid rgba(118,126,181,.12)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                  <span style={{ fontSize: 14, fontWeight: 800, color: m.color }}>{m.label}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', letterSpacing: '0.04em' }}>
                    {m.aliases.join(' · ')}
                  </span>
                </div>
                <p style={{ margin: '0 0 6px', fontSize: 12.5, fontWeight: 600, color: '#374151' }}>{m.short}</p>
                <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: '#6B7280' }}>{m.detail}</p>
              </div>
            ))}
          </div>

          <h3 style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 800, color: '#6B7280', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Status labels (from TSB)
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 8 }}>
            {TSB_STATUS_BANDS.map((band) => (
              <div key={band.label} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: band.color,
                    marginTop: 5,
                    flexShrink: 0,
                  }}
                />
                <div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#0A0E1A' }}>{band.label}</span>
                  <span style={{ fontSize: 12, color: '#6B7280', marginLeft: 6 }}>
                    {band.min > -Infinity ? `(TSB > ${band.min})` : `(TSB ≤ −30)`}
                  </span>
                  <p style={{ margin: '2px 0 0', fontSize: 12, lineHeight: 1.45, color: '#6B7280' }}>{band.hint}</p>
                </div>
              </div>
            ))}
          </div>

          <p style={{ margin: 0, fontSize: 11, color: '#9CA3AF', lineHeight: 1.45 }}>
            Tip: tap Fitness, Fatigue or Form in the status view to switch the sparkline. Use Form chart for the full CTL / ATL / TSB history.
          </p>
        </div>
      </div>
    </div>,
    document.getElementById('app-modal-root') || document.body,
  );
}
