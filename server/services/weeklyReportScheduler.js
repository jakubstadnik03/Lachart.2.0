const { getLastWeekRangeUTC, sendWeeklyReportsForWeek } = require('./weeklyReportService');

function startWeeklyReportsScheduler() {
  const enabled = process.env.ENABLE_WEEKLY_REPORTS_SCHEDULER === 'true' || process.env.NODE_ENV === 'production';
  if (!enabled) {
    console.log('[WeeklyReportScheduler] Disabled (set ENABLE_WEEKLY_REPORTS_SCHEDULER=true to enable).');
    return;
  }

  const sendHourUtc = Number(process.env.WEEKLY_REPORTS_SEND_HOUR_UTC || 6); // default 06:00 UTC
  const intervalMs = Number(process.env.WEEKLY_REPORTS_SCHEDULER_INTERVAL_MS || 30 * 60 * 1000); // 30 min

  const tick = async () => {
    const now = new Date();
    const day = now.getUTCDay(); // Mon=1
    const hour = now.getUTCHours();

    // Only run on Mondays within a 2-hour window to reduce chances of missing it.
    if (day !== 1) return;
    if (hour < sendHourUtc || hour > sendHourUtc + 1) return;

    const { weekStart, weekEnd } = getLastWeekRangeUTC(now);
    console.log('[WeeklyReportScheduler] Sending weekly reports for weekStart:', weekStart.toISOString(), 'weekEnd:', weekEnd.toISOString());
    const res = await sendWeeklyReportsForWeek({ weekStart, weekEnd, force: false });
    console.log('[WeeklyReportScheduler] Done:', res);
  };

  // Initial delayed tick + interval ticks
  setTimeout(() => tick().catch(e => console.error('[WeeklyReportScheduler] tick error', e)), 15 * 1000);
  setInterval(() => tick().catch(e => console.error('[WeeklyReportScheduler] tick error', e)), intervalMs);

  console.log('[WeeklyReportScheduler] Started. sendHourUtc=', sendHourUtc, 'intervalMs=', intervalMs);
}

module.exports = { startWeeklyReportsScheduler };


