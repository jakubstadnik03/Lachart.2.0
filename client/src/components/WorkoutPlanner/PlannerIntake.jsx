import React, { useMemo, useState } from 'react';
import SportIcon from '../shared/SportIcon';

/**
 * The few questions a block needs answered — with the answers already filled in.
 *
 * The planner used to build from constants: six weeks, eight hours, five
 * sessions, cycling. This asks instead, but it asks the way a coach who has
 * seen your last three months would: every field arrives carrying what you
 * have actually been doing, and the athlete's job is to correct it rather than
 * to remember it.
 *
 * Nothing is required. Someone who wants the same block as last time presses
 * the button.
 */

const SPORTS = [
  { id: 'bike', label: 'Bike' },
  { id: 'run', label: 'Run' },
  { id: 'swim', label: 'Swim' },
];

/** A starting point for a sport the athlete has no history in. */
const COLD_START = {
  bike: { hoursPerWeek: 4, sessionsPerWeek: 3 },
  run: { hoursPerWeek: 2.5, sessionsPerWeek: 3 },
  swim: { hoursPerWeek: 1.5, sessionsPerWeek: 2 },
};

function fromHistory(profile) {
  const bySport = new Map((profile?.sports || []).map((s) => [s.sport, s]));
  const suggested = new Set(profile?.suggestion?.sports || []);
  return SPORTS.map(({ id, label }) => {
    const h = bySport.get(id);
    return {
      sport: id,
      label,
      enabled: suggested.has(id),
      hoursPerWeek: h?.hoursPerWeek || COLD_START[id].hoursPerWeek,
      sessionsPerWeek: Math.max(1, Math.round(h?.sessionsPerWeek || COLD_START[id].sessionsPerWeek)),
      kmPerWeek: h?.kmPerWeek || 0,
      fromHistory: Boolean(h),
    };
  });
}

function Num({ value, onChange, step = 0.5, min = 0, max = 30, suffix, disabled }) {
  return (
    <div className={`flex items-center gap-1 ${disabled ? 'opacity-40' : ''}`}>
      <input
        type="number"
        value={value}
        step={step}
        min={min}
        max={max}
        disabled={disabled}
        onChange={(e) => onChange(Math.max(min, Math.min(max, Number(e.target.value) || 0)))}
        className="w-16 px-2 py-1 text-sm text-right border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
      />
      {suffix && <span className="text-xs text-gray-400 w-8">{suffix}</span>}
    </div>
  );
}

/**
 * @param {{
 *   profile: object|null,          from utils/trainingHistoryProfile
 *   startDate: Date|string,
 *   onBuild: (opts: object) => void,
 *   onCancel?: () => void,
 *   isMobile?: boolean,
 * }} props
 */
