/**
 * Wellness check-in score, trend deltas and due logic. Plain Node, no jest:
 *
 *   node server/utils/wellnessScore.test.js
 *
 * The score is what a coach reads first, and the tile colours are what they
 * read second. Both are easy to get backwards: stress and soreness are
 * reverse-scored, so "went up" is bad news for them and good news elsewhere.
 */

'use strict';

const assert = require('assert');
const {
  computeScore, scoreBand, trendOf, areaDeltas, isDue, daysBetween, normalizeFrequency,
} = require('./wellnessScore');

let passed = 0;
const test = (name, fn) => {
  try { fn(); passed += 1; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; }
};

const answers = (over = {}) => ({
  wellbeing: 3, sleep: 3, energy: 3, stress: 3, sorenessUpper: 3, sorenessLower: 3, ...over,
});

console.log('computeScore');

test('best answers on every question score 100', () => {
  assert.strictEqual(computeScore(answers({
    wellbeing: 5, sleep: 5, energy: 5, stress: 1, sorenessUpper: 1, sorenessLower: 1,
  })), 100);
});

test('worst answers on every question score 0', () => {
  assert.strictEqual(computeScore(answers({
    wellbeing: 1, sleep: 1, energy: 1, stress: 5, sorenessUpper: 5, sorenessLower: 5,
  })), 0);
});

test('all threes sit in the middle at 50', () => {
  assert.strictEqual(computeScore(answers()), 50);
});

test('stress is reverse-scored: more stress, lower score', () => {
  assert.ok(computeScore(answers({ stress: 5 })) < computeScore(answers({ stress: 1 })));
  assert.strictEqual(computeScore(answers({ stress: 1 })), 60);
  assert.strictEqual(computeScore(answers({ stress: 5 })), 40);
});

test('upper and lower soreness are averaged into one slot', () => {
  // avg(1, 5) = 3, the same as both at 3.
  assert.strictEqual(computeScore(answers({ sorenessUpper: 1, sorenessLower: 5 })), 50);
  // avg(2, 3) = 2.5 -> (3+3+3+3+3.5-5)*5 = 52.5 -> 53
  assert.strictEqual(computeScore(answers({ sorenessUpper: 2, sorenessLower: 3 })), 53);
});

test('half-points round to a whole number', () => {
  // avg(4, 5) = 4.5 -> (3+3+3+3+1.5-5)*5 = 42.5 -> 43
  const s = computeScore(answers({ sorenessUpper: 4, sorenessLower: 5 }));
  assert.strictEqual(s, 43);
  assert.ok(Number.isInteger(s));
});

test('the worked example from the brief', () => {
  // (4 + 2 + 3 + (6-4) + (6-avg(2,4)) - 5) * 5 = (4+2+3+2+3-5)*5 = 45
  assert.strictEqual(computeScore({
    wellbeing: 4, sleep: 2, energy: 3, stress: 4, sorenessUpper: 2, sorenessLower: 4,
  }), 45);
});

test('a missing or out-of-range answer gives no score rather than a guess', () => {
  assert.strictEqual(computeScore(answers({ sleep: null })), null);
  assert.strictEqual(computeScore(answers({ sleep: 0 })), null);
  assert.strictEqual(computeScore(answers({ sleep: 6 })), null);
  assert.strictEqual(computeScore(answers({ sleep: 2.5 })), null);
  assert.strictEqual(computeScore(null), null);
});

test('numeric strings from a form are accepted', () => {
  assert.strictEqual(computeScore(answers({ wellbeing: '5' })), 60);
});

console.log('scoreBand');

test('bands split at 60 and 35', () => {
  assert.strictEqual(scoreBand(100), 'good');
  assert.strictEqual(scoreBand(60), 'good');
  assert.strictEqual(scoreBand(59), 'watch');
  assert.strictEqual(scoreBand(35), 'watch');
  assert.strictEqual(scoreBand(34), 'low');
  assert.strictEqual(scoreBand(0), 'low');
  assert.strictEqual(scoreBand(null), null);
});

console.log('trend deltas');

test('trendOf: up is better for a positive area, worse for a reversed one', () => {
  assert.strictEqual(trendOf(1, true), 'better');
  assert.strictEqual(trendOf(-1, true), 'worse');
  assert.strictEqual(trendOf(1, false), 'worse');
  assert.strictEqual(trendOf(-2, false), 'better');
  assert.strictEqual(trendOf(0, false), 'same');
  assert.strictEqual(trendOf(null, true), 'same');
});

