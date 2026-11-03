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

import { heartRateAtIntensity, isPaceSport, toIntensity } from './lactateThresholdEngine';

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
 * @param {number} [o.top]          explicit ceiling (e.g. a measured max HR).
 *                                  Only ever RAISES the top of Z5.
 * @param {boolean}[o.round]        round the boundaries to whole units. Off
 *                                  for pace, where a whole second per km is
 *                                  not a whole second per mile: an edge typed
 *                                  as 12:00/mi came back rounded as 11:59.
 *                                  The server twin already defaults its pace
 *                                  zones this way.
 * @returns {number[]|null} six boundaries b0..b5, or null if the thresholds
 *                          are missing or the wrong way round
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
  /**
   * ...but never more than this share of the LT1–LT2 gap. Three percent of
   * LT2 is a sensible threshold band when the thresholds are 10–30 % apart,
   * as they usually are in watts or pace. When they sit closer it eats the
   * gap, and Z3 — LT1 up to the bottom of that band — shrank to nothing: a
   * test with LT2 4 % above LT1 got a Z3 two watts wide. Capping the band at
   * a third of the gap keeps Z3 at least two thirds of it, and leaves every
   * test whose thresholds are more than ~9 % apart exactly as it was.
   */
  thresholdBandOfGap: 1 / 3,
};

export const TOP_FACTOR = {
  power: 1.5,      // watts
  pace: 1.3,       // pace seconds are divided, so this reads as "faster by"
  heartRate: 1.12,
};

