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
    <p>Your free trial of <strong>${label}</strong> ends on <strong>${trialEndStr}</strong>.</p>
    <p>If you keep your plan, we'll automatically charge ${amountStr}/month using the card you have on file. Nothing to do — your premium features stay on.</p>
    <p>If LaChart isn't for you, you can cancel anytime before ${trialEndStr} and you won't be billed. One click in Settings → Subscription.</p>
    <p style="margin-top:20px;">Either way, thanks for trying it out 🙏</p>
    <p>— Jakub @ LaChart</p>
  `;

  return send(user, {
    subject: `Your ${label} free trial ends ${trialEndStr}`,
    title: `Your free trial is ending soon`,
    content,
    buttonText: 'Manage subscription',
    buttonUrl: portalUrl,
    footerText: `Cancel anytime before ${trialEndStr} to avoid being charged.`,
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
    <p>We just charged <strong>${amountStr}</strong> for your ${label} subscription. Thanks for sticking with us!</p>
    ${periodStr ? `<p style="color:#6B7280; font-size:13px;">Your plan is paid through <strong>${periodStr}</strong>.</p>` : ''}
    ${invoiceBlock}
    <p style="margin-top:20px;">Any questions about your bill? Just reply to this email.</p>
    <p>— Jakub @ LaChart</p>
  `;

  return send(user, {
    subject: `Receipt for ${amountStr} — ${label}`,
    title: `Payment received — ${amountStr}`,
    content,
    buttonText: 'Open LaChart',
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
    <p>We couldn't charge your card for ${amountStr} (${label} subscription).</p>
    <p>This usually means the card expired, the bank blocked the transaction, or there weren't enough funds. We'll automatically retry a few times over the next week.</p>
    <p>To fix it now, open <strong>Settings → Subscription → Manage billing</strong> and update your card. Your premium access stays on while we retry.</p>
    <p>— Jakub @ LaChart</p>
  `;

  return send(user, {
    subject: `Payment failed for ${label}`,
    title: `We couldn't process your payment`,
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
    <p>Your <strong>${label}</strong> subscription ended on <strong>${endedStr}</strong>. Your account is back on the Free plan — you can still log in and view everything you've already created.</p>
    <p>If you change your mind, you can resubscribe in one click from Settings → Subscription. We'd love to hear what's not working — replies to this email come straight to me.</p>
    <p>Thanks for giving LaChart a try.</p>
    <p>— Jakub @ LaChart</p>
  `;

  return send(user, {
    subject: `Your ${label} subscription has ended`,
    title: `${label} subscription ended`,
    content,
    buttonText: 'Open LaChart',
  });
}

module.exports = {
  sendTrialEndingEmail,
  sendPaymentReceiptEmail,
  sendPaymentFailedEmail,
  sendSubscriptionCanceledEmail,
};
