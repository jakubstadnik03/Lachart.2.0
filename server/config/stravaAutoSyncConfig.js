/**
 * Strava background auto-sync tuning (hardcoded — not read from env).
 * Change values here and redeploy; no Render env vars required.
 */

/** Scheduler tick interval (fallback when webhook is silent). */
const STRAVA_AUTO_SYNC_INTERVAL_MS = 5 * 60 * 1000;

/** Max users processed per scheduler tick. */
const STRAVA_AUTO_SYNC_BATCH_SIZE = 12;

/** Pause between users within one tick. */
const STRAVA_AUTO_SYNC_DELAY_BETWEEN_USERS_MS = 6 * 1000;

/** Pause between activity-list pages for one user. */
const STRAVA_AUTO_SYNC_PAGE_DELAY_MS = 1200;

/** First scheduler run after server start. */
const STRAVA_AUTO_SYNC_INITIAL_TICK_MS = 10 * 1000;

/** Skip a scheduler tick when local Strava budget usage exceeds this (0–1). */
const STRAVA_AUTO_SYNC_BUDGET_SKIP_PCT = 0.85;

/** Min time since last user sync before they are eligible again. */
const STRAVA_AUTO_SYNC_MIN_USER_AGE_MS = Math.max(
  STRAVA_AUTO_SYNC_INTERVAL_MS - 60 * 1000,
  2 * 60 * 1000,
);

/** Server-side gap for opportunistic POST /strava/auto-sync (non-force). */
const STRAVA_AUTO_SYNC_API_GAP_MS = 30 * 1000;

module.exports = {
  STRAVA_AUTO_SYNC_INTERVAL_MS,
  STRAVA_AUTO_SYNC_BATCH_SIZE,
  STRAVA_AUTO_SYNC_DELAY_BETWEEN_USERS_MS,
  STRAVA_AUTO_SYNC_PAGE_DELAY_MS,
  STRAVA_AUTO_SYNC_INITIAL_TICK_MS,
  STRAVA_AUTO_SYNC_BUDGET_SKIP_PCT,
  STRAVA_AUTO_SYNC_MIN_USER_AGE_MS,
  STRAVA_AUTO_SYNC_API_GAP_MS,
};
