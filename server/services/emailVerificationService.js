const nodemailer = require('nodemailer');
const { generateEmailTemplate, getClientUrl } = require('../utils/emailTemplate');

function createTransporter() {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_APP_PASSWORD) {
    return null;
  }
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_APP_PASSWORD
    }
  });
}

/**
 * Send email verification email to user
 * @param {Object} user - User object with name, surname, email
 * @param {String} verificationToken - Token for email verification
 * @returns {Promise<Object>} Result object with sent status
 */
async function sendEmailVerificationEmail(user, verificationToken) {
  if (!user?.email) {
    return { sent: false, reason: 'no_email' };
  }

  if (!process.env.EMAIL_USER || !process.env.EMAIL_APP_PASSWORD) {
    return { sent: false, reason: 'email_not_configured' };
  }

  const transporter = createTransporter();
  if (!transporter) {
    return { sent: false, reason: 'transporter_not_created' };
  }

  const clientUrl = getClientUrl();
  const verificationUrl = `${clientUrl}/verify-email/${verificationToken}`;

  // Image URLs - using absolute URLs for email clients
  const imageBaseUrl = clientUrl;
  const lactateTestingImage = `${imageBaseUrl}/images/lactate_testing.png`;
  const lachartTrainingImage = `${imageBaseUrl}/images/lachart_training.png`;
  const formFitnessChartImage = `${imageBaseUrl}/images/Form-fitness-chart.png`;

  const userName = user.name || 'there';
  const userSurname = user.surname || '';

  const emailContent = `
    <p>Hi <strong>${userName} ${userSurname}</strong>,</p>
    
    <p>Thank you for registering with <strong>LaChart</strong>! We're excited to have you on board.</p>
    
    <p>To complete your registration and start using all features, please verify your email address by clicking the button below:</p>
    
    <div style="margin: 30px 0;">
      <div style="text-align: center; margin: 20px 0;">
        <img src="${lactateTestingImage}" alt="Lactate Testing" style="max-width: 100%; height: auto; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);" />
      </div>
      <p style="text-align: center; color: #6b7280; font-size: 14px; margin-top: 10px;">
        <strong>Lactate Testing & Analysis</strong><br/>
        Track your performance with advanced lactate curve analysis
      </p>
    </div>
    
    <div style="margin: 30px 0;">
      <div style="text-align: center; margin: 20px 0;">
        <img src="${lachartTrainingImage}" alt="Training Analytics" style="max-width: 100%; height: auto; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);" />
      </div>
      <p style="text-align: center; color: #6b7280; font-size: 14px; margin-top: 10px;">
        <strong>Training Analytics</strong><br/>
        Analyze your training data and track your progress
      </p>
    </div>
    
    <div style="margin: 30px 0;">
      <div style="text-align: center; margin: 20px 0;">
        <img src="${formFitnessChartImage}" alt="Fitness Charts" style="max-width: 100%; height: auto; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);" />
      </div>
      <p style="text-align: center; color: #6b7280; font-size: 14px; margin-top: 10px;">
        <strong>Comprehensive Fitness Tracking</strong><br/>
        Monitor your fitness metrics and training zones
      </p>
    </div>
    
    <p style="margin-top: 30px;">Once verified, you'll be able to:</p>
    <ul style="color: #4b5563; line-height: 1.8;">
      <li>Create and analyze lactate threshold tests</li>
      <li>Track your training activities and performance</li>
      <li>Connect with Strava and other fitness platforms</li>
      <li>Access personalized training zones and recommendations</li>
      <li>View detailed analytics and progress reports</li>
    </ul>
    
    <p style="margin-top: 30px; color: #6b7280; font-size: 14px;">
      <strong>Note:</strong> This verification link will expire in 24 hours. If you didn't create an account, you can safely ignore this email.
    </p>
  `;

  try {
    await transporter.sendMail({
      from: {
        name: 'LaChart',
        address: process.env.EMAIL_USER
      },
      to: user.email,
      subject: 'Verify your LaChart email address',
      html: generateEmailTemplate({
        title: 'Verify Your Email Address',
        content: emailContent,
        buttonText: 'Verify Email Address',
        buttonUrl: verificationUrl,
        footerText: 'If the button doesn\'t work, copy and paste this link into your browser: ' + verificationUrl
      })
    });

    return { sent: true };
  } catch (error) {
    console.error('Email verification email error:', error);
    return { sent: false, reason: error.message || 'send_failed' };
  }
}

module.exports = {
  sendEmailVerificationEmail
};
