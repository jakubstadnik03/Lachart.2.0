import React, { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import SportIcon from '../shared/SportIcon';
import {
  getGarminActivityStatus,
  getStravaActivityStatus,
  importGarminActivity,
  importStravaActivity,
  invalidateCache,
  stravaLockoutRemainingMs,
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
  const [checked, setChecked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lockedForSec, setLockedForSec] = useState(0);
  const [importingIds, setImportingIds] = useState(new Set());
  const [syncingAll, setSyncingAll] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => () => { mountedRef.current = false; }, []);

  /**
   * @param {{ cachedOnly?: boolean }} [opts] cachedOnly never calls the
   *   provider — it only asks whether the server already knows the answer.
   */
  const load = useCallback(async ({ cachedOnly = false } = {}) => {
    if (!cfg || !connected) {
      setActivities([]);
      setCounts(null);
      setChecked(false);
      return;
    }
    // A live check while Strava is rate-limited would just bounce off a 429
    // and push the unlock further out for everybody.
    if (!cachedOnly && source === 'strava') {
      const leftMs = stravaLockoutRemainingMs();
      if (leftMs > 0) {
        setLockedForSec(Math.ceil(leftMs / 1000));
        setError(null);
        return;
      }
    }
    setLoading(true);
    setError(null);
    try {
      const data = await cfg.fetchStatus({ days: WINDOW_DAYS, cachedOnly });
      if (!mountedRef.current) return;
      if (data?.notChecked) {
        // Nothing cached — wait for the athlete to ask before spending a call.
        // A probe only ever adds knowledge, so anything already on screen stays:
        // blanking a list the athlete just looked at would be a regression.
        return;
      }
      setChecked(true);
      setLockedForSec(0);
      setActivities(data?.activities || []);
      setCounts(data?.counts || null);
      setMeta({
        truncated: Boolean(data?.truncated),
        pullSupported: data?.pullSupported !== false,
        message: data?.message || null,
      });
    } catch (e) {
      if (!mountedRef.current) return;
      const retryAfter = Number(e?.response?.data?.retryAfter) || 0;
      if (e?.response?.status === 429 && retryAfter > 0) {
        setLockedForSec(retryAfter);
        setError(null);
      } else {
        setError(
          e?.response?.data?.message
            || e?.response?.data?.error
            || e?.message
            || `Could not read the activity list from ${cfg?.label || source}.`
        );
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [cfg, connected, source]);

  // Paint from the server's cache only; a live provider call needs a tap.
  useEffect(() => {
    // A lockout from any earlier Strava call applies here too — say so before
    // offering a button that cannot work yet.
    if (source === 'strava') {
      const leftMs = stravaLockoutRemainingMs();
      if (leftMs > 0) setLockedForSec(Math.ceil(leftMs / 1000));
    }
    load({ cachedOnly: true });
  }, [load, refreshKey, source]);

  // Count the lockout down so the button re-enables itself.
  useEffect(() => {
    if (lockedForSec <= 0) return undefined;
    const t = setTimeout(() => setLockedForSec((s) => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(t);
  }, [lockedForSec]);

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
  const lockedLabel = lockedForSec > 60
    ? `${Math.ceil(lockedForSec / 60)} min`
    : `${lockedForSec}s`;

  return (
    <SettingsSection
      isMobile={isMobile}
      title={`Activities in the last ${WINDOW_DAYS} days`}
      trailing={loading ? '…' : (checked ? (counts?.total ?? 0) : '—')}
    >
      {!connected && (
        <div className={`${isMobile ? 'px-2.5 py-3 text-[10px]' : 'px-4 py-4 text-sm'} text-gray-500`}>
          Connect {cfg.label} to see which activities are in LaChart.
        </div>
      )}

      {connected && lockedForSec > 0 && (
        <SettingsRow
          isMobile={isMobile}
          title={`${cfg.label} quota is exhausted`}
          subtitle={`${cfg.label} limits how often LaChart may read your activities. Retry in ${lockedLabel}.`}
          trailing={(
            <RowButton isMobile={isMobile} variant="ghost" disabled>
              {lockedLabel}
            </RowButton>
          )}
        />
      )}

      {/* Not checked yet: opening Settings must not cost provider quota, so the
          live check is a deliberate tap. */}
      {connected && lockedForSec === 0 && !checked && (
        <SettingsRow
          isMobile={isMobile}
          title={`Check what ${cfg.label} has`}
          subtitle={`Compares the last ${WINDOW_DAYS} days on ${cfg.label} with what LaChart imported.`}
          trailing={(
            <RowButton isMobile={isMobile} onClick={() => load()} disabled={busy}>
              {loading ? 'Checking…' : 'Check'}
            </RowButton>
          )}
        />
      )}

      {connected && checked && !meta.pullSupported && (
        <div className={`${isMobile ? 'px-2.5 py-3 text-[10px]' : 'px-4 py-4 text-sm'} text-gray-500`}>
          {meta.message || `${cfg.label} does not let apps list your activities — they are delivered here automatically.`}
        </div>
      )}

      {connected && checked && meta.pullSupported && counts && (
        <SettingsRow
          isMobile={isMobile}
          title={importable.length > 0
            ? `${importable.length} activit${importable.length === 1 ? 'y' : 'ies'} not in LaChart`
            : 'Everything is imported'}
          subtitle={`${counts.imported} of ${counts.total} imported${meta.truncated ? ' · only the most recent 200 are checked' : ''}`}
          trailing={importable.length > 0 ? (
            <RowButton isMobile={isMobile} onClick={syncAll} disabled={busy}>
              {syncingAll ? 'Importing…' : 'Import all'}
            </RowButton>
          ) : (
            <RowButton isMobile={isMobile} variant="ghost" onClick={() => load()} disabled={busy}>
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

      {connected && checked && !loading && meta.pullSupported && activities.length === 0 && !error && (
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
