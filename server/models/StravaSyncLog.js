const mongoose = require('mongoose');

/**
 * How long a sync log is kept. These are operational telemetry for the admin
 * dashboard (routes/userListRoute.js) — it shows the 30 most recent runs and
 * counts the last 24 hours. Nothing reads an entry older than that, but the
 * collection was unbounded and had grown to ~244k documents at ~2,500 inserts
 * a day.
 */
const RETENTION_DAYS = Number(process.env.STRAVA_SYNC_LOG_RETENTION_DAYS || 30);

const stravaSyncLogSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  source: {
    type: String,
    enum: ['webhook', 'manual', 'auto-sync', 'scheduler', 'backfill', 'connect', 'unknown'],
    default: 'unknown',
  },
  status: {
    type: String,
    enum: ['success', 'partial', 'error', 'skipped', 'rate_limited'],
    default: 'success',
  },
  startedAt: { type: Date, default: Date.now },
  finishedAt: { type: Date, default: Date.now },
  durationMs: { type: Number, default: 0 },
  imported: { type: Number, default: 0 },
  updated: { type: Number, default: 0 },
  skipped: { type: Number, default: 0 },
  totalFetched: { type: Number, default: 0 },
  rateLimited: { type: Boolean, default: false },
  retryAfterSec: { type: Number, default: null },
  error: { type: String, default: null },
  message: { type: String, default: null },
  stravaActivityIds: [{ type: String }],
  budgetSnapshot: { type: Object, default: null },
  meta: { type: Object, default: null },
}, { timestamps: true });

// Two indexes, and both earn their keep on the admin dashboard: a createdAt
// walk serves the recent-first lists and the 24h counts (a single-field index
// reads in either direction, so the descending sorts still use it), and
// status+createdAt serves the failure lists.
//
// There were nine. The other seven — userId, userId+createdAt, source,
// startedAt, status, rateLimited, createdAt descending — were never queried:
// userId is only ever populate()d, which reads the users collection, and the
// rest have no callers at all. Every one of them was still paid for on each of
// ~2,500 daily inserts, replicated to both secondaries and captured by
// Continuous Cloud Backup.
stravaSyncLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: RETENTION_DAYS * 24 * 60 * 60 });
stravaSyncLogSchema.index({ status: 1, createdAt: -1 });

/**
 * Indexes mongoose no longer declares are not removed by syncIndexes on a
 * collection this model shares with a running deployment, so drop them
 * explicitly — once per process, and never fatally.
 */
const STALE_INDEXES = [
  'createdAt_-1',
  'userId_1',
  'userId_1_createdAt_-1',
  'source_1',
  'startedAt_1',
  'status_1',
  'rateLimited_1',
];

let staleIndexesChecked = false;
mongoose.connection.on('connected', async () => {
  if (staleIndexesChecked) return;
  staleIndexesChecked = true;
  try {
    const coll = mongoose.connection.db.collection('stravasynclogs');
    const present = await coll.indexes();
    for (const name of STALE_INDEXES) {
      if (!present.some((i) => i.name === name)) continue;
      try {
        await coll.dropIndex(name);
        console.log(`[StravaSyncLog] dropped unused index ${name}`);
      } catch (err) {
        console.warn(`[StravaSyncLog] could not drop ${name}:`, err.message);
      }
    }
  } catch (err) {
    console.warn('[StravaSyncLog] index cleanup skipped:', err.message);
  }
});

module.exports = mongoose.model('StravaSyncLog', stravaSyncLogSchema);
