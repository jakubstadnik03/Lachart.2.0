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
import api, { getActivityWeather, getThresholdDrift } from '../../services/api';
import {
  analyseSession, compareToTestCurve, lactateCurveShift, shiftedLactateCurve,
  judgeThresholdSplit, sessionIntent, sportKind, testHrSlope, testLactateCurve,
  thresholdToDemand, timeAtThresholds, zoneAdviceFor, zoneAgreement,
} from '../../utils/hrPowerProfile';
import { extractLactateThresholds } from '../../utils/extractLactateThresholds';
import { ltZoneBounds, measuredMaxHr } from '../../utils/trainingZoneBounds';
import { axisTick, fmtDemand, fmtDemandDelta } from '../../utils/thresholdFormat';
import { requestTrainingZonesModal } from '../../utils/trainingZonesSetup';

/**
 * Apple's semantic colours, light-mode values, for everything this panel says
 * in its own voice: a verdict, a trend, a control.
 *
 * The zone hues below are deliberately NOT taken from here. They are shared
 * with TimeInZonesBar and half a dozen other cards, and a zone that is one
 * colour in this panel and a different one everywhere else is a worse bargain
 * than a zone that is not quite systemBlue.
 */
const IOS = {
  blue: '#007AFF',
  green: '#34C759',
  red: '#FF3B30',
  orange: '#FF9500',
  indigo: '#5856D6',
  label: '#000000',
  secondary: 'rgba(60,60,67,0.6)',
  tertiary: 'rgba(60,60,67,0.3)',
  separator: 'rgba(60,60,67,0.14)',
  grouped: '#F2F2F7',
};

/** SF first, then whatever the platform actually has. */
const FONT = '-apple-system, "SF Pro Text", "SF Pro Display", system-ui, sans-serif';

/** A card edge, hairline. iOS draws 0.5pt, not a 1px border. */
const HAIRLINE = { boxShadow: `0 0 0 0.5px ${IOS.separator}` };

const TEST_COLOR = 'rgba(60,60,67,0.35)';
const NOW_COLOR = IOS.indigo;
const LACTATE_COLOR = '#FF2D55';

/** Same palette as the time-in-zones bar, so a zone is one colour everywhere. */
const ZONES = [
  { id: 'Z1', label: 'Recovery', color: '#60a5fa' },
  { id: 'Z2', label: 'Endurance', color: '#34d399' },
  { id: 'Z3', label: 'Tempo', color: '#fbbf24' },
  { id: 'Z4', label: 'Threshold', color: '#f97316' },
  { id: 'Z5', label: 'VO₂max', color: '#ef4444' },
];

// ── iOS shell: the grouped list, the segmented control, the disclosure ─────

/**
 * One inset-grouped section: a quiet title in the margin, content in a white
 * card on the grouped grey. This is the whole layout idea of the redesign —
 * the panel used to be one long white column separated by hairlines, which
 * gives the eye nothing to stop at on a phone.
 */
function Section({ title, aside, children, className = '' }) {
  return (
    <section className={`mt-4 first:mt-0 ${className}`}>
      {(title || aside) && (
        <div className="mb-1.5 flex items-baseline justify-between gap-3 px-1">
          {title && (
            <h4 className="text-[12px] font-semibold uppercase tracking-[0.05em]" style={{ color: IOS.secondary }}>
              {title}
            </h4>
          )}
          {aside && <span className="text-[11px] tabular-nums" style={{ color: IOS.tertiary }}>{aside}</span>}
        </div>
      )}
      <div className="rounded-2xl bg-white px-3.5 py-3" style={HAIRLINE}>{children}</div>
    </section>
  );
}

/**
 * iOS segmented control — grey track, white pill on the selection.
 *
 * The two readings in this panel answer different questions on different time
 * scales, and stacking them made the second one something almost nobody
 * scrolled to. A segment is also the one control that fits two full labels on
 * a 375 px screen without abbreviating either.
 */
