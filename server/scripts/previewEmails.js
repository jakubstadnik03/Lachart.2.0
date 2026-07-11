/* eslint-disable */
/**
 * Render every transactional email variant to /tmp/lachart-email-preview/
 * so the new branded wrapper can be eyeballed in a browser before deploying.
 *
 * Run from the server/ dir:  node scripts/previewEmails.js
 * Then:  open /tmp/lachart-email-preview/index.html
 *
 * Add new samples here whenever you ship a new email type — it makes
 * regression checks trivial when the brand wrapper changes again.
 */

const fs = require('fs');
const path = require('path');
const { generateEmailTemplate } = require('../utils/emailTemplate');
const { buildLactateCurveSvg, svgToEmailImgSrc } = require('../utils/lactateReportSvgs');

const OUT_DIR = '/tmp/lachart-email-preview';
fs.mkdirSync(OUT_DIR, { recursive: true });

// Production client URL — keep in sync with getClientUrl() in emailTemplate.js.
const CLIENT_URL = 'https://lachart.net';

// Pre-render a sample lactate curve SVG → PNG data URL once at startup so the
// lactate-report sample faithfully mirrors what real users receive. The real
// send path uses the exact same helpers (lactateReportSvgs.js).
async function buildSampleLactateChart() {
  const svg = buildLactateCurveSvg({
    sport: 'bike',
    sportLabel: 'Cycling',
    xLabel: 'Power (W)',
    unitSystem: 'metric',
    inputMode: 'power',
    // 7-stage progressive ramp with the classic exponential lactate rise
    // — values picked to land LT1 around 198 W (2.0 mmol/L) and LT2 around
    // 281 W (4.0 mmol/L), matching the sample title/body numbers above.
    results: [
      { power: 120, lactate: 1.1 },
      { power: 160, lactate: 1.4 },
      { power: 200, lactate: 2.0 },
      { power: 240, lactate: 2.8 },
      { power: 280, lactate: 4.0 },
      { power: 320, lactate: 6.2 },
      { power: 360, lactate: 9.1 },
    ],
    lt1: { x: 198, label: 'LT1', color: '#767EB5' },
    lt2: { x: 281, label: 'LT2', color: '#FF6B4A' },
  });
  // Use the default (1.5×) so preview matches what real users receive
  return svg ? await svgToEmailImgSrc(svg) : null;
}

