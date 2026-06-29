/**
 * Server-side TSS resolution — mirrors client/src/utils/computeTss.js so
 * Form/Fitness and weekly totals respect per-workout power vs hrTSS vs manual.
 */

const TSS_DISPLAY_MODES = ['manual', 'power', 'hr'];

function activityDuration(activity) {
  return Number(
    activity.movingTime || activity.moving_time || activity.totalElapsedTime
    || activity.elapsedTime || activity.duration || activity.totalTimerTime || 0,
  );
}

function activitySport(activity) {
  return String(activity.sport || activity.sport_type || activity.type || '').toLowerCase();
}

function ftpFromProfile(profile) {
  return Number(
    profile?.powerZones?.cycling?.lt2
    || profile?.powerZones?.cycling?.ftp
    || profile?.ftp
    || 0,
  );
}

function thresholdPaceFromProfile(profile) {
  const rz = profile?.powerZones?.running || profile?.runningZones;
  return Number(rz?.lt2 || rz?.zone4?.min || profile?.thresholdPace || 0);
}

function thresholdSwimPaceFromProfile(profile) {
  const sz = profile?.powerZones?.swimming || profile?.swimmingZones;
  return Number(sz?.lt2 || sz?.zone4?.min || profile?.thresholdSwimPace || 0);
}

function activityAvgSpeedMps(activity) {
  const stored = Number(activity.averageSpeed || activity.avgSpeed || activity.average_speed || 0);
  if (stored > 0) return stored;
  const dist = Number(activity.distance || activity.totalDistance || 0);
  const dur = activityDuration(activity);
  if (dist > 0 && dur > 0) return dist / dur;
  return 0;
}

function lthrFromProfile(profile, sport) {
  const key = sport.includes('swim') ? 'swimming'
    : (sport.includes('run') || sport.includes('walk') || sport.includes('hike')) ? 'running' : 'cycling';
  const hz = profile?.heartRateZones?.[key];
  return Number(hz?.lt2 || hz?.lt2Hr || hz?.threshold || hz?.zone4?.max || 0);
}

function computePowerTss(activity, profile) {
  if (!activity) return 0;
  const sport = activitySport(activity);
  const duration = activityDuration(activity);
  if (!duration || duration <= 0) return 0;

  const ftp = ftpFromProfile(profile);
  const thresholdPace = thresholdPaceFromProfile(profile);
  const thresholdSwimPace = thresholdSwimPaceFromProfile(profile);

  if (sport.includes('ride') || sport.includes('cycle') || sport.includes('bike') || sport === 'cycling') {
    const np = Number(activity.normalizedPower || activity.weightedAveragePower || activity.weighted_average_watts || 0);
    const avg = Number(activity.averagePower || activity.avgPower || activity.average_watts || 0);
    const watts = np > 0 ? np : avg;
    if (watts > 0 && ftp > 0) {
      return Math.round((duration * watts * watts) / (ftp * ftp * 3600) * 100);
    }
  }

  if (sport.includes('run') || sport.includes('walk') || sport.includes('hike')) {
    const avgSpeed = activityAvgSpeedMps(activity);
    if (avgSpeed > 0 && thresholdPace > 0) {
      const avgPace = 1000 / avgSpeed;
      const intensity = thresholdPace / avgPace;
      return Math.round((duration * intensity * intensity) / 3600 * 100);
    }
  }

  if (sport.includes('swim')) {
    const avgSpeed = activityAvgSpeedMps(activity);
    if (avgSpeed > 0 && thresholdSwimPace > 0) {
      const avgPace = 100 / avgSpeed;
      const intensity = thresholdSwimPace / avgPace;
      return Math.round((duration * intensity * intensity) / 3600 * 100);
    }
  }

  return 0;
}

function computeHrTss(activity, profile) {
  if (!activity) return 0;
  const stored = Number(activity.hrTSS || activity.hrTss || 0);
  if (stored > 0) return Math.round(stored);

  const sport = activitySport(activity);
  const duration = activityDuration(activity);
  if (!duration || duration <= 0) return 0;

  const avgHr = Number(
    activity.averageHeartRate || activity.average_heartrate || activity.avgHR
    || activity.avgHeartRate || 0,
  );
  if (avgHr <= 0) return 0;

  const lthr = lthrFromProfile(profile, sport);
  if (lthr > 0) {
    const ratio = avgHr / lthr;
    return Math.round((duration * ratio * ratio) / 3600 * 100);
  }

  const maxHr = Number(profile?.maxHr || profile?.maxHeartRate || activity.maxHeartRate || activity.max_heartrate || 0);
  const restHr = Number(profile?.restingHr || profile?.restingHeartRate || 60);
  if (maxHr > restHr) {
    const hrr = (avgHr - restHr) / (maxHr - restHr);
    if (hrr > 0) {
      return Math.round((duration / 3600) * hrr * hrr * 100);
    }
  }

  return 0;
}

function getManualTssValue(activity) {
  const userManual = Number(activity?.manualTss ?? 0);
  if (userManual > 0) return Math.round(userManual);
  const fileTss = Number(
    activity?.trainingStressScore || activity?.tss || activity?.TSS
    || activity?.totalTSS || activity?.trainingLoad || 0,
  );
  return fileTss > 0 ? Math.round(fileTss) : 0;
}

