/**
 * wellnessScore.js - the arithmetic behind the daily wellness check-in.
 *
 * Six self-rated answers on a 1-5 scale become one 0-100 number:
 *
 *   (wellbeing + sleep + energy + (6 - stress) + (6 - avg(upper, lower)) - 5) * 5
 *
 * Stress and soreness are reverse-scored, so 100 always means "everything as
 * good as it gets". Upper and lower soreness are asked separately because a
 * strength coach programmes them separately, but they share one slot in the
 * score so a sore body counts once, not twice.
 *
 * Pain and illness are deliberately NOT in the score. They are yes/no flags
 * shown beside it, because averaging "I'm ill" into a 72 is exactly how a
 * good-looking number hides the one answer that matters.
 *
 * This is a coach's monitoring aid, not a validated readiness test. The bands
 * are where a conversation starts, not a training decision.
 */

'use strict';

/** The questions, in the order the form asks them. */
const AREAS = [
  { key: 'wellbeing', higherIsBetter: true },
  { key: 'sleep', higherIsBetter: true },
  { key: 'energy', higherIsBetter: true },
  { key: 'stress', higherIsBetter: false },
  { key: 'sorenessUpper', higherIsBetter: false },
  { key: 'sorenessLower', higherIsBetter: false },
];

const AREA_KEYS = AREAS.map((a) => a.key);

/** Score bands, drawn as the two lines on the trend chart. */
const BAND_GOOD = 60;
const BAND_LOW = 35;

const MIN_EVERY_DAYS = 2;
const MAX_EVERY_DAYS = 14;

/** A 1-5 integer, or null for anything else - a missing answer is not a 3. */
function scaleValue(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 5) return null;
  return n;
}

/** The 0-100 score, or null when any of the six answers is missing. */
function computeScore(answers) {
  const a = answers || {};
  const vals = {};
  for (const key of AREA_KEYS) {
    vals[key] = scaleValue(a[key]);
    if (vals[key] == null) return null;
  }
  const soreness = (vals.sorenessUpper + vals.sorenessLower) / 2;
  const raw = vals.wellbeing + vals.sleep + vals.energy + (6 - vals.stress) + (6 - soreness) - 5;
  return Math.round(raw * 5);
}

/** 'good' at 60 and above, 'low' below 35, 'watch' in between. */
function scoreBand(score) {
  if (score == null || !Number.isFinite(Number(score))) return null;
  if (score >= BAND_GOOD) return 'good';
  if (score < BAND_LOW) return 'low';
  return 'watch';
}

/**
 * Whether a change is good news. A drop in stress or soreness is an
 * improvement, so the direction depends on the area, and the tile colour
 * comes from here rather than from the sign of the number.
 */
function trendOf(delta, higherIsBetter = true) {
  if (delta == null || delta === 0) return 'same';
  const up = delta > 0;
  return up === higherIsBetter ? 'better' : 'worse';
}

/**
 * Change from `previous` to `latest`, per area and for the score.
 * Returns { score: { value, delta, trend }, areas: { [key]: { value, delta, trend } } }.
 * `delta` is null when there is nothing to compare against.
 */
function areaDeltas(latest, previous) {
  const out = { score: null, areas: {} };
  if (!latest) return out;
  const latestScore = latest.score != null ? latest.score : computeScore(latest);
  const prevScore = previous ? (previous.score != null ? previous.score : computeScore(previous)) : null;
  const scoreDelta = latestScore != null && prevScore != null ? latestScore - prevScore : null;
  out.score = { value: latestScore, delta: scoreDelta, trend: trendOf(scoreDelta, true) };

  for (const { key, higherIsBetter } of AREAS) {
    const value = scaleValue(latest[key]);
    const before = previous ? scaleValue(previous[key]) : null;
    const delta = value != null && before != null ? value - before : null;
    out.areas[key] = { value, delta, trend: trendOf(delta, higherIsBetter) };
  }
  return out;
}

/** Whole days from one YYYY-MM-DD to another. */
function daysBetween(fromKey, toKey) {
  const a = Date.parse(`${String(fromKey).slice(0, 10)}T00:00:00.000Z`);
  const b = Date.parse(`${String(toKey).slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86400000);
}

/** Settings as stored, with anything out of range pulled back in. */
function normalizeFrequency(raw) {
  const mode = ['off', 'daily', 'interval'].includes(raw?.mode) ? raw.mode : 'off';
  let everyDays = Math.round(Number(raw?.everyDays));
  if (!Number.isFinite(everyDays)) everyDays = MIN_EVERY_DAYS;
  everyDays = Math.min(MAX_EVERY_DAYS, Math.max(MIN_EVERY_DAYS, everyDays));
  return { mode, everyDays };
}

/**
 * Is a check-in owed today? Daily: none yet today. Every N days: the last one
 * is N or more days old. Never checked in counts as owed, once switched on.
 */
function isDue(frequency, lastDate, today) {
  const { mode, everyDays } = normalizeFrequency(frequency);
  if (mode === 'off') return false;
  if (!lastDate) return true;
  const gap = daysBetween(lastDate, today);
  if (gap == null) return true;
  return gap >= (mode === 'daily' ? 1 : everyDays);
}

module.exports = {
  AREAS,
  AREA_KEYS,
  BAND_GOOD,
  BAND_LOW,
  MIN_EVERY_DAYS,
  MAX_EVERY_DAYS,
  scaleValue,
  computeScore,
  scoreBand,
  trendOf,
  areaDeltas,
  daysBetween,
  normalizeFrequency,
  isDue,
};
