'use strict';

function lapWatts(l) {
  const v = Number(l?.average_watts ?? l?.avgPower ?? l?.avg_power ?? l?.averageWatts);
  return Number.isFinite(v) && v > 0 ? v : null;
}

function lapSeconds(l) {
  const v = Number(
    l?.moving_time ?? l?.elapsed_time ?? l?.totalTimerTime ?? l?.totalElapsedTime
    ?? l?.movingTime ?? l?.elapsedTime ?? l?.duration,
  );
  return Number.isFinite(v) && v > 0 ? v : null;
}

/**
 * A session's average power, worked out from its laps.
 *
 * Garmin's activity summary often carries no power at all — an indoor ride
 * on a Tacx trainer arrives with `averagePower: null` while every one of its
 * 22 laps has watts. Lists that read only the summary then showed "—" for a
 * ride the Field Lactate panel, reading the laps, called 234 W.
 *
 * Weighted by lap length, because that is what an average over the ride
 * means: a plain mean of lap averages lets a 30-second sprint lap count as
 * much as a 20-minute block (234 W against the 247 W Strava reports for the
 * same ride). Falls back to the plain mean only when no lap knows its length.
 *
 * @param {Array<object>} laps Strava/Garmin snake_case or FIT camelCase laps
 * @returns {number|null} watts, one decimal, or null when no lap has power
 */
function averagePowerFromLaps(laps) {
  if (!Array.isArray(laps) || laps.length === 0) return null;
  let weighted = 0;
  let seconds = 0;
  let plainSum = 0;
  let plainN = 0;
  for (const l of laps) {
    const w = lapWatts(l);
    if (w == null) continue;
    plainSum += w;
    plainN += 1;
    const s = lapSeconds(l);
    if (s != null) {
      weighted += w * s;
      seconds += s;
    }
  }
  if (plainN === 0) return null;
  const avg = seconds > 0 ? weighted / seconds : plainSum / plainN;
  return Math.round(avg * 10) / 10;
}

module.exports = { averagePowerFromLaps };
