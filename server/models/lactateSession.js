const mongoose = require('mongoose');

const measurementPointSchema = new mongoose.Schema({
  timestamp: {
    type: Date,
    required: true
  },
  power: Number, // watts or pace in seconds
  heartRate: Number,
  lactate: Number,
  glucose: Number,
  RPE: Number,
  interval: Number,
  // Additional realtime data
  speed: Number, // m/s
  cadence: Number, // rpm
  temperature: Number, // celsius
  altitude: Number, // meters
  position: {
    lat: Number,
    lng: Number
  }
});

const lactateSessionSchema = new mongoose.Schema({
  athleteId: {
    type: String,
    required: true
  },
  // Session metadata
  title: {
    type: String,
    required: true
  },
  description: String,
  sport: {
    type: String,
    enum: ['run', 'bike', 'swim'],
    required: true
  },
  date: {
    type: Date,
    required: true,
    default: Date.now
  },
  // Test configuration
  baseLactate: Number,
  weight: Number,
  specifics: {
    specific: String,
    weather: String
  },
  comments: String,
  unitSystem: {
    type: String,
    enum: ['metric', 'imperial'],
    default: 'metric'
  },
  inputMode: {
    type: String,
    enum: ['pace', 'speed'],
    default: 'pace'
  },
  // Realtime measurement data
  measurements: [measurementPointSchema],
  // FIT file data
  fitFile: {
    originalName: String,
    fileSize: Number,
    uploadDate: Date,
    fitData: {
      sport: String,
      totalElapsedTime: Number,
      totalDistance: Number,
      avgSpeed: Number,
      maxSpeed: Number,
      avgHeartRate: Number,
      maxHeartRate: Number,
      avgPower: Number,
      maxPower: Number,
      records: [{
        timestamp: Date,
        power: Number,
        heartRate: Number,
        speed: Number,
        cadence: Number,
        lactate: Number
      }],
      laps: [{
        lapNumber: Number,
        startTime: Date,
        totalElapsedTime: Number,
        totalDistance: Number,
        avgSpeed: Number,
        avgHeartRate: Number,
        avgPower: Number,
        lactate: Number
      }]
    }
  },
  // Analysis results
  analysisComplete: {
    type: Boolean,
    default: false
  },
  thresholds: {
    lt1: {
      power: Number,
      heartRate: Number,
      lactate: Number
    },
    lt2: {
      power: Number,
      heartRate: Number,
      lactate: Number
    },
    obla: {
      power: Number,
      heartRate: Number,
      lactate: Number
    }
  },
  trainingZones: [{
    zone: Number,
    powerMin: Number,
    powerMax: Number,
    heartRateMin: Number,
    heartRateMax: Number,
    description: String
  }],
  // Status tracking
  status: {
    type: String,
    enum: ['active', 'paused', 'completed', 'cancelled'],
    default: 'active'
  },
  startedAt: Date,
  completedAt: Date,
  duration: Number // total session duration in seconds
}, {
  timestamps: true
});

// Indexes for performance
lactateSessionSchema.index({ athleteId: 1, date: -1 });
lactateSessionSchema.index({ status: 1 });
lactateSessionSchema.index({ 'measurements.timestamp': 1 });

module.exports = mongoose.model('LactateSession', lactateSessionSchema);
