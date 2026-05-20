const express = require("express");
const router = express.Router();
const rateLimit = require('express-rate-limit');
const testAbl = require("../abl/testAbl");
const verifyToken = require("../middleware/verifyToken");
const testController = require('../controllers/testController');
const Test = require('../models/test');
const User = require('../models/UserModel');
const { notifyCoachesOfAthlete, notifyAthlete } = require('../utils/notificationHelper');

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
 * Get population statistics for LT1, LT2, and LT1/LT2 ratio by gender and sport
 * IMPORTANT: This must be defined BEFORE /:id route to avoid matching "population-stats" as an ID
 */
router.get("/population-stats", verifyToken, async (req, res) => {
    try {
        const User = require('../models/UserModel');
        const { gender, sport } = req.query; // gender: 'male' | 'female', sport: 'bike' | 'run'
        
        // Build filter
        const filter = { 
            role: 'athlete',
            isActive: { $ne: false }
        };
        if (gender) {
            filter.gender = gender;
        }
        
        // Get all athletes with powerZones and weight
        const athletes = await User.find(filter).select('powerZones gender weight');
        
        // Helper function to calculate statistics
        const calculateStats = (values) => {
            if (!values || values.length === 0) return null;
            
            const sorted = [...values].sort((a, b) => a - b);
            const count = sorted.length;
            const sum = sorted.reduce((a, b) => a + b, 0);
            const mean = sum / count;
            
            // Standard deviation
            const variance = sorted.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / count;
            const sd = Math.sqrt(variance);
            
            // Percentiles
            const percentile = (arr, p) => {
                const index = (p / 100) * (arr.length - 1);
                const lower = Math.floor(index);
                const upper = Math.ceil(index);
                const weight = index - lower;
                if (lower === upper) return arr[lower];
                return arr[lower] * (1 - weight) + arr[upper] * weight;
            };
            
            const min = sorted[0];
            const max = sorted[sorted.length - 1];
            const median = percentile(sorted, 50);
            const p25 = percentile(sorted, 25);
            const p75 = percentile(sorted, 75);
            
            // Bell curve distribution (for visualization)
            const bins = 20;
            const binWidth = (max - min) / bins;
            const distribution = Array(bins).fill(0);
            sorted.forEach(val => {
                const binIndex = Math.min(Math.floor((val - min) / binWidth), bins - 1);
                distribution[binIndex]++;
            });
            
            return {
                count,
                mean: Number(mean.toFixed(2)),
                median: Number(median.toFixed(2)),
                sd: Number(sd.toFixed(2)),
                min: Number(min.toFixed(2)),
                max: Number(max.toFixed(2)),
                p25: Number(p25.toFixed(2)),
                p75: Number(p75.toFixed(2)),
                distribution: distribution.map(count => Number((count / sorted.length * 100).toFixed(1)))
            };
        };
        
        // Extract data for bike and run
        const bikeData = {
            lt1: [],
            lt2: [],
            lt1Lt2Ratio: [],
            lt1Wkg: [],
            lt2Wkg: []
        };
        
        const runData = {
            lt1: [],
            lt2: [],
            lt1Lt2Ratio: []
        };
        
        athletes.forEach(athlete => {
            // Bike data
            if (athlete.powerZones?.cycling) {
                const cycling = athlete.powerZones.cycling;
                if (cycling.lt1 && cycling.lt2) {
                    bikeData.lt1.push(cycling.lt1);
                    bikeData.lt2.push(cycling.lt2);
                    bikeData.lt1Lt2Ratio.push(cycling.lt1 / cycling.lt2);
                    
                    // W/kg calculations (only if weight is available)
                    if (athlete.weight && athlete.weight > 0) {
                        bikeData.lt1Wkg.push(cycling.lt1 / athlete.weight);
                        bikeData.lt2Wkg.push(cycling.lt2 / athlete.weight);
                    }
                }
            }
            
            // Run data
            if (athlete.powerZones?.running) {
                const running = athlete.powerZones.running;
                if (running.lt1 && running.lt2) {
                    runData.lt1.push(running.lt1);
                    runData.lt2.push(running.lt2);
                    runData.lt1Lt2Ratio.push(running.lt1 / running.lt2);
                }
            }
        });
        
        // Filter by sport if specified
        const result = {};
        if (!sport || sport === 'bike') {
            result.bike = {
                lt1: calculateStats(bikeData.lt1),
                lt2: calculateStats(bikeData.lt2),
                lt1Lt2Ratio: calculateStats(bikeData.lt1Lt2Ratio),
                lt1Wkg: calculateStats(bikeData.lt1Wkg),
                lt2Wkg: calculateStats(bikeData.lt2Wkg)
            };
        }
        if (!sport || sport === 'run') {
            result.run = {
                lt1: calculateStats(runData.lt1),
                lt2: calculateStats(runData.lt2),
                lt1Lt2Ratio: calculateStats(runData.lt1Lt2Ratio)
            };
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
router.post("/", verifyToken, async (req, res) => {
    try {
        const User = require('../models/UserModel');
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
        // ── Free-plan test limit ───────────────────────────────────────────
        if (process.env.SUBSCRIPTION_ENABLED === 'true') {
            const { resolvePremiumForUserDocument } = require('../utils/premiumAccess');
            const fullUser = await User.findById(req.user.userId);
            const { isPremium } = await resolvePremiumForUserDocument(fullUser);
            if (!isPremium) {
                const targetAthleteId = payload.athleteId || String(req.user.userId);
                const existingCount = await Test.countDocuments({ athleteId: String(targetAthleteId) });
                if (existingCount >= 1) {
                    return res.status(403).json({
                        error: 'FREE_PLAN_LIMIT',
                        feature: 'tests',
                        message: 'Free plan allows only 1 test. Upgrade to Pro for unlimited tests.'
                    });
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
 * GET /api/test/:athleteId/training-context?testDate=YYYY-MM-DD&days=28
 *
 * Aggregates the athlete's training load in the N days BEFORE a given
 * lactate test date. Used by the test detail page to show context for
 * what the athlete actually did in the weeks leading up to the test —
 * the missing piece sport scientists (e.g. test centres) need to
 * interpret threshold drift between consecutive tests.
 *
 * Returns:
 *   {
 *     window: { from, to, days },
 *     totals: { sessions, hours, distanceKm, tss, tssHr, lactateSessions, races },
 *     daily:  [{ date, tss, hours }],   // for CTL/ATL sparkline
 *     ctl:    [{ date, value }],        // 42-day exponential rolling
 *     atl:    [{ date, value }],        // 7-day exponential rolling
 *     ctlNow, atlNow, tsbNow,           // values at the test date
 *   }
 */
router.get('/:athleteId/training-context', verifyToken, async (req, res) => {
  try {
    const { athleteId } = req.params;
    const requester = await User.findById(req.user.userId);
    if (!requester) return res.status(404).json({ error: 'User not found' });

    // Auth: caller can read their own context, or a coach can read a
    // linked athlete's context. Mirror the existing /test/list/:athleteId
    // permission rule rather than inventing a new one.
    const role = String(requester.role || '').toLowerCase();
    const isCoachLike = ['coach', 'tester', 'testing', 'admin'].includes(role) ||
      (requester.admin === true && role !== 'athlete');
    let isOwnerOrAuthorised = String(requester._id) === String(athleteId);
    if (!isOwnerOrAuthorised && isCoachLike) {
      const athlete = await User.findById(athleteId).select('coaches').lean();
      if (athlete && Array.isArray(athlete.coaches) &&
          athlete.coaches.some((c) => String(c) === String(requester._id))) {
        isOwnerOrAuthorised = true;
      } else if (role === 'admin') {
        isOwnerOrAuthorised = true;
      }
    }
    if (!isOwnerOrAuthorised) {
      return res.status(403).json({ error: 'Not authorised' });
    }

    const days = Math.max(7, Math.min(90, Number(req.query.days) || 28));
    const testDateStr = String(req.query.testDate || '');
    const testDate = testDateStr ? new Date(testDateStr) : new Date();
    if (!Number.isFinite(testDate.getTime())) {
      return res.status(400).json({ error: 'Invalid testDate' });
    }
    const fromDate = new Date(testDate.getTime() - days * 24 * 60 * 60 * 1000);
    // We pull a 70-day window so CTL (42-day chronic load) has enough
    // history to be meaningful at the start of the displayed range.
    const ctlLookback = 70;
    const ctlFromDate = new Date(testDate.getTime() - (days + ctlLookback) * 24 * 60 * 60 * 1000);

    // Pull from all three activity sources in parallel. Each is filtered
    // to the athlete and the date window. We deliberately accept a small
    // amount of over-count between Strava+FIT (when an activity exists in
    // both) — averaging them isn't worth the complexity for this widget.
    const StravaActivity = require('../models/StravaActivity');
    const FitTraining = require('../models/fitTraining');
    const Training = require('../models/training');

    const [stravaActs, fitActs, trainingActs, athleteProfile] = await Promise.all([
      StravaActivity.find({
        userId: athleteId,
        startDate: { $gte: ctlFromDate, $lte: testDate },
      }).select('startDate elapsedTime movingTime distance sport averagePower averageHeartRate weightedAveragePower category raw').lean(),
      FitTraining.find({
        athleteId: athleteId,
        startTime: { $gte: ctlFromDate, $lte: testDate },
      }).select('startTime totalElapsedTime totalTimerTime totalDistance sport avgPower avgHeartRate normalizedPower trainingStressScore category').lean(),
      Training.find({
        athleteId: String(athleteId),
        date: { $gte: ctlFromDate, $lte: testDate },
      }).select('date duration distance sport title results').lean(),
      User.findById(athleteId).select('powerZones runningZones maxHr restingHr ftp').lean(),
    ]);

    const ftp = athleteProfile?.powerZones?.cycling?.lt2 || athleteProfile?.powerZones?.cycling?.ftp || athleteProfile?.ftp || 0;
    const thresholdPace = athleteProfile?.runningZones?.lt2 || 0;
    const maxHr = athleteProfile?.maxHr || athleteProfile?.maxHeartRate || 0;
    const restHr = athleteProfile?.restingHr || 60;

    // Normalize each source into a common shape: { date, duration, distance, sport, tss, isRace, isLactate }.
    const items = [];

    for (const a of stravaActs) {
      const date = a.startDate ? new Date(a.startDate) : null;
      if (!date) continue;
      const sport = String(a.sport || '').toLowerCase();
      const dur = Number(a.elapsedTime || a.movingTime || 0);
      const dist = Number(a.distance || 0);
      const np = Number(a.weightedAveragePower || a.averagePower || 0);
      const avgHr = Number(a.averageHeartRate || 0);
      let tss = 0;
      if ((sport.includes('ride') || sport.includes('cycle') || sport.includes('bike')) && np > 0 && ftp > 0) {
        tss = (dur * np * np) / (ftp * ftp * 3600) * 100;
      } else if (avgHr > 0 && maxHr > restHr) {
        const hrr = Math.max(0, (avgHr - restHr) / (maxHr - restHr));
        tss = (dur / 3600) * hrr * hrr * 100;
      }
      const name = String(a.raw?.name || '').toLowerCase();
      const isRace = a.raw?.workout_type === 1 || name.includes('race') || name.includes('závod');
      items.push({ date, duration: dur, distance: dist, sport, tss, isRace, isLactate: false });
    }

    for (const a of fitActs) {
      const date = a.startTime ? new Date(a.startTime) : null;
      if (!date) continue;
      const sport = String(a.sport || '').toLowerCase();
      const dur = Number(a.totalElapsedTime || a.totalTimerTime || 0);
      const dist = Number(a.totalDistance || 0);
      let tss = Number(a.trainingStressScore || 0);
      if (tss === 0) {
        const np = Number(a.normalizedPower || a.avgPower || 0);
        const avgHr = Number(a.avgHeartRate || 0);
        if ((sport.includes('ride') || sport.includes('cycle') || sport.includes('bike')) && np > 0 && ftp > 0) {
          tss = (dur * np * np) / (ftp * ftp * 3600) * 100;
        } else if (avgHr > 0 && maxHr > restHr) {
          const hrr = Math.max(0, (avgHr - restHr) / (maxHr - restHr));
          tss = (dur / 3600) * hrr * hrr * 100;
        }
      }
      items.push({ date, duration: dur, distance: dist, sport, tss, isRace: false, isLactate: false });
    }

    for (const t of trainingActs) {
      const date = t.date ? new Date(t.date) : null;
      if (!date) continue;
      const dur = Number(t.duration || 0);
      const dist = Number(t.distance || 0);
      const sport = String(t.sport || '').toLowerCase();
      // Manual training: usually has lactate measurements in its results
      const hasLactate = Array.isArray(t.results) && t.results.some(r => Number(r?.lactate) > 0);
      items.push({ date, duration: dur, distance: dist, sport, tss: 0, isRace: false, isLactate: hasLactate });
    }

    // Bucket per day for the sparkline.
    const bucketKey = (d) => d.toISOString().slice(0, 10);
    const daysMap = new Map();
    for (const it of items) {
      const k = bucketKey(it.date);
      if (!daysMap.has(k)) daysMap.set(k, { date: k, tss: 0, hours: 0 });
      const bucket = daysMap.get(k);
      bucket.tss += it.tss || 0;
      bucket.hours += (it.duration || 0) / 3600;
    }

    // Fill missing days so the sparkline has a uniform x-axis.
    const dayList = [];
    for (let d = new Date(ctlFromDate); d <= testDate; d.setUTCDate(d.getUTCDate() + 1)) {
      const k = d.toISOString().slice(0, 10);
      dayList.push(daysMap.get(k) || { date: k, tss: 0, hours: 0 });
    }

    // CTL (42-day exponentially-weighted) + ATL (7-day) on TSS.
    const ctl = [];
    const atl = [];
    const tauC = 42;
    const tauA = 7;
    let ctlV = 0, atlV = 0;
    for (const d of dayList) {
      ctlV = ctlV + (d.tss - ctlV) * (1 - Math.exp(-1 / tauC));
      atlV = atlV + (d.tss - atlV) * (1 - Math.exp(-1 / tauA));
      ctl.push({ date: d.date, value: Number(ctlV.toFixed(1)) });
      atl.push({ date: d.date, value: Number(atlV.toFixed(1)) });
    }
    const ctlNow = ctl[ctl.length - 1]?.value || 0;
    const atlNow = atl[atl.length - 1]?.value || 0;
    const tsbNow = Number((ctlNow - atlNow).toFixed(1));

    // Totals for the SHORTER (display) window only — typically last 28 days.
    const displayItems = items.filter(it => it.date >= fromDate && it.date <= testDate);
    const displayDays = dayList.filter(d => d.date >= bucketKey(fromDate));
    const totals = {
      sessions: displayItems.length,
      hours: Number(displayDays.reduce((s, d) => s + d.hours, 0).toFixed(1)),
      distanceKm: Number((displayItems.reduce((s, it) => s + (it.distance || 0), 0) / 1000).toFixed(1)),
      tss: Math.round(displayDays.reduce((s, d) => s + d.tss, 0)),
      lactateSessions: displayItems.filter(it => it.isLactate).length,
      races: displayItems.filter(it => it.isRace).length,
    };

    res.json({
      window: {
        from: fromDate.toISOString().slice(0, 10),
        to: testDate.toISOString().slice(0, 10),
        days,
      },
      totals,
      daily: displayDays,
      ctl: ctl.filter(c => c.date >= bucketKey(fromDate)),
      atl: atl.filter(a => a.date >= bucketKey(fromDate)),
      ctlNow,
      atlNow,
      tsbNow,
    });
  } catch (err) {
    console.error('[training-context] error:', err?.message || err);
    res.status(500).json({ error: err?.message || 'Failed to compute training context' });
  }
});

module.exports = router;
