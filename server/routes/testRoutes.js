const express = require("express");
const router = express.Router();
const rateLimit = require('express-rate-limit');
const testAbl = require("../abl/testAbl");
const verifyToken = require("../middleware/verifyToken");
const testController = require('../controllers/testController');
const Test = require('../models/test');
const User = require('../models/UserModel');
const { notifyCoachesOfAthlete, notifyAthlete } = require('../utils/notificationHelper');
const { requireQuotaSlot } = require('../middleware/featureGate');
const { countCurrentTests } = require('../utils/testQuota');
const { requirePremium } = require('../middleware/requirePremium');
const { getPopulationStats, getAthleteValues, MIN_SAMPLE_SIZE } = require('../services/lactateBenchmarkService');

// H4 — 3 demo emails per hour per IP
const demoEmailLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many demo email requests. Please try again later.' },
  skip: (req) => req.method === 'OPTIONS',
});

/**
 * @swagger
 * /api/tests:
 *   get:
 *     summary: Get all tests for the authenticated user
 *     tags: [Tests]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of tests
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Test'
 *       401:
 *         description: Unauthorized
 */
router.get('/', verifyToken, testController.getTests);

/**
 * GET /api/test/population-stats
 * Population statistics for LT1, LT2, W/kg and LT1/LT2 ratio, built from the
 * athletes' actual lactate tests (one sample per athlete per sport — see
 * services/lactateBenchmarkService). Premium feature.
 *
 * Query params:
 *   sport     - 'bike' | 'run' | 'swim' (omit for all three)
 *   gender    - 'male' | 'female' (omit for everyone)
 *   athleteId - include this athlete's own values from the same pipeline
 *               (self, or any athlete for coach/admin)
 *
 * IMPORTANT: This must be defined BEFORE /:id route to avoid matching "population-stats" as an ID
 */
router.get("/population-stats", verifyToken, requirePremium, async (req, res) => {
    try {
        const gender = ['male', 'female'].includes(req.query.gender) ? req.query.gender : 'all';
        const sports = ['bike', 'run', 'swim'].includes(req.query.sport)
            ? [req.query.sport]
            : ['bike', 'run', 'swim'];

        const result = { source: 'lactate-tests', minSampleSize: MIN_SAMPLE_SIZE };
        for (const s of sports) {
            result[s] = await getPopulationStats({ sport: s, gender });
        }

        const athleteId = req.query.athleteId;
        if (athleteId) {
            const { userId, role, admin } = req.user;
            const allowed = String(userId) === String(athleteId)
                || admin === true
                || ['admin', 'coach', 'tester', 'testing'].includes(role);
            result.athlete = allowed
                ? await getAthleteValues(athleteId, sports[0])
                : null;
        }

        res.json(result);
    } catch (error) {
        console.error('Error fetching population stats:', error);
        res.status(500).json({ error: 'Error fetching population statistics' });
    }
});

/**
 * @swagger
 * /api/tests/{id}:
 *   get:
 *     summary: Get a specific test by ID
 *     tags: [Tests]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Test ID
 *     responses:
 *       200:
 *         description: Test details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Test'
 *       404:
 *         description: Test not found
 *       401:
 *         description: Unauthorized
 */
router.get('/:id', verifyToken, testController.getTestById);

/**
 * Send a lactate test report to email (HTML + inline SVG)
 * POST /test/:id/send-report-email
 */
router.post('/:id/send-report-email', verifyToken, testController.sendTestReportEmail);

/**
 * Download lactate test report as PDF (same content as email, incl. previous test comparison)
 * GET /test/:id/report-pdf
 */
/**
 * Email the previewed PDF to the athlete
 * POST /test/:id/email-pdf   body: { pdfBase64, toEmail?, note? }
 */
router.post('/:id/email-pdf', verifyToken, testController.emailTestReportPdf);

router.get('/:id/report-pdf', verifyToken, testController.getTestReportPdf);
// Supports overrides payload (thresholds/zones from current UI view)
router.post('/:id/report-pdf', verifyToken, testController.getTestReportPdf);

/**
 * Send demo test results to email — rate-limited (H4)
 * POST /test/send-demo-email
 */
router.post('/send-demo-email', demoEmailLimiter, testController.sendDemoTestEmail);

