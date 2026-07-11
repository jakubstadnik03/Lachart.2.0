/**
 * Utility functions for converting between metric and imperial units
 * Uses user's units preference from profile
 */

// Conversion constants
const KM_TO_MILES = 0.621371;
const KG_TO_LBS = 2.20462;
const LBS_TO_KG = 0.453592;
const METERS_TO_FEET = 3.28084;
const CM_TO_INCHES = 0.393701;
const CELSIUS_TO_FAHRENHEIT = (c) => (c * 9/5) + 32;

export const M_PER_YARD = 0.9144;
export const KM_PER_MILE = 1.609344;
export const METERS_PER_MILE = 1609.344;

/**
 * Get user's units preference from user object or localStorage
 * @param {Object} user - User object from AuthProvider
 * @returns {Object} Units object with distance, weight, temperature
 */
export const getUserUnits = (user) => {
  const defaultUnits = {
    distance: 'metric',
    weight: 'kg',
    temperature: 'celsius',
  };

  let stored = null;
  try {
    const saved = localStorage.getItem('userUnits');
    if (saved) stored = JSON.parse(saved);
  } catch (e) {
    console.error('Error loading units from localStorage:', e);
  }

  // Device-local preference wins over a possibly stale profile from the API.
  if (stored) return { ...defaultUnits, ...user?.units, ...stored };
  if (user?.units) return { ...defaultUnits, ...user.units };
  return defaultUnits;
};

/**
 * Resolve distance unit system robustly from user profile + optional fallback.
 * Accepts legacy/variant values like "Imperial", "mile", "miles", "us".
 */
export const resolveDistanceUnitSystem = (user, fallback = 'metric') => {
  const normalize = (value) => String(value || '').trim().toLowerCase();
  const isImperialLike = (value) => {
    const v = normalize(value);
    return v === 'imperial' || v === 'us' || v === 'mile' || v === 'miles' || v === 'mi' || v === 'mph';
  };

  const userDistance = user?.units?.distance;
  if (isImperialLike(userDistance)) return 'imperial';
  if (normalize(userDistance) === 'metric' || normalize(userDistance) === 'km') return 'metric';

  return isImperialLike(fallback) ? 'imperial' : 'metric';
};

/**
 * Convert distance from meters to user's preferred unit
 * @param {Number} meters - Distance in meters
 * @param {String} unitSystem - 'metric' or 'imperial'
 * @returns {Object} { value, unit, formatted }
 */
export const formatDistance = (meters, unitSystem = 'metric') => {
  if (!meters && meters !== 0) return { value: 0, unit: unitSystem === 'metric' ? 'km' : 'mi', formatted: '0' };
  
  if (unitSystem === 'imperial') {
    const miles = meters / 1000 * KM_TO_MILES;
    if (miles < 0.1) {
      const feet = meters * METERS_TO_FEET;
      return { value: feet, unit: 'ft', formatted: `${Math.round(feet)} ft` };
    }
    return { value: miles, unit: 'mi', formatted: `${miles.toFixed(2)} mi` };
  } else {
    // Metric: whole km without decimals (e.g. "5 km"), otherwise "X.XX km"
    const km = meters / 1000;
    if (km < 1) {
      return { value: meters, unit: 'm', formatted: `${Math.round(meters)} m` };
    }
    const formatted = km % 1 === 0 ? `${km} km` : `${km.toFixed(2)} km`;
    return { value: km, unit: 'km', formatted };
  }
};

/**
 * Convert distance from user's preferred unit to meters
 * @param {Number} value - Distance value
 * @param {String} unit - 'km', 'm', 'mi', 'ft'
 * @returns {Number} Distance in meters
 */
export const parseDistance = (value, unit) => {
  if (!value && value !== 0) return 0;
  
  const numValue = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(numValue)) return 0;
  
  switch (unit) {
    case 'km':
      return numValue * 1000;
    case 'm':
      return numValue;
    case 'mi':
      return numValue * 1000 / KM_TO_MILES;
    case 'ft':
      return numValue / METERS_TO_FEET;
    default:
      // Assume meters if unit not specified
      return numValue;
  }
};

/**
 * Convert weight from kg to user's preferred unit
 * @param {Number} kg - Weight in kilograms
 * @param {String} unitSystem - 'kg' or 'lbs'
 * @returns {Object} { value, unit, formatted }
 */
export const formatWeight = (kg, unitSystem = 'kg') => {
  if (!kg && kg !== 0) return { value: 0, unit: unitSystem, formatted: '0' };
  
  if (unitSystem === 'lbs') {
    const lbs = kg * KG_TO_LBS;
    return { value: lbs, unit: 'lbs', formatted: `${lbs.toFixed(1)} lbs` };
  } else {
    return { value: kg, unit: 'kg', formatted: `${kg.toFixed(1)} kg` };
  }
};

