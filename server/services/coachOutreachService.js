/**
 * coachOutreachService.js
 *
 * Personal (not bulk) outreach to the two warmest groups in the database.
 *
 * WHY THESE PEOPLE: measured 2026-08-05 across 650 users — 437 ran a lactate
 * test, but only 85 ever received a subscription record and just 2 pay. Nothing
 * in the product asks the people who already got value.
 *
 *   coach   — already manages 2+ athletes, i.e. past what the free plan covers.
 *             37 of them, covering 150 athletes. They use a paid capability
 *             weekly and have a business reason to pay.
 *   athlete — not premium, Strava connected AND has run a lactate test. They
 *             did the hard part; the 30-day history cap is what they keep
 *             bumping into.
 *
 * DESIGN: one person at a time, triggered by a human from the admin dashboard,
 * with a preview of the exact rendered email first. Deliberately NOT a
 * scheduler — a blast would spend the one chance to convert these lists.
 * Nothing in this file sends anything on its own.
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

/**
 * Feature lines shown in both emails. Wording mirrors
 * client/src/constants/marketingFeatures.js so the email never promises
 * something the marketing pages describe differently.
 */
const FEATURES = {
  coach: [
    ['📈', 'Historical test comparison', 'Overlay every test per athlete and watch LT1 / LT2 shift over a season.'],
    ['🗓️', 'Workout planner', 'Build structured sessions from the zones a test produced, drop them on an athlete\'s calendar.'],
    ['🫀', 'Readiness & wellness', 'Resting HR, HRV and sleep from Garmin, Strava or Apple Health feed daily readiness.'],
    ['👥', 'Unlimited athletes', 'No per-seat surprises, full history for everyone you coach.'],
    ['📄', 'Branded test reports', 'Export a PDF of the curve, zones and thresholds to hand to an athlete.'],
  ],
  athlete: [
    ['📈', 'Compare every test', 'One curve is a snapshot. Overlay tests and watch your thresholds actually move.'],
    ['🗓️', 'Workout planner', 'Structured intervals built from your own zones, straight onto the calendar.'],
    ['📊', 'Full training history', 'Your whole Strava archive instead of the last 30 days — form, fitness and load.'],
    ['🫀', 'Readiness & wellness', 'Resting HR, HRV and sleep turned into a daily readiness signal.'],
    ['🏁', 'Race countdown & CTL target', 'See whether your fitness is tracking toward race day.'],
  ],
};

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
 * userIds holding an active or trialing subscription. Loaded once per scan —
 * resolving premium per user would mean a query per row.
 */
async function premiumUserIdSet() {
  const mongoose = require('mongoose');
  const subs = await mongoose.connection.db.collection('subscriptions')
    .find({ status: { $in: ['active', 'trialing'] }, plan: { $nin: [null, 'free'] } })
    .project({ userId: 1 })
    .toArray();
  return new Set(subs.map((s) => String(s.userId)));
}

/** Coaches already past the free athlete allowance, richest first. */
async function findQualifiedCoaches({ minAthletes = MIN_ATHLETES } = {}) {
  const [coaches, premium] = await Promise.all([
    User.find({ role: 'coach' })
      .select('_id name email createdAt lastLogin notifications outreach')
      .lean(),
    premiumUserIdSet(),
  ]);

  const rows = [];
  for (const c of coaches) {
    if (premium.has(String(c._id))) continue;
    const athleteCount = await User.countDocuments({ coachId: c._id });
    if (athleteCount < minAthletes) continue;

    const athletes = await User.find({ coachId: c._id }).select('_id name').lean();
    const athleteIds = athletes.map((a) => String(a._id));
    const testCount = await Test.countDocuments({ athleteId: { $in: [...athleteIds, String(c._id)] } });

    rows.push({
      segment: 'coach',
      userId: String(c._id),
      name: c.name || '',
      email: c.email,
      athleteCount,
      testCount,
      athleteNames: athletes.map((a) => a.name).filter(Boolean).slice(0, 6),
      createdAt: c.createdAt || null,
      lastLogin: c.lastLogin || null,
      alreadySentAt: c.outreach?.coachOutreachSentAt || null,
      optedOut: c.notifications?.marketingEmails === false,
    });
  }
  rows.sort((a, b) => b.athleteCount - a.athleteCount || b.testCount - a.testCount);
  return rows;
}

/**
 * Athletes who already did the hard part: connected Strava AND ran a test, but
 * are not paying. The 30-day history cap is what they keep hitting.
 */
async function findQualifiedAthletes() {
  const [users, premium, testedIds] = await Promise.all([
    User.find({ 'strava.accessToken': { $exists: true, $ne: null } })
      .select('_id name email role createdAt lastLogin notifications outreach strava')
      .lean(),
    premiumUserIdSet(),
    Test.distinct('athleteId'),
  ]);
  const tested = new Set(testedIds.map(String));

  const rows = [];
  for (const u of users) {
    const id = String(u._id);
    if (premium.has(id)) continue;
    if (!tested.has(id)) continue;

    rows.push({
      segment: 'athlete',
      userId: id,
      name: u.name || '',
      email: u.email,
      role: u.role || 'athlete',
      testCount: await Test.countDocuments({ athleteId: id }),
      stravaConnected: true,
      createdAt: u.createdAt || null,
      lastLogin: u.lastLogin || null,
      lastStravaSync: u.strava?.lastSyncDate || null,
      alreadySentAt: u.outreach?.athleteOutreachSentAt || null,
      optedOut: u.notifications?.marketingEmails === false,
    });
  }
  // Most engaged first — tests done, then most recently seen.
  rows.sort((a, b) =>
    b.testCount - a.testCount ||
    new Date(b.lastLogin || 0) - new Date(a.lastLogin || 0));
  return rows;
}