// Compatibility alias: GET /test/list/:athleteId to fetch tests by athlete
router.get('/list/:athleteId', verifyToken, async (req, res) => {
    try {
        const User = require('../models/UserModel');
        const user = await User.findById(req.user.userId);
        
        const { athleteId } = req.params;
        const role = String(user?.role || '').toLowerCase();
        const requesterUserId = String(user?._id);
        const targetAthleteId = String(athleteId);

        // testing role = internal QA observer; can list all tests from DB
        if (role === 'testing') {
            const Test = require('../models/test');
            const allTests = await Test.find({}).sort({ date: -1 });
            return res.status(200).json(allTests);
        }

        // Own profile: athletes (and tester/testing viewing their own account) may list their tests.
        // tester/testing accessing another athlete follow coach-like rules below.

        // tester/testing/coach: only tests for their own athletes (not arbitrary users)
        if (['tester', 'testing', 'coach'].includes(role) && targetAthleteId !== requesterUserId) {
            const { athleteHasCoachUser } = require('../utils/athleteCoachAccess');
            const athlete = await User.findById(targetAthleteId).select('coachId coachIds pendingCoachId');
            if (!athlete) return res.status(404).json({ error: 'Athlete not found' });
            const hasPendingInviteFromRequester =
                String(athlete.pendingCoachId || '') === String(requesterUserId);
            if (!athleteHasCoachUser(athlete, requesterUserId) && !hasPendingInviteFromRequester) {
                return res.status(403).json({ error: 'You do not have permission to view these tests' });
            }
        }

        if (role === 'athlete' && targetAthleteId !== requesterUserId) {
            return res.status(403).json({ error: 'You do not have permission to view these tests' });
        }

        const tests = await testAbl.getTestsByAthleteId(targetAthleteId);
        res.status(200).json(tests);
    } catch (error) {
        console.error('Error fetching athlete tests (alias):', error);
        res.status(error.status || 500).json({ 
            error: error.error || 'Error fetching athlete tests' 
        });
    }
});

/**
 * @swagger
 * /api/tests:
 *   post:
 *     summary: Create a new test
 *     tags: [Tests]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Test'
 *     responses:
 *       201:
 *         description: Test created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Test'
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 */
/**
 * Lactate test creation is the marquee free-tier limit: Free users can have
 * exactly one test on file (matrix says "1 lactate test"). We count tests
 * that belong to the requester themselves; coaches creating tests FOR linked
 * athletes don't hit this gate (those count against the athlete's quota,
 * not the coach's). The gate bypasses for admins / manual premium / paid
 * plans automatically via resolveUserPlan().
 */
router.post(
  "/",
  verifyToken,
  // Counts across ALL test types (graded / VLaMax / CP) so the free "1 test"
  // cap can't be bypassed by creating one of each — see utils/testQuota.
  requireQuotaSlot('tests', countCurrentTests),
  async (req, res) => {
    try {
        const user = await User.findById(req.user.userId).select('role');
        const payload = { ...req.body };
        const requesterId = String(req.user.userId);
        const requesterRole = String(user?.role || '').toLowerCase();
        // Athletes can only create tests for themselves (ensures test is saved to current user after register+send)
        if (user && requesterRole === 'athlete') {
            payload.athleteId = String(req.user.userId);
        }

        // Coach/tester should only create tests for their own athletes (via athlete.coachId).
        if (user && ['coach', 'tester', 'testing'].includes(requesterRole)) {
            const requestedAthleteId = payload?.athleteId ? String(payload.athleteId) : null;
            if (!requestedAthleteId) {
                return res.status(400).json({ error: 'athleteId is required' });
            }

            const isTesterRole = requesterRole === 'tester' || requesterRole === 'testing';
            if (isTesterRole && requestedAthleteId === requesterId) {
                return res.status(403).json({ error: 'Select an assigned athlete to create tests' });
            }

            // Allow creating for self (rare, but consistent with isSelf permissions elsewhere)
            if (requestedAthleteId !== requesterId) {
                const { athleteHasCoachUser } = require('../utils/athleteCoachAccess');
                const athlete = await User.findById(requestedAthleteId).select('coachId coachIds pendingCoachId');
                if (!athlete) return res.status(404).json({ error: 'Athlete not found' });
                const hasPendingInviteFromRequester =
                    String(athlete.pendingCoachId || '') === String(requesterId);
                if (!athleteHasCoachUser(athlete, requesterId) && !hasPendingInviteFromRequester) {
                    return res.status(403).json({ error: 'You do not have permission to create tests for this athlete' });
                }
            }
        }
        // Normalize date so Mongoose accepts it (ISO string or Date)
        if (payload.date) {
            const d = new Date(payload.date);
            if (!isNaN(d.getTime())) payload.date = d;
        }
        // ── Subscription-plan test limit ──────────────────────────────────
        if (process.env.SUBSCRIPTION_ENABLED === 'true') {
            const fullUser = await User.findById(req.user.userId).populate('subscriptionId');
            const userRole = String(fullUser?.role || '').toLowerCase();
            const isAdmin  = userRole === 'admin' || fullUser?.admin === true;

            if (!isAdmin) {
                const plan = fullUser?.subscriptionId?.plan || 'free';
                // Coach plan and above have unlimited tests; pro has unlimited; free has 1
                const unlimitedPlans = ['pro', 'coach', 'team', 'enterprise'];
                if (!unlimitedPlans.includes(plan)) {
                    // free plan: 1 test total per athlete
                    const targetAthleteId = payload.athleteId || String(req.user.userId);
                    const existingCount = await Test.countDocuments({ athleteId: String(targetAthleteId) });
                    if (existingCount >= 1) {
                        return res.status(403).json({
                            error: 'FREE_PLAN_LIMIT',
                            feature: 'tests',
                            message: 'Free plan allows only 1 test. Upgrade to Pro for unlimited tests.',
                            upgradeUrl: '/settings?tab=subscription'
                        });
                    }
                }
            }
        }
        // ─────────────────────────────────────────────────────────────────

        const test = await testAbl.createTest(payload);
        console.log(`[Test] Test saved for user ${req.user.userId} → testId=${test._id}, sport=${test.sport}, title="${test.title}"`);
        res.status(201).json(test);
    } catch (error) {
        console.error(`[Test] Failed to save test for user ${req.user?.userId}:`, error.error || error.message);
        res.status(error.status || 400).json({ 
            error: error.error || 'Chyba při vytváření testu' 
        });
    }
});

