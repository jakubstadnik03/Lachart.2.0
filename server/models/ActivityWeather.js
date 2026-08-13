/**
 * Weather frozen onto one activity.
 *
 * A separate collection rather than a field on StravaActivity / fitTraining,
 * because activities arrive from three sources and the weather lookup is the
 * same for all of them. Keyed by the prefixed activity id the client already
 * uses for routing ("strava-123", "fit-abc").
 *
 * Frozen on purpose: the point is what the conditions *were* when the athlete
 * trained. Re-fetching later would quietly rewrite history, and a session that
 * felt brutal in 31°C should still say 31°C next winter.
 */
const mongoose = require('mongoose');

const activityWeatherSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  /** Prefixed id: strava-<id> / fit-<id> / regular-<id> */
  activityKey: { type: String, required: true },

  lat: Number,
  lng: Number,
  /** Reverse-geocoded, e.g. "Brno". Null when the lookup failed — never guessed. */
  place: { type: String, default: null },

  tempC: Number,
  apparentC: Number,
  humidityPct: Number,
  windKph: Number,
  windDirDeg: Number,
  precipitationMm: Number,
  /** WMO weather code. */
  code: Number,
  description: String,

  /** When the reading was taken — the activity's own start time. */
  observedAt: Date,
  fetchedAt: { type: Date, default: Date.now },
  /** True when the provider had no data for that place and time. */
  unavailable: { type: Boolean, default: false },
}, { timestamps: true });

activityWeatherSchema.index({ userId: 1, activityKey: 1 }, { unique: true });

module.exports = mongoose.model('ActivityWeather', activityWeatherSchema);
