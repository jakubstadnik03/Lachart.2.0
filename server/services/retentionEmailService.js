/**
 * retentionEmailService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * All retention / lifecycle emails for LaChart.
 *
 * Email types:
 *  1. Weekly Progress         – Monday 07:00 UTC  – LT2 status + test count
 *  2. Monthly Performance     – 1st of month      – LT2 3-month trend
 *  3. Test Reminder           – Thursday 08:00    – if no test in 6+ weeks
 *  4. Re-engagement           – daily check       – if no login in 14 days
 *  5. Milestone               – daily check       – 1st/5th/10th/25th test, 5W/10W LT2 gain
 *  6. Anniversary             – daily check       – 6-month & 1-year
 */

'use strict';

const { createEmailTransporter } = require('../utils/createEmailTransporter');
const { getClientUrl }           = require('../utils/emailTemplate');
const User = require('../models/UserModel');
const Test = require('../models/test');

// ─── Brand colours ────────────────────────────────────────────────────────────
const PRIMARY      = '#767EB5';
const PRIMARY_DARK = '#5E6590';
const SECONDARY    = '#599FD0';
const GREEN        = '#16a34a';
const GREEN_BG     = '#dcfce7';
const RED          = '#ef4444';
const RED_BG       = '#fee2e2';
const GRAY         = '#6b7280';
const LIGHT_GRAY   = '#f3f4f6';
const DARK         = '#111827';
const WHITE        = '#ffffff';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });
}

function daysSince(date) {
  if (!date) return Infinity;
  return Math.floor((Date.now() - new Date(date).getTime()) / 86_400_000);
}

function weeksSince(date) {
  return Math.floor(daysSince(date) / 7);
}

function monthName(date) {
  return new Date(date).toLocaleString('en-US', { month: 'long' });
}

/** Estimate LT2 from test results (OBLA 4.0 → 50%-rise fallback). */
function estimateLT2(test) {
  const results = Array.isArray(test?.results) ? test.results : [];
  const sport   = test?.sport || 'bike';
  const valid   = results
    .filter(r => Number(r.power) > 0 && Number(r.lactate) > 0)
    .sort((a, b) => a.power - b.power);
  if (!valid.length) return null;

  const obla = valid.find(r => Number(r.lactate) >= 4.0);
  if (obla) return { value: Number(obla.power), sport };

  const minLa = valid[0].lactate;
  const maxLa = valid[valid.length - 1].lactate;
  const thresh = minLa + (maxLa - minLa) * 0.5;
  const above  = valid.find(r => r.lactate >= thresh);
  return above ? { value: Number(above.power), sport } : null;
}