// Live samples — these mirror the real services as closely as we can without
// requiring DB/Stripe fixtures. Update when you ship a new email type so
// regressions in the brand wrapper are caught at preview time, not at send.
const samples = [
  {
    name: 'verify-email',
    label: 'Verify email — new signup',
    args: (() => {
      const verificationUrl = `${CLIENT_URL}/verify-email/sample-token`;
      const lactateTestingImage = `${CLIENT_URL}/images/lactate_testing.png`;
      const stravaConnectUrl = `${CLIENT_URL}/settings?tab=integrations`;
      return {
        title: 'Confirm your email and let\'s go',
        content: `
          <p>Hi <strong>Jakub</strong>,</p>
          <p>Welcome to LaChart — the home for blood-lactate tests, training zones, and the data that actually tells you whether you're getting faster.</p>
          <p>One click and you're in:</p>
          <div style="margin: 22px 0; text-align: center;">
            <img src="${lactateTestingImage}" alt="" style="max-width: 100%; height: auto; border-radius: 12px; box-shadow: 0 4px 14px rgba(15, 23, 42, 0.08);" />
          </div>
          <p style="margin-top: 26px; font-size: 15.5px; color: #1D2C4C;"><strong>Here's what's waiting for you once you verify:</strong></p>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width: 100%; margin: 14px 0; border-collapse: separate; border-spacing: 0 8px;">
            <tr><td style="background-color: #E9ECF6; border-radius: 10px; padding: 14px 16px;">
              <div style="font-weight: 700; color: #0A0E1A; font-size: 15px;">📈 Lactate curve from any step test</div>
              <div style="color: #4A5E82; font-size: 14px; line-height: 1.5; margin-top: 2px;">Paste your test values, instantly get LT1, LT2, OBLA, IAT, D-max — and matching training zones.</div>
            </td></tr>
            <tr><td style="background-color: #E9ECF6; border-radius: 10px; padding: 14px 16px;">
              <div style="font-weight: 700; color: #0A0E1A; font-size: 15px;">📅 Plan structured workouts in the calendar</div>
              <div style="color: #4A5E82; font-size: 14px; line-height: 1.5; margin-top: 2px;">Warm-up · intervals with target zones · recoveries · cooldown — drop them on any day and run them from the app.</div>
            </td></tr>
            <tr><td style="background-color: #E9ECF6; border-radius: 10px; padding: 14px 16px;">
              <div style="font-weight: 700; color: #0A0E1A; font-size: 15px;">💧 Add lactate samples to any interval</div>
              <div style="color: #4A5E82; font-size: 14px; line-height: 1.5; margin-top: 2px;">Tag any interval of a workout with a blood lactate value. Each sample re-builds your curve.</div>
            </td></tr>
            <tr><td style="background-color: #E9ECF6; border-radius: 10px; padding: 14px 16px;">
              <div style="font-weight: 700; color: #0A0E1A; font-size: 15px;">❤️ Form, fitness &amp; fatigue tracking</div>
              <div style="color: #4A5E82; font-size: 14px; line-height: 1.5; margin-top: 2px;">CTL · ATL · TSB charted over weeks. See when you're peaking and when to back off.</div>
            </td></tr>
            <tr><td style="background-color: #FFE6DF; border-radius: 10px; padding: 14px 16px;">
              <div style="font-weight: 700; color: #0A0E1A; font-size: 15px;">⚡ Auto-import every workout from Strava</div>
              <div style="color: #4A5E82; font-size: 14px; line-height: 1.5; margin-top: 2px;">Connect once — every ride, run and swim flows in automatically with power, HR, pace and laps. <a href="${stravaConnectUrl}" style="color: #E85535; font-weight: 600; text-decoration: none;">Set it up after verifying →</a></div>
            </td></tr>
          </table>
          <p style="margin-top: 24px;">Verify your email below, then sign in and you're set.</p>
          <p style="margin-top: 22px; color: #6B7280; font-size: 13.5px;"><strong>Note:</strong> this link expires in 24 hours. Didn't sign up for LaChart? You can ignore this — we won't email you again.</p>
        `,
        buttonText: 'Verify my email',
        buttonUrl: verificationUrl,
        footerText: `Button not working? Copy &amp; paste this link into your browser: ${verificationUrl}`,
      };
    })(),
  },
  {
    name: 'strava-reminder',
    label: 'Strava connect reminder (admin send)',
    args: (() => {
      const cardStyle = 'background-color: #E9ECF6; border-radius: 10px; padding: 14px 16px;';
      const accentCardStyle = 'background-color: #FFE6DF; border-radius: 10px; padding: 14px 16px;';
      const cardTitleStyle = 'font-weight: 700; color: #0A0E1A; font-size: 15px;';
      const cardBodyStyle = 'color: #4A5E82; font-size: 14px; line-height: 1.5; margin-top: 2px;';
      return {
        title: 'Connect Strava and let LaChart do the work',
        content: `
          <p>Hi <strong>Jakub</strong>,</p>
          <p>You're using LaChart — but you haven't connected Strava yet. That's the one setup step that turns LaChart from "manual logger" into "automatic training brain". Takes 30 seconds.</p>
          <div style="margin: 22px 0; text-align: center;">
            <img src="${CLIENT_URL}/images/lactate_testing.png" alt="" style="max-width: 100%; height: auto; border-radius: 12px; box-shadow: 0 4px 14px rgba(15, 23, 42, 0.08);" />
          </div>
          <p style="margin-top: 22px; font-size: 15.5px;"><strong>What you unlock by connecting:</strong></p>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width: 100%; margin: 12px 0 18px; border-collapse: separate; border-spacing: 0 8px;">
            <tr><td style="${cardStyle}">
              <div style="${cardTitleStyle}">⚡ Auto-import every workout</div>
              <div style="${cardBodyStyle}">Every ride, run and swim flows in with power, HR, pace and laps — never type a workout in again.</div>
            </td></tr>
            <tr><td style="${cardStyle}">
              <div style="${cardTitleStyle}">🏷️ Auto-categorize by zone &amp; structure</div>
              <div style="${cardBodyStyle}">Endurance · threshold · VO2max · recovery — sorted from intervals, zones and titles.</div>
            </td></tr>
            <tr><td style="${cardStyle}">
              <div style="${cardTitleStyle}">❤️ Form, fitness &amp; fatigue charted</div>
              <div style="${cardBodyStyle}">CTL · ATL · TSB built automatically from every workout.</div>
            </td></tr>
            <tr><td style="${cardStyle}">
              <div style="${cardTitleStyle}">💧 Add lactate to any imported interval</div>
              <div style="${cardBodyStyle}">Tag any interval of a synced workout with a blood-lactate sample.</div>
            </td></tr>
            <tr><td style="${accentCardStyle}">
              <div style="${cardTitleStyle}">🧠 Smarter test protocols</div>
              <div style="${cardBodyStyle}">LaChart suggests step-test power ranges based on your Strava power history.</div>
            </td></tr>
          </table>
          <p style="margin-top: 20px;">Stuck on the connect step? Reply to this email — it lands in my inbox.</p>
          <p style="margin-top: 6px;">— Jakub<br/><span style="color: #6B7280; font-size: 14px;">Creator of LaChart</span></p>
        `,
        buttonText: 'Connect Strava (30 seconds)',
        buttonUrl: `${CLIENT_URL}/settings?tab=integrations`,
        loginButtonText: 'Open my dashboard',
        loginButtonUrl: `${CLIENT_URL}/dashboard`,
        footerText: 'You only need to do this once per account. Disconnect any time from Settings → Integrations.',
      };
    })(),
  },
  {
    name: 'welcome',
    label: 'Welcome — new free signup',
    args: {
      title: "Welcome to LaChart, Jakub",
      content: `
        <p>Glad to have you on board. LaChart is the simplest way to turn a blood-lactate step test into LT1, LT2, training zones and a PDF report your athlete actually reads.</p>
        <p>Here's a quick tour of what to do first:</p>
        <ul>
          <li>Open the <strong>Lactate Curve Calculator</strong> and paste a test you already have.</li>
          <li>Save it to your free account so you can compare against later tests.</li>
          <li>Connect Strava if you want auto-import of every workout.</li>
        </ul>
        <p>If you get stuck, just reply to this email — it lands in my inbox directly.</p>
      `,
      buttonText: 'Open my dashboard',
      buttonUrl: 'https://lachart.net/dashboard',
      footerText: 'You received this email because you created a free LaChart account.',
    },
  },
  {
    name: 'trial-ending',
    label: 'Trial ending in 3 days',
    args: {
      title: "Your free trial ends in 3 days",
      content: `
        <p>Quick heads-up — your 60-day LaChart trial wraps up on <strong>July 31, 2026</strong>.</p>
        <p>You've logged <strong>14 lactate tests</strong> and built <strong>22 training-zone profiles</strong> on the trial. Nice work.</p>
        <p>Upgrade today and you keep:</p>
        <ul>
          <li>All your past tests + curves</li>
          <li>Auto-sync from Strava</li>
          <li>Branded PDF exports for your athletes</li>
        </ul>
        <p>If you'd rather pause, no action needed — your account drops to the free tier automatically.</p>
      `,
      buttonText: 'Continue with Athlete — €6.99/mo',
      buttonUrl: 'https://lachart.net/settings?tab=subscription',
      loginButtonText: 'Manage subscription',
      loginButtonUrl: 'https://lachart.net/settings?tab=subscription',
      footerText: 'Questions about pricing? Reply to this email — Jakub will get back the same day.',
    },
  },
  {
    name: 'payment-receipt',
    label: 'Payment receipt — Athlete renewal',
    args: {
      title: "Payment received — thanks for renewing",
      content: `
        <p>Hi Jakub,</p>
        <p>Your LaChart Athlete subscription renewed successfully. Here's the receipt for your records:</p>
        <table role="presentation" style="width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 14.5px;">
          <tr><td style="padding: 8px 0; color: #4A5E82;">Plan</td><td style="padding: 8px 0; text-align: right; font-weight: 600;">LaChart Athlete · Monthly</td></tr>
          <tr><td style="padding: 8px 0; color: #4A5E82;">Amount</td><td style="padding: 8px 0; text-align: right; font-weight: 600;">€6.99</td></tr>
          <tr><td style="padding: 8px 0; color: #4A5E82;">VAT (21%)</td><td style="padding: 8px 0; text-align: right;">€1.47</td></tr>
          <tr style="border-top: 1px solid #E5E7EB;"><td style="padding: 12px 0 0; color: #0A0E1A; font-weight: 700;">Total charged</td><td style="padding: 12px 0 0; text-align: right; font-weight: 700; color: #0A0E1A;">€8.46</td></tr>
          <tr><td style="padding: 6px 0; color: #4A5E82;">Next billing date</td><td style="padding: 6px 0; text-align: right;">July 28, 2026</td></tr>
        </table>
        <p>The full invoice is attached as a PDF — or you can download it any time from your subscription settings.</p>
      `,
      buttonText: 'View billing history',
      buttonUrl: 'https://lachart.net/settings?tab=subscription',
      footerText: 'You will be charged €8.46 on July 28, 2026 unless you cancel before then.',
    },
  },
  {
    name: 'cancel-confirm',
    label: 'Subscription canceled',
    args: {
      title: "Your subscription is canceled",
      content: `
        <p>Hi Jakub,</p>
        <p>I just processed your cancellation. Your LaChart Athlete plan stays active until <strong>July 28, 2026</strong> — after that, your account drops to the free tier. Nothing else is charged.</p>
        <p>Your data isn't going anywhere. Every test you've saved, every zone you've configured, every Strava activity you've imported — all of it stays in your account, free tier or not.</p>
        <p>If something specific made you cancel, I'd genuinely like to hear about it. Just reply to this email.</p>
      `,
      loginButtonText: 'Reactivate any time',
      loginButtonUrl: 'https://lachart.net/settings?tab=subscription',
      footerText: 'If you change your mind before July 28, you can reactivate with one click and keep your current plan + price.',
    },
  },
  {
    name: 'password-reset',
    label: 'Password reset',
    args: {
      title: "Reset your LaChart password",
      content: `
        <p>Someone (hopefully you) asked to reset the password on this LaChart account. Click the button below to set a new one — the link expires in 1 hour.</p>
        <p>If you didn't request this, you can safely ignore the email. Your password stays unchanged.</p>
      `,
      buttonText: 'Reset password',
      buttonUrl: 'https://lachart.net/reset-password/xyz123',
      footerText: 'For your security, this link works only once and expires after 60 minutes.',
    },
  },
  {
    name: 'lactate-report',
    label: 'Lactate test report — athlete delivery',
    // Function-returning so we can await the chart render before rendering the
    // template. All other samples can stay plain objects.
    argsAsync: async () => {
      const chartImgSrc = await buildSampleLactateChart();
      return {
        title: "Your lactate test results are ready",
        content: `
          <p>Hi Jakub,</p>
          <p>Your latest lactate step test (July 14, 2026) is processed. Here's the headline:</p>

          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width: 100%; border-collapse: collapse; margin: 16px 0;">
            <tr>
              <td style="padding: 12px 14px; background-color: #E9ECF6; border-radius: 10px 0 0 10px;">
                <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #767EB5; font-weight: 700;">LT1 — Aerobic</div>
                <div style="font-size: 22px; font-weight: 800; color: #0A0E1A; margin-top: 2px;">198 W</div>
                <div style="font-size: 12px; color: #6B7280;">2.0 mmol/L · HR 138</div>
              </td>
              <td style="width: 8px;"></td>
              <td style="padding: 12px 14px; background-color: #FFE6DF; border-radius: 0 10px 10px 0;">
                <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #E85535; font-weight: 700;">LT2 — Threshold</div>
                <div style="font-size: 22px; font-weight: 800; color: #0A0E1A; margin-top: 2px;">281 W</div>
                <div style="font-size: 12px; color: #6B7280;">4.0 mmol/L · HR 173</div>
              </td>
            </tr>
          </table>

          ${chartImgSrc ? `
          <div style="margin: 18px 0; border-radius: 14px; overflow: hidden; border: 1px solid #EEF2F7; background-color: #FFFFFF;">
            <img src="${chartImgSrc}" alt="Your lactate curve — LT1 198 W, LT2 281 W" style="display: block; width: 100%; height: auto;" />
          </div>
          <p style="font-size: 13px; color: #6B7280; margin: 0 0 18px; text-align: center;">
            Your lactate curve — blue dashed line marks LT1, coral marks LT2.
          </p>` : ''}

          <p>Compared to your April test, LT2 jumped <strong>+12 W</strong> at the same body weight. The full curve, all 8 threshold methods, and your updated training zones are in the PDF.</p>
        `,
        buttonText: 'Open full report',
        buttonUrl: 'https://lachart.net/training-calendar/abc',
        loginButtonText: 'Connect Strava',
        loginButtonUrl: 'https://lachart.net/settings?tab=integrations',
        footerText: 'PDF attached — you can also re-download it any time from your test history.',
      };
    },
  },
  {
    name: 'weekly-report',
    label: 'Weekly training summary',
    args: {
      title: "Your week — July 21–27",
      content: `
        <p>Hi Jakub, here's your training summary for the past seven days.</p>
        <table role="presentation" style="width: 100%; border-collapse: collapse; margin: 14px 0; font-size: 14.5px;">
          <tr><td style="padding: 6px 0; color: #4A5E82;">Total time</td><td style="padding: 6px 0; text-align: right; font-weight: 600;">9 h 14 min</td></tr>
          <tr><td style="padding: 6px 0; color: #4A5E82;">Total TSS</td><td style="padding: 6px 0; text-align: right; font-weight: 600;">487</td></tr>
          <tr><td style="padding: 6px 0; color: #4A5E82;">Distance (bike)</td><td style="padding: 6px 0; text-align: right; font-weight: 600;">214 km</td></tr>
          <tr><td style="padding: 6px 0; color: #4A5E82;">Distance (run)</td><td style="padding: 6px 0; text-align: right; font-weight: 600;">42 km</td></tr>
          <tr><td style="padding: 6px 0; color: #4A5E82;">CTL (Form)</td><td style="padding: 6px 0; text-align: right; font-weight: 600; color: #4BA87D;">63 · +2</td></tr>
        </table>
        <p>Your CTL is climbing nicely — Form is now at +2. Good week to schedule that race-pace simulation.</p>
      `,
      buttonText: 'See full week breakdown',
      buttonUrl: 'https://lachart.net/training-calendar',
      footerText: 'You can switch weekly summaries off any time under Settings → Notifications.',
    },
  },
];

