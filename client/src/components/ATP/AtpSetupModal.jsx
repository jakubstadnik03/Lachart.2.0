/**
 * AtpSetupModal — start a season, or change its bounds afterwards.
 *
 * The one number worth thinking about is the peak weekly TSS: every period
 * multiplier is a fraction of it, so it sets the ceiling of the whole year.
 * The suggestion below the field comes from what the athlete has actually
 * ridden, because a plan built on an aspirational number is a plan that gets
 * abandoned in March.
 */
import React, { useState, useMemo, useEffect } from 'react';
import Modal from '../Modal';

/** Monday of the week containing `date`, as YYYY-MM-DD. */
function mondayOf(date) {
  const d = date instanceof Date ? new Date(date) : new Date(`${date}T12:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addYears(dateStr, n) {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setFullYear(d.getFullYear() + n);
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const SPORTS = [
  { id: 'bike', label: 'Cycling' },
  { id: 'run', label: 'Running' },
  { id: 'triathlon', label: 'Triathlon' },
  { id: 'swim', label: 'Swimming' },
  { id: 'other', label: 'Other' },
];

export default function AtpSetupModal({
  isOpen,
  onClose,
  onSave,
  plan = null,
  suggestedPeakTss = null,
  saving = false,
}) {
  const defaultStart = useMemo(() => mondayOf(new Date()), []);
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(() => addYears(defaultStart, 1));
  const [peakWeeklyTss, setPeakWeeklyTss] = useState(700);
  const [sport, setSport] = useState('bike');
  const [autoPeriodize, setAutoPeriodize] = useState(true);
  const [error, setError] = useState(null);

  const isEdit = !!plan;

  useEffect(() => {
    if (!isOpen) return;
    if (plan) {
      setName(plan.name || '');
      setStartDate(plan.startDate);
      setEndDate(plan.endDate);
      setPeakWeeklyTss(plan.peakWeeklyTss || 700);
      setSport(plan.sport || 'bike');
    } else {
      const start = mondayOf(new Date());
      setName(`ATP ${new Date().getFullYear() + (new Date().getMonth() >= 9 ? 1 : 0)}`);
      setStartDate(start);
      setEndDate(addYears(start, 1));
      setPeakWeeklyTss(suggestedPeakTss || 700);
      setSport('bike');
      setAutoPeriodize(true);
    }
    setError(null);
  }, [isOpen, plan, suggestedPeakTss]);

  const weekCount = useMemo(() => {
    const a = new Date(`${mondayOf(startDate)}T12:00:00`);
    const b = new Date(`${endDate}T12:00:00`);
    if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0;
    return Math.max(0, Math.round((b - a) / (7 * 86400000)) + 1);
  }, [startDate, endDate]);

  const submit = async (e) => {
    e?.preventDefault();
    setError(null);
    if (!startDate || !endDate) return setError('Pick a start and end date.');
    if (endDate <= startDate) return setError('The season has to end after it starts.');
    if (weekCount > 200) return setError('That is more than four years — shorten the season.');
    try {
      await onSave({
        name: name.trim() || undefined,
        startDate: mondayOf(startDate),
        endDate,
        peakWeeklyTss: Number(peakWeeklyTss) || 700,
        sport,
        ...(isEdit ? {} : { autoPeriodize }),
      });
    } catch (err) {
      setError(err?.response?.data?.error || err.message || 'Could not save the plan.');
    }
    return undefined;
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isEdit ? 'Season settings' : 'New annual training plan'}>
      <form onSubmit={submit} className="p-4 space-y-4 max-w-md">
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Plan name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ATP 2026"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary/30"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Season starts</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary/30"
            />
            <p className="text-[10px] text-slate-400 mt-1">Snaps to the Monday of that week</p>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Season ends</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary/30"
            />
            <p className="text-[10px] text-slate-400 mt-1">{weekCount} weeks</p>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Peak weekly TSS</label>
          <input
            type="number"
            min="100"
            step="10"
            value={peakWeeklyTss}
            onChange={(e) => setPeakWeeklyTss(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums focus:border-primary focus:ring-1 focus:ring-primary/30"
          />
          <p className="text-[11px] text-slate-500 mt-1">
            The hardest week of the year. Every period scales off it — a Base 3 or Build week
            reaches it, a recovery week sits near 60%.
            {suggestedPeakTss > 0 && (
              <>
                {' '}
                <button
                  type="button"
                  onClick={() => setPeakWeeklyTss(suggestedPeakTss)}
                  className="text-primary font-semibold hover:underline"
                >
                  Use {suggestedPeakTss}
                </button>
                {' '}— your biggest week in the last year.
              </>
            )}
          </p>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Main sport</label>
          <select
            value={sport}
            onChange={(e) => setSport(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary/30"
          >
            {SPORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>

        {!isEdit && (
          <label className="flex items-start gap-2 cursor-pointer rounded-lg bg-slate-50 p-3">
            <input
              type="checkbox"
              checked={autoPeriodize}
              onChange={(e) => setAutoPeriodize(e.target.checked)}
              className="mt-0.5 rounded text-primary focus:ring-primary/30"
            />
            <span className="text-xs text-slate-600">
              <span className="font-semibold text-slate-700">Lay out the periods for me.</span>{' '}
              Builds base, build, peak and race blocks backwards from each A-priority race
              already on the calendar. Every week stays editable afterwards.
            </span>
          </label>
        )}

        {error && (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-800"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary-dark disabled:opacity-50"
          >
            {saving ? 'Saving…' : isEdit ? 'Save' : 'Create plan'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
