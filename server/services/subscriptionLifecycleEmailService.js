const { createEmailTransporter } = require('../utils/createEmailTransporter');
const { generateEmailTemplate, getClientUrl } = require('../utils/emailTemplate');

/**
 * Subscription lifecycle emails (beyond the activation welcome email):
 *
 *   - sendTrialEndingEmail()      — fires from customer.subscription.trial_will_end
 *                                   (Stripe sends this 3 days before trial end)
 *   - sendPaymentReceiptEmail()   — fires from invoice.payment_succeeded for
 *                                   recurring charges (NOT the initial $0 trial
 *                                   invoice, which Stripe Tax already emails).
 *   - sendPaymentFailedEmail()    — fires from invoice.payment_failed so the
 *                                   user knows to update their card.
 *   - sendSubscriptionCanceledEmail() — fires from customer.subscription.deleted
 *
 * All emails:
 *   - return { sent: false, reason } when prerequisites are missing (no email
 *     on file, no SMTP creds) instead of throwing.
 *   - are intentionally short (<150 words) — Stripe already sends its own
 *     invoice/receipt PDFs when invoice emails are enabled in the Dashboard.
 */

function fmtDate(input) {
  if (!input) return null;
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

function fmtMoney(amountMinor, currency) {
  if (typeof amountMinor !== 'number') return null;
  const major = amountMinor / 100;
  const cur = String(currency || 'eur').toUpperCase();
  const symbol = cur === 'EUR' ? '€' : cur === 'USD' ? '$' : cur === 'GBP' ? '£' : '';
  return symbol ? `${symbol}${major.toFixed(2)}` : `${major.toFixed(2)} ${cur}`;
}

function planLabel(plan) {
  return ({
    pro: 'LaChart Pro',
    coach: 'LaChart Coach',
    team: 'LaChart Team',
    enterprise: 'LaChart Enterprise',
  })[String(plan || '').toLowerCase()] || 'LaChart Premium';
}

async function send(user, { subject, title, content, buttonText = 'Open LaChart', buttonUrl, footerText }) {
  if (!user?.email) return { sent: false, reason: 'no_email' };
  if (!process.env.EMAIL_USER || !process.env.EMAIL_APP_PASSWORD) {
    return { sent: false, reason: 'email_not_configured' };
  }
  const transporter = createEmailTransporter();
  if (!transporter) return { sent: false, reason: 'transporter_not_created' };

  try {
    await transporter.sendMail({
      from: { name: 'LaChart', address: process.env.EMAIL_USER },
      to: user.email,
      subject,
      html: generateEmailTemplate({
        title,
        content,
        buttonText,
        buttonUrl: buttonUrl || `${getClientUrl()}/dashboard`,
        footerText: footerText || 'Manage your subscription anytime in Settings → Subscription.',
      }),
    });
    return { sent: true };
  } catch (err) {
    console.error('[Lifecycle email] send failed:', err?.message);
    return { sent: false, reason: 'send_failed', error: err?.message };
  }
}

/**
 * Trial ending reminder.
 * Stripe automatically fires `customer.subscription.trial_will_end` 3 days
 * before the trial converts. Use this to give the user one last heads-up
 * before they get charged.
 */
async function sendTrialEndingEmail(user, opts = {}) {
  const trialEndStr = fmtDate(opts.trialEnd) || 'in a few days';
  const amountStr = fmtMoney(opts.amount, opts.currency) || `the ${planLabel(opts.plan)} price`;
  const label = planLabel(opts.plan);
  const portalUrl = `${getClientUrl()}/settings?tab=subscription`;

  const content = `
    <p>Hi <strong>${user.name || 'there'}</strong>,</p>
    <p>Quick heads-up — your free <strong>${label}</strong> trial wraps up on <strong>${trialEndStr}</strong>.</p>
    <p>If you stay on, we'll charge ${amountStr}/month to the card on file. Nothing else to do — every feature stays on, your tests, zones and Strava sync all keep flowing.</p>
    <p>If LaChart isn't clicking for you, cancel any time before ${trialEndStr} and you won't be billed a cent. One click in Settings → Subscription.</p>
    <p style="margin-top: 18px; padding: 12px 16px; background-color: #E9ECF6; border-radius: 10px; font-size: 14.5px; color: #1D2C4C;">
      <strong>Used the trial yet?</strong> Try the <a href="${getClientUrl()}/workout-planner" style="color: #767EB5; font-weight: 600; text-decoration: none;">workout planner</a> or run an
      <a href="${getClientUrl()}/lactate-curve-calculator" style="color: #767EB5; font-weight: 600; text-decoration: none;">interval-tagged lactate test</a>
      before you decide. They're the two features paying users use most.
    </p>
    <p style="margin-top: 18px;">Either way — thanks for giving it a real go.</p>
    <p style="margin-top: 6px;">— Jakub<br/><span style="color: #6B7280; font-size: 14px;">Creator of LaChart</span></p>
  `;

  return send(user, {
    subject: `${label} trial ends ${trialEndStr} — keep going?`,
    title: `Trial ends ${trialEndStr}`,
    content,
    buttonText: 'Manage subscription',
    buttonUrl: portalUrl,
    footerText: `Cancel any time before ${trialEndStr} and you won't be charged.`,
  });
}

/**
 * Payment receipt (recurring charge).
 * Stripe sends its own PDF invoice when "Email invoices" is enabled in the
 * Dashboard — this is a short friendly note in addition to that. Skip the
 * $0 trial activation invoice (handled by sendPremiumActivationEmail).
 */
async function sendPaymentReceiptEmail(user, opts = {}) {
  // Don't double-email on trial activation.
  if (!opts.amount || opts.amount === 0) return { sent: false, reason: 'zero_amount' };

  const amountStr = fmtMoney(opts.amount, opts.currency);
  const periodStr = fmtDate(opts.periodEnd) || null;
  const label = planLabel(opts.plan);
  const hostedInvoice = opts.invoiceUrl; // hosted_invoice_url from Stripe
  const invoicePdf = opts.invoicePdf;    // invoice_pdf from Stripe

  const invoiceBlock = (hostedInvoice || invoicePdf)
    ? `<p style="margin-top:16px;">📄 ${hostedInvoice
        ? `<a href="${hostedInvoice}">View your invoice</a>`
        : ''}${hostedInvoice && invoicePdf ? ' · ' : ''}${invoicePdf
        ? `<a href="${invoicePdf}">Download PDF</a>`
        : ''}</p>`
    : '';

  const content = `
    <p>Hi <strong>${user.name || 'there'}</strong>,</p>
    <p>Your ${label} subscription renewed. Charged <strong>${amountStr}</strong> to the card on file — thanks for sticking around.</p>
    ${periodStr ? `<p style="color: #4A5E82; font-size: 14.5px;">Your plan is paid through <strong>${periodStr}</strong>.</p>` : ''}
    ${invoiceBlock}
    <p style="margin-top: 22px;">Questions about the bill, or wrong amount? Reply to this email — it lands straight in my inbox.</p>
    <p style="margin-top: 6px;">— Jakub<br/><span style="color: #6B7280; font-size: 14px;">Creator of LaChart</span></p>
  `;

  return send(user, {
    subject: `Receipt — ${amountStr} for ${label}`,
    title: `Thanks — payment received`,
    content,
    buttonText: 'Open my dashboard',
    buttonUrl: `${getClientUrl()}/dashboard`,
  });
}

/**
 * Payment failed.
 * Stripe will retry on a schedule (Smart Retries); this just lets the user
 * know to fix their card before access is suspended.
 */
async function sendPaymentFailedEmail(user, opts = {}) {
  const amountStr = fmtMoney(opts.amount, opts.currency) || 'your subscription';
  const label = planLabel(opts.plan);
  const portalUrl = `${getClientUrl()}/settings?tab=subscription`;

  const content = `
    <p>Hi <strong>${user.name || 'there'}</strong>,</p>
    <p>Heads-up — we couldn't charge your card for ${amountStr} on your ${label} subscription.</p>
    <p>Most common reasons: the card expired, the bank declined, or insufficient funds. We'll automatically retry a few times over the next week, so your premium access stays on for now.</p>
    <p style="margin-top: 18px; padding: 12px 16px; background-color: #FFE6DF; border-radius: 10px; border-left: 4px solid #FF6B4A; color: #1D2C4C; font-size: 14.5px;">
      <strong style="color: #0A0E1A;">Fix it in 30 seconds:</strong> open Settings → Subscription → Manage billing and update your card. We'll retry the charge immediately.
    </p>
    <p style="margin-top: 22px;">Stuck on the billing portal? Reply to this email — I'll sort it manually.</p>
    <p style="margin-top: 6px;">— Jakub<br/><span style="color: #6B7280; font-size: 14px;">Creator of LaChart</span></p>
  `;

  return send(user, {
    subject: `Action needed — payment failed for ${label}`,
    title: `Card on file didn't work`,
    content,
    buttonText: 'Update payment method',
    buttonUrl: portalUrl,
  });
}

/**
 * Subscription canceled (either by user, by Stripe due to repeated failures,
 * or because cancel_at_period_end has elapsed).
 */
async function sendSubscriptionCanceledEmail(user, opts = {}) {
  const label = planLabel(opts.plan);
  const endedStr = fmtDate(opts.endedAt) || 'today';

  const content = `
    <p>Hi <strong>${user.name || 'there'}</strong>,</p>
    <p>Your <strong>${label}</strong> subscription wrapped up on <strong>${endedStr}</strong>. Your account is back on the Free plan — every test, every zone, every workout you've already created stays in the account. Nothing deleted.</p>
    <p>If something specific drove the decision, I'd genuinely want to hear it. Replies to this email come straight to my inbox — even one line helps.</p>
    <p style="margin-top: 18px; padding: 12px 16px; background-color: #E9ECF6; border-radius: 10px; font-size: 14.5px; color: #1D2C4C;">
      <strong style="color: #0A0E1A;">Changed your mind?</strong> One click from Settings → Subscription gets you back on ${label} with the same price you had before.
    </p>
    <p style="margin-top: 22px;">Thanks for trying LaChart.</p>
    <p style="margin-top: 6px;">— Jakub<br/><span style="color: #6B7280; font-size: 14px;">Creator of LaChart</span></p>
  `;

  return send(user, {
    subject: `${label} ended — your data is still here`,
    title: `${label} ended`,
    content,
    buttonText: 'Reactivate any time',
    buttonUrl: `${getClientUrl()}/settings?tab=subscription`,
    loginButtonText: 'Open my dashboard',
    loginButtonUrl: `${getClientUrl()}/dashboard`,
  });
}

/**
 * User clicked "Cancel subscription" — confirmation that the cancel is
 * scheduled and access continues until the period ends.
 *
 * Distinct from sendSubscriptionCanceledEmail() which fires when access has
 * actually ended (from customer.subscription.deleted webhook).
 */
async function sendCancelScheduledEmail(user, opts = {}) {
  const label = planLabel(opts.plan);
  const endStr = fmtDate(opts.endsAt) || 'the end of your current billing period';
  const portalUrl = `${getClientUrl()}/settings?tab=subscription`;

  const content = `
    <p>Hi <strong>${user.name || 'there'}</strong>,</p>
    <p>Cancel is on the books — your <strong>${label}</strong> subscription will end on <strong>${endStr}</strong>. Until then nothing changes: every premium feature stays on, your data stays put.</p>
    <p>Change of heart? One click from Settings → Subscription before ${endStr} and the cancel is undone, no extra charges, same price.</p>
    <p style="margin-top: 18px; padding: 12px 16px; background-color: #E9ECF6; border-radius: 10px; font-size: 14.5px; color: #1D2C4C;">
      <strong style="color: #0A0E1A;">If you have 30 seconds:</strong> what made you cancel? Reply with one sentence — replies land directly with me, and feedback like yours is how LaChart actually improves.
    </p>
    <p style="margin-top: 22px;">— Jakub<br/><span style="color: #6B7280; font-size: 14px;">Creator of LaChart</span></p>
  `;

  return send(user, {
    subject: `Cancel scheduled — ${label} ends ${endStr}`,
    title: `Cancel scheduled`,
    content,
    buttonText: 'Manage subscription',
    buttonUrl: portalUrl,
    footerText: `Premium access stays on until ${endStr}.`,
  });
}

/**
 * User clicked "Reactivate" after previously scheduling a cancellation.
 * Sub continues uninterrupted; this is the receipt that the cancel was undone.
 */
async function sendReactivatedEmail(user, opts = {}) {
  const label = planLabel(opts.plan);
  const renewStr = fmtDate(opts.renewsAt) || null;
  const portalUrl = `${getClientUrl()}/settings?tab=subscription`;

  const content = `
    <p>Hi <strong>${user.name || 'there'}</strong>,</p>
    <p>Welcome back. Your <strong>${label}</strong> subscription is active again — every premium feature is back on, no charges in between.</p>
    ${renewStr ? `<p>Next renewal is set for <strong>${renewStr}</strong>. Same card, same price.</p>` : ''}
    <p style="margin-top: 18px;">Quick reminder of what we shipped while you were away:</p>
    <ul style="color: #4A5E82; font-size: 14.5px; line-height: 1.7;">
      <li><a href="${getClientUrl()}/workout-planner" style="color: #767EB5; font-weight: 600; text-decoration: none;">Structured workout planner</a> in the calendar</li>
      <li><a href="${getClientUrl()}/training-calendar" style="color: #767EB5; font-weight: 600; text-decoration: none;">Per-interval lactate</a> on any saved workout</li>
      <li>Auto-categorize workouts from Strava / FIT uploads</li>
      <li>Form / fitness / TSB tracking over weeks</li>
    </ul>
    <p style="margin-top: 18px;">Cancelling again is one click from Settings → Subscription any time, no questions.</p>
    <p style="margin-top: 6px;">— Jakub<br/><span style="color: #6B7280; font-size: 14px;">Creator of LaChart</span></p>
  `;

  return send(user, {
    subject: `Welcome back — ${label} reactivated`,
    title: `Back on ${label}`,
    content,
    buttonText: 'Open my dashboard',
    buttonUrl: `${getClientUrl()}/dashboard`,
    loginButtonText: 'Manage subscription',
    loginButtonUrl: portalUrl,
  });
}

module.exports = {
  sendTrialEndingEmail,
  sendPaymentReceiptEmail,
  sendPaymentFailedEmail,
  sendSubscriptionCanceledEmail,
  sendCancelScheduledEmail,
  sendReactivatedEmail,
};
