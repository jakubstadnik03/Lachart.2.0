const express = require('express');
const router = express.Router();
const VLamaxTest = require('../models/vlamaxTest');
const User = require('../models/UserModel');
const verifyToken = require('../middleware/verifyToken');

async function userCanAccessAthlete(reqUserId, athleteId) {
    if (String(reqUserId) === String(athleteId)) return true;
    const requester = await User.findById(reqUserId).select('role admin athletes').lean();
    if (!requester) return false;
    const role = String(requester.role || '').toLowerCase();
    if (requester.admin === true || role === 'admin') return true;
    if (['coach', 'tester', 'testing'].includes(role)) {
        return (requester.athletes || []).some(a =>
            String(a.athleteId) === String(athleteId) || String(a._id) === String(athleteId)
        );
    }
    return false;
}

router.get('/athlete/:athleteId', verifyToken, async (req, res) => {
    try {
        const { athleteId } = req.params;
        if (!await userCanAccessAthlete(req.user.userId, athleteId)) {
            return res.status(403).json({ error: 'Access denied' });
        }
        const tests = await VLamaxTest.find({ athleteId: String(athleteId) })
            .sort({ date: -1 })
            .lean();
        return res.json(tests);
    } catch (err) {
        console.error('[vlamax] list error:', err);
        return res.status(500).json({ error: 'Failed to list VLamax tests' });
    }
});

router.get('/:id', verifyToken, async (req, res) => {
    try {
        const test = await VLamaxTest.findById(req.params.id).lean();
        if (!test) return res.status(404).json({ error: 'VLamax test not found' });
        if (!await userCanAccessAthlete(req.user.userId, test.athleteId)) {
            return res.status(403).json({ error: 'Access denied' });
        }
        return res.json(test);
    } catch (err) {
        return res.status(500).json({ error: 'Failed to fetch VLamax test' });
    }
});

router.post('/', verifyToken, async (req, res) => {
    try {
        const body = req.body || {};
        const athleteId = String(body.athleteId || req.user.userId);
        if (!await userCanAccessAthlete(req.user.userId, athleteId)) {
            return res.status(403).json({ error: 'Access denied' });
        }
        const test = await VLamaxTest.create({
            ...body,
            athleteId,
            coachId: body.coachId || req.user.userId,
        });
        return res.status(201).json(test);
    } catch (err) {
        console.error('[vlamax] create error:', err);
        return res.status(500).json({ error: 'Failed to create VLamax test' });
    }
});

router.put('/:id', verifyToken, async (req, res) => {
    try {
        const existing = await VLamaxTest.findById(req.params.id);
        if (!existing) return res.status(404).json({ error: 'VLamax test not found' });
        if (!await userCanAccessAthlete(req.user.userId, existing.athleteId)) {
            return res.status(403).json({ error: 'Access denied' });
        }
        const allowed = ['sport', 'title', 'date', 'notes', 'sprintDurationSec', 'alacticOffsetSec',
            'sprintAvgPower', 'sprintAvgPace', 'sprintDistanceM', 'preLactate', 'samples',
            'weight', 'peakLactate', 'peakAtMin', 'vlamax'];
        for (const k of allowed) {
            if (k in req.body) existing[k] = req.body[k];
        }
        await existing.save();
        return res.json(existing);
    } catch (err) {
        return res.status(500).json({ error: 'Failed to update VLamax test' });
    }
});

router.delete('/:id', verifyToken, async (req, res) => {
    try {
        const existing = await VLamaxTest.findById(req.params.id);
        if (!existing) return res.status(404).json({ error: 'VLamax test not found' });
        if (!await userCanAccessAthlete(req.user.userId, existing.athleteId)) {
            return res.status(403).json({ error: 'Access denied' });
        }
        await existing.deleteOne();
        return res.json({ ok: true });
    } catch (err) {
        return res.status(500).json({ error: 'Failed to delete VLamax test' });
    }
});

module.exports = router;
