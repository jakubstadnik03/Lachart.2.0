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
       <p>Welcome to <strong>${planLabel}</strong>! Your 2-month free trial is active and you now have full access to every paid feature.</p>`
    : `<p>Hi <strong>${userName}</strong>,</p>
       <p>Thanks for upgrading to <strong>${planLabel}</strong>! Your subscription is active and every paid feature is unlocked.</p>`;

  const trialBlock = inTrial && trialEndStr
    ? `<p style="margin-top:16px; padding:12px 16px; background:#FEF3C7; border-left:4px solid #F59E0B; border-radius:4px;">
         <strong>Free until ${trialEndStr}.</strong> We'll email you a few days before your trial ends.
         ${amount ? `After that, billing starts at <strong>${currency === 'EUR' ? '€' : ''}${amount}/month</strong>.` : ''}
         You can cancel anytime from Settings → Subscription, no questions asked.
       </p>`
    : '';

  const featureList = options.plan === 'coach'
    ? `<ul>
         <li>Unlimited athletes</li>
         <li>Plan workouts for your athletes</li>
         <li>Unlimited PDF report generation</li>
         <li>PDF branding — your logo, title &amp; address</li>
         <li>Coach dashboard &amp; overview</li>
         <li>Everything in Pro</li>
       </ul>`
    : `<ul>
         <li>Unlimited lactate tests</li>
         <li>Plan workouts in the calendar</li>
         <li>Start trainings from the app</li>
         <li>Connect to your smart trainer</li>
         <li>Advanced analytics &amp; charts</li>
         <li>PDF export of test reports</li>
         <li>Priority support</li>
       </ul>`;

  const emailContent = `
    ${intro}
    ${trialBlock}
    <p style="margin-top:16px;"><strong>What's included:</strong></p>
    ${featureList}
    <p style="margin-top:16px;">Need anything? Just reply to this email — I read every message.</p>
    <p>— Jakub @ LaChart</p>
  `;

  try {
    await transporter.sendMail({
      from: { name: 'LaChart', address: process.env.EMAIL_USER },
      to: user.email,
      subject: inTrial
        ? `Your ${planLabel} free trial is active`
        : `Welcome to ${planLabel}!`,
      html: generateEmailTemplate({
        title: inTrial ? `Welcome to ${planLabel}` : `You're a ${planLabel} member now`,
        content: emailContent,
        buttonText: 'Open LaChart',
        buttonUrl: `${clientUrl}/dashboard`,
        footerText: 'Manage your subscription anytime in Settings → Subscription.',
      }),
    });
    return { sent: true };
  } catch (err) {
    console.error('[PremiumActivationEmail] send failed:', err?.message);
    return { sent: false, reason: 'send_failed', error: err?.message };
  }
}

module.exports = { sendPremiumActivationEmail };
