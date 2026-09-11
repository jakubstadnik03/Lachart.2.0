/**
 * The viewer's pace units. Stored pace never changes; what is printed does.
 */
import {
  setViewerUnitSystem, viewerPaceSuffix, paceToViewer, paceFromViewer,
  fmtViewerPace, fmtViewerPaceDelta, setViewerUnitsFromUser, viewerUnitSystem,
} from './viewerUnits';

afterEach(() => setViewerUnitSystem('metric'));

test('metric prints stored pace as it is', () => {
  expect(fmtViewerPace(260, 'run')).toBe('4:20/km');
  expect(fmtViewerPace(95, 'swim')).toBe('1:35/100m');
  expect(viewerPaceSuffix('run')).toBe('/km');
});

test('imperial converts a run to miles and a swim to 100 yards', () => {
  setViewerUnitSystem('imperial');
  expect(fmtViewerPace(260, 'run')).toBe('6:58/mi');
  expect(fmtViewerPace(100, 'swim')).toBe('1:31/100yd');
  expect(viewerPaceSuffix('running')).toBe('/mi');
  expect(viewerPaceSuffix('swimming')).toBe('/100yd');
});

test('a pace typed in miles is stored per kilometre', () => {
  setViewerUnitSystem('imperial');
  const stored = paceFromViewer(7 * 60, 'run');
  expect(Math.round(stored)).toBe(261);
  expect(Math.round(paceToViewer(stored, 'run'))).toBe(420);
});

test('a delta keeps its sign and takes the viewer unit', () => {
  setViewerUnitSystem('imperial');
  expect(fmtViewerPaceDelta(-10, 'run')).toBe('-16 s/mi');
  setViewerUnitSystem('metric');
  expect(fmtViewerPaceDelta(8, 'run')).toBe('+8 s/km');
});

test('follows the user profile, including legacy spellings', () => {
  setViewerUnitsFromUser({ units: { distance: 'miles' } });
  expect(viewerUnitSystem()).toBe('imperial');
  setViewerUnitsFromUser({ units: { distance: 'metric' } });
  expect(viewerUnitSystem()).toBe('metric');
  setViewerUnitsFromUser(null);
  expect(viewerUnitSystem()).toBe('metric');
});
