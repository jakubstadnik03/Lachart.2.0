/**
 * "Your lactate curve is here" — one email per athlete whose test is sitting in
 * LaChart while they have never once opened it.
 *
 * WHO THIS IS FOR
 * A coach tests an athlete, types the step test into LaChart and sends the PDF.
 * The account created for that athlete then goes untouched: the curve, the
 * thresholds and the zones exist, and the person they describe has never seen
 * the screen that draws them. 242 accounts with a test have never signed in.
 *
 * So this takes their own curve to them, rather than asking them to come and
 * find it. It is not a newsletter and not an upsell — the whole message is
 * "here is the thing that was measured on you", and the button opens it.
 *
 * WHAT KEEPS IT HONEST
 *   · **Their real test**, drawn by the same renderer the report email uses.
 *     No estimates, no modelled lactate — if the curve cannot be drawn from at
 *     least four usable points, the person is skipped rather than sent a
 *     flattering sketch.
 *   · **Only people who really never saw it.** loginCount alone is not proof:
 *     32 of the 88 reachable accounts had finished the walkthrough or connected
 *     Strava, which means they did use the app and the counter is simply not
 *     reliable. Anyone carrying a trace of use is excluded — telling someone
 *     they have never opened LaChart when they have is worse than silence.
 *   · **One click in.** These accounts have no password, and a login wall is
 *     where this email would die. The CTA carries a signed one-click token
 *     (routes/emailLoginRoutes.js) that lands them on their own test.
 *   · **Once, ever.** State lives in retentionEmails.savedCurveSent.
 *
 * HOW IT RUNS
 * Admin-triggered only: there is no scheduler and nothing auto-sends. The pool
 * is finite (it is a backlog, not a flow), so it is picked over by hand from
 * the admin routes in routes/emailCampaignRoutes.js.
 */

'use strict';

const crypto = require('crypto');
const User = require('../models/UserModel');
const Test = require('../models/test');
const { createCampaignTransporter, campaignSender } = require('../utils/createEmailTransporter');
const { getClientUrl } = require('../utils/emailTemplate');
const { buildLactateCurveSvg, svgToEmailImgSrc, escapeHtml } = require('../utils/lactateReportSvgs');
const { calculateThresholds } = require('../utils/lactateThresholds');
const { formatPace } = require('../utils/lactateZones');
const { buildEmailLoginUrl } = require('../routes/emailLoginRoutes');

const UTM_CAMPAIGN = '2026-09-saved-curve';
const SENT_KEY = 'savedCurveSent';

/** A curve needs shape. Below this the drawing says nothing the numbers don't. */
const MIN_CURVE_POINTS = 4;
/** Don't write to someone whose coach is still mid-session with them. */
const MIN_TEST_AGE_HOURS = 12;

/**
 * Sanity bounds, because this email quotes the data back at the person it was
 * measured on and a typo becomes a sentence.
 *
 * Both of these were found by rendering the real pool rather than reasoning
 * about it: one test is dated 2626, another is dated 1997, and one bike test
 * tops out at 52 W — which the threshold maths dutifully turned into
 * "LT2 at 52 W". Quoting any of those is worse than quoting nothing.
 */
const TEST_DATE_MIN = new Date('2015-01-01').getTime();
/** Watts. The real pool runs 70–510 W, so this only catches broken rows. */
const PLAUSIBLE_WATTS = [80, 700];
/** Seconds per km. 2:30 to 12:00. */
const PLAUSIBLE_RUN_PACE = [150, 720];
/** Seconds per 100 m. 0:45 to 5:00. */
const PLAUSIBLE_SWIM_PACE = [45, 300];
/** LT2 has to sit clear of LT1, or the pair is noise dressed as a finding. */
const MIN_GAP_WATTS = 10;
const MIN_GAP_PACE_SEC = 5;
/**
 * Threshold heart rates are interpolated between stages, and on a short test
 * they can land a couple of beats apart — "LT1 130 bpm / LT2 132 bpm" reads as
 * a broken number to anyone who trains by heart rate. Shown only when the two
 * are far enough apart to mean something.
 */
const PLAUSIBLE_HR = [80, 220];
const MIN_GAP_HR = 5;

const SPORT_WORD = { bike: 'cycling', run: 'running', swim: 'swimming' };

