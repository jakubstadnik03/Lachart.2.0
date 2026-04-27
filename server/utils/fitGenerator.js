'use strict';
/**
 * fitGenerator.js
 * Pure-Node binary FIT file encoder for lactate testing sessions.
 * No external dependencies — writes the ANT+ FIT protocol directly.
 * Compatible with Strava, TrainingPeaks, Intervals.icu, Golden Cheetah.
 *
 * FIT spec: https://developer.garmin.com/fit/protocol/
 */

// FIT epoch: Dec 31 1989 00:00:00 UTC
const FIT_EPOCH_MS = Date.UTC(1989, 11, 31);

function toFitTs(d) {
  const ms = (d instanceof Date ? d : new Date(d)).getTime();
  return Math.max(0, Math.round((ms - FIT_EPOCH_MS) / 1000));
}

/** CRC-16/IBM as required by the FIT protocol */
function crc16(buf, start, end) {
  const T = [0x0000,0xCC01,0xD801,0x1400,0xF001,0x3C00,0x2800,0xE401,
             0xA001,0x6C00,0x7800,0xB401,0x5000,0x9C01,0x8801,0x4400];
  let c = 0;
  for (let i = start; i < end; i++) {
    const b = buf[i];
    let t; t=T[c&0xF]; c=(c>>4)&0x0FFF; c^=t^T[b&0xF];
    t=T[c&0xF]; c=(c>>4)&0x0FFF; c^=t^T[(b>>4)&0xF];
  }
  return c;
}

// Base-type descriptors: { code (in field-def byte), size (bytes) }
const BT = {
  ENUM:    { code: 0x00, size: 1 },
  UINT8:   { code: 0x02, size: 1 },
  UINT16:  { code: 0x84, size: 2 },
  SINT32:  { code: 0x85, size: 4 },
  UINT32:  { code: 0x86, size: 4 },
  UINT32Z: { code: 0x8C, size: 4 },
};
// "Invalid" sentinel values per base type
const INV = {
  ENUM: 0xFF, UINT8: 0xFF,
  UINT16: 0xFFFF,
  SINT32: 0x7FFFFFFF,
  UINT32: 0xFFFFFFFF,
  UINT32Z: 0x00000000,
};

/**
 * Low-level FIT file builder.
 * Usage:
 *   ff.def(localNum, mesgNum, [{num, bt}, ...])  – write definition message
 *   ff.msg(localNum, [v0, v1, ...])              – write data message
 *   ff.toBuffer()                                – get the final binary Buffer
 */
class FitFile {
  constructor() {
    this._bufs = [];
    this._defs = {};
  }

  def(localNum, mesgNum, fields) {
    this._defs[localNum] = fields;
    const n = fields.length;
    const b = Buffer.alloc(6 + n * 3);
    b[0] = 0x40 | (localNum & 0xF); // definition record header
    b[1] = 0; b[2] = 0;             // reserved + little-endian architecture
    b.writeUInt16LE(mesgNum, 3);
    b[5] = n;
    for (let i = 0; i < n; i++) {
      const bt = BT[fields[i].bt];
      b[6 + i*3] = fields[i].num;
      b[7 + i*3] = bt.size;
      b[8 + i*3] = bt.code;
    }
    this._bufs.push(b);
    return this;
  }

  msg(localNum, values) {
    const fields = this._defs[localNum];
    let size = 1;
    for (const f of fields) size += BT[f.bt].size;
    const b = Buffer.alloc(size);
    b[0] = localNum & 0xF; // data record header
    let off = 1;
    for (let i = 0; i < fields.length; i++) {
      const f = fields[i];
      const bt = BT[f.bt];
      const raw = values[i];
      const invalid = raw === null || raw === undefined ||
                      (typeof raw === 'number' && (isNaN(raw) || !isFinite(raw)));
      let v = invalid ? INV[f.bt] : Math.round(raw);
      // clamp to unsigned range for UINT types so we don't write -1 etc.
      if (!invalid && v < 0 && f.bt !== 'SINT32') v = 0;

      if (bt.size === 1) b.writeUInt8(v & 0xFF, off);
      else if (bt.size === 2) b.writeUInt16LE(v & 0xFFFF, off);
      else if (f.bt === 'SINT32') b.writeInt32LE(v, off);
      else b.writeUInt32LE(v >>> 0, off);
      off += bt.size;
    }
    this._bufs.push(b);
    return this;
  }

