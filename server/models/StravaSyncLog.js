const mongoose = require('mongoose');

const stravaSyncLogSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true, default: null },
  source: {
    type: String,
    enum: ['webhook', 'manual', 'auto-sync', 'scheduler', 'backfill', 'unknown'],
    default: 'unknown',
    index: true,
  },
  status: {
    type: String,
    enum: ['success', 'partial', 'error', 'skipped', 'rate_limited'],
    default: 'success',
    index: true,
  },
  startedAt: { type: Date, default: Date.now, index: true },
  finishedAt: { type: Date, default: Date.now },
  durationMs: { type: Number, default: 0 },
  imported: { type: Number, default: 0 },
  updated: { type: Number, default: 0 },
  skipped: { type: Number, default: 0 },
  totalFetched: { type: Number, default: 0 },
  rateLimited: { type: Boolean, default: false, index: true },
  retryAfterSec: { type: Number, default: null },
  error: { type: String, default: null },
  message: { type: String, default: null },
  stravaActivityIds: [{ type: String }],
  budgetSnapshot: { type: Object, default: null },
  meta: { type: Object, default: null },
}, { timestamps: true });

stravaSyncLogSchema.index({ createdAt: -1 });
stravaSyncLogSchema.index({ userId: 1, createdAt: -1 });
stravaSyncLogSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('StravaSyncLog', stravaSyncLogSchema);
