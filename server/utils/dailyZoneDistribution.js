/**
 * Daily time-in-heart-rate-zone.
 *
 * The dashboard has always classified a session as easy/medium/hard from one
 * number — its average heart rate or its TSS. That is misleading in the exact
 * case athletes care about: a 4×8 min VO2max session and a steady tempo ride
 * can share an average, while one is 30 minutes in Z5 and the other is 90
 * minutes in Z3. Only the distribution tells them apart.
 *
 * Sources, in order of preference per session:
 *   1. FitTraining.timeInZone — already computed at upload, costs nothing
 *   2. FIT per-second records
 *   3. Strava heart-rate streams
 *   4. the session's average heart rate — an estimate, counted separately
 *
 * Four exists because of how streams actually arrive: they are prewarmed for
 * newly synced activities and fetched lazily when someone opens one, so an
 * athlete's back catalogue has none. Reporting a year of training as "no heart
 * rate recorded" when every session has an average is simply wrong.
 *
 * The estimate puts the whole session in the zone its average falls in, which
 * is the crude reading this file was written to replace — so it is tracked
 * apart from measured time and the UI says which is which. A rough answer that
 * announces itself beats a blank chart; a rough answer pretending to be
 * measured does not.
 */

'use strict';

const FitTraining = require('../models/fitTraining');
const StravaActivity = require('../models/StravaActivity');
const StravaStream = require('../models/StravaStream');
const User = require('../models/UserModel');

const ZONE_KEYS = ['zone1', 'zone2', 'zone3', 'zone4', 'zone5'];

/** Sport → the zone set to use. Everything unfamiliar falls back to cycling. */
function zoneSetFor(profileZones, sport) {
  const s = String(sport || '').toLowerCase();
  if (s.includes('run') || s.includes('walk') || s.includes('hike')) return profileZones?.running;
  if (s.includes('swim')) return profileZones?.swimming;
  return profileZones?.cycling;
}

/**
 * Zone boundaries as an ascending list of minimums.
 *
 * Three sources, in the order the rest of the app trusts them. Demanding a
 * complete zone1..zone5 block was wrong: LaChart treats an athlete as having
 * heart-rate zones when they have an LT2 or a max HR, and derives the five
 * zones from those on the fly. Reading more strictly than the app writes made
 * every athlete without a hand-entered zone table look like they had no heart
 * rate at all.
 *
 * The derived ratios are the ones in utils/lactateZones.js, not new ones — a
 * second opinion on where an athlete's Z3 starts is the last thing this needs.
 */
function boundariesFrom(zoneSet, profile = null) {
  const ascending = (mins) => {
    if (mins.some((m) => !Number.isFinite(m) || m <= 0)) return null;
    for (let i = 1; i < mins.length; i += 1) if (mins[i] <= mins[i - 1]) return null;
    return mins;
  };

  // 1. An explicit zone table, when the athlete has entered one.
  if (zoneSet) {
    const explicit = ascending(ZONE_KEYS.map((k) => Number(zoneSet[k]?.min)));
    if (explicit) return explicit;
  }

  // 2. Derived from the thresholds, exactly as calculateZonesFromTest does.
  const lt1 = Number(zoneSet?.lt1 ?? zoneSet?.lt1Hr);
  const lt2 = Number(zoneSet?.lt2 ?? zoneSet?.lt2Hr);
  if (Number.isFinite(lt2) && lt2 > 0) {
    // Without a measured LT1, the usual relationship puts it around 85% of LT2.
    const first = Number.isFinite(lt1) && lt1 > 0 ? lt1 : lt2 * 0.85;
    const derived = ascending([
      first * 0.70,
      first * 0.90,
      first * 1.00,
      lt2 * 0.96,
      lt2 * 1.05,
    ].map(Math.round));
    if (derived) return derived;
  }

  // 3. Percentages of max heart rate — the crudest of the three, and the one
  //    most athletes will actually hit, so it is better than reporting nothing.
  const max = Number(zoneSet?.maxHeartRate ?? profile?.maxHr ?? profile?.maxHeartRate);
  if (Number.isFinite(max) && max > 0) {
    return ascending([0.60, 0.70, 0.80, 0.87, 0.93].map((f) => Math.round(max * f)));
  }

  return null;
}

/** 1..5 for a heart rate, or null below zone 1. */
function zoneForHr(hr, mins) {
  const v = Number(hr);
  if (!Number.isFinite(v) || v <= 0) return null;
  let zone = null;
  for (let i = 0; i < mins.length; i += 1) if (v >= mins[i]) zone = i + 1;
  return zone;
}

function emptyZones() {
  return { z1: 0, z2: 0, z3: 0, z4: 0, z5: 0 };
}

function localDayKey(d) {
  const x = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(x.getTime())) return null;
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

/** Accumulate a heart-rate series into zone seconds. */
function addSeries(target, hrArray, timeArray, mins) {
  if (!Array.isArray(hrArray)) return 0;
  let added = 0;
  let prevT = null;
  for (let i = 0; i < hrArray.length; i += 1) {
    let dt = 1;
    if (Array.isArray(timeArray) && timeArray[i] != null) {
      if (prevT != null) dt = timeArray[i] - prevT;
      prevT = timeArray[i];
    }
    // Gaps and paused stretches would otherwise dump minutes into whatever
    // zone the athlete happened to be in when they stopped.
    if (!(dt > 0) || dt > 10) continue;
    const z = zoneForHr(hrArray[i], mins);
    if (!z) continue;
    target[`z${z}`] += dt;
    added += dt;
  }
  return added;
}

