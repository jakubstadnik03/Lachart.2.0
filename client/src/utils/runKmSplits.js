import {
  lapDistanceMetersForChart,
  lapDurationSecondsForChart,
  lapSpeedMpsForChart,
} from './fitAnalysisUtils';
import { stravaHalfCadenceToSpm } from './cadenceDisplay';

const MOVING_SPEED_THRESHOLD_MPS = 0.14;

function speedMps(r) {
  const s = Number(r.speed ?? r.speed_ms ?? 0);
  return Number.isFinite(s) && s > 0 ? s : 0;
}

function movingTimeFromRecords(recs) {
  if (!recs || recs.length < 2) return 0;
  let moving = 0;
  for (let i = 1; i < recs.length; i++) {
    const prev = recs[i - 1];
    const curr = recs[i];
    const prevTs = prev.timestamp ? new Date(prev.timestamp).getTime() : Number(prev.timeFromStart ?? 0) * 1000;
    const currTs = curr.timestamp ? new Date(curr.timestamp).getTime() : Number(curr.timeFromStart ?? 0) * 1000;
    const dt = (currTs - prevTs) / 1000;
    if (dt <= 0) continue;
    if (speedMps(curr) >= MOVING_SPEED_THRESHOLD_MPS || speedMps(prev) >= MOVING_SPEED_THRESHOLD_MPS) {
      moving += dt;
    }
  }
  return moving;
}

function movingRecords(recs) {
  return recs.filter((r) => speedMps(r) >= MOVING_SPEED_THRESHOLD_MPS);
}

function elevationDeltaFromRecords(recs) {
  const alts = recs.map((r) => r.altitude).filter((v) => v != null && Number.isFinite(Number(v)));
  if (alts.length < 2) return null;
  return Math.round(Number(alts[alts.length - 1]) - Number(alts[0]));
}

function buildKmLapFromRecords(segRecs, kmNumber) {
  const movingTimeSec = movingTimeFromRecords(segRecs);
  const movingRecs = movingRecords(segRecs);
  const segStartDist = Number(segRecs[0]?.distance ?? 0);
  const segEndDist = Number(segRecs[segRecs.length - 1]?.distance ?? 0);
  const segmentMeters = Math.max(0, segEndDist - segStartDist);
  const speeds = movingRecs.map(speedMps).filter((v) => v > 0);
  const heartRates = movingRecs.map((r) => r.heartRate ?? r.heart_rate).filter((v) => v && v > 0);
  const cadences = movingRecs
    .map((r) => r.cadence ?? r.cadence_rpm ?? r.average_cadence)
    .filter((v) => v != null && Number(v) > 0);
  const avgSpeedMps = speeds.length > 0 ? speeds.reduce((a, b) => a + b, 0) / speeds.length : 0;
  const avgHeartRate = heartRates.length > 0
    ? Math.round(heartRates.reduce((a, b) => a + b, 0) / heartRates.length)
    : 0;
  const avgCadence = cadences.length > 0
    ? Math.round(cadences.reduce((a, b) => a + b, 0) / cadences.length)
    : 0;

  return {
    distance: segmentMeters,
    elapsed_time: movingTimeSec,
    moving_time: movingTimeSec,
    average_speed: avgSpeedMps,
    average_heartrate: avgHeartRate,
    average_cadence: avgCadence,
    avgCadence: avgCadence,
    lapNumber: kmNumber,
    _elevDelta: elevationDeltaFromRecords(segRecs),
  };
}

/** Build ~1 km splits from per-second stream records (Strava / FIT). */
export function synthesizeKmLapsFromRecords(records) {
  if (!Array.isArray(records) || records.length < 10) return [];

  const hasDistance = records.some((r) => Number(r.distance) > 0);
  if (!hasDistance) return [];

  const kmLaps = [];
  let currentKmRecords = [];
  let kmNumber = 1;
  let lastKmDistance = 0;

  records.forEach((record) => {
    const distance = Number(record.distance || 0);
    if (distance >= kmNumber * 1000 && distance > lastKmDistance) {
      if (currentKmRecords.length > 0) {
        kmLaps.push(buildKmLapFromRecords(currentKmRecords, kmNumber));
      }
      lastKmDistance = distance;
      kmNumber += 1;
      currentKmRecords = [record];
    } else {
      currentKmRecords.push(record);
    }
  });

  if (currentKmRecords.length > 10) {
    const lastDistance = Number(currentKmRecords[currentKmRecords.length - 1]?.distance || 0);
    if (lastDistance >= (kmNumber - 1) * 1000 + 500) {
      kmLaps.push(buildKmLapFromRecords(currentKmRecords, kmNumber));
    }
  }

  return kmLaps;
}

