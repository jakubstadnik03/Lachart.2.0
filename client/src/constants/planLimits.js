/**
 * Free-plan quotas, client side.
 *
 * The server is the authority — server/middleware/featureGate.js QUOTA_LIMITS
 * is what actually rejects a create, and server/controllers/subscriptionController.js
 * PLANS.limits is what the API reports. These constants exist so the UI stops
 * the user at the same number instead of letting them fill in a whole step test
 * and only meet the wall on save. Change all three together.
 *
 * Why three tests and not one: an athlete with two or more tests converts to a
 * paid plan roughly three times as often as one with a single test, because the
 * second test is the first time LaChart shows something a lab printout cannot —
 * a threshold moving. Charging before that moment gates the very thing that
 * earns the subscription.
 */

/** Lactate tests a free athlete may save, lifetime. */
export const FREE_TEST_LIMIT = 3;

/** Athletes a free coach may link. */
export const FREE_COACH_ATHLETE_LIMIT = 1;
