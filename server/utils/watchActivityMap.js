/**
 * Turn Polar AccessLink and COROS Open API workout payloads into the
 * summary shape the calendar already understands (sport, start, duration,
 * distance, heart rate). Pure functions — no HTTP, no database.
 */

const SPORT_LABEL = {
  running: 'Run',
  cycling: 'Ride',
  swimming: 'Swim',
  hiking: 'Hike',
  strength: 'Strength',
  skiing: 'Ski',
  other: 'Workout',
};

/** COROS Open API `mode` codes. Unknown modes fall through to the name. */
const COROS_MODE = {
  8: 'running',
  9: 'running',
  10: 'cycling',
  11: 'cycling',
  13: 'swimming',
  14: 'swimming',
  15: 'other',
  16: 'hiking',
  18: 'running',
  19: 'hiking',
  20: 'strength',
  21: 'strength',
  22: 'skiing',
  23: 'skiing',
  24: 'skiing',
  31: 'hiking',
};

function pick(obj, ...keys) {
  if (!obj || typeof obj !== 'object') return null;
  for (const key of keys) {
    if (obj[key] != null && obj[key] !== '') return obj[key];
  }
  return null;
}

function finiteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Polar durations arrive as ISO-8601 (`PT2H44M45S`). A plain number of
 * seconds is accepted too, because some payloads already converted it.
 */
function parseIsoDuration(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 0 ? Math.round(value) : null;
  }
  const text = String(value).trim();
  if (/^\d+(\.\d+)?$/.test(text)) {
    const n = Number(text);
    return n > 0 ? Math.round(n) : null;
  }
  const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i.exec(text);
  if (!match) return null;
  const total = Number(match[1] || 0) * 86400
    + Number(match[2] || 0) * 3600
    + Number(match[3] || 0) * 60
    + Number(match[4] || 0);
  return total > 0 ? Math.round(total) : null;
}

/**
 * Polar `start_time` is the watch's wall clock, not UTC. The offset is
 * minutes east of UTC. A string that already carries a zone is left alone.
 */
function polarStartToUtc(ex) {
  const raw = pick(ex, 'start_time', 'start-time');
  if (!raw) return null;
  const text = String(raw).trim();
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(text);
  const ms = Date.parse(hasZone ? text : `${text}Z`);
  if (!Number.isFinite(ms)) return null;
  if (hasZone) return new Date(ms);
  const offsetMin = finiteNumber(pick(ex, 'start_time_utc_offset', 'start-time-utc-offset')) || 0;
  return new Date(ms - offsetMin * 60000);
}

function sportFromWords(blob) {
  const s = String(blob || '').toUpperCase();
  if (!s.trim()) return 'other';
  if (/SWIM/.test(s)) return 'swimming';
  if (/BIKE|CYCL|SPIN/.test(s)) return 'cycling';
  if (/SKI|SNOWBOARD/.test(s)) return 'skiing';
  if (/STRENGTH|WEIGHT|GYM|CROSSFIT/.test(s)) return 'strength';
  if (/HIKE|WALK|CLIMB/.test(s)) return 'hiking';
  if (/RUN|JOG|TRAIL/.test(s)) return 'running';
  return 'other';
}

function polarSport(ex) {
  return sportFromWords([
    pick(ex, 'detailed_sport_info', 'detailed-sport-info'),
    pick(ex, 'sport'),
  ].filter(Boolean).join(' '));
}

function namedSport(sport, device) {
  const label = SPORT_LABEL[sport] || SPORT_LABEL.other;
  const extra = device ? String(device).trim() : '';
  return extra ? `${label} · ${extra}` : label;
}

function heartRateAverage(ex) {
  const block = pick(ex, 'heart_rate', 'heart-rate');
  const fromBlock = block && typeof block === 'object'
    ? finiteNumber(block.average ?? block.avg)
    : null;
  const direct = finiteNumber(pick(ex, 'avgHeartRate', 'avgHr', 'averageHeartRate'));
  const hr = fromBlock ?? direct;
  return hr != null && hr > 0 && hr < 250 ? Math.round(hr) : null;
}

