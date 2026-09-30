/**
 * Cold outreach to coaches, asking them to test the app — not to buy it.
 *
 * The previous attempt is the reason this file is not just "send the old email
 * again". 202 leads were written to between March and June 2026: 0 replies,
 * 1 registration. Four things were wrong with it, and all four are fixable:
 *
 *   1. It went out through createEmailTransporter() — the TRANSACTIONAL Zoho
 *      account. At that point lachart.net had no DKIM record published at all
 *      (Zoho's dashboard said "Verified" from before DNS moved to Vercel), so
 *      every one of those 202 was unsigned bulk mail from a transactional
 *      sender. A cold unsigned blast is a spam-folder delivery in all but name.
 *      Bulk now goes through the Brevo relay, on its own authenticated
 *      subdomain, separately from password resets.
 *   2. No List-Unsubscribe. On cold mail that is both a spam signal and, in the
 *      EU where most of these leads are, a legal problem.
 *   3. It was a branded HTML template with a hero image and an "Open LaChart"
 *      button. That is a newsletter. A first message from a stranger that looks
 *      like a newsletter gets filed as one.
 *   4. It went to clubs' shared inboxes — info@, hello@, the club secretary's
 *      gmail. 106 individual endurance coaches sat in the same table and were
 *      sent nothing. A club inbox has no one in it who decides anything.
 *
 * So: plain text, one ask, a real name on the other end, an unsubscribe header,
 * and only addresses that plausibly reach a person. The ask is feedback rather
 * than a sale, because "tell me what's wrong with this" is a question a busy
 * coach can answer in one line, and "buy my software" is not.
 */

const crypto = require('crypto');
const { emailLinkBase } = require('../utils/emailLinkBase');
const dns = require('dns').promises;
const CoachOutreachLead = require('../models/CoachOutreachLead');
const { createCampaignTransporter, campaignSender } = require('../utils/createEmailTransporter');
const { trackedUrl, trackingPixelUrl } = require('../utils/outreachTracking');

const SITE = 'https://lachart.net';
const APP_STORE = 'https://apps.apple.com/cz/app/lachart/id6764768876';

/**
 * Two screenshots, both hosted on lachart.net, both JPEG.
 *
 * JPEG rather than the site's own WebP because Outlook on Windows renders no
 * WebP at all, and a broken image in a first cold message is worse than no
 * image. They are referenced by URL, not attached, so their weight costs
 * loading time and nothing else — Gmail's 102 KB clipping limit counts the
 * HTML only.
 *
 * Every one carries alt text that says what it shows, because most clients
 * block remote images until the reader trusts the sender — and a first cold
 * message is exactly when they do not. The letter has to survive with all
 * three of these missing, so they illustrate the sentences rather than
 * carrying them.
 */
const SHOTS = {
  curve: {
    url: `${SITE}/screenshots/email/threshold-curve.jpg`,
    alt: 'A lactate step test plotted as a curve, with LT1 and LT2 marked on it',
  },
};

/**
 * Shared inboxes. Mail to these reaches a volunteer who forwards nothing, and
 * it is the single biggest difference between the old list and this one.
 */
/**
 * Words that are never a person, matched as a token ANYWHERE in the local part.
 *
 * The old list was exact-match and English-only, so the campaign worked its way
 * down to it-support@tum.de, shop-muenchen@globetrotter.de, anmeldung@zfos.de
 * and digitale-barrierefreiheit@ba-sz.berlin.de — a letter opening "I'm working
 * through a list of endurance coaches in Munich" landing on a university help
 * desk. Two separate gaps: the non-English role words, and compounds like
 * "info-muc" that ^info$ cannot see.
 *
 * Bounces are the reason this matters beyond embarrassment. Brevo reported
 * 1.82% hard bounces over seven days, against a domain weeks old as a bulk
 * sender; role mailboxes at institutions are both likelier to be dead and
 * likelier to mark mail as spam.
 */
