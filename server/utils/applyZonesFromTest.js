/**
 * Turn a saved lactate test into the athlete's training zones.
 *
 * WHY THIS EXISTS
 * A test on its own is a picture. Zones are what make every other screen in
 * LaChart mean something — the calendar colours, TSS, planned-vs-actual, the
 * daily card all read from powerZones/heartRateZones. Until now computing the
 * test and adopting its zones were two separate acts, and the second one was a
 * manual trip into the profile that almost nobody made: of 530 athletes with a
 * test on file, 90 had zones. That broken link shows up again in the billing
 * data — 54 % of subscribers who stayed had zones, against 27 % of those who
 * cancelled.
 *
 * WHAT IT DOES
 * On save, if the athlete has no zones for that sport yet, the test's zones are
 * adopted. There is nothing to overwrite and nothing to ask about: the athlete
 * went to the trouble of a step test precisely to get these numbers.
 *
 * If they already have zones, nothing is touched. Replacing a threshold someone
 * set deliberately — or that their coach set — is not a side effect a save
 * should have. The computed zones come back in the result instead, so the
 * caller can offer them with the old and new values side by side.
 *
 * UNITS
 * Bike zones are watts. Run and swim zones are stored as pace *seconds*, which
 * is what the client reads and what UserModel documents; calculateZonesFromTest
 * returns both the formatted string and the raw seconds, and only the seconds
 * are persisted.
 */

'use strict';

const User = require('../models/UserModel');
const { calculateZonesFromTest } = require('./lactateZones');

/** test.sport uses short keys; the profile stores the long ones. */
const PROFILE_KEY = { bike: 'cycling', run: 'running', swim: 'swimming' };

const ZONE_KEYS = ['zone1', 'zone2', 'zone3', 'zone4', 'zone5'];

/**
 * Sanity bands for the threshold pair.
 *
 * calculateZonesFromTest will happily build a zone set around whatever the
 * curve fit produced, and the real data contains tests it should not be trusted
 * with: three bike tests whose LT2 lands under 100 W (the lowest is 52 W) and a
 * run test at 12:45/km. Those are mistyped stages, not athletes. Zones are read
 * by the calendar, TSS and the daily card, so writing one of those into a
 * profile miscolours everything downstream — worse than leaving zones unset.
 */
const PLAUSIBLE = {
  bike: [80, 700],   // watts
  run: [150, 720],   // seconds per km — 2:30 to 12:00
  swim: [30, 300],   // seconds per 100 m
};

function plausiblePair(sport, lt1, lt2) {
  const band = PLAUSIBLE[sport];
  if (!band) return false;
  const inBand = (v) => Number.isFinite(v) && v >= band[0] && v <= band[1];
  return inBand(lt1) && inBand(lt2);
}

const ZONE_LABEL = {
  zone1: 'Active Recovery',
  zone2: 'Endurance',
  zone3: 'Tempo',
  zone4: 'Threshold',
  zone5: 'VO2 Max',
};

/** True when this sport already carries a usable threshold in the profile. */
function hasZonesFor(user, key) {
  const pz = user?.powerZones?.[key];
  if (!pz) return false;
  if (Number(pz.lt2) > 0) return true;
  // A zone set typed by hand may predate lt1/lt2 being stored alongside it.
  return ZONE_KEYS.some((z) => Number(pz[z]?.min) > 0 || Number(pz[z]?.max) > 0);
}

/**
 * Shape the calculator's output into the profile's zone documents.
 * Pace sports carry seconds; `minSeconds`/`maxSeconds` are absent on bike.
 */
function toProfileZones(zones) {
  const src = zones.sport === 'bike' ? zones.power : zones.pace;
  if (!src) return null;
  const out = {};
  for (const z of ZONE_KEYS) {
    const band = src[z];
    if (!band) return null;
    const min = zones.sport === 'bike' ? Number(band.min) : Number(band.minSeconds);
    const max = zones.sport === 'bike' ? Number(band.max) : Number(band.maxSeconds);
    if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
    out[z] = { min, max, description: ZONE_LABEL[z] };
  }
  out.lt1 = Number(zones.lt1);
  out.lt2 = Number(zones.lt2);
  out.lastUpdated = new Date();
  return out;
}

function toProfileHeartRateZones(zones) {
  if (!zones.heartRate) return null;
  const out = {};
  for (const z of ZONE_KEYS) {
    const band = zones.heartRate[z];
    if (!band) return null;
    const min = Number(band.min);
    const max = Number(band.max);
    if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
    out[z] = { min, max, description: ZONE_LABEL[z] };
  }
  out.maxHeartRate = Number(zones.heartRate.zone5?.max) || undefined;
  out.lastUpdated = new Date();
  return out;
}

/**
 * @param {object} test  a saved test document (or lean object)
 * @param {object} [opts]
 * @param {boolean} [opts.force]  replace existing zones instead of standing off
 * @returns {Promise<{applied: boolean, reason?: string, sport?: string, zones?: object}>}
 *   `zones` is the computed set whenever one could be derived — present even
 *   when nothing was written, so the caller can offer it.
 */
async function applyZonesFromTest(test, { force = false } = {}) {
  if (!test?.athleteId) return { applied: false, reason: 'no_athlete' };

  const key = PROFILE_KEY[test.sport];
  if (!key) return { applied: false, reason: 'unsupported_sport' };

  const zones = calculateZonesFromTest(test);
  // Null means the curve did not yield a usable LT1/LT2 pair — too few points,
  // or thresholds that came out the wrong way round. Silence is correct here:
  // zones built on a threshold the calculator itself rejected are worse than
  // no zones at all.
  if (!zones) return { applied: false, reason: 'no_thresholds' };
  if (!plausiblePair(test.sport, Number(zones.lt1), Number(zones.lt2))) {
    return { applied: false, reason: 'implausible_thresholds', zones };
  }

  const powerZones = toProfileZones(zones);
  if (!powerZones) return { applied: false, reason: 'incomplete_zones', zones };

  const user = await User.findById(test.athleteId)
    .select('powerZones heartRateZones')
    .lean();
  if (!user) return { applied: false, reason: 'athlete_not_found', zones };

  if (!force && hasZonesFor(user, key)) {
    return { applied: false, reason: 'has_zones', sport: key, zones };
  }

  const update = {
    [`powerZones.${key}`]: powerZones,
    'trainingPreferences.zonesMethod': 'lactate',
  };
  const hrZones = toProfileHeartRateZones(zones);
  if (hrZones) update[`heartRateZones.${key}`] = hrZones;

  await User.updateOne({ _id: test.athleteId }, {
    $set: update,
    $push: {
      powerZonesHistory: {
        zones: powerZones,
        source: 'lactate_test',
        note: `From ${String(test.sport).toUpperCase()} test${test.title ? ` "${test.title}"` : ''}`,
        createdAt: new Date(),
      },
    },
  });

  return { applied: true, sport: key, zones };
}

module.exports = { applyZonesFromTest, hasZonesFor, toProfileZones, plausiblePair, PROFILE_KEY };
