import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import { connectStrava } from '../../utils/connectStrava';

/**
 * StravaConnectModal — a friendly bottom-sheet prompt shown in the native app
 * when the user hasn't connected Strava yet. Lets them start the OAuth flow
 * right from the dashboard instead of digging into Settings.
 */
export default function StravaConnectModal({ open, onClose }) {
  const [busy, setBusy] = useState(false);
  if (!open) return null;

  const handleConnect = async () => {
    setBusy(true);
    try {
      await connectStrava();
      // Native: Safari opens for OAuth; the deep-link return refreshes status.
      // Close the sheet so the user lands back on the dashboard cleanly.
      onClose?.();
    } finally {
      setBusy(false);
    }
  };

  return ReactDOM.createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 2147483646,
        background: 'rgba(0,0,0,.55)', WebkitBackdropFilter: 'blur(4px)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-2xl sm:mb-4"
        style={{
          padding: '14px 20px calc(24px + env(safe-area-inset-bottom, 0px))',
          fontFamily: '-apple-system, "SF Pro Display", system-ui, sans-serif',
        }}
      >
        <div className="sm:hidden mx-auto mb-3" style={{ width: 44, height: 5, borderRadius: 999, background: '#d1d5db' }} />

        {/* Strava mark */}
        <div className="flex items-center justify-center mb-3">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(252,82,0,0.12)' }}>
            <svg width="30" height="30" viewBox="0 0 24 24" fill="#FC5200" aria-hidden>
              <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
            </svg>
          </div>
        </div>

        <h2 className="text-center text-lg font-bold text-gray-900 mb-1">Connect Strava</h2>
        <p className="text-center text-sm text-gray-500 mb-5 leading-relaxed">
          Sync your activities automatically and import your full training history — laps, pace, heart rate and more.
        </p>

        <button
          onClick={handleConnect}
          disabled={busy}
          className="w-full py-3 rounded-xl text-white text-sm font-bold disabled:opacity-60"
          style={{ background: '#FC5200' }}
        >
          {busy ? 'Opening Strava…' : 'Connect with Strava'}
        </button>
        <button
          onClick={onClose}
          className="w-full py-3 mt-2 text-sm font-semibold text-gray-500"
        >
          Maybe later
        </button>
      </div>
    </div>,
    document.getElementById('app-modal-root') || document.body
  );
}
