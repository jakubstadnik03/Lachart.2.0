const mongoose = require('mongoose');

/** Same step schema as WorkoutTemplate (copy, not shared ref) */
const stepTargetSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['watts', 'percent_ftp', 'percent_lt1', 'percent_lt2',
           'zone', 'lt1', 'lt2', 'open'],
    default: 'open',
  },
  value:    Number,
  useRange: { type: Boolean, default: false },
  rangeMin: Number,
  rangeMax: Number,

  // The exact watts an athlete pinned on a calculated target (a zone, LT1/LT2,
  // a percentage). Without it here Mongoose dropped the field on save: the
  // builder kept showing the number because the client resolver honours it, so
  // the save looked green and the value was gone on the next load.
  override: Number,
}, { _id: false });

const workoutStepSchema = new mongoose.Schema({
  clientId:        String,
  stepType: {
    type: String,
    enum: ['warmup', 'work', 'recovery', 'cooldown', 'rest'],
    default: 'work',
  },
  label:           String,
  durationSeconds: { type: Number, required: true, min: 1 },
  powerTarget:     stepTargetSchema,
  hrTarget:        stepTargetSchema,
  cadenceMin:      Number,
  cadenceMax:      Number,
  notes:           String,
  groupId:         String,
  isGroupHeader:   { type: Boolean, default: false },
  groupRepeat:     { type: Number, default: 1 },
  // Which palette block a step came from. Purely descriptive — the exporters
  // and the execution page ignore it — but it is what lets the chart say
  // "Ramp up in 4 steps" and list them, instead of showing four unrelated
  // bars. Mongoose strips fields it does not know, so a block that lived only
  // in the client would look right until the first save and then come back
  // as loose steps.
  blockId:         String,
  blockKind:       String,

}, { _id: false });

const plannedWorkoutSchema = new mongoose.Schema({
  athleteId:  { type: String, required: true, index: true },
  createdBy:  { type: String, required: true },   // coach or self
  date: {
    type: Date,
    required: true,
    index: true,
  },
  /** Manual stack order within a calendar day (0 = top). */
  dayOrder: { type: Number, default: 0 },
  sport: {
    type: String,
    enum: ['run', 'bike', 'swim', 'strength', 'gym', 'walk', 'brick', 'crosstrain', 'mtbike', 'rowing', 'lactate', 'other'],
    required: true,
  },
  title:       { type: String, required: true, trim: true },
  description: String,
  templateId:  String,   // WorkoutTemplate _id if created from library
  steps:       [workoutStepSchema],

  // ── Status ────────────────────────────────────────────────────
  status: {
    type: String,
    enum: ['planned', 'completed', 'skipped'],
    default: 'planned',
    index: true,
  },
  completedTrainingId: String,   // Training._id when marked complete
  coachNotes:  String,
  comment:     String,
  targetTss:   Number,
  plannedDuration: Number,       // seconds — used when no structured steps
  plannedDistance: Number,       // metres — used when no structured steps
  isLactateTest:   Boolean,
  category:        String,       // category id from CategoryContext
  // Completed workout payload from live execution (time series, per-step averages).
  executionData:   { type: mongoose.Schema.Types.Mixed, default: null },
  fitTrainingId:   String,
  stravaActivityId: String,
}, { timestamps: true });

plannedWorkoutSchema.index({ athleteId: 1, date: -1 });
plannedWorkoutSchema.index({ athleteId: 1, status: 1, date: -1 });

module.exports = mongoose.model('PlannedWorkout', plannedWorkoutSchema);