function Segmented({ value, options, onChange }) {
  return (
    <div className="flex gap-0.5 rounded-[10px] p-0.5" style={{ background: 'rgba(118,118,128,0.12)' }} role="tablist">
      {options.map((o) => {
        const on = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(o.id)}
            className={`min-h-[30px] flex-1 rounded-[8px] px-2 text-[13px] font-semibold transition-colors ${on ? 'bg-white' : ''}`}
            style={on
              ? { color: IOS.label, boxShadow: '0 1px 3px rgba(0,0,0,0.10), 0 0 0 0.5px rgba(0,0,0,0.04)' }
              : { color: IOS.secondary }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The fine print, folded away.
 *
 * Every reading here carries a caveat that matters — estimated not measured,
 * pace not grade-adjusted, extrapolated above what the session held. Deleting
 * them would make the panel dishonest and leaving them all open is what made
 * it exhausting, so they collapse.
 */
function Note({ children, label = 'How this is read' }) {
  const [open, setOpen] = useState(false);
  if (!children) return null;
  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="min-h-[28px] text-[12px] font-medium"
        style={{ color: IOS.blue }}
      >
        {open ? 'Hide details' : label}
      </button>
      {open && (
        <div className="mt-1 space-y-1 text-[12px] leading-[1.45]" style={{ color: IOS.secondary }}>
          {children}
        </div>
      )}
    </div>
  );
}

/** A row of an iOS grouped list: label left, value right, hairline between. */
function Row({ label, value, tone, sub }) {
  const color = tone === 'good' ? IOS.green : tone === 'bad' ? IOS.red : IOS.label;
  return (
    <div className="flex items-center justify-between gap-3 border-t py-2 first:border-t-0 first:pt-0"
      style={{ borderColor: IOS.separator }}>
      <div className="min-w-0">
        <div className="truncate text-[15px]" style={{ color: IOS.label }}>{label}</div>
        {sub && <div className="text-[12px]" style={{ color: IOS.secondary }}>{sub}</div>}
      </div>
      <div className="shrink-0 text-[15px] font-semibold tabular-nums" style={{ color }}>{value}</div>
    </div>
  );
}

/** The one number a section is about, at the size iOS gives a headline figure. */
function BigStat({ label, value, delta, tone = 'default' }) {
  const color = tone === 'good' ? IOS.green : tone === 'bad' ? IOS.red : IOS.label;
  return (
    <div>
      <div className="text-[12px]" style={{ color: IOS.secondary }}>{label}</div>
      <div className="text-[26px] font-semibold leading-tight tracking-[-0.02em] tabular-nums" style={{ color }}>
        {value}
      </div>
      {delta && <div className="text-[12px] tabular-nums" style={{ color: IOS.secondary }}>{delta}</div>}
    </div>
  );
}

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
  high: { label: 'Solid read', bg: 'rgba(52,199,89,0.14)', fg: '#248A3D' },
  medium: { label: 'Indicative', bg: 'rgba(255,149,0,0.16)', fg: '#B25000' },
  low: { label: 'Rough', bg: 'rgba(118,118,128,0.12)', fg: 'rgba(60,60,67,0.6)' },
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
  const color = tone === 'good' ? IOS.green : tone === 'bad' ? IOS.red : IOS.label;
  return (
    <div className="rounded-xl px-3 py-2" style={{ background: IOS.grouped }}>
      <div className="truncate text-[11px]" style={{ color: IOS.secondary }}>{label}</div>
      <div className="text-[19px] font-semibold leading-snug tracking-[-0.01em] tabular-nums" style={{ color }}>
        {value}
      </div>
      {sub ? <div className="text-[11px] tabular-nums" style={{ color: IOS.tertiary }}>{sub}</div> : null}
    </div>
  );
}

function ConfidenceChip({ level }) {
  const c = CONFIDENCE_UI[level] || CONFIDENCE_UI.low;
  return (
    <span className="shrink-0 rounded-full px-2 py-[3px] text-[11px] font-semibold"
      style={{ background: c.bg, color: c.fg }}>
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

  const Bar = ({ label, secs }) => (
    <div className="flex items-center gap-2.5">
      <span className="w-11 shrink-0 text-[12px]" style={{ color: IOS.secondary }}>{label}</span>
      <div className="flex h-2.5 flex-1 overflow-hidden rounded-full">
        {ZONES.map((z, i) => {
          const pct = totalSec > 0 ? (secs[i] / totalSec) * 100 : 0;
          if (pct <= 0) return null;
          return (
            <div
              key={z.id}
              title={`${z.id} ${z.label} — ${fmtMinutes(secs[i])}`}
              style={{ width: `${pct}%`, background: z.color }}
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
    <div className="mt-3 space-y-2 border-t pt-3" style={{ borderColor: IOS.separator }}>
      <Bar label={kind === 'bike' ? 'Power' : 'Pace'} secs={demandSec} />
      <Bar label="Heart" secs={hrSec} />
      <p className="text-[13px] leading-[1.45]" style={{ color: IOS.secondary }}>
        <strong style={{ color: IOS.label }}>{agreePct}%</strong> of the session your heart rate was in the
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
    <Section title="At the same intensity">
      <div>
        {blocks.map((b, i) => {
          const delta = Math.round(b.deltaHr);
          const tone = Math.abs(delta) < 3 ? 'default' : delta < 0 ? 'good' : 'bad';
          return (
            // Position, not content: two blocks of the same length at the same
            // intensity are a normal thing for a session to contain, and keying
            // on their values collides the moment it happens.
            <Row
              key={i}
              label={`${fmtBlock(b.sec)} at ${fmtDemand(b.demand, kind, storageMode)}`}
              sub={`${Math.round(b.hr)} bpm today · ${Math.round(b.testHr)} bpm on test day`}
              value={Math.abs(delta) < 1 ? 'same' : `${delta > 0 ? '+' : ''}${delta} bpm`}
              tone={tone}
            />
          );
        })}
      </div>

      {notable && (
        <p className="mt-2.5 text-[13px] leading-[1.45]" style={{ color: IOS.secondary }}>
          {lower
            ? 'A lower heart rate for the same effort is the shape aerobic fitness improves in.'
            : 'A higher heart rate for the same effort usually means heat, fatigue or illness before it means lost fitness.'}
        </p>
      )}

      <Note label="Where these came from">
        <p>
          {fromAverage
            ? 'Nothing held still for long enough to quote, so this is the session average.'
            : 'Read straight off your test\u2019s stages — nothing here is extrapolated. The athlete held '
              + 'an intensity the test measured, and the two heart rates are simply subtracted.'}
        </p>
      </Note>
    </Section>
  );
}

/**
 * How long the session spent at each measured threshold.
 *
 * Five-zone time-in-zone answers a question the zone model invented; LT1 and
 * LT2 are the two intensities this athlete had measured. The distinction is not
 * academic — one athlete's thresholds sit far enough apart that the derived Z4
 * comes out eleven watts wide, so "42 minutes in Z4" means something different
 * for them than for anyone else, while "42 minutes at LT2" does not.
 */
function TimeAtThresholds({ result, anchor, kind, storageMode, title, plannedTarget }) {
  const split = useMemo(() => {
    if (!result?.cloud?.length) return null;
    return timeAtThresholds(result.cloud, {
      lt1Demand: result.lt1Demand ?? thresholdToDemand(anchor?.lt1, { kind, storageMode }),
      lt2Demand: result.lt2Demand ?? thresholdToDemand(anchor?.lt2, { kind, storageMode }),
    });
  }, [result, anchor, kind, storageMode]);

  const intent = sessionIntent({ title, plannedTarget });
  const verdict = judgeThresholdSplit(intent);

  if (!split) return null;

  const rows = [
    { key: 'aboveLt2', label: 'Above LT2', color: '#ef4444', sec: split.aboveLt2 },
    { key: 'atLt2', label: 'At LT2', color: '#f97316', sec: split.atLt2 },
    { key: 'between', label: 'Between LT1 and LT2', color: '#fbbf24', sec: split.between },
    { key: 'atLt1', label: 'At LT1', color: '#34d399', sec: split.atLt1 },
    { key: 'belowLt1', label: 'Below LT1', color: '#60a5fa', sec: split.belowLt1 },
  ].filter((r) => r.sec > 0);

  const pct = (sec) => Math.round((sec / split.totalSec) * 100);
  /** Colour the row against what the session was for — never against nothing. */
  const toneOf = (key) => ({
    good: IOS.green,
    short: IOS.red,
    neutral: IOS.label,
  }[verdict[key]] || IOS.label);
  const good = rows.filter((r) => verdict[r.key] === 'good').reduce((a, r) => a + r.sec, 0);
  const short = rows.filter((r) => verdict[r.key] === 'short').reduce((a, r) => a + r.sec, 0);

  return (
    <Section title="Time at your thresholds">
      <div className="flex h-2.5 overflow-hidden rounded-full">
        {[...rows].reverse().map((r) => (
          <div key={r.key} title={`${r.label} — ${fmtBlock(r.sec)}`}
            style={{ width: `${(r.sec / split.totalSec) * 100}%`, background: r.color }} />
        ))}
      </div>

      <div className="mt-2.5">
        {rows.map((r) => (
          <div key={r.key}
            className="flex items-center gap-2.5 border-t py-2 first:border-t-0 first:pt-0"
            style={{ borderColor: IOS.separator }}
          >
            <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: r.color }} />
            <span className="min-w-0 flex-1 truncate text-[15px]" style={{ color: IOS.label }}>{r.label}</span>
            <span className="shrink-0 text-[15px] font-semibold tabular-nums" style={{ color: toneOf(r.key) }}>
              {fmtBlock(r.sec)}
            </span>
            <span className="w-10 shrink-0 text-right text-[13px] tabular-nums" style={{ color: IOS.tertiary }}>
              {pct(r.sec)}%
            </span>
          </div>
        ))}
      </div>

      {intent && (
        <p className="mt-2.5 text-[13px] leading-[1.45]" style={{ color: IOS.secondary }}>
          {intent === 'easy'
            ? <>Read as an easy session: <strong style={{ color: IOS.green }}>{fmtBlock(good)}</strong> below
              threshold{short > 0 ? <>, <strong style={{ color: IOS.red }}>{fmtBlock(short)}</strong> harder than that</> : ' throughout'}.</>
            : <>Read as {intent === 'lt2' ? 'a threshold' : 'an aerobic'} session:{' '}
              <strong style={{ color: IOS.green }}>{fmtBlock(good)}</strong> in the range it was aimed at
              {short > 0 ? <>, <strong style={{ color: IOS.red }}>{fmtBlock(short)}</strong> below it</> : ''}.</>}
        </p>
      )}

      <Note label="What “at” means">
        <p>
          Within 3% of the threshold your test measured
          {anchor?.lt2 ? ` — LT2 is ${fmtDemand(thresholdToDemand(anchor.lt2, { kind, storageMode }), kind, storageMode)}` : ''}
          {anchor?.lt1 ? `, LT1 ${fmtDemand(thresholdToDemand(anchor.lt1, { kind, storageMode }), kind, storageMode)}` : ''}.
          These are measured intensities, not zones derived from them: five-zone time-in-zone answers a
          question the zone model invented, LT1 and LT2 are the two intensities this athlete had measured.
        </p>
      </Note>
    </Section>
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
    <Section
      title={kind === 'bike' ? 'Power against heart rate' : 'Pace against heart rate'}
      aside={kind === 'bike' ? 'bpm vs W' : 'bpm vs grade-adjusted pace'}
    >
      {/* Shorter on a phone: at 224 px the chart pushed everything below it off
          a 375 px screen, and this is a shape, not a table of values. */}
      <div className="-mx-1 h-44 w-[calc(100%+0.5rem)] sm:h-56">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chart.data} margin={{ top: 18, right: 10, bottom: 14, left: 0 }}>
            <CartesianGrid stroke={IOS.separator} vertical={false} />
            {/* Intensity zones run vertically, heart-rate zones horizontally, so
                a point's position states both at once and a mismatch is visible
                as a point sitting in two differently coloured strips. */}
            {/* Uneven on purpose: two bands at equal weight multiply into mud
                wherever they cross. Intensity carries the colour, heart rate
                only tints, and the pair stays readable at the intersections. */}
            {chart.bands.map((b) => (
              <ReferenceArea key={`d-${b.id}`} x1={b.from} x2={b.to}
                fill={b.color} fillOpacity={0.14} stroke="none" ifOverflow="hidden" />
            ))}
            {chart.hrBands.map((b) => (
              <ReferenceArea key={`h-${b.id}`} y1={b.from} y2={b.to}
                fill={b.color} fillOpacity={0.05} stroke="none" ifOverflow="hidden" />
            ))}
            <XAxis
              type="number"
              dataKey="d"
              domain={chart.domain}
              tickFormatter={(v) => axisTick(v, kind, storageMode)}
              tick={{ fontSize: 11, fill: 'rgba(60,60,67,0.6)' }}
              axisLine={false}
              tickLine={false}
              tickMargin={6}
            />
            <YAxis
              type="number"
              domain={chart.hrDomain}
              tickFormatter={(v) => Math.round(v)}
              tick={{ fontSize: 11, fill: 'rgba(60,60,67,0.6)' }}
              axisLine={false}
              tickLine={false}
              width={34}
            />
            <Tooltip
              cursor={{ stroke: IOS.separator }}
              contentStyle={{
                fontSize: 12, borderRadius: 12, border: 'none', fontFamily: FONT,
                boxShadow: '0 4px 16px rgba(0,0,0,0.12)', padding: '6px 10px',
              }}
              formatter={(v, name) => [`${Math.round(v)} bpm`, name === 'testHr' ? 'Test curve' : 'This session']}
              labelFormatter={(v) => `${axisTick(v, kind, storageMode)}${kind === 'bike' ? ' W' : ''}`}
            />
            <ReferenceLine x={chart.lt2Demand} stroke={TEST_COLOR} strokeDasharray="4 4"
              label={{ value: 'LT2', position: 'top', offset: 5, fontSize: 11, fontWeight: 600, fill: IOS.secondary }} />
            {chart.lt1Demand > 0 && (
              <ReferenceLine x={chart.lt1Demand} stroke={TEST_COLOR} strokeDasharray="4 4"
                label={{ value: 'LT1', position: 'top', offset: 5, fontSize: 11, fontWeight: 600, fill: IOS.secondary }} />
            )}
            {anchor.lt2Hr > 0 && <ReferenceLine y={anchor.lt2Hr} stroke={TEST_COLOR} strokeDasharray="4 4" />}
            <Scatter dataKey="hr" shape={<Dot r={3} color={NOW_COLOR} opacity={0.42} />} isAnimationActive={false} />
            {chart.line.length > 0 && (
              <Line type="monotone" dataKey="testHr" stroke={TEST_COLOR} strokeWidth={2}
                dot={false} connectNulls isAnimationActive={false} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]" style={{ color: IOS.secondary }}>
        {ZONES.map((z) => (
          <span key={z.id} className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: z.color, opacity: 0.6 }} />
            {z.id}
          </span>
        ))}
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: NOW_COLOR, opacity: 0.42 }} />
          this session
        </span>
        {slopeFit && (
          <span className="flex items-center gap-1">
            <span className="inline-block h-0.5 w-4 rounded-full" style={{ background: TEST_COLOR }} /> test curve
          </span>
        )}
      </div>

      <ZoneSplitBars agreement={chart.agreement} kind={kind} />
    </Section>
  );
}

// ── Layer 2: blood against the curve ───────────────────────────────────────

/**
 * Blood against the curve, said as one number and drawn as two shapes.
 *
 * This used to open with a paragraph and close with a five-column table, and
 * on a phone that was a wall — the strongest, least-inferred reading in the
 * app arriving as homework. The shift is now the headline, the chart carries
 * the test curve and the punctures on top of it, and each sample states the
 * one comparison that matters: the intensity the test needed for the value
 * this session produced.
 */
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
  const moved = shift ? Math.abs(shift.shiftPct) >= 2 : false;

  return (
    <Section title="Measured lactate" aside={kind === 'bike' ? 'mmol/L vs W' : 'mmol/L vs pace'}>
      {shift ? (
        <>
          <div className="flex items-start justify-between gap-3">
            <BigStat
              label={shift.n === 1 ? 'One sample places your curve' : `${shift.n} samples place your curve`}
              value={moved
                ? fmtDemandDelta(shift.shift, shift.samples[0].demand, kind, storageMode)
                : 'unchanged'}
              delta={moved
                ? `${improved ? 'right of' : 'left of'} test day · ${Math.abs(shift.shiftPct).toFixed(1)}% of LT2`
                : 'where the test drew it'}
              tone={moved ? (improved ? 'good' : 'bad') : 'default'}
            />
            <ConfidenceChip level={shift.confidence} />
          </div>
          {moved && (
            <p className="mt-1.5 text-[13px] leading-[1.45]" style={{ color: IOS.secondary }}>
              {improved
                ? 'You are producing the same lactate at a higher intensity.'
                : 'The same lactate is arriving at a lower intensity than on test day.'}
            </p>
          )}
        </>
      ) : (
        <p className="text-[13px] leading-[1.45]" style={{ color: IOS.secondary }}>
          {samples.length === 1 ? 'This sample sits' : 'These samples sit'} outside the range your test
          covered, so there is no point on the curve to compare against.
        </p>
      )}

      <div className="-mx-1 mt-3 h-40 w-[calc(100%+0.5rem)] sm:h-44">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart margin={{ top: 8, right: 10, bottom: 12, left: 0 }}>
            <CartesianGrid stroke={IOS.separator} vertical={false} />
            <XAxis
              type="number"
              dataKey="d"
              domain={domain}
              allowDuplicatedCategory={false}
              tickFormatter={(v) => axisTick(v, kind, storageMode)}
              tick={{ fontSize: 11, fill: 'rgba(60,60,67,0.6)' }}
              axisLine={false}
              tickLine={false}
              tickMargin={6}
            />
            <YAxis
              type="number"
              dataKey="lac"
              tick={{ fontSize: 11, fill: 'rgba(60,60,67,0.6)' }}
              axisLine={false}
              tickLine={false}
              width={28}
            />
            <Tooltip
              cursor={{ stroke: IOS.separator }}
              contentStyle={{
                fontSize: 12, borderRadius: 12, border: 'none', fontFamily: FONT,
                boxShadow: '0 4px 16px rgba(0,0,0,0.12)', padding: '6px 10px',
              }}
              formatter={(v) => [`${Number(v).toFixed(1)} mmol/L`, '']}
              labelFormatter={(v) => `${axisTick(v, kind, storageMode)}${kind === 'bike' ? ' W' : ''}`}
            />
            <Line data={curveData} type="monotone" dataKey="lac" stroke={TEST_COLOR} strokeWidth={2}
              dot={false} isAnimationActive={false} />
            <Scatter data={measured} dataKey="lac" shape={<Dot r={5} color={LACTATE_COLOR} opacity={1} />}
              isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]" style={{ color: IOS.secondary }}>
        <span className="flex items-center gap-1">
          <span className="inline-block h-0.5 w-4 rounded-full" style={{ background: TEST_COLOR }} /> your test
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: LACTATE_COLOR }} /> measured today
        </span>
      </div>

      {/* The five-column table this replaces said the same thing in a shape no
          phone could hold. A sample is one comparison: the value you produced,
          and the intensity the test needed to produce it. */}
      {placed.length > 0 && (
        <div className="mt-2.5 border-t pt-1" style={{ borderColor: IOS.separator }}>
          {placed.map((sm) => (
            <Row
              key={sm.label}
              label={sm.label}
              sub={`${sm.lactate.toFixed(1)} mmol at ${fmtDemand(sm.demand, kind, storageMode)}`
                + ` · test needed ${fmtDemand(sm.expectedDemand, kind, storageMode)}`}
              value={fmtDemandDelta(sm.shift, sm.demand, kind, storageMode)}
              tone={sm.shift > 0 ? 'good' : 'bad'}
            />
          ))}
        </div>
      )}

      {kind !== 'bike' && (
        <Note label="One caveat">
          <p>Lap pace is not grade-adjusted, so a hilly session reads optimistically here.</p>
        </Note>
      )}
    </Section>
  );
}

