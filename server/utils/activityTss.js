/**
 * Server-side TSS resolution — mirrors client/src/utils/computeTss.js so
 * Form/Fitness and weekly totals respect power vs hrTSS preference.
 */

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
  return Number(profile?.runningZones?.lt2 || profile?.thresholdPace || profile?.powerZones?.running?.lt2 || 0);
}

function thresholdSwimPaceFromProfile(profile) {
  return Number(profile?.powerZones?.swimming?.lt2 || profile?.thresholdSwimPace || 0);
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
    const avgSpeed = Number(activity.averageSpeed || activity.avgSpeed || activity.average_speed || 0);
    if (avgSpeed > 0 && thresholdPace > 0) {
      const avgPace = 1000 / avgSpeed;
      const intensity = thresholdPace / avgPace;
      return Math.round((duration * intensity * intensity) / 3600 * 100);
    }
  }

  if (sport.includes('swim')) {
    const avgSpeed = Number(activity.averageSpeed || activity.avgSpeed || activity.average_speed || 0);
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

function readExplicitTss(activity) {
  const explicit = Number(
    activity.tss || activity.TSS || activity.totalTSS || activity.trainingLoad
    || activity.trainingStressScore || 0,
  );
  return explicit > 0 ? Math.round(explicit) : 0;
}

function defaultTssMode(powerTss, hrTss, explicitTss = 0) {
  if (powerTss > 0 && hrTss > 0) {
    if (explicitTss > 0) {
      return Math.abs(explicitTss - powerTss) <= Math.abs(explicitTss - hrTss) ? 'power' : 'hr';
    }
    return 'power';
  }
  if (powerTss > 0) return 'power';
  return 'hr';
}

function buildUserProfile(user) {
  if (!user) return null;
  return {
    powerZones: user.powerZones || {},
    runningZones: user.runningZones || {},
    heartRateZones: user.heartRateZones || {},
    ftp: user.ftp || 250,
    maxHr: user.maxHr || user.maxHeartRate,
    restingHr: user.restingHr || user.restingHeartRate,
    thresholdPace: user.thresholdPace,
    thresholdSwimPace: user.thresholdSwimPace,
    tssDisplayMode: user.trainingPreferences?.tssDisplayMode || 'power',
  };
}

function resolveActivityTss(activity, profile) {
  if (!activity) return 0;

  const explicitTss = readExplicitTss(activity);
  const powerTss = computePowerTss(activity, profile);
  const hrTss = computeHrTss(activity, profile);

  let mode = profile?.tssDisplayMode || 'power';
  if (mode === 'power' && powerTss <= 0) mode = null;
  if (mode === 'hr' && hrTss <= 0) mode = null;
  if (!mode) mode = defaultTssMode(powerTss, hrTss, explicitTss);

  if (mode === 'power' && powerTss > 0) return powerTss;
  if (mode === 'hr' && hrTss > 0) return hrTss;
  if (explicitTss > 0) return explicitTss;
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
};
