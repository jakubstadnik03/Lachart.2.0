/**
 * lactateAnalyticsRoutes.js
 * ─────────────────────────
 * Endpoint: GET /api/lactate-analytics/:athleteId
 *
 * Aggregates lactate data from Training, FitTraining, and LactateSession
 * documents and runs the four core analyses:
 *   1. Session lactate drift (accumulation within session)
 *   2. Pace/power-to-lactate trend across sessions (fitness progression)
 *   3. Anomaly detection (unusually high lactate for the intensity)
 *   4. Clearance index (how fast lactate drops between intervals)
 *
 * Query params:
 *   days  - lookback window in days (default 120)
 */

const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/verifyToken');
const Training = require('../models/training');
const FitTraining = require('../models/fitTraining');
const LactateSession = require('../models/lactateSession');
const { analyzeLactateProgression } = require('../utils/lactateAnalytics');

// ─── auth helper ─────────────────────────────────────────────────────────────

function canAccessAthlete(req, targetId) {
  const { userId, role, admin } = req.user;
  if (String(userId) === String(targetId)) return true;
  if (admin === true) return true;
  if (['admin', 'coach', 'tester', 'testing'].includes(role)) return true;
  return false;
}

// ─── route ───────────────────────────────────────────────────────────────────

router.get('/:athleteId', verifyToken, async (req, res) => {
  try {
    const { athleteId } = req.params;
    if (!canAccessAthlete(req, athleteId)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const days = Math.min(Number(req.query.days) || 120, 365);
    const since = new Date();
    since.setDate(since.getDate() - days);

    // ── 1. Manual Training sessions ──────────────────────────────────────
    const trainings = await Training.find({
      athleteId,
      date: { $gte: since },
      'results.lactate': { $exists: true, $gt: 0 },
    })
      .select('date sport results')
      .lean();

    const trainingSessions = trainings.map((t) => ({
      _id: t._id,
      date: t.date,
      sport: t.sport,
      source: 'training',
      intervals: (t.results || []).map((r) => ({
        lactate:      r.lactate ?? null,
        power:        r.power ?? null,
        intensity:    r.intensity ?? null,   // pace string e.g. "4:05/km"
        isRecovery:   r.isRecovery ?? false,
        intervalType: r.intervalType ?? null,
      })),
    }));

    // ── 2. FIT training laps ──────────────────────────────────────────────
    const fitTrainings = await FitTraining.find({
      athleteId,
      'laps.lactate': { $exists: true, $gt: 0 },
      $or: [
        { timestamp: { $gte: since } },
        { uploadDate: { $gte: since } },
      ],
    })
      .select('timestamp uploadDate sport laps')
      .lean();

    const fitSessions = fitTrainings.map((ft) => ({
      _id: ft._id,
      date: ft.timestamp || ft.uploadDate,
      sport: ft.sport,
      source: 'fit',
      intervals: (ft.laps || []).map((l) => ({
        lactate:      l.lactate ?? null,
        avgPower:     l.avgPower ?? null,
        avgSpeed:     l.avgSpeed ?? null,
        avgHeartRate: l.avgHeartRate ?? null,
        isRecovery:   false,
        intervalType: l.intervalType ?? null,
      })),
    }));

    // ── 3. Lactate step-test sessions ─────────────────────────────────────
    const lactateSessions = await LactateSession.find({
      athleteId,
      date: { $gte: since },
      'measurements.lactate': { $exists: true, $gt: 0 },
    })
      .select('date sport measurements')
      .lean();

    const ltSessions = lactateSessions.map((ls) => ({
      _id: ls._id,
      date: ls.date,
      sport: ls.sport,
      source: 'lactate_test',
      intervals: (ls.measurements || []).map((m) => ({
        lactate:   m.lactate ?? null,
        power:     m.power ?? null,
        speed:     m.speed ?? null,
        isRecovery: false,
        intervalType: null,
      })),
    }));

    // ── 4. Merge and analyse ──────────────────────────────────────────────
    const allSessions = [...trainingSessions, ...fitSessions, ...ltSessions];

    if (allSessions.length === 0) {
      return res.json({
        days,
        sessionCount: 0,
        trend: {},
        sessionAnalyses: [],
        anomalies: [],
        message: 'No sessions with lactate data found in this window.',
      });
    }

    const analysis = analyzeLactateProgression(allSessions);

    return res.json({
      days,
      sessionCount: allSessions.length,
      ...analysis,
    });

  } catch (err) {
    console.error('[lactateAnalytics] Error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

module.exports = router;
