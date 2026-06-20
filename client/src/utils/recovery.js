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
 * Assess overall readiness from the recovery trend + (optional) current TSB.
 * @param {Array} days wellness rows (chronological)
 * @param {{ tsb?: number|null }} [opts]
 * @returns {{ level:'high'|'watch'|'ok', label:string, color:string, hex:string, reasons:string[] } | null}
 */
export function assessReadiness(days, { tsb = null } = {}) {
  const latest = days?.length ? days[days.length - 1] : null;
  if (!latest && tsb == null) return null;

  const rhrBase = baseline(days, 'restingHeartRate');
  const hrvBase = baseline(days, 'hrvMs');

  let rhrFlag = false;
  let hrvFlag = false;
  const reasons = [];

  if (rhrBase && latest?.restingHeartRate > 0) {
    const delta = (latest.restingHeartRate - rhrBase) / rhrBase;
    if (delta > 0.05) { rhrFlag = true; reasons.push(`resting HR ${Math.round(delta * 100)}% above baseline`); }
  }
  if (hrvBase && latest?.hrvMs > 0) {
    const delta = (latest.hrvMs - hrvBase) / hrvBase;
    if (delta < -0.10) { hrvFlag = true; reasons.push(`HRV ${Math.round(Math.abs(delta) * 100)}% below baseline`); }
  }

  const sleepLow = latest?.sleepMinutes > 0 && latest.sleepMinutes < 360; // < 6h
  if (sleepLow) reasons.push('short sleep');

  // Training load fatigue: very negative TSB (Form) means accumulated fatigue.
  const deepFatigue = tsb != null && tsb <= -25;
  const someFatigue = tsb != null && tsb <= -15;
  if (deepFatigue) reasons.push(`very negative Form (TSB ${Math.round(tsb)})`);
  else if (someFatigue) reasons.push(`negative Form (TSB ${Math.round(tsb)})`);

  const recoveryFlag = rhrFlag || hrvFlag;

  let level;
  if ((rhrFlag && hrvFlag) || (recoveryFlag && deepFatigue)) {
    level = 'high';
  } else if (recoveryFlag || sleepLow || deepFatigue) {
    level = 'watch';
  } else if (someFatigue && (sleepLow || recoveryFlag)) {
    level = 'watch';
  } else {
    level = 'ok';
  }

  const c = READINESS_COLORS[level];
  return { level, label: c.label, color: c.key, hex: c.hex, reasons };
}

/**
 * Per-day recovery status for a single wellness row, relative to baselines.
 * Used for the small calendar badges. Returns null when the day has no data.
 * @returns {{ level:'high'|'watch'|'ok', hex:string } | null}
 */
export function dayRecoveryStatus(day, rhrBase, hrvBase) {
  if (!day) return null;
  const hasData = day.restingHeartRate > 0 || day.hrvMs > 0 || day.sleepMinutes > 0;
  if (!hasData) return null;

  let rhrFlag = false;
  let hrvFlag = false;
  if (rhrBase && day.restingHeartRate > 0 && (day.restingHeartRate - rhrBase) / rhrBase > 0.05) rhrFlag = true;
  if (hrvBase && day.hrvMs > 0 && (day.hrvMs - hrvBase) / hrvBase < -0.10) hrvFlag = true;
  const sleepLow = day.sleepMinutes > 0 && day.sleepMinutes < 360;

  let level = 'ok';
  if (rhrFlag && hrvFlag) level = 'high';
  else if (rhrFlag || hrvFlag || sleepLow) level = 'watch';

  return { level, hex: READINESS_COLORS[level].hex };
}
