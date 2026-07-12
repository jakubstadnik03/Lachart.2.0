const mongoose = require('mongoose');

/**
 * Stored Garmin activity streams (time / hr / power / cadence / speed /
 * altitude / distance / latlng), parsed from Garmin's Activity Details
 * webhook `samples` array.
 *
 * Mirrors StravaStream: streams are cached in MongoDB in the same
 * `{ key: { data: [...] } }` shape the frontend already reads for Strava,
 * so the training-detail chart renders Garmin activities with zero
 * frontend changes.
 */
const garminStreamSchema = new mongoose.Schema({
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  garminId:  { type: String, required: true, index: true },
  // Streams object — keys: time, velocity_smooth, heartrate, watts, altitude, latlng, distance, cadence
  streams:   { type: mongoose.Schema.Types.Mixed, default: {} },
  fetchedAt: { type: Date, default: Date.now },
}, { timestamps: true });

garminStreamSchema.index({ userId: 1, garminId: 1 }, { unique: true });

module.exports = mongoose.model('GarminStream', garminStreamSchema);