/**
 * Convert weight from user's preferred unit to kg
 * @param {Number} value - Weight value
 * @param {String} unit - 'kg' or 'lbs'
 * @returns {Number} Weight in kilograms
 */
export const parseWeight = (value, unit) => {
  if (!value && value !== 0) return 0;
  
  const numValue = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(numValue)) return 0;
  
  if (unit === 'lbs') {
    return numValue * LBS_TO_KG;
  } else {
    return numValue;
  }
};

/**
 * Convert speed from m/s to user's preferred unit
 * @param {Number} mps - Speed in meters per second
 * @param {String} unitSystem - 'metric' or 'imperial'
 * @returns {Object} { value, unit, formatted }
 */
export const formatSpeed = (mps, unitSystem = 'metric') => {
  if (!mps && mps !== 0) return { value: 0, unit: unitSystem === 'metric' ? 'km/h' : 'mph', formatted: '0' };
  
  if (unitSystem === 'imperial') {
    const mph = mps * 3.6 * KM_TO_MILES;
    return { value: mph, unit: 'mph', formatted: `${mph.toFixed(1)} mph` };
  } else {
    const kmh = mps * 3.6;
    return { value: kmh, unit: 'km/h', formatted: `${kmh.toFixed(1)} km/h` };
  }
};

/**
 * Convert elevation from meters to user's preferred unit
 * @param {Number} meters - Elevation in meters
 * @param {String} unitSystem - 'metric' or 'imperial'
 * @returns {Object} { value, unit, formatted }
 */
export const formatElevation = (meters, unitSystem = 'metric') => {
  if (!meters && meters !== 0) return { value: 0, unit: unitSystem === 'metric' ? 'm' : 'ft', formatted: '0' };
  
  if (unitSystem === 'imperial') {
    const feet = meters * METERS_TO_FEET;
    return { value: feet, unit: 'ft', formatted: `${Math.round(feet)} ft` };
  } else {
    return { value: meters, unit: 'm', formatted: `${Math.round(meters)} m` };
  }
};

/**
 * Format distance with user's units preference
 * @param {Number} meters - Distance in meters
 * @param {Object} user - User object with units preference
 * @returns {String} Formatted distance string
 */
export const formatDistanceForUser = (meters, user) => {
  const units = getUserUnits(user);
  return formatDistance(meters, units.distance).formatted;
};

/** Unit suffix for distance form fields (km / mi / m). */
export const distanceInputUnitLabel = (unitSystem = 'metric', isSwim = false) => {
  if (isSwim) return 'm';
  return unitSystem === 'imperial' ? 'mi' : 'km';
};

/** Placeholder for distance inputs. */
export const distanceInputPlaceholder = (unitSystem = 'metric', isSwim = false, metres = 0) => {
  if (isSwim) return metres > 0 ? `${Math.round(metres)} m` : '1500 m';
  if (metres > 0) return formatDistance(metres, unitSystem).formatted;
  return unitSystem === 'imperial' ? '10 mi' : '10 km';
};

/**
 * Parse free-text distance to metres (run/bike: km or mi by unitSystem; swim: m).
 */
