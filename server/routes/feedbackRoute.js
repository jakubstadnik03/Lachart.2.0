const express = require('express');
const nodemailer = require('nodemailer');
const router = express.Router();

// Simple feedback endpoint that accepts feedback payloads
router.post('/', async (req, res) => {
  try {
    const { subject, message, email, page } = req.body || {};

    if (!message || !message.trim()) {
      return res.status(400).json({ message: 'Message is required' });
    }

    console.log('Feedback received:', { subject, message, email, page, date: new Date().toISOString() });

    // Prepare SMTP transporter (uses Gmail per existing setup)
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_APP_PASSWORD
      }
    });

    const toAddress = process.env.FEEDBACK_TO || 'jakub.stadnik@seznam.cz';

    const html = `
      <h2>New Feedback from LaChart</h2>
      <p><strong>Subject:</strong> ${subject || 'Feedback'}</p>
      <p><strong>Message:</strong></p>
      <p>${(message || '').replace(/\n/g, '<br/>')}</p>
      <hr/>
      <p><strong>From:</strong> ${email || 'anonymous'}</p>
      <p><strong>Page:</strong> ${page || '/'}</p>
      <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
    `;

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: toAddress,
      subject: `[LaChart] ${subject || 'Feedback'}`,
      html
    });

    return res.status(201).json({ status: 'ok' });
  } catch (err) {
    console.error('Feedback route error:', err);
    return res.status(500).json({ message: 'Failed to submit feedback' });
  }
});

module.exports = router;


