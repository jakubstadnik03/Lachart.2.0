/**
 * "Here is the curve your training implies" — one email per athlete who has
 * never tested, plus an in-app notification and a push.
 *
 * The testing page draws this curve for them already. The problem is that they
 * have to go and look, and the whole reason they have no test is that nothing
 * has yet given them a reason to. So this takes the same estimate to them.
 *
 * It is held to the same standard as the card:
 *
 *   · **The same numbers.** The estimator is the shared module the browser
 *     uses, generated into CommonJS by scripts/sync-shared-utils.js. An email
 *     quoting an LT2 the app then contradicts is worse than no email.
 *   · **Only when there is something to say.** A threshold the athlete typed,
 *     or a best twenty minutes off real rides — not a shrug dressed up as a
 *     number. Low-confidence estimates are skipped rather than hedged.
 *   · **Honest about what it is.** The curve is drawn dashed, the lactate is
 *     named as modelled, and the call to action is to go and test properly.
 *
 * One send per athlete, ever. State lives in retentionEmails.predictedCurveSent.
 */

'use strict';

const crypto = require('crypto');
const User = require('../models/UserModel');
const Test = require('../models/test');
const StravaActivity = require('../models/StravaActivity');
const GarminActivity = require('../models/GarminActivity');
const FitTraining = require('../models/fitTraining');
const { createEmailTransporter } = require('../utils/createEmailTransporter');
const { getClientUrl } = require('../utils/emailTemplate');
const { buildLactateCurveSvg, svgToEmailImgSrc, escapeHtml } = require('../utils/lactateReportSvgs');
const { estimateAnchorFromTraining } = require('../utils/estimateAnchorFromTraining');
const { sendNotification } = require('../utils/notificationHelper');

const UTM_CAMPAIGN = '2026-09-predicted-curve';
const SENT_KEY = 'predictedCurveSent';
const MS_DAY = 24 * 60 * 60 * 1000;

/** Activities older than this describe a different athlete. Matches the card. */
const LOOKBACK_DAYS = 180;
/** One ride says nothing about a threshold; this many is a training history. */
const MIN_ACTIVITIES = 8;
/** A ride has to be this long before its average means anything about threshold. */
const MIN_SUSTAINED_SEC = 20 * 60;
/** Don't write to someone still in their first week. */
const MIN_ACCOUNT_AGE_DAYS = 5;
/** Confidence levels worth putting in front of someone. */
const SENDABLE_CONFIDENCE = new Set(['medium', 'high']);

const SPORT_LABEL = { bike: 'cycling', run: 'running' };

const BRAND = {
  primary: '#767EB5', primaryDark: '#5E6590', primaryTint: '#E9ECF6',
  accent: '#FF6B4A', ink: '#0A0E1A', text: '#1D2C4C', muted: '#6B7280',
  bg: '#F3F4F6', surface: '#FFFFFF', border: '#E5E7EB',
  lt1: '#0EA5E9', lt2: '#F97316',
};

/* ─── small helpers ───────────────────────────────────────────────────── */

function utmQs() { return `utm_source=email&utm_medium=lifecycle&utm_campaign=${encodeURIComponent(UTM_CAMPAIGN)}`; }
function appendUtm(url) { const sep = url.includes('?') ? '&' : '?'; return `${url}${sep}${utmQs()}`; }

function unsubscribeTokenFor(userId) {
  const secret = process.env.JWT_SECRET || process.env.UNSUBSCRIBE_SECRET || 'lachart-unsub';
  return crypto.createHmac('sha256', secret).update(String(userId)).digest('hex').slice(0, 24);
}
function unsubscribeUrlFor(userId) {
  const base = (process.env.SERVER_PUBLIC_URL || 'https://lachart.onrender.com').replace(/\/+$/, '');
  return `${base}/api/email/unsubscribe?u=${encodeURIComponent(String(userId))}&t=${unsubscribeTokenFor(userId)}`;
}

function daysSince(date) { return date ? (Date.now() - new Date(date).getTime()) / MS_DAY : Infinity; }

function fmtPaceSec(sec) {
  const total = Math.round(Number(sec) || 0);
  if (total <= 0) return '—';
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** A threshold in the unit its sport is spoken in. Mirrors thresholdFormat.js. */
function fmtThreshold(value, kind) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '—';
  return kind === 'bike' ? `${Math.round(n)} W` : `${fmtPaceSec(n)}/km`;
}

/* ─── gathering what the server knows about an athlete ────────────────── */

