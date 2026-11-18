const mongoose = require('mongoose');
const { computeScore } = require('../utils/wellnessScore');

/**
 * WellnessCheckIn - the athlete's short daily "how are you today?" report.
 *
 * Kept apart from HealthCheckIn on purpose. A HealthCheckIn belongs to an open
 * injury or illness episode (episodeId is required) and the return-to-training
 * gate reads "the latest N check-ins for an episode"; a wellness report exists
 * on a perfectly healthy day and must never leak into that gate's streaks. The
 * audience differs too: episodes reach the coach only when the athlete opts
 * in, whereas this report is written for the coach and the form says so.
 *
 * Pain and illness are asked as yes/no only. A "yes" sends the athlete on to
 * the existing episode flow rather than repeating its questions here;
 * `linkedEpisodeId` records which episode that turned out to be.
 *
 * One report per athlete per day. Answering again the same day replaces it.
 */
const scale = { type: Number, min: 1, max: 5, required: true };

const wellnessCheckInSchema = new mongoose.Schema({
  athleteId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },

  wellbeing: scale,
  sleep: scale,
  energy: scale,
  stress: scale,
  sorenessUpper: scale,
  sorenessLower: scale,

  /** Flagged beside the score, never folded into it. */
  pain: { type: Boolean, default: false },
  illness: { type: Boolean, default: false },
  linkedEpisodeId: { type: mongoose.Schema.Types.ObjectId, ref: 'HealthEpisode', default: null },

  note: { type: String, default: '', maxlength: 500 },

  /** 0-100, derived from the six answers. Stored so lists need no recompute. */
  score: { type: Number, min: 0, max: 100, default: null },
}, { timestamps: true });

wellnessCheckInSchema.index({ athleteId: 1, date: -1 }, { unique: true });

wellnessCheckInSchema.pre('validate', function fillScore(next) {
  this.score = computeScore(this);
  next();
});

module.exports = mongoose.model('WellnessCheckIn', wellnessCheckInSchema);
