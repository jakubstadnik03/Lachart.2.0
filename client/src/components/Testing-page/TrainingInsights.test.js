import { defaultOpenIds } from './TrainingInsights';

describe('defaultOpenIds', () => {
  it('opens every warning and nothing else', () => {
    const open = defaultOpenIds([
      { id: 'now', tone: 'good' },
      { id: 'zones', tone: 'warn' },
      { id: 'retest', tone: 'warn' },
      { id: 'evidence', tone: 'neutral' },
    ]);
    expect([...open]).toEqual(['zones', 'retest']);
  });

  it('opens the first row when nothing warns', () => {
    const open = defaultOpenIds([{ id: 'now', tone: 'good' }, { id: 'split', tone: 'info' }]);
    expect([...open]).toEqual(['now']);
  });

  it('is empty for no insights', () => {
    expect(defaultOpenIds([]).size).toBe(0);
  });
});
