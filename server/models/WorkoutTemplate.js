const mongoose = require('mongoose');

/**
 * Power / HR target for a single workout step.
 * type:
 *   'watts'        – absolute watts
 *   'percent_ftp'  – % of athlete's FTP
 *   'percent_lt1'  – % of LT1 power
 *   'percent_lt2'  – % of LT2 (threshold) power
 *   'zone'         – zone number 1-5 (derived from LT1/LT2)
 *   'lt1'          – exactly at LT1 power
 *   'lt2'          – exactly at LT2 power
 *   'open'         – no specific target (easy / recovery)
 */
const stepTargetSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['watts', 'percent_ftp', 'percent_lt1', 'percent_lt2',
           'zone', 'lt1', 'lt2', 'open'],
    default: 'open',
  },
  value:    Number,   // watts, %, or zone number 1-5
  useRange: { type: Boolean, default: false },
  rangeMin: Number,   // lower bound when useRange=true
  rangeMax: Number,   // upper bound when useRange=true
}, { _id: false });

/**
 * A single workout step (interval).
 * Steps may belong to a repeat group via groupId.
 */
const workoutStepSchema = new mongoose.Schema({
  clientId:     String,   // UUID for React key stability (set by client)
  stepType: {
    type: String,
    enum: ['warmup', 'work', 'recovery', 'cooldown', 'rest'],
    default: 'work',
  },
  label:            String,   // optional custom label
  durationSeconds:  { type: Number, required: true, min: 1 },
  powerTarget:      stepTargetSchema,
  hrTarget:         stepTargetSchema,
  cadenceMin:       Number,
  cadenceMax:       Number,
  notes:            String,
  // ── Repeat group ──────────────────────────────────────────────
  // Steps sharing the same groupId form a "repeat block".
  // The FIRST step in the group (isGroupHeader: true) stores repeatCount.
  groupId:       String,
  isGroupHeader: { type: Boolean, default: false },
  groupRepeat:   { type: Number, default: 1 },   // repeats (header only)
}, { _id: false });

const workoutTemplateSchema = new mongoose.Schema({
  createdBy: { type: String, required: true, index: true },   // userId
  sport: {
    type: String,
    enum: ['run', 'bike', 'swim'],
    required: true,
  },
  name:        { type: String, required: true, trim: true },
  description: String,
  tags:        [String],
  steps:       [workoutStepSchema],
  isPublic:    { type: Boolean, default: false },
}, { timestamps: true });

workoutTemplateSchema.index({ createdBy: 1, sport: 1 });
workoutTemplateSchema.index({ isPublic: 1 });

module.exports = mongoose.model('WorkoutTemplate', workoutTemplateSchema);