function fmtIntensity(value, sport) {
  if (!value && value !== 0) return '—';
  if (sport === 'run' || sport === 'swim') {
    const secs = Math.round(Number(value));
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${String(s).padStart(2,'0')} /km`;
  }
  return `${Math.round(Number(value))} W`;
}

function deltaBadge(diff, unit = 'W', isPositiveBetter = true) {
  if (!Number.isFinite(diff)) return '';
  const isGood  = isPositiveBetter ? diff >= 0 : diff <= 0;
  const color   = isGood ? GREEN : RED;
  const bg      = isGood ? GREEN_BG : RED_BG;
  const sign    = diff >= 0 ? '+' : '−';
  const label   = `${sign}${Math.abs(Math.round(diff))} ${unit}`;
  return `<span style="display:inline-block;padding:3px 10px;border-radius:999px;background:${bg};color:${color};font-weight:700;font-size:13px;">${esc(label)}</span>`;
}

async function getRecentTests(userId, limit = 6) {
  return Test.find({ athleteId: String(userId) })
    .sort({ date: -1 })
    .limit(limit)
    .lean();
}

// ─── Shared layout ────────────────────────────────────────────────────────────
function layout({ preheader = '', hero, body, cta, ctaUrl, footer = '' }) {
  const CLIENT_URL = getClientUrl();
  const LOGO_URL   = `${CLIENT_URL}/logo192.png`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>LaChart</title>
</head>
<body style="margin:0;padding:0;background:#f0f2f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
${preheader ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${esc(preheader)}</div>` : ''}
<table role="presentation" style="width:100%;border-collapse:collapse;background:#f0f2f8;">
<tr><td style="padding:32px 16px;">
  <table role="presentation" style="max-width:600px;margin:0 auto;border-collapse:collapse;">

    <!-- HEADER -->
    <tr><td style="background:linear-gradient(135deg,${PRIMARY} 0%,${PRIMARY_DARK} 100%);border-radius:12px 12px 0 0;padding:28px 36px;text-align:center;">
      <table role="presentation" style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="text-align:center;">
            <img src="${LOGO_URL}" alt="LaChart" style="height:40px;width:auto;vertical-align:middle;margin-right:10px;">
            <span style="font-size:26px;font-weight:700;color:#fff;vertical-align:middle;letter-spacing:-0.5px;">LaChart</span>
          </td>
        </tr>
        ${hero ? `<tr><td style="padding-top:20px;color:rgba(255,255,255,0.9);font-size:14px;letter-spacing:0.5px;">${hero}</td></tr>` : ''}
      </table>
    </td></tr>

    <!-- BODY -->
    <tr><td style="background:#fff;padding:36px 36px 28px;">
      ${body}
      ${cta && ctaUrl ? `
      <table role="presentation" style="width:100%;border-collapse:collapse;margin-top:28px;">
        <tr><td style="text-align:center;">
          <a href="${ctaUrl}" style="display:inline-block;padding:14px 36px;background:${PRIMARY};color:#fff;text-decoration:none;border-radius:8px;font-weight:700;font-size:15px;letter-spacing:0.3px;">${esc(cta)}</a>
        </td></tr>
      </table>` : ''}
    </td></tr>

    <!-- FOOTER -->
    <tr><td style="background:#f9fafb;border-top:1px solid #e5e7eb;border-radius:0 0 12px 12px;padding:20px 36px;text-align:center;">
      ${footer ? `<p style="margin:0 0 8px;color:${GRAY};font-size:13px;">${footer}</p>` : ''}
      <p style="margin:0;color:#9ca3af;font-size:12px;">
        <a href="${CLIENT_URL}" style="color:${PRIMARY};text-decoration:none;">LaChart</a> ·
        <a href="${CLIENT_URL}/settings" style="color:${GRAY};text-decoration:none;">Email preferences</a> ·
        <a href="mailto:lachart@lachart.net" style="color:${GRAY};text-decoration:none;">Support</a>
      </p>
    </td></tr>

  </table>
</td></tr>
</table>
</body></html>`;
}

/** Stat card (used inline in 2- or 3-column rows). */
function statCard({ label, value, sub = '', color = PRIMARY }) {
  return `<td style="width:33%;padding:0 6px;text-align:center;vertical-align:top;">
    <div style="background:${LIGHT_GRAY};border-radius:10px;padding:16px 12px;">
      <div style="font-size:22px;font-weight:800;color:${color};line-height:1.1;">${esc(String(value))}</div>
      <div style="font-size:11px;font-weight:600;color:${GRAY};text-transform:uppercase;letter-spacing:0.8px;margin-top:4px;">${esc(label)}</div>
      ${sub ? `<div style="font-size:11px;color:#9ca3af;margin-top:2px;">${esc(sub)}</div>` : ''}
    </div>
  </td>`;
}

/** Section title divider. */
function sectionTitle(text) {
  return `<p style="margin:24px 0 12px;font-size:11px;font-weight:700;color:${PRIMARY};text-transform:uppercase;letter-spacing:1.2px;border-bottom:1px solid #e5e7eb;padding-bottom:6px;">${esc(text)}</p>`;
}

/** Test row in a mini table. */
function testRow(test, lt2, i) {
  const sport  = test.sport || 'bike';
  const isEven = i % 2 === 0;
  const bg     = isEven ? WHITE : LIGHT_GRAY;
  const lt2Str = lt2 ? fmtIntensity(lt2.value, sport) : '—';
  return `<tr style="background:${bg};">
    <td style="padding:8px 12px;font-size:13px;color:${DARK};">${esc(fmtDate(test.date))}</td>
    <td style="padding:8px 12px;font-size:13px;color:${GRAY};text-transform:capitalize;">${esc(sport)}</td>
    <td style="padding:8px 12px;font-size:13px;font-weight:700;color:${PRIMARY};">${esc(lt2Str)}</td>
  </tr>`;
}

// ─── Send helper ──────────────────────────────────────────────────────────────
async function send({ to, subject, html }) {
  if (!to) return false;
  try {
    const transporter = await createEmailTransporter();
    if (!transporter) return false;
    await transporter.sendMail({
      from: `"LaChart" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html
    });
    console.log(`[RetentionEmail] ✓ "${subject}" → ${to}`);
    return true;
  } catch (e) {
    console.error(`[RetentionEmail] ✗ "${subject}" → ${to}:`, e.message);
    return false;
  }
}

// ─── 1. WEEKLY PROGRESS ──────────────────────────────────────────────────────
/**
 * Sent every Monday 07:00 UTC.
 * Shows LT2, test count, days since last test, last 3 tests trend.
 */
