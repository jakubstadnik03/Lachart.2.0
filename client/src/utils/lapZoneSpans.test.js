import {
  zoneSpansForActivity, lapPowerOrPaceMetric, lapHeartRate, findZoneKeyForValue,
} from './lapZoneSpans';

// A real 4x25min: warm-up, an opener, then four blocks with easy spinning
// between them and a long ride home. Two hours and three quarters that
// averages 323 W and is nothing like a 323 W ride.
const RIDE = {
  sport: 'Ride',
  lapProfile: [
    { d: 600, w: 205 },
    { d: 179, w: 372 },
    { d: 624, w: 212 },
    { d: 1501, w: 355 },
    { d: 180, w: 168 },
    { d: 1502, w: 364 },
    { d: 181, w: 187 },
    { d: 1500, w: 362 },
    { d: 149, w: 133 },
    { d: 1503, w: 332 },
    { d: 1957, w: 220 },
  ],
};

const ZONES = {
  zone1: { min: 0, max: 180 },
  zone2: { min: 181, max: 250 },
  zone3: { min: 251, max: 300 },
  zone4: { min: 301, max: 360 },
  zone5: { min: 361, max: 600 },
};

const totals = (spans) => spans.reduce((acc, { zoneKey, sec }) => {
  acc[zoneKey] = (acc[zoneKey] || 0) + sec;
  return acc;
}, {});

describe('zoneSpansForActivity', () => {
  it('puts each rep in the zone it was ridden at', () => {
    const t = totals(zoneSpansForActivity(RIDE, 'cycling', ZONES, lapPowerOrPaceMetric));

    // The whole ride is accounted for, and spread rather than heaped in one
    // zone the way the activity average put it.
    const sum = Object.values(t).reduce((a, b) => a + b, 0);
    expect(sum).toBe(9876);
    // Nothing was ridden between 251 and 300 W, so Z3 stays empty — a real
    // 4x25min is polarised, and the point is that the shape survives.
    expect(Object.keys(t).sort()).toEqual(['zone1', 'zone2', 'zone4', 'zone5']);

    // 355 W and 332 W are Z4; 372, 364 and 362 are Z5.
    expect(t.zone4).toBe(1501 + 1503);
    expect(t.zone5).toBe(179 + 1502 + 1500);
    // The floats and the easy spinning are where they belong, not folded into
    // the efforts.
    expect(t.zone1).toBe(180 + 149);
    expect(t.zone2).toBe(600 + 624 + 181 + 1957);

    // What the old reading did with the same ride: 323 W average, whole
    // session charged to one zone, 100% of 9876 s in Z4.
    expect(t.zone4).toBeLessThan(sum * 0.4);
  });

  it('reads heart rate off laps the same way', () => {
    const run = {
      sport: 'Run',
      lapProfile: [
        { d: 286, h: 159 }, { d: 122, h: 133 }, { d: 180, h: 169 },
        { d: 306, h: 139 }, { d: 293, h: 169 },
      ],
    };
    const hrZones = {
      zone1: { min: 0, max: 140 },
      zone2: { min: 141, max: 160 },
      zone3: { min: 161, max: 175 },
      zone4: { min: 176, max: 185 },
      zone5: { min: 186, max: 220 },
    };
    const t = totals(zoneSpansForActivity(run, 'running', hrZones, lapHeartRate));
    expect(t.zone1).toBe(122 + 306);
    expect(t.zone2).toBe(286);
    expect(t.zone3).toBe(180 + 293);
  });

  it('derives a run lap pace from distance when speed is missing', () => {
    // 1000 m in 200 s is 3:20/km.
    expect(Math.round(lapPowerOrPaceMetric({ d: 200, m: 1000 }, 'running'))).toBe(200);
    // 100 m in 90 s is 1:30/100m.
    expect(Math.round(lapPowerOrPaceMetric({ d: 90, m: 100 }, 'swimming'))).toBe(90);
  });

  it('hands back nothing when the laps cannot account for the session', () => {
    // Only the opener carries power — a fifth of the ride is not a
    // distribution of it, and drawing it as one would be a worse lie than the
    // average it falls back to.
    const sparse = {
      sport: 'Ride',
      lapProfile: [{ d: 179, w: 372 }, { d: 1501 }, { d: 1502 }, { d: 1500 }],
    };
    expect(zoneSpansForActivity(sparse, 'cycling', ZONES, lapPowerOrPaceMetric)).toBeNull();
    expect(zoneSpansForActivity({ sport: 'Ride' }, 'cycling', ZONES, lapPowerOrPaceMetric)).toBeNull();
  });
});

describe('findZoneKeyForValue', () => {
  // A real cycling table: it opens at 200 W, so everything softer than that —
  // coasting, freewheeling down a descent, spinning between reps — used to
  // fall off the bottom and be discarded.
  const BIKE = {
    zone1: { min: 200, max: 270 },
    zone2: { min: 271, max: 330 },
    zone3: { min: 331, max: 355 },
    zone4: { min: 356, max: 400 },
    zone5: { min: 401, max: 500 },
  };

  it('keeps time below the table in the easiest zone', () => {
    expect(findZoneKeyForValue(133, BIKE)).toBe('zone1');
    expect(findZoneKeyForValue(0.5, BIKE)).toBe('zone1');
    expect(findZoneKeyForValue(199, BIKE)).toBe('zone1');
  });

  it('keeps time above the table in the hardest zone', () => {
    expect(findZoneKeyForValue(776, BIKE)).toBe('zone5');
  });

  it('still places a value inside its own band', () => {
    expect(findZoneKeyForValue(205, BIKE)).toBe('zone1');
    expect(findZoneKeyForValue(355, BIKE)).toBe('zone3');
    expect(findZoneKeyForValue(372, BIKE)).toBe('zone4');
  });

  it('reads a pace table the right way round', () => {
    // Seconds per km: Z1 is the slowest band and holds the largest numbers.
    const RUN = {
      zone1: { min: 330, max: 420 },
      zone2: { min: 285, max: 329 },
      zone3: { min: 255, max: 284 },
      zone4: { min: 225, max: 254 },
      zone5: { min: 170, max: 224 },
    };
    expect(findZoneKeyForValue(300, RUN)).toBe('zone2');
    // 3:05/km is faster than the table's fastest band — still Z5, not thrown out.
    expect(findZoneKeyForValue(185, RUN)).toBe('zone5');
    // 11:23/km walking back is slower than Z1 — still Z1.
    expect(findZoneKeyForValue(683, RUN)).toBe('zone1');
  });

  it('has nothing to say without a table', () => {
    expect(findZoneKeyForValue(300, null)).toBeNull();
    expect(findZoneKeyForValue(300, {})).toBeNull();
    expect(findZoneKeyForValue(NaN, BIKE)).toBeNull();
  });
});
