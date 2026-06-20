import React, { useCallback, useEffect, useState } from 'react';
import { Heart } from 'lucide-react';
import {
  collectAppleHealthWellness,
  collectAppleHealthWorkouts,
  getAppleHealthDiagnostics,
  getAppleHealthPermissionStatus,
  isAppleHealthSupported,
  openAppleHealthSettings,
  requestAppleHealthAccess,
  wellnessPermissionHint,
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
  const [unavailableReason, setUnavailableReason] = useState(null);
  const [connected, setConnected] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncStep, setSyncStep] = useState(null);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState(null);
  const [latest, setLatest] = useState(null);
  const [diagInfo, setDiagInfo] = useState(null);

  const refresh = useCallback(async () => {
    if (!supported) return;
    try {
      const [diag, st, wellness] = await Promise.all([
        getAppleHealthDiagnostics(),
        getAppleHealthStatus().catch(() => null),
        getAppleHealthWellness({ days: 7 }).catch(() => ({ days: [] })),
      ]);
      setDiagInfo(diag);
      setAvailable(diag.available);
      setUnavailableReason(diag.available ? null : (diag.hint || diag.reason || 'Apple Health is not available.'));
      setConnected(Boolean(st?.connected));
      setStatus(st);
      const days = wellness?.days || [];
      setLatest(days.length ? days[days.length - 1] : null);
      onStatusChange?.(Boolean(st?.connected));
    } catch (e) {
      setAvailable(false);
      setUnavailableReason(e?.message || 'Could not check Apple Health. Rebuild the iOS app from Xcode.');
    }
  }, [supported, onStatusChange]);

  useEffect(() => {
    refresh();
    // Bridge + Health plugin can register a moment after the WebView paints.
    const t1 = setTimeout(refresh, 600);
    const t2 = setTimeout(refresh, 2000);
    let resumeSub;
    (async () => {
      try {
        const { App } = await import('@capacitor/app');
        resumeSub = await App.addListener('appStateChange', ({ isActive }) => {
          if (isActive) refresh();
        });
      } catch { /* web */ }
    })();
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      resumeSub?.remove?.();
    };
  }, [refresh]);

  const runSync = async () => {
    setSyncing(true);
    setSyncStep(null);
    setError(null);
    try {
      setSyncStep('Checking HealthKit…');
      if (!available) {
        const diag = await getAppleHealthDiagnostics();
        setDiagInfo(diag);
        setAvailable(diag.available);
        setUnavailableReason(diag.available ? null : (diag.hint || diag.reason || 'Apple Health is not available.'));
        if (!diag.available) {
          setError(diag.hint || 'Health plugin is not ready. Rebuild the iOS app from Xcode (Product → Run on your iPhone).');
          return;
        }
        if (diag.isSimulator) {
          setError('Simulator: add sample data in Health app first, then tap Connect. For reliable sync use a physical iPhone.');
        }
      } else if (diagInfo?.isSimulator) {
        setError(null);
      }

      setSyncStep('Requesting access…');
      const { warning: authWarning } = await requestAppleHealthAccess();
      const permStatus = await getAppleHealthPermissionStatus();
      const permHint = wellnessPermissionHint(permStatus.types);

      setSyncStep('Reading wellness…');
      const wellness = await collectAppleHealthWellness(14);
      const since = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString();
      setSyncStep('Reading workouts…');
      const workouts = await collectAppleHealthWorkouts(since, { enrichHeartRate: false });

      setSyncStep('Uploading…');
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
      try {
        window.dispatchEvent(new CustomEvent('appleHealth:synced', { detail: { imported: workoutImported, wellnessDays: wellness.length } }));
      } catch { /* ignore */ }

      const wCount = wellness.length;
      const msg = [
        wCount ? `${wCount} day(s) of wellness data` : null,
        workouts.length ? `${workoutImported} workout(s)` : null,
      ].filter(Boolean).join(', ');

      if (authWarning) {
        setError(authWarning);
      } else if (permHint && wCount === 0) {
        setError(permHint);
      } else if (!msg) {
        setError(
          permHint
            || 'Connected, but no resting HR, sleep or HRV found. Add data in Health (Apple Watch, Oura, etc.) and enable those types for LaChart in Health → Apps.',
        );
      } else if (permHint) {
        setError(`Synced ${msg}. ${permHint}`);
      }
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Sync failed');
    } finally {
      setSyncStep(null);
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
        <span className={`${isMobile ? 'text-[10px]' : 'text-sm'} font-medium ${connected ? 'text-green-600' : available ? 'text-gray-500' : 'text-amber-600'}`}>
          {connected ? 'Connected' : available ? 'Not connected' : 'Checking…'}
        </span>
      </div>

      <p className={`${isMobile ? 'text-[9px]' : 'text-sm'} text-gray-600 ${isMobile ? 'mb-2' : 'mb-4'}`}>
        Import resting heart rate, sleep duration and heart-rate variability (recovery) from Apple Health.
        Workouts from the last 90 days are imported too.
        {' '}After sync, enable <strong>Resting Heart Rate</strong>, <strong>Sleep</strong> and <strong>Heart Rate Variability</strong> under Health → Profile → Apps → LaChart.
      </p>

      {!available && unavailableReason && (
        <p className={`${isMobile ? 'text-[9px] mb-2' : 'text-xs mb-3'} text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5`}>
          {unavailableReason}
        </p>
      )}

      {diagInfo?.isSimulator && available && (
        <p className={`${isMobile ? 'text-[9px] mb-2' : 'text-xs mb-3'} text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5`}>
          iOS Simulator: Health data is limited. Add samples in the Health app, or test on a real iPhone for full sync.
        </p>
      )}

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

      {diagInfo && !available && process.env.NODE_ENV === 'development' && (
        <pre className={`${isMobile ? 'text-[8px] mb-2' : 'text-[10px] mb-3'} text-gray-500 bg-gray-50 border border-gray-100 rounded-lg p-2 overflow-x-auto whitespace-pre-wrap`}>
          {JSON.stringify(diagInfo, null, 2)}
        </pre>
      )}

      {syncStep && (
        <p className={`${isMobile ? 'text-[9px] mb-2' : 'text-xs mb-3'} text-primary font-medium`}>{syncStep}</p>
      )}

      {error && (
        <p className={`${isMobile ? 'text-[9px] mb-2' : 'text-xs mb-3'} text-red-600`}>{error}</p>
      )}

      <div className={`flex flex-wrap gap-2 ${isMobile ? '' : ''}`}>
        <button
          type="button"
          disabled={syncing}
          onClick={runSync}
          className={`${isMobile ? 'px-2.5 py-1.5 text-[10px] flex-1' : 'px-3 py-2 text-sm'} rounded-lg font-semibold bg-primary text-white hover:bg-primary-dark disabled:opacity-50`}
        >
          {syncing ? (syncStep || 'Syncing…') : connected ? 'Sync now' : 'Connect & sync'}
        </button>
        {!available && !syncing && (
          <button
            type="button"
            onClick={() => refresh()}
            className={`${isMobile ? 'px-2.5 py-1.5 text-[10px]' : 'px-3 py-2 text-sm'} rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50`}
          >
            Retry
          </button>
        )}
        <button
          type="button"
          disabled={syncing}
          onClick={() => openAppleHealthSettings()}
          className={`${isMobile ? 'px-2.5 py-1.5 text-[10px]' : 'px-3 py-2 text-sm'} rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50`}
        >
          Open Health app
        </button>
        {connected && (
          <>
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
