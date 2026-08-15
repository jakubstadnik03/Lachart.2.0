/**
 * CommonJS twin of `client/src/utils/trainingZoneBounds.js` — the server builds
 * the same training zones for emailed reports and the server-side PDF, but it
 * cannot import from the CRA client bundle. Keep the two files in step.
 *
 * Zones SHARE their boundaries: the end of one is the start of the next. The
 * arithmetic this replaces derived every edge independently (Z3 ended at
 * 0.95x LT2 while Z4 started at 0.96x LT2), leaving intensities that belonged
 * to no zone and collapsing Z3 to a single value when LT1 and LT2 sat close
 * together.
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
 * @param {number}  o.lt1           aerobic threshold (W, bpm or pace seconds)
 * @param {number}  o.lt2           anaerobic threshold, same unit as lt1
 * @param {boolean} o.ascending     true when a larger number means harder
 * @param {number} [o.floorFactor]  bottom of Z1 as a fraction of LT1
 * @param {number} [o.topFactor]    top of Z5 as a fraction of LT2
 * @param {number} [o.top]          explicit ceiling (e.g. a measured max HR)
 * @param {boolean}[o.round]        round boundaries (off for raw pace seconds)
 * @returns {number[]|null} six boundaries b0..b5
 */
function ltZoneBounds({ lt1, lt2, ascending, floorFactor = 0.5, topFactor = 1.1, top = null, round = true }) {
  const a = Number(lt1);
  const b = Number(lt2);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) return null;
  // Pace runs backwards: LT2 is FEWER seconds than LT1.
  if (ascending ? b <= a : b >= a) return null;

  const scale = (anchor, f) => (ascending ? anchor * f : anchor / f);
  const explicitTop = Number(top);
  const ceiling = Number.isFinite(explicitTop) && explicitTop > 0 ? explicitTop : scale(b, topFactor);

  const raw = [
    scale(a, floorFactor), // bottom of Z1
    scale(a, 0.9), //         Z1 / Z2
    a, //                     Z2 / Z3 — aerobic threshold
    b, //                     Z3 / Z4 — anaerobic threshold
    scale(b, 1.04), //        Z4 / Z5
    ceiling, //               top of Z5
  ];
  return enforceOrder(round ? raw.map(Math.round) : raw, ascending);
}

/** Boundary list -> { zone1..zone5 } with shared min/max edges. */
function zonesFromBounds(bounds) {
  if (!bounds) return null;
  const zones = {};
  for (let i = 0; i < 5; i++) {
    zones[`zone${i + 1}`] = { min: bounds[i], max: bounds[i + 1] };
  }
  return zones;
}

/** Highest heart rate actually recorded — explicit `maxHR` or the best stage. */
function measuredMaxHr(test) {
  const candidates = [Number(test && test.maxHR)];
  for (const r of (test && test.results) || []) candidates.push(Number(r && r.heartRate));
  const valid = candidates.filter((n) => Number.isFinite(n) && n > 80 && n < 240);
  return valid.length ? Math.max(...valid) : null;
}

module.exports = { ltZoneBounds, zonesFromBounds, measuredMaxHr };
