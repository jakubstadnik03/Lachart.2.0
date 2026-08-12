/**
 * Route fingerprinting tests. Plain Node, no jest — the server has no test
 * runner configured, and this module deliberately has no database imports so it
 * can be checked with:
 *
 *   node server/utils/routeSignature.test.js
 */

'use strict';

const assert = require('assert');
const { buildRouteSignature, groupByRoute, haversine, resampleByDistance, routesMatch } = require('./routeSignature');

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ok  ${name}`);
  } catch (err) {
    console.error(`  FAIL ${name}\n       ${err.message}`);
    process.exitCode = 1;
  }
}

// ── Fixtures ───────────────────────────────────────────────────────
// A square loop around Brno, roughly 4 km a side at this latitude.

const BASE_LAT = 49.195;
const BASE_LNG = 16.606;

/** Build a closed square loop with `n` points per side. */
function squareLoop({ size = 0.02, n = 40, jitter = 0, startOffset = 0, reverse = false } = {}) {
  const corners = [
    [BASE_LAT, BASE_LNG],
    [BASE_LAT + size, BASE_LNG],
    [BASE_LAT + size, BASE_LNG + size],
    [BASE_LAT, BASE_LNG + size],
    [BASE_LAT, BASE_LNG],
  ];
  const pts = [];
  for (let c = 0; c < corners.length - 1; c += 1) {
    const [aLat, aLng] = corners[c];
    const [bLat, bLng] = corners[c + 1];
    for (let i = 0; i < n; i += 1) {
      const t = i / n;
      // Deterministic wobble standing in for GPS scatter.
      const wob = jitter ? Math.sin((c * n + i) * 0.7) * jitter : 0;
      pts.push([aLat + (bLat - aLat) * t + wob, aLng + (bLng - aLng) * t + wob]);
    }
  }
  const rotated = startOffset ? [...pts.slice(startOffset), ...pts.slice(0, startOffset)] : pts;
  return reverse ? rotated.slice().reverse() : rotated;
}

console.log('routeSignature');

test('haversine measures a known distance', () => {
  // One degree of latitude is ~111 km.
  const d = haversine([49, 16], [50, 16]);
  assert.ok(d > 110000 && d < 112000, `got ${Math.round(d)} m`);
});

test('resampling returns the requested number of points', () => {
  const pts = resampleByDistance(squareLoop(), 24);
  assert.strictEqual(pts.length, 24);
});

test('resampling is independent of how densely the track was sampled', () => {
  const sparse = resampleByDistance(squareLoop({ n: 12 }), 24);
  const dense = resampleByDistance(squareLoop({ n: 200 }), 24);
  // Same shape sampled at very different rates lands in the same places.
  for (let i = 0; i < sparse.length; i += 1) {
    assert.ok(haversine(sparse[i], dense[i]) < 400, `point ${i} differs by too much`);
  }
});

test('the same loop matches itself across sampling rates', () => {
  const a = buildRouteSignature(squareLoop({ n: 40 }));
  const b = buildRouteSignature(squareLoop({ n: 60 }));
  assert.ok(a && b);
  assert.ok(routesMatch(a, b));
});

test('GPS scatter does not break the match', () => {
  const clean = buildRouteSignature(squareLoop());
  const noisy = buildRouteSignature(squareLoop({ jitter: 0.0003 })); // ~30 m wobble
  assert.ok(routesMatch(clean, noisy));
});

test('the same loop ridden the other way round still matches', () => {
  assert.ok(routesMatch(
    buildRouteSignature(squareLoop()),
    buildRouteSignature(squareLoop({ reverse: true })),
  ));
});

test('the same loop started at a different point still matches', () => {
  // You start your watch wherever you are standing, rarely the same gate twice.
  assert.ok(routesMatch(
    buildRouteSignature(squareLoop()),
    buildRouteSignature(squareLoop({ startOffset: 55 })),
  ));
});

test('a genuinely different route does not match', () => {
  assert.ok(!routesMatch(
    buildRouteSignature(squareLoop({ size: 0.02 })),
    buildRouteSignature(squareLoop({ size: 0.05 })),
  ));
});

test('an out-and-back is not confused with the loop it overlaps', () => {
  const outAndBack = squareLoop().slice(0, 40);
  assert.ok(!routesMatch(
    buildRouteSignature(squareLoop()),
    buildRouteSignature([...outAndBack, ...outAndBack.slice().reverse()]),
  ));
});

test('a route a long way away never matches, whatever its shape', () => {
  const here = buildRouteSignature(squareLoop());
  const abroad = buildRouteSignature(squareLoop().map(([la, ln]) => [la + 5, ln + 5]));
  assert.ok(!routesMatch(here, abroad));
});

test('rejects tracks too short to be a route', () => {
  assert.strictEqual(buildRouteSignature([[49.1, 16.6], [49.1001, 16.6001]]), null);
  assert.strictEqual(buildRouteSignature([]), null);
  assert.strictEqual(buildRouteSignature(null), null);
});

test('ignores null-island points from a lost fix', () => {
  const withNulls = squareLoop();
  withNulls.splice(10, 0, [0, 0], [0, 0]);
  const sig = buildRouteSignature(withNulls);
  assert.ok(sig);
  assert.ok(routesMatch(sig, buildRouteSignature(squareLoop())));
});

test('reports whether the route is a loop', () => {
  assert.strictEqual(buildRouteSignature(squareLoop()).isLoop, true);
  const pointToPoint = squareLoop().slice(0, 60);
  assert.strictEqual(buildRouteSignature(pointToPoint).isLoop, false);
});

test('reports a sane total distance', () => {
  const sig = buildRouteSignature(squareLoop({ size: 0.02 }));
  // Four sides of ~0.02° — two of latitude (~2.2 km each) and two of longitude
  // (~1.5 km each at this latitude).
  assert.ok(sig.distanceM > 6000 && sig.distanceM < 9000, `got ${sig.distanceM} m`);
});

console.log('\ngroupByRoute');

test('groups repeats of the same route and ignores one-offs', () => {
  const acts = [
    { id: 'a', date: '2026-07-01', latlng: squareLoop() },
    { id: 'b', date: '2026-07-08', latlng: squareLoop({ jitter: 0.0002 }) },
    { id: 'c', date: '2026-07-15', latlng: squareLoop({ n: 55, startOffset: 30 }) },
    { id: 'once', date: '2026-07-20', latlng: squareLoop({ size: 0.05 }) },
  ];
  const routes = groupByRoute(acts);
  assert.strictEqual(routes.length, 1);
  assert.strictEqual(routes[0].activities.length, 3);
});

test('orders each route oldest first so progression reads left to right', () => {
  const acts = [
    { id: 'c', date: '2026-07-15', latlng: squareLoop() },
    { id: 'a', date: '2026-07-01', latlng: squareLoop() },
    { id: 'b', date: '2026-07-08', latlng: squareLoop() },
  ];
  assert.deepStrictEqual(groupByRoute(acts)[0].activities.map((a) => a.id), ['a', 'b', 'c']);
});

test('puts the most-repeated route first', () => {
  const acts = [
    ...[1, 2, 3, 4].map((i) => ({ id: `loop${i}`, date: `2026-07-0${i}`, latlng: squareLoop() })),
    ...[1, 2].map((i) => ({ id: `other${i}`, date: `2026-07-1${i}`, latlng: squareLoop({ size: 0.06 }) })),
  ];
  const routes = groupByRoute(acts);
  assert.strictEqual(routes[0].activities.length, 4);
  assert.strictEqual(routes[1].activities.length, 2);
});

test('respects a higher repeat threshold', () => {
  const acts = [
    { id: 'a', date: '2026-07-01', latlng: squareLoop() },
    { id: 'b', date: '2026-07-08', latlng: squareLoop() },
  ];
  assert.strictEqual(groupByRoute(acts, { minRepeats: 3 }).length, 0);
});

test('skips activities with no GPS at all', () => {
  const acts = [
    { id: 'a', date: '2026-07-01', latlng: squareLoop() },
    { id: 'b', date: '2026-07-08', latlng: squareLoop() },
    { id: 'treadmill', date: '2026-07-09', latlng: null },
  ];
  const routes = groupByRoute(acts);
  assert.strictEqual(routes[0].activities.length, 2);
});

console.log(`\n${passed} passed`);
