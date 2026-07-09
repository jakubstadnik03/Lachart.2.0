import React, { useState } from 'react';
import { PlusIcon } from '@heroicons/react/24/outline';
import PlannerWeekSummary from './PlannerWeekSummary';
import {
  addDays,
  isSameDay,
  toLocalDateStr,
  completedDistM,
  completedSecs,
  completedTss,
  plannedWorkoutDistM,
  plannedWorkoutSecs,
  plannedWorkoutTss,
  fmtDistShort,
} from './plannerWeekUtils';
import {
  fmtDuration,
  MiniWorkoutChart,
  PlannerSportIcon,
  plannerSportColor,
  sportMatchesPlanner,
} from './WorkoutPlanModal';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function PlannedCard({ pw, onEdit, onDelete, onComplete, onStart, isMissed = false, context, user }) {
  const col = isMissed ? '#ef4444' : plannerSportColor(pw.sport);
  const dur = plannedWorkoutSecs(pw);
  const tss = plannedWorkoutTss(pw, context);
  const dist = plannedWorkoutDistM(pw);
  const isSkipped = pw.status === 'skipped';

  return (
    <div
      className={`group relative rounded-xl bg-white ring-1 shadow-sm cursor-pointer overflow-hidden transition-all hover:shadow-md
        ${isMissed ? 'ring-red-200 bg-red-50' : 'ring-slate-200/70'}
        ${isSkipped ? 'opacity-40' : ''}`}
      style={{ borderWidth: 1, borderStyle: isMissed ? 'solid' : 'dashed', borderColor: isMissed ? '#fecaca' : col + '55' }}
      onClick={() => onEdit(pw)}
    >
      <span className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl" style={{ backgroundColor: col }} />
      <div className="pl-3 pr-2.5 py-2">
        <div className="flex items-center gap-1.5 mb-1">
          <span className="flex items-center justify-center w-5 h-5 rounded-md shrink-0" style={{ backgroundColor: (isMissed ? '#ef4444' : col) + '1a' }}>
            <PlannerSportIcon sport={pw.sport} size={12} color={isMissed ? '#ef4444' : col} />
          </span>
          <span className="text-xs font-semibold truncate flex-1 leading-tight" style={{ color: isMissed ? '#991b1b' : '#334155' }}>
            {pw.title}
          </span>
          {isMissed && <span className="text-[9px] font-bold uppercase text-red-500 shrink-0">Missed</span>}
        </div>
        {pw.steps?.length > 0 && <MiniWorkoutChart steps={pw.steps} />}
        {(dur > 0 || tss > 0 || dist > 0) && (
          <div className="flex flex-wrap items-center gap-1 mt-1.5">
            {dur > 0 && <span className="text-[10px] font-medium text-slate-500 bg-slate-100 rounded-md px-1.5 py-0.5 tabular-nums">{fmtDuration(dur)}</span>}
            {tss > 0 && <span className="text-[10px] font-medium text-primary bg-primary/10 rounded-md px-1.5 py-0.5 tabular-nums">{Math.round(tss)} TSS</span>}
            {dist > 0 && <span className="text-[10px] font-medium text-slate-500 bg-slate-100 rounded-md px-1.5 py-0.5 tabular-nums">{fmtDistShort(dist, user)}</span>}
          </div>
        )}
      </div>
      {pw.status === 'planned' && !isMissed && (
        <div className="hidden group-hover:flex items-center gap-1 px-2 pb-2 pl-3">
          {onStart && (
            <button type="button" onClick={(e) => { e.stopPropagation(); onStart(pw); }}
              className="flex items-center gap-0.5 text-[10px] text-white rounded-md px-2 py-1 font-semibold" style={{ backgroundColor: col }}>
              Start
            </button>
          )}
          <button type="button" onClick={(e) => { e.stopPropagation(); onComplete(pw); }}
            className="flex-1 text-[10px] font-semibold text-emerald-600 bg-emerald-50 rounded-md px-1.5 py-1">Done</button>
          <button type="button" onClick={(e) => { e.stopPropagation(); onDelete(pw); }}
            className="text-red-400 hover:text-red-500 rounded-md p-1">×</button>
        </div>
      )}
    </div>
  );
}

