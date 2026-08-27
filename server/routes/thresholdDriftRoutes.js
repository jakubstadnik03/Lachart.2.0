/**
 * thresholdDriftRoutes.js — has the athlete's threshold moved since they tested?
 *
 * Reads every session since the governing test against that test's own HR–power
 * line and returns the trend. See services/thresholdDriftService.js for the
 * walk and utils/hrPowerProfile.js for the fit.
 */

'use strict';

const express = require('express');

const router = express.Router();
const verifyToken = require('../middleware/verifyToken');
const User = require('../models/UserModel');
const { isCoachLikeRole, athleteHasCoachUser } = require('../utils/athleteCoachAccess');
const { readSessionsSinceTest } = require('../services/thresholdDriftService');
const {
  buildDriftHistory, demandToThreshold, projectThresholdShift,
  projectThresholdTimeline, sportKind, thresholdToDemand,
} = require('../utils/hrPowerProfile');
const { extractAnchor } = require('../utils/lactateAnchor');

/**
 * GET /api/threshold-drift
 *
 * @query sport      'bike' | 'run' (default 'bike')
 * @query athleteId  optional — a coach may read a linked athlete's drift
 * @query limit      optional — sessions to walk back, default 80, max 200
 */
/**
 * The anchor as the client computed it.
 *
 * The client and the server each have a lactate-threshold implementation, and
 * on real tests they disagree — one athlete's LT2 came out 3:50/km in the app
 * and 4:35/km here, because the client applies guards (an implausible LT2 is
 * replaced with OBLA 4.0) that this side has never had. A panel that quotes a
 * threshold the test page does not show is worse than no panel.
 *
 * So the number the athlete can see wins. The client sends the anchor it drew
 * the test page with, and everything here is measured against that. The server
 * pipeline stays as the fallback for callers that cannot compute one.
 */
function anchorFromRequest(body, kind) {
  const a = body?.anchor;
  if (!a || typeof a !== 'object') return null;
  const num = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null);
  const lt2 = num(a.lt2);
  const lt2Hr = num(a.lt2Hr);
  if (!lt2 || !lt2Hr) return null;
  const points = (Array.isArray(a.points) ? a.points : [])
    .map((p) => ({ x: Number(p?.x), y: Number(p?.y), hr: Number(p?.hr) }))
    .filter((p) => Number.isFinite(p.x) && p.x > 0 && Number.isFinite(p.y) && p.y > 0);
  if (points.length < 3) return null;
  return {
    sport: kind,
    isPace: kind !== 'bike',
    storageMode: a.storageMode === 'speed' ? 'speed' : 'pace',
    lt1: num(a.lt1),
    lt2,
    lt1Hr: num(a.lt1Hr),
    lt2Hr,
    points,
  };
}

