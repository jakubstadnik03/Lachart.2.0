/**
 * Token blacklist backed by MongoDB.
 * Persists across server restarts and works in multi-process deploys.
 * Documents are auto-deleted by a TTL index once the token expires.
 */
const BlacklistedToken = require('../models/BlacklistedToken');
const jwt = require('jsonwebtoken');

/**
 * Add a token to the persistent blacklist.
 * @param {string} token - Raw JWT string
 */
async function blacklistToken(token) {
    try {
        const decoded = jwt.decode(token);
        const expiresAt = decoded?.exp
            ? new Date(decoded.exp * 1000)
            : new Date(Date.now() + 24 * 60 * 60 * 1000);
        await BlacklistedToken.create({ token, expiresAt });
    } catch (e) {
        if (e.code === 11000) return; // already blacklisted
        console.error('Error blacklisting token:', e.message);
    }
}

/**
 * Check whether a token has been blacklisted.
 * @param {string} token - Raw JWT string
 * @returns {Promise<boolean>}
 */
async function isTokenBlacklisted(token) {
    try {
        const entry = await BlacklistedToken.findOne({ token }).lean();
        return !!entry;
    } catch (e) {
        console.error('Error checking token blacklist:', e.message);
        return false; // fail-open so a DB hiccup doesn't lock everyone out
    }
}

module.exports = { blacklistToken, isTokenBlacklisted };
