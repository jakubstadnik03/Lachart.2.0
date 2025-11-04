const express = require('express');
const axios = require('axios');
const verifyToken = require('../middleware/verifyToken');
const User = require('../models/UserModel');
const router = express.Router();

// GET /api/integrations/strava/auth-url
router.get('/strava/auth-url', (req, res) => {
  const clientId = process.env.STRAVA_CLIENT_ID || 'STRAVA_CLIENT_ID';
  const redirectUri = process.env.STRAVA_REDIRECT_URI || 'http://localhost:8000/api/integrations/strava/callback';
  const scope = 'activity:read_all,profile:read_all,read_all';
  const url = `https://www.strava.com/oauth/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}&approval_prompt=auto`;
  res.json({ url });
});

// OAuth callback - exchange code for tokens and save to user
router.get('/strava/callback', verifyToken, async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) return res.status(400).json({ error: 'Missing code' });
    const client_id = process.env.STRAVA_CLIENT_ID;
    const client_secret = process.env.STRAVA_CLIENT_SECRET;
    if (!client_id || !client_secret) {
      return res.status(500).json({ error: 'Strava credentials missing' });
    }
    const tokenResp = await axios.post('https://www.strava.com/oauth/token', {
      client_id,
      client_secret,
      code,
      grant_type: 'authorization_code'
    });
    const { access_token, refresh_token, expires_at, athlete } = tokenResp.data || {};
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    user.strava = {
      athleteId: athlete?.id?.toString() || user.strava?.athleteId || null,
      accessToken: access_token,
      refreshToken: refresh_token,
      expiresAt: expires_at
    };
    await user.save();
    res.json({ status: 'ok' });
  } catch (err) {
    console.error('Strava callback error', err.response?.data || err.message);
    res.status(500).json({ error: 'Strava callback failed' });
  }
});

async function getValidStravaToken(user) {
  if (!user?.strava?.accessToken) return null;
  const now = Math.floor(Date.now() / 1000);
  if (user.strava.expiresAt && user.strava.expiresAt - 60 > now) return user.strava.accessToken;
  // refresh
  const client_id = process.env.STRAVA_CLIENT_ID;
  const client_secret = process.env.STRAVA_CLIENT_SECRET;
  const resp = await axios.post('https://www.strava.com/oauth/token', {
    client_id,
    client_secret,
    grant_type: 'refresh_token',
    refresh_token: user.strava.refreshToken
  });
  user.strava.accessToken = resp.data.access_token;
  user.strava.refreshToken = resp.data.refresh_token || user.strava.refreshToken;
  user.strava.expiresAt = resp.data.expires_at;
  await user.save();
  return user.strava.accessToken;
}

// POST /api/integrations/strava/sync (basic history fetch)
router.post('/strava/sync', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user || !user.strava?.accessToken) return res.status(400).json({ error: 'Strava not connected' });
    const token = await getValidStravaToken(user);
    const per_page = 100;
    let page = 1;
    let total = 0;
    const all = [];
    while (page <= 3) { // limit for now
      const resp = await axios.get('https://www.strava.com/api/v3/athlete/activities', {
        headers: { Authorization: `Bearer ${token}` },
        params: { per_page, page }
      });
      const arr = resp.data || [];
      all.push(...arr);
      total += arr.length;
      if (arr.length < per_page) break;
      page += 1;
    }
    // TODO: normalize & store to DB; for now return count
    res.json({ imported: total, updated: 0, status: 'ok' });
  } catch (err) {
    console.error('Strava sync error', err.response?.data || err.message);
    res.status(500).json({ error: 'Strava sync failed' });
  }
});

// Garmin placeholders (note: Garmin has restricted APIs)
router.get('/garmin/auth-url', (req, res) => {
  const url = 'https://connect.garmin.com/';
  res.json({ url });
});

router.post('/garmin/sync', verifyToken, async (req, res) => {
  res.json({ imported: 0, updated: 0, status: 'stub' });
});

// List normalized activities (stub)
router.get('/activities', verifyToken, async (req, res) => {
  res.json([]);
});

module.exports = router;
