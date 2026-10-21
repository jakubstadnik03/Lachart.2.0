/**
 * The locked cards on the native testing and training pages quote the
 * athlete's own numbers back at them. These check that each teaser says
 * something true from the data it is handed, and that the lock around it shows
 * that teaser to a free user and the real card to a paying one.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

jest.mock('@heroicons/react/24/outline', () => ({ LockClosedIcon: () => null }));
jest.mock('../UpgradeModal', () => () => null);

const mockPremium = { isPremium: false, premiumResolved: true, gate: jest.fn(), UpgradeModalProps: {} };
jest.mock('../../hooks/usePremium', () => ({ usePremium: () => mockPremium }));
jest.mock('../../context/AuthProvider', () => ({ useAuth: () => ({ user: { role: 'athlete' } }) }));
jest.mock('../../utils/analytics', () => ({ trackEvent: () => {} }));
jest.mock('../../utils/isNativeApp', () => ({ isCapacitorNative: () => true }));

/* eslint-disable import/first */
import PremiumLock from '../PremiumLock';
import {
  TestLimitTeaser, SinceTestTeaser, BenchmarkTeaser, PerformanceProfileTeaser,
  bestSessionFor, daysSince,
} from './PremiumTeasers';
/* eslint-enable import/first */

const DAY = 86400000;

describe('teasers', () => {
  it('test limit: quota used and the latest LT2', () => {
    const html = renderToStaticMarkup(
      <TestLimitTeaser testCount={3} limit={3} lt2Label="285 W" sport="bike" testDate="2026-03-12" />,
    );
    expect(html).toContain('3/3');
    expect(html).toContain('Your LT2: 285 W');
    expect(html).toContain('bike test');
  });

  it('test limit: no threshold, no invented number', () => {
    const html = renderToStaticMarkup(<TestLimitTeaser testCount={3} limit={3} lt2Label="—" />);
    expect(html).toContain('All your free tests are used');
    expect(html).not.toContain('Your LT2');
  });

  it('since test: days since the test', () => {
    const date = new Date(Date.now() - 47 * DAY).toISOString();
    const html = renderToStaticMarkup(<SinceTestTeaser testDate={date} lt2Label="4:05 /km" />);
    expect(html).toContain('47');
    expect(html).toContain('LT2 on test day: 4:05 /km');
    expect(html).toContain('probably moved');
  });

  it('benchmark: the athlete’s own thresholds', () => {
    const html = renderToStaticMarkup(<BenchmarkTeaser sport="bike" lt1Label="210 W" lt2Label="285 W" />);
    expect(html).toContain('285 W');
    expect(html).toContain('LT1 210 W');
  });

  it('performance profile: best session average', () => {
    const html = renderToStaticMarkup(
      <PerformanceProfileTeaser sport="bike" count={12} bestLabel="248 W" bestDate="2026-09-01" />,
    );
    expect(html).toContain('248 W');
    expect(html).toContain('12 rides in this view');
  });
});

describe('helpers', () => {
  const getSecs = (t) => t.duration || 0;
  const getDist = (t) => t.distance || 0;

  it('picks the highest average power on the bike', () => {
    const { count, best } = bestSessionFor([
      { sport: 'bike', avgPower: 200 },
      { sport: 'bike', avgPower: 248 },
      { sport: 'run', avgPower: 300 },
    ], 'bike', { getSecs, getDist });
    expect(count).toBe(2);
    expect(best.value).toBe(248);
  });

  it('picks the fastest run of 3 km or more', () => {
    const { best } = bestSessionFor([
      { sport: 'run', distance: 1000, duration: 180 }, // too short to count
      { sport: 'run', distance: 10000, duration: 2700 },
      { sport: 'run', distance: 5000, duration: 1250 },
    ], 'run', { getSecs, getDist });
    expect(best.value).toBe(250);
  });

  it('daysSince ignores bad dates', () => {
    expect(daysSince('nope')).toBeNull();
    expect(daysSince(new Date(Date.now() - 3 * DAY))).toBe(3);
  });
});

describe('in the lock', () => {
  const renderLock = (isPremium) => {
    mockPremium.isPremium = isPremium;
    return renderToStaticMarkup(
      <PremiumLock
        feature="Unlimited tests"
        title="You have used your 3 free tests"
        teaser={<TestLimitTeaser testCount={3} limit={3} lt2Label="285 W" sport="bike" testDate="2026-03-12" />}
        unlocks={['Unlimited lactate tests, so your trend keeps going']}
      >
        <div>the real card</div>
      </PremiumLock>,
    );
  };

  it('free user sees their LT2, what unlocks and the price', () => {
    const html = renderLock(false);
    expect(html).toContain('Your LT2: 285 W');
    expect(html).toContain('Unlimited lactate tests');
    expect(html).toContain('€6.99 a month');
    expect(html).not.toContain('the real card');
  });

  it('premium user sees the real card', () => {
    const html = renderLock(true);
    expect(html).toContain('the real card');
    expect(html).not.toContain('Your LT2');
  });
});
