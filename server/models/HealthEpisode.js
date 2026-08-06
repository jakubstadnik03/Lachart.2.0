const mongoose = require('mongoose');

/**
 * HealthEpisode - one injury or illness, from onset to a settled return.
 *
 * Distinct from CalendarPeriod('Illness'), which is just a coloured band on the
 * calendar with no behaviour. An episode carries the return protocol, the frozen
 * pre-injury baseline, and the state the daily gate reasons about. A period is
 * still created alongside it so the calendar keeps working unchanged.
 *
 * `catalogId` points at an entry in data/injuryCatalog.js, which supplies the
 * tissue-specific rules (pain thresholds, stages, gates). The episode stores
 * only what is specific to this athlete and this occurrence.
 *
 * An episode does NOT end at the first pain-free run: re-injury risk peaks in
 * the first weeks back, so the last stage runs on for `resolveAfterDays` before
 * status flips to 'resolved'.
 */

/** Pre-injury reference, captured once at creation and never recalculated. */
const baselineSchema = new mongoose.Schema({
  /** CTL / ATL / TSB on the day the episode opened. */
  ctl: { type: Number, default: null },
  atl: { type: Number, default: null },
  form: { type: Number, default: null },
  /** Mean weekly TSS over the 8 weeks before onset, per sport: { run: 210, bike: 340 }. */
  weeklyTssBySport: { type: mongoose.Schema.Types.Mixed, default: null },
  /** Mean weekly distance in metres over the same window, per sport. */
  weeklyDistanceBySport: { type: mongoose.Schema.Types.Mixed, default: null },
  /** Mean weekly moving time in seconds, per sport. */
  weeklyDurationBySport: { type: mongoose.Schema.Types.Mixed, default: null },
  /** Fastest sustained speed (m/s) seen in the 8 weeks before onset, per sport.
      Muscle-strain protocols cap return speed as a % of this. */
  peakSpeedBySport: { type: mongoose.Schema.Types.Mixed, default: null },
  /** Thresholds at onset. After a long layoff these are stale - the app says so
      and prompts a retest rather than silently training to old zones. */
  lt1: { type: Number, default: null },
  lt2: { type: Number, default: null },
  ftp: { type: Number, default: null },
  capturedAt: { type: Date, default: null },
}, { _id: false });

/** Sport the athlete may still do, and how much. Derived from the catalogue at
    creation, then editable - a physio may allow or forbid something specific. */
const restrictionSchema = new mongoose.Schema({
  sport: { type: String, required: true },
  allowed: { type: Boolean, default: true },
  maxMinutes: { type: Number, default: null },
  maxZone: { type: Number, default: null },
  note: { type: String, default: '' },
}, { _id: false });

/**
 * One completed or ongoing spell in a protocol stage.
 *
 * The episode already knows which stage it is in *today*, but a progress chart
 * has to answer "was I over the ceiling that week?" for weeks that are already
 * in the past, and the ceiling is a percentage of baseline that changes with
 * every stage. Without a log of when each stage started and ended, a week from
 * six weeks ago would be judged against today's cap, which is both wrong and
 * flattering. So each transition is recorded here instead of being overwritten.
 *
 * The range is half-open: the stage was in force from `from` up to but not
 * including `to`, and the currently open entry has `to: null`. Episodes created
 * before this field existed have an empty array; readers fall back to
 * attributing the whole episode to its current stage.
 */
const stageHistorySchema = new mongoose.Schema({
  stageId: { type: String, default: null },
  stageIndex: { type: Number, default: 0 },
  from: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  to: { type: String, default: null },
}, { _id: false });

