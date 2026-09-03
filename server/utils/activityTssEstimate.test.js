/**
 * The client draws the calendar's TSS and the server drives CTL from its own
 * copy of the same model. When the two disagree the athlete sees one number in
 * the week's totals and the fitness curve is built from another, so the pair
 * that matters most is checked here: a session nothing measured.
 */
const assert = require('assert');
const { resolveActivityTss } = require('./activityTss');

let passed = 0;
const test = (name, fn) => {
  try { fn(); console.log('  ok ', name); passed += 1; }
  catch (e) { console.log('  FAIL', name); console.log('      ', e.message); process.exitCode = 1; }
};

console.log('\nTSS when nothing measured the session');

const POOL_SWIM = { sport: 'Swim', totalElapsedTime: 3600, distance: 3500 };

test('an hour in the pool still carries load', () => {
  assert.strictEqual(resolveActivityTss(POOL_SWIM, {}), 40);
});

test('having cycling zones does not disqualify a swim', () => {
  assert.strictEqual(resolveActivityTss(POOL_SWIM, { powerZones: { cycling: { lt2: 300 } } }), 40);
});

test('short sessions stay at zero', () => {
  assert.strictEqual(resolveActivityTss({ sport: 'Walk', totalElapsedTime: 600 }, {}), 0);
});

test('a measured ride is unaffected', () => {
  const ride = { sport: 'Ride', totalElapsedTime: 3600, average_watts: 300 };
  assert.strictEqual(resolveActivityTss(ride, { powerZones: { cycling: { lt2: 300 } } }), 100);
});

test('agrees with the client for the same session', () => {
  // Mirrors client/src/utils/computeTss.test.js — the two models are separate
  // files and drift between them is what puts a different TSS in the calendar
  // than the one CTL was built from.
  assert.strictEqual(resolveActivityTss({ sport: 'Ride', totalElapsedTime: 7200 }, {}), 80);
  assert.strictEqual(resolveActivityTss({ sport: 'Run', totalElapsedTime: 1800 }, {}), 20);
  assert.strictEqual(resolveActivityTss({ sport: 'Yoga', totalElapsedTime: 3600 }, {}), 0);
});

console.log(`\n${passed} passed`);
