/**
 * WorkoutResumeBanner
 * ───────────────────
 * Floating top-right pill, visible on EVERY route while a workout
 * session is active and the user is NOT on the execution screen.
 *
 * Shows LIVE numbers (timer + power + HR) so the athlete can glance
 * at it from any other page and see that the workout is still
 * recording. Tap the pill body to jump back to the workout screen.
 * Tap the small × on the right to end the session (with confirm)
 * without going back to the workout page.
 *
 * Design choices:
 *   • Top-right corner so it doesn't sit on top of the bottom tab
 *     bar on phones / iPad.
 *   • Pulses subtly while running so the user intuitively reads
 *     "this is still active". Stops pulsing when auto-paused.
 *   • Honours `env(safe-area-inset-top)` so it doesn't hide behind
 *     the notch on iPhone.
 *   • Renders nothing when there's no active session — no perf cost
 *     for the 99 % case.
 */
import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useHasActiveSession } from '../../context/WorkoutSessionContext';
import { PlayIcon, PauseIcon, XMarkIcon, BoltIcon, HeartIcon } from '@heroicons/react/24/solid';

function fmtTime(s) {
  const sec = Math.max(0, Math.round(s || 0));
  const m = Math.floor(sec / 60);
  const r = sec % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

export default function WorkoutResumeBanner() {
  const session = useHasActiveSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [confirmQuit, setConfirmQuit] = useState(false);

  // Hide on the execution page itself — we're already there.
  if (!session) return null;
  if (/^\/workout-execution(\/|$)/.test(location.pathname)) return null;

  const {
    plannedWorkoutId, athleteId, totalElapsed, isRunning,
    power, heartRate, autoPausedAt, endSession,
  } = session;

  const href = `/workout-execution/${plannedWorkoutId}${athleteId ? `?athleteId=${athleteId}` : ''}`;

  const handleResume = () => navigate(href);
  const handleQuitTap = (e) => {
    e.stopPropagation();
    if (!confirmQuit) {
      setConfirmQuit(true);
      // Auto-revert if not confirmed within 3 s — prevents an accidental
      // double-tap from killing a real workout.
      setTimeout(() => setConfirmQuit(false), 3000);
      return;
    }
    endSession?.();
    setConfirmQuit(false);
  };

  return (
    <div
      className="fixed flex items-center gap-2 px-3 py-2 rounded-2xl shadow-2xl backdrop-blur"
      style={{
        top: 'calc(env(safe-area-inset-top, 0px) + 12px)',
        right: 12,
        zIndex: 99998, // below modals (which use 99999+) but above everything else
        background: isRunning
          ? 'linear-gradient(135deg,#22c55e,#16a34a)'
          : 'rgba(245, 158, 11, 0.95)',
        color: '#fff',
        border: '1px solid rgba(255,255,255,0.18)',
        boxShadow: '0 10px 30px -10px rgba(0,0,0,0.55)',
        WebkitTapHighlightColor: 'transparent',
        touchAction: 'manipulation',
        animation: isRunning ? 'lcResumePulse 2.2s ease-in-out infinite' : undefined,
        maxWidth: 'calc(100vw - 24px)',
      }}
    >
      <style>{`
        @keyframes lcResumePulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.55), 0 10px 30px -10px rgba(0,0,0,0.55); }
          50%      { box-shadow: 0 0 0 10px rgba(34, 197, 94, 0),    0 10px 30px -10px rgba(0,0,0,0.55); }
        }
      `}</style>

      {/* Resume button — taps anywhere on the inner content go back
          to the workout page. The right-side × is a separate button. */}
      <button
        onClick={handleResume}
        aria-label="Return to active workout"
        className="flex items-center gap-2 text-left"
        style={{ background: 'transparent', border: 0, color: 'inherit', padding: 0 }}
      >
        <span className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
          {isRunning
            ? <PauseIcon className="w-3.5 h-3.5 text-white" />
            : <PlayIcon  className="w-3.5 h-3.5 text-white ml-0.5" />}
        </span>

        <span className="flex flex-col items-start min-w-0">
          <span className="text-[9px] uppercase tracking-wider font-bold opacity-90 leading-none">
            {autoPausedAt ? 'Auto-paused' : isRunning ? 'Workout · live' : 'Paused'}
          </span>
          <span className="text-xs font-bold tabular-nums leading-tight">
            {fmtTime(totalElapsed)}
          </span>
        </span>

        {/* Live metrics — power + HR. Hidden on the narrowest phones
            (under 360 px the timer alone is enough). */}
        <span className="hidden xs:flex items-center gap-2 pl-2 ml-1 border-l border-white/25">
          <span className="flex items-center gap-1">
            <BoltIcon className="w-3 h-3 opacity-90" />
            <span className="text-xs font-bold tabular-nums leading-none">
              {power != null ? Math.round(power) : '--'}
              <span className="text-[8px] opacity-80 ml-0.5">W</span>
            </span>
          </span>
          <span className="flex items-center gap-1">
            <HeartIcon className="w-3 h-3 opacity-90" />
            <span className="text-xs font-bold tabular-nums leading-none">
              {heartRate != null ? Math.round(heartRate) : '--'}
            </span>
          </span>
        </span>
      </button>

      {/* Quit — two-tap to confirm. First tap turns it red and
          shows "Quit?", second tap actually ends the session. */}
      <button
        onClick={handleQuitTap}
        aria-label={confirmQuit ? 'Confirm quit workout' : 'Quit workout'}
        className="flex-shrink-0 flex items-center justify-center rounded-full transition-all"
        style={{
          width: confirmQuit ? 'auto' : 26,
          height: 26,
          padding: confirmQuit ? '0 8px' : 0,
          background: confirmQuit ? '#ef4444' : 'rgba(0,0,0,0.25)',
          border: '1px solid rgba(255,255,255,0.25)',
          color: '#fff',
          WebkitTapHighlightColor: 'transparent',
          touchAction: 'manipulation',
        }}
      >
        {confirmQuit
          ? <span className="text-[10px] font-extrabold uppercase tracking-wider">Quit?</span>
          : <XMarkIcon className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
}
