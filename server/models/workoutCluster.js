const mongoose = require('mongoose');

const workoutClusterSchema = new mongoose.Schema({
  clusterId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  canonicalTitle: {
    type: String,
    default: ''
  },
  titleManual: {
    type: String,
    default: null
  },
  trainingRouteId: {
    type: String,
    default: null
  },
  pattern: {
    intervalCount: Number,
    meanDuration: Number,
    stdDuration: Number,
    meanPowerNorm: Number,
    workRestRatio: Number,
    intensityZone: String,
    shapeVector: [Number]
  },
  workoutIds: [{
    type: String,
    ref: 'FitTraining'
  }],
  exampleWorkouts: [{
    workoutId: String,
    title: String,
    timestamp: Date
  }],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Index for faster lookups
workoutClusterSchema.index({ clusterId: 1 });
workoutClusterSchema.index({ trainingRouteId: 1 });

module.exports = mongoose.model('WorkoutCluster', workoutClusterSchema);

