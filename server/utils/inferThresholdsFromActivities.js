/**
 * Server mirror of client/src/utils/inferThresholdsFromActivities.js
 */

const MIN_INFER_SEC = 20 * 60;

function actDuration(a) {
  return Number(
    a?.movingTime || a?.moving_time || a?.totalElapsedTime
    || a?.elapsedTime || a?.totalTime || a?.duration || 0,
  );
}

function actSport(a) {
  return String(a?.sport || a?.sport_type || a?.type || '').toLowerCase();
}

function isBike(s) {
  return s.includes('ride') || s.includes('cycl') || s.includes('bike') || s === 'cycling';
}

function isRun(s) {
  return s.includes('run') || s.includes('walk') || s.includes('hike') || s === 'running';
}

function isSwim(s) {
  return s.includes('swim') || s === 'swimming';
}

function avgSpeedMps(a) {
  const stored = Number(a?.averageSpeed || a?.avgSpeed || a?.average_speed || 0);
  if (stored > 0) return stored;
  const dist = Number(a?.distance || a?.totalDistance || 0);
  const dur = actDuration(a);
  if (dist > 0 && dur > 0) return dist / dur;
  return 0;
}

function avgHr(a) {
  return Number(
    a?.avgHeartRate || a?.averageHeartRate || a?.average_heartrate || a?.avgHR || 0,
  );
}

function maxHr(a) {
  return Number(a?.maxHeartRate || a?.max_heartrate || 0);
}

function avgWatts(a) {
  return Number(
    a?.normalizedPower || a?.weightedAveragePower || a?.weighted_average_watts
    || a?.avgPower || a?.averagePower || a?.average_watts || 0,
  );
}

function profileHasPowerZones(profile) {
  const cz = profile?.powerZones?.cycling;
  const rz = profile?.powerZones?.running || profile?.runningZones;
  const sz = profile?.powerZones?.swimming || profile?.swimmingZones;
  return !!(
    Number(cz?.lt2 || cz?.ftp || profile?.ftp)
    || Number(rz?.lt2 || rz?.zone4?.min || profile?.thresholdPace)
    || Number(sz?.lt2 || sz?.zone4?.min || profile?.thresholdSwimPace)
  );
}

function profileHasHrZones(profile) {
  const hz = profile?.heartRateZones || {};
  return ['cycling', 'running', 'swimming'].some((key) => {
    const z = hz[key];
    return Number(z?.lt2 || z?.lt2Hr || z?.threshold || z?.zone4?.max || z?.maxHeartRate) > 0;
  }) || Number(profile?.maxHr || profile?.maxHeartRate) > 0;
}

function inferThresholdsFromActivities(activities = []) {
  const out = {
    cyclingFtp: 0,
    runningLt2Pace: 0,
    swimmingLt2Pace: 0,
    lthr: { cycling: 0, running: 0, swimming: 0 },
    maxHr: { cycling: 0, running: 0, swimming: 0 },
  };

  for (const a of activities) {
    if (!a) continue;
    const sport = actSport(a);
    const dur = actDuration(a);
    const hr = avgHr(a);
    const peak = maxHr(a) || (hr > 0 ? Math.round(hr * 1.06) : 0);

    const hrKey = isSwim(sport) ? 'swimming' : isRun(sport) ? 'running' : isBike(sport) ? 'cycling' : null;
    if (hrKey && peak > out.maxHr[hrKey]) out.maxHr[hrKey] = peak;

    if (dur < MIN_INFER_SEC) continue;

    if (isBike(sport)) {
      const watts = avgWatts(a);
      if (watts > out.cyclingFtp) out.cyclingFtp = watts;
      if (hr > out.lthr.cycling) out.lthr.cycling = hr;
    }

    if (isRun(sport)) {
      const speed = avgSpeedMps(a);
      if (speed > 0) {
        const pace = 1000 / speed;
        if (!out.runningLt2Pace || pace < out.runningLt2Pace) out.runningLt2Pace = pace;
      }
      if (hr > out.lthr.running) out.lthr.running = hr;
    }

    if (isSwim(sport)) {
      const speed = avgSpeedMps(a);
      if (speed > 0) {
        const pace = 100 / speed;
        if (!out.swimmingLt2Pace || pace < out.swimmingLt2Pace) out.swimmingLt2Pace = pace;
      }
      if (hr > out.lthr.swimming) out.lthr.swimming = hr;
    }
  }

  if (out.cyclingFtp > 0) out.cyclingFtp = Math.round(out.cyclingFtp * 0.95);
  if (out.runningLt2Pace > 0) out.runningLt2Pace = Math.round(out.runningLt2Pace);
  if (out.swimmingLt2Pace > 0) out.swimmingLt2Pace = Math.round(out.swimmingLt2Pace);
  for (const key of ['cycling', 'running', 'swimming']) {
    if (out.lthr[key] > 0) out.lthr[key] = Math.round(out.lthr[key]);
  }

  return out;
}

