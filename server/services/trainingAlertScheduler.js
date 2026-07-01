const User = require('../models/UserModel');
const { processAthleteAlerts } = require('./trainingAlertService');

function startTrainingAlertScheduler() {
  const enabled =
    process.env.ENABLE_TRAINING_ALERT_SCHEDULER === 'true' || process.env.NODE_ENV === 'production';
  if (!enabled) {
    console.log('[TrainingAlertScheduler] Disabled (set ENABLE_TRAINING_ALERT_SCHEDULER=true).');
    return;
  }

  const intervalMs = Number(process.env.TRAINING_ALERT_SCHEDULER_INTERVAL_MS || 6 * 60 * 60 * 1000);
  const sendHourUtc = Number(process.env.TRAINING_ALERT_SEND_HOUR_UTC || 7);

  const tick = async () => {
    const hour = new Date().getUTCHours();
    if (hour < sendHourUtc || hour > sendHourUtc + 1) return;

    const users = await User.find({ isActive: { $ne: false } })
      .select('_id notifications trainingAlertsLastSent')
      .limit(2000)
      .lean();

    let totalSent = 0;
    for (const user of users) {
      try {
        const r = await processAthleteAlerts(user);
        totalSent += r.sent || 0;
      } catch (e) {
        console.error('[TrainingAlertScheduler] user', user._id, e.message || e);
      }
    }
    if (totalSent > 0) {
      console.log('[TrainingAlertScheduler] Sent', totalSent, 'alert(s)');
    }
  };

  setTimeout(() => tick().catch((e) => console.error('[TrainingAlertScheduler] tick', e)), 90 * 1000);
  setInterval(() => tick().catch((e) => console.error('[TrainingAlertScheduler] tick', e)), intervalMs);
  console.log('[TrainingAlertScheduler] Started.', { intervalMs, sendHourUtc });
}

module.exports = { startTrainingAlertScheduler };
