const express = require('express');
const Event = require('../models/Event');
const router = express.Router();

// POST /api/events - Log new event
router.post('/', async (req, res) => {
  try {
    const { type, userId, metadata, sessionId, userAgent, ipAddress } = req.body;

    if (!type) {
      return res.status(400).json({ success: false, message: 'Event type is required' });
    }

    const event = new Event({
      type,
      userId: userId || null,
      metadata: metadata || {},
      sessionId: sessionId || null,
      userAgent: userAgent || req.headers['user-agent'] || null,
      ipAddress: ipAddress || req.ip || null
    });

    await event.save();

    console.log(`📊 Event logged: ${type}${userId ? ` (user: ${userId})` : ''}`);

    res.status(201).json({ 
      success: true, 
      message: 'Event logged successfully',
      eventId: event._id
    });
  } catch (error) {
    console.error('Event logging failed:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to log event',
      error: error.message 
    });
  }
});

// GET /api/events - Get events with filters
router.get('/', async (req, res) => {
  try {
    const { type, userId, startDate, endDate, limit = 100 } = req.query;
    
    let filter = {};
    
    if (type) filter.type = type;
    if (userId) filter.userId = userId;
    if (startDate || endDate) {
      filter.timestamp = {};
      if (startDate) filter.timestamp.$gte = new Date(startDate);
      if (endDate) filter.timestamp.$lte = new Date(endDate);
    }

    const events = await Event.find(filter)
      .sort({ timestamp: -1 })
      .limit(parseInt(limit))
      .select('-__v');

    res.json({
      success: true,
      count: events.length,
      events
    });
  } catch (error) {
    console.error('Failed to fetch events:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch events',
      error: error.message 
    });
  }
});

// GET /api/events/stats - Get event statistics
router.get('/stats', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    let matchFilter = {};
    if (startDate || endDate) {
      matchFilter.timestamp = {};
      if (startDate) matchFilter.timestamp.$gte = new Date(startDate);
      if (endDate) matchFilter.timestamp.$lte = new Date(endDate);
    }

    // Basic stats by type
    const statsByType = await Event.aggregate([
      { $match: matchFilter },
      { 
        $group: { 
          _id: '$type', 
          count: { $sum: 1 },
          lastOccurrence: { $max: '$timestamp' }
        } 
      },
      { $sort: { count: -1 } }
    ]);

    // Daily stats: use requested date range or default last 30 days
    const rangeStart = matchFilter.timestamp?.$gte || (() => {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      return d;
    })();
    const rangeEnd = matchFilter.timestamp?.$lte || new Date();
    const dailyMatch = { timestamp: { $gte: rangeStart, $lte: rangeEnd } };

    const dailyStats = await Event.aggregate([
      { $match: dailyMatch },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
            type: '$type'
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.date': -1 } }
    ]);

    // User activity stats
    const userStats = await Event.aggregate([
      { 
        $match: { 
          userId: { $ne: null },
          ...matchFilter
        } 
      },
      {
        $group: {
          _id: '$userId',
          eventCount: { $sum: 1 },
          lastActivity: { $max: '$timestamp' },
          eventTypes: { $addToSet: '$type' }
        }
      },
      {
        $group: {
          _id: null,
          totalActiveUsers: { $sum: 1 },
          avgEventsPerUser: { $avg: '$eventCount' }
        }
      }
    ]);

    res.json({
      success: true,
      stats: {
        byType: statsByType,
        daily: dailyStats,
        users: userStats[0] || { totalActiveUsers: 0, avgEventsPerUser: 0 }
      }
    });
  } catch (error) {
    console.error('Failed to fetch stats:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch statistics',
      error: error.message 
    });
  }
});

module.exports = router;
