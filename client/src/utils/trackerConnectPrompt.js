/**
 * Shared rules for asking someone to connect a tracker.
 *
 * Why this exists: a saved test produces LT1/LT2, but those numbers only do
 * anything once there is real training to measure against them. In October 2026
 * 383 accounts had saved a test while only 149 had a tracker connected, and
 * 275 free accounts had a test and no tracker at all — so for most people the
 * second half of the product never switched on.
 *
 * There are two moments worth asking at, and they share a throttle so they can
 * never stack on one person:
 *
 *  - **post-save** — right after a test is saved, the one moment when the
 *    thresholds are on screen and connecting a watch has obvious value.
 *  - **standing** — someone who already has a test and still no tracker, on a
 *    later visit. The app had generic versions of this in both shells already;
 *    what it did not have was the ask carrying the person's own numbers, and
 *    on the web it never came back after onboarding consumed it once.
 *
 * Both shells (web `Layout` / `TestingForm`, native dashboard / testing page)
 * go through these helpers so the conditions and the cadence stay in one place.
 */

const STORAGE_KEY = 'trackerConnectPrompt';

/** Post-save: never more than this many for one account, ever. */
export const MAX_PROMPTS = 2;

/** Post-save: leave this long between asks, so a run of tests produces one. */
export const MIN_DAYS_BETWEEN = 14;

/** Standing: a few more chances, since it is the only ask a lapsed user gets. */
export const MAX_STANDING_PROMPTS = 3;

/** Standing: a month apart — this one follows someone around, so it is gentler. */
export const MIN_STANDING_DAYS_BETWEEN = 30;

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
    if (!raw) return { postSave: 0, standing: 0, lastAnyAt: 0 };
    const parsed = JSON.parse(raw);
    return {
      // `count` / `lastAt` is the original post-save-only shape.
      postSave: Number(parsed?.postSave ?? parsed?.count) || 0,
      standing: Number(parsed?.standing) || 0,
      lastAnyAt: Number(parsed?.lastAnyAt ?? parsed?.lastAt) || 0,
    };
  } catch {
    // Storage blocked or holding junk — treat as "never asked" and let the
    // write below fail just as quietly.
    return { postSave: 0, standing: 0, lastAnyAt: 0 };
  }
}

function writeState(next) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* storage blocked — the ask simply isn't throttled on this device */
  }
}

/** The checks both moments share: a real signed-in person whose test it is. */
function eligible({ user, demoMode, testAthleteId }) {
  if (demoMode) return false;
  if (!user?._id) return false;
  if (hasTrackerConnected(user)) return false;

  // A coach or tester testing someone else: connecting their own watch would
  // do nothing for that athlete's zones, so stay quiet.
  const role = String(user.role || '').toLowerCase();
  if (role === 'tester' || role === 'testing') return false;
  if (testAthleteId) {
    if (String(testAthleteId) !== String(user._id)) return false;
  } else if (role !== 'athlete') {
    // Anyone who can test on someone else's behalf and whose test we can't
    // attribute: assume it is a client's, not their own.
    return false;
  }
  return true;
}

/**
 * Ask right after a test was saved.
 *
 * @param {object}  o
 * @param {object}  o.user            the signed-in user
 * @param {boolean} [o.demoMode]      demo pages never prompt
 * @param {string}  [o.testAthleteId] who the saved test belongs to
 * @returns {boolean}
 */
export function shouldPromptTrackerConnect({ user, demoMode = false, testAthleteId } = {}) {
  if (!eligible({ user, demoMode, testAthleteId })) return false;
  const { postSave, lastAnyAt } = readState();
  if (postSave >= MAX_PROMPTS) return false;
  if (lastAnyAt && Date.now() - lastAnyAt < MIN_DAYS_BETWEEN * DAY_MS) return false;
  return true;
}

/** Record that the post-save prompt was shown. Call as it opens, not on connect. */
export function markTrackerPromptShown() {
  const s = readState();
  writeState({ postSave: s.postSave + 1, standing: s.standing, lastAnyAt: Date.now() });
}

/**
 * Ask someone who already has a test and still no tracker, on a later visit.
 * `hasTest` is the caller's job — it is the expensive part and each shell
 * already knows, or can cheaply find out, whether the person has one.
 *
 * @param {object}  o
 * @param {object}  o.user       the signed-in user
 * @param {boolean} o.hasTest    whether they have saved a lactate test
 * @param {boolean} [o.demoMode]
 * @returns {boolean}
 */
export function shouldRaiseStandingTrackerPrompt({ user, hasTest, demoMode = false } = {}) {
  if (!hasTest) return false;
  // No test id to attribute here, so an athlete account is the safe bar: a
  // coach's standing ask is the generic one their shell already shows.
  if (!eligible({ user, demoMode })) return false;
  const { standing, lastAnyAt } = readState();
  if (standing >= MAX_STANDING_PROMPTS) return false;
  if (lastAnyAt && Date.now() - lastAnyAt < MIN_STANDING_DAYS_BETWEEN * DAY_MS) return false;
  return true;
}

/** Record that the standing prompt was shown. */
export function markStandingTrackerPromptShown() {
  const s = readState();
  writeState({ postSave: s.postSave, standing: s.standing + 1, lastAnyAt: Date.now() });
}

/** Test seam: forget that we ever asked. */
export function resetTrackerPromptState() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* nothing to clear */
  }
}
