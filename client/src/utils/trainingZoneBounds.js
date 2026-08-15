/**
 * Five-zone boundaries derived from the two lactate thresholds.
 *
 * Zones SHARE their boundaries: the end of one is the start of the next.
 * The arithmetic this replaces derived every zone edge independently — Z3
 * ended at 0.95x LT2 while Z4 started at 0.96x LT2 — which left a sliver of
 * intensities belonging to no zone at all (a coach reported Z3 ending at
 * 4:42/km with Z4 starting at 4:39/km), and collapsed Z3 to a single value
 * like "159-159 bpm" whenever LT1 and LT2 sat close together.
 *
 * Server-side zone building needs the same rules but cannot import from
 * client/src, so `server/utils/trainingZoneBounds.js` is a CommonJS twin of
 * this module. Keep the two in step.
 */

/** Force a strictly ordered boundary list so no zone can have zero width. */
function enforceOrder(bounds, ascending) {
  const out = [...bounds];
  for (let i = 1; i < out.length; i++) {
    if (ascending ? out[i] <= out[i - 1] : out[i] >= out[i - 1]) {
      out[i] = ascending ? out[i - 1] + 1 : out[i - 1] - 1;
    }
  }
  return out;
}

/**
 * @param {object}  o
 * @param {number}  o.lt1           aerobic threshold (W, bpm, km/h or pace seconds)
 * @param {number}  o.lt2           anaerobic threshold, same unit as lt1
 * @param {boolean} o.ascending     true when a larger number means harder
 *                                  (watts, bpm, km/h); false for pace seconds
 * @param {number} [o.floorFactor]  bottom of Z1 as a fraction of LT1
 * @param {number} [o.topFactor]    top of Z5 as a fraction of LT2
 * @param {number} [o.top]          explicit ceiling (e.g. a measured max HR);
 *                                  wins over topFactor when it is a usable number
 * @returns {number[]|null} six boundaries b0..b5, or null if the thresholds
 *                          are missing or the wrong way round
 */
export function ltZoneBounds({ lt1, lt2, ascending, floorFactor = 0.5, topFactor = 1.1, top = null }) {
  const a = Number(lt1);
  const b = Number(lt2);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) return null;
  // Pace runs backwards: LT2 is FEWER seconds than LT1.
  if (ascending ? b <= a : b >= a) return null;

  const scale = (anchor, f) => (ascending ? anchor * f : anchor / f);
  const explicitTop = Number(top);
  const ceiling = Number.isFinite(explicitTop) && explicitTop > 0 ? explicitTop : scale(b, topFactor);

  return enforceOrder(
    [
      scale(a, floorFactor), // bottom of Z1
      scale(a, 0.9), //         Z1 / Z2
      a, //                     Z2 / Z3 — aerobic threshold
      b, //                     Z3 / Z4 — anaerobic threshold
      scale(b, 1.04), //        Z4 / Z5
      ceiling, //               top of Z5
    ].map(Math.round),
    ascending
  );
}

/** Boundary list -> { zone1..zone5 } with shared min/max edges. */
export function zonesFromBounds(bounds) {
  if (!bounds) return null;
  const zones = {};
  for (let i = 0; i < 5; i++) {
    zones[`zone${i + 1}`] = { min: bounds[i], max: bounds[i + 1] };
  }
  return zones;
}

/** Convenience: boundaries and zone objects in one call. */
export function ltZones(options) {
  return zonesFromBounds(ltZoneBounds(options));
}

/**
 * Highest heart rate actually recorded for a test — the explicit `maxHR` field
 * or the highest stage reading. Used as the Z5 ceiling so the zone cannot run
 * past what the athlete reached; 1.30x LT2 HR had drawn Z5 to 217 bpm on a
 * test whose measured maximum was 183.
 *
 * @returns {number|null} bpm, or null when nothing plausible was recorded
 */
export function measuredMaxHr(test) {
  const candidates = [Number(test?.maxHR)];
  for (const r of test?.results || []) candidates.push(Number(r?.heartRate));
  const valid = candidates.filter((n) => Number.isFinite(n) && n > 80 && n < 240);
  return valid.length ? Math.max(...valid) : null;
}
