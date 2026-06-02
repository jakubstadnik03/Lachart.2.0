import React, { useCallback, useEffect, useState } from 'react';
import { Heart } from 'lucide-react';
import {
  checkAppleHealthAvailable,
  collectAppleHealthWellness,
  collectAppleHealthWorkouts,
  isAppleHealthSupported,
  openAppleHealthSettings,
  requestAppleHealthAccess,
} from '../../services/appleHealthCapacitor';
import {
  disconnectAppleHealth,
  getAppleHealthStatus,
  getAppleHealthWellness,
  syncAppleHealth,
  syncAppleHealthWellness,
} from '../../services/api';

function fmtSleep(mins) {
  if (mins == null || mins <= 0) return '—';
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  if (h === 0) return `${m}m`;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export default function AppleHealthCard({ isMobile = false, onStatusChange }) {
  const supported = isAppleHealthSupported();
  const [available, setAvailable] = useState(false);
  const [connected, setConnected] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState(null);
  const [latest, setLatest] = useState(null);

  const refresh = useCallback(async () => {
    if (!supported) return;
    try {
      const [avail, st, wellness] = await Promise.all([
        checkAppleHealthAvailable(),
        getAppleHealthStatus().catch(() => null),
        getAppleHealthWellness({ days: 7 }).catch(() => ({ days: [] })),
      ]);
      setAvailable(avail);
      setConnected(Boolean(st?.connected));
      setStatus(st);
      const days = wellness?.days || [];
      setLatest(days.length ? days[days.length - 1] : null);
      onStatusChange?.(Boolean(st?.connected));
    } catch {
      /* ignore */
    }
  }, [supported, onStatusChange]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const runSync = async () => {
    setSyncing(true);
    setError(null);
    try {
      const { granted } = await requestAppleHealthAccess();
      if (!granted) {
        setError('Health access was not granted. Enable it in Settings → Health → LaChart.');
        return;
      }

      const wellness = await collectAppleHealthWellness(14);
      const since = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString();
      const workouts = await collectAppleHealthWorkouts(since);

      await syncAppleHealthWellness({
        wellness,
        markConnected: true,
      });

      let workoutImported = 0;
      if (workouts.length > 0) {
        const { data } = await syncAppleHealth({ workouts });
        workoutImported = data?.imported ?? 0;
      }

      await refresh();
      const wCount = wellness.length;
      const msg = [
        wCount ? `${wCount} day(s) of wellness data` : null,
        workouts.length ? `${workoutImported} workout(s)` : null,
      ].filter(Boolean).join(', ');
      if (!msg) {
        setError('Connected, but no new resting HR, sleep, HRV or workouts found in the last 14 days.');
      }
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm('Disconnect Apple Health? Workouts and wellness data stored in LaChart will be removed.')) return;
    setSyncing(true);
    try {
      await disconnectAppleHealth();
      setConnected(false);
      setLatest(null);
      setStatus(null);
      onStatusChange?.(false);
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Disconnect failed');
    } finally {
      setSyncing(false);
    }
  };

  if (!supported) {
    return (
      <div className={`bg-white ${isMobile ? 'rounded-md' : 'rounded-lg'} border border-gray-200 ${isMobile ? 'p-2.5' : 'p-6'}`}>
        <div className={`flex items-center justify-between ${isMobile ? 'mb-2' : 'mb-4'}`}>
          <div className="flex items-center gap-2">
            <div className={`flex items-center justify-center ${isMobile ? 'w-6 h-6' : 'w-8 h-8'} bg-rose-50 rounded-lg`}>
              <Heart className={`${isMobile ? 'w-3.5 h-3.5' : 'w-4 h-4'} text-rose-500`} />
            </div>
            <h4 className={`${isMobile ? 'text-xs' : 'text-lg'} font-semibold`}>Apple Health</h4>
          </div>
          <span className={`${isMobile ? 'text-[10px]' : 'text-sm'} font-medium text-gray-400`}>iOS app only</span>
        </div>
        <p className={`${isMobile ? 'text-[9px]' : 'text-sm'} text-gray-600`}>
          Resting heart rate, sleep and HRV sync are available in the LaChart iOS app.
        </p>
      </div>
    );
  }

  return (
    <div className={`bg-white ${isMobile ? 'rounded-md' : 'rounded-lg'} border border-gray-200 ${isMobile ? 'p-2.5' : 'p-6'}`}>
      <div className={`flex items-center justify-between ${isMobile ? 'mb-2' : 'mb-4'}`}>
        <div className="flex items-center gap-2">
          <div className={`flex items-center justify-center ${isMobile ? 'w-6 h-6' : 'w-8 h-8'} bg-rose-50 rounded-lg`}>
            <Heart className={`${isMobile ? 'w-3.5 h-3.5' : 'w-4 h-4'} text-rose-500`} />
          </div>
          <h4 className={`${isMobile ? 'text-xs' : 'text-lg'} font-semibold`}>Apple Health</h4>
        </div>
        <span className={`${isMobile ? 'text-[10px]' : 'text-sm'} font-medium ${connected ? 'text-green-600' : 'text-gray-500'}`}>
          {!available ? 'Unavailable' : connected ? 'Connected' : 'Not connected'}
        </span>
      </div>

      <p className={`${isMobile ? 'text-[9px]' : 'text-sm'} text-gray-600 ${isMobile ? 'mb-2' : 'mb-4'}`}>
        Import resting heart rate, sleep duration and heart-rate variability (recovery) from Apple Health.
        Workouts from the last 90 days are imported too.
      </p>

      {latest && (
        <div className={`grid grid-cols-3 gap-2 ${isMobile ? 'mb-2' : 'mb-4'} text-center`}>
          <div className="rounded-lg bg-gray-50 py-2 px-1">
            <div className={`${isMobile ? 'text-[8px]' : 'text-xs'} text-gray-500`}>Resting HR</div>
            <div className={`${isMobile ? 'text-sm' : 'text-base'} font-bold text-gray-900`}>
              {latest.restingHeartRate != null ? `${latest.restingHeartRate}` : '—'}
              {latest.restingHeartRate != null && <span className="text-[10px] font-normal text-gray-500"> bpm</span>}
            </div>
          </div>
          <div className="rounded-lg bg-gray-50 py-2 px-1">
            <div className={`${isMobile ? 'text-[8px]' : 'text-xs'} text-gray-500`}>Sleep</div>
            <div className={`${isMobile ? 'text-sm' : 'text-base'} font-bold text-gray-900`}>{fmtSleep(latest.sleepMinutes)}</div>
          </div>
          <div className="rounded-lg bg-gray-50 py-2 px-1">
            <div className={`${isMobile ? 'text-[8px]' : 'text-xs'} text-gray-500`}>HRV</div>
            <div className={`${isMobile ? 'text-sm' : 'text-base'} font-bold text-gray-900`}>
              {latest.hrvMs != null ? `${latest.hrvMs}` : '—'}
              {latest.hrvMs != null && <span className="text-[10px] font-normal text-gray-500"> ms</span>}
            </div>
          </div>
        </div>
      )}

      {status?.lastWellnessSync && (
        <p className={`${isMobile ? 'text-[9px] mb-2' : 'text-xs mb-3'} text-gray-400`}>
          Last sync: {new Date(status.lastWellnessSync).toLocaleString()}
          {status.workoutCount > 0 ? ` · ${status.workoutCount} workouts` : ''}
        </p>
      )}

      {error && (
        <p className={`${isMobile ? 'text-[9px] mb-2' : 'text-xs mb-3'} text-red-600`}>{error}</p>
      )}

      <div className={`flex flex-wrap gap-2 ${isMobile ? '' : ''}`}>
        <button
          type="button"
          disabled={syncing || !available}
          onClick={runSync}
          className={`${isMobile ? 'px-2.5 py-1.5 text-[10px] flex-1' : 'px-3 py-2 text-sm'} rounded-lg font-semibold bg-primary text-white hover:bg-primary-dark disabled:opacity-50`}
        >
          {syncing ? 'Syncing…' : connected ? 'Sync now' : 'Connect & sync'}
        </button>
        {connected && (
          <>
            <button
              type="button"
              disabled={syncing}
              onClick={() => openAppleHealthSettings()}
              className={`${isMobile ? 'px-2.5 py-1.5 text-[10px]' : 'px-3 py-2 text-sm'} rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50`}
            >
              Health settings
            </button>
            <button
              type="button"
              disabled={syncing}
              onClick={handleDisconnect}
              className={`${isMobile ? 'px-2.5 py-1.5 text-[10px]' : 'px-3 py-2 text-sm'} rounded-lg border border-red-200 text-red-600 hover:bg-red-50`}
            >
              Disconnect
            </button>
          </>
        )}
      </div>
    </div>
  );
}
