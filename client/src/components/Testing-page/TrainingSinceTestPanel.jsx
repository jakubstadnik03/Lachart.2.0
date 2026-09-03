/**
 * What your training has done to your test.
 *
 * The test page has always been able to say what a curve measured on one day.
 * This says what has happened since — and, from two independent directions,
 * what the next test would show if it were done today.
 *
 * Most people arrive at LaChart holding a lactate report somebody else printed
 * for them. They enter it, see their curve drawn back at them, and then have
 * no reason to return: the test is a photograph, and a photograph does not
 * change. The whole point of connecting a training feed to it is that every
 * steady session afterwards is a partial re-test nobody was reading — known
 * intensity, known heart rate, hours of it — and read against the test's own
 * HR–demand curve those hours say where the thresholds have moved to.
 *
 * Two predictions, deliberately kept apart rather than blended:
 *
 *   · **From training.** Heart rate at intensities the test covered, since the
 *     test. Describes the last few weeks and responds fast — to fitness, and
 *     also to heat, fatigue and illness.
 *   · **From test history.** A straight line through the tests the athlete has
 *     actually done, carried forward. Describes a season, owes nothing to
 *     heart rate, and cannot see a block that started last month.
 *
 * When they agree, that is the strongest read the app can give without a
 * needle. When they part, the disagreement is the finding — and the panel says
 * so instead of averaging it into a single confident wrong number.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  CartesianGrid, ComposedChart, Line, ReferenceArea, ReferenceLine,
  ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  ArrowTrendingUpIcon, ArrowTrendingDownIcon, BeakerIcon, BoltIcon,
  CheckCircleIcon, ExclamationTriangleIcon, InformationCircleIcon, MinusIcon,
} from '@heroicons/react/24/outline';
import { getThresholdDrift, getMonthlyPowerAnalysis } from '../../services/api';
import {
  projectFromTestHistory, shiftedLactateCurve, sportKind, testLactateCurve, zoneAdviceFor,
} from '../../utils/hrPowerProfile';
import { extractLactateThresholds } from '../../utils/extractLactateThresholds';
import { buildTestInsights, testsToDemandRows } from '../../utils/testInsights';
import {
  axisTick, demandUnitLabel, fmtDemand, fmtDemandDelta, fmtLongDate,
} from '../../utils/thresholdFormat';

// ── Palette ────────────────────────────────────────────────────────────────

const TEST_COLOR = '#94a3b8';
const TRAINING_COLOR = '#7c3aed';
const HISTORY_COLOR = '#0d9488';
const LT1_COLOR = '#0ea5e9';
const LT2_COLOR = '#f97316';

const TONE = {
  good: { border: 'border-emerald-200', bg: 'bg-emerald-50/70', title: 'text-emerald-900', icon: CheckCircleIcon, iconColor: 'text-emerald-600' },
  warn: { border: 'border-amber-200', bg: 'bg-amber-50/70', title: 'text-amber-900', icon: ExclamationTriangleIcon, iconColor: 'text-amber-600' },
  info: { border: 'border-sky-200', bg: 'bg-sky-50/70', title: 'text-sky-900', icon: InformationCircleIcon, iconColor: 'text-sky-600' },
  neutral: { border: 'border-gray-200', bg: 'bg-gray-50/70', title: 'text-gray-900', icon: BeakerIcon, iconColor: 'text-gray-500' },
};

const CONFIDENCE_LABEL = {
  high: { text: 'strong evidence', cls: 'bg-emerald-100 text-emerald-700' },
  medium: { text: 'fair evidence', cls: 'bg-sky-100 text-sky-700' },
  low: { text: 'a hint, not a number', cls: 'bg-gray-100 text-gray-500' },
};

// ── Small pieces ───────────────────────────────────────────────────────────

function Dot({ cx, cy, r, color }) {
  if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null;
  return <circle cx={cx} cy={cy} r={r} fill={color} stroke="#fff" strokeWidth={1.5} />;
}

function ConfidenceChip({ level }) {
  const c = CONFIDENCE_LABEL[level];
  if (!c) return null;
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${c.cls}`}>{c.text}</span>;
}

function InsightCard({ insight }) {
  const tone = TONE[insight.tone] || TONE.neutral;
  const Icon = tone.icon;
  return (
    <div className={`rounded-xl border ${tone.border} ${tone.bg} p-3.5`}>
      <div className="flex items-start gap-2.5">
        <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${tone.iconColor}`} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className={`text-[13.5px] font-bold leading-snug ${tone.title}`}>{insight.title}</h4>
            <ConfidenceChip level={insight.confidence} />
          </div>
          <p className="mt-1 text-[12.5px] leading-relaxed text-gray-600">{insight.body}</p>
          {insight.evidence && (
            <p className="mt-1.5 font-mono text-[10.5px] leading-relaxed text-gray-400">{insight.evidence}</p>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * One threshold, three numbers: what the test measured and what each
 * prediction makes of it. Side by side because the comparison is the point —
 * a predicted value alone invites the athlete to treat it as measured.
 */
