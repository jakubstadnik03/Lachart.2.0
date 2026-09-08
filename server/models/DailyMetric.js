const mongoose = require('mongoose');

/**
 * DailyMetric — the numbers an athlete reports about themselves.
 *
 * Separate from AppleHealthWellness and GarminWellness on purpose: those are
 * what a device measured and a sync wrote, and are overwritten by the next
 * sync. This is what a person typed. When both exist for a day they are
 * different observations of the same morning — a scale reading the athlete
 * trusts against whatever the watch inferred — and the one that was typed
 * should not be silently replaced by the one that was guessed.
 *
 * Everything is optional. A day where only the weight was written is a
 * perfectly good day; demanding a full form is how a log stops being kept.
 */
const dailyMetricSchema = new mongoose.Schema({
  athleteId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  /** Local calendar day, YYYY-MM-DD. Local, because "this morning" is local. */
  date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },

  weightKg: { type: Number, default: null },
  /** Resting pulse taken on waking, before getting up. */
  morningPulse: { type: Number, default: null },
  sleepMinutes: { type: Number, default: null },
  /** Hours at work or study — the load that does not show up in training. */
  workMinutes: { type: Number, default: null },
  steps: { type: Number, default: null },

  /** How the day felt, on the scale the calendar already uses elsewhere. */
  feeling: {
    type: String,
    enum: ['great', 'good', 'ok', 'tired', 'bad', null],
    default: null,
  },

  systolic: { type: Number, default: null },
  diastolic: { type: Number, default: null },

  /** Where a menstrual cycle is, for athletes who track it. Day 1 = first day. */
  cycleDay: { type: Number, default: null },

  notes: { type: String, default: '', maxlength: 2000 },

  /** Who typed it — a coach may fill a day in on an athlete's behalf. */
  enteredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

// One record per athlete per day: a second entry for the same morning is an
// edit, not another observation.
dailyMetricSchema.index({ athleteId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('DailyMetric', dailyMetricSchema);
