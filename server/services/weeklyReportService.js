const nodemailer = require('nodemailer');
const User = require('../models/UserModel');
const StravaActivity = require('../models/StravaActivity');
const FitTraining = require('../models/fitTraining');
const Training = require('../models/training');
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

function parseDurationToSeconds(durationStr) {
  if (!durationStr || typeof durationStr !== 'string') return 0;
  const parts = durationStr.split(':').map(p => p.trim()).filter(Boolean);
  if (!parts.length) return 0;
  const nums = parts.map(p => Number(p));
  if (nums.some(n => Number.isNaN(n))) return 0;
  if (nums.length === 2) {
    // mm:ss
    const [m, s] = nums;
    return Math.max(0, Math.round(m * 60 + s));
  }
  if (nums.length === 3) {
    // hh:mm:ss
    const [h, m, s] = nums;
    return Math.max(0, Math.round(h * 3600 + m * 60 + s));
  }
  return 0;
}

function normalizeSportToCore(sportRaw) {
  const s = String(sportRaw || '').toLowerCase();
  if (!s) return 'other';
  if (s.includes('swim') || s === 'swimming') return 'swim';
  if (s.includes('run') || s.includes('walk') || s.includes('hike') || s === 'running') return 'run';
  if (s.includes('ride') || s.includes('cycle') || s.includes('bike') || s === 'cycling') return 'bike';
  // FitTraining uses 'running'/'cycling'/'swimming' already; Training model uses 'run'/'bike'/'swim'
  if (s === 'run') return 'run';
  if (s === 'bike') return 'bike';
  if (s === 'swim') return 'swim';
  return 'other';
}

function formatCoreSportLabel(core) {
  if (core === 'run') return 'Run';
  if (core === 'bike') return 'Bike';
  if (core === 'swim') return 'Swim';
  return 'Other';
}

