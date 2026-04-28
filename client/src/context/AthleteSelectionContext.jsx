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
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'global_selectedAthleteId';

const AthleteSelectionContext = createContext(null);

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
    window.addEventListener('globalAthleteChanged', handleAthleteEvent);
    window.addEventListener('athleteChanged', handleAthleteEvent);
    window.addEventListener('athleteSelected', handleAthleteEvent);
    return () => {
      window.removeEventListener('globalAthleteChanged', handleAthleteEvent);
      window.removeEventListener('athleteChanged', handleAthleteEvent);
      window.removeEventListener('athleteSelected', handleAthleteEvent);
    };
  }, []);

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
