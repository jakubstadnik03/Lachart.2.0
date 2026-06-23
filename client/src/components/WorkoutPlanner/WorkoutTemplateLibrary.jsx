/**
 * WorkoutTemplateLibrary — left sidebar of saved/predefined workout templates
 * for the Workout Planner. Filter by sport + title search, then drag a template
 * onto a day in the grid to create (and edit) a planned workout from it.
 *
 * Drag payload is set on `application/x-lachart-template` as JSON so the day
 * columns can read it on drop.
 */
import React, { useMemo, useState } from 'react';
import { PlannerSportIcon, plannerSportKey, plannerSportColor } from './WorkoutPlanModal';

const SPORTS = ['all', 'run', 'bike', 'swim', 'strength', 'hike', 'ski', 'walk', 'other'];

function normSport(s) {
  return plannerSportKey(s);
}

function stepSecs(steps) {
  if (!Array.isArray(steps)) return 0;
  return steps.reduce((s, st) => s + (Number(st.durationSeconds) || 0), 0);
}
function fmtDur(secs) {
  if (!secs) return '';
  const h = Math.floor(secs / 3600), m = Math.round((secs % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function WorkoutTemplateLibrary({ templates = [], onOpenTemplate = null }) {
  const [sport, setSport] = useState('all');
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return templates.filter(t => {
      if (sport !== 'all' && normSport(t.sport) !== sport) return false;
      if (needle && !String(t.name || '').toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [templates, sport, q]);

  return (
    <aside className="w-60 shrink-0 border-r border-slate-200/70 bg-white flex flex-col h-[calc(100vh-0px)] sticky top-0">
      <div className="p-3 border-b border-slate-100">
        <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Workout library</div>
        <p className="text-[10.5px] text-slate-400 mb-2.5">Drag onto a day to plan it</p>
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search by title…"
          className="w-full text-sm px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-800 outline-none focus:border-primary/40 focus:bg-white transition-colors"
        />
        <div className="flex flex-wrap gap-1.5 mt-2">
          {SPORTS.map(s => (
            <button
              key={s}
              onClick={() => setSport(s)}
              className={`text-[11px] font-semibold px-2 py-0.5 rounded-full transition-colors ${
                sport === s ? 'bg-primary text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
              }`}
            >
              {s === 'all' ? 'All' : s}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {filtered.length === 0 ? (
          <div className="text-[12px] text-slate-400 px-2 py-4 text-center">
            No templates{q || sport !== 'all' ? ' match the filter' : ' yet'}.
          </div>
        ) : (
          filtered.map(t => {
            const sp = normSport(t.sport);
            const dur = fmtDur(stepSecs(t.steps));
            return (
              <div
                key={t._id}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = 'copy';
                  e.dataTransfer.setData(
                    'application/x-lachart-template',
                    JSON.stringify({ name: t.name, sport: t.sport, steps: t.steps })
                  );
                }}
                onClick={() => onOpenTemplate?.(t)}
                title="Click to open & edit · drag onto a day to plan"
                className="group flex items-center gap-2 px-2.5 py-2 rounded-xl ring-1 ring-slate-200/70 bg-white hover:ring-primary/40 hover:shadow-sm cursor-pointer transition-all"
              >
                <span className="w-5 h-5 shrink-0 flex items-center justify-center">
                  <PlannerSportIcon sport={t.sport} size={14} color={plannerSportColor(t.sport)} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[12.5px] font-semibold text-slate-800 truncate">{t.name}</div>
                  <div className="text-[10.5px] text-slate-400 truncate">
                    {sp}{dur ? ` · ${dur}` : ''}{Array.isArray(t.steps) ? ` · ${t.steps.length} steps` : ''}
                  </div>
                </div>
                <svg className="w-3.5 h-3.5 text-slate-300 group-hover:text-primary/50 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="9" cy="6" r="1" /><circle cx="15" cy="6" r="1" />
                  <circle cx="9" cy="12" r="1" /><circle cx="15" cy="12" r="1" />
                  <circle cx="9" cy="18" r="1" /><circle cx="15" cy="18" r="1" />
                </svg>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}
