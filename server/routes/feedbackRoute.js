const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();

// Simple feedback endpoint - logs to file and console
router.post('/', async (req, res) => {
  console.log('🚀 Feedback endpoint hit at:', new Date().toISOString());
  
  try {
    const { subject, message, email, page } = req.body || {};

    // Quick validation
    if (!message || !message.trim()) {
      console.log('❌ Missing message');
      return res.status(400).json({ message: 'Message is required' });
    }

    const feedbackData = {
      subject: subject || 'Feedback',
      message: message,
      email: email || 'anonymous',
      page: page || '/',
      timestamp: new Date().toISOString(),
      userAgent: req.headers['user-agent'] || 'unknown'
    };

    console.log('✅ Feedback received:', feedbackData);

    // Log to console (visible in Render logs)
    console.log('📧 FEEDBACK EMAIL:');
    console.log('Subject:', feedbackData.subject);
    console.log('From:', feedbackData.email);
    console.log('Page:', feedbackData.page);
    console.log('Message:', feedbackData.message);
    console.log('Time:', feedbackData.timestamp);
    console.log('--- END FEEDBACK ---');

    // Also try to save to file (if possible)
    try {
      const feedbackDir = path.join(__dirname, '../logs');
      if (!fs.existsSync(feedbackDir)) {
        fs.mkdirSync(feedbackDir, { recursive: true });
      }
      
      const filename = `feedback-${new Date().toISOString().split('T')[0]}.json`;
      const filepath = path.join(feedbackDir, filename);
      
      // Read existing data or create new array
      let feedbacks = [];
      if (fs.existsSync(filepath)) {
        try {
          feedbacks = JSON.parse(fs.readFileSync(filepath, 'utf8'));
        } catch (e) {
          feedbacks = [];
        }
      }
      
      // Add new feedback
      feedbacks.push(feedbackData);
      
      // Write back to file
      fs.writeFileSync(filepath, JSON.stringify(feedbacks, null, 2));
      console.log('✅ Feedback saved to file:', filepath);
    } catch (fileError) {
      console.log('⚠️ Could not save to file:', fileError.message);
    }

    return res.status(200).json({ 
      status: 'success', 
      message: 'Feedback received and logged',
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    console.error('❌ Feedback error:', err.message);
    
    return res.status(500).json({ 
      status: 'error', 
      message: 'Failed to process feedback',
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;