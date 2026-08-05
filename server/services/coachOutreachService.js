/**
 * coachOutreachService.js
 *
 * Personal (not bulk) outreach to coaches who are already past the free plan's
 * athlete limit.
 *
 * WHY THESE PEOPLE: measured 2026-08-05 across 650 users — 437 ran a lactate
 * test, but only 85 ever received a subscription record and just 2 pay. The
 * single most qualified group in the database is coaches already managing 2+
 * athletes (37 of them): they use a paid-tier capability every week and have a
 * business reason to pay, unlike a solo athlete.
 *
 * DESIGN: one coach at a time, triggered by a human from the admin dashboard,
 * with a preview of the exact rendered email first. Deliberately NOT a
 * scheduler — a blast to this group would waste the one chance to convert
 * them. Nothing in this file sends anything on its own.
 */

'use strict';

const crypto = require('crypto');
const User = require('../models/UserModel');
const Test = require('../models/test');
const { createEmailTransporter } = require('../utils/createEmailTransporter');

const BRAND = {
  primary: '#767EB5',
  primaryDark: '#5E6590',
  primaryTint: '#E9ECF6',
  accent: '#FF6B4A',
  ink: '#0A0E1A',
  text: '#1D2C4C',
  muted: '#6B7280',
  bg: '#F3F4F6',
  surface: '#FFFFFF',
  border: '#E5E7EB',
};

/** Coaches at or above this many athletes are past the free plan's allowance. */
const MIN_ATHLETES = Number(process.env.COACH_OUTREACH_MIN_ATHLETES || 2);

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function getClientUrl() {
  return (process.env.CLIENT_URL || 'https://lachart.net').replace(/\/+$/, '');
}

function unsubscribeTokenFor(userId) {
  const secret = process.env.JWT_SECRET || process.env.EMAIL_UNSUBSCRIBE_SECRET || 'lachart';
  return crypto.createHmac('sha256', secret).update(String(userId)).digest('hex').slice(0, 32);
}

function unsubscribeUrlFor(userId) {
  const base = (process.env.SERVER_PUBLIC_URL || 'https://lachart.onrender.com').replace(/\/+$/, '');
  return `${base}/api/email/unsubscribe?u=${encodeURIComponent(String(userId))}&t=${unsubscribeTokenFor(userId)}`;
}

function firstNameOf(user) {
  const n = String(user?.name || '').trim();
  return n ? n.split(/\s+/)[0] : '';
}

/**
 * Coaches worth a personal email, richest first, with the numbers that make the
 * message specific ("you're coaching 6 athletes" beats "upgrade now").
 */
async function findQualifiedCoaches({ minAthletes = MIN_ATHLETES } = {}) {
  const coaches = await User.find({ role: 'coach' })
    .select('_id name email createdAt lastLogin notifications outreach')
    .lean();

  const rows = [];
  for (const c of coaches) {
    const athleteCount = await User.countDocuments({ coachId: c._id });
    if (athleteCount < minAthletes) continue;

    const athletes = await User.find({ coachId: c._id }).select('_id name').lean();
    const athleteIds = athletes.map((a) => String(a._id));
    const testCount = await Test.countDocuments({
      athleteId: { $in: [...athleteIds, String(c._id)] },
    });

    rows.push({
      userId: String(c._id),
      name: c.name || '',
      email: c.email,
      athleteCount,
      testCount,
      athleteNames: athletes.map((a) => a.name).filter(Boolean).slice(0, 6),
      createdAt: c.createdAt || null,
      lastLogin: c.lastLogin || null,
      // Surfaced so the admin never emails the same person twice by accident.
      alreadySentAt: c.outreach?.coachOutreachSentAt || null,
      optedOut: c.notifications?.marketingEmails === false,
    });
  }

  rows.sort((a, b) => b.athleteCount - a.athleteCount || b.testCount - a.testCount);
  return rows;
}

function subjectFor(coach) {
  const n = coach.athleteCount;
  return `${firstNameOf(coach) || 'Hi'} — a Coach plan for the ${n} athlete${n === 1 ? '' : 's'} you're running in LaChart`;
}

/**
 * Personal-letter layout on purpose: light branding, no feature grid, no
 * countdown. It should read like the founder wrote it, because he did.
 */