function ThresholdRow({ label, hr, gloss, testDemand, training, history, kind, storageMode }) {
  if (!(testDemand > 0)) return null;
  const cell = (est, color) => {
    if (!est) return <span className="text-[13px] text-gray-300">—</span>;
    const up = est.shift > 0;
    const Arrow = Math.abs(est.shiftPct) < 1.5 ? MinusIcon : up ? ArrowTrendingUpIcon : ArrowTrendingDownIcon;
    return (
      <span className="flex items-baseline gap-1.5 whitespace-nowrap">
        <span className="text-[14px] font-bold tabular-nums" style={{ color }}>
          {fmtDemand(est.toDemand, kind, storageMode)}
        </span>
        <span className="flex items-center gap-0.5 text-[11px] font-semibold text-gray-400">
          <Arrow className="h-3 w-3" />
          {fmtDemandDelta(est.shift, est.toDemand, kind, storageMode)}
        </span>
      </span>
    );
  };

  return (
    <tr className="border-t border-gray-100">
      <td className="py-2 pr-3 align-top">
        <div className="text-[13px] font-bold text-gray-900">
          {label}
          {hr > 0 && <span className="ml-1.5 text-[11px] font-medium text-gray-400">{Math.round(hr)} bpm</span>}
        </div>
        <div className="text-[10.5px] leading-snug text-gray-400">{gloss}</div>
      </td>
      <td className="whitespace-nowrap py-2 pr-3 align-top text-[14px] font-bold tabular-nums text-gray-500">
        {fmtDemand(testDemand, kind, storageMode)}
      </td>
      <td className="whitespace-nowrap py-2 pr-3 align-top">{cell(training, TRAINING_COLOR)}</td>
      <td className="whitespace-nowrap py-2 align-top">{cell(history, HISTORY_COLOR)}</td>
    </tr>
  );
}

// ── The curve, and where each prediction puts it ───────────────────────────

const CURVE_MODES = [
  { key: 'training', label: 'From training', color: TRAINING_COLOR },
  { key: 'history', label: 'From test history', color: HISTORY_COLOR },
  { key: 'both', label: 'Both', color: '#475569' },
  { key: 'test', label: 'Test only', color: TEST_COLOR },
];

/**
 * The measured curve with a predicted one laid over it.
 *
 * A threshold expressed as "+14 W" is a fact about a single point and reads
 * like an accusation. The curve is the object an athlete recognises, and what
 * they want to see is it moving — so each measured stage is slid along the
 * intensity axis and the same shape redrawn where the prediction puts it. The
 * lactate values are carried across untouched; what moves is the intensity at
 * which each one appears, which is what a shifted curve means.
 *
 * The switcher exists because the two predictions are answering slightly
 * different questions, and an athlete comparing them learns more than either
 * would tell them alone.
 */