const BRAND = {
  primary: '#767EB5', primaryDark: '#5E6590', primaryTint: '#E9ECF6',
  ink: '#0A0E1A', text: '#1D2C4C', muted: '#6B7280',
  bg: '#F3F4F6', surface: '#FFFFFF', border: '#E5E7EB',
  lt1: '#0EA5E9', lt2: '#F97316',
};

/* ─── links ───────────────────────────────────────────────────────────── */

function utmQs() {
  return `utm_source=email&utm_medium=lifecycle&utm_campaign=${encodeURIComponent(UTM_CAMPAIGN)}`;
}

function unsubscribeTokenFor(userId) {
  const secret = process.env.JWT_SECRET || process.env.UNSUBSCRIBE_SECRET || 'lachart-unsub';
  return crypto.createHmac('sha256', secret).update(String(userId)).digest('hex').slice(0, 24);
}

function unsubscribeUrlFor(userId) {
  const base = (process.env.SERVER_PUBLIC_URL || 'https://lachart.onrender.com').replace(/\/+$/, '');
  return `${base}/api/email/unsubscribe?u=${encodeURIComponent(String(userId))}&t=${unsubscribeTokenFor(userId)}`;
}

/**
 * One-click entry, landing on Testing rather than the dashboard: the email
 * promised a curve, so the curve is what has to be on screen when it opens.
 */
function openCurveUrl(userId) {
  return buildEmailLoginUrl(userId, `/testing?${utmQs()}`);
}

/* ─── formatting ──────────────────────────────────────────────────────── */

function fmtDate(dateLike) {
  try {
    return new Date(dateLike).toLocaleDateString('en-GB', {
      day: 'numeric', month: 'long', year: 'numeric',
    });
  } catch { return ''; }
}

/**
 * Thresholds are stored as watts for bike and as pace-seconds for run/swim,
 * the same convention the report email formats against.
 */
function fmtIntensity(value, sport, unitSystem = 'metric') {
  if (!Number.isFinite(value) || value <= 0) return null;
  if (sport === 'bike') return `${Math.round(value)} W`;
  const pace = formatPace(value);
  if (sport === 'swim') return `${pace}${unitSystem === 'imperial' ? '/100yd' : '/100m'}`;
  return `${pace}${unitSystem === 'imperial' ? '/mile' : '/km'}`;
}

function xLabelFor(sport, unitSystem = 'metric') {
  if (sport === 'bike') return 'Power (W)';
  if (sport === 'swim') return `Pace (${unitSystem === 'imperial' ? 'min/100yd' : 'min/100m'})`;
  if (sport === 'run') return `Pace (${unitSystem === 'imperial' ? 'min/mile' : 'min/km'})`;
  return 'Intensity';
}

/* ─── eligibility ─────────────────────────────────────────────────────── */

/**
 * Traces that the account has actually been used, whatever loginCount says.
 * Any one of these disqualifies the "you have never opened it" premise.
 */
function showsAppUse(u) {
  const o = u.onboarding || {};
  return Boolean(
    o.walkthroughDone || o.basicProfileDone || o.unitsDone || o.trainingZonesDone
    || o.featureTourDone || o.welcomePaywallDone || o.whatsNewSeenTag
    || u.strava?.athleteId || u.garmin?.athleteId || u.appleHealth?.connectedAt
    || u.mobileApp?.firstSeenAt || (u.expoPushTokens || []).length
    || u.avatar || u.isRegistrationComplete === true || u.emailVerified === true
    || u.premium === true || u.subscriptionId,
  );
}

function neverSignedIn(u) {
  return !(Number(u.loginCount) > 0) && !u.lastLogin && !u.lastSeenAt;
}

function isReachable(u) {
  if (!u?.email || !/.+@.+\..+/.test(String(u.email))) return false;
  if (u.isActive === false) return false;
  if (u.notifications?.emailNotifications === false) return false;
  return true;
}

/** Usable rows: a lactate reading against an intensity. */
function usablePoints(test) {
  return (test?.results || []).filter(
    (r) => Number(r.lactate) > 0 && Number(r.power) > 0,
  ).length;
}

/** A date we are willing to print in a sentence. */
function plausibleDate(dateLike) {
  const t = new Date(dateLike || 0).getTime();
  if (!Number.isFinite(t)) return false;
  return t >= TEST_DATE_MIN && t <= Date.now() + 24 * 3600 * 1000;
}

