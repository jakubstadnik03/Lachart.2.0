/**
 * WorkoutResumeBanner
 * ───────────────────
 * Floating top-right pill, visible on EVERY route while a workout
 * session is active and the user is NOT currently on the execution
 * screen. One tap navigates back to the workout, which is still
 * recording in the background (timer + BLE notifications stayed
 * alive in WorkoutSessionContext).
 *
 * Design choices:
 *   • Top-right corner so it doesn't sit on top of the bottom tab
 *     bar on phones / iPad.
 *   • Pulses subtly while the workout is running so the user
 *     intuitively reads "this is still active". Stops pulsing when
 *     auto-paused.
 *   • Honours `env(safe-area-inset-top)` so it doesn't hide behind
 *     the notch on iPhone.
 *   • Renders nothing when there's no active session — no perf cost
 *     for the 99 % case.
 */
import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useHasActiveSession } from '../../context/WorkoutSessionContext';
import { PlayIcon, PauseIcon } from '@heroicons/react/24/solid';

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

  // Hide on the execution page itself — we're already there.
  if (!session) return null;
  if (/^\/workout-execution(\/|$)/.test(location.pathname)) return null;

  const { plannedWorkoutId, athleteId, totalElapsed, isRunning } = session;
  const href = `/workout-execution/${plannedWorkoutId}${athleteId ? `?athleteId=${athleteId}` : ''}`;

  return (
    <button
      onClick={() => navigate(href)}
      aria-label="Return to active workout"
      className="fixed flex items-center gap-2 px-3 py-2 rounded-full shadow-2xl backdrop-blur"
      style={{
        // Always anchored top-right, honouring safe-area on iPhone.
        top: 'calc(env(safe-area-inset-top, 0px) + 12px)',
        right: 12,
        zIndex: 99998, // below modals (which use 99999+) but above everything else
        background: isRunning ? 'linear-gradient(135deg,#22c55e,#16a34a)' : 'rgba(245, 158, 11, 0.95)',
        color: '#fff',
        border: '1px solid rgba(255,255,255,0.15)',
        boxShadow: '0 10px 30px -10px rgba(0,0,0,0.45)',
        WebkitTapHighlightColor: 'transparent',
        touchAction: 'manipulation',
        // Subtle running indicator — gentle pulse animation when active.
        animation: isRunning ? 'lcResumePulse 2.2s ease-in-out infinite' : undefined,
      }}
    >
      <style>{`
        @keyframes lcResumePulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.55), 0 10px 30px -10px rgba(0,0,0,0.45); }
          50%      { box-shadow: 0 0 0 10px rgba(34, 197, 94, 0),    0 10px 30px -10px rgba(0,0,0,0.45); }
        }
      `}</style>
      <span className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
        {isRunning
          ? <PauseIcon className="w-3.5 h-3.5 text-white" />
          : <PlayIcon className="w-3.5 h-3.5 text-white ml-0.5" />}
      </span>
      <span className="flex flex-col items-start min-w-0">
        <span className="text-[9px] uppercase tracking-wider font-bold opacity-90">
          {isRunning ? 'Workout · live' : 'Workout · paused'}
        </span>
        <span className="text-xs font-bold tabular-nums leading-none">
          {fmtTime(totalElapsed)}
        </span>
      </span>
    </button>
  );
}
