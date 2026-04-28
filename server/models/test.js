const mongoose = require('mongoose');

const testResultSchema = new mongoose.Schema({
    power: Number,
    heartRate: Number,
    lactate: Number,
    glucose: Number,
    vo2: Number,
    RPE: Number
});

const testSchema = new mongoose.Schema({
    athleteId: {
        type: String,
        required: true
    },
    sport: {
        type: String,
        enum: ['run', 'bike', 'swim'],
        required: true
    },
    title: {
        type: String,
        required: true
    },
    date: {
        type: Date,
        required: true
    },
    description: String,
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
      default: 'metric',
    },
    inputMode: {
      type: String,
      enum: ['pace', 'speed'],
      default: 'pace',
    },
    results: [{
        interval: Number,
        power: Number,
        heartRate: Number,
        lactate: Number,
        glucose: Number,
        vo2: Number,
        RPE: Number
    }],
    // User-edited zone values linked to this specific test (Set Zones modal)
    zoneOverrides: {
      powerZones: mongoose.Schema.Types.Mixed,
      heartRateZones: mongoose.Schema.Types.Mixed,
      source: { type: String, default: 'set-zones' },
      updatedAt: { type: Date, default: null }
    },
    // Manual LT1/LT2 override — set by coach/athlete to pin thresholds (overrides auto-calculation)
    thresholdOverrides: {
      LTP1:         { type: Number, default: null },
      LTP2:         { type: Number, default: null },
      LTP1_lactate: { type: Number, default: null },
      LTP2_lactate: { type: Number, default: null },
      LTP1_hr:      { type: Number, default: null },
      LTP2_hr:      { type: Number, default: null },
    },
}, {
    timestamps: true,
});

module.exports = mongoose.model('Test', testSchema);