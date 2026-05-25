/**
 * ActiveWorkoutBar
 * ─────────────────
 * Prominent "workout is still running" banner that appears below the
 * NativeTopBar whenever a session is active and the user is on any
 * route other than the execution page itself.
 *
 * Design: full-width dark pill that shows
 *   • animated green pulse dot
 *   • elapsed timer
 *   • live power (W) — from BLE trainer
 *   • live heart rate (bpm)
 *   • step / status label
 *   • tap whole row → back to workout
 *   • × button (two-tap confirm) → end session
 */
import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useHasActiveSession } from '../../context/WorkoutSessionContext';
import { XMarkIcon } from '@heroicons/react/24/solid';

function fmtTime(s) {
  const sec = Math.max(0, Math.round(s || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const r = sec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(r).padStart(2,'0')}`;
  return `${m}:${String(r).padStart(2,'0')}`;
}

export default function ActiveWorkoutBar() {
  const session = useHasActiveSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [confirmQuit, setConfirmQuit] = useState(false);
  // No local tick needed — WorkoutSessionContext updates totalElapsed
  // every second via its own interval, which re-renders this component.

  // Only show when a session is active and we're NOT on the execution page.
  if (!session) return null;
  if (/^\/workout-execution(\/|$)/.test(location.pathname)) return null;

  const {
    plannedWorkoutId, athleteId, totalElapsed, isRunning,
    power, heartRate, autoPausedAt, endSession,
  } = session;

  const href = `/workout-execution/${plannedWorkoutId}${athleteId ? `?athleteId=${athleteId}` : ''}`;

  const handleResume = () => navigate(href);
  const handleQuit = (e) => {
    e.stopPropagation();
    if (!confirmQuit) {
      setConfirmQuit(true);
      setTimeout(() => setConfirmQuit(false), 3000);
      return;
    }
    endSession?.();
    setConfirmQuit(false);
  };

  const isPaused = autoPausedAt || !isRunning;
  const statusLabel = autoPausedAt ? 'Auto-paused' : isRunning ? 'Recording' : 'Paused';

  return (
    <>
      <style>{`
        @keyframes awbPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.4; transform: scale(0.7); }
        }
        @keyframes awbGlow {
          0%, 100% { box-shadow: 0 2px 16px -4px rgba(34,197,94,0.35); }
          50%       { box-shadow: 0 2px 24px -2px rgba(34,197,94,0.6); }
        }
      `}</style>

      <button
        onClick={handleResume}
        aria-label="Return to active workout"
        style={{
          display: 'flex',
          alignItems: 'center',
          width: '100%',
          background: isPaused
            ? 'linear-gradient(90deg,#1c1917,#292524)'
            : 'linear-gradient(90deg,#052e16,#14532d)',
          borderBottom: isPaused
            ? '1px solid rgba(245,158,11,0.25)'
            : '1px solid rgba(34,197,94,0.25)',
          padding: '0 12px',
          height: 48,
          gap: 10,
          flexShrink: 0,
          WebkitTapHighlightColor: 'transparent',
          touchAction: 'manipulation',
          cursor: 'pointer',
          animation: isRunning ? 'awbGlow 2.5s ease-in-out infinite' : undefined,
        }}
      >
        {/* Pulse dot */}
        <span style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: isPaused ? '#f59e0b' : '#4ade80',
          flexShrink: 0,
          animation: isRunning ? 'awbPulse 1.4s ease-in-out infinite' : undefined,
        }} />

        {/* Status label */}
        <span style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: isPaused ? '#fbbf24' : '#86efac',
          flexShrink: 0,
          lineHeight: 1,
        }}>
          {statusLabel}
        </span>

        {/* Divider */}
        <span style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.12)', flexShrink: 0 }} />

        {/* Timer */}
        <span style={{
          fontSize: 18,
          fontWeight: 900,
          fontVariantNumeric: 'tabular-nums',
          color: '#f9fafb',
          letterSpacing: '-0.01em',
          lineHeight: 1,
          flexShrink: 0,
        }}>
          {fmtTime(totalElapsed)}
        </span>

        {/* Metrics — power + HR */}
        <span style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end', minWidth: 0 }}>
          {/* Power */}
          <span style={{
            display: 'flex',
            alignItems: 'center',
            gap: 3,
            background: 'rgba(124,58,237,0.2)',
            border: '1px solid rgba(139,92,246,0.3)',
            borderRadius: 8,
            padding: '3px 8px',
            flexShrink: 0,
          }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="#a78bfa" style={{ flexShrink: 0 }}>
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
            </svg>
            <span style={{ fontSize: 14, fontWeight: 900, color: '#ede9fe', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
              {power != null ? Math.round(power) : '—'}
            </span>
            <span style={{ fontSize: 9, color: '#a78bfa', fontWeight: 700 }}>W</span>
          </span>

          {/* Heart rate */}
          <span style={{
            display: 'flex',
            alignItems: 'center',
            gap: 3,
            background: 'rgba(239,68,68,0.15)',
            border: '1px solid rgba(248,113,113,0.3)',
            borderRadius: 8,
            padding: '3px 8px',
            flexShrink: 0,
          }}>
            <span style={{ fontSize: 11, color: '#f87171', lineHeight: 1 }}>♥</span>
            <span style={{ fontSize: 14, fontWeight: 900, color: '#fee2e2', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
              {heartRate != null ? Math.round(heartRate) : '—'}
            </span>
            <span style={{ fontSize: 9, color: '#f87171', fontWeight: 700 }}>bpm</span>
          </span>
        </span>

        {/* Quit button */}
        <button
          onClick={handleQuit}
          aria-label={confirmQuit ? 'Confirm quit workout' : 'End workout'}
          style={{
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: confirmQuit ? 8 : '50%',
            width: confirmQuit ? 'auto' : 28,
            height: 28,
            padding: confirmQuit ? '0 8px' : 0,
            background: confirmQuit ? '#dc2626' : 'rgba(255,255,255,0.1)',
            border: '1px solid rgba(255,255,255,0.15)',
            color: '#fff',
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            WebkitTapHighlightColor: 'transparent',
            touchAction: 'manipulation',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          {confirmQuit
            ? 'End?'
            : <XMarkIcon style={{ width: 14, height: 14 }} />}
        </button>
      </button>
    </>
  );
}
