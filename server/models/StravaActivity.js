const mongoose = require('mongoose');

const stravaActivitySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true, required: true },
  stravaId: { type: Number, index: true, required: true },
  name: String,
  sport: String,
  startDate: Date,
  elapsedTime: Number, // seconds
  movingTime: Number, // seconds
  distance: Number, // meters
  averageSpeed: Number, // m/s
  averageHeartRate: Number,
  averagePower: Number,
  raw: Object
}, { timestamps: true });

stravaActivitySchema.index({ userId: 1, stravaId: 1 }, { unique: true });

module.exports = mongoose.model('StravaActivity', stravaActivitySchema);