  toBuffer() {
    const data = Buffer.concat(this._bufs);
    // 14-byte file header
    const hdr = Buffer.alloc(14);
    hdr[0] = 14;         // header size
    hdr[1] = 0x20;       // protocol version 2.0
    hdr.writeUInt16LE(2132, 2);         // profile version 21.32
    hdr.writeUInt32LE(data.length, 4); // data size
    hdr.write('.FIT', 8, 'ascii');
    hdr.writeUInt16LE(crc16(hdr, 0, 12), 12); // header CRC
    const body = Buffer.concat([hdr, data]);
    const fileCrcBuf = Buffer.alloc(2);
    fileCrcBuf.writeUInt16LE(crc16(body, 0, body.length), 0);
    return Buffer.concat([body, fileCrcBuf]);
  }
}

// Sport enum values (FIT profile)
const SPORT = { cycling: 2, running: 1, swimming: 5, generic: 0 };

/**
 * Generate a binary .fit buffer from a LactateSession document.
 *
 * Expected shape of session.fitFile.fitData:
 *   records: [{ timestamp, power, heartRate, cadence, speed, step, totalTime }]
 *   laps:    [{ lapNumber, totalElapsedTime, avgPower, avgHeartRate, maxPower, lactate }]
 *
 * Falls back to synthesising data from session.measurements[] if fitData is absent.
 *
 * @param {Object} session  Plain LactateSession object
 * @returns {Buffer}        Binary FIT file ready for download
 */