/**
 * @swagger
 * /api/tests/{id}:
 *   put:
 *     summary: Update a test
 *     tags: [Tests]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Test ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Test'
 *     responses:
 *       200:
 *         description: Test updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Test'
 *       404:
 *         description: Test not found
 *       401:
 *         description: Unauthorized
 */
router.put("/:id", verifyToken, async (req, res) => {
    try {
        // H1 — ownership check: only the test owner (or coach/admin) may update
        const test = await Test.findById(req.params.id).lean();
        if (!test) return res.status(404).json({ error: 'Test nenalezen' });

        const requesterId = String(req.user.userId);
        const ownerId     = String(test.athleteId);
        const requester   = await User.findById(requesterId).lean();
        const role        = String(requester?.role || '').toLowerCase();
        const isPrivileged = ['admin', 'coach', 'tester', 'testing'].includes(role) || requester?.admin === true;

        if (!isPrivileged && requesterId !== ownerId) {
            return res.status(403).json({ error: 'Nemáte oprávnění upravit tento test' });
        }

        const updatedTest = await testAbl.updateTest(req.params.id, req.body);
        if (!updatedTest) {
            return res.status(404).json({ error: 'Test nenalezen' });
        }

        // Notify the other party when coach edits athlete's test or athlete edits own test — fire-and-forget
        ;(async () => {
          try {
            const actorName = `${requester.name} ${requester.surname}`.trim();
            const hasZones = req.body.powerZones || req.body.heartRateZones || req.body.thresholds;

            if (isPrivileged && requesterId !== ownerId) {
              // Coach updated athlete's test/zones → notify athlete
              if (hasZones) {
                await notifyAthlete(ownerId, {
                  type: 'zones_updated',
                  title: '📊 Your training zones were updated',
                  body: `${actorName} updated your zones based on your lactate test.`,
                  resourceId: String(updatedTest._id),
                  resourceType: 'test',
                  fromName: actorName,
                });
              }
            } else if (!isPrivileged || requesterId === ownerId) {
              // Athlete saved their own test → notify coaches
              await notifyCoachesOfAthlete(ownerId, {
                type: 'test_updated',
                title: '🧪 Lactate test updated',
                body: `${actorName} updated a lactate test.`,
                resourceId: String(updatedTest._id),
                resourceType: 'test',
                fromName: actorName,
              });
            }
          } catch (e) {
            console.error('[test PUT] notification error:', e.message);
          }
        })();

        res.json(updatedTest);
    } catch (error) {
        res.status(500).json({ error: 'Chyba při aktualizaci testu' });
    }
});

