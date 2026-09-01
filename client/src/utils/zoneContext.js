/**
 * The athlete's thresholds and zones, in the shape the workout builder's
 * target resolvers expect.
 *
 * A step says "@ 88–93% FTP" or "@ LT2"; turning that into watts or a pace
 * needs this context. It was built inline on the calendar page, which was
 * fine until a second screen — the session detail, grading each step against
 * what was ridden — needed the same numbers. Two copies of this mapping is
 * how one screen comes to think LT2 is 270 W and the other 250.
 */

/**
 * @param {object|null} powerZones  the profile's `powerZones` object
 * @returns {object|null} context for resolveTargetWatts / resolveTargetPace
 */
export function buildZoneContext(powerZones) {
  if (!powerZones) return null;
  const cyclingZones = powerZones.cycling || null;
  const runningZones = powerZones.running || null;
  const swimmingZones = powerZones.swimming || null;
  // LT2/LT1 directly from profile fields; fall back to zone4/zone3 boundaries.
  const lt2Power = cyclingZones?.lt2 || cyclingZones?.zone4?.min || null;
  const lt1Power = cyclingZones?.lt1 || cyclingZones?.zone3?.min || null;
  const lt2Pace = runningZones?.lt2 || runningZones?.zone4?.min || null;
  const lt1Pace = runningZones?.lt1 || runningZones?.zone3?.min || null;
  const lt2Swim = swimmingZones?.lt2 || swimmingZones?.zone4?.min || null;
  const lt1Swim = swimmingZones?.lt1 || swimmingZones?.zone3?.min || null;
  return {
    ftp: lt2Power || 250,
    lt2Power, lt1Power, lt2Pace, lt1Pace, lt2Swim, lt1Swim,
    cyclingZones, runningZones, swimmingZones,
  };
}

/** Same, from a whole profile rather than just its zones. */
export function zoneContextFromProfile(profile) {
  return buildZoneContext(profile?.powerZones);
}
