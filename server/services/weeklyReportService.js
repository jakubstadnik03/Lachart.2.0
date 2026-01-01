const nodemailer = require('nodemailer');
const User = require('../models/UserModel');
const StravaActivity = require('../models/StravaActivity');
const fitnessMetricsController = require('../controllers/fitnessMetricsController');
const { generateEmailTemplate, getClientUrl } = require('../utils/emailTemplate');

function getIsoWeekStartUTC(date) {
  const d = new Date(date);
  const day = d.getUTCDay(); // 0..6 (Sun..Sat)
  const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1); // Monday
  d.setUTCDate(diff);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function getLastWeekRangeUTC(now = new Date()) {
  const currentWeekStart = getIsoWeekStartUTC(now);
  const weekEnd = new Date(currentWeekStart);
  const weekStart = new Date(currentWeekStart);
  weekStart.setUTCDate(weekStart.getUTCDate() - 7);
  return { weekStart, weekEnd };
}

function formatSecondsToHMS(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

function metersToKm(meters) {
  return (Number(meters) || 0) / 1000;
}

// Copy of the TSS logic used in server/controllers/fitnessMetricsController.js
function calculateActivityTSS(activity, userProfile = null) {
  try {
    const seconds = Number(activity.movingTime || activity.totalElapsedTime || activity.elapsedTime || activity.duration || 0);
    if (seconds === 0) return 0;

    const ftp =
      userProfile?.powerZones?.cycling?.lt2 ||
      userProfile?.powerZones?.cycling?.zone5?.min ||
      userProfile?.ftp ||
      250;

    const thresholdPace =
      userProfile?.powerZones?.running?.lt2 ||
      userProfile?.runningZones?.lt2 ||
      null;

    const thresholdSwimPace = userProfile?.powerZones?.swimming?.lt2 || null;

    const sport = (activity.sport || '').toLowerCase();

    // Cycling
    if (sport.includes('ride') || sport.includes('cycle') || sport.includes('bike') || sport === 'cycling') {
      const avgPower = Number(activity.averagePower || activity.avgPower || 0);
      if (avgPower > 0 && ftp > 0) {
        const np = avgPower; // NP approximation
        return Math.round((seconds * Math.pow(np, 2)) / (Math.pow(ftp, 2) * 3600) * 100);
      }
    }

    // Running
    if (sport.includes('run') || sport.includes('walk') || sport.includes('hike') || sport === 'running') {
      const avgSpeed = Number(activity.averageSpeed || activity.avgSpeed || 0); // m/s
      if (avgSpeed > 0) {
        const avgPaceSeconds = Math.round(1000 / avgSpeed); // sec per km
        let referencePace = thresholdPace;
        if (!referencePace || referencePace <= 0) referencePace = avgPaceSeconds;
        const intensityRatio = referencePace / avgPaceSeconds;
        return Math.round((seconds * Math.pow(intensityRatio, 2)) / 3600 * 100);
      }
    }

    // Swimming
    if (sport.includes('swim') || sport === 'swimming') {
      const avgSpeed = Number(activity.averageSpeed || activity.avgSpeed || 0); // m/s
      if (avgSpeed > 0) {
        const avgPaceSeconds = Math.round(100 / avgSpeed); // sec per 100m
        let referencePace = thresholdSwimPace;
        if (!referencePace || referencePace <= 0) referencePace = avgPaceSeconds;
        const intensityRatio = referencePace / avgPaceSeconds;
        return Math.round((seconds * Math.pow(intensityRatio, 2)) / 3600 * 100);
      }
    }

    return 0;
  } catch (e) {
    return 0;
  }
}

function computeTrainingStatusFromWeeklyTSS(currentWeekTSS, pastWeeksAvgTSS) {
  const averageTSS = Number(pastWeeksAvgTSS) || 0;
  const current = Number(currentWeekTSS) || 0;

  const optimalMin = averageTSS * 0.8;
  const optimalMax = averageTSS * 1.2;

  let statusText = 'Maintaining';
  let accent = '#3b82f6'; // blue

  if (current > optimalMax * 1.3) {
    statusText = 'Overreaching';
    accent = '#ef4444'; // red
  } else if (current >= optimalMin && current <= optimalMax) {
    statusText = 'Productive';
    accent = '#22c55e'; // green
  } else if (current >= optimalMin * 0.5 && current < optimalMin) {
    statusText = 'Maintaining';
    accent = '#3b82f6'; // blue
  } else if (current > 0 && current < optimalMin * 0.5) {
    statusText = 'Recovery';
    accent = '#f97316'; // orange
  } else if (current === 0) {
    statusText = 'Detraining';
    accent = '#111827'; // gray-900
  }

  return {
    statusText,
    accent,
    optimalMin: Math.round(optimalMin || 0),
    optimalMax: Math.round(optimalMax || 0)
  };
}

async function calculateWeeklyTrainingStatusForRange(userId, weekStart, weekEnd, userProfile) {
  const end = new Date(weekEnd);
  const fourWeeksAgo = new Date(end);
  fourWeeksAgo.setUTCDate(fourWeeksAgo.getUTCDate() - 28);

  const stravaActivities = await StravaActivity.find({
    userId,
    startDate: { $gte: fourWeeksAgo, $lt: end }
  }).select('startDate movingTime averagePower averageSpeed sport');

  // Compute weekly sums: week 0 is [weekStart, weekEnd), then previous weeks based on weekStart
  const weekStarts = [0, 1, 2, 3].map(i => {
    const s = new Date(weekStart);
    s.setUTCDate(s.getUTCDate() - i * 7);
    return s;
  });
  const weekEnds = weekStarts.map(s => {
    const e = new Date(s);
    e.setUTCDate(e.getUTCDate() + 7);
    return e;
  });

  const weekly = weekStarts.map((s, idx) => {
    const e = weekEnds[idx];
    return stravaActivities
      .filter(a => {
        const d = new Date(a.startDate);
        return d >= s && d < e;
      })
      .reduce((sum, a) => sum + calculateActivityTSS(a, userProfile), 0);
  });

  const currentWeekTSS = weekly[0] || 0;
  const pastWeeks = weekly.slice(1).filter(v => v > 0);
  const avg = pastWeeks.length ? pastWeeks.reduce((a, b) => a + b, 0) / pastWeeks.length : currentWeekTSS;

  return {
    weeklyTSS: Math.round(currentWeekTSS || 0),
    ...computeTrainingStatusFromWeeklyTSS(currentWeekTSS, avg)
  };
}

async function buildWeeklyReportSummary(user, weekStart, weekEnd) {
  const userProfile = {
    powerZones: user.powerZones || {},
    ftp: user.ftp || 250
  };

  const activities = await StravaActivity.find({
    userId: user._id,
    startDate: { $gte: weekStart, $lt: weekEnd }
  })
    .sort({ startDate: 1 })
    .select('name titleManual sport startDate movingTime distance averageHeartRate averagePower averageSpeed');

  let totalSeconds = 0;
  let totalDistance = 0;
  let totalTSS = 0;
  let hrWeightedSum = 0;
  let hrWeight = 0;
  let powerWeightedSum = 0;
  let powerWeight = 0;

  for (const a of activities) {
    const seconds = Number(a.movingTime || 0);
    const dist = Number(a.distance || 0);
    const tss = calculateActivityTSS(a, userProfile);
    totalSeconds += seconds;
    totalDistance += dist;
    totalTSS += tss;

    const hr = Number(a.averageHeartRate || 0);
    if (hr > 0 && seconds > 0) {
      hrWeightedSum += hr * seconds;
      hrWeight += seconds;
    }

    const pw = Number(a.averagePower || 0);
    if (pw > 0 && seconds > 0) {
      powerWeightedSum += pw * seconds;
      powerWeight += seconds;
    }
  }

  const avgHr = hrWeight ? Math.round(hrWeightedSum / hrWeight) : null;
  const avgPower = powerWeight ? Math.round(powerWeightedSum / powerWeight) : null;

  // “Fitness” shown like FormBeat: use Form (TSB) from your existing model on the last day of the week
  let formValue = null;
  try {
    const data = await fitnessMetricsController.calculateFormFitnessData(String(user._id), 90);
    const lastDay = new Date(weekEnd);
    lastDay.setUTCDate(lastDay.getUTCDate() - 1);
    const lastDayKey = lastDay.toISOString().split('T')[0];
    const found = data.find(d => d.date === lastDayKey);
    formValue = found ? found.Form : null;
  } catch (e) {
    // ignore
  }

  const trainingStatus = await calculateWeeklyTrainingStatusForRange(user._id, weekStart, weekEnd, userProfile);

  return {
    trainingStatus,
    formValue,
    totalTSS: Math.round(totalTSS || 0),
    totalSeconds,
    totalDistanceMeters: totalDistance,
    avgHr,
    avgPower,
    activities: activities.map(a => ({
      name: (a.titleManual && a.titleManual.trim()) ? a.titleManual : (a.name || 'Untitled'),
      sport: a.sport || '',
      startDate: a.startDate,
      seconds: Number(a.movingTime || 0),
      distanceMeters: Number(a.distance || 0)
    }))
  };
}

function renderWeeklyReportContent({ userName, weekStart, weekEnd, summary }) {
  const clientUrl = getClientUrl();
  const weekStartLabel = weekStart.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  const weekEndLabel = new Date(weekEnd.getTime() - 1).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

  const km = metersToKm(summary.totalDistanceMeters);
  const duration = formatSecondsToHMS(summary.totalSeconds);

  const trainingStatus = summary.trainingStatus?.statusText || '—';
  const statusAccent = summary.trainingStatus?.accent || '#767EB5';

  const activityRows = summary.activities
    .slice(0, 12)
    .map(a => {
      const dateLabel = a.startDate ? new Date(a.startDate).toLocaleDateString('en-US', { weekday: 'short' }) : '';
      const distKm = metersToKm(a.distanceMeters);
      return `
        <tr>
          <td style="padding: 10px 0; border-bottom: 1px solid #eef2f7;">
            <div style="font-weight: 600; color: #111827; font-size: 14px;">${a.name}</div>
            <div style="color: #6b7280; font-size: 12px;">${dateLabel} • ${a.sport || ''}</div>
          </td>
          <td style="padding: 10px 0; border-bottom: 1px solid #eef2f7; text-align: right; color: #111827; font-size: 14px; white-space: nowrap;">
            ${formatSecondsToHMS(a.seconds)}
          </td>
          <td style="padding: 10px 0; border-bottom: 1px solid #eef2f7; text-align: right; color: #111827; font-size: 14px; white-space: nowrap;">
            ${distKm.toFixed(1)} km</td>
        </tr>
      `;
    })
    .join('');

  const metricsRow = (label, value, accentColor = '#111827') => `
    <tr>
      <td style="padding: 10px 0; color: #6b7280; font-size: 13px;">${label}</td>
      <td style="padding: 10px 0; text-align: right; color: ${accentColor}; font-size: 16px; font-weight: 700; white-space: nowrap;">${value}</td>
    </tr>
  `;

  return `
    <p style="margin: 0 0 14px;">Hi <strong>${userName}</strong>, here’s a summary of your last week.</p>
    <p style="margin: 0 0 18px; color: #6b7280; font-size: 14px;">${weekStartLabel} – ${weekEndLabel}</p>

    <div style="border: 1px solid #eef2f7; border-radius: 10px; padding: 18px; background: #ffffff;">
      <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom: 10px;">
        <div style="color:#6b7280; font-size: 13px;">Training Status</div>
        <div style="font-weight:700; color:${statusAccent}; font-size: 16px;">${trainingStatus}</div>
      </div>
      <table role="presentation" style="width: 100%; border-collapse: collapse;">
        ${metricsRow('Fitness', summary.formValue === null ? '—' : String(summary.formValue), '#111827')}
        ${metricsRow('TSS', String(summary.totalTSS))}
        ${metricsRow('Duration', duration)}
        ${metricsRow('Distance', `${km.toFixed(1)} km`)}
        ${metricsRow('HR', summary.avgHr ? `${summary.avgHr}` : '—')}
        ${metricsRow('Normalized Power', summary.avgPower ? `${summary.avgPower} W` : '—')}
      </table>
    </div>

    <div style="height: 18px;"></div>

    <h3 style="margin: 0 0 10px; color: #111827; font-size: 18px;">Activities (${summary.activities.length})</h3>
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
      <tr>
        <th style="text-align:left; padding: 0 0 8px; color:#6b7280; font-size:12px; font-weight:600;">Activity</th>
        <th style="text-align:right; padding: 0 0 8px; color:#6b7280; font-size:12px; font-weight:600;">Duration</th>
        <th style="text-align:right; padding: 0 0 8px; color:#6b7280; font-size:12px; font-weight:600;">Distance</th>
      </tr>
      ${activityRows || `
        <tr><td colspan="3" style="padding: 14px 0; color:#6b7280;">No activities found for this week.</td></tr>
      `}
    </table>

    ${summary.activities.length > 12 ? `<p style="margin: 12px 0 0; color:#6b7280; font-size: 12px;">Showing first 12 activities.</p>` : ''}
  `.trim();
}

function createTransporter() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_APP_PASSWORD
    }
  });
}