/**
 * @swagger
 * /api/tests/{id}:
 *   delete:
 *     summary: Delete a test
 *     tags: [Tests]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Test ID
 *     responses:
 *       200:
 *         description: Test deleted successfully
 *       404:
 *         description: Test not found
 *       401:
 *         description: Unauthorized
 */
router.delete("/:id", verifyToken, async (req, res) => {
    try {
        // H1 — ownership check: only the test owner (or coach/admin) may delete
        const test = await Test.findById(req.params.id).lean();
        if (!test) return res.status(404).json({ error: 'Test nenalezen' });

        const requesterId = String(req.user.userId);
        const ownerId     = String(test.athleteId);
        const requester   = await User.findById(requesterId).lean();
        const role        = String(requester?.role || '').toLowerCase();
        const isPrivileged = ['admin', 'coach', 'tester', 'testing'].includes(role) || requester?.admin === true;

        if (!isPrivileged && requesterId !== ownerId) {
            return res.status(403).json({ error: 'Nemáte oprávnění smazat tento test' });
        }

        const result = await testAbl.deleteTest(req.params.id);
        if (!result) {
            return res.status(404).json({ error: 'Test nenalezen' });
        }
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: 'Chyba při mazání testu' });
    }
});

/**
 * POST /api/test/:testId/ai-coach
 * Body: { sport?, language? }
 *
 * Returns:
 *   {
 *     anchor:     { value, source, confidence },
 *     protocol:   { stages: [...], summary, stageDurationS },
 *     training:   { sessions, totalHours, totalTss, sportMix, ... },
 *     narrative:  { headline, interpretation, recommendation } | null,
 *     narrativeError: string | null,   // when LLM call fails (key missing, etc.)
 *   }
 *
 * Replaces the older /protocol-suggestion + /training-context endpoints
 * (deleted). Single roundtrip; LLM call is server-side so the API key
 * never leaves the backend.
 *
 * Auth: same coach-scope rules as the GET test endpoint — test owner or
 * a linked coach can read.
 */
