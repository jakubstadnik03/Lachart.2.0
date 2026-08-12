/**
 * dailyCardRoutes.js — the day's coaching card, built server-side.
 *
 * Only the Expo app needs this: the web client and the Capacitor shell already
 * hold the calendar in memory and build the same card locally, which keeps it
 * instant and available offline. See utils/dailyCoachCard.js for the mirror
 * warning about keeping the two builders in step.
 */

'use strict';

const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/verifyToken');
const User = require('../models/UserModel');
const { buildDailyCardForUser } = require('../utils/dailyCoachCard');
const { isCoachLikeRole, athleteHasCoachUser } = require('../utils/athleteCoachAccess');

/**
 * GET /api/daily-card
 *
 * @query athleteId  optional — a coach may read a linked athlete's card
 * @query tzOffset   optional — the caller's UTC offset in minutes, as returned
 *                   by Date.prototype.getTimezoneOffset(). Without it a server
 *                   in UTC would roll the athlete's "today" over at the wrong
 *                   moment, and an athlete in UTC+13 would read tomorrow's card
 *                   all evening.
 */
router.get('/', verifyToken, async (req, res) => {
  try {
    const viewer = await User.findById(req.user.userId);
    if (!viewer) return res.status(401).json({ error: 'User not found' });

    const requestedId = String(req.query.athleteId || '').trim();
    let target = viewer;

    if (requestedId && requestedId !== String(viewer._id)) {
      if (!isCoachLikeRole(viewer.role)) {
        return res.status(403).json({ error: 'Access denied' });
      }
      const athlete = await User.findById(requestedId);
      if (!athlete) return res.status(404).json({ error: 'Athlete not found' });
      if (!athleteHasCoachUser(athlete, String(viewer._id))) {
        return res.status(403).json({ error: 'Access denied' });
      }
      target = athlete;
    }

    // Rebuild the caller's local "now" so day boundaries land where the athlete
    // is. The card builder reads wall-clock time with local getters, so the
    // instant is shifted by the difference between the two zones — not by the
    // athlete's offset alone, which would only be right on a UTC server.
    const athleteOffset = Number(req.query.tzOffset);
    const now = Number.isFinite(athleteOffset)
      ? new Date(Date.now() - (athleteOffset - new Date().getTimezoneOffset()) * 60000)
      : new Date();

    const card = await buildDailyCardForUser(target, now);
    res.json(card);
  } catch (error) {
    console.error('Error building daily card:', error);
    res.status(500).json({ error: 'Failed to build daily card' });
  }
});

module.exports = router;
