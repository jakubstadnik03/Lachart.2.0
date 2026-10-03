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
 * @param {number} [o.top]          explicit ceiling (e.g. a measured max HR).
 *                                  Only ever RAISES the top of Z5.
 * @param {boolean}[o.round]        round boundaries (off for raw pace seconds)
 * @returns {number[]|null} six boundaries b0..b5
 */
/**
 * Top of Z5, per metric. One source for the chart on the testing page and for
 * the zones written into the profile — the two used to disagree, so an athlete
 * saw one zone five under their curve and a different one in the calendar.
 *
 * Z5 is the only zone with no threshold above it to close it, so its ceiling is
 * a judgement. It had been narrowed to 1.10-1.20 x LT2, which put a 300 W
 * cyclist's zone five at 330-360 W — under their five-minute power, let alone a
 * sprint — so the zone meant to hold every hard effort held almost none.
 *
 * Power stretches furthest above threshold; pace much less, since nobody runs
 * half again as fast as their threshold; heart rate least of all, because LT2
 * already sits at 88-92 % of maximum.
 */
/**
 * Where the five zones sit between the two measured thresholds.
 *
 * These were four numbers scattered across four call sites, and the call sites
 * disagreed: the same test produced a different table depending on whether the
 * zones came from the server, the testing page, the profile editor or the
 * zones modal. One of them put the top of Z5 at 1.20x LT2 while the others
 * used 1.30. A coach who regenerated their zones from a different screen got
 * different zones, which is indistinguishable from the model being arbitrary.
 *
 * The shape itself changed with them, after a threshold coach compared his own
 * reading of his own tests against ours and went back to doing it by hand:
 *
 *   Z4 was LT2 to 1.04x LT2 — four percent wide and sitting entirely ABOVE the
 *   threshold. Running at exactly LT2 landed on the Z3/Z4 line and a second
 *   slower was "tempo", so the zone a threshold session is built around was
 *   both nearly impossible to land in and on the wrong side of the number it
 *   is named after. It now straddles LT2 by THRESHOLD_BAND either way, which
 *   is how a threshold session is actually prescribed.
 *
 *   Z1 ran to 0.90x LT1 and took forty percent of the axis while Z2 — the
 *   endurance band most of the week is ridden in — got ten. The split moved to
 *   0.80x LT1, which hands that volume to the zone it belongs to.
 *
 * Changing these changes everybody's generated zones, so they live in one
 * place with the reasoning attached rather than as four magic numbers.
 */
const ZONE_SHAPE = {
  /** Bottom of Z1, as a fraction of LT1. */
  floor: 0.70,
  /** Z1 / Z2 split, as a fraction of LT1. */
  easySplit: 0.80,
  /** Half-width of the threshold zone, as a fraction of LT2. */
  thresholdBand: 0.03,
};

const TOP_FACTOR = {
  power: 1.5,      // watts
  pace: 1.3,       // pace seconds are divided, so this reads as "faster by"
  heartRate: 1.12,
};

function ltZoneBounds({ lt1, lt2, ascending, floorFactor = ZONE_SHAPE.floor, topFactor = 1.1, top = null, round = true }) {
  const a = Number(lt1);
  const b = Number(lt2);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) return null;
  // Pace runs backwards: LT2 is FEWER seconds than LT1.
  if (ascending ? b <= a : b >= a) return null;

  const scale = (anchor, f) => (ascending ? anchor * f : anchor / f);
  const byFactor = scale(b, topFactor);
  const explicitTop = Number(top);
  // An explicit ceiling may raise the top of Z5; it must never squeeze it.
  //
  // `top` is usually the highest heart rate recorded during the step test, and
  // a step test is stopped when the athlete has had enough — often only a beat
  // or two above LT2. Taking that literally produced zone fives like 162-163
  // bpm: a band nobody can train in, sitting where the hardest work belongs.
  // The factor sets the floor for the ceiling; the measurement raises it when
  // the athlete really did go higher. Pace runs backwards, so "higher" there is
  // the smaller number.
  const ceiling = Number.isFinite(explicitTop) && explicitTop > 0
    ? (ascending ? Math.max(explicitTop, byFactor) : Math.min(explicitTop, byFactor))
    : byFactor;

  const raw = [
    scale(a, floorFactor), // bottom of Z1
    scale(a, ZONE_SHAPE.easySplit), //              Z1 / Z2
    a, //                                          Z2 / Z3 — aerobic threshold
    scale(b, 1 - ZONE_SHAPE.thresholdBand), //     Z3 / Z4 — just under LT2
    scale(b, 1 + ZONE_SHAPE.thresholdBand), //     Z4 / Z5 — just over it
    ceiling, //               top of Z5
  ];
  return enforceOrder(round ? raw.map(Math.round) : raw, ascending);
}


/**
 * A representative value for one zone, derived from the thresholds.
 *
 * Used when an athlete has no zone table of their own and something still has
 * to turn "Z2" into a pace or a wattage — exporting a planned session to a
 * watch, mostly. It was a hardcoded array in four files, written against the
 * zone shape as it stood years ago and never moved when the shape did: it put
 * Z2 at LT1 exactly, so a session planned as an endurance run exported with
 * the aerobic threshold as its target. That is not a rounding difference, it
 * is a harder session than the one that was written.
 *
 * Deriving it from the same bounds means the fallback cannot drift from the
 * table again.
 */
function zoneTargetFromThresholds(zone, { lt1, lt2, ascending, topFactor }) {
  const bounds = ltZoneBounds({ lt1, lt2, ascending, topFactor, round: false });
  if (!bounds) return null;
  const i = Math.max(0, Math.min(4, Math.round(Number(zone)) - 1));
  return (bounds[i] + bounds[i + 1]) / 2;
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

module.exports = { ltZoneBounds, zoneTargetFromThresholds, zonesFromBounds, measuredMaxHr, TOP_FACTOR };