async function sendWeeklyProgressEmail(user) {
  if (!user.email) return false;
  const CLIENT_URL = getClientUrl();
  const firstName  = esc(user.name || 'Athlete');

  // Fetch last 4 tests
  const tests = await getRecentTests(user._id, 4);
  const total  = await Test.countDocuments({ athleteId: String(user._id) });

  if (total === 0) return false; // nothing to report yet

  const lastTest    = tests[0] || null;
  const lastTestLT2 = lastTest ? estimateLT2(lastTest) : null;
  const weeksAgo    = lastTest ? weeksSince(lastTest.date) : null;

  // LT2 delta: compare most recent test vs previous
  let lt2Delta = null;
  if (tests.length >= 2) {
    const cur  = estimateLT2(tests[0]);
    const prev = estimateLT2(tests[1]);
    if (cur && prev && cur.sport === prev.sport) {
      lt2Delta = cur.value - prev.value;
    }
  }

  // Build trend rows
  const trendRows = tests
    .slice(0, 3)
    .map((t, i) => testRow(t, estimateLT2(t), i))
    .join('');

  // Test status badge
  const statusColor = weeksAgo === null ? GRAY : weeksAgo <= 4 ? GREEN : weeksAgo <= 8 ? '#f59e0b' : RED;
  const statusLabel = weeksAgo === null ? 'No tests yet'
    : weeksAgo === 0 ? 'Tested this week!'
    : weeksAgo === 1 ? '1 week ago'
    : `${weeksAgo} weeks ago`;

  const lt2Display = lastTestLT2
    ? fmtIntensity(lastTestLT2.value, lastTestLT2.sport)
    : 'Not yet set';

  const body = `
    <h2 style="margin:0 0 6px;font-size:22px;font-weight:700;color:${DARK};">Good morning, ${firstName}! 👋</h2>
    <p style="margin:0 0 20px;color:${GRAY};font-size:15px;">Here's your weekly LaChart performance update.</p>

    <!-- Stat cards -->
    <table role="presentation" style="width:100%;border-collapse:collapse;margin-bottom:4px;">
      <tr>
        ${statCard({ label: 'Current LT2', value: lt2Display, sub: lastTestLT2 ? lastTestLT2.sport : '', color: PRIMARY })}
        ${statCard({ label: 'Total Tests', value: total, color: SECONDARY })}
        ${statCard({ label: 'Last Test', value: statusLabel, color: statusColor })}
      </tr>
    </table>

    ${lt2Delta !== null ? `
    <p style="margin:16px 0;text-align:center;font-size:14px;color:${GRAY};">
      LT2 vs previous test: ${deltaBadge(lt2Delta, lastTestLT2?.sport === 'run' ? 's/km' : 'W', lastTestLT2?.sport !== 'run')}
    </p>` : ''}

    ${trendRows ? `
    ${sectionTitle('Recent Test Trend')}
    <table role="presentation" style="width:100%;border-collapse:collapse;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;">
      <tr style="background:${PRIMARY};">
        <th style="padding:8px 12px;font-size:11px;font-weight:700;color:#fff;text-align:left;letter-spacing:0.5px;">DATE</th>
        <th style="padding:8px 12px;font-size:11px;font-weight:700;color:#fff;text-align:left;letter-spacing:0.5px;">SPORT</th>
        <th style="padding:8px 12px;font-size:11px;font-weight:700;color:#fff;text-align:left;letter-spacing:0.5px;">LT2</th>
      </tr>
      ${trendRows}
    </table>` : ''}

    ${weeksAgo !== null && weeksAgo >= 6 ? `
    <div style="margin-top:20px;padding:14px 18px;background:#fef9c3;border-left:4px solid #f59e0b;border-radius:6px;">
      <p style="margin:0;font-size:14px;color:#92400e;font-weight:600;">⚠ It's been ${weeksAgo} weeks since your last test.</p>
      <p style="margin:6px 0 0;font-size:13px;color:#a16207;">Regular testing every 4–6 weeks gives you the most accurate training zones.</p>
    </div>` : ''}
  `;

  const html = layout({
    preheader: `Your LT2 is ${lt2Display} · ${total} tests logged · ${statusLabel}`,
    hero: `Weekly Performance Update · ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`,
    body,
    cta: 'Open Dashboard',
    ctaUrl: `${CLIENT_URL}/dashboard`,
    footer: 'You\'re receiving this because you have weekly reports enabled. Update preferences in Settings.'
  });

  const ok = await send({
    to:      user.email,
    subject: `📊 LaChart weekly update – LT2 ${lt2Display}`,
    html
  });

  if (ok) {
    await User.updateOne(
      { _id: user._id },
      { $set: { 'retentionEmails.weeklyProgressLastSent': new Date() } }
    );
  }
  return ok;
}

// ─── 2. MONTHLY PERFORMANCE REPORT ───────────────────────────────────────────
/**
 * Sent on the 1st of each month at 09:00 UTC.
 * Shows LT2 trend over last 3 months, test count this month vs last month.
 */
