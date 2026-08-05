const jwt = require('jsonwebtoken');
const { isTokenBlacklisted } = require('./authManager');
const { JWT_SECRET } = require('../config/jwt.config');

/**
 * Truthful activity signal.
 *
 * `lastLogin` only moves when someone types a password, so it badly understates
 * real usage: measured 2026-08-05, 437 users had run a lactate test while only
 * 369 had any lastLogin at all, and long-lived sessions never refresh it. Any
 * retention number built on it is wrong.
 *
 * Stamp lastSeenAt on authenticated traffic instead. Throttled in memory so a
 * busy client costs one write per hour, not one per request, and fired without
 * await so it can never slow down or fail a request.
 */
const SEEN_THROTTLE_MS = Number(process.env.LAST_SEEN_THROTTLE_MS || 60 * 60 * 1000);
const lastSeenTouchedAt = new Map();

function touchLastSeen(userId) {
    if (!userId) return;
    const key = String(userId);
    const now = Date.now();
    const prev = lastSeenTouchedAt.get(key);
    if (prev && now - prev < SEEN_THROTTLE_MS) return;
    lastSeenTouchedAt.set(key, now);

    // Keep the throttle map from growing without bound on a long-lived process.
    if (lastSeenTouchedAt.size > 5000) {
        for (const [k, t] of lastSeenTouchedAt) {
            if (now - t > SEEN_THROTTLE_MS) lastSeenTouchedAt.delete(k);
        }
    }

    try {
        const User = require('../models/UserModel');
        User.updateOne({ _id: key }, { $set: { lastSeenAt: new Date(now) } })
            .catch(() => { /* activity tracking must never break a request */ });
    } catch { /* model unavailable — ignore */ }
}

// Must be async — isTokenBlacklisted now queries MongoDB
const verifyToken = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader) {
            return res.status(401).json({ error: 'Chybí autorizační token' });
        }

        const token = authHeader.replace('Bearer ', '').trim();

        if (!token) {
            return res.status(401).json({ error: 'Neplatný formát tokenu' });
        }

        // Check persistent MongoDB blacklist (survives restarts, works across multiple nodes)
        if (await isTokenBlacklisted(token)) {
            return res.status(401).json({ error: 'Token byl odhlášen' });
        }

        // Enforce HS256 algorithm to prevent algorithm-confusion attacks (CVE-2022-23541)
        const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });

        req.user = decoded;
        touchLastSeen(decoded?.userId);
        next();

    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Token vypršel' });
        }
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({ error: 'Neplatný token' });
        }
        return res.status(401).json({ error: 'Chyba při ověření tokenu' });
    }
};

module.exports = verifyToken;
