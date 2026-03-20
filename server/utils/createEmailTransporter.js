const nodemailer = require('nodemailer');

function sanitizeEnvValue(value) {
  if (typeof value !== 'string') return value;
  // Common issue: env values pasted with surrounding quotes.
  const trimmed = value.trim();
  return trimmed.replace(/^['"](.+)['"]$/, '$1');
}

function createEmailTransporter() {
  const user = sanitizeEnvValue(process.env.EMAIL_USER);
  const pass = sanitizeEnvValue(process.env.EMAIL_APP_PASSWORD);
  if (!user || !pass) return null;

  const smtpHost = sanitizeEnvValue(process.env.SMTP_HOST) || sanitizeEnvValue(process.env.EMAIL_SMTP_HOST);
  const smtpPortRaw = sanitizeEnvValue(process.env.SMTP_PORT) || sanitizeEnvValue(process.env.EMAIL_SMTP_PORT);
  const smtpPort = smtpPortRaw ? Number(smtpPortRaw) : null;

  const smtpSecureEnv = process.env.SMTP_SECURE ?? process.env.EMAIL_SMTP_SECURE;
  const smtpSecure =
    typeof smtpSecureEnv !== 'undefined'
      ? String(smtpSecureEnv).toLowerCase() === 'true'
      : smtpPort === 465;

  // Helpful runtime log for diagnosing provider auth issues (do not log secrets).
  const smtpServiceForLog =
    sanitizeEnvValue(process.env.SMTP_SERVICE) ||
    sanitizeEnvValue(process.env.EMAIL_SMTP_SERVICE) ||
    'zoho';
  try {
    const transportMode = smtpHost && smtpPort ? 'hostPort' : 'service';
    const smtpService = smtpServiceForLog;
    console.log('[EmailTransporter]', {
      from: user,
      transportMode,
      smtpHost: smtpHost || null,
      smtpPort: smtpPort || null,
      smtpSecure,
      smtpService,
      passMeta: {
        length: pass.length,
        hasWhitespace: /\s/.test(pass),
        hasQuotes: /^[\'"]/.test(pass),
      }
    });
  } catch {
    // ignore logging failures
  }

  // Prefer explicit SMTP settings (works for Zoho and any provider).
  if (smtpHost && smtpPort) {
    const hostPortTransport = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: Boolean(smtpSecure),
      auth: { user, pass },
    });

    // If host/port-based auth fails with Zoho, try the provider-level "service" transport once.
    // This helps isolate issues like wrong regional SMTP host.
    const originalSendMail = hostPortTransport.sendMail.bind(hostPortTransport);
    hostPortTransport.sendMail = async (...args) => {
      try {
        return await originalSendMail(...args);
      } catch (err) {
        const msg = (err && (err.message || err.reason || String(err))) || '';
        const code = err?.code ? String(err.code) : '';
        const looksLikeAuthFailure = code === 'EAUTH' || msg.includes('535 Authentication Failed');
        if (!looksLikeAuthFailure) throw err;

        console.warn('[EmailTransporter] hostPort auth failed; retrying with service transport', {
          smtpHost,
          smtpPort,
          code,
        });
        const fallbackTransport = nodemailer.createTransport({
          service: smtpServiceForLog,
          auth: { user, pass },
        });
        return fallbackTransport.sendMail(...args);
      }
    };

    return hostPortTransport;
  }

  // Fallback via nodemailer "service" name.
  // If nothing else is configured, default to Zoho to match the branding requirement.
  const smtpService = sanitizeEnvValue(process.env.SMTP_SERVICE) || sanitizeEnvValue(process.env.EMAIL_SMTP_SERVICE) || 'zoho';
  return nodemailer.createTransport({
    service: smtpService,
    auth: { user, pass },
  });
}

module.exports = { createEmailTransporter };

