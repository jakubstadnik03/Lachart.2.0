/**
 * The curve you would probably draw, before you have drawn one.
 *
 * A new user lands on the testing page with nothing. That is honest — this app
 * is built on real lactate data and they have none — but it is also the worst
 * possible first impression, because the thing they came to see is the one
 * thing an empty page cannot show them. Most of them arrive with months of
 * training already synced, and that training says a great deal about where
 * their thresholds sit.
 *
 * So this draws the curve their own riding and running implies, and is loud
 * about which parts of it are measured and which are modelled:
 *
 *   · The **thresholds** come from their training — heart rate held flat at a
 *     fixed effort, an FTP they typed, a best twenty minutes. Every number is
 *     labelled with where it came from.
 *   · The **heart rates** are theirs, read off their own sessions wherever the
 *     streams had them.
 *   · The **lactate** is not theirs. Nobody has measured their blood, so the
 *     shape is the population one anchored at 4 mmol. The card says so in
 *     plain words rather than in a footnote, and the curve is drawn dashed —
 *     the same visual language the rest of the app uses for "not measured".
 *
 * The point of the card is not to replace a test. It is to show an athlete
 * what a test would give them, using their own numbers, at the moment they are
 * deciding whether to bother.
 */

import React, { useMemo, useState } from 'react';
import {
  Area, CartesianGrid, ComposedChart, Line, ReferenceArea, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  BeakerIcon, ChevronDownIcon, PlusIcon, SparklesIcon,
} from '@heroicons/react/24/outline';
import { sportKind, testLactateCurve, thresholdToDemand } from '../../utils/hrPowerProfile';
import { estimateAnchorFromTraining } from '../../utils/estimateAnchorFromTraining';
import { ltZoneBounds } from '../../utils/trainingZoneBounds';
import { axisTick, demandUnitLabel, fmtDemand } from '../../utils/thresholdFormat';

const CURVE_COLOR = '#7c3aed';
const LT1_COLOR = '#0ea5e9';
const LT2_COLOR = '#f97316';

const CONFIDENCE = {
  high: { label: 'strong evidence', cls: 'bg-emerald-100 text-emerald-700' },
  medium: { label: 'fair evidence', cls: 'bg-sky-100 text-sky-700' },
  low: { label: 'a rough estimate', cls: 'bg-amber-100 text-amber-700' },
};

/** Same palette as the time-in-zones bar, so a zone is one colour everywhere. */
const ZONES = [
  { key: 'z1', label: 'Z1', name: 'Recovery', color: '#60A5FA' },
  { key: 'z2', label: 'Z2', name: 'Aerobic', color: '#34D399' },
  { key: 'z3', label: 'Z3', name: 'Tempo', color: '#FBBF24' },
  { key: 'z4', label: 'Z4', name: 'Threshold', color: '#F97316' },
  { key: 'z5', label: 'Z5', name: 'VO₂max', color: '#F43F5E' },
];

function ThresholdTile({ label, name, value, hr, lactate, color, kind, storageMode, derived, hrPopulation }) {
  if (!(value > 0)) return null;
  return (
    <div className="rounded-xl border p-3" style={{ borderColor: `${color}33`, background: `${color}0F` }}>
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] font-extrabold uppercase tracking-wider" style={{ color }}>{label}</span>
        {derived && (
          <span className="rounded-full bg-white/70 px-1.5 py-px text-[9px] font-semibold text-gray-500">
            derived
          </span>
        )}
      </div>
      <div className="mt-0.5 text-[19px] font-extrabold leading-tight tabular-nums text-gray-900">
        {fmtDemand(thresholdToDemand(value, { kind, storageMode }), kind, storageMode)}
      </div>
      <div className="mt-0.5 text-[11px] font-medium text-gray-500">{name}</div>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] tabular-nums text-gray-500">
        {hr > 0 && (
          <span>
            <strong className="text-gray-700">{Math.round(hr)}</strong> bpm
            {hrPopulation && <span className="text-gray-400"> (typical)</span>}
          </span>
        )}
        {lactate > 0 && <span style={{ color }}>≈{Number(lactate).toFixed(1)} mmol</span>}
      </div>
    </div>
  );
}

