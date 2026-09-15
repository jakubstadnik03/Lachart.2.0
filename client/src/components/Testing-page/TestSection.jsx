import React, { useState } from 'react';
import { ChevronDownIcon } from '@heroicons/react/24/outline';

/**
 * The card every block of the testing page sits in.
 *
 * The page grew one block at a time — a chart in a rounded-2xl with a heavy
 * shadow, a form in another with a border, a glassy zone generator, a plain
 * grey insights list — and read as five apps. One shell, the one the
 * dashboard and the planner already use: a white card with a hairline ring,
 * a header with an icon tile, a title and one line under it, the block's
 * own controls on the right, and a chevron when the block can fold away.
 *
 * Folding is remembered per block (localStorage), so a coach who never
 * reads the race predictor stops seeing it without losing it.
 */

const TINTS = {
  primary: 'bg-primary/10 text-primary',
  violet: 'bg-violet-100 text-violet-600',
  emerald: 'bg-emerald-100 text-emerald-600',
  sky: 'bg-sky-100 text-sky-600',
  amber: 'bg-amber-100 text-amber-600',
  rose: 'bg-rose-100 text-rose-600',
  slate: 'bg-slate-100 text-slate-600',
};

const KEY = (id) => `lachart_testing_section_${id}`;

export function useSectionOpen(id, defaultOpen = true) {
  const [open, setOpen] = useState(() => {
    if (!id) return defaultOpen;
    try {
      const v = localStorage.getItem(KEY(id));
      return v == null ? defaultOpen : v === '1';
    } catch {
      return defaultOpen;
    }
  });
  const toggle = () => setOpen((prev) => {
    const next = !prev;
    if (id) { try { localStorage.setItem(KEY(id), next ? '1' : '0'); } catch { /* private mode */ } }
    return next;
  });
  return [open, toggle];
}

export function SectionHeader({ icon: Icon, tint = 'primary', title, subtitle, meta, actions, open, onToggle, compact = false }) {
  const tintCls = TINTS[tint] || TINTS.primary;
  return (
    <div className={compact ? 'px-3 py-2.5' : 'px-4 py-3.5 sm:px-5'}>
      <div className="flex items-center gap-3">
        {Icon && (
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${tintCls}`}>
            <Icon className="h-4 w-4" />
          </span>
        )}
        <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <h3 className="text-[15px] font-bold leading-tight text-slate-900">{title}</h3>
          {meta && <span className="min-w-0 truncate text-[11px] text-slate-400">{meta}</span>}
        </div>
        {(actions || onToggle) && (
          <div className="flex shrink-0 items-center gap-1.5">
            {actions}
            {onToggle && (
              <button
                type="button"
                onClick={onToggle}
                aria-expanded={open}
                aria-label={open ? `Collapse ${title}` : `Expand ${title}`}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <ChevronDownIcon className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
              </button>
            )}
          </div>
        )}
      </div>
      {/* Under the title row rather than beside the controls, so a phone
          gets the full width for it instead of a five-line column. */}
      {subtitle && (
        <p className={`mt-0.5 text-[12.5px] leading-snug text-slate-500 ${Icon ? 'pl-11' : ''}`}>{subtitle}</p>
      )}
    </div>
  );
}

/**
 * `actions` sit in the header and never wrap — icons and one small control.
 * A block with a whole row of controls (the calculator: chart view, base
 * lactate, pin LT, email, PDF) passes them as `toolbar`, a strip under the
 * header that wraps on a phone. `flush` drops the body padding for blocks
 * that are a table edge to edge.
 */
export default function TestSection({
  id, icon, tint, title, subtitle, meta, actions, toolbar,
  collapsible = false, defaultOpen = true, flush = false,
  bodyClassName = '', className = '', children,
}) {
  const [open, toggle] = useSectionOpen(collapsible ? id : null, defaultOpen);
  const shown = collapsible ? open : true;
  return (
    <section className={`rounded-2xl bg-white ring-1 ring-slate-200/70 shadow-sm ${className}`} data-test-section={id || undefined}>
      <SectionHeader
        icon={icon} tint={tint} title={title} subtitle={subtitle} meta={meta} actions={actions}
        open={shown} onToggle={collapsible ? toggle : null}
      />
      {shown && toolbar && (
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 bg-slate-50/60 px-4 py-2 sm:px-5">
          {toolbar}
        </div>
      )}
      {shown && (
        <div className={`border-t border-slate-100 ${flush ? '' : 'px-4 py-4 sm:px-5'} ${bodyClassName}`}>
          {children}
        </div>
      )}
    </section>
  );
}
