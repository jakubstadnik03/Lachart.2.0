/**
 * Felt versus measured.
 *
 * An RPE on its own is a number in a diary. It becomes useful the moment you
 * compare it to what the session should have felt like: 45 easy minutes rated
 * 8/10 is a signal, the same 8/10 after threshold intervals is just Tuesday.
 *
 * The gap between the two is one of the earliest things to move when an athlete
 * is heading for trouble — before resting heart rate, well before performance.
 * It also moves for heat, altitude, illness and a bad night, so this reports the
 * divergence and lets the athlete supply the reason rather than guessing at it.
 *
 * Expected RPE comes from intensity factor — the session's normalised effort as
 * a fraction of threshold — which is exactly the number LaChart's lactate
 * testing produces more accurately than a generic app's estimate.
 */

/** 1–10 session RPE. Borg 6–20 is converted on the way in and out. */
export const RPE_SCALE = { min: 1, max: 10 };
export const BORG_SCALE = { min: 6, max: 20 };

export const RPE_LABELS = {
  1: 'Very easy',
  2: 'Easy',
  3: 'Comfortable',
  4: 'Steady',
  5: 'Moderate',
  6: 'Somewhat hard',
  7: 'Hard',
  8: 'Very hard',
  9: 'Extremely hard',
  10: 'Maximal',
};

export function rpeToBorg(rpe) {
  const v = Number(rpe);
  if (!Number.isFinite(v)) return null;
  // The classic mapping: Borg 6 is rest, 20 is maximal.
  return Math.round(6 + ((v - 1) / 9) * 14);
}

export function borgToRpe(borg) {
  const v = Number(borg);
  if (!Number.isFinite(v)) return null;
  return Math.round(1 + ((v - 6) / 14) * 9);
}

/**
 * Intensity factor for a session: normalised power (or pace, or HR) as a
 * fraction of threshold. Returns null when there is nothing solid to divide by —
 * an invented IF would produce an invented expectation.
 */
export function intensityFactorFor(activity, profile) {
  if (!activity) return null;

  const np = Number(activity.normalizedPower || activity.weightedAveragePower || activity.avgPower || activity.averagePower);
  const ftp = Number(profile?.powerZones?.cycling?.lt2 || profile?.powerZones?.cycling?.ftp || profile?.ftp);
  if (np > 0 && ftp > 0) return np / ftp;

  const avgHr = Number(activity.avgHeartRate || activity.averageHeartRate);
  const thresholdHr = Number(
    profile?.heartRateZones?.cycling?.lt2
    || profile?.heartRateZones?.running?.lt2
    || profile?.heartRateZones?.cycling?.zone4?.min
    || profile?.heartRateZones?.running?.zone4?.min,
  );
  if (avgHr > 0 && thresholdHr > 0) {
    // Heart rate sits in a much narrower band than power: an easy ride is ~70%
    // of threshold HR but only ~55% of threshold power. Rescale so the same
    // expectation curve works for both.
    const hrFraction = avgHr / thresholdHr;
    return Math.max(0, (hrFraction - 0.55) / 0.45);
  }

  return null;
}

/**
 * What this session should have felt like.
 *
 * Anchored on the intensity an athlete can actually recognise: threshold (IF 1.0)
 * is a hard 8, endurance (IF 0.7) sits around 4, recovery (IF 0.5) around 2.
 * Long sessions drift up — three hours at endurance pace does not feel like one.
 */
export function expectedRpe(activity, profile) {
  const ifactor = intensityFactorFor(activity, profile);
  if (ifactor === null) return null;

  // Piecewise, because perceived effort rises far more steeply above threshold
  // than below it. A single linear fit under-reads hard sessions badly.
  let rpe;
  if (ifactor <= 0.55) rpe = 1 + ifactor * 3.6;              // recovery
  else if (ifactor <= 0.75) rpe = 3 + (ifactor - 0.55) * 10; // endurance
  else if (ifactor <= 0.95) rpe = 5 + (ifactor - 0.75) * 12.5; // tempo → threshold
  else rpe = 7.5 + (ifactor - 0.95) * 12;                    // above threshold

  // Duration drift: about a point per two hours beyond the first.
  const hours = Number(activity?.totalTime || activity?.movingTime || activity?.duration || 0) / 3600;
  if (hours > 1) rpe += Math.min(2, (hours - 1) * 0.5);

  return Math.max(1, Math.min(10, rpe));
}

/** How far outside normal a divergence has to be before it means anything. */
const NOTABLE_GAP = 1.5;

/**
 * @returns {object|null} { rpe, expected, gap, direction, verdict, note } or null
 *   when the session has no RPE or nothing to compare it against.
 */
export function assessFeltVsData(activity, profile) {
  const rpe = Number(activity?.rpe ?? activity?.RPE);
  if (!Number.isFinite(rpe) || rpe <= 0) return null;

  const expected = expectedRpe(activity, profile);
  if (expected === null) {
    return {
      rpe,
      expected: null,
      gap: null,
      direction: 'unknown',
      verdict: 'Logged',
      note: 'No power or heart-rate data to compare it against.',
    };
  }

  const gap = rpe - expected;
  const direction = Math.abs(gap) < NOTABLE_GAP ? 'matched' : gap > 0 ? 'harder' : 'easier';

  const NOTES = {
    matched: 'Felt about the way the numbers say it should have.',
    harder: 'Harder than the numbers suggest. Heat, a poor night, under-fuelling or accumulated fatigue all do this — worth a note.',
    easier: 'Easier than the numbers suggest. Often a good sign: the same work is costing you less.',
  };

  const VERDICTS = {
    matched: 'As expected',
    harder: 'Felt harder than it was',
    easier: 'Felt easier than it was',
  };

  return {
    rpe,
    expected: Math.round(expected * 10) / 10,
    gap: Math.round(gap * 10) / 10,
    direction,
    verdict: VERDICTS[direction],
    note: NOTES[direction],
  };
}

/**
 * The pattern across several sessions, which matters far more than any one.
 *
 * A single session feeling hard is weather. Several in a row feeling harder
 * than the numbers is the earliest cheap warning an athlete gets.
 */
export function assessFeltTrend(activities = [], profile, { minSessions = 4 } = {}) {
  const rated = (Array.isArray(activities) ? activities : [])
    .map((a) => ({ activity: a, felt: assessFeltVsData(a, profile) }))
    .filter((x) => x.felt && x.felt.gap !== null);

  if (rated.length < minSessions) {
    return { enough: false, n: rated.length, needed: minSessions };
  }

  const gaps = rated.map((x) => x.felt.gap);
  const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  const harderCount = gaps.filter((g) => g >= NOTABLE_GAP).length;

  // Two thirds of recent sessions reading hard is a pattern, not a bad day.
  const drifting = avgGap >= 1 && harderCount >= Math.ceil(rated.length * 0.6);

  return {
    enough: true,
    n: rated.length,
    avgGap: Math.round(avgGap * 10) / 10,
    harderCount,
    drifting,
    message: drifting
      ? `${harderCount} of your last ${rated.length} sessions felt harder than the numbers say. That pattern usually shows up before resting heart rate does — worth easing off or checking sleep and fuelling.`
      : avgGap <= -1
        ? `Recent sessions are feeling easier than the numbers predict. The same work is costing you less — that is fitness arriving.`
        : `Perceived effort is tracking the numbers closely.`,
  };
}
