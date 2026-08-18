/**
 * The header icon has to say where you are, not just where you can go.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

jest.mock('@heroicons/react/24/outline', () => ({ LightBulbIcon: () => null }), { virtual: true });
jest.mock('@heroicons/react/24/solid', () => ({ LightBulbIcon: () => null }), { virtual: true });

// `mock`-prefixed so jest allows the factory to close over it.
const mockLocation = { pathname: '/dashboard' };
jest.mock('react-router-dom', () => ({
  useNavigate: () => () => {},
  useLocation: () => mockLocation,
}), { virtual: true });

// eslint-disable-next-line import/first
import FeatureGuideButton from './FeatureGuideButton';

const renderButton = (pathname) => {
  mockLocation.pathname = pathname;
  return renderToStaticMarkup(<FeatureGuideButton />);
};

describe('FeatureGuideButton', () => {
  it('is lit while the guide is open', () => {
    const view = renderButton('/guide');
    expect(view).toContain('aria-current="page"');
    expect(view).toContain('text-primary');
  });

  it('is quiet everywhere else', () => {
    const view = renderButton('/dashboard');
    expect(view).not.toContain('aria-current');
    expect(view).toContain('text-gray-500');
  });
});