function normaliseSport(raw) {
  const s = String(raw || '').toLowerCase();
  if (s.includes('ride') || s.includes('bike') || s.includes('cycl')) return 'bike';
  if (s.includes('run')) return 'run';
  if (s.includes('swim')) return 'swim';
  return 'other';
}

/**
 * Every activity summary the server holds for one athlete, flattened onto the
 * shape the shared estimator reads. Summaries only — no streams. The estimator
 * has a stream-fed path, but it belongs to the browser, which is the only place
 * that can afford fifteen sequential Strava fetches.
 */
async function gatherActivities(userId) {
  const since = new Date(Date.now() - LOOKBACK_DAYS * MS_DAY);
  const [stravas, garmins, fits] = await Promise.all([
    StravaActivity.find({ userId, startDate: { $gte: since } })
      .select('sport startDate movingTime elapsedTime distance averageSpeed averagePower averageHeartRate')
      .sort({ startDate: -1 }).limit(600).lean(),
    GarminActivity.find({ userId, startDate: { $gte: since } })
      .select('sport startDate movingTime distance averageSpeed averagePower averageHeartRate')
      .sort({ startDate: -1 }).limit(600).lean(),
    FitTraining.find({ athleteId: String(userId), timestamp: { $gte: since } })
      .select('sport timestamp totalTimerTime distance avgSpeed avgPower avgHeartRate')
      .sort({ timestamp: -1 }).limit(600).lean(),
  ]).catch(() => [[], [], []]);

  const rows = [
    ...stravas.map((a) => ({
      sport: a.sport, startDate: a.startDate,
      movingTime: a.movingTime || a.elapsedTime, distance: a.distance,
      averageSpeed: a.averageSpeed, averagePower: a.averagePower,
      averageHeartRate: a.averageHeartRate,
    })),
    ...garmins.map((a) => ({
      sport: a.sport, startDate: a.startDate,
      movingTime: a.movingTime, distance: a.distance,
      averageSpeed: a.averageSpeed, averagePower: a.averagePower,
      averageHeartRate: a.averageHeartRate,
    })),
    ...fits.map((a) => ({
      sport: a.sport, startDate: a.timestamp,
      movingTime: a.totalTimerTime, distance: a.distance,
      averageSpeed: a.avgSpeed, averagePower: a.avgPower,
      averageHeartRate: a.avgHeartRate,
    })),
  ];
  return rows.filter((a) => a.startDate);
}

/**
 * The best average power held for twenty minutes or more.
 *
 * Deliberately raw: the estimator applies the 0.95 that turns a best twenty
 * into an FTP, and doing it here as well would quietly cost the athlete ten
 * watts.
 */
function bestSustainedPower(activities) {
  let best = 0;
  for (const a of activities) {
    if (normaliseSport(a.sport) !== 'bike') continue;
    if ((Number(a.movingTime) || 0) < MIN_SUSTAINED_SEC) continue;
    const w = Number(a.averagePower) || 0;
    if (w > best) best = w;
  }
  return best > 0 ? best : null;
}

function countSport(activities, kind) {
  return activities.filter((a) => normaliseSport(a.sport) === kind).length;
}

/* ─── who gets one, and about which sport ─────────────────────────────── */

function isEligibleBase(user) {
  if (!user?.email) return false;
  if (user.isActive === false) return false;
  if (user.notifications?.emailNotifications === false) return false;
  if (user.notifications?.marketingEmails === false) return false;
  if (user.retentionEmails?.[SENT_KEY]) return false;
  if (daysSince(user.createdAt) < MIN_ACCOUNT_AGE_DAYS) return false;
  return true;
}

/**
 * The estimate to write about, or null.
 *
 * Bike is preferred when both qualify: a cyclist's threshold is in watts, which
 * needs no unit caveats, and power is the channel the estimate is strongest on.
 *
 * @returns {Promise<null | {kind:string, anchor:object, activityCount:number}>}
 */
async function estimateFor(user, { skipEligibility = false } = {}) {
  if (!skipEligibility && !isEligibleBase(user)) return null;

  // Anyone with a test already has the real thing; this email would be an
  // insult to it.
  const testCount = await Test.countDocuments({ athleteId: String(user._id) });
  if (testCount > 0) return null;

  const activities = await gatherActivities(user._id);
  if (activities.length < MIN_ACTIVITIES) return null;

  const p20 = bestSustainedPower(activities);
  const powerMetrics = p20 ? { personalRecords: { threshold20min: p20 } } : null;

  for (const kind of ['bike', 'run']) {
    if (countSport(activities, kind) < MIN_ACTIVITIES) continue;
    const anchor = estimateAnchorFromTraining({
      sport: kind, profile: user, powerMetrics, activities,
    });
    if (!anchor) continue;
    if (!SENDABLE_CONFIDENCE.has(anchor.confidence)) continue;
    return { kind, anchor, activityCount: countSport(activities, kind) };
  }
  return null;
}

