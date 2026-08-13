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
});
