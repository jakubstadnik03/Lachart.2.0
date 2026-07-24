const express = require('express');
const router = express.Router();
const CPTest = require('../models/cpTest');
const User = require('../models/UserModel');
const StravaActivity = require('../models/StravaActivity');
const verifyToken = require('../middleware/verifyToken');
const { requireQuotaSlot } = require('../middleware/featureGate');
const { countCurrentTests } = require('../utils/testQuota');

/**
 * Authorization helper — same model as lactate tests. Coaches can read/write
 * tests of their linked athletes; regular athletes can only access their own.
 */
async function userCanAccessAthlete(reqUserId, athleteId) {
    if (String(reqUserId) === String(athleteId)) return true;
    const requester = await User.findById(reqUserId).select('role admin athletes').lean();
    if (!requester) return false;
    const role = String(requester.role || '').toLowerCase();
    if (requester.admin === true || role === 'admin') return true;
    if (['coach', 'tester', 'testing'].includes(role)) {
        const linked = (requester.athletes || []).some(a =>
            String(a.athleteId) === String(athleteId) || String(a._id) === String(athleteId)
        );
        return linked;
    }
    return false;
}

// GET /api/cp-test/athlete/:athleteId — list CP tests for an athlete
router.get('/athlete/:athleteId', verifyToken, async (req, res) => {
    try {
        const { athleteId } = req.params;
        if (!await userCanAccessAthlete(req.user.userId, athleteId)) {
            return res.status(403).json({ error: 'Access denied' });
        }
        const tests = await CPTest.find({ athleteId: String(athleteId) })
            .sort({ date: -1 })
            .lean();
        return res.json(tests);
    } catch (err) {
        console.error('[cpTest] list error:', err);
        return res.status(500).json({ error: 'Failed to list CP tests' });
    }
});

// GET /api/cp-test/:id — single CP test
router.get('/:id', verifyToken, async (req, res) => {
    try {
        const test = await CPTest.findById(req.params.id).lean();
        if (!test) return res.status(404).json({ error: 'CP test not found' });
        if (!await userCanAccessAthlete(req.user.userId, test.athleteId)) {
            return res.status(403).json({ error: 'Access denied' });
        }
        return res.json(test);
    } catch (err) {
        console.error('[cpTest] get error:', err);
        return res.status(500).json({ error: 'Failed to fetch CP test' });
    }
});

// POST /api/cp-test — create
router.post('/', verifyToken, requireQuotaSlot('tests', countCurrentTests), async (req, res) => {
    try {
        const body = req.body || {};
        const athleteId = String(body.athleteId || req.user.userId);
        if (!await userCanAccessAthlete(req.user.userId, athleteId)) {
            return res.status(403).json({ error: 'Access denied' });
        }
        if (!Array.isArray(body.efforts) || body.efforts.length < 2) {
            return res.status(400).json({ error: 'A CP test needs at least 2 efforts.' });
        }
        const test = await CPTest.create({
            ...body,
            athleteId,
            coachId: body.coachId || req.user.userId,
        });
        return res.status(201).json(test);
    } catch (err) {
        console.error('[cpTest] create error:', err);
        return res.status(500).json({ error: 'Failed to create CP test' });
    }
});

// PUT /api/cp-test/:id — update
router.put('/:id', verifyToken, async (req, res) => {
    try {
        const existing = await CPTest.findById(req.params.id);
        if (!existing) return res.status(404).json({ error: 'CP test not found' });
        if (!await userCanAccessAthlete(req.user.userId, existing.athleteId)) {
            return res.status(403).json({ error: 'Access denied' });
        }
        // Only update fields that exist on the schema; athleteId is immutable.
        const allowed = ['sport', 'title', 'date', 'description', 'notes', 'weight', 'efforts', 'cp', 'wPrime', 'linkedLactateTestId'];
        for (const k of allowed) {
            if (k in req.body) existing[k] = req.body[k];
        }
        await existing.save();
        return res.json(existing);
    } catch (err) {
        console.error('[cpTest] update error:', err);
        return res.status(500).json({ error: 'Failed to update CP test' });
    }
});