// ── Layer 3: the threshold re-estimated from heart rate ────────────────────

function DriftFromHeartRate({ result, kind, storageMode, testDateLabel }) {
  if (!result?.ok) {
    const why = DRIFT_REASONS[result?.reason];
    if (!why) return null;
    return (
      <Section title="Threshold from heart rate">
        <p className="text-[13px] leading-[1.45]" style={{ color: IOS.secondary }}>{why}</p>
      </Section>
    );
  }

  const improved = result.deltaDemand > 0;
  const meaningful = Math.abs(result.deltaPct) >= 1.5;

  return (
    <Section title="Threshold from heart rate">
      <div className="flex items-start justify-between gap-3">
        <BigStat
          label={`At your test LT2 heart rate of ${Math.round(result.lt2Hr)} bpm you held`}
          value={fmtDemand(result.demandAtLt2Hr, kind, storageMode)}
          delta={meaningful
            ? `${fmtDemandDelta(result.deltaDemand, result.demandAtLt2Hr, kind, storageMode)} against `
              + `${fmtDemand(result.lt2Demand, kind, storageMode)} from your test`
            : `in line with your test${testDateLabel ? ` on ${testDateLabel}` : ''}`}
          tone={meaningful ? (improved ? 'good' : 'bad') : 'default'}
        />
        <ConfidenceChip level={result.confidence} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
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
          value={`${result.fit.drift >= 0 ? '+' : ''}${result.fit.drift.toFixed(1)}`}
          sub="bpm/h at constant effort"
        />
        <StatTile
          label="Decoupling"
          value={Number.isFinite(result.decoupling) ? `${result.decoupling.toFixed(1)}%` : '—'}
          sub="first half vs second"
        />
      </div>

      <Note>
        <p>
          {result.points.length} steady segments of 2.5 min, where{' '}
          {kind === 'bike' ? 'power' : 'grade-adjusted pace'} held still and heart rate had stopped climbing.
        </p>
        <p>
          Slope {result.slopeSource === 'test'
            ? `taken from your test\u2019s own stages (r² ${(result.slopeR2 ?? 0).toFixed(2)}) — this session did not span enough intensity to fit its own.`
            : `fitted from this session itself (r² ${result.fit.r2.toFixed(2)}).`}
        </p>
        <p>Heart rate shifted back {result.lagSec} s to line up with the effort that caused it.</p>
        {result.tempAdjustBpm > 0 && (
          <p>
            {result.tempAdjustBpm.toFixed(1)} bpm removed for {Math.round(result.tempC)} °C — without it the
            session would read as lost fitness.
          </p>
        )}
        {result.extrapolation > 0.3 && (
          <p style={{ color: IOS.orange }}>
            This session stayed well below LT2, so the value at LT2 is extrapolated — treat it as a hint.
          </p>
        )}
      </Note>
    </Section>
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
function ProjectedThresholds({ projection, anchor, kind, storageMode }) {
  if (!projection) return null;
  const rows = [
    { key: 'LT1', label: 'Aerobic threshold', est: projection.lt1, hr: Number(anchor?.lt1Hr) || null },
    { key: 'LT2', label: 'Anaerobic threshold', est: projection.lt2, hr: Number(anchor?.lt2Hr) || null },
  ].filter((r) => r.est);
  if (!rows.length) return null;

  return (
    <Section
      title="Where your thresholds sit now"
      aside={`${projection.sessions} sessions · ${Math.round(projection.minutes / 60)}h`}
    >
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {rows.map(({ key, label, est, hr }) => {
          const better = est.shift > 0;
          const moved = Math.abs(est.shiftPct) >= 1.5;
          const color = moved ? (better ? IOS.green : IOS.red) : IOS.label;
          return (
            <div key={key} className="rounded-xl px-3 py-2.5" style={{ background: IOS.grouped }}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[12px] font-semibold" style={{ color: IOS.secondary }}>
                  {key} · {label}
                </span>
                <ConfidenceChip level={est.confidence} />
              </div>
              <div className="mt-1 flex items-baseline gap-2 tabular-nums">
                <span className="text-[14px] line-through" style={{ color: IOS.tertiary }}>
                  {fmtDemand(est.fromDemand, kind, storageMode)}
                </span>
                <span style={{ color: IOS.tertiary }}>→</span>
                <span className="text-[22px] font-semibold tracking-[-0.02em]" style={{ color }}>
                  {fmtDemand(est.toDemand, kind, storageMode)}
                </span>
              </div>
              {/* The heart rate is the anchor, not an output: what moved is the
                  intensity at which this heart rate now appears. Printing it
                  beside the watts is what makes the estimate legible. */}
              {hr ? (
                <div className="text-[12px] tabular-nums" style={{ color: IOS.secondary }}>
                  at <strong style={{ color: IOS.label }}>{Math.round(hr)} bpm</strong> — unchanged, it is
                  what this is measured against
                </div>
              ) : null}
              <div className="text-[12px] tabular-nums" style={{ color: IOS.secondary }}>
                {moved
                  ? `${fmtDemandDelta(est.shift, est.toDemand, kind, storageMode)} (${est.shiftPct > 0 ? '+' : ''}${est.shiftPct.toFixed(1)}%) · ${est.minutes} min near ${key}`
                  : `unchanged · ${est.minutes} min near ${key}`}
              </div>
            </div>
          );
        })}
      </div>

      <Note label="Why LT1 and LT2 are separate">
        <p>
          They move separately: a block of easy volume lifts LT1 while LT2 sits still, and one averaged
          number would hide exactly the thing that block was for.
        </p>
        <p>
          Estimated from heart rate, not measured — heat, fatigue and illness move it too. Treat a change
          here as a reason to retest, never as a replacement for one.
        </p>
      </Note>
    </Section>
  );
}

/** Local to this file — nothing else keys a threshold to a colour. */
const LT1_COLOR = IOS.blue;
const LT2_COLOR = IOS.orange;

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
  const thresholdHr = { LT1: Number(anchor?.lt1Hr) || null, LT2: Number(anchor?.lt2Hr) || null };
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
    <Section title="How the curve has moved" aside={kind === 'bike' ? 'mmol/L vs W' : 'mmol/L vs pace'}>
      <div className="-mx-1 h-44 w-[calc(100%+0.5rem)] sm:h-52">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chart.rows} margin={{ top: 18, right: 10, bottom: 14, left: 0 }}>
            <CartesianGrid stroke={IOS.separator} vertical={false} />
            <XAxis
              type="number" dataKey="d" domain={chart.domain}
              tickFormatter={(v) => axisTick(v, kind, storageMode)}
              tick={{ fontSize: 11, fill: 'rgba(60,60,67,0.6)' }}
              axisLine={false} tickLine={false} tickMargin={6}
            />
            <YAxis
              type="number" tick={{ fontSize: 11, fill: 'rgba(60,60,67,0.6)' }}
              axisLine={false} tickLine={false} width={28}
            />
            <Tooltip
              cursor={{ stroke: IOS.separator }}
              contentStyle={{
                fontSize: 12, borderRadius: 12, border: 'none', fontFamily: FONT,
                boxShadow: '0 4px 16px rgba(0,0,0,0.12)', padding: '6px 10px',
              }}
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
                fill={m.color} fillOpacity={0.14} stroke="none" ifOverflow="hidden"
                label={{ value: m.key, position: 'top', offset: 5, fontSize: 11, fontWeight: 600, fill: m.color }}
              />
            ))}
            {chart.marks.map((m) => (
              <ReferenceLine key={`f-${m.key}`} x={m.est.fromDemand}
                stroke={m.color} strokeDasharray="4 4" strokeOpacity={0.5} />
            ))}
            {chart.marks.map((m) => (
              <ReferenceLine key={`t-${m.key}`} x={m.est.toDemand} stroke={m.color} strokeWidth={2} />
            ))}
            <Line type="monotone" dataKey="testLac" stroke={TEST_COLOR} strokeWidth={2}
              strokeDasharray="4 4" dot={false} connectNulls isAnimationActive={false} />
            <Line type="monotone" dataKey="nowLac" stroke={NOW_COLOR} strokeWidth={2.5}
              dot={false} connectNulls isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]" style={{ color: IOS.secondary }}>
        <span className="flex items-center gap-1">
          <span className="inline-block h-0 w-4 border-t-2 border-dashed" style={{ borderColor: TEST_COLOR }} />
          your test
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-0.5 w-4 rounded-full" style={{ background: NOW_COLOR }} /> estimated now
        </span>
      </div>

      <div className="mt-2 border-t pt-1" style={{ borderColor: IOS.separator }}>
        {chart.marks.map((m) => (
          <Row
            key={m.key}
            label={m.key}
            sub={thresholdHr[m.key] ? `at ${Math.round(thresholdHr[m.key])} bpm` : undefined}
            value={fmtDemandDelta(m.est.shift, m.est.toDemand, kind, storageMode)}
            tone={Math.abs(m.est.shiftPct) < 1.5 ? 'default' : m.est.shift > 0 ? 'good' : 'bad'}
          />
        ))}
      </div>

      <Note label="Why draw the whole curve">
        <p>
          “LT2 is 22 W lower than your test” is a fact about one point, and it reads like an accusation.
          The curve is the object you recognise: the test curve as measured, and the same shape redrawn at
          the intensities your training puts it at. It tilts as well as slides, because LT1 and LT2 are
          estimated separately and genuinely move by different amounts.
        </p>
      </Note>
    </Section>
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
function ThresholdTimeline({ timeline, testMarkers, anchor, kind, storageMode }) {
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
    <Section title="Across the season" aside="weekly estimate">
      <div className="-mx-1 h-40 w-[calc(100%+0.5rem)] sm:h-44">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 10, bottom: 4, left: 0 }}>
            <CartesianGrid stroke={IOS.separator} vertical={false} />
            <XAxis
              dataKey="ms" type="number" scale="time" domain={['dataMin', 'dataMax']}
              ticks={monthTicks}
              tickFormatter={(v) => new Date(v).toLocaleDateString(undefined, { month: 'short' })}
              tick={{ fontSize: 11, fill: 'rgba(60,60,67,0.6)' }}
              axisLine={false} tickLine={false} tickMargin={6}
            />
            <YAxis
              tick={{ fontSize: 11, fill: 'rgba(60,60,67,0.6)' }} axisLine={false} tickLine={false} width={42}
              domain={['dataMin - 10', 'dataMax + 10']}
              tickFormatter={(v) => fmtDemand(v, kind, storageMode)}
            />
            <Tooltip
              cursor={{ stroke: IOS.separator }}
              contentStyle={{
                fontSize: 12, borderRadius: 12, border: 'none', fontFamily: FONT,
                boxShadow: '0 4px 16px rgba(0,0,0,0.12)', padding: '6px 10px',
              }}
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

      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]" style={{ color: IOS.secondary }}>
        {hasLt1 && (
          <span className="flex items-center gap-1">
            <span className="inline-block h-0.5 w-4 rounded-full" style={{ background: LT1_COLOR }} />
            LT1{anchor?.lt1Hr ? ` at ${Math.round(anchor.lt1Hr)} bpm` : ''}
          </span>
        )}
        <span className="flex items-center gap-1">
          <span className="inline-block h-0.5 w-4 rounded-full" style={{ background: LT2_COLOR }} />
          LT2{anchor?.lt2Hr ? ` at ${Math.round(anchor.lt2Hr)} bpm` : ''}
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: IOS.tertiary }} /> a test you did
        </span>
      </div>

      <Note label="How the line is drawn">
        <p>
          Each point is re-estimated from a trailing six weeks using only sessions that had happened by
          then, so it is what the app would have said on that date rather than a curve fitted with
          hindsight. Where a test dot sits off the line, the line was wrong — that comparison is the
          honest way to show what an estimate from heart rate is worth.
        </p>
      </Note>
    </Section>
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
function ZoneAdvice({ advice, projection, anchor, kind, storageMode, athleteId = null }) {
  if (!advice) return null;

  const lt1 = advice.thresholds.lt1 ?? projection.lt1?.fromDemand ?? null;
  const lt2 = advice.thresholds.lt2 ?? projection.lt2?.fromDemand ?? null;
  if (!(lt2 > 0)) return null;

  // Demand is the engine's unit — watts, or metres per second. The profile
  // keeps watts, seconds per kilometre, seconds per 100 m. (The old apply
  // wrote the metres-per-second figure straight into a runner's pace zones.)
  const toProfile = (demand) => {
    if (!(demand > 0)) return null;
    if (kind === 'bike') return Math.round(demand);
    return Math.round(kind === 'swim' ? 100 / demand : 1000 / demand);
  };

  // Open the zone editor with these numbers already in it. The athlete sees
  // the zones they would get, in their own units, and decides; nothing is
  // written until they press Save. Heart-rate zones are left to the test.
  const review = () => {
    requestTrainingZonesModal({
      source: 'estimate',
      force: true,
      sport: ZONE_KEY[kind],
      prefill: {
        lt1: toProfile(lt1),
        lt2: toProfile(lt2),
        note: `Estimated from ${advice.sessions} sessions since your test — review, then save.`,
      },
      ...(athleteId ? { athleteId: String(athleteId) } : {}),
    });
  };

  return (
    <div className="mt-4 rounded-2xl px-3.5 py-3" style={{ background: 'rgba(88,86,214,0.08)' }}>
      <div className="text-[15px] font-semibold" style={{ color: IOS.indigo }}>Worth rewriting your zones</div>
      <p className="mt-1 text-[13px] leading-[1.45]" style={{ color: IOS.label }}>
        {advice.reason} Across {advice.sessions} sessions
        {advice.testAgeDays ? ` and ${Math.round(advice.testAgeDays / 7)} weeks since you tested` : ''},
        your {kind === 'bike' ? 'power' : 'pace'} zones would move to{' '}
        {advice.thresholds.lt1 ? <>LT1 <strong>{fmtDemand(lt1, kind, storageMode)}</strong>, </> : null}
        LT2 <strong>{fmtDemand(lt2, kind, storageMode)}</strong>
        {anchor?.lt2Hr ? <> — the intensity at which you now reach {Math.round(anchor.lt2Hr)} bpm</> : null}.
      </p>
      <p className="mt-1 text-[12px] leading-[1.45]" style={{ color: IOS.secondary }}>
        Heart-rate zones stay as the test measured them — only the intensity moved. A real test beats
        this; treat it as a stopgap until you do one.
      </p>
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={review}
          className="min-h-[36px] rounded-[10px] px-4 text-[15px] font-semibold text-white"
          style={{ background: IOS.indigo }}
        >
          Update my zones
        </button>
        <span className="text-[12px]" style={{ color: IOS.secondary }}>Opens the editor with these numbers filled in.</span>
      </div>
    </div>
  );
}