function CompletedCard({ training, onOpen, paired = false, user, userProfile }) {
  const sport = training.sport || training.type;
  const col = paired ? plannerSportColor(sport) : '#94a3b8';
  const title = training.title || training.name || training.titleManual || 'Activity';
  const secs = completedSecs(training);
  const tss = completedTss(training, userProfile, user);
  const dist = completedDistM(training);

  return (
    <div
      className={`group relative rounded-xl ring-1 overflow-hidden transition-all ${paired ? 'bg-emerald-50/40 ring-emerald-200/60' : 'bg-slate-50 ring-slate-200/70'} ${onOpen ? 'cursor-pointer hover:shadow-md' : ''}`}
      onClick={onOpen ? () => onOpen(training) : undefined}
    >
      <span className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl" style={{ backgroundColor: col }} />
      <div className="pl-3 pr-2.5 py-2">
        <div className="flex items-center gap-1.5">
          <span className="flex items-center justify-center w-5 h-5 rounded-md shrink-0" style={{ backgroundColor: col + '1a' }}>
            <PlannerSportIcon sport={sport} size={12} color={col} />
          </span>
          <span className={`text-xs font-medium truncate flex-1 ${paired ? 'text-slate-700' : 'text-slate-500'}`}>{title}</span>
        </div>
        {(secs > 0 || tss > 0 || dist > 0) && (
          <div className="flex flex-wrap items-center gap-1 mt-1.5 pl-[26px]">
            {secs > 0 && <span className="text-[10px] font-medium text-slate-500 bg-slate-100 rounded-md px-1.5 py-0.5 tabular-nums">{fmtDuration(secs)}</span>}
            {tss > 0 && <span className="text-[10px] font-medium text-primary bg-primary/10 rounded-md px-1.5 py-0.5 tabular-nums">{Math.round(tss)} TSS</span>}
            {dist > 0 && <span className="text-[10px] font-medium text-slate-500 bg-slate-100 rounded-md px-1.5 py-0.5 tabular-nums">{fmtDistShort(dist, user)}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

export default function PlannerWeekRow({
  weekStart,
  planned,
  trainings,
  prevWeekTrainings = [],
  context,
  user,
  userProfile,
  isMobile,
  today,
  dragOverDay,
  setDragOverDay,
  onEdit,
  onDelete,
  onComplete,
  onStart,
  onOpenCompleted,
  onAddDay,
  onDropTemplate,
}) {
  const [summaryTab, setSummaryTab] = useState('plan');
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const weekEnd = addDays(weekStart, 6);
  const weekLabel = `${weekStart.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${
    weekEnd.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  }`;
  const todayStr = toLocalDateStr(today);

  const weekPlanned = planned.filter((p) => {
    const d = new Date(p.date);
    return d >= weekStart && d < addDays(weekStart, 7);
  });
  const weekTrainings = trainings.filter((t) => {
    const d = new Date(t.date || t.startDate || t.start_date);
    return d >= weekStart && d < addDays(weekStart, 7);
  });

  const grid = (
    <div className={isMobile ? 'flex flex-col gap-2.5' : 'grid grid-cols-7 gap-2 items-stretch flex-1 min-w-0'}>
      {days.map((day, di) => {
        const dateStr = toLocalDateStr(day);
        const isToday = isSameDay(day, today);
        const dayPlanned = weekPlanned.filter((p) => isSameDay(new Date(p.date), day));
        const dayCompleted = weekTrainings.filter((t) => isSameDay(new Date(t.date || t.startDate || t.start_date), day));
        const isPastDay = dateStr < todayStr;
        const ckey = (t) => String(t._id || t.id || t.stravaId || '');
        const claimedDone = new Set();
        const planMatch = new Map();
        for (const pw of dayPlanned) {
          let m = dayCompleted.find((t) => !claimedDone.has(ckey(t)) && pw.completedTrainingId && String(pw.completedTrainingId) === ckey(t));
          if (!m) m = dayCompleted.find((t) => !claimedDone.has(ckey(t)) && sportMatchesPlanner(pw.sport, t.sport || t.type));
          if (m) { claimedDone.add(ckey(m)); planMatch.set(pw._id, m); }
        }
        const standaloneCompleted = dayCompleted.filter((t) => !claimedDone.has(ckey(t)));
        const isWeekend = di >= 5;
        const isEmpty = dayPlanned.length === 0 && dayCompleted.length === 0;

        return (
          <div
            key={dateStr}
            onDragOver={(e) => {
              if (Array.from(e.dataTransfer.types).includes('application/x-lachart-template')) {
                e.preventDefault();
                if (dragOverDay !== dateStr) setDragOverDay(dateStr);
              }
            }}
            onDragLeave={() => setDragOverDay((d) => (d === dateStr ? null : d))}
            onDrop={(e) => {
              e.preventDefault();
              setDragOverDay(null);
              const raw = e.dataTransfer.getData('application/x-lachart-template');
              if (!raw) return;
              try { onDropTemplate(day, JSON.parse(raw)); } catch { /* ignore */ }
            }}
            className={`group/day flex flex-col gap-2 rounded-2xl transition-all ${
              isMobile
                ? 'ring-1 ring-slate-200/70 bg-white p-3 shadow-sm'
                : `p-2 min-h-[160px] ring-1 ${isToday ? 'bg-primary/5 ring-primary/30' : isWeekend ? 'bg-slate-50/60 ring-slate-200/60' : 'bg-white ring-slate-200/70'} shadow-sm`
            } ${dragOverDay === dateStr ? 'ring-2 ring-primary/60 bg-primary/5' : ''}`}
          >
            <div className="flex items-center justify-between px-0.5">
              <span className={`text-[10px] font-bold uppercase tracking-wider ${isToday ? 'text-primary' : 'text-slate-400'}`}>{DAYS[di]}</span>
              <span className={`flex items-center justify-center text-sm font-bold tabular-nums ${isToday ? 'text-white bg-primary w-6 h-6 rounded-full' : 'text-slate-600'}`}>
                {day.getDate()}
              </span>
            </div>

            {dayPlanned.map((pw) => {
              const matched = planMatch.get(pw._id);
              if (matched) {
                return (
                  <CompletedCard
                    key={pw._id}
                    training={matched}
                    paired
                    user={user}
                    userProfile={userProfile}
                    onOpen={(tr) => onOpenCompleted(tr, pw)}
                  />
                );
              }
              return (
                <PlannedCard
                  key={pw._id}
                  pw={pw}
                  context={context}
                  user={user}
                  isMissed={isPastDay && pw.status !== 'completed' && pw.status !== 'skipped'}
                  onEdit={() => onEdit(day, pw)}
                  onDelete={onDelete}
                  onComplete={onComplete}
                  onStart={onStart}
                />
              );
            })}

            {standaloneCompleted.map((t) => (
              <CompletedCard key={ckey(t)} training={t} user={user} userProfile={userProfile} onOpen={(tr) => onOpenCompleted(tr)} />
            ))}

            {isEmpty && !isMobile ? (
              <button type="button" onClick={() => onAddDay(day)}
                className="flex-1 flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-slate-200 text-slate-300 hover:border-primary/40 hover:text-primary/70 hover:bg-primary/5 transition-all py-3">
                <span className="text-[11px] font-medium text-slate-400">Rest day</span>
                <span className="flex items-center gap-1 text-[10px] opacity-0 group-hover/day:opacity-100 transition-opacity">
                  <PlusIcon className="w-3 h-3" /> Add workout
                </span>
              </button>
            ) : (
              <button type="button" onClick={() => onAddDay(day)}
                className={`flex items-center justify-center gap-1 rounded-lg border border-dashed border-slate-200 text-slate-400 hover:border-primary/40 hover:text-primary/70 hover:bg-primary/5 transition-all ${isMobile ? 'py-2 text-xs' : 'py-1.5 text-[11px] mt-auto'}`}>
                <PlusIcon className={isMobile ? 'w-3.5 h-3.5' : 'w-3 h-3'} />
                <span className={isMobile ? '' : 'hidden sm:inline'}>Add</span>
              </button>
            )}
          </div>
        );
      })}
    </div>
  );

  return (
    <section className="mb-8">
      <h2 className="text-sm font-bold text-slate-700 mb-2 tabular-nums">{weekLabel}</h2>
      <div className={isMobile ? 'space-y-3' : 'flex gap-3 items-start'}>
        {grid}
        <div className={isMobile ? '' : 'w-[190px] shrink-0 sticky top-4'}>
          <PlannerWeekSummary
            planned={planned}
            trainings={trainings}
            weekStart={weekStart}
            context={context}
            user={user}
            userProfile={userProfile}
            prevWeekTrainings={prevWeekTrainings}
            tab={summaryTab}
            onTabChange={setSummaryTab}
            compact={isMobile}
          />
        </div>
      </div>
    </section>
  );
}