function resolveLapSegmentDistancesMeters(laps, records, lapTimeSource) {
  const raw = laps.map((l) => lapDistanceMetersForChart(l, lapTimeSource, false));
  const n = raw.length;
  if (n === 0) return raw;

  const sumRaw = raw.reduce((a, b) => a + b, 0);
  const lastRaw = raw[n - 1] || 0;
  const streamTotal = Array.isArray(records) && records.length > 0
    ? Number(records[records.length - 1]?.distance) || 0
    : 0;
  const strictlyIncreasing = n >= 2 && raw.every((d, i) => i === 0 || d > raw[i - 1]);

  let treatAsCumulative = false;
  if (strictlyIncreasing && lastRaw >= 400 && n >= 2) {
    const expectedTriangular = (lastRaw * (n + 1)) / 2;
    if (Math.abs(sumRaw - expectedTriangular) <= lastRaw * 0.08 + n * 120) {
      treatAsCumulative = true;
    }
  }
  if (!treatAsCumulative && streamTotal > 250 && lastRaw >= streamTotal * 0.65 && sumRaw > streamTotal * 1.2) {
    treatAsCumulative = true;
  }
  if (!treatAsCumulative && n >= 2 && streamTotal > 250 && sumRaw > streamTotal * 1.35) {
    treatAsCumulative = true;
  }
  if (!treatAsCumulative && strictlyIncreasing && lastRaw > 1500 && sumRaw > lastRaw * 1.4) {
    treatAsCumulative = true;
  }

  if (!treatAsCumulative) return raw;
  return raw.map((d, i) => {
    if (i === 0) return Math.max(0, d);
    const delta = d - raw[i - 1];
    return delta > 0 ? delta : 0;
  });
}

function paceSecPerKmFromLap(lap, distM, lapTimeSource) {
  const movingSec = lapDurationSecondsForChart(lap, lapTimeSource);
  let speedMps = lapSpeedMpsForChart(lap);
  if (!speedMps && distM > 0 && movingSec > 0) speedMps = distM / movingSec;
  if (speedMps > 0) return 1000 / speedMps;
  if (distM > 0 && movingSec > 0) return movingSec / (distM / 1000);
  return null;
}

function elevationFromLap(lap) {
  if (lap._elevDelta != null) return lap._elevDelta;
  const gain = Number(lap.total_elevation_gain ?? lap.elevationGain ?? lap.totalAscent ?? 0);
  const loss = Number(lap.total_descent ?? lap.elevation_loss ?? lap.totalDescent ?? 0);
  if (gain > 0 || loss > 0) return Math.round(gain - loss);
  if (lap.start_altitude != null && lap.end_altitude != null) {
    return Math.round(Number(lap.end_altitude) - Number(lap.start_altitude));
  }
  return null;
}

function lapsToSplitRows(laps, records, lapTimeSource) {
  const segmentDistances = resolveLapSegmentDistancesMeters(laps, records, lapTimeSource);
  return laps.map((lap, i) => {
    const distM = Number(segmentDistances[i]) || lapDistanceMetersForChart(lap, lapTimeSource, false);
    const paceSecPerKm = paceSecPerKmFromLap(lap, distM, lapTimeSource);
    const hrRaw = Number(
      lap.average_heartrate ?? lap.avgHeartRate ?? lap.averageHeartRate ?? lap.avgHR ?? 0
    );
    const cadRaw = Number(
      lap.average_cadence ?? lap.avgCadence ?? lap.avg_cadence ?? lap.averageCadence ?? 0
    );
    const cadence = cadRaw > 0
      ? (lapTimeSource === 'strava' ? (stravaHalfCadenceToSpm(cadRaw, 'run') ?? Math.round(cadRaw)) : Math.round(cadRaw))
      : null;
    return {
      km: lap.lapNumber ?? lap.lap_number ?? (i + 1),
      paceSecPerKm,
      hr: hrRaw > 0 ? Math.round(hrRaw) : null,
      cadence,
      elev: elevationFromLap(lap),
      distM,
    };
  }).filter((s) => s.paceSecPerKm != null && s.paceSecPerKm > 0 && s.paceSecPerKm < 3600);
}

/**
 * Strava-style per-km splits for runs. Prefers distance stream synthesis;
 * falls back to API laps when they look like km auto-laps.
 */
export function buildRunKmSplits(laps = [], records = [], { lapTimeSource = 'fit' } = {}) {
  const synth = synthesizeKmLapsFromRecords(records);
  if (synth.length >= 1) return lapsToSplitRows(synth, records, lapTimeSource);

  if (!Array.isArray(laps) || laps.length < 2) return [];

  const segmentDistances = resolveLapSegmentDistancesMeters(laps, records, lapTimeSource);
  const avgDist = segmentDistances.reduce((a, b) => a + b, 0) / segmentDistances.length;
  const looksLikeKmSplits = avgDist >= 700 && avgDist <= 1400 && laps.length >= 2;
  if (!looksLikeKmSplits) return [];

  return lapsToSplitRows(laps, records, lapTimeSource);
}

export function formatSplitPace(paceSecPerKm) {
  if (!paceSecPerKm || !Number.isFinite(paceSecPerKm)) return '—';
  const sec = Math.round(paceSecPerKm);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