// GET /api/cp-test/strava-best-efforts/:athleteId
// Scan recent Strava activities and find the strongest standalone effort near
// each target duration. Bike: highest `averagePower`. Run/swim: best pace
// (lowest sec per km / sec per 100m derived from averageSpeed).
// Query: ?sport=bike&durations=180,720,1200&days=180
router.get('/strava-best-efforts/:athleteId', verifyToken, async (req, res) => {
    try {
        const { athleteId } = req.params;
        if (!await userCanAccessAthlete(req.user.userId, athleteId)) {
            return res.status(403).json({ error: 'Access denied' });
        }
        const sport = String(req.query.sport || 'bike').toLowerCase();
        const days = Math.max(7, Math.min(730, parseInt(req.query.days, 10) || 180));
        const durations = String(req.query.durations || '180,720')
            .split(',').map(s => parseInt(s.trim(), 10)).filter(n => Number.isFinite(n) && n > 0);

        const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

        // Filter by sport — Strava uses "Ride" / "Run" / "Swim" etc.
        const sportFilter = sport === 'bike'
            ? { sport: { $in: [/ride/i, /bike/i, /cycl/i, /virtual/i] } }
            : sport === 'run'
                ? { sport: { $in: [/run/i] } }
                : { sport: { $in: [/swim/i] } };

        const activities = await StravaActivity.find({
            userId: String(athleteId),
            startDate: { $gte: since },
            ...sportFilter,
            movingTime: { $gt: 60 }, // ignore tiny scraps
        })
            .select('stravaId name startDate movingTime elapsedTime distance averageSpeed averageHeartRate averagePower sport')
            .lean();

        // For each target duration, find activities whose movingTime is within
        // [0.7×, 1.5×] of the target. We bias the upper bound (1.5×) because
        // a 4-min PR done inside a 5-min effort is still useful.
        const result = durations.map(targetSec => {
            const candidates = activities
                .filter(a => {
                    const dur = Number(a.movingTime || 0);
                    if (dur <= 0) return false;
                    return dur >= targetSec * 0.7 && dur <= targetSec * 1.5;
                })
                .map(a => {
                    let value = null;
                    if (sport === 'bike') {
                        value = Number(a.averagePower || 0);
                    } else {
                        const speed = Number(a.averageSpeed || 0); // m/s
                        if (speed > 0) {
                            value = sport === 'swim' ? 100 / speed : 1000 / speed;
                        }
                    }
                    return {
                        stravaId: a.stravaId,
                        name: a.name,
                        date: a.startDate,
                        durationSec: Math.round(a.movingTime),
                        distanceM: Math.round(a.distance || 0),
                        value,
                    };
                })
                .filter(c => c.value != null && Number.isFinite(c.value) && c.value > 0)
                // For bike sort by power desc, for pace sort by pace asc (faster = smaller seconds)
                .sort((a, b) => sport === 'bike' ? b.value - a.value : a.value - b.value)
                .slice(0, 5);

            return { targetSec, candidates };
        });

        return res.json({ sport, days, durations, results: result });
    } catch (err) {
        console.error('[cpTest] best-efforts error:', err);
        return res.status(500).json({ error: 'Failed to scan Strava activities' });
    }
});

// DELETE /api/cp-test/:id — delete
router.delete('/:id', verifyToken, async (req, res) => {
    try {
        const existing = await CPTest.findById(req.params.id);
        if (!existing) return res.status(404).json({ error: 'CP test not found' });
        if (!await userCanAccessAthlete(req.user.userId, existing.athleteId)) {
            return res.status(403).json({ error: 'Access denied' });
        }
        await existing.deleteOne();
        return res.json({ ok: true });
    } catch (err) {
        console.error('[cpTest] delete error:', err);
        return res.status(500).json({ error: 'Failed to delete CP test' });
    }
});

module.exports = router;
