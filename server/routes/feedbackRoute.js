const express = require('express');
const fs = require('fs');
const path = require('path');
const rateLimit = require('express-rate-limit');
const router = express.Router();

// H5 — 5 submissions per 10 minutes per IP
const feedbackLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many feedback submissions. Please wait a few minutes before trying again.' },
  skip: (req) => req.method === 'OPTIONS',
});

router.post('/', feedbackLimiter, async (req, res) => {
  try {
    const { subject, message, email, page } = req.body || {};

    if (!message || !message.trim()) {
      return res.status(400).json({ message: 'Message is required' });
    }

    if (message.length > 5000) {
      return res.status(400).json({ message: 'Message too long (max 5000 characters)' });
    }

    const feedbackData = {
      subject: (subject || 'Feedback').substring(0, 200),
      message: message.substring(0, 5000),
      email: email || 'anonymous',
      page: page || '/',
      timestamp: new Date().toISOString(),
      userAgent: req.headers['user-agent'] || 'unknown'
    };

    console.log('📧 FEEDBACK:');
    console.log('Subject:', feedbackData.subject);
    console.log('From:', feedbackData.email);
    console.log('Page:', feedbackData.page);
    console.log('Message:', feedbackData.message);
    console.log('Time:', feedbackData.timestamp);

    try {
      const feedbackDir = path.join(__dirname, '../logs');
      if (!fs.existsSync(feedbackDir)) fs.mkdirSync(feedbackDir, { recursive: true });
      const filename = `feedback-${new Date().toISOString().split('T')[0]}.json`;
      const filepath = path.join(feedbackDir, filename);
      let feedbacks = [];
      if (fs.existsSync(filepath)) {
        try { feedbacks = JSON.parse(fs.readFileSync(filepath, 'utf8')); } catch { feedbacks = []; }
      }
      feedbacks.push(feedbackData);
      fs.writeFileSync(filepath, JSON.stringify(feedbacks, null, 2));
    } catch (fileError) {
      console.warn('Could not save feedback to file:', fileError.message);
    }

    return res.status(200).json({ status: 'success', message: 'Feedback received' });
  } catch (err) {
    console.error('Feedback error:', err.message);
    return res.status(500).json({ status: 'error', message: 'Failed to process feedback' });
  }
});

module.exports = router;
