const nodemailer = require('nodemailer');

function createEmailTransporter() {
  const user = process.env.EMAIL_USER?.trim();
  const pass = process.env.EMAIL_APP_PASSWORD?.trim();
  if (!user || !pass) return null;

  const smtpHost = process.env.SMTP_HOST?.trim() || process.env.EMAIL_SMTP_HOST?.trim();
  const smtpPortRaw = process.env.SMTP_PORT || process.env.EMAIL_SMTP_PORT;
  const smtpPort = smtpPortRaw ? Number(smtpPortRaw) : null;

  const smtpSecureEnv = process.env.SMTP_SECURE ?? process.env.EMAIL_SMTP_SECURE;
  const smtpSecure =
    typeof smtpSecureEnv !== 'undefined'
      ? String(smtpSecureEnv).toLowerCase() === 'true'
      : smtpPort === 465;

  // Helpful runtime log for diagnosing provider auth issues (do not log secrets).
  try {
    const transportMode = smtpHost && smtpPort ? 'hostPort' : 'service';
    const smtpService =
      process.env.SMTP_SERVICE?.trim() ||
      process.env.EMAIL_SMTP_SERVICE?.trim() ||
      'zoho';
    console.log('[EmailTransporter]', {
      from: user,
      transportMode,
      smtpHost: smtpHost || null,
      smtpPort: smtpPort || null,
      smtpSecure,
      smtpService,
    });
  } catch {
    // ignore logging failures
  }

  // Prefer explicit SMTP settings (works for Zoho and any provider).
  if (smtpHost && smtpPort) {
    return nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: Boolean(smtpSecure),
      auth: { user, pass },
    });
  }

  // Fallback via nodemailer "service" name.
  // If nothing else is configured, default to Zoho to match the branding requirement.
  const smtpService = process.env.SMTP_SERVICE || process.env.EMAIL_SMTP_SERVICE || 'zoho';
  return nodemailer.createTransport({
    service: smtpService,
    auth: { user, pass },
  });
}

module.exports = { createEmailTransporter };

