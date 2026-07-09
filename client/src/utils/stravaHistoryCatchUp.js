import { continueStravaHistoryImport, fetchStravaStatus } from '../services/api';

const sessionProgressKey = (userId) => `strava_backfill_progress_${userId}`;

/**
 * Nudge the server to continue Strava history import (2-year backfill).
 * Safe to call on every dashboard / app load — server rate-limits to ~90s.
 */
export async function nudgeStravaHistoryImport() {
  try {
    await continueStravaHistoryImport();
  } catch (e) {
    console.log('[Strava history] continue nudge failed:', e?.message || e);
  }
}

/**
 * While backfill is running, poll occasionally and call `onBatchImported`
 * when the server cursor moves so the UI can refresh calendar data.
 */
export function startStravaHistoryCatchUpPoll(userId, { onBatchImported, intervalMs = 45000 } = {}) {
  if (!userId || typeof onBatchImported !== 'function') {
    return () => {};
  }

  let cancelled = false;
  let lastKey = null;
  let intervalId = null;

  const tick = async () => {
    if (cancelled) return;
    await nudgeStravaHistoryImport();
    const status = await fetchStravaStatus();
    if (!status?.connected || cancelled) return;

    const state = status.backfillState || null;
    if (state === 'running') {
      const progressKey = `${status.backfillLastProgressAt || ''}|${status.backfillCursorBefore || ''}`;
      if (lastKey && progressKey !== lastKey) {
        onBatchImported(status);
      }
      lastKey = progressKey;
      try {
        sessionStorage.setItem(sessionProgressKey(userId), progressKey);
      } catch { /* ignore */ }
      return;
    }

    if (state === 'done' && lastKey !== 'done') {
      onBatchImported(status);
      lastKey = 'done';
      if (intervalId) clearInterval(intervalId);
    }
  };

  const boot = setTimeout(() => {
    tick();
    intervalId = setInterval(tick, intervalMs);
  }, 2500);

  return () => {
    cancelled = true;
    clearTimeout(boot);
    if (intervalId) clearInterval(intervalId);
  };
}
