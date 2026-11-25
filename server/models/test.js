const mongoose = require('mongoose');
const { speedLoadsAsPaceSeconds } = require('../utils/lactateTestInputMode');

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

    /**
     * The retest the athlete scheduled off the back of this test.
     *
     * Repeat testing is the strongest predictor of paying in the data
     * (2 tests → 15.7 % ever paid, 3+ → 37.3 %, against 9.0 % for one), and
     * the rarest behaviour in the product: 301 accounts hold exactly one test
     * and 240 are more than six weeks past it. See utils/retestPlan.js for the
     * rules and for why this is deliberately not another campaign email.
     *
     * `dueAt` is only ever set because the athlete asked for it — an unset
     * dueAt means no reminder, ever. Every key is declared because this
     * subdocument is strict: an undeclared path is dropped from writes as
     * silently as from queries, so the scheduler would mark nobody and nudge
     * the same people on every tick (the same trap that cost
     * retentionEmails.premiumPitch a release).
     */
    retest: {
      dueAt:         { type: Date,   default: null },
      intervalDays:  { type: Number, default: null },
      /** When the athlete set it, for telling an old plan from a fresh one. */
      scheduledAt:   { type: Date,   default: null },
      /** Last nudge, and how many have gone out (cap lives in retestPlan). */
      remindedAt:    { type: Date,   default: null },
      reminderCount: { type: Number, default: 0 },
      /** "Not now" — final, and never re-asked. */
      dismissedAt:   { type: Date,   default: null },
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

// Every reader expects run and swim loads in pace seconds. A few saved tests
// hold km/h instead, from when the public calculator's signup save stored them
// as typed, so they are corrected on the way out, for lean queries too. The
// database only changes if something later saves one of these documents, and
// then it gets the corrected values.
function readLoadsAsPaceSeconds(test) {
  const seconds = test?.results ? speedLoadsAsPaceSeconds(test) : null;
  if (!seconds) return;
  test.results.forEach((row, i) => {
    if (row) row.power = seconds[i];
  });
  test.inputMode = 'speed';
}
testSchema.post('find', (tests) => tests.forEach(readLoadsAsPaceSeconds));
testSchema.post(['findOne', 'findOneAndUpdate'], (test) => readLoadsAsPaceSeconds(test));

module.exports = mongoose.model('Test', testSchema);