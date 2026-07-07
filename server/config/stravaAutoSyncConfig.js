/**
 * Strava background auto-sync tuning (hardcoded — not read from env).
 * Change values here and redeploy; no Render env vars required.
 */

/** Scheduler tick interval (fallback when webhook is silent). */
const STRAVA_AUTO_SYNC_INTERVAL_MS = 5 * 60 * 1000;

/** Max users processed per scheduler tick (capped further by live budget headroom). */
const STRAVA_AUTO_SYNC_BATCH_SIZE = 10;

/** Pause between users within one tick. */
const STRAVA_AUTO_SYNC_DELAY_BETWEEN_USERS_MS = 8 * 1000;

/** Pause between activity-list pages for one user. */
const STRAVA_AUTO_SYNC_PAGE_DELAY_MS = 1200;

/** First scheduler run after server start. */
const STRAVA_AUTO_SYNC_INITIAL_TICK_MS = 20 * 1000;

/** Skip a scheduler tick when local Strava budget usage exceeds this (0–1). */
const STRAVA_AUTO_SYNC_BUDGET_SKIP_PCT = 0.92;

/** Reserve budget tokens for webhooks / bursts (keep small so polling still runs). */
const STRAVA_AUTO_SYNC_WEBHOOK_RESERVE = 6;

/** Estimated API calls per polled user. */
const STRAVA_AUTO_SYNC_CALLS_PER_USER = 2;

/** Max list pages for scheduler-driven incremental sync. */
const STRAVA_AUTO_SYNC_SCHEDULER_MAX_PAGES = 2;

/** Max list pages for app-open / API auto-sync. */
const STRAVA_AUTO_SYNC_BACKGROUND_MAX_PAGES = 3;

/** Min time since last user sync before scheduler picks them again. */
const STRAVA_AUTO_SYNC_MIN_USER_AGE_MS = 3 * 60 * 1000;

/** Server-side gap for opportunistic POST /strava/auto-sync (non-force). */
const STRAVA_AUTO_SYNC_API_GAP_MS = 45 * 1000;

/** User is "stale" after this — prioritized in scheduler + status queue. */
const STRAVA_AUTO_SYNC_STALE_USER_MS = 30 * 60 * 1000;

/** Min gap between background syncs triggered from GET /strava/status. */
const STRAVA_AUTO_SYNC_STALE_QUEUE_MS = 12 * 60 * 1000;

/** Force at least one stale user per tick even when budget is tight. */
const STRAVA_AUTO_SYNC_STALE_FORCE_MS = 2 * 60 * 60 * 1000;

/** How far back the automatic first-connect backfill pulls (days). */
const STRAVA_BACKFILL_LOOKBACK_DAYS = 365;

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
  STRAVA_AUTO_SYNC_STALE_USER_MS,
  STRAVA_AUTO_SYNC_STALE_QUEUE_MS,
  STRAVA_AUTO_SYNC_STALE_FORCE_MS,
  STRAVA_BACKFILL_LOOKBACK_DAYS,
};
