const mongoose = require('mongoose');

/**
 * Stored Strava activity streams (time / hr / power / speed / altitude / latlng).
 * Strava activities are immutable once recorded, so we cache the streams
 * indefinitely after first fetch and serve subsequent reads from MongoDB
 * instead of hitting Strava's 100-req/15-min rate-limited bucket.
 */
const stravaStreamSchema = new mongoose.Schema({
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  stravaId:  { type: Number, required: true, index: true },
  // Streams object — keys: time, velocity_smooth, heartrate, watts, altitude, latlng, distance, cadence
  streams:   { type: mongoose.Schema.Types.Mixed, default: {} },
  fetchedAt: { type: Date, default: Date.now },
}, { timestamps: true });

stravaStreamSchema.index({ userId: 1, stravaId: 1 }, { unique: true });

module.exports = mongoose.model('StravaStream', stravaStreamSchema);