async function sendWeeklyReportEmailToUser(user, weekStart, weekEnd, { force = false } = {}) {
  if (!user?.email) return { sent: false, reason: 'no_email' };
  if (!user?.notifications?.emailNotifications) return { sent: false, reason: 'email_notifications_disabled' };
  if (!user?.notifications?.weeklyReports) return { sent: false, reason: 'weekly_reports_disabled' };
  if (!user?.strava?.accessToken || !user?.strava?.athleteId) return { sent: false, reason: 'strava_not_connected' };

  const alreadySent = user.notifications?.weeklyReportsLastSentWeekStart
    ? new Date(user.notifications.weeklyReportsLastSentWeekStart).toISOString().split('T')[0] === weekStart.toISOString().split('T')[0]
    : false;

  if (alreadySent && !force) return { sent: false, reason: 'already_sent' };

  if (!process.env.EMAIL_USER || !process.env.EMAIL_APP_PASSWORD) {
    return { sent: false, reason: 'email_not_configured' };
  }

  const summary = await buildWeeklyReportSummary(user, weekStart, weekEnd);
  const htmlContent = renderWeeklyReportContent({
    userName: user.name || 'there',
    weekStart,
    weekEnd,
    summary
  });

  const transporter = createTransporter();
  const clientUrl = getClientUrl();

  const subject = `LaChart - Your Weekly Stats (${weekStart.toISOString().split('T')[0]})`;

  await transporter.sendMail({
    from: { name: 'LaChart', address: process.env.EMAIL_USER },
    to: user.email,
    subject,
    html: generateEmailTemplate({
      title: 'Your Weekly Stats',
      content: htmlContent,
      buttonText: 'Open Your Dashboard',
      buttonUrl: `${clientUrl}/`,
      footerText: 'You can control weekly emails in Settings → Notifications.'
    })
  });

  // Store last-sent marker
  user.notifications = user.notifications || {};
  user.notifications.weeklyReportsLastSentWeekStart = weekStart;
  user.markModified('notifications');
  await user.save();

  return { sent: true };
}