function renderOutreachHtml(coach, { unsubscribeUrl }) {
  const greet = firstNameOf(coach) ? `Hi ${escapeHtml(firstNameOf(coach))},` : 'Hi,';
  const n = coach.athleteCount;
  const athleteLine = coach.athleteNames?.length
    ? `${escapeHtml(coach.athleteNames.slice(0, 3).join(', '))}${n > 3 ? ` and ${n - 3} more` : ''}`
    : `${n} athletes`;
  const testLine = coach.testCount > 0
    ? `Between you and your athletes there are <strong>${coach.testCount} lactate test${coach.testCount === 1 ? '' : 's'}</strong> in LaChart.`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${escapeHtml(subjectFor(coach))}</title></head>
<body style="margin:0;padding:0;background:${BRAND.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:${BRAND.text};-webkit-font-smoothing:antialiased;">
  <div style="max-width:560px;margin:0 auto;padding:28px 16px 48px;">

    <div style="text-align:center;margin-bottom:22px;">
      <span style="display:inline-block;padding:6px 14px;border-radius:999px;background:${BRAND.primary};color:#fff;font-size:11px;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;">LaChart</span>
    </div>

    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${BRAND.surface};border:1px solid ${BRAND.border};border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(10,14,26,0.06);">
      <tr><td style="padding:32px 30px 8px;">
        <p style="margin:0 0 16px;font-size:16px;line-height:1.6;">${greet}</p>
        <p style="margin:0 0 16px;font-size:16px;line-height:1.6;">
          I'm Jakub, I build LaChart. I noticed you're coaching
          <strong>${escapeHtml(String(n))} athlete${n === 1 ? '' : 's'}</strong> here — ${athleteLine}.
          ${testLine}
        </p>
        <p style="margin:0 0 16px;font-size:16px;line-height:1.6;">
          That's well past what the free plan is meant to cover, and I'd rather offer you the
          Coach plan properly than quietly limit you.
        </p>
      </td></tr>

      <tr><td style="padding:4px 30px 8px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${BRAND.primaryTint};border-radius:14px;">
          <tr><td style="padding:18px 20px;">
            <div style="font-size:12px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:${BRAND.primaryDark};margin-bottom:10px;">What the Coach plan adds</div>
            <div style="font-size:15px;line-height:1.7;color:${BRAND.text};">
              • Unlimited athletes, no per-seat surprises<br/>
              • Full training history instead of the last 30 days<br/>
              • Unlimited lactate tests and threshold comparisons<br/>
              • Workout planning and structured sessions for every athlete
            </div>
          </td></tr>
        </table>
      </td></tr>

      <tr><td style="padding:20px 30px 6px;">
        <p style="margin:0 0 18px;font-size:16px;line-height:1.6;">
          If it's useful, reply to this email and I'll set it up for you — and if something's
          missing for how you coach, tell me and I'll look at building it.
        </p>
        <div style="text-align:center;padding:6px 0 6px;">
          <a href="${escapeHtml(getClientUrl())}/settings?tab=subscription" style="display:inline-block;background:${BRAND.accent};color:#fff;text-decoration:none;padding:15px 30px;border-radius:12px;font-weight:700;font-size:16px;box-shadow:0 2px 8px rgba(255,107,74,0.35);">See the Coach plan</a>
        </div>
      </td></tr>

      <tr><td style="padding:14px 30px 30px;">
        <p style="margin:0;font-size:15px;line-height:1.6;color:${BRAND.muted};">
          Thanks for using it,<br/><strong style="color:${BRAND.ink};">Jakub</strong> — LaChart
        </p>
      </td></tr>
    </table>

    <div style="text-align:center;margin-top:22px;font-size:12px;color:#9CA3AF;line-height:1.7;">
      <a href="${escapeHtml(unsubscribeUrl)}" style="color:#9CA3AF;text-decoration:underline;">Unsubscribe from product emails</a>
    </div>
  </div>
</body></html>`;
}

/** Rendered preview for the admin dashboard — never sends. */
async function renderPreview(userId) {
  const all = await findQualifiedCoaches({ minAthletes: 1 });
  const coach = all.find((c) => c.userId === String(userId));
  if (!coach) return null;
  return {
    to: coach.email,
    subject: subjectFor(coach),
    html: renderOutreachHtml(coach, { unsubscribeUrl: unsubscribeUrlFor(coach.userId) }),
    coach,
  };
}

/**
 * Send to exactly one coach. Called only from the admin route, one click at a
 * time — there is no batch path and no scheduler by design.
 */
async function sendOutreach(userId, { force = false, overrideEmail = null } = {}) {
  const preview = await renderPreview(userId);
  if (!preview) return { sent: false, reason: 'not_a_qualified_coach' };
  const { coach } = preview;

  if (coach.optedOut) return { sent: false, reason: 'opted_out' };
  if (coach.alreadySentAt && !force) {
    return { sent: false, reason: 'already_sent', alreadySentAt: coach.alreadySentAt };
  }

  const transporter = createEmailTransporter();
  if (!transporter) return { sent: false, reason: 'email_not_configured' };

  try {
    await transporter.sendMail({
      from: { name: 'Jakub — LaChart', address: process.env.EMAIL_USER },
      to: overrideEmail || coach.email,
      replyTo: process.env.EMAIL_USER,
      subject: preview.subject,
      html: preview.html,
      headers: {
        'List-Unsubscribe': `<${unsubscribeUrlFor(coach.userId)}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    });
  } catch (e) {
    return { sent: false, reason: 'send_failed', error: e?.message };
  }

  // Only record real sends, so a test to your own inbox can't mark a coach done.
  if (!overrideEmail) {
    await User.findByIdAndUpdate(coach.userId, {
      'outreach.coachOutreachSentAt': new Date(),
      'outreach.coachOutreachAthleteCount': coach.athleteCount,
    }).catch(() => {});
  }

  return { sent: true, to: overrideEmail || coach.email, subject: preview.subject };
}

async function getOutreachStats() {
  const coaches = await findQualifiedCoaches();
  return {
    minAthletes: MIN_ATHLETES,
    qualified: coaches.length,
    alreadySent: coaches.filter((c) => c.alreadySentAt).length,
    optedOut: coaches.filter((c) => c.optedOut).length,
    remaining: coaches.filter((c) => !c.alreadySentAt && !c.optedOut).length,
    totalAthletesCovered: coaches.reduce((s, c) => s + c.athleteCount, 0),
  };
}

module.exports = {
  findQualifiedCoaches,
  renderPreview,
  renderOutreachHtml,
  sendOutreach,
  getOutreachStats,
  subjectFor,
};
