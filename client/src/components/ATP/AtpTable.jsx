/**
 * AtpTable — one row per week of the season, grouped by month.
 *
 * The three editable columns (period, weekly TSS, notes) are the plan; every
 * other column is derived from them and updates as soon as an edit is saved.
 * Edits commit on blur rather than on every keystroke, so typing "1560" does
 * not fire four saves and four re-projections of the rest of the season.
 *
 * Clearing the TSS box and leaving it empty is meaningful: it hands the week
 * back to the periodization pattern, which is how an athlete undoes a manual
 * number without having to remember what it used to be.
 */
import React, { useState, useMemo } from 'react';
import { PERIODS, PERIOD_META, periodLabel, PRIORITY_COLOR, suggestedWeekTss } from './atpPeriods';
import { groupRowsByMonth, formatWeekRange } from '../../utils/atpProjection';

const TH = 'px-2 py-2 text-[11px] font-semibold text-slate-500 whitespace-nowrap';
const TD = 'px-2 py-1.5 text-[12px] text-slate-700 whitespace-nowrap';

function RampCell({ value }) {
  if (value == null) return <span className="text-slate-300">—</span>;
  // Above about 7 CTL/week is where the injury risk starts climbing; TP flags
  // the same band. Below zero is a recovery week and wants no alarm at all.
  const tone = value > 8 ? 'text-red-600 font-bold'
    : value > 5 ? 'text-amber-600 font-semibold'
      : value < 0 ? 'text-slate-400'
        : 'text-slate-600';
  return <span className={`tabular-nums ${tone}`}>{value > 0 ? `+${value}` : value}</span>;
}

function TsbCell({ value, muted }) {
  if (value == null) return <span className="text-slate-300">—</span>;
  const tone = muted ? 'text-slate-400'
    : value < -30 ? 'text-red-600 font-semibold'
      : value > 15 ? 'text-emerald-600'
        : 'text-slate-600';
  return <span className={`tabular-nums ${tone}`}>{value > 0 ? `+${value}` : value}</span>;
}