export const parseDistanceInputToMetres = (raw, unitSystem = 'metric', { isSwim = false } = {}) => {
  const s = String(raw ?? '').trim().toLowerCase().replace(',', '.');
  if (!s) return null;
  if (/\bmi\b|mile?s?$/.test(s) || s.endsWith('mi')) {
    const n = parseFloat(s.replace(/[^\d.]/g, ''));
    return Number.isFinite(n) && n > 0 ? n * METERS_PER_MILE : null;
  }
  if (s.endsWith('km')) {
    const n = parseFloat(s);
    return Number.isFinite(n) && n > 0 ? n * 1000 : null;
  }
  if (s.endsWith('m') && !s.endsWith('mi')) {
    const n = parseFloat(s);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  const n = parseFloat(s);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (isSwim) return n >= 50 ? n : n * 1000;
  if (unitSystem === 'imperial') return n * METERS_PER_MILE;
  return n > 500 ? n : n * 1000;
};

/** Format metres as a bare number for distance form fields (no unit suffix). */
export const formatDistanceInputFromMetres = (metres, unitSystem = 'metric', { isSwim = false } = {}) => {
  const m = Number(metres);
  if (!Number.isFinite(m) || m <= 0) return '';
  if (isSwim && m < 1000) return String(Math.round(m));
  if (unitSystem === 'imperial') {
    const mi = m / METERS_PER_MILE;
    return mi >= 10 ? mi.toFixed(1) : mi.toFixed(2).replace(/\.?0+$/, '');
  }
  const km = m / 1000;
  return km % 1 === 0 ? String(km) : km.toFixed(2).replace(/\.?0+$/, '');
};

/** Format metres with unit suffix for blur-normalised display fields. */
export const formatDistanceFieldDisplay = (metres, unitSystem = 'metric', { isSwim = false } = {}) => {
  const m = Number(metres);
  if (!Number.isFinite(m) || m <= 0) return '';
  if (isSwim && m < 1000) return `${Math.round(m)} m`;
  return formatDistance(m, unitSystem).formatted;
};

/**
 * Format weight with user's units preference
 * @param {Number} kg - Weight in kilograms
 * @param {Object} user - User object with units preference
 * @returns {String} Formatted weight string
 */
export const formatWeightForUser = (kg, user) => {
  const units = getUserUnits(user);
  return formatWeight(kg, units.weight).formatted;
};

/**
 * Format speed with user's units preference
 * @param {Number} mps - Speed in meters per second
 * @param {Object} user - User object with units preference
 * @returns {String} Formatted speed string
 */
export const formatSpeedForUser = (mps, user) => {
  const units = getUserUnits(user);
  return formatSpeed(mps, units.distance).formatted;
};

/**
 * Format elevation with user's units preference
 * @param {Number} meters - Elevation in meters
 * @param {Object} user - User object with units preference
 * @returns {String} Formatted elevation string
 */
export const formatElevationForUser = (meters, user) => {
  const units = getUserUnits(user);
  return formatElevation(meters, units.distance).formatted;
};

/**
 * Format height from cm to user's preferred unit
 * @param {Number} cm - Height in centimeters
 * @param {String} unitSystem - 'metric' or 'imperial'
 * @returns {String} e.g. "178 cm" or "5'10\""
 */
export const formatHeight = (cm, unitSystem = 'metric') => {
  if (!cm && cm !== 0) return '—';
  if (unitSystem === 'imperial') {
    const totalInches = cm * CM_TO_INCHES;
    const feet = Math.floor(totalInches / 12);
    const inches = Math.round(totalInches % 12);
    return `${feet}'${inches}"`;
  }
  return `${Math.round(cm)} cm`;
};

/**
 * Returns the label for height input based on unit system
 * @param {String} unitSystem - 'metric' or 'imperial'
 * @returns {String} "cm" or "inches (e.g. 71 for 5'11\")"
 */
export const heightLabel = (unitSystem = 'metric') =>
  unitSystem === 'imperial' ? 'inches (e.g. 71 for 5\'11")' : 'cm';

/**
 * Returns the label for weight input based on unit system
 * @param {String} unitSystem - 'metric' or 'imperial'
 * @returns {String}
 */
export const weightLabel = (unitSystem = 'metric') =>
  unitSystem === 'imperial' ? 'lbs' : 'kg';

/**
 * Convert temperature from Celsius to user's preferred unit
 * @param {Number} celsius
 * @param {String} unitSystem - 'celsius' or 'fahrenheit'
 * @returns {String} e.g. "36.5°C" or "97.7°F"
 */
export const formatTemperature = (celsius, unitSystem = 'celsius') => {
  if (celsius === null || celsius === undefined) return '—';
  if (unitSystem === 'fahrenheit') {
    return `${CELSIUS_TO_FAHRENHEIT(celsius).toFixed(1)}°F`;
  }
  return `${Number(celsius).toFixed(1)}°C`;
};

/**
 * Returns pace unit string based on distance unit system and sport
 * @param {String} unitSystem - 'metric' or 'imperial'
 * @param {String} sport - 'run'|'running'|'swim'|'swimming'|'bike'|'cycling'
 * @returns {String}
 */
export const paceUnit = (unitSystem = 'metric', sport = 'running') => {
  const s = String(sport).toLowerCase();
  if (s === 'swim' || s === 'swimming' || s.includes('swim')) {
    return unitSystem === 'imperial' ? 'min/100y' : 'min/100m';
  }
  return unitSystem === 'imperial' ? 'min/mi' : 'min/km';
};

/** Short pace suffix for inline labels: /km, /mi, /100m, /100yd */
export const paceUnitShort = (unitSystem = 'metric', sport = 'run') => {
  const s = String(sport).toLowerCase();
  if (s.includes('swim')) return unitSystem === 'imperial' ? '/100yd' : '/100m';
  return unitSystem === 'imperial' ? '/mi' : '/km';
};

/** Format seconds as m:ss (no unit). */
export const formatPaceMMSS = (seconds) => {
  if (seconds == null || !Number.isFinite(Number(seconds)) || Number(seconds) <= 0) return null;
  const sec = Math.round(Number(seconds));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};

/** Format pace seconds with unit suffix. */
export const formatPaceSeconds = (seconds, unitSystem = 'metric', sport = 'run') => {
  const mmss = formatPaceMMSS(seconds);
  if (!mmss) return '—';
  return `${mmss}${paceUnitShort(unitSystem, sport)}`;
};

/** Pace seconds (display units) from speed in m/s. */
export const paceSecondsFromSpeedMps = (mps, unitSystem = 'metric', sport = 'run') => {
  if (!mps || !Number.isFinite(Number(mps)) || Number(mps) <= 0) return null;
  const s = String(sport).toLowerCase();
  if (s.includes('swim')) {
    const distM = unitSystem === 'imperial' ? M_PER_YARD * 100 : 100;
    return distM / Number(mps);
  }
  const distM = unitSystem === 'imperial' ? METERS_PER_MILE : 1000;
  return distM / Number(mps);
};

export const formatPaceFromSpeedMps = (mps, unitSystem = 'metric', sport = 'run') => {
  const sec = paceSecondsFromSpeedMps(mps, unitSystem, sport);
  return sec ? formatPaceSeconds(sec, unitSystem, sport) : null;
};

/** Pace seconds (display units) from distance (m) + duration (s). */
export const paceSecondsFromDistanceAndDuration = (meters, seconds, unitSystem = 'metric', sport = 'run') => {
  if (!meters || !seconds || meters <= 0 || seconds <= 0) return null;
  const s = String(sport).toLowerCase();
  if (s.includes('swim')) {
    const unitDist = unitSystem === 'imperial' ? meters / M_PER_YARD : meters;
    return seconds / (unitDist / 100);
  }
  const unitDist = unitSystem === 'imperial' ? meters / METERS_PER_MILE : meters / 1000;
  return seconds / unitDist;
};

export const formatPaceFromDistanceAndDuration = (meters, seconds, unitSystem = 'metric', sport = 'run') => {
  const sec = paceSecondsFromDistanceAndDuration(meters, seconds, unitSystem, sport);
  return sec ? formatPaceSeconds(sec, unitSystem, sport) : null;
};

/** True when a lactate test stored run pace as sec/mile. */
export const testRunPaceStoredPerMile = (testOrUnitSystem, sport = 'run') => {
  const s = String(sport || '').toLowerCase();
  if (!s.includes('run')) return false;
  const u = typeof testOrUnitSystem === 'string'
    ? testOrUnitSystem
    : String(testOrUnitSystem?.unitSystem ?? '').trim().toLowerCase();
  return u === 'imperial' || u === 'us' || u === 'mile' || u === 'miles' || u === 'mi' || u === 'mph';
};

/** Convert stored test pace seconds → display seconds for current unit preference. */
export const paceSecondsToDisplaySeconds = (
  seconds,
  { sport = 'run', unitSystem = 'metric', testRunPerMileStorage = false } = {},
) => {
  if (seconds == null || !Number.isFinite(Number(seconds))) return seconds;
  const s = Number(seconds);
  const displayImperial = unitSystem === 'imperial';
  const sp = String(sport || '').toLowerCase();
  if (sp.includes('swim')) {
    if (!displayImperial) return s;
    return s * M_PER_YARD;
  }
  if (displayImperial && !testRunPerMileStorage) return s * KM_PER_MILE;
  if (!displayImperial && testRunPerMileStorage) return s / KM_PER_MILE;
  return s;
};

/** Format stored test/interval pace (sec/km or sec/mile) for the user's units. */
export const formatStoredPaceSeconds = (seconds, user, sport = 'run', testData = null) => {
  const unitSystem = resolveDistanceUnitSystem(user);
  const testRunPerMileStorage = testData ? testRunPaceStoredPerMile(testData, sport) : false;
  const displaySec = paceSecondsToDisplaySeconds(seconds, { sport, unitSystem, testRunPerMileStorage });
  return formatPaceSeconds(displaySec, unitSystem, sport);
};

const parsePaceMMSS = (str) => {
  const m = String(str ?? '').match(/^(\d+):(\d{2})$/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
};

/** Convert zone pace strings (from calculateZonesFromTest) to user's display units. */
export const formatZonesPaceForUser = (zones, test, user, sport = 'run') => {
  if (!zones?.pace) return zones;
  const unitSystem = resolveDistanceUnitSystem(user);
  const testRunPerMileStorage = test ? testRunPaceStoredPerMile(test, sport) : false;
  const convert = (str) => {
    const sec = parsePaceMMSS(str);
    if (sec == null) return str;
    const displaySec = paceSecondsToDisplaySeconds(sec, { sport, unitSystem, testRunPerMileStorage });
    return formatPaceMMSS(displaySec) || str;
  };
  const pace = {};
  for (const [k, v] of Object.entries(zones.pace)) {
    pace[k] = { min: convert(v.min), max: convert(v.max) };
  }
  return { ...zones, pace };
};

/** Activity row: pace for run/swim, watts for bike. */
export const activityPaceOrPowerDisplay = (act, user) => {
  if (!act) return null;
  const unitSystem = resolveDistanceUnitSystem(user);
  const dur = Number(
    act.movingTime || act.moving_time || act.duration
    || act.elapsed_time || act.elapsedTime || act.totalTimerTime || act.totalTime || act.totalElapsedTime || 0,
  );
  const dist = Number(act.distance || act.totalDistance || 0);
  const power = Number(
    act.normalizedPower || act.avgPower || act.average_watts || act.averagePower || 0,
  );
  const avgSpeed = Number(act.avgSpeed || act.average_speed || 0);
  const sport = act.sport || act.type || '';
  const s = String(sport).toLowerCase();
  const isSwim = s.includes('swim');
  const isRun = s.includes('run') || s.includes('hike') || s.includes('walk') || s.includes('trail');
  const isBike = s.includes('ride') || s.includes('cycle') || s.includes('bike') || s.includes('virtual');

  if (isBike && power > 0) return `${Math.round(power)} W`;
  if (isSwim || isRun) {
    if (avgSpeed > 0) return formatPaceFromSpeedMps(avgSpeed, unitSystem, sport);
    if (dist > 0 && dur > 0) return formatPaceFromDistanceAndDuration(dist, dur, unitSystem, sport);
  }
  return null;
};

export const formatActivityDistance = (meters, user) => {
  if (!meters) return null;
  const unitSystem = resolveDistanceUnitSystem(user);
  return formatDistance(meters, unitSystem).formatted;
};

/**
 * Format height using user object
 */
export const formatHeightForUser = (cm, user) => {
  const sys = resolveDistanceUnitSystem(user);
  return formatHeight(cm, sys);
};

/**
 * Format temperature using user object
 */
export const formatTemperatureForUser = (celsius, user) => {
  const units = getUserUnits(user);
  return formatTemperature(celsius, units.temperature || 'celsius');
};

/**
 * Get pace unit string using user object
 */
export const paceUnitForUser = (user, sport = 'running') => {
  const sys = resolveDistanceUnitSystem(user);
  return paceUnit(sys, sport);
};

/**
 * Get the user's running pace display preference.
 * @param {Object} user - User object from AuthProvider
 * @returns {'minpkm'|'kmh'} - 'minpkm' (min/km pace format) or 'kmh' (speed format)
 */
export const getPaceDisplay = (user) =>
  user?.trainingPreferences?.paceDisplay || 'minpkm';

/**
 * Format a running pace (stored as seconds per km) using the user's display preference.
 * If paceDisplay === 'kmh'  → "XX.X km/h"
 * If paceDisplay === 'minpkm' (default) → "MM:SS/km"
 *
 * @param {number} secPerKm - Pace in seconds per km (e.g. 240 = 4:00/km)
 * @param {Object} user     - User object from AuthProvider (for preference)
 * @returns {string}
 */
export const formatRunPace = (secPerKm, user) => {
  if (!secPerKm || secPerKm <= 0) return '—';
  const unitSystem = resolveDistanceUnitSystem(user);
  if (getPaceDisplay(user) === 'kmh') {
    const kmh = 3600 / secPerKm;
    if (unitSystem === 'imperial') {
      return `${(kmh * KM_TO_MILES).toFixed(1)} mph`;
    }
    return `${kmh.toFixed(1)} km/h`;
  }
  const displaySec = paceSecondsToDisplaySeconds(secPerKm, {
    sport: 'run',
    unitSystem,
    testRunPerMileStorage: false,
  });
  return formatPaceSeconds(displaySec, unitSystem, 'run');
};

/**
 * Returns the unit label for the user's running pace display preference.
 * @param {Object} user
 * @returns {string} e.g. "min/km" or "km/h"
 */
export const runPaceUnit = (user) => {
  if (getPaceDisplay(user) === 'kmh') {
    return resolveDistanceUnitSystem(user) === 'imperial' ? 'mph' : 'km/h';
  }
  return paceUnit(resolveDistanceUnitSystem(user), 'run');
};

