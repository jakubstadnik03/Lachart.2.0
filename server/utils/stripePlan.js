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

module.exports = { planForStripePrice };
