/**
 * Whose profile does the native Profile page show?
 *
 * A coach taps an athlete in Athletes, which sets the shared selection and
 * routes to /profile. If anything about that resolution is wrong the page
 * quietly shows the coach their own profile instead — the athlete-profile
 * fetch has a silent catch, so a failure looks identical to "nothing was
 * selected". These pin down which of the two is happening.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';

// CRA runs jest with resetMocks: true, so an implementation given inside the
// factory is thrown away before the first test and every call returns
// undefined. They are set in beforeEach instead.
const mockGet = jest.fn();
const mockGetTests = jest.fn();

jest.mock('../services/api', () => ({
  __esModule: true,
  default: { get: (...a) => mockGet(...a) },
  getTestingsByAthleteId: (...a) => mockGetTests(...a),
  updateUserProfile: () => Promise.resolve({}),
  updateAthleteProfile: () => Promise.resolve({}),
}));

let mockSelected = null;
jest.mock('../context/AthleteSelectionContext', () => ({
  useAthleteSelection: () => ({ selectedAthleteId: mockSelected, setSelectedAthleteId: () => {} }),
}));
jest.mock('../context/NotificationContext', () => ({
  useNotification: () => ({ addNotification: () => {} }),
}));
jest.mock('../components/Profile/EditProfileModal', () => () => null);
// lucide-react ships ESM that jest will not transform; nothing here looks at icons.
jest.mock('../components/shared/SportIcon', () => ({
  __esModule: true,
  default: () => null,
  SportGlyph: () => null,
  RunnerSvg: () => null,
  SwimSvg: () => null,
  EllipticalSvg: () => null,
  resolveSportKey: (s) => String(s || '').toLowerCase(),
  // Tiles spreads these — a bare stub would throw before a single test runs.
  SPORT_ICON_COLORS: { bike: '#767EB5', run: '#f97316', swim: '#38bdf8', hike: '#a16207' },
  SPORT_LABELS: {},
  SPORT_TOGGLE_ORDER: [],
}));
jest.mock('lucide-react', () => new Proxy({}, { get: () => () => null }), { virtual: true });

// eslint-disable-next-line import/first
import NativeProfilePage from './NativeProfilePage';

const COACH = {
  _id: 'coach1', role: 'coach', name: 'Pavel', surname: 'Hradil',
  email: 'pavel.hradil@icloud.com', sport: 'triathlon',
};
const ATHLETE_ID = 'athlete1';

let container;
let root;

// A client render, not static markup: the athlete lookup lives in an effect,
// and renderToStaticMarkup never runs one — the page would look innocent
// whatever it does.
const render = () => {
  root = createRoot(container);
  act(() => {
    root.render(
      <MemoryRouter>
        <NativeProfilePage userInfo={COACH} calendarData={[]} onProfileUpdated={() => {}} />
      </MemoryRouter>,
    );
  });
  return container.innerHTML;
};

beforeEach(() => {
  mockGet.mockReset();
  mockGetTests.mockReset();
  // Pending forever: these tests are about which URL goes out, not the answer.
  mockGet.mockImplementation(() => new Promise(() => {}));
  mockGetTests.mockImplementation(() => new Promise(() => {}));
  mockSelected = null;
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  act(() => root?.unmount());
  container.remove();
});

describe('NativeProfilePage · whose profile', () => {
  it('shows the coach their own when nothing is selected', () => {
    const html = render();
    expect(html).toContain('Pavel');
    // No athlete lookup should go out at all.
    const profileCalls = mockGet.mock.calls.filter(c => String(c[0]).includes('/profile'));
    expect(profileCalls).toHaveLength(0);
  });

  it('asks for the selected athlete, not the coach', () => {
    mockSelected = ATHLETE_ID;
    render();
    const urls = mockGet.mock.calls.map(c => String(c[0]));
    expect(urls).toContain(`/user/athlete/${ATHLETE_ID}/profile`);
    expect(urls.some(u => u.includes('coach1'))).toBe(false);
  });

  it('says so when the athlete will not load, and shows nobody else in their place', async () => {
    mockSelected = ATHLETE_ID;
    const err = new Error('forbidden');
    err.response = { status: 403, data: { error: 'This athlete does not belong to your team' } };
    mockGet.mockImplementation(() => Promise.reject(err));
    render();
    await act(async () => { await Promise.resolve(); });
    const html = container.innerHTML;
    expect(html).toContain('This athlete does not belong to your team');
    expect(html).toContain('Try again');
    // The coach's own profile used to render underneath the message.
    expect(html).not.toContain('Athlete profile');
    expect(html).not.toContain('Pavel Hradil');
  });

  it('shows the invitation, with resend and withdraw, for an athlete who has not accepted', async () => {
    mockSelected = ATHLETE_ID;
    const err = new Error('forbidden');
    err.response = { status: 403, data: { error: 'Athlete invitation is pending confirmation', code: 'INVITATION_PENDING' } };
    mockGet.mockImplementation((url) => (
      String(url).includes('/coach/athletes')
        ? Promise.resolve({ data: [{ _id: ATHLETE_ID, name: 'Petr', surname: 'Josefus', email: 'petr@example.com', invitationPending: true }] })
        : Promise.reject(err)
    ));
    render();
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    const html = container.innerHTML;
    expect(html).toContain('Petr Josefus');
    expect(html).toContain('petr@example.com');
    expect(html).toContain('Send invitation again');
    expect(html).toContain('Withdraw');
    expect(html).not.toContain('Athlete profile');
  });

  it('does not fetch when the coach has selected themselves', () => {
    mockSelected = 'coach1';
    render();
    const profileCalls = mockGet.mock.calls.filter(c => String(c[0]).includes('/user/athlete/'));
    expect(profileCalls).toHaveLength(0);
  });
});