/** The threshold heart rates, or nulls when the pair says nothing. */
function plausibleHeartRates(hr1, hr2) {
  const inBand = (v) => Number.isFinite(v) && v >= PLAUSIBLE_HR[0] && v <= PLAUSIBLE_HR[1];
  if (!inBand(hr1) || !inBand(hr2)) return { lt1Hr: null, lt2Hr: null };
  if (hr2 - hr1 < MIN_GAP_HR) return { lt1Hr: null, lt2Hr: null };
  return { lt1Hr: hr1, lt2Hr: hr2 };
}

/**
 * Whether the LT1/LT2 pair is worth quoting. Returns the pair or nulls — the
 * curve is still the athlete's real data, so a failure here drops the
 * thresholds and keeps the drawing rather than dropping the person.
 */
function plausibleThresholds(lt1, lt2, sport) {
  const ok = (v, [lo, hi]) => Number.isFinite(v) && v >= lo && v <= hi;
  const drop = { lt1: null, lt2: null };

  if (sport === 'bike') {
    if (!ok(lt1, PLAUSIBLE_WATTS) || !ok(lt2, PLAUSIBLE_WATTS)) return drop;
    // More watts is harder, so LT2 sits above LT1.
    if (!(lt2 - lt1 >= MIN_GAP_WATTS)) return drop;
    return { lt1, lt2 };
  }

  const band = sport === 'swim' ? PLAUSIBLE_SWIM_PACE : PLAUSIBLE_RUN_PACE;
  if (!ok(lt1, band) || !ok(lt2, band)) return drop;
  // Pace is seconds, so faster is smaller: LT2 is the lower number.
  if (!(lt1 - lt2 >= MIN_GAP_PACE_SEC)) return drop;
  return { lt1, lt2 };
}

/**
 * The test this email is about: their most recent one that can actually be
 * drawn. A newer but unusable test does not hide an older good one.
 */
function pickTest(tests) {
  const cutoff = Date.now() - MIN_TEST_AGE_HOURS * 3600 * 1000;
  return [...(tests || [])]
    .filter((t) => usablePoints(t) >= MIN_CURVE_POINTS)
    .filter((t) => plausibleDate(t.date))
    .filter((t) => new Date(t.createdAt || t.date || 0).getTime() <= cutoff)
    .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))[0] || null;
}

/**
 * Everything the email needs, or null when this person should not get one.
 * @param {object} user  a lean user document
 * @param {object} [o]
 * @param {boolean} [o.skipEligibility]  admin preview — build it regardless
 */
async function describeFor(user, { skipEligibility = false } = {}) {
  if (!user) return null;
  if (!skipEligibility) {
    if (!isReachable(user)) return null;
    if (!neverSignedIn(user)) return null;
    if (showsAppUse(user)) return null;
    if (user.retentionEmails?.[SENT_KEY]) return null;
  }

  const tests = await Test.find({ athleteId: String(user._id) })
    .select('date createdAt sport title baseLactate results unitSystem inputMode')
    .lean();
  const test = pickTest(tests);
  if (!test) return null;

  const sport = test.sport || 'bike';
  const unitSystem = test.unitSystem || 'metric';
  const thr = calculateThresholds(test) || {};
  const checked = plausibleThresholds(Number(thr.LTP1), Number(thr.LTP2), sport);
  const { lt1, lt2 } = checked;

  // Who put the test there — named when we know, because "your coach" is the
  // reason this email is not cold.
  //
  // Except when the coach and the athlete are the same person. Coaches open a
  // second athlete-role account to test themselves on, and there are a dozen
  // of those: writing "Jonatas Gondaski created a LaChart account for you" to
  // Jonatas Gondaski is the kind of sentence that discredits the whole email.
  // Matching on the full name catches it even across two separate accounts.
  let coachName = null;
  const coachId = user.coachId || (user.coachIds || [])[0] || null;
  if (coachId && String(coachId) !== String(user._id)) {
    const coach = await User.findById(coachId).select('name surname').lean().catch(() => null);
    // Names in this collection carry stray whitespace ("Jonatas " / "gondaski"),
    // so the comparison has to collapse it or the match silently never fires.
    const full = (o) => [o?.name, o?.surname].filter(Boolean).join(' ')
      .replace(/\s+/g, ' ').trim().toLowerCase();
    if (coach && full(coach) && full(coach) !== full(user)) {
      coachName = [coach.name, coach.surname].filter(Boolean).join(' ').trim() || null;
    }
  }

  return {
    user,
    test,
    sport,
    unitSystem,
    testCount: tests.length,
    coachName,
    lt1,
    lt2,
    // Heart rates belong to the thresholds; if those were dropped as
    // implausible, their bpm has nothing left to label.
    ...(lt1 && lt2
      ? plausibleHeartRates(Number(thr.heartRates?.LTP1), Number(thr.heartRates?.LTP2))
      : { lt1Hr: null, lt2Hr: null }),
    points: usablePoints(test),
  };
}

