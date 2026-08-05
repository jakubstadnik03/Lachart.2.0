/**
 * Process-local token bucket for outbound Strava API calls.
 *
 * Strava's published default limits (per the official API docs):
 *   • Overall:    200 requests / 15-min, 2 000 / day
 *   • Non-upload: 100 requests / 15-min, 1 000 / day
 *
 * Every endpoint LaChart uses falls under the NON-UPLOAD bucket
 * (athlete/activities, /activities/:id, /activities/:id/streams,
 * /activities/:id/laps, /push_subscriptions, /oauth/token). We size our
 * budget against that lower limit so we can never accidentally drain the
 * "overall" bucket either.
 *
 * Strava also returns these counters in EVERY response header:
 *   X-RateLimit-Limit:  600,30000        ← what Strava is enforcing for us
 *   X-RateLimit-Usage:  314,27536        ← what we've used so far
 *   X-ReadRateLimit-Limit: 200,2000      ← non-upload limit
 *   X-ReadRateLimit-Usage: 47,512        ← non-upload usage
 *
 * `reconcileFromHeaders(headers)` parses those and snaps our local
 * counter to Strava's authoritative number — defending against drift
 * caused by other processes (a second Render instance, a manual cron
 * script, etc.) all sharing the same Strava app credentials.
 *
 * Tokens regenerate per-window, NOT a smooth drip, matching how Strava
 * itself counts. Windows align on natural 15-min boundaries
 * (00/15/30/45 past the hour) so our window rolls match Strava's.
 *
 * Env overrides:
 *   STRAVA_QUOTA_15MIN  — default 90  (Strava says 100, reserve 10)
 *   STRAVA_QUOTA_DAILY  — default 900 (Strava says 1000, reserve 100)
 */

const WINDOW_MS = 15 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// Defaults sized against Strava's NON-UPLOAD limit (the binding constraint
// for everything LaChart does), with a small safety headroom so a burst
// won't tip us over Strava's actual 100/15-min cap.
const MAX_PER_WINDOW = Number(process.env.STRAVA_QUOTA_15MIN || 90);
const MAX_PER_DAY    = Number(process.env.STRAVA_QUOTA_DAILY || 900);

// Wait this long max before giving up — if the bucket says "no" for longer
// than this, the caller raises STRAVA_BUDGET_EXHAUSTED and the route surfaces
// 429 to the client instead of hanging forever.
const MAX_WAIT_MS = 30 * 1000;

// Aligns on 0/15/30/45 — matches Strava's documented reset boundaries.
let windowStart = Math.floor(Date.now() / WINDOW_MS) * WINDOW_MS;
let dayStart = (() => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime();
})();
let windowUsed = 0;
let dayUsed = 0;

/**
 * Strava's OWN read limits, learned from `X-ReadRateLimit-Limit` (e.g. "200,2000").
 *
 * The hardcoded MAX_PER_* above are only a cold-start guess, and they guessed
 * low: Strava's read allowance is 200/15min and 2000/day, not 100/1000. That
 * mismatch used to be fatal because reconcile clamped Strava's reported usage
 * with Math.min(reported, MAX_PER_DAY) — so the moment Strava's daily read
 * count passed 900 (less than half of what it actually allows) our counter
 * pinned to exactly the limit and read as "exhausted", locking out every sync
 * and backfill until midnight UTC. Observed in production: 727 refusals with
 * durationMs 0 against only 25 calls that ever reached Strava.
 *
 * Track the real limits and measure usage against those instead.
 */
let observedWindowLimit = null;
let observedDayLimit = null;
/** Headroom kept below Strava's real limit so a burst can't tip us over. */
const RESERVE_WINDOW = Number(process.env.STRAVA_QUOTA_RESERVE_15MIN || 20);
const RESERVE_DAY = Number(process.env.STRAVA_QUOTA_RESERVE_DAILY || 200);

/** Limit we actually enforce: Strava's reported allowance when known. */
function effectiveWindowLimit() {
  return observedWindowLimit ? Math.max(1, observedWindowLimit - RESERVE_WINDOW) : MAX_PER_WINDOW;
}
function effectiveDayLimit() {
  return observedDayLimit ? Math.max(1, observedDayLimit - RESERVE_DAY) : MAX_PER_DAY;
}

function rollWindowsIfDue() {
  const now = Date.now();
  const currentWindow = Math.floor(now / WINDOW_MS) * WINDOW_MS;
  if (currentWindow !== windowStart) {
    windowStart = currentWindow;
    windowUsed = 0;
  }
  // Daily resets at midnight UTC (matches Strava).
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  const currentDay = d.getTime();
  if (currentDay !== dayStart) {
    dayStart = currentDay;
    dayUsed = 0;
  }
}

/** Reserve one token. Returns when granted, or throws after MAX_WAIT_MS.
 *
 * Options:
 *   bypass: true — skip the soft-budget check and proceed regardless.
 *           Use ONLY for user-initiated actions (Settings → Sync now click),
 *           NEVER for automated backfill loops. Our local counter is a
 *           defensive estimate; Strava is the actual gatekeeper and will
 *           return a real HTTP 429 if we're truly over. A user click is
 *           worth letting through even if our estimator is conservative.
 *           The window/day counters still increment so the bucket reflects
 *           reality on the next non-bypass call.
 */