async function findCandidates(segment = 'coach', opts = {}) {
  return segment === 'athlete' ? findQualifiedAthletes() : findQualifiedCoaches(opts);
}

function subjectFor(person) {
  if (person.segment === 'athlete') {
    const first = firstNameOf(person);
    return `${first || 'Hi'} — your lactate test deserves more than 30 days of history`;
  }
  const n = person.athleteCount;
  return `${firstNameOf(person) || 'Hi'} — a Coach plan for the ${n} athlete${n === 1 ? '' : 's'} you're running in LaChart`;
}

function featureRows(segment) {
  return (FEATURES[segment] || FEATURES.athlete).map(([icon, title, body]) => `
    <tr>
      <td valign="top" style="width:30px;padding:9px 0;font-size:18px;line-height:1.3;">${icon}</td>
      <td valign="top" style="padding:9px 0;font-size:14px;line-height:1.55;color:${BRAND.text};">
        <strong style="color:${BRAND.ink};font-size:15px;">${escapeHtml(title)}</strong><br/>
        <span style="color:${BRAND.muted};">${escapeHtml(body)}</span>
      </td>
    </tr>`).join('');
}

/** Opening paragraph — the part that must feel written, not generated. */
function openingFor(person) {
  if (person.segment === 'athlete') {
    const t = person.testCount;
    return `I'm Jakub, I build LaChart. You've got Strava connected and
      <strong>${escapeHtml(String(t))} lactate test${t === 1 ? '' : 's'}</strong> logged — that's the part most
      people never get to, and it means your zones are real numbers rather than a formula.`;
  }
  const n = person.athleteCount;
  const names = person.athleteNames?.length
    ? `${escapeHtml(person.athleteNames.slice(0, 3).join(', '))}${n > 3 ? ` and ${n - 3} more` : ''}`
    : `${n} athletes`;
  const testLine = person.testCount > 0
    ? ` Between you and your athletes there are <strong>${person.testCount} lactate test${person.testCount === 1 ? '' : 's'}</strong> in LaChart.`
    : '';
  return `I'm Jakub, I build LaChart. I noticed you're coaching
    <strong>${escapeHtml(String(n))} athlete${n === 1 ? '' : 's'}</strong> here — ${names}.${testLine}`;
}

function secondParagraphFor(person) {
  return person.segment === 'athlete'
    ? `The free plan keeps the last 30 days and a single test, which is exactly where the
       interesting part starts — a second test is what turns a curve into a trend, and your
       Strava history is what turns training into form and fitness.`
    : `That's well past what the free plan is meant to cover, and I'd rather offer you the
       Coach plan properly than quietly limit you.`;
}

/**
 * Personal-letter layout on purpose: light branding, no countdown, no urgency.
 * It should read like the founder wrote it, because he did.
 */
