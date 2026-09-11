/**
 * Threshold formatting follows the viewer's units.
 *
 * An athlete on miles read "20 min at 7:27/km" under a run whose header said
 * "12:21/mi". Every pace the panels print goes through these.
 */
import { fmtDemand, fmtDemandDelta, axisTick, demandUnitLabel } from './thresholdFormat';
import { setViewerUnitSystem } from './viewerUnits';

afterEach(() => setViewerUnitSystem('metric'));

// 4:00/km is 4.1667 m/s
const DEMAND = 1000 / 240;

test('metric: a run threshold reads per kilometre', () => {
  expect(fmtDemand(DEMAND, 'run', 'pace')).toBe('4:00/km');
  expect(demandUnitLabel('run', 'pace')).toBe('Pace (min/km)');
  expect(axisTick(DEMAND, 'run', 'pace')).toBe('4:00');
});

test('imperial: the same threshold reads per mile', () => {
  setViewerUnitSystem('imperial');
  expect(fmtDemand(DEMAND, 'run', 'pace')).toBe('6:26/mi');
  expect(demandUnitLabel('run', 'pace')).toBe('Pace (min/mi)');
  expect(axisTick(DEMAND, 'run', 'pace')).toBe('6:26');
  expect(fmtDemand(20 / 3.6, 'run', 'speed')).toBe('12.4 mph');
  expect(demandUnitLabel('run', 'speed')).toBe('mph');
});

test('a pace delta keeps "plus means faster" and takes the viewer unit', () => {
  // Faster by 0.1 m/s: fewer seconds per km, printed as +.
  const metric = fmtDemandDelta(0.1, DEMAND, 'run', 'pace');
  expect(metric.startsWith('+')).toBe(true);
  expect(metric.endsWith('s/km')).toBe(true);
  setViewerUnitSystem('imperial');
  const imperial = fmtDemandDelta(0.1, DEMAND, 'run', 'pace');
  expect(imperial.endsWith('s/mi')).toBe(true);
  expect(parseInt(imperial, 10)).toBeGreaterThan(parseInt(metric, 10));
});

test('watts are watts everywhere', () => {
  setViewerUnitSystem('imperial');
  expect(fmtDemand(265, 'bike', 'power')).toBe('265 W');
  expect(fmtDemandDelta(5, 265, 'bike', 'power')).toBe('+5 W');
});
