const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/verifyToken');
const User = require('../models/UserModel');
const TestComment = require('../models/TestComment');
const Test = require('../models/test');

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

module.exports = router;
