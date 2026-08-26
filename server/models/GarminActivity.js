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
  // Plain string, deliberately. Categories are user-defined — CategoryContext
  // ships seven built-ins and addCategory() lets an athlete make their own — so
  // the vocabulary lives on the client and the database cannot enumerate it.
  //
  // This used to be an enum, and three models each carried a different one:
  // Strava listed lt1/lt2/zone2 while Garmin and FIT listed threshold/
  // anaerobic/recovery instead, so tagging a Garmin ride "LT2" was as fatal as
  // a custom category. Saving one threw ValidationError, which surfaced as a
  // 500 on the whole update and looked to the athlete like "power doesn't save".
  //
  // PlannedWorkout, AppleHealthActivity and DayPlan already stored it this way.
  category: { type: String, default: null },
  sport: String,
  startDate: Date,
  elapsedTime: Number, // seconds
  movingTime: Number, // seconds
  distance: Number, // meters
  averageSpeed: Number, // m/s
  averageHeartRate: Number,
  averagePower: Number,
  manualTss: Number,
  tssDisplayMode: { type: String, enum: ['manual', 'power', 'hr', null], default: null },
  laps: [garminLapSchema], // Store laps with lactate values
  raw: Object
}, { timestamps: true });

garminActivitySchema.index({ userId: 1, garminId: 1 }, { unique: true });
// Speeds up calendar queries (/api/integrations/activities) that sort by date
garminActivitySchema.index({ userId: 1, startDate: -1 });

module.exports = mongoose.model('GarminActivity', garminActivitySchema);