function renderOutreachHtml(person, { unsubscribeUrl, loginUrl }) {
  const greet = firstNameOf(person) ? `Hi ${escapeHtml(firstNameOf(person))},` : 'Hi,';
  // Names must match PLAN_DETAILS in client/src/components/UpgradeModal.jsx —
  // the `pro` plan is presented to users as "Athlete", never as "Pro".
  const planName = person.segment === 'coach' ? 'Coach plan' : 'Athlete plan';
  const scale = person.segment === 'coach'
    ? `Coaching ${escapeHtml(String(person.athleteCount))} athlete${person.athleteCount === 1 ? '' : 's'} is real work`
    : 'Testing properly takes effort';

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${escapeHtml(subjectFor(person))}</title></head>
<body style="margin:0;padding:0;background:${BRAND.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:${BRAND.text};-webkit-font-smoothing:antialiased;">
  <div style="max-width:560px;margin:0 auto;padding:28px 16px 48px;">

    <div style="text-align:center;margin-bottom:22px;">
      <span style="display:inline-block;padding:6px 14px;border-radius:999px;background:${BRAND.primary};color:#fff;font-size:11px;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;">LaChart</span>
    </div>

    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${BRAND.surface};border:1px solid ${BRAND.border};border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(10,14,26,0.06);">
      <tr><td style="padding:32px 30px 8px;">
        <p style="margin:0 0 16px;font-size:16px;line-height:1.6;">${greet}</p>
        <p style="margin:0 0 16px;font-size:16px;line-height:1.6;">${openingFor(person)}</p>
        <p style="margin:0 0 16px;font-size:16px;line-height:1.6;">${secondParagraphFor(person)}</p>
      </td></tr>

      <tr><td style="padding:4px 30px 8px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${BRAND.primaryTint};border-radius:14px;">
          <tr><td style="padding:18px 20px;">
            <div style="font-size:12px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:${BRAND.primaryDark};margin-bottom:6px;">What ${escapeHtml(planName)} unlocks</div>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0">${featureRows(person.segment)}</table>
          </td></tr>
        </table>
      </td></tr>

      <tr><td style="padding:16px 30px 4px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px dashed ${BRAND.accent};border-radius:14px;background:#FFF6F3;">
          <tr><td style="padding:16px 20px;text-align:center;">
            <div style="font-size:17px;font-weight:800;color:${BRAND.ink};margin-bottom:4px;">2 months free</div>
            <div style="font-size:14px;color:${BRAND.muted};line-height:1.6;">
              ${escapeHtml(scale)} — take the first two months on me, and only keep it if it earns its place.
            </div>
          </td></tr>
        </table>
      </td></tr>

      <tr><td style="padding:18px 30px 6px;">
        <p style="margin:0 0 18px;font-size:16px;line-height:1.6;">
          If it's useful, reply to this email and I'll set it up for you — and if something's
          missing for how you ${person.segment === 'coach' ? 'coach' : 'train'}, tell me and I'll look at building it.
        </p>
        <div style="text-align:center;padding:6px 0 6px;">
          <!-- Signs them straight in and lands on their subscription page: a
               login wall here is exactly where a warm click goes cold. -->
          <a href="${escapeHtml(loginUrl)}" style="display:inline-block;background:${BRAND.accent};color:#fff;text-decoration:none;padding:15px 30px;border-radius:12px;font-weight:700;font-size:16px;box-shadow:0 2px 8px rgba(255,107,74,0.35);">See ${escapeHtml(planName)} — 2 months free</a>
        </div>
        <p style="margin:14px 0 0;font-size:12px;color:${BRAND.muted};text-align:center;">
          That link signs you in automatically — no password needed.
        </p>
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
async function renderPreview(segment, userId) {
  const all = segment === 'athlete'
    ? await findQualifiedAthletes()
    : await findQualifiedCoaches({ minAthletes: 1 });
  const person = all.find((c) => c.userId === String(userId));
  if (!person) return null;

  const { buildEmailLoginUrl } = require('../routes/emailLoginRoutes');
  return {
    to: person.email,
    subject: subjectFor(person),
    html: renderOutreachHtml(person, {
      unsubscribeUrl: unsubscribeUrlFor(person.userId),
      loginUrl: buildEmailLoginUrl(person.userId, '/settings?tab=subscription'),
    }),
    person,
  };
}

/** Send to exactly one person. One click at a time — no batch path by design. */
async function sendOutreach(segment, userId, { force = false, overrideEmail = null } = {}) {
  const preview = await renderPreview(segment, userId);
  if (!preview) return { sent: false, reason: 'not_a_qualified_recipient' };
  const { person } = preview;

  if (person.optedOut) return { sent: false, reason: 'opted_out' };
  if (person.alreadySentAt && !force) {
    return { sent: false, reason: 'already_sent', alreadySentAt: person.alreadySentAt };
  }

  const transporter = createEmailTransporter();
  if (!transporter) return { sent: false, reason: 'email_not_configured' };

  try {
    await transporter.sendMail({
      from: { name: 'Jakub — LaChart', address: process.env.EMAIL_USER },
      to: overrideEmail || person.email,
      replyTo: process.env.EMAIL_USER,
      subject: preview.subject,
      html: preview.html,
      headers: {
        'List-Unsubscribe': `<${unsubscribeUrlFor(person.userId)}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    });
  } catch (e) {
    return { sent: false, reason: 'send_failed', error: e?.message };
  }

  // Only record real sends, so a test to your own inbox can't mark someone done.
  if (!overrideEmail) {
    const field = segment === 'athlete'
      ? 'outreach.athleteOutreachSentAt'
      : 'outreach.coachOutreachSentAt';
    const update = { [field]: new Date() };
    if (segment === 'coach') update['outreach.coachOutreachAthleteCount'] = person.athleteCount;
    await User.findByIdAndUpdate(person.userId, update).catch(() => {});
  }

  return { sent: true, to: overrideEmail || person.email, subject: preview.subject };
}

async function getOutreachStats(segment = 'coach') {
  const list = await findCandidates(segment);
  const base = {
    segment,
    qualified: list.length,
    alreadySent: list.filter((c) => c.alreadySentAt).length,
    optedOut: list.filter((c) => c.optedOut).length,
    remaining: list.filter((c) => !c.alreadySentAt && !c.optedOut).length,
  };
  if (segment === 'coach') {
    base.minAthletes = MIN_ATHLETES;
    base.totalAthletesCovered = list.reduce((s, c) => s + c.athleteCount, 0);
  } else {
    base.totalTests = list.reduce((s, c) => s + c.testCount, 0);
  }
  return base;
}

module.exports = {
  findCandidates,
  findQualifiedCoaches,
  findQualifiedAthletes,
  renderPreview,
  renderOutreachHtml,
  sendOutreach,
  getOutreachStats,
  subjectFor,
};