/* ─── the email ───────────────────────────────────────────────────────── */

async function renderHtml({ kind, anchor, activityCount, firstName, unsubscribeUrl }) {
  const clientUrl = getClientUrl();
  const sportWord = SPORT_LABEL[kind] || kind;
  const greet = firstName ? `Hi ${escapeHtml(firstName)},` : 'Hi there,';

  // The estimator returns points in threshold units, which is exactly what the
  // report chart already draws for a real test — so the same renderer works,
  // and the email's curve is the one the app shows.
  const chartSvg = buildLactateCurveSvg({
    results: anchor.points.map((p) => ({ power: p.x, lactate: p.y })),
    sportLabel: `${kind.toUpperCase()} • Estimated curve`,
    xLabel: kind === 'bike' ? 'Power (W)' : 'Pace (min/km)',
    sport: kind,
    unitSystem: 'metric',
    inputMode: 'pace',
    lt1: { x: anchor.lt1, color: BRAND.lt1, label: 'LT1' },
    lt2: { x: anchor.lt2, color: BRAND.lt2, label: 'LT2' },
  });
  const chartImg = chartSvg ? await svgToEmailImgSrc(chartSvg) : null;

  const lt2Source = (anchor.sources || []).find((s) => s.threshold === 'LT2');
  const provenance = lt2Source
    ? `Your thresholds come from ${escapeHtml(lt2Source.label)}${
      lt2Source.detail ? ` — ${escapeHtml(lt2Source.detail)}` : ''}.`
    : '';
  const hrNote = anchor.hrIsPopulation
    ? ' The heart rates are a typical percentage of your maximum rather than measured on you.'
    : '';

  const tile = (label, value, hr, lactate, color, derived) => `
    <td width="50%" valign="top" style="padding:0 6px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0"
             style="background:${color}12;border:1px solid ${color}33;border-radius:12px;">
        <tr><td style="padding:12px 14px;">
          <div style="font-size:10px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:${color};">
            ${label}${derived ? ' <span style="color:#9CA3AF;font-weight:700;">· derived</span>' : ''}
          </div>
          <div style="font-size:22px;font-weight:800;color:${BRAND.ink};margin-top:2px;line-height:1.15;">${value}</div>
          <div style="font-size:12px;color:${BRAND.muted};margin-top:3px;">
            ${hr ? `${Math.round(hr)} bpm` : ''}${hr && lactate ? ' · ' : ''}${lactate ? `≈${Number(lactate).toFixed(1)} mmol` : ''}
          </div>
        </td></tr>
      </table>
    </td>`;

  const ctaUrl = appendUtm(`${clientUrl}/testing`);

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>Your estimated lactate curve</title></head>
<body style="margin:0;padding:0;background:${BRAND.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:${BRAND.text};-webkit-font-smoothing:antialiased;">
  <div style="max-width:580px;margin:0 auto;padding:28px 16px 56px;">
    <div style="text-align:center;margin-bottom:20px;">
      <span style="display:inline-block;padding:6px 14px;border-radius:999px;background:${BRAND.primary};color:#fff;font-size:11px;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;">Estimated from your training</span>
    </div>

    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${BRAND.surface};border:1px solid ${BRAND.border};border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(10,14,26,0.06);">
      <tr><td style="padding:0;background:linear-gradient(135deg,${BRAND.primaryTint} 0%,#fff 55%);">
        <div style="padding:36px 32px 24px;">
          <h1 style="margin:0 0 12px;font-size:27px;line-height:1.15;font-weight:800;letter-spacing:-0.03em;color:${BRAND.ink};">
            We drew your ${escapeHtml(sportWord)} curve from your training
          </h1>
          <p style="margin:0;font-size:16px;line-height:1.6;color:${BRAND.muted};">
            ${greet}<br/>You have not run a lactate test yet — but ${activityCount} ${kind === 'bike' ? 'rides' : 'runs'}
            in the last six months say a great deal about where your thresholds sit. Here is what they say.
          </p>
        </div>
      </td></tr>

      <tr><td style="padding:4px 26px 0;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>
          ${tile('LT1', fmtThreshold(anchor.lt1, kind), anchor.lt1Hr, anchor.lt1Lac, BRAND.lt1, anchor.lt1Derived)}
          ${tile('LT2', fmtThreshold(anchor.lt2, kind), anchor.lt2Hr, anchor.lt2Lac, BRAND.lt2, false)}
        </tr></table>
      </td></tr>

      ${chartImg ? `<tr><td style="padding:18px 26px 0;">
        <img src="${chartImg}" alt="Your estimated lactate curve" width="528"
             style="display:block;width:100%;max-width:528px;height:auto;border-radius:12px;border:1px solid ${BRAND.border};"/>
      </td></tr>` : ''}

      <tr><td style="padding:14px 32px 0;">
        <p style="margin:0;font-size:13px;line-height:1.65;color:${BRAND.muted};">
          ${provenance}${hrNote}
          <strong style="color:${BRAND.text};">The lactate values are modelled, not measured</strong> — the shape most
          ramp tests draw, placed so LT2 lands on 4&nbsp;mmol. Only your own blood can tell you where yours really sits,
          and for some athletes it is a long way from here.
        </p>
      </td></tr>

      <tr><td style="padding:22px 32px 30px;text-align:center;">
        <a href="${ctaUrl}" style="display:inline-block;background:${BRAND.accent};color:#fff;text-decoration:none;padding:15px 28px;border-radius:12px;font-weight:700;font-size:16px;box-shadow:0 2px 8px rgba(255,107,74,0.35);">See it in LaChart</a>
        <div style="margin-top:14px;font-size:13px;line-height:1.6;color:${BRAND.muted};">
          Enter a real test and this stops being a guess — every session you train afterwards is read against
          your own curve, so you can watch it move without testing again.
        </div>
      </td></tr>
    </table>

    <p style="text-align:center;margin-top:22px;font-size:12px;color:#9CA3AF;line-height:1.65;">
      You are getting this because you have training in LaChart but no lactate test yet.<br/>
      <a href="${unsubscribeUrl}" style="color:#9CA3AF;text-decoration:underline;">Unsubscribe from product emails</a>
      &nbsp;·&nbsp;
      <a href="${appendUtm(`${clientUrl}/settings?tab=notifications`)}" style="color:#9CA3AF;text-decoration:underline;">Notification settings</a>
    </p>
  </div>
</body></html>`;
}

function subjectFor(kind, anchor) {
  return `Your estimated ${SPORT_LABEL[kind] || kind} threshold: ${fmtThreshold(anchor.lt2, kind)}`;
}

/* ─── sending ─────────────────────────────────────────────────────────── */

/**
 * A worked example, for when the real thing cannot be built.
 *
 * Every admin previewing this has tests of their own, so the honest answer for
 * them is "not eligible" — which shows nothing and checks nothing. This gives
 * the layout something to render.
 */
function sampleEstimate() {
  const anchor = estimateAnchorFromTraining({
    sport: 'bike',
    profile: {
      powerZones: { cycling: { lt2: 268 } },
      heartRateZones: {
        cycling: { maxHeartRate: 189, zone3: { min: 148, max: 168 }, zone4: { min: 168, max: 175 } },
      },
    },
  });
  return anchor ? { kind: 'bike', anchor, activityCount: 34 } : null;
}

/**
 * @param {object} user
 * @param {object} [o]
 * @param {boolean} [o.dryRun]  build it but send nothing
 * @param {boolean} [o.track]   stamp the user so it never repeats
 * @param {boolean} [o.notify]  also raise the in-app notification and push
 * @param {boolean} [o.preview] admin test send — skip eligibility, never track
 */
async function sendPredictedCurve(user, {
  dryRun = false, track = true, notify = true, preview = false,
} = {}) {
  const found = preview
    ? (await estimateFor(user, { skipEligibility: true }).catch(() => null)) || sampleEstimate()
    : await estimateFor(user);
  if (!found) return { sent: false, reason: 'not_eligible' };
  const { kind, anchor, activityCount } = found;

  const subject = subjectFor(kind, anchor);
  const html = await renderHtml({
    kind, anchor, activityCount,
    firstName: user.name || null,
    unsubscribeUrl: unsubscribeUrlFor(user._id),
  });

  if (dryRun) return { sent: false, reason: 'dry_run', sport: kind, subject };

  const transporter = createEmailTransporter();
  if (!transporter) return { sent: false, reason: 'transporter_unavailable' };

  try {
    const info = await transporter.sendMail({
      from: { name: 'LaChart', address: process.env.EMAIL_USER },
      to: user.email,
      subject,
      html,
      headers: {
        'List-Unsubscribe': `<${unsubscribeUrlFor(user._id)}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    });
    const accepted = Array.isArray(info?.accepted) ? info.accepted : [];
    const rejected = Array.isArray(info?.rejected) ? info.rejected : [];
    if (!accepted.some((a) => String(a).toLowerCase() === user.email.toLowerCase()) || rejected.length) {
      return { sent: false, reason: 'relay_rejected', smtp: { accepted, rejected } };
    }

    if (track && !preview) {
      await User.updateOne({ _id: user._id }, {
        $set: {
          [`retentionEmails.${SENT_KEY}`]: new Date(),
          'retentionEmails.predictedCurveSport': kind,
        },
      });
    }

    // The notification is deliberately after the email and never blocks it: a
    // failed push must not cost the athlete the message, and must not make the
    // scheduler retry a send that already landed.
    if (notify && !preview) {
      await notifyPredictedCurve(user._id, kind, anchor).catch((e) =>
        console.warn('[predictedCurve] notify failed:', e?.message || e));
    }

    console.log(`[predictedCurve] ${kind} sent to ${user.email}`);
    return { sent: true, sport: kind, subject };
  } catch (e) {
    console.error(`[predictedCurve] failed for ${user.email}:`, e?.message || e);
    return { sent: false, reason: 'send_failed', message: e?.message };
  }
}

