/**
 * Comparison verdict — the answer first, and whether to believe it.
 *
 * Two sessions of the same workout are never identical, and most of the
 * difference an athlete stares at is measurement noise: a lactate analyser is
 * good to a few tenths, a chest strap wanders, power meters drift with
 * temperature. Reporting "+0.3 mmol" as an improvement is worse than reporting
 * nothing, because the athlete acts on it.
 *
 * So every delta here comes with a confidence call: is this bigger than the
 * noise floor for this metric *and* bigger than the spread within the sessions
 * themselves? If not, it is reported as "no measurable change" — which is a
 * real finding, not a failure to find one.
 */

/**
 * Per-metric measurement noise.
 *
 * `absolute` is the floor below which a difference is never meaningful,
 * whatever the statistics say — instrument error, plain and simple.
 * `relative` covers metrics whose error scales with the reading.
 *
 * Lactate: portable analysers (Lactate Plus, Scout) publish ±0.2–0.3 mmol/L,
 * and fingertip sweat or sampling a few seconds early moves it further.
 * Power: ±1.5% is the typical published accuracy of a decent meter.
 * Heart rate: strap-to-strap and day-to-day drift comfortably reaches 2 bpm.
 * RPE: a 1-point step is the smallest thing an athlete can actually report.
 */
export const MEASUREMENT_NOISE = {
  lactate:   { absolute: 0.4, relative: 0,     unit: 'mmol/L', decimals: 1, higherIsBetter: false },
  power:     { absolute: 3,   relative: 0.015, unit: 'W',      decimals: 0, higherIsBetter: true },
  heartRate: { absolute: 2,   relative: 0,     unit: 'bpm',    decimals: 0, higherIsBetter: false },
  RPE:       { absolute: 1,   relative: 0,     unit: '',       decimals: 1, higherIsBetter: false },
};

const DEFAULT_NOISE = { absolute: 0, relative: 0.02, unit: '', decimals: 1, higherIsBetter: true };

/**
 * Pace, in seconds per km (or per 100 m). The app stores it in the `power`
 * slot for run and swim, where *lower is better* — without this the verdict
 * congratulates a runner for slowing down. GPS and lap-boundary error make
 * anything under a couple of seconds per km meaningless.
 */
export const PACE_NOISE = {
  absolute: 2, relative: 0.005, unit: '', decimals: 0, higherIsBetter: false, isPace: true,
};

