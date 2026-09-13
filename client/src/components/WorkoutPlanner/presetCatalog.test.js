/**
 * Every built-in workout in the catalogue builds into steps, carries a
 * category, and no key is listed twice.
 */
import { PRESET_CATALOG, PRESET_CATEGORY_LABELS, buildPresetSteps, expandSteps } from './WorkoutBuilder';

describe('PRESET_CATALOG', () => {
  it('has unique keys and a category with a label for each', () => {
    const keys = PRESET_CATALOG.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
    PRESET_CATALOG.forEach((p) => {
      expect(PRESET_CATEGORY_LABELS[p.cat]).toBeTruthy();
      expect(['bike', 'run', 'swim']).toContain(p.sport);
    });
  });

  it('builds steps for every preset, each with a length', () => {
    PRESET_CATALOG.forEach((p) => {
      const steps = buildPresetSteps(p.key);
      expect(steps.length).toBeGreaterThan(0);
      steps.forEach((s) => expect(s.durationSeconds).toBeGreaterThan(0));
      expect(expandSteps(steps).reduce((a, s) => a + s.durationSeconds, 0)).toBeGreaterThan(0);
    });
  });

  it('covers every sport with a fair spread of categories', () => {
    for (const sport of ['bike', 'run', 'swim']) {
      const cats = new Set(PRESET_CATALOG.filter((p) => p.sport === sport).map((p) => p.cat));
      expect(cats.size).toBeGreaterThanOrEqual(5);
    }
  });
});
