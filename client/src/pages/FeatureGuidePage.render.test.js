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
jest.mock('../services/contactEmail', () => ({ sendContactEmail: jest.fn() }));
jest.mock('../utils/trainingZonesSetup', () => ({ requestTrainingZonesModal: jest.fn() }));

// `mock`-prefixed so jest allows the factory to close over it.
const mockAuth = { user: { role: 'athlete' } };
jest.mock('../context/AuthProvider', () => ({ useAuth: () => mockAuth }));

// eslint-disable-next-line import/first
import FeatureGuidePage from './FeatureGuidePage';

const renderPage = (user) => {
  mockAuth.user = user;
  return renderToStaticMarkup(<FeatureGuidePage />);
};

describe('FeatureGuidePage', () => {
  it('renders the sections and their cards for an athlete', () => {
    const view = renderPage({ role: 'athlete' });
    expect(view).toContain('What you can do in LaChart');
    expect(view).toContain('Get your training in');
    expect(view).toContain('Watch your lactate curve evolve');
    expect(view).toContain('Build a whole training block');
  });

  it('puts a working destination on every card', () => {
    const view = renderPage({ role: 'athlete' });
    // Each card's button carries its call to action; the count should match the
    // number of features, not be a single "learn more" at the bottom.
    expect((view.match(/Open integrations|Build a block|View my tests/g) || []).length)
      .toBeGreaterThanOrEqual(3);
  });

  it('keeps coach-only cards away from an athlete', () => {
    const view = renderPage({ role: 'athlete' });
    expect(view).not.toContain('Brand your PDF reports');
  });

  it('shows them to a coach', () => {
    const view = renderPage({ role: 'coach' });
    expect(view).toContain('Brand your PDF reports');
  });

  it('counts the features in the header', () => {
    const view = renderPage({ role: 'athlete' });
    expect(view).toMatch(/\d+ things this app does/);
  });

  it('survives a missing user rather than blanking the page', () => {
    const view = renderPage(null);
    expect(view).toContain('What you can do in LaChart');
  });

  it('ends with somewhere to ask what the guide did not answer', () => {
    const view = renderPage({ role: 'athlete', email: 'jana@example.com' });
    expect(view).toContain('Still have a question?');
    expect(view).toContain('<textarea');
    // The reply address is prefilled — nobody should have to type their own.
    expect(view).toContain('value="jana@example.com"');
  });

  it('leaves the reply field empty when we have no address on file', () => {
    const view = renderPage({ role: 'athlete' });
    expect(view).toContain('Still have a question?');
    expect(view).not.toContain('undefined');
  });
});
