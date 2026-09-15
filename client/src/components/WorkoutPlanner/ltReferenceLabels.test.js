import { ltReferenceLabels } from './WorkoutBuilder';

describe('ltReferenceLabels', () => {
  it('is watts on the bike', () => {
    expect(ltReferenceLabels({ sport: 'bike', lt2Power: 402, lt1Power: 318 })).toEqual({ lt2: '402W', lt1: '318W' });
  });
  it('is pace for a swim and a run, never the pseudo-watts the bars are scaled by', () => {
    const swim = ltReferenceLabels({ sport: 'swim', lt2Power: 402, lt1Power: 318, lt2Swim: 95, lt1Swim: 105 });
    expect(swim.lt2).toMatch(/^1:35/);
    expect(swim.lt1).toMatch(/^1:45/);
    expect(swim.lt2).not.toMatch(/W/);
    const run = ltReferenceLabels({ sport: 'run', lt2Power: 402, lt1Power: 318, lt2Pace: 240, lt1Pace: 270 });
    expect(run.lt2).toMatch(/^4:00/);
    expect(run.lt1).toMatch(/^4:30/);
  });
  it('shows nothing for a swim with no pace reference', () => {
    expect(ltReferenceLabels({ sport: 'swim', lt2Power: 402, lt1Power: 318 })).toEqual({ lt2: null, lt1: null });
  });
});
