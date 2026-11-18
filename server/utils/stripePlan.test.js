/**
 * Plain Node, no jest — run with: node server/utils/stripePlan.test.js
 */
const assert = require('assert');
const { planForStripePrice, checkoutOverExisting } = require('./stripePlan');

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

const sub = (status, priceId, over = {}) => ({
  status, cancel_at_period_end: false, items: { data: [{ price: { id: priceId } }] }, ...over,
});
t('nothing live in Stripe means a normal checkout', () => {
  assert.strictEqual(checkoutOverExisting(null, 'coach', env), 'checkout');
  assert.strictEqual(checkoutOverExisting(sub('canceled', 'price_coach'), 'coach', env), 'checkout');
  assert.strictEqual(checkoutOverExisting(sub('incomplete_expired', 'price_coach'), 'coach', env), 'checkout');
});
t('the same plan twice is refused, trial included', () => {
  // youdier10 paid for Coach twice: a trialing Coach, then a second checkout.
  assert.strictEqual(checkoutOverExisting(sub('trialing', 'price_coach'), 'coach', env), 'already_subscribed');
  assert.strictEqual(checkoutOverExisting(sub('active', 'price_coach'), 'coach', env), 'already_subscribed');
});
t('the same plan set to end is reactivated, not bought again', () => {
  assert.strictEqual(
    checkoutOverExisting(sub('active', 'price_coach', { cancel_at_period_end: true }), 'coach', env),
    'reactivate');
});
t('a different plan switches the live subscription', () => {
  assert.strictEqual(checkoutOverExisting(sub('active', 'price_pro'), 'coach', env), 'switch');
  assert.strictEqual(checkoutOverExisting(sub('trialing', 'price_coach'), 'pro', env), 'switch');
});
t('a failing card is fixed before anything else', () => {
  assert.strictEqual(checkoutOverExisting(sub('past_due', 'price_pro'), 'coach', env), 'past_due');
  assert.strictEqual(checkoutOverExisting(sub('past_due', 'price_coach'), 'coach', env), 'past_due');
});
console.log(`\n${passed} passed`);
