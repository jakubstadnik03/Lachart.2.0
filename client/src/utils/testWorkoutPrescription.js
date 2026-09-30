/**
 * What to train after a lactate test.
 *
 * The curve tells an athlete where LT1 and LT2 are. It does not tell them
 * what to do on Tuesday. This picks one of three weeks from how far apart
 * those two anchors sit, and points each day at a workout the planner
 * already knows how to build — so "add this week" is the same steps a
 * template would have been, with the targets still relative to LT1 and LT2.
 *
 * The split is the product: a wide gap means the floor is the limiter, a
 * narrow one means the ceiling is. The middle gets the ordinary polarized
 * week. Three sessions, not seven — a full week invented from one test
 * would be a guess about days the athlete never described.
 */

import { sportKind } from './hrPowerProfile';

/** LT1 under this share of LT2 → the aerobic floor is what to train. */
const BASE_MAX = 0.75;
/** LT1 at or above this share of LT2 → the top end is what to train. */
const CEILING_MIN = 0.88;

/**
 * Share of threshold the aerobic anchor already reaches.
 * Bike: watts / watts. Run and swim: speed / speed (the pace numbers run
 * the other way, so the ratio is flipped). Null when the pair cannot mean
 * a training week.
 */
export function aerobicShare(anchors) {
  const sport = sportKind(anchors?.sport);
  const lt1 = Number(anchors?.lt1_value);
  const lt2 = Number(anchors?.lt2_value);
  if (!['bike', 'run', 'swim'].includes(sport)) return null;
  if (!(lt1 > 0) || !(lt2 > 0)) return null;
  const ratio = sport === 'bike' ? lt1 / lt2 : lt2 / lt1;
  if (!(ratio > 0.4) || ratio > 1.05) return null;
  return ratio;
}

export function prescriptionProfile(ratio) {
  if (!(ratio > 0)) return null;
  if (ratio < BASE_MAX) return 'base';
  if (ratio >= CEILING_MIN) return 'ceiling';
  return 'balanced';
}

