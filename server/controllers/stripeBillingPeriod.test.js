/**
 * Where Stripe keeps a subscription's billing period. Plain Node, no jest:
 *
 *   node server/controllers/stripeBillingPeriod.test.js
 *
 * Stripe moved current_period_start/end off the subscription and onto its
 * items in the 2025-03-31 API version. Read at the top level they became
 * undefined, `undefined * 1000` became NaN, and Mongoose refused to cast it —
 * so every subscription webhook threw after its 200 had already gone back, and
 * the stored status drifted away from Stripe's without a sound.
 */

'use strict';

const assert = require('assert');
const { stripeBillingPeriod } = require('./subscriptionController');

let passed = 0;
const test = (name, fn) => {
  try { fn(); passed += 1; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; }
};

const START = 1757000000;
const END = 1759592000;

console.log('stripeBillingPeriod');

test('reads the old shape, where the period sat on the subscription', () => {
  const p = stripeBillingPeriod({ current_period_start: START, current_period_end: END });
  assert.strictEqual(p.start.getTime(), START * 1000);
  assert.strictEqual(p.end.getTime(), END * 1000);
});

test('reads the new shape, where it sits on the item', () => {
  const p = stripeBillingPeriod({
    items: { data: [{ current_period_start: START, current_period_end: END }] },
  });
  assert.strictEqual(p.start.getTime(), START * 1000);
  assert.strictEqual(p.end.getTime(), END * 1000);
});

test('prefers the subscription when both carry it', () => {
  const p = stripeBillingPeriod({
    current_period_start: START,
    items: { data: [{ current_period_start: START + 999 }] },
  });
  assert.strictEqual(p.start.getTime(), START * 1000);
});

test('returns null instead of an Invalid Date — the case that was throwing', () => {
  const p = stripeBillingPeriod({ id: 'sub_x', status: 'active' });
  assert.strictEqual(p.start, null);
  assert.strictEqual(p.end, null);
});

test('refuses anything that is not a usable timestamp', () => {
  assert.strictEqual(stripeBillingPeriod(null).start, null);
  assert.strictEqual(stripeBillingPeriod({}).start, null);
  assert.strictEqual(stripeBillingPeriod({ current_period_start: 0 }).start, null);
  assert.strictEqual(stripeBillingPeriod({ current_period_start: 'x' }).start, null);
  assert.strictEqual(stripeBillingPeriod({ items: { data: [] } }).start, null);
});

console.log(`\n${passed} passed`);
