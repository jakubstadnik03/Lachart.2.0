/**
 * AthleteSelectionContext
 *
 * Single source of truth for the currently selected athlete (coach/tester role).
 * All pages and components read from and write to this context instead of managing
 * their own localStorage reads + window-event listeners.
 *
 * Priority order (highest to lowest):
 *   1. URL param (:athleteId) — pages push this into the context via setSelectedAthleteId
 *   2. Context state (backed by localStorage global_selectedAthleteId)
 *   3. Coach self (user._id) — fallback only if nothing is stored
 *
 * The provider also keeps those first two from drifting apart — see
 * useSelectionUrlSync below. Half the app decides whose data to show from the
 * URL and the other half from this context, so the moment they disagree the
 * page shows one athlete, the menu highlights a second, and the coach's clicks
 * appear to do nothing.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

const STORAGE_KEY = 'global_selectedAthleteId';

/**
 * Sections whose SECOND path segment is the athlete.
 *
 * `training-calendar` is deliberately absent: its second segment is an
 * activity id (`/training-calendar/:activityId`), and rewriting it would break
 * every deep link into a session.
 */
const ATHLETE_URL_SECTIONS = ['dashboard', 'training', 'testing', 'athlete'];

const OBJECT_ID = /^[a-f0-9]{24}$/;

/** The athlete this path names, or null if it names none. */
export function athleteIdInPath(pathname) {
  const [, section, seg] = String(pathname || '').split('/');
  if (!ATHLETE_URL_SECTIONS.includes(section)) return null;
  return seg && OBJECT_ID.test(seg) ? seg : null;
}

/**
 * Where selecting an athlete should take you from where you are standing.
 *
 * The menu's athlete list and the coach's athlete bar each carried their own
 * version of this, and they disagreed. The bar's list named four sections and
 * did nothing anywhere else, so on /profile — a page that is always your own,
 * calls /user/profile with no athlete parameter and ignores the selection
 * entirely — clicking an athlete moved the ring and left you looking at
 * yourself. The menu's list on the same screen went to /athlete/<id>, which
 * works. One rule now, so the two controls cannot answer differently.
 *
 * @returns {string|null} where to go, or null to stay put — the sections that
 * read the selection out of this context take no id, and navigating them would
 * hit the catch-all redirect.
 */
export function athleteRouteFor(pathname, athleteId, selfId = null) {
  if (!athleteId) return null;
  const section = String(pathname || '').split('/')[1] || '';
  const isSelf = selfId != null && String(athleteId) === String(selfId);

  if (ATHLETE_URL_SECTIONS.includes(section)) {
    // /athlete/<id> is the coach's view OF somebody else. Pointed at yourself
    // it asks the athlete endpoint for the coach, which is not a thing.
    if (section === 'athlete' && isSelf) return '/profile';
    return `/${section}/${athleteId}`;
  }

  // Neither of these can show someone else: one is always you, the other is a
  // list. Selecting an athlete goes where an athlete can actually be shown.
  if (section === 'profile' || section === 'athletes') {
    return isSelf ? '/profile' : `/athlete/${athleteId}`;
  }

  return null;
}

const AthleteSelectionContext = createContext(null);

/**
 * Keep the athlete in the URL and the athlete in this context equal.
 *
 * Which one is right depends entirely on which one just moved:
 *
 *   - The path changed, so a link, a redirect or the back button named an
 *     athlete. That is an instruction, and the selection follows it.
 *   - Only the selection changed, so a control set it and stopped short of
 *     routing — several pages reset it to the coach themselves on mount, and
 *     the athlete bar used to be the only thing that pushed a selection into
 *     the URL. The URL follows instead.
 *
 * Without the second case the two could drift apart and stay apart: the bar's
 * old reconciler watched the path alone, so once the selection had moved on a
 * path that did not change, nothing could bring them back together until the
 * coach navigated somewhere else entirely.
 */
