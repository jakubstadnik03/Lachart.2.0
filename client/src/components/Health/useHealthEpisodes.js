/**
 * useHealthEpisodes - everything the health surfaces need for one athlete.
 *
 * Extracted from HealthPage so the training calendar can host the same data
 * without a second copy of the loading rules drifting away from the first.
 *
 * It resolves rather than rejects on every failure path. The calendar is the
 * main content of the page that mounts this hook, and an unreachable health
 * endpoint must cost the athlete a muted line, never the calendar.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  fetchHealthCatalog, fetchHealthToday, fetchEpisodes, fetchCheckIns,
} from '../../services/healthApi';

const EMPTY_CATALOG = { catalog: [], bodySites: [], functionalTests: {} };

/** Other health surfaces refetch on this rather than polling. */
const HEALTH_CHANGED_EVENT = 'health:changed';

/** Tag on our own broadcasts so a reload here does not bounce back at us. */
const EVENT_SOURCE = 'use-health-episodes';

function messageFor(e) {
  return e?.response?.data?.error || e?.message || 'Could not load health data';
}

export default function useHealthEpisodes(athleteId = null) {
  const [catalog, setCatalog] = useState(EMPTY_CATALOG);
  const [items, setItems] = useState([]);
  const [past, setPast] = useState([]);
  const [checkInsByEpisode, setCheckInsByEpisode] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // A coach switching athletes starts a second load before the first answers.
  // Only the newest run may write, or the previous athlete's injury sticks.
  const runIdRef = useRef(0);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const load = useCallback(async () => {
    const runId = runIdRef.current + 1;
    runIdRef.current = runId;
    const stale = () => !mountedRef.current || runIdRef.current !== runId;

    // allSettled, not all: history being down must not also hide the open
    // episodes, which are the half of this that changes what the athlete does
    // today.
    const [catRes, openRes, pastRes] = await Promise.allSettled([
      fetchHealthCatalog(),
      fetchHealthToday(athleteId),
      fetchEpisodes({ athleteId, status: 'resolved,recurred' }),
    ]);
    if (stale()) return;

    const open = openRes.status === 'fulfilled' ? openRes.value : [];
    setCatalog(catRes.status === 'fulfilled' ? (catRes.value || EMPTY_CATALOG) : EMPTY_CATALOG);
    setItems(open);
    setPast(pastRes.status === 'fulfilled' ? pastRes.value : []);
    // Only today's verdict is worth telling the athlete about; a missing
    // catalogue or history degrades quietly.
    setError(openRes.status === 'rejected' ? messageFor(openRes.reason) : null);

    const series = {};
    await Promise.all(open.map(async (it) => {
      const id = it?.episode?._id;
      if (!id) return;
      try {
        series[id] = await fetchCheckIns(id, 90);
      } catch {
        series[id] = [];
      }
    }));
    if (stale()) return;

    setCheckInsByEpisode(series);
    setLoading(false);
  }, [athleteId]);

  // `load` only changes identity when the athlete does, so this is exactly
  // "mounted, or switched athlete": clear first, then refill.
  useEffect(() => {
    setLoading(true);
    setItems([]);
    setPast([]);
    setCheckInsByEpisode({});
    load();
  }, [load]);

  // A check-in made on the dashboard card changes the verdict shown here, so
  // the strip has to hear about it rather than wait for a remount.
  useEffect(() => {
    const onChanged = (e) => {
      if (e?.detail?.source === EVENT_SOURCE) return;
      load();
    };
    window.addEventListener(HEALTH_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(HEALTH_CHANGED_EVENT, onChanged);
  }, [load]);

  const reload = useCallback(() => {
    load();
    window.dispatchEvent(new CustomEvent(HEALTH_CHANGED_EVENT, { detail: { source: EVENT_SOURCE } }));
  }, [load]);

  return { items, catalog, checkInsByEpisode, past, loading, error, reload };
}