function WeekRow({ row, peakWeeklyTss, onChange, editable, isEven }) {
  const [tssDraft, setTssDraft] = useState(null);
  const [notesDraft, setNotesDraft] = useState(null);

  const meta = row.period ? PERIOD_META[row.period] : null;
  const race = row.races[0];

  const commitTss = () => {
    if (tssDraft === null) return;
    const trimmed = String(tssDraft).trim();
    setTssDraft(null);
    if (trimmed === '') {
      // Empty means "back to the pattern" — send no targetTss and let the
      // server re-derive it from the period.
      onChange(row.weekStart, { period: row.period, targetTss: undefined });
      return;
    }
    const n = Number(trimmed);
    if (!Number.isFinite(n) || n < 0 || Math.round(n) === row.targetTss) return;
    onChange(row.weekStart, { targetTss: Math.round(n) });
  };

  const commitNotes = () => {
    if (notesDraft === null) return;
    const v = notesDraft;
    setNotesDraft(null);
    if (v === row.notes) return;
    onChange(row.weekStart, { notes: v });
  };

  const changePeriod = (period) => {
    const next = period || null;
    // A period change re-suggests the TSS unless the athlete had already
    // overridden it — an override is a deliberate number and survives.
    const wasAuto = row.targetTss === suggestedWeekTss(row.period, row.periodWeek, peakWeeklyTss);
    onChange(row.weekStart, wasAuto ? { period: next, targetTss: undefined } : { period: next });
  };

  const bg = row.isCurrent ? 'bg-blue-50' : isEven ? 'bg-white' : 'bg-slate-50/40';

  return (
    <tr className={`${bg} border-b border-slate-100 hover:bg-blue-50/50 transition-colors`}>
      <td className={`${TD} font-medium text-slate-600 sticky left-0 z-10 ${bg}`}>
        {formatWeekRange(row.weekStart, row.weekEnd)}
      </td>
      <td className={`${TD} text-center tabular-nums text-slate-500`}>
        {row.weeksToEvent == null ? '—' : row.weeksToEvent}
      </td>
      <td className={`${TD} max-w-[190px] truncate`} title={race?.name || ''}>
        {race ? race.name : ''}
      </td>
      <td className={`${TD} text-center`}>
        {race && (
          <span
            className="inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold text-white"
            style={{ backgroundColor: PRIORITY_COLOR[String(race.priority || 'A').toUpperCase()] }}
          >
            {String(race.priority || 'A').toUpperCase()}
          </span>
        )}
      </td>
      <td className="px-1 py-1">
        {editable ? (
          <select
            value={row.period || ''}
            onChange={(e) => changePeriod(e.target.value)}
            className="w-[132px] text-[11px] font-semibold rounded px-1.5 py-1 border-0 cursor-pointer focus:ring-2 focus:ring-primary/40 appearance-none"
            style={{
              backgroundColor: meta?.color || '#f1f5f9',
              color: meta?.text || '#64748b',
            }}
          >
            <option value="">—</option>
            {PERIODS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        ) : (
          <span
            className="inline-block w-[132px] text-[11px] font-semibold rounded px-1.5 py-1"
            style={{ backgroundColor: meta?.color || '#f1f5f9', color: meta?.text || '#64748b' }}
          >
            {periodLabel(row.period, row.periodWeek) || '—'}
          </span>
        )}
      </td>
      <td className={`${TD} text-right`}>
        {editable ? (
          <input
            type="number"
            min="0"
            step="10"
            value={tssDraft ?? (row.targetTss || '')}
            onChange={(e) => setTssDraft(e.target.value)}
            onBlur={commitTss}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
            className="w-[62px] text-right tabular-nums text-[12px] rounded border border-transparent hover:border-slate-300 focus:border-primary focus:ring-1 focus:ring-primary/30 px-1 py-0.5 bg-transparent"
          />
        ) : (
          <span className="tabular-nums">{row.targetTss || '—'}</span>
        )}
      </td>
      <td className={`${TD} text-right`}>
        {row.completedTss > 0
          ? <span className="tabular-nums font-semibold text-primary">{row.completedTss}</span>
          : row.plannedTss > 0
            ? <span className="tabular-nums text-slate-400" title="Scheduled, not done yet">{row.plannedTss}*</span>
            : <span className="text-slate-300">0</span>}
      </td>
      <td className={`${TD} text-center`}><RampCell value={row.atpRamp} /></td>
      <td className="px-1 py-1 min-w-[150px]">
        {editable ? (
          <input
            type="text"
            value={notesDraft ?? row.notes}
            placeholder="—"
            onChange={(e) => setNotesDraft(e.target.value)}
            onBlur={commitNotes}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
            className="w-full text-[11px] rounded border border-transparent hover:border-slate-300 focus:border-primary focus:ring-1 focus:ring-primary/30 px-1 py-0.5 bg-transparent placeholder:text-slate-300"
          />
        ) : (
          <span className="text-[11px] text-slate-500">{row.notes || ''}</span>
        )}
      </td>
      <td className={`${TD} text-center tabular-nums text-blue-500`}>{row.atpCtl}</td>
      <td className={`${TD} text-center tabular-nums font-semibold text-blue-700`}>{row.actualCtl}</td>
      <td className={`${TD} text-center`}><TsbCell value={row.atpTsb} muted /></td>
      <td className={`${TD} text-center`}><TsbCell value={row.actualTsb} /></td>
    </tr>
  );
}

export default function AtpTable({ rows = [], peakWeeklyTss = 700, onWeekChange, editable = true }) {
  const months = useMemo(() => groupRowsByMonth(rows), [rows]);

  if (!rows.length) {
    return <div className="py-10 text-center text-sm text-slate-400">This plan has no weeks yet.</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border-collapse">
        <thead className="sticky top-0 z-20 bg-slate-100">
          <tr>
            <th className={`${TH} text-left sticky left-0 z-30 bg-slate-100`}>Week</th>
            <th className={`${TH} text-center`}>Weeks to<br />Event</th>
            <th className={`${TH} text-left`}>Event</th>
            <th className={`${TH} text-center`}>Priority</th>
            <th className={`${TH} text-left`}>Period</th>
            <th className={`${TH} text-right`}>TSS</th>
            <th className={`${TH} text-right`}>Completed</th>
            <th className={`${TH} text-center`}>Ramp<br />Rate</th>
            <th className={`${TH} text-left`}>Details</th>
            <th className={`${TH} text-center text-blue-500`}>Fitness (CTL)<br />ATP</th>
            <th className={`${TH} text-center text-blue-700`}>Fitness (CTL)<br />Actual</th>
            <th className={`${TH} text-center text-amber-600`}>Form (TSB)<br />ATP</th>
            <th className={`${TH} text-center text-orange-600`}>Form (TSB)<br />Actual</th>
          </tr>
        </thead>
        <tbody>
          {months.map((m) => (
            <React.Fragment key={m.key}>
              <tr className="bg-slate-200/70">
                <td colSpan={13} className="px-2 py-1 text-[11px] font-bold text-slate-600 sticky left-0">
                  {m.label}
                </td>
              </tr>
              {m.rows.map((row, i) => (
                <WeekRow
                  key={row.weekStart}
                  row={row}
                  peakWeeklyTss={peakWeeklyTss}
                  onChange={onWeekChange}
                  editable={editable}
                  isEven={i % 2 === 0}
                />
              ))}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
