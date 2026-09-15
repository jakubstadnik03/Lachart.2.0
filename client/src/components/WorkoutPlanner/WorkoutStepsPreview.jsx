/**
 * What a planned session is made of, at a glance.
 *
 * A library row says "Threshold Intervals · Bike · 1h 30m · LT2" and a plan
 * card in the week says the title and a bar; neither said what the laps are.
 * The summary here is the structure a coach reads aloud — "15:00 warm-up Z1,
 * 5 × (8:00 LT2 + 4:00 Z1), 10:00 cool-down" — under the profile bar, for a
 * hover card and for the preview a click opens.
 */
import React, { useEffect } from 'react';
import ReactDOM from 'react-dom';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { MiniWorkoutChart, WorkoutLapList, PlannerSportIcon, plannerSportColor, stepTotalSecs, fmtDuration } from './WorkoutPlanModal';
import { stepsToLines } from '../../utils/workoutStepsText';

export { stepsToLines, fmtStepSize } from '../../utils/workoutStepsText';

const DOT = { warmup: '#fbbf24', work: '#767EB5', recovery: '#34d399', cooldown: '#38bdf8', rest: '#cbd5e1', group: '#767EB5' };

/** Hover-card body: the bar and the lines. */
export function WorkoutStepsSummary({ title, sport, steps, note = null }) {
  const lines = stepsToLines(steps);
  const total = stepTotalSecs(steps);
  if (!lines.length) {
    return (
      <div>
        {title && <div className="text-xs font-bold text-slate-800 mb-1 truncate">{title}</div>}
        <div className="text-[11px] text-slate-400">No structured steps — {note || 'a duration or distance only'}.</div>
      </div>
    );
  }
  return (
    <div>
      {title && (
        <div className="flex items-center gap-1.5 mb-1.5 min-w-0">
          <PlannerSportIcon sport={sport} size={12} color={plannerSportColor(sport)} />
          <span className="text-xs font-bold text-slate-800 truncate">{title}</span>
          {total > 0 && <span className="ml-auto text-[10px] text-slate-400 tabular-nums shrink-0">{fmtDuration(total)}</span>}
        </div>
      )}
      <MiniWorkoutChart steps={steps} width={234} height={30} />
      <ul className="mt-2 space-y-0.5">
        {lines.map((l, i) => (
          <li key={i} className="flex items-start gap-1.5 text-[11px] leading-snug text-slate-600">
            <span className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: DOT[l.kind] || DOT.work }} />
            <span className="tabular-nums">{l.text}</span>
          </li>
        ))}
      </ul>
      {note && <p className="mt-1.5 text-[10px] text-slate-400">{note}</p>}
    </div>
  );
}

/**
 * The preview a click opens: the same structure, room for every lap with
 * its target, and one way onward — planning it. Escape and the backdrop close.
 */
export function WorkoutPreviewDialog({ workout, context = {}, onClose, onPlan = null, onEdit = null, onDelete = null, planLabel = 'Plan it' }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  if (!workout) return null;
  const steps = Array.isArray(workout.steps) ? workout.steps : [];
  const total = stepTotalSecs(steps);
  const color = plannerSportColor(workout.sport);
  const lines = stepsToLines(steps);
  return ReactDOM.createPortal(
    <div
      className="fixed inset-0 z-[10040] flex items-center justify-center bg-slate-900/40 p-4"
      style={{ pointerEvents: 'auto' }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={workout.name || workout.title || 'Workout'}
    >
      <div
        className="w-full max-w-md max-h-[85vh] overflow-y-auto rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 px-4 pt-4 pb-3 border-b border-slate-100">
          <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${color}1a` }}>
            <PlannerSportIcon sport={workout.sport} size={16} color={color} />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold text-slate-900 leading-tight">{workout.name || workout.title || 'Workout'}</h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {[total > 0 ? fmtDuration(total) : null, lines.length ? `${lines.length} block${lines.length === 1 ? '' : 's'}` : null, workout.desc || workout.description || null]
                .filter(Boolean).join(' · ')}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100">
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>
        <div className="px-4 py-3 space-y-3">
          {steps.length > 0 ? (
            <>
              <div className="rounded-xl bg-slate-50 ring-1 ring-slate-200/70 p-2">
                <MiniWorkoutChart steps={steps} width={400} height={56} />
              </div>
              <ul className="space-y-1">
                {lines.map((l, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-slate-700">
                    <span className="mt-1.5 w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: DOT[l.kind] || DOT.work }} />
                    <span className="tabular-nums">{l.text}</span>
                  </li>
                ))}
              </ul>
              <WorkoutLapList steps={steps} context={context} sport={workout.sport} />
            </>
          ) : (
            <p className="text-xs text-slate-400">No structured steps.</p>
          )}
        </div>
        {(onPlan || onEdit || onDelete) && (
          <div className="px-4 pb-4 pt-1 flex items-center gap-2">
            {onDelete && (
              <button type="button" onClick={() => { onClose?.(); onDelete(workout); }} className="px-3 py-2 rounded-xl text-xs font-semibold text-red-500 hover:bg-red-50">Delete</button>
            )}
            <span className="flex-1" />
            {onEdit && (
              <button type="button" onClick={() => { onClose?.(); onEdit(workout); }} className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50">Edit steps</button>
            )}
            {onPlan && (
              <button type="button" onClick={() => { onClose?.(); onPlan(workout); }} className="px-3 py-2 rounded-xl bg-primary text-white text-xs font-semibold hover:opacity-90">{planLabel}</button>
            )}
          </div>
        )}
      </div>
    </div>,
    document.getElementById('app-modal-root') || document.body,
  );
}
