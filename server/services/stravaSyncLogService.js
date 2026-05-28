const StravaSyncLog = require('../models/StravaSyncLog');
const stravaBudget = require('../utils/stravaBudget');

function normalizeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

async function recordStravaSyncLog(input = {}) {
  const startedAt = input.startedAt ? new Date(input.startedAt) : new Date();
  const finishedAt = input.finishedAt ? new Date(input.finishedAt) : new Date();
  const durationMs = Math.max(0, finishedAt.getTime() - startedAt.getTime());

  const doc = {
    userId: input.userId || null,
    source: input.source || 'unknown',
    status: input.status || (input.error ? 'error' : 'success'),
    startedAt,
    finishedAt,
    durationMs,
    imported: normalizeNumber(input.imported),
    updated: normalizeNumber(input.updated),
    skipped: normalizeNumber(input.skipped),
    totalFetched: normalizeNumber(input.totalFetched),
    rateLimited: Boolean(input.rateLimited),
    retryAfterSec: input.retryAfterSec != null ? normalizeNumber(input.retryAfterSec) : null,
    error: input.error ? String(input.error).slice(0, 2000) : null,
    message: input.message ? String(input.message).slice(0, 1000) : null,
    stravaActivityIds: Array.isArray(input.stravaActivityIds)
      ? input.stravaActivityIds.map((id) => String(id)).slice(0, 50)
      : [],
    budgetSnapshot: input.budgetSnapshot || stravaBudget.snapshot(),
    meta: input.meta || null,
  };

  return StravaSyncLog.create(doc);
}

function recordStravaSyncLogSafe(input = {}) {
  return recordStravaSyncLog(input).catch((error) => {
    console.warn('[StravaSyncLog] failed to record sync log:', error?.message || error);
    return null;
  });
}

module.exports = {
  recordStravaSyncLog,
  recordStravaSyncLogSafe,
};