async function sendWeeklyReportsForWeek({ weekStart, weekEnd, force = false } = {}) {
  const eligibleUsers = await User.find({
    email: { $ne: null },
    isActive: { $ne: false },
    'notifications.emailNotifications': true,
    'notifications.weeklyReports': true,
    'strava.accessToken': { $ne: null },
    'strava.athleteId': { $ne: null }
  }).select('name email strava powerZones ftp notifications isActive');

  const results = {
    totalEligible: eligibleUsers.length,
    sent: 0,
    skipped: 0,
    reasons: {}
  };

  for (const user of eligibleUsers) {
    try {
      const r = await sendWeeklyReportEmailToUser(user, weekStart, weekEnd, { force });
      if (r.sent) results.sent += 1;
      else {
        results.skipped += 1;
        const reason = r.reason || 'unknown';
        results.reasons[reason] = (results.reasons[reason] || 0) + 1;
      }
    } catch (e) {
      results.skipped += 1;
      results.reasons.send_failed = (results.reasons.send_failed || 0) + 1;
      console.error('[WeeklyReport] Failed for user', user?._id, e.message);
    }
  }

  return results;
}

module.exports = {
  getIsoWeekStartUTC,
  getLastWeekRangeUTC,
  sendWeeklyReportsForWeek,
  sendWeeklyReportEmailToUser
};