/**
 * The sessions the estimate was built from, openable.
 *
 * This reading asks an athlete to change how they train, and "127 sessions"
 * is a number to be taken on faith unless it can be opened. Each row says how
 * long of it sat near a threshold and which way its heart rate ran, and links
 * to the session itself.
 */
function Contributors({ contributors, athleteId, kind }) {
  const [open, setOpen] = useState(false);
  if (!contributors?.length) return null;
  const shown = open ? contributors.slice(0, 40) : [];

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="min-h-[28px] text-[12px] font-medium"
        style={{ color: IOS.blue }}
      >
        {open ? 'Hide the sessions this came from' : `Show the ${contributors.length} sessions this came from`}
      </button>
      {open && (
        <ul className="mt-1 max-h-64 overflow-y-auto">
          {shown.map((c) => {
            const delta = Number.isFinite(c.meanDeltaHr) ? Math.round(c.meanDeltaHr) : null;
            const color = delta == null || Math.abs(delta) < 3 ? IOS.tertiary
              : delta < 0 ? IOS.green : IOS.red;
            const href = `/training-calendar/${c.id}${athleteId ? `?athleteId=${athleteId}` : ''}`;
            return (
              <li key={c.id}>
                <a
                  href={href}
                  className="flex min-h-[38px] items-center gap-2 border-t text-[13px]"
                  style={{ borderColor: IOS.separator }}
                >
                  <span className="w-14 shrink-0 tabular-nums" style={{ color: IOS.tertiary }}>
                    {new Date(c.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                  </span>
                  <span className="min-w-0 flex-1 truncate" style={{ color: IOS.label }}>{c.title || 'Session'}</span>
                  <span className="shrink-0 tabular-nums" style={{ color: IOS.tertiary }}>{c.minutes} min</span>
                  <span className="w-14 shrink-0 text-right font-semibold tabular-nums" style={{ color }}>
                    {delta == null ? '—' : `${delta > 0 ? '+' : ''}${delta} bpm`}
                  </span>
                </a>
              </li>
            );
          })}
          {contributors.length > 40 && (
            <li className="border-t py-2 text-[12px]" style={{ borderColor: IOS.separator, color: IOS.tertiary }}>
              …and {contributors.length - 40} more, not listed.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

/**
 * Everything the training since the test says about where the zones now sit.
 *
 * This was six sections stacked under the session's own reading, which meant
 * the answer to "are my zones still right?" lived below five charts about one
 * ride. It is a different question on a different time scale and it gets its
 * own segment.
 *
 * The fetch lives in the panel above, not here: whether this has anything to
 * say decides whether the segmented control is worth drawing at all.
 */
function AgainstYourZones({ data, athleteId, anchor, kind, storageMode, governingTest, tests }) {
  /**
   * The measured points on the season chart, computed here for the same reason
   * the anchor is: the server's threshold pipeline and the one that drew the
   * test page disagree on real tests, and a dot that contradicts both the line
   * it sits on and the test page is worse than no dot.
   */
  const testMarkers = useMemo(() => (tests || [])
    .filter((t) => sportKind(t.sport) === kind)
    .map((t) => {
      const a = extractLactateThresholds(t);
      if (!a) return null;
      const toDemand = (v) => (v > 0 ? thresholdToDemand(v, { kind, storageMode: a.storageMode }) : null);
      const lt1 = toDemand(a.lt1);
      const lt2 = toDemand(a.lt2);
      if (!lt1 && !lt2) return null;
      return { id: String(t._id), date: t.date, title: t.title, lt1, lt2 };
    })
    .filter(Boolean)
    .sort((x, y) => new Date(x.date) - new Date(y.date)), [tests, kind]);

  const series = useMemo(
    () => (data?.series || []).map((pt) => ({ ...pt, ms: new Date(pt.date).getTime() })),
    [data],
  );

  if (!data) return null;

  return (
    <>
      {data.retest && (
        <div className="mt-4 rounded-2xl px-3.5 py-3" style={{ background: 'rgba(255,149,0,0.12)' }}>
          <div className="text-[15px] font-semibold" style={{ color: '#B25000' }}>Worth retesting</div>
          <p className="mt-1 text-[13px] leading-[1.45]" style={{ color: IOS.label }}>
            Across {data.retest.sessions} recent sessions your threshold reads{' '}
            {Math.abs(data.retest.trendPct).toFixed(1)}% {data.retest.direction === 'up' ? 'above' : 'below'}{' '}
            the {fmtDemand(thresholdToDemand(anchor?.lt2, { kind, storageMode }), kind, storageMode)} on file
            {data.retest.testAgeDays ? `, and that test is ${Math.round(data.retest.testAgeDays / 7)} weeks old` : ''}.
            Your zones are probably {data.retest.direction === 'up' ? 'too easy' : 'too hard'}.
          </p>
        </div>
      )}

      <ProjectedThresholds projection={data.projection} anchor={anchor} kind={kind} storageMode={storageMode} />

      <ZoneAdvice
        advice={zoneAdviceFor(data.projection, { testDate: governingTest?.date })}
        projection={data.projection} anchor={anchor} kind={kind} storageMode={storageMode}
        athleteId={athleteId}
      />

      <CurveShift anchor={anchor} projection={data.projection} kind={kind} storageMode={storageMode} />

      <ThresholdTimeline timeline={data.timeline} testMarkers={testMarkers}
        anchor={anchor} kind={kind} storageMode={storageMode} />

      {/* One dot per session: what that ride alone implied about the threshold,
          and the line the last 28 days of them make. This is the raw evidence
          the two sections above are built on. */}
      {series.length > 0 && (
        <Section
          title="Session by session"
          aside={`${data.coverage?.compared ?? data.coverage?.read} of ${data.coverage?.considered} read`}
        >
          <div className="-mx-1 h-32 w-[calc(100%+0.5rem)] sm:h-36">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={series} margin={{ top: 6, right: 10, bottom: 4, left: 0 }}>
                <CartesianGrid stroke={IOS.separator} vertical={false} />
                <XAxis dataKey="ms" type="number" scale="time" domain={['dataMin', 'dataMax']}
                  tickFormatter={(v) => new Date(v).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                  tick={{ fontSize: 11, fill: 'rgba(60,60,67,0.6)' }}
                  axisLine={false} tickLine={false} tickMargin={6} />
                <YAxis tick={{ fontSize: 11, fill: 'rgba(60,60,67,0.6)' }} axisLine={false} tickLine={false} width={34}
                  tickFormatter={(v) => (kind === 'bike' ? `${v > 0 ? '+' : ''}${Math.round(v)}` : `${v > 0 ? '+' : ''}${v.toFixed(1)}`)} />
                <Tooltip
                  cursor={{ stroke: IOS.separator }}
                  contentStyle={{
                    fontSize: 12, borderRadius: 12, border: 'none', fontFamily: FONT,
                    boxShadow: '0 4px 16px rgba(0,0,0,0.12)', padding: '6px 10px',
                  }}
                  labelFormatter={(v) => new Date(v).toLocaleDateString()}
                  formatter={(v, name) => [
                    kind === 'bike' ? `${v > 0 ? '+' : ''}${Math.round(v)} W` : `${v > 0 ? '+' : ''}${Number(v).toFixed(2)} m/s`,
                    name === 'trendDelta' ? '28-day trend' : 'That session',
                  ]} />
                <ReferenceLine y={0} stroke={TEST_COLOR} strokeDasharray="4 4" />
                <Scatter dataKey="deltaDemand" shape={<Dot r={3} color={NOW_COLOR} opacity={0.3} />} isAnimationActive={false} />
                <Line type="monotone" dataKey="trendDelta" stroke={NOW_COLOR} strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-1 text-[11px]" style={{ color: IOS.secondary }}>
            Each dot is one session against your test; the line is the 28-day trend through them.
          </p>
          <Contributors contributors={data.contributors} athleteId={athleteId} kind={kind} />
        </Section>
      )}
    </>
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
  /** What the session was for — used only to say whether it hit that, never invented. */
  sessionTitle = '',
  plannedTarget = null,
  tempC: tempCProp = null,
  className = '',
}) {
  const [tests, setTests] = useState(testsProp);
  const [tempC, setTempC] = useState(tempCProp);
  const [tab, setTab] = useState('session');
  const [drift, setDrift] = useState({ loading: true, data: null });
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

  /**
   * The anchor travels to the server rather than being recomputed there.
   * Serialised so the effect does not refire on every render for an object
   * that has not changed.
   */
  const anchorPayload = useMemo(() => (anchor?.lt2 > 0 && anchor?.lt2Hr > 0 ? {
    lt1: anchor.lt1, lt2: anchor.lt2, lt1Hr: anchor.lt1Hr, lt2Hr: anchor.lt2Hr,
    storageMode: anchor.storageMode,
    points: (anchor.points || []).map((pt) => ({ x: pt.x, y: pt.y, hr: pt.hr })),
  } : null), [anchor]);

  /**
   * Fetched here rather than inside the zones segment: whether that segment
   * has anything to say is what decides if the segmented control is drawn, and
   * a control that reveals an empty page is worse than no control.
   */
  useEffect(() => {
    if (!anchorPayload) { setDrift({ loading: false, data: null }); return undefined; }
    let cancelled = false;
    setDrift({ loading: true, data: null });
    getThresholdDrift(kind, athleteId, anchorPayload)
      .then((res) => { if (!cancelled) setDrift({ loading: false, data: res?.data ?? res }); })
      .catch(() => { if (!cancelled) setDrift({ loading: false, data: null }); });
    return () => { cancelled = true; };
  }, [kind, athleteId, anchorPayload]);

  if (kind === 'swim' || kind === 'other') return null;
  if (tests === null) {
    return (
      <div className={`rounded-2xl p-4 ${className}`} style={{ background: IOS.grouped, fontFamily: FONT }}>
        <div className="h-4 w-44 animate-pulse rounded-full" style={{ background: 'rgba(60,60,67,0.12)' }} />
      </div>
    );
  }

  if (!anchor || !(anchor.lt2 > 0)) {
    return (
      <div className={`rounded-2xl px-4 py-3.5 ${className}`} style={{ background: IOS.grouped, fontFamily: FONT }}>
        <h3 className="text-[17px] font-semibold tracking-[-0.01em]" style={{ color: IOS.label }}>
          Against your test
        </h3>
        <p className="mt-1 text-[13px] leading-[1.45]" style={{ color: IOS.secondary }}>
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

  const zones = drift.data;
  const hasZones = Boolean(zones?.series?.length || zones?.projection || zones?.timeline?.length);
  const showing = hasZones ? tab : 'session';

  return (
    <div className={`rounded-2xl px-3 py-3.5 sm:px-4 ${className}`}
      style={{ background: IOS.grouped, fontFamily: FONT }}>
      <div className="px-1">
        <h3 className="text-[20px] font-semibold tracking-[-0.02em]" style={{ color: IOS.label }}>
          {showing === 'zones' ? 'Against your zones' : 'Against your test'}
        </h3>
        <p className="mt-0.5 text-[12px]" style={{ color: IOS.secondary }}>
          {showing === 'zones'
            ? 'Every session since the test, and where they put your thresholds now.'
            : 'This session, read against the physiology your test measured.'}
          {testDateLabel && ` ${governingTest.title || 'Lactate test'} · ${testDateLabel}.`}
        </p>
      </div>

      {hasZones && (
        <div className="mt-3">
          <Segmented
            value={showing}
            onChange={setTab}
            options={[
              { id: 'session', label: 'This session' },
              { id: 'zones', label: 'Your zones' },
            ]}
          />
        </div>
      )}

      <div className="mt-3">
        {showing === 'session' ? (
          <>
            {/* First, because it is the sentence most sessions can support. */}
            <AtTheSameIntensity comparison={comparison} kind={kind} storageMode={storageMode} />
            <TimeAtThresholds result={result} anchor={anchor} kind={kind} storageMode={storageMode}
              title={sessionTitle} plannedTarget={plannedTarget} />

            {hasCloud ? (
              <ZoneScatter result={result} anchor={anchor} governingTest={governingTest}
                slopeFit={slopeFit} kind={kind} storageMode={storageMode} />
            ) : (
              <Section>
                <p className="text-[13px] leading-[1.45]" style={{ color: IOS.secondary }}>
                  {result?.reason === 'no-usable-stream'
                    ? 'This activity has no second-by-second data to place against your zones.'
                    : 'No heart rate recorded on this session, so there is nothing to compare with your test.'}
                </p>
              </Section>
            )}

            <LactateVsCurve anchor={anchor} samples={lactateSamples} kind={kind} storageMode={storageMode} />
            <DriftFromHeartRate result={result} kind={kind} storageMode={storageMode} testDateLabel={testDateLabel} />
          </>
        ) : (
          <AgainstYourZones data={zones} athleteId={athleteId} anchor={anchor} kind={kind}
            storageMode={storageMode} governingTest={governingTest} tests={tests} />
        )}
      </div>
    </div>
  );
}
