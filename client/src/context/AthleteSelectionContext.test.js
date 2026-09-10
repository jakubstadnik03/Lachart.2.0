/**
 * The athlete in the URL and the athlete in the context must not drift apart.
 *
 * Half the app decides whose data to show from the URL (the menu, every page
 * with a :athleteId route) and the other half from this context (the coach's
 * athlete bar, the wellness and planner cards). While they agree nobody can
 * tell there are two. The moment they disagree the page shows one athlete, the
 * menu highlights a second, and the coach's clicks change neither — which is
 * what "it gets stuck and then stops switching" turned out to be.
 */
import React, { useContext } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import {
  AthleteSelectionProvider, useAthleteSelection, athleteIdInPath, athleteRouteFor,
} from './AthleteSelectionContext';

const A = 'a'.repeat(24);
const B = 'b'.repeat(24);
const ACTIVITY = 'c'.repeat(24);
const STORAGE_KEY = 'global_selectedAthleteId';

let container;
let root;
let probe;

/** Reports the two things that must agree, and lets a test move either one. */
function Probe() {
  const { selectedAthleteId, setSelectedAthleteId } = useAthleteSelection();
  const location = useLocation();
  const navigate = useNavigate();
  probe = { selectedAthleteId, setSelectedAthleteId, navigate, location };
  return (
    <div data-selected={selectedAthleteId || ''} data-path={location.pathname + location.search} />
  );
}

const mount = (initialPath) => {
  root = createRoot(container);
  act(() => {
    root.render(
      <MemoryRouter initialEntries={[initialPath]}>
        <AthleteSelectionProvider><Probe /></AthleteSelectionProvider>
      </MemoryRouter>,
    );
  });
};

beforeEach(() => {
  localStorage.clear();
  container = document.createElement('div');
  document.body.appendChild(container);
  probe = null;
});

afterEach(() => {
  act(() => root?.unmount());
  container.remove();
});

describe('athleteIdInPath', () => {
  it('reads the athlete out of the sections that carry one', () => {
    expect(athleteIdInPath(`/dashboard/${A}`)).toBe(A);
    expect(athleteIdInPath(`/training/${A}`)).toBe(A);
    expect(athleteIdInPath(`/testing/${A}`)).toBe(A);
    expect(athleteIdInPath(`/athlete/${A}`)).toBe(A);
  });

  it('does not mistake an activity for an athlete', () => {
    // /training-calendar/:activityId — same shape, different thing entirely.
    expect(athleteIdInPath(`/training-calendar/${ACTIVITY}`)).toBeNull();
  });

  it('answers null for a section that names nobody', () => {
    expect(athleteIdInPath('/dashboard')).toBeNull();
    expect(athleteIdInPath('/health')).toBeNull();
    expect(athleteIdInPath('/dashboard/not-an-id')).toBeNull();
    expect(athleteIdInPath('')).toBeNull();
    expect(athleteIdInPath(null)).toBeNull();
  });
});

