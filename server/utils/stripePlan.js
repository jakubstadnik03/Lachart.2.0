/**
 * Which LaChart plan a Stripe price is.
 *
 * The price ids in Render's env are not the ones every live subscription
 * uses (prices were recreated), so an id lookup alone answered "unknown" for
 * real subscribers, and a renewal could not say what they pay for. The amount
 * is the fallback: each plan has exactly one monthly price.
 *
 * @param {string|{id?: string, unit_amount?: number}} price
 * @returns {'pro'|'coach'|'team'|null}
 */
const AMOUNT_TO_PLAN = { 699: 'pro', 1499: 'coach', 4999: 'team' };

function planForStripePrice(price, env = process.env) {
  if (!price) return null;
  const id = typeof price === 'string' ? price : price.id;
  const byId = {
    [env.STRIPE_PRICE_ID_PRO]: 'pro',
    [env.STRIPE_PRICE_ID_COACH]: 'coach',
    [env.STRIPE_PRICE_ID_TEAM]: 'team',
  };
  if (id && byId[id]) return byId[id];
  const amount = typeof price === 'object' ? Number(price.unit_amount) : NaN;
  return AMOUNT_TO_PLAN[amount] || null;
}

/**
 * What a checkout for `planId` should do when the user already has a Stripe
 * subscription, judged by Stripe's own copy of it rather than our row.
 *
 * Starting a fresh Checkout on top of a live subscription is how one customer
 * ended up paying for Coach twice: the new subscription overwrote the row's
 * stripeSubscriptionId and the old one kept billing, invisible to us. The
 * portal cannot switch plans (turned off in the Dashboard), so a different
 * plan is switched in place instead.
 *
 * @param {object|null} stripeSubscription  stripe.subscriptions.retrieve result
 * @param {string} planId                   the plan being bought
 * @returns {'checkout'|'switch'|'already_subscribed'|'reactivate'|'past_due'}
 *   'checkout' when nothing is live in Stripe — our row was stale.
 */
function checkoutOverExisting(stripeSubscription, planId, env = process.env) {
  const status = stripeSubscription?.status;
  if (!['active', 'trialing', 'past_due'].includes(status)) return 'checkout';
  // A failing card is fixed first; switching price now would only stack a
  // second unpaid invoice on the first.
  if (status === 'past_due') return 'past_due';
  const current = planForStripePrice(stripeSubscription.items?.data?.[0]?.price, env);
  if (current !== planId) return 'switch';
  return stripeSubscription.cancel_at_period_end ? 'reactivate' : 'already_subscribed';
}

module.exports = { planForStripePrice, checkoutOverExisting };
