/**
 * DayPlan — coach- (or self-) assigned "theme" for a single calendar day.
 *
 * Distinct from PlannedWorkout: a DayPlan is the high-level intent for the
 * day ("Threshold day", "Recovery", "Long ride") regardless of whether any
 * specific workout is yet scheduled. The user (or coach) sets it ahead of
 * time as a weekly outline, then fills concrete planned workouts in later.
 *
 * One DayPlan per (athleteId, date). Sparse — most days have none.
 */

const mongoose = require('mongoose');

const dayPlanSchema = new mongoose.Schema({
  // Whom the plan is for (the athlete being trained, not the coach).
  athleteId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  // Who created it (athlete themselves or their coach). Useful for audits
  // and for letting an athlete tell coach-assigned plans apart from their
  // own scribbles in a future UI tweak.
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  // Local calendar date, stored as 'YYYY-MM-DD' string so a Mon-1-June day
  // stays Mon-1-June regardless of which timezone the client renders in.
  date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/, index: true },
  // Optional human label e.g. "Threshold", "Easy spin", "Long run".
  title: { type: String, default: '' },
  // Category id from the shared category vocabulary (endurance, threshold,
  // tempo, recovery, vo2max, …). Drives the colour-coded dot in the mini
  // grid and the badge in the day-list header.
  category: { type: String, default: null },
  // Free-form notes — e.g. coach instructions ("focus on cadence", "ride
  // by feel"). Rendered below the title in the day list when present.
  notes: { type: String, default: '' },
}, {
  timestamps: true,
});

// One plan per (athlete, date). Updates upsert into the same doc.
dayPlanSchema.index({ athleteId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('DayPlan', dayPlanSchema);