const WEEKS = {
  bike: {
    base: {
      headline: 'Your aerobic ceiling is the limiter',
      detail: 'Easy work runs out well before threshold, so this week builds the floor before it asks for the top. Every target follows your own LT1 and LT2.',
      sessions: [
        { presetKey: 'zone2', name: 'Zone 2 Ride', category: 'zone2', why: 'Volume under LT1. This is the session that moves the floor.' },
        { presetKey: 'bike_lt1_hour', name: 'LT1 Hour', category: 'lt1', why: 'An hour right on the ceiling you just measured, so it becomes something you can hold.' },
        { presetKey: 'sweet_spot', name: 'Sweet Spot', category: 'tempo', why: 'One harder day, still under LT2, so the week is not only easy.' },
      ],
    },
    ceiling: {
      headline: 'Your top end is the limiter',
      detail: 'You already hold a lot of aerobic work — LT1 sits close to LT2. This week raises the ceiling with threshold and a short VO₂ set.',
      sessions: [
        { presetKey: 'zone2', name: 'Zone 2 Ride', category: 'zone2', why: 'The easy day that lets the other two actually land.' },
        { presetKey: 'threshold_intervals', name: 'Threshold Intervals', category: 'lt2', why: 'Time at LT2. This is the ceiling the test says to raise.' },
        { presetKey: 'vo2max', name: 'VO2max Bike', category: 'vo2max', why: 'Short work above LT2, so threshold has somewhere to move.' },
      ],
    },
    balanced: {
      headline: 'A polarized week, set to your thresholds',
      detail: 'One easy session, one tempo, one at threshold. The intervals already point at your LT1 and LT2.',
      sessions: [
        { presetKey: 'zone2', name: 'Zone 2 Ride', category: 'zone2', why: 'The easy volume the hard days sit on.' },
        { presetKey: 'tempo', name: 'Tempo', category: 'tempo', why: 'Just under LT2. The bridge between easy and threshold.' },
        { presetKey: 'threshold_intervals', name: 'Threshold Intervals', category: 'lt2', why: 'The threshold work, in repeats you can finish.' },
      ],
    },
  },
  run: {
    base: {
      headline: 'Your aerobic ceiling is the limiter',
      detail: 'Easy running runs out well before threshold, so this week builds the floor before it asks for the top. Every target follows your own LT1 and LT2.',
      sessions: [
        { presetKey: 'run_easy', name: 'Easy Run', category: 'zone2', why: 'Volume under LT1. This is the session that moves the floor.' },
        { presetKey: 'run_long', name: 'Long Run', category: 'endurance', why: 'Time on your feet at the easy pace the test just drew.' },
        { presetKey: 'run_tempo', name: 'Tempo Run', category: 'tempo', why: 'One harder day, still under LT2, so the week is not only easy.' },
      ],
    },
    ceiling: {
      headline: 'Your top end is the limiter',
      detail: 'You already hold a lot of aerobic running — LT1 sits close to LT2. This week raises the ceiling with threshold and a short VO₂ set.',
      sessions: [
        { presetKey: 'run_easy', name: 'Easy Run', category: 'zone2', why: 'The easy day that lets the other two actually land.' },
        { presetKey: 'run_threshold', name: 'Threshold Run', category: 'lt2', why: 'Time at LT2. This is the ceiling the test says to raise.' },
        { presetKey: 'run_vo2max', name: 'VO2max Run', category: 'vo2max', why: 'Short work above LT2, so threshold has somewhere to move.' },
      ],
    },
    balanced: {
      headline: 'A polarized week, set to your thresholds',
      detail: 'One easy run, one tempo, one at threshold. The intervals already point at your LT1 and LT2.',
      sessions: [
        { presetKey: 'run_easy', name: 'Easy Run', category: 'zone2', why: 'The easy volume the hard days sit on.' },
        { presetKey: 'run_tempo', name: 'Tempo Run', category: 'tempo', why: 'Just under LT2. The bridge between easy and threshold.' },
        { presetKey: 'run_threshold', name: 'Threshold Run', category: 'lt2', why: 'The threshold work, in repeats you can finish.' },
      ],
    },
  },
  swim: {
    base: {
      headline: 'Your aerobic ceiling is the limiter',
      detail: 'Easy swimming runs out well before threshold, so this week builds the floor before it asks for the top. Every target follows your own LT1 and LT2.',
      sessions: [
        { presetKey: 'swim_endurance', name: 'Endurance Set', category: 'endurance', why: 'Steady aerobic volume under LT1.' },
        { presetKey: 'swim_aerobic_200s', name: 'Aerobic 200s', category: 'zone2', why: 'Repeats at the easy pace the test just drew.' },
        { presetKey: 'swim_pull', name: 'Pull Set', category: 'tempo', why: 'One harder set, still under LT2, so the week is not only easy.' },
      ],
    },
    ceiling: {
      headline: 'Your top end is the limiter',
      detail: 'You already hold a lot of aerobic swimming — LT1 sits close to LT2. This week raises the ceiling with threshold and a short VO₂ set.',
      sessions: [
        { presetKey: 'swim_endurance', name: 'Endurance Set', category: 'endurance', why: 'The easy set that lets the other two actually land.' },
        { presetKey: 'swim_threshold', name: 'Threshold Set', category: 'lt2', why: 'Time at LT2. This is the ceiling the test says to raise.' },
        { presetKey: 'swim_vo2_8x50', name: 'VO2max 8×50', category: 'vo2max', why: 'Short work above LT2, so threshold has somewhere to move.' },
      ],
    },
    balanced: {
      headline: 'A polarized week, set to your thresholds',
      detail: 'One easy set, one tempo, one at threshold. The intervals already point at your LT1 and LT2.',
      sessions: [
        { presetKey: 'swim_endurance', name: 'Endurance Set', category: 'endurance', why: 'The easy volume the hard sets sit on.' },
        { presetKey: 'swim_pull', name: 'Pull Set', category: 'tempo', why: 'Just under LT2. The bridge between easy and threshold.' },
        { presetKey: 'swim_threshold', name: 'Threshold Set', category: 'lt2', why: 'The threshold work, in repeats you can finish.' },
      ],
    },
  },
};

/**
 * The three sessions, in the order they go on the week (easy, then the
 * two harder days). Null when the test has no usable LT1/LT2 pair.
 */
export function prescribeFromTest(anchors) {
  const sport = sportKind(anchors?.sport);
  const ratio = aerobicShare(anchors);
  const profile = prescriptionProfile(ratio);
  const week = WEEKS[sport]?.[profile];
  if (!week) return null;
  return {
    sport,
    profile,
    ratio,
    headline: week.headline,
    detail: week.detail,
    sessions: week.sessions.map((s) => ({ ...s })),
  };
}

/**
 * Tue / Thu / Sat of a week the athlete can still do as a set.
 *
 * Monday and Tuesday keep this week — Tuesday is still ahead, or is today.
 * From Wednesday on, and on Sunday, the three days would split across two
 * weeks, so the whole set moves to the next one.
 */
export function prescriptionDates(now = new Date()) {
  const d = new Date(now);
  d.setHours(12, 0, 0, 0);
  const day = d.getDay();
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((day + 6) % 7));
  if (day === 0 || day >= 3) monday.setDate(monday.getDate() + 7);
  return [1, 3, 5].map((offset) => {
    const x = new Date(monday);
    x.setDate(monday.getDate() + offset);
    x.setHours(12, 0, 0, 0);
    return x;
  });
}
