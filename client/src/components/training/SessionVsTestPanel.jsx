/**
 * This session, read against the lactate test.
 *
 * The test is the athlete's reference physiology and it is the thing LaChart
 * knows that nothing else does. Everything here answers one question — does
 * today still fit the curve we drew on test day? — in three layers, each
 * needing less than the one below it:
 *
 *   1. ZONES.   Any session with a heart rate can be put on the test's own
 *      axes: where the effort sat, and where the heart went with it. This
 *      shows for almost everything, including intervals.
 *   2. LACTATE. When laps carry blood values, they are compared with the test
 *      curve directly. This is the strongest read in the app and the only one
 *      not inferred — see lactateCurveShift().
 *   3. DRIFT.   When the session held enough steady work, the HR-demand line
 *      is fitted and the threshold re-estimated from it.
 *
 * The old version of this panel showed layer 3 or nothing, which meant nothing
 * on 78 of 80 real sessions — interval days and stop-start outdoor rides never
 * hold a plateau. A panel that is blank four times out of five teaches athletes
 * to stop looking at it.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  CartesianGrid, ComposedChart, Line, ReferenceArea, ReferenceLine,
  ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis,
} from 'recharts';
import api, { getActivityWeather, getThresholdDrift, updateUserProfile } from '../../services/api';
import {
  analyseSession, compareToTestCurve, lactateCurveShift, shiftedLactateCurve,
  sportKind, testHrSlope, testLactateCurve, thresholdToDemand, zoneAdviceFor,
  zoneAgreement,
} from '../../utils/hrPowerProfile';
import { extractLactateThresholds } from '../../utils/extractLactateThresholds';
import { ltZoneBounds, ltZones, measuredMaxHr } from '../../utils/trainingZoneBounds';

const TEST_COLOR = '#94a3b8';
const NOW_COLOR = '#7c3aed';
const LACTATE_COLOR = '#db2777';

/** Same palette as the time-in-zones bar, so a zone is one colour everywhere. */
const ZONES = [
  { id: 'Z1', label: 'Recovery', color: '#60a5fa' },
  { id: 'Z2', label: 'Endurance', color: '#34d399' },
  { id: 'Z3', label: 'Tempo', color: '#fbbf24' },
  { id: 'Z4', label: 'Threshold', color: '#f97316' },
  { id: 'Z5', label: 'VO₂max', color: '#ef4444' },
];

/**
 * Scatter points, sized here rather than by a ZAxis.
 *
 * Recharts derives a symbol's size from the z scale, and a ZAxis with no
 * dataKey resolves every point to zero — the symbols render, in the right
 * place, with the right colour, as paths of `M0,0`. Nothing is visibly wrong
 * except that the chart is empty, which is a bad way to find out.
 */
function Dot({ cx, cy, r, color, opacity }) {
  if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null;
  return <circle cx={cx} cy={cy} r={r} fill={color} fillOpacity={opacity} />;
}

