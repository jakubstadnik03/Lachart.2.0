const express = require('express');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/jwt.config');
const verifyToken = require('../middleware/verifyToken');
const StravaActivity = require('../models/StravaActivity');
const User = require('../models/UserModel');
const router = express.Router();

// GET /api/integrations/strava/auth-url
router.get('/strava/auth-url', (req, res) => {
  const clientId = process.env.STRAVA_CLIENT_ID || 'STRAVA_CLIENT_ID';
  const redirectUri = process.env.STRAVA_REDIRECT_URI || 'http://localhost:8000/api/integrations/strava/callback';
  const scope = 'activity:read_all,profile:read_all,read_all';
  // Try to forward current JWT in state so callback can identify user without Authorization header
  const authHeader = req.headers.authorization || '';
  const state = encodeURIComponent(authHeader.replace('Bearer ', ''));
  const url = `https://www.strava.com/oauth/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}&approval_prompt=auto&state=${state}`;
  res.json({ url });
});

// OAuth callback - exchange code for tokens and save to user
router.get('/strava/callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    if (!code) return res.status(400).json({ error: 'Missing code' });
    // Extract user from state (JWT passed from auth-url call)
    if (!state) return res.status(401).json({ error: 'Missing auth state' });
    let decoded;
    try {
      decoded = jwt.verify(decodeURIComponent(state), JWT_SECRET);
    } catch (e) {
      return res.status(401).json({ error: 'Invalid auth state' });
    }
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
    const user = await User.findById(decoded.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    user.strava = {
      athleteId: athlete?.id?.toString() || user.strava?.athleteId || null,
      accessToken: access_token,
      refreshToken: refresh_token,
      expiresAt: expires_at
    };
    await user.save();
    const frontend = process.env.FRONTEND_URL || 'http://localhost:3000';
    // Redirect back to app with a flag
    return res.redirect(`${frontend}/fit-analysis?strava=connected`);
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
    let imported = 0;
    let updated = 0;
    while (page <= 3) { // limit for now
      const resp = await axios.get('https://www.strava.com/api/v3/athlete/activities', {
        headers: { Authorization: `Bearer ${token}` },
        params: { per_page, page }
      });
      const arr = resp.data || [];
      total += arr.length;
      // upsert each
      for (const a of arr) {
        const doc = {
          userId: user._id,
          stravaId: a.id,
          name: a.name,
          sport: a.sport_type || a.type,
          startDate: new Date(a.start_date_local || a.start_date),
          elapsedTime: a.elapsed_time,
          movingTime: a.moving_time,
          distance: a.distance,
          averageSpeed: a.average_speed,
          averageHeartRate: a.average_heartrate,
          averagePower: a.average_watts,
          raw: a
        };
        const resUp = await StravaActivity.updateOne(
          { userId: user._id, stravaId: a.id },
          { $set: doc },
          { upsert: true }
        );
        if (resUp.upsertedCount > 0) imported += 1; else if (resUp.modifiedCount > 0) updated += 1;
      }
      if (arr.length < per_page) break;
      page += 1;
    }
    res.json({ imported, updated, totalFetched: total, status: 'ok' });
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
  const acts = await StravaActivity.find({ userId: req.user.userId }).sort({ startDate: -1 }).limit(1000);
  res.json(acts);
});

// Connection status
router.get('/status', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    const stravaConnected = Boolean(user?.strava?.accessToken);
    const garminConnected = Boolean(user?.garmin?.accessToken);
    res.json({ stravaConnected, garminConnected });
  } catch (e) {
    res.status(500).json({ error: 'status_failed' });
  }
});

// Detailed activity with streams (time, speed, HR, power)
router.get('/strava/activities/:id', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    const token = await getValidStravaToken(user);
    const id = req.params.id;
    const detailResp = await axios.get(`https://www.strava.com/api/v3/activities/${id}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const streamsResp = await axios.get(`https://www.strava.com/api/v3/activities/${id}/streams`, {
      headers: { Authorization: `Bearer ${token}` },
      params: { keys: 'time,velocity_smooth,heartrate,watts,altitude', key_by_type: true }
    });
    // Laps (intervals)
    let laps = [];
    try {
      const lapsResp = await axios.get(`https://www.strava.com/api/v3/activities/${id}/laps`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      laps = lapsResp.data || [];
    } catch (e) {}
    res.json({ detail: detailResp.data, streams: streamsResp.data, laps });
  } catch (e) {
    console.error('Strava activity detail error', e.response?.data || e.message);
    res.status(500).json({ error: 'activity_detail_failed' });
  }
});

module.exports = router;
