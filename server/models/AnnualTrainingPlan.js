/**
 * AnnualTrainingPlan (ATP) — the season laid out one week at a time.
 *
 * Where PlannedWorkout answers "what am I doing on Tuesday", the ATP answers
 * "how hard is week 12 supposed to be, and what does that make my fitness on
 * race day". It is a periodization document: each week gets a training period
 * (Base 2, Build 1, Peak …) and a weekly TSS target, and everything else —
 * projected CTL, TSB, ramp rate — is derived from those two numbers.
 *
 * ONE doc per season, holding all ~52 week rows. Weeks are stored as an array
 * rather than one doc per week because the whole season is always read and
 * written together (the projection is a chain — changing week 12's TSS moves
 * every fitness value after it).
 */

const mongoose = require('mongoose');

/** The nine TrainingPeaks-style periods, in the order a season runs through them. */
const PERIODS = [
  'Prepare',
  'Base 1', 'Base 2', 'Base 3',
  'Build 1', 'Build 2',
  'Peak',
  'Race',
  'Transition',
  'Rest',
];

const atpWeekSchema = new mongoose.Schema({
  /** Monday of the week, 'YYYY-MM-DD' (TZ-stable, same convention as CalendarPeriod). */
  weekStart: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  /** Training period this week belongs to. null = unassigned (blank row). */
  period: { type: String, enum: [...PERIODS, null], default: null },
  /** Nth week within the current period run — 1-based, used for the "Base 3 - Week 2" label. */
  periodWeek: { type: Number, default: null },
  /** Weekly TSS target. This is the input the whole projection hangs off. */
  targetTss: { type: Number, default: 0, min: 0 },
  /** Optional weekly volume target in hours, shown alongside TSS. */
  targetHours: { type: Number, default: null, min: 0 },
  /** Free-text focus for the week ("Big climbing block", "Openers Thu"). */
  notes: { type: String, default: '' },
  /**
   * Per-sport targets for the week, e.g. { bike: 8, run: 3, swim: 2 }.
   *
   * The TSS target says how hard the week is; these say what it is made of,
   * which is how a coach actually writes one — "eight on the bike, two runs".
   * Both units are kept because both get planned: a cyclist plans hours, a
   * runner plans kilometres, and a triathlete plans each sport in its own.
   */
  sportHours: { type: Map, of: Number, default: undefined },
  sportKm: { type: Map, of: Number, default: undefined },
}, { _id: false });

const annualTrainingPlanSchema = new mongoose.Schema({
  athleteId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  /** Who created it — a coach planning for an athlete, or the athlete themselves. */
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

  name: { type: String, required: true, trim: true, default: 'Annual Training Plan' },
  /** Season bounds — startDate is always snapped to a Monday when written. */
  startDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  endDate:   { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },

  /**
   * Peak weekly TSS the season builds toward. The auto-periodizer scales every
   * week's target off this (a Base 3 week 3 is 100% of it, a recovery week 59%),
   * which is what makes "make the whole season 10% easier" a one-field edit.
   */
  peakWeeklyTss: { type: Number, default: 700, min: 0 },
  /** Primary sport — drives which default period template the wizard uses. */
  sport: { type: String, default: 'bike' },

  /** The week rows. Kept sorted by weekStart. */
  weeks: { type: [atpWeekSchema], default: [] },

  /** Only one plan per athlete is shown by default; older seasons stay as history. */
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

// One athlete's plans, newest season first.
annualTrainingPlanSchema.index({ athleteId: 1, startDate: -1 });

module.exports = mongoose.models.AnnualTrainingPlan
  || mongoose.model('AnnualTrainingPlan', annualTrainingPlanSchema);

module.exports.PERIODS = PERIODS;
