import { parseHoursToMinutes, formatMinutesAsClock } from './dailyMetricsFormat';

describe('hours typed by a person', () => {
  it('takes a clock', () => {
    expect(parseHoursToMinutes('8:15')).toBe(495);
    expect(parseHoursToMinutes('7:00')).toBe(420);
    expect(parseHoursToMinutes('0:45')).toBe(45);
  });

  it('takes a decimal, comma or point', () => {
    // Athletes type both; a log that rejects one of them is a log with holes.
    expect(parseHoursToMinutes('7.5')).toBe(450);
    expect(parseHoursToMinutes('7,5')).toBe(450);
    expect(parseHoursToMinutes('8')).toBe(480);
  });

  it('refuses nonsense rather than storing a guess', () => {
    expect(parseHoursToMinutes('8:75')).toBeNull();
    expect(parseHoursToMinutes('abc')).toBeNull();
    expect(parseHoursToMinutes('-2')).toBeNull();
    expect(parseHoursToMinutes('')).toBeNull();
  });

  it('renders back to the clock it was typed as', () => {
    expect(formatMinutesAsClock(495)).toBe('8:15');
    expect(formatMinutesAsClock(60)).toBe('1:00');
    expect(formatMinutesAsClock(null)).toBe('');
  });

  it('round-trips', () => {
    ['8:15', '7:00', '0:45', '10:30'].forEach((s) => {
      expect(formatMinutesAsClock(parseHoursToMinutes(s))).toBe(s);
    });
  });
});
