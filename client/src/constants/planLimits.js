/**
 * Free-plan quotas, client side.
 *
 * The server is the authority — server/middleware/featureGate.js QUOTA_LIMITS
 * is what actually rejects a create, and server/controllers/subscriptionController.js
 * PLANS.limits is what the API reports. These constants exist so the UI stops
 * the user at the same number instead of letting them fill in a whole step test
 * and only meet the wall on save. Change all three together.
 *
 * Why not one: an athlete with two or more tests converts to a paid plan
 * roughly three times as often as one with a single test, because the second
 * test is the first time LaChart shows something a lab printout cannot — a
 * threshold moving. Charging before that moment gates the very thing that
 * earns the subscription.
 *
 * Why two and not three: a cap nobody reaches is not a cap. Measured on
 * production 2026-11-18, of 741 real accounts only 52 (7 %) had ever saved a
 * third test, so the wall this number draws was invisible to 93 % of the base
 * — while 121 accounts had reached a second. Moving it to two keeps both free
 * tests that earn the subscription (the first, and the one that shows the
 * threshold move) and more than doubles the number of people who ever meet the
 * paywall at all: 52 → 121.
 *
 * Conversion by tests saved, same measurement, for whoever revisits this:
 * 0 tests → 6.6 % ever paid, 1 → 9.0 %, 2 → 15.7 %, 3+ → 37.3 %.
 */

/** Lactate tests a free athlete may save, lifetime. */
export const FREE_TEST_LIMIT = 2;

/** Athletes a free coach may link. */
export const FREE_COACH_ATHLETE_LIMIT = 1;
