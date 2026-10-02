import { elevationGainMeters, normalizedPower, summarizeTrace } from './traceSummary';

describe('normalizedPower', () => {
  it('is the power itself when the trace never moves', () => {
    expect(normalizedPower(Array.from({ length: 60 }, () => 250))).toBe(250);
  });

  it('is zero when there is no power', () => {
    expect(normalizedPower([])).toBe(0);
    expect(normalizedPower([null, 0, null])).toBe(0);
  });
});

describe('elevationGainMeters', () => {
  it('sums the climbs and ignores the jitter', () => {
    // 100 → 110 is +10. The drop to 108 resets the baseline, then 108 → 120 is +12.
    expect(elevationGainMeters([100, 100.2, 110, 108, 120])).toBe(22);
  });
});

describe('summarizeTrace', () => {
  it('reads the headline numbers off the samples the chart already has', () => {
    const records = Array.from({ length: 40 }, (_, i) => ({
      power: i < 30 ? 200 : 400,
      cadence: 80,
      heartRate: 140 + (i % 5),
      altitude: 50 + i,
    }));
    const s = summarizeTrace(records);
    expect(s.avgPower).toBe(250);
    expect(s.maxPower).toBe(400);
    expect(s.normalizedPower).toBeGreaterThan(200);
    expect(s.avgCadence).toBe(80);
    expect(s.maxHeartRate).toBe(144);
    expect(s.elevationGain).toBeGreaterThan(0);
  });
});
