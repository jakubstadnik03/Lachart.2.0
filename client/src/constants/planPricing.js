/** Public subscription prices (EUR / month). Keep in sync with server/controllers/subscriptionController.js PLANS. */
export const ATHLETE_PLAN_PRICE_EUR = 6.99;
export const COACH_PLAN_PRICE_EUR = 14.99;

export function formatEurPrice(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '€—';
  return Number.isInteger(n) ? `€${n}` : `€${n.toFixed(2)}`;
}

export const ATHLETE_PLAN_PRICE_LABEL = formatEurPrice(ATHLETE_PLAN_PRICE_EUR);
export const COACH_PLAN_PRICE_LABEL = formatEurPrice(COACH_PLAN_PRICE_EUR);

/** Stripe / API plan id for the athlete tier (legacy key: pro). */
export const ATHLETE_PLAN_ID = 'pro';