async function sendMonthlyReportEmail(user) {
  if (!user.email) return false;
  const CLIENT_URL = getClientUrl();
  const firstName  = esc(user.name || 'Athlete');
  const now        = new Date();
  const monthLabel = monthName(now);

  // All tests sorted newest first
  const allTests = await getRecentTests(user._id, 20);
  if (!allTests.length) return false;

  // This month vs last month test count
  const startOfMonth     = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const thisMonthTests   = allTests.filter(t => new Date(t.date) >= startOfMonth);
  const lastMonthTests   = allTests.filter(t => new Date(t.date) >= startOfLastMonth && new Date(t.date) < startOfMonth);

  // LT2 at 3 time points (now, 30d ago, 60d ago)
  const cutoffs = [0, 30, 60, 90].map(d => {
    const date = new Date(now);
    date.setDate(date.getDate() - d);
    return date;
  });

  // For each 30-day window find the most recent test
  function latestTestBefore(maxDate, minDate) {
    return allTests.find(t => {
      const d = new Date(t.date);
      return d <= maxDate && (!minDate || d >= minDate);
    });
  }

  const snapshots = [
    { label: 'Now',       test: latestTestBefore(cutoffs[0], cutoffs[1]) },
    { label: '30d ago',   test: latestTestBefore(cutoffs[1], cutoffs[2]) },
    { label: '60d ago',   test: latestTestBefore(cutoffs[2], cutoffs[3]) },
  ].filter(s => s.test);

  const lt2Snapshots = snapshots.map(s => ({
    label: s.label,
    lt2:   estimateLT2(s.test),
    date:  s.test.date
  })).filter(s => s.lt2);

  // Overall LT2 delta (now vs oldest snapshot)
  let overallDelta = null;
  let overallSport = null;
  if (lt2Snapshots.length >= 2) {
    const newest = lt2Snapshots[0];
    const oldest = lt2Snapshots[lt2Snapshots.length - 1];
    if (newest.lt2.sport === oldest.lt2.sport) {
      overallDelta = newest.lt2.value - oldest.lt2.value;
      overallSport = newest.lt2.sport;
    }
  }

  // Trend rows (timeline)
  const timelineRows = lt2Snapshots.map((s, i) => {
    const isFirst = i === 0;
    const bg      = isFirst ? `${PRIMARY}15` : WHITE;
    const weight  = isFirst ? '700' : '400';
    return `<tr style="background:${bg};">
      <td style="padding:9px 14px;font-size:13px;color:${GRAY};">${esc(s.label)}</td>
      <td style="padding:9px 14px;font-size:13px;color:${DARK};text-transform:capitalize;">${esc(s.lt2.sport)}</td>
      <td style="padding:9px 14px;font-size:14px;font-weight:${weight};color:${PRIMARY};">${esc(fmtIntensity(s.lt2.value, s.lt2.sport))}</td>
    </tr>`;
  }).join('');

  const body = `
    <h2 style="margin:0 0 6px;font-size:22px;font-weight:700;color:${DARK};">Your ${esc(monthLabel)} Report 📈</h2>
    <p style="margin:0 0 22px;color:${GRAY};font-size:15px;">Here's how your performance has evolved over the past 3 months.</p>

    <!-- Hero delta -->
    ${overallDelta !== null ? `
    <div style="background:${overallDelta >= 0 ? GREEN_BG : RED_BG};border-radius:12px;padding:20px;text-align:center;margin-bottom:20px;">
      <div style="font-size:32px;font-weight:800;color:${overallDelta >= 0 ? GREEN : RED};">
        ${overallDelta >= 0 ? '+' : '−'}${Math.abs(Math.round(overallDelta))}${overallSport === 'run' ? 's' : ' W'}
      </div>
      <div style="font-size:13px;color:${overallDelta >= 0 ? '#166534' : '#991b1b'};margin-top:4px;font-weight:600;">
        LT2 change over the past ${lt2Snapshots.length > 2 ? '60' : '30'} days
      </div>
      <div style="font-size:12px;color:${GRAY};margin-top:2px;">
        ${overallDelta >= 0 ? '🎉 You\'re getting stronger!' : '💪 Keep at it – consistency pays off.'}
      </div>
    </div>` : ''}

    <!-- Stats row -->
    <table role="presentation" style="width:100%;border-collapse:collapse;margin-bottom:4px;">
      <tr>
        ${statCard({ label: 'Tests This Month',  value: thisMonthTests.length || '0', color: PRIMARY  })}
        ${statCard({ label: 'Tests Last Month',  value: lastMonthTests.length || '0', color: SECONDARY })}
        ${statCard({ label: 'Total Tests Ever',  value: allTests.length,              color: GRAY     })}
      </tr>
    </table>

    ${timelineRows ? `
    ${sectionTitle('LT2 Progression')}
    <table role="presentation" style="width:100%;border-collapse:collapse;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;">
      <tr style="background:${PRIMARY};">
        <th style="padding:8px 14px;font-size:11px;font-weight:700;color:#fff;text-align:left;">PERIOD</th>
        <th style="padding:8px 14px;font-size:11px;font-weight:700;color:#fff;text-align:left;">SPORT</th>
        <th style="padding:8px 14px;font-size:11px;font-weight:700;color:#fff;text-align:left;">LT2</th>
      </tr>
      ${timelineRows}
    </table>` : ''}

    <p style="margin:20px 0 0;font-size:14px;color:${GRAY};line-height:1.6;">
      Consistent lactate testing is the most accurate way to track aerobic fitness progression.
      Keep logging your tests to see your full performance curve over time.
    </p>
  `;

  const html = layout({
    preheader: `Your ${monthLabel} performance report is ready – see your LT2 trend`,
    hero: `Monthly Performance Report · ${monthLabel} ${now.getFullYear()}`,
    body,
    cta: 'View Full Analysis',
    ctaUrl: `${CLIENT_URL}/testing`,
    footer: 'Monthly report sent on the 1st of each month. Update preferences in Settings.'
  });

  const ok = await send({
    to:      user.email,
    subject: `📈 Your LaChart ${monthLabel} performance report`,
    html
  });

  if (ok) {
    await User.updateOne(
      { _id: user._id },
      { $set: { 'retentionEmails.monthlyReportLastSent': new Date() } }
    );
  }
  return ok;
}

