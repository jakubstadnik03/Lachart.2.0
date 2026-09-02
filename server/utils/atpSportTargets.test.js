/**
 * Per-sport week targets. Plain Node, no jest — run with:
 *
 *   node server/utils/atpSportTargets.test.js
 */

'use strict';

const assert = require('assert');
const { sanitizeSportMap } = require('./atpSportTargets');

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

console.log('sanitizeSportMap');

test('keeps the sports it knows and drops the rest', () => {
  assert.deepStrictEqual(sanitizeSportMap({ bike: 8, run: 2, yoga: 3 }), { bike: 8, run: 2 });
});

// Zero is a coach saying "no riding this week", which is a plan, not a blank.
test('a target of zero survives', () => {
  assert.deepStrictEqual(sanitizeSportMap({ bike: 0 }), { bike: 0 });
});

test('a cleared box is not a target', () => {
  assert.deepStrictEqual(sanitizeSportMap({ bike: '', run: null, swim: 3 }), { swim: 3 });
});

// The table's inputs are text, so every number arrives as a string.
test('numbers arriving as strings still count', () => {
  assert.deepStrictEqual(sanitizeSportMap({ bike: '7.5' }), { bike: 7.5 });
});

test('nothing set at all is undefined, not an empty object', () => {
  assert.strictEqual(sanitizeSportMap({}), undefined);
  assert.strictEqual(sanitizeSportMap({ bike: '' }), undefined);
  assert.strictEqual(sanitizeSportMap(null), undefined);
  assert.strictEqual(sanitizeSportMap([1, 2]), undefined);
});

test('nonsense is refused rather than stored', () => {
  assert.strictEqual(sanitizeSportMap({ bike: 'lots', run: -3 }), undefined);
});

console.log(`\n${passed} passed`);
