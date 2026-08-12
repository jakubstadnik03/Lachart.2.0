import React, { useCallback, useEffect, useState } from 'react';
import { Share2 } from 'lucide-react';
import api from '../../services/api';
import { usePremium } from '../../hooks/usePremium';
import UpgradeModal from '../UpgradeModal';

const BASE = '/integrations/intervals-icu';

/**
 * intervals.icu — the bridge that carries planned workouts to Garmin and Zwift.
 *
 * Deliberately blunt in its copy: pushing to intervals.icu does NOT by itself
 * put anything on a Garmin watch. The athlete has to connect Garmin inside
 * intervals.icu and enable "upload planned workout". Claiming otherwise would
 * produce a silent failure the athlete only discovers at the start of a session.
 */
export default function IntervalsIcuCard({ isMobile = false }) {
  const { isPremium, premiumResolved, gate, UpgradeModalProps } = usePremium();

  const [status, setStatus] = useState(null);
  const [apiKey, setApiKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get(`${BASE}/status`);
      setStatus(data);
    } catch {
      setStatus(null);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const connect = async () => {
    if (premiumResolved && !isPremium) {
      gate('Sending workouts to Garmin and Zwift', 'pro');
      return;
    }
    const key = apiKey.trim();
    if (!key) { setError('Paste your intervals.icu API key first.'); return; }
    setBusy(true); setError(null); setResult(null);
    try {
      await api.post(`${BASE}/connect`, { apiKey: key });
      setApiKey('');
      const { data } = await api.post(`${BASE}/sync`, {});
      setResult(data);
      await refresh();
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Could not connect intervals.icu.');
    } finally {
      setBusy(false);
    }
  };

  const syncNow = async () => {
    setBusy(true); setError(null); setResult(null);
    try {
      const { data } = await api.post(`${BASE}/sync`, {});
      setResult(data);
      await refresh();
    } catch (e) {
      setError(e?.response?.data?.error || 'Sync failed.');
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true); setError(null); setResult(null);
    try {
      await api.post(`${BASE}/disconnect`);
      await refresh();
    } catch (e) {
      setError(e?.response?.data?.error || 'Could not disconnect.');
    } finally {
      setBusy(false);
    }
  };

  const toggleAutoPush = async (enabled) => {
    setStatus((s) => ({ ...s, autoPush: enabled }));
    try { await api.put(`${BASE}/auto-push`, { enabled }); } catch { refresh(); }
  };

  const connected = Boolean(status?.connected);
  const text = isMobile ? 'text-[11px]' : 'text-sm';

  return (
    <div className={`bg-white ${isMobile ? 'rounded-md' : 'rounded-lg'} border border-gray-200 ${isMobile ? 'p-2.5' : 'p-6'}`}>
      <div className={`flex items-center justify-between ${isMobile ? 'mb-2' : 'mb-4'}`}>
        <div className="flex items-center gap-2">
          <div className={`flex items-center justify-center ${isMobile ? 'w-6 h-6' : 'w-8 h-8'} bg-indigo-50 rounded-lg`}>
            <Share2 className={`${isMobile ? 'w-3.5 h-3.5' : 'w-4 h-4'} text-indigo-600`} />
          </div>
          <h4 className={`${isMobile ? 'text-xs' : 'text-lg'} font-semibold`}>Garmin &amp; Zwift (via intervals.icu)</h4>
        </div>
        {connected && (
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200">
            Connected
          </span>
        )}
      </div>

      <p className={`${text} text-gray-600 mb-3`}>
        Sends your planned workouts to intervals.icu, which forwards them to
        Garmin Connect and Zwift. Garmin has no way for us to deliver a workout
        directly, so this is the route that gets a LaChart session onto your watch.
      </p>

      {status && status.canConnect === false && (
        <p className={`${text} text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2 mb-3`}>
          The server has no encryption key configured (<code>SECRET_BOX_KEY</code>),
          so it will not store your API key. Set it and restart the server.
        </p>
      )}

      {!connected ? (
        <>
          <ol className={`${text} text-gray-600 mb-3 list-decimal pl-4 space-y-1`}>
            <li>
              Open{' '}
              <a href="https://intervals.icu/settings" target="_blank" rel="noopener noreferrer"
                 className="text-indigo-600 underline">intervals.icu → Settings</a>{' '}
              and copy your API key (under “Developer”).
            </li>
            <li>Paste it below.</li>
            <li>
              In intervals.icu, go to <strong>Settings → Connections → Garmin</strong>,
              connect your account and tick <strong>“upload planned workout”</strong>.
              Without that last step nothing reaches your watch.
            </li>
          </ol>
          <div className="flex flex-wrap gap-2">
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="intervals.icu API key"
              autoComplete="off"
              className="flex-1 min-w-[180px] px-3 py-2 rounded-xl border border-gray-200 text-sm"
            />
            <button
              type="button"
              onClick={connect}
              disabled={busy || status?.canConnect === false}
              className="px-3 py-2 rounded-xl bg-indigo-600 text-white text-sm disabled:opacity-50"
            >
              {busy ? 'Connecting…' : 'Connect'}
            </button>
          </div>
        </>
      ) : (
        <>
          <label className="flex items-center gap-2 mb-3 cursor-pointer">
            <input
              type="checkbox"
              checked={status?.autoPush !== false}
              onChange={(e) => toggleAutoPush(e.target.checked)}
              className="w-4 h-4"
            />
            <span className={`${text} text-gray-700`}>
              Send new and edited workouts automatically
            </span>
          </label>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={syncNow}
              disabled={busy}
              className="px-3 py-2 rounded-xl border border-gray-200 text-gray-700 text-sm disabled:opacity-50"
            >
              {busy ? 'Sending…' : 'Send next 8 weeks now'}
            </button>
            <button
              type="button"
              onClick={disconnect}
              disabled={busy}
              className="px-3 py-2 rounded-xl border border-red-200 text-red-600 text-sm disabled:opacity-50"
            >
              Disconnect
            </button>
          </div>

          <p className={`${isMobile ? 'text-[10px]' : 'text-xs'} text-gray-500 mt-3`}>
            Delivered workouts appear in <strong>Garmin Connect → Training → Workouts</strong>{' '}
            and reach the watch at its next sync. LaChart can confirm the workout
            reached intervals.icu, but not that Garmin accepted it — check there
            if a session does not show up.
          </p>
        </>
      )}

      {result && (
        <p className={`${text} text-green-700 mt-2`}>
          Sent {result.pushed} of {result.total} workouts
          {result.failed ? `, ${result.failed} failed` : ''}.
        </p>
      )}
      {status?.lastPushError && !error && (
        <p className={`${text} text-red-600 mt-2`}>Last send failed: {status.lastPushError}</p>
      )}
      {error && <p className={`${text} text-red-600 mt-2`}>{error}</p>}

      <UpgradeModal {...UpgradeModalProps} />
    </div>
  );
}