function CurveSwitcher({ anchor, training, history, kind, storageMode, mode, onMode, available }) {
  const chart = useMemo(() => {
    const test = testLactateCurve(anchor);
    if (!test) return null;
    const shifted = {
      training: training ? shiftedLactateCurve(anchor, training) : null,
      history: history ? shiftedLactateCurve(anchor, history) : null,
    };

    const rows = [...test.points.map((p) => ({ d: p.demand, testLac: p.lactate }))];
    if (mode !== 'test' && (mode === 'training' || mode === 'both') && shifted.training) {
      rows.push(...shifted.training.points.map((p) => ({ d: p.demand, trainingLac: p.lactate })));
    }
    if (mode !== 'test' && (mode === 'history' || mode === 'both') && shifted.history) {
      rows.push(...shifted.history.points.map((p) => ({ d: p.demand, historyLac: p.lactate })));
    }
    rows.sort((a, b) => a.d - b.d);

    const ds = rows.map((r) => r.d);
    const pad = (Math.max(...ds) - Math.min(...ds)) * 0.06 || 1;

    /**
     * The travel of each threshold, from whichever prediction is on screen.
     * In 'both' mode only one set of bands is drawn — two overlapping bands per
     * threshold are unreadable — so the bands say which prediction they came
     * from rather than leaving the reader to guess.
     */
    const source = mode === 'history' ? history : mode === 'test' ? null : training;
    const from = mode === 'both' ? (source === history ? ' (test history)' : ' (training)') : '';
    const marks = source
      ? [
        { key: 'LT1', color: LT1_COLOR, est: source.lt1, from },
        { key: 'LT2', color: LT2_COLOR, est: source.lt2, from },
      ].filter((m) => m.est)
      : [];

    return { rows, domain: [Math.min(...ds) - pad, Math.max(...ds) + pad], marks };
  }, [anchor, training, history, mode]);

  if (!chart) return null;

  const seriesLabel = {
    testLac: 'Measured on test day',
    trainingLac: 'Predicted from training',
    historyLac: 'Predicted from test history',
  };

  // Nothing to switch between: a lone disabled-looking pill is furniture, and
  // the heading would promise a movement the chart is not showing.
  const canSwitch = CURVE_MODES.filter((m) => available[m.key]).length > 1;

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-[13px] font-bold text-gray-900">
          {canSwitch ? 'Your curve, and where it sits now' : 'Your curve, as your test measured it'}
        </h4>
        {canSwitch && (
        <div className="flex flex-wrap gap-1">
          {CURVE_MODES.filter((m) => available[m.key]).map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => onMode(m.key)}
              className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                mode === m.key
                  ? 'border-transparent text-white'
                  : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'
              }`}
              style={mode === m.key ? { background: m.color } : undefined}
            >
              {m.label}
            </button>
          ))}
        </div>
        )}
      </div>

      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chart.rows} margin={{ top: 22, right: 12, bottom: 18, left: 0 }}>
            <CartesianGrid stroke="#f1f5f9" vertical={false} />
            <XAxis
              type="number" dataKey="d" domain={chart.domain}
              tickFormatter={(v) => axisTick(v, kind, storageMode)}
              tick={{ fontSize: 10, fill: '#94a3b8' }}
              axisLine={{ stroke: '#e2e8f0' }} tickLine={false}
              label={{
                value: demandUnitLabel(kind, storageMode),
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
              formatter={(v, name) => [`${Number(v).toFixed(1)} mmol/L`, seriesLabel[name] || name]}
              labelFormatter={(v) => `${axisTick(v, kind, storageMode)}${kind === 'bike' ? ' W' : ''}`}
            />

            {chart.marks.map((m) => (
              <ReferenceArea
                key={`a-${m.key}`}
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
            <Line type="monotone" dataKey="trainingLac" stroke={TRAINING_COLOR} strokeWidth={2.5}
              dot={{ r: 2.5, fill: TRAINING_COLOR }} connectNulls isAnimationActive={false} />
            <Line type="monotone" dataKey="historyLac" stroke={HISTORY_COLOR} strokeWidth={2.5}
              dot={{ r: 2.5, fill: HISTORY_COLOR }} connectNulls isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-gray-500">
        <span className="flex items-center gap-1">
          <span className="inline-block h-0 w-4 border-t-2 border-dashed" style={{ borderColor: TEST_COLOR }} />
          measured on test day
        </span>
        {(mode === 'training' || mode === 'both') && training && (
          <span className="flex items-center gap-1">
            <span className="inline-block h-0.5 w-4" style={{ background: TRAINING_COLOR }} />
            predicted from {training.sessions} sessions of training
          </span>
        )}
        {(mode === 'history' || mode === 'both') && history && (
          <span className="flex items-center gap-1">
            <span className="inline-block h-0.5 w-4" style={{ background: HISTORY_COLOR }} />
            predicted from {history.tests} past tests
          </span>
        )}
        {chart.marks.map((m) => (
          <span key={m.key} className="flex items-center gap-1">
            <span className="inline-block h-2 w-3 rounded-sm" style={{ background: m.color, opacity: 0.35 }} />
            {m.key} {fmtDemandDelta(m.est.shift, m.est.toDemand, kind, storageMode)}{m.from}
          </span>
        ))}
      </div>
      {canSwitch && (
        <p className="mt-1.5 text-[10.5px] leading-relaxed text-gray-400">
          A predicted curve is the measured one slid along the intensity axis — the lactate values are
          carried across untouched; what moves is the intensity at which each appears. It tilts as well as
          slides, because LT1 and LT2 are estimated separately and genuinely move by different amounts.
          It is evidence that it may be time to test, never a replacement for one.
        </p>
      )}
    </div>
  );
}

// ── The season ─────────────────────────────────────────────────────────────

/**
 * Tests as points, the week-by-week estimate as the line between them.
 *
 * Each point on the line was re-estimated from a trailing six weeks using only
 * sessions that had happened by then, so it is what the app would have said on
 * that date rather than a curve fitted with hindsight. Where a test dot sits
 * off the line, the line was wrong — which is the honest way to show what an
 * estimate from heart rate is worth.
 */
function SeasonChart({ timeline, testMarkers, anchor, kind, storageMode }) {
  const data = useMemo(() => {
    const rows = (timeline || []).map((p) => ({
      ms: new Date(p.date).getTime(), lt1: p.lt1, lt2: p.lt2,
    }));
    for (const m of testMarkers || []) {
      rows.push({ ms: new Date(m.date).getTime(), testLt1: m.lt1, testLt2: m.lt2 });
    }
    return rows.filter((r) => Number.isFinite(r.ms)).sort((a, b) => a.ms - b.ms);
  }, [timeline, testMarkers]);

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
    <div>
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
            <Scatter dataKey="testLt1" shape={<Dot r={5} color={LT1_COLOR} />} isAnimationActive={false} />
            <Scatter dataKey="testLt2" shape={<Dot r={5} color={LT2_COLOR} />} isAnimationActive={false} />
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

// ── Data loading ───────────────────────────────────────────────────────────

/**
 * Zone distribution either side of the test.
 *
 * Two windows of the same length so the comparison means something: the block
 * that produced the test, and the block since. Asking for a window the athlete
 * has not lived through yet would make "less volume than before" true of
 * everybody who tested last week, so the "after" window is only ever as long
 * as the time that has actually passed.
 */
const WINDOW_DAYS = 84;

/**
 * Roll the monthly analysis into one distribution for one sport.
 *
 * Zone times are kept per metric and per sport by the analysis endpoint, and
 * which one is meaningful depends on the sport: power for the bike, pace for
 * running, heart rate for anyone whose sessions carry no other channel. Same
 * priority the pre-test summary uses, so the two never disagree about how much
 * easy work a block contained.
 */
function summariseZones(raw, kind, windowDays = null) {
  const months = Array.isArray(raw) ? raw : raw ? [raw] : [];
  if (!months.length) return null;

  const pick = (m) => {
    const primary = kind === 'bike' ? m?.zones
      : kind === 'run' ? m?.runningZoneTimes
        : m?.swimmingZoneTimes;
    const hr = kind === 'bike' ? (m?.bikeHrZones || m?.hrZones)
      : kind === 'run' ? (m?.runningHrZones || m?.hrZones)
        : m?.hrZones;
    const read = (src) => {
      if (!src) return null;
      const out = [];
      for (let z = 1; z <= 5; z += 1) out.push(Number((src[z] ?? src[String(z)])?.time) || 0);
      return out.some((v) => v > 0) ? out : null;
    };
    return read(primary) || read(hr);
  };

  const zones = { z1: 0, z2: 0, z3: 0, z4: 0, z5: 0 };
  let totalTime = 0;
  let totalSessions = 0;

  for (const m of months) {
    const times = pick(m);
    if (times) for (let z = 0; z < 5; z += 1) zones[`z${z + 1}`] += times[z];
    // Sport-specific totals where the endpoint keeps them, so a runner's
    // panel is not padded out with their cycling hours.
    const sportTime = kind === 'bike' ? m?.bikeTime : kind === 'run' ? m?.runningTime : m?.swimmingTime;
    const sportCount = kind === 'bike' ? m?.bikeTrainings
      : kind === 'run' ? m?.runningTrainings : m?.swimmingTrainings;
    totalTime += Number(sportTime ?? m?.totalTime) || 0;
    totalSessions += Number(sportCount ?? m?.trainings) || 0;
  }

  const totalZoneSecs = Object.values(zones).reduce((a, b) => a + b, 0);
  if (!totalZoneSecs && !totalTime) return null;

  const zonePcts = {};
  for (let z = 1; z <= 5; z += 1) {
    zonePcts[`z${z}`] = totalZoneSecs > 0 ? Math.round((zones[`z${z}`] / totalZoneSecs) * 100) : 0;
  }
  return {
    zones,
    zonePcts,
    totalZoneSecs,
    totalTime: totalTime || totalZoneSecs,
    totalSessions,
    months: months.map((m) => m?.monthKey).filter(Boolean),
    windowDays,
    aerobicPct: (zonePcts.z1 || 0) + (zonePcts.z2 || 0),
    highIntensityPct: (zonePcts.z4 || 0) + (zonePcts.z5 || 0),
  };
}

function useZoneSplit(athleteId, testDate, kind, enabled) {
  const [split, setSplit] = useState(null);

  useEffect(() => {
    if (!enabled || !testDate) { setSplit(null); return undefined; }
    let cancelled = false;
    const test = new Date(testDate);
    if (Number.isNaN(test.getTime())) { setSplit(null); return undefined; }

    const day = 86400000;
    const now = new Date();
    const sinceDays = Math.min(WINDOW_DAYS, Math.max(0, (now - test) / day));
    const windows = {
      before: [new Date(test.getTime() - WINDOW_DAYS * day), test],
      // Symmetric with what has actually elapsed — see WINDOW_DAYS.
      after: sinceDays >= 14 ? [test, new Date(test.getTime() + sinceDays * day)] : null,
    };

    Promise.all(
      Object.entries(windows).map(async ([key, range]) => {
        if (!range) return [key, null];
        try {
          const raw = await getMonthlyPowerAnalysis(athleteId, null, {
            startDate: range[0], endDate: range[1],
          });
          const days = Math.round((range[1] - range[0]) / day);
          return [key, summariseZones(raw, kind, days)];
        } catch {
          return [key, null];
        }
      }),
    ).then((pairs) => {
      if (cancelled) return;
      const out = Object.fromEntries(pairs);
      setSplit(out.before || out.after ? out : null);
    });

    return () => { cancelled = true; };
  }, [athleteId, testDate, kind, enabled]);

  return split;
}

// ── The panel ──────────────────────────────────────────────────────────────

/**
 * @param {object} p
 * @param {object} p.test        the test currently open on the page
 * @param {Array}  [p.tests]     every test the page already holds — saves a fetch
 *                               and is what the history projection is fitted through
 * @param {string} [p.athleteId] whose data to read; the viewer's own when absent
 * @param {Function} [p.onOpenTest] jump the page to another test by id
 */
export default function TrainingSinceTestPanel({
  test: openTest, tests = [], athleteId = null, onOpenTest = null, className = '',
}) {
  const kind = sportKind(openTest?.sport);
  const supported = kind === 'bike' || kind === 'run';

  /**
   * The test everything is measured against: the most recent one of this sport.
   *
   * Not necessarily the one open on the page. The drift walk only ever gathers
   * sessions after the newest test — a ride from before it describes a
   * different athlete — so asking it about an older test would return the
   * newest test's sessions measured against the older test's curve, which is
   * a number about nothing. And re-anchoring the walk per test is not a fix:
   * every cached read is stamped with the test it was made against, so flipping
   * between two tests would re-fetch a season of streams each way.
   *
   * So the panel is honest instead: it reads against the latest test, and when
   * the athlete is looking at an older one it says which test it is talking
   * about and offers to take them there.
   */
  const governingTest = useMemo(() => {
    const sameSport = (tests || []).filter((t) => sportKind(t?.sport) === kind && t?.date);
    if (!sameSport.length) return openTest;
    const newest = sameSport.reduce((a, b) => (new Date(b.date) > new Date(a.date) ? b : a));
    return new Date(newest.date) > new Date(openTest?.date || 0) ? newest : openTest;
  }, [tests, kind, openTest]);

  const isViewingOlder = String(governingTest?._id || '') !== String(openTest?._id || '');
  const test = governingTest;

  const anchor = useMemo(() => (test ? extractLactateThresholds(test) : null), [test]);
  const storageMode = anchor?.storageMode || 'pace';

  /**
   * The anchor travels to the server rather than being recomputed there: the
   * two threshold pipelines disagree on real tests, and a panel that quotes a
   * threshold the test page above it does not show is worse than no panel.
   * Serialised so the effect does not refire for an object that has not changed.
   */
  const anchorPayload = useMemo(() => (anchor?.lt2 > 0 && anchor?.lt2Hr > 0 ? {
    lt1: anchor.lt1, lt2: anchor.lt2, lt1Hr: anchor.lt1Hr, lt2Hr: anchor.lt2Hr,
    storageMode: anchor.storageMode,
    points: (anchor.points || []).map((p) => ({ x: p.x, y: p.y, hr: p.hr })),
  } : null), [anchor]);

  const [state, setState] = useState({ loading: true, drift: null });
  const [mode, setMode] = useState(null);

  useEffect(() => {
    if (!supported || !anchorPayload) { setState({ loading: false, drift: null }); return undefined; }
    let cancelled = false;
    setState({ loading: true, drift: null });
    getThresholdDrift(kind, athleteId, anchorPayload)
      .then((res) => { if (!cancelled) setState({ loading: false, drift: res?.data ?? res }); })
      .catch(() => { if (!cancelled) setState({ loading: false, drift: null }); });
    return () => { cancelled = true; };
  }, [kind, athleteId, anchorPayload, supported]);

  const zoneSplit = useZoneSplit(athleteId, test?.date, kind, supported && !!anchorPayload);

  /**
   * Only tests up to and including the governing one. Fitting a line through
   * tests that came after it, and then presenting it as a prediction of where
   * the athlete is heading, would be hindsight dressed as foresight.
   */
  const historyRows = useMemo(() => {
    if (!anchor) return [];
    const cutoff = new Date(test?.date).getTime();
    return testsToDemandRows(tests, extractLactateThresholds, kind)
      .filter((r) => !Number.isFinite(cutoff) || new Date(r.date).getTime() <= cutoff);
  }, [tests, anchor, kind, test]);

  const history = useMemo(
    () => (anchor ? projectFromTestHistory(historyRows, anchor) : null),
    [historyRows, anchor],
  );

  const drift = state.drift;
  const training = drift?.projection || null;

  const advice = useMemo(
    () => zoneAdviceFor(training, { testDate: test?.date }),
    [training, test],
  );

  const insights = useMemo(() => (anchor ? buildTestInsights({
    anchor, test, drift, history, advice, zoneSplit,
  }) : []), [anchor, test, drift, history, advice, zoneSplit]);

  const available = useMemo(() => ({
    training: !!training,
    history: !!history,
    both: !!training && !!history,
    test: true,
  }), [training, history]);

  // Default to whichever prediction exists, preferring the one made of
  // training — it is the answer to "is this block working", which is the
  // question the athlete came with.
  const effectiveMode = mode && available[mode] ? mode : (training ? 'training' : history ? 'history' : 'test');

  if (!openTest || !test || !supported) return null;

  if (!anchor || !(anchor.lt2 > 0)) {
    return (
      <div className={`rounded-2xl border border-gray-200 bg-white p-5 shadow-sm ${className}`}>
        <h3 className="text-[15px] font-bold text-gray-900">Since your test</h3>
        <p className="mt-1 text-[13px] leading-relaxed text-gray-500">
          This test has no usable LT2 yet. Add at least three stages with lactate and heart rate and
          your training will be read against the curve they draw.
        </p>
      </div>
    );
  }

  if (state.loading) {
    return (
      <div className={`rounded-2xl border border-gray-200 bg-white p-5 shadow-sm ${className}`}>
        <div className="h-4 w-48 animate-pulse rounded bg-gray-100" />
        <div className="mt-3 h-3 w-full animate-pulse rounded bg-gray-50" />
        <div className="mt-2 h-3 w-4/5 animate-pulse rounded bg-gray-50" />
        <div className="mt-4 h-40 w-full animate-pulse rounded-xl bg-gray-50" />
      </div>
    );
  }

  const lt1Demand = training?.lt1?.fromDemand ?? history?.lt1?.fromDemand ?? null;
  const lt2Demand = training?.lt2?.fromDemand ?? history?.lt2?.fromDemand ?? null;
  const coverage = drift?.coverage;

  // The request failed rather than came back empty. Saying "connect Strava"
  // here would send an athlete who already has to go and do it again.
  if (!drift) {
    return (
      <div className={`rounded-2xl border border-gray-200 bg-white p-5 shadow-sm ${className}`}>
        <h3 className="text-[15px] font-bold text-gray-900">Since your test</h3>
        <p className="mt-1 text-[13px] leading-relaxed text-gray-500">
          Could not read your training against this test just now. Nothing is wrong with the test
          itself — reload the page to try again.
        </p>
      </div>
    );
  }

  return (
    <div className={`rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5 ${className}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-center gap-2">
          <BoltIcon className="h-4 w-4 text-primary" />
          <h3 className="text-[15px] font-bold text-gray-900">Since your test</h3>
        </div>
        <span className="text-[11px] text-gray-400">
          {test.title || 'Lactate test'} · {fmtLongDate(test.date)}
          {coverage?.considered
            ? ` · ${coverage.compared ?? coverage.read} of ${coverage.considered} sessions read`
            : ''}
        </span>
      </div>
      <p className="mt-1 max-w-3xl text-[12.5px] leading-relaxed text-gray-500">
        Every steady session since test day is a partial re-test nobody was reading — known intensity,
        known heart rate, hours of it. Read against your own curve, they say where your thresholds have
        moved to.
      </p>

      {isViewingOlder && (
        <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-sky-200 bg-sky-50/70 px-3 py-2 text-[12px] leading-relaxed text-sky-900">
          <span>
            You have opened an older test. Everything below is read against your latest
            {' '}{kind === 'bike' ? 'cycling' : 'running'} test, {fmtLongDate(test.date)} — only the
            training after it can say where you are now.
          </span>
          {onOpenTest && (
            <button
              type="button"
              onClick={() => onOpenTest(String(test._id))}
              className="rounded-full bg-sky-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-sky-700"
            >
              Open it
            </button>
          )}
        </div>
      )}

      {/* What the next test would show, from both directions. */}
      {(training || history) && (lt1Demand || lt2Demand) && (
        <div className="-mx-1 mt-4 overflow-x-auto px-1">
          <table className="w-full min-w-[520px] text-left">
            <thead>
              <tr className="text-[10.5px] uppercase tracking-wide text-gray-400">
                <th className="pb-1 pr-3 font-semibold">Threshold</th>
                <th className="pb-1 pr-3 font-semibold">Measured</th>
                <th className="pb-1 pr-3 font-semibold" style={{ color: TRAINING_COLOR }}>From training</th>
                <th className="pb-1 font-semibold" style={{ color: HISTORY_COLOR }}>From test history</th>
              </tr>
            </thead>
            <tbody>
              <ThresholdRow
                label="LT1" hr={anchor.lt1Hr} gloss="top of your easy pace"
                testDemand={lt1Demand} training={training?.lt1} history={history?.lt1}
                kind={kind} storageMode={storageMode}
              />
              <ThresholdRow
                label="LT2" hr={anchor.lt2Hr} gloss="hardest effort you can hold steady"
                testDemand={lt2Demand} training={training?.lt2} history={history?.lt2}
                kind={kind} storageMode={storageMode}
              />
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4">
        <CurveSwitcher
          anchor={anchor} training={training} history={history}
          kind={kind} storageMode={storageMode}
          mode={effectiveMode} onMode={setMode} available={available}
        />
      </div>

      {insights.length > 0 && (
        <div className="mt-5 space-y-2.5">
          <h4 className="text-[13px] font-bold text-gray-900">What your training says</h4>
          {insights.map((i) => <InsightCard key={i.id} insight={i} />)}
        </div>
      )}

      <div className="mt-5">
        <SeasonChart
          timeline={drift?.timeline} testMarkers={drift?.testMarkers}
          anchor={anchor} kind={kind} storageMode={storageMode}
        />
      </div>
    </div>
  );
}
