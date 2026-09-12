/**
 * Recovery / training-readiness helpers shared by the dashboard wellness card,
 * the Form & Fitness overlay and the weekly calendar badges.
 *
 * Inputs are Apple Health wellness rows: { date, restingHeartRate, sleepMinutes, hrvMs }.
 * Readiness combines recovery markers (elevated resting HR, suppressed HRV,
 * short sleep) with training load (very negative TSB / Form) to flag
 * overreaching / overtraining risk.
 */

/** Mean of a metric across days, optionally excluding the most recent (today). */
export function baseline(days, key, excludeLast = true) {
  const vals = (days || []).map((d) => d?.[key]).filter((v) => v != null && v > 0);
  const pool = excludeLast ? vals.slice(0, -1) : vals;
  if (pool.length === 0) return null;
  return pool.reduce((a, b) => a + b, 0) / pool.length;
}

export const READINESS_COLORS = {
  high:  { key: 'high',  label: 'Overreaching',   hex: '#f43f5e', pill: 'bg-rose-50 text-rose-600 ring-rose-200' },
  watch: { key: 'watch', label: 'Watch recovery', hex: '#f59e0b', pill: 'bg-amber-50 text-amber-600 ring-amber-200' },
  ok:    { key: 'ok',    label: 'Recovered',      hex: '#10b981', pill: 'bg-emerald-50 text-emerald-600 ring-emerald-200' },
};

/**
 * How many days of wearable rows the readiness call wants. The baseline is
 * the mean of the days before the latest one, and a six-day mean of HRV is
 * mostly noise: one good night moves it by a fifth. Four weeks settles it.
 */
export const READINESS_BASELINE_DAYS = 28;

/**
 * Where a marker has to sit, relative to the athlete's own usual, before it
 * says anything. Fractions of the baseline. `mild` earns a mention, `strong`
 * earns the day.
 *
 * These are deliberately wide. Resting HR moves 2–3 bpm night to night and
 * HRV moves by ten to twenty percent for no reason at all, so the earlier
 * +5% / −10% lines fired on ordinary mornings — an athlete at +6% and −20%
 * was told to back off when nothing was wrong. When the athlete's own history
 * is noisier than these numbers, the lines widen to one and two standard
 * deviations of it.
 */
export const MARKER_RULES = {
  restingHeartRate: { direction: 'up',   mild: 0.07, strong: 0.12 },
  hrvMs:            { direction: 'down', mild: 0.15, strong: 0.30 },
};

/** Mean and spread of the days before the latest one. */
export function baselineStats(days, key, excludeLast = true) {
  const vals = (days || []).map((d) => d?.[key]).filter((v) => v != null && v > 0);
  const pool = excludeLast ? vals.slice(0, -1) : vals;
  if (pool.length === 0) return { mean: null, cv: 0, n: 0 };
  const mean = pool.reduce((a, b) => a + b, 0) / pool.length;
  // Fewer than five nights say nothing reliable about spread.
  if (pool.length < 5) return { mean, cv: 0, n: pool.length };
  const sd = Math.sqrt(pool.reduce((a, b) => a + (b - mean) ** 2, 0) / pool.length);
  return { mean, cv: mean > 0 ? sd / mean : 0, n: pool.length };
}

/**
 * One marker against its baseline: the signed percentage the reader sees,
 * and a score — 0 within normal, 1 past the mild line, 2 past the strong one.
 */
export function markerScore(value, stats, rule) {
  const v = Number(value);
  if (!stats?.mean || !(v > 0)) return { pct: null, score: 0 };
  const delta = (v - stats.mean) / stats.mean;
  const dev = rule.direction === 'up' ? delta : -delta;
  const cv = Number(stats.cv) || 0;
  const mildAt = Math.max(rule.mild, cv);
  const strongAt = Math.max(rule.strong, 2 * cv);
  return {
    pct: Math.round(delta * 100),
    score: dev >= strongAt ? 2 : dev >= mildAt ? 1 : 0,
  };
}

/** The wording of a flagged marker — the same in every place it is shown. */
function markerReason(key, pct) {
  if (key === 'restingHeartRate') return `resting HR ${Math.abs(pct)}% above your usual`;
  return `HRV ${Math.abs(pct)}% below your usual`;
}

/**
 * Assess overall readiness from the recovery trend + (optional) current TSB.
 *
 * Two markers, each scored 0–2 against the athlete's own baseline. One
 * marker past its mild line is worth watching; the day is only called
 * overreaching when the two together reach three — one clearly out and the
 * other leaning the same way — or when two mild flags land on deep fatigue.
 *
 * @param {Array} days wellness rows (chronological), ideally READINESS_BASELINE_DAYS of them
 * @param {{ tsb?: number|null }} [opts]
 * @returns {{ level:'high'|'watch'|'ok', label:string, color:string, hex:string, reasons:string[], metrics:object } | null}
 */
