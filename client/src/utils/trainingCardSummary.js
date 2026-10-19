/**
 * Two small pieces of arithmetic behind the native Training page, both pulled
 * out here because both got the same thing wrong: they put two different units
 * into one number.
 */

/**
 * Duration-weighted average pace over a session's intervals.
 *
 * Why this exists at all: a run or swim created in TrainingForm stores its
 * PACE in the `power` field — see intervalPaceSec, which decodes it. The card
 * header did not know that and printed the activity's `avgPower` with a "W"
 * after it, so a 3:59/km LT2 run read "239 W" and a 6:22/km one read "382 W".
 * They were never watts; they were seconds.
 *
 * Weighted by duration rather than averaged flat, because a session is mostly
 * short recoveries by count and mostly work by time. A flat mean of
 * 10x1km with 10 short jogs between them describes the jogging.
 *
 * @param {Array} intervals
 * @param {(iv: any) => number|null} paceOf     seconds per unit, or null
 * @param {(iv: any) => number} durationOf      seconds
 * @returns {number|null} weighted mean pace in seconds, or null
 */
export function avgPaceSecOf(intervals, paceOf, durationOf) {
  if (!Array.isArray(intervals) || intervals.length === 0) return null;
  let weighted = 0;
  let total = 0;
  intervals.forEach((iv) => {
    const pace = Number(paceOf(iv));
    if (!Number.isFinite(pace) || pace <= 0) return;
    // An interval with no duration still counts — as one second, so it cannot
    // vanish from an average it belongs in.
    const dur = Math.max(1, Number(durationOf(iv)) || 0);
    weighted += pace * dur;
    total += dur;
  });
  return total > 0 ? weighted / total : null;
}

/**
 * Relative widths for the session clusters in the progress bar chart.
 *
 * Sessions are drawn proportional to how long they took, so a 50-minute
 * session is wider than a 10-minute one. The old code fell back to the lap
 * COUNT for any session whose laps carried no durations — and then summed that
 * count together with other sessions' durations in seconds.
 *
 * A 10-lap session with no durations therefore weighed 10 against a 50-minute
 * session's 3000, and got 0.3% of the chart: twenty hairline bars crushed into
 * a few pixels, with their date labels printed on top of one another, beside
 * sessions drawn at full width.
 *
 * Seconds and lap counts cannot share a denominator. If every session can be
 * measured in time, use time; the moment one cannot, every session is measured
 * by lap count instead, so that whatever the unit, it is the same one.
 *
 * @param {Array<{laps: Array<{durationSec?: number}>}>} sessions
 * @returns {number[]} one positive weight per session
 */
export function sessionWidthWeights(sessions) {
  if (!Array.isArray(sessions) || sessions.length === 0) return [];

  const lapCount = (s) => Math.max(1, Array.isArray(s?.laps) ? s.laps.length : 0);
  const duration = (s) => (Array.isArray(s?.laps) ? s.laps : [])
    .reduce((a, l) => a + (Number(l?.durationSec) || 0), 0);

  const durations = sessions.map(duration);
  const everySessionIsTimed = durations.every((d) => d > 0);

  return everySessionIsTimed ? durations : sessions.map(lapCount);
}
