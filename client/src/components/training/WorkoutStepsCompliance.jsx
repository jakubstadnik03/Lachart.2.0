/**
 * WorkoutStepsCompliance — the prescription, step by step, with what each
 * step was actually ridden at.
 *
 * A planned session already knows what it asked for: thirty minutes easy,
 * then eight by three at 350–370 W. Until now the athlete could read that in
 * the planner and read the trace in the analysis, and had to hold one in
 * their head while looking at the other. This puts the answer on the same
 * line as the question — target, actual, and whether it landed.
 *
 * ── How a step is matched to what happened ──
 * By elapsed time from the start of the recording. The plan is a timeline and
 * so is the file, so step three covers the seconds the plan says it covers.
 * That is exact when the session is ridden as written and drifts when it is
 * not — an athlete who warms up five minutes longer shifts every step after
 * it. There is no honest way around that without asking the athlete to press
 * lap, so the panel says plainly that it averages the planned window and does
 * not pretend to have found the interval.
 */

import React, { useMemo } from 'react';
import {
  expandSteps, resolveTargetWatts, resolveTargetPace, resolveTargetSwimPace,
} from '../WorkoutPlanner/WorkoutBuilder';

const STEP_META = {
  warmup: { label: 'Warm-up', color: '#16a34a', bg: '#dcfce7' },
  work: { label: 'Work', color: '#dc2626', bg: '#fee2e2' },
  recovery: { label: 'Recovery', color: '#d97706', bg: '#fef3c7' },
  cooldown: { label: 'Cool-down', color: '#0284c7', bg: '#e0f2fe' },
  rest: { label: 'Rest', color: '#64748b', bg: '#f1f5f9' },
};

const fmtClock = (s) => {
  const t = Math.max(0, Math.round(s || 0));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = t % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    : `${m}:${String(sec).padStart(2, '0')}`;
};

/** Pace in sec/km as m:ss. */
const fmtPace = (secPerKm) => {
  if (!(secPerKm > 0) || !Number.isFinite(secPerKm)) return null;
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
};

const sportKind = (sport) => {
  const s = String(sport || '').toLowerCase();
  if (s.includes('swim')) return 'swim';
  if (s.includes('run') || s.includes('walk') || s.includes('hike')) return 'run';
  return 'bike';
};

/**
 * The target band for one step, in the unit the session is measured in.
 *
 * A step can name a range (350–370 W) or a single number. A single number is
 * given a ±4% band, because "@ 300 W" was never a demand for exactly 300 —
 * grading it as a miss at 298 would make the panel useless.
 */
function targetBand(step, kind, context) {
  const t = step?.powerTarget;
  if (!t || t.type === 'open' || !context) return null;

  if (kind === 'bike') {
    const mid = resolveTargetWatts(t, context);
    if (!(mid > 0)) return null;
    if (t.useRange && t.rangeMin != null && t.rangeMax != null && t.type === 'watts') {
      return { lo: t.rangeMin, hi: t.rangeMax, mid, unit: 'W', fmt: (v) => `${Math.round(v)}` };
    }
    if (t.useRange && t.rangeMin != null && t.rangeMax != null) {
      // A percentage range resolves through the same rule as its midpoint.
      const lo = resolveTargetWatts({ ...t, useRange: false, value: t.rangeMin, override: undefined }, context);
      const hi = resolveTargetWatts({ ...t, useRange: false, value: t.rangeMax, override: undefined }, context);
      if (lo > 0 && hi > 0) return { lo, hi, mid, unit: 'W', fmt: (v) => `${Math.round(v)}` };
    }
    return { lo: mid * 0.96, hi: mid * 1.04, mid, unit: 'W', fmt: (v) => `${Math.round(v)}` };
  }

  // Pace, where a lower number is the harder end — the band is inverted.
  const resolve = kind === 'swim' ? resolveTargetSwimPace : resolveTargetPace;
  const mid = resolve(t, context);
  if (!(mid > 0)) return null;
  const unit = kind === 'swim' ? '/100m' : '/km';
  return { lo: mid * 0.96, hi: mid * 1.04, mid, unit, lowerIsHarder: true, fmt: (v) => fmtPace(v) };
}

/** Seconds each record covers, ignoring pauses. */
function recordSeconds(rec, prev) {
  if (prev?.timestamp && rec?.timestamp) {
    const gap = (new Date(rec.timestamp).getTime() - new Date(prev.timestamp).getTime()) / 1000;
    if (gap > 0 && gap <= 30) return gap;
  }
  return 1;
}

/**
 * Average of one channel over an elapsed-time window of the recording.
 * Returns null when the window falls outside the file — a session cut short
 * has no answer for its last steps, and saying so beats inventing one.
 */
function windowAverage(records, fromSec, toSec, read) {
  let elapsed = 0, sum = 0, weight = 0;
  for (let i = 0; i < records.length; i++) {
    const dt = recordSeconds(records[i], records[i - 1]);
    const start = elapsed;
    elapsed += dt;
    if (elapsed <= fromSec) continue;
    if (start >= toSec) break;
    const v = read(records[i]);
    if (Number.isFinite(v) && v > 0) { sum += v * dt; weight += dt; }
  }
  return weight > 0 ? sum / weight : null;
}

const readPower = (r) => Number(r?.power ?? r?.watts);
const readSpeed = (r) => Number(r?.speed ?? r?.velocity ?? r?.enhancedSpeed);

/**
 * The plan as a list of rows: one per step, with repeat groups kept whole so
 * eight reps read as "×8" rather than sixteen near-identical lines.
 */
