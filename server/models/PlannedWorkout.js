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
}, { _id: false });

const plannedWorkoutSchema = new mongoose.Schema({
  athleteId:  { type: String, required: true, index: true },
  createdBy:  { type: String, required: true },   // coach or self
  date: {
    type: Date,
    required: true,
    index: true,
  },
  sport: {
    type: String,
    enum: ['run', 'bike', 'swim', 'strength', 'walk', 'brick', 'crosstrain', 'mtbike', 'rowing', 'lactate', 'other'],
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
}, { timestamps: true });

plannedWorkoutSchema.index({ athleteId: 1, date: -1 });
plannedWorkoutSchema.index({ athleteId: 1, status: 1, date: -1 });

module.exports = mongoose.model('PlannedWorkout', plannedWorkoutSchema);
