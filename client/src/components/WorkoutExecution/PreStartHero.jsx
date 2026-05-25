/**
 * PreStartHero
 * ────────────
 * Big "ready to go" card shown before the user taps Start. Inspired by the
 * Tacx pre-workout screen — a large zone-coloured panel with the first
 * step's name + target + duration baked in, so the athlete knows what they
 * are about to ride before the timer ever runs.
 *
 * Props:
 *   firstStep        — { stepType, label, durationSeconds, powerTarget }
 *   targetWatts      — resolved target wattage for that step (number | null)
 *   targetLabel      — "%FTP" / "LT2" / etc human string
 *   workoutTitle     — full workout name
 *   workoutDuration  — total seconds across all steps
 *   onStart          — handler for the Start button
 *   onExit           — handler for the Exit button
 *   onSettings       — optional gear handler (toggles ERG mode UI etc.)
 *   stepColors       — object mapping stepType → { bar, edge } palette
 *   metricsSlot      — ReactNode rendered to the right (metric tiles grid)
 */
import React from 'react';
import { motion } from 'framer-motion';
import { PlayIcon, XMarkIcon, Cog6ToothIcon } from '@heroicons/react/24/outline';
import { BoltIcon as BoltSolid } from '@heroicons/react/24/solid';

function fmtTime(s) {
  if (s == null) return '--:--';
  const abs = Math.max(0, Math.round(s));
  const h = Math.floor(abs / 3600);
  const m = Math.floor((abs % 3600) / 60);
  const r = abs % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  return `${m}:${String(r).padStart(2, '0')}`;
}