const CONFIDENCE_UI = {
  high: { label: 'Solid read', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  medium: { label: 'Indicative', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  low: { label: 'Rough', cls: 'bg-gray-100 text-gray-500 border-gray-200' },
};

const DRIFT_REASONS = {
  'not-enough-steady-state': 'Not enough steady riding to re-estimate your threshold — that needs '
    + 'roughly 10 minutes held near endurance pace or above.',
  'fit-failed': 'The steady segments did not form a usable line.',
  'implausible-shift': 'The threshold this session implied is too large a change to be real — usually '
    + 'a miscalibrated treadmill or a strap dropping out.',
  'implausible-drift': 'Heart rate climbed far faster than a steady session allows, so the fit is '
    + 'reading something other than effort.',
};

// ── Formatting ─────────────────────────────────────────────────────────────

function fmtPaceSec(sec) {
  if (!Number.isFinite(sec) || sec <= 0) return '—';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function fmtDemand(demand, kind, storageMode) {
  if (!Number.isFinite(demand) || demand <= 0) return '—';
  if (kind === 'bike') return `${Math.round(demand)} W`;
  if (storageMode === 'speed') return `${(demand * 3.6).toFixed(1)} km/h`;
  return `${fmtPaceSec(1000 / demand)}/km`;
}

/** A signed change in demand, printed the way the sport talks about it. */
function fmtDemandDelta(delta, demandNow, kind, storageMode) {
  if (!Number.isFinite(delta)) return '—';
  if (kind === 'bike') return `${delta > 0 ? '+' : ''}${Math.round(delta)} W`;
  if (storageMode === 'speed') return `${delta > 0 ? '+' : ''}${(delta * 3.6).toFixed(1)} km/h`;
  // Pace: express the change in seconds per km, where faster is a bigger number.
  const before = 1000 / (demandNow - delta);
  const after = 1000 / demandNow;
  const secs = Math.round(before - after);
  return `${secs > 0 ? '+' : ''}${secs} s/km`;
}

function axisTick(demand, kind, storageMode) {
  if (kind === 'bike') return Math.round(demand);
  if (storageMode === 'speed') return (demand * 3.6).toFixed(1);
  return fmtPaceSec(1000 / demand);
}

// ── Lactate samples off the session's laps ─────────────────────────────────

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Blood values recorded against laps of this session, paired with the intensity
 * of the lap they were taken on.
 *
 * Running uses raw lap speed rather than the grade-adjusted demand the drift
 * fit works in: a lap average has no per-sample gradient to correct with. On a
 * hilly run that makes the comparison optimistic, which is why the panel says
 * so rather than quietly folding it into the verdict.
 */
function lactateSamplesFromLaps(laps, kind) {
  if (!Array.isArray(laps)) return [];
  return laps
    .map((lap, i) => {
      const lactate = num(lap?.lactate);
      if (!lactate) return null;
      const demand = kind === 'bike'
        ? num(lap.average_watts ?? lap.avgPower ?? lap.averagePower)
        : num(lap.average_speed ?? lap.avgSpeed);
      if (!demand) return null;
      return { demand, lactate, label: `Lap ${lap.lapNumber ?? i + 1}` };
    })
    .filter(Boolean);
}

// ── Small pieces ───────────────────────────────────────────────────────────

function StatTile({ label, value, sub, tone = 'default' }) {
  const toneCls = tone === 'good' ? 'text-emerald-600' : tone === 'bad' ? 'text-rose-600' : 'text-gray-900';
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{label}</div>
      <div className={`text-[17px] font-bold tabular-nums ${toneCls}`}>{value}</div>
      {sub ? <div className="text-[11px] text-gray-500 tabular-nums">{sub}</div> : null}
    </div>
  );
}

function ConfidenceChip({ level }) {
  const c = CONFIDENCE_UI[level] || CONFIDENCE_UI.low;
  return (
    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${c.cls}`}>
      {c.label}
    </span>
  );
}

/** Five zone slices clipped to a chart axis, from the test's own thresholds. */
function zoneSlices(bounds, domain) {
  if (!bounds) return [];
  return ZONES.map((z, i) => ({
    ...z,
    from: Math.max(bounds[i], domain[0]),
    to: Math.min(bounds[i + 1], domain[1]),
  })).filter((b) => b.to > b.from);
}

function fmtMinutes(sec) {
  const m = Math.round((Number(sec) || 0) / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}` : `${m}m`;
}

/**
 * Two stacked bars — the same session split by power and by heart rate.
 *
 * Side by side because the comparison is the point: a session whose power bar
 * is mostly green and whose heart-rate bar is mostly amber was harder on the
 * athlete than the numbers on the head unit suggest.
 */
function ZoneSplitBars({ agreement, kind }) {
  if (!agreement) return null;
  const { demandSec, hrSec, totalSec, agreeSec, verdict } = agreement;

  const Row = ({ label, secs }) => (
    <div className="flex items-center gap-2">
      <span className="w-11 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-gray-400">{label}</span>
      <div className="flex h-4 flex-1 overflow-hidden rounded">
        {ZONES.map((z, i) => {
          const pct = totalSec > 0 ? (secs[i] / totalSec) * 100 : 0;
          if (pct <= 0) return null;
          return (
            <div
              key={z.id}
              title={`${z.id} ${z.label} — ${fmtMinutes(secs[i])}`}
              style={{ width: `${pct}%`, background: z.color, opacity: 0.85 }}
            />
          );
        })}
      </div>
    </div>
  );

  const agreePct = totalSec > 0 ? Math.round((agreeSec / totalSec) * 100) : 0;
  const VERDICTS = {
    'hr-higher': 'Where they differ, heart rate sits in a higher zone than the effort does — the '
      + 'signature of heat, accumulated fatigue, illness or altitude.',
    'hr-lower': 'Where they differ, heart rate sits below the effort\u2019s zone — normal for short '
      + 'intervals, where the heart never catches up before the effort ends.',
    aligned: 'The two track each other closely, which is what a fresh session in normal conditions '
      + 'looks like.',
  };

  return (
    <div className="mt-3 space-y-1.5">
      <Row label={kind === 'bike' ? 'Power' : 'Pace'} secs={demandSec} />
      <Row label="Heart" secs={hrSec} />
      <p className="pt-0.5 text-[11px] leading-relaxed text-gray-500">
        <strong className="text-gray-700">{agreePct}%</strong> of the session your heart rate was in the
        same zone as your {kind === 'bike' ? 'power' : 'pace'}. {VERDICTS[verdict]}
      </p>
    </div>
  );
}

/** "20 min" / "1h05" — a block length, said the way a coach would say it. */
function fmtBlock(sec) {
  const m = Math.round((Number(sec) || 0) / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h}h${String(rem).padStart(2, '0')}` : `${h}h`;
}

/**
 * The plainest thing the test can say about today, and the one that shows on
 * an easy ride.
 *
 * Everything else in this panel either models the threshold or needs blood.
 * This needs neither: the athlete held 250 W, the test measured 250 W, and the
 * two heart rates are simply subtracted. No extrapolation means no reason to
 * refuse a Z1 session — which is most sessions.
 */
function AtTheSameIntensity({ comparison, kind, storageMode }) {
  if (!comparison) return null;
  const { blocks, fromAverage, meanDeltaHr } = comparison;
  const lower = meanDeltaHr < 0;
  const notable = Math.abs(meanDeltaHr) >= 3;

  return (
    <div className="mt-3">
      <h4 className="mb-1 text-[13px] font-bold text-gray-900">At the same intensity</h4>
      <ul className="space-y-1.5">
        {blocks.map((b, i) => {
          const delta = Math.round(b.deltaHr);
          const tone = Math.abs(delta) < 3 ? 'text-gray-500'
            : delta < 0 ? 'text-emerald-600' : 'text-rose-600';
          return (
            // Position, not content: two blocks of the same length at the same
            // intensity are a normal thing for a session to contain, and keying
            // on their values collides the moment it happens.
            <li key={i} className="text-[13px] leading-relaxed text-gray-700">
              <strong>{fmtBlock(b.sec)}</strong> at{' '}
              <strong>{fmtDemand(b.demand, kind, storageMode)}</strong> with your heart at{' '}
              <strong>{Math.round(b.hr)} bpm</strong> — on test day that intensity cost you{' '}
              <strong>{Math.round(b.testHr)} bpm</strong>
              {Math.abs(delta) >= 1 && (
                <span className={`font-semibold ${tone}`}>
                  {' '}({delta < 0 ? `${Math.abs(delta)} lower` : `${delta} higher`})
                </span>
              )}
              .
            </li>
          );
        })}
      </ul>
      <p className="mt-1.5 text-[11px] leading-relaxed text-gray-400">
        {fromAverage
          ? 'Nothing held still for long enough to quote, so this is the session average.'
          : 'Read straight off your test\u2019s stages — nothing here is extrapolated.'}
        {notable && (lower
          ? ' A lower heart rate for the same effort is the shape aerobic fitness improves in.'
          : ' A higher heart rate for the same effort usually means heat, fatigue or illness before it means lost fitness.')}
      </p>
    </div>
  );
}

// ── Layer 1: the session on the test's axes ────────────────────────────────

function ZoneScatter({ result, anchor, governingTest, slopeFit, kind, storageMode }) {
  const chart = useMemo(() => {
    const cloud = result?.cloud || [];
    if (cloud.length < 3) return null;
    const lt2Demand = result.lt2Demand ?? thresholdToDemand(anchor.lt2, { kind, storageMode });
    const lt1Demand = result.lt1Demand ?? thresholdToDemand(anchor.lt1, { kind, storageMode });

    const ds = cloud.map((p) => p.demand);
    const hs = cloud.map((p) => p.hr);
    const lo = Math.min(...ds, lt1Demand || lt2Demand * 0.7);
    const hi = Math.max(...ds, lt2Demand);
    const pad = (hi - lo) * 0.08 || 1;
    const domain = [lo - pad, hi + pad];

    const hrLo = Math.min(...hs);
    const hrHi = Math.max(...hs, anchor.lt2Hr || 0);
    const hrPad = (hrHi - hrLo) * 0.1 || 5;
    const hrDomain = [hrLo - hrPad, hrHi + hrPad];

    // Heart-rate zones need a ceiling: without one Z5 has no top and the band
    // stops at 1.1x LT2, which for most athletes is below their real max.
    const demandBounds = ltZoneBounds({ lt1: lt1Demand, lt2: lt2Demand, ascending: true });
    const hrBounds = anchor.lt1Hr > 0 && anchor.lt2Hr > 0
      ? ltZoneBounds({
        lt1: anchor.lt1Hr,
        lt2: anchor.lt2Hr,
        ascending: true,
        top: measuredMaxHr(governingTest),
      })
      : null;

    const line = [];
    if (slopeFit) {
      for (let i = 0; i <= 20; i += 1) {
        const d = domain[0] + ((domain[1] - domain[0]) * i) / 20;
        line.push({ d, testHr: slopeFit.intercept + slopeFit.slope * d });
      }
    }
    // Both series share one dataset keyed on intensity. A <Scatter> holding its
    // own `data` inside a ComposedChart never binds to the axes — the group
    // renders and not one point in it does.
    const data = [
      ...cloud.map((p) => ({ d: p.demand, hr: p.hr, min: Math.round(p.t / 60) })),
      ...line,
    ].sort((a, b) => a.d - b.d);

    return {
      domain,
      hrDomain: [Math.floor(hrDomain[0]), Math.ceil(hrDomain[1])],
      data,
      line,
      cloud,
      bands: zoneSlices(demandBounds, domain),
      hrBands: zoneSlices(hrBounds, hrDomain),
      agreement: demandBounds && hrBounds
        ? zoneAgreement(cloud, { demandBounds, hrBounds })
        : null,
      lt1Demand,
      lt2Demand,
    };
  }, [result, anchor, governingTest, slopeFit, kind, storageMode]);

  if (!chart) return null;

  return (
    <>
      <div className="mt-3 h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chart.data} margin={{ top: 22, right: 12, bottom: 18, left: 0 }}>
            <CartesianGrid stroke="#f1f5f9" vertical={false} />
            {/* Intensity zones run vertically, heart-rate zones horizontally, so
                a point's position states both at once and a mismatch is visible
                as a point sitting in two differently coloured strips. */}
            {/* Uneven on purpose: two bands at equal weight multiply into mud
                wherever they cross. Intensity carries the colour, heart rate
                only tints, and the pair stays readable at the intersections. */}
            {chart.bands.map((b) => (
              <ReferenceArea key={`d-${b.id}`} x1={b.from} x2={b.to}
                fill={b.color} fillOpacity={0.16} stroke="none" ifOverflow="hidden" />
            ))}
            {chart.hrBands.map((b) => (
              <ReferenceArea key={`h-${b.id}`} y1={b.from} y2={b.to}
                fill={b.color} fillOpacity={0.06} stroke="none" ifOverflow="hidden" />
            ))}
            <XAxis
              type="number"
              dataKey="d"
              domain={chart.domain}
              tickFormatter={(v) => axisTick(v, kind, storageMode)}
              tick={{ fontSize: 10, fill: '#94a3b8' }}
              axisLine={{ stroke: '#e2e8f0' }}
              tickLine={false}
              label={{
                value: kind === 'bike' ? 'Power (W)' : 'Grade-adjusted pace',
                position: 'insideBottom', offset: -12, fontSize: 10, fill: '#94a3b8',
              }}
            />
            <YAxis
              type="number"
              domain={chart.hrDomain}
              tickFormatter={(v) => Math.round(v)}
              tick={{ fontSize: 10, fill: '#94a3b8' }}
              axisLine={false}
              tickLine={false}
              width={40}
              label={{ value: 'bpm', angle: -90, position: 'insideLeft', offset: 12, fontSize: 10, fill: '#94a3b8' }}
            />
            <Tooltip
              contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }}
              formatter={(v, name) => [`${Math.round(v)} bpm`, name === 'testHr' ? 'Test curve' : 'This session']}
              labelFormatter={(v) => `${axisTick(v, kind, storageMode)}${kind === 'bike' ? ' W' : ''}`}
            />
            <ReferenceLine x={chart.lt2Demand} stroke={TEST_COLOR} strokeDasharray="3 3"
              label={{ value: 'LT2', position: 'top', offset: 6, fontSize: 10, fontWeight: 600, fill: '#64748b' }} />
            {chart.lt1Demand > 0 && (
              <ReferenceLine x={chart.lt1Demand} stroke={TEST_COLOR} strokeDasharray="3 3"
                label={{ value: 'LT1', position: 'top', offset: 6, fontSize: 10, fontWeight: 600, fill: '#64748b' }} />
            )}
            {anchor.lt2Hr > 0 && <ReferenceLine y={anchor.lt2Hr} stroke={TEST_COLOR} strokeDasharray="3 3" />}
            <Scatter dataKey="hr" shape={<Dot r={3} color={NOW_COLOR} opacity={0.45} />} isAnimationActive={false} />
            {chart.line.length > 0 && (
              <Line type="monotone" dataKey="testHr" stroke={TEST_COLOR} strokeWidth={2}
                dot={false} connectNulls isAnimationActive={false} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-gray-500">
        {ZONES.map((z) => (
          <span key={z.id} className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-sm" style={{ background: z.color, opacity: 0.55 }} />
            {z.id}
          </span>
        ))}
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: NOW_COLOR, opacity: 0.42 }} />
          this session (30 s)
        </span>
        {slopeFit && (
          <span className="flex items-center gap-1">
            <span className="inline-block h-0.5 w-4" style={{ background: TEST_COLOR }} /> test curve
          </span>
        )}
      </div>

      <ZoneSplitBars agreement={chart.agreement} kind={kind} />
    </>
  );
}

// ── Layer 2: blood against the curve ───────────────────────────────────────

function LactateVsCurve({ anchor, samples, kind, storageMode }) {
  const curve = useMemo(() => testLactateCurve(anchor), [anchor]);
  const shift = useMemo(() => lactateCurveShift(anchor, samples), [anchor, samples]);

  if (!curve || !samples.length) return null;

  const domain = [
    Math.min(curve.min, ...samples.map((s) => s.demand)) * 0.97,
    Math.max(curve.max, ...samples.map((s) => s.demand)) * 1.03,
  ];
  const curveData = curve.points.map((p) => ({ d: p.demand, lac: p.lactate }));
  const measured = samples.map((s) => ({ d: s.demand, lac: s.lactate, label: s.label }));

  const placed = shift?.samples || [];
  const improved = shift ? shift.shift > 0 : null;

  return (
    <div className="mt-4 border-t border-gray-100 pt-3">
      <div className="mb-1 flex items-start justify-between gap-3">
        <h4 className="text-[13px] font-bold text-gray-900">Measured lactate vs your curve</h4>
        {shift && <ConfidenceChip level={shift.confidence} />}
      </div>

      {shift ? (
        <p className="text-[13px] leading-relaxed text-gray-700">
          {shift.n === 1 ? 'One sample places' : `${shift.n} samples place`} your curve{' '}
          <strong className={Math.abs(shift.shiftPct) >= 2 ? (improved ? 'text-emerald-600' : 'text-rose-600') : ''}>
            {fmtDemandDelta(shift.shift, shift.samples[0].demand, kind, storageMode)}
          </strong>{' '}
          {Math.abs(shift.shiftPct) < 2
            ? 'from where the test drew it — essentially unchanged.'
            : `${improved ? 'to the right of' : 'to the left of'} where the test drew it `
              + `(${Math.abs(shift.shiftPct).toFixed(1)}% of LT2). `}
          {Math.abs(shift.shiftPct) >= 2 && (improved
            ? 'You are producing the same lactate at a higher intensity.'
            : 'The same lactate is arriving at a lower intensity than on test day.')}
        </p>
      ) : (
        <p className="text-[13px] leading-relaxed text-gray-500">
          {samples.length === 1 ? 'This sample sits' : 'These samples sit'} outside the range your test
          covered, so there is no point on the curve to compare against.
        </p>
      )}

      <div className="mt-2 h-44 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart margin={{ top: 8, right: 8, bottom: 18, left: 0 }}>
            <CartesianGrid stroke="#f1f5f9" vertical={false} />
            <XAxis
              type="number"
              dataKey="d"
              domain={domain}
              allowDuplicatedCategory={false}
              tickFormatter={(v) => axisTick(v, kind, storageMode)}
              tick={{ fontSize: 10, fill: '#94a3b8' }}
              axisLine={{ stroke: '#e2e8f0' }}
              tickLine={false}
              label={{
                value: kind === 'bike' ? 'Power (W)' : 'Pace',
                position: 'insideBottom', offset: -12, fontSize: 10, fill: '#94a3b8',
              }}
            />
            <YAxis
              type="number"
              dataKey="lac"
              tick={{ fontSize: 10, fill: '#94a3b8' }}
              axisLine={false}
              tickLine={false}
              width={34}
              label={{ value: 'mmol/L', angle: -90, position: 'insideLeft', fontSize: 10, fill: '#94a3b8' }}
            />
            <Tooltip
              contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }}
              formatter={(v) => [`${Number(v).toFixed(1)} mmol/L`, '']}
              labelFormatter={(v) => `${axisTick(v, kind, storageMode)}${kind === 'bike' ? ' W' : ''}`}
            />
            <Line data={curveData} type="monotone" dataKey="lac" stroke={TEST_COLOR} strokeWidth={2}
              dot={{ r: 2, fill: TEST_COLOR }} />
            <Scatter data={measured} dataKey="lac" shape={<Dot r={5} color={LACTATE_COLOR} opacity={1} />} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {placed.length > 0 && (
        <div className="mt-1 overflow-x-auto">
          <table className="w-full text-[11px] tabular-nums">
            <thead>
              <tr className="text-gray-400">
                <th className="py-1 text-left font-semibold">Sample</th>
                <th className="py-1 text-right font-semibold">Measured</th>
                <th className="py-1 text-right font-semibold">Test said</th>
                <th className="py-1 text-right font-semibold">Test needed</th>
                <th className="py-1 text-right font-semibold">Shift</th>
              </tr>
            </thead>
            <tbody>
              {placed.map((s) => (
                <tr key={s.label} className="border-t border-gray-100">
                  <td className="py-1 text-gray-600">{s.label}</td>
                  <td className="py-1 text-right text-gray-900">
                    {s.lactate.toFixed(1)} @ {fmtDemand(s.demand, kind, storageMode)}
                  </td>
                  <td className="py-1 text-right text-gray-500">
                    {s.expectedLactate != null ? `${s.expectedLactate.toFixed(1)} mmol` : '—'}
                  </td>
                  <td className="py-1 text-right text-gray-500">
                    {fmtDemand(s.expectedDemand, kind, storageMode)}
                  </td>
                  <td className={`py-1 text-right font-semibold ${s.shift > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {fmtDemandDelta(s.shift, s.demand, kind, storageMode)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {kind !== 'bike' && (
        <p className="mt-1 text-[11px] text-gray-400">
          Lap pace is not grade-adjusted, so a hilly session reads optimistically here.
        </p>
      )}
    </div>
  );
}

// ── Layer 3: the threshold re-estimated from heart rate ────────────────────

function DriftFromHeartRate({ result, kind, storageMode, testDateLabel }) {
  const [showWorking, setShowWorking] = useState(false);

  if (!result?.ok) {
    const why = DRIFT_REASONS[result?.reason];
    if (!why) return null;
    return (
      <div className="mt-4 border-t border-gray-100 pt-3">
        <h4 className="text-[13px] font-bold text-gray-900">Threshold from heart rate</h4>
        <p className="mt-1 text-[12px] leading-relaxed text-gray-500">{why}</p>
      </div>
    );
  }

  const improved = result.deltaDemand > 0;
  const meaningful = Math.abs(result.deltaPct) >= 1.5;

  return (
    <div className="mt-4 border-t border-gray-100 pt-3">
      <div className="mb-1 flex items-start justify-between gap-3">
        <h4 className="text-[13px] font-bold text-gray-900">Threshold from heart rate</h4>
        <ConfidenceChip level={result.confidence} />
      </div>

      <p className="text-[13px] leading-relaxed text-gray-700">
        At your test LT2 heart rate of <strong>{Math.round(result.lt2Hr)} bpm</strong> you held{' '}
        <strong className={meaningful ? (improved ? 'text-emerald-600' : 'text-rose-600') : ''}>
          {fmtDemand(result.demandAtLt2Hr, kind, storageMode)}
        </strong>
        {meaningful
          ? <> — {fmtDemandDelta(result.deltaDemand, result.demandAtLt2Hr, kind, storageMode)} against the{' '}
            {fmtDemand(result.lt2Demand, kind, storageMode)} from your test{testDateLabel ? ` on ${testDateLabel}` : ''}.</>
          : <> — in line with your test{testDateLabel ? ` on ${testDateLabel}` : ''}.</>}
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile
          label={`HR at ${fmtDemand(result.lt2Demand, kind, storageMode)}`}
          value={`${Math.round(result.hrAtLt2)} bpm`}
          sub={`${result.deltaHr > 0 ? '+' : ''}${Math.round(result.deltaHr)} vs test`}
          tone={meaningful ? (result.deltaHr < 0 ? 'good' : 'bad') : 'default'}
        />
        <StatTile
          label={`${kind === 'bike' ? 'Power' : 'Pace'} at ${Math.round(result.lt2Hr)} bpm`}
          value={fmtDemand(result.demandAtLt2Hr, kind, storageMode)}
          sub={`${fmtDemandDelta(result.deltaDemand, result.demandAtLt2Hr, kind, storageMode)} vs test`}
          tone={meaningful ? (improved ? 'good' : 'bad') : 'default'}
        />
        <StatTile
          label="Cardiac drift"
          value={`${result.fit.drift >= 0 ? '+' : ''}${result.fit.drift.toFixed(1)} bpm/h`}
          sub="at constant effort"
        />
        <StatTile
          label="Decoupling"
          value={Number.isFinite(result.decoupling) ? `${result.decoupling.toFixed(1)}%` : '—'}
          sub="first half vs second"
        />
      </div>

      <button
        type="button"
        onClick={() => setShowWorking((v) => !v)}
        className="mt-3 text-[11px] font-semibold text-gray-400 underline decoration-dotted underline-offset-2 hover:text-gray-600"
      >
        {showWorking ? 'Hide how this was read' : 'How this was read'}
      </button>
      {showWorking && (
        <ul className="mt-2 space-y-1 text-[11px] leading-relaxed text-gray-500">
          <li>
            {result.points.length} steady segments of 2.5 min, where{' '}
            {kind === 'bike' ? 'power' : 'grade-adjusted pace'} held still and heart rate had stopped climbing.
          </li>
          <li>
            Slope {result.slopeSource === 'test'
              ? `taken from your test's own stages (r² ${(result.slopeR2 ?? 0).toFixed(2)}) — this session did not span enough intensity to fit its own.`
              : `fitted from this session itself (r² ${result.fit.r2.toFixed(2)}).`}
          </li>
          <li>Heart rate shifted back {result.lagSec} s to line up with the effort that caused it.</li>
          {result.tempAdjustBpm > 0 && (
            <li>
              {result.tempAdjustBpm.toFixed(1)} bpm removed for {Math.round(result.tempC)} °C — without it the
              session would read as lost fitness.
            </li>
          )}
          {result.extrapolation > 0.3 && (
            <li className="text-amber-600">
              This session stayed well below LT2, so the value at LT2 is extrapolated — treat it as a hint.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

// ── Trend across everything since the test ─────────────────────────────────

/**
 * Where LT1 and LT2 have drifted to since the test.
 *
 * Built from heart rate measured at intensities the test covered, converted to
 * the athlete's own unit through the local steepness of their curve. It reads
 * far more of a training week than the threshold fit does — that one needs a
 * long steady effort near threshold, this one takes any block the test can
 * place, easy ones included.
 *
 * The two thresholds are shown separately because they move separately: a
 * block of easy volume lifts LT1 while LT2 sits still, and one averaged number
 * would hide exactly the thing that block was for.
 */
function ProjectedThresholds({ projection, kind, storageMode }) {
  if (!projection) return null;
  const rows = [
    { key: 'LT1', label: 'Aerobic threshold', est: projection.lt1 },
    { key: 'LT2', label: 'Anaerobic threshold', est: projection.lt2 },
  ].filter((r) => r.est);
  if (!rows.length) return null;

  return (
    <div className="mt-3">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h4 className="text-[13px] font-bold text-gray-900">Where your thresholds sit now</h4>
        <span className="text-[11px] text-gray-400">
          {projection.sessions} sessions · {Math.round(projection.minutes / 60)}h read
        </span>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {rows.map(({ key, label, est }) => {
          const better = kind === 'bike' ? est.shift > 0 : est.shift > 0;
          const moved = Math.abs(est.shiftPct) >= 1.5;
          return (
            <div key={key} className="rounded-lg border border-gray-200 bg-white px-3 py-2">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                  {key} · {label}
                </span>
                <ConfidenceChip level={est.confidence} />
              </div>
              <div className="mt-0.5 flex items-baseline gap-2 tabular-nums">
                <span className="text-[13px] text-gray-400 line-through">
                  {fmtDemand(est.fromDemand, kind, storageMode)}
                </span>
                <span className="text-gray-300">→</span>
                <span className={`text-[17px] font-bold ${moved ? (better ? 'text-emerald-600' : 'text-rose-600') : 'text-gray-900'}`}>
                  {fmtDemand(est.toDemand, kind, storageMode)}
                </span>
              </div>
              <div className="text-[11px] tabular-nums text-gray-500">
                {moved
                  ? `${fmtDemandDelta(est.shift, est.toDemand, kind, storageMode)} (${est.shiftPct > 0 ? '+' : ''}${est.shiftPct.toFixed(1)}%) · ${est.minutes} min near ${key}`
                  : `unchanged · ${est.minutes} min near ${key}`}
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-1.5 text-[11px] leading-relaxed text-gray-400">
        Estimated from heart rate, not measured — heat, fatigue and illness move it too. Treat a
        change here as a reason to retest, never as a replacement for one.
      </p>
    </div>
  );
}

const LT1_COLOR = '#0ea5e9';
const LT2_COLOR = '#f97316';

/**
 * The curve, and where it sits now.
 *
 * "LT2 is 22 W lower than your test" is a fact about one point, and it reads
 * like an accusation. The curve is the object athletes actually recognise, and
 * the thing they want to know is which way it has gone — so the test curve is
 * drawn as measured and the same shape redrawn at the intensities the training
 * puts it at, with the two LT2s joined so the distance between them is the
 * answer.
 *
 * It tilts as well as slides, because LT1 and LT2 are estimated separately and
 * genuinely move by different amounts.
 */
function CurveShift({ anchor, projection, kind, storageMode }) {
  const chart = useMemo(() => {
    const test = testLactateCurve(anchor);
    const now = shiftedLactateCurve(anchor, projection);
    if (!test || !now) return null;

    const rows = [
      ...test.points.map((p) => ({ d: p.demand, testLac: p.lactate })),
      ...now.points.map((p) => ({ d: p.demand, nowLac: p.lactate })),
    ].sort((a, b) => a.d - b.d);

    const ds = rows.map((r) => r.d);
    const pad = (Math.max(...ds) - Math.min(...ds)) * 0.06 || 1;
    return {
      rows,
      domain: [Math.min(...ds) - pad, Math.max(...ds) + pad],
      marks: [
        { key: 'LT1', color: LT1_COLOR, est: projection.lt1 },
        { key: 'LT2', color: LT2_COLOR, est: projection.lt2 },
      ].filter((m) => m.est),
    };
  }, [anchor, projection]);

  if (!chart) return null;

  return (
    <div className="mt-3">
      <h4 className="mb-1 text-[13px] font-bold text-gray-900">How the curve has moved</h4>
      <div className="h-52 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chart.rows} margin={{ top: 22, right: 12, bottom: 18, left: 0 }}>
            <CartesianGrid stroke="#f1f5f9" vertical={false} />
            <XAxis
              type="number" dataKey="d" domain={chart.domain}
              tickFormatter={(v) => axisTick(v, kind, storageMode)}
              tick={{ fontSize: 10, fill: '#94a3b8' }}
              axisLine={{ stroke: '#e2e8f0' }} tickLine={false}
              label={{
                value: kind === 'bike' ? 'Power (W)' : 'Pace',
                position: 'insideBottom', offset: -12, fontSize: 10, fill: '#94a3b8',
              }}
            />
            <YAxis
              type="number" tick={{ fontSize: 10, fill: '#94a3b8' }}
              axisLine={false} tickLine={false} width={40}
              label={{ value: 'mmol/L', angle: -90, position: 'insideLeft', offset: 12, fontSize: 10, fill: '#94a3b8' }}
            />
            <Tooltip
              contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }}
              formatter={(v, name) => [`${Number(v).toFixed(1)} mmol/L`,
                name === 'testLac' ? 'On test day' : 'Estimated now']}
              labelFormatter={(v) => `${axisTick(v, kind, storageMode)}${kind === 'bike' ? ' W' : ''}`}
            />
            {/* Each threshold's travel, drawn as the gap it moved across. */}
            {chart.marks.map((m) => (
              <ReferenceArea
                key={m.key}
                x1={Math.min(m.est.fromDemand, m.est.toDemand)}
                x2={Math.max(m.est.fromDemand, m.est.toDemand)}
                fill={m.color} fillOpacity={0.12} stroke="none" ifOverflow="hidden"
                label={{ value: m.key, position: 'top', offset: 6, fontSize: 10, fontWeight: 600, fill: m.color }}
              />
            ))}
            {chart.marks.map((m) => (
              <ReferenceLine key={`f-${m.key}`} x={m.est.fromDemand}
                stroke={m.color} strokeDasharray="3 3" strokeOpacity={0.6} />
            ))}
            {chart.marks.map((m) => (
              <ReferenceLine key={`t-${m.key}`} x={m.est.toDemand} stroke={m.color} strokeWidth={2} />
            ))}
            <Line type="monotone" dataKey="testLac" stroke={TEST_COLOR} strokeWidth={2}
              strokeDasharray="4 3" dot={{ r: 2.5, fill: TEST_COLOR }} connectNulls isAnimationActive={false} />
            <Line type="monotone" dataKey="nowLac" stroke={NOW_COLOR} strokeWidth={2.5}
              dot={{ r: 2.5, fill: NOW_COLOR }} connectNulls isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-gray-500">
        <span className="flex items-center gap-1">
          <span className="inline-block h-0 w-4 border-t-2 border-dashed" style={{ borderColor: TEST_COLOR }} />
          your test
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-0.5 w-4" style={{ background: NOW_COLOR }} /> estimated now
        </span>
        {chart.marks.map((m) => (
          <span key={m.key} className="flex items-center gap-1">
            <span className="inline-block h-2 w-3 rounded-sm" style={{ background: m.color, opacity: 0.35 }} />
            {m.key} moved {fmtDemandDelta(m.est.shift, m.est.toDemand, kind, storageMode)}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * The season: measured tests as points, the estimate as the line between them.
 *
 * Each point on the line is re-estimated from a trailing six weeks using only
 * sessions that had happened by then, so it is what the app would have said on
 * that date rather than a curve fitted with hindsight. That matters because the
 * question it answers — "is this block working?" — is one an athlete asks in
 * the middle of the block, not after it.
 *
 * Tests are drawn as dots on the same axes. Where a dot sits off the line, the
 * line was wrong; that comparison is the honest way to show how much an
 * estimate from heart rate is worth.
 */
function ThresholdTimeline({ timeline, testMarkers, kind, storageMode }) {
  const data = useMemo(() => {
    const rows = (timeline || []).map((p) => ({
      ms: new Date(p.date).getTime(), lt1: p.lt1, lt2: p.lt2,
    }));
    for (const m of testMarkers || []) {
      rows.push({ ms: new Date(m.date).getTime(), testLt1: m.lt1, testLt2: m.lt2 });
    }
    return rows.filter((r) => Number.isFinite(r.ms)).sort((a, b) => a.ms - b.ms);
  }, [timeline, testMarkers]);

  /**
   * One tick per month. The points are weekly, and letting the axis label them
   * itself printed "Jan Jan Jan Feb Feb Feb" — four identical labels per month,
   * which is noise pretending to be an axis.
   */
  const monthTicks = useMemo(() => {
    if (!data.length) return [];
    const first = new Date(data[0].ms);
    const last = new Date(data[data.length - 1].ms);
    const ticks = [];
    const cursor = new Date(first.getFullYear(), first.getMonth(), 1);
    while (cursor <= last) {
      const ms = cursor.getTime();
      if (ms >= data[0].ms) ticks.push(ms);
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return ticks;
  }, [data]);

  // Two points is a pair of readings, not a trend, and drawing it as a line
  // implies a season's worth of evidence that is not there.
  if ((timeline?.length || 0) < 3) return null;

  const hasLt1 = data.some((r) => Number.isFinite(r.lt1) || Number.isFinite(r.testLt1));

  return (
    <div className="mt-3">
      <h4 className="mb-1 text-[13px] font-bold text-gray-900">Across the season</h4>
      <div className="h-44 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 10, right: 12, bottom: 4, left: 0 }}>
            <CartesianGrid stroke="#f1f5f9" vertical={false} />
            <XAxis
              dataKey="ms" type="number" scale="time" domain={['dataMin', 'dataMax']}
              ticks={monthTicks}
              tickFormatter={(v) => new Date(v).toLocaleDateString(undefined, { month: 'short' })}
              tick={{ fontSize: 10, fill: '#94a3b8' }}
              axisLine={{ stroke: '#e2e8f0' }} tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={46}
              domain={['dataMin - 10', 'dataMax + 10']}
              tickFormatter={(v) => fmtDemand(v, kind, storageMode)}
            />
            <Tooltip
              contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }}
              labelFormatter={(v) => new Date(v).toLocaleDateString()}
              formatter={(v, name) => [
                fmtDemand(v, kind, storageMode),
                { lt1: 'LT1 (estimated)', lt2: 'LT2 (estimated)', testLt1: 'LT1 (tested)', testLt2: 'LT2 (tested)' }[name] || name,
              ]}
            />
            {hasLt1 && (
              <Line type="monotone" dataKey="lt1" stroke={LT1_COLOR} strokeWidth={2}
                dot={false} connectNulls isAnimationActive={false} />
            )}
            <Line type="monotone" dataKey="lt2" stroke={LT2_COLOR} strokeWidth={2}
              dot={false} connectNulls isAnimationActive={false} />
            <Scatter dataKey="testLt1" shape={<Dot r={5} color={LT1_COLOR} opacity={1} />} isAnimationActive={false} />
            <Scatter dataKey="testLt2" shape={<Dot r={5} color={LT2_COLOR} opacity={1} />} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-gray-500">
        {hasLt1 && (
          <span className="flex items-center gap-1">
            <span className="inline-block h-0.5 w-4" style={{ background: LT1_COLOR }} /> LT1
          </span>
        )}
        <span className="flex items-center gap-1">
          <span className="inline-block h-0.5 w-4" style={{ background: LT2_COLOR }} /> LT2
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-gray-400" /> a test you actually did
        </span>
        <span className="text-gray-400">estimated weekly from a trailing six weeks</span>
      </div>
    </div>
  );
}

/** Which profile key this sport's zones live under. */
const ZONE_KEY = { bike: 'cycling', run: 'running', swim: 'swimming' };

/**
 * Offer to rewrite the zones, once the evidence is worth the disruption.
 *
 * Zones are what every session is prescribed against, so this is the one place
 * in the panel that changes what the athlete does tomorrow. It therefore asks
 * rather than acts, shows the numbers it would write before writing them, and
 * says plainly that the source is an estimate.
 *
 * The written zones do not feed back into this reading — the analysis is
 * anchored to the test, never to the profile — so accepting the advice cannot
 * make the next estimate agree with itself.
 */
function ZoneAdvice({ advice, projection, anchor, kind, storageMode, onApplied }) {
  const [state, setState] = useState('idle');

  if (!advice) return null;

  const lt1 = advice.thresholds.lt1 ?? projection.lt1?.fromDemand ?? null;
  const lt2 = advice.thresholds.lt2 ?? projection.lt2?.fromDemand ?? null;
  if (!(lt2 > 0)) return null;

  const apply = async () => {
    setState('saving');
    try {
      const key = ZONE_KEY[kind];
      const powerBounds = ltZones({ lt1, lt2, ascending: true });
      // Heart-rate zones are left exactly as the test measured them. Only the
      // intensity moved; the heart rates at the thresholds are the anchor this
      // whole estimate is built on, and rewriting them would erase it.
      const profile = (await api.get('/user/profile')).data || {};
      const powerZones = { ...(profile.powerZones || {}), [key]: powerBounds };
      await updateUserProfile({
        ...profile,
        powerZones,
        zonesSource: 'estimate',
        zonesNote: `estimated from ${advice.sessions} sessions since the test`,
      });
      setState('done');
      onApplied?.();
    } catch {
      setState('error');
    }
  };

  return (
    <div className="mt-3 rounded-lg border border-violet-200 bg-violet-50/60 px-3 py-2.5">
      <div className="text-[13px] font-bold text-violet-900">Worth rewriting your zones</div>
      <p className="mt-0.5 text-[12px] leading-relaxed text-violet-800">
        {advice.reason} Across {advice.sessions} sessions
        {advice.testAgeDays ? ` and ${Math.round(advice.testAgeDays / 7)} weeks since you tested` : ''},
        your {kind === 'bike' ? 'power' : 'pace'} zones would move to{' '}
        {advice.thresholds.lt1 ? <>LT1 <strong>{fmtDemand(lt1, kind, storageMode)}</strong>, </> : null}
        LT2 <strong>{fmtDemand(lt2, kind, storageMode)}</strong>.
      </p>
      <p className="mt-1 text-[11px] leading-relaxed text-violet-700/80">
        Heart-rate zones stay as the test measured them — only the intensity moved. A real test
        beats this; treat it as a stopgap until you do one.
      </p>
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={apply}
          disabled={state === 'saving' || state === 'done'}
          className="rounded-lg bg-violet-600 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-violet-700 disabled:bg-violet-300"
        >
          {state === 'saving' ? 'Updating…' : state === 'done' ? 'Zones updated' : 'Update my zones'}
        </button>
        {state === 'error' && <span className="text-[11px] text-rose-600">Could not save — try again.</span>}
        {state === 'done' && <span className="text-[11px] text-violet-700">Retest when you can.</span>}
      </div>
    </div>
  );
}

function DriftHistory({ athleteId, anchor, kind, storageMode, governingTest }) {
  const [state, setState] = useState({ loading: true, data: null });

  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, data: null });
    getThresholdDrift(kind, athleteId)
      .then((res) => { if (!cancelled) setState({ loading: false, data: res?.data ?? res }); })
      .catch(() => { if (!cancelled) setState({ loading: false, data: null }); });
    return () => { cancelled = true; };
  }, [kind, athleteId]);

  const { loading, data } = state;
  if (loading) return null;
  if (!data?.series?.length && !data?.projection && !data?.timeline?.length) return null;

  const series = (data.series || []).map((p) => ({ ...p, ms: new Date(p.date).getTime() }));

  return (
    <div className="mt-4 border-t border-gray-100 pt-3">
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <h4 className="text-[13px] font-bold text-gray-900">Since your test</h4>
        <span className="text-[11px] text-gray-400">
          {data.coverage?.compared ?? data.coverage?.read} of {data.coverage?.considered} sessions read
        </span>
      </div>

      <ProjectedThresholds projection={data.projection} kind={kind} storageMode={storageMode} />
      <ZoneAdvice
        advice={zoneAdviceFor(data.projection, { testDate: governingTest?.date })}
        projection={data.projection} anchor={anchor} kind={kind} storageMode={storageMode}
      />
      <CurveShift anchor={anchor} projection={data.projection} kind={kind} storageMode={storageMode} />
      <ThresholdTimeline timeline={data.timeline} testMarkers={data.testMarkers}
        kind={kind} storageMode={storageMode} />

      {series.length > 0 && (
      <div className="mt-3 h-36 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={series} margin={{ top: 6, right: 8, bottom: 4, left: 0 }}>
            <CartesianGrid stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="ms" type="number" scale="time" domain={['dataMin', 'dataMax']}
              tickFormatter={(v) => new Date(v).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
              tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={38}
              tickFormatter={(v) => (kind === 'bike' ? `${v > 0 ? '+' : ''}${Math.round(v)}` : `${v > 0 ? '+' : ''}${v.toFixed(1)}`)} />
            <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }}
              labelFormatter={(v) => new Date(v).toLocaleDateString()}
              formatter={(v, name) => [
                kind === 'bike' ? `${v > 0 ? '+' : ''}${Math.round(v)} W` : `${v > 0 ? '+' : ''}${Number(v).toFixed(2)} m/s`,
                name === 'trendDelta' ? '28-day trend' : 'That session',
              ]} />
            <ReferenceLine y={0} stroke={TEST_COLOR} strokeDasharray="3 3" />
            <Scatter dataKey="deltaDemand" shape={<Dot r={3} color={NOW_COLOR} opacity={0.3} />} isAnimationActive={false} />
            <Line type="monotone" dataKey="trendDelta" stroke={NOW_COLOR} strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      )}

      {data.retest && (
        <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] leading-relaxed text-amber-800">
          <strong>Worth retesting.</strong> Across {data.retest.sessions} recent sessions your threshold reads{' '}
          {Math.abs(data.retest.trendPct).toFixed(1)}% {data.retest.direction === 'up' ? 'above' : 'below'}{' '}
          the {fmtDemand(thresholdToDemand(data.test?.lt2, { kind, storageMode }), kind, storageMode)} on file
          {data.retest.testAgeDays ? `, and that test is ${Math.round(data.retest.testAgeDays / 7)} weeks old` : ''}.
          Your zones are probably {data.retest.direction === 'up' ? 'too easy' : 'too hard'}.
        </div>
      )}
    </div>
  );
}

// ── The panel ──────────────────────────────────────────────────────────────

export default function SessionVsTestPanel({
  records,
  laps = [],
  sport,
  athleteId = null,
  /** Pass the athlete's tests when the caller already holds them — saves a fetch. */
  tests: testsProp = null,
  activityKey = null,
  activityDate = null,
  tempC: tempCProp = null,
  className = '',
}) {
  const [tests, setTests] = useState(testsProp);
  const [tempC, setTempC] = useState(tempCProp);
  const kind = sportKind(sport);

  useEffect(() => {
    let cancelled = false;
    if (testsProp) { setTests(testsProp); return undefined; }
    if (kind === 'swim' || kind === 'other') { setTests([]); return undefined; }
    api.get(athleteId ? `/test/list/${athleteId}` : '/test')
      .then((res) => { if (!cancelled) setTests(Array.isArray(res.data) ? res.data : []); })
      .catch(() => { if (!cancelled) setTests([]); });
    return () => { cancelled = true; };
  }, [athleteId, kind, testsProp]);

  useEffect(() => {
    if (tempCProp != null || !activityKey) return undefined;
    let cancelled = false;
    getActivityWeather(activityKey)
      .then((res) => {
        const t = res?.data?.tempC ?? res?.tempC;
        if (!cancelled && Number.isFinite(Number(t))) setTempC(Number(t));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [activityKey, tempCProp]);

  /** Most recent test of this sport on or before the session. */
  const governingTest = useMemo(() => {
    if (!Array.isArray(tests) || !tests.length) return null;
    const when = activityDate ? new Date(activityDate).getTime() : Date.now();
    const sameSport = tests.filter((t) => sportKind(t.sport) === kind);
    const before = sameSport
      .filter((t) => new Date(t.date).getTime() <= when)
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    if (before.length) return before[0];
    return sameSport.sort((a, b) => new Date(a.date) - new Date(b.date))[0] || null;
  }, [tests, kind, activityDate]);

  const anchor = useMemo(
    () => (governingTest ? extractLactateThresholds(governingTest) : null),
    [governingTest],
  );
  const slopeFit = useMemo(() => (anchor ? testHrSlope(anchor) : null), [anchor]);
  const result = useMemo(() => {
    if (tests === null) return null;
    return analyseSession({ records, sport, anchor, tempC, slopeFit });
  }, [records, sport, anchor, tempC, slopeFit, tests]);

  const lactateSamples = useMemo(() => lactateSamplesFromLaps(laps, kind), [laps, kind]);
  const comparison = useMemo(
    () => compareToTestCurve(result?.cloud, anchor, { tempAdjustBpm: result?.tempAdjustBpm || 0 }),
    [result, anchor],
  );

  if (kind === 'swim' || kind === 'other') return null;
  if (tests === null) {
    return (
      <div className={`rounded-xl border border-gray-200 bg-white p-4 ${className}`}>
        <div className="h-4 w-44 animate-pulse rounded bg-gray-100" />
      </div>
    );
  }

  if (!anchor || !(anchor.lt2 > 0)) {
    return (
      <div className={`rounded-xl border border-gray-200 bg-white p-4 ${className}`}>
        <h3 className="text-[15px] font-bold text-gray-900">Against your test</h3>
        <p className="mt-1 text-[13px] leading-relaxed text-gray-500">
          No lactate test on file for {kind === 'bike' ? 'cycling' : 'running'} yet. A test is what turns
          these sessions into zones, and what everything here compares against.
        </p>
      </div>
    );
  }

  const storageMode = anchor.storageMode;
  const hasCloud = (result?.cloud?.length || 0) >= 3;
  const testDateLabel = governingTest?.date
    ? new Date(governingTest.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
    : null;

  return (
    <div className={`rounded-xl border border-gray-200 bg-white p-4 ${className}`}>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[15px] font-bold text-gray-900">Against your test</h3>
        {testDateLabel && (
          <span className="text-[11px] text-gray-400">
            {governingTest.title || 'Lactate test'} · {testDateLabel}
          </span>
        )}
      </div>

      {/* First, because it is the sentence most sessions can support. */}
      <AtTheSameIntensity comparison={comparison} kind={kind} storageMode={storageMode} />

      {hasCloud ? (
        <ZoneScatter result={result} anchor={anchor} governingTest={governingTest}
          slopeFit={slopeFit} kind={kind} storageMode={storageMode} />
      ) : (
        <p className="mt-1 text-[13px] leading-relaxed text-gray-500">
          {result?.reason === 'no-usable-stream'
            ? 'This activity has no second-by-second data to place against your zones.'
            : 'No heart rate recorded on this session, so there is nothing to compare with your test.'}
        </p>
      )}

      <LactateVsCurve anchor={anchor} samples={lactateSamples} kind={kind} storageMode={storageMode} />
      <DriftFromHeartRate result={result} kind={kind} storageMode={storageMode} testDateLabel={testDateLabel} />
      <DriftHistory athleteId={athleteId} anchor={anchor} kind={kind}
        storageMode={storageMode} governingTest={governingTest} />
    </div>
  );
}