// ─── 3. TEST REMINDER ─────────────────────────────────────────────────────────
/**
 * Sent Thursday 08:00 UTC if the user hasn't done a test in 6+ weeks.
 * Throttled: max once per 3 weeks.
 */
async function sendTestReminderEmail(user) {
  if (!user.email) return false;
  const CLIENT_URL = getClientUrl();
  const firstName  = esc(user.name || 'Athlete');

  const tests = await getRecentTests(user._id, 1);
  if (!tests.length) return false; // never tested → onboarding job handles this

  const lastTest = tests[0];
  const weeks    = weeksSince(lastTest.date);
  if (weeks < 6) return false; // too recent

  const lt2     = estimateLT2(lastTest);
  const lt2Str  = lt2 ? fmtIntensity(lt2.value, lt2.sport) : 'not recorded';
  const sport   = lastTest.sport || 'bike';

  const tips = sport === 'run'
    ? ['Run the test fresh — no hard session within 48h', 'Use the same course/treadmill each time', 'Start at an easy pace and increment every 4–5 minutes']
    : sport === 'swim'
    ? ['Rest 24h before the test', 'Warm up 10 min at easy pace', 'Use consistent pool length (25m or 50m)']
    : ['Test on a trainer for reproducible conditions', 'Start at ~60% FTP and add 20–25W per step', '4-minute stages give the most accurate curve'];

  const body = `
    <h2 style="margin:0 0 6px;font-size:22px;font-weight:700;color:${DARK};">Time for your next lactate test, ${firstName}! 🧪</h2>
    <p style="margin:0 0 20px;color:${GRAY};font-size:15px;">
      It's been <strong style="color:${RED};">${weeks} weeks</strong> since your last test.
      For accurate training zones, aim to test every 4–6 weeks.
    </p>

    <div style="background:${LIGHT_GRAY};border-radius:10px;padding:18px 20px;margin-bottom:20px;">
      <p style="margin:0 0 4px;font-size:12px;color:${GRAY};text-transform:uppercase;letter-spacing:0.8px;font-weight:600;">Your last test</p>
      <p style="margin:0;font-size:18px;font-weight:700;color:${DARK};">${esc(lastTest.title || 'Lactate Test')}</p>
      <p style="margin:4px 0 0;font-size:13px;color:${GRAY};">${esc(fmtDate(lastTest.date))} · LT2: <strong style="color:${PRIMARY};">${esc(lt2Str)}</strong></p>
    </div>

    ${sectionTitle('Quick test tips')}
    <ul style="margin:0 0 16px;padding:0 0 0 18px;color:${GRAY};font-size:14px;line-height:1.8;">
      ${tips.map(t => `<li>${esc(t)}</li>`).join('')}
    </ul>

    <p style="margin:0;font-size:14px;color:${GRAY};line-height:1.6;">
      Each new test refines your zones and shows exactly how your fitness is moving.
      Even a test that doesn't improve on paper is valuable data. 💪
    </p>
  `;

  const html = layout({
    preheader: `${weeks} weeks since your last test — time to update your training zones`,
    hero: 'Test Reminder',
    body,
    cta: 'Log a New Test',
    ctaUrl: `${CLIENT_URL}/testing`,
    footer: 'Test reminders are sent when you haven't tested in 6+ weeks. Update preferences in Settings.'
  });

  const ok = await send({
    to:      user.email,
    subject: `🧪 Time for your next lactate test — ${weeks} weeks since last one`,
    html
  });

  if (ok) {
    await User.updateOne(
      { _id: user._id },
      { $set: { 'retentionEmails.testReminderLastSent': new Date() } }
    );
  }
  return ok;
}

