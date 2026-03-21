const testAbl = require('../abl/testAbl');
const { sendLactateTestReportEmail } = require('../services/lactateTestReportEmailService');
const { sendDemoTestEmail } = require('../services/demoTestEmailService');
const { generateTestReportPdf } = require('../services/lactateTestPdfService');
const fs = require('fs');
const path = require('path');

const debugLogPath = path.join(__dirname, '../../.cursor/debug-2e357f.log');
const appendDebugLog = (payload) => {
    try {
        fs.appendFileSync(debugLogPath, JSON.stringify(payload) + '\n');
    } catch {
        // ignore logging failures
    }
};

const testController = {
    // Get all tests for the authenticated user
    getTests: async (req, res) => {
        try {
            const User = require('../models/UserModel');
            const Test = require('../models/test');
            const user = await User.findById(req.user.userId);
            
            const role = String(user?.role || '').toLowerCase();
            const isTester = role === 'tester' || role === 'testing';
            if (user && isTester) {
                const t0 = Date.now();
                const athletes = await User.find({ coachId: user._id }).select('_id');
                const athleteIds = (athletes || []).map(a => String(a._id));
                // #region agent log
                appendDebugLog({
                    sessionId: '2e357f',
                    id: 'getTests',
                    timestamp: Date.now(),
                    hypothesisId: 'H4',
                    location: 'testController.getTests',
                    message: 'testing/tester listing tests for coachId athletes',
                    data: { role: user?.role, requesterUserId: req.user?.userId || null, athletesCount: athleteIds.length },
                });
                // #endregion
                const allTests = await Test.find({ athleteId: { $in: athleteIds } }).sort({ date: -1 });
                // #region agent log
                appendDebugLog({
                    sessionId: '2e357f',
                    id: 'getTests_count',
                    timestamp: Date.now(),
                    hypothesisId: 'H4',
                    location: 'testController.getTests',
                    message: 'tests count returned',
                    data: { count: Array.isArray(allTests) ? allTests.length : null, durationMs: Date.now() - t0 },
                });
                // #endregion
                return res.json(allTests);
            }
            
            const tests = await testAbl.getTestsByAthleteId(req.user.userId);
            res.json(tests);
        } catch (error) {
            res.status(error.status || 500).json({ 
                error: error.error || 'Error fetching tests' 
            });
        }
    },

    // Get a specific test by ID
    getTestById: async (req, res) => {
        try {
            const User = require('../models/UserModel');
            const user = await User.findById(req.user.userId);
            if (!user) {
                return res.status(404).json({ error: 'User not found' });
            }

            const test = await testAbl.getTestById(req.params.id);
            if (!test) {
                return res.status(404).json({ error: 'Test not found' });
            }

            // Check permissions: test must belong to current user or their athlete
            const testAthleteId = String(test.athleteId);
            const currentUserId = String(user._id);
            const isOwnTest = testAthleteId === currentUserId;
            const role = String(user.role || '').toLowerCase();
            const isCoachLike = role === 'coach' || role === 'tester' || role === 'testing';
            const isTesterRole = role === 'tester' || role === 'testing';
            const isAdmin = role === 'admin';
            const isOwnAllowed = isOwnTest && !isTesterRole;

            // Coach/tester/testing can view tests only for their own athletes; admin can view all.
            let isAthleteTest = false;
            if (isCoachLike && !isOwnTest) {
                const athlete = await User.findById(testAthleteId);
                if (athlete && athlete.coachId && String(athlete.coachId) === currentUserId) {
                    isAthleteTest = true;
                }
            }

            if (!isOwnAllowed && !isAthleteTest && !isAdmin) {
                return res.status(403).json({ error: 'You do not have permission to view this test' });
            }

            res.json(test);
        } catch (error) {
            console.error('Error in getTestById:', error);
            if (error.status) {
                return res.status(error.status).json({ error: error.error || 'Error fetching test' });
            }
            res.status(500).json({ error: 'Error fetching test' });
        }
    },

    // Create a new test
    createTest: async (req, res) => {
        try {
            const test = await testAbl.createTest(req.body);
            res.status(201).json(test);
        } catch (error) {
            res.status(error.status || 400).json({ 
                error: error.error || 'Error creating test' 
            });
        }
    },

    // Update a test
    updateTest: async (req, res) => {
        try {
            const updatedTest = await testAbl.updateTest(req.params.id, req.body);
            if (!updatedTest) {
                return res.status(404).json({ error: 'Test not found' });
            }
            res.json(updatedTest);
        } catch (error) {
            res.status(500).json({ error: 'Error updating test' });
        }
    },

    // Delete a test
    deleteTest: async (req, res) => {
        try {
            const result = await testAbl.deleteTest(req.params.id);
            if (!result) {
                return res.status(404).json({ error: 'Test not found' });
            }
            res.status(204).send();
        } catch (error) {
            res.status(500).json({ error: 'Error deleting test' });
        }
    },

    // Send lactate test report to email (HTML + inline SVG)
    sendTestReportEmail: async (req, res) => {
        try {
            const { id } = req.params;
            const toEmail = req.body?.toEmail || null;
            const overrides = req.body?.overrides || null;

            const result = await sendLactateTestReportEmail({
                requesterUserId: req.user.userId,
                testId: id,
                toEmail,
                overrides
            });

            if (!result.sent) {
                const reason = result.reason || 'send_failed';
                const status =
                    reason === 'forbidden' ? 403 :
                    reason === 'test_not_found' ? 404 :
                    reason === 'email_not_configured' ? 503 :
                    400;
                return res.status(status).json({ sent: false, reason });
            }

            return res.json({ sent: true });
        } catch (error) {
            console.error('[TestController] sendTestReportEmail error:', error);
            return res.status(500).json({ sent: false, error: 'Failed to send email' });
        }
    },

    // Generate and download PDF report (same content as email, incl. previous test comparison)
    getTestReportPdf: async (req, res) => {
        try {
            const { id } = req.params;
            const overrides = req.body?.overrides || {};
            const t0 = Date.now();
            // #region agent log
            appendDebugLog({
                sessionId: '2e357f',
                id: 'reportPdf_start',
                timestamp: Date.now(),
                hypothesisId: 'H5',
                location: 'testController.getTestReportPdf',
                message: 'report-pdf request start',
                data: {
                    requesterUserRole: req.user?.role || null,
                    requesterUserId: req.user?.userId || null,
                    testId: id,
                    hasOverrides: Boolean(overrides),
                    overridesInputMode: overrides?.inputMode || null,
                    overridesUnitSystem: overrides?.unitSystem || null,
                },
            });
            // #endregion
            const result = await generateTestReportPdf(req.user.userId, id, overrides);
            if (result.error) {
                const status =
                    result.reason === 'forbidden' ? 403 :
                    result.reason === 'test_not_found' ? 404 :
                    result.reason === 'pdf_not_available' || result.reason === 'pdf_generation_failed' ? 503 :
                    400;
                // #region agent log
                appendDebugLog({
                    sessionId: '2e357f',
                    id: 'reportPdf_error',
                    timestamp: Date.now(),
                    hypothesisId: 'H5',
                    location: 'testController.getTestReportPdf',
                    message: 'report-pdf failed',
                    data: { testId: id, reason: result.reason, status, durationMs: Date.now() - t0 },
                });
                // #endregion
                return res.status(status).json({ error: result.reason, message: result.message || result.reason });
            }
            if (!result.pdf || !Buffer.isBuffer(result.pdf)) {
                // #region agent log
                appendDebugLog({
                    sessionId: '2e357f',
                    id: 'reportPdf_no_buffer',
                    timestamp: Date.now(),
                    hypothesisId: 'H5',
                    location: 'testController.getTestReportPdf',
                    message: 'PDF buffer missing',
                    data: { testId: id, durationMs: Date.now() - t0 },
                });
                // #endregion
                return res.status(503).json({ error: 'pdf_generation_failed', message: 'PDF buffer missing' });
            }
            const filename = `lactate-report-${id}.pdf`;
            // #region agent log
            appendDebugLog({
                sessionId: '2e357f',
                id: 'reportPdf_success',
                timestamp: Date.now(),
                hypothesisId: 'H5',
                location: 'testController.getTestReportPdf',
                message: 'report-pdf generated',
                data: { testId: id, bytes: result.pdf?.length || null, durationMs: Date.now() - t0 },
            });
            // #endregion
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Length', result.pdf.length);
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            res.end(result.pdf);
        } catch (error) {
            console.error('[TestController] getTestReportPdf error:', error);
            // #region agent log
            appendDebugLog({
                sessionId: '2e357f',
                id: 'reportPdf_exception',
                timestamp: Date.now(),
                hypothesisId: 'H5',
                location: 'testController.getTestReportPdf',
                message: 'report-pdf exception',
                data: { testId: req.params?.id || null },
            });
            // #endregion
            return res.status(503).json({ error: 'pdf_generation_failed', message: 'PDF generation is not available on this server.' });
        }
    },

    // Send demo test results to email (no authentication required)
    sendDemoTestEmail: async (req, res) => {
        try {
            const { testData, email, name, userId } = req.body;

            if (!testData || !email) {
                return res.status(400).json({ 
                    sent: false, 
                    error: 'Test data and email are required' 
                });
            }

            // Validate email format
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                return res.status(400).json({ 
                    sent: false, 
                    error: 'Invalid email format' 
                });
            }

            const result = await sendDemoTestEmail({
                testData,
                email,
                name: name || 'User',
                userId: userId || null
            });

            if (!result.sent) {
                const reason = result.reason || 'send_failed';
                const status =
                    reason === 'email_not_configured' ? 503 :
                    400;
                return res.status(status).json({ sent: false, reason });
            }

            return res.json({ sent: true });
        } catch (error) {
            console.error('[TestController] sendDemoTestEmail error:', error);
            return res.status(500).json({ sent: false, error: 'Failed to send email' });
        }
    }
};

module.exports = testController; 