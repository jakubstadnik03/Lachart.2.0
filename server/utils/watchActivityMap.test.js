/**
 * Polar and COROS payloads are not the calendar's shape. These lock the
 * conversions the sync uses, without calling either provider.
 *
 *   node server/utils/watchActivityMap.test.js
 */

'use strict';

const assert = require('assert');
const {
  parseIsoDuration,
  polarStartToUtc,
  mapPolarExercise,
  mapCorosWorkout,
  dateWindows,
  corosRows,
} = require('./watchActivityMap');

assert.strictEqual(parseIsoDuration('PT2H44M45S'), 2 * 3600 + 44 * 60 + 45);
assert.strictEqual(parseIsoDuration('PT2H44M'), 2 * 3600 + 44 * 60);
assert.strictEqual(parseIsoDuration('PT45S'), 45);
assert.strictEqual(parseIsoDuration(90), 90);
assert.strictEqual(parseIsoDuration('nope'), null);

const start = polarStartToUtc({
  start_time: '2008-10-13T10:40:02',
  start_time_utc_offset: 180,
});
assert.strictEqual(start.toISOString(), '2008-10-13T07:40:02.000Z');

const polar = mapPolarExercise({
  id: '2AC312F',
  start_time: '2008-10-13T10:40:02',
  start_time_utc_offset: 0,
  duration: 'PT40M',
  distance: 10000,
  heart_rate: { average: 148 },
  sport: 'OTHER',
  detailed_sport_info: 'RUNNING',
  device: 'Polar Vantage',
  calories: 640,
});
assert.strictEqual(polar.watchId, '2AC312F');
assert.strictEqual(polar.source, 'polar');
assert.strictEqual(polar.sport, 'running');
assert.strictEqual(polar.elapsedTime, 2400);
assert.strictEqual(polar.distance, 10000);
assert.ok(Math.abs(polar.averageSpeed - (10000 / 2400)) < 1e-9);
assert.strictEqual(polar.averageHeartRate, 148);
assert.strictEqual(polar.name, 'Run · Polar Vantage');

const coros = mapCorosWorkout({
  labelId: '441335408865869824',
  mode: 8,
  name: 'Easy run',
  startTime: 1644086178,
  duration: 3600,
  distance: 10234,
  avgHeartRate: 142,
  avgPower: 251,
  calorie: 700,
});
assert.strictEqual(coros.source, 'coros');
assert.strictEqual(coros.sport, 'running');
assert.strictEqual(coros.name, 'Easy run');
assert.strictEqual(coros.startDate.toISOString(), new Date(1644086178 * 1000).toISOString());
assert.strictEqual(coros.averageHeartRate, 142);
assert.strictEqual(coros.averagePower, 251);
assert.strictEqual(coros.calories, 700);

const indoor = mapCorosWorkout({
  labelId: '9',
  mode: 11,
  startTime: 1700000000,
  workoutTime: 1800,
  distance: 0,
});
assert.strictEqual(indoor.sport, 'cycling');
assert.strictEqual(indoor.distance, null);

const windows = dateWindows(new Date('2026-03-31T00:00:00Z'), 90, 30);
assert.ok(windows.length >= 3 && windows.length <= 4, `expected ~3 windows, got ${windows.length}`);
assert.strictEqual(windows[0].endDate, '20260331');

assert.deepStrictEqual(corosRows({ result: '0000', data: [{ labelId: '1' }] }).length, 1);
assert.deepStrictEqual(corosRows({ data: { dataList: [{}, {}] } }).length, 2);

console.log('watchActivityMap: all assertions passed');
