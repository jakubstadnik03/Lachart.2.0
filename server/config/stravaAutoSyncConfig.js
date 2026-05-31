/**
 * Strava background auto-sync tuning (hardcoded — not read from env).
 * Change values here and redeploy; no Render env vars required.
 *
 * Webhooks handle real-time imports; the scheduler is a fallback only.
 * Keep polling light so prewarm + webhooks are not starved (local budget 90/15m).
 */

/** Scheduler tick interval (fallback when webhook is silent). */
const STRAVA_AUTO_SYNC_INTERVAL_MS = 10 * 60 * 1000;

/** Max users processed per scheduler tick (capped further by live budget headroom). */
const STRAVA_AUTO_SYNC_BATCH_SIZE = 4;

/** Pause between users within one tick. */
const STRAVA_AUTO_SYNC_DELAY_BETWEEN_USERS_MS = 10 * 1000;

/** Pause between activity-list pages for one user. */
const STRAVA_AUTO_SYNC_PAGE_DELAY_MS = 1500;

/** First scheduler run after server start. */
const STRAVA_AUTO_SYNC_INITIAL_TICK_MS = 30 * 1000;

/** Skip a scheduler tick when local Strava budget usage exceeds this (0–1). */
const STRAVA_AUTO_SYNC_BUDGET_SKIP_PCT = 0.7;

/** Reserve this many budget tokens for webhooks / manual sync per tick. */
const STRAVA_AUTO_SYNC_WEBHOOK_RESERVE = 20;

/** Estimated API calls per polled user (list + occasional extra page). */
const STRAVA_AUTO_SYNC_CALLS_PER_USER = 3;

/** Max list pages for scheduler-driven incremental sync. */
const STRAVA_AUTO_SYNC_SCHEDULER_MAX_PAGES = 1;

/** Max list pages for app-open / API auto-sync. */
const STRAVA_AUTO_SYNC_BACKGROUND_MAX_PAGES = 2;

/** Min time since last user sync before they are eligible again. */
const STRAVA_AUTO_SYNC_MIN_USER_AGE_MS = Math.max(
  STRAVA_AUTO_SYNC_INTERVAL_MS - 2 * 60 * 1000,
  8 * 60 * 1000,
);

/** Server-side gap for opportunistic POST /strava/auto-sync (non-force). */
const STRAVA_AUTO_SYNC_API_GAP_MS = 60 * 1000;

module.exports = {
  STRAVA_AUTO_SYNC_INTERVAL_MS,
  STRAVA_AUTO_SYNC_BATCH_SIZE,
  STRAVA_AUTO_SYNC_DELAY_BETWEEN_USERS_MS,
  STRAVA_AUTO_SYNC_PAGE_DELAY_MS,
  STRAVA_AUTO_SYNC_INITIAL_TICK_MS,
  STRAVA_AUTO_SYNC_BUDGET_SKIP_PCT,
  STRAVA_AUTO_SYNC_WEBHOOK_RESERVE,
  STRAVA_AUTO_SYNC_CALLS_PER_USER,
  STRAVA_AUTO_SYNC_SCHEDULER_MAX_PAGES,
  STRAVA_AUTO_SYNC_BACKGROUND_MAX_PAGES,
  STRAVA_AUTO_SYNC_MIN_USER_AGE_MS,
  STRAVA_AUTO_SYNC_API_GAP_MS,
};
