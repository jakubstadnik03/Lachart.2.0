/**
 * Pack per-second activity streams into typed binary buffers.
 *
 * WHY: a stored stream document averaged 318 KB, and 83% of the database was
 * these documents. Almost none of that was data. A BSON array pays, per
 * element, a type byte, the array index rendered as a decimal string, and a
 * terminating null — so a heart rate of 142 costs about ten bytes to store four
 * bytes of number. At ~3,500 samples an activity, across eight channels, the
 * overhead was most of the document.
 *
 * The samples themselves are small and regular: heart rate, power and cadence
 * are integers under 2,500; altitude and distance are one-decimal floats;
 * coordinates are degrees. Each channel gets the narrowest type that holds it
 * without loss, laid out as one contiguous Buffer. Same numbers, same
 * resolution, roughly a third of the bytes — and the saving lands on disk, on
 * the oplog, on the backup and on every byte read out of Atlas.
 *
 * NOT downsampling. Every sample survives: activityPeaks computes 5, 10, 12,
 * 20 and 30-second peak power, so thinning the series would quietly corrupt the
 * numbers an athlete trains on.
 *
 * Unknown channels are passed through untouched rather than dropped — a codec
 * that silently loses a channel Strava adds later is worse than one that stores
 * it inefficiently.
 */

'use strict';

/** Sentinels for a missing sample, one per storage type. */
const NULL_I16 = -32768;
const NULL_I32 = -2147483648;
const LATLNG_SCALE = 1e7; // ~1.1 cm; ±180° fits Int32 with room to spare

/**
 * How each known channel is stored. Anything absent from this map is passed
 * through as-is.
 */
const CHANNEL_TYPES = {
  time: 'i32',
  heartrate: 'i16',
  watts: 'i16',
  cadence: 'i16',
  temp: 'i16',
  altitude: 'f32',
  distance: 'f32',
  velocity_smooth: 'f32',
  grade_smooth: 'f32',
  latlng: 'll',
  moving: 'u8',
};

const isNil = (v) => v === null || v === undefined || (typeof v === 'number' && Number.isNaN(v));

/** Read one channel out of a stored streams object, whichever shape it is in. */
function seriesOf(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.data)) return value.data;
  return null;
}

function encodeChannel(type, series) {
  const n = series.length;
  switch (type) {
    case 'i16': {
      const b = Buffer.allocUnsafe(n * 2);
      for (let i = 0; i < n; i++) {
        const v = series[i];
        b.writeInt16LE(isNil(v) ? NULL_I16 : Math.max(-32767, Math.min(32767, Math.round(Number(v)))), i * 2);
      }
      return b;
    }
    case 'i32': {
      const b = Buffer.allocUnsafe(n * 4);
      for (let i = 0; i < n; i++) {
        const v = series[i];
        b.writeInt32LE(isNil(v) ? NULL_I32 : Math.round(Number(v)), i * 4);
      }
      return b;
    }
    case 'u8': {
      const b = Buffer.allocUnsafe(n);
      for (let i = 0; i < n; i++) {
        const v = series[i];
        b[i] = isNil(v) ? 255 : (v ? 1 : 0);
      }
      return b;
    }
    case 'f32': {
      const b = Buffer.allocUnsafe(n * 4);
      for (let i = 0; i < n; i++) {
        const v = series[i];
        // NaN is the null: Float32 round-trips it, and no real sample is NaN.
        b.writeFloatLE(isNil(v) ? NaN : Number(v), i * 4);
      }
      return b;
    }
    case 'll': {
      const b = Buffer.allocUnsafe(n * 8);
      for (let i = 0; i < n; i++) {
        const p = series[i];
        if (!Array.isArray(p) || isNil(p[0]) || isNil(p[1])) {
          b.writeInt32LE(NULL_I32, i * 8);
          b.writeInt32LE(NULL_I32, i * 8 + 4);
        } else {
          b.writeInt32LE(Math.round(Number(p[0]) * LATLNG_SCALE), i * 8);
          b.writeInt32LE(Math.round(Number(p[1]) * LATLNG_SCALE), i * 8 + 4);
        }
      }
      return b;
    }
    default:
      return null;
  }
}