function mapPolarExercise(ex) {
  const id = pick(ex, 'id');
  if (id == null) return null;
  const startDate = polarStartToUtc(ex);
  if (!startDate) return null;
  const sport = polarSport(ex);
  const elapsed = parseIsoDuration(pick(ex, 'duration'));
  const distance = finiteNumber(pick(ex, 'distance'));
  const metres = distance != null && distance > 0 ? distance : null;
  return {
    watchId: String(id),
    source: 'polar',
    name: namedSport(sport, pick(ex, 'device')),
    sport,
    startDate,
    elapsedTime: elapsed,
    movingTime: elapsed,
    distance: metres,
    averageSpeed: metres && elapsed ? metres / elapsed : null,
    averageHeartRate: heartRateAverage(ex),
    averagePower: null,
    calories: finiteNumber(pick(ex, 'calories')),
  };
}

function corosSport(row) {
  const mode = finiteNumber(row?.mode);
  if (mode != null && COROS_MODE[mode]) return COROS_MODE[mode];
  return sportFromWords(pick(row, 'name', 'sportName', 'sport'));
}

function corosStart(row) {
  const raw = finiteNumber(pick(row, 'startTime', 'start_time'));
  if (raw == null || raw <= 0) return null;
  const ms = raw > 1e12 ? raw : raw * 1000;
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? null : date;
}

function corosDuration(row, start) {
  const direct = finiteNumber(pick(row, 'duration', 'workoutTime', 'totalTime'));
  if (direct != null && direct > 0) return Math.round(direct);
  const end = finiteNumber(pick(row, 'endTime', 'end_time'));
  const startSec = finiteNumber(pick(row, 'startTime', 'start_time'));
  if (end != null && startSec != null && end > startSec) {
    const span = end - startSec;
    return span > 1e9 ? Math.round(span / 1000) : Math.round(span);
  }
  return start ? null : null;
}

function mapCorosWorkout(row) {
  const id = pick(row, 'labelId', 'label_id', 'id');
  if (id == null) return null;
  const startDate = corosStart(row);
  if (!startDate) return null;
  const sport = corosSport(row);
  const elapsed = corosDuration(row, startDate);
  const distance = finiteNumber(pick(row, 'distance'));
  const metres = distance != null && distance > 0 ? distance : null;
  const givenName = pick(row, 'name');
  const power = finiteNumber(pick(row, 'avgPower', 'avg_power'));
  let calories = finiteNumber(pick(row, 'calorie', 'calories'));
  // The unofficial Training Hub payload reports millicalories.
  if (calories != null && calories > 20000) calories = Math.round(calories / 1000);
  return {
    watchId: String(id),
    source: 'coros',
    name: givenName ? String(givenName) : namedSport(sport, null),
    sport,
    startDate,
    elapsedTime: elapsed,
    movingTime: elapsed,
    distance: metres,
    averageSpeed: metres && elapsed ? metres / elapsed : null,
    averageHeartRate: heartRateAverage(row),
    averagePower: power != null && power > 0 && power < 3000 ? Math.round(power) : null,
    calories: calories != null && calories > 0 ? Math.round(calories) : null,
  };
}

/** YYYYMMDD in UTC, used as the COROS sport-list window. */
function formatYmd(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

/**
 * COROS accepts at most about 30 days per sport-list call. Walk backwards
 * from `until` in windows of `windowDays`.
 */
function dateWindows(until, days, windowDays = 30) {
  const end = new Date(until);
  const startLimit = new Date(end.getTime() - days * 86400000);
  const windows = [];
  let cursorEnd = end;
  while (cursorEnd > startLimit && windows.length < 24) {
    const cursorStart = new Date(Math.max(startLimit.getTime(), cursorEnd.getTime() - windowDays * 86400000));
    windows.push({ startDate: formatYmd(cursorStart), endDate: formatYmd(cursorEnd) });
    if (cursorStart.getTime() <= startLimit.getTime()) break;
    cursorEnd = new Date(cursorStart.getTime() - 86400000);
  }
  return windows;
}

function corosRows(body) {
  if (!body) return [];
  if (Array.isArray(body)) return body;
  const data = body.data != null ? body.data : body;
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.dataList)) return data.dataList;
  if (Array.isArray(data?.sportDataList)) return data.sportDataList;
  return [];
}

function polarRows(body) {
  if (!body) return [];
  if (Array.isArray(body)) return body;
  if (Array.isArray(body.exercises)) return body.exercises;
  return [];
}

module.exports = {
  parseIsoDuration,
  polarStartToUtc,
  mapPolarExercise,
  mapCorosWorkout,
  formatYmd,
  dateWindows,
  corosRows,
  polarRows,
  SPORT_LABEL,
};
