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
  lactate: { type: Number, default: null } // manually added lactate value
}, { _id: false });

const stravaActivitySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true, required: true },
  stravaId: { type: Number, index: true, required: true },
  name: String,
  titleManual: { type: String, default: null },
  description: { type: String, default: null },
  sport: String,
  startDate: Date,
  elapsedTime: Number, // seconds
  movingTime: Number, // seconds
  distance: Number, // meters
  averageSpeed: Number, // m/s
  averageHeartRate: Number,
  averagePower: Number,
  laps: [stravaLapSchema], // Store laps with lactate values
  raw: Object
}, { timestamps: true });

stravaActivitySchema.index({ userId: 1, stravaId: 1 }, { unique: true });

module.exports = mongoose.model('StravaActivity', stravaActivitySchema);
