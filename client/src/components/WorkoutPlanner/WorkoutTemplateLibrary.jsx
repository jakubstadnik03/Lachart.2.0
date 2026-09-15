/**
 * WorkoutTemplateLibrary — left panel of the Workout Planner: the coach's own
 * saved templates and every built-in workout, filtered by sport and category
 * (menus) or a word from the name. Drag one onto a day to plan it; click one
 * to open it in the builder.
 *
 * The built-ins used to appear only until the first template was saved, and
 * then the whole catalogue vanished — the planner's library had thirteen
 * bike/run/swim starters or the coach's three, never both.
 *
 * Drag payload is set on `application/x-lachart-template` as JSON so the day
 * columns can read it on drop.
 */
import React, { useMemo, useState } from 'react';
import { MagnifyingGlassIcon, ChevronLeftIcon } from '@heroicons/react/24/outline';
import { PlannerSportIcon, plannerSportKey, plannerSportColor } from './WorkoutPlanModal';
import { PRESET_CATALOG, PRESET_CATEGORY_LABELS, buildPresetSteps } from './WorkoutBuilder';
import { WorkoutStepsSummary, WorkoutPreviewDialog } from './WorkoutStepsPreview';
import HoverCard from '../shared/HoverCard';
import { useCategories } from '../../context/CategoryContext';

const SPORT_ORDER = ['bike', 'run', 'swim', 'strength', 'hike', 'ski', 'walk', 'brick', 'rowing', 'other'];
const SPORT_LABELS = {
  bike: 'Bike', run: 'Run', swim: 'Swim', strength: 'Strength', hike: 'Hike', ski: 'Ski',
  walk: 'Walk', brick: 'Brick', rowing: 'Rowing', mtbike: 'MTB', crosstrain: 'Cross-training',
  lactate: 'Lactate test', other: 'Other',
};