const NEVER_A_PERSON = [
  // English
  'info', 'contact', 'admin', 'office', 'support', 'helpdesk', 'help', 'service',
  'reception', 'frontdesk', 'desk', 'booking', 'bookings', 'enquiries', 'enquiry',
  'sales', 'marketing', 'press', 'media', 'webmaster', 'noreply', 'no-reply',
  'shop', 'store', 'billing', 'invoice', 'accounts', 'accounting', 'finance',
  'jobs', 'careers', 'career', 'recruitment', 'hr', 'privacy', 'legal', 'it',
  'newsletter', 'subscribe', 'general', 'mail', 'post', 'hello', 'welcome',
  // German
  'kontakt', 'anmeldung', 'buero', 'sekretariat', 'vorstand', 'impressum',
  'datenschutz', 'barrierefreiheit', 'eventkalender', 'clubbetreuung',
  'rezeption', 'bestellung', 'verwaltung',
  // Dutch
  'bestuur', 'secretaris', 'secretariaat', 'balie', 'receptie', 'inschrijving',
  // Nordic
  'kundservice', 'kundtjanst', 'resepsjon', 'bestilling', 'bokning', 'booking',
  'kontor', 'medlem', 'medlemskap',
  // Finnish
  'asiakaspalvelu', 'ajanvaraus', 'tilavaraukset', 'toimisto', 'jasenyys',
];
const NEVER_A_PERSON_RE = new RegExp(`(^|[._-])(${NEVER_A_PERSON.join('|')})([._-]|$)`, 'i');

/**
 * Roles blocked only as the WHOLE local part.
 *
 * coaching@ is a department mailbox; coaching.dlc@ is that club's coaching
 * department, which is exactly who this campaign wants. Blocking the compound
 * would throw away the best addresses on the list along with the worst.
 */
const ROLE_EXACT = /^(coach|coaching|training|trainer|tri|run|swim|bike|club|team|chair|membership|secretary|ask|hi)$/i;

/** Types where someone actually runs lactate tests, best first. */
const TESTER_TYPES = [
  'endurance coach',
  'sports performance center',
  'sports clinic',
  'triathlon club',
  'cycling club',
];

function localPartOf(email) {
  return String(email || '').split('@')[0] || '';
}

function isGenericAddress(email) {
  const lp = localPartOf(email).toLowerCase();
  if (NEVER_A_PERSON_RE.test(lp)) return true;
  if (ROLE_EXACT.test(lp)) return true;
  return false;
}

/**
 * A first name to greet, or null.
 *
 * `lead.name` is the business ("Run Unbound", "The Strength Coach Ltd"), never
 * a person — greeting someone as "Hi The Strength Coach Ltd," announces a mail
 * merge in the first three words. The email's local part is the only place a
 * real first name shows up (matt@, andy@, kam@), and only when it looks like
 * one: no digits, no dots, no initials, not a role word.
 */