function formatCategoryLabel(category) {
  if (!category) return '—';
  const c = String(category);
  return c.charAt(0).toUpperCase() + c.slice(1);
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function calcDelta(current, previous) {
  const c = Number(current) || 0;
  const p = Number(previous) || 0;
  const diff = c - p;
  const pct = p > 0 ? (diff / p) * 100 : (c > 0 ? 100 : 0);
  return { diff, pct };
}

function deltaBadgeHtml({ diffLabel, pct, isPositiveBetter = true }) {
  // For time/distance/tss: bigger is "better" for progress in weekly volume context.
  const positive = (pct >= 0);
  const isGood = isPositiveBetter ? positive : !positive;
  const color = isGood ? '#16a34a' : '#ef4444';
  const bg = isGood ? '#dcfce7' : '#fee2e2';
  const sign = positive ? '+' : '−';
  const pctLabel = Number.isFinite(pct) ? `${sign}${Math.abs(pct).toFixed(0)}%` : '—';
  return `
    <span style="display:inline-block; padding: 2px 8px; border-radius: 999px; background:${bg}; color:${color}; font-weight:700; font-size:12px; white-space:nowrap;">
      ${escapeHtml(diffLabel)} (${escapeHtml(pctLabel)})
    </span>
  `.trim();
}

function formatSecondsDelta(diffSeconds) {
  const s = Math.abs(Math.round(Number(diffSeconds) || 0));
  return formatSecondsToHMS(s);
}

function formatKmDelta(diffMeters) {
  const km = Math.abs(metersToKm(diffMeters));
  return `${km.toFixed(1)} km`;
}

async function loadWeekSessions(userId, weekStart, weekEnd, userProfile) {
  const [strava, fits, trainings] = await Promise.all([
    StravaActivity.find({ userId, startDate: { $gte: weekStart, $lt: weekEnd } })
      .sort({ startDate: 1 })
      .select('stravaId name titleManual category sport startDate movingTime distance averageHeartRate averagePower averageSpeed'),
    FitTraining.find({ athleteId: String(userId), timestamp: { $gte: weekStart, $lt: weekEnd } })
      .sort({ timestamp: 1 })
      .select('_id titleManual titleAuto category sport timestamp totalElapsedTime totalDistance avgHeartRate avgPower avgSpeed'),
    Training.find({ athleteId: String(userId), date: { $gte: weekStart, $lt: weekEnd } })
      .sort({ date: 1 })
      .select('_id title sport date duration results sourceFitTrainingId sourceStravaActivityId')
  ]);

  const clientUrl = getClientUrl();

  const sessions = [];

  // Strava sessions
  for (const a of strava) {
    const seconds = Number(a.movingTime || 0);
    const distanceMeters = Number(a.distance || 0);
    const coreSport = normalizeSportToCore(a.sport);
    const name = (a.titleManual && a.titleManual.trim()) ? a.titleManual : (a.name || 'Untitled');
    const linkUrl = `${clientUrl}/training-calendar?stravaId=${encodeURIComponent(String(a.stravaId))}`;
    const tss = calculateActivityTSS(a, userProfile);
    sessions.push({
      source: 'strava',
      sourceLabel: 'STRAVA',
      linkUrl,
      id: String(a.stravaId),
      name,
      category: a.category || null,
      sportRaw: a.sport || '',
      coreSport,
      startDate: a.startDate,
      seconds,
      distanceMeters,
      tss,
      avgHr: Number(a.averageHeartRate || 0) || null,
      avgPower: Number(a.averagePower || 0) || null
    });
  }

  // Fit sessions
  for (const f of fits) {
    const seconds = Number(f.totalElapsedTime || 0);
    const distanceMeters = Number(f.totalDistance || 0);
    const coreSport = normalizeSportToCore(f.sport);
    const name = (f.titleManual && f.titleManual.trim()) ? f.titleManual : (f.titleAuto || f.originalFileName || 'Untitled');
    const linkUrl = `${clientUrl}/training-calendar?fitTrainingId=${encodeURIComponent(String(f._id))}`;
    // Reuse TSS logic with a Strava-like object
    const tss = calculateActivityTSS({
      sport: f.sport,
      totalElapsedTime: seconds,
      averagePower: f.avgPower,
      averageSpeed: f.avgSpeed
    }, userProfile);
    sessions.push({
      source: 'fit',
      sourceLabel: 'FIT',
      linkUrl,
      id: String(f._id),
      name,
      category: f.category || null,
      sportRaw: f.sport || '',
      coreSport,
      startDate: f.timestamp,
      seconds,
      distanceMeters,
      tss,
      avgHr: Number(f.avgHeartRate || 0) || null,
      avgPower: Number(f.avgPower || 0) || null
    });
  }

  // Manual Training-model sessions
  for (const t of trainings) {
    const secondsFromField = parseDurationToSeconds(t.duration);
    const secondsFromResults = Array.isArray(t.results)
      ? t.results.reduce((sum, r) => sum + (Number(r.durationSeconds || r.duration || 0) || 0) + (Number(r.restSeconds || r.rest || 0) || 0), 0)
      : 0;
    const seconds = secondsFromResults > 0 ? secondsFromResults : secondsFromField;
    const coreSport = normalizeSportToCore(t.sport);
    const linkUrl = `${clientUrl}/training-calendar?trainingId=${encodeURIComponent(String(t._id))}`;
    sessions.push({
      source: 'training',
      sourceLabel: 'MANUAL',
      linkUrl,
      id: String(t._id),
      name: t.title || 'Untitled',
      category: null,
      sportRaw: t.sport || '',
      coreSport,
      startDate: t.date,
      seconds,
      distanceMeters: 0,
      tss: 0,
      avgHr: null,
      avgPower: null
    });
  }

  // stable sort: date asc, then source
  sessions.sort((a, b) => {
    const da = a.startDate ? new Date(a.startDate).getTime() : 0;
    const db = b.startDate ? new Date(b.startDate).getTime() : 0;
    if (da !== db) return da - db;
    return String(a.source).localeCompare(String(b.source));
  });

  return sessions;
}

function aggregateSessions(sessions) {
  const totals = {
    totalSeconds: 0,
    totalDistanceMeters: 0,
    totalTSS: 0,
    bySport: {
      run: { seconds: 0, distanceMeters: 0, tss: 0, count: 0 },
      bike: { seconds: 0, distanceMeters: 0, tss: 0, count: 0 },
      swim: { seconds: 0, distanceMeters: 0, tss: 0, count: 0 },
      other: { seconds: 0, distanceMeters: 0, tss: 0, count: 0 }
    }
  };

  let hrWeightedSum = 0;
  let hrWeight = 0;
  let powerWeightedSum = 0;
  let powerWeight = 0;

  for (const s of sessions) {
    const seconds = Number(s.seconds || 0);
    const dist = Number(s.distanceMeters || 0);
    const tss = Number(s.tss || 0);
    totals.totalSeconds += seconds;
    totals.totalDistanceMeters += dist;
    totals.totalTSS += tss;

    const core = s.coreSport || 'other';
    if (!totals.bySport[core]) totals.bySport[core] = { seconds: 0, distanceMeters: 0, tss: 0, count: 0 };
    totals.bySport[core].seconds += seconds;
    totals.bySport[core].distanceMeters += dist;
    totals.bySport[core].tss += tss;
    totals.bySport[core].count += 1;

    if (s.avgHr && seconds > 0) {
      hrWeightedSum += Number(s.avgHr) * seconds;
      hrWeight += seconds;
    }
    if (s.avgPower && seconds > 0) {
      powerWeightedSum += Number(s.avgPower) * seconds;
      powerWeight += seconds;
    }
  }

  totals.avgHr = hrWeight ? Math.round(hrWeightedSum / hrWeight) : null;
  totals.avgPower = powerWeight ? Math.round(powerWeightedSum / powerWeight) : null;

  return totals;
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

  const [stravaActivities, fitTrainings] = await Promise.all([
    StravaActivity.find({
    userId,
    startDate: { $gte: fourWeeksAgo, $lt: end }
    }).select('startDate movingTime averagePower averageSpeed sport'),
    FitTraining.find({
      athleteId: String(userId),
      timestamp: { $gte: fourWeeksAgo, $lt: end }
    }).select('timestamp totalElapsedTime avgPower avgSpeed sport')
  ]);

  const all = [];
  for (const a of stravaActivities) {
    all.push({ date: a.startDate, tss: calculateActivityTSS(a, userProfile) });
  }
  for (const f of fitTrainings) {
    all.push({
      date: f.timestamp,
      tss: calculateActivityTSS({
        sport: f.sport,
        totalElapsedTime: f.totalElapsedTime,
        averagePower: f.avgPower,
        averageSpeed: f.avgSpeed
      }, userProfile)
    });
  }

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
    return all
      .filter(x => {
        const d = x.date ? new Date(x.date) : null;
        if (!d || Number.isNaN(d.getTime())) return false;
        return d >= s && d < e;
      })
      .reduce((sum, x) => sum + (Number(x.tss) || 0), 0);
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

  const [currentSessions, prevSessions] = await Promise.all([
    loadWeekSessions(user._id, weekStart, weekEnd, userProfile),
    (() => {
      const prevStart = new Date(weekStart);
      prevStart.setUTCDate(prevStart.getUTCDate() - 7);
      const prevEnd = new Date(weekStart);
      return loadWeekSessions(user._id, prevStart, prevEnd, userProfile);
    })()
  ]);

  const currentTotals = aggregateSessions(currentSessions);
  const prevTotals = aggregateSessions(prevSessions);

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
    totals: currentTotals,
    previousTotals: prevTotals,
    activities: currentSessions.map(s => ({
      source: s.source,
      sourceLabel: s.sourceLabel,
      linkUrl: s.linkUrl,
      name: s.name,
      category: s.category,
      sport: s.sportRaw,
      coreSport: s.coreSport,
      startDate: s.startDate,
      seconds: Number(s.seconds || 0),
      distanceMeters: Number(s.distanceMeters || 0),
      tss: Number(s.tss || 0)
    }))
  };
}

