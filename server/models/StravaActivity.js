const mongoose = require('mongoose');

const stravaLapSchema = new mongoose.Schema({
  lapNumber: Number,
  startTime: Date,
  elapsed_time: Number,
  moving_time: Number,
  distance: Number,
  average_speed: Number,
  max_speed: Number,
  average_heartrate: Number,
  max_heartrate: Number,
  average_watts: Number,
  max_watts: Number,
  average_cadence: Number,
  max_cadence: Number,
  /** Strava lap API: metres gained this lap (persisted for training / elevation field). */
  total_elevation_gain: Number,
  elevation_gain: Number,
  lactate: { type: Number, default: null } // manually added lactate value
}, { _id: false });

const stravaActivitySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true, required: true },
  stravaId: { type: Number, index: true, required: true },
  name: String,
  titleManual: { type: String, default: null },
  description: { type: String, default: null },
  category: {
    type: String,
    enum: ['endurance', 'lt1', 'tempo', 'lt2', 'zone2', 'vo2max', 'hills', null],
    default: null
  },
  sport: String,
  startDate: Date,
  elapsedTime: Number, // seconds
  movingTime: Number, // seconds
  distance: Number, // meters
  averageSpeed: Number, // m/s
  averageHeartRate: Number,
  averagePower: Number,
  /** Strava weighted average watts (better for variable rides than average_watts). */
  weightedAveragePower: Number,
  /** Strava activity total elevation gain (m), when synced from API */
  total_elevation_gain: Number,
  /** User-edited TSS override (Completed editor). */
  manualTss: Number,
  /** Per-workout TSS source: manual | power | hr */
  tssDisplayMode: { type: String, enum: ['manual', 'power', 'hr', null], default: null },
  calories: Number,
  rpe: Number,
  lactate: Number,
  /** When true, Strava sync must not overwrite movingTime/distance/elapsedTime. */
  metricsManualized: { type: Boolean, default: false },
  laps: [stravaLapSchema], // Store laps with lactate values
  raw: Object
}, { timestamps: true });

stravaActivitySchema.index({ userId: 1, stravaId: 1 }, { unique: true });
// Speeds up calendar queries (/api/integrations/activities) that sort by date
stravaActivitySchema.index({ userId: 1, startDate: -1 });

module.exports = mongoose.model('StravaActivity', stravaActivitySchema);