function firstNameFromEmail(email) {
  const lp = localPartOf(email);
  if (!lp || isGenericAddress(email)) return null;

  // `steve.durham@` and `steve-durham@` are a person as plainly as `steve@` is;
  // take the leading word. A single initial in front (`s.durham@`) is not a
  // name, and the length floor below rejects it.
  const head = lp.split(/[._-]/)[0];
  if (!/^[a-zA-Z]{3,12}$/.test(head)) return null;

  const lower = head.toLowerCase();
  if (TESTER_TYPES.some(t => t.split(' ').includes(lower))) return null;
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/**
 * "endurance coaches in Birmingham" — the group being written to, not a claim
 * about this person.
 *
 * The earlier draft opened "I'm writing because you coach endurance athletes in
 * Birmingham", which asserts something the list cannot actually support: these
 * rows were scraped by category from websites, and nothing in them says this
 * reader runs lactate tests, or still coaches at all. Telling a stranger what
 * they do, wrongly, in the first sentence, ends the email there. Describing the
 * list is true whoever opens it, and it makes the question that follows the
 * natural next line.
 */
function listClause(lead) {
  const city = (lead.city || '').trim();
  const where = city ? ` in ${city}` : '';
  const type = (lead.type || '').trim();
  const group = type === 'sports performance center' ? 'performance centres'
    : type === 'sports clinic' ? 'sports clinics'
    : type === 'triathlon club' ? 'triathlon coaches'
    : type === 'cycling club' ? 'cycling coaches'
    : type === 'running club' ? 'running coaches'
    : type === 'swimming club' ? 'swimming coaches'
    : 'endurance coaches';
  return `${group}${where}`;
}

function unsubscribeTokenFor(id) {
  const secret = process.env.JWT_SECRET || process.env.UNSUBSCRIBE_SECRET || 'lachart-unsub';
  return crypto.createHmac('sha256', secret).update(String(id)).digest('hex').slice(0, 24);
}

function unsubscribeUrlFor(leadId) {
  const base = emailLinkBase();
  return `${base}/api/email/unsubscribe?u=${encodeURIComponent(String(leadId))}&t=${unsubscribeTokenFor(leadId)}&k=lead`;
}

/**
 * A real question, not a pitch.
 *
 * The subject that earned 0 replies from 202 sends was "Free tool for lactate
 * testing coaches - LaChart": a spam-filter word, a product category and a
 * brand name, none of which is about the reader. This one is short, it is
 * genuinely a question, it names no product, and it self-selects — a coach who
 * does not test will ignore it, which is the correct outcome.
 */
function subjectFor() {
  return 'How do you store your lactate test results?';
}


/**
 * The letter. Deliberately short and deliberately ugly: no image, no button, no
 * brand furniture. It has to look like a person typed it, because one did.
 */
function bodyLines(lead) {
  const greet = firstNameFromEmail(lead.email);
  return [
    greet ? `Hi ${greet},` : 'Hi,',
    '',
    `I'm Jakub. I build LaChart on my own, and I'm working through a list of `
      + `${listClause(lead)}, trying to find the ones who actually use lactate testing.`,
    '',
    "If that's you — one question, and a one-line answer is plenty: after you run a "
      + 'step test, where do the numbers end up? A spreadsheet, the analyser\'s own '
      + 'software, on paper?',
    '',
    "I ask because I built the thing below, and I would rather find out it solves a "
      + 'problem you actually have than assume it does. It takes a step test, works out '
      + 'LT1 and LT2, builds the zones from them, and sends the sessions to the '
      + "athlete's Garmin.",
    '',
    `${SITE}`,
    '',
    'Reply and I will set you up with a year of the coach plan — though honestly, '
      + 'the answer is the part I am after.',
    '',
    'Jakub Stadnik',
  ];
}


function renderText(lead) {
  return [...bodyLines(lead), '', '—', `Not interested? Unsubscribe: ${unsubscribeUrlFor(lead._id)}`].join('\n');
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * The HTML part is the plain text in a system font plus one screenshot. It is
 * not a template: no header, no footer, no button, no brand furniture. A first
 * message from a stranger that looks like a newsletter is filed as one.
 */
function shot(leadId, s) {
  return `<a href="${trackedUrl(leadId, SITE)}" style="text-decoration:none">
  <img src="${s.url}" alt="${escapeHtml(s.alt)}" width="524"
       style="display:block;width:100%;max-width:524px;height:auto;border:1px solid #E6E8F0;border-radius:6px;margin:6px 0 18px" />
</a>`;
}

function p(text) {
  const safe = escapeHtml(text).replace(/\n/g, '<br/>');
  return `<p style="margin:0 0 14px">${safe}</p>`;
}

function renderHtml(lead) {
  const unsub = unsubscribeUrlFor(lead._id);
  const greet = firstNameFromEmail(lead.email);
  const site = trackedUrl(lead._id, SITE);

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${escapeHtml(subjectFor())}</title></head>
<body style="margin:0;padding:0;background:#ffffff">
<div style="max-width:560px;margin:0;padding:18px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#1D2C4C">
${p(greet ? `Hi ${greet},` : 'Hi,')}
${p(`I'm Jakub. I build LaChart on my own, and I'm working through a list of `
  + `${listClause(lead)}, trying to find the ones who actually use lactate testing.`)}
${p("If that's you — one question, and a one-line answer is plenty: after you run a step "
  + "test, where do the numbers end up? A spreadsheet, the analyser's own software, on paper?")}
${p('I ask because I built the thing below, and I would rather find out it solves a problem '
  + 'you actually have than assume it does. It takes a step test, works out LT1 and LT2, '
  + "builds the zones from them, and sends the sessions to the athlete's Garmin.")}
${shot(lead._id, SHOTS.curve)}
<p style="margin:0 0 14px">
  <a href="${site}" style="color:#4A5578">lachart.net</a>
  &nbsp;·&nbsp;
  <a href="${trackedUrl(lead._id, APP_STORE)}" style="color:#4A5578">iPhone app</a>
</p>
${p('Reply and I will set you up with a year of the coach plan — though honestly, the '
  + 'answer is the part I am after.')}
${p('Jakub Stadnik')}
<p style="margin:22px 0 0;font-size:12px;color:#8A93AD">
Not interested? <a href="${unsub}" style="color:#8A93AD">Unsubscribe</a> and I won't write again.
</p>
<img src="${trackingPixelUrl(lead._id)}" alt="" width="1" height="1" style="display:block;width:1px;height:1px;border:0" />
</div></body></html>`;
}

/**
 * Candidates, best first. Anything already written to stays out: a second cold
 * email to someone who ignored the first is how a domain earns a reputation.
 */
/**
 * Is this even an address, before we spend a send on it?
 *
 * Hard bounces are the fastest way to wreck a young sending domain's
 * reputation, and this list is scraped, so it contains things that are not
 * addresses at all. Two were found in the first 180 candidates, and they need
 * different checks:
 *
 *   gerard@theaptivmovement       — no TLD. Caught here, by shape.
 *   ku.ca.streh@noitpecer.strops  — reversed; read backwards it is
 *                                   sports.reception@herts.ac.uk. Some sites
 *                                   render addresses right-to-left in CSS to
 *                                   defeat scrapers and ours took the bait.
 *                                   Shape does NOT catch it — ".strops" is a
 *                                   perfectly well-formed six-letter TLD as far
 *                                   as a regex is concerned. Only the MX lookup
 *                                   below does.
 *
 * Neither is repaired automatically. The reversed one is recoverable by eye,
 * but guessing a real organisation's address from a mangled string and then
 * mailing it cold is not a guess worth making — it stays out of the send and
 * can be corrected by hand.
 */
function isDeliverableShape(email) {
  const e = String(email || '').trim();
  if (e.length < 6 || e.length > 254) return false;
  // One @, a label-dotted domain, and a TLD of at least two letters.
  return /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[A-Za-z]{2,}$/.test(e);
}

/**
 * Does this domain accept mail at all?
 *
 * One lookup per domain, cached for the life of the process: a scheduler tick
 * sends fifteen, and the same handful of domains recur across a list scraped
 * from clubs and clinics. A lookup that fails for a reason other than "no such
 * domain" resolves to TRUE — a DNS blip must not permanently drop a real lead
 * from the campaign, and a bounce is recoverable where a silently skipped
 * candidate is not.
 */
const mxCache = new Map();
async function domainAcceptsMail(email) {
  const domain = String(email || '').split('@')[1]?.toLowerCase();
  if (!domain) return false;
  if (mxCache.has(domain)) return mxCache.get(domain);
  let ok = true;
  try {
    const mx = await dns.resolveMx(domain);
    ok = Array.isArray(mx) && mx.length > 0;
  } catch (e) {
    ok = !(e && (e.code === 'ENOTFOUND' || e.code === 'NXDOMAIN'));
  }
  mxCache.set(domain, ok);
  return ok;
}

async function findLeads({ limit = 50, types = TESTER_TYPES, countries = null } = {}) {
  const q = {
    sentCount: 0,
    unsubscribed: { $ne: true },
    email: { $exists: true, $ne: '' },
  };
  if (types?.length) q.type = { $in: types };
  if (countries?.length) q.country = { $in: countries };

  const rows = await CoachOutreachLead.find(q).lean();
  const wellFormed = rows.filter((l) => !isGenericAddress(l.email) && isDeliverableShape(l.email));
  const rank = (l) => {
    const typeScore = Math.max(0, TESTER_TYPES.length - TESTER_TYPES.indexOf(l.type));
    const named = firstNameFromEmail(l.email) ? 3 : 0;
    return typeScore * 10 + named + (Number(l.priority) || 0) / 100;
  };
  // DNS last, and only on the ones we would actually send to: ranking first
  // means the lookups are spent on the head of the list, not all 180.
  const ranked = wellFormed.sort((a, b) => rank(b) - rank(a));
  const out = [];
  for (const lead of ranked) {
    if (out.length >= limit) break;
    // eslint-disable-next-line no-await-in-loop
    if (await domainAcceptsMail(lead.email)) out.push(lead);
    else console.warn('[testerOutreach] skipping, domain has no MX:', lead.email);
  }
  return out;
}

function preview(lead) {
  return {
    to: lead.email,
    subject: subjectFor(lead),
    greetsBy: firstNameFromEmail(lead.email),
    text: renderText(lead),
    html: renderHtml(lead),
  };
}

async function sendToLead(lead, { overrideEmail = null, dryRun = false } = {}) {
  const p = preview(lead);
  if (dryRun) return { sent: false, dryRun: true, to: overrideEmail || lead.email, subject: p.subject };

  const transporter = createCampaignTransporter();
  if (!transporter) return { sent: false, error: 'campaign transporter not configured' };

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

  // Only the real send is recorded — a test to myself must not burn the lead.
  if (!overrideEmail) {
    await CoachOutreachLead.updateOne(
      { _id: lead._id },
      { $set: { lastSentAt: new Date(), bulkCampaignId: 'tester-outreach-2026-09' }, $inc: { sentCount: 1 } },
    );
  }
  return { sent: true, to: overrideEmail || lead.email, subject: p.subject };
}

/**
 * Paced send. The domain is three weeks old as a bulk sender, so this goes out
 * in a trickle: a burst of cold mail from a fresh subdomain is the fastest way
 * to undo the deliverability work it depends on.
 */
async function sendToMany({ limit = 15, pauseMs = 20000, dryRun = false, types, countries } = {}) {
  const leads = await findLeads({ limit, types, countries });
  const results = [];
  for (const lead of leads) {
    try {
      results.push({ email: lead.email, ...(await sendToLead(lead, { dryRun })) });
    } catch (e) {
      results.push({ email: lead.email, sent: false, error: e.message });
    }
    if (!dryRun) await new Promise((r) => setTimeout(r, pauseMs));
  }
  return {
    attempted: results.length,
    sent: results.filter((r) => r.sent).length,
    failed: results.filter((r) => !r.sent && !r.dryRun).length,
    results,
  };
}

module.exports = {
  findLeads,
  preview,
  sendToLead,
  sendToMany,
  subjectFor,
  renderText,
  renderHtml,
  firstNameFromEmail,
  isGenericAddress,
  isDeliverableShape,
  domainAcceptsMail,
  listClause,
  unsubscribeUrlFor,
  TESTER_TYPES,
};