describe('AthleteSelectionProvider · URL and selection', () => {
  it('lets a shared link beat whatever was stored', () => {
    localStorage.setItem(STORAGE_KEY, B);
    mount(`/dashboard/${A}`);
    expect(probe.selectedAthleteId).toBe(A);
    expect(localStorage.getItem(STORAGE_KEY)).toBe(A);
  });

  it('follows a navigation to another athlete', () => {
    mount(`/dashboard/${A}`);
    act(() => { probe.navigate(`/dashboard/${B}`); });
    expect(probe.selectedAthleteId).toBe(B);
  });

  it('drags the URL along when the selection moves on its own', () => {
    // Several pages reset the selection on mount without routing. Before this,
    // the URL kept naming the old athlete and nothing could reconcile them
    // until the coach navigated somewhere else entirely.
    mount(`/dashboard/${A}`);
    act(() => { probe.setSelectedAthleteId(B); });
    expect(probe.location.pathname).toBe(`/dashboard/${B}`);
    expect(probe.selectedAthleteId).toBe(B);
  });

  it('keeps the query and hash when it rewrites the URL', () => {
    mount(`/testing/${A}?tab=curve#lt2`);
    act(() => { probe.setSelectedAthleteId(B); });
    expect(probe.location.pathname).toBe(`/testing/${B}`);
    expect(probe.location.search).toBe('?tab=curve');
    expect(probe.location.hash).toBe('#lt2');
  });

  it('leaves a route that names nobody alone', () => {
    mount('/health');
    act(() => { probe.setSelectedAthleteId(B); });
    expect(probe.location.pathname).toBe('/health');
    expect(probe.selectedAthleteId).toBe(B);
  });

  it('never rewrites an activity id as an athlete', () => {
    mount(`/training-calendar/${ACTIVITY}`);
    act(() => { probe.setSelectedAthleteId(B); });
    expect(probe.location.pathname).toBe(`/training-calendar/${ACTIVITY}`);
    expect(probe.selectedAthleteId).toBe(B);
  });

  it('adopts the URL when nothing is selected yet', () => {
    mount('/dashboard');
    act(() => { probe.navigate(`/dashboard/${A}`); });
    expect(probe.selectedAthleteId).toBe(A);
  });

  it('settles instead of ping-ponging between the two', () => {
    mount(`/dashboard/${A}`);
    act(() => { probe.setSelectedAthleteId(B); });
    const settledPath = probe.location.pathname;
    const settledId = probe.selectedAthleteId;
    // Another tick must not undo either side.
    act(() => {});
    expect(probe.location.pathname).toBe(settledPath);
    expect(probe.selectedAthleteId).toBe(settledId);
    expect(athleteIdInPath(probe.location.pathname)).toBe(probe.selectedAthleteId);
  });

  it('survives picking the athlete who is already picked', () => {
    // The menu used to read this as a deselect and strip the id out of the
    // URL — while having just set that same athlete as the selection two lines
    // earlier. Every second click then changed nothing anyone could see.
    mount(`/dashboard/${A}`);
    act(() => { probe.setSelectedAthleteId(A); });
    expect(probe.location.pathname).toBe(`/dashboard/${A}`);
    act(() => { probe.setSelectedAthleteId(A); });
    expect(probe.location.pathname).toBe(`/dashboard/${A}`);
    expect(probe.selectedAthleteId).toBe(A);
  });

  it('heals a URL and a selection that have already drifted apart', () => {
    // The state a coach actually reported: the bar ringing one athlete, the
    // menu highlighting another, and neither responding to clicks.
    mount(`/dashboard/${A}`);
    act(() => { probe.setSelectedAthleteId(B); });
    expect(athleteIdInPath(probe.location.pathname)).toBe(probe.selectedAthleteId);
    act(() => { probe.navigate(`/testing/${A}`); });
    expect(probe.selectedAthleteId).toBe(A);
    expect(athleteIdInPath(probe.location.pathname)).toBe(A);
  });

  it('clears on logout without touching the URL', () => {
    mount(`/dashboard/${A}`);
    act(() => { window.dispatchEvent(new CustomEvent('userLoggedOut')); });
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});

/**
 * Where picking an athlete takes you.
 *
 * The menu's athlete list and the coach's athlete bar each had their own answer
 * and they disagreed. On /profile the menu went to /athlete/<id> — which works
 * — while the bar did nothing at all, leaving the ring on the athlete and the
 * page showing the coach's own profile, because ProfilePage calls /user/profile
 * with no athlete parameter and reads no selection.
 */
describe('athleteRouteFor', () => {
  const ME = 'f'.repeat(24);

  it('keeps you on a section that carries an athlete', () => {
    expect(athleteRouteFor(`/dashboard/${A}`, B)).toBe(`/dashboard/${B}`);
    expect(athleteRouteFor('/training', B)).toBe(`/training/${B}`);
    expect(athleteRouteFor(`/testing/${A}`, B)).toBe(`/testing/${B}`);
    expect(athleteRouteFor(`/athlete/${A}`, B)).toBe(`/athlete/${B}`);
  });

  it('leaves the profile page for one that can show an athlete', () => {
    expect(athleteRouteFor('/profile', B)).toBe(`/athlete/${B}`);
    expect(athleteRouteFor('/athletes', B)).toBe(`/athlete/${B}`);
  });

  it('sends you to your own profile when the athlete is you', () => {
    expect(athleteRouteFor('/profile', ME, ME)).toBe('/profile');
    expect(athleteRouteFor('/athletes', ME, ME)).toBe('/profile');
    // /athlete/<id> is the coach's view OF someone else; aimed at yourself it
    // asks the athlete endpoint for the coach.
    expect(athleteRouteFor(`/athlete/${A}`, ME, ME)).toBe('/profile');
  });

  it('stays put where the page reads the selection and takes no id', () => {
    expect(athleteRouteFor('/health', B)).toBeNull();
    expect(athleteRouteFor('/annual-training-plan', B)).toBeNull();
    expect(athleteRouteFor('/workout-planner', B)).toBeNull();
    expect(athleteRouteFor('/settings', B)).toBeNull();
  });

  it('never rewrites an activity deep link as an athlete', () => {
    expect(athleteRouteFor(`/training-calendar/${ACTIVITY}`, B)).toBeNull();
    expect(athleteRouteFor('/training-calendar', B)).toBeNull();
  });

  it('keeps the athlete selected when you pick the one already selected', () => {
    // Not a deselect. This used to strip the id and make every second click
    // look dead.
    expect(athleteRouteFor(`/dashboard/${A}`, A)).toBe(`/dashboard/${A}`);
  });

  it('answers nothing for no athlete', () => {
    expect(athleteRouteFor('/dashboard', null)).toBeNull();
    expect(athleteRouteFor('', B)).toBeNull();
    expect(athleteRouteFor(null, B)).toBeNull();
  });
});