export default function PreStartHero({
  firstStep,
  targetWatts,
  targetLabel,
  workoutTitle,
  workoutDuration,
  onStart,
  onExit,
  onSettings,
  stepColors,
  metricsSlot,
}) {
  const col = (stepColors && firstStep && stepColors[firstStep.stepType]) || { bar: '#22c55e', edge: '#16a34a' };
  const stepName = firstStep?.label || firstStep?.stepType || 'Warming Up';
  const stepDur = firstStep?.durationSeconds || 0;

  // Shared action buttons (Exit / Start Now / Settings)
  const actionButtons = (
    <>
      {onExit && (
        <button
          type="button"
          onClick={onExit}
          className="flex flex-col items-center gap-1 group"
          style={{ WebkitTapHighlightColor: 'transparent' }}
        >
          <span className="w-12 h-12 landscape:w-10 landscape:h-10 rounded-full bg-rose-600 group-hover:bg-rose-500 group-active:scale-95 flex items-center justify-center shadow-lg transition-all">
            <XMarkIcon className="w-6 h-6 text-white" strokeWidth={2.5} />
          </span>
          <span className="text-[10px] text-gray-400 font-semibold">Exit</span>
        </button>
      )}
      <button
        type="button"
        onClick={onStart}
        className="flex flex-col items-center gap-1 group"
        style={{ WebkitTapHighlightColor: 'transparent' }}
      >
        <span
          className="w-16 h-16 landscape:w-14 landscape:h-14 rounded-full bg-sky-500 group-hover:bg-sky-400 group-active:scale-95 flex items-center justify-center shadow-2xl transition-all"
          style={{ boxShadow: '0 0 32px rgba(14,165,233,0.55)' }}
        >
          <PlayIcon className="w-9 h-9 text-white ml-1" strokeWidth={2.2} />
        </span>
        <span className="text-xs text-white font-bold tracking-wide">Start Now</span>
      </button>
      {onSettings && (
        <button
          type="button"
          onClick={onSettings}
          className="flex flex-col items-center gap-1 group"
          style={{ WebkitTapHighlightColor: 'transparent' }}
        >
          <span className="w-12 h-12 landscape:w-10 landscape:h-10 rounded-full bg-gray-700 group-hover:bg-gray-600 group-active:scale-95 flex items-center justify-center shadow-lg transition-all">
            <Cog6ToothIcon className="w-6 h-6 text-gray-200" strokeWidth={2} />
          </span>
          <span className="text-[10px] text-gray-400 font-semibold">Settings</span>
        </button>
      )}
    </>
  );

  return (
    <div className="w-full flex-1 flex flex-col min-h-0">
      {/* ── LANDSCAPE: side-by-side hero + controls ─────────────────────── */}
      {/* Hero left, action buttons right — everything fits in < 420 px height */}
      <div
        className="hidden landscape:flex flex-row gap-3 flex-1 min-h-0"
        style={{ alignItems: 'stretch' }}
      >
        {/* Hero card — flex-1 in landscape, no min-height constraint */}
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex-1 relative rounded-2xl overflow-hidden flex flex-col justify-between p-4"
          style={{ background: `linear-gradient(135deg, ${col.bar} 0%, ${col.edge} 100%)` }}
        >
          <div className="flex items-center justify-between text-white/90">
            <span className="text-[10px] uppercase tracking-[0.2em] font-bold">{stepName}</span>
            {targetWatts != null && (
              <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/25 text-white text-xs font-bold tabular-nums">
                <BoltSolid className="w-3 h-3" />
                <span>{targetWatts} W</span>
                {targetLabel && targetLabel !== 'Open' && (
                  <span className="opacity-75 ml-0.5">· {targetLabel}</span>
                )}
              </div>
            )}
          </div>
          <div className="flex items-end text-white">
            <div>
              <BoltSolid className="w-10 h-10 text-white opacity-90 mb-1 -ml-0.5" />
              <div className="text-2xl font-black leading-none truncate" style={{ maxWidth: '55vw' }}>
                {workoutTitle || 'Workout'}
              </div>
              <div className="mt-0.5 text-xs text-white/80 tabular-nums">
                {fmtTime(workoutDuration)} total
                {stepDur > 0 && <span className="ml-1.5 opacity-75">· first step {fmtTime(stepDur)}</span>}
              </div>
            </div>
          </div>
        </motion.div>

        {/* Right column: metric tiles + action buttons */}
        <div className="flex flex-col gap-2 justify-between" style={{ width: 160 }}>
          {/* Metric tiles — compact 2×2 grid */}
          {metricsSlot && <div className="flex-1 min-h-0">{metricsSlot}</div>}
          {/* Action buttons — row in landscape */}
          <div className="flex items-center justify-center gap-4 py-1">
            {actionButtons}
          </div>
        </div>
      </div>

      {/* ── PORTRAIT: original vertical layout ──────────────────────────── */}
      <div className="flex landscape:hidden flex-col flex-1 min-h-0 gap-3">
        {/* Hero + metric tiles side by side on md+ */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-[1.4fr_1fr] gap-3 min-h-0">
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative rounded-3xl overflow-hidden flex flex-col justify-between p-6"
            style={{
              background: `linear-gradient(135deg, ${col.bar} 0%, ${col.edge} 100%)`,
              minHeight: 200,
            }}
          >
            <div className="flex items-center justify-between text-white/90">
              <span className="text-[10px] sm:text-[11px] uppercase tracking-[0.2em] font-bold">{stepName}</span>
              {targetWatts != null && (
                <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-black/25 text-white text-xs font-bold tabular-nums">
                  <BoltSolid className="w-3.5 h-3.5" />
                  <span>{targetWatts} W</span>
                  {targetLabel && targetLabel !== 'Open' && (
                    <span className="opacity-75 ml-0.5">· {targetLabel}</span>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-end justify-between text-white">
              <div>
                <BoltSolid className="w-14 h-14 sm:w-20 sm:h-20 text-white opacity-90 mb-2 -ml-1" />
                <div className="text-3xl sm:text-4xl font-black leading-none truncate" style={{ maxWidth: '70vw' }}>
                  {workoutTitle || 'Workout'}
                </div>
                <div className="mt-1 text-sm sm:text-base text-white/80 tabular-nums">
                  {fmtTime(workoutDuration)} total
                  {stepDur > 0 && <span className="ml-2 opacity-75">· first step {fmtTime(stepDur)}</span>}
                </div>
              </div>
            </div>
          </motion.div>

          {metricsSlot && <div className="min-h-0">{metricsSlot}</div>}
        </div>

        {/* Bottom action row */}
        <div className="flex items-center justify-center gap-8 sm:gap-12 pt-3 pb-2">
          {actionButtons}
        </div>
      </div>
    </div>
  );
}
