const nodemailer = require('nodemailer');

function createEmailTransporter() {
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_APP_PASSWORD;
  if (!user || !pass) return null;

  const smtpHost = process.env.SMTP_HOST || process.env.EMAIL_SMTP_HOST;
  const smtpPortRaw = process.env.SMTP_PORT || process.env.EMAIL_SMTP_PORT;
  const smtpPort = smtpPortRaw ? Number(smtpPortRaw) : null;

  const smtpSecureEnv = process.env.SMTP_SECURE ?? process.env.EMAIL_SMTP_SECURE;
  const smtpSecure =
    typeof smtpSecureEnv !== 'undefined'
      ? String(smtpSecureEnv).toLowerCase() === 'true'
      : smtpPort === 465;

  // Prefer explicit SMTP settings (works for Zoho and any provider).
  if (smtpHost && smtpPort) {
    return nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: Boolean(smtpSecure),
      auth: { user, pass },
    });
  }

  // Optional fallback via nodemailer "service" name (e.g. 'gmail', 'zoho', ...).
  // If nothing is configured, return null so calling code can fail gracefully.
  const smtpService = process.env.SMTP_SERVICE || process.env.EMAIL_SMTP_SERVICE;
  if (!smtpService) return null;

  return nodemailer.createTransport({
    service: smtpService,
    auth: { user, pass },
  });
}

module.exports = { createEmailTransporter };