router.post('/:testId/ai-coach', verifyToken, async (req, res) => {
  try {
    const { testId } = req.params;
    const requester = await User.findById(req.user.userId);
    if (!requester) return res.status(404).json({ error: 'User not found' });

    const test = await Test.findById(testId).lean();
    if (!test) return res.status(404).json({ error: 'Test not found' });

    const athleteId = test.athleteId || test.userId || requester._id;

    // Coach-scope check — same rules as GET /test/:id
    const { athleteHasCoachUser } = require('../utils/athleteCoachAccess');
    const role = String(requester.role || '').toLowerCase();
    const isCoachLike = ['coach', 'tester', 'testing', 'admin'].includes(role) ||
      (requester.admin === true && role !== 'athlete');
    const isTestingRole = role === 'testing';
    let authorised = String(requester._id) === String(athleteId);
    if (!authorised && isTestingRole) {
      authorised = true;
    }
    if (!authorised && isCoachLike) {
      const athlete = await User.findById(athleteId).select('coachId coachIds pendingCoachId').lean();
      if (athlete && athleteHasCoachUser(athlete, requester._id)) {
        authorised = true;
      } else if (athlete && String(athlete.pendingCoachId || '') === String(requester._id)) {
        authorised = true;
      } else if (role === 'admin' || requester.admin === true) {
        authorised = true;
      }
    }
    if (!authorised) return res.status(403).json({ error: 'Not authorised' });

    const sport = String(req.body?.sport || test.sport || 'bike');
    const language = String(req.body?.language || 'en');

    // Pull activities + prior tests + athlete profile in parallel.
    const cutoff = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000); // 60-day window
    const StravaActivity = require('../models/StravaActivity');
    const FitTraining = require('../models/fitTraining');
    const Training = require('../models/training');

    const [stravaActs, fitActs, trainingActs, athleteProfile, priorTests] = await Promise.all([
      StravaActivity.find({ userId: athleteId, startDate: { $gte: cutoff } })
        .select('startDate sport elapsedTime movingTime distance averagePower weightedAveragePower averageHeartRate').lean(),
      FitTraining.find({ athleteId, startTime: { $gte: cutoff } })
        .select('startTime sport totalElapsedTime totalTimerTime totalDistance avgPower normalizedPower avgHeartRate trainingStressScore').lean(),
      Training.find({ athleteId: String(athleteId), date: { $gte: cutoff } })
        .select('date sport duration distance').lean(),
      User.findById(athleteId).select('powerZones runningZones maxHr restingHr ftp').lean(),
      Test.find({ $or: [{ athleteId }, { athleteId: String(athleteId) }], _id: { $ne: test._id } })
        .select('date sport ltPower lt2Power ltPace lt2Pace').lean().catch(() => []),
    ]);

    // Normalise activities into the shape the coach module expects
    const ftpProfile = athleteProfile?.powerZones?.cycling?.lt2 || athleteProfile?.powerZones?.cycling?.ftp || athleteProfile?.ftp || 0;
    const maxHr = athleteProfile?.maxHr || athleteProfile?.maxHeartRate || 0;
    const restHr = athleteProfile?.restingHr || 60;
    const tssGuess = (durS, np, avgHr, sportLow) => {
      if (durS <= 0) return 0;
      if (/ride|cycle|bike/.test(sportLow) && np > 0 && ftpProfile > 0) {
        return (durS * np * np) / (ftpProfile * ftpProfile * 3600) * 100;
      }
      if (avgHr > 0 && maxHr > restHr) {
        const hrr = Math.max(0, (avgHr - restHr) / (maxHr - restHr));
        return (durS / 3600) * hrr * hrr * 100;
      }
      return 0;
    };
    const activities = [];
    for (const a of stravaActs) {
      const date = a.startDate ? new Date(a.startDate) : null; if (!date) continue;
      const durS = Number(a.elapsedTime || a.movingTime || 0);
      const np = Number(a.weightedAveragePower || a.averagePower || 0);
      const sportLow = String(a.sport || '').toLowerCase();
      activities.push({
        date, sport: sportLow, durationS: durS, distanceM: Number(a.distance || 0),
        avgPower: Number(a.averagePower || 0), normalizedPower: np,
        avgHr: Number(a.averageHeartRate || 0),
        tss: tssGuess(durS, np, Number(a.averageHeartRate || 0), sportLow),
      });
    }
    for (const a of fitActs) {
      const date = a.startTime ? new Date(a.startTime) : null; if (!date) continue;
      const durS = Number(a.totalElapsedTime || a.totalTimerTime || 0);
      const np = Number(a.normalizedPower || a.avgPower || 0);
      const sportLow = String(a.sport || '').toLowerCase();
      activities.push({
        date, sport: sportLow, durationS: durS, distanceM: Number(a.totalDistance || 0),
        avgPower: Number(a.avgPower || 0), normalizedPower: np,
        avgHr: Number(a.avgHeartRate || 0),
        tss: Number(a.trainingStressScore || 0) || tssGuess(durS, np, Number(a.avgHeartRate || 0), sportLow),
      });
    }
    for (const t of trainingActs) {
      const date = t.date ? new Date(t.date) : null; if (!date) continue;
      activities.push({
        date, sport: String(t.sport || '').toLowerCase(),
        durationS: Number(t.duration || 0), distanceM: Number(t.distance || 0),
        avgPower: 0, normalizedPower: 0, avgHr: 0, tss: 0,
      });
    }

    // Prior test of same sport — most recent
    const sportLowTest = String(sport).toLowerCase();
    const samePriorTests = priorTests
      .filter((t) => {
        const ts = String(t.sport || '').toLowerCase();
        if (sportLowTest.includes('bike') || sportLowTest === 'cycling') return /ride|cycle|bike/.test(ts);
        if (sportLowTest.includes('run')) return /run/.test(ts);
        if (sportLowTest.includes('swim')) return /swim/.test(ts);
        return false;
      })
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    const priorTest = samePriorTests[0] ? {
      date: samePriorTests[0].date,
      lt2: samePriorTests[0].lt2Power || samePriorTests[0].lt2Pace || null,
    } : null;

    // Measured values from THIS test (if any)
    const measured = {
      lt1: test.thresholdOverrides?.LTP1 || test.ltPower || test.ltPace || null,
      lt2: test.thresholdOverrides?.LTP2 || test.lt2Power || test.lt2Pace || null,
      lt1Lactate: test.thresholdOverrides?.LTP1_lactate || null,
      lt2Lactate: test.thresholdOverrides?.LTP2_lactate || null,
      baseLactate: test.baseLactate || null,
    };

    const { buildAiCoachResponse } = require('../utils/aiTestCoach');
    const result = await buildAiCoachResponse({
      sport,
      measured,
      priorTest,
      activities,
      userProfile: athleteProfile,
      language,
    });

    res.json(result);
  } catch (err) {
    console.error('[ai-coach] error:', err?.message || err);
    res.status(500).json({ error: err?.message || 'Failed to build AI coach response' });
  }
});

module.exports = router;
