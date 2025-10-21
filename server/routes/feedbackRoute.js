const express = require('express');
const nodemailer = require('nodemailer');
const router = express.Router();

// Fast feedback endpoint - optimized for Render.com
router.post('/', async (req, res) => {
  console.log('🚀 Feedback endpoint hit at:', new Date().toISOString());
  
  try {
    const { subject, message, email, page } = req.body || {};

    // Quick validation
    if (!message || !message.trim()) {
      console.log('❌ Missing message');
      return res.status(400).json({ message: 'Message is required' });
    }

    console.log('✅ Feedback received:', { 
      subject: subject || 'Feedback', 
      messageLength: message.length, 
      email: email || 'anonymous',
      page: page || '/',
      timestamp: new Date().toISOString() 
    });

    // Fast email setup with fallback
    const transporter = nodemailer.createTransporter({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER || 'jakub.stadnik01@gmail.com',
        pass: process.env.EMAIL_APP_PASSWORD
      },
      // Fast timeout settings
      connectionTimeout: 10000,
      greetingTimeout: 5000,
      socketTimeout: 10000
    });

    const toAddress = process.env.FEEDBACK_TO || 'jakub.stadnik@seznam.cz';

    // Simple HTML template
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #3B82F6;">📧 New Feedback from LaChart</h2>
        <div style="background: #F3F4F6; padding: 15px; border-radius: 8px; margin: 10px 0;">
          <p><strong>Subject:</strong> ${subject || 'Feedback'}</p>
          <p><strong>Message:</strong></p>
          <p style="white-space: pre-wrap;">${message}</p>
        </div>
        <hr style="border: 1px solid #E5E7EB; margin: 20px 0;">
        <div style="color: #6B7280; font-size: 14px;">
          <p><strong>From:</strong> ${email || 'anonymous'}</p>
          <p><strong>Page:</strong> ${page || '/'}</p>
          <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
        </div>
      </div>
    `;

    // Send email with timeout
    const emailPromise = transporter.sendMail({
      from: process.env.EMAIL_USER || 'jakub.stadnik01@gmail.com',
      to: toAddress,
      subject: `[LaChart] ${subject || 'Feedback'}`,
      html
    });

    // Race between email and timeout
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Email timeout')), 15000)
    );

    await Promise.race([emailPromise, timeoutPromise]);

    console.log('✅ Email sent successfully to:', toAddress);
    return res.status(200).json({ 
      status: 'success', 
      message: 'Feedback sent successfully',
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    console.error('❌ Feedback error:', err.message);
    
    // Still return success to client, but log the error
    return res.status(200).json({ 
      status: 'logged', 
      message: 'Feedback logged (email may have failed)',
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;