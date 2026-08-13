/**
 * The backfill's whole job is to spend Strava budget only when spending it
 * costs nobody anything. Plain Node, like the other server tests:
 *
 *   node server/services/streamBackfillScheduler.test.js
 */

'use strict';

const assert = require('assert');
const stravaBudget = require('../utils/stravaBudget');
const { hasHeadroom } = require('./streamBackfillScheduler');

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

/** Spend n slots without going through the budget's own gate. */
function spend(n) {
  for (let i = 0; i < n; i += 1) stravaBudget.take({ bypass: true });
}

console.log('stream backfill headroom');

test('an idle budget has room', () => {
  stravaBudget.reset();
  assert.strictEqual(hasHeadroom(15), true);
});

test('stops well before the bulk ceiling, not at it', () => {
  stravaBudget.reset();
  const { bulkWindowLimit } = stravaBudget.snapshot();
  // Right up against the ceiling: take() would still allow one more, but this
  // is the lowest-priority work in the system and should have left already.
  spend(bulkWindowLimit - 5);
  assert.strictEqual(hasHeadroom(15), false);
});

test('the headroom margin is what decides it', () => {
  stravaBudget.reset();
  const { bulkWindowLimit } = stravaBudget.snapshot();
  spend(bulkWindowLimit - 20);
  // 15 slots left over the line, 25 not.
  assert.strictEqual(hasHeadroom(15), true);
  assert.strictEqual(hasHeadroom(25), false);
});

test('a full window is refused outright', () => {
  stravaBudget.reset();
  const { bulkWindowLimit } = stravaBudget.snapshot();
  spend(bulkWindowLimit + 1);
  assert.strictEqual(hasHeadroom(0), false);
});

stravaBudget.reset();
console.log(`\n${passed} passed`);