// ─── 4. RE-ENGAGEMENT ─────────────────────────────────────────────────────────
/**
 * Sent when a user hasn't logged in for 14+ days.
 * Throttled: max once per 30 days.
 */
async function sendReengagementEmail(user) {
  if (!user.email) return false;
  const CLIENT_URL = getClientUrl();
  const firstName  = esc(user.name || 'Athlete');
  const days       = daysSince(user.lastLogin);

  const features = [
    { icon: '📊', title: 'LT2 Trend Sparkline', desc: 'Track how your lactate threshold evolves month over month, split by sport.' },
    { icon: '🏁', title: 'Race Time Predictor', desc: 'Enter your LT2 and instantly predict race times from 5 km to marathon.' },
    { icon: '📋', title: 'Coach Athlete Overview', desc: 'Coaches can now see all athletes\' status in one table view with LT2 status.' },
  ];

  const featureCards = features.map(f => `
    <tr>
      <td style="padding:12px 0;border-bottom:1px solid #f3f4f6;vertical-align:top;">
        <span style="font-size:22px;margin-right:12px;vertical-align:middle;">${f.icon}</span>
        <strong style="font-size:14px;color:${DARK};">${esc(f.title)}</strong>
        <p style="margin:4px 0 0 34px;font-size:13px;color:${GRAY};line-height:1.5;">${esc(f.desc)}</p>
      </td>
    </tr>
  `).join('');

  const body = `
    <h2 style="margin:0 0 6px;font-size:22px;font-weight:700;color:${DARK};">We miss you, ${firstName}! 👋</h2>
    <p style="margin:0 0 20px;color:${GRAY};font-size:15px;">
      It's been <strong>${days} day${days !== 1 ? 's' : ''}</strong> since you last visited LaChart.
      Here's what's been added while you were away:
    </p>

    <table role="presentation" style="width:100%;border-collapse:collapse;margin-bottom:20px;">
      ${featureCards}
    </table>

    <div style="background:linear-gradient(135deg,${PRIMARY}15 0%,${SECONDARY}15 100%);border-radius:10px;padding:18px;text-align:center;margin-bottom:16px;">
      <p style="margin:0;font-size:15px;font-weight:600;color:${PRIMARY_DARK};">Your data is waiting for you.</p>
      <p style="margin:6px 0 0;font-size:13px;color:${GRAY};">Your tests, training zones and history are exactly where you left them.</p>
    </div>
  `;

  const html = layout({
    preheader: `${days} days since your last visit — see what's new in LaChart`,
    hero: null,
    body,
    cta: 'Come Back to LaChart',
    ctaUrl: `${CLIENT_URL}/dashboard`,
    footer: 'Re-engagement emails are sent after 14 days of inactivity. Update preferences in Settings.'
  });

  const ok = await send({
    to:      user.email,
    subject: `👋 ${firstName}, we miss you! Here's what's new in LaChart`,
    html
  });

  if (ok) {
    await User.updateOne(
      { _id: user._id },
      { $set: { 'retentionEmails.reengagementLastSent': new Date() } }
    );
  }
  return ok;
}

// ─── 5. MILESTONE ─────────────────────────────────────────────────────────────
const MILESTONES = {
  firstTest: {
    field:   'retentionEmails.milestones.firstTestSent',
    count:   1,
    subject: '🎯 You logged your first lactate test!',
    title:   'First Lactate Test Complete! 🎯',
    emoji:   '🎯',
    message: 'You\'ve taken the most important step: measuring your actual physiology instead of guessing. Your training zones are now based on real data — not a formula.',
    cta:     'Explore Your Results',
  },
  fiveTests: {
    field:   'retentionEmails.milestones.fiveTestsSent',
    count:   5,
    subject: '🏅 5 lactate tests — you\'re building real data!',
    title:   '5 Tests Milestone! 🏅',
    emoji:   '🏅',
    message: 'With 5 tests logged, you\'re starting to see real trends. The LT2 Trend chart in your dashboard now shows meaningful progression — check it out.',
    cta:     'View Your LT2 Trend',
  },
  tenTests: {
    field:   'retentionEmails.milestones.tenTestsSent',
    count:   10,
    subject: '🏆 10 lactate tests — serious athlete!',
    title:   '10 Tests Milestone! 🏆',
    emoji:   '🏆',
    message: 'Ten tests means you\'ve been methodically tracking your physiology across multiple training cycles. You\'re doing what pro endurance athletes do. That\'s rare.',
    cta:     'See Your Full History',
  },
  twentyFiveTests: {
    field:   'retentionEmails.milestones.twentyFiveTestsSent',
    count:   25,
    subject: '🌟 25 lactate tests — elite-level tracking!',
    title:   '25 Tests Milestone! 🌟',
    emoji:   '🌟',
    message: 'You\'re among the most data-driven athletes using LaChart. 25 tests means a rich physiological timeline that most athletes never have. Incredible commitment.',
    cta:     'View Your Dashboard',
  },
};

