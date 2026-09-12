/**
 * The Compare tab's result shape. Plain Node, no jest — run with:
 *
 *   node server/utils/similarActivities.test.js
 *
 * A compared Strava ride opened to dashes for duration, power and heart
 * rate although the stored document had all three: the query selected the
 * snake_case names that only exist inside `raw`. The numbers below are the
 * ride's own.
 */

'use strict';

const assert = require('assert');
const {
  SIMILAR_SELECT,
  durationSeconds,
  buildStructureFilter,
  applySimilarExcludeId,
  normalizeSimilarActivity,
} = require('./similarActivities');

// The stored Strava document, top level — camelCase, as the schema defines it.
const STRAVA_RIDE = {
  stravaId: 19584511803,
  name: 'Afternoon Ride',
  titleManual: 'Bike endurance',
  sport: 'Ride',
  startDate: new Date('2026-08-03T15:12:54.000Z'),
  distance: 93952.1,
  elapsedTime: 9540,
  movingTime: 9506,
  averageHeartRate: 137,
  averagePower: 235.4,
  weightedAveragePower: 259,
  averageSpeed: 9.883,
  laps: [{}, {}, {}, {}, {}, {}, {}, {}],
};

const GARMIN_RIDE = {
  garminId: '23837644581',
  name: 'Simonovice Cycling',
  sport: 'cycling',
  startDate: new Date('2026-08-03T13:12:54.000Z'),
  distance: 93952.11,
  elapsedTime: 9499,
  movingTime: 9499,
  averageHeartRate: 137,
  averagePower: null,
  averageSpeed: 9.891,
  laps: [{}, {}, {}, {}, {}, {}, {}, {}],
};

(function stravaResultCarriesItsNumbers() {
  const r = normalizeSimilarActivity(STRAVA_RIDE, 'strava');
  assert.strictEqual(r.id, 'strava-19584511803');
  assert.strictEqual(r.title, 'Bike endurance');
  assert.strictEqual(r.duration, 9506, 'moving time is the duration');
  assert.strictEqual(r.elapsedTime, 9540);
  assert.strictEqual(r.avgHr, 137);
  assert.strictEqual(r.avgPower, 235.4);
  assert.strictEqual(r.normalizedPower, 259);
  assert.strictEqual(r.avgSpeed, 9.883);
  assert.strictEqual(r.laps.length, 8);
})();

(function garminResultIsASession() {
  const r = normalizeSimilarActivity(GARMIN_RIDE, 'garmin');
  assert.strictEqual(r.id, 'garmin-23837644581');
  assert.strictEqual(r.type, 'garmin');
  assert.strictEqual(r.duration, 9499);
  assert.strictEqual(r.avgHr, 137);
  assert.strictEqual(r.avgPower, 0, 'Garmin summaries carry no power');
  assert.strictEqual(r.distance, 93952.11);
})();

(function selectsNameTheFieldsThatExist() {
  for (const f of ['elapsedTime', 'movingTime', 'averageHeartRate', 'averagePower', 'weightedAveragePower', 'averageSpeed']) {
    assert.ok(SIMILAR_SELECT.strava.split(' ').includes(f), `strava select has ${f}`);
  }
  assert.ok(!/\baverage_watts\b|\belapsed_time\b|\baverage_heartrate\b/.test(SIMILAR_SELECT.strava), 'no snake_case top-level names');
  for (const f of ['elapsedTime', 'movingTime', 'averageHeartRate', 'averagePower']) {
    assert.ok(SIMILAR_SELECT.garmin.split(' ').includes(f), `garmin select has ${f}`);
  }
})();

(function structureFilterMatchesOnEitherClock() {
  const f = buildStructureFilter({ userId: 'u1' }, 9500, 94000, 8, 'strava');
  assert.deepStrictEqual(Object.keys(f).sort(), ['$or', 'distance', 'laps.0', 'userId'].sort());
  const [moving, elapsed] = f.$or;
  assert.ok(moving.movingTime.$gte < 9506 && moving.movingTime.$lte > 9506, 'the ride sits inside the moving-time window');
  assert.ok(elapsed.elapsedTime.$gte < 9540 && elapsed.elapsedTime.$lte > 9540);
  assert.ok(f.distance.$gte < 93952 && f.distance.$lte > 93952);
  const g = buildStructureFilter({ userId: 'u1' }, 9500, 0, 0, 'garmin');
  assert.ok(g.$or && !g.distance && !g['laps.0']);
  const fit = buildStructureFilter({ athleteId: 'u1' }, 9500, 94000, 0, 'fit');
  assert.ok(fit.totalElapsedTime && fit.totalDistance && !fit.$or);
})();

(function excludeIdKeepsTheOpenSessionOut() {
  const s = {}; applySimilarExcludeId(s, 'strava-19584511803', 'strava');
  assert.deepStrictEqual(s, { stravaId: { $ne: 19584511803 } });
  const bare = {}; applySimilarExcludeId(bare, '19584511803', 'strava');
  assert.deepStrictEqual(bare, { stravaId: { $ne: 19584511803 } });
  const g = {}; applySimilarExcludeId(g, 'garmin-23837644581', 'garmin');
  assert.deepStrictEqual(g, { garminId: { $ne: '23837644581' } });
  // A Garmin id must not turn into a Strava exclusion, or the reverse.
  const cross = {}; applySimilarExcludeId(cross, 'garmin-23837644581', 'strava');
  assert.deepStrictEqual(cross, {});
  const cross2 = {}; applySimilarExcludeId(cross2, 'strava-19584511803', 'garmin');
  assert.deepStrictEqual(cross2, {});
})();

(function manualTrainingDurationIsText() {
  assert.strictEqual(durationSeconds('4:09:58'), 14998);
  assert.strictEqual(durationSeconds('45:30'), 2730);
  assert.strictEqual(durationSeconds(3600), 3600);
  assert.strictEqual(durationSeconds('abc'), 0);
  const r = normalizeSimilarActivity({ _id: 'x', title: 'Endurance', sport: 'bike', date: new Date(), duration: '4:09:58' }, 'regular');
  assert.strictEqual(r.duration, 14998);
})();

console.log('similarActivities: ok');
