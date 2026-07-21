import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePremium } from '../hooks/usePremium';
import { isCapacitorNative } from '../utils/isNativeApp';

/**
 * Slim, dismissible reminder that the 60-day free trial exists.
 *
 * The welcome paywall fires once per user and is then gone forever, leaving
 * returning free users with no ambient nudge. This banner fills that gap:
 * shown to free web users, dismissible for the current browser session
 * (sessionStorage) so it reminds on return visits without nagging every render.
 * Hidden for premium users and on native iOS (App Store 3.1.1 — no external
 * purchase CTAs in-app).
 */
const DISMISS_KEY = 'trialBanner_dismissed';

const TrialBanner = () => {
  const { isPremium } = usePremium();
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(() => {
    try { return sessionStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; }
  });

  if (isPremium || dismissed || isCapacitorNative()) return null;

  const dismiss = (e) => {
    e.stopPropagation();
    try { sessionStorage.setItem(DISMISS_KEY, '1'); } catch { /* ignore */ }
    setDismissed(true);
  };

  return (
    <div
      onClick={() => navigate('/settings?tab=subscription')}
      className="mb-4 flex items-center gap-3 rounded-xl border border-primary/20 bg-gradient-to-r from-primary/5 to-violet-50 px-4 py-3 cursor-pointer hover:from-primary/10 transition-colors"
      role="button"
    >
      <span className="text-lg shrink-0" aria-hidden>🎁</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-gray-900">Try LaChart Pro free for 2 months</p>
        <p className="text-xs text-gray-500">Unlimited tests, advanced analytics, PDF reports & more — cancel anytime.</p>
      </div>
      <span className="hidden sm:inline-flex items-center px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-semibold shrink-0">
        Start free trial →
      </span>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="shrink-0 text-gray-400 hover:text-gray-600 text-lg leading-none px-1"
      >
        ×
      </button>
    </div>
  );
};

export default TrialBanner;
