const { syncStravaForAllUsers } = require('./stravaAutoSyncService');
const stravaBudget = require('../utils/stravaBudget');
const { recordStravaSyncLogSafe } = require('./stravaSyncLogService');
const {
  STRAVA_AUTO_SYNC_INTERVAL_MS,
  STRAVA_AUTO_SYNC_BATCH_SIZE,
  STRAVA_AUTO_SYNC_DELAY_BETWEEN_USERS_MS,
  STRAVA_AUTO_SYNC_INITIAL_TICK_MS,
  STRAVA_AUTO_SYNC_BUDGET_SKIP_PCT,
  STRAVA_AUTO_SYNC_WEBHOOK_RESERVE,
  STRAVA_AUTO_SYNC_CALLS_PER_USER,
  STRAVA_AUTO_SYNC_STALE_FORCE_MS,
} = require('../config/stravaAutoSyncConfig');
const User = require('../models/UserModel');
const { claimSchedulerLock } = require('../utils/schedulerLock');

/**
 * Start the Strava auto-sync scheduler
 * This will periodically sync Strava activities for all users with auto-sync enabled
 */
function startStravaAutoSyncScheduler() {
  const enabled = process.env.ENABLE_STRAVA_AUTO_SYNC_SCHEDULER === 'true' || process.env.NODE_ENV === 'production';
  if (!enabled) {
    console.log('[StravaAutoSyncScheduler] Disabled (set ENABLE_STRAVA_AUTO_SYNC_SCHEDULER=true to enable).');
    return;
  }

  // Historical-import recovery MUST run independently of the polling tick.
  // The in-tick resume (below) is gated behind budget/headroom early-returns,
  // and the whole tick is skipped when STRAVA_DISABLE_POLL=true — so a user's
  // stalled backfill (server restarted mid-import, in-memory setTimeout lost)
  // used to only recover on the next full server boot. On a long-lived Render
  // process that meant history stuck for days. This dedicated loop nudges any
  // 'running' backfill that hasn't progressed, regardless of poll/budget state.
  // Safe on the API budget: runBatch() throttles via stravaBudget internally.
  startStravaBackfillResumeLoop();

  // Once the Strava webhook subscription is in place and proven reliable, set
  // STRAVA_DISABLE_POLL=true on the server to stop the periodic sync entirely.
  // Webhook will deliver new activities in real-time and skipping polling
  // keeps the rate-limit budget free for ad-hoc detail fetches.
  if (process.env.STRAVA_DISABLE_POLL === 'true') {
    console.log('[StravaAutoSyncScheduler] STRAVA_DISABLE_POLL=true — polling skipped, webhook only (backfill resume loop still active).');
    return;
  }

  const intervalMs = STRAVA_AUTO_SYNC_INTERVAL_MS;
  const batchSize = STRAVA_AUTO_SYNC_BATCH_SIZE;
  const delayBetweenUsers = STRAVA_AUTO_SYNC_DELAY_BETWEEN_USERS_MS;

  /** Rate-limited skips are logged at most once per lockout, not once per tick. */
  let lockoutLoggedUntil = 0;

  const tick = async () => {
    try {
      // Strava is refusing the whole application right now. Ticking anyway is
      // how a 15-minute rate limit became a 24-hour outage: 5 719 refused
      // calls, nothing imported, and the quota never free long enough for the
      // webhook bootstrap to register.
      if (stravaBudget.isLocked()) {
        const left = stravaBudget.lockoutSecondsRemaining();
        if (Date.now() > lockoutLoggedUntil) {
          console.log(`[StravaAutoSyncScheduler] Skipping ticks — Strava rate limit, ${left}s left.`);
          recordStravaSyncLogSafe({
            source: 'scheduler',
            status: 'rate_limited',
            rateLimited: true,
            retryAfterSec: left,
            error: `Scheduler paused — Strava rate limit active for ${left}s`,
            budgetSnapshot: stravaBudget.snapshot(),
          });
          // One row per lockout: the old code wrote one per skipped tick, which
          // is how the sync log filled with thousands of identical entries.
          lockoutLoggedUntil = Date.now() + left * 1000;
        }
        return;
      }

      // Only one instance may poll. The Strava allowance is per application,
      // so a second Render instance doubles the spend against the same quota
      // while each process believes it is well inside budget.
      const gotLock = await claimSchedulerLock('strava-auto-sync', Math.max(intervalMs * 2, 60_000));
      if (!gotLock) {
        console.log('[StravaAutoSyncScheduler] Another instance holds the polling lease — skipping tick.');
        return;
      }

      // Defence against budget exhaustion — if the local Strava token bucket
      // is already > 85 % used for the current 15-min window (typically
      // because a historical backfill is in flight, or a morning upload
      // burst has fired a lot of webhook detail fetches), skip this tick
      // entirely. The next tick will see a fresher window and try again.
      // Without this guard the scheduler would compete with backfill / webhooks
      // for the same finite budget and trigger 429s.
      const snap = stravaBudget.snapshot();
      const usedPct = snap.windowLimit > 0 ? snap.windowUsed / snap.windowLimit : 0;
      if (usedPct > STRAVA_AUTO_SYNC_BUDGET_SKIP_PCT) {
        console.log(`[StravaAutoSyncScheduler] Skipping tick — budget ${snap.windowUsed}/${snap.windowLimit} (${Math.round(usedPct * 100)}%) used.`);
        recordStravaSyncLogSafe({
          source: 'scheduler',
          status: 'rate_limited',
          rateLimited: true,
          error: `Scheduler skipped because Strava budget is ${Math.round(usedPct * 100)}% used`,
          budgetSnapshot: snap,
        });
        return;
      }
      const headroom = Math.max(0, snap.windowLimit - snap.windowUsed);
      const dynamicBatch = Math.min(
        batchSize,
        Math.floor(Math.max(0, headroom - STRAVA_AUTO_SYNC_WEBHOOK_RESERVE) / STRAVA_AUTO_SYNC_CALLS_PER_USER),
      );
      let effectiveBatch = dynamicBatch;
      if (effectiveBatch < 1) {
        // Never starve users who have not synced in hours — run one anyway.
        const staleCutoff = new Date(Date.now() - STRAVA_AUTO_SYNC_STALE_FORCE_MS);
        const veryStale = await User.countDocuments({
          'strava.accessToken': { $exists: true, $ne: null },
          'strava.autoSync': true,
          isActive: { $ne: false },
          $or: [
            { 'strava.lastSyncDate': { $exists: false } },
            { 'strava.lastSyncDate': null },
            { 'strava.lastSyncDate': { $lt: staleCutoff } },
          ],
        });
        if (veryStale > 0) {
          effectiveBatch = 1;
          console.log(`[StravaAutoSyncScheduler] Forcing batch=1 — ${veryStale} user(s) stale >2h, headroom ${headroom}`);
        } else {
          console.log(`[StravaAutoSyncScheduler] Skipping tick — headroom ${headroom} (reserve ${STRAVA_AUTO_SYNC_WEBHOOK_RESERVE})`);
          recordStravaSyncLogSafe({
            source: 'scheduler',
            status: 'skipped',
            message: 'Scheduler skipped — budget reserved for webhooks',
            budgetSnapshot: snap,
          });
          return;
        }
      }
      console.log('[StravaAutoSyncScheduler] Starting scheduled sync...', {
        windowBudget: `${snap.windowUsed}/${snap.windowLimit}`,
        effectiveBatch,
      });
      const result = await syncStravaForAllUsers({ batchSize: effectiveBatch, delayBetweenUsers });
      console.log('[StravaAutoSyncScheduler] Scheduled sync completed:', {
        total: result.total,
        synced: result.synced,
        skipped: result.skipped,
        errors: result.errors
      });
      try {
        const {
          resumeStaleStravaBackfills,
          resumeShallowStravaBackfills,
        } = require('../routes/integrationsRoutes');
        if (typeof resumeStaleStravaBackfills === 'function') {
          await resumeStaleStravaBackfills();
        }
        if (typeof resumeShallowStravaBackfills === 'function') {
          await resumeShallowStravaBackfills();
        }
      } catch (resumeErr) {
        console.warn('[StravaAutoSyncScheduler] stale backfill resume skipped:', resumeErr?.message);
      }
    } catch (error) {
      console.error('[StravaAutoSyncScheduler] Scheduled sync error:', error);
      recordStravaSyncLogSafe({
        source: 'scheduler',
        status: 'error',
        error: error?.message || String(error),
      });
    }
  };

  // Initial delayed tick + interval ticks
  setTimeout(
    () => tick().catch(e => console.error('[StravaAutoSyncScheduler] Initial tick error', e)),
    STRAVA_AUTO_SYNC_INITIAL_TICK_MS,
  );
  setInterval(() => tick().catch(e => console.error('[StravaAutoSyncScheduler] Interval tick error', e)), intervalMs);

  console.log('[StravaAutoSyncScheduler] Started.', {
    intervalMs,
    batchSize,
    delayBetweenUsers,
    intervalMinutes: Math.round(intervalMs / 60000)
  });
}

