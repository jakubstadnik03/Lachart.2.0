const mongoose = require('mongoose');

const resultSchema = new mongoose.Schema({
    interval: Number,
    duration: Number, // Duration in seconds (primary field)
    durationSeconds: Number, // Duration in seconds (for clarity, same as duration)
    durationType: {
        type: String,
        enum: ['time', 'distance'],
        default: 'time'
    },
    rest: Number, // Rest time in seconds (primary field)
    restSeconds: Number, // Rest time in seconds (for clarity, same as rest)
    intensity: String,
    power: Number,
    heartRate: Number,
    lactate: Number,
    RPE: Number,
    elevation: Number,
    distanceMeters: Number,
    sourceLapIndex: Number,
    /** UI / export: recovery lap (e.g. Strava field-lactate sync); unchecked in TrainingForm */
    isRecovery: { type: Boolean, default: false },
    /** Include in export / lactate entry focus; false = recovery lap deselected */
    isSelected: { type: Boolean, default: true },
    /** User-classified interval purpose. 'work' counts toward averages /
        comparisons; warmup, recovery, cooldown are excluded. Persisted from
        TrainingForm where the user can override the auto-detect choice. */
    intervalType: {
        type: String,
        enum: ['warmup', 'work', 'recovery', 'cooldown'],
        default: undefined,
    }
});

const specificsSchema = new mongoose.Schema({
    specific: String,
    weather: String
});

const trainingSchema = new mongoose.Schema({
    athleteId: {
        type: String,
        required: true
    },
    sport: {
        type: String,
        // Widened from run|bike|swim to accommodate the Apple Watch
        // workout types — without this Mongoose rejects "walk", "strength",
        // etc. that the Watch sends, dropping otherwise valid sessions.
        enum: ['run', 'bike', 'swim', 'walk', 'strength', 'mtb', 'other'],
        required: true
    },
    type: String,
    title: {
        type: String,
        required: true
    },
    description: String,
    date: {
        type: Date,
        required: true
    },
    duration: String,
    intensity: String,
    results: [resultSchema],
    specifics: specificsSchema,
    comments: String,
    unitSystem: {
        type: String,
        enum: ['metric', 'imperial'],
        default: 'metric',
        required: false
    },
    inputMode: {
        type: String,
        enum: ['pace', 'speed'],
        default: 'pace',
        required: false
    },
    // References to source training data
    sourceFitTrainingId: {
        type: String,
        default: null
    },
    sourceStravaActivityId: {
        type: String,
        default: null
    },

    // ── Apple Watch sync ──────────────────────────────────────────────
    // Idempotency key for /training/from-watch. Re-receiving the same
    // WCSession transfer (rare but happens when iPhone wakes from sleep
    // mid-transfer) updates instead of duplicating.
    sourceWatchActivityId: {
        type: String,
        default: null,
        index: true,
    },

    // Watch-side rollups so the training list / dashboard can show the
    // same numbers without recomputing from `results`. All optional.
    avgHR:     { type: Number, default: 0 },
    maxHR:     { type: Number, default: 0 },
    avgPower:  { type: Number, default: 0 },
    avgPace:   { type: Number, default: 0 },   // seconds per km
    calories:  { type: Number, default: 0 },
    elevation: { type: Number, default: 0 },   // metres climbed
    distance:  { type: Number, default: 0 },   // metres

    // Apple Watch zone time-share (Z1..Z5, fractions 0..1)
    zoneDistribution: {
        type: Map,
        of: Number,
        default: undefined,
    },

    // Per-lap summary captured by the watch — kept separate from
    // `results` (which is the rich interval data with W/HR/lactate).
    // The watch fills in sensor averages when the matching BLE pod was
    // paired at the time of the lap; otherwise these fields stay 0.
    laps: [{
        number:      Number,
        pace:        Number,   // seconds per km
        time:        Number,   // seconds (this lap)
        zoneId:      Number,
        avgHR:       Number,   // bpm averaged over lap
        avgPower:    Number,   // W — Stryd
        avgCadence:  Number,   // spm — Stryd
        avgCoreTemp: Number,   // °C — CORE pod
        peakHSI:     Number,   // 0..10
        distance:    Number,   // metres covered in this lap
    }],

    // User-saved "Smart detect" laps (client-computed interval split), kept
    // separate from `laps` so the original stays intact. When present, the
    // activity detail view opens showing these instead of the device laps.
    savedAutoLaps: {
        type: [{
            lapNumber:          Number,
            elapsed_time:       Number,
            moving_time:        Number,
            distance:           Number,
            average_watts:      Number,
            average_heartrate:  Number,
            average_speed:      Number,
        }],
        default: undefined,
    },

    // ── Advanced sensor time-series (Apple Watch BLE: CORE + Stryd) ───
    // Sampled ~every 5 s during the run. Each point is `t` seconds since
    // workout start. Empty array when the matching sensor isn't paired.
    coreTempSeries: [{
        t:    Number,
        core: Number,   // °C
        skin: Number,   // °C
        hsi:  Number,   // Heat Strain Index 0..10
    }],
    strydSeries: [{
        t:       Number,
        power:   Number,   // W
        cadence: Number,   // spm
        gct:     Number,   // ground contact (ms)
        vosc:    Number,   // vertical oscillation (cm)
        lss:     Number,   // leg spring stiffness (kN/m)
    }],
    hsiPeak: { type: Number, default: 0 },

    // Optional AI-generated insight text — kept so the watch's natural
    // language summary survives the round-trip and renders on the detail
    // page even if the user never opens it on the watch.
    aiInsight: { type: String, default: null },
}, {
    timestamps: true,
});

// Speeds up athlete calendar/training list queries (filter by athlete + date)
trainingSchema.index({ athleteId: 1, date: -1 });

module.exports = mongoose.model('Training', trainingSchema); 