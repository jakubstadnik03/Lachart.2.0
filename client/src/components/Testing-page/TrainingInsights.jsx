import React, { useMemo, useState } from 'react';
import {
  BeakerIcon, CheckCircleIcon, ChevronDownIcon, ExclamationTriangleIcon, InformationCircleIcon,
} from '@heroicons/react/24/outline';

/**
 * "What your training says", as a list a coach can scan.
 *
 * Five paragraphs in five coloured boxes was a page of prose: everything
 * open, nothing ranked. Now each reading is one line — the verdict, and how
 * much evidence stands behind it — that opens to the explanation. The ones
 * worth acting on (a warning) start open; the rest start folded; the header
 * says how many of each there are and folds the whole thing away.
 */

export const TONE = {
  good: { border: 'border-emerald-200', bg: 'bg-emerald-50/70', title: 'text-emerald-900', icon: CheckCircleIcon, iconColor: 'text-emerald-600', chip: 'bg-emerald-100 text-emerald-700', word: 'good' },
  warn: { border: 'border-amber-200', bg: 'bg-amber-50/70', title: 'text-amber-900', icon: ExclamationTriangleIcon, iconColor: 'text-amber-600', chip: 'bg-amber-100 text-amber-700', word: 'to watch' },
  info: { border: 'border-sky-200', bg: 'bg-sky-50/70', title: 'text-sky-900', icon: InformationCircleIcon, iconColor: 'text-sky-600', chip: 'bg-sky-100 text-sky-700', word: 'notes' },
  neutral: { border: 'border-slate-200', bg: 'bg-slate-50/70', title: 'text-slate-900', icon: BeakerIcon, iconColor: 'text-slate-500', chip: 'bg-slate-100 text-slate-600', word: 'notes' },
};

const CONFIDENCE = {
  high: { text: 'strong evidence', cls: 'bg-emerald-100 text-emerald-700' },
  medium: { text: 'fair evidence', cls: 'bg-sky-100 text-sky-700' },
  low: { text: 'a hint', cls: 'bg-slate-100 text-slate-500' },
};

export function ConfidenceChip({ level }) {
  const c = CONFIDENCE[level];
  if (!c) return null;
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${c.cls}`}>{c.text}</span>;
}

/** Which rows start open: the warnings, and the first row when nothing warns. */
export function defaultOpenIds(insights) {
  const warns = insights.filter((i) => i.tone === 'warn').map((i) => i.id);
  if (warns.length) return new Set(warns);
  return new Set(insights.length ? [insights[0].id] : []);
}

function InsightRow({ insight, open, onToggle }) {
  const tone = TONE[insight.tone] || TONE.neutral;
  const Icon = tone.icon;
  return (
    <div className={`rounded-xl border ${tone.border} ${open ? tone.bg : 'bg-white'} transition-colors`}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left"
      >
        <Icon className={`h-4 w-4 shrink-0 ${tone.iconColor}`} />
        <span className={`min-w-0 flex-1 text-[13px] font-semibold leading-snug ${tone.title} ${open ? '' : 'truncate'}`}>{insight.title}</span>
        <ConfidenceChip level={insight.confidence} />
        <ChevronDownIcon className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-3.5 pb-3.5 pl-[42px]">
          <p className="text-[12.5px] leading-relaxed text-slate-600">{insight.body}</p>
          {insight.evidence && (
            <p className="mt-1.5 font-mono text-[10.5px] leading-relaxed text-slate-400">{insight.evidence}</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function TrainingInsights({ insights = [], title = 'What your training says', defaultOpen = true }) {
  const [groupOpen, setGroupOpen] = useState(defaultOpen);
  const [openIds, setOpenIds] = useState(() => defaultOpenIds(insights));
  // New readings (a re-fetch) keep the same rule: warnings open, the rest folded.
  const ids = insights.map((i) => i.id).join('|');
  const [seen, setSeen] = useState(ids);
  if (seen !== ids) { setSeen(ids); setOpenIds(defaultOpenIds(insights)); }

  const counts = useMemo(() => {
    const c = { warn: 0, good: 0, other: 0 };
    insights.forEach((i) => { if (i.tone === 'warn') c.warn += 1; else if (i.tone === 'good') c.good += 1; else c.other += 1; });
    return c;
  }, [insights]);

  if (!insights.length) return null;
  const allOpen = insights.every((i) => openIds.has(i.id));
  const toggleAll = () => setOpenIds(allOpen ? new Set() : new Set(insights.map((i) => i.id)));
  const toggleOne = (id) => setOpenIds((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });

  return (
    <div className="rounded-2xl ring-1 ring-slate-200/70 bg-white">
      <div className="flex items-center gap-2 px-3.5 py-2.5">
        <button type="button" onClick={() => setGroupOpen((v) => !v)} aria-expanded={groupOpen} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <ChevronDownIcon className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${groupOpen ? 'rotate-180' : ''}`} />
          <h4 className="text-[13.5px] font-bold text-slate-900">{title}</h4>
          <span className="text-[11px] text-slate-400">· {insights.length}</span>
        </button>
        <div className="flex items-center gap-1.5">
          {counts.warn > 0 && <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${TONE.warn.chip}`}>{counts.warn} to watch</span>}
          {counts.good > 0 && <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${TONE.good.chip}`}>{counts.good} good</span>}
          {groupOpen && insights.length > 1 && (
            <button type="button" onClick={toggleAll} className="ml-1 text-[11px] font-semibold text-slate-500 hover:text-primary">
              {allOpen ? 'Collapse all' : 'Expand all'}
            </button>
          )}
        </div>
      </div>
      {groupOpen && (
        <div className="space-y-2 border-t border-slate-100 p-3">
          {insights.map((i) => (
            <InsightRow key={i.id} insight={i} open={openIds.has(i.id)} onToggle={() => toggleOne(i.id)} />
          ))}
        </div>
      )}
    </div>
  );
}
