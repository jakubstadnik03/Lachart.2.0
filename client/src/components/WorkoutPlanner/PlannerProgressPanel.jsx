import React, { useMemo, useState } from 'react';
import {
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  MinusIcon,
} from '@heroicons/react/24/outline';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { mergeProfileZones } from '../../utils/inferThresholdsFromActivities';
import {
  computePmcFromActivities,
  buildExtendedPmcSeries,
} from '../../utils/formFitnessFromActivities';
import { buildWeeklyProgressPoints, samplePmcByWeek } from './plannerProgressUtils';

const SPORT_COLORS = { bike: '#767EB5', run: '#f97316', swim: '#38bdf8', other: '#94a3b8' };

function TrendIcon({ change, className = 'w-3 h-3' }) {
  if (change === 'up') return <ArrowTrendingUpIcon className={`${className} text-emerald-500`} />;
  if (change === 'down') return <ArrowTrendingDownIcon className={`${className} text-red-400`} />;
  if (change === 'same') return <MinusIcon className={`${className} text-slate-400`} />;
  return null;
}

function WeeklyBarChart({ points, mode = 'volume', showPlan = true }) {
  const maxVal = Math.max(
    ...points.map((p) => {
      const done = mode === 'volume' ? p.doneHours : p.doneTss;
      const plan = mode === 'volume' ? p.planHours : p.planTss;
      return Math.max(done, showPlan ? plan : 0, 0.01);
    }),
    0.01,
  );

  return (
    <div className="flex items-end gap-1 h-[88px]">
      {points.map((p) => {
        const doneVal = mode === 'volume' ? p.doneHours : p.doneTss;
        const planVal = mode === 'volume' ? p.planHours : p.planTss;
        const displayVal = p.isFuture ? planVal : (doneVal || planVal);
        const donePct = (doneVal / maxVal) * 100;
        const planPct = (planVal / maxVal) * 100;
        const label = mode === 'volume'
          ? (displayVal > 0 ? `${displayVal.toFixed(1)}h` : '')
          : (displayVal > 0 ? Math.round(displayVal) : '');

        return (
          <div key={p.weekKey} className="flex-1 flex flex-col items-center gap-0.5 min-w-0">
            <span className="text-[8px] text-slate-400 font-medium tabular-nums truncate w-full text-center">{label}</span>
            <div className="w-full flex items-end justify-center gap-px" style={{ height: 64 }}>
              {showPlan && planVal > 0 && (
                <div
                  className="w-[42%] rounded-t-sm bg-primary/20 border border-primary/30 border-b-0"
                  style={{ height: `${Math.max(planPct, doneVal > 0 ? 4 : 8)}%`, minHeight: 3 }}
                  title={`Plan: ${mode === 'volume' ? `${planVal.toFixed(1)}h` : Math.round(planVal)}`}
                />
              )}
              {doneVal > 0 && (
                <div
                  className={`w-[42%] rounded-t-sm ${p.isCurrent ? 'bg-primary' : 'bg-primary/70'}`}
                  style={{ height: `${Math.max(donePct, 8)}%`, minHeight: 3 }}
                  title={`Done: ${mode === 'volume' ? `${doneVal.toFixed(1)}h` : Math.round(doneVal)}`}
                />
              )}
              {!doneVal && !planVal && (
                <div className="w-[42%] rounded-t-sm bg-slate-100" style={{ height: 2 }} />
              )}
            </div>
            <span className={`text-[8px] font-bold tabular-nums truncate w-full text-center ${p.isCurrent ? 'text-primary' : 'text-slate-400'}`}>
              {p.weekLabel}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function PmcTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  return (
    <div className="rounded-lg bg-white ring-1 ring-slate-200 shadow-md px-2 py-1.5 text-[10px]">
      <div className="font-bold text-slate-700 mb-1">{label}</div>
      {d?.fitness != null && <div className="text-blue-600">CTL {d.fitness}</div>}
      {d?.fatigue != null && <div className="text-purple-600">ATL {d.fatigue}</div>}
      {d?.form != null && <div className="text-orange-500">TSB {d.form >= 0 ? `+${d.form}` : d.form}</div>}
      {d?.projected && <div className="text-slate-400 italic mt-0.5">projected</div>}
    </div>
  );
}

export default function PlannerProgressPanel({
  weekStarts = [],
  planned = [],
  trainings = [],
  calendarActivities = [],
  chartActivities = [],
  context = {},
  user = null,
  userProfile = null,
  compact = false,
}) {
  const [metricTab, setMetricTab] = useState('volume');
  const today = useMemo(() => new Date(), []);

  const profile = useMemo(
    () => mergeProfileZones(userProfile, user) || userProfile || user,
    [userProfile, user],
  );

  const weekPoints = useMemo(
    () => buildWeeklyProgressPoints({
      weekStarts,
      planned,
      trainings,
      context,
      user,
      userProfile,
      today,
    }),
    [weekStarts, planned, trainings, context, user, userProfile, today],
  );

  const { pmcWeekPoints, todayMetrics, endMetrics } = useMemo(() => {
    const activities = calendarActivities.length ? calendarActivities : chartActivities.length ? chartActivities : trainings;
    const { series, todayMetrics: tm } = computePmcFromActivities(activities, profile, {
      tssUser: user,
    });
    const extended = buildExtendedPmcSeries(series, planned, { maxDays: 56 });
    const pmcWeekPoints = samplePmcByWeek(extended, weekStarts);
    const last = pmcWeekPoints.filter((p) => p.fitness != null).pop();
    return { pmcWeekPoints, todayMetrics: tm, endMetrics: last };
  }, [calendarActivities, chartActivities, trainings, profile, planned, weekStarts, user]);

  const totalPlanHours = weekPoints.reduce((s, p) => s + p.planHours, 0);
  const totalDoneHours = weekPoints.reduce((s, p) => s + (p.isFuture ? 0 : p.doneHours), 0);
  const totalPlanTss = weekPoints.reduce((s, p) => s + p.planTss, 0);
  const avgWeeklyHours = weekPoints.length ? totalPlanHours / weekPoints.length : 0;

  const hourGrowth = useMemo(() => {
    const withData = weekPoints.filter((p) => (p.isFuture ? p.planHours : p.doneHours || p.planHours) > 0);
    if (withData.length < 2) return null;
    const first = withData[0];
    const last = withData[withData.length - 1];
    const a = first.isFuture ? first.planHours : first.doneHours || first.planHours;
    const b = last.isFuture ? last.planHours : last.doneHours || last.planHours;
    if (a <= 0) return null;
    return Math.round(((b - a) / a) * 100);
  }, [weekPoints]);

  const shell = compact
    ? 'space-y-3'
    : 'w-[272px] shrink-0 border-l border-slate-200 bg-white/80 backdrop-blur-sm p-4 space-y-4 sticky top-4 self-start max-h-[calc(100vh-2rem)] overflow-y-auto';

  const tabs = (
    <div className="flex gap-0.5 bg-slate-100 rounded-lg p-0.5">
      {[['volume', 'Hours'], ['tss', 'TSS']].map(([id, label]) => (
        <button
          key={id}
          type="button"
          onClick={() => setMetricTab(id)}
          className={`flex-1 text-[10px] font-bold py-1 rounded-md transition-all ${
            metricTab === id ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );

  return (
    <aside className={shell}>
      <div>
        <h3 className="text-xs font-bold text-slate-800 mb-0.5">Training progress</h3>
        <p className="text-[10px] text-slate-400 mb-2">Plan vs done · weekly load</p>
        {tabs}
      </div>

      <div className="rounded-xl ring-1 ring-slate-200/70 bg-slate-50/50 p-2.5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
            {metricTab === 'volume' ? 'Weekly volume' : 'Weekly TSS'}
          </span>
          {hourGrowth != null && metricTab === 'volume' && (
            <span className={`text-[10px] font-bold tabular-nums flex items-center gap-0.5 ${hourGrowth >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
              {hourGrowth >= 0 ? '+' : ''}{hourGrowth}%
              <TrendIcon change={hourGrowth > 2 ? 'up' : hourGrowth < -2 ? 'down' : 'same'} />
            </span>
          )}
        </div>
        <WeeklyBarChart points={weekPoints} mode={metricTab} />
        <div className="flex items-center gap-3 mt-2 text-[9px] text-slate-400">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-primary/70" /> Done</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-primary/20 border border-primary/30" /> Plan</span>
        </div>
      </div>

      {/* Week-over-week growth list */}
      <div className="rounded-xl ring-1 ring-slate-200/70 bg-white p-2.5">
        <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1.5">Hourly trend</div>
        <div className="space-y-1 max-h-[120px] overflow-y-auto">
          {weekPoints.map((p) => {
            const hrs = p.isFuture ? p.planHours : p.doneHours || p.planHours;
            if (hrs <= 0 && p.hoursDelta == null) return null;
            return (
              <div key={`t-${p.weekKey}`} className="flex items-center gap-1 text-[10px]">
                <span className={`w-10 shrink-0 tabular-nums ${p.isCurrent ? 'text-primary font-bold' : 'text-slate-400'}`}>{p.weekLabel}</span>
                <span className="flex-1 font-semibold text-slate-700 tabular-nums">{hrs > 0 ? `${hrs.toFixed(1)}h` : '—'}</span>
                {p.hoursDelta != null && Math.abs(p.hoursDelta) >= 0.1 && (
                  <span className={`tabular-nums flex items-center gap-0.5 ${p.hoursDelta >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                    {p.hoursDelta >= 0 ? '+' : ''}{p.hoursDelta.toFixed(1)}h
                    <TrendIcon change={p.volumeChange} className="w-2.5 h-2.5" />
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* CTL / ATL / TSB */}
      <div className="rounded-xl ring-1 ring-slate-200/70 bg-slate-50/50 p-2.5">
        <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">Fitness · Fatigue · Form</div>
        {(todayMetrics || endMetrics) && (
          <div className="flex gap-2 mb-2">
            {[
              { l: 'CTL', v: todayMetrics?.fitness, c: '#3b82f6' },
              { l: 'ATL', v: todayMetrics?.fatigue, c: '#9333ea' },
              { l: 'TSB', v: todayMetrics?.form, c: '#f97316' },
            ].map(({ l, v, c }) => (
              v != null && (
                <div key={l} className="flex-1 rounded-lg bg-white ring-1 ring-slate-200/60 px-1.5 py-1 text-center">
                  <div className="text-[8px] font-bold uppercase tracking-wide text-slate-400">{l}</div>
                  <div className="text-sm font-extrabold tabular-nums" style={{ color: c }}>
                    {l === 'TSB' && v >= 0 ? `+${v}` : v}
                  </div>
                </div>
              )
            ))}
          </div>
        )}
        {pmcWeekPoints.some((p) => p.fitness != null) ? (
          <ResponsiveContainer width="100%" height={100}>
            <LineChart data={pmcWeekPoints} margin={{ top: 4, right: 4, left: -22, bottom: 0 }}>
              <XAxis dataKey="weekLabel" tick={{ fontSize: 8, fill: '#94a3b8' }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 8, fill: '#94a3b8' }} width={28} />
              <Tooltip content={<PmcTooltip />} />
              <ReferenceLine y={0} stroke="#e2e8f0" />
              <Line type="monotone" dataKey="fitness" stroke="#3b82f6" strokeWidth={1.5} dot={false} connectNulls />
              <Line type="monotone" dataKey="fatigue" stroke="#9333ea" strokeWidth={1.5} dot={false} strokeDasharray="3 2" connectNulls />
              <Line type="monotone" dataKey="form" stroke="#f97316" strokeWidth={1.5} dot={false} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="text-[10px] text-slate-400 italic py-4 text-center">Log activities to see PMC</div>
        )}
        <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-1 text-[8px] text-slate-400">
          <span><span className="text-blue-500">—</span> CTL</span>
          <span><span className="text-purple-500">- -</span> ATL</span>
          <span><span className="text-orange-500">—</span> TSB</span>
        </div>
      </div>

      {/* Block totals */}
      <div className="rounded-xl ring-1 ring-slate-200/70 bg-white p-2.5">
        <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1.5">{weekStarts.length}-week block</div>
        <div className="grid grid-cols-2 gap-2 text-[10px]">
          <div>
            <div className="text-slate-400">Planned</div>
            <div className="font-extrabold text-slate-800 tabular-nums">{totalPlanHours.toFixed(1)}h</div>
            {totalPlanTss > 0 && <div className="text-primary font-bold tabular-nums">{Math.round(totalPlanTss)} TSS</div>}
          </div>
          <div>
            <div className="text-slate-400">Done</div>
            <div className="font-extrabold text-slate-800 tabular-nums">{totalDoneHours.toFixed(1)}h</div>
            <div className="text-slate-400 tabular-nums">~{avgWeeklyHours.toFixed(1)}h/wk avg plan</div>
          </div>
        </div>
        {weekPoints.some((p) => p.planBySport?.length > 0) && (
          <div className="mt-2 pt-2 border-t border-slate-100 space-y-1">
            {['bike', 'run', 'swim'].map((sport) => {
              const sec = weekPoints.reduce((s, p) => {
                const row = p.planBySport.find((r) => r.sport === sport);
                return s + (row?.sec || 0);
              }, 0);
              if (sec <= 0) return null;
              return (
                <div key={sport} className="flex items-center gap-1.5 text-[10px]">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: SPORT_COLORS[sport] || SPORT_COLORS.other }} />
                  <span className="flex-1 text-slate-600 capitalize">{sport}</span>
                  <span className="font-semibold text-slate-700 tabular-nums">{(sec / 3600).toFixed(1)}h</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}
