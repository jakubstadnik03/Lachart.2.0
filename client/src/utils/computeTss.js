/**
 * Client-side Training Stress Score (TSS) calculator.
 *
 * Strava doesn't return TSS in its activity payloads (it's a TrainingPeaks-
 * branded metric they don't compute), so imported activities arrive with
 * `tss == 0`. This helper falls back to a computation based on the user's
 * thresholds:
 *
 *   • Cycling — TSS = (sec × NP²) / (FTP² × 3600) × 100.
 *     If normalised power isn't available we use average power as a
 *     conservative proxy (slight underestimate vs. NP for variable rides).
 *   • Running — TSS = (sec × intensityRatio²) / 3600 × 100 where
 *     intensityRatio = thresholdPace / avgPace (faster pace ⇒ higher TSS).
 *   • Swimming — same form as running but pace is per-100m.
 *   • Fallback (no power, no threshold pace) — heart-rate TSS via TRIMP-ish
 *     formula: scale (avgHR-restHR) / (maxHR-restHR), squared, × duration.
 *     Works for any activity where the user has logged max HR.
 *
 * Returns an integer TSS, or 0 when we genuinely can't compute (no
 * useful inputs at all). Never throws.
 */

function activityDuration(activity) {
  return Number(
    activity.totalTimerTime || activity.moving_time || activity.movingTime ||
    activity.totalElapsedTime || activity.elapsedTime || activity.duration || 0,
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
  return Number(profile?.runningZones?.lt2 || profile?.thresholdPace || 0); // sec/km
}

function thresholdSwimPaceFromProfile(profile) {
  return Number(profile?.powerZones?.swimming?.lt2 || profile?.thresholdSwimPace || 0); // sec/100m
}

function lthrFromProfile(profile, sport) {
  const key = sport.includes('swim') ? 'swimming' : (sport.includes('run') || sport.includes('walk') || sport.includes('hike')) ? 'running' : 'cycling';
  const hz = profile?.heartRateZones?.[key];
  return Number(hz?.lt2 || hz?.lt2Hr || hz?.threshold || hz?.zone4?.max || 0);
}

/** Power- or pace-based TSS only (no HR fallback). */
export function computePowerTss(activity, profile) {
  if (!activity) return 0;
  const sport = activitySport(activity);
  const duration = activityDuration(activity);
  if (!duration || duration <= 0) return 0;

  const ftp = ftpFromProfile(profile);
  const thresholdPace = thresholdPaceFromProfile(profile);
  const thresholdSwimPace = thresholdSwimPaceFromProfile(profile);

  if (sport.includes('ride') || sport.includes('cycle') || sport.includes('bike') || sport === 'cycling') {
    const np = Number(activity.normalizedPower || activity.weightedAveragePower || activity.weighted_average_watts || 0);
    const avg = Number(activity.avgPower || activity.averagePower || activity.average_watts || 0);
    const watts = np > 0 ? np : avg;
    if (watts > 0 && ftp > 0) {
      return Math.round((duration * watts * watts) / (ftp * ftp * 3600) * 100);
    }
  }

  if (sport.includes('run') || sport.includes('walk') || sport.includes('hike')) {
    const avgSpeed = Number(activity.avgSpeed || activity.averageSpeed || activity.average_speed || 0);
    if (avgSpeed > 0 && thresholdPace > 0) {
      const avgPace = 1000 / avgSpeed;
      const intensity = thresholdPace / avgPace;
      return Math.round((duration * intensity * intensity) / 3600 * 100);
    }
  }

  if (sport.includes('swim')) {
    const avgSpeed = Number(activity.avgSpeed || activity.averageSpeed || activity.average_speed || 0);
    if (avgSpeed > 0 && thresholdSwimPace > 0) {
      const avgPace = 100 / avgSpeed;
      const intensity = thresholdSwimPace / avgPace;
      return Math.round((duration * intensity * intensity) / 3600 * 100);
    }
  }

  return 0;
}

/** Heart-rate TSS only (LTHR-based, then TRIMP fallback). */
export function computeHrTss(activity, profile) {
  if (!activity) return 0;
  const stored = Number(activity.hrTSS || activity.hrTss || 0);
  if (stored > 0) return Math.round(stored);

  const sport = activitySport(activity);
  const duration = activityDuration(activity);
  if (!duration || duration <= 0) return 0;

  const avgHr = Number(
    activity.averageHeartRate || activity.average_heartrate || activity.avgHR || activity.avgHeartRate || 0,
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

export function defaultTssMode(powerTss, hrTss, explicitTss = 0) {
  if (powerTss > 0 && hrTss > 0) {
    if (explicitTss > 0) {
      return Math.abs(explicitTss - powerTss) <= Math.abs(explicitTss - hrTss) ? 'power' : 'hr';
    }
    return 'power';
  }
  if (powerTss > 0) return 'power';
  return 'hr';
}

export function canToggleTss(powerTss, hrTss) {
  return powerTss > 0 && hrTss > 0 && Math.abs(powerTss - hrTss) >= 1;
}

export function computeActivityTss(activity, profile) {
  if (!activity) return 0;
  // Trust an explicitly-set value if present (FIT uploads include real TSS).
  const explicit = Number(activity.tss || activity.TSS || activity.totalTSS || activity.trainingLoad || 0);
  if (explicit > 0) return Math.round(explicit);

  const powerTss = computePowerTss(activity, profile);
  if (powerTss > 0) return powerTss;

  const hrTss = computeHrTss(activity, profile);
  if (hrTss > 0) return hrTss;

  return 0;
}
