/**
 * Sessions typed the way a coach writes them, and what the builder gets.
 */
import { parseWorkoutText } from './workoutText';

const flat = (items) => items.map((it) => {
  if (it.step) return `${it.step.stepType}:${it.step.durationSeconds ?? `${it.step.distanceMeters}m`}:${JSON.stringify(it.step.powerTarget)}`;
  if (it.repeat) return `${it.repeat}x[${it.members.map((s) => `${s.stepType}:${s.durationSeconds ?? `${s.distanceMeters}m`}:${JSON.stringify(s.powerTarget)}`).join(' ')}]`;
  return `build:${it.build.count}x${it.build.secs}${it.build.to ? ':' + JSON.stringify(it.build.to) : ''}`;
});

describe('parseWorkoutText', () => {
  it('reads the classic line', () => {
    const { items, warnings } = parseWorkoutText('15min WU, 4x10min LT2 2min rec, 10min CD');
    expect(flat(items)).toEqual([
      'warmup:900:{"type":"zone","value":1}',
      '4x[work:600:{"type":"lt2"} recovery:120:{"type":"zone","value":1}]',
      'cooldown:600:{"type":"zone","value":1}',
    ]);
    expect(warnings).toEqual([]);
  });

  it('reads the whiteboard version with a build, parentheses, LT1 and zones', () => {
    const { items } = parseWorkoutText('5x3min build\n5min easy\n3x(8min LT1 + 3min Z1)\n10min cooldown');
    expect(flat(items)).toEqual([
      'build:5x180',
      'recovery:300:{"type":"zone","value":1}',
      '3x[work:480:{"type":"lt1"} recovery:180:{"type":"zone","value":1}]',
      'cooldown:600:{"type":"zone","value":1}',
    ]);
  });

  it('takes a build with a target and a plain build length', () => {
    expect(flat(parseWorkoutText('15min build to Z3').items)).toEqual(['build:5x180:{"type":"zone","value":3}']);
    expect(flat(parseWorkoutText('4x2min navyšování').items)).toEqual(['build:4x120']);
  });

  it('understands time in its usual spellings', () => {
    const { items } = parseWorkoutText("1h Z2; 1:30 Z5; 90s rest; 20' tempo; 2h15 endurance");
    expect(flat(items)).toEqual([
      'work:3600:{"type":"zone","value":2}',
      'work:90:{"type":"zone","value":5}',
      'rest:90:{"type":"open"}',
      'work:1200:{"type":"zone","value":3}',
      'work:8100:{"type":"zone","value":2}',
    ]);
  });

  it('reads distance for the pool and the track', () => {
    const { items } = parseWorkoutText('400m easy / 8x100m Z5 30s rest / 200m CD');
    expect(flat(items)).toEqual([
      'recovery:400m:{"type":"zone","value":1}',
      '8x[work:100m:{"type":"zone","value":5} rest:30:{"type":"open"}]',
      'cooldown:200m:{"type":"zone","value":1}',
    ]);
  });

  it('accepts watts, percent FTP and sweet spot, and intensity before the time', () => {
    const { items } = parseWorkoutText('LT2 10min, 250W 5min, 90% 20min, 2x20min sweet spot 5min easy');
    expect(flat(items)).toEqual([
      'work:600:{"type":"lt2"}',
      'work:300:{"type":"watts","value":250}',
      'work:1200:{"type":"percent_ftp","value":90}',
      '2x[work:1200:{"type":"percent_ftp","value":90} recovery:300:{"type":"zone","value":1}]',
    ]);
  });

  it('says what it could not place instead of dropping it quietly', () => {
    const { items, warnings } = parseWorkoutText('10min, 5min banana');
    expect(flat(items)).toEqual(['work:600:{"type":"zone","value":2}', 'work:300:{"type":"zone","value":2}']);
    expect(warnings).toEqual([
      'No intensity for “10min” — set to Z2',
      'Did not understand “banana”',
      'No intensity for “5min banana” — set to Z2',
    ]);
    expect(parseWorkoutText('').items).toEqual([]);
  });
});
