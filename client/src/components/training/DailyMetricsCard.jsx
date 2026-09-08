/**
 * DailyMetricsCard — what the athlete knows and the watch does not.
 *
 * Weight off a scale, the pulse taken before getting up, hours actually slept,
 * hours at work, steps, and how the day felt. A device can guess at some of
 * these and cannot see the rest, and the ones it guesses at it often gets
 * wrong — so this is stored apart from the sync and never overwritten by it.
 *
 * Every field is optional and saves on blur. A log that demands a full form
 * before it accepts anything is a log that stops being kept by Wednesday.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { getDailyMetrics, saveDailyMetric } from '../../services/api';
import { parseHoursToMinutes, formatMinutesAsClock } from '../../utils/dailyMetricsFormat';
import {
  Scale, HeartPulse, BedDouble, Briefcase, Footprints, Droplet,
  Laugh, Smile, Meh, BatteryLow, Frown,
} from 'lucide-react';

const FEELINGS = [
  { id: 'great', label: 'Great', Icon: Laugh },
  { id: 'good', label: 'Good', Icon: Smile },
  { id: 'ok', label: 'OK', Icon: Meh },
  // A flat battery says "tired" without needing a face for it.
  { id: 'tired', label: 'Tired', Icon: BatteryLow },
  { id: 'bad', label: 'Bad', Icon: Frown },
];

function Field({ label, unit, value, onCommit, placeholder, inputMode = 'decimal', width = 'w-24', Icon = null }) {
  const [draft, setDraft] = useState(null);
  const shown = draft ?? (value ?? '');
  return (
    <label className="flex flex-col gap-1 min-w-0">
      <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-gray-400">
        {Icon && <Icon className="h-3 w-3 flex-shrink-0" strokeWidth={2} aria-hidden="true" />}
        {label}
      </span>
      <span className="inline-flex items-baseline gap-1">
        <input
          type="text"
          inputMode={inputMode}
          value={shown}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => { if (draft !== null) { onCommit(draft); setDraft(null); } }}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
          className={`${width} rounded-lg border border-gray-200 px-2 py-1 text-sm font-semibold tabular-nums focus:border-primary focus:ring-1 focus:ring-primary/30`}
        />
        {unit && <span className="text-[11px] text-gray-400">{unit}</span>}
      </span>
    </label>
  );
}

export default function DailyMetricsCard({ date, athleteId = null, compact = false }) {
  const [entry, setEntry] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!date) return undefined;
    let cancelled = false;
    setLoading(true);
    getDailyMetrics(date, date, athleteId)
      .then((rows) => { if (!cancelled) setEntry(rows[0] || {}); })
      .catch(() => { if (!cancelled) setEntry({}); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [date, athleteId]);

  const save = useCallback(async (fields) => {
    setSaving(true);
    setError(null);
    // Paint first: a number that vanishes while the request is in flight reads
    // as "it did not take".
    setEntry((prev) => ({ ...prev, ...fields }));
    try {
      const saved = await saveDailyMetric(date, fields, athleteId);
      setEntry(saved);
    } catch (e) {
      setError('Could not save — check your connection.');
    } finally {
      setSaving(false);
    }
  }, [date, athleteId]);

  const num = (raw, { round = false } = {}) => {
    const s = String(raw ?? '').trim();
    if (!s) return null;
    const n = Number(s.replace(',', '.'));
    if (!Number.isFinite(n)) return undefined; // undefined = don't send
    return round ? Math.round(n) : n;
  };

  const commit = (key, parsed) => {
    if (parsed === undefined) return;
    if (parsed === (entry?.[key] ?? null)) return;
    save({ [key]: parsed });
  };

  const feeling = entry?.feeling ?? null;

  const summary = useMemo(() => {
    if (!entry) return null;
    const bits = [];
    if (entry.weightKg) bits.push(`${entry.weightKg} kg`);
    if (entry.morningPulse) bits.push(`${entry.morningPulse} bpm`);
    if (entry.sleepMinutes) bits.push(`${formatMinutesAsClock(entry.sleepMinutes)} sleep`);
    if (entry.steps) bits.push(`${Number(entry.steps).toLocaleString('en-US')} steps`);
    return bits.join(' · ');
  }, [entry]);

  if (loading) {
    return <div className="rounded-xl bg-gray-50 p-4 text-xs text-gray-400">Loading your day…</div>;
  }

  return (
    <div className="rounded-xl bg-gray-50 p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <span className="text-xs font-bold uppercase tracking-wide text-gray-500">Daily metrics</span>
        <span className="text-[11px] text-gray-400">
          {saving ? 'Saving…' : (error || summary || 'Nothing logged yet')}
        </span>
      </div>

      <div className={`grid gap-3 ${compact ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3'}`}>
        <Field
          label="Weight" Icon={Scale} unit="kg" placeholder="70.5"
          value={entry?.weightKg ?? ''}
          onCommit={(v) => commit('weightKg', num(v))}
        />
        <Field
          label="Morning pulse" Icon={HeartPulse} unit="bpm" placeholder="45" inputMode="numeric"
          value={entry?.morningPulse ?? ''}
          onCommit={(v) => commit('morningPulse', num(v, { round: true }))}
        />
        <Field
          label="Sleep" Icon={BedDouble} unit="h" placeholder="8:15"
          value={formatMinutesAsClock(entry?.sleepMinutes)}
          onCommit={(v) => {
            const mins = String(v).trim() === '' ? null : parseHoursToMinutes(v);
            commit('sleepMinutes', mins === null && String(v).trim() !== '' ? undefined : mins);
          }}
        />
        <Field
          label="Work" Icon={Briefcase} unit="h" placeholder="7:15"
          value={formatMinutesAsClock(entry?.workMinutes)}
          onCommit={(v) => {
            const mins = String(v).trim() === '' ? null : parseHoursToMinutes(v);
            commit('workMinutes', mins === null && String(v).trim() !== '' ? undefined : mins);
          }}
        />
        <Field
          label="Steps" Icon={Footprints} unit="" placeholder="10550" inputMode="numeric" width="w-28"
          value={entry?.steps ?? ''}
          onCommit={(v) => commit('steps', num(v, { round: true }))}
        />
        <Field
          label="Cycle day" Icon={Droplet} unit="" placeholder="—" inputMode="numeric" width="w-16"
          value={entry?.cycleDay ?? ''}
          onCommit={(v) => commit('cycleDay', num(v, { round: true }))}
        />
      </div>

      <div className="mt-3">
        <span className="text-[10px] font-bold uppercase tracking-wide text-gray-400">General feeling</span>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {FEELINGS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => save({ feeling: feeling === f.id ? null : f.id })}
              className={`rounded-lg px-2 py-1 text-[12px] font-semibold transition-colors ${
                feeling === f.id
                  ? 'bg-primary text-white'
                  : 'bg-white text-gray-500 hover:bg-gray-100'
              }`}
            >
              <f.Icon className="mr-1 inline h-3.5 w-3.5 align-[-2px]" strokeWidth={2} aria-hidden="true" />
              {f.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
