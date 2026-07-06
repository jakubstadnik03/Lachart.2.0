import { getTssDisplayMode } from './uiPrefs';

/**
 * Client-side Training Stress Score (TSS) calculator.
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
    activity.totalElapsedTime || activity.elapsedTime || activity.totalTime ||
    activity.duration || 0,
  );
}

function activitySport(activity) {
  return String(activity.sport || activity.sport_type || activity.type || '').toLowerCase();
}

function ftpFromProfile(profile) {
  return Number(
    profile?.powerZones?.cycling?.lt2
    || profile?.powerZones?.cycling?.ftp
    || profile?.powerZones?.cycling?.zone4?.min
    || profile?.ftp
    || 0,
  );
}

function thresholdPaceFromProfile(profile) {
  const rz = profile?.powerZones?.running || profile?.runningZones;
  return Number(rz?.lt2 || rz?.zone4?.min || profile?.thresholdPace || 0); // sec/km
}

function thresholdSwimPaceFromProfile(profile) {
  const sz = profile?.powerZones?.swimming || profile?.swimmingZones;
  return Number(sz?.lt2 || sz?.zone4?.min || profile?.thresholdSwimPace || 0); // sec/100m
}

/** m/s from device fields, or distance ÷ duration when Strava omits average_speed (common on swims). */
function activityAvgSpeedMps(activity) {
  const stored = Number(
    activity?.avgSpeed || activity?.averageSpeed || activity?.average_speed || 0,
  );
  if (stored > 0) return stored;
  const dist = Number(activity?.distance || activity?.totalDistance || 0);
  const dur = activityDuration(activity);
  if (dist > 0 && dur > 0) return dist / dur;
  return 0;
}

function lthrFromProfile(profile, sport) {
  const key = sport.includes('swim') ? 'swimming' : (sport.includes('run') || sport.includes('walk') || sport.includes('hike')) ? 'running' : 'cycling';
  const hz = profile?.heartRateZones?.[key];
  return Number(hz?.lt2 || hz?.lt2Hr || hz?.threshold || hz?.zone4?.max || 0);
}

function maxHrFromProfile(profile, sport) {
  const key = sport.includes('swim') ? 'swimming' : (sport.includes('run') || sport.includes('walk') || sport.includes('hike')) ? 'running' : 'cycling';
  const hz = profile?.heartRateZones?.[key];
  return Number(
    profile?.maxHr
    || profile?.maxHeartRate
    || hz?.maxHeartRate
    || hz?.zone5?.max
    || hz?.zone4?.max
    || 0,
  );
}

function restingHrFromProfile(profile) {
  return Number(
    profile?.restingHr
    || profile?.restingHeartRate
    || profile?.heartRateZones?.cycling?.restingHeartRate
    || profile?.heartRateZones?.running?.restingHeartRate
    || profile?.heartRateZones?.swimming?.restingHeartRate
    || 60,
  );
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

  const maxHr = Number(
    maxHrFromProfile(profile, sport)
    || activity.maxHeartRate
    || activity.max_heartrate
    || 0,
  );
  const restHr = restingHrFromProfile(profile);
  if (maxHr > restHr) {
    const hrr = (avgHr - restHr) / (maxHr - restHr);
    if (hrr > 0) {
      return Math.round((duration / 3600) * hrr * hrr * 100);
    }
  }

  return 0;
}

export const TSS_DISPLAY_MODES = ['manual', 'power', 'hr'];

export function defaultTssMode(powerTss, hrTss, manualTss = 0) {
  if (powerTss > 0 && hrTss > 0) {
    if (manualTss > 0) {
      const dPower = Math.abs(manualTss - powerTss);
      const dHr = Math.abs(manualTss - hrTss);
      if (dPower <= dHr) return 'power';
      return 'hr';
    }
    return 'power';
  }
  if (powerTss > 0) return 'power';
  if (hrTss > 0) return 'hr';
  if (manualTss > 0) return 'manual';
  return 'hr';
}

