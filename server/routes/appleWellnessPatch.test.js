/**
 * What one Apple Health sync is allowed to write. Plain Node, no jest:
 *
 *   node server/routes/appleWellnessPatch.test.js
 *
 * The rolling sync used to $set every field to null when the payload did not
 * carry it. HealthKit fills a day in over the following week or two, so a
 * window covering a fresh day comes back holding the overnight low and HRV and
 * nothing else — and the write blanked the sleep and resting HR a wider sync
 * had already stored. The window only moves forward, so nothing ever came back
 * to repair it: one account was left with HRV on all 142 days and sleep on
 * none of the 52 between 14 July and 3 September, the boundary sitting exactly
 * seven days behind the 90-day sync that had filled them.
 */

'use strict';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const assert = require('assert');
const { appleWellnessPatch } = require('./integrationsRoutes');

let passed = 0;
const test = (name, fn) => {
  try { fn(); passed += 1; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; }
};

console.log('appleWellnessPatch');

test('writes every measurement the day actually carries', () => {
  const p = appleWellnessPatch({
    date: '2026-09-04',
    restingHeartRate: 40,
    sleepingHeartRate: 35,
    sleepMinutes: 458,
    hrvMs: 87.9,
    respiratoryRate: 14.2,
  });
  assert.deepStrictEqual(p, {
    source: 'apple_health',
    restingHeartRate: 40,
    sleepingHeartRate: 35,
    sleepMinutes: 458,
    hrvMs: 87.9,
    respiratoryRate: 14.2,
  });
});

test('a half-filled day does not mention what it is missing — the regression', () => {
  // What HealthKit returns for last night: the low and HRV, no sleep yet.
  const p = appleWellnessPatch({ date: '2026-08-13', hrvMs: 38.6, sleepingHeartRate: 43 });
  assert.ok(!('sleepMinutes' in p), 'sleepMinutes must be absent, not null');
  assert.ok(!('restingHeartRate' in p), 'restingHeartRate must be absent, not null');
  assert.deepStrictEqual(p, { source: 'apple_health', hrvMs: 38.6, sleepingHeartRate: 43 });
});

test('an empty day is only the source, so the caller can skip the write', () => {
  assert.deepStrictEqual(appleWellnessPatch({ date: '2026-08-13' }), { source: 'apple_health' });
  assert.strictEqual(Object.keys(appleWellnessPatch({ date: '2026-08-13' })).length, 1);
});

test('carries the hypnogram and the per-stage minutes when they are there', () => {
  const stages = { coreMin: 210, deepMin: 60, remMin: 90, awakeMin: 12, unspecifiedMin: 0 };
  const segments = [{ stage: 'core', start: 1, end: 2 }];
  const p = appleWellnessPatch({ date: '2026-09-04', sleepMinutes: 372, sleepStages: stages, sleepSegments: segments });
  assert.deepStrictEqual(p.sleepStages, stages);
  assert.deepStrictEqual(p.sleepSegments, segments);
});

test('an empty hypnogram is not a hypnogram', () => {
  const p = appleWellnessPatch({ date: '2026-09-04', sleepMinutes: 372, sleepSegments: [], sleepStages: null });
  assert.ok(!('sleepSegments' in p));
  assert.ok(!('sleepStages' in p));
});

test('refuses a value that is not a number rather than storing NaN', () => {
  const p = appleWellnessPatch({ date: '2026-09-04', restingHeartRate: 'n/a', hrvMs: 87.9 });
  assert.ok(!('restingHeartRate' in p));
  assert.strictEqual(p.hrvMs, 87.9);
});

test('keeps a real zero — it is a reading, not a gap', () => {
  const p = appleWellnessPatch({ date: '2026-09-04', respiratoryRate: 0 });
  assert.strictEqual(p.respiratoryRate, 0);
});

console.log(`\n${passed} passed`);
