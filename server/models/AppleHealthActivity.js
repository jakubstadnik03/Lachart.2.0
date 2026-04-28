const mongoose = require('mongoose');

const appleHealthActivitySchema = new mongoose.Schema({
  userId:          { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  /** Unique ID from HealthKit (UUID) — prevents duplicate imports */
  healthKitId:     { type: String, required: true },
  name:            String,
  type:            String,   // 'Running', 'Cycling', 'Swimming', ...
  sport:           String,   // normalized: 'running', 'cycling', 'swimming', 'other'
  startDate:       { type: Date, index: true },
  endDate:         Date,
  durationSeconds: Number,
  distanceMeters:  Number,
  calories:        Number,
  avgHeartRate:    Number,
  sourceName:      String,   // 'Apple Watch', 'iPhone', ...
  category:        { type: String, default: null },
  titleManual:     { type: String, default: null },
}, { timestamps: true });

appleHealthActivitySchema.index({ userId: 1, healthKitId: 1 }, { unique: true });

module.exports = mongoose.model('AppleHealthActivity', appleHealthActivitySchema);
