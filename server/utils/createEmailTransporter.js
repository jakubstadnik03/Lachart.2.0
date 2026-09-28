const nodemailer = require('nodemailer');
const crypto = require('crypto');

function sanitizeEnvValue(value) {
  if (typeof value !== 'string') return value;
  // Common issue: env values pasted with surrounding quotes.
  const trimmed = value.trim();
  return trimmed.replace(/^['"](.+)['"]$/, '$1');
}


/**
 * One gate every outbound message passes, whoever sends it.
 *
 * 30 accounts sign in with Apple behind Hide My Email, and Apple's relay
 * refuses us — "550 5.1.1 <lachart@lachart.net>: unauthorized sender" — because
 * the sending domain is not registered against the app's Sign in with Apple
 * configuration. Every message to one of them produced a bounce, and the
 * bounces were filling the inbox.
 *
 * Wrapping sendMail rather than fixing each campaign is deliberate: there are
 * a dozen senders here — schedulers, campaigns, password resets, coach
 * invitations — and a guard any one of them can forget to call is a guard that
 * will be forgotten. This one cannot be bypassed by a new send path.
 *
 * It refuses quietly and reports it. A caller that treats the refusal as a
 * failure would retry forever; a caller that ignores the answer is no worse off
 * than before, because the message was never going to arrive.
 */
function guardUnreachable(transport) {
  if (!transport || typeof transport.sendMail !== 'function' || transport.__reachabilityGuarded) {
    return transport;
  }
  const { emailReachability } = require('./emailReachability');
  const original = transport.sendMail.bind(transport);

  transport.sendMail = async (message = {}, ...rest) => {
    const to = Array.isArray(message.to) ? message.to : [message.to];
    const addresses = to
      .map((t) => (typeof t === 'string' ? t : t?.address))
      .filter(Boolean);

    const blocked = addresses.filter((a) => !emailReachability(a).reachable);
    if (blocked.length && blocked.length === addresses.length) {
      const reason = emailReachability(blocked[0]).reason;
      console.warn(`[email] not sent — ${reason}: ${blocked.join(', ')}`);
      return { skipped: true, reason, to: blocked };
    }
    return original(message, ...rest);
  };
  transport.__reachabilityGuarded = true;
  return transport;
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
        sha256_prefix: crypto.createHash('sha256').update(pass).digest('hex').slice(0, 8),
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

        console.warn('[EmailTransporter] hostPort auth failed; trying fallbacks', {
          smtpHost,
          smtpPort,
          code,
        });

        const candidates = [];
        // 1) service transport (zoho)
        candidates.push({
          label: `service:${smtpServiceForLog}`,
          transport: nodemailer.createTransport({
            service: smtpServiceForLog,
            auth: { user, pass },
          })
        });

        // 2) Try STARTTLS (587) on the same host
        candidates.push({
          label: `${smtpHost}:587 secure=false`,
          transport: nodemailer.createTransport({
            host: smtpHost,
            port: 587,
            secure: false,
            auth: { user, pass },
          })
        });

        // 3) Try other Zoho region host if applicable
        if (smtpHost === 'smtp.zoho.com') {
          candidates.push({
            label: 'smtp.zoho.eu:465 secure=true',
            transport: nodemailer.createTransport({
              host: 'smtp.zoho.eu',
              port: 465,
              secure: true,
              auth: { user, pass },
            })
          });
        } else if (smtpHost === 'smtp.zoho.eu') {
          candidates.push({
            label: 'smtp.zoho.com:465 secure=true',
            transport: nodemailer.createTransport({
              host: 'smtp.zoho.com',
              port: 465,
              secure: true,
              auth: { user, pass },
            })
          });
        }

        let lastErr = err;
        for (const c of candidates) {
          try {
            console.warn('[EmailTransporter] trying candidate', c.label);
            return await c.transport.sendMail(...args);
          } catch (fallbackErr) {
            lastErr = fallbackErr;
            const fMsg = (fallbackErr && (fallbackErr.message || fallbackErr.reason || String(fallbackErr))) || '';
            const fCode = fallbackErr?.code ? String(fallbackErr.code) : '';
            const fAuth = fCode === 'EAUTH' || fMsg.includes('535 Authentication Failed');
            console.warn('[EmailTransporter] candidate failed', {
              candidate: c.label,
              code: fCode,
              authFailure: fAuth,
            });
            // If it's not an auth failure, don't keep trying unrelated fallbacks.
            if (!fAuth) throw fallbackErr;
          }
        }

        throw lastErr;
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

/**
 * Transporter for bulk mail: campaigns, outreach, digests.
 *
 * WHY A SECOND ONE
 * Transactional mail — the verification link, the test report, the receipt —
 * has to arrive, and it arrives because lachart.net has spent months building a
 * reputation with the receivers. Bulk mail is what puts that reputation at
 * risk: a cold outreach run that people mark as spam teaches Gmail something
 * about the sending domain, and the next password reset pays for it.
 *
 * So the two are split. Transactional keeps going out over Zoho from
 * lachart.net. Bulk goes out over whatever CAMPAIGN_SMTP_* points at — Brevo,
 * from the mail.lachart.net subdomain, which is authenticated separately and
 * whose reputation is its own.
 *
 * There is a practical reason too: Zoho Mail is a mailbox, not a bulk sender.
 * It cut a 53-recipient campaign off at thirty with
 * "550 5.4.6 Unusual sending activity detected".
 *
 * FALLBACK
 * With no CAMPAIGN_* variables set this returns the ordinary transporter, so
 * nothing changes until the switch is deliberately thrown. That also means a
 * half-finished migration degrades to "everything over Zoho" rather than to
 * silence.
 */
function createCampaignTransporter() {
  const user = sanitizeEnvValue(process.env.CAMPAIGN_EMAIL_USER);
  const pass = sanitizeEnvValue(process.env.CAMPAIGN_EMAIL_APP_PASSWORD);
  const host = sanitizeEnvValue(process.env.CAMPAIGN_SMTP_HOST);
  const portRaw = sanitizeEnvValue(process.env.CAMPAIGN_SMTP_PORT);

  if (!user || !pass || !host || !portRaw) return createEmailTransporter();

  const port = Number(portRaw);
  const secureEnv = process.env.CAMPAIGN_SMTP_SECURE;
  const secure = typeof secureEnv !== 'undefined'
    ? String(secureEnv).toLowerCase() === 'true'
    : port === 465;

  console.log('[CampaignTransporter]', { host, port, secure, from: campaignSender().address });
  return nodemailer.createTransport({ host, port, secure, auth: { user, pass } });
}

/**
 * The From for bulk mail.
 *
 * This is NOT the SMTP login: Brevo authenticates with a machine account
 * (something@smtp-brevo.com) while the message has to come From the domain that
 * was authenticated in its dashboard, or SPF and DKIM align against the wrong
 * one and every check fails. Hence a separate variable.
 */
function campaignSender() {
  const address = sanitizeEnvValue(process.env.CAMPAIGN_EMAIL_FROM)
    || sanitizeEnvValue(process.env.EMAIL_USER);
  const name = sanitizeEnvValue(process.env.CAMPAIGN_EMAIL_FROM_NAME) || 'LaChart';
  return { name, address };
}

const _createEmailTransporter = createEmailTransporter;
const _createCampaignTransporter = createCampaignTransporter;

module.exports = {
  createEmailTransporter: (...a) => guardUnreachable(_createEmailTransporter(...a)),
  createCampaignTransporter: (...a) => guardUnreachable(_createCampaignTransporter(...a)),
  campaignSender,
  guardUnreachable,
};