async function take(opts = {}) {
  const { bypass = false } = opts;
  if (bypass) {
    rollWindowsIfDue();
    windowUsed += 1;
    dayUsed += 1;
    return;
  }
  const startedAt = Date.now();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    rollWindowsIfDue();
    const winLimit = effectiveWindowLimit();
    const dayLimit = effectiveDayLimit();
    if (windowUsed < winLimit && dayUsed < dayLimit) {
      windowUsed += 1;
      dayUsed += 1;
      return;
    }
    const windowResetIn = windowStart + WINDOW_MS - Date.now();
    const dayResetIn = dayStart + DAY_MS - Date.now();
    const waitMs = windowUsed >= winLimit ? windowResetIn : dayResetIn;
    if (Date.now() - startedAt + waitMs > MAX_WAIT_MS) {
      const err = new Error('Strava local budget exhausted');
      err.code = 'STRAVA_BUDGET_EXHAUSTED';
      err.retryAfterSec = Math.ceil(waitMs / 1000);
      err.snapshot = snapshot();
      throw err;
    }
    await new Promise((resolve) => setTimeout(resolve, Math.min(2000, Math.max(100, waitMs))));
  }
}

/** Admin escape hatch — zero the local counters. Used by the Strava status
 *  admin endpoint to recover from a runaway-backfill estimate without
 *  restarting the Node process. The next Strava response will re-snap us
 *  to reality via reconcileFromHeaders, so we won't over-fire. */
function reset() {
  windowUsed = 0;
  dayUsed = 0;
  windowStart = Math.floor(Date.now() / WINDOW_MS) * WINDOW_MS;
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  dayStart = d.getTime();
}

/**
 * Sync our local counter to Strava's authoritative usage from response
 * headers. Call this right after every successful Strava API request so
 * the bucket reflects reality — protects against drift caused by:
 *   • A second backend instance (e.g. Render scale-up) sharing the same
 *     Strava credentials.
 *   • External cron / debug scripts using the same app token.
 *   • Our local count getting slightly off from a missed `take()`.
 *
 * Strava sends BOTH overall (`X-RateLimit-*`) and read-only
 * (`X-ReadRateLimit-*`) counters. Since we only use non-upload endpoints,
 * the read-only counter is the binding one — prefer it if present, else
 * fall back to overall.
 */
function reconcileFromHeaders(headers = {}) {
  if (!headers || typeof headers !== 'object') return;
  // Header names are case-insensitive — axios normalises to lowercase.
  const readUsage = headers['x-readratelimit-usage'] || headers['X-ReadRateLimit-Usage'];
  // Never fall back to X-RateLimit-Usage (overall 600/15m bucket). Snapping that
  // into our 90-cap read estimator falsely marks the budget exhausted and breaks
  // webhooks + scheduler for the rest of the window.
  if (!readUsage || typeof readUsage !== 'string') return;
  const parts = readUsage.split(',').map((s) => Number(s.trim()));
  if (parts.length < 2 || !Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) return;
  const [stravaWindowUsed, stravaDayUsed] = parts;

  // Learn Strava's actual allowance so we measure usage against the real
  // ceiling rather than our cold-start guess.
  const readLimit = headers['x-readratelimit-limit'] || headers['X-ReadRateLimit-Limit'];
  if (typeof readLimit === 'string') {
    const lim = readLimit.split(',').map((s) => Number(s.trim()));
    if (lim.length >= 2 && Number.isFinite(lim[0]) && Number.isFinite(lim[1]) && lim[0] > 0 && lim[1] > 0) {
      observedWindowLimit = lim[0];
      observedDayLimit = lim[1];
    }
  }

  rollWindowsIfDue();
  // Snap UP if Strava knows about more usage than we counted. Never snap DOWN
  // — our counter might have just bumped for a request still in flight that
  // Strava hasn't logged yet.
  //
  // Record Strava's number as-is. Clamping it to our own cap used to write
  // exactly MAX_PER_DAY into dayUsed, which is indistinguishable from
  // "exhausted" and wedged every sync until midnight UTC even though Strava
  // still had well over a thousand read calls left.
  if (stravaWindowUsed > windowUsed) windowUsed = stravaWindowUsed;
  if (stravaDayUsed > dayUsed) dayUsed = stravaDayUsed;
}

/** Snapshot for /strava/status diagnostics. */
function snapshot() {
  rollWindowsIfDue();
  return {
    windowUsed,
    windowLimit: effectiveWindowLimit(),
    windowResetIn: Math.max(0, windowStart + WINDOW_MS - Date.now()),
    dayUsed,
    dayLimit: effectiveDayLimit(),
    dayResetIn: Math.max(0, dayStart + DAY_MS - Date.now()),
    // Null until the first Strava response teaches us the real allowance.
    stravaReportedWindowLimit: observedWindowLimit,
    stravaReportedDayLimit: observedDayLimit,
  };
}

module.exports = { take, snapshot, reconcileFromHeaders, reset };
