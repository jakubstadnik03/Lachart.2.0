/**
 * timelineRoutes.js — data for the Training Timeline.
 *
 * Only the zone distribution needs the server: load, plan and rolling totals
 * are all derived client-side from the calendar the dashboard already holds.
 * Time in zone cannot be — it needs per-second heart-rate streams.
 */

'use strict';

const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/verifyToken');
const User = require('../models/UserModel');
const { dailyZoneDistribution } = require('../utils/dailyZoneDistribution');
const { groupByRoute } = require('../utils/routeSignature');
const { weatherForActivity } = require('../utils/activityWeather');
const StravaActivity = require('../models/StravaActivity');
const StravaStream = require('../models/StravaStream');
const { isCoachLikeRole, athleteHasCoachUser } = require('../utils/athleteCoachAccess');

const MAX_RANGE_DAYS = 400;

/**
 * GET /api/timeline/zones?athleteId&start=YYYY-MM-DD&end=YYYY-MM-DD&sport=all|run|bike|swim
 */
router.get('/zones', verifyToken, async (req, res) => {
  try {
    const viewer = await User.findById(req.user.userId);
    if (!viewer) return res.status(401).json({ error: 'User not found' });

    const requestedId = String(req.query.athleteId || '').trim();
    let targetId = String(viewer._id);

    if (requestedId && requestedId !== targetId) {
      if (!isCoachLikeRole(viewer.role)) return res.status(403).json({ error: 'Access denied' });
      const athlete = await User.findById(requestedId).select('coachId coaches');
      if (!athlete) return res.status(404).json({ error: 'Athlete not found' });
      if (!athleteHasCoachUser(athlete, targetId)) return res.status(403).json({ error: 'Access denied' });
      targetId = requestedId;
    }

    const start = new Date(`${String(req.query.start || '').slice(0, 10)}T00:00:00`);
    const end = new Date(`${String(req.query.end || '').slice(0, 10)}T23:59:59`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
      return res.status(400).json({ error: 'Invalid start/end' });
    }
    // Streams are the expensive part of this query; an unbounded range would
    // pull a year of per-second data for every sport at once.
    if ((end - start) / 86400000 > MAX_RANGE_DAYS) {
      return res.status(400).json({ error: `Range exceeds ${MAX_RANGE_DAYS} days` });
    }

    const sport = ['all', 'run', 'bike', 'swim'].includes(req.query.sport) ? req.query.sport : 'all';
    const metric = req.query.metric === 'power' ? 'power' : 'hr';
    const result = await dailyZoneDistribution(targetId, start, end, { sport, metric });
    res.json(result);
  } catch (error) {
    console.error('Error building timeline zones:', error);
    res.status(500).json({ error: 'Failed to build zone distribution' });
  }
});

/**
 * GET /api/timeline/routes?athleteId&limit
 *
 * Routes the athlete has done more than once, with how each repeat went.
 * The point is the progression: the same loop is the only fair comparison an
 * athlete gets outdoors, where wind, hills and traffic otherwise make every
 * session incomparable.
 */
router.get('/routes', verifyToken, async (req, res) => {
  try {
    const viewer = await User.findById(req.user.userId);
    if (!viewer) return res.status(401).json({ error: 'User not found' });

    const requestedId = String(req.query.athleteId || '').trim();
    let targetId = String(viewer._id);
    if (requestedId && requestedId !== targetId) {
      if (!isCoachLikeRole(viewer.role)) return res.status(403).json({ error: 'Access denied' });
      const athlete = await User.findById(requestedId).select('coachId coaches');
      if (!athlete) return res.status(404).json({ error: 'Athlete not found' });
      if (!athleteHasCoachUser(athlete, targetId)) return res.status(403).json({ error: 'Access denied' });
      targetId = requestedId;
    }

    // Streams are heavy, so this looks at recent activities only. A route you
    // last rode two years ago is history, not a progression.
    const limit = Math.min(300, Math.max(20, Number(req.query.limit) || 150));
    const activities = await StravaActivity.find({ userId: targetId })
      .sort({ startDate: -1 })
      .limit(limit)
      .select('stravaId name titleManual sport startDate movingTime elapsedTime distance averageHeartRate averagePower total_elevation_gain')
      .lean();

    if (!activities.length) return res.json({ routes: [] });

    const streams = await StravaStream.find({
      userId: targetId,
      stravaId: { $in: activities.map((a) => a.stravaId) },
    }).select('stravaId streams.latlng').lean();
    const latlngById = new Map(streams.map((s) => [String(s.stravaId), s.streams?.latlng || null]));

    const withTracks = activities.map((a) => ({
      id: `strava-${a.stravaId}`,
      stravaId: String(a.stravaId),
      title: (a.titleManual && a.titleManual.trim()) || a.name || 'Untitled',
      sport: a.sport,
      date: a.startDate,
      seconds: Number(a.movingTime || a.elapsedTime || 0),
      distance: Number(a.distance || 0),
      avgHeartRate: Number(a.averageHeartRate || 0) || null,
      avgPower: Number(a.averagePower || 0) || null,
      elevation: Number(a.total_elevation_gain || 0) || null,
      latlng: latlngById.get(String(a.stravaId)),
    }));

    const routes = groupByRoute(withTracks).map((route) => {
      const efforts = route.activities.map((a) => ({
        id: a.id,
        title: a.title,
        date: a.date,
        seconds: a.seconds,
        // Pace over the route's nominal distance, so a GPS drop-out on one
        // recording doesn't make that day look like a personal best.
        secPerKm: a.seconds > 0 && route.distanceM > 0
          ? Math.round(a.seconds / (route.distanceM / 1000))
          : null,
        avgHeartRate: a.avgHeartRate,
        avgPower: a.avgPower,
      }));

      const timed = efforts.filter((e) => e.seconds > 0);
      const best = timed.length
        ? timed.reduce((b, e) => (e.seconds < b.seconds ? e : b), timed[0])
        : null;
      const latest = efforts[efforts.length - 1];
      const first = efforts[0];

      return {
        distanceM: route.distanceM,
        isLoop: route.isLoop,
        points: route.points,
        sport: route.activities[0]?.sport || null,
        name: route.activities[route.activities.length - 1]?.title || 'Route',
        count: efforts.length,
        efforts,
        best,
        /** Change from the first recorded effort to the latest, in seconds. */
        deltaSeconds: first?.seconds > 0 && latest?.seconds > 0 ? latest.seconds - first.seconds : null,
        isBestLatest: !!(best && latest && best.id === latest.id),
      };
    });

    res.json({ routes });
  } catch (error) {
    console.error('Error building route history:', error);
    res.status(500).json({ error: 'Failed to build route history' });
  }
});

/**
 * GET /api/timeline/weather?activityKey=strava-123
 *
 * Conditions during one activity, looked up once from its own GPS and start
 * time, then frozen. 204 when the activity has no GPS to look anything up from.
 */
router.get('/weather', verifyToken, async (req, res) => {
  try {
    const activityKey = String(req.query.activityKey || '').trim();
    if (!/^(strava|fit|regular)-[\w-]+$/.test(activityKey)) {
      return res.status(400).json({ error: 'Invalid activityKey' });
    }
    const weather = await weatherForActivity(req.user.userId, activityKey);
    if (!weather) return res.status(204).end();
    res.json(weather);
  } catch (error) {
    console.error('Error fetching activity weather:', error);
    res.status(500).json({ error: 'Failed to fetch weather' });
  }
});

module.exports = router;
