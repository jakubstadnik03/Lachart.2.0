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
    }
}, {
    timestamps: true,
});

module.exports = mongoose.model('Test', testSchema);