/**
 * @returns {Promise<{ days: Array, hasZones: boolean, coverage: object }>}
 *   days: [{ date, zones: {z1..z5}, totalSec, sessions, unmeasuredSec }]
 */
async function dailyZoneDistribution(athleteId, startDate, endDate, { sport = 'all' } = {}) {
  const athleteIdStr = String(athleteId);
  const user = await User.findById(athleteIdStr).select('heartRateZones maxHr maxHeartRate').lean();
  const profileZones = user?.heartRateZones || null;

  const byDay = new Map();
  const dayFor = (key) => {
    if (!byDay.has(key)) {
      byDay.set(key, {
        date: key, zones: emptyZones(), totalSec: 0, sessions: 0,
        unmeasuredSec: 0, estimatedSec: 0,
      });
    }
    return byDay.get(key);
  };

  const sportMatches = (s) => {
    if (sport === 'all') return true;
    const v = String(s || '').toLowerCase();
    if (sport === 'run') return v.includes('run') || v.includes('walk');
    if (sport === 'bike') return v.includes('ride') || v.includes('bike') || v.includes('cycl') || v.includes('virtual');
    if (sport === 'swim') return v.includes('swim');
    return true;
  };

  let anyZones = false;

  // ── FIT trainings ────────────────────────────────────────────────
  const fits = await FitTraining.find({
    athleteId: athleteIdStr,
    timestamp: { $gte: startDate, $lte: endDate },
  }).select('timestamp sport totalElapsedTime totalTimerTime timeInZone records').lean();

  for (const t of fits) {
    if (!sportMatches(t.sport)) continue;
    const key = localDayKey(t.timestamp);
    if (!key) continue;
    const day = dayFor(key);
    day.sessions += 1;

    const mins = boundariesFrom(zoneSetFor(profileZones, t.sport), user);
    const duration = Number(t.totalElapsedTime || t.totalTimerTime || 0);

    if (!mins) { day.unmeasuredSec += duration; continue; }
    anyZones = true;

    // Precomputed at upload — by far the cheapest path.
    if (Array.isArray(t.timeInZone) && t.timeInZone.length) {
      let added = 0;
      for (const entry of t.timeInZone) {
        const z = Number(entry?.zone);
        const secs = Number(entry?.time) || 0;
        if (z >= 1 && z <= 5 && secs > 0) { day.zones[`z${z}`] += secs; added += secs; }
      }
      day.totalSec += added;
      if (duration > added) day.unmeasuredSec += duration - added;
      continue;
    }

    const recs = Array.isArray(t.records) ? t.records : [];
    if (recs.length) {
      const hr = recs.map((r) => r?.heartRate);
      const time = recs.map((r) => (r?.elapsedTime != null ? r.elapsedTime : null));
      const added = addSeries(day.zones, hr, time.some((x) => x != null) ? time : null, mins);
      day.totalSec += added;
      if (duration > added) day.unmeasuredSec += duration - added;
    } else {
      day.unmeasuredSec += duration;
    }
  }

  // ── Strava activities ────────────────────────────────────────────
  const stravas = await StravaActivity.find({
    userId: athleteIdStr,
    startDate: { $gte: startDate, $lte: endDate },
  }).select('stravaId sport startDate movingTime elapsedTime').lean();

  const wanted = stravas.filter((a) => sportMatches(a.sport));
  const streamDocs = wanted.length
    ? await StravaStream.find({
        userId: athleteIdStr,
        stravaId: { $in: wanted.map((a) => a.stravaId) },
      }).select('stravaId streams').lean()
    : [];
  const streamsById = new Map(streamDocs.map((d) => [String(d.stravaId), d.streams || {}]));

  for (const a of wanted) {
    const key = localDayKey(a.startDate);
    if (!key) continue;
    const day = dayFor(key);
    day.sessions += 1;

    const mins = boundariesFrom(zoneSetFor(profileZones, a.sport), user);
    const duration = Number(a.movingTime || a.elapsedTime || 0);
    if (!mins) { day.unmeasuredSec += duration; continue; }
    anyZones = true;

    const s = streamsById.get(String(a.stravaId));
    const added = s ? addSeries(day.zones, s.heartrate, s.time, mins) : 0;
    day.totalSec += added;

    const remaining = duration - added;
    if (remaining > 0) {
      const avg = Number(a.averageHeartRate) || 0;
      const zone = avg > 0 ? zoneForHr(avg, mins) : null;
      if (zone) {
        day.zones[`z${zone}`] += remaining;
        day.estimatedSec += remaining;
      } else {
        day.unmeasuredSec += remaining;
      }
    }
  }

  const days = Array.from(byDay.values()).sort((a, b) => a.date.localeCompare(b.date));
  const measured = days.reduce((acc, d) => acc + d.totalSec, 0);
  const estimated = days.reduce((acc, d) => acc + d.estimatedSec, 0);
  const unmeasured = days.reduce((acc, d) => acc + d.unmeasuredSec, 0);

  return {
    days,
    hasZones: anyZones,
    coverage: {
      measuredSec: Math.round(measured),
      estimatedSec: Math.round(estimated),
      unmeasuredSec: Math.round(unmeasured),
      // What share of recorded time we can actually place in a zone. Shown in
      // the UI so a thin bar reads as "no HR data" rather than "an easy week".
      pct: measured + estimated + unmeasured > 0
        ? Math.round(((measured + estimated) / (measured + estimated + unmeasured)) * 100)
        : 0,
      /** Share of the placed time that came from an average rather than a trace. */
      estimatedPct: measured + estimated > 0
        ? Math.round((estimated / (measured + estimated)) * 100)
        : 0,
    },
  };
}

module.exports = { dailyZoneDistribution, zoneForHr, boundariesFrom };
