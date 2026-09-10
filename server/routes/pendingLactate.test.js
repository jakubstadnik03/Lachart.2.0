/**
 * The Field Lactate feed. Plain Node, no jest — run with:
 *
 *   node server/routes/pendingLactate.test.js
 *
 * This read StravaActivity and nothing else, so an athlete whose watch talks
 * to Garmin opened the panel to "Strava not connected" above an empty list —
 * while the app already held their rides, with laps, in GarminActivity. The
 * two services now go through one mapper, which is what these assert.
 */

'use strict';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const assert = require('assert');
const {
  toPendingLactateRow, dedupePendingLactate, lapsMissingLactate,
} = require('./integrationsRoutes');

let passed = 0;
const test = (name, fn) => {
  try { fn(); passed += 1; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; }
};

/** Garmin writes laps in the same snake_case shape Strava does. */
const lap = (over = {}) => ({
  elapsed_time: 300, moving_time: 300,
  average_heartrate: 165, average_watts: 270,
  lactate: null, ...over,
});

const STRAVA = {
  _id: 's1', stravaId: 998877, name: 'Afternoon Ride', sport: 'Ride',
  startDate: new Date('2026-09-08T15:00:00Z'), movingTime: 4200, distance: 42430,
  laps: [lap(), lap(), lap({ lactate: 4.2 })],
};

const GARMIN = {
  _id: 'g1', garminId: '20482044991', name: 'Olomouc Běh', titleManual: null, sport: 'running',
  startDate: new Date('2026-09-09T06:00:00Z'), movingTime: 2400, distance: 8000,
  laps: [lap({ average_watts: 0 }), lap({ average_watts: 0 })],
};

console.log('pendingLactate');

test('counts the laps still waiting for a value', () => {
  assert.deepStrictEqual(lapsMissingLactate([lap(), lap({ lactate: 3 })]), { needed: true, missing: 1 });
  assert.deepStrictEqual(lapsMissingLactate([lap({ lactate: 3 })]), { needed: false, missing: 0 });
  assert.deepStrictEqual(lapsMissingLactate([lap({ lactate: '' })]), { needed: true, missing: 1 });
});

test('offers an activity whose laps have not been loaded yet', () => {
  // Opening it is what loads them, so an empty lap array is a reason to list it.
  assert.deepStrictEqual(lapsMissingLactate([]), { needed: true, missing: null });
  const row = toPendingLactateRow({ ...GARMIN, laps: [] }, 'garmin', null);
  assert.strictEqual(row.lapCount, 0);
  assert.strictEqual(row.missingLactateCount, null);
});

test('skips an activity where every lap already has blood against it', () => {
  const done = { ...STRAVA, laps: [lap({ lactate: 1.8 }), lap({ lactate: 4.1 })] };
  assert.strictEqual(toPendingLactateRow(done, 'strava', null), null);
});

test('maps a Strava activity the way it always did', () => {
  const row = toPendingLactateRow(STRAVA, 'strava', null);
  assert.strictEqual(row.source, 'strava');
  assert.strictEqual(row.stravaId, 998877);
  assert.strictEqual(row.garminId, null);
  assert.strictEqual(row.openPath, '/training-calendar/strava-998877');
  assert.strictEqual(row.lapCount, 3);
  assert.strictEqual(row.missingLactateCount, 2);
  assert.strictEqual(row.avgHr, 165);
  assert.strictEqual(row.avgWatts, 270);
});

test('maps a Garmin activity on identical terms — the whole point', () => {
  const row = toPendingLactateRow(GARMIN, 'garmin', null);
  assert.strictEqual(row.source, 'garmin');
  assert.strictEqual(row.garminId, '20482044991');
  assert.strictEqual(row.stravaId, null);
  // The calendar has addressed Garmin sessions this way all along.
  assert.strictEqual(row.openPath, '/training-calendar/garmin-20482044991');
  assert.strictEqual(row.lapCount, 2);
  assert.strictEqual(row.missingLactateCount, 2);
  assert.strictEqual(row.avgHr, 165, 'Garmin laps carry average_heartrate too');
  assert.strictEqual(row.avgWatts, null, 'a run has no watts, and zero is not a reading');
});

test('a coach viewing an athlete gets a path that names the athlete', () => {
  const athlete = '6aa123c088d5f41d3ac4296e';
  assert.strictEqual(
    toPendingLactateRow(GARMIN, 'garmin', athlete).openPath,
    `/training-calendar/${athlete}/garmin-20482044991`,
  );
  assert.strictEqual(
    toPendingLactateRow(STRAVA, 'strava', athlete).openPath,
    `/training-calendar/${athlete}/strava-998877`,
  );
});

test('prefers a manual title over the one the watch wrote', () => {
  const row = toPendingLactateRow({ ...GARMIN, titleManual: '4×5min prahy' }, 'garmin', null);
  assert.strictEqual(row.name, '4×5min prahy');
});

test('offers a session held by both services exactly once', () => {
  // A watch that pushes to Garmin and on to Strava writes the same ride twice.
  const same = new Date('2026-09-08T15:00:00Z');
  const rows = [
    toPendingLactateRow({ ...STRAVA, startDate: same, laps: [lap()] }, 'strava', null),
    toPendingLactateRow({ ...GARMIN, startDate: new Date(same.getTime() + 90_000) }, 'garmin', null),
  ];
  const kept = dedupePendingLactate(rows);
  assert.strictEqual(kept.length, 1);
  // Laps are the entire point of this panel, so the richer copy wins.
  assert.strictEqual(kept[0].source, 'garmin');
  assert.strictEqual(kept[0].lapCount, 2);
});

test('two sessions an hour apart are two sessions', () => {
  const rows = [
    toPendingLactateRow(STRAVA, 'strava', null),
    toPendingLactateRow({ ...GARMIN, startDate: new Date('2026-09-08T16:30:00Z') }, 'garmin', null),
  ];
  assert.strictEqual(dedupePendingLactate(rows).length, 2);
});

test('survives an activity with no start date rather than merging it into one', () => {
  const rows = [
    toPendingLactateRow({ ...STRAVA, startDate: null }, 'strava', null),
    toPendingLactateRow({ ...GARMIN, startDate: null }, 'garmin', null),
  ];
  assert.strictEqual(dedupePendingLactate(rows).length, 2);
});

console.log(`\n${passed} passed`);
