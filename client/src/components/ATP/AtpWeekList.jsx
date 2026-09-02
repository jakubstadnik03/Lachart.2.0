/**
 * AtpWeekList — the season on a phone.
 *
 * The table is nineteen columns wide. Nothing shrinks that into 375 pixels,
 * and a horizontally scrolled spreadsheet is not a plan anyone reads on a
 * phone — so the same rows become cards, one per week, showing what the week
 * is and what it asks for, with the projection kept to a single quiet line.
 *
 * Everything the table lets a coach edit is editable here too: the period, the
 * TSS, the per-sport targets and the note. A plan you can only read on the
 * device you actually have with you is half a plan.
 */

import React, { useMemo, useState } from 'react';
import { PERIODS, PERIOD_META, periodLabel, PRIORITY_COLOR, suggestedWeekTss } from './atpPeriods';
import { groupRowsByMonth, formatWeekRange } from '../../utils/atpProjection';

const SPORTS = [
  { key: 'bike', label: 'Bike', color: '#767EB5' },
  { key: 'run', label: 'Run', color: '#f97316' },
  { key: 'swim', label: 'Swim', color: '#599FD0' },
  { key: 'strength', label: 'Strength', color: '#8b5cf6' },
];

const fmtHours = (sec) => {
  if (!(sec > 0)) return null;
  const total = Math.round(sec / 60);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

/** One number the coach types: the sport's target for the week. */
function TargetInput({ value, onCommit, suffix }) {
  const [draft, setDraft] = useState(null);
  const commit = () => {
    if (draft === null) return;
    const trimmed = String(draft).trim();
    setDraft(null);
    if (trimmed === '') { if (value != null) onCommit(null); return; }
    const n = Number(trimmed.replace(',', '.'));
    if (!Number.isFinite(n) || n < 0 || n === value) return;
    onCommit(n);
  };
  return (
    <span className="inline-flex items-baseline gap-0.5">
      <input
        type="text"
        inputMode="decimal"
        value={draft ?? (value ?? '')}
        placeholder="—"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
        className="w-[46px] text-right tabular-nums text-[13px] rounded-md border border-slate-200 focus:border-primary focus:ring-1 focus:ring-primary/30 px-1 py-0.5 bg-white placeholder:text-slate-300"
        style={{ touchAction: 'manipulation' }}
      />
      {suffix && <span className="text-[10px] text-slate-400">{suffix}</span>}
    </span>
  );
}

function WeekCard({ row, peakWeeklyTss, unit, editable, onChange, onOpenTest, onPlanTest }) {
  const [tssDraft, setTssDraft] = useState(null);
  const [noteDraft, setNoteDraft] = useState(null);
  const meta = row.period ? PERIOD_META[row.period] : null;
  const race = row.races?.[0];

  const commitTss = () => {
    if (tssDraft === null) return;
    const trimmed = String(tssDraft).trim();
    setTssDraft(null);
    if (trimmed === '') { onChange(row.weekStart, { period: row.period, targetTss: undefined }); return; }
    const n = Number(trimmed);
    if (!Number.isFinite(n) || n < 0 || Math.round(n) === row.targetTss) return;
    onChange(row.weekStart, { targetTss: Math.round(n) });
  };

  const changePeriod = (period) => {
    const next = period || null;
    const wasAuto = row.targetTss === suggestedWeekTss(row.period, row.periodWeek, peakWeeklyTss);
    onChange(row.weekStart, wasAuto ? { period: next, targetTss: undefined } : { period: next });
  };

  const targets = (unit === 'km' ? row.sportKm : row.sportHours) || {};
  // A sport earns a line by being trained or being planned for. Four rows of
  // dashes on every card is how a season becomes unreadable on a phone.
  const sportRows = SPORTS.filter((s) => {
    const t = row.sports?.[s.key];
    return (t?.sec > 0) || (t?.dist > 0) || targets[s.key] != null;
  });

  const done = (s) => (unit === 'km'
    ? (row.sports?.[s.key]?.dist > 0 ? ((row.sports[s.key].dist) / 1000).toFixed(1) : null)
    : fmtHours(row.sports?.[s.key]?.sec));

  return (
    <div
      className={`rounded-xl border p-3 flex flex-col gap-2 ${
        row.isCurrent ? 'border-primary/40 bg-primary/5' : 'border-slate-200 bg-white'
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="text-[13px] font-bold text-slate-700 flex-1 min-w-0 truncate">
          {formatWeekRange(row.weekStart, row.weekEnd)}
        </span>
        {row.isCurrent && (
          <span className="text-[9px] font-bold uppercase tracking-wide text-primary">this week</span>
        )}
        {editable ? (
          <select
            value={row.period || ''}
            onChange={(e) => changePeriod(e.target.value)}
            className="text-[11px] font-semibold rounded-md px-2 py-1 border-0 appearance-none"
            style={{ backgroundColor: meta?.color || '#f1f5f9', color: meta?.text || '#64748b' }}
          >
            <option value="">—</option>
            {PERIODS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        ) : (
          <span
            className="text-[11px] font-semibold rounded-md px-2 py-1"
            style={{ backgroundColor: meta?.color || '#f1f5f9', color: meta?.text || '#64748b' }}
          >
            {periodLabel(row.period, row.periodWeek) || '—'}
          </span>
        )}
      </div>

      {race && (
        <div className="flex items-center gap-1.5">
          <span
            className="inline-flex items-center justify-center w-4 h-4 rounded text-[9px] font-bold text-white flex-shrink-0"
            style={{ backgroundColor: PRIORITY_COLOR[String(race.priority || 'A').toUpperCase()] }}
          >
            {String(race.priority || 'A').toUpperCase()}
          </span>
          <span className="text-[12px] font-semibold text-slate-700 truncate">{race.name}</span>
        </div>
      )}

      <div className="flex items-center gap-2 text-[13px]">
        <span className="text-[11px] text-slate-400 w-[54px] flex-shrink-0">TSS</span>
        <span className="font-bold text-primary tabular-nums">
          {row.completedTss > 0 ? row.completedTss : row.plannedTss > 0 ? `${row.plannedTss}*` : 0}
        </span>
        <span className="text-slate-300">/</span>
        {editable ? (
          <input
            type="number"
            inputMode="numeric"
            value={tssDraft ?? (row.targetTss || '')}
            onChange={(e) => setTssDraft(e.target.value)}
            onBlur={commitTss}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
            className="w-[62px] text-right tabular-nums text-[13px] rounded-md border border-slate-200 focus:border-primary focus:ring-1 focus:ring-primary/30 px-1 py-0.5"
            style={{ touchAction: 'manipulation' }}
          />
        ) : (
          <span className="tabular-nums text-slate-500">{row.targetTss || '—'}</span>
        )}
        <span className="ml-auto text-[11px] tabular-nums text-slate-400">
          CTL {row.actualCtl} · TSB {row.actualTsb > 0 ? `+${row.actualTsb}` : row.actualTsb}
        </span>
      </div>

      {sportRows.map((s) => (
        <div key={s.key} className="flex items-center gap-2 text-[13px]">
          <span className="text-[11px] w-[54px] flex-shrink-0 font-semibold" style={{ color: s.color }}>
            {s.label}
          </span>
          <span className="tabular-nums font-semibold text-slate-700">{done(s) || '—'}</span>
          <span className="text-slate-300">/</span>
          {editable ? (
            <TargetInput
              value={targets[s.key] ?? null}
              suffix={unit === 'km' ? 'km' : 'h'}
              onCommit={(v) => onChange(row.weekStart, {
                [unit === 'km' ? 'sportKm' : 'sportHours']: { ...targets, [s.key]: v },
              })}
            />
          ) : (
            <span className="tabular-nums text-slate-500">{targets[s.key] ?? '—'}</span>
          )}
        </div>
      ))}

      {(row.tests?.length > 0 || (editable && onPlanTest && !row.isPast)) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {(row.tests || []).map((t) => (
            <button
              key={`${t.done ? 'd' : 'p'}-${t.id}`}
              type="button"
              onClick={onOpenTest ? () => onOpenTest(t) : undefined}
              className="text-left text-[11px] font-semibold rounded-md px-2 py-1 leading-tight max-w-full"
              style={t.done
                ? { backgroundColor: '#fee2e2', color: '#b91c1c' }
                : { backgroundColor: '#f1f5f9', color: '#64748b', border: '1px dashed #cbd5e1' }}
            >
              <span className="block truncate">{t.title}</span>
              {t.result && <span className="block text-[10px] font-bold tabular-nums opacity-80">{t.result}</span>}
              {t.zones === 'in-use' && <span className="block text-[9px] font-bold uppercase text-emerald-600">zones in use</span>}
              {t.zones === 'not-applied' && <span className="block text-[9px] font-bold uppercase text-amber-600">zones not applied</span>}
            </button>
          ))}
          {editable && onPlanTest && !row.isPast && !row.tests?.length && (
            <button
              type="button"
              onClick={() => onPlanTest(row)}
              className="text-[11px] font-semibold text-slate-400 px-2 py-1 rounded-md border border-dashed border-slate-300"
            >
              + test
            </button>
          )}
        </div>
      )}

      {editable ? (
        <input
          type="text"
          value={noteDraft ?? row.notes}
          placeholder="Focus for the week…"
          onChange={(e) => setNoteDraft(e.target.value)}
          onBlur={() => {
            if (noteDraft === null) return;
            const v = noteDraft;
            setNoteDraft(null);
            if (v !== row.notes) onChange(row.weekStart, { notes: v });
          }}
          className="w-full text-[12px] rounded-md border border-transparent focus:border-primary focus:ring-1 focus:ring-primary/30 px-1 py-0.5 bg-transparent placeholder:text-slate-300"
        />
      ) : row.notes ? (
        <p className="text-[12px] text-slate-500">{row.notes}</p>
      ) : null}
    </div>
  );
}

export default function AtpWeekList({
  rows = [],
  peakWeeklyTss = 700,
  onWeekChange,
  editable = true,
  onOpenTest = null,
  onPlanTest = null,
  unit = 'hours',
}) {
  const months = useMemo(() => groupRowsByMonth(rows), [rows]);
  if (!rows.length) {
    return <div className="py-10 text-center text-sm text-slate-400">This plan has no weeks yet.</div>;
  }
  return (
    <div className="flex flex-col gap-3 p-3">
      {months.map((m) => (
        <React.Fragment key={m.key}>
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wide pt-1">{m.label}</div>
          {m.rows.map((row) => (
            <WeekCard
              key={row.weekStart}
              row={row}
              peakWeeklyTss={peakWeeklyTss}
              unit={unit}
              editable={editable}
              onChange={onWeekChange}
              onOpenTest={onOpenTest}
              onPlanTest={onPlanTest}
            />
          ))}
        </React.Fragment>
      ))}
    </div>
  );
}