/** Stored manual / file TSS value (not computed power or hr). */
export function getManualTssValue(activity) {
  const userManual = Number(activity?.manualTss ?? 0);
  if (userManual > 0) return Math.round(userManual);
  const fileTss = Number(
    activity?.trainingStressScore || activity?.tss || activity?.TSS
    || activity?.totalTSS || activity?.trainingLoad || 0,
  );
  return fileTss > 0 ? Math.round(fileTss) : 0;
}

/** Map activity sport → training preference key (cycling / running / swimming). */
export function sportTssProfileKey(sport) {
  const s = String(sport || '').toLowerCase();
  if (s.includes('swim')) return 'swimming';
  if (s.includes('run') || s.includes('walk') || s.includes('hike') || s.includes('trail')) return 'running';
  if (s.includes('ride') || s.includes('bike') || s.includes('cycle') || s.includes('virtual')) return 'cycling';
  return null;
}

/** Default TSS mode for a sport from Settings → Training Preferences (new workouts). */
export function getPreferredTssModeForSport(user, sport) {
  const key = sportTssProfileKey(sport);
  const bySport = user?.trainingPreferences?.tssDisplayModeBySport;
  if (key && bySport) {
    const mode = bySport[key];
    if (mode === 'power' || mode === 'hr') return mode;
  }
  const global = user?.trainingPreferences?.tssDisplayMode;
  if (global === 'power' || global === 'hr') return global;
  return null;
}

export function getAvailableTssModes(activity, profile) {
  const modes = [];
  if (getManualTssValue(activity) > 0) modes.push('manual');
  if (computePowerTss(activity, profile) > 0) modes.push('power');
  if (computeHrTss(activity, profile) > 0) modes.push('hr');
  return modes;
}

export function cycleTssMode(current, available) {
  if (!available?.length) return current;
  const idx = available.indexOf(current);
  const next = idx < 0 ? available[0] : available[(idx + 1) % available.length];
  return next;
}

/** User typed / saved TSS in the editor (vs. value imported from file). */
export function hasExplicitManualTss(activity) {
  return Number(activity?.manualTss ?? 0) > 0;
}

export function tssModeLabel(mode, { isBike = false, isRun = false, isSwim = false, activity = null } = {}) {
  if (mode === 'manual') {
    return (activity && hasExplicitManualTss(activity)) ? 'TSS (manual)' : 'TSS (file)';
  }
  if (mode === 'hr') return 'hrTSS';
  if (mode === 'power') {
    if (isBike) return 'Power TSS';
    if (isRun || isSwim) return 'Pace TSS';
    return 'TSS';
  }
  return 'TSS';
}

/** Short hint when only one TSS source is available (tap target shows this as title). */
export function tssToggleDisabledReason(activity, profile) {
  if (!activity || getAvailableTssModes(activity, profile).length > 1) return null;
  const sport = activitySport(activity);
  const missing = [];
  if (computePowerTss(activity, profile) <= 0) {
    if (sport.includes('swim')) {
      const sz = profile?.powerZones?.swimming || profile?.swimmingZones;
      if (!Number(sz?.lt2 || sz?.zone4?.min)) missing.push('set swim LT2 in profile');
      if (!activityAvgSpeedMps(activity)) missing.push('missing pace data');
    } else if (sport.includes('run') || sport.includes('walk') || sport.includes('hike')) {
      const rz = profile?.powerZones?.running || profile?.runningZones;
      if (!Number(rz?.lt2 || rz?.zone4?.min)) missing.push('set run LT2 in profile');
      if (!activityAvgSpeedMps(activity)) missing.push('missing pace data');
    } else if (sport.includes('ride') || sport.includes('cycle') || sport.includes('bike')) {
      if (!ftpFromProfile(profile)) missing.push('set cycling FTP/LT2 in profile');
      const watts = Number(activity.normalizedPower || activity.averagePower || activity.average_watts || 0);
      if (!watts) missing.push('missing power data');
    }
  }
  if (computeHrTss(activity, profile) <= 0) {
    const avgHr = Number(
      activity.averageHeartRate || activity.average_heartrate || activity.avgHR || activity.avgHeartRate || 0,
    );
    if (!avgHr) missing.push('missing heart-rate data');
    else if (!lthrFromProfile(profile, sport) && !maxHrFromProfile(profile, sport)) missing.push('set HR zones in profile');
  }
  if (!missing.length) return 'Only one TSS value available for this workout';
  return `To switch TSS: ${missing.join(', ')}`;
}

