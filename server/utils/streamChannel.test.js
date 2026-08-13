/**
 * Two shapes live in the database and every reader must cope with both.
 *
 *   node server/utils/streamChannel.test.js
 */

'use strict';

const assert = require('assert');
const { channel, hasChannel } = require('./streamChannel');

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ok  ${name}`);
  } catch (err) {
    console.error(`  FAIL ${name}\n       ${err.message}`);
    process.exitCode = 1;
  }
}

console.log('stream channels');

test('reads the bare series the backfill writes', () => {
  assert.deepStrictEqual(channel({ heartrate: [120, 130] }, 'heartrate'), [120, 130]);
});

test('reads the wrapped series the sync writes', () => {
  // Strava's key_by_type response, stored verbatim.
  const streams = { heartrate: { data: [120, 130], series_type: 'distance', resolution: 'high' } };
  assert.deepStrictEqual(channel(streams, 'heartrate'), [120, 130]);
});

test('always returns something with .find and .map on it', () => {
  // The production crash was "(… || []).find is not a function" — an object
  // slipped past the || guard because an object is truthy.
  for (const streams of [null, undefined, {}, { latlng: {} }, { latlng: 'nonsense' }]) {
    const out = channel(streams, 'latlng');
    assert.ok(Array.isArray(out), `expected an array for ${JSON.stringify(streams)}`);
    assert.doesNotThrow(() => out.find(Boolean));
  }
});

test('a missing channel is empty, not absent', () => {
  assert.deepStrictEqual(channel({ heartrate: [1] }, 'watts'), []);
  assert.strictEqual(hasChannel({ heartrate: [1] }, 'watts'), false);
  assert.strictEqual(hasChannel({ heartrate: [1] }, 'heartrate'), true);
});

test('an empty wrapped channel counts as no data', () => {
  assert.strictEqual(hasChannel({ heartrate: { data: [] } }, 'heartrate'), false);
});

test('latlng points survive both shapes intact', () => {
  const pts = [[50.08, 14.43], [50.09, 14.44]];
  assert.deepStrictEqual(channel({ latlng: pts }, 'latlng'), pts);
  assert.deepStrictEqual(channel({ latlng: { data: pts } }, 'latlng'), pts);
});

console.log(`\n${passed} passed`);