export default function PlannerIntake({ profile, startDate, onBuild, onCancel, isMobile = false }) {
  const [rows, setRows] = useState(() => fromHistory(profile));
  const [weeks, setWeeks] = useState(6);
  const [recoveryEvery, setRecoveryEvery] = useState(4);

  const enabled = rows.filter((r) => r.enabled && r.hoursPerWeek > 0);
  const totals = useMemo(() => ({
    hours: Math.round(enabled.reduce((n, r) => n + r.hoursPerWeek, 0) * 10) / 10,
    sessions: enabled.reduce((n, r) => n + r.sessionsPerWeek, 0),
  }), [enabled]);

  const patch = (sport, next) => setRows((prev) => prev.map((r) => (r.sport === sport ? { ...r, ...next } : r)));

  const build = () => {
    onBuild({
      startDate,
      weeks,
      recoveryEvery,
      sports: enabled.map((r) => ({
        sport: r.sport,
        hoursPerWeek: r.hoursPerWeek,
        sessionsPerWeek: r.sessionsPerWeek,
      })),
      name: `${weeks}-week block`,
    });
  };

  const pad = isMobile ? 'p-3' : 'p-4';

  return (
    <div className={`bg-white rounded-2xl border border-gray-200 ${pad}`}>
      <h3 className={`${isMobile ? 'text-base' : 'text-lg'} font-bold text-gray-900`}>Plan a block</h3>

      {profile ? (
        <p className="text-xs text-gray-500 mt-0.5">
          From your last {profile.weeksTrained} trained week{profile.weeksTrained === 1 ? '' : 's'}:{' '}
          <span className="font-semibold text-gray-700">{profile.perWeek.hours}h</span> and{' '}
          <span className="font-semibold text-gray-700">{profile.perWeek.sessions} sessions</span> a week,
          biggest week {profile.biggestWeekHours}h. Correct anything that looks wrong.
        </p>
      ) : (
        <p className="text-xs text-gray-500 mt-0.5">
          No training history to read yet, so these are starting points rather than your numbers.
        </p>
      )}

      {/* ── Sports ─────────────────────────────────────────────── */}
      <div className="mt-3 space-y-1.5">
        {rows.map((r) => (
          <div
            key={r.sport}
            className={`flex items-center gap-2 rounded-xl border px-2.5 py-2 ${
              r.enabled ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50'
            }`}
          >
            {/* The hint sits under the name rather than beside it: at phone
                width "you do 265 km/wk" was the first thing to be truncated,
                and it is the line that tells the athlete these numbers are
                theirs rather than invented. */}
            <label className="flex items-start gap-2 flex-1 min-w-0 cursor-pointer">
              <input
                type="checkbox"
                checked={r.enabled}
                onChange={(e) => patch(r.sport, { enabled: e.target.checked })}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-primary focus:ring-primary/40"
              />
              <SportIcon sport={r.sport} className="w-4 h-4 mt-0.5 shrink-0" />
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-gray-900 leading-tight">{r.label}</span>
                <span className="block text-[10px] text-gray-400 leading-tight">
                  {!r.fromHistory
                    ? 'no history'
                    : r.kmPerWeek > 0
                      ? `you do ${r.kmPerWeek} km/wk`
                      : `you do ${r.hoursPerWeek}h/wk`}
                </span>
              </span>
            </label>

            <Num
              value={r.hoursPerWeek}
              onChange={(v) => patch(r.sport, { hoursPerWeek: v })}
              disabled={!r.enabled}
              suffix="h/wk"
            />
            <Num
              value={r.sessionsPerWeek}
              onChange={(v) => patch(r.sport, { sessionsPerWeek: Math.round(v) })}
              step={1}
              min={1}
              max={7}
              disabled={!r.enabled}
              suffix="×/wk"
            />
          </div>
        ))}
      </div>

      {/* ── Block shape ────────────────────────────────────────── */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <label className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">Weeks</span>
          <Num value={weeks} onChange={(v) => setWeeks(Math.round(v))} step={1} min={1} max={24} />
        </label>
        <label className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">Recovery every</span>
          <Num value={recoveryEvery} onChange={(v) => setRecoveryEvery(Math.round(v))} step={1} min={0} max={8} />
          <span className="text-xs text-gray-400">{recoveryEvery === 0 ? 'never' : 'weeks'}</span>
        </label>
      </div>

      {/* ── What that adds up to ───────────────────────────────── */}
      <div className="mt-3 flex items-center justify-between gap-3 border-t border-gray-100 pt-3">
        <div className="text-xs text-gray-500">
          {enabled.length === 0 ? (
            <span className="text-amber-600">Pick at least one sport.</span>
          ) : (
            <>
              <span className="font-semibold text-gray-700">{totals.hours}h</span> and{' '}
              <span className="font-semibold text-gray-700">{totals.sessions} sessions</span> in a normal week
              {profile && totals.hours > profile.biggestWeekHours ? (
                <span className="text-amber-600">
                  {' '}— above your biggest week so far ({profile.biggestWeekHours}h)
                </span>
              ) : null}
            </>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="px-3 py-1.5 text-xs font-semibold text-gray-500 hover:text-gray-700"
            >
              Cancel
            </button>
          )}
          <button
            type="button"
            onClick={build}
            disabled={enabled.length === 0}
            className="px-4 py-2 rounded-xl text-sm font-semibold bg-primary text-white hover:bg-primary-dark disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Build the block
          </button>
        </div>
      </div>
    </div>
  );
}
