/**
 * The second cold letter, to the coaches who opened the first one.
 *
 * 373 were written to. 109 opened it, one registered, nobody replied. A 29%
 * open rate on cold B2B is not a delivery problem — the letter was read and
 * put down. The first one asked a question ("where do your test results end
 * up?") on the theory that a question is easier to answer than a pitch. On
 * this list it got nothing, so this one does the opposite: one concrete number
 * and what it costs them.
 *
 * It never alludes to the first mail having been opened. Open tracking is how
 * the audience was chosen; saying so out loud turns a cold mail into a creepy
 * one, and there is no version of that sentence that reads well.
 *
 * One letter, then the lead is finished with either way. A stranger who has
 * ignored you twice has answered.
 *
 * ON THE PRICE CLAIM: the comparison names a practice rather than a company.
 * Metering lactate tests is what the category does and the numbers below are
 * the going rate, but asserting a named competitor's current price in cold
 * mail is a claim that goes stale and that somebody may one day ask you to
 * stand behind. Re-read PER_TEST_RANGE before enabling the scheduler.
 */

'use strict';

const CoachOutreachLead = require('../models/CoachOutreachLead');
const { createCampaignTransporter, campaignSender } = require('../utils/createEmailTransporter');
const {
  firstNameFromEmail, listClause, unsubscribeUrlFor, isDeliverableShape,
} = require('./coachTesterOutreachService');
const { shouldFollowUp, warmth } = require('../utils/outreachFollowUpEligibility');

const SITE = 'https://lachart.net';
const CAMPAIGN_ID = 'coach-followup-2026-10';

/** Dated. Verify before enabling — see the note at the top of this file. */
const PER_TEST_RANGE = '€3–6';
const COACH_PRICE = '€14.99';

function subjectFor() {
  return 'What a lactate test costs you, per test';
}

function bodyLines(lead) {
  const greet = firstNameFromEmail(lead.email);
  return [
    greet ? `Hi ${greet},` : 'Hi,',
    '',
    'Jakub again, from LaChart. One more and then I will leave you alone.',
    '',
    'Last time I asked a vague question. Here is the concrete version.',
    '',
    `Most software that stores lactate tests meters them — a handful included, `
      + `then ${PER_TEST_RANGE} per test after that, on top of a subscription `
      + 'that is already tiered by how many athletes you coach. Twenty tests in '
      + 'a month is a second invoice.',
    '',
    `LaChart does not meter tests. ${COACH_PRICE} a month, unlimited athletes, `
      + 'unlimited tests. It takes a step test, works out LT1 and LT2, builds the '
      + "zones, and sends sessions to the athlete's Garmin.",
    '',
    'That is the whole difference, and it is the only reason I am writing again.',
    '',
    `${SITE}`,
    '',
    'If testing is not really your thing, one line saying so and I will take you '
      + 'off the list myself.',
    '',
    'Jakub Stadnik',
  ];
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function renderText(lead) {
  return [
    ...bodyLines(lead), '', '—',
    `Not interested? Unsubscribe: ${unsubscribeUrlFor(lead._id)}`,
  ].join('\n');
}

/**
 * Deliberately plain: no image, no button, no brand furniture. The first
 * campaign's own notes are explicit that a first message from a stranger that
 * looks like a newsletter gets filed as one, and this is the same stranger.
 */
function renderHtml(lead) {
  const body = bodyLines(lead)
    .map((l) => (l === '' ? '<p style="margin:0 0 14px;"></p>'
      : `<p style="margin:0 0 14px;">${escapeHtml(l)}</p>`))
    .join('');
  return `<!doctype html><html><body style="margin:0;padding:18px;background:#fff;">
<div style="font-family:-apple-system,system-ui,'Segoe UI',sans-serif;font-size:15px;line-height:23px;color:#1D2C4C;max-width:560px;">
${body}
<p style="margin:22px 0 0;font-size:12px;color:#6B7280;">—<br>
Not interested? <a href="${unsubscribeUrlFor(lead._id)}" style="color:#6B7280;">Unsubscribe</a>.</p>
</div></body></html>`;
}

function preview(lead) {
  return {
    to: lead.email,
    subject: subjectFor(lead),
    text: renderText(lead),
    html: renderHtml(lead),
  };
}

/** Openers who have not answered, warmest first. */
async function findFollowUpLeads({ limit = 10, minGapDays } = {}) {
  const rows = await CoachOutreachLead.find({
    opens: { $gte: 1 },
    sentCount: { $gte: 1 },
    unsubscribed: { $ne: true },
    responded: { $ne: true },
    registered: { $ne: true },
    followUpCount: { $in: [0, null] },
  }).lean();

  return rows
    .filter((l) => isDeliverableShape(l.email))
    .filter((l) => shouldFollowUp(l, minGapDays == null ? {} : { minGapDays }).ok)
    .sort((a, b) => warmth(b) - warmth(a))
    .slice(0, limit);
}

async function sendFollowUp(lead, { overrideEmail = null, dryRun = false } = {}) {
  const verdict = shouldFollowUp(lead);
  if (!overrideEmail && !verdict.ok) return { sent: false, reason: verdict.reason };

  const p = preview(lead);
  if (dryRun) return { sent: false, reason: 'dry_run', to: overrideEmail || lead.email, subject: p.subject };

  const transporter = createCampaignTransporter();
  if (!transporter) return { sent: false, reason: 'transporter_unavailable' };

  try {
    await transporter.sendMail({
      from: { ...campaignSender(), name: 'Jakub Stadnik' },
      to: overrideEmail || lead.email,
      subject: p.subject,
      text: p.text,
      html: p.html,
      headers: {
        'List-Unsubscribe': `<${unsubscribeUrlFor(lead._id)}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    });
    // A test to myself must not burn the lead — same rule as the first campaign.
    if (!overrideEmail) {
      await CoachOutreachLead.updateOne({ _id: lead._id }, {
        $set: { followUpSentAt: new Date(), bulkCampaignId: CAMPAIGN_ID },
        $inc: { followUpCount: 1, sentCount: 1 },
      });
    }
    console.log(`[coachFollowUp] sent to ${overrideEmail || lead.email}`);
    return { sent: true, to: overrideEmail || lead.email, subject: p.subject };
  } catch (e) {
    if (e?.skipped || e?.permanent) return { sent: false, reason: e.reason || 'unreachable' };
    console.error(`[coachFollowUp] failed for ${lead.email}:`, e?.message || e);
    return { sent: false, reason: 'send_failed', message: e?.message };
  }
}

async function getStats() {
  const [openers, done, ready] = await Promise.all([
    CoachOutreachLead.countDocuments({
      opens: { $gte: 1 }, unsubscribed: { $ne: true },
      responded: { $ne: true }, registered: { $ne: true },
    }),
    CoachOutreachLead.countDocuments({ followUpCount: { $gte: 1 } }),
    findFollowUpLeads({ limit: 1000 }),
  ]);
  return { openersStillCold: openers, alreadyFollowedUp: done, readyNow: ready.length };
}

module.exports = {
  findFollowUpLeads, sendFollowUp, preview, getStats,
  subjectFor, renderText, renderHtml, CAMPAIGN_ID, PER_TEST_RANGE,
};
