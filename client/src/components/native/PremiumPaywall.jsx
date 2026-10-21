import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthProvider';
import { usePremium } from '../../hooks/usePremium';
import { useStorePurchase } from '../../hooks/useStorePurchase';
import { planForUser } from '../../utils/planForUser';
import { trackEvent } from '../../utils/analytics';
import { getReturnSession } from '../../utils/impersonation';
import { shouldShowPaywall, markPaywallShown } from '../../utils/paywallPrompt';
import { ATHLETE_PLAN_PRICE_LABEL, COACH_PLAN_PRICE_LABEL } from '../../constants/planPricing';
import StorePurchaseFooter, { storeButtonLabel } from '../StorePurchaseFooter';

const BENEFITS = {
  pro: [
    ['Form & fitness', 'Fitness, fatigue and form after every session, with the 90-day trend.'],
    ['Every lactate test', 'Your full test history and how LT1 and LT2 have moved.'],
    ['Is it working?', 'Repeated sessions compared, so you see whether you are getting faster.'],
    ['Zones that keep up', 'Thresholds estimated from your training between tests.'],
  ],
  coach: [
    ['Every athlete', 'Form, tests and training for your whole team in one place.'],
    ['Tests for them', 'Enter lactate tests into their accounts; their zones update.'],
    ['Plan from templates', 'Sessions land in their calendar and on their watch.'],
    ['Is it working?', 'Compare their LT2 sessions over months, whatever they were called.'],
  ],
};

/** Time on screen before it appears, so it never covers the first glance. */
const DELAY_MS = 4000;

/**
 * The full-screen Premium offer for free users of the iOS app, shown every
 * few days (utils/paywallPrompt.js). It always has a close button in reach;
 * Apple rejects a paywall that cannot be dismissed, and so would anyone.
 * After a purchase the server flips isPremium and this closes itself.
 */
export default function PremiumPaywall() {
  const { user } = useAuth();
  const { isPremium, premiumResolved } = usePremium();
  const plan = planForUser('pro', user);
  const store = useStorePurchase(plan, 'paywall', { loadOffer: Boolean(user?._id) && !isPremium && premiumResolved });
  const [open, setOpen] = useState(false);

  const impersonating = Boolean(getReturnSession());
  const eligible = shouldShowPaywallSafe({ user, isPremium, premiumResolved, canBuy: store.available, impersonating });

  useEffect(() => {
    if (!eligible) return undefined;
    const t = setTimeout(() => {
      markPaywallShown();
      setOpen(true);
      trackEvent('paywall_shown', { plan, source: 'native_interstitial' });
    }, DELAY_MS);
    return () => clearTimeout(t);
  }, [eligible, plan]);

  // Bought (or found to be premium): nothing left to offer.
  useEffect(() => { if (isPremium) setOpen(false); }, [isPremium]);

  if (!open) return null;

  const isCoach = plan === 'coach';
  const price = store.priceLabel || (isCoach ? COACH_PLAN_PRICE_LABEL : ATHLETE_PLAN_PRICE_LABEL);
  const close = () => {
    trackEvent('paywall_dismissed', { plan, source: 'native_interstitial' });
    setOpen(false);
  };
  const buy = () => {
    trackEvent('paywall_click', { plan, source: 'native_interstitial' });
    store.buy();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="LaChart Premium"
      style={{
        position: 'fixed', inset: 0, zIndex: 10000, overflowY: 'auto',
        background: 'linear-gradient(180deg, #EEF0F8 0%, #FFFFFF 46%)',
        padding: 'calc(env(safe-area-inset-top, 0px) + 12px) 22px calc(env(safe-area-inset-bottom, 0px) + 20px)',
        display: 'flex', flexDirection: 'column',
        animation: 'lcPaywallIn .32s cubic-bezier(.2,.8,.2,1)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={close}
          aria-label="Close"
          style={{
            width: 36, height: 36, borderRadius: 18, border: 'none', background: 'rgba(15,23,41,.07)',
            color: '#374151', fontSize: 20, lineHeight: '36px', padding: 0, cursor: 'pointer',
          }}
        >
          ×
        </button>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 22, maxWidth: 440, width: '100%', margin: '0 auto' }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: '#5E6590' }}>
            LaChart {isCoach ? 'Coach' : 'Athlete'}
          </div>
          <h2 style={{ margin: '8px 0 0', fontSize: 30, lineHeight: 1.12, fontWeight: 800, color: '#0F1729', letterSpacing: '-0.02em' }}>
            {isCoach ? 'Coach your whole team from your phone.' : 'Know if your training is working.'}
          </h2>
        </div>

        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {BENEFITS[isCoach ? 'coach' : 'pro'].map(([title, text]) => (
            <li key={title} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <span aria-hidden="true" style={{
                flexShrink: 0, width: 26, height: 26, borderRadius: 13, background: '#5E6590', color: '#fff',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800,
              }}>✓</span>
              <span style={{ fontSize: 14.5, lineHeight: 1.45, color: '#374151' }}>
                <strong style={{ color: '#0F1729' }}>{/[.?!]$/.test(title) ? title : `${title}.`}</strong> {text}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 440, width: '100%', margin: '20px auto 0' }}>
        <button
          type="button"
          onClick={buy}
          disabled={Boolean(store.busy)}
          className="touch-manipulation"
          style={{
            width: '100%', padding: '16px 14px', borderRadius: 16, border: 'none',
            background: '#5E6590', color: '#fff', fontSize: 16, fontWeight: 800, cursor: 'pointer',
            opacity: store.busy ? 0.7 : 1, WebkitTapHighlightColor: 'transparent',
            boxShadow: '0 10px 24px -10px rgba(94,101,144,.6)',
          }}
        >
          {storeButtonLabel(store, store.trialEligible)}
        </button>
        <button
          type="button"
          onClick={close}
          style={{ background: 'none', border: 'none', color: '#6B7280', fontSize: 14, fontWeight: 600, padding: 6, cursor: 'pointer' }}
        >
          Not now
        </button>
        <StorePurchaseFooter store={store} price={price} trialEligible={store.trialEligible} />
      </div>

      <style>{'@keyframes lcPaywallIn { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: none; } }'}</style>
    </div>
  );
}

/** Rendering must never fail because the schedule could not be read. */
function shouldShowPaywallSafe(args) {
  try { return shouldShowPaywall(args); } catch { return false; }
}