/** Five zone rows off the estimate, in the unit the sport is trained in. */
function ZoneStrip({ anchor, kind, storageMode }) {
  const hrCaveat = anchor.hrIsPopulation;
  const rows = useMemo(() => {
    const ascending = kind === 'bike';
    const bounds = ltZoneBounds({ lt1: anchor.lt1, lt2: anchor.lt2, ascending });
    if (!bounds) return null;
    const hrBounds = anchor.lt1Hr > 0 && anchor.lt2Hr > 0
      ? ltZoneBounds({ lt1: anchor.lt1Hr, lt2: anchor.lt2Hr, ascending: true, top: anchor.hrMax || null })
      : null;
    return ZONES.map((z, i) => ({
      ...z,
      from: bounds[i],
      to: bounds[i + 1],
      hrFrom: hrBounds?.[i] ?? null,
      hrTo: hrBounds?.[i + 1] ?? null,
    }));
  }, [anchor, kind]);

  if (!rows) return null;
  const show = (v) => fmtDemand(thresholdToDemand(v, { kind, storageMode }), kind, storageMode);

  return (
    <div className="mt-4">
      <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-[13px] font-bold text-gray-900">The zones this would give you</h4>
        {hrCaveat && (
          <span className="text-[10.5px] text-gray-400">
            heart rates from a typical %HRmax, not measured on you
          </span>
        )}
      </div>
      <div className="overflow-hidden rounded-xl border border-gray-200">
        {rows.map((z) => (
          <div key={z.key}
            className="flex items-center gap-3 border-b border-gray-100 px-3 py-1.5 last:border-b-0">
            <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: z.color }} />
            <span className="w-6 shrink-0 text-[11px] font-bold text-gray-700">{z.label}</span>
            <span className="w-[70px] shrink-0 text-[11px] text-gray-400">{z.name}</span>
            <span className="flex-1 text-right text-[11.5px] font-semibold tabular-nums text-gray-800">
              {show(z.from)} – {show(z.to)}
            </span>
            {z.hrTo > 0 && (
              <span className="w-[92px] shrink-0 text-right text-[11px] tabular-nums text-gray-400">
                {z.key === 'z1'
                  ? `≤ ${Math.round(z.hrTo)} bpm`
                  : `${Math.round(z.hrFrom)}–${Math.round(z.hrTo)} bpm`}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── The card ───────────────────────────────────────────────────────────────

/**
 * @param {object} p
 * @param {string} p.sport            'bike' | 'run'
 * @param {object} [p.hrTestPlan]     generateHRTestPlan() output for this sport
 * @param {object} [p.profile]        athlete profile
 * @param {object} [p.powerMetrics]   /api/fit/power-metrics response
 * @param {Array}  [p.activities]     external activity summaries
 * @param {boolean} [p.loading]       the training data is still arriving
 * @param {Function} [p.onAddTest]    open the new-test form
 */
export default function PredictedCurveCard({
  sport, hrTestPlan = null, profile = null, powerMetrics = null, activities = [],
  loading = false, onAddTest = null, className = '',
}) {
  const kind = sportKind(sport);
  const [showSources, setShowSources] = useState(false);

  const anchor = useMemo(() => estimateAnchorFromTraining({
    sport: kind, hrTestPlan, profile, powerMetrics, activities,
  }), [kind, hrTestPlan, profile, powerMetrics, activities]);

  const chart = useMemo(() => {
    if (!anchor) return null;
    const curve = testLactateCurve(anchor);
    if (!curve) return null;
    const rows = curve.points.map((p) => ({ d: p.demand, lac: p.lactate }));
    const ds = rows.map((r) => r.d);
    const pad = (Math.max(...ds) - Math.min(...ds)) * 0.06 || 1;
    return { rows, domain: [Math.min(...ds) - pad, Math.max(...ds) + pad] };
  }, [anchor]);

  if (kind !== 'bike' && kind !== 'run') return null;

  if (loading && !anchor) {
    return (
      <div className={`rounded-2xl border border-gray-200 bg-white p-5 shadow-sm ${className}`}>
        <div className="h-4 w-56 animate-pulse rounded bg-gray-100" />
        <div className="mt-3 h-3 w-full animate-pulse rounded bg-gray-50" />
        <div className="mt-4 h-44 w-full animate-pulse rounded-xl bg-gray-50" />
      </div>
    );
  }

  // Nothing in the training says anything about a threshold. That is a real
  // answer and it names what would change it.
  if (!anchor || !chart) {
    return (
      <div className={`rounded-2xl border border-dashed border-gray-300 bg-white p-5 ${className}`}>
        <div className="flex items-center gap-2">
          <BeakerIcon className="h-4 w-4 text-gray-400" />
          <h3 className="text-[15px] font-bold text-gray-900">
            No {kind === 'bike' ? 'cycling' : 'running'} test yet
          </h3>
        </div>
        <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-gray-500">
          There is not enough training on file to estimate where your thresholds sit either. Connect
          Strava or Garmin, or set your {kind === 'bike' ? 'FTP' : 'threshold pace'} in your profile,
          and this page will draw the curve your training implies while you decide whether to test.
        </p>
        {onAddTest && (
          <button type="button" onClick={onAddTest}
            className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-[13px] font-semibold text-white hover:bg-primary-dark">
            <PlusIcon className="h-4 w-4" /> Add a lactate test
          </button>
        )}
      </div>
    );
  }

  const storageMode = anchor.storageMode;
  const conf = CONFIDENCE[anchor.confidence] || CONFIDENCE.low;
  const lt2Source = (anchor.sources || []).find((s) => s.threshold === 'LT2');
  const lt1Demand = thresholdToDemand(anchor.lt1, { kind, storageMode });
  const lt2Demand = thresholdToDemand(anchor.lt2, { kind, storageMode });

  return (
    <div className={`rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5 ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <SparklesIcon className="h-4 w-4 text-primary" />
          <h3 className="text-[15px] font-bold text-gray-900">
            Your estimated {kind === 'bike' ? 'cycling' : 'running'} curve
          </h3>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${conf.cls}`}>{conf.label}</span>
        </div>
        {anchor.activityCount > 0 && (
          <span className="text-[11px] text-gray-400">
            {anchor.activityCount} {kind === 'bike' ? 'rides' : 'runs'} on file from the last 6 months
          </span>
        )}
      </div>

      <p className="mt-1 max-w-3xl text-[12.5px] leading-relaxed text-gray-500">
        You have not entered a lactate test yet, so this is the curve your training implies. The
        thresholds come from {lt2Source ? lt2Source.label : 'what the app knows about you'}
        {anchor.hrIsPopulation
          ? ', and the heart rates from a typical percentage of your maximum rather than from you'
          : ', and the heart rates are read off your own sessions'}. The lactate values are the
        population shape anchored at 4&nbsp;mmol, not your blood — which is why the line is dashed.
      </p>

      <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <ThresholdTile
          label="LT1" name="Top of your easy pace" color={LT1_COLOR}
          value={anchor.lt1} hr={anchor.lt1Hr} lactate={anchor.lt1Lac}
          kind={kind} storageMode={storageMode} derived={anchor.lt1Derived}
          hrPopulation={anchor.hrIsPopulation}
        />
        <ThresholdTile
          label="LT2" name="Hardest effort you can hold steady" color={LT2_COLOR}
          value={anchor.lt2} hr={anchor.lt2Hr} lactate={anchor.lt2Lac}
          kind={kind} storageMode={storageMode}
          hrPopulation={anchor.hrIsPopulation}
        />
      </div>

      <div className="mt-4 h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chart.rows} margin={{ top: 22, right: 12, bottom: 18, left: 0 }}>
            <defs>
              <linearGradient id="pcc-fill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor={CURVE_COLOR} stopOpacity={0.18} />
                <stop offset="1" stopColor={CURVE_COLOR} stopOpacity={0} />
              </linearGradient>
            </defs>
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
              formatter={(v) => [`≈${Number(v).toFixed(1)} mmol/L`, 'Estimated']}
              labelFormatter={(v) => `${axisTick(v, kind, storageMode)}${kind === 'bike' ? ' W' : ''}`}
            />
            <ReferenceArea
              x1={Math.min(lt1Demand, lt2Demand)} x2={Math.max(lt1Demand, lt2Demand)}
              fill="#94a3b8" fillOpacity={0.07} stroke="none" ifOverflow="hidden"
            />
            <ReferenceLine x={lt1Demand} stroke={LT1_COLOR} strokeWidth={2}
              label={{ value: 'LT1', position: 'top', offset: 6, fontSize: 10, fontWeight: 600, fill: LT1_COLOR }} />
            <ReferenceLine x={lt2Demand} stroke={LT2_COLOR} strokeWidth={2}
              label={{ value: 'LT2', position: 'top', offset: 6, fontSize: 10, fontWeight: 600, fill: LT2_COLOR }} />
            <Area type="monotone" dataKey="lac" stroke="none" fill="url(#pcc-fill)" isAnimationActive={false} />
            <Line type="monotone" dataKey="lac" stroke={CURVE_COLOR} strokeWidth={2.5}
              strokeDasharray="5 4" dot={{ r: 3, fill: '#fff', stroke: CURVE_COLOR, strokeWidth: 1.8 }}
              isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Where every number came from. Folded away, because an athlete who
          trusts it should not have to read it — and one who does not, must. */}
      <button
        type="button"
        onClick={() => setShowSources((v) => !v)}
        className="mt-2 flex items-center gap-1 text-[11.5px] font-semibold text-gray-500 hover:text-gray-700"
      >
        <ChevronDownIcon className={`h-3.5 w-3.5 transition-transform ${showSources ? '' : '-rotate-90'}`} />
        Where these numbers come from
      </button>
      {showSources && (
        <ul className="mt-1.5 space-y-1.5 rounded-xl bg-gray-50 p-3">
          {(anchor.sources || []).map((s) => (
            <li key={s.threshold} className="text-[12px] leading-relaxed text-gray-600">
              <strong className="text-gray-900">{s.threshold}</strong> — {s.label}
              {s.detail ? <span className="text-gray-500">: {s.detail}</span> : null}
            </li>
          ))}
          {anchor.lt2HrLabel && (
            <li className="text-[12px] leading-relaxed text-gray-600">
              <strong className="text-gray-900">LT2 heart rate</strong> — {anchor.lt2HrLabel}
            </li>
          )}
          <li className="text-[12px] leading-relaxed text-gray-500">
            <strong className="text-gray-900">Lactate</strong> — modelled, not measured. The shape is the
            one most ramp tests draw, placed so LT2 falls on 4 mmol. Only a real test can tell you where
            yours actually sits, and for some athletes it is a long way from here.
          </li>
        </ul>
      )}

      <ZoneStrip anchor={anchor} kind={kind} storageMode={storageMode} />

      <div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 px-3.5 py-3">
        <p className="text-[12.5px] leading-relaxed text-gray-700">
          <strong className="text-gray-900">Do the test and this stops being a guess.</strong> A real
          curve pins your thresholds to blood rather than to a population average, and from then on
          every session you train is read against it — so you can see the curve move without testing
          again.
        </p>
        {onAddTest && (
          <button type="button" onClick={onAddTest}
            className="mt-2.5 inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-primary-dark">
            <PlusIcon className="h-4 w-4" /> Enter your lactate test
          </button>
        )}
      </div>
    </div>
  );
}
