/**
 * Route fingerprinting — "have I done this loop before?"
 *
 * Comparing two GPS tracks point by point is both expensive and wrong: the same
 * loop recorded twice never shares timestamps, sample counts, or even the exact
 * start point, because you start your watch wherever you happen to be standing.
 *
 * The obvious shortcut — quantise each track to a grid and hash it — does not
 * work, and it is worth saying why, because it looks like it should. Grid
 * snapping is discontinuous: a point sitting near a cell boundary lands on
 * either side depending on a metre of GPS scatter, so two recordings of the
 * same loop produce different hashes and never match. Exact equality over
 * quantised geometry is brittle by construction.
 *
 * So this does the thing that actually works:
 *   1. resample each track to a fixed number of points by *distance along the
 *      route*, removing any dependence on sampling rate or pace
 *   2. bucket coarsely (distance + rough start area) to find candidates cheaply
 *   3. compare candidates geometrically, with a tolerance in metres
 *
 * Comparison is rotation- and direction-invariant, because a loop can be
 * started anywhere along it and ridden either way round.
 */

'use strict';

/** Points sampled along the route. Enough to distinguish shapes, few enough to stay cheap. */
const SAMPLE_POINTS = 32;

/**
 * Floor for the match tolerance. The real tolerance scales with the route —
 * see toleranceFor().
 */
const MATCH_TOLERANCE_M = 120;

const EARTH_RADIUS_M = 6371000;
const toRad = (deg) => (deg * Math.PI) / 180;

function haversine(a, b) {
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

function isPoint(p) {
  return Array.isArray(p)
    && Number.isFinite(Number(p[0])) && Number.isFinite(Number(p[1]))
    && Math.abs(p[0]) <= 90 && Math.abs(p[1]) <= 180
    // 0,0 is the Gulf of Guinea; in practice it means "no fix".
    && !(Number(p[0]) === 0 && Number(p[1]) === 0);
}

function cumulativeDistance(points) {
  const cum = [0];
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += haversine(points[i - 1], points[i]);
    cum.push(total);
  }
  return { cum, total };
}

/**
 * Resample a track to a fixed number of points spaced evenly by distance.
 * This is what makes everything downstream independent of how fast the athlete
 * moved and how often the watch sampled.
 */
function resampleByDistance(points, n = SAMPLE_POINTS) {
  if (points.length < 2) return points.slice();
  const { cum, total } = cumulativeDistance(points);
  if (total <= 0) return points.slice(0, 1);

  const out = [];
  let cursor = 0;
  for (let i = 0; i < n; i += 1) {
    const target = (total * i) / (n - 1);
    while (cursor < cum.length - 2 && cum[cursor + 1] < target) cursor += 1;
    const segStart = cum[cursor];
    const segEnd = cum[cursor + 1] ?? segStart;
    const span = segEnd - segStart;
    const t = span > 0 ? (target - segStart) / span : 0;
    const a = points[cursor];
    const b = points[cursor + 1] ?? a;
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return out;
}

/**
 * @param {Array<[number,number]>} latlng
 * @returns {{ bucketKey, points, distanceM, start, isLoop }|null}
 */
function buildRouteSignature(latlng) {
  const points = (Array.isArray(latlng) ? latlng : [])
    .map((p) => (Array.isArray(p) ? [Number(p[0]), Number(p[1])] : null))
    .filter(isPoint);

  // A handful of points is a dropped signal, not a route.
  if (points.length < 10) return null;

  const { total } = cumulativeDistance(points);
  if (total < 500) return null; // shorter than 500 m is not a route worth tracking

  const sampled = resampleByDistance(points);
  const isLoop = haversine(points[0], points[points.length - 1]) < 200;

  return {
    /** Route centre — used only as a cheap first rejection when clustering. */
    centre: centroid(sampled),
    points: sampled,
    distanceM: Math.round(total),
    start: [points[0][0], points[0][1]],
    isLoop,
  };
}

function centroid(points) {
  const lat = points.reduce((s, p) => s + p[0], 0) / points.length;
  const lng = points.reduce((s, p) => s + p[1], 0) / points.length;
  return [lat, lng];
}

/**
 * How close two sampled routes have to be, in metres.
 *
 * A fixed tolerance cannot work. Resampling a loop that was started at a
 * different point does not land on the same fractions along the route, so
 * whole-sample rotation always leaves up to half a sample spacing of residual
 * error — 160 m on a 7 km loop, 400 m on a 40 km ride. Any threshold tight
 * enough for the short one rejects the long one. Scaling with the spacing is
 * what makes the comparison length-independent.
 */
function toleranceFor(a, b) {
  const spacing = Math.max(a.distanceM, b.distanceM) / (SAMPLE_POINTS - 1);
  return Math.max(MATCH_TOLERANCE_M, spacing * 0.6);
}

/** Mean separation between two equal-length point lists, in metres. */
function meanSeparation(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) sum += haversine(a[i], b[i]);
  return sum / a.length;
}

