/**
 * A week total printed 0m while its distance and session count were right.
 *
 * One hand-entered training is enough: the Training model stores its duration
 * the way a person writes one ("4:10:12"), every synced activity stores a
 * number, and Number("4:10:12") is NaN. A sum with one NaN in it is NaN, and
 * every formatter in the app prints NaN as "0m".
 */

import { completedSecs, durationSecs } from './completedSessionStats';

describe('durationSecs', () => {
  it('reads a clock the way a person wrote it', () => {
    expect(durationSecs('4:10:12')).toBe(4 * 3600 + 10 * 60 + 12);
    expect(durationSecs('1:24')).toBe(84);
    expect(durationSecs('0:45:00')).toBe(2700);
  });

  it('passes numbers through', () => {
    expect(durationSecs(3600)).toBe(3600);
    expect(durationSecs('3600')).toBe(3600);
  });

  it('is zero for anything unusable, never NaN', () => {
    for (const junk of [null, undefined, '', 'soon', '1:2:3:4', '-5:00', {}, NaN]) {
      const out = durationSecs(junk);
      expect(Number.isFinite(out)).toBe(true);
      expect(out).toBe(0);
    }
  });
});

describe('completedSecs', () => {
  it('takes the whole session from totalTime first', () => {
    expect(completedSecs({ totalTime: 8948, movingTime: 8147 })).toBe(8948);
  });

  it('reads a hand-entered training instead of returning zero', () => {
    // This is the record that zeroed the week: no totalTime, duration a string.
    expect(completedSecs({ duration: '4:10:12' })).toBe(15012);
  });

  it('falls through the chain when the fields above are absent', () => {
    expect(completedSecs({ movingTime: 3000 })).toBe(3000);
    expect(completedSecs({ elapsed_time: 1200 })).toBe(1200);
    expect(completedSecs({ durationSeconds: 900 })).toBe(900);
  });

  it('a week of mixed sources adds up instead of collapsing to NaN', () => {
    const week = [
      { totalTime: 8948 },                 // Strava ride
      { duration: '1:07:00' },             // hand-entered swim
      { movingTime: 3000 },                // Garmin run
      { totalTime: null, duration: null }, // a record with nothing usable
    ];
    const total = week.reduce((sum, a) => sum + completedSecs(a), 0);
    expect(total).toBe(8948 + 4020 + 3000);
    expect(Number.isFinite(total)).toBe(true);
  });
});