export function noiseFor(metric, override = null) {
  return override || MEASUREMENT_NOISE[metric] || DEFAULT_NOISE;
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const str = String(value).trim();
  // Pace-style "4:15" → seconds, matching how the comparison chart reads it.
  if (str.includes(':')) {
    const parts = str.split(':').map(Number);
    if (parts.some((p) => !Number.isFinite(p))) return null;
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    return null;
  }
  const n = Number(str.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/**
 * One interval's value for a metric, across every field name the app stores it
 * under. Mirrors getIntervalMetric() in NativeTrainingPage — a Strava lap calls
 * power `average_watts`, a manual result calls it `power`.
 */
function readMetric(item, metric) {
  if (!item) return null;
  if (metric === 'power') return item.power ?? item.average_watts ?? item.avgPower ?? null;
  if (metric === 'heartRate') return item.heartRate ?? item.average_heartrate ?? item.avgHeartRate ?? null;
  if (metric === 'lactate') return item.lactate ?? item.lactateValue ?? item.mmol ?? null;
  if (metric === 'RPE') return item.RPE ?? item.rpe ?? null;
  return item[metric] ?? null;
}

function mean(values) {
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Sample standard deviation (n−1). Returns 0 for a single reading. */
function stdDev(values) {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance = values.reduce((acc, v) => acc + (v - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

export function sessionDate(training) {
  const raw = training?.date || training?.timestamp || training?.createdAt;
  const d = raw ? new Date(raw) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
}

/**
 * Reduce one session to the numbers for a metric.
 *
 * @param {object} training
 * @param {string} metric
 * @param {boolean} workOnly  ignore warm-up/recovery intervals, which otherwise
 *                            drag the mean around whenever the warm-up length
 *                            differs between two sessions
 */
export function summarizeSession(training, metric, { workOnly = true, intervals = null } = {}) {
  // Manual trainings carry `results`; Strava/Garmin sessions carry `laps`, and
  // the native page hands us pre-merged intervals. Same three shapes the
  // comparison chart already handles.
  const source0 = Array.isArray(intervals) && intervals.length
    ? intervals
    : Array.isArray(training?.results) && training.results.length
      ? training.results
      : Array.isArray(training?.laps) ? training.laps : [];

  const usable = workOnly
    ? source0.filter((r) => !/warm|cool|rest|recover/i.test(String(r?.type || r?.label || r?.name || '')))
    : source0;
  const source = usable.length ? usable : source0;

  const values = source
    .map((r) => toNumber(readMetric(r, metric)))
    .filter((v) => v !== null && v > 0);

  return {
    id: training?._id || training?.stravaId || training?.id || null,
    title: training?.titleManual || training?.title || 'Session',
    date: sessionDate(training),
    n: values.length,
    values,
    mean: mean(values),
    sd: stdDev(values),
    best: values.length ? Math.min(...values) : null,
    peak: values.length ? Math.max(...values) : null,
  };
}

/**
 * Is the difference between two sessions real, or is it noise?
 *
 * Uses the standard error of the difference of two means, widened to at least
 * the instrument's own error. A difference has to clear ~1.96 SE (95%) *and*
 * the absolute noise floor to be called real — both, because either one alone
 * produces confident nonsense: statistics on two tight-but-drifting sensors, or
 * a floor test on sessions whose intervals were all over the place.
 */
export function assessDifference(a, b, metric, noiseOverride = null) {
  const noise = noiseFor(metric, noiseOverride);
  if (!a || !b || a.mean === null || b.mean === null) {
    return { comparable: false, reason: 'Not enough data in one of the sessions.' };
  }

  const delta = b.mean - a.mean;
  const absDelta = Math.abs(delta);
  const pooledMean = (Math.abs(a.mean) + Math.abs(b.mean)) / 2;

  // Instrument floor, absolute and relative parts combined.
  const floor = noise.absolute + pooledMean * noise.relative;

  // Standard error of the difference between the two session means.
  const seA = a.n > 1 ? (a.sd / Math.sqrt(a.n)) : 0;
  const seB = b.n > 1 ? (b.sd / Math.sqrt(b.n)) : 0;
  const se = Math.sqrt(seA ** 2 + seB ** 2);

  // 95% band, never narrower than the instrument can resolve.
  const band = Math.max(1.96 * se, floor);

  const significant = absDelta > band;
  const better = noise.higherIsBetter ? delta > 0 : delta < 0;

  let limitedBy = null;
  if (!significant) limitedBy = 1.96 * se > floor ? 'spread' : 'instrument';

  return {
    comparable: true,
    delta,
    absDelta,
    deltaPct: a.mean !== 0 ? (delta / Math.abs(a.mean)) * 100 : null,
    se,
    band,
    floor,
    significant,
    better: significant ? better : null,
    limitedBy,
    /** The sentence that goes under the headline number. */
    confidenceLine: significant
      ? `Real change — ${fmt(absDelta, noise)} exceeds the ${fmt(band, noise)} needed to clear measurement noise.`
      : limitedBy === 'instrument'
        ? `Within measurement error — ${fmt(absDelta, noise)} is under the ${fmt(floor, noise)} an instrument this precise can resolve. Treat these as the same.`
        : `Not distinguishable from noise — the intervals varied by more than the ${fmt(absDelta, noise)} difference between sessions.`,
  };
}

function fmt(value, noise) {
  if (value === null || value === undefined) return '—';
  if (noise.isPace) {
    // Seconds per km / per 100 m read as m:ss, never as "247".
    const total = Math.abs(Math.round(Number(value)));
    const sign = Number(value) < 0 ? '-' : '';
    return `${sign}${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
  }
  const v = Number(value).toFixed(noise.decimals);
  return noise.unit ? `${v} ${noise.unit}` : v;
}

export function formatMetric(value, metric, noiseOverride = null) {
  return fmt(value, noiseFor(metric, noiseOverride));
}

/**
 * Efficiency: how much output per heartbeat. Rising at the same heart rate, or
 * holding output at a lower one, is the clearest single sign that aerobic work
 * is paying off — and it is invisible in either metric on its own.
 *
 * Only meaningful when both power and heart rate are present.
 */
export function efficiencyFor(training, { workOnly = true, intervals = null } = {}) {
  const power = summarizeSession(training, 'power', { workOnly, intervals });
  const hr = summarizeSession(training, 'heartRate', { workOnly, intervals });
  if (!power.mean || !hr.mean) return null;
  return power.mean / hr.mean;
}

function trendSlope(points) {
  // Least-squares slope over (index, value) — index rather than date so an
  // irregular schedule doesn't let one long gap dominate the fit.
  const n = points.length;
  if (n < 3) return null;
  const xs = points.map((_, i) => i);
  const xm = mean(xs);
  const ym = mean(points);
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i += 1) {
    num += (xs[i] - xm) * (points[i] - ym);
    den += (xs[i] - xm) ** 2;
  }
  return den === 0 ? null : num / den;
}

/**
 * The whole verdict block.
 *
 * @param {Array}  trainings  same-workout sessions, oldest first
 * @param {string} metric
 * @param {object} [opts]
 * @param {boolean} [opts.workOnly]
 * @param {(t:object)=>Array} [opts.intervalsFor] supply intervals yourself when
 *        the caller has already merged them (the native page pulls Strava laps
 *        from its own cache rather than from the training document)
 * @returns {object|null}
 */
export function buildComparisonVerdict(trainings, metric, { workOnly = true, intervalsFor = null, noise: noiseOverride = null } = {}) {
  const ivs = (t) => (typeof intervalsFor === 'function' ? intervalsFor(t) : null);

  const sessions = (Array.isArray(trainings) ? trainings : [])
    .map((t) => summarizeSession(t, metric, { workOnly, intervals: ivs(t) }))
    .filter((s) => s.n > 0);

  if (sessions.length < 2) return null;

  const noise = noiseFor(metric, noiseOverride);
  const latest = sessions[sessions.length - 1];
  const previous = sessions[sessions.length - 2];
  const vsPrevious = assessDifference(previous, latest, metric, noiseOverride);

  // Best-ever by the metric's own direction, excluding the latest so "you beat
  // your best" doesn't compare the session to itself.
  const earlier = sessions.slice(0, -1);
  const best = earlier.reduce((acc, s) => {
    if (!acc) return s;
    if (noise.higherIsBetter) return s.mean > acc.mean ? s : acc;
    return s.mean < acc.mean ? s : acc;
  }, null);
  const vsBest = best ? assessDifference(best, latest, metric, noiseOverride) : null;

  // Efficiency trend across the whole set (needs power + HR on each session).
  const efficiencies = (Array.isArray(trainings) ? trainings : [])
    .map((t) => efficiencyFor(t, { workOnly, intervals: ivs(t) }))
    .filter((e) => e !== null && Number.isFinite(e));
  const effSlope = trendSlope(efficiencies);
  const efficiency = efficiencies.length >= 3 && effSlope !== null
    ? {
        current: efficiencies[efficiencies.length - 1],
        slopePerSession: effSlope,
        // Percent change per session against the first observation.
        pctPerSession: efficiencies[0] ? (effSlope / efficiencies[0]) * 100 : null,
        direction: Math.abs(effSlope) < 1e-6 ? 'flat' : effSlope > 0 ? 'improving' : 'declining',
        n: efficiencies.length,
      }
    : null;

  // Projection: extend the metric's own trend one session forward. Deliberately
  // one session, not three — a slope from a handful of workouts does not earn
  // more extrapolation than that.
  const means = sessions.map((s) => s.mean);
  const metricSlope = trendSlope(means);
  const projection = metricSlope !== null
    ? {
        next: latest.mean + metricSlope,
        slopePerSession: metricSlope,
        direction: Math.abs(metricSlope) < noise.absolute / 4
          ? 'flat'
          : (noise.higherIsBetter ? metricSlope > 0 : metricSlope < 0) ? 'improving' : 'declining',
        basedOn: sessions.length,
      }
    : null;

  const headline = buildHeadline({ metric, latest, previous, vsPrevious, vsBest, best, noise });

  return {
    metric,
    noise,
    unit: noise.unit,
    sessions,
    latest,
    previous,
    best,
    vsPrevious,
    vsBest,
    efficiency,
    projection,
    headline,
  };
}

function buildHeadline({ metric, latest, previous, vsPrevious, vsBest, best, noise }) {
  // Run and swim put pace in the `power` slot — calling that "Power" in the
  // verdict is how a runner ends up reading watts that don't exist.
  const label = noise.isPace
    ? 'Pace'
    : ({ power: 'Power', heartRate: 'Heart rate', lactate: 'Lactate', RPE: 'RPE' }[metric] || metric);

  if (!vsPrevious.comparable) {
    return { verdict: 'Not comparable', detail: vsPrevious.reason, tone: 'neutral' };
  }

  if (!vsPrevious.significant) {
    return {
      verdict: 'No measurable change',
      detail: `${label} ${fmt(latest.mean, noise)} vs ${fmt(previous.mean, noise)} last time.`,
      tone: 'neutral',
    };
  }

  const direction = vsPrevious.delta > 0 ? 'up' : 'down';
  const arrow = direction === 'up' ? '▲' : '▼';
  const beatBest = vsBest && vsBest.significant && vsBest.better;

  return {
    verdict: beatBest
      ? `Best yet — ${label.toLowerCase()} ${arrow} ${fmt(vsPrevious.absDelta, noise)}`
      : `${label} ${arrow} ${fmt(vsPrevious.absDelta, noise)}`,
    detail: beatBest
      ? `${fmt(latest.mean, noise)}, past your previous best of ${fmt(best.mean, noise)}.`
      : `${fmt(latest.mean, noise)} vs ${fmt(previous.mean, noise)} last time.`,
    tone: vsPrevious.better ? 'good' : 'bad',
  };
}