function generateFitFile(session) {
  const fitData  = session.fitFile?.fitData || {};
  const records  = Array.isArray(fitData.records) ? fitData.records : [];
  const lapsMeta = Array.isArray(fitData.laps)    ? fitData.laps    : [];

  // If no live-recorded data, synthesise from stored measurements
  if (records.length === 0) {
    return _synthesiseFromMeasurements(session);
  }

  const sport =
    session.sport === 'run'  ? SPORT.running  :
    session.sport === 'swim' ? SPORT.swimming : SPORT.cycling;

  const startDate = new Date(records[0].timestamp);
  const endDate   = new Date(records[records.length - 1].timestamp);
  const startTs   = toFitTs(startDate);
  const endTs     = toFitTs(endDate);
  const totalSec  = endTs - startTs;

  const ff = new FitFile();

  // ── file_id (mesgNum 0) ─────────────────────────────────────
  ff.def(0, 0, [
    { num: 0, bt: 'ENUM'   }, // type: activity = 4
    { num: 1, bt: 'UINT16' }, // manufacturer: development = 255
    { num: 2, bt: 'UINT16' }, // product
    { num: 4, bt: 'UINT32' }, // time_created
  ]).msg(0, [4, 255, 0, startTs]);

  // ── event – timer start (mesgNum 21) ───────────────────────
  ff.def(1, 21, [
    { num: 253, bt: 'UINT32' }, // timestamp
    { num: 0,   bt: 'ENUM'   }, // event:      timer = 0
    { num: 1,   bt: 'ENUM'   }, // event_type: start = 0
    { num: 3,   bt: 'UINT32' }, // data
  ]).msg(1, [startTs, 0, 0, 0]);

  // ── record (mesgNum 20) ─────────────────────────────────────
  ff.def(2, 20, [
    { num: 253, bt: 'UINT32' }, // timestamp
    { num: 3,   bt: 'UINT8'  }, // heart_rate      (bpm)
    { num: 4,   bt: 'UINT8'  }, // cadence         (rpm)
    { num: 6,   bt: 'UINT16' }, // speed           (mm/s, scale ×1000)
    { num: 7,   bt: 'UINT16' }, // power           (W)
  ]);

  for (const r of records) {
    const ts  = toFitTs(new Date(r.timestamp));
    const spd = typeof r.speed === 'number' && r.speed > 0 ? r.speed : null;
    ff.msg(2, [
      ts,
      (r.heartRate > 0) ? r.heartRate : null,
      (r.cadence   > 0) ? r.cadence   : null,
      spd !== null      ? Math.round(spd * 1000) : null,
      (r.power     > 0) ? r.power     : null,
    ]);
  }

  // ── lap (mesgNum 19) ────────────────────────────────────────
  ff.def(3, 19, [
    { num: 254, bt: 'UINT16' }, // message_index
    { num: 253, bt: 'UINT32' }, // timestamp    (lap end)
    { num: 2,   bt: 'UINT32' }, // start_time
    { num: 7,   bt: 'UINT32' }, // total_elapsed_time (ms)
    { num: 15,  bt: 'UINT8'  }, // avg_heart_rate
    { num: 16,  bt: 'UINT8'  }, // max_heart_rate
    { num: 19,  bt: 'UINT16' }, // avg_power
    { num: 20,  bt: 'UINT16' }, // max_power
    { num: 24,  bt: 'ENUM'   }, // lap_trigger: manual = 9
    { num: 25,  bt: 'ENUM'   }, // sport
    { num: 0,   bt: 'ENUM'   }, // event:      lap = 9
    { num: 1,   bt: 'ENUM'   }, // event_type: stop = 1
  ]);

  // Build lap start-times from records (using step index)
  // Fall back to accumulating durations from startTs
  const stepStartTs = {};
  for (const r of records) {
    const s = r.step ?? 0;
    const ts = toFitTs(new Date(r.timestamp));
    if (stepStartTs[s] === undefined || ts < stepStartTs[s]) stepStartTs[s] = ts;
  }

  let lapCursor = startTs;
  for (let i = 0; i < lapsMeta.length; i++) {
    const lap      = lapsMeta[i];
    const duration = Math.max(1, Math.round(lap.totalElapsedTime || 300));
    const lapStart = stepStartTs[i] ?? lapCursor;
    const lapEnd   = lapStart + duration;
    lapCursor      = lapEnd;

    ff.msg(3, [
      i,
      lapEnd,
      lapStart,
      duration * 1000,            // total_elapsed_time in ms (FIT scale)
      lap.avgHeartRate || null,
      lap.maxHeartRate || null,
      lap.avgPower     || null,
      lap.maxPower     || null,
      9,     // lap_trigger: manual
      sport,
      9,     // event: lap
      1,     // event_type: stop
    ]);
  }

  // ── event – timer stop ─────────────────────────────────────
  ff.msg(1, [endTs, 0, 4, 0]); // event_type: stop_all = 4

  // ── session (mesgNum 18) ────────────────────────────────────
  const pwrRecs  = records.filter(r => r.power     > 0);
  const hrRecs   = records.filter(r => r.heartRate > 0);
  const avgPower = pwrRecs.length ? Math.round(pwrRecs.reduce((s,r)=>s+r.power,0)    / pwrRecs.length) : null;
  const maxPower = pwrRecs.length ? Math.round(Math.max(...pwrRecs.map(r=>r.power)))                   : null;
  const avgHR    = hrRecs.length  ? Math.round(hrRecs.reduce((s,r)=>s+r.heartRate,0) / hrRecs.length)  : null;
  const maxHR    = hrRecs.length  ? Math.round(Math.max(...hrRecs.map(r=>r.heartRate)))                 : null;

  ff.def(4, 18, [
    { num: 254, bt: 'UINT16' }, // message_index
    { num: 253, bt: 'UINT32' }, // timestamp
    { num: 2,   bt: 'UINT32' }, // start_time
    { num: 7,   bt: 'UINT32' }, // total_elapsed_time (ms)
    { num: 15,  bt: 'UINT8'  }, // avg_heart_rate
    { num: 16,  bt: 'UINT8'  }, // max_heart_rate
    { num: 20,  bt: 'UINT16' }, // avg_power
    { num: 21,  bt: 'UINT16' }, // max_power
    { num: 25,  bt: 'ENUM'   }, // sport
    { num: 26,  bt: 'ENUM'   }, // sub_sport: generic = 0
    { num: 27,  bt: 'UINT16' }, // num_laps (field 27 on session mesg)
    { num: 0,   bt: 'ENUM'   }, // event:      session = 8
    { num: 1,   bt: 'ENUM'   }, // event_type: stop = 1
  ]).msg(4, [
    0, endTs, startTs,
    totalSec * 1000,
    avgHR, maxHR, avgPower, maxPower,
    sport, 0,
    lapsMeta.length,
    8, 1,
  ]);

  // ── activity (mesgNum 34) ───────────────────────────────────
  ff.def(5, 34, [
    { num: 253, bt: 'UINT32' }, // timestamp
    { num: 0,   bt: 'UINT32' }, // total_timer_time (ms)
    { num: 1,   bt: 'UINT16' }, // num_sessions
    { num: 2,   bt: 'ENUM'   }, // type:       manual = 0
    { num: 3,   bt: 'ENUM'   }, // event:      activity = 26
    { num: 4,   bt: 'ENUM'   }, // event_type: stop = 1
  ]).msg(5, [endTs, totalSec * 1000, 1, 0, 26, 1]);

  return ff.toBuffer();
}

