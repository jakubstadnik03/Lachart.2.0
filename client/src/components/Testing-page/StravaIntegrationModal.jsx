import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import Modal from '../Modal';
import { getStravaAuthUrl, startGarminAuth } from '../../services/api';
import { useNotification } from '../../context/NotificationContext';
import { isAppleHealthSupported } from '../../services/appleHealthCapacitor';
import { isCapacitorNative } from '../../utils/isNativeApp';

/**
 * Tracker connect prompt on the Testing page.
 *
 * variants:
 *   page-load  — soft nudge for Strava-based test protocols (existing copy)
 *   after-test — high-intent moment after save: connect Strava, Garmin, or
 *                Apple Health so zones meet real workouts
 */
const StravaIntegrationModal = ({ isOpen, onClose, variant = 'page-load' }) => {
  const [busy, setBusy] = useState(null); // 'strava' | 'garmin' | 'apple' | null
  const [ahMsg, setAhMsg] = useState(null);
  const { addNotification } = useNotification();
  const afterTest = variant === 'after-test';
  const appleHealthOk = afterTest && isCapacitorNative() && isAppleHealthSupported();
  const anyBusy = Boolean(busy);

  const handleConnectStrava = async () => {
    try {
      setBusy('strava');
      const url = await getStravaAuthUrl();
      window.location.href = url;
    } catch (error) {
      console.error('Strava connect error:', error);
      addNotification('Failed to start Strava connection', 'error');
      setBusy(null);
    }
  };

  const handleConnectGarmin = async () => {
    try {
      setBusy('garmin');
      const url = await startGarminAuth();
      window.location.href = url;
    } catch (error) {
      console.error('Garmin connect error:', error);
      addNotification('Failed to start Garmin connection', 'error');
      setBusy(null);
    }
  };

  const handleConnectAppleHealth = async () => {
    setBusy('apple');
    setAhMsg(null);
    try {
      const { requestAppleHealthAccess, collectAppleHealthWellness } = await import('../../services/appleHealthCapacitor');
      const { syncAppleHealthWellness } = await import('../../services/api');
      await requestAppleHealthAccess();
      const wellness = await collectAppleHealthWellness(30);
      await syncAppleHealthWellness({ wellness, markConnected: true });
      try {
        window.dispatchEvent(new CustomEvent('appleHealth:synced', {
          detail: { wellnessDays: wellness.length },
        }));
      } catch { /* ignore */ }
      addNotification('Apple Health connected', 'success');
      onClose?.();
    } catch (e) {
      console.error('Apple Health connect error:', e);
      setAhMsg('Could not read Apple Health. In Health → Profile → Apps → LaChart, enable Sleep, Resting HR and HRV, then try again.');
      setBusy(null);
    }
  };

  const title = afterTest
    ? 'Your zones are ready'
    : 'Connect Strava for Smart Test Recommendations';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <div className="space-y-6">
        {afterTest ? (
          <>
            <p className="text-sm text-gray-600 text-center leading-relaxed">
              Connect Strava, Garmin or Apple Health and every session is measured against the LT1/LT2 zones from this test.
            </p>

            <div className="bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200 rounded-xl p-5">
              <h4 className="text-base font-semibold text-gray-900 mb-3">What unlocks next</h4>
              <ul className="text-sm text-gray-800 space-y-2.5">
                <li className="flex items-start gap-2">
                  <span className="text-orange-600 font-bold mt-0.5">•</span>
                  <span><strong>Auto-import:</strong> sessions land in your calendar — no uploads</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-orange-600 font-bold mt-0.5">•</span>
                  <span><strong>Time in zone:</strong> see how much of each workout sat in LT1 / LT2</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-orange-600 font-bold mt-0.5">•</span>
                  <span><strong>Form / Fitness:</strong> TSS from your thresholds, not generic estimates</span>
                </li>
              </ul>
            </div>

            <div className="flex flex-col gap-2.5 pt-1">
              <button
                type="button"
                onClick={handleConnectStrava}
                disabled={anyBusy}
                className="w-full px-6 py-3 text-sm font-semibold text-white rounded-xl shadow-md hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                style={{ background: '#FC5200' }}
              >
                {busy === 'strava' ? 'Opening Strava…' : (
                  <>
                    <img src="/icon/strava.png" alt="" className="w-4 h-4 object-contain" />
                    Connect Strava
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleConnectGarmin}
                disabled={anyBusy}
                className="w-full px-6 py-3 text-sm font-semibold text-white rounded-xl shadow-md hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                style={{ background: '#007CC3' }}
              >
                {busy === 'garmin' ? 'Opening Garmin…' : (
                  <>
                    <img src="/icon/garmin.svg" alt="" className="w-4 h-4 object-contain" />
                    Connect Garmin
                  </>
                )}
              </button>

              {appleHealthOk && (
                <button
                  type="button"
                  onClick={handleConnectAppleHealth}
                  disabled={anyBusy}
                  className="w-full px-6 py-3 text-sm font-semibold text-white rounded-xl shadow-md hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  style={{ background: '#111827' }}
                >
                  {busy === 'apple' ? 'Reading Apple Health…' : 'Connect Apple Health'}
                </button>
              )}

              {ahMsg && (
                <p className="text-center text-xs text-rose-600 leading-snug">{ahMsg}</p>
              )}

              <button
                type="button"
                onClick={onClose}
                className="w-full px-6 py-3 text-sm font-semibold text-gray-700 bg-white border-2 border-gray-300 rounded-xl hover:bg-gray-50 transition-all"
              >
                Not now
              </button>

              {!appleHealthOk && (
                <p className="text-center text-sm text-gray-500">
                  Prefer another source?{' '}
                  <Link
                    to="/settings?tab=integrations"
                    onClick={onClose}
                    className="font-semibold text-[#5E6590] hover:underline"
                  >
                    Open Integrations
                  </Link>
                </p>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center">
                <img src="/icon/strava.png" alt="Strava" className="w-7 h-7 object-contain" />
              </div>
              <p className="text-sm text-gray-600">
                By connecting your Strava account, LaChart can analyze your running and cycling data and provide personalized lactate test recommendations for both sports.
              </p>
            </div>

            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-5">
              <h4 className="text-base font-semibold text-blue-900 mb-3 flex items-center gap-2">
                <span className="text-xl">🎯</span>
                What you&apos;ll get:
              </h4>
              <ul className="text-sm text-blue-800 space-y-2.5">
                <li className="flex items-start gap-2">
                  <span className="text-blue-600 font-bold mt-0.5">•</span>
                  <span><strong>HR-First Test Plan:</strong> Recommended lactate test protocol from your recent Strava activities (running and cycling) with heart rate data</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-600 font-bold mt-0.5">•</span>
                  <span><strong>Running:</strong> Start/end pace (min/km), stage length, and estimated duration—or sync Strava runs to auto-estimate threshold pace</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-600 font-bold mt-0.5">•</span>
                  <span><strong>Cycling:</strong> Start/end power (W), step size, and stage-by-stage targets from your profile or Strava power data</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-600 font-bold mt-0.5">•</span>
                  <span><strong>LT1/LT2 estimates:</strong> Heart rate and pace/power zones from training history; compare with test results over time</span>
                </li>
              </ul>
            </div>

            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
              <h4 className="text-sm font-semibold text-gray-900 mb-2">How it works:</h4>
              <ol className="text-sm text-gray-700 space-y-2 list-decimal list-inside">
                <li>Connect your Strava account (one-time setup)</li>
                <li>LaChart analyzes your recent runs and rides (with HR and, for bike, power)</li>
                <li>Get protocol recommendations: for run — pace range and duration; for bike — power range and stages</li>
                <li>Use the suggested protocol when doing your lactate test</li>
              </ol>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-6 py-3 text-sm font-semibold text-gray-700 bg-white border-2 border-gray-300 rounded-xl hover:bg-gray-50 transition-all"
              >
                Maybe Later
              </button>
              <button
                type="button"
                onClick={handleConnectStrava}
                disabled={anyBusy}
                className="flex-1 px-6 py-3 text-sm font-semibold text-white bg-orange-600 rounded-xl hover:bg-orange-700 shadow-md hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {busy === 'strava' ? (
                  <>
                    <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Connecting...
                  </>
                ) : (
                  <>
                    <img src="/icon/strava.png" alt="Strava" className="w-4 h-4 object-contain" />
                    Connect Strava
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
};

export default StravaIntegrationModal;
