import React, { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import SportIcon from '../shared/SportIcon';
import {
  getGarminActivityStatus,
  getStravaActivityStatus,
  importGarminActivity,
  importStravaActivity,
  invalidateCache,
} from '../../services/api';
import { SettingsSection, SettingsRow, DoneCheck, RowButton } from './HealthSettingsRows';
import { fmtDistance, fmtDuration, fmtWhen } from './activityRowFormat';

const WINDOW_DAYS = 90;
/** Enough rows to spot a gap without turning Settings into an activity feed. */
const COLLAPSED_ROWS = 10;

const SOURCES = {
  strava: {
    label: 'Strava',
    fetchStatus: (opts) => getStravaActivityStatus(opts),
    importOne: (id) => importStravaActivity(id),
  },
  garmin: {
    label: 'Garmin',
    fetchStatus: (opts) => getGarminActivityStatus(opts),
    importOne: (id) => importGarminActivity(id, { days: WINDOW_DAYS }),
  },
};

/**
 * "Activities in the last 90 days" for Strava / Garmin: what the provider has,
 * and whether LaChart got it. A missed webhook or a sync gap leaves an activity
 * on the provider that never reached here — those rows get an Import button so
 * they can be pulled in afterwards, one at a time.
 *
 * @param {{
 *   source: 'strava'|'garmin',
 *   isMobile?: boolean,
 *   connected?: boolean,
 *   refreshKey?: number,
 *   onImported?: (count: number) => void,
 *   onSyncAll?: () => Promise<any>,
 * }} props onSyncAll delegates "Import all" to the page's existing sync
 *   handler — one paged request instead of one API call per activity.
 */
export default function ExternalActivityList({
  source,
  isMobile = false,
  connected = false,
  refreshKey = 0,
  onImported,
  onSyncAll,
}) {
  const cfg = SOURCES[source];
  const [activities, setActivities] = useState([]);
  const [counts, setCounts] = useState(null);
  const [meta, setMeta] = useState({ truncated: false, pullSupported: true, message: null });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [importingIds, setImportingIds] = useState(new Set());
  const [syncingAll, setSyncingAll] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => () => { mountedRef.current = false; }, []);

  const load = useCallback(async () => {
    if (!cfg || !connected) {
      setActivities([]);
      setCounts(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await cfg.fetchStatus({ days: WINDOW_DAYS });
      if (!mountedRef.current) return;
      setActivities(data?.activities || []);
      setCounts(data?.counts || null);
      setMeta({
        truncated: Boolean(data?.truncated),
        pullSupported: data?.pullSupported !== false,
        message: data?.message || null,
      });
    } catch (e) {
      if (!mountedRef.current) return;
      setActivities([]);
      setCounts(null);
      setError(
        e?.response?.data?.message
          || e?.response?.data?.error
          || e?.message
          || `Could not read the activity list from ${cfg?.label || source}.`
      );
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [cfg, connected, source]);

  useEffect(() => { load(); }, [load, refreshKey]);

  const afterImport = (count) => {
    if (!count) return;
    // The calendar and dashboard read activities through their own caches —
    // without this the newly imported session stays invisible until they expire.
    try {
      invalidateCache('api_cache_ext_activities');
      invalidateCache('/integrations/activities');
    } catch { /* ignore */ }
    onImported?.(count);
  };

  const importOne = async (activity) => {
    setImportingIds((prev) => new Set(prev).add(String(activity.id)));
    setError(null);
    try {
      const res = await cfg.importOne(activity.id);
      if (!mountedRef.current) return;
      const imported = (res?.imported ?? 0) + (res?.updated ?? 0);
      setActivities((prev) => prev.map((a) => (
        String(a.id) === String(activity.id) ? { ...a, state: 'imported' } : a
      )));
      setCounts((prev) => (prev ? {
        ...prev,
        imported: prev.imported + 1,
        importable: Math.max(0, prev.importable - 1),
      } : prev));
      afterImport(imported || 1);
    } catch (e) {
      if (mountedRef.current) {
        setError(e?.response?.data?.message || e?.response?.data?.error || e?.message || 'Import failed');
      }
    } finally {
      if (mountedRef.current) {
        setImportingIds((prev) => {
          const next = new Set(prev);
          next.delete(String(activity.id));
          return next;
        });
      }
    }
  };

  const syncAll = async () => {
    setSyncingAll(true);
    setError(null);
    try {
      if (onSyncAll) {
        // The page's own sync handler already refreshes caches and notifies.
        await onSyncAll();
      } else {
        // No page-level sync handler — fall back to importing them one by one.
        for (const a of activities.filter((x) => x.state === 'importable')) {
          await cfg.importOne(a.id); // eslint-disable-line no-await-in-loop
        }
        afterImport(1);
      }
      if (!mountedRef.current) return;
      await load();
    } catch (e) {
      if (mountedRef.current) {
        setError(e?.response?.data?.message || e?.response?.data?.error || e?.message || 'Sync failed');
      }
    } finally {
      if (mountedRef.current) setSyncingAll(false);
    }
  };

  if (!cfg) return null;

  const importable = activities.filter((a) => a.state === 'importable');
  const visible = expanded ? activities : activities.slice(0, COLLAPSED_ROWS);
  const busy = loading || syncingAll;

  return (
    <SettingsSection
      isMobile={isMobile}
      title={`Activities in the last ${WINDOW_DAYS} days`}
      trailing={loading ? '…' : (counts?.total ?? (connected ? 0 : '—'))}
    >
      {!connected && (
        <div className={`${isMobile ? 'px-2.5 py-3 text-[10px]' : 'px-4 py-4 text-sm'} text-gray-500`}>
          Connect {cfg.label} to see which activities are in LaChart.
        </div>
      )}

      {connected && !meta.pullSupported && (
        <div className={`${isMobile ? 'px-2.5 py-3 text-[10px]' : 'px-4 py-4 text-sm'} text-gray-500`}>
          {meta.message || `${cfg.label} does not let apps list your activities — they are delivered here automatically.`}
        </div>
      )}

      {connected && meta.pullSupported && (counts || loading) && (
        <SettingsRow
          isMobile={isMobile}
          title={importable.length > 0
            ? `${importable.length} activit${importable.length === 1 ? 'y' : 'ies'} not in LaChart`
            : (loading ? 'Checking…' : 'Everything is imported')}
          subtitle={counts
            ? `${counts.imported} of ${counts.total} imported${meta.truncated ? ' · only the most recent 200 are checked' : ''}`
            : null}
          trailing={importable.length > 0 ? (
            <RowButton isMobile={isMobile} onClick={syncAll} disabled={busy}>
              {syncingAll ? 'Importing…' : 'Import all'}
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

      {connected && loading && activities.length === 0 && !error && (
        <div className={`${isMobile ? 'px-2.5 py-3 text-[10px]' : 'px-4 py-4 text-sm'} text-gray-500`}>
          Reading your {cfg.label} activities…
        </div>
      )}

      {connected && !loading && meta.pullSupported && activities.length === 0 && !error && (
        <div className={`${isMobile ? 'px-2.5 py-3 text-[10px]' : 'px-4 py-4 text-sm'} text-gray-500`}>
          No {cfg.label} activities in the last {WINDOW_DAYS} days.
        </div>
      )}

      {visible.map((a) => {
        const metaLine = [
          fmtWhen(a.startDate),
          a.sport,
          fmtDuration(a.durationSeconds),
          fmtDistance(a.distanceMeters),
        ].filter(Boolean).join(' · ');
        const isImporting = importingIds.has(String(a.id));
        return (
          <SettingsRow
            key={a.id}
            isMobile={isMobile}
            icon={<SportIcon sport={a.sport} className={isMobile ? 'w-4 h-4' : 'w-5 h-5'} />}
            title={a.name}
            subtitle={metaLine}
            trailing={a.state === 'imported' ? <DoneCheck isMobile={isMobile} label="Imported" /> : (
              <RowButton isMobile={isMobile} onClick={() => importOne(a)} disabled={isImporting || syncingAll}>
                {isImporting ? '…' : 'Import'}
              </RowButton>
            )}
          />
        );
      })}

      {activities.length > COLLAPSED_ROWS && (
        <SettingsRow
          isMobile={isMobile}
          onClick={() => setExpanded((v) => !v)}
          title={expanded ? 'Show less' : `Show all ${activities.length} activities`}
        />
      )}
    </SettingsSection>
  );
}