function stepSecs(steps) {
  if (!Array.isArray(steps)) return 0;
  const visited = new Set();
  let total = 0;
  steps.forEach((s) => {
    if (!s.groupId) { total += Number(s.durationSeconds) || 0; return; }
    if (visited.has(s.groupId)) return;
    visited.add(s.groupId);
    const group = steps.filter((x) => x.groupId === s.groupId);
    const reps = (group.find((x) => x.isGroupHeader)?.groupRepeat) || 1;
    group.forEach((gs) => { total += (Number(gs.durationSeconds) || 0) * reps; });
  });
  return total;
}
function fmtDur(secs) {
  if (!secs) return '';
  const h = Math.floor(secs / 3600), m = Math.round((secs % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** One draggable, clickable row: hover shows the laps, a click opens the preview. */
function TemplateRow({ item, onOpen, categoryLabel }) {
  const dur = fmtDur(stepSecs(item.steps));
  const meta = [SPORT_LABELS[item.sportKey] || item.sportKey, dur, item.category ? categoryLabel(item.category) : null]
    .filter(Boolean).join(' · ');
  return (
    <HoverCard content={<WorkoutStepsSummary title={item.name} sport={item.sport} steps={item.steps} note="Drag onto a day to plan it" />}>
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'copy';
        e.dataTransfer.setData(
          'application/x-lachart-template',
          JSON.stringify({ name: item.name, sport: item.sport, steps: item.steps }),
        );
      }}
      onClick={() => onOpen?.(item)}
      title={item.desc ? `${item.desc} — click to see the laps, drag onto a day to plan` : 'Click to see the laps · drag onto a day to plan'}
      className="group flex items-center gap-2 pl-2 pr-2.5 py-2 rounded-xl ring-1 ring-slate-200/70 bg-white hover:ring-primary/40 hover:shadow-sm cursor-pointer transition-all"
      style={{ borderLeft: `3px solid ${item.color || plannerSportColor(item.sport)}` }}
    >
      <span className="w-5 h-5 shrink-0 flex items-center justify-center">
        <PlannerSportIcon sport={item.sport} size={14} color={plannerSportColor(item.sport)} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[12.5px] font-semibold text-slate-800 truncate">{item.name}</div>
        <div className="text-[10.5px] text-slate-400 truncate">{meta}</div>
      </div>
      <svg className="w-3.5 h-3.5 text-slate-300 group-hover:text-primary/50 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="9" cy="6" r="1" /><circle cx="15" cy="6" r="1" />
        <circle cx="9" cy="12" r="1" /><circle cx="15" cy="12" r="1" />
        <circle cx="9" cy="18" r="1" /><circle cx="15" cy="18" r="1" />
      </svg>
    </div>
    </HoverCard>
  );
}

const selectClass = 'w-full text-xs font-semibold px-2 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-700 outline-none focus:border-primary/40 focus:bg-white transition-colors appearance-none';
const SELECT_ARROW = {
  backgroundImage: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'><path d='M6 9l6 6 6-6'/></svg>\")",
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 8px center',
  paddingRight: 24,
};

export default function WorkoutTemplateLibrary({ templates = [], onOpenTemplate = null, onDeleteTemplate = null, onClose = null, context = {} }) {
  const [sport, setSport] = useState('all');
  const [cat, setCat] = useState('all');
  const [q, setQ] = useState('');
  // A click shows the workout; planning it is the button inside the preview.
  const [preview, setPreview] = useState(null);
  const { categories } = useCategories();
  const categoryLabel = (id) => (categories || []).find((c) => c.id === id)?.label || PRESET_CATEGORY_LABELS[id] || id;

  // Built once: the steps of every preset, so scrolling the list costs nothing.
  const builtIn = useMemo(() => PRESET_CATALOG.map((p) => ({
    id: `preset-${p.key}`, name: p.name, sport: p.sport, sportKey: plannerSportKey(p.sport),
    category: p.cat || null, desc: p.desc, color: p.color, steps: buildPresetSteps(p.key), builtIn: true,
  })), []);
  const mine = useMemo(() => (templates || []).filter((t) => t && !t.isDefault).map((t) => ({
    id: t._id, name: t.name, sport: t.sport, sportKey: plannerSportKey(t.sport),
    category: (Array.isArray(t.tags) && t.tags[0]) || null, desc: t.description || '', steps: t.steps || [], builtIn: false,
  })), [templates]);

  const sports = useMemo(() => {
    const present = new Set([...builtIn, ...mine].map((t) => t.sportKey));
    return SPORT_ORDER.filter((s) => present.has(s)).concat([...present].filter((s) => !SPORT_ORDER.includes(s)));
  }, [builtIn, mine]);

  const inSport = (t) => sport === 'all' || t.sportKey === sport;
  // The categories the chosen sport actually has, in the catalogue's order.
  const catOrder = Object.keys(PRESET_CATEGORY_LABELS);
  const cats = [...new Set([...builtIn, ...mine].filter(inSport).map((t) => t.category).filter(Boolean))]
    .sort((a, b) => {
      const ia = catOrder.indexOf(a), ib = catOrder.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || String(a).localeCompare(String(b));
    });
  // A category that left with the sport switch means "all" again.
  const effectiveCat = cat !== 'all' && !cats.includes(cat) ? 'all' : cat;

  const needle = q.trim().toLowerCase();
  const matches = (t) => inSport(t)
    && (effectiveCat === 'all' || t.category === effectiveCat)
    && (!needle || `${t.name} ${t.desc || ''} ${t.category ? categoryLabel(t.category) : ''}`.toLowerCase().includes(needle));
  const mineShown = mine.filter(matches);
  const builtInShown = builtIn.filter(matches);

  return (
    <aside className="w-64 shrink-0 border-r border-slate-200/70 bg-white flex flex-col h-screen sticky top-0">
      <div className="p-3 border-b border-slate-100">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Workout library</div>
            <p className="text-[10.5px] text-slate-400 mb-2.5">Drag onto a day to plan it</p>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Hide the library"
              title="Hide the library"
              className="-mr-1 -mt-1 p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            >
              <ChevronLeftIcon className="w-4 h-4" />
            </button>
          )}
        </div>
        <div className="relative">
          <MagnifyingGlassIcon className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by title…"
            className="w-full text-sm pl-8 pr-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-800 outline-none focus:border-primary/40 focus:bg-white transition-colors"
          />
        </div>
        <div className="grid grid-cols-2 gap-1.5 mt-2">
          <label className="block">
            <span className="sr-only">Sport</span>
            <select value={sport} onChange={(e) => setSport(e.target.value)} className={selectClass} style={SELECT_ARROW} aria-label="Sport">
              <option value="all">All sports</option>
              {sports.map((s) => <option key={s} value={s}>{SPORT_LABELS[s] || s}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="sr-only">Category</span>
            <select value={effectiveCat} onChange={(e) => setCat(e.target.value)} className={selectClass} style={SELECT_ARROW} aria-label="Category">
              <option value="all">All categories</option>
              {cats.map((c) => <option key={c} value={c}>{categoryLabel(c)}</option>)}
            </select>
          </label>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-3">
        {mineShown.length === 0 && builtInShown.length === 0 ? (
          <div className="text-[12px] text-slate-400 px-2 py-4 text-center">
            Nothing matches — try another word, sport or category.
          </div>
        ) : (
          <>
            {mineShown.length > 0 && (
              <section>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-1 mb-1.5">My templates</p>
                <div className="space-y-1.5">
                  {mineShown.map((t) => <TemplateRow key={t.id} item={t} onOpen={setPreview} categoryLabel={categoryLabel} />)}
                </div>
              </section>
            )}
            {builtInShown.length > 0 && (
              <section>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-1 mb-1.5">
                  Built-in workouts <span className="font-medium normal-case tracking-normal text-slate-300">· {builtInShown.length}</span>
                </p>
                <div className="space-y-1.5">
                  {builtInShown.map((t) => <TemplateRow key={t.id} item={t} onOpen={setPreview} categoryLabel={categoryLabel} />)}
                </div>
              </section>
            )}
          </>
        )}
      </div>
      {preview && (
        <WorkoutPreviewDialog
          workout={preview}
          context={context}
          onClose={() => setPreview(null)}
          onPlan={onOpenTemplate ? (w) => onOpenTemplate(w, 'plan') : null}
          onEdit={onOpenTemplate ? (w) => onOpenTemplate(w, 'edit') : null}
          onDelete={!preview.builtIn && onDeleteTemplate ? (w) => onDeleteTemplate(w) : null}
          planLabel="Plan it"
        />
      )}
    </aside>
  );
}
