/**
 * calculateZonesFromTest end to end: the zones the profile receives are built
 * around the same LT1/LT2 the test page shows, and HR zones are either usable
 * or replaced by a reason.
 */
import { calculateThresholds } from './DataTable';
import { calculateZonesFromTest } from './zoneCalculator';

jest.mock('../../services/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));

const bike = (rows) => ({
  sport: 'bike', baseLactate: 1.0,
  results: rows.map(([power, lactate, heartRate]) => ({ power, lactate, heartRate })),
});
const ZONES = ['zone1', 'zone2', 'zone3', 'zone4', 'zone5'];

function expectContiguous(zones, ascending = true) {
  ZONES.forEach((z, i) => {
    const { min, max } = zones[z];
    expect(ascending ? max > min : max < min).toBe(true);
    if (i > 0) expect(min).toBe(zones[ZONES[i - 1]].max);
  });
}

describe('calculateZonesFromTest', () => {
  it('builds the profile zones around the LT2 the page shows, even when LT1 and LT2 are under 20 W apart', () => {
    // A low-power rider: LT1 ~101 W, LT2 ~118 W. The old 20 W rule replaced LT2
    // with a raw-stage OBLA 3.5 (131 W) for the profile only.
    const test = bike([[60, 1.0, 104], [75, 1.1, 110], [90, 1.3, 118], [105, 2.0, 128], [120, 3.9, 139], [135, 6.8, 150]]);
    const th = calculateThresholds(test);
    const zones = calculateZonesFromTest(test);
    expect(zones.power.zone3.min).toBe(Math.round(th.LTP1));
    expect(zones.power.zone4.min).toBeLessThan(th.LTP2);
    expect(zones.power.zone4.max).toBeGreaterThan(th.LTP2);
    expectContiguous(zones.power);
    expectContiguous(zones.heartRate);
  });

  it('gives a plateauing-HR test a usable Z3 and explains the Z4 band', () => {
    const zones = calculateZonesFromTest(bike([[140, 1.0, 122], [170, 1.1, 133], [200, 1.4, 143], [230, 2.0, 151], [260, 3.1, 156], [290, 5.0, 158], [320, 8.2, 159]]));
    expectContiguous(zones.heartRate);
    expect(zones.heartRate.zone3.max - zones.heartRate.zone3.min).toBeGreaterThanOrEqual(4);
    expect(zones.heartRateNote).toMatch(/power is the better guide/);
  });

  it('leaves HR zones out, with the reason, when HR barely moved between the thresholds', () => {
    const zones = calculateZonesFromTest(bike([[150, 1.2, 140], [180, 1.3, 138], [210, 1.6, 146], [240, 2.4, 150], [270, 3.8, 149], [300, 6.1, 160]]));
    expectContiguous(zones.power);
    expect(zones.heartRate).toBeNull();
    expect(zones.heartRateNote).toMatch(/too little to tell the zones apart/);
  });

  it('still produces HR zones for a test with manual threshold overrides', () => {
    const test = {
      ...bike([[150, 1.1, 118], [175, 1.0, 126], [200, 1.2, 134], [225, 1.5, 142], [250, 2.1, 151], [275, 3.2, 161], [300, 5.4, 171]]),
      thresholdOverrides: { LTP1: 220, LTP2: 270 },
    };
    const zones = calculateZonesFromTest(test);
    expect(zones.power.zone3.min).toBe(220);
    // HR at 220 W read between 200 W @ 134 and 225 W @ 142.
    expect(zones.heartRate.zone3.min).toBe(140);
    expectContiguous(zones.heartRate);
  });
});
