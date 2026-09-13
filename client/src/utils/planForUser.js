/**
 * Which subscription a locked feature should offer.
 *
 * Every gate in the app asks for the athlete tier ("pro") by default, and a
 * coach who hit one was shown "LaChart Athlete — €6.99": the wrong plan, and
 * one that would not have unlocked coach features anyway. Coaches buy the
 * Coach plan.
 */
const COACH_ROLES = new Set(['coach', 'tester', 'testing']);

export function planForUser(requiredPlan, user) {
  const role = String(user?.role || '').toLowerCase();
  if (requiredPlan === 'pro' && COACH_ROLES.has(role)) return 'coach';
  return requiredPlan;
}

export default planForUser;