test('areaDeltas compares each area to the previous check-in', () => {
  const prev = answers({ sleep: 2, stress: 4, sorenessLower: 2 });
  const latest = answers({ sleep: 4, stress: 2, sorenessLower: 4 });
  const d = areaDeltas(latest, prev);

  assert.deepStrictEqual(d.areas.sleep, { value: 4, delta: 2, trend: 'better' });
  // Stress fell, which is an improvement even though the number went down.
  assert.deepStrictEqual(d.areas.stress, { value: 2, delta: -2, trend: 'better' });
  // Lower-body soreness rose: worse.
  assert.deepStrictEqual(d.areas.sorenessLower, { value: 4, delta: 2, trend: 'worse' });
  assert.deepStrictEqual(d.areas.wellbeing, { value: 3, delta: 0, trend: 'same' });
});

test('areaDeltas: the score delta uses the stored score when there is one', () => {
  const d = areaDeltas({ ...answers(), score: 70 }, { ...answers(), score: 64 });
  assert.deepStrictEqual(d.score, { value: 70, delta: 6, trend: 'better' });
});

test('areaDeltas: the score delta falls back to computing it', () => {
  const d = areaDeltas(answers({ stress: 1 }), answers());
  assert.deepStrictEqual(d.score, { value: 60, delta: 10, trend: 'better' });
  const worse = areaDeltas(answers(), answers({ stress: 1 }));
  assert.deepStrictEqual(worse.score, { value: 50, delta: -10, trend: 'worse' });
});

test('areaDeltas: a first check-in has values but no deltas', () => {
  const d = areaDeltas(answers({ energy: 5 }), null);
  assert.deepStrictEqual(d.areas.energy, { value: 5, delta: null, trend: 'same' });
  assert.deepStrictEqual(d.score, { value: 60, delta: null, trend: 'same' });
});

test('areaDeltas: nothing at all gives an empty result', () => {
  assert.deepStrictEqual(areaDeltas(null, null), { score: null, areas: {} });
});

console.log('frequency and due');

test('daysBetween counts calendar days', () => {
  assert.strictEqual(daysBetween('2026-11-01', '2026-11-02'), 1);
  assert.strictEqual(daysBetween('2026-10-30', '2026-11-02'), 3);
  assert.strictEqual(daysBetween('2026-11-02', '2026-11-02'), 0);
});

test('normalizeFrequency keeps everyDays between 2 and 14 and defaults to off', () => {
  assert.deepStrictEqual(normalizeFrequency(null), { mode: 'off', everyDays: 2 });
  assert.deepStrictEqual(normalizeFrequency({ mode: 'weekly' }), { mode: 'off', everyDays: 2 });
  assert.deepStrictEqual(normalizeFrequency({ mode: 'interval', everyDays: 30 }), { mode: 'interval', everyDays: 14 });
  assert.deepStrictEqual(normalizeFrequency({ mode: 'interval', everyDays: 1 }), { mode: 'interval', everyDays: 2 });
});

test('off is never due', () => {
  assert.strictEqual(isDue({ mode: 'off' }, null, '2026-11-02'), false);
});

test('daily is due until today has a check-in', () => {
  assert.strictEqual(isDue({ mode: 'daily' }, null, '2026-11-02'), true);
  assert.strictEqual(isDue({ mode: 'daily' }, '2026-11-01', '2026-11-02'), true);
  assert.strictEqual(isDue({ mode: 'daily' }, '2026-11-02', '2026-11-02'), false);
});

test('every N days is due once the last check-in is N days old', () => {
  const f = { mode: 'interval', everyDays: 3 };
  assert.strictEqual(isDue(f, '2026-11-01', '2026-11-02'), false);
  assert.strictEqual(isDue(f, '2026-10-31', '2026-11-02'), false);
  assert.strictEqual(isDue(f, '2026-10-30', '2026-11-02'), true);
  assert.strictEqual(isDue(f, null, '2026-11-02'), true);
});

test('a check-in dated a day ahead (athlete east of UTC) does not make it due', () => {
  assert.strictEqual(isDue({ mode: 'daily' }, '2026-11-03', '2026-11-02'), false);
});

console.log(`\n${passed} passed`);
