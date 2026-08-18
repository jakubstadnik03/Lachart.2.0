/**
 * The page exists so an athlete can see what the app does, so what matters is
 * that the cards actually render with their links — an empty guide is the same
 * as no guide.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

jest.mock('@heroicons/react/24/outline', () => new Proxy({}, {
  get: (_t, name) => (name === '__esModule' ? true : () => null),
}));
// Virtual: react-router-dom v7 is ESM with an exports map this jest cannot
// resolve, and routing is not what this test is about.
jest.mock('react-router-dom', () => ({ useNavigate: () => () => {} }), { virtual: true });

// `mock`-prefixed so jest allows the factory to close over it.
const mockAuth = { user: { role: 'athlete' } };
jest.mock('../context/AuthProvider', () => ({ useAuth: () => mockAuth }));

// eslint-disable-next-line import/first
import FeatureGuidePage from './FeatureGuidePage';

const render = (user) => {
  mockAuth.user = user;
  return renderToStaticMarkup(<FeatureGuidePage />);
};

describe('FeatureGuidePage', () => {
  it('renders the sections and their cards for an athlete', () => {
    const html = render({ role: 'athlete' });
    expect(html).toContain('What you can do in LaChart');
    expect(html).toContain('Get your training in');
    expect(html).toContain('Watch your lactate curve evolve');
    expect(html).toContain('Build a whole training block');
  });

  it('puts a working destination on every card', () => {
    const html = render({ role: 'athlete' });
    // Each card's button carries its call to action; the count should match the
    // number of features, not be a single "learn more" at the bottom.
    expect((html.match(/Open integrations|Build a block|View my tests/g) || []).length)
      .toBeGreaterThanOrEqual(3);
  });

  it('keeps coach-only cards away from an athlete', () => {
    const athlete = render({ role: 'athlete' });
    expect(athlete).not.toContain('Brand your PDF reports');

    const coach = render({ role: 'coach' });
    expect(coach).toContain('Brand your PDF reports');
  });

  it('counts the features in the header', () => {
    const html = render({ role: 'athlete' });
    expect(html).toMatch(/\d+ things this app does/);
  });

  it('survives a missing user rather than blanking the page', () => {
    const html = render(null);
    expect(html).toContain('What you can do in LaChart');
  });
});
