const User = require('../models/UserModel');
const { buildWeeklyReportSummary } = require('./weeklyReportService');
const { sendNotification } = require('../utils/notificationHelper');
const { createEmailTransporter } = require('../utils/createEmailTransporter');
const { generateEmailTemplate, getClientUrl } = require('../utils/emailTemplate');

async function sendWeeklyDigestEmail(user, weekStart, weekEnd, weekKey) {
  if (!user?.email) return false;
  if (user.notifications?.emailNotifications === false) return false;
  if (user.notifications?.weeklyDigestEmail === false) return false;
  if (user.weeklyDigestEmailLastWeekStart === weekKey) return false;
  if (!process.env.EMAIL_USER || !process.env.EMAIL_APP_PASSWORD) return false;

  const summary = await buildWeeklyReportSummary(user, weekStart, weekEnd);
  const tss = Math.round(summary?.totals?.totalTSS || 0);
  const form = summary?.formValue != null ? Math.round(summary.formValue) : null;
  const status = summary?.trainingStatus?.statusText || '—';
  const formPart = form != null ? `, Form ${form >= 0 ? '+' : ''}${form}` : '';
  const overreach = status === 'Overreaching' ? ', 1× overreaching' : '';

  const transporter = createEmailTransporter();
  const clientUrl = getClientUrl();
  const weekStartFmt = weekStart.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
  const weekEndFmt = weekEnd.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });

  await transporter.sendMail({
    from: { name: 'LaChart', address: process.env.EMAIL_USER },
    to: user.email,
    subject: `Weekly summary — ${weekStartFmt} → ${weekEndFmt}`,
    html: generateEmailTemplate({
      title: 'Weekly summary',
      content: `
        <p>Hi ${user.name || ''},</p>
        <p>This week: <strong>${tss} TSS</strong>${formPart}. Status: <strong>${status}</strong>${overreach}.</p>
        <p>A quick snapshot from your training — same numbers as the Sunday push notification.</p>
      `.trim(),
      buttonText: 'Open dashboard',
      buttonUrl: `${clientUrl}/dashboard`,
      footerText: 'Turn off email digest? Settings → Notifications → Weekly digest email.',
    }),
  });

  await User.updateOne({ _id: user._id }, { $set: { weeklyDigestEmailLastWeekStart: weekKey } });
  return true;
}

function getIsoWeekStartUTC(date) {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1);
  d.setUTCDate(diff);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function startWeeklyDigestScheduler() {
  const enabled =
    process.env.ENABLE_WEEKLY_DIGEST_SCHEDULER === 'true' || process.env.NODE_ENV === 'production';
  if (!enabled) {
    console.log('[WeeklyDigestScheduler] Disabled (set ENABLE_WEEKLY_DIGEST_SCHEDULER=true).');
    return;
  }

  /** Default 17:00 UTC ≈ 19:00 CET (summer 18:00). */
  const sendHourUtc = Number(process.env.WEEKLY_DIGEST_SEND_HOUR_UTC || 17);
  const intervalMs = Number(process.env.WEEKLY_DIGEST_SCHEDULER_INTERVAL_MS || 30 * 60 * 1000);

  const tick = async () => {
    const now = new Date();
    if (now.getUTCDay() !== 0) return;
    const hour = now.getUTCHours();
    if (hour < sendHourUtc || hour > sendHourUtc + 1) return;

    // Sunday-evening digest summarizes the week that is ending TODAY (the
    // current Mon–Sun ISO week), so the numbers line up with the calendar and
    // the "This week load" widget. getLastWeekRangeUTC would return the *prior*
    // week here, which is what the Monday report scheduler wants — not this one.
    const weekStart = getIsoWeekStartUTC(now);
    const weekEnd = new Date(weekStart);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);
    const weekKey = weekStart.toISOString().slice(0, 10);

    const users = await User.find({
      isActive: { $ne: false },
      $or: [
        { 'notifications.weeklyDigest': { $ne: false }, expoPushTokens: { $exists: true, $not: { $size: 0 } } },
        { 'notifications.weeklyDigestEmail': { $ne: false }, email: { $ne: null } },
      ],
    })
      .select('_id name email ftp powerZones heartRateZones restingHr maxHr weight trainingPreferences notifications weeklyDigestPushLastWeekStart weeklyDigestEmailLastWeekStart expoPushTokens strava garmin appleHealth')
      .limit(2000)
      .lean();

    let sentPush = 0;
    let sentEmail = 0;
    for (const user of users) {
      try {
        // Don't nag users who have nothing to summarize: skip unless they've
        // connected a data source (Strava / Garmin / Apple Health) or actually
        // logged something this week (covers FIT-upload / manual-only users).
        const hasConnectedSource = Boolean(
          user.strava?.athleteId || user.strava?.accessToken ||
          user.garmin?.athleteId || user.garmin?.accessToken ||
          user.appleHealth?.connectedAt
        );

        const summary = await buildWeeklyReportSummary(user, weekStart, weekEnd);

        const hasDataThisWeek =
          (summary?.totals?.totalSeconds || 0) > 0 ||
          (summary?.activities?.length || 0) > 0;
        if (!hasConnectedSource && !hasDataThisWeek) continue;

        const tss = Math.round(summary?.totals?.totalTSS || 0);
        const form = summary?.formValue != null ? Math.round(summary.formValue) : null;
        const status = summary?.trainingStatus?.statusText || '—';
        const formPart = form != null ? `, Form ${form >= 0 ? '+' : ''}${form}` : '';
        const overreach = status === 'Overreaching' ? ', 1× overreaching' : '';

        if (user.expoPushTokens?.length && user.notifications?.weeklyDigest !== false && user.weeklyDigestPushLastWeekStart !== weekKey) {
          await sendNotification(String(user._id), {
            type: 'weekly_digest',
            title: 'Weekly summary',
            body: `This week: ${tss} TSS${formPart}${overreach}.`,
            resourceType: 'dashboard',
            pushData: { screen: 'dashboard' },
          });

          await User.updateOne(
            { _id: user._id },
            { $set: { weeklyDigestPushLastWeekStart: weekKey } }
          );
          sentPush += 1;
        }

        if (user.notifications?.weeklyDigestEmail !== false) {
          const emailed = await sendWeeklyDigestEmail(user, weekStart, weekEnd, weekKey);
          if (emailed) sentEmail += 1;
        }
      } catch (e) {
        console.error('[WeeklyDigestScheduler] user', user._id, e.message || e);
      }
    }

    if (sentPush > 0 || sentEmail > 0) {
      console.log('[WeeklyDigestScheduler] Sent', sentPush, 'push +', sentEmail, 'email for week', weekKey);
    }
  };

  setTimeout(() => tick().catch((e) => console.error('[WeeklyDigestScheduler] tick', e)), 120 * 1000);
  setInterval(() => tick().catch((e) => console.error('[WeeklyDigestScheduler] tick', e)), intervalMs);
  console.log('[WeeklyDigestScheduler] Started.', { sendHourUtc, intervalMs });
}

module.exports = { startWeeklyDigestScheduler, getIsoWeekStartUTC };
