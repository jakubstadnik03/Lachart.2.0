const mongoose = require('mongoose');
const User = require('../models/UserModel');
const PlannedWorkout = require('../models/PlannedWorkout');
const AppleHealthWellness = require('../models/AppleHealthWellness');
const { calculateFormFitnessData } = require('../controllers/fitnessMetricsController');
const { sendNotification } = require('../utils/notificationHelper');
const { evaluateTrainingAlerts } = require('../utils/trainingAlertUtils');

function startOfUtcDay(d = new Date()) {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

function daysSince(date) {
  if (!date) return Infinity;
  return (startOfUtcDay(new Date()) - startOfUtcDay(new Date(date))) / 86400000;
}

async function countComplianceStreak(athleteId) {
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 10);
  since.setUTCHours(0, 0, 0, 0);
  const today = startOfUtcDay(new Date());

  const plans = await PlannedWorkout.find({
    athleteId: String(athleteId),
    date: { $gte: since, $lt: today },
    status: { $ne: 'skipped' },
  })
    .sort({ date: -1 })
    .limit(6)
    .lean();

  let streak = 0;
  for (const pw of plans) {
    if (pw.status === 'planned') {
      streak += 1;
      continue;
    }
    if (pw.status === 'completed') {
      const planned = Number(pw.plannedDuration) || 0;
      const actual = Number(pw.executionData?.totalDurationSeconds || pw.executionData?.durationSeconds || 0);
      if (planned > 0 && actual > 0 && actual / planned < 0.55) {
        streak += 1;
        continue;
      }
    }
    break;
  }
  return streak;
}

async function loadWellnessRows(athleteId) {
  const id = mongoose.Types.ObjectId.isValid(String(athleteId))
    ? new mongoose.Types.ObjectId(String(athleteId))
    : athleteId;
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 14);
  const sinceKey = since.toISOString().slice(0, 10);

  const rows = await AppleHealthWellness.find({
    userId: id,
    date: { $gte: sinceKey },
  })
    .sort({ date: 1 })
    .lean();

  return rows.map((r) => ({
    date: r.date,
    hrvMs: r.hrvMs,
    restingHeartRate: r.restingHeartRate,
  }));
}

async function processAthleteAlerts(user) {
  const athleteId = String(user._id);

  const [series, complianceStreak, wellness] = await Promise.all([
    calculateFormFitnessData(athleteId, 21).catch(() => []),
    countComplianceStreak(athleteId),
    loadWellnessRows(athleteId),
  ]);

  const { alerts, highSeverity } = evaluateTrainingAlerts(series, wellness, { complianceStreak });
  const highAlert = alerts.find((a) => a.push && highSeverity);
  if (!highAlert) return { sent: 0 };

  if (user.notifications?.pushOvertraining === false) {
    return { skipped: true, reason: 'disabled' };
  }

  const lastSent = user.trainingAlertsLastSent || {};
  if (daysSince(lastSent.high_overreach) < 1) return { sent: 0 };

  await sendNotification(athleteId, {
    type: 'overtraining_alert',
    title: highAlert.title,
    body: highAlert.body,
    resourceType: 'dashboard',
    skipPush: false,
  });

  lastSent.high_overreach = new Date();
  await User.updateOne({ _id: user._id }, { $set: { trainingAlertsLastSent: lastSent } });

  return { sent: 1, highSeverity: true };
}

module.exports = { processAthleteAlerts, countComplianceStreak };
