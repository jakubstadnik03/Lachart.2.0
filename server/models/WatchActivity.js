const mongoose = require('mongoose');

const watchLapSchema = new mongoose.Schema({
  lapNumber: Number,
  elapsed_time: Number,
  moving_time: Number,
  distance: Number,
  average_speed: Number,
  average_heartrate: Number,
  average_watts: Number,
  lactate: { type: Number, default: null },
}, { _id: false });

/**
 * One imported workout from Polar Flow or COROS. Same summary fields as
 * GarminActivity so the calendar list, dedup and detail modal can treat it
 * as another external source.
 */
const watchActivitySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true, required: true },
  source: { type: String, enum: ['polar', 'coros'], required: true },
  watchId: { type: String, required: true },
  name: String,
  titleManual: { type: String, default: null },
  description: { type: String, default: null },
  category: { type: String, default: null },
  sport: String,
  startDate: Date,
  elapsedTime: Number,
  movingTime: Number,
  distance: Number,
  averageSpeed: Number,
  averageHeartRate: Number,
  averagePower: Number,
  calories: Number,
  rpe: Number,
  lactate: { type: Number, default: null },
  manualTss: Number,
  tssDisplayMode: { type: String, enum: ['manual', 'power', 'hr', null], default: null },
  metricsManualized: { type: Boolean, default: false },
  laps: [watchLapSchema],
}, { timestamps: true });

watchActivitySchema.index({ userId: 1, source: 1, watchId: 1 }, { unique: true });
watchActivitySchema.index({ userId: 1, startDate: -1 });

module.exports = mongoose.model('WatchActivity', watchActivitySchema);
