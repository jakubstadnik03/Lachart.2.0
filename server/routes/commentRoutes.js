const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const verifyToken = require('../middleware/verifyToken');
const User = require('../models/UserModel');
const TestComment = require('../models/TestComment');
const Test = require('../models/test');
const TrainingComment = require('../models/TrainingComment');
const Notification = require('../models/Notification');
const Training = require('../models/training');
const FitTraining = require('../models/fitTraining');
const PlannedWorkout = require('../models/PlannedWorkout');
const { createEmailTransporter } = require('../utils/createEmailTransporter');
const { getClientUrl } = require('../utils/emailTemplate');
const { sendNotification } = require('../utils/notificationHelper');
const { normalizeSportForNotif } = require('../utils/sportNotif');

// GET /api/comments/test/:testId
// Get all comments for a test (auth required, only coach or the athlete who owns the test)
router.get('/test/:testId', verifyToken, async (req, res) => {
  try {
    const { testId } = req.params;
    const userId = req.user.userId;

    const test = await Test.findById(testId);
    if (!test) {
      return res.status(404).json({ error: 'Test not found' });
    }

    // Check permission: allow if user is the athlete who owns the test OR a coach/admin
    const user = await User.findById(userId).select('role');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const isOwner = String(test.athleteId) === String(userId);
    const isCoachOrAdmin = user.role === 'coach' || user.role === 'admin';

    if (!isOwner && !isCoachOrAdmin) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const comments = await TestComment.find({ testId }).sort({ createdAt: 1 });
    return res.status(200).json(comments);
  } catch (err) {
    console.error('GET /api/comments/test/:testId error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/comments/test/:testId
// Add a comment to a test (auth required)
router.post('/test/:testId', verifyToken, async (req, res) => {
  try {
    const { testId } = req.params;
    const userId = req.user.userId;
    const { text } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Comment text is required' });
    }

    const test = await Test.findById(testId);
    if (!test) {
      return res.status(404).json({ error: 'Test not found' });
    }

    const user = await User.findById(userId).select('name surname role');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Only coach, athlete, and admin roles are allowed
    const allowedRoles = ['coach', 'athlete', 'admin'];
    if (!allowedRoles.includes(user.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const comment = new TestComment({
      testId,
      authorId: userId,
      authorName: `${user.name} ${user.surname}`.trim(),
      authorRole: user.role,
      text: text.trim(),
    });

    await comment.save();

    // ── Notify the other party (fire-and-forget) ─────────────────────────
    (async () => {
      try {
        const authorName = `${user.name} ${user.surname}`.trim();
        const notifBody = text.trim().slice(0, 100);
        let recipientIds = [];

        if (user.role === 'athlete') {
          // Notify coaches of this athlete
          const athlete = await User.findById(userId).select('coachIds coachId').lean();
          const ids = [
            ...(Array.isArray(athlete?.coachIds) ? athlete.coachIds.map(String) : []),
            ...(athlete?.coachId ? [String(athlete.coachId)] : []),
          ].filter(id => id && mongoose.Types.ObjectId.isValid(id));
          recipientIds = [...new Set(ids)];
        } else {
          // Coach/admin → notify the athlete who owns the test
          if (test.athleteId && mongoose.Types.ObjectId.isValid(String(test.athleteId))) {
            recipientIds = [String(test.athleteId)];
          }
        }

        if (recipientIds.length > 0) {
          // Build a title that includes the test date/sport if available
          const testLabel = test.date
            ? `lactate test (${new Date(test.date).toLocaleDateString('en', { day: 'numeric', month: 'short' })})`
            : 'lactate test';
          const notifTitle = user.role === 'athlete'
            ? `${authorName} commented on their ${testLabel}`
            : `${authorName} commented on your ${testLabel}`;

          await sendNotification(recipientIds, {
            type: 'test_comment',
            title: notifTitle,
            body: text.trim().slice(0, 120),
            resourceId: testId,
            resourceType: 'test',
            fromName: authorName,
            pushData: { testId, commentId: String(comment._id) },
          });
        }
      } catch (e) {
        console.error('[TestComment] notification error:', e.message);
      }
    })();

    return res.status(201).json(comment);
  } catch (err) {
    console.error('POST /api/comments/test/:testId error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// DELETE /api/comments/:commentId
// Delete a comment (only the author or a coach/admin)
router.delete('/:commentId', verifyToken, async (req, res) => {
  try {
    const { commentId } = req.params;
    const userId = req.user.userId;

    const comment = await TestComment.findById(commentId);
    if (!comment) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    const user = await User.findById(userId).select('role');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const isAuthor = String(comment.authorId) === String(userId);
    const isCoachOrAdmin = user.role === 'coach' || user.role === 'admin';

    if (!isAuthor && !isCoachOrAdmin) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await TestComment.findByIdAndDelete(commentId);
    return res.status(200).json({ message: 'Comment deleted successfully' });
  } catch (err) {
    console.error('DELETE /api/comments/:commentId error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── Training Comments ───────────────────────────────────────────────────────

// GET /api/comments/training/counts?ids=id1,id2,...
// Batch count comments for multiple training IDs
router.get('/training/counts', verifyToken, async (req, res) => {
  try {
    const { ids } = req.query;
    if (!ids) return res.status(200).json({});
    const idList = ids.split(',').map(s => s.trim()).filter(Boolean);
    if (idList.length === 0) return res.status(200).json({});

    const counts = await TrainingComment.aggregate([
      { $match: { trainingId: { $in: idList } } },
      { $group: { _id: '$trainingId', count: { $sum: 1 } } }
    ]);

    const result = {};
    counts.forEach(c => { result[c._id] = c.count; });
    return res.status(200).json(result);
  } catch (err) {
    console.error('GET /api/comments/training/counts error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/comments/training/:trainingId
router.get('/training/:trainingId', verifyToken, async (req, res) => {
  try {
    const { trainingId } = req.params;
    const userId = req.user.userId;

    const user = await User.findById(userId).select('role');
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Allow owner athlete OR any coach/admin — we just check role here; owner check done on write
    if (!['coach', 'admin', 'athlete'].includes(user.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const comments = await TrainingComment.find({ trainingId }).sort({ createdAt: 1 });
    return res.status(200).json(comments);
  } catch (err) {
    console.error('GET /api/comments/training/:trainingId error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/comments/training/:trainingId
router.post('/training/:trainingId', verifyToken, async (req, res) => {
  try {
    const { trainingId } = req.params;
    const userId = req.user.userId;
    const { text, trainingType = 'training' } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Comment text is required' });
    }

    const user = await User.findById(userId).select('name surname role coachIds avatar');
    if (!user) return res.status(404).json({ error: 'User not found' });

    const allowedRoles = ['coach', 'athlete', 'admin'];
    if (!allowedRoles.includes(user.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const authorName = `${user.name} ${user.surname}`.trim();

    const comment = new TrainingComment({
      trainingId,
      trainingType,
      authorId: userId,
      authorName,
      authorRole: user.role,
      authorAvatar: user.avatar || null,
      text: text.trim(),
    });
    await comment.save();

    // ── Create in-app notifications (fire-and-forget – never block the response) ──
    (async () => {
      try {
        const notifBody = text.trim().slice(0, 100);

        // ── Resolve training doc → title + sport + athleteId + resourceType ──
        // 'fitTraining' → 'fit' so handleNotifClick can build the correct target.
        let trainingDoc  = null;
        let resourceType = trainingType; // default: keep as-is (e.g. 'strava')
        if (trainingType === 'fitTraining' || trainingType === 'fit') {
          if (mongoose.Types.ObjectId.isValid(trainingId)) {
            trainingDoc = await FitTraining.findById(trainingId)
              .select('sport athleteId titleManual titleAuto originalFileName').lean();
          }
          resourceType = 'fit';
        } else if (trainingType === 'training') {
          if (mongoose.Types.ObjectId.isValid(trainingId)) {
            trainingDoc = await Training.findById(trainingId)
              .select('sport athleteId title').lean();
          }
        } else if (trainingType === 'planned') {
          if (mongoose.Types.ObjectId.isValid(trainingId)) {
            trainingDoc = await PlannedWorkout.findById(trainingId)
              .select('sport athleteId title').lean();
          }
          resourceType = 'planned';
        } else if (trainingType === 'race') {
          if (mongoose.Types.ObjectId.isValid(trainingId)) {
            const RaceEvent = require('../models/RaceEvent');
            trainingDoc = await RaceEvent.findById(trainingId)
              .select('sport athleteId name').lean();
            if (trainingDoc && !trainingDoc.title) trainingDoc.title = trainingDoc.name;
          }
          resourceType = 'race';
        }
        const rawSport   = trainingDoc?.sport || null;
        const notifSport = normalizeSportForNotif(rawSport);

        // Resolve training title — prefer manual > auto > filename > fallback
        const trainingTitle =
          trainingDoc?.titleManual ||
          trainingDoc?.title ||
          trainingDoc?.titleAuto ||
          trainingDoc?.originalFileName ||
          null;

        // ── Build recipient list ──────────────────────────────────────────────
        let recipientIds = [];

        if (user.role === 'athlete') {
          // Notify each coach on this athlete's coachIds list
          const coachIdList = (user.coachIds || [])
            .map(String)
            .filter(id => mongoose.Types.ObjectId.isValid(id));
          if (coachIdList.length > 0) recipientIds = coachIdList;
        } else {
          // Coach/admin commenting → notify the athlete who owns the training
          let athleteId = trainingDoc ? String(trainingDoc.athleteId || '') : null;

          // Strava/unknown IDs — no ObjectId lookup available, skip silently
          if (athleteId && mongoose.Types.ObjectId.isValid(athleteId)) {
            recipientIds = [athleteId];
          }
        }

        if (recipientIds.length === 0) return;

        // ── Notification texts ────────────────────────────────────────────────
        // Title: "Coach Name commented on Morning Run" (or generic fallback)
        const isAthleteCommenting = user.role === 'athlete';
        const trainingLabel = trainingTitle ? `"${trainingTitle}"` : 'your training';
        const notifTitle = isAthleteCommenting
          ? `${authorName} commented on their training`
          : `${authorName} commented on ${trainingLabel}`;

        // Body: first 120 chars of the comment text
        const notifBodyText = text.trim().slice(0, 120);

        // In-app notification + Expo push (handled together by sendNotification)
        await sendNotification(recipientIds, {
          type: 'training_comment',
          title: notifTitle,
          body: notifBodyText,
          resourceId: trainingId,
          resourceType,
          fromName: authorName,
          sport: notifSport,
          // commentId lets the app scroll to / highlight the specific comment
          pushData: trainingType === 'race'
            ? {
                trainingId,
                trainingType,
                commentId: String(comment._id),
                raceId: trainingId,
              }
            : trainingType === 'planned'
            ? {
                trainingId,
                trainingType,
                commentId: String(comment._id),
                openPlanned: trainingId,
              }
            : {
                trainingId,
                trainingType,
                commentId: String(comment._id),
                openActivity: `${trainingType === 'strava' ? 'strava' : trainingType === 'fit' || trainingType === 'fitTraining' ? 'fit' : 'regular'}-${trainingId}`,
              },
        });

        // ── Send email notifications ────────────────────────────────────────
        const recipients = await User.find({ _id: { $in: recipientIds } })
          .select('email name notifications');

        const CLIENT_URL = getClientUrl();
        const transporter = await createEmailTransporter().catch(() => null);

        for (const recipient of recipients) {
          const prefs = recipient.notifications || {};
          if (prefs.trainingComments === false) continue;
          if (prefs.emailNotifications === false) continue;
          if (!transporter) continue;
          try {
            await transporter.sendMail({
              to: recipient.email,
              subject: '💬 New comment on your training – LaChart',
              html: `
                <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#f9fafb;border-radius:12px;">
                  <h2 style="color:#767EB5;margin-bottom:8px;">New comment on your training</h2>
                  <p style="color:#374151;margin-bottom:16px;">
                    <strong>${authorName}</strong> left a comment:
                  </p>
                  <blockquote style="background:#fff;border-left:4px solid #767EB5;padding:12px 16px;border-radius:0 8px 8px 0;color:#1f2937;margin:0 0 24px;">
                    ${text.trim().slice(0, 300)}
                  </blockquote>
                  <a href="${CLIENT_URL}/training-calendar"
                     style="display:inline-block;background:#767EB5;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">
                    Reply in LaChart
                  </a>
                  <p style="color:#9ca3af;font-size:12px;margin-top:24px;">
                    You can manage email preferences in
                    <a href="${CLIENT_URL}/settings" style="color:#767EB5;">Settings</a>.
                  </p>
                </div>
              `,
            });
          } catch (emailErr) {
            console.error('Training comment email send error:', emailErr.message);
          }
        }
      } catch (notifErr) {
        console.error('[TrainingComment] notification error:', notifErr.message);
      }
    })();

    return res.status(201).json(comment);
  } catch (err) {
    console.error('POST /api/comments/training/:trainingId error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// DELETE /api/comments/training-comment/:commentId
router.delete('/training-comment/:commentId', verifyToken, async (req, res) => {
  try {
    const { commentId } = req.params;
    const userId = req.user.userId;

    const comment = await TrainingComment.findById(commentId);
    if (!comment) return res.status(404).json({ error: 'Comment not found' });

    const user = await User.findById(userId).select('role');
    if (!user) return res.status(404).json({ error: 'User not found' });

    const isAuthor = String(comment.authorId) === String(userId);
    const isCoachOrAdmin = user.role === 'coach' || user.role === 'admin';

    if (!isAuthor && !isCoachOrAdmin) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await TrainingComment.findByIdAndDelete(commentId);
    return res.status(200).json({ message: 'Comment deleted successfully' });
  } catch (err) {
    console.error('DELETE /api/comments/training-comment/:commentId error:', err);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
