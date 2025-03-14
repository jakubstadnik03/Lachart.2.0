const express = require('express');
const router = express.Router();
const login = require('../controllers/auth/login');
const getUser = require('../controllers/users/getUser');
const verifyToken = require('../middleware/verifyToken');

// Přihlášení
router.post('/login', login);

// Získání přihlášeného uživatele
router.get('/me', verifyToken, getUser);

module.exports = router; 