const healthEpisodeSchema = new mongoose.Schema({
  athleteId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  /** Entry in data/injuryCatalog.js - supplies tissue rules and stages. */
  catalogId: { type: String, required: true },
  kind: { type: String, enum: ['injury', 'illness', 'other'], required: true },

  /**
   * Copied from the catalogue at creation so the episode keeps behaving the
   * same way if the catalogue entry is later revised, and so queries can filter
   * on tissue without a join.
   */
  tissue: {
    type: String,
    enum: ['bone', 'tendon', 'muscle', 'fascia', 'ligament', 'joint', 'nerve', null],
    default: null,
  },
  /** Mid-portion and insertional Achilles have opposite contraindications. */
  tendonSubtype: { type: String, enum: ['midportion', 'insertional', null], default: null },
  loadResponse: {
    type: String,
    enum: ['rest', 'modified_load', 'progressive_load'],
    required: true,
  },

  bodySite: { type: String, default: null },
  side: { type: String, enum: ['L', 'R', 'bilateral', 'n/a'], default: 'n/a' },

  /** Free text as given by the athlete or their clinician. */
  diagnosis: { type: String, default: '' },
  diagnosedBy: {
    type: String,
    enum: ['self', 'physio', 'doctor', 'imaging'],
    default: 'self',
  },
  /** 1 = niggle, 2 = affects training, 3 = stops training, 4 = affects daily life. */
  severity: { type: Number, min: 1, max: 4, default: 2 },

  /**
   * Muscle injuries: grade and site. Central (intramuscular) tendon involvement
   * roughly triples the timeline, so it is worth capturing when imaging showed it.
   */
  muscleGrade: {
    grade: { type: Number, min: 0, max: 4, default: null },
    site: {
      type: String,
      enum: ['myofascial', 'musculotendinous', 'intramuscular_tendon', null],
      default: null,
    },
  },

  // Inclusive local-date range, 'YYYY-MM-DD' - same convention as CalendarPeriod.
  startDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/, index: true },
  expectedReturnDate: { type: String, default: null },
  endDate: { type: String, default: null },

  status: {
    type: String,
    enum: ['active', 'returning', 'resolved', 'recurred'],
    default: 'active',
    index: true,
  },

  /** Current stage in the catalogue protocol. */
  currentStageId: { type: String, default: null },
  currentStageIndex: { type: Number, default: 0 },
  stageStartedAt: { type: String, default: null }, // 'YYYY-MM-DD'
  /** Every stage this episode has passed through. See stageHistorySchema. */
  stageHistory: { type: [stageHistorySchema], default: [] },
  /** How many times the gate pulled the athlete back a stage. High = too eager. */
  stepBackCount: { type: Number, default: 0 },
  /** Muscle protocols only: highest % of pre-injury peak speed cleared so far. */
  speedPctReached: { type: Number, default: null },

  restrictions: { type: [restrictionSchema], default: [] },
  baseline: { type: baselineSchema, default: () => ({}) },

  /** Previous episode at the same site - recurrence is the strongest predictor
      of the next one, so the gate applies tighter caps when this is set. */
  previousEpisodeId: { type: mongoose.Schema.Types.ObjectId, ref: 'HealthEpisode', default: null },
  isRecurrence: { type: Boolean, default: false },

  /** High-risk bone sites must not be self-managed; the gate refuses to advance
      stages until a human ticks this. */
  requiresMedicalClearance: { type: Boolean, default: false },
  medicalClearanceAt: { type: Date, default: null },

  /** Athlete's own notes. Never returned to a coach, whatever isVisibleToCoach says. */
  notesPrivate: { type: String, default: '' },
  /** Notes the athlete is happy for a coach to read. */
  notes: { type: String, default: '' },
  /** Health data is sensitive - coaches see nothing unless the athlete opts in. */
  isVisibleToCoach: { type: Boolean, default: false },

  /** Calendar band created alongside, so deleting the episode can clean it up. */
  calendarPeriodId: { type: mongoose.Schema.Types.ObjectId, ref: 'CalendarPeriod', default: null },

  /** Days in the final stage before status flips to 'resolved'. */
  resolveAfterDays: { type: Number, default: 28 },

  /** Last gate verdict, cached so the dashboard does not recompute on every render. */
  lastGate: {
    light: { type: String, enum: ['green', 'amber', 'red', null], default: null },
    evaluatedAt: { type: Date, default: null },
    reasons: { type: [mongoose.Schema.Types.Mixed], default: [] },
  },
}, { timestamps: true });

// The common query: "what is this athlete currently dealing with?"
healthEpisodeSchema.index({ athleteId: 1, status: 1, startDate: -1 });
// Recurrence lookup at creation time.
healthEpisodeSchema.index({ athleteId: 1, bodySite: 1, side: 1, startDate: -1 });

module.exports = mongoose.model('HealthEpisode', healthEpisodeSchema);
