/**
 * Plain Node, no jest — run with: node server/utils/stripePlan.test.js
 */
const assert = require('assert');
const { planForStripePrice } = require('./stripePlan');

let passed = 0;
const t = (name, fn) => { fn(); passed += 1; console.log(`  ok  ${name}`); };
const env = { STRIPE_PRICE_ID_PRO: 'price_pro', STRIPE_PRICE_ID_COACH: 'price_coach' };

t('a configured price id wins', () => {
  assert.strictEqual(planForStripePrice('price_coach', env), 'coach');
  assert.strictEqual(planForStripePrice({ id: 'price_pro', unit_amount: 1499 }, env), 'pro');
});
t('an unknown id falls back to the amount', () => {
  assert.strictEqual(planForStripePrice({ id: 'price_other', unit_amount: 1499 }, env), 'coach');
  assert.strictEqual(planForStripePrice({ id: 'price_other', unit_amount: 699 }, env), 'pro');
});
t('nothing known is null, never a guess', () => {
  assert.strictEqual(planForStripePrice({ id: 'price_other', unit_amount: 999 }, env), null);
  assert.strictEqual(planForStripePrice('price_other', env), null);
  assert.strictEqual(planForStripePrice(null, env), null);
});
console.log(`\n${passed} passed`);