/** In-app notification plus push, deep-linked at the testing page. */
async function notifyPredictedCurve(userId, kind, anchor) {
  return sendNotification([String(userId)], {
    type: 'predicted_curve',
    title: `Your estimated ${SPORT_LABEL[kind] || kind} curve is ready`,
    body: `From your training, LT2 reads about ${fmtThreshold(anchor.lt2, kind)}`
      + `${anchor.lt2Hr ? ` at ${Math.round(anchor.lt2Hr)} bpm` : ''}. `
      + 'Open Testing to see the curve — and what a real test would change.',
    resourceType: 'test',
    sport: kind,
    pushData: { screen: 'testing', sport: kind },
  });
}

/* ─── the pool ────────────────────────────────────────────────────────── */

async function findReadyCandidates(limit = 20) {
  const pool = await User.find({
    email: { $exists: true, $ne: null, $ne: '' },
    isActive: { $ne: false },
    'notifications.emailNotifications': { $ne: false },
    'notifications.marketingEmails': { $ne: false },
    [`retentionEmails.${SENT_KEY}`]: { $in: [null, undefined] },
  })
    .select('_id email name surname isActive notifications retentionEmails createdAt '
      + 'powerZones heartRateZones ftp thresholdPace runningZones maxHr maxHeartRate')
    .sort({ createdAt: 1 })
    .limit(Math.max(limit * 8, 200))
    .lean();

  const ready = [];
  for (const user of pool) {
    if (ready.length >= limit) break;
    const found = await estimateFor(user);
    if (found) ready.push({ user, sport: found.kind, anchor: found.anchor });
  }
  return ready;
}

