import React, { useCallback, useEffect, useState } from 'react';
import { Watch } from 'lucide-react';
import {
  isAppleWorkoutPlanSupported,
  canScheduleAppleWorkout,
  getScheduledAppleWorkouts,
  maxScheduledAppleWorkouts,
  getAppleWorkoutAuthState,
  LaChartWorkoutPlan,
} from '../../services/appleWorkoutPlan';
import {
  autoSyncWatchWorkouts,
  isWatchAutoSyncEnabled,
  setWatchAutoSyncEnabled,
} from '../../utils/appleWatchPlanAutoSync';
import { usePremium } from '../../hooks/usePremium';
import UpgradeModal from '../UpgradeModal';

/**
 * Apple Watch — automatic planned-workout scheduling.
 *
 * This card is the ONLY place that asks for WorkoutKit scheduling permission:
 * the background sync deliberately never prompts, so without a tap here the
 * feature stays dormant. After permission is granted, the athlete's calendar
 * mirrors itself onto the watch on every app launch and every calendar edit.
 */
export default function AppleWatchPlanCard({ isMobile = false }) {
  const supported = isAppleWorkoutPlanSupported();
  const { isPremium, premiumResolved, gate, UpgradeModalProps } = usePremium();

  const [available, setAvailable] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [enabled, setEnabled] = useState(isWatchAutoSyncEnabled());
  const [scheduled, setScheduled] = useState([]);
  const [cap, setCap] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const refresh = useCallback(async () => {
    if (!supported) return;
    try {
      const ok = await canScheduleAppleWorkout();
      setAvailable(ok);
      if (!ok) return;
      // Read the permission state rather than requesting it, so simply opening
      // Settings never triggers the system prompt — and so a returning user who
      // already granted it isn't told to "Connect" again.
      const [auth, list, max] = await Promise.all([
        getAppleWorkoutAuthState(),
        getScheduledAppleWorkouts(),
        maxScheduledAppleWorkouts(),
      ]);
      setAuthorized(auth.granted);
      setScheduled(list);
      setCap(max);
    } catch (e) {
      setError(e?.message || 'Could not read the Apple Watch schedule.');
    }
  }, [supported]);

  useEffect(() => { refresh(); }, [refresh]);

  if (!supported) return null;

  const connect = async () => {
    // Premium gate first — the same feature is gated on the server route.
    // gate() opens the upgrade modal and returns false when the user lacks Pro.
    if (premiumResolved && !isPremium) {
      gate('Sending workouts to your Apple Watch', 'pro');
      return;
    }
    setBusy(true); setError(null); setResult(null);
    try {
      const auth = await LaChartWorkoutPlan.requestAuthorization();
      const granted = auth?.granted === true;
      setAuthorized(granted);
      if (!granted) {
        setError('Permission denied. Open the Watch app → LaChart and allow scheduling workouts.');
        return;
      }
      setWatchAutoSyncEnabled(true);
      setEnabled(true);
      const res = await autoSyncWatchWorkouts({ force: true });
      setResult(res);
      await refresh();
    } catch (e) {
      setError(e?.message || 'Could not schedule workouts on the Apple Watch.');
    } finally {
      setBusy(false);
    }
  };

  const syncNow = async () => {
    setBusy(true); setError(null); setResult(null);
    try {
      const res = await autoSyncWatchWorkouts({ force: true });
      setResult(res);
      await refresh();
    } catch (e) {
      setError(e?.message || 'Sync failed.');
    } finally {
      setBusy(false);
    }
  };

  const toggle = (next) => {
    setEnabled(next);
    setWatchAutoSyncEnabled(next);
    if (next) syncNow();
  };

  const upcoming = scheduled.filter((s) => !s.complete);

  return (
    <div className={`bg-white ${isMobile ? 'rounded-md' : 'rounded-lg'} border border-gray-200 ${isMobile ? 'p-2.5' : 'p-6'}`}>
      <div className={`flex items-center justify-between ${isMobile ? 'mb-2' : 'mb-4'}`}>
        <div className="flex items-center gap-2">
          <div className={`flex items-center justify-center ${isMobile ? 'w-6 h-6' : 'w-8 h-8'} bg-slate-100 rounded-lg`}>
            <Watch className={`${isMobile ? 'w-3.5 h-3.5' : 'w-4 h-4'} text-slate-700`} />
          </div>
          <h4 className={`${isMobile ? 'text-xs' : 'text-lg'} font-semibold`}>Apple Watch</h4>
        </div>
        {available && authorized && (
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200">
            Connected
          </span>
        )}
      </div>

      <p className={`${isMobile ? 'text-[11px]' : 'text-sm'} text-gray-600 mb-3`}>
        Sends your planned workouts — intervals, targets and all — straight to the
        Workout app on your Apple Watch, so they are ready to start with one tap.
        Updates itself whenever you change your calendar.
      </p>

      {!available && (
        <p className={`${isMobile ? 'text-[11px]' : 'text-sm'} text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2 mb-3`}>
          No paired Apple Watch found, or this iPhone is below iOS&nbsp;17. Pair a
          watch running watchOS&nbsp;10 or later to use this.
        </p>
      )}

      {available && (
        <>
          <label className="flex items-center gap-2 mb-3 cursor-pointer">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => toggle(e.target.checked)}
              className="w-4 h-4"
            />
            <span className={`${isMobile ? 'text-[11px]' : 'text-sm'} text-gray-700`}>
              Keep my Apple Watch in sync automatically
            </span>
          </label>

          <div className="flex flex-wrap gap-2">
            {!authorized ? (
              <button
                type="button"
                onClick={connect}
                disabled={busy}
                className="px-3 py-2 rounded-xl bg-slate-900 text-white text-sm disabled:opacity-50"
              >
                {busy ? 'Connecting…' : 'Connect Apple Watch'}
              </button>
            ) : (
              <button
                type="button"
                onClick={syncNow}
                disabled={busy}
                className="px-3 py-2 rounded-xl border border-slate-200 text-slate-700 text-sm disabled:opacity-50"
              >
                {busy ? 'Syncing…' : 'Sync now'}
              </button>
            )}
          </div>

          {upcoming.length > 0 && (
            <p className={`${isMobile ? 'text-[11px]' : 'text-sm'} text-gray-600 mt-3`}>
              {upcoming.length} workout{upcoming.length === 1 ? '' : 's'} on your watch
              {cap > 0 && ` (max ${cap})`}.
            </p>
          )}

          {result && !result.skipped && (
            <p className={`${isMobile ? 'text-[11px]' : 'text-sm'} text-green-700 mt-2`}>
              Synced — {result.scheduled} sent, {result.removed} removed, {result.unchanged} already up to date.
            </p>
          )}
          {result?.skipped === 'not_premium' && (
            <p className={`${isMobile ? 'text-[11px]' : 'text-sm'} text-amber-700 mt-2`}>
              Sending workouts to your watch is a Pro feature.
            </p>
          )}
        </>
      )}

      {error && (
        <p className={`${isMobile ? 'text-[11px]' : 'text-sm'} text-red-600 mt-2`}>{error}</p>
      )}

      <p className={`${isMobile ? 'text-[10px]' : 'text-xs'} text-gray-400 mt-3`}>
        Apple Watch shows scheduled workouts for the next 7 days, so LaChart keeps
        a rolling week in sync rather than your whole plan.
      </p>

      <UpgradeModal {...UpgradeModalProps} />
    </div>
  );
}