async function sendMilestoneEmail(user, milestone) {
  if (!user.email) return false;
  const CLIENT_URL = getClientUrl();
  const firstName  = esc(user.name || 'Athlete');
  const m          = MILESTONES[milestone];
  if (!m) return false;

  const totalTests = await Test.countDocuments({ athleteId: String(user._id) });

  const body = `
    <div style="text-align:center;padding:10px 0 24px;">
      <div style="font-size:52px;line-height:1;">${m.emoji}</div>
      <h2 style="margin:16px 0 8px;font-size:24px;font-weight:800;color:${DARK};">${esc(m.title)}</h2>
      <p style="margin:0;font-size:16px;color:${GRAY};">Congratulations, ${firstName}!</p>
    </div>

    <div style="background:linear-gradient(135deg,${PRIMARY}18 0%,${SECONDARY}18 100%);border-radius:12px;padding:20px 24px;margin-bottom:20px;text-align:center;">
      <div style="font-size:42px;font-weight:800;color:${PRIMARY};">${totalTests}</div>
      <div style="font-size:12px;font-weight:700;color:${GRAY};text-transform:uppercase;letter-spacing:0.8px;margin-top:4px;">Lactate Tests Logged</div>
    </div>

    <p style="margin:0 0 20px;font-size:15px;color:${GRAY};line-height:1.7;text-align:center;">${esc(m.message)}</p>

    <div style="border-top:1px solid #e5e7eb;padding-top:16px;margin-top:4px;">
      <p style="margin:0;font-size:13px;color:#9ca3af;text-align:center;">
        Keep testing regularly to watch your LT2 climb over time. 💪
      </p>
    </div>
  `;

  const html = layout({
    preheader: `You just hit a big milestone: ${m.count} lactate tests logged!`,
    hero: 'Achievement Unlocked',
    body,
    cta: m.cta,
    ctaUrl: `${CLIENT_URL}/testing`,
  });

  const ok = await send({
    to:      user.email,
    subject: m.subject,
    html
  });

  if (ok) {
    await User.updateOne(
      { _id: user._id },
      { $set: { [m.field]: true } }
    );
  }
  return ok;
}

// ─── 6. LT2 IMPROVEMENT ───────────────────────────────────────────────────────
/**
 * Sent when LT2 has improved by 5W or 10W compared to the stored baseline.
 */
async function sendLT2ImprovementEmail(user, gainW, currentLT2, sport) {
  if (!user.email) return false;
  const CLIENT_URL = getClientUrl();
  const firstName  = esc(user.name || 'Athlete');
  const gainLabel  = fmtIntensity(gainW, sport);
  const lt2Label   = fmtIntensity(currentLT2, sport);
  const milestone  = gainW >= 10 ? '10' : '5';

  const body = `
    <div style="text-align:center;padding:10px 0 24px;">
      <div style="font-size:52px;line-height:1;">⚡</div>
      <h2 style="margin:16px 0 8px;font-size:24px;font-weight:800;color:${DARK};">Your LT2 just hit a new high!</h2>
      <p style="margin:0;font-size:16px;color:${GRAY};">Nice work, ${firstName}!</p>
    </div>

    <div style="background:${GREEN_BG};border-radius:12px;padding:20px 24px;text-align:center;margin-bottom:20px;">
      <div style="font-size:36px;font-weight:800;color:${GREEN};">+${esc(gainLabel)}</div>
      <div style="font-size:12px;font-weight:700;color:#166534;text-transform:uppercase;letter-spacing:0.8px;margin-top:4px;">
        LT2 gain since your baseline
      </div>
      <div style="font-size:14px;color:${GREEN};margin-top:8px;font-weight:600;">
        Current LT2: ${esc(lt2Label)} ${sport === 'run' ? 'pace' : ''}
      </div>
    </div>

    <p style="margin:0 0 16px;font-size:15px;color:${GRAY};line-height:1.7;">
      A <strong>${esc(gainLabel)} improvement</strong> in LT2 means your aerobic engine is genuinely getting stronger.
      This isn't just fitness — it's a measurable physiological adaptation.
    </p>

    <p style="margin:0;font-size:15px;color:${GRAY};line-height:1.7;">
      Your training zones have likely shifted too — check your dashboard to make sure
      you're training in the right zones to continue this progress.
    </p>
  `;

  const html = layout({
    preheader: `Your LT2 improved by ${gainLabel} — a new personal best!`,
    hero: `LT2 Improvement · ${new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`,
    body,
    cta: 'Update My Training Zones',
    ctaUrl: `${CLIENT_URL}/testing`,
  });

  const fieldKey = milestone === '10'
    ? 'retentionEmails.milestones.lt2Improvement10Sent'
    : 'retentionEmails.milestones.lt2Improvement5Sent';

  const ok = await send({
    to:      user.email,
    subject: `⚡ LT2 +${gainLabel} — your aerobic fitness hit a new high!`,
    html
  });

  if (ok) {
    await User.updateOne(
      { _id: user._id },
      { $set: { [fieldKey]: true } }
    );
  }
  return ok;
}

