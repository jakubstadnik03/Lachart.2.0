const mongoose = require('mongoose');

/**
 * A race / goal event on an athlete's calendar (TrainingPeaks-style).
 * Drives the countdown ("X days until …"), target-fitness display and the
 * Upcoming Events list on the dashboard.
 */
const raceEventSchema = new mongoose.Schema({
  athleteId: { type: String, required: true, index: true },
  name:      { type: String, required: true, trim: true },
  date:      { type: Date,   required: true },
  sport:     { type: String, default: null },   // run | bike | swim | triathlon | hyrox | other
  priority:  { type: String, enum: ['A', 'B', 'C'], default: 'A' }, // A = goal race
  location:  { type: String, default: null },
  targetCTL: { type: Number, default: null },    // desired fitness (CTL) on race day
  notes:     { type: String, default: null },
  createdBy: { type: String, default: null },    // user id who created it (coach or athlete)
  /** Post-race debrief from athlete (RPE, feeling, notes). */
  postRaceFeedback: {
    rpe: { type: Number, default: null },
    feeling: { type: String, default: null },
    notes: { type: String, default: null },
    submittedAt: { type: Date, default: null },
  },
  /** Idempotent race reminder tracking (d14, d7, d3, d1, taper10, postRace, ctlGapN). */
  remindersSent: {
    type: mongoose.Schema.Types.Mixed,
    default: () => ({}),
  },
}, { timestamps: true });

raceEventSchema.index({ athleteId: 1, date: 1 });

module.exports = mongoose.models.RaceEvent || mongoose.model('RaceEvent', raceEventSchema);