/* ─── the email ───────────────────────────────────────────────────────── */

function subjectFor(d) {
  const when = fmtDate(d.test.date);
  const lt2 = fmtIntensity(d.lt2, d.sport, d.unitSystem);
  if (lt2) return `Your lactate curve from ${when} — LT2 at ${lt2}`;
  return `Your lactate curve from ${when} is in LaChart`;
}

function thresholdRow(label, value, hr, color) {
  if (!value) return '';
  return `
    <td style="padding:0 8px;">
      <div style="border-left:3px solid ${color};padding:2px 0 2px 10px;">
        <div style="font:600 11px/1.2 -apple-system,Segoe UI,Roboto,sans-serif;color:${BRAND.muted};letter-spacing:.06em;text-transform:uppercase;">${label}</div>
        <div style="font:700 20px/1.3 -apple-system,Segoe UI,Roboto,sans-serif;color:${BRAND.ink};">${escapeHtml(value)}</div>
        ${hr ? `<div style="font:400 12px/1.3 -apple-system,Segoe UI,Roboto,sans-serif;color:${BRAND.muted};">${Math.round(hr)} bpm</div>` : ''}
      </div>
    </td>`;
}

/**
 * The plain-text half of the message.
 *
 * Sent alongside the HTML, not instead of it. A message with no text/plain part
 * is a small mark against it at every filter — mail-tester docks it under "the
 * body of your message contains errors" — and it is what a screen reader, a
 * watch and a text-only client actually read. It says the same things in the
 * same order, minus the drawing.
 */
/**
 * Names arrive from the profile as typed, and plenty were typed in caps —
 * "MICAELA", "GIANNIS PSARELIS". Greeting somebody in block capitals reads as a
 * mail merge, which is the one thing this email must not look like.
 *
 * Only strings that are entirely uppercase are touched: a name the person
 * capitalised themselves (McBride, van der Berg) is left exactly as written,
 * because guessing at those does more harm than the caps ever did.
 */
