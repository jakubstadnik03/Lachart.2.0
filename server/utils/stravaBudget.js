/**
 * Process-local token bucket for outbound Strava API calls.
 *
 * Strava's rate limit is per-app (not per-user). Three writers can easily
 * flood the bucket:
 *   1. The webhook handler reacting to a morning upload burst (50+ events
 *      in a 15-min window).
 *   2. startStravaHistoricalBackfill() chewing through a user's 10-year
 *      ride history at 3 pages / 20 s.
 *   3. /power-metrics loops fetching `/streams` for every activity in a
 *      window (now mostly cached, but still happens on cache miss).
 *
 * The bucket reserves a fixed budget for each 15-min window with a small
 * safety headroom so we NEVER hit Strava's actual 429 threshold. Each
 * caller awaits `await stravaBudget.take()` before its axios.get/post.
 *
 * Numbers (defaults; overridable via env):
 *   - STRAVA_QUOTA_15MIN: 500 (Strava's read limit is 600; reserve 100)
 *   - STRAVA_QUOTA_DAILY: 1800 (Strava's daily read limit is 2000; reserve 200)
 *
 * Tokens regenerate at the same rate the window does — strictly per-window,
 * NOT a smooth drip, matching how Strava itself counts.
 */

const WINDOW_MS = 15 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const MAX_PER_WINDOW = Number(process.env.STRAVA_QUOTA_15MIN || 500);
const MAX_PER_DAY = Number(process.env.STRAVA_QUOTA_DAILY || 1800);

// Wait this long max before giving up — if the bucket says "no" for longer
// than this, the caller raises BUDGET_TIMEOUT and the route surfaces 429 to
// the client instead of hanging forever.
const MAX_WAIT_MS = 30 * 1000;

let windowStart = Math.floor(Date.now() / WINDOW_MS) * WINDOW_MS;
let dayStart = (() => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime();
})();
let windowUsed = 0;
let dayUsed = 0;

function rollWindowsIfDue() {
  const now = Date.now();
  // 15-min Strava window aligns on minute % 15 boundaries (00, 15, 30, 45).
  const currentWindow = Math.floor(now / WINDOW_MS) * WINDOW_MS;
  if (currentWindow !== windowStart) {
    windowStart = currentWindow;
    windowUsed = 0;
  }
  // Daily window resets at midnight UTC (Strava's reset is also midnight UTC).
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  const currentDay = d.getTime();
  if (currentDay !== dayStart) {
    dayStart = currentDay;
    dayUsed = 0;
  }
}

/** Reserve one token. Returns when granted, or throws after MAX_WAIT_MS. */
async function take() {
  const startedAt = Date.now();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    rollWindowsIfDue();
    if (windowUsed < MAX_PER_WINDOW && dayUsed < MAX_PER_DAY) {
      windowUsed += 1;
      dayUsed += 1;
      return;
    }
    // How long until either bucket frees up?
    const windowResetIn = windowStart + WINDOW_MS - Date.now();
    const dayResetIn = dayStart + DAY_MS - Date.now();
    const waitMs = windowUsed >= MAX_PER_WINDOW ? windowResetIn : dayResetIn;
    if (Date.now() - startedAt + waitMs > MAX_WAIT_MS) {
      const err = new Error('Strava local budget exhausted');
      err.code = 'STRAVA_BUDGET_EXHAUSTED';
      err.retryAfterSec = Math.ceil(waitMs / 1000);
      throw err;
    }
    // Sleep briefly and re-check (cheap busy-wait at human timescales).
    await new Promise((resolve) => setTimeout(resolve, Math.min(2000, Math.max(100, waitMs))));
  }
}

/** Snapshot for /strava/status diagnostics. */
function snapshot() {
  rollWindowsIfDue();
  return {
    windowUsed,
    windowLimit: MAX_PER_WINDOW,
    windowResetIn: Math.max(0, windowStart + WINDOW_MS - Date.now()),
    dayUsed,
    dayLimit: MAX_PER_DAY,
    dayResetIn: Math.max(0, dayStart + DAY_MS - Date.now()),
  };
}

module.exports = { take, snapshot };