export function assessReadiness(days, { tsb = null } = {}) {
  const latest = days?.length ? days[days.length - 1] : null;
  if (!latest && tsb == null) return null;

  const rhrStats = baselineStats(days, 'restingHeartRate');
  const hrvStats = baselineStats(days, 'hrvMs');
  const rhr = markerScore(latest?.restingHeartRate, rhrStats, MARKER_RULES.restingHeartRate);
  const hrv = markerScore(latest?.hrvMs, hrvStats, MARKER_RULES.hrvMs);

  const reasons = [];
  if (rhr.score > 0) reasons.push(markerReason('restingHeartRate', rhr.pct));
  if (hrv.score > 0) reasons.push(markerReason('hrvMs', hrv.pct));

  // Numbers, not just sentences: the UI draws meters from these, and a
  // percentage the reader can see is far easier to act on than a label.
  const metrics = {
    rhrPct: rhr.pct, hrvPct: hrv.pct,
    rhrNow: latest?.restingHeartRate ?? null, rhrBase: rhrStats.mean ?? null,
    hrvNow: latest?.hrvMs ?? null, hrvBase: hrvStats.mean ?? null,
    sleepMinutes: latest?.sleepMinutes ?? null,
    tsb: tsb ?? null,
  };

  const sleepLow = latest?.sleepMinutes > 0 && latest.sleepMinutes < 360; // < 6h
  if (sleepLow) reasons.push('short sleep');

  // Training load fatigue: very negative TSB (Form) means accumulated fatigue.
  const deepFatigue = tsb != null && tsb <= -25;
  const someFatigue = tsb != null && tsb <= -15;
  if (deepFatigue) reasons.push(`very negative Form (TSB ${Math.round(tsb)})`);
  else if (someFatigue) reasons.push(`negative Form (TSB ${Math.round(tsb)})`);

  const markers = rhr.score + hrv.score;
  let level;
  if (markers >= 3 || (markers >= 2 && deepFatigue)) level = 'high';
  else if (markers >= 1 || sleepLow || deepFatigue) level = 'watch';
  else level = 'ok';

  const c = READINESS_COLORS[level];
  return { level, label: c.label, color: c.key, hex: c.hex, reasons, metrics };
}

/**
 * Status of one metric value vs the personal baseline ±1 SD over `days`.
 * `higherIsBetter` flips which tail counts as good/bad (HRV/sleep vs RHR).
 * @returns {'bad'|'good'|'normal'}
 */
export function metricDayStatus(value, days, key, higherIsBetter) {
  if (value == null || value <= 0) return 'normal';
  const vals = (days || []).map((d) => d?.[key]).filter((v) => v != null && v > 0);
  if (vals.length < 3) return 'normal';
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length);
  if (value < mean - sd) return higherIsBetter ? 'bad' : 'good';
  if (value > mean + sd) return higherIsBetter ? 'good' : 'bad';
  return 'normal';
}

/** Tailwind text colour for a metricDayStatus result (bad→rose, good→emerald). */
export const METRIC_STATUS_TEXT = {
  bad: 'text-rose-600',
  good: 'text-emerald-600',
  normal: 'text-gray-800',
};

/**
 * Per-day recovery status for a single wellness row, relative to baselines.
 * Used for the small calendar badges. Returns null when the day has no data.
 * @returns {{ level:'high'|'watch'|'ok', hex:string } | null}
 */
export function dayRecoveryStatus(day, rhrBase, hrvBase) {
  if (!day) return null;
  const hasData = day.restingHeartRate > 0 || day.hrvMs > 0 || day.sleepMinutes > 0;
  if (!hasData) return null;

  // Same lines as assessReadiness, without the spread — a badge has no room
  // to be subtler than that.
  const rhr = markerScore(day.restingHeartRate, { mean: rhrBase, cv: 0 }, MARKER_RULES.restingHeartRate);
  const hrv = markerScore(day.hrvMs, { mean: hrvBase, cv: 0 }, MARKER_RULES.hrvMs);
  const sleepLow = day.sleepMinutes > 0 && day.sleepMinutes < 360;

  let level = 'ok';
  if (rhr.score + hrv.score >= 3) level = 'high';
  else if (rhr.score + hrv.score >= 1 || sleepLow) level = 'watch';

  return { level, hex: READINESS_COLORS[level].hex };
}