function prettyName(raw) {
  const v = String(raw || '').trim().replace(/\s+/g, ' ');
  if (!v) return '';
  if (v !== v.toUpperCase()) return v;
  return v
    .toLowerCase()
    .replace(/(^|[\s'\u2019-])([a-zà-ÿ])/g, (m, sep, ch) => sep + ch.toUpperCase());
}

function renderText(d) {
  const first = prettyName(d.user.name).split(' ')[0];
  const sportWord = SPORT_WORD[d.sport] || d.sport;
  const when = fmtDate(d.test.date);
  const lt1 = fmtIntensity(d.lt1, d.sport, d.unitSystem);
  const lt2 = fmtIntensity(d.lt2, d.sport, d.unitSystem);

  const lines = [
    first ? `Hi ${first},` : 'Hi there,',
    '',
    'This is the curve measured on you.',
    '',
    d.coachName
      ? `${prettyName(d.coachName)} saved your ${sportWord} step test from ${when} in LaChart, with your thresholds and training zones worked out from it. You have not opened it yet, so here it is.`
      : `Your ${sportWord} step test from ${when} is saved in LaChart, with your thresholds and training zones worked out from it. You have not opened it yet, so here it is.`,
  ];

  if (lt1 || lt2) {
    lines.push('');
    if (lt1) lines.push(`LT1 (aerobic threshold): ${lt1}${d.lt1Hr ? ` at ${Math.round(d.lt1Hr)} bpm` : ''}`);
    if (lt2) lines.push(`LT2 (anaerobic threshold): ${lt2}${d.lt2Hr ? ` at ${Math.round(d.lt2Hr)} bpm` : ''}`);
  }

  lines.push(
    '',
    'Open your curve:',
    openCurveUrl(d.user._id),
    'That link signs you in — there is no password to remember.',
    '',
    'What is in there: your curve and both thresholds, the training zones that follow'
      + ' from them, and — once you connect Garmin or Strava — every session you ride or'
      + ' run measured against those zones.',
    '',
    `You are getting this because ${prettyName(d.coachName) || 'a coach'} created a LaChart account for you when your test was saved.`,
    `Unsubscribe: ${unsubscribeUrlFor(d.user._id)}`,
  );
  return lines.join('\n');
}

async function renderHtml(d) {
  const first = prettyName(d.user.name).split(' ')[0];
  const greet = first ? `Hi ${escapeHtml(first)},` : 'Hi there,';
  const sportWord = SPORT_WORD[d.sport] || d.sport;
  const when = fmtDate(d.test.date);
  const cta = openCurveUrl(d.user._id);
  const unsub = unsubscribeUrlFor(d.user._id);

  const svg = buildLactateCurveSvg({
    results: d.test.results || [],
    sportLabel: `${String(d.sport).toUpperCase()} • Your lactate curve`,
    xLabel: xLabelFor(d.sport, d.unitSystem),
    sport: d.sport,
    unitSystem: d.unitSystem,
    inputMode: d.test.inputMode || 'pace',
    ...(d.lt1 ? { lt1: { x: d.lt1, color: BRAND.lt1, label: 'LT1' } } : {}),
    ...(d.lt2 ? { lt2: { x: d.lt2, color: BRAND.lt2, label: 'LT2' } } : {}),
  });
  const chart = svg ? await svgToEmailImgSrc(svg) : null;

  const lt1Txt = fmtIntensity(d.lt1, d.sport, d.unitSystem);
  const lt2Txt = fmtIntensity(d.lt2, d.sport, d.unitSystem);
  const hasThresholds = Boolean(lt1Txt || lt2Txt);

  const who = d.coachName
    ? `${escapeHtml(prettyName(d.coachName))} saved your ${escapeHtml(sportWord)} step test from ${when} in LaChart`
    : `Your ${escapeHtml(sportWord)} step test from ${when} is saved in LaChart`;

  const more = d.testCount > 1
    ? `<p style="margin:0 0 14px;font:400 15px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;color:${BRAND.text};">
         You have ${d.testCount} tests on file, so the app can already show you what moved between them.
       </p>`
    : '';

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>Your lactate curve</title></head>
<body style="margin:0;padding:0;background:${BRAND.bg};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(
    lt2Txt ? `LT2 ${lt2Txt} — the curve measured on you on ${when}.` : `The curve measured on you on ${when}.`,
  )}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.bg};padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:${BRAND.surface};border-radius:14px;overflow:hidden;border:1px solid ${BRAND.border};">

        <tr><td style="background:${BRAND.primary};padding:18px 26px;">
          <div style="font:700 17px/1.2 -apple-system,Segoe UI,Roboto,sans-serif;color:#fff;letter-spacing:-.01em;">LaChart</div>
        </td></tr>

        <tr><td style="padding:26px 26px 0;">
          <p style="margin:0 0 14px;font:400 15px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;color:${BRAND.text};">${greet}</p>
          <h1 style="margin:0 0 12px;font:700 23px/1.3 -apple-system,Segoe UI,Roboto,sans-serif;color:${BRAND.ink};letter-spacing:-.01em;">
            This is the curve measured on you.
          </h1>
          <p style="margin:0 0 14px;font:400 15px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;color:${BRAND.text};">
            ${who} — with your thresholds and training zones worked out from it. You have not opened it yet, so here it is.
          </p>
          ${more}
        </td></tr>

        ${chart ? `<tr><td style="padding:14px 26px 0;">
          <img src="${chart}" alt="Your lactate curve from ${escapeHtml(when)}" width="528"
               style="display:block;width:100%;max-width:528px;height:auto;border:1px solid ${BRAND.border};border-radius:10px;"/>
        </td></tr>` : ''}

        ${hasThresholds ? `<tr><td style="padding:18px 18px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
            ${thresholdRow('LT1 — aerobic threshold', lt1Txt, d.lt1Hr, BRAND.lt1)}
            ${thresholdRow('LT2 — anaerobic threshold', lt2Txt, d.lt2Hr, BRAND.lt2)}
          </tr></table>
        </td></tr>` : ''}

        <tr><td style="padding:22px 26px 0;">
          <a href="${cta}" style="display:inline-block;background:${BRAND.primary};color:#fff;text-decoration:none;font:600 15px/1 -apple-system,Segoe UI,Roboto,sans-serif;padding:14px 26px;border-radius:10px;">
            Open your curve →
          </a>
          <p style="margin:10px 0 0;font:400 13px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:${BRAND.muted};">
            That link signs you in — there is no password to remember.
          </p>
        </td></tr>

        <tr><td style="padding:22px 26px 0;">
          <div style="background:${BRAND.primaryTint};border-radius:10px;padding:16px 18px;">
            <p style="margin:0 0 6px;font:600 13px/1.4 -apple-system,Segoe UI,Roboto,sans-serif;color:${BRAND.primaryDark};">What is in there</p>
            <p style="margin:0;font:400 14px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;color:${BRAND.text};">
              Your curve and both thresholds, the training zones that follow from them, and — once you connect Garmin or
              Strava — every session you ride or run measured against those zones.
            </p>
          </div>
        </td></tr>

        <tr><td style="padding:22px 26px 26px;">
          <p style="margin:0;font:400 13px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;color:${BRAND.muted};">
            You are getting this because ${d.coachName ? `${escapeHtml(prettyName(d.coachName))} created` : 'a coach created'} a LaChart account for you when your test was saved.
            <a href="${unsub}" style="color:${BRAND.muted};text-decoration:underline;">Unsubscribe</a> ·
            <a href="${getClientUrl()}" style="color:${BRAND.muted};text-decoration:underline;">lachart.net</a>
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body></html>`;
}

/* ─── sending ─────────────────────────────────────────────────────────── */

/**
 * @param {object} user  lean user document
 * @param {object} [o]
 * @param {boolean} [o.dryRun]          build it, send nothing
 * @param {boolean} [o.track]           stamp so it never repeats
 * @param {boolean} [o.skipEligibility] admin override for a chosen recipient
 * @param {string}  [o.testTo]          send their email to this address instead
 */
async function sendSavedCurve(user, {
  dryRun = false, track = true, skipEligibility = false, testTo = null,
} = {}) {
  const d = await describeFor(user, { skipEligibility });
  if (!d) return { sent: false, reason: 'not_eligible' };

  const subject = subjectFor(d);
  const html = await renderHtml(d);
  const text = renderText(d);
  if (dryRun) return { sent: false, reason: 'dry_run', subject, sport: d.sport };

  const transporter = createCampaignTransporter();
  if (!transporter) return { sent: false, reason: 'transporter_unavailable' };

  const to = testTo || user.email;
  try {
    const info = await transporter.sendMail({
      from: { ...campaignSender(), name: 'LaChart' },
      to,
      subject: testTo ? `[TEST → ${user.email}] ${subject}` : subject,
      html,
      text,
      headers: {
        'List-Unsubscribe': `<${unsubscribeUrlFor(user._id)}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    });
    const accepted = Array.isArray(info?.accepted) ? info.accepted : [];
    const rejected = Array.isArray(info?.rejected) ? info.rejected : [];
    if (!accepted.some((a) => String(a).toLowerCase() === String(to).toLowerCase()) || rejected.length) {
      return { sent: false, reason: 'relay_rejected', smtp: { accepted, rejected } };
    }

    // A test send is a copy to the admin, not a delivery to the athlete — it
    // must never consume their one send.
    if (track && !testTo) {
      await User.updateOne({ _id: user._id }, {
        $set: { [`retentionEmails.${SENT_KEY}`]: new Date() },
      });
    }

    console.log(`[savedCurve] sent to ${to}${testTo ? ` (test for ${user.email})` : ''}`);
    return { sent: true, to, subject, sport: d.sport };
  } catch (e) {
    console.error(`[savedCurve] failed for ${to}:`, e?.message || e);
    return { sent: false, reason: 'send_failed', message: e?.message };
  }
}

