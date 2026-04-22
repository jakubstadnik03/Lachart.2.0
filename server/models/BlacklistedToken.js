const mongoose = require('mongoose');

/**
 * Persists invalidated JWTs so logout survives server restarts and multi-process deploys.
 * The TTL index auto-deletes documents once the token has expired — no manual cleanup needed.
 */
const blacklistedTokenSchema = new mongoose.Schema({
  token:     { type: String, required: true, unique: true, index: true },
  expiresAt: { type: Date,   required: true },
}, { timestamps: false });

// MongoDB automatically removes documents when expiresAt is in the past
blacklistedTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('BlacklistedToken', blacklistedTokenSchema);
