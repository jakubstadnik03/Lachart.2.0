const express = require('express');
const router = express.Router();
const login = require('../controllers/auth/login');
const getUser = require('../controllers/users/getUser');
const verifyToken = require('../middleware/verifyToken');
const { blacklistToken } = require('../middleware/authManager');

// Přihlášení
router.post('/login', login);

// Získání přihlášeného uživatele
router.get('/me', verifyToken, getUser);

router.post('/logout', verifyToken, (req, res) => {
  try {
    // Získat token z hlavičky
    const token = req.headers.authorization.split(' ')[1];
    
    // Přidat token do blacklistu
    blacklistToken(token);
    
    res.status(200).json({ message: 'Logout successful' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Logout failed' });
  }
});

module.exports = router; 