/* ─── the pool ────────────────────────────────────────────────────────── */

/**
 * Everyone who has a test but has never opened LaChart.
 *
 * Driven off the tests collection rather than the users collection: the pool is
 * defined by "has a test", and there are 800-odd users against 780-odd tests,
 * so starting from distinct athleteIds is both smaller and exact.
 */
async function findCandidates({ includeSent = false } = {}) {
  const athleteIds = await Test.distinct('athleteId');
  const ids = athleteIds
    .map((v) => String(v))
    .filter((v) => /^[0-9a-fA-F]{24}$/.test(v));
  if (!ids.length) return [];

  const users = await User.find({ _id: { $in: ids } }).lean();
  const out = [];
  for (const u of users) {
    if (!isReachable(u)) continue;
    if (!neverSignedIn(u)) continue;
    if (showsAppUse(u)) continue;
    if (!includeSent && u.retentionEmails?.[SENT_KEY]) continue;
    const d = await describeFor(u, { skipEligibility: true });
    if (!d) continue;
    out.push(d);
  }
  return out.sort((a, b) => new Date(b.test.date || 0) - new Date(a.test.date || 0));
}

function candidateRow(d) {
  return {
    userId: String(d.user._id),
    name: [d.user.name, d.user.surname].filter(Boolean).join(' ') || '(no name)',
    email: d.user.email,
    role: d.user.role,
    coachName: d.coachName,
    sport: d.sport,
    testDate: d.test.date,
    testTitle: d.test.title,
    testCount: d.testCount,
    points: d.points,
    lt1: fmtIntensity(d.lt1, d.sport, d.unitSystem),
    lt2: fmtIntensity(d.lt2, d.sport, d.unitSystem),
    alreadySent: d.user.retentionEmails?.[SENT_KEY] || null,
    subject: subjectFor(d),
  };
}