/**
 * Independent recovery loop for stalled/shallow Strava history backfills.
 * Runs regardless of STRAVA_DISABLE_POLL and the polling tick's budget gates,
 * so a user's historical import always finishes even if it was interrupted by
 * a server restart. The heavy lifting (startStravaHistoricalBackfill) enforces
 * its own concurrency cap and per-call budget checks.
 */
function startStravaBackfillResumeLoop() {
  const resumeIntervalMs = Number(process.env.STRAVA_BACKFILL_RESUME_INTERVAL_MS || 10 * 60 * 1000);
  const runResume = async () => {
    try {
      const {
        resumeStaleStravaBackfills,
        resumeShallowStravaBackfills,
      } = require('../routes/integrationsRoutes');
      if (typeof resumeStaleStravaBackfills === 'function') {
        await resumeStaleStravaBackfills();
      }
      if (typeof resumeShallowStravaBackfills === 'function') {
        await resumeShallowStravaBackfills();
      }
    } catch (e) {
      console.warn('[StravaBackfillResume] loop error:', e?.message || e);
    }
  };
  // First pass shortly after boot (after boot-time resume has run), then steady.
  setTimeout(() => runResume(), 90 * 1000);
  setInterval(() => runResume(), resumeIntervalMs);
  console.log(`[StravaBackfillResume] Independent resume loop started (every ${Math.round(resumeIntervalMs / 60000)}min).`);
}

module.exports = { startStravaAutoSyncScheduler };
