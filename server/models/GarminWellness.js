const mongoose = require('mongoose');

/**
 * Daily wellness snapshot from Garmin (resting HR, sleep, HRV) — the Garmin
 * mirror of AppleHealthWellness. Populated from the Garmin Health API
 * (dailies / sleeps / hrv summaries) once the app has HEALTH_EXPORT
 * permission. Same field shape so the client can merge both sources through
 * the shared fetchWellness() path.
 *
 * One document per user per calendar day (YYYY-MM-DD, athlete local date).
 */
const garminWellnessSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    date: { type: String, required: true }, // YYYY-MM-DD
    restingHeartRate: { type: Number, default: null },
    /** Daily heart-rate minimum (overnight low). */
    sleepingHeartRate: { type: Number, default: null },
    sleepMinutes: { type: Number, default: null },
    /** Per-stage minutes, e.g. { coreMin, deepMin, remMin, awakeMin, unspecifiedMin }. */
    sleepStages: { type: mongoose.Schema.Types.Mixed, default: null },
    /** Time-ordered hypnogram: [{ stage, start, end }] with epoch-ms boundaries. */
    sleepSegments: { type: [mongoose.Schema.Types.Mixed], default: null },
    hrvMs: { type: Number, default: null },
    respiratoryRate: { type: Number, default: null },
    source: { type: String, default: 'garmin' },
  },
  { timestamps: true }
);

garminWellnessSchema.index({ userId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('GarminWellness', garminWellnessSchema);
