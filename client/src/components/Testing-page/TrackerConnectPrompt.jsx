import React, { useEffect, useState } from 'react';
import Modal from '../Modal';
import { connectStrava } from '../../utils/connectStrava';
import { startGarminAuth } from '../../services/api';
import { trackEvent } from '../../utils/analytics';
import { useNotification } from '../../context/NotificationContext';
import {
  extractLactateThresholds,
  formatThresholdIntensity,
} from '../../utils/extractLactateThresholds';

/**
 * Shown once a lactate test is saved by someone with no tracker connected.
 *
 * The whole point is the thresholds: the prompt leads with the LT1/LT2 this
 * test just produced, because "connect Strava" means nothing in the abstract
 * and a great deal next to your own numbers. See utils/trackerConnectPrompt.js
 * for when it fires.
 */
const COPY = {
  post_save: {
    title: 'Your zones are ready',
    lead: 'This test gives you the intensities to train at. Connect your watch and every session gets measured against them automatically — time in each zone, training load, and whether your threshold is actually moving.',
    caption: 'From the test you just saved',
  },
  standing: {
    title: 'Your zones are waiting',
    lead: 'You have thresholds from a lactate test, but nothing is being measured against them. Connect your watch and every session is — time in each zone, training load, and whether your threshold is actually moving.',
    caption: 'From your latest test',
  },
};

const TrackerConnectPrompt = ({ isOpen, onClose, test, variant = 'post_save' }) => {
  const { addNotification } = useNotification();
  const [busy, setBusy] = useState(null);
  const copy = COPY[variant] || COPY.post_save;

  useEffect(() => {
    if (!isOpen) setBusy(null);
  }, [isOpen]);

  if (!isOpen) return null;

  let thresholds = null;
  try {
    thresholds = extractLactateThresholds(test);
  } catch {
    // A test too sparse to fit a curve still deserves the prompt — it just
    // runs without the numbers.
    thresholds = null;
  }
  const sport = thresholds?.sport;
  const lt1 = thresholds?.lt1 != null ? formatThresholdIntensity(thresholds.lt1, test, sport) : null;
  const lt2 = thresholds?.lt2 != null ? formatThresholdIntensity(thresholds.lt2, test, sport) : null;
  const hasNumbers = Boolean(lt1 || lt2);

  const handleConnect = async (provider) => {
    setBusy(provider);
    trackEvent('tracker_connect_prompt_click', { provider, source: variant, sport: sport || null });
    try {
      if (provider === 'strava') {
        const started = await connectStrava();
        if (!started) throw new Error('Could not open Strava');
      } else {
        const url = await startGarminAuth();
        if (!url) throw new Error('Could not open Garmin');
        window.location.href = url;
      }
    } catch (error) {
      console.error(`[TrackerConnectPrompt] ${provider} connect failed:`, error);
      addNotification(
        provider === 'strava'
          ? 'Could not open Strava. You can connect it in Settings → Integrations.'
          : 'Could not open Garmin. You can connect it in Settings → Integrations.',
        'error'
      );
      setBusy(null);
    }
  };

  const handleDismiss = () => {
    trackEvent('tracker_connect_prompt_dismissed', { source: variant, sport: sport || null });
    onClose?.();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleDismiss} title={copy.title}>
      <div className="space-y-5">
        <p className="text-sm text-gray-600 leading-relaxed">{copy.lead}</p>

        {hasNumbers && (
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">
              {copy.caption}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {lt1 && (
                <div>
                  <div className="text-xs text-gray-500 mb-0.5">LT1 · aerobic</div>
                  <div className="text-lg font-bold text-gray-900 tabular-nums">{lt1}</div>
                  {thresholds?.lt1Hr ? (
                    <div className="text-xs text-gray-500 tabular-nums">{thresholds.lt1Hr} bpm</div>
                  ) : null}
                </div>
              )}
              {lt2 && (
                <div>
                  <div className="text-xs text-gray-500 mb-0.5">LT2 · anaerobic</div>
                  <div className="text-lg font-bold text-gray-900 tabular-nums">{lt2}</div>
                  {thresholds?.lt2Hr ? (
                    <div className="text-xs text-gray-500 tabular-nums">{thresholds.lt2Hr} bpm</div>
                  ) : null}
                </div>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-3 leading-relaxed">
              Right now nothing is being compared against these.
            </p>
          </div>
        )}

        <div className="space-y-2">
          <button
            type="button"
            onClick={() => handleConnect('strava')}
            disabled={Boolean(busy)}
            className="w-full py-3 rounded-xl text-white text-sm font-bold disabled:opacity-60"
            style={{ background: '#FC5200' }}
          >
            {busy === 'strava' ? 'Opening Strava…' : 'Connect Strava'}
          </button>
          <button
            type="button"
            onClick={() => handleConnect('garmin')}
            disabled={Boolean(busy)}
            className="w-full py-3 rounded-xl text-white text-sm font-bold disabled:opacity-60"
            style={{ background: '#007CC3' }}
          >
            {busy === 'garmin' ? 'Opening Garmin…' : 'Connect Garmin'}
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            disabled={Boolean(busy)}
            className="w-full py-3 text-sm font-semibold text-gray-500 disabled:opacity-60"
          >
            Not now
          </button>
        </div>

        <p className="text-xs text-gray-400 text-center">
          You can also do this later in Settings → Integrations.
        </p>
      </div>
    </Modal>
  );
};

export default TrackerConnectPrompt;
