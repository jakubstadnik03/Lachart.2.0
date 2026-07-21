const mongoose = require('mongoose');

/**
 * Daily wellness snapshot from Apple Health (resting HR, sleep, HRV).
 * One document per user per calendar day (YYYY-MM-DD, athlete local date).
 */
const appleHealthWellnessSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    date: { type: String, required: true }, // YYYY-MM-DD
    restingHeartRate: { type: Number, default: null },
    /** Daily heart-rate minimum (overnight low, Apple Vitals' sleeping HR). */
    sleepingHeartRate: { type: Number, default: null },
    sleepMinutes: { type: Number, default: null },
    /** Per-stage minutes (Apple sleep stages), e.g. { coreMin, deepMin, remMin, awakeMin, unspecifiedMin }. */
    sleepStages: { type: mongoose.Schema.Types.Mixed, default: null },
    hrvMs: { type: Number, default: null },
    respiratoryRate: { type: Number, default: null },
    source: { type: String, default: 'apple_health' },
  },
  { timestamps: true }
);

appleHealthWellnessSchema.index({ userId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('AppleHealthWellness', appleHealthWellnessSchema);
