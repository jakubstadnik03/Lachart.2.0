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
export function computeActivityTss(activity, profile) {
  if (!activity) return 0;
  // Trust an explicitly-set value if present (FIT uploads include real TSS).
  const explicit = Number(activity.tss || activity.TSS || activity.totalTSS || activity.trainingLoad || 0);
  if (explicit > 0) return Math.round(explicit);

  const sport = String(activity.sport || activity.sport_type || activity.type || '').toLowerCase();
  const duration = Number(
    activity.totalTimerTime || activity.moving_time || activity.movingTime ||
    activity.totalElapsedTime || activity.elapsedTime || activity.duration || 0,
  );
  if (!duration || duration <= 0) return 0;

  const ftp = profile?.powerZones?.cycling?.lt2
    || profile?.powerZones?.cycling?.ftp
    || profile?.ftp
    || 0;
  const thresholdPace = profile?.runningZones?.lt2 || profile?.thresholdPace || 0; // sec/km
  const thresholdSwimPace = profile?.powerZones?.swimming?.lt2 || profile?.thresholdSwimPace || 0; // sec/100m

  // 1) Cycling with power → standard TSS formula
  if (sport.includes('ride') || sport.includes('cycle') || sport.includes('bike') || sport === 'cycling') {
    const np = Number(activity.normalizedPower || activity.weightedAveragePower || 0);
    const avg = Number(activity.avgPower || activity.averagePower || activity.average_watts || 0);
    const watts = np > 0 ? np : avg;
    if (watts > 0 && ftp > 0) {
      return Math.round((duration * watts * watts) / (ftp * ftp * 3600) * 100);
    }
  }

  // 2) Running with avgSpeed → pace-based TSS
  if (sport.includes('run') || sport.includes('walk') || sport.includes('hike')) {
    const avgSpeed = Number(activity.avgSpeed || activity.averageSpeed || activity.average_speed || 0); // m/s
    if (avgSpeed > 0 && thresholdPace > 0) {
      const avgPace = 1000 / avgSpeed; // sec/km
      const intensity = thresholdPace / avgPace; // faster pace ⇒ ratio > 1
      return Math.round((duration * intensity * intensity) / 3600 * 100);
    }
  }

  // 3) Swimming with avgSpeed → pace-based TSS (per 100m)
  if (sport.includes('swim')) {
    const avgSpeed = Number(activity.avgSpeed || activity.averageSpeed || activity.average_speed || 0); // m/s
    if (avgSpeed > 0 && thresholdSwimPace > 0) {
      const avgPace = 100 / avgSpeed; // sec/100m
      const intensity = thresholdSwimPace / avgPace;
      return Math.round((duration * intensity * intensity) / 3600 * 100);
    }
  }

  // 4) Heart-rate TSS (TRIMP-ish) — works for any sport where the user has
  //    a max HR set. Lower-precision than power/pace based but always
  //    available, so the user always sees a TSS number instead of nothing.
  const avgHr = Number(activity.averageHeartRate || activity.average_heartrate || activity.avgHR || activity.avgHeartRate || 0);
  const maxHr = Number(profile?.maxHr || profile?.maxHeartRate || activity.maxHeartRate || activity.max_heartrate || 0);
  const restHr = Number(profile?.restingHr || profile?.restingHeartRate || 60);
  if (avgHr > 0 && maxHr > 0 && maxHr > restHr) {
    const hrr = (avgHr - restHr) / (maxHr - restHr); // heart-rate reserve fraction
    if (hrr > 0) {
      return Math.round((duration / 3600) * hrr * hrr * 100);
    }
  }

  return 0;
}