/** Per-activity display mode (saved on workout, else sport preference, else global). */
export function getActivityTssDisplayMode(activity, profile, user) {
  const available = getAvailableTssModes(activity, profile);
  if (!available.length) return 'manual';

  const saved = activity?.tssDisplayMode;
  if (TSS_DISPLAY_MODES.includes(saved) && available.includes(saved)) return saved;

  if (Number(activity?.manualTss ?? 0) > 0 && available.includes('manual')) return 'manual';

  const powerTss = computePowerTss(activity, profile);
  const hrTss = computeHrTss(activity, profile);
  const manualVal = getManualTssValue(activity);

  const sportPref = getPreferredTssModeForSport(user, activitySport(activity));
  if (sportPref && available.includes(sportPref)) return sportPref;

  const globalMode = user?.trainingPreferences?.tssDisplayMode || getTssDisplayMode();
  if (globalMode && available.includes(globalMode)) return globalMode;

  return defaultTssMode(powerTss, hrTss, manualVal);
}

export function canToggleTss(activity, profile) {
  return getAvailableTssModes(activity, profile).length > 1;
}

/** @deprecated use getManualTssValue > 0 */
export function hasUserManualTss(activity) {
  return Number(activity?.manualTss ?? 0) > 0;
}

/**
 * Single source of truth for which TSS value to use in totals, Form/Fitness, etc.
 * Respects the user's power vs hrTSS preference when both are available.
 */
export function resolveActivityTss(activity, profile, options = {}) {
  if (!activity) return 0;

  const powerTss = computePowerTss(activity, profile);
  const hrTss = computeHrTss(activity, profile);
  const manualVal = getManualTssValue(activity);

  let mode = options.mode
    ?? (TSS_DISPLAY_MODES.includes(activity.tssDisplayMode) ? activity.tssDisplayMode : null)
    ?? null;

  if (!mode && !options.mode) {
    mode = getActivityTssDisplayMode(activity, profile, options.user);
  }

  if (mode === 'manual') {
    if (manualVal > 0) return manualVal;
  }
  if (mode === 'power' && powerTss <= 0) mode = null;
  if (mode === 'hr' && hrTss <= 0) mode = null;
  if (!mode) {
    mode = defaultTssMode(powerTss, hrTss, manualVal);
  }

  if (mode === 'manual' && manualVal > 0) return manualVal;
  if (mode === 'power' && powerTss > 0) return powerTss;
  if (mode === 'hr' && hrTss > 0) return hrTss;
  if (manualVal > 0) return manualVal;

  // Duration-only fallback for users without saved zones (endurance sessions ≥ 20 min).
  if (profile?._thresholdsInferredFromActivities) {
    const sport = activitySport(activity);
    const dur = activityDuration(activity);
    const endurance = sport.includes('ride') || sport.includes('cycle') || sport.includes('bike')
      || sport.includes('run') || sport.includes('walk') || sport.includes('hike')
      || sport.includes('swim');
    if (endurance && dur >= 1200) {
      return Math.round((dur / 3600) * 40);
    }
  }

  return 0;
}

export function computeActivityTss(activity, profile, options = {}) {
  return resolveActivityTss(activity, profile, options);
}
