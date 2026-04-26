const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/verifyToken');
const Notification = require('../models/Notification');

// GET /api/notifications - get recent notifications for current user (last 30)
router.get('/', verifyToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const notifications = await Notification.find({ recipientId: userId })
      .sort({ createdAt: -1 })
      .limit(30);
    return res.status(200).json(notifications);
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