function defaultTssMode(powerTss, hrTss, manualTss = 0) {
  if (powerTss > 0 && hrTss > 0) {
    if (manualTss > 0) {
      const dPower = Math.abs(manualTss - powerTss);
      const dHr = Math.abs(manualTss - hrTss);
      return dPower <= dHr ? 'power' : 'hr';
    }
    return 'power';
  }
  if (powerTss > 0) return 'power';
  if (hrTss > 0) return 'hr';
  if (manualTss > 0) return 'manual';
  return 'hr';
}

function getActivityTssDisplayMode(activity, profile) {
  const powerTss = computePowerTss(activity, profile);
  const hrTss = computeHrTss(activity, profile);
  const manualVal = getManualTssValue(activity);
  const available = [];
  if (manualVal > 0) available.push('manual');
  if (powerTss > 0) available.push('power');
  if (hrTss > 0) available.push('hr');
  if (!available.length) return 'manual';

  const saved = activity?.tssDisplayMode;
  if (TSS_DISPLAY_MODES.includes(saved) && available.includes(saved)) return saved;
  if (Number(activity?.manualTss ?? 0) > 0 && available.includes('manual')) return 'manual';

  const globalMode = profile?.tssDisplayMode;
  if (globalMode && available.includes(globalMode)) return globalMode;

  return defaultTssMode(powerTss, hrTss, manualVal);
}

function buildUserProfile(user) {
  if (!user) return null;
  return {
    powerZones: user.powerZones || {},
    runningZones: user.runningZones || user.powerZones?.running || {},
    swimmingZones: user.swimmingZones || user.powerZones?.swimming || {},
    heartRateZones: user.heartRateZones || {},
    ftp: user.ftp || user.powerZones?.cycling?.lt2 || user.powerZones?.cycling?.ftp || 0,
    maxHr: user.maxHr || user.maxHeartRate,
    restingHr: user.restingHr || user.restingHeartRate,
    thresholdPace: user.thresholdPace,
    thresholdSwimPace: user.thresholdSwimPace,
    tssDisplayMode: user.trainingPreferences?.tssDisplayMode || 'power',
  };
}

function normalizeSportBucket(sport) {
  const s = String(sport || '').toLowerCase();
  if (s.includes('ride') || s.includes('bike') || s.includes('cycle')) return 'bike';
  if (s.includes('run')) return 'run';
  if (s.includes('swim')) return 'swim';
  if (s.includes('walk') || s.includes('hike')) return 'walk';
  return 'other';
}

function localDateKey(date) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function activityDurationSec(activity) {
  return Number(
    activity.movingTime || activity.moving_time || activity.totalElapsedTime
    || activity.elapsedTime || activity.duration || 0,
  );
}

/**
 * Drop duplicate workouts (Strava + FIT import of the same session) so daily
 * TSS is not counted twice in CTL / ATL.
 */
function dedupeActivitiesForLoad(activities) {
  const kept = [];
  for (const act of activities) {
    const actDay = localDateKey(act.date);
    if (!actDay) continue;
    const sport = normalizeSportBucket(act.sport);
    const dur = activityDurationSec(act);
    const idx = kept.findIndex((k) => {
      const kDay = localDateKey(k.date);
      if (kDay !== actDay) return false;
      if (normalizeSportBucket(k.sport) !== sport) return false;
      const kDur = activityDurationSec(k);
      if (!dur || !kDur) return dur === kDur;
      return Math.abs(dur - kDur) <= Math.max(180, 0.1 * Math.max(dur, kDur));
    });
    if (idx === -1) {
      kept.push({ ...act });
      continue;
    }
    const existing = kept[idx];
    const tssA = Number(act.tss) || 0;
    const tssB = Number(existing.tss) || 0;
    const mergedTss = Math.max(tssA, tssB);
    kept[idx] = { ...existing, tss: mergedTss };
  }
  return kept;
}

/**
 * Soft cap on very heavy days — keeps CTL/ATL in a realistic range for
 * multi-sport blocks without zeroing real training load.
 */
function effectiveDailyTss(total) {
  const tss = Number(total) || 0;
  if (tss <= 90) return tss;
  return Math.round(90 + (tss - 90) * 0.42);
}

function resolveActivityTss(activity, profile) {
  if (!activity) return 0;

  const powerTss = computePowerTss(activity, profile);
  const hrTss = computeHrTss(activity, profile);
  const manualVal = getManualTssValue(activity);

  let mode = TSS_DISPLAY_MODES.includes(activity.tssDisplayMode) ? activity.tssDisplayMode : null;
  if (!mode) mode = getActivityTssDisplayMode(activity, profile);

  if (mode === 'manual' && manualVal > 0) return manualVal;
  if (mode === 'power' && powerTss > 0) return powerTss;
  if (mode === 'hr' && hrTss > 0) return hrTss;
  if (manualVal > 0) return manualVal;
  return 0;
}

/** @deprecated use resolveActivityTss */
function calculateActivityTSS(activity, userProfile = null) {
  return resolveActivityTss(activity, userProfile);
}

module.exports = {
  buildUserProfile,
  resolveActivityTss,
  calculateActivityTSS,
  computePowerTss,
  computeHrTss,
  dedupeActivitiesForLoad,
  effectiveDailyTss,
};
