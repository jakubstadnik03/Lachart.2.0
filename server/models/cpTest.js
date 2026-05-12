const mongoose = require('mongoose');

/**
 * One effort in a Critical Power test. Each effort is a maximal sustained
 * power-or-pace bout of `duration` seconds. The classic protocol uses 3
 * efforts (e.g. 3 min, 7 min, 12 min) and fits the 2-parameter hyperbolic
 * model `P(t) = CP + W' / t` to derive Critical Power (CP) and W' (work
 * capacity above CP).
 */
const cpEffortSchema = new mongoose.Schema({
    // Time-trial / max-effort duration in seconds (e.g. 180 = 3 min).
    durationSec: { type: Number, required: true },
    // Average sustained value for that effort. Bike: watts. Run/swim: pace
    // in sec/km or sec/100m respectively. Match `sport` on the parent test.
    value: { type: Number, required: true },
    // Optional context — when this effort was performed, how it felt.
    date: { type: Date, default: null },
    notes: { type: String, default: '' },
}, { _id: false });

const cpTestSchema = new mongoose.Schema({
    athleteId: {
        type: String,
        required: true,
        index: true,
    },
    coachId: {
        type: String,
        default: null,
    },
    sport: {
        type: String,
        enum: ['run', 'bike', 'swim'],
        required: true,
    },
    title: {
        type: String,
        default: 'CP Test',
    },
    // Date of the test session (or the most recent effort in it).
    date: {
        type: Date,
        required: true,
    },
    description: { type: String, default: '' },
    notes: { type: String, default: '' },

    // Athlete metadata captured at test time (for trending and zone calc).
    weight: { type: Number, default: null },

    // Test efforts — minimum 2, typically 2-4. The fit is the
    // least-squares solution to the linearised hyperbolic model.
    efforts: { type: [cpEffortSchema], default: [] },

    // Calculated outputs (computed client-side, persisted so we don't
    // recompute on every read).
    cp: { type: Number, default: null },       // Critical Power: bike W, run/swim sec
    wPrime: { type: Number, default: null },   // W' (J for bike, sec*pace for pace)

    // Optional comparison link: when the trainer marked a specific lactate
    // test as the "canonical" LT2 to compare CP against.
    linkedLactateTestId: { type: String, default: null },
}, {
    timestamps: true,
});

module.exports = mongoose.model('CPTest', cpTestSchema);
