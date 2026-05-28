const { createEmailTransporter } = require('../utils/createEmailTransporter');
const { generateEmailTemplate, getClientUrl } = require('../utils/emailTemplate');

/**
 * Email sent when a user transitions to a paid LaChart plan (trial start
 * or first paid billing cycle). Fired from:
 *   - server/controllers/subscriptionController.js → handleCheckoutCompleted
 *   - server/controllers/subscriptionController.js → syncSubscriptionFromStripe
 *     (webhook-failure fallback)
 *
 * Idempotency: callers should only invoke this when the user's plan actually
 * changes from "free" to a paid plan, OR when a trial transitions to active.
 *
 * @param {Object}  user                User document (must have email)
 * @param {Object}  options
 * @param {String}  options.plan        'pro' | 'coach' | 'team' | 'enterprise'
 * @param {String}  options.status      'trialing' | 'active'
 * @param {Date}    [options.trialEnd]  When the free trial ends (if any)
 * @param {Number}  [options.amount]    Price per month in major units (e.g. 9.99)
 * @param {String}  [options.currency]  ISO currency code (default 'EUR')
 * @returns {Promise<{sent: boolean, reason?: string}>}
 */
async function sendPremiumActivationEmail(user, options = {}) {
  if (!user?.email) {
    return { sent: false, reason: 'no_email' };
  }

  if (!process.env.EMAIL_USER || !process.env.EMAIL_APP_PASSWORD) {
    return { sent: false, reason: 'email_not_configured' };
  }

  const transporter = createEmailTransporter();
  if (!transporter) {
    return { sent: false, reason: 'transporter_not_created' };
  }

  const planLabel = {
    pro: 'LaChart Pro',
    coach: 'LaChart Coach',
    team: 'LaChart Team',
    enterprise: 'LaChart Enterprise',
  }[String(options.plan || 'pro').toLowerCase()] || 'LaChart Premium';

  const inTrial = String(options.status || '').toLowerCase() === 'trialing';
  const currency = String(options.currency || 'EUR').toUpperCase();
  const amount = options.amount;
  const trialEnd = options.trialEnd ? new Date(options.trialEnd) : null;
  const trialEndStr = trialEnd && !Number.isNaN(trialEnd.getTime())
    ? trialEnd.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  const clientUrl = getClientUrl();
  const userName = user.name || 'there';

  // Tailor copy depending on whether they're in a trial or paid outright.
  const intro = inTrial
    ? `<p>Hi <strong>${userName}</strong>,</p>
       <p>Welcome to <strong>${planLabel}</strong>. Your free trial just kicked off — every paid feature is unlocked, nothing else to set up.</p>`
    : `<p>Hi <strong>${userName}</strong>,</p>
       <p>Welcome to <strong>${planLabel}</strong>. Your subscription is active and every paid feature is unlocked.</p>`;

  const trialBlock = inTrial && trialEndStr
    ? `<p style="margin: 18px 0; padding: 14px 18px; background-color: #FFE6DF; border-radius: 10px; border-left: 4px solid #FF6B4A; color: #1D2C4C; font-size: 15px;">
         <strong style="color: #0A0E1A;">Free until ${trialEndStr}.</strong> We'll send a heads-up a few days before the trial ends so nothing surprises you.
         ${amount ? `After that, billing is <strong>${currency === 'EUR' ? '€' : ''}${amount}/month</strong>.` : ''}
         Cancel any time from Settings → Subscription, no friction.
       </p>`
    : '';

  // Feature cards — visually richer than a bare <ul>. Calls out the
  // newer features (workout planner, per-interval lactate, auto-categorize,
  // form/fitness, branding for coaches) that paying users care about most.
  const cardStyle = 'background-color: #E9ECF6; border-radius: 10px; padding: 14px 16px;';
  const accentCardStyle = 'background-color: #FFE6DF; border-radius: 10px; padding: 14px 16px;';
  const cardTitleStyle = 'font-weight: 700; color: #0A0E1A; font-size: 15px;';
  const cardBodyStyle = 'color: #4A5E82; font-size: 14px; line-height: 1.5; margin-top: 2px;';

  const coachFeatures = `
    <tr><td style="${cardStyle}">
      <div style="${cardTitleStyle}">🎨 PDF reports with your branding</div>
      <div style="${cardBodyStyle}">Upload your logo, set studio name + address. Every test PDF goes out as your branded handout.</div>
    </td></tr>
    <tr><td style="${cardStyle}">
      <div style="${cardTitleStyle}">👥 Unlimited athletes</div>
      <div style="${cardBodyStyle}">Add as many athletes as you coach. Plan their workouts, track their curves, compare their progress.</div>
    </td></tr>
    <tr><td style="${cardStyle}">
      <div style="${cardTitleStyle}">📅 Build &amp; assign structured workouts</div>
      <div style="${cardBodyStyle}">Design intervals with target zones once, drop on any day for any athlete.</div>
    </td></tr>
    <tr><td style="${cardStyle}">
      <div style="${cardTitleStyle}">📊 Coach dashboard</div>
      <div style="${cardBodyStyle}">One view across all your athletes — who tested when, who's overdue, who's overreaching.</div>
    </td></tr>
    <tr><td style="${accentCardStyle}">
      <div style="${cardTitleStyle}">⚡ Strava auto-sync for every athlete</div>
      <div style="${cardBodyStyle}">Each athlete connects once — every workout flows in with power, HR, pace and laps.</div>
    </td></tr>
  `;

  const proFeatures = `
    <tr><td style="${cardStyle}">
      <div style="${cardTitleStyle}">📅 Plan workouts in the calendar</div>
      <div style="${cardBodyStyle}">Warm-up · intervals with target zones · recoveries · cooldown — drop them on any day and run them live from the app.</div>
    </td></tr>
    <tr><td style="${cardStyle}">
      <div style="${cardTitleStyle}">💧 Lactate on any interval</div>
      <div style="${cardBodyStyle}">Tag any interval of any workout with a blood-lactate sample. Each one feeds straight back into your curve and zones.</div>
    </td></tr>
    <tr><td style="${cardStyle}">
      <div style="${cardTitleStyle}">❤️ Form, fitness &amp; fatigue tracking</div>
      <div style="${cardBodyStyle}">CTL · ATL · TSB charted over weeks. See when you peak, when you overreach, when to back off.</div>
    </td></tr>
    <tr><td style="${cardStyle}">
      <div style="${cardTitleStyle}">⚡ Auto-categorize every workout</div>
      <div style="${cardBodyStyle}">Endurance · threshold · VO2max · recovery — sorted automatically from intervals, zones and titles.</div>
    </td></tr>
    <tr><td style="${accentCardStyle}">
      <div style="${cardTitleStyle}">🔗 Strava auto-sync</div>
      <div style="${cardBodyStyle}">Connect once — every ride, run and swim flows in automatically. <a href="${clientUrl}/settings?tab=integrations" style="color: #E85535; font-weight: 600; text-decoration: none;">Set up now →</a></div>
    </td></tr>
  `;

  const featureCards = options.plan === 'coach' ? coachFeatures : proFeatures;

  const emailContent = `
    ${intro}
    ${trialBlock}
    <p style="margin-top: 22px; font-size: 15.5px;"><strong>What's unlocked for you:</strong></p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width: 100%; margin: 12px 0 18px; border-collapse: separate; border-spacing: 0 8px;">
      ${featureCards}
    </table>
    <p style="margin-top: 22px;">If you hit a wall or want to send feedback, just reply to this email. It comes straight to me.</p>
    <p style="margin-top: 6px;">— Jakub<br/><span style="color: #6B7280; font-size: 14px;">Creator of LaChart</span></p>
  `;

  try {
    await transporter.sendMail({
      from: { name: 'LaChart', address: process.env.EMAIL_USER },
      to: user.email,
      subject: inTrial
        ? `${planLabel} unlocked — your trial just started`
        : `You're in — ${planLabel} is active`,
      html: generateEmailTemplate({
        title: inTrial ? `${planLabel} is yours to try` : `You're on ${planLabel}`,
        content: emailContent,
        buttonText: 'Open my dashboard',
        buttonUrl: `${clientUrl}/dashboard`,
        loginButtonText: 'Connect Strava',
        loginButtonUrl: `${clientUrl}/settings?tab=integrations`,
        footerText: 'Manage your subscription any time in Settings → Subscription. Cancel takes one click.',
      }),
    });
    return { sent: true };
  } catch (err) {
    console.error('[PremiumActivationEmail] send failed:', err?.message);
    return { sent: false, reason: 'send_failed', error: err?.message };
  }
}

module.exports = { sendPremiumActivationEmail };