async function listCandidates({ limit = 100 } = {}) {
  const all = await findCandidates();
  return { total: all.length, candidates: all.slice(0, limit).map(candidateRow) };
}

/** How big the backlog is, how much of it is done, and why the rest is out. */
async function getCampaignStats() {
  const athleteIds = (await Test.distinct('athleteId'))
    .map((v) => String(v))
    .filter((v) => /^[0-9a-fA-F]{24}$/.test(v));
  const users = await User.find({ _id: { $in: athleteIds } })
    .select('email isActive notifications loginCount lastLogin lastSeenAt onboarding strava.athleteId '
          + 'garmin.athleteId appleHealth.connectedAt mobileApp.firstSeenAt expoPushTokens avatar '
          + 'isRegistrationComplete emailVerified premium subscriptionId retentionEmails')
    .lean();

  const dormant = users.filter(neverSignedIn);
  const reachable = dormant.filter(isReachable);
  const clean = reachable.filter((u) => !showsAppUse(u));
  const sent = clean.filter((u) => u.retentionEmails?.[SENT_KEY]).length;
  const ready = await listCandidates({ limit: 0 });

  return {
    withTests: users.length,
    neverSignedIn: dormant.length,
    noEmailOnFile: dormant.length - dormant.filter((u) => u.email).length,
    reachable: reachable.length,
    excludedAsAppUsers: reachable.length - clean.length,
    alreadySent: sent,
    ready: ready.total,
  };
}

/* ─── admin entry points ──────────────────────────────────────────────── */

async function previewForUser(userId) {
  const user = await User.findById(userId).lean();
  if (!user) return null;
  const d = await describeFor(user, { skipEligibility: true });
  if (!d) return { error: 'no_drawable_test' };
  return { subject: subjectFor(d), html: await renderHtml(d), row: candidateRow(d) };
}

async function sendToUser(userId, { testTo = null } = {}) {
  const user = await User.findById(userId).lean();
  if (!user) return { sent: false, reason: 'user_not_found' };
  return sendSavedCurve(user, { skipEligibility: true, testTo, track: !testTo });
}

/** Deliberately serial with a pause: this relay is a shared mailbox, not a bulk sender. */
async function sendToMany(userIds, { pauseMs = 1200 } = {}) {
  const results = [];
  for (const id of userIds.slice(0, 25)) {
    /* eslint-disable no-await-in-loop */
    const r = await sendToUser(id).catch((e) => ({ sent: false, reason: 'threw', message: e?.message }));
    results.push({ userId: String(id), ...r });
    if (pauseMs) await new Promise((res) => setTimeout(res, pauseMs));
    /* eslint-enable no-await-in-loop */
  }
  return {
    attempted: results.length,
    sent: results.filter((r) => r.sent).length,
    failed: results.filter((r) => !r.sent).length,
    results,
  };
}

module.exports = {
  sendSavedCurve,
  sendToUser,
  sendToMany,
  listCandidates,
  findCandidates,
  previewForUser,
  describeFor,
  getCampaignStats,
  subjectFor,
  renderHtml,
  renderText,
  unsubscribeUrlFor,
  SENT_KEY,
};
