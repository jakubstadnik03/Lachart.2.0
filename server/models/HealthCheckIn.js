const mongoose = require('mongoose');

/**
 * HealthCheckIn - one symptom report against an episode.
 *
 * Designed to be answerable in about ten seconds, because a check-in nobody
 * fills in is worse than none at all: the gate then reasons from stale data.
 * The client asks the ONE question that matters for the tissue in question
 * (`hallmarkValue`, keyed by `hallmarkKey` from the catalogue) and treats
 * everything else as optional.
 *
 * The three pain fields are deliberately separate because they answer different
 * questions:
 *   painNow             - how it is right this moment
 *   painDuringSession   - how it behaved under load
 *   painNextMorning     - the 24 h response, which is what actually decides
 *                         whether a tendon tolerated yesterday's dose
 *
 * One check-in per (athlete, episode, date, trigger): the morning report and the
 * post-session report on the same day are different observations, not a conflict.
 */

/** A field test result, used as a stage gate. Reps/cm on both sides -> LSI. */
const functionalTestResultSchema = new mongoose.Schema({
  test: { type: String, required: true },       // key in FUNCTIONAL_TESTS
  left: { type: Number, default: null },
  right: { type: Number, default: null },
  /**
   * The single number for a test that has no left/right to compare: minutes of
   * pain-free walking, or reps done on the affected side only. left/right exist
   * for symmetry, which needs both limbs; `value` exists because a one-sided
   * measurement has nowhere else to live, and without it a minValue gate on such
   * a test could never be satisfied.
   */
  value: { type: Number, default: null },
  /** Single-sided tests (hop pain, decline squat) report pain instead. */
  painDuring: { type: Number, min: 0, max: 10, default: null },
  /** Injured-vs-healthy ratio, computed on save when both sides are present. */
  symmetryPct: { type: Number, default: null },
}, { _id: false });

const healthCheckInSchema = new mongoose.Schema({
  athleteId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  episodeId: { type: mongoose.Schema.Types.ObjectId, ref: 'HealthEpisode', required: true, index: true },
  date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/, index: true },

  trigger: {
    type: String,
    enum: ['daily', 'post_session', 'next_morning', 'weekly', 'manual'],
    default: 'manual',
  },

  /** The catalogue's hallmark question for this injury - e.g.
      morningStiffnessMinutes, timeToPainMinutes, painScore, symptomSeverity. */
  hallmarkKey: { type: String, default: null },
  hallmarkValue: { type: Number, default: null },

  painNow: { type: Number, min: 0, max: 10, default: null },
  painDuringSession: { type: Number, min: 0, max: 10, default: null },
  painNextMorning: { type: Number, min: 0, max: 10, default: null },

  /** Minutes of stiffness on waking - the headline metric for tendons. */
  stiffnessMinutes: { type: Number, default: null },

  // Red flags. `limping` is under-reported as pain but predicts trouble better.
  limping: { type: Boolean, default: false },
  swelling: { type: Boolean, default: false },
  nightPain: { type: Boolean, default: false },
  painAtRest: { type: Boolean, default: false },
  /** Any catalogue redFlag ids the athlete ticked - each one shows a "see a
      clinician" screen rather than a training suggestion. */
  redFlagsReported: { type: [String], default: [] },

  functionalTests: { type: [functionalTestResultSchema], default: [] },

  /** 1-5 self-rated confidence in the injured part. Low confidence predicts
      re-injury independently of pain, especially for hamstrings. */
  confidence: { type: Number, min: 1, max: 5, default: null },

  // ── Illness fields ────────────────────────────────────────────────────────
  symptoms: {
    type: [String],
    default: [],
    // sore_throat, runny_nose, cough, chest, fever, body_aches, gi, fatigue
  },
  temperatureC: { type: Number, default: null },
  /** Neck check: true when everything is above the neck and there is no fever. */
  aboveNeckOnly: { type: Boolean, default: null },

  /** Training the athlete did on this date, if any - links the symptom report to
      the dose that produced it. */
  trainingId: { type: String, default: null },
  note: { type: String, default: '' },
}, { timestamps: true });

// A morning check-in and a post-session check-in on the same day coexist.
healthCheckInSchema.index({ athleteId: 1, episodeId: 1, date: 1, trigger: 1 }, { unique: true });
// The gate reads the most recent N for an episode.
healthCheckInSchema.index({ episodeId: 1, date: -1 });

/**
 * Fill in symmetry so the gate never has to know which side is injured - it
 * just reads symmetryPct. Injured side is passed by the route as `injuredSide`
 * on the doc; when it is unknown we take the weaker side as injured, which is
 * the safe assumption.
 */
healthCheckInSchema.pre('save', function computeSymmetry(next) {
  (this.functionalTests || []).forEach((t) => {
    const l = Number(t.left);
    const r = Number(t.right);
    if (!(l > 0) || !(r > 0)) {
      t.symmetryPct = null;
      return;
    }
    t.symmetryPct = Math.round((Math.min(l, r) / Math.max(l, r)) * 100);
  });
  next();
});

module.exports = mongoose.model('HealthCheckIn', healthCheckInSchema);
