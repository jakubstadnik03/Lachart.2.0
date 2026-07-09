import React from 'react';
import { FireIcon, ArrowTrendingUpIcon, ArrowTrendingDownIcon } from '@heroicons/react/24/outline';
import SportIcon from '../shared/SportIcon';
import {
  buildPlannerWeekSummary,
  formatDecimalHours,
  formatWeekDurationSeconds,
  fmtDistShort,
} from './plannerWeekUtils';

export default function PlannerWeekSummary({
  planned = [],
  trainings = [],
  weekStart,
  context = {},
  user = null,
  userProfile = null,
  prevWeekTrainings = [],
  tab = 'plan',
  onTabChange,
  compact = false,
}) {
  const summary = buildPlannerWeekSummary({
    planned,
    trainings,
    weekStart,
    context,
    user,
    userProfile,
    prevWeekTrainings,
  });

  const { done, planned: plan } = summary;
  const tssRounded = Math.round(done.totalTss);
  const planTssRounded = Math.round(plan.totalTss);
  const prevRounded = summary.prevTotalTss > 0 ? Math.round(summary.prevTotalTss) : null;
  const showTrend = prevRounded != null && prevRounded > 0 && tssRounded !== prevRounded;

  const plannedHoursStr = plan.totalSec > 0 ? formatWeekDurationSeconds(plan.totalSec) : null;
  const doneHoursStr = done.totalSec > 0 ? formatWeekDurationSeconds(done.totalSec) : null;
  const completionPct = plan.totalSec > 0 && done.totalSec > 0
    ? Math.min(100, Math.round((done.totalSec / plan.totalSec) * 100))
    : null;

  const planDaysCount = summary.weekPlanned?.length
    ? new Set(summary.weekPlanned.map((pw) => String(pw.date || '').slice(0, 10))).size
    : 0;
  const avgSecPerDay = planDaysCount > 0 ? Math.round(plan.totalSec / planDaysCount) : 0;
  const avgTssPerDay = planDaysCount > 0 ? Math.round(plan.totalTss / planDaysCount) : 0;
  const avgHoursPerDayStr = avgSecPerDay > 0 ? formatWeekDurationSeconds(avgSecPerDay) : null;

  const shell = `flex flex-col rounded-xl border border-slate-200 bg-slate-50 border-l-4 border-l-primary/40 text-left ${
    compact ? 'p-2 min-w-0' : 'p-2.5 min-w-[168px]'
  }`;

  const tabs = (
    <div className="flex gap-0.5 mb-1.5 bg-slate-200 rounded-md p-0.5">
      {['plan', 'done'].map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => onTabChange?.(t)}
          className={`flex-1 text-[11px] font-bold py-0.5 rounded transition-all ${
            tab === t ? 'bg-primary text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          {t === 'plan' ? 'Plan' : 'Done'}
        </button>
      ))}
    </div>
  );

  if (tab === 'plan') {
    return (
      <div className={shell}>
        {tabs}
        <div className="flex items-baseline gap-1 leading-tight mb-1">
          <span className={`font-extrabold text-slate-900 tabular-nums ${compact ? 'text-sm' : 'text-base'}`}>
            {plannedHoursStr || '—'}
          </span>
          {planTssRounded > 0 && (
            <span className="text-[11px] font-bold text-primary tabular-nums">{planTssRounded} TSS</span>
          )}
        </div>
        {(plan.totalDist > 0 || plan.count > 0) && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mb-1.5 text-[10px] text-slate-500 tabular-nums">
            {plan.totalDist > 0 && <span>{fmtDistShort(plan.totalDist, user)}</span>}
            {plan.count > 0 && (
              <span>{plan.count} {plan.count === 1 ? 'session' : 'sessions'}</span>
            )}
            {planDaysCount > 0 && (
              <span>{planDaysCount} {planDaysCount === 1 ? 'day' : 'days'}</span>
            )}
          </div>
        )}
        {avgHoursPerDayStr && planDaysCount > 1 && (
          <div className="text-[10px] text-slate-400 mb-1.5 tabular-nums">
            ~{avgHoursPerDayStr}/day
            {avgTssPerDay > 0 && <span className="ml-1.5">· ~{avgTssPerDay} TSS/day</span>}
          </div>
        )}
        {plan.bySport.length === 0 ? (
          <span className="text-slate-400 italic text-xs">No plan</span>
        ) : (
          <div className="space-y-1">
            {plan.bySport.map((row) => (
              <div key={row.sport} className="flex items-center gap-1">
                <SportIcon sport={row.sport} className="w-3.5 h-3.5 text-slate-500" />
                <span className="font-semibold text-slate-700 flex-1 tabular-nums text-[11px]">
                  {formatDecimalHours(row.sec) || formatWeekDurationSeconds(row.sec) || '—'}
                </span>
                {row.dist > 0 && (
                  <span className="text-slate-400 shrink-0 tabular-nums text-[10px]">{fmtDistShort(row.dist, user)}</span>
                )}
                {row.tss > 0 && (
                  <span className="font-bold text-primary shrink-0 tabular-nums text-[10px]">{Math.round(row.tss)}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={shell}>
      {tabs}
      <div className="flex items-start justify-between gap-1 mb-1">
        <div>
          {plan.totalSec > 0 ? (
            <div className="flex items-baseline gap-1 leading-tight">
              <span className="font-medium text-slate-400 tabular-nums text-xs">{plannedHoursStr}</span>
              <span className="font-extrabold text-slate-900 tabular-nums text-base">{doneHoursStr || '—'}</span>
            </div>
          ) : (
            <div className="font-extrabold text-slate-900 tabular-nums text-base">{doneHoursStr || '—'}</div>
          )}
          <div className="flex items-center gap-1 mt-0.5 flex-wrap">
            {tssRounded > 0 && (
              <div className="flex items-center gap-0.5">
                <FireIcon className="w-3 h-3 text-primary shrink-0" />
                <span className="font-bold text-primary tabular-nums text-xs">{tssRounded}</span>
                <span className="text-slate-400 text-[10px]">TSS</span>
              </div>
            )}
            {done.totalDist > 0 && (
              <span className="text-[10px] text-slate-500 tabular-nums">{fmtDistShort(done.totalDist, user)}</span>
            )}
            {completionPct != null && (
              <span className={`text-[10px] font-bold px-1 py-0.5 rounded-full ${
                completionPct >= 100 ? 'bg-emerald-100 text-emerald-600' : completionPct >= 70 ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-500'
              }`}>
                {completionPct}%
              </span>
            )}
          </div>
        </div>
        {showTrend && (
          <span className={`mt-0.5 shrink-0 ${tssRounded > prevRounded ? 'text-emerald-500' : 'text-red-400'}`}>
            {tssRounded > prevRounded
              ? <ArrowTrendingUpIcon className="w-4 h-4" />
              : <ArrowTrendingDownIcon className="w-4 h-4" />}
          </span>
        )}
      </div>

      {plan.totalSec > 0 && (
        <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden mb-1.5">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${Math.min(100, (done.totalSec / plan.totalSec) * 100)}%`,
              backgroundColor: completionPct >= 100 ? '#22c55e' : completionPct >= 70 ? '#f59e0b' : '#767EB5',
            }}
          />
        </div>
      )}

      <div className="space-y-1">
        {done.bySport.length === 0 ? (
          <div className="text-slate-400 italic text-xs">—</div>
        ) : (
          done.bySport.map((row) => (
            <div key={row.sport} className="flex items-center gap-1">
              <SportIcon sport={row.sport} className="w-3.5 h-3.5 text-slate-500" />
              <span className="font-semibold text-slate-700 flex-1 tabular-nums text-[11px]">
                {formatDecimalHours(row.sec) || formatWeekDurationSeconds(row.sec) || '—'}
              </span>
              {row.dist > 0 && (
                <span className="text-slate-400 shrink-0 tabular-nums text-[10px]">{fmtDistShort(row.dist, user)}</span>
              )}
              {row.tss > 0 && (
                <span className="font-bold text-primary shrink-0 tabular-nums text-[10px]">{Math.round(row.tss)}</span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
