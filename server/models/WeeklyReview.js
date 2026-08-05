const mongoose = require('mongoose');

/**
 * An athlete's own write-up of a training week, shown as a note on that week's
 * Sunday in the calendar.
 *
 * The Friday review request notification used to be a dead end — it told the
 * athlete their coach was waiting for their week, then dropped them on the
 * dashboard with nowhere to write it. This is where that note lives.
 *
 * Keyed by weekStart (the Monday, as YYYY-MM-DD in the athlete's local week)
 * so a week has exactly one review and the notification can deep-link straight
 * to it.
 */
const WeeklyReviewSchema = new mongoose.Schema({
  athleteId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  /** Monday of the reviewed week, 'YYYY-MM-DD'. */
  weekStart: { type: String, required: true },
  text: { type: String, default: '' },
  /** Optional 1–5 self-rating of how the week went. */
  rating: { type: Number, min: 1, max: 5, default: null },
  /** Who wrote it — an athlete reviews their own week, a coach may add notes. */
  authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  authorRole: { type: String, enum: ['athlete', 'coach'], default: 'athlete' },
}, { timestamps: true });

// One review per athlete per week — upserts rely on this.
WeeklyReviewSchema.index({ athleteId: 1, weekStart: 1 }, { unique: true });

module.exports = mongoose.model('WeeklyReview', WeeklyReviewSchema);
