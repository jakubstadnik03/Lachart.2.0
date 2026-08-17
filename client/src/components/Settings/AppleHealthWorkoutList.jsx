import React, { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import SportIcon from '../shared/SportIcon';
import { collectAppleHealthWorkouts, isAppleHealthSupported } from '../../services/appleHealthCapacitor';
import { getAppleHealthWorkoutStatus, syncAppleHealth } from '../../services/api';
import { SettingsSection, SettingsRow, DoneCheck, RowButton } from './HealthSettingsRows';
import { fmtDistance, fmtDuration, fmtWhen } from './activityRowFormat';

/** Same window the sync uses — and the one Health itself keeps handy. */
const WINDOW_DAYS = 90;
/** Enough rows to scan without turning Settings into an activity feed. */
const COLLAPSED_ROWS = 10;
/** HealthKit reads are usually instant; this only catches a wedged bridge. */
const READ_TIMEOUT_MS = 30000;

/**
 * "Workouts in the last 90 days" — every session HealthKit can see, each one
 * labelled with what LaChart has done with it: imported, already here from
 * Strava/Garmin, or still importable with a one-tap button.
 *
 * The list is read straight from HealthKit on the device; the states come from
 * the server so they match exactly what a sync would do.
 */
export default function AppleHealthWorkoutList({ isMobile = false, refreshKey = 0, onImported }) {
  const supported = isAppleHealthSupported();
  const [workouts, setWorkouts] = useState([]);
  const [statusById, setStatusById] = useState(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [importingIds, setImportingIds] = useState(new Set());
  const [importingAll, setImportingAll] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => () => { mountedRef.current = false; }, []);

  const load = useCallback(async () => {
    if (!supported) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const since = new Date(Date.now() - WINDOW_DAYS * 24 * 3600 * 1000).toISOString();
      const list = await Promise.race([
        collectAppleHealthWorkouts(since, { enrichHeartRate: false }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('read_slow')), READ_TIMEOUT_MS)),
      ]);
      if (!mountedRef.current) return;
      const sorted = [...list].sort((a, b) => new Date(b.startDate) - new Date(a.startDate));
      setWorkouts(sorted);

      if (sorted.length > 0) {
        const { statuses = [] } = await getAppleHealthWorkoutStatus(sorted);
        if (!mountedRef.current) return;
        setStatusById(new Map(statuses.map((s) => [String(s.id), s])));
      } else {
        setStatusById(new Map());
      }
    } catch (e) {
      if (!mountedRef.current) return;
      setError(
        e?.message === 'read_slow'
          ? 'Reading workouts from Health took too long. Pull to refresh, or open Health → Profile → Apps → LaChart and allow Workouts.'
          : (e?.response?.data?.error || e?.message || 'Could not read workouts from Health.')
      );
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [supported]);

  useEffect(() => { load(); }, [load, refreshKey]);

  const stateOf = (w) => statusById.get(String(w.id))?.state || 'importable';
  const importable = workouts.filter((w) => stateOf(w) === 'importable');
  const importedCount = workouts.filter((w) => stateOf(w) === 'imported').length;
  const duplicateCount = workouts.filter((w) => stateOf(w) === 'duplicate').length;

  const announce = (imported) => {
    if (!imported) return;
    onImported?.(imported);
    try {
      window.dispatchEvent(new CustomEvent('appleHealth:synced', { detail: { imported, wellnessDays: 0 } }));
    } catch { /* ignore */ }
  };

  const importOne = async (w) => {
    setImportingIds((prev) => new Set(prev).add(String(w.id)));
    setError(null);
    try {
      const res = await syncAppleHealth({ workouts: [w] });
      if (!mountedRef.current) return;
      // imported 0 + skipped 1 means the server recognised this as the Strava/
      // Garmin copy of the same session; 0 and 0 means the row was already
      // stored (upsert matched). Either way the row is no longer importable.
      const imported = res?.imported ?? 0;
      const id = String(w.id);
      setStatusById((prev) => new Map(prev).set(id, (res?.skippedDuplicates ?? 0) > 0
        ? { id, state: 'duplicate' }
        : { id, state: 'imported', importedAt: new Date().toISOString() }));
      announce(imported);
    } catch (e) {
      if (mountedRef.current) setError(e?.response?.data?.error || e?.message || 'Import failed');
    } finally {
      if (mountedRef.current) {
        setImportingIds((prev) => {
          const next = new Set(prev);
          next.delete(String(w.id));
          return next;
        });
      }
    }
  };

  const importAll = async () => {
    if (importable.length === 0) return;
    setImportingAll(true);
    setError(null);
    try {
      const res = await syncAppleHealth({ workouts: importable });
      if (!mountedRef.current) return;
      announce(res?.imported ?? 0);
      // Per-row truth after a batch can only come from the server — one
      // duplicate in the batch must not mark the whole batch as duplicate.
      const { statuses = [] } = await getAppleHealthWorkoutStatus(workouts);
      if (!mountedRef.current) return;
      setStatusById(new Map(statuses.map((s) => [String(s.id), s])));
    } catch (e) {
      if (mountedRef.current) setError(e?.response?.data?.error || e?.message || 'Import failed');
    } finally {
      if (mountedRef.current) setImportingAll(false);
    }
  };

  if (!supported) return null;

  const visible = expanded ? workouts : workouts.slice(0, COLLAPSED_ROWS);
  const busy = importingAll || loading;

  return (
    <SettingsSection
      isMobile={isMobile}
      title={`Workouts in the last ${WINDOW_DAYS} days`}
      trailing={loading ? '…' : workouts.length}
    >
      {(importable.length > 0 || importedCount > 0 || duplicateCount > 0) && (
        <SettingsRow
          isMobile={isMobile}
          title={importable.length > 0
            ? `${importable.length} workout${importable.length === 1 ? '' : 's'} ready to import`
            : 'Everything is in LaChart'}
          subtitle={[
            importedCount > 0 ? `${importedCount} imported` : null,
            duplicateCount > 0 ? `${duplicateCount} already here from Strava/Garmin` : null,
          ].filter(Boolean).join(' · ') || 'Nothing imported yet'}
          trailing={importable.length > 0 ? (
            <RowButton isMobile={isMobile} onClick={importAll} disabled={busy}>
              {importingAll ? 'Importing…' : 'Import all'}
            </RowButton>
          ) : (
            <RowButton isMobile={isMobile} variant="ghost" onClick={load} disabled={busy}>
              <RefreshCw className={`${isMobile ? 'w-3 h-3' : 'w-3.5 h-3.5'} ${loading ? 'animate-spin' : ''}`} />
            </RowButton>
          )}
        />
      )}

      {error && (
        <div className={`${isMobile ? 'px-2.5 py-2 text-[9px]' : 'px-4 py-2.5 text-xs'} text-red-600 bg-red-50`}>
          {error}
        </div>
      )}

      {loading && workouts.length === 0 && (
        <div className={`${isMobile ? 'px-2.5 py-3 text-[10px]' : 'px-4 py-4 text-sm'} text-gray-500`}>
          Reading workouts from Health…
        </div>
      )}

      {!loading && workouts.length === 0 && !error && (
        <div className={`${isMobile ? 'px-2.5 py-3 text-[10px]' : 'px-4 py-4 text-sm'} text-gray-500`}>
          No workouts found in Health for the last {WINDOW_DAYS} days. If you record with an Apple Watch,
          open Health → Profile → Apps → LaChart and allow <strong>Workouts</strong>.
        </div>
      )}

      {visible.map((w) => {
        const state = stateOf(w);
        const meta = [fmtDuration(w.durationSeconds), fmtDistance(w.distanceMeters)].filter(Boolean).join(' · ');
        const isImporting = importingIds.has(String(w.id));
        return (
          <SettingsRow
            key={w.id}
            isMobile={isMobile}
            icon={<SportIcon sport={w.type} className={isMobile ? 'w-4 h-4' : 'w-5 h-5'} />}
            title={fmtWhen(w.startDate)}
            subtitle={[w.type, meta, w.sourceName].filter(Boolean).join(' · ')}
            trailing={
              state === 'imported' ? <DoneCheck isMobile={isMobile} label="Imported" />
                : state === 'duplicate' ? (
                  <span className={`${isMobile ? 'text-[9px]' : 'text-[11px]'} text-gray-400 font-medium`}>
                    In LaChart
                  </span>
                ) : (
                  <RowButton isMobile={isMobile} onClick={() => importOne(w)} disabled={isImporting || importingAll}>
                    {isImporting ? '…' : 'Import'}
                  </RowButton>
                )
            }
          />
        );
      })}

      {workouts.length > COLLAPSED_ROWS && (
        <SettingsRow
          isMobile={isMobile}
          onClick={() => setExpanded((v) => !v)}
          title={expanded ? 'Show less' : `Show all ${workouts.length} workouts`}
        />
      )}
    </SettingsSection>
  );
}
