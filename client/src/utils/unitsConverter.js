/**
 * Utility functions for converting between metric and imperial units
 * Uses user's units preference from profile
 */

// Conversion constants
const KM_TO_MILES = 0.621371;
const KG_TO_LBS = 2.20462;
const LBS_TO_KG = 0.453592;
const METERS_TO_FEET = 3.28084;

/**
 * Get user's units preference from user object or localStorage
 * @param {Object} user - User object from AuthProvider
 * @returns {Object} Units object with distance, weight, temperature
 */
export const getUserUnits = (user) => {
  if (user?.units) {
    return user.units;
  }
  
  // Fallback to localStorage
  try {
    const saved = localStorage.getItem('userUnits');
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.error('Error loading units from localStorage:', e);
  }
  
  // Default to metric
  return {
    distance: 'metric',
    weight: 'kg',
    temperature: 'celsius'
  };
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
    // Metric
    const km = meters / 1000;
    if (km < 1) {
      return { value: meters, unit: 'm', formatted: `${Math.round(meters)} m` };
    }
    return { value: km, unit: 'km', formatted: `${km.toFixed(2)} km` };
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

