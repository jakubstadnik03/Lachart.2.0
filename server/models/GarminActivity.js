const mongoose = require('mongoose');

const garminLapSchema = new mongoose.Schema({
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

const garminActivitySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true, required: true },
  garminId: { type: String, index: true, required: true },
  name: String,
  titleManual: { type: String, default: null },
  description: { type: String, default: null },
  category: {
    type: String,
    enum: ['endurance', 'tempo', 'threshold', 'vo2max', 'anaerobic', 'recovery', null],
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
  laps: [garminLapSchema], // Store laps with lactate values
  raw: Object
}, { timestamps: true });

garminActivitySchema.index({ userId: 1, garminId: 1 }, { unique: true });
// Speeds up calendar queries (/api/integrations/activities) that sort by date
garminActivitySchema.index({ userId: 1, startDate: -1 });

module.exports = mongoose.model('GarminActivity', garminActivitySchema);
