import { PRESET_CATALOG } from '../components/WorkoutPlanner/WorkoutBuilder';
import {
  aerobicShare,
  prescriptionDates,
  prescriptionProfile,
  prescribeFromTest,
} from './testWorkoutPrescription';

const keys = new Set(PRESET_CATALOG.map((p) => p.key));

describe('aerobicShare', () => {
  it('is LT1 watts over LT2 watts on the bike', () => {
    expect(aerobicShare({ sport: 'bike', lt1_value: 180, lt2_value: 300 })).toBeCloseTo(0.6);
  });

  it('flips pace so a closer pair is a higher share', () => {
    // 4:30 /km threshold, 5:00 /km aerobic → speed share 270/300 = 0.9
    expect(aerobicShare({ sport: 'run', lt1_value: 300, lt2_value: 270 })).toBeCloseTo(0.9);
  });

  it('is null without a usable pair', () => {
    expect(aerobicShare(null)).toBeNull();
    expect(aerobicShare({ sport: 'other', lt1_value: 100, lt2_value: 200 })).toBeNull();
    expect(aerobicShare({ sport: 'bike', lt1_value: 0, lt2_value: 200 })).toBeNull();
  });
});

describe('prescriptionProfile', () => {
  it('calls a wide gap a base week and a narrow one a ceiling week', () => {
    expect(prescriptionProfile(0.6)).toBe('base');
    expect(prescriptionProfile(0.74)).toBe('base');
    expect(prescriptionProfile(0.75)).toBe('balanced');
    expect(prescriptionProfile(0.87)).toBe('balanced');
    expect(prescriptionProfile(0.88)).toBe('ceiling');
  });
});

describe('prescribeFromTest', () => {
  it('builds three real workouts for each sport', () => {
    const cases = [
      { sport: 'bike', lt1_value: 160, lt2_value: 280, profile: 'base' },
      { sport: 'bike', lt1_value: 250, lt2_value: 270, profile: 'ceiling' },
      { sport: 'run', lt1_value: 360, lt2_value: 300, profile: 'balanced' },
      { sport: 'swim', lt1_value: 110, lt2_value: 90, profile: 'balanced' },
    ];
    cases.forEach((anchors) => {
      const week = prescribeFromTest(anchors);
      expect(week.profile).toBe(anchors.profile);
      expect(week.sessions).toHaveLength(3);
      week.sessions.forEach((s) => {
        expect(keys.has(s.presetKey)).toBe(true);
        expect(s.name).toBeTruthy();
        expect(s.why).toBeTruthy();
      });
    });
  });

  it('is null when the test cannot support a week', () => {
    expect(prescribeFromTest({ sport: 'bike' })).toBeNull();
  });
});

describe('prescriptionDates', () => {
  it('keeps Tuesday of this week when today is Monday or Tuesday', () => {
    // Monday 28 Sep 2026
    const fromMonday = prescriptionDates(new Date(2026, 8, 28, 9));
    expect(fromMonday.map((d) => d.getDate())).toEqual([29, 1, 3]);
    // Tuesday 29 Sep 2026 — Tuesday is today, still this week
    const fromTuesday = prescriptionDates(new Date(2026, 8, 29, 18));
    expect(fromTuesday.map((d) => d.getDate())).toEqual([29, 1, 3]);
  });

  it('moves the whole set to next week once Wednesday has passed the Tuesday', () => {
    // Wednesday 30 Sep 2026 → Tue 6, Thu 8, Sat 10 Oct
    const dates = prescriptionDates(new Date(2026, 8, 30, 15));
    expect(dates.map((d) => [d.getMonth(), d.getDate()])).toEqual([[9, 6], [9, 8], [9, 10]]);
  });

  it('does the same on Sunday, so the three days stay in one week', () => {
    // Sunday 27 Sep 2026 → the week of 28 Sep
    const dates = prescriptionDates(new Date(2026, 8, 27, 11));
    expect(dates.map((d) => d.getDate())).toEqual([29, 1, 3]);
  });
});
