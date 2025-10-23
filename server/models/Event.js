const mongoose = require('mongoose');

const EventSchema = new mongoose.Schema({
  type: { 
    type: String, 
    required: true,
    enum: ['register', 'login', 'test_created', 'test_completed', 'feedback_sent', 'demo_used', 'guide_viewed']
  },
  userId: { 
    type: String, 
    default: null 
  },
  timestamp: { 
    type: Date, 
    default: Date.now 
  },
  metadata: { 
    type: Object,
    default: {}
  },
  sessionId: {
    type: String,
    default: null
  },
  userAgent: {
    type: String,
    default: null
  },
  ipAddress: {
    type: String,
    default: null
  }
}, {
  timestamps: true
});

// Index pro rychlé vyhledávání
EventSchema.index({ type: 1, timestamp: -1 });
EventSchema.index({ userId: 1, timestamp: -1 });

module.exports = mongoose.models.Event || mongoose.model('Event', EventSchema);
