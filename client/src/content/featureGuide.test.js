/**
 * A guide that promises a feature the athlete cannot reach is worse than no
 * guide, so these tests are mostly about the links and about who sees what.
 */
jest.mock('@heroicons/react/24/outline', () => new Proxy({}, {
  get: (_t, name) => (name === '__esModule' ? true : () => null),
}));

// eslint-disable-next-line import/first
import {
  FEATURE_ENTRIES,
  FEATURE_KEYWORDS,
  GUIDE_SECTIONS,
  buildFeatureGuide,
  countFeatures,
  matchesQuery,
} from './featureGuide';

describe('the catalogue itself', () => {
  it('gives every entry the things the card renders', () => {
    for (const e of FEATURE_ENTRIES) {
      expect(typeof e.title).toBe('string');
      expect(e.title.length).toBeGreaterThan(0);
      expect(typeof e.body).toBe('string');
      expect(e.body.length).toBeGreaterThan(0);
      expect(typeof e.href).toBe('string');
      expect(e.href).toMatch(/^(\/|https?:\/\/)/);
      expect(typeof e.cta).toBe('string');
      expect(Array.isArray(e.bullets)).toBe(true);
    }
  });

  it('ships no screenshot it cannot actually load', () => {
    // A missing file leaves a broken-image box on the one page whose job is to
    // look inviting — and nothing else would tell us the asset was renamed.
    const fs = require('fs');
    const path = require('path');
    const publicDir = path.join(__dirname, '..', '..', 'public');
    for (const e of FEATURE_ENTRIES) {
      if (!e.image) continue;
      expect(e.image.startsWith('/')).toBe(true);
      expect(fs.existsSync(path.join(publicDir, e.image))).toBe(true);
    }
  });

  it('never shows the same picture on two cards', () => {
    // Repeating one mockup across four features makes it decoration.
    const shots = FEATURE_ENTRIES.map((e) => e.image).filter(Boolean);
    expect(new Set(shots).size).toBe(shots.length);
  });

  it('illustrates the features people come looking for', () => {
    const shotOf = (id) => FEATURE_ENTRIES.find((e) => e.id === id)?.image;
    for (const id of ['plan-workout', 'lactate-curve', 'form-fitness', 'analyze-workout']) {
      expect(shotOf(id)).toBeTruthy();
    }
  });

  it('shows phone screenshots, not the desktop marketing shots', () => {
    // Those are captured from a real account: the sidebar carries a name and
    // an email address, and a card-sized crop of a browser window is unreadable.
    for (const e of FEATURE_ENTRIES) {
      if (!e.image) continue;
      expect(e.image).toMatch(/^\/images\/ios-launch\//);
    }
  });

  it('sends "plan a workout" to the form, not just the calendar', () => {
    const plan = FEATURE_ENTRIES.find((e) => e.id === 'plan-workout');
    expect(plan.href).toBe('/training-calendar?plan=new');
  });

  it('opens the zones where they live rather than in Settings', () => {
    // The release slide pointed at /settings, which has no zones tab.
    const zones = FEATURE_ENTRIES.find((e) => e.id === 'training-zones');
    expect(zones.action).toBe('zones');
    expect(zones.href).not.toContain('/settings');
  });

  it('keeps every destination inside the app or on a real site', () => {
    for (const e of FEATURE_ENTRIES) {
      if (e.action) continue;
      expect(e.href).not.toMatch(/undefined|null/);
    }
  });

  it('has no duplicate ids', () => {
    const ids = FEATURE_ENTRIES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every entry Czech words to be found by', () => {
    // Without this the next feature added is invisible to a Czech search, and
    // nothing else would ever tell us.
    for (const e of FEATURE_ENTRIES) {
      expect(typeof FEATURE_KEYWORDS[e.id]).toBe('string');
      expect(FEATURE_KEYWORDS[e.id].trim().length).toBeGreaterThan(0);
    }
  });

  it('files every entry under a section that exists', () => {
    const known = new Set(GUIDE_SECTIONS.map((s) => s.id));
    for (const e of FEATURE_ENTRIES) expect(known.has(e.section)).toBe(true);
  });

  it('covers the whole release catalogue, not a subset', () => {
    // The guide is the permanent home of what the What's New modal says once.
    const { WHATS_NEW_SLIDES } = require('./whatsNewSlides');
    const ids = new Set(FEATURE_ENTRIES.map((e) => e.id));
    for (const slide of WHATS_NEW_SLIDES) expect(ids.has(slide.id)).toBe(true);
  });
});

describe('buildFeatureGuide', () => {
  it('hides coach-only features from an athlete', () => {
    const athlete = buildFeatureGuide({ isCoach: false }).flatMap((s) => s.items);
    expect(athlete.some((e) => e.coachOnly)).toBe(false);

    const coach = buildFeatureGuide({ isCoach: true }).flatMap((s) => s.items);
    expect(coach.some((e) => e.coachOnly)).toBe(true);
  });

  it('offers the annual plan to everyone, now that the route is open', () => {
    // It was behind allowedRoles={['admin']} during the soft launch, and this
    // test guarded athletes against being sent at a wall. The route is open,
    // so the guard is the wrong way round now.
    const athlete = buildFeatureGuide({}).flatMap((s) => s.items);
    expect(athlete.some((e) => e.href === '/annual-training-plan')).toBe(true);

    const admin = buildFeatureGuide({ isAdmin: true }).flatMap((s) => s.items);
    expect(admin.some((e) => e.href === '/annual-training-plan')).toBe(true);
  });

  it('stops advertising Strava to someone already connected', () => {
    const connected = buildFeatureGuide({ stravaConnected: true }).flatMap((s) => s.items);
    expect(connected.some((e) => e.stravaOnly)).toBe(false);
  });

  it('still shows it when the connection state is unknown', () => {
    // Better a redundant card than a missing one — undefined means "not loaded yet".
    const unknown = buildFeatureGuide({}).flatMap((s) => s.items);
    expect(unknown.some((e) => e.stravaOnly)).toBe(true);
  });

  it('keeps sections in their declared order', () => {
    const order = buildFeatureGuide({ isCoach: true }).map((s) => s.id);
    const expected = GUIDE_SECTIONS.map((s) => s.id).filter((id) => order.includes(id));
    expect(order).toEqual(expected);
  });

  it('drops sections the search emptied instead of leaving a bare heading', () => {
    const sections = buildFeatureGuide({ query: 'lactate' });
    expect(sections.length).toBeGreaterThan(0);
    for (const s of sections) expect(s.items.length).toBeGreaterThan(0);
  });

  it('finds things by what an athlete would type', () => {
    const hit = (q) => buildFeatureGuide({ isCoach: true, query: q }).flatMap((s) => s.items);
    expect(hit('garmin').length).toBeGreaterThan(0);
    expect(hit('pdf').length).toBeGreaterThan(0);
    expect(hit('vlamax').length).toBeGreaterThan(0);
    expect(hit('race').length).toBeGreaterThan(0);
    expect(hit('zzzz')).toHaveLength(0);
  });

  it('answers Czech words, with or without the diacritics', () => {
    // The interface is English; the athletes typing into it are not.
    const ids = (q) => buildFeatureGuide({ isCoach: true, isAdmin: true, query: q })
      .flatMap((s) => s.items).map((e) => e.id);
    expect(ids('laktát')).toContain('lactate-curve');
    expect(ids('laktat')).toContain('lactate-curve');
    expect(ids('závod')).toContain('race-planning');
    expect(ids('zavod')).toContain('race-planning');
    expect(ids('zóny')).toContain('training-zones');
    expect(ids('plavání')).toContain('block-builder');
    expect(ids('nemoc')).toContain('health-log');
    expect(ids('sezona')).toContain('annual-plan');
  });

  it('is not upset by the capital iOS puts on the first letter', () => {
    const ids = (q) => buildFeatureGuide({ query: q }).flatMap((s) => s.items).map((e) => e.id);
    expect(ids('Laktat')).toContain('lactate-curve');
    expect(ids('GARMIN')).toContain('garmin-apple-health');
  });
});

describe('matchesQuery', () => {
  const entry = {
    title: 'Watch your lactate curve evolve',
    body: 'Every new test rebuilds your curve',
    label: 'Lactate testing',
    bullets: ['Trend lines for LT1 / LT2 over time'],
  };

  it('ignores case and empty queries', () => {
    expect(matchesQuery(entry, '')).toBe(true);
    expect(matchesQuery(entry, '   ')).toBe(true);
    expect(matchesQuery(entry, 'LACTATE')).toBe(true);
  });

  it('narrows on every word rather than any of them', () => {
    expect(matchesQuery(entry, 'lactate curve')).toBe(true);
    expect(matchesQuery(entry, 'lactate garmin')).toBe(false);
  });

  it('searches the bullets too', () => {
    expect(matchesQuery(entry, 'lt2')).toBe(true);
  });
});

describe('countFeatures', () => {
  it('counts what the athlete will actually see', () => {
    const athlete = countFeatures({ isCoach: false });
    const coach = countFeatures({ isCoach: true });
    expect(athlete).toBeGreaterThan(15);
    expect(coach).toBeGreaterThan(athlete);
  });
});
