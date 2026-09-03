import { mapExternalActivitiesToCalendar } from './mapExternalActivityToCalendar';
import { zoneSpansForActivity, lapPowerOrPaceMetric } from './lapZoneSpans';

describe('mapExternalActivitiesToCalendar', () => {
  // The activities endpoint sends this compact per-lap shape when the calendar
  // asks for it (withLapProfiles). The mapper used to drop it, which left every
  // Strava and Garmin session looking lapless downstream.
  const lapProfile = [
    { d: 286, m: 1490, s: 5.21 },
    { d: 122, m: 189, s: 1.55 },
    { d: 180, m: 971, s: 5.39 },
  ];

  it('carries the lap profile through to the calendar', () => {
    const [mapped] = mapExternalActivitiesToCalendar(
      [{ id: 'strava-1', sport: 'Run', startDate: '2026-09-02T10:00:00Z', lapProfile }],
      [],
    );
    expect(mapped.lapProfile).toHaveLength(3);
  });

  it('carries a saved Smart-detect split through as well', () => {
    const savedAutoLaps = [{ elapsed_time: 60, average_watts: 200 }];
    const [mapped] = mapExternalActivitiesToCalendar(
      [{ id: 'strava-2', sport: 'Ride', startDate: '2026-09-02T10:00:00Z', savedAutoLaps }],
      [],
    );
    expect(mapped.savedAutoLaps).toHaveLength(1);
  });

  it('leaves them null rather than empty when the endpoint sent none', () => {
    const [mapped] = mapExternalActivitiesToCalendar(
      [{ id: 'strava-3', sport: 'Run', startDate: '2026-09-02T10:00:00Z' }],
      [],
    );
    expect(mapped.lapProfile).toBeNull();
    expect(mapped.savedAutoLaps).toBeNull();
  });

  it('is what lets a run be placed in zones by lap rather than by average', () => {
    const [mapped] = mapExternalActivitiesToCalendar(
      [{ id: 'strava-4', sport: 'Run', startDate: '2026-09-02T10:00:00Z', lapProfile }],
      [],
    );
    // Pace zones, seconds per km, Z1 slowest.
    const zones = {
      zone1: { min: 330, max: 420 },
      zone2: { min: 285, max: 329 },
      zone3: { min: 255, max: 284 },
      zone4: { min: 225, max: 254 },
      zone5: { min: 170, max: 224 },
    };
    const spans = zoneSpansForActivity(mapped, 'running', zones, lapPowerOrPaceMetric);
    const byZone = spans.reduce((acc, { zoneKey, sec }) => {
      acc[zoneKey] = (acc[zoneKey] || 0) + sec;
      return acc;
    }, {});
    // Two reps near 3:10/km and a float at 10:45/km — not one block at the
    // session's average, which is what the card was showing.
    expect(byZone.zone5).toBe(286 + 180);
    expect(byZone.zone1).toBe(122);
  });
});
