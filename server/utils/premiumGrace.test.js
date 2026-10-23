/**
 * A declined card must not take Premium away while the card is retried.
 * Plain Node, no jest — run with: node server/utils/premiumGrace.test.js
 */
const assert = require('assert');
const { subscriptionGrantsPremium } = require('./premiumAccess');

let passed = 0;
const t = (name, fn) => { fn(); passed += 1; console.log(`  ok  ${name}`); };
const later = new Date(Date.now() + 864e5);

t('past_due keeps the paid plan while the card is retried', () => {
  assert.strictEqual(subscriptionGrantsPremium({ plan: 'coach', status: 'past_due', currentPeriodEnd: later }), true);
});
t('canceled or unpaid does not', () => {
  assert.strictEqual(subscriptionGrantsPremium({ plan: 'coach', status: 'canceled', currentPeriodEnd: later }), false);
  assert.strictEqual(subscriptionGrantsPremium({ plan: 'coach', status: 'unpaid', currentPeriodEnd: later }), false);
});
t('a free plan never does', () => {
  assert.strictEqual(subscriptionGrantsPremium({ plan: 'free', status: 'past_due', currentPeriodEnd: later }), false);
});
console.log(`\n${passed} passed`);