function useSelectionUrlSync(selectedAthleteId, adoptId) {
  const location = useLocation();
  const navigate = useNavigate();
  // null, not the first pathname: a cold load from a shared link has to count
  // as a navigation, or the stored selection would overwrite the link.
  const lastPathRef = useRef(null);

  useEffect(() => {
    const urlId = athleteIdInPath(location.pathname);
    const pathChanged = lastPathRef.current !== location.pathname;
    lastPathRef.current = location.pathname;

    // A route that names nobody is not a disagreement — plenty of pages carry
    // the selection without putting it in the URL.
    if (!urlId || urlId === selectedAthleteId) return;

    if (pathChanged) {
      adoptId(urlId);
      try { localStorage.setItem(STORAGE_KEY, urlId); } catch {}
      return;
    }

    // A selection that has been cleared rather than moved — logout wipes it —
    // must not be refilled from the URL it is on its way off. Adoption is for
    // navigation only, and the first run counts as one.
    if (!selectedAthleteId) return;

    const parts = location.pathname.split('/');
    parts[2] = selectedAthleteId;
    navigate(
      { pathname: parts.join('/'), search: location.search, hash: location.hash },
      { replace: true },
    );
  }, [location.pathname, location.search, location.hash, selectedAthleteId, adoptId, navigate]);
}

export function AthleteSelectionProvider({ children }) {
  const [selectedAthleteId, setSelectedAthleteIdState] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) || null; } catch { return null; }
  });

  // Stable setter — writes to state + localStorage, and re-dispatches so legacy
  // components (CoachAthleteBar ring, Menu highlights) stay in sync.
  const setSelectedAthleteId = useCallback((id) => {
    const normalized = id || null;
    setSelectedAthleteIdState(normalized);
    try {
      if (normalized) localStorage.setItem(STORAGE_KEY, normalized);
      else localStorage.removeItem(STORAGE_KEY);
    } catch {}
    // Broadcast so legacy event listeners in CoachAthleteBar / Menu still work.
    if (normalized) {
      window.dispatchEvent(new CustomEvent('globalAthleteChanged', { detail: { athleteId: normalized } }));
    }
  }, []);

  // Listen for athlete changes dispatched by any legacy code still using window events.
  // We update state directly (not through setSelectedAthleteId to avoid re-dispatching).
  useEffect(() => {
    const handleAthleteEvent = (e) => {
      const id = e.detail?.athleteId;
      if (id) {
        setSelectedAthleteIdState(id);
        try { localStorage.setItem(STORAGE_KEY, id); } catch {}
      }
    };
    // On logout: immediately wipe the selected athlete so the next user starts clean.
    const handleLogout = () => {
      setSelectedAthleteIdState(null);
      try { localStorage.removeItem(STORAGE_KEY); } catch {}
    };
    window.addEventListener('globalAthleteChanged', handleAthleteEvent);
    window.addEventListener('athleteChanged', handleAthleteEvent);
    window.addEventListener('athleteSelected', handleAthleteEvent);
    window.addEventListener('userLoggedOut', handleLogout);
    return () => {
      window.removeEventListener('globalAthleteChanged', handleAthleteEvent);
      window.removeEventListener('athleteChanged', handleAthleteEvent);
      window.removeEventListener('athleteSelected', handleAthleteEvent);
      window.removeEventListener('userLoggedOut', handleLogout);
    };
  }, []);

  useSelectionUrlSync(selectedAthleteId, setSelectedAthleteIdState);

  return (
    <AthleteSelectionContext.Provider value={{ selectedAthleteId, setSelectedAthleteId }}>
      {children}
    </AthleteSelectionContext.Provider>
  );
}

export function useAthleteSelection() {
  const ctx = useContext(AthleteSelectionContext);
  if (!ctx) throw new Error('useAthleteSelection must be used within AthleteSelectionProvider');
  return ctx;
}
