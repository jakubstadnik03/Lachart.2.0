/**
 * Rate-limit lockout behaviour. Plain Node, no jest — run with:
 *
 *   node server/utils/stravaBudget.test.js
 *
 * These cover the failure that ran for 24 hours in production: a budget that
 * only learned from successful responses, so a run refused on every call kept
 * reporting an empty window and kept firing.
 */

'use strict';

const assert = require('assert');
const budget = require('./stravaBudget');

let passed = 0;
function test(name, fn) {
  budget.reset();
  try {
    fn();
    passed += 1;
    console.log(`  ok  ${name}`);
  } catch (err) {
    console.error(`  FAIL ${name}\n       ${err.message}`);
    process.exitCode = 1;
  }
}

async function testAsync(name, fn) {
  budget.reset();
  try {
    await fn();
    passed += 1;
    console.log(`  ok  ${name}`);
  } catch (err) {
    console.error(`  FAIL ${name}\n       ${err.message}`);
    process.exitCode = 1;
  }
}

const rateLimited = (headers = {}) => ({ response: { status: 429, headers } });

console.log('stravaBudget');

(async () => {
  test('a fresh budget is not locked', () => {
    assert.strictEqual(budget.snapshot().locked, false);
    assert.strictEqual(budget.lockoutSecondsRemaining(), 0);
  });

  test('a 429 locks the whole app out', () => {
    assert.strictEqual(budget.noteRateLimitedResponse(rateLimited({ 'retry-after': '120' })), true);
    assert.strictEqual(budget.isLocked(), true);
    const left = budget.lockoutSecondsRemaining();
    assert.ok(left > 100 && left <= 120, `expected ~120s, got ${left}`);
  });

  test('a 429 without Retry-After still locks — up to the window roll', () => {
    budget.noteRateLimitedResponse(rateLimited());
    assert.strictEqual(budget.isLocked(), true);
    const left = budget.lockoutSecondsRemaining();
    // Never less than the 60 s floor, never more than a 15-minute window.
    assert.ok(left >= 60 && left <= 900, `expected 60..900s, got ${left}`);
  });

  test('a 429 with no usable counters marks the window spent', () => {
    const before = budget.snapshot();
    budget.noteRateLimitedResponse(rateLimited());
    const after = budget.snapshot();
    assert.ok(
      after.windowUsed >= after.windowLimit,
      `window should read as spent, got ${after.windowUsed}/${after.windowLimit} (was ${before.windowUsed})`,
    );
  });

  test("a 429 that carries Strava's counters uses them verbatim", () => {
    budget.noteRateLimitedResponse(rateLimited({
      'retry-after': '90',
      'x-readratelimit-limit': '300,3000',
      'x-readratelimit-usage': '287,2412',
    }));
    const s = budget.snapshot();
    assert.strictEqual(s.windowUsed, 287);
    assert.strictEqual(s.dayUsed, 2412);
    assert.strictEqual(s.stravaReportedWindowLimit, 300);
  });

  test('anything that is not a 429 is left alone', () => {
    assert.strictEqual(budget.noteRateLimitedResponse({ response: { status: 500 } }), false);
    assert.strictEqual(budget.noteRateLimitedResponse(new Error('socket hang up')), false);
    assert.strictEqual(budget.isLocked(), false);
  });

  test('the longest 429 wins — a later short one cannot shorten it', () => {
    budget.noteRateLimitedResponse(rateLimited({ 'retry-after': '900' }));
    const long = budget.lockoutSecondsRemaining();
    budget.noteRateLimitedResponse(rateLimited({ 'retry-after': '60' }));
    assert.ok(budget.lockoutSecondsRemaining() >= long - 1, 'lockout must not shrink');
  });

  test('a success clears the lockout', () => {
    budget.noteRateLimitedResponse(rateLimited({ 'retry-after': '600' }));
    assert.strictEqual(budget.isLocked(), true);
    budget.clearRateLimit();
    assert.strictEqual(budget.isLocked(), false);
  });

  await testAsync('background work is refused while locked', async () => {
    budget.noteRateLimit(300);
    await assert.rejects(
      () => budget.take({ priority: 'bulk' }),
      (e) => e.code === 'STRAVA_BUDGET_EXHAUSTED' && e.retryAfterSec > 0,
      'take() must refuse a bulk caller during a lockout',
    );
  });

  await testAsync('a waiting user is still let through while locked', async () => {
    budget.noteRateLimit(300);
    // Routes answer these from the lockout themselves; take() must not be the
    // thing that breaks an explicit user action.
    await budget.take({ bypass: true });
    assert.ok(budget.snapshot().windowUsed >= 1, 'bypass must still count the call');
  });

  console.log(`\n${passed} passed`);
})();