function renderWeeklyReportContent({ userName, weekStart, weekEnd, summary }) {
  const clientUrl = getClientUrl();
  const weekStartLabel = weekStart.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  const weekEndLabel = new Date(weekEnd.getTime() - 1).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

  const totals = summary.totals || {};
  const prev = summary.previousTotals || {};
  const km = metersToKm(totals.totalDistanceMeters || 0);
  const duration = formatSecondsToHMS(totals.totalSeconds || 0);

  const trainingStatus = summary.trainingStatus?.statusText || '—';
  const statusAccent = summary.trainingStatus?.accent || '#767EB5';

  const deltaTotalSeconds = calcDelta(totals.totalSeconds || 0, prev.totalSeconds || 0);
  const deltaTotalDistance = calcDelta(totals.totalDistanceMeters || 0, prev.totalDistanceMeters || 0);
  const deltaTotalTss = calcDelta(totals.totalTSS || 0, prev.totalTSS || 0);

  const sportCard = (core) => {
    const cur = totals.bySport?.[core] || { seconds: 0, distanceMeters: 0, tss: 0, count: 0 };
    const p = prev.bySport?.[core] || { seconds: 0, distanceMeters: 0, tss: 0, count: 0 };
    const ds = calcDelta(cur.seconds, p.seconds);
    const dd = calcDelta(cur.distanceMeters, p.distanceMeters);

    const timeDelta = deltaBadgeHtml({ diffLabel: `${ds.diff >= 0 ? '+' : '−'}${formatSecondsDelta(ds.diff)}`, pct: ds.pct });
    const distDelta = deltaBadgeHtml({ diffLabel: `${dd.diff >= 0 ? '+' : '−'}${formatKmDelta(dd.diff)}`, pct: dd.pct });

    return `
      <div style="border: 1px solid #eef2f7; border-radius: 12px; padding: 14px; background: #ffffff;">
        <div style="display:flex; align-items:center; justify-content:space-between; gap: 10px; margin-bottom: 8px;">
          <div style="font-weight: 800; color:#111827; font-size: 14px;">${escapeHtml(formatCoreSportLabel(core))}</div>
          <div style="color:#6b7280; font-size: 12px;">${escapeHtml(String(cur.count || 0))} sessions</div>
        </div>
        <div style="display:flex; align-items:flex-start; justify-content:space-between; gap: 10px;">
          <div>
            <div style="color:#6b7280; font-size: 12px;">Time</div>
            <div style="font-weight: 800; color:#111827; font-size: 16px;">${escapeHtml(formatSecondsToHMS(cur.seconds || 0))}</div>
          </div>
          <div style="text-align:right;">
            ${timeDelta}
          </div>
        </div>
        <div style="height: 8px;"></div>
        <div style="display:flex; align-items:flex-start; justify-content:space-between; gap: 10px;">
          <div>
            <div style="color:#6b7280; font-size: 12px;">Distance</div>
            <div style="font-weight: 800; color:#111827; font-size: 16px;">${escapeHtml(`${metersToKm(cur.distanceMeters || 0).toFixed(1)} km`)}</div>
          </div>
          <div style="text-align:right;">
            ${distDelta}
          </div>
        </div>
      </div>
    `.trim();
  };

  const activityRows = summary.activities
    .map(a => {
      const d = a.startDate ? new Date(a.startDate) : null;
      const dateLabel = d && !Number.isNaN(d.getTime())
        ? d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
        : '';
      const distKm = metersToKm(a.distanceMeters);
      const category = formatCategoryLabel(a.category);
      const coreSport = a.coreSport || normalizeSportToCore(a.sport);

      const sourcePillBg = a.sourceLabel === 'STRAVA' ? '#e0f2fe' : (a.sourceLabel === 'FIT' ? '#ede9fe' : '#f3f4f6');
      const sourcePillColor = a.sourceLabel === 'STRAVA' ? '#0369a1' : (a.sourceLabel === 'FIT' ? '#6d28d9' : '#111827');

      const nameHtml = `
        <a href="${escapeHtml(a.linkUrl || clientUrl)}" style="color:#111827; text-decoration:none; font-weight: 700;">
          ${escapeHtml(a.name)}
        </a>
      `.trim();

      return `
        <tr>
          <td style="padding: 12px 0; border-bottom: 1px solid #eef2f7; vertical-align: top;">
            <div style="display:flex; gap:8px; align-items:center; flex-wrap: wrap;">
              <span style="display:inline-block; padding: 2px 8px; border-radius: 999px; background:${sourcePillBg}; color:${sourcePillColor}; font-weight:800; font-size:11px; letter-spacing: 0.2px;">
                ${escapeHtml(a.sourceLabel || '—')}
              </span>
              <span style="color:#6b7280; font-size:12px;">${escapeHtml(dateLabel)}</span>
            </div>
            <div style="margin-top: 4px; font-size: 14px;">${nameHtml}</div>
            <div style="margin-top: 3px; color: #6b7280; font-size: 12px;">
              ${escapeHtml(formatCoreSportLabel(coreSport))} • Category: ${escapeHtml(category)}
            </div>
          </td>
          <td style="padding: 12px 0; border-bottom: 1px solid #eef2f7; text-align: right; color: #111827; font-size: 14px; white-space: nowrap; vertical-align: top;">
            ${escapeHtml(formatSecondsToHMS(a.seconds))}
          </td>
          <td style="padding: 12px 0; border-bottom: 1px solid #eef2f7; text-align: right; color: #111827; font-size: 14px; white-space: nowrap; vertical-align: top;">
            ${a.distanceMeters ? `${distKm.toFixed(1)} km` : '—'}
          </td>
          <td style="padding: 12px 0; border-bottom: 1px solid #eef2f7; text-align: right; color: #111827; font-size: 14px; white-space: nowrap; vertical-align: top;">
            ${a.tss ? String(Math.round(a.tss)) : '—'}
          </td>
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
        ${metricsRow('TSS', `${String(Math.round(totals.totalTSS || 0))} ${deltaBadgeHtml({ diffLabel: `${deltaTotalTss.diff >= 0 ? '+' : '−'}${Math.abs(Math.round(deltaTotalTss.diff))}`, pct: deltaTotalTss.pct })}`)}
        ${metricsRow('Duration', duration)}
        ${metricsRow('Distance', `${km.toFixed(1)} km`)}
        ${metricsRow('Vs last week (time)', deltaBadgeHtml({ diffLabel: `${deltaTotalSeconds.diff >= 0 ? '+' : '−'}${formatSecondsDelta(deltaTotalSeconds.diff)}`, pct: deltaTotalSeconds.pct }))}
        ${metricsRow('Vs last week (distance)', deltaBadgeHtml({ diffLabel: `${deltaTotalDistance.diff >= 0 ? '+' : '−'}${formatKmDelta(deltaTotalDistance.diff)}`, pct: deltaTotalDistance.pct }))}
        ${metricsRow('Avg HR', totals.avgHr ? `${totals.avgHr}` : '—')}
        ${metricsRow('Avg Power', totals.avgPower ? `${totals.avgPower} W` : '—')}
      </table>
    </div>

    <div style="height: 18px;"></div>

    <h3 style="margin: 0 0 10px; color: #111827; font-size: 18px;">Weekly Breakdown</h3>
    <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px;">
      ${sportCard('run')}
      ${sportCard('bike')}
      ${sportCard('swim')}
    </div>

    <div style="height: 18px;"></div>

    <h3 style="margin: 0 0 10px; color: #111827; font-size: 18px;">Trainings (${summary.activities.length})</h3>
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
      <tr>
        <th style="text-align:left; padding: 0 0 8px; color:#6b7280; font-size:12px; font-weight:600;">Training</th>
        <th style="text-align:right; padding: 0 0 8px; color:#6b7280; font-size:12px; font-weight:600;">Duration</th>
        <th style="text-align:right; padding: 0 0 8px; color:#6b7280; font-size:12px; font-weight:600;">Distance</th>
        <th style="text-align:right; padding: 0 0 8px; color:#6b7280; font-size:12px; font-weight:600;">TSS</th>
      </tr>
      ${activityRows || `
        <tr><td colspan="4" style="padding: 14px 0; color:#6b7280;">No trainings found for this week.</td></tr>
      `}
    </table>
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
    'notifications.weeklyReports': true
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


