const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/verifyToken');
const Notification = require('../models/Notification');
const { normalizeNotificationCopy } = require('../utils/notificationCopy');

// GET /api/notifications - get recent notifications for current user (last 30)
router.get('/', verifyToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const notifications = await Notification.find({ recipientId: userId })
      .sort({ createdAt: -1 })
      .limit(30)
      .lean();
    return res.status(200).json(notifications.map(normalizeNotificationCopy));
  } catch (err) {
    console.error('GET /api/notifications error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// PATCH /api/notifications/read - mark all as read
router.patch('/read', verifyToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    await Notification.updateMany({ recipientId: userId, read: false }, { read: true });
    return res.status(200).json({ message: 'All notifications marked as read' });
  } catch (err) {
    console.error('PATCH /api/notifications/read error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// PATCH /api/notifications/:id/read - mark single notification as read
router.patch('/:id/read', verifyToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, recipientId: userId },
      { read: true },
      { new: true }
    );
    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    return res.status(200).json(notification);
  } catch (err) {
    console.error('PATCH /api/notifications/:id/read error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// DELETE /api/notifications — clear all notifications for the current user.
// Backs the "Clear all" button in the iOS notifications sheet. We restrict
// to recipientId = userId so a stray request can't wipe someone else's
// inbox even if the auth token leaked into a different shell.
router.delete('/', verifyToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const result = await Notification.deleteMany({ recipientId: userId });
    return res.status(200).json({
      message: 'All notifications cleared',
      deleted: result.deletedCount || 0,
    });
  } catch (err) {
    console.error('DELETE /api/notifications error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// DELETE /api/notifications/:id - delete a notification
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const notification = await Notification.findOneAndDelete({ _id: req.params.id, recipientId: userId });
    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    return res.status(200).json({ message: 'Notification deleted' });
  } catch (err) {
    console.error('DELETE /api/notifications/:id error:', err);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
