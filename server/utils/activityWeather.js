/**
 * What the weather was doing while you trained.
 *
 * Heat, wind and rain move a session more than most training decisions do, and
 * an athlete comparing two rides is usually comparing the weather without
 * knowing it. This looks the conditions up once, from the activity's own GPS
 * and start time, and freezes them — see models/ActivityWeather.js for why.
 *
 * Open-Meteo needs no API key and asks for no attribution beyond its licence,
 * which is why it is used here rather than a provider that would put a secret
 * in the deploy config for a nice-to-have.
 */

'use strict';

const ActivityWeather = require('../models/ActivityWeather');
const StravaActivity = require('../models/StravaActivity');
const StravaStream = require('../models/StravaStream');
const FitTraining = require('../models/fitTraining');

/** WMO weather codes → plain English. */
const WMO = {
  0: 'Clear', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
  45: 'Fog', 48: 'Freezing fog',
  51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle',
  56: 'Freezing drizzle', 57: 'Freezing drizzle',
  61: 'Light rain', 63: 'Rain', 65: 'Heavy rain',
  66: 'Freezing rain', 67: 'Freezing rain',
  71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 77: 'Snow grains',
  80: 'Rain showers', 81: 'Rain showers', 82: 'Violent rain showers',
  85: 'Snow showers', 86: 'Heavy snow showers',
  95: 'Thunderstorm', 96: 'Thunderstorm with hail', 99: 'Thunderstorm with hail',
};

/** Open-Meteo's forecast endpoint carries ~3 months of past days; older needs the archive. */
const PAST_DAYS_LIMIT = 90;

function describe(code) {
  return WMO[Number(code)] || null;
}

function dayKey(date) {
  const d = new Date(date);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

async function getJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'LaChart/1.0' } });
  if (!res.ok) throw new Error(`${res.status} from ${new URL(url).host}`);
  return res.json();
}

/** Nearest hourly reading to the activity's start. */
function pickHour(hourly, when) {
  const times = hourly?.time || [];
  if (!times.length) return null;
  const target = new Date(when).getTime();
  let best = 0;
  let bestGap = Infinity;
  for (let i = 0; i < times.length; i += 1) {
    const gap = Math.abs(new Date(times[i]).getTime() - target);
    if (gap < bestGap) { bestGap = gap; best = i; }
  }
  // More than three hours away is not this session's weather.
  if (bestGap > 3 * 3600 * 1000) return null;
  const at = (key) => {
    const v = hourly[key]?.[best];
    return Number.isFinite(Number(v)) ? Number(v) : null;
  };
  return {
    tempC: at('temperature_2m'),
    apparentC: at('apparent_temperature'),
    humidityPct: at('relative_humidity_2m'),
    windKph: at('wind_speed_10m'),
    windDirDeg: at('wind_direction_10m'),
    precipitationMm: at('precipitation'),
    code: at('weather_code'),
  };
}

async function fetchWeather(lat, lng, when) {
  const hourly = 'temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,wind_direction_10m,precipitation,weather_code';
  const day = dayKey(when);
  const ageDays = (Date.now() - new Date(when).getTime()) / 86400000;

  const base = ageDays > PAST_DAYS_LIMIT
    ? 'https://archive-api.open-meteo.com/v1/archive'
    : 'https://api.open-meteo.com/v1/forecast';

  const url = `${base}?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}`
    + `&hourly=${hourly}&start_date=${day}&end_date=${day}&timezone=UTC&wind_speed_unit=kmh`;

  const data = await getJson(url);
  return pickHour(data.hourly, when);
}

/**
 * Reverse geocode to a place name. Best-effort: a missing name is fine, a wrong
 * one is not, so any failure returns null rather than something approximate.
 */
async function fetchPlace(lat, lng) {
  try {
    const data = await getJson(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}&localityLanguage=en`,
    );
    return data.city || data.locality || data.principalSubdivision || null;
  } catch {
    return null;
  }
}

/** Where and when an activity happened, from whichever source it came from. */
async function locateActivity(userId, activityKey) {
  const key = String(activityKey || '');
  const stravaId = key.startsWith('strava-') ? key.slice(7) : null;
  const fitId = key.startsWith('fit-') ? key.slice(4) : null;

  if (stravaId) {
    const act = await StravaActivity.findOne({ userId, stravaId }).select('startDate').lean();
    if (!act) return null;
    const stream = await StravaStream.findOne({ userId, stravaId }).select('streams.latlng').lean();
    const first = (stream?.streams?.latlng || []).find(
      (p) => Array.isArray(p) && Number.isFinite(p[0]) && !(p[0] === 0 && p[1] === 0),
    );
    if (!first) return { when: act.startDate, lat: null, lng: null };
    return { when: act.startDate, lat: Number(first[0]), lng: Number(first[1]) };
  }

  if (fitId) {
    const fit = await FitTraining.findById(fitId).select('timestamp records').lean();
    if (!fit) return null;
    const rec = (fit.records || []).find(
      (r) => Number.isFinite(Number(r?.positionLat)) && Number.isFinite(Number(r?.positionLong)),
    );
    if (!rec) return { when: fit.timestamp, lat: null, lng: null };
    return { when: fit.timestamp, lat: Number(rec.positionLat), lng: Number(rec.positionLong) };
  }

  return null;
}

/**
 * Weather for one activity, from cache when it has been looked up before.
 *
 * @returns {Promise<object|null>} null when the activity has no GPS at all
 */
async function weatherForActivity(userId, activityKey) {
  const cached = await ActivityWeather.findOne({ userId, activityKey }).lean();
  if (cached) return cached.unavailable ? null : cached;

  const located = await locateActivity(userId, activityKey);
  if (!located || located.lat == null || located.lng == null) return null;

  let reading = null;
  let place = null;
  try {
    [reading, place] = await Promise.all([
      fetchWeather(located.lat, located.lng, located.when),
      fetchPlace(located.lat, located.lng),
    ]);
  } catch (err) {
    // A provider outage should not be recorded as "this session had no weather"
    // — leave it uncached so the next view tries again.
    console.warn('[weather] lookup failed:', err.message);
    return null;
  }

  const doc = {
    userId,
    activityKey,
    lat: located.lat,
    lng: located.lng,
    place,
    observedAt: located.when,
    fetchedAt: new Date(),
    unavailable: !reading,
    ...(reading || {}),
    description: reading ? describe(reading.code) : null,
  };

  await ActivityWeather.findOneAndUpdate(
    { userId, activityKey },
    doc,
    { upsert: true, new: true },
  );

  return reading ? doc : null;
}

module.exports = { weatherForActivity, describe, WMO };