export function ltZoneBounds({ lt1, lt2, ascending, floorFactor = ZONE_SHAPE.floor, topFactor = 1.1, top = null, round = true }) {
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

  const maxBand = ZONE_SHAPE.thresholdBandOfGap * Math.abs(b - a);
  const band = (f) => {
    const edge = scale(b, f);
    return Math.abs(edge - b) <= maxBand ? edge : b + Math.sign(edge - b) * maxBand;
  };

  const raw = [
    scale(a, floorFactor), // bottom of Z1
    scale(a, ZONE_SHAPE.easySplit), //              Z1 / Z2
    a, //                                          Z2 / Z3 — aerobic threshold
    band(1 - ZONE_SHAPE.thresholdBand), //          Z3 / Z4 — just under LT2
    band(1 + ZONE_SHAPE.thresholdBand), //          Z4 / Z5 — just over it
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
export function zoneTargetFromThresholds(zone, { lt1, lt2, ascending, topFactor }) {
  const bounds = ltZoneBounds({ lt1, lt2, ascending, topFactor, round: false });
  if (!bounds) return null;
  const i = Math.max(0, Math.min(4, Math.round(Number(zone)) - 1));
  return (bounds[i] + bounds[i + 1]) / 2;
}

/** Narrowest HR zone worth prescribing: a strap drifts ±2 bpm within one steady effort. */
export const MIN_HR_ZONE_BPM = 4;
/** Below this LT1→LT2 HR rise, HR cannot separate Z3 from Z4. */
export const MIN_HR_LT_GAP_BPM = 6;

/**
 * Heart-rate zones for a test, read off the athlete's own HR curve.
 *
 * These used to be ltZoneBounds applied to the two threshold heart rates —
 * the power percentages (0.80x LT1, 0.97x and 1.03x LT2) multiplied into
 * beats. HR does not stretch the way power does: LT2 is typically 15–30 %
 * more watts than LT1 but only 4–8 % more beats, so "3 % under LT2 HR" landed
 * at or below LT1 HR and Z3 came out one or two beats wide (a trial user's
 * test: Z3 149–151 bpm, while the same test's power Z3 was 33 W wide). The
 * percentages also put HR Z2 well below the HR the athlete actually had at
 * the bottom of power Z2.
 *
 * Instead every edge between zones is the HR the athlete had at that edge's
 * power or pace in this test, so a ride held in power Z3 shows Z3 on the
 * heart-rate strap too. The bottom of Z1 and the top of Z5 are not readings
 * but conventions, and keep the existing rules.
 *
 * HR is a coarse instrument near threshold — a strap reading drifts a couple
 * of beats within one steady effort, and many athletes' HR flattens out above
 * LT2. So:
 *   · each of Z2, Z3 and Z4 keeps at least MIN_HR_ZONE_BPM, and Z4 reaches at
 *     least half that either side of the LT2 heart rate; when the test's own
 *     HR could not give Z4 that much the result says so;
 *   · when HR barely moved between LT1 and LT2 (under MIN_HR_LT_GAP_BPM) it
 *     cannot tell Z3 from Z4 at all, and there are no HR zones from this test
 *     — just the reason, for the screen to show instead of a nonsense table.
 *
 * @param {object} o
 * @param {number[]} o.intensityBounds  b0..b5 of the power/pace zones (stage units)
 * @param {number}   o.lt1, o.lt2       thresholds in stage units
 * @param {string}   o.sport
 * @param {Array<{value:number, heartRate:number}>} o.hrCurve  analyzeLactateTest().heartRateCurve
 * @param {number}  [o.top]             measured max HR (raises the top of Z5 only)
 * @param {number}  [o.floorFactor]     bottom of Z1 as a fraction of LT1 HR
 * @param {number}  [o.topFactor]       top of Z5 as a fraction of LT2 HR
 * @returns {{bounds: number[]|null, hr1?: number, hr2?: number, note: string|null}|null}
 *          null when the test has no usable HR at all
 */
export function heartRateZoneBoundsFromTest({
  intensityBounds, lt1, lt2, sport, hrCurve, top = null,
  floorFactor = ZONE_SHAPE.floor, topFactor = TOP_FACTOR.heartRate,
}) {
  if (!Array.isArray(intensityBounds) || intensityBounds.length !== 6 || !Array.isArray(hrCurve)) return null;
  const points = hrCurve
    .map((p) => ({ u: toIntensity(p.value, sport), hr: Number(p.heartRate) }))
    .filter((p) => p.u != null && Number.isFinite(p.hr) && p.hr > 0)
    .sort((x, y) => x.u - y.u);
  if (points.length < 2) return null;
  const at = (x) => heartRateAtIntensity(points, toIntensity(x, sport));
  const hr1 = at(lt1);
  const hr2 = at(lt2);
  if (hr1 == null || hr2 == null) return null;

  if (hr2 - hr1 < MIN_HR_LT_GAP_BPM) {
    const [r1, r2] = [Math.round(hr1), Math.round(hr2)];
    return {
      bounds: null,
      hr1: r1,
      hr2: r2,
      note: `Heart rate rose only ${Math.max(0, r2 - r1)} bpm between LT1 (${r1}) and LT2 (${r2}) in this test — too little to tell the zones apart by heart rate. Train Z2–Z4 by ${isPaceSport(sport) ? 'pace' : 'power'} from this test.`,
    };
  }

  const half = MIN_HR_ZONE_BPM / 2;
  const mapped = intensityBounds.map(at);
  // Z4 straddles the LT2 heart rate by at least ±2; Z3 keeps at least 4 below it.
  const b3 = Math.max(hr1 + MIN_HR_ZONE_BPM, Math.min(mapped[3], hr2 - half));
  const b4 = Math.max(mapped[4], hr2 + half);
  const b1 = Math.min(mapped[1], hr1 - MIN_HR_ZONE_BPM);
  const b0 = Math.min(mapped[0], hr1 * floorFactor, b1 - MIN_HR_ZONE_BPM);
  const explicitTop = Number(top);
  const b5 = Math.max(hr2 * topFactor, b4 + MIN_HR_ZONE_BPM, Number.isFinite(explicitTop) && explicitTop > 0 ? explicitTop : 0);

  const widened = mapped[4] - mapped[3] < MIN_HR_ZONE_BPM - 0.5;
  const note = widened
    ? `Heart rate rose only ${Math.max(0, Math.round(mapped[4] - mapped[3]))} bpm across the threshold zone in this test, so HR Z4 is set to LT2 HR ±${half} bpm. Above LT2, ${isPaceSport(sport) ? 'pace' : 'power'} is the better guide.`
    : null;

  const bounds = enforceOrder([b0, b1, hr1, b3, b4, b5].map(Math.round), true);
  return { bounds, hr1: Math.round(hr1), hr2: Math.round(hr2), note };
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