// Render each sample to a file + build an index page. Samples can expose
// either `args` (sync object) or `argsAsync` (async function returning args)
// — the lactate-report one builds a real chart and is async; everything else
// is sync. Both paths go through the same generateEmailTemplate() call so the
// output is identical to what production sends.
(async () => {
  const indexLinks = [];
  for (const s of samples) {
    const args = typeof s.argsAsync === 'function' ? await s.argsAsync() : s.args;
    const html = generateEmailTemplate(args);
    const file = `${s.name}.html`;
    fs.writeFileSync(path.join(OUT_DIR, file), html);
    indexLinks.push(`<li><a href="${file}">${s.label}</a> <span style="color:#9ca3af;font-size:12px;">(${(html.length/1024).toFixed(1)} KB)</span></li>`);
    console.log(`✓ ${s.name.padEnd(20)} — ${(html.length/1024).toFixed(1)} KB`);
  }

  fs.writeFileSync(path.join(OUT_DIR, 'index.html'), `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>LaChart email preview</title>
<style>body{font:15px/1.6 -apple-system,sans-serif;max-width:560px;margin:40px auto;padding:0 20px;color:#1D2C4C}h1{font-size:22px}li{margin:8px 0}a{color:#767EB5;text-decoration:none;font-weight:600}a:hover{text-decoration:underline}</style>
</head><body>
<h1>LaChart transactional email preview</h1>
<p style="color:#6B7280">Branded wrapper rendered for every email type the system ships. Open each one in the browser to eyeball before deploying.</p>
<ul>${indexLinks.join('\n')}</ul>
</body></html>`);

  console.log(`\n✓ Index: file://${OUT_DIR}/index.html`);
})().catch((err) => {
  console.error('Preview generation failed:', err);
  process.exit(1);
});
