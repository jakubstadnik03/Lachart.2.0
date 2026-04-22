const jwt = require('jsonwebtoken');
const { isTokenBlacklisted } = require('./authManager');
const { JWT_SECRET } = require('../config/jwt.config');

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
