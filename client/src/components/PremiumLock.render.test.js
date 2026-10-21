/**
 * The lock must never appear before we know whether the athlete pays for it.
 *
 * isPremium is `user != null && user.isPremium === true`, so in the moment
 * before the profile resolves it is indistinguishable from "free" — and a
 * paying subscriber saw a wall of "Premium feature" cards on every navigation,
 * which then quietly swapped to the real content. Guessing "locked" is the one
 * wrong guess: it accuses a customer of not having paid.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// heroicons and the upgrade modal are ESM / portal-bound; neither is what this
// test is about.
jest.mock('@heroicons/react/24/outline', () => ({ LockClosedIcon: () => null }));
jest.mock('./UpgradeModal', () => () => null);

// `mock`-prefixed so jest allows the factory to close over it.
const mockPremium = { isPremium: false, premiumResolved: true, gate: jest.fn(), UpgradeModalProps: {} };
jest.mock('../hooks/usePremium', () => ({ usePremium: () => mockPremium }));
const mockAuth = { user: { role: 'athlete' } };
jest.mock('../context/AuthProvider', () => ({ useAuth: () => mockAuth }));
jest.mock('../utils/analytics', () => ({ trackEvent: () => {} }));
jest.mock('../utils/isNativeApp', () => ({ isCapacitorNative: () => true }));

// eslint-disable-next-line import/first
import PremiumLock from './PremiumLock';

const render = (state) => {
  Object.assign(mockPremium, state);
  return renderToStaticMarkup(
    <PremiumLock feature="Form &amp; Fitness">
      <div>the real content</div>
    </PremiumLock>,
  );
};

describe('PremiumLock', () => {
  it('shows the lock to a resolved free user', () => {
    const html = render({ isPremium: false, premiumResolved: true });
    expect(html).toContain('Premium feature');
    expect(html).not.toContain('the real content');
  });

  it('renders the content for a premium user', () => {
    const html = render({ isPremium: true, premiumResolved: true });
    expect(html).toContain('the real content');
    expect(html).not.toContain('Premium feature');
  });

  it('claims nothing while the profile is still resolving', () => {
    const html = render({ isPremium: false, premiumResolved: false });
    // No accusation and no upsell — just a placeholder holding the space.
    expect(html).not.toContain('Premium feature');
    expect(html).not.toContain('Unlock with Premium');
    expect(html).not.toContain('Learn more');
    // Content stays unmounted so nothing fetches on a guess either way.
    expect(html).not.toContain('the real content');
  });

  describe('personal preview', () => {
    const renderPreview = (state, role = 'athlete') => {
      Object.assign(mockPremium, state);
      mockAuth.user = { role };
      return renderToStaticMarkup(
        <PremiumLock
          feature="Form"
          title="Form &amp; fitness"
          teaser={<div>your form is +8</div>}
          unlocks={['Your 90-day trend']}
        >
          <div>the real content</div>
        </PremiumLock>,
      );
    };

    it('shows the user their own number, what unlocks, and the price', () => {
      const html = renderPreview({ isPremium: false, premiumResolved: true });
      expect(html).toContain('your form is +8');
      expect(html).toContain('Your 90-day trend');
      expect(html).toContain('€6.99 a month');
      expect(html).toContain('14 days free');
      expect(html).not.toContain('the real content');
    });

    it('prices the coach plan for a coach', () => {
      const html = renderPreview({ isPremium: false, premiumResolved: true }, 'coach');
      expect(html).toContain('€14.99 a month');
    });

    it('offers nothing while the profile is still resolving', () => {
      const html = renderPreview({ isPremium: false, premiumResolved: false });
      expect(html).not.toContain('days free');
    });

    it('renders the content for a premium user', () => {
      const html = renderPreview({ isPremium: true, premiumResolved: true });
      expect(html).toContain('the real content');
      expect(html).not.toContain('your form is +8');
    });
  });
});
