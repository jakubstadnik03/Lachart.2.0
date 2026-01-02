const mongoose = require('mongoose');

const fitLapSchema = new mongoose.Schema({
  lapNumber: Number,
  startTime: Date,
  totalElapsedTime: Number, // seconds
  totalTimerTime: Number, // seconds
  totalDistance: Number, // meters
  totalCycles: Number, // cycles (for swimming)
  avgSpeed: Number, // m/s
  maxSpeed: Number, // m/s
  avgHeartRate: Number,
  maxHeartRate: Number,
  avgPower: Number, // watts
  maxPower: Number, // watts
  avgCadence: Number, // rpm
  maxCadence: Number, // rpm
  lactate: Number, // manually added lactate value
  normalizedPower: Number, // watts
  intensityFactor: Number,
  trainingStressScore: Number,
  startPositionLat: Number,
  startPositionLong: Number,
  endPositionLat: Number,
  endPositionLong: Number,
});

const fitRecordSchema = new mongoose.Schema({
  timestamp: Date,
  positionLat: Number,
  positionLong: Number,
  distance: Number, // meters
  altitude: Number, // meters
  speed: Number, // m/s
  power: Number, // watts
  heartRate: Number,
  cadence: Number, // rpm
  temperature: Number, // celsius
  lactate: Number, // manually added lactate value
  grade: Number, // percentage
  resistance: Number,
});

const fitTrainingSchema = new mongoose.Schema({
  athleteId: {
    type: String,
    required: true
  },
  originalFileName: String,
  fileSize: Number,
  uploadDate: {
    type: Date,
    default: Date.now
  },
  // Activity info
  sport: {
    type: String,
    enum: ['running', 'cycling', 'swimming', 'generic'],
    default: 'generic'
  },
  subSport: String,
  timestamp: Date,
  totalElapsedTime: Number, // seconds
  totalTimerTime: Number, // seconds
  totalDistance: Number, // meters
  totalAscent: Number, // meters
  totalDescent: Number, // meters
  totalCalories: Number,
  avgSpeed: Number, // m/s
  maxSpeed: Number, // m/s
  avgHeartRate: Number,
  maxHeartRate: Number,
  avgPower: Number, // watts
  maxPower: Number, // watts
  normalizedPower: Number, // watts
  avgCadence: Number, // rpm
  maxCadence: Number, // rpm
  // Training zones
  timeInZone: [{
    zone: Number,
    time: Number // seconds
  }],
  // Records (data points)
  records: [fitRecordSchema],
  // Laps
  laps: [fitLapSchema],
  // Metadata
  manufacturer: String,
  product: String,
  serialNumber: Number,
  softwareVersion: String,
  // Analysis
  analysisComplete: {
    type: Boolean,
    default: false
  },
  lactatePredictions: [{
    intervalIndex: Number,
    predictedLactate: Number,
    confidence: Number
  }],
  // Workout Clustering
  clusterId: {
    type: String,
    default: null,
    index: true
  },
  titleAuto: {
    type: String,
    default: null
  },
  titleManual: {
    type: String,
    default: null
  },
  description: {
    type: String,
    default: null
  },
  category: {
    type: String,
    enum: ['endurance', 'tempo', 'threshold', 'vo2max', 'anaerobic', 'recovery', null],
    default: null
  },
  trainingRouteId: {
    type: String,
    default: null
  },
  workoutPattern: {
    intervalCount: Number,
    intervalDurations: [Number],
    intervalPowers: [Number],
    restDurations: [Number],
    normalizedDurations: [Number],
    normalizedPowers: [Number],
    workRestRatio: Number,
    intensityZone: String,
    shapeVector: [Number],
    meanDuration: Number,
    stdDuration: Number,
    meanPowerNorm: Number
  },
  patternExtracted: {
    type: Boolean,
    default: false
  },
}, {
  timestamps: true
});

// Speeds up calendar queries that filter by athlete and time range
fitTrainingSchema.index({ athleteId: 1, timestamp: -1 });

module.exports = mongoose.model('FitTraining', fitTrainingSchema);