async function getCampaignStats() {
  const optedIn = {
    email: { $exists: true, $ne: null, $ne: '' },
    isActive: { $ne: false },
    'notifications.emailNotifications': { $ne: false },
    'notifications.marketingEmails': { $ne: false },
  };
  const [sent, ready] = await Promise.all([
    User.countDocuments({ ...optedIn, [`retentionEmails.${SENT_KEY}`]: { $ne: null, $exists: true } }),
    findReadyCandidates(500),
  ]);
  const bySport = { bike: 0, run: 0 };
  for (const r of ready) bySport[r.sport] += 1;
  return { alreadySent: sent, readyNow: ready.length, readyBySport: bySport };
}

/**
 * Rendered HTML for an admin browser preview.
 *
 * Falls back to a worked example when the previewing admin has a test of their
 * own — which they always do — so the layout can still be checked.
 */
async function renderPreview(user = {}) {
  const sample = (await estimateFor(user, { skipEligibility: true }).catch(() => null)) || sampleEstimate();
  if (!sample) return '<p>Could not build a preview estimate.</p>';
  return renderHtml({
    ...sample,
    firstName: user.name || 'Alex',
    unsubscribeUrl: unsubscribeUrlFor(user._id || 'preview'),
  });
}

module.exports = {
  sendPredictedCurve,
  notifyPredictedCurve,
  estimateFor,
  findReadyCandidates,
  getCampaignStats,
  renderPreview,
  unsubscribeUrlFor,
  SENT_KEY,
};
