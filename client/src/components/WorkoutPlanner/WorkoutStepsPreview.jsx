/**
 * What a planned session is made of, at a glance.
 *
 * A library row says "Threshold Intervals · Bike · 1h 30m · LT2" and a plan
 * card in the week says the title and a bar; neither said what the laps are.
 * The summary here is the structure a coach reads aloud — "15:00 warm-up Z1,
 * 5 × (8:00 LT2 + 4:00 Z1), 10:00 cool-down" — under the profile bar, for the
 * hover card on library rows and plan cards.
 */
import React from 'react';
import { MiniWorkoutChart, PlannerSportIcon, plannerSportColor, stepTotalSecs, fmtDuration } from './WorkoutPlanModal';
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
