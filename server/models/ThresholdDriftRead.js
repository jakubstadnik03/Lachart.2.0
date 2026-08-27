/**
 * One session's HR–demand read, cached.
 *
 * Reading a session costs a stream fetch and a fit; a drift history is sixty of
 * them, and an athlete opening the chart twice should not pay twice. Activities
 * are immutable once recorded, so a read never goes stale on its own — the two
 * things that CAN invalidate it are a change to the engine and a change to the
 * test it was measured against, and both are stamped here so a stale row is
 * recomputed rather than served.
 *
 * Deliberately small: only the numbers the history chart plots are kept, not
 * the steady segments behind them. Those are cheap to recompute for the one
 * session an athlete actually opens, and storing sixty of them per athlete
 * would be most of a stream cache for a chart that never draws them.
 */

const mongoose = require('mongoose');

const thresholdDriftReadSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  /** Prefixed activity id: strava-<id> / garmin-<id> / fit-<id> */
  activityKey: { type: String, required: true },
  activityDate: { type: Date, required: true, index: true },
  sport: String,
  title: String,

  /** Bumped whenever the engine's numbers could move. */
  engineVersion: { type: Number, required: true },
  /** The test this was read against; a new test re-anchors every session after it. */
  testId: { type: String, default: null },
  testUpdatedAt: { type: Date, default: null },

  ok: { type: Boolean, default: false },
  /** Why nothing could be read — kept so the walker does not retry a hopeless session. */
  reason: { type: String, default: null },

  deltaDemand: Number,
  deltaPct: Number,
  deltaHr: Number,
  hrAtLt2: Number,
  thresholdAtLt2Hr: Number,
  lt2Demand: Number,
  driftBpmPerHour: Number,
  decoupling: Number,
  confidence: String,
  tempC: Number,
  tempAdjustBpm: Number,
  pointCount: Number,
}, { timestamps: true });

thresholdDriftReadSchema.index({ userId: 1, activityKey: 1 }, { unique: true });
thresholdDriftReadSchema.index({ userId: 1, sport: 1, activityDate: -1 });

module.exports = mongoose.model('ThresholdDriftRead', thresholdDriftReadSchema);