function buildRows(steps) {
  const rows = [];
  const seen = new Set();
  let clock = 0;

  for (const s of steps) {
    if (!s.groupId) {
      const dur = s.durationSeconds || 0;
      rows.push({ kind: 'step', steps: [{ step: s, from: clock, to: clock + dur }], reps: 1 });
      clock += dur;
      continue;
    }
    if (seen.has(s.groupId)) continue;
    seen.add(s.groupId);
    const group = steps.filter(x => x.groupId === s.groupId);
    const header = group.find(x => x.isGroupHeader) || group[0];
    const reps = header.groupRepeat || 1;
    // Each member of the group gets every one of its repeats' windows, so the
    // average below is the average across the reps and not just the first.
    const members = group.map(g => ({ step: g, windows: [] }));
    for (let r = 0; r < reps; r++) {
      for (const m of members) {
        const dur = m.step.durationSeconds || 0;
        m.windows.push([clock, clock + dur]);
        clock += dur;
      }
    }
    rows.push({ kind: 'group', reps, members });
  }
  return rows;
}

export default function WorkoutStepsCompliance({ steps, records, sport, context, className = '' }) {
  const kind = sportKind(sport);
  const rows = useMemo(() => (Array.isArray(steps) && steps.length ? buildRows(steps) : []), [steps]);

  const totalPlanned = useMemo(
    () => expandSteps(steps || []).reduce((sum, s) => sum + (s.durationSeconds || 0), 0),
    [steps],
  );

  const hasRecords = Array.isArray(records) && records.length > 20;

  /** The channel the session is graded on, and how to read it from a record. */
  const read = kind === 'bike'
    ? readPower
    // Pace is the inverse of speed, and the band is in sec/km (or /100m).
    : (r) => { const v = readSpeed(r); return v > 0 ? (kind === 'swim' ? 100 / v : 1000 / v) : 0; };

  if (!rows.length) return null;

  const actualFor = (windows) => {
    if (!hasRecords) return null;
    let sum = 0, n = 0;
    for (const [from, to] of windows) {
      const avg = windowAverage(records, from, to, read);
      if (avg != null) { sum += avg * (to - from); n += (to - from); }
    }
    return n > 0 ? sum / n : null;
  };

  const verdict = (band, actual) => {
    if (!band || actual == null) return null;
    const under = band.lowerIsHarder ? actual > band.hi : actual < band.lo;
    const over = band.lowerIsHarder ? actual < band.lo : actual > band.hi;
    if (under) return { key: 'under', label: 'under', color: '#0284c7' };
    if (over) return { key: 'over', label: 'over', color: '#d97706' };
    return { key: 'in', label: 'on target', color: '#16a34a' };
  };

  const renderStep = (step, windows, repeated) => {
    const meta = STEP_META[step.stepType] || STEP_META.work;
    const band = targetBand(step, kind, context);
    const actual = actualFor(windows);
    const v = verdict(band, actual);
    const unit = band?.unit || (kind === 'bike' ? 'W' : kind === 'swim' ? '/100m' : '/km');
    const fmtValue = band?.fmt || (kind === 'bike' ? (x) => `${Math.round(x)}` : fmtPace);

    return (
      <div key={step.clientId || `${step.stepType}-${windows[0]?.[0]}`} className="flex items-center gap-2 py-1.5">
        <div
          className="w-[74px] flex-shrink-0 rounded-md px-1.5 py-1 text-center"
          style={{ backgroundColor: meta.bg }}
        >
          <div className="text-[9px] font-bold uppercase tracking-wide leading-none" style={{ color: meta.color }}>
            {meta.label}
          </div>
          <div className="text-[11px] font-bold tabular-nums leading-tight mt-0.5" style={{ color: meta.color }}>
            {step.durationType === 'distance' && step.distanceMeters
              ? `${step.distanceMeters >= 1000 ? `${(step.distanceMeters / 1000).toFixed(step.distanceMeters % 1000 ? 1 : 0)}k` : `${step.distanceMeters}m`}`
              : fmtClock(step.durationSeconds)}
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="text-[11px] text-gray-500 tabular-nums truncate">
            {band
              ? `@ ${fmtValue(band.lo)}–${fmtValue(band.hi)} ${unit}`
              : <span className="text-gray-300">no target</span>}
          </div>
          {actual != null && (
            <div className="flex items-baseline gap-1.5">
              <span className="text-[13px] font-bold tabular-nums" style={{ color: v ? v.color : '#374151' }}>
                {fmtValue(actual)} <span className="text-[10px] font-semibold">{unit}</span>
              </span>
              {v && (
                <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: v.color }}>
                  {v.label}
                </span>
              )}
              {repeated > 1 && <span className="text-[10px] text-gray-400">avg of {repeated}</span>}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className={className}>
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Steps</span>
        <span className="text-[11px] text-gray-400 tabular-nums">{fmtClock(totalPlanned)} planned</span>
      </div>

      {!hasRecords && (
        <div className="text-[11px] text-gray-400 mb-2">
          No trace for this session — targets only.
        </div>
      )}

      <div className="rounded-xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
        {rows.map((row, i) => (
          <div key={i} className="flex items-stretch gap-2 px-2 py-1">
            <div className="w-[38px] flex-shrink-0 flex items-center justify-center">
              <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wide text-center leading-tight">
                {row.kind === 'group' ? <>Reps<br />×{row.reps}</> : 'Step'}
              </span>
            </div>
            <div className="flex-1 min-w-0 divide-y divide-gray-50">
              {row.kind === 'step'
                ? renderStep(row.steps[0].step, [[row.steps[0].from, row.steps[0].to]], 1)
                : row.members.map(m => renderStep(m.step, m.windows, row.reps))}
            </div>
          </div>
        ))}
      </div>

      {hasRecords && (
        <p className="text-[10px] text-gray-400 mt-2 leading-snug">
          Each step is averaged over the window the plan puts it in, measured
          from the start of the recording.
        </p>
      )}
    </div>
  );
}