function enrichProfileForTss(profile, activities = []) {
  if (!profile || !Array.isArray(activities) || !activities.length) return profile;
  if (profileHasPowerZones(profile) && profileHasHrZones(profile)) return profile;

  const inferred = inferThresholdsFromActivities(activities);
  const hasInferred = inferred.cyclingFtp > 0
    || inferred.runningLt2Pace > 0
    || inferred.swimmingLt2Pace > 0
    || inferred.lthr.cycling > 0
    || inferred.lthr.running > 0
    || inferred.maxHr.cycling > 0
    || inferred.maxHr.running > 0;

  if (!hasInferred) return profile;

  const powerZones = { ...(profile.powerZones || {}) };
  const heartRateZones = { ...(profile.heartRateZones || {}) };

  if (!Number(powerZones?.cycling?.lt2 || powerZones?.cycling?.ftp || profile.ftp) && inferred.cyclingFtp > 0) {
    powerZones.cycling = { ...(powerZones.cycling || {}), lt2: inferred.cyclingFtp, _inferred: true };
  }

  if (!Number(powerZones?.running?.lt2 || profile.runningZones?.lt2 || profile.thresholdPace) && inferred.runningLt2Pace > 0) {
    powerZones.running = { ...(powerZones.running || {}), lt2: inferred.runningLt2Pace, _inferred: true };
  }

  if (!Number(powerZones?.swimming?.lt2 || profile.swimmingZones?.lt2) && inferred.swimmingLt2Pace > 0) {
    powerZones.swimming = { ...(powerZones.swimming || {}), lt2: inferred.swimmingLt2Pace, _inferred: true };
  }

  for (const [key, lthr, max] of [
    ['cycling', inferred.lthr.cycling, inferred.maxHr.cycling],
    ['running', inferred.lthr.running, inferred.maxHr.running],
    ['swimming', inferred.lthr.swimming, inferred.maxHr.swimming],
  ]) {
    const existing = heartRateZones[key] || {};
    const patch = { ...existing };
    let changed = false;
    if (!Number(existing.lt2 || existing.lt2Hr || existing.threshold || existing.zone4?.max) && lthr > 0) {
      patch.lt2 = lthr;
      patch._inferred = true;
      changed = true;
    }
    if (!Number(existing.maxHeartRate || existing.zone5?.max || profile.maxHr) && max > 0) {
      patch.maxHeartRate = max;
      changed = true;
    }
    if (changed) heartRateZones[key] = patch;
  }

  return {
    ...profile,
    powerZones,
    heartRateZones,
    ftp: profile.ftp || (inferred.cyclingFtp > 0 ? inferred.cyclingFtp : undefined),
    thresholdPace: profile.thresholdPace || (inferred.runningLt2Pace > 0 ? inferred.runningLt2Pace : undefined),
    _thresholdsInferredFromActivities: true,
  };
}

module.exports = {
  inferThresholdsFromActivities,
  enrichProfileForTss,
};
