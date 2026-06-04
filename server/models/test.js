const mongoose = require('mongoose');

const testResultSchema = new mongoose.Schema({
    power: Number,
    // Running power in watts (e.g. Stryd). Optional second metric for run
    // tests, shown alongside pace. Null/absent for bike & swim.
    runPower: Number,
    heartRate: Number,
    lactate: Number,
    glucose: Number,
    vo2: Number,
    RPE: Number,
    // 'work' (default — counted in the curve) or 'recovery' (saved but
    // excluded from regression / LT1 / LT2). The UI lets users flip a row
    // to recovery for post-test/cool-down lactate samples.
    intervalType: {
        type: String,
        enum: ['work', 'recovery'],
        default: 'work',
    },
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
        // Running power in watts (e.g. Stryd). Optional second metric for run
        // tests, shown alongside pace. Null/absent for bike & swim.
        runPower: Number,
        heartRate: Number,
        lactate: Number,
        glucose: Number,
        vo2: Number,
        RPE: Number,
        // Per-row stage duration in seconds OR distance in meters. The form
        // lets the user toggle the "Dur"/"Dist" column header — distance is
        // common for swim and run interval tests (100/200/400 m). Either,
        // both, or neither may be set; the curve calculator falls back
        // gracefully when a field is missing.
        duration: { type: Number, default: null },
        distanceMeters: { type: Number, default: null },
        intervalType: {
            type: String,
            enum: ['work', 'recovery'],
            default: 'work',
        },
    }],
    // Whether the per-row "Dur" column captures duration (MM:SS) or distance
    // (meters). UI preference, persisted so the test reopens in the same mode.
    stageMeasureMode: {
        type: String,
        enum: ['duration', 'distance'],
        default: 'duration',
    },
    // Protocol metadata — pre/post values and stage configuration. Saved on
    // the test so future cross-test comparisons and improved LT analysis
    // (Modified Dmax / Individual Anaerobic Threshold) can use them.
    restingHR:           { type: Number, default: null },
    preLoadHR:           { type: Number, default: null },
    maxHR:               { type: Number, default: null },
    maxLactate:          { type: Number, default: null },
    recoveryHR3min:      { type: Number, default: null },
    recoveryLactate3min: { type: Number, default: null },
    stageDurationSec:    { type: Number, default: null },
    stageDistance:       { type: Number, default: null },
    restBetweenStagesSec:{ type: Number, default: null },
    // User-edited zone values linked to this specific test (Set Zones modal)
    zoneOverrides: {
      powerZones: mongoose.Schema.Types.Mixed,
      heartRateZones: mongoose.Schema.Types.Mixed,
      source: { type: String, default: 'set-zones' },
      updatedAt: { type: Date, default: null }
    },
    // Link to the raw LactateSession that generated this test (auto-saved from Lactate Testing page)
    lactateSessionId: { type: String, default: null },

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