// ─── 7. ANNIVERSARY ──────────────────────────────────────────────────────────
async function sendAnniversaryEmail(user, months) {
  if (!user.email) return false;
  const CLIENT_URL = getClientUrl();
  const firstName  = esc(user.name || 'Athlete');
  const isOneYear  = months >= 12;
  const emoji      = isOneYear ? '🏆' : '🎉';
  const label      = isOneYear ? '1 Year' : '6 Months';

  const totalTests = await Test.countDocuments({ athleteId: String(user._id) });
  const allTests   = await getRecentTests(user._id, 20);
  const firstLT2   = allTests.length ? estimateLT2(allTests[allTests.length - 1]) : null;
  const latestLT2  = allTests.length ? estimateLT2(allTests[0]) : null;
  const sport      = latestLT2?.sport || firstLT2?.sport || 'bike';

  let progressBlock = '';
  if (firstLT2 && latestLT2 && firstLT2.sport === latestLT2.sport) {
    const diff = latestLT2.value - firstLT2.value;
    progressBlock = `
      <table role="presentation" style="width:100%;border-collapse:collapse;margin:20px 0;">
        <tr>
          ${statCard({ label: 'LT2 When You Started', value: fmtIntensity(firstLT2.value, sport), color: GRAY     })}
          ${statCard({ label: 'LT2 Today',             value: fmtIntensity(latestLT2.value, sport), color: PRIMARY })}
          ${statCard({ label: 'Total Improvement',     value: (diff >= 0 ? '+' : '') + fmtIntensity(Math.abs(diff), sport), color: diff >= 0 ? GREEN : RED })}
        </tr>
      </table>`;
  }

  const field = isOneYear
    ? 'retentionEmails.milestones.anniversaryOneYearSent'
    : 'retentionEmails.milestones.anniversarySixMonthsSent';

  const body = `
    <div style="text-align:center;padding:10px 0 24px;">
      <div style="font-size:52px;line-height:1;">${emoji}</div>
      <h2 style="margin:16px 0 8px;font-size:24px;font-weight:800;color:${DARK};">${label} with LaChart!</h2>
      <p style="margin:0;font-size:16px;color:${GRAY};">Thank you, ${firstName}. Seriously.</p>
    </div>

    <div style="background:linear-gradient(135deg,${PRIMARY}15 0%,${SECONDARY}15 100%);border-radius:12px;padding:20px;text-align:center;margin-bottom:20px;">
      <div style="font-size:42px;font-weight:800;color:${PRIMARY};">${totalTests}</div>
      <div style="font-size:12px;font-weight:700;color:${GRAY};text-transform:uppercase;letter-spacing:0.8px;margin-top:4px;">Tests logged over ${label.toLowerCase()}</div>
    </div>

    ${progressBlock}

    <p style="margin:0 0 16px;font-size:15px;color:${GRAY};line-height:1.7;">
      ${isOneYear
        ? `A full year of data-driven training. That's ${totalTests} data points that tell the story of your aerobic development. Very few athletes track themselves this meticulously.`
        : `Six months of lactate testing puts you in a very small group of athletes who actually understand their physiology. Keep going — the next six months will be even better.`}
    </p>
  `;

  const html = layout({
    preheader: `${label} using LaChart — here's how far you've come`,
    hero: `${label} Anniversary 🎂`,
    body,
    cta: 'View My Full Journey',
    ctaUrl: `${CLIENT_URL}/testing`,
  });

  const ok = await send({
    to:      user.email,
    subject: `${emoji} ${label} with LaChart — here's how far you've come`,
    html
  });

  if (ok) {
    await User.updateOne(
      { _id: user._id },
      { $set: { [field]: true } }
    );
  }
  return ok;
}

// ─── Exports ──────────────────────────────────────────────────────────────────
module.exports = {
  sendWeeklyProgressEmail,
  sendMonthlyReportEmail,
  sendTestReminderEmail,
  sendReengagementEmail,
  sendMilestoneEmail,
  sendLT2ImprovementEmail,
  sendAnniversaryEmail,
  estimateLT2,
  getRecentTests,
  MILESTONES,
};
