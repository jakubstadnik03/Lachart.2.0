const jwt = require('jsonwebtoken');
const { isTokenBlacklisted } = require('./authManager');
const { JWT_SECRET } = require('../config/jwt.config');

const verifyToken = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        console.log("Auth header:", authHeader);

        if (!authHeader) {
            console.log("No auth header");
            return res.status(401).json({ error: 'Chybí autorizační token' });
        }

        // Získání tokenu z hlavičky "Bearer <token>"
        const token = authHeader.replace('Bearer ', '').trim();
        console.log("Token:", token.substring(0, 20) + "...");  // Logujeme jen část tokenu pro bezpečnost

        if (!token) {
            console.log("No token after Bearer");
            return res.status(401).json({ error: 'Neplatný formát tokenu' });
        }

        // Kontrola, zda token není na blacklistu
        if (isTokenBlacklisted(token)) {
            console.log("Token is blacklisted");
            return res.status(401).json({ error: 'Token byl odhlášen' });
        }

        // Ověření tokenu
        console.log("Verifying token with secret:", JWT_SECRET.substring(0, 5) + "...");
        const decoded = jwt.verify(token, JWT_SECRET);
        console.log("Token decoded successfully for user:", decoded.userId);

        // Přidání dat uživatele do requestu
        req.user = decoded;
        next();

    } catch (error) {
        console.error("Token verification error:", error.message);
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Token vypršel' });
        }
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({ 
                error: 'Neplatný token',
                details: error.message 
            });
        }
        return res.status(401).json({ error: 'Chyba při ověření tokenu' });
    }
};

module.exports = verifyToken;