function decodeChannel(type, buf, n) {
  const out = new Array(n);
  switch (type) {
    case 'i16':
      for (let i = 0; i < n; i++) { const v = buf.readInt16LE(i * 2); out[i] = v === NULL_I16 ? null : v; }
      return out;
    case 'i32':
      for (let i = 0; i < n; i++) { const v = buf.readInt32LE(i * 4); out[i] = v === NULL_I32 ? null : v; }
      return out;
    case 'u8':
      for (let i = 0; i < n; i++) { const v = buf[i]; out[i] = v === 255 ? null : Boolean(v); }
      return out;
    case 'f32':
      for (let i = 0; i < n; i++) { const v = buf.readFloatLE(i * 4); out[i] = Number.isNaN(v) ? null : v; }
      return out;
    case 'll':
      for (let i = 0; i < n; i++) {
        const a = buf.readInt32LE(i * 8);
        const b = buf.readInt32LE(i * 8 + 4);
        out[i] = a === NULL_I32 ? null : [a / LATLNG_SCALE, b / LATLNG_SCALE];
      }
      return out;
    default:
      return out.fill(null);
  }
}

/**
 * @param {object} streams  stored shape: { heartrate: [...] } or { heartrate: { data: [...] } }
 * @returns {object|null}   packed representation, or null if there is nothing to pack
 */
function packStreams(streams) {
  if (!streams || typeof streams !== 'object') return null;

  const channels = {};
  const passthrough = {};
  let n = 0;

  for (const [key, value] of Object.entries(streams)) {
    const series = seriesOf(value);
    if (!series) { passthrough[key] = value; continue; }
    const type = CHANNEL_TYPES[key];
    if (!type) { passthrough[key] = series; continue; }
    n = Math.max(n, series.length);
  }
  if (!n) return Object.keys(passthrough).length ? { v: 1, n: 0, c: {}, x: passthrough } : null;

  for (const [key, value] of Object.entries(streams)) {
    const series = seriesOf(value);
    if (!series) continue;
    const type = CHANNEL_TYPES[key];
    if (!type) continue;

    // Channels of differing length are padded, so one short series cannot
    // silently truncate the rest on the way back out.
    const padded = series.length === n ? series : series.concat(new Array(n - series.length).fill(null));

    // time is very often 0,1,2,… — that costs four bytes a sample to say
    // nothing, so record the shape instead of the numbers.
    if (key === 'time' && padded.every((v, i) => v === i)) {
      channels.time = { t: 'seq' };
      continue;
    }
    channels[key] = { t: type, b: encodeChannel(type, padded) };
  }

  const packed = { v: 1, n, c: channels };
  if (Object.keys(passthrough).length) packed.x = passthrough;
  return packed;
}

/**
 * @param {object} packed
 * @returns {object|null} the plain { key: [...] } shape every reader already handles
 */
function unpackStreams(packed) {
  if (!packed || typeof packed !== 'object' || !packed.c) return null;
  const n = packed.n || 0;
  const out = {};

  for (const [key, spec] of Object.entries(packed.c)) {
    if (spec?.t === 'seq') {
      out[key] = Array.from({ length: n }, (_, i) => i);
      continue;
    }
    // Mongo hands a Binary back rather than a Buffer depending on the driver path.
    const buf = Buffer.isBuffer(spec?.b) ? spec.b : (spec?.b?.buffer ? Buffer.from(spec.b.buffer) : null);
    if (!buf) continue;
    out[key] = decodeChannel(spec.t, buf, n);
  }
  for (const [key, value] of Object.entries(packed.x || {})) out[key] = value;
  return out;
}

module.exports = {
  packStreams,
  unpackStreams,
  CHANNEL_TYPES,
  LATLNG_SCALE,
};
