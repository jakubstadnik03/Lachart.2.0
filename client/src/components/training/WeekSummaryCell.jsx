import React from 'react';
import { ArrowUpIcon, ArrowDownIcon, MinusIcon, FireIcon } from '@heroicons/react/24/outline';
import SportIcon from '../shared/SportIcon';
import { plannedWorkoutDurationSecs } from '../../utils/plannedWorkoutDuration';

/** Sport colours for the bars, shared with the calendar's own summaries. */
export const SPORT_COLORS_CELL = { bike: '#767EB5', run: '#f97316', swim: '#599FD0', other: '#9ca3af' };

/**
 * WeekSummaryCell — the week's totals column.
 *
 * One row per metric, each row reading "done / planned" with a percentage and
 * a thin bar. There used to be a Done/Plan tab pair here, which meant the one
 * question the column exists to answer — did the week land on plan — took a
 * click and a memory of what the other tab said. Both numbers on one line
 * answer it without either.
 *
 * A week with no plan still shows the same rows, just without the second half:
 * the bar and the percentage disappear rather than dividing by zero.
 */
export default function WeekSummaryCell({ weekSummary, formatHours, formatKm, user, weekPlannedWorkouts = [], large = false }) {
  if (!weekSummary) return <div className="bg-gray-50 p-2.5 min-h-[145px] min-w-[150px]" />;

  const { totalSeconds, totalTSS, runSeconds, bikeSeconds, swimSeconds, strengthSeconds,
    distanceRun, distanceBike, distanceSwim,
    volumeChange, plannedSeconds, plannedTSS, sessionCount } = weekSummary;

  // `large` = full-width mobile Calendar tab → bigger, more readable text.
  // Default (false) keeps the compact sizes used in the narrow desktop grid.
  const L = large;
  const cls = {
    pad:    L ? 'p-4'         : 'p-2.5',
    gap:    L ? 'gap-2.5'     : 'gap-1.5',
    big:    L ? 'text-3xl'    : 'text-lg',
    prefix: L ? 'text-base'   : 'text-xs',
    micro:  L ? 'text-xs'     : 'text-[10px]',
    num:    L ? 'text-base'   : 'text-[11px]',
    icon:   L ? 'w-5 h-5'     : 'w-4 h-4',
    rows:   L ? 'space-y-2.5' : 'space-y-1.5',
    bar:    L ? 'h-1.5'       : 'h-[3px]',
    fire:   L ? 'w-4 h-4'     : 'w-3.5 h-3.5',
    arrow:  L ? 'w-6 h-6'     : 'w-5 h-5',
  };

  // Planned side, per sport. The week summary carries planned time and TSS as
  // single totals, so the per-sport plan has to come from the workouts.
  const plannedBySport = {};
  weekPlannedWorkouts.forEach(pw => {
    const sport = (pw.sport || 'other').toLowerCase();
    const slot = plannedBySport[sport] || (plannedBySport[sport] = { secs: 0, dist: 0 });
    slot.secs += plannedWorkoutDurationSecs(pw);
    slot.dist += pw.plannedDistance || 0;
  });
  const plannedDist = (sport) => plannedBySport[sport]?.dist || 0;
  const plannedSecs = (sport) => plannedBySport[sport]?.secs || 0;

  const pctOf = (done, planned) => (planned > 0 ? Math.round((done / planned) * 100) : null);

  // Under 85% is behind, 85–110% is on plan, above that is over — the same
  // bands the coach's weekly review uses when it flags a week.
  const toneFor = (pct) => (pct === null ? 'text-gray-700'
    : pct >= 110 ? 'text-amber-600'
      : pct >= 85 ? 'text-green-600'
        : 'text-gray-700');

  // formatKm carries the unit; the left half of a pair drops it so the row
  // reads "124.9 / 165 km" rather than repeating "km" twice in 150px.
  const stripUnit = (s) => String(s).replace(/\s*(km|mi|m)\s*$/i, '');

  // The headline carries time, so the rows start at TSS — printing the week's
  // hours twice, once above and once as the first row, only cost a line.
  const rows = [
    totalTSS > 0 || plannedTSS > 0 ? {
      key: 'tss',
      icon: <FireIcon className={`${cls.fire} flex-shrink-0 text-primary`} />,
      done: totalTSS, planned: plannedTSS,
      doneLabel: Math.round(totalTSS), plannedLabel: `${Math.round(plannedTSS)} TSS`,
      color: '#767EB5',
    } : null,
    ...['bike', 'run', 'swim'].map(sport => {
      const done = sport === 'bike' ? distanceBike : sport === 'run' ? distanceRun : distanceSwim;
      const seconds = sport === 'bike' ? bikeSeconds : sport === 'run' ? runSeconds : swimSeconds;
      const planned = plannedDist(sport);
      if (!(done > 0) && !(planned > 0)) {
        // No distance either side — fall back to time so a sport that was
        // trained still shows up in the column.
        if (!(seconds > 0) && !(plannedSecs(sport) > 0)) return null;
        return {
          key: sport,
          icon: <SportIcon sport={sport} className={`${cls.icon} flex-shrink-0`} />,
          done: seconds, planned: plannedSecs(sport),
          doneLabel: formatHours(seconds), plannedLabel: formatHours(plannedSecs(sport)),
          color: SPORT_COLORS_CELL[sport],
        };
      }
      return {
        key: sport,
        icon: <SportIcon sport={sport} className={`${cls.icon} flex-shrink-0`} />,
        done, planned,
        // The unit only moves to the planned half when there is one to move to.
        doneLabel: planned > 0 ? stripUnit(formatKm(done)) : formatKm(done),
        plannedLabel: formatKm(planned),
        color: SPORT_COLORS_CELL[sport],
      };
    }),
    strengthSeconds > 0 || plannedSecs('strength') > 0 ? {
      key: 'strength',
      icon: <SportIcon sport="strength" className={`${cls.icon} flex-shrink-0`} />,
      done: strengthSeconds, planned: plannedSecs('strength'),
      doneLabel: formatHours(strengthSeconds), plannedLabel: formatHours(plannedSecs('strength')),
      color: '#8b5cf6',
    } : null,
  ].filter(Boolean);

  const weekPct = pctOf(totalSeconds, plannedSeconds);
  const plannedCount = weekPlannedWorkouts.length;

  return (
    <div className={`bg-gray-50 ${cls.pad} border-l-4 border-primary/30 ${L ? 'min-h-[240px]' : 'min-h-[145px]'} min-w-[150px] flex flex-col ${cls.gap}`}>
      {/* Headline: the week's time, against its plan */}
      <div className="flex items-start justify-between gap-1">
        <div className="min-w-0">
          <div className="flex items-baseline gap-1.5 leading-tight">
            <span className={`${cls.big} font-extrabold text-gray-900`}>{formatHours(totalSeconds)}</span>
            {plannedSeconds > 0 && (
              <span className={`${cls.prefix} font-medium text-gray-400`}>/ {formatHours(plannedSeconds)}</span>
            )}
          </div>
          <div className={`${cls.micro} text-gray-400 mt-0.5`}>
            {sessionCount > 0 ? `${sessionCount} done` : 'nothing done'}
            {plannedCount > 0 && ` · ${plannedCount} planned`}
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {weekPct !== null && (
            <span className={`${cls.micro} font-bold px-1.5 py-0.5 rounded-full ${weekPct >= 110 ? 'bg-amber-100 text-amber-600' : weekPct >= 85 ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
              {weekPct}%
            </span>
          )}
          {volumeChange && (
            <span className="mt-0.5">
              {volumeChange === 'up' && <ArrowUpIcon className={`${cls.arrow} text-green-500`} />}
              {volumeChange === 'down' && <ArrowDownIcon className={`${cls.arrow} text-red-500`} />}
              {volumeChange === 'same' && <MinusIcon className={`${cls.arrow} text-gray-400`} />}
            </span>
          )}
        </div>
      </div>

      {/* The week against its plan, in one bar */}
      {plannedSeconds > 0 && (
        <div className={`${L ? 'h-2' : 'h-1'} bg-gray-200 rounded-full overflow-hidden`}>
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${Math.min(100, (totalSeconds / plannedSeconds) * 100)}%`,
              backgroundColor: weekPct >= 110 ? '#f59e0b' : weekPct >= 85 ? '#22c55e' : '#767EB5',
            }}
          />
        </div>
      )}

      {/* One row per metric: done / planned, percentage, bar */}
      <div className={`${cls.rows} flex-1`}>
        {rows.map(r => {
          const pct = pctOf(r.done, r.planned);
          return (
            <div key={r.key}>
              <div className="flex items-center gap-1.5 min-w-0">
                {r.icon}
                <span className={`${cls.num} tabular-nums flex-1 min-w-0 truncate`}>
                  <span className={`font-bold ${toneFor(pct)}`}>{r.doneLabel}</span>
                  {r.planned > 0 && <span className="text-gray-400 font-medium"> / {r.plannedLabel}</span>}
                </span>
                {pct !== null && (
                  <span className={`${cls.micro} text-gray-400 tabular-nums flex-shrink-0`}>{pct}%</span>
                )}
              </div>
              {r.planned > 0 && (
                <div className={`${cls.bar} bg-gray-200 rounded-full overflow-hidden mt-1`}>
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${Math.min(100, (r.done / r.planned) * 100)}%`, backgroundColor: r.color }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
