const mongoose = require('mongoose');

/**
 * Maximal Lactate Production Rate (VLamax) test.
 *
 * Protocol: a single all-out sprint (typically 15 s on the bike, 100–150 m
 * running, 25 m swimming) preceded by a baseline lactate sample and
 * followed by repeated post-sprint samples until lactate peaks (usually 3–7
 * min after the effort).
 *
 * Formula:
 *   VLamax = (peakLactate − preLactate) / (sprintDurationSec − alacticOffsetSec)
 *
 *   where `alacticOffsetSec` (~3.0 s) is the duration the alactic
 *   phosphagen system fuels the effort before lactate accumulation begins.
 *
 * Output:
 *   - sprinters: 0.70–1.10+ mmol·L⁻¹·s⁻¹
 *   - all-round: 0.45–0.65
 *   - endurance: 0.25–0.40
 *   - extreme endurance / ultra: 0.15–0.25
 */
const vlamaxSampleSchema = new mongoose.Schema({
    tMin: { type: Number, required: true },     // minutes after sprint end (0 = pre-sprint)
    lactate: { type: Number, required: true },  // mmol/L
}, { _id: false });

const vlamaxTestSchema = new mongoose.Schema({
    athleteId: {
        type: String,
        required: true,
        index: true,
    },
    coachId: { type: String, default: null },
    sport: {
        type: String,
        enum: ['run', 'bike', 'swim'],
        required: true,
    },
    title: { type: String, default: 'VLamax Sprint Test' },
    date: { type: Date, required: true },
    notes: { type: String, default: '' },

    // Sprint parameters
    sprintDurationSec: { type: Number, required: true, default: 15 },
    alacticOffsetSec: { type: Number, default: 3.0 },
    sprintAvgPower: { type: Number, default: null },   // bike only — optional
    sprintAvgPace: { type: Number, default: null },    // run/swim — sec/km or sec/100m
    sprintDistanceM: { type: Number, default: null },

    // Lactate measurements: pre + N post-sprint samples. We compute VLamax
    // from preLactate → peak (max value across samples). Keeping the full
    // time series so trend graphs / re-analysis is possible.
    preLactate: { type: Number, required: true },
    samples: { type: [vlamaxSampleSchema], default: [] },

    weight: { type: Number, default: null },

    // Computed outputs — derived client-side and persisted.
    peakLactate: { type: Number, default: null },     // max of samples
    peakAtMin:   { type: Number, default: null },     // when peak occurred
    vlamax:      { type: Number, default: null },     // mmol·L⁻¹·s⁻¹
}, { timestamps: true });

module.exports = mongoose.model('VLamaxTest', vlamaxTestSchema);