/**
 * Fallback path: no live second-by-second records were saved.
 * Synthesises a FIT file from session.measurements[] (one per interval).
 */
function _synthesiseFromMeasurements(session) {
  const measurements = Array.isArray(session.measurements) ? session.measurements : [];
  const sport =
    session.sport === 'run'  ? SPORT.running  :
    session.sport === 'swim' ? SPORT.swimming : SPORT.cycling;

  const STEP_S = 300; // default 5-minute step if no duration recorded
  const startDate = new Date(session.startedAt || Date.now() - measurements.length * STEP_S * 1000);
  let cursor = toFitTs(startDate);

  const ff = new FitFile();

  ff.def(0, 0, [
    { num: 0, bt: 'ENUM'   },
    { num: 1, bt: 'UINT16' },
    { num: 4, bt: 'UINT32' },
  ]).msg(0, [4, 255, cursor]);

  ff.def(1, 21, [
    { num: 253, bt: 'UINT32' },
    { num: 0,   bt: 'ENUM'   },
    { num: 1,   bt: 'ENUM'   },
    { num: 3,   bt: 'UINT32' },
  ]).msg(1, [cursor, 0, 0, 0]);

  ff.def(2, 20, [
    { num: 253, bt: 'UINT32' },
    { num: 3,   bt: 'UINT8'  },
    { num: 4,   bt: 'UINT8'  },
    { num: 7,   bt: 'UINT16' },
  ]);

  ff.def(3, 19, [
    { num: 254, bt: 'UINT16' },
    { num: 253, bt: 'UINT32' },
    { num: 2,   bt: 'UINT32' },
    { num: 7,   bt: 'UINT32' },
    { num: 15,  bt: 'UINT8'  },
    { num: 19,  bt: 'UINT16' },
    { num: 24,  bt: 'ENUM'   },
    { num: 25,  bt: 'ENUM'   },
    { num: 0,   bt: 'ENUM'   },
    { num: 1,   bt: 'ENUM'   },
  ]);

  for (let i = 0; i < measurements.length; i++) {
    const m   = measurements[i];
    const dur = m.stepDuration || STEP_S;
    const lapStart = cursor;
    // Emit one record per 5 s within the step (simplified)
    for (let t = 0; t < dur; t += 5) {
      ff.msg(2, [cursor + t, m.heartRate || null, m.cadence || null, m.power || null]);
    }
    cursor += dur;
    ff.msg(3, [i, cursor, lapStart, dur * 1000, m.heartRate || null, m.power || null, 9, sport, 9, 1]);
  }

  const endTs = cursor;
  ff.msg(1, [endTs, 0, 4, 0]);

  ff.def(4, 18, [
    { num: 254, bt: 'UINT16' },
    { num: 253, bt: 'UINT32' },
    { num: 2,   bt: 'UINT32' },
    { num: 7,   bt: 'UINT32' },
    { num: 25,  bt: 'ENUM'   },
    { num: 27,  bt: 'UINT16' },
    { num: 0,   bt: 'ENUM'   },
    { num: 1,   bt: 'ENUM'   },
  ]).msg(4, [0, endTs, toFitTs(startDate), (endTs - toFitTs(startDate)) * 1000, sport, measurements.length, 8, 1]);

  ff.def(5, 34, [
    { num: 253, bt: 'UINT32' },
    { num: 0,   bt: 'UINT32' },
    { num: 1,   bt: 'UINT16' },
    { num: 2,   bt: 'ENUM'   },
    { num: 3,   bt: 'ENUM'   },
    { num: 4,   bt: 'ENUM'   },
  ]).msg(5, [endTs, (endTs - toFitTs(startDate)) * 1000, 1, 0, 26, 1]);

  return ff.toBuffer();
}

module.exports = { generateFitFile };
