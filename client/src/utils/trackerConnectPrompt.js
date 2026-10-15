/**
 * Shared rules for the "connect a tracker" prompt shown right after someone
 * saves a lactate test.
 *
 * Why this moment: a saved test produces LT1/LT2, but those numbers only do
 * anything once there is real training to measure against them. In October 2026
 * 383 accounts had saved a test while only 149 had a tracker connected, and
 * 275 free accounts had a test and no tracker at all — so for most people the
 * second half of the product never switched on. Seeing your own thresholds is
 * the one moment when "connect Strava" has obvious value, which is why the ask
 * lives here rather than in another email.
 *
 * Both the web form (Testing-page/TestingForm) and the native sheet
 * (NativeTestingPage) call these helpers, so the conditions and the throttle
 * stay in one place.
 */

const STORAGE_KEY = 'trackerConnectPrompt';

/** Never more than this many prompts for one account, ever. */
export const MAX_PROMPTS = 2;

/** Leave this long between prompts, so a run of tests produces one ask. */
export const MIN_DAYS_BETWEEN = 14;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Apple Health deliberately does not count: it is connected for recovery only
 * (sleep, resting HR, HRV) and carries no workouts, so it leaves the zones
 * with nothing to measure against.
 */
export function hasTrackerConnected(user) {
  return Boolean(
    user?.strava?.athleteId
    || user?.garmin?.athleteId
    || user?.coros?.athleteId
    || user?.polar?.athleteId
  );
}

function readState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { count: 0, lastAt: 0 };
    const parsed = JSON.parse(raw);
    return {
      count: Number(parsed?.count) || 0,
      lastAt: Number(parsed?.lastAt) || 0,
    };
  } catch {
    // Storage blocked or holding junk — treat as "never asked" and let the
    // write below fail just as quietly.
    return { count: 0, lastAt: 0 };
  }
}

/**
 * @param {object}  o
 * @param {object}  o.user           the signed-in user
 * @param {boolean} [o.demoMode]     demo pages never prompt
 * @param {string}  [o.testAthleteId] who the saved test belongs to
 * @returns {boolean}
 */
export function shouldPromptTrackerConnect({ user, demoMode = false, testAthleteId } = {}) {
  if (demoMode) return false;
  if (!user?._id) return false;
  if (hasTrackerConnected(user)) return false;

  // A coach or tester saving a test for someone else: connecting their own
  // watch would do nothing for that athlete's zones, so stay quiet.
  const role = String(user.role || '').toLowerCase();
  if (role === 'tester' || role === 'testing') return false;
  if (testAthleteId) {
    if (String(testAthleteId) !== String(user._id)) return false;
  } else if (role !== 'athlete') {
    // Anyone who can test on someone else's behalf and whose test we can't
    // attribute: assume it is a client's, not their own.
    return false;
  }

  const { count, lastAt } = readState();
  if (count >= MAX_PROMPTS) return false;
  if (lastAt && Date.now() - lastAt < MIN_DAYS_BETWEEN * DAY_MS) return false;
  return true;
}

/** Record that the prompt was shown. Call this as it opens, not on connect. */
export function markTrackerPromptShown() {
  const { count } = readState();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      count: count + 1,
      lastAt: Date.now(),
    }));
  } catch {
    /* storage blocked — the prompt simply isn't throttled on this device */
  }
}

/** Test seam: forget that we ever asked. */
export function resetTrackerPromptState() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* nothing to clear */
  }
}