function rotate(points, by) {
  return [...points.slice(by), ...points.slice(0, by)];
}

/**
 * Are these the same route?
 *
 * Tries both directions, and — for loops — every rotation, because the athlete
 * chooses where to start and which way to go. Twenty-four points means at most
 * a few hundred distance calculations per pair, which is nothing.
 */
function routesMatch(a, b, toleranceM = null) {
  if (!a?.points || !b?.points || a.points.length !== b.points.length) return false;

  // Distances have to be in the same ballpark before the shape is worth checking.
  const ratio = a.distanceM / b.distanceM;
  if (ratio < 0.85 || ratio > 1.18) return false;

  const tolerance = toleranceM ?? toleranceFor(a, b);

  const candidates = [b.points, b.points.slice().reverse()];
  const rotations = a.isLoop && b.isLoop ? a.points.length : 1;

  for (const candidate of candidates) {
    for (let r = 0; r < rotations; r += 1) {
      if (meanSeparation(a.points, rotate(candidate, r)) <= tolerance) return true;
    }
  }
  return false;
}

/**
 * Group activities that share a route.
 *
 * @param {Array} activities [{ id, date, latlng, ... }]
 * @param {object} opts
 * @param {number} opts.minRepeats  a "route" needs to have been done more than once
 * @returns {Array} routes, most repeated first
 */
function groupByRoute(activities = [], { minRepeats = 2, toleranceM = null } = {}) {
  // Clustered directly rather than hashed into buckets first. Bucketing by a
  // quantised distance has the same boundary problem as grid-snapping: two
  // recordings of one route straddle a bucket edge and are then never compared
  // at all. The distance-ratio gate inside routesMatch rejects almost every
  // pair in constant time, which is all the cheap filtering this needs.
  const clusters = [];

  for (const act of activities) {
    const sig = buildRouteSignature(act?.latlng);
    if (!sig) continue;
    const home = clusters.find((c) => routesMatch(c.sig, sig, toleranceM));
    if (home) {
      home.entries.push(act);
      // A GPS drop-out shortens a track, it never lengthens one, so the longest
      // reading is the best estimate of the route's real distance.
      if (sig.distanceM > home.distanceM) home.distanceM = sig.distanceM;
    } else {
      clusters.push({ sig, distanceM: sig.distanceM, entries: [act] });
    }
  }

  return clusters
    .filter((c) => c.entries.length >= minRepeats)
    .map((c) => ({
      distanceM: c.distanceM,
      isLoop: c.sig.isLoop,
      start: c.sig.start,
      points: c.sig.points,
      activities: c.entries
        .slice()
        .sort((x, y) => new Date(x.date || 0) - new Date(y.date || 0)),
    }))
    .sort((a, b) => b.activities.length - a.activities.length);
}

module.exports = {
  buildRouteSignature,
  routesMatch,
  groupByRoute,
  resampleByDistance,
  haversine,
  meanSeparation,
  toleranceFor,
  SAMPLE_POINTS,
  MATCH_TOLERANCE_M,
};
