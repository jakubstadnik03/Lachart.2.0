// Full-height bottom sheet that wraps the existing NewTestingComponent so the
// native testing page can let users record a new lab test in one tap. On save,
// the test is sent through the same `addTest` API and bubbled back via
// `onCreated(test)` so the parent can refresh its list.

import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import NewTestingComponent from '../Testing-page/NewTestingComponent';
import { addTest } from '../../services/api';

const SHEET_KEYFRAMES = `
@keyframes ndSheetIn  { from { transform: translateY(100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
@keyframes ndSheetOut { from { transform: translateY(0);    opacity: 1; } to { transform: translateY(100%); opacity: 0; } }
@keyframes ndScrimIn  { from { opacity: 0; } to { opacity: 1; } }
@keyframes ndScrimOut { from { opacity: 1; } to { opacity: 0; } }
`;

// Velocity threshold (px/s) above which a fast flick closes even if distance < SWIPE_THRESHOLD
const SWIPE_THRESHOLD = 90;   // px down to trigger close on slow drag
const SWIPE_VEL_THRESHOLD = 400; // px/s fast flick

export default function NewTestSheet({
  open,
  onClose,
  onCreated,
  defaultSport = 'all',
  athleteId,
  user,
}) {
  const [error, setError]   = useState(null);
  const [saving, setSaving] = useState(false);

  // Close animation state
  const [closing, setClosing] = useState(false);

  // Swipe-down drag state
  const [dragY, setDragY]       = useState(0);
  const touchStartYRef          = useRef(0);
  const touchStartTimeRef       = useRef(0);
  const isDraggingRef           = useRef(false);
  const sheetRef                = useRef(null);

  // Lock body scroll while open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // Reset close state when sheet re-opens
  useEffect(() => {
    if (open) { setClosing(false); setDragY(0); }
  }, [open]);

  // Trigger animated close → then notify parent
  const triggerClose = useCallback(() => {
    if (closing) return;
    setClosing(true);
    setDragY(0);
    setTimeout(() => {
      onClose && onClose();
    }, 300);
  }, [closing, onClose]);

  // ── Touch handlers (drag handle + header only) ──────────────────────────
  const handleTouchStart = (e) => {
    touchStartYRef.current    = e.touches[0].clientY;
    touchStartTimeRef.current = Date.now();
    isDraggingRef.current     = true;
    setDragY(0);
  };

  const handleTouchMove = (e) => {
    if (!isDraggingRef.current) return;
    const dy = e.touches[0].clientY - touchStartYRef.current;
    if (dy > 0) {
      setDragY(dy);
      e.preventDefault(); // prevent page scroll while dragging sheet
    }
  };

  const handleTouchEnd = (e) => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    const dt  = (Date.now() - touchStartTimeRef.current) / 1000;
    const vel = dt > 0 ? dragY / dt : 0;
    if (dragY > SWIPE_THRESHOLD || vel > SWIPE_VEL_THRESHOLD) {
      triggerClose();
    } else {
      setDragY(0);
    }
  };

  // ── Submit handler ───────────────────────────────────────────────────────
  const handleSubmit = async (newTest) => {
    setSaving(true); setError(null);
    try {
      const role = String(user?.role || '').toLowerCase();
      let athleteIdForSave;
      if (role === 'athlete') athleteIdForSave = user?._id;
      else if (role === 'tester' || role === 'testing') {
        if (!athleteId || String(athleteId) === String(user?._id)) {
          throw new Error('Select an athlete first — tester accounts cannot save tests to themselves.');
        }
        athleteIdForSave = athleteId;
      } else {
        athleteIdForSave = athleteId || user?._id;
      }
      if (!athleteIdForSave) throw new Error('Could not determine athlete for this test.');

      const processedTest = {
        ...newTest,
        athleteId: athleteIdForSave,
        results: (newTest.results || []).map(r => ({
          ...r,
          power:     Number(r.power)     || 0,
          heartRate: Number(r.heartRate) || 0,
          lactate:   Number(r.lactate)   || 0,
          glucose:   Number(r.glucose)   || 0,
          RPE:       Number(r.RPE)       || 0,
        })),
      };

      const response = await addTest(processedTest);
      const created = response?.data;
      if (created) onCreated && onCreated(created);
      triggerClose();
      return created;
    } catch (e) {
      const msg = e?.response?.data?.error || e?.message || 'Failed to save test';
      setError(msg);
      throw e;
    } finally {
      setSaving(false);
    }
  };

  if (!open && !closing) return null;

  const modalRoot = (typeof document !== 'undefined' && document.getElementById('app-modal-root'))
    || (typeof document !== 'undefined' ? document.body : null);
  if (!modalRoot) return null;

  // Interpolate scrim opacity while dragging
  const scrimOpacity = dragY > 0
    ? Math.max(0.05, 0.45 - dragY / 500)
    : (closing ? 0 : 0.45);

  const sheetAnimation = closing
    ? 'ndSheetOut .30s cubic-bezier(.4,0,1,1) both'
    : (dragY === 0 ? 'ndSheetIn .32s cubic-bezier(.22,1,.36,1) both' : 'none');

  const sheetTransform  = dragY > 0 ? `translateY(${dragY}px)` : undefined;
  const sheetTransition = dragY > 0 ? 'none' : (closing ? 'none' : 'transform .3s cubic-bezier(.22,1,.36,1)');

  const content = (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, pointerEvents: 'auto' }}>
      <style>{SHEET_KEYFRAMES}</style>

      {/* Scrim */}
      <div
        onClick={triggerClose}
        style={{
          position: 'absolute', inset: 0,
          background: `rgba(10,14,26,${scrimOpacity.toFixed(2)})`,
          backdropFilter: 'blur(2px)',
          WebkitBackdropFilter: 'blur(2px)',
          animation: closing ? 'ndScrimOut .30s ease both' : 'ndScrimIn .25s ease both',
          transition: dragY > 0 ? 'background .05s linear' : undefined,
        }}
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        style={{
          position: 'absolute', left: 0, right: 0, bottom: 0,
          top: 'env(safe-area-inset-top, 44px)',
          background: 'linear-gradient(180deg, rgba(255,255,255,.97), rgba(238,240,244,.99))',
          backdropFilter: 'blur(28px) saturate(170%)',
          WebkitBackdropFilter: 'blur(28px) saturate(170%)',
          borderTopLeftRadius: 22, borderTopRightRadius: 22,
          boxShadow: '0 -10px 32px -8px rgba(10,14,26,.18)',
          paddingBottom: 'env(safe-area-inset-bottom)',
          display: 'flex', flexDirection: 'column',
          animation: sheetAnimation,
          transform: sheetTransform,
          transition: sheetTransition,
          fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif',
          willChange: 'transform',
        }}
      >
        {/* Drag handle — touch target for swipe-down */}
        <div
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          style={{ padding: '10px 0 6px', cursor: 'grab', flexShrink: 0, touchAction: 'none' }}
        >
          <div style={{
            width: 44, height: 4, borderRadius: 9999,
            background: 'rgba(118,126,181,.3)', margin: '0 auto',
          }} />
        </div>

        {/* Header — also acts as a drag zone */}
        <div
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '4px 18px 12px',
            borderBottom: '1px solid rgba(118,126,181,.12)',
            flexShrink: 0,
            touchAction: 'none',
            cursor: 'grab',
          }}
        >
          <div>
            <div style={{
              fontSize: 11, fontWeight: 800, color: '#7C3AED',
              letterSpacing: '0.06em', textTransform: 'uppercase',
            }}>
              Lab test
            </div>
            <div style={{
              fontSize: 17, fontWeight: 800, color: '#0A0E1A',
              letterSpacing: '-0.02em', marginTop: 1,
            }}>
              New test
            </div>
          </div>
          <button
            onClick={triggerClose}
            onTouchStart={(e) => e.stopPropagation()}
            style={{
              width: 34, height: 34, borderRadius: '50%',
              background: 'rgba(118,126,181,.12)', border: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#5E6590', cursor: 'pointer', fontFamily: 'inherit',
              WebkitTapHighlightColor: 'transparent',
            }}
            aria-label="Close"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
              <line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" />
            </svg>
          </button>
        </div>

        {/* Saving / error feedback strip */}
        {(saving || error) && (
          <div style={{
            padding: '8px 18px',
            background: error ? '#FEF2F2' : '#F0F9FF',
            color: error ? '#B91C1C' : '#075985',
            fontSize: 12, fontWeight: 600,
            borderBottom: `1px solid ${error ? '#FECACA' : '#BAE6FD'}`,
            flexShrink: 0,
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            {error ? (
              <>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                <span>{error}</span>
              </>
            ) : (
              <>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, animation: 'ndSpin 1s linear infinite' }}>
                  <line x1="12" y1="2"  x2="12" y2="6" />
                  <line x1="12" y1="18" x2="12" y2="22" />
                  <line x1="4.93" y1="4.93" x2="7.76" y2="7.76" />
                  <line x1="16.24" y1="16.24" x2="19.07" y2="19.07" />
                  <line x1="2" y1="12"  x2="6" y2="12" />
                  <line x1="18" y1="12" x2="22" y2="12" />
                  <line x1="4.93" y1="19.07" x2="7.76" y2="16.24" />
                  <line x1="16.24" y1="7.76" x2="19.07" y2="4.93" />
                </svg>
                <span>Saving test…</span>
              </>
            )}
          </div>
        )}

        {/* Form body — scrollable */}
        <div style={{
          flex: 1, minHeight: 0,
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          padding: '4px 12px 16px',
        }}>
          <NewTestingComponent
            selectedSport={defaultSport}
            onSubmit={handleSubmit}
          />
        </div>
      </div>
    </div>
  );

  return ReactDOM.createPortal(content, modalRoot);
}
