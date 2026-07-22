import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { connectStrava } from '../../utils/connectStrava';
import { startGarminAuth } from '../../services/api';
import { isAppleHealthSupported } from '../../services/appleHealthCapacitor';

const SWIPE_THRESHOLD = 80;
const SWIPE_VEL_THRESHOLD = 400;

/**
 * StravaConnectModal — bottom-sheet prompt in the native app when Strava
 * isn't connected yet. Portals into #app-modal-root (pointer-events:none
 * on the root — this overlay must set pointerEvents:auto).
 */
export default function StravaConnectModal({ open, onClose }) {
  const [busy, setBusy] = useState(false);
  const [dragY, setDragY] = useState(0);
  const [closing, setClosing] = useState(false);
  const touchStartYRef = useRef(0);
  const touchStartTimeRef = useRef(0);
  const isDraggingRef = useRef(false);

  const triggerClose = useCallback(() => {
    if (closing) return;
    setClosing(true);
    setDragY(0);
    setTimeout(() => {
      setClosing(false);
      onClose?.();
    }, 280);
  }, [closing, onClose]);

  useEffect(() => {
    if (!open) return;
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
    if (open) {
      setClosing(false);
      setDragY(0);
    }
  }, [open]);

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
    if (dragY > SWIPE_THRESHOLD || vel > SWIPE_VEL_THRESHOLD) {
      triggerClose();
    } else {
      setDragY(0);
    }
  };

  const handleConnect = async () => {
    setBusy(true);
    try {
      await connectStrava();
      onClose?.();
    } finally {
      setBusy(false);
    }
  };

  const [busyGarmin, setBusyGarmin] = useState(false);
  const handleConnectGarmin = async () => {
    setBusyGarmin(true);
    try {
      const url = await startGarminAuth();
      window.location.href = url; // Garmin OAuth consent → /garmin/callback
    } catch (e) {
      console.error('Garmin connect error:', e);
      setBusyGarmin(false);
    }
  };

  const appleHealthSupported = isAppleHealthSupported();
  const [busyAH, setBusyAH] = useState(false);
  const [ahMsg, setAhMsg] = useState(null);
  const handleConnectAppleHealth = async () => {
    setBusyAH(true);
    setAhMsg(null);
    try {
      const { requestAppleHealthAccess, collectAppleHealthWellness } = await import('../../services/appleHealthCapacitor');
      const { syncAppleHealthWellness } = await import('../../services/api');
      await requestAppleHealthAccess();
      // Recovery-only connect (sleep / resting HR / HRV) — workouts come from
      // Strava/Garmin, matching the opt-out default in Settings.
      const wellness = await collectAppleHealthWellness(30);
      await syncAppleHealthWellness({ wellness, markConnected: true });
      try { window.dispatchEvent(new CustomEvent('appleHealth:synced', { detail: { wellnessDays: wellness.length } })); } catch { /* ignore */ }
      onClose?.();
    } catch (e) {
      console.error('Apple Health connect error:', e);
      setAhMsg('Could not read Apple Health. In Health → Profile → Apps → LaChart, enable Sleep, Resting HR and HRV, then try again.');
    } finally {
      setBusyAH(false);
    }
  };
  const anyBusy = busy || busyGarmin || busyAH;

  if (!open && !closing) return null;

  const modalRoot = document.getElementById('app-modal-root') || document.body;
  const scrimOpacity = dragY > 0 ? Math.max(0.12, 0.55 - dragY / 400) : 0.55;
  const sheetTransform = dragY > 0
    ? `translateY(${dragY}px)`
    : closing
      ? 'translateY(100%)'
      : 'translateY(0)';

  return ReactDOM.createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2147483646,
        pointerEvents: 'auto',
      }}
    >
      <div
        onClick={triggerClose}
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          background: `rgba(0,0,0,${scrimOpacity.toFixed(2)})`,
          WebkitBackdropFilter: 'blur(4px)',
          backdropFilter: 'blur(4px)',
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="strava-connect-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-white rounded-t-3xl"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          margin: '0 auto',
          transform: sheetTransform,
          transition: dragY > 0 ? 'none' : 'transform .28s cubic-bezier(.4,0,.2,1)',
          padding: '8px 20px calc(24px + env(safe-area-inset-bottom, 0px))',
          fontFamily: '-apple-system, "SF Pro Display", system-ui, sans-serif',
        }}
      >
        <div
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          style={{ padding: '8px 0 12px', touchAction: 'none', cursor: 'grab' }}
        >
          <div
            className="mx-auto"
            style={{ width: 44, height: 5, borderRadius: 999, background: '#d1d5db' }}
          />
        </div>

        <div className="flex items-center justify-center mb-3">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(252,82,0,0.12)' }}>
            <svg width="30" height="30" viewBox="0 0 24 24" fill="#FC5200" aria-hidden>
              <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
            </svg>
          </div>
        </div>

        <h2 id="strava-connect-title" className="text-center text-lg font-bold text-gray-900 mb-1">
          Connect your data
        </h2>
        <p className="text-center text-sm text-gray-500 mb-5 leading-relaxed">
          Sync activities and training history from Strava or Garmin — laps, pace, heart rate and more.
          {appleHealthSupported ? ' Add Apple Health for sleep, resting HR and HRV recovery.' : ''}
        </p>

        <button
          type="button"
          onClick={handleConnect}
          disabled={anyBusy}
          className="w-full py-3 rounded-xl text-white text-sm font-bold disabled:opacity-60"
          style={{ background: '#FC5200' }}
        >
          {busy ? 'Opening Strava…' : 'Connect with Strava'}
        </button>
        <button
          type="button"
          onClick={handleConnectGarmin}
          disabled={anyBusy}
          className="w-full py-3 mt-2 rounded-xl text-white text-sm font-bold disabled:opacity-60"
          style={{ background: '#007CC3' }}
        >
          {busyGarmin ? 'Opening Garmin…' : 'Connect with Garmin'}
        </button>
        {appleHealthSupported && (
          <button
            type="button"
            onClick={handleConnectAppleHealth}
            disabled={anyBusy}
            className="w-full py-3 mt-2 rounded-xl text-white text-sm font-bold disabled:opacity-60 flex items-center justify-center gap-2"
            style={{ background: '#111827' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="#FF375F" aria-hidden>
              <path d="M12 21s-7-4.35-9.5-8.5C.5 8.5 3 5 6.5 5 8.5 5 10 6 12 8c2-2 3.5-3 5.5-3C21 5 23.5 8.5 21.5 12.5 19 16.65 12 21 12 21z" />
            </svg>
            {busyAH ? 'Reading Apple Health…' : 'Connect Apple Health'}
          </button>
        )}
        {ahMsg && (
          <p className="text-center text-[11px] text-rose-600 mt-2 leading-snug">{ahMsg}</p>
        )}
        <button
          type="button"
          onClick={triggerClose}
          className="w-full py-3 mt-2 text-sm font-semibold text-gray-500"
        >
          Maybe later
        </button>
      </div>
    </div>,
    modalRoot
  );
}
