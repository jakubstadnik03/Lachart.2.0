/**
 * PlanBlockPreview — see the whole block before any of it reaches the calendar.
 *
 * Two views of the same draft, because they answer different questions:
 *   Shape  — is this a sensible block? volume and intensity, week by week
 *   Dates  — does it actually fit my life? the same sessions on real days
 *
 * Nothing here writes to the server. The commit bar is the only path out, and
 * it reports what it is about to create before it does it.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import {
  draftCollisions,
  draftSummary,
  draftToPlannedWorkouts,
  relabelDraftSession,
  removeDraftSession,
  weekSummary,
} from '../../utils/planDraft';

const PHASE_COLOR = {
  base: '#60A5FA',
  build: '#34D399',
  peak: '#F97316',
  taper: '#A78BFA',
};

/**
 * The hard-work portion is drawn in a distinctly darker shade rather than the
 * same hue at a higher opacity — two opacities of one colour read as "slightly
 * different blue", and telling volume from intensity at a glance is the entire
 * point of this chart.
 */
const PHASE_COLOR_HARD = {
  base: '#1D4ED8',
  build: '#047857',
  peak: '#C2410C',
  taper: '#6D28D9',
};

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function formatDay(key) {
  const d = new Date(`${key}T12:00:00`);
  if (Number.isNaN(d.getTime())) return key;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/**
 * The shape of the block: bar height is volume, the darker portion is the
 * share of that volume coming from hard work. One chart, both axes an athlete
 * actually plans around.
 */
function ShapeChart({ weeks, selected, onSelect }) {
  const summaries = weeks.map(weekSummary);
  const maxTss = Math.max(1, ...summaries.map((s) => s.tss));

  return (
    <div>
      <div className="flex items-end gap-1.5" style={{ height: 130 }}>
        {weeks.map((week, i) => {
          const s = summaries[i];
          const h = (s.tss / maxTss) * 100;
          const hardH = (s.intensityPct / 100) * h;
          const active = selected === i;
          return (
            <button
              key={week.startDate}
              type="button"
              onClick={() => onSelect(i)}
              title={`Week ${i + 1} · ${s.tss} TSS · ${s.hours}h · ${s.hardCount} hard`}
              className="flex-1 flex flex-col justify-end h-full group"
            >
              <div className="relative w-full rounded-t transition-all" style={{ height: `${h}%` }}>
                <div
                  className="absolute inset-0 rounded-t"
                  style={{
                    background: PHASE_COLOR[week.phase] || '#94A3B8',
                    opacity: active ? 0.35 : 0.22,
                  }}
                />
                <div
                  className="absolute bottom-0 left-0 right-0"
                  style={{
                    height: `${(hardH / Math.max(h, 0.001)) * 100}%`,
                    background: PHASE_COLOR_HARD[week.phase] || '#475569',
                    opacity: active ? 1 : 0.85,
                  }}
                />
                {week.isRecovery ? (
                  <span className="absolute -top-4 left-1/2 -translate-x-1/2 text-[9px] font-bold text-sky-600">
                    ↓
                  </span>
                ) : null}
              </div>
              <div
                className={`mt-1 text-[9px] font-semibold ${active ? 'text-gray-900' : 'text-gray-400'}`}
              >
                {i + 1}
              </div>
            </button>
          );
        })}
      </div>
      <div className="flex gap-3 mt-2">
        <span className="inline-flex items-center gap-1 text-[10px] text-gray-500">
          <span className="w-2 h-2 rounded-sm" style={{ background: '#60A5FA', opacity: 0.35 }} /> Volume
        </span>
        <span className="inline-flex items-center gap-1 text-[10px] text-gray-500">
          <span className="w-2 h-2 rounded-sm" style={{ background: '#1D4ED8' }} /> From hard sessions
        </span>
        <span className="inline-flex items-center gap-1 text-[10px] text-sky-600">↓ Recovery week</span>
      </div>
    </div>
  );
}

/** The same block on the athlete's real dates, month by month. */
function DatesPreview({ draft, collisionsByDate }) {
  const planned = useMemo(() => draftToPlannedWorkouts(draft), [draft]);
  const byDate = useMemo(() => {
    const m = new Map();
    for (const p of planned) {
      if (!m.has(p.date)) m.set(p.date, []);
      m.get(p.date).push(p);
    }
    return m;
  }, [planned]);

  if (!draft?.weeks?.length) return null;

  return (
    <div className="space-y-1.5">
      {draft.weeks.map((week) => {
        const start = new Date(`${week.startDate}T12:00:00`);
        return (
          <div key={week.startDate} className="flex items-center gap-1.5">
            <div className="w-16 shrink-0 text-[10px] text-gray-400">
              {formatDay(week.startDate)}
            </div>
            {WEEKDAYS.map((_, dayIdx) => {
              const d = new Date(start);
              d.setDate(d.getDate() + dayIdx);
              const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
              const sessions = byDate.get(key) || [];
              const clash = collisionsByDate.has(key);
              return (
                <div
                  key={key}
                  title={sessions.map((s) => s.title).join(', ') || 'Rest'}
                  className={`flex-1 h-7 rounded flex items-center justify-center text-[9px] font-bold ${
                    sessions.length
                      ? 'text-white'
                      : 'bg-gray-50 text-gray-300'
                  } ${clash ? 'ring-2 ring-amber-400' : ''}`}
                  style={sessions.length ? { background: PHASE_COLOR[week.phase] || '#94A3B8' } : undefined}
                >
                  {sessions.length ? Math.round(sessions.reduce((s, x) => s + (x.targetTss || 0), 0)) : ''}
                </div>
              );
            })}
          </div>
        );
      })}
      <div className="flex gap-1.5 pl-16 mt-1">
        {WEEKDAYS.map((w) => (
          <div key={w} className="flex-1 text-center text-[9px] text-gray-400">{w}</div>
        ))}
      </div>
    </div>
  );
}

/** The selected week, editable — this is where "correct it if it's wrong" lives. */
function WeekDetail({ draft, weekIndex, onChange }) {
  const week = draft.weeks[weekIndex];
  if (!week) return null;
  const s = weekSummary(week);

  return (
    <div className="mt-3 rounded-xl border border-gray-100 bg-gray-50 p-3">
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-xs font-bold text-gray-900">
          Week {weekIndex + 1} · {week.label}
        </span>
        <span className="text-[11px] text-gray-500">
          {s.tss} TSS · {s.hours}h · {s.hardCount} hard
        </span>
      </div>
      <div className="space-y-1">
        {week.sessions.map((session) => (
          <div key={session.id} className="flex items-center gap-2 bg-white rounded-lg px-2 py-1.5">
            <span className="w-8 shrink-0 text-[10px] font-semibold text-gray-400">
              {WEEKDAYS[session.dayOffset]}
            </span>
            <input
              value={session.title}
              onChange={(e) => onChange(relabelDraftSession(draft, weekIndex, session.id, { title: e.target.value }))}
              className="flex-1 min-w-0 bg-transparent text-xs font-medium text-gray-900 outline-none focus:bg-gray-50 rounded px-1 py-0.5"
            />
            <span className="text-[10px] text-gray-400 shrink-0">{session.targetTss} TSS</span>
            <button
              type="button"
              onClick={() => onChange(removeDraftSession(draft, weekIndex, session.id))}
              className="p-1 text-gray-300 hover:text-rose-500"
              aria-label="Remove session"
            >
              <TrashIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
        {!week.sessions.length ? (
          <div className="text-[11px] text-gray-400 py-1">No sessions this week.</div>
        ) : null}
      </div>
    </div>
  );
}

export default function PlanBlockPreview({
  draft,
  existingPlanned = [],
  onChange,
  onCommit,
  onDiscard,
  committing = null, // { done, total } while committing
}) {
  const [view, setView] = useState('shape');
  const [selectedWeek, setSelectedWeek] = useState(0);

  const summary = useMemo(() => draftSummary(draft), [draft]);
  const collisions = useMemo(() => draftCollisions(draft, existingPlanned), [draft, existingPlanned]);
  const collisionsByDate = useMemo(() => new Set(collisions.map((c) => c.date)), [collisions]);

  const selectWeek = useCallback((i) => {
    setSelectedWeek(i);
    setView('shape');
  }, []);

  if (!draft?.weeks?.length) return null;

  const inProgress = !!committing;
  const pct = inProgress && committing.total > 0
    ? Math.round((committing.done / committing.total) * 100)
    : 0;

  return (
    <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-amber-600">
              Draft — nothing saved yet
            </div>
            <h3 className="text-base font-bold text-gray-900">{draft.name}</h3>
            <div className="text-[11px] text-gray-500">
              {summary.weeks} weeks · {summary.sessions} sessions · {summary.hours}h · peak {summary.peakWeekTss} TSS
            </div>
          </div>
          <div className="inline-flex p-0.5 rounded-lg bg-gray-100 shrink-0">
            {[{ id: 'shape', label: 'Shape' }, { id: 'dates', label: 'Dates' }].map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => setView(v.id)}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
                  view === v.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>

        {view === 'shape' ? (
          <>
            <ShapeChart weeks={draft.weeks} selected={selectedWeek} onSelect={selectWeek} />
            <WeekDetail draft={draft} weekIndex={selectedWeek} onChange={onChange} />
          </>
        ) : (
          <DatesPreview draft={draft} collisionsByDate={collisionsByDate} />
        )}

        {collisions.length ? (
          <div className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2">
            <ExclamationTriangleIcon className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
            <p className="text-[11px] text-gray-700 leading-relaxed">
              {collisions.length} day{collisions.length === 1 ? '' : 's'} already {collisions.length === 1 ? 'has' : 'have'} something
              planned — committing adds these alongside, it doesn't replace them.
            </p>
          </div>
        ) : null}
      </div>

      {/* Commit bar — the only way anything reaches the calendar. */}
      <div className="px-4 sm:px-5 py-3 bg-gray-50 border-t border-gray-100">
        {inProgress ? (
          <div>
            <div className="flex items-center justify-between text-[11px] text-gray-600 mb-1.5">
              <span>Creating sessions…</span>
              <span className="font-semibold">{committing.done} of {committing.total}</span>
            </div>
            <div className="h-1.5 rounded-full bg-gray-200 overflow-hidden">
              <motion.div
                className="h-full bg-primary"
                initial={false}
                animate={{ width: `${pct}%` }}
                transition={{ ease: 'linear', duration: 0.2 }}
              />
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onDiscard}
              className="px-3 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-white"
            >
              Discard
            </button>
            <div className="flex-1 text-[11px] text-gray-500">
              Saved on this device — you can come back to it.
            </div>
            <button
              type="button"
              onClick={onCommit}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-white text-sm font-semibold hover:brightness-95"
            >
              <CheckCircleIcon className="w-4 h-4" />
              Add {summary.sessions} sessions to my calendar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