router.post('/', verifyToken, async (req, res) => {
  try {
    const viewer = await User.findById(req.user.userId);
    if (!viewer) return res.status(401).json({ error: 'User not found' });

    const requestedId = String(req.query.athleteId || '').trim();
    let target = viewer;

    if (requestedId && requestedId !== String(viewer._id)) {
      if (!isCoachLikeRole(viewer.role)) return res.status(403).json({ error: 'Access denied' });
      const athlete = await User.findById(requestedId);
      if (!athlete) return res.status(404).json({ error: 'Athlete not found' });
      if (!athleteHasCoachUser(athlete, String(viewer._id))) {
        return res.status(403).json({ error: 'Access denied' });
      }
      target = athlete;
    }

    const sport = sportKind(req.body?.sport || req.query.sport || 'bike');
    const limit = Math.min(500, Math.max(5, Number(req.body?.limit || req.query.limit) || 250));
    const clientAnchor = anchorFromRequest(req.body, sport);

    const {
      test, anchor: serverAnchor, reads, compared, sportTests, unreadable, considered, skipped,
    } = await readSessionsSinceTest({
      userId: target._id,
      sport,
      limit,
      anchorOverride: clientAnchor,
    });
    const anchor = clientAnchor || serverAnchor;

    if (!test) return res.json({ sport, test: null, series: [], latest: null, retest: null, reason: skipped?.reason || 'no-test' });

    const testSummary = {
      id: String(test._id),
      date: test.date,
      title: test.title,
      lt1: anchor?.lt1 ?? null,
      lt2: anchor?.lt2 ?? null,
      lt1Hr: anchor?.lt1Hr ?? null,
      lt2Hr: anchor?.lt2Hr ?? null,
      storageMode: anchor?.storageMode ?? 'pace',
      anchorSource: clientAnchor ? 'client' : 'server',
    };

    // Where the thresholds have drifted to, from heart rate measured at
    // intensities the test covered. Computed before the early return below:
    // most athletes have far more sessions that can be placed against the
    // curve than sessions the threshold fit will touch, and it would be absurd
    // to return "no data" while holding forty of them.
    const projection = projectThresholdShift(compared || [], anchor);
    const timeline = projectThresholdTimeline(compared || [], anchor);

    /**
     * The sessions the estimate was built from, newest first, each with how
     * much of it sat near a threshold. An estimate nobody can trace back to
     * the training behind it is a number to be taken on faith, and this one
     * asks the athlete to change how they train.
     */
    const contributors = (compared || [])
      .map((c) => {
        const minutes = (c.blocks || []).reduce((s2, b) => s2 + (Number(b.sec) || 0), 0) / 60;
        const deltas = (c.blocks || []).map((b) => Number(b.deltaHr)).filter(Number.isFinite);
        return {
          id: c.id,
          title: c.title,
          date: c.date,
          minutes: Math.round(minutes),
          blocks: (c.blocks || []).length,
          meanDeltaHr: deltas.length ? deltas.reduce((a, b) => a + b, 0) / deltas.length : null,
        };
      })
      .filter((c) => c.minutes > 0)
      .sort((a, b) => new Date(b.date) - new Date(a.date));

    // The measured points the estimated line runs between. Every test of this
    // sport, not just the governing one: the estimate only covers the period
    // since the last test, and the earlier ones are what give a season its
    // shape.
    const testMarkers = (sportTests || []).map((t) => {
      const a = extractAnchor(t);
      if (!a) return null;
      const toDemand = (v) => thresholdToDemand(v, { kind: sport, storageMode: a.storageMode });
      return {
        id: String(t._id),
        date: t.date,
        title: t.title,
        lt1: a.lt1 != null ? toDemand(a.lt1) : null,
        lt2: a.lt2 != null ? toDemand(a.lt2) : null,
      };
    }).filter((m) => m && (m.lt1 || m.lt2));

    if (!reads.length) {
      return res.json({
        sport,
        test: testSummary,
        series: [],
        latest: null,
        retest: null,
        projection,
        timeline,
        testMarkers,
        contributors,
        reason: skipped?.reason || 'no-readable-sessions',
        coverage: {
          considered: considered || 0,
          read: 0,
          compared: (compared || []).length,
          unreadable: unreadable || {},
        },
      });
    }

    const history = buildDriftHistory(
      reads.map((r) => ({ date: r.date, title: r.title, id: r.activityKey, result: { ...r, ok: true } })),
      { testDate: test.date },
    );

    // The series carries demand in engine units (watts, or m/s for pace sports).
    // Convert once here so the client plots the unit the athlete's test is in
    // and never has to know the engine's internal scale.
    const toThreshold = (d) => demandToThreshold(d, { kind: sport, storageMode: testSummary.storageMode });
    const series = history.series.map((p) => ({
      date: p.date,
      id: p.id,
      title: p.title,
      confidence: p.confidence,
      deltaDemand: p.deltaDemand,
      deltaPct: p.deltaPct,
      deltaHr: p.deltaHr,
      hrAtLt2: p.hrAtLt2,
      thresholdAtLt2Hr: p.thresholdAtLt2Hr,
      trendDelta: p.trendDelta,
      trendPct: p.trendPct,
      trendThreshold: toThreshold((p.lt2Demand || 0) + p.trendDelta),
      drift: p.drift,
      sampleCount: p.sampleCount,
    }));

    res.json({
      sport,
      test: testSummary,
      series,
      latest: series[series.length - 1] || null,
      retest: history.retest,
      projection,
      timeline,
      testMarkers,
      contributors,
      coverage: {
        considered: considered || 0,
        read: reads.length,
        compared: (compared || []).length,
        unreadable: unreadable || {},
      },
    });
  } catch (error) {
    console.error('threshold-drift failed:', error);
    res.status(500).json({ error: 'Failed to read threshold drift' });
  }
});

module.exports = router;
