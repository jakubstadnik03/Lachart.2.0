import React, { useEffect, useState } from 'react';
import {
  ArrowTrendingUpIcon, BeakerIcon, BoltIcon, CalendarDaysIcon, ChartBarIcon, UserGroupIcon,
} from '@heroicons/react/24/outline';
import { XMarkIcon } from '@heroicons/react/24/solid';
import { useAuth } from '../../context/AuthProvider';
import { usePremium } from '../../hooks/usePremium';
import { useStorePurchase } from '../../hooks/useStorePurchase';
import { planForUser } from '../../utils/planForUser';
import { trackEvent } from '../../utils/analytics';
import { getReturnSession } from '../../utils/impersonation';
import { shouldShowPaywall, markPaywallShown } from '../../utils/paywallPrompt';
import { ATHLETE_PLAN_PRICE_LABEL, COACH_PLAN_PRICE_LABEL } from '../../constants/planPricing';
import StorePurchaseFooter, { StorePriceBlock, storeButtonLabel } from '../StorePurchaseFooter';
import { PremiumButton, PREMIUM_DEEP, PREMIUM_GRADIENT } from '../PremiumButton';

const BENEFITS = {
  pro: [
    [ChartBarIcon, 'Form & fitness', 'After every session, with the 90-day trend'],
    [BeakerIcon, 'Every lactate test', 'How your LT1 and LT2 have moved'],
    [ArrowTrendingUpIcon, 'Are you getting faster?', 'Repeated sessions compared for you'],
    [BoltIcon, 'Zones that keep up', 'Thresholds estimated between tests'],
  ],
  coach: [
    [UserGroupIcon, 'Your whole team', 'Form, tests and training in one place'],
    [BeakerIcon, 'Tests for them', 'Their zones update from every test'],
    [CalendarDaysIcon, 'Plan from templates', 'Straight to their calendar and watch'],
    [ArrowTrendingUpIcon, 'Is it working?', 'Their LT2 sessions compared over months'],
  ],
};

/** A beat after Home appears, so it does not land on a blank screen. */
const DELAY_MS = 1500;

/** The rising threshold line in the header — decoration, drawn once. */
function HeroCurve() {
  return (
    <svg viewBox="0 0 320 120" preserveAspectRatio="none" aria-hidden="true"
      style={{ position: 'absolute', left: 0, right: 0, bottom: 40, width: '100%', height: 120, opacity: 0.9 }}>
      <defs>
        <linearGradient id="lcPwLine" x1="0" x2="1">
          <stop offset="0" stopColor="#7BC2EB" />
          <stop offset="1" stopColor="#B7A8FF" />
        </linearGradient>
        <linearGradient id="lcPwFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#8B7FF0" stopOpacity=".35" />
          <stop offset="1" stopColor="#8B7FF0" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d="M0 104 C 50 100, 80 92, 120 80 S 200 52, 240 36 S 300 14, 320 10 L 320 120 L 0 120 Z" fill="url(#lcPwFill)" />
      <path d="M0 104 C 50 100, 80 92, 120 80 S 200 52, 240 36 S 300 14, 320 10" fill="none" stroke="url(#lcPwLine)"
        strokeWidth="3" strokeLinecap="round" style={{ strokeDasharray: 420, strokeDashoffset: 420, animation: 'lcPwDraw 1.4s .2s ease-out forwards' }} />
    </svg>
  );
}

/**
 * The full-screen Premium offer for free users of the iOS app: right after
 * they sign in, then every few days (utils/paywallPrompt.js). It always has a
 * close button in reach; Apple rejects a paywall that cannot be dismissed, and
 * so would anyone. After a purchase the server flips isPremium and this
 * closes itself.
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
      markPaywallShown(user?._id);
      setOpen(true);
      trackEvent('paywall_shown', { plan, source: 'native_interstitial' });
    }, DELAY_MS);
    return () => clearTimeout(t);
  }, [eligible, plan, user?._id]);

  // Bought (or found to be premium): nothing left to offer.
  useEffect(() => { if (isPremium) setOpen(false); }, [isPremium]);

  // Light status bar text over the dark header while open; the app's own
  // style (dark text, Style.Light) comes back on close.
  useEffect(() => {
    if (!open) return undefined;
    let sb = null;
    import('@capacitor/status-bar')
      .then(({ StatusBar, Style }) => { sb = { StatusBar, Style }; return StatusBar.setStyle({ style: Style.Dark }); })
      .catch(() => {});
    return () => { if (sb) sb.StatusBar.setStyle({ style: sb.Style.Light }).catch(() => {}); };
  }, [open]);

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
        position: 'fixed', inset: 0, zIndex: 10000, overflowY: 'auto', background: '#F6F7FB',
        display: 'flex', flexDirection: 'column', animation: 'lcPwIn .35s cubic-bezier(.2,.8,.2,1)',
      }}
    >
      {/* ── Hero ── */}
      <div style={{
        position: 'relative', overflow: 'hidden', background: PREMIUM_DEEP, color: '#fff', flexShrink: 0,
        padding: 'calc(env(safe-area-inset-top, 0px) + 10px) 22px 128px',
      }}>
        <div aria-hidden="true" style={{
          position: 'absolute', width: 340, height: 340, right: -120, top: -140, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(139,127,240,.55), transparent 65%)',
        }} />
        <div aria-hidden="true" style={{
          position: 'absolute', width: 300, height: 300, left: -140, top: 60, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(123,194,235,.30), transparent 65%)',
        }} />
        <HeroCurve />

        <div style={{ position: 'relative', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            style={{
              width: 34, height: 34, borderRadius: 17, border: '1px solid rgba(255,255,255,.18)',
              background: 'rgba(255,255,255,.12)', color: '#fff', padding: 0, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
            }}
          >
            <XMarkIcon style={{ width: 18, height: 18 }} />
          </button>
        </div>

        <div style={{ position: 'relative', maxWidth: 440, margin: '6px auto 0' }}>
          <span style={{
            display: 'inline-block', fontSize: 11.5, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase',
            padding: '6px 11px', borderRadius: 999, background: 'rgba(255,255,255,.12)',
            border: '1px solid rgba(255,255,255,.22)',
          }}>
            LaChart {isCoach ? 'Coach' : 'Athlete'}
          </span>
          <h2 style={{ margin: '14px 0 8px', fontSize: 34, lineHeight: 1.06, fontWeight: 800, letterSpacing: '-0.03em' }}>
            {isCoach ? (
              <>Coach your team<br /><span style={gradientText}>from your phone.</span></>
            ) : (
              <>Know your training<br /><span style={gradientText}>is working.</span></>
            )}
          </h2>
          <p style={{ margin: 0, fontSize: 15, lineHeight: 1.45, color: 'rgba(255,255,255,.72)', maxWidth: 320 }}>
            {isCoach
              ? 'Everything about every athlete, measured against their own thresholds.'
              : 'Every session measured against your own lactate thresholds.'}
          </p>
        </div>
      </div>

      {/* ── Sheet ── */}
      <div style={{
        position: 'relative', marginTop: -56, flex: 1, background: '#F6F7FB', borderRadius: '28px 28px 0 0',
        padding: '22px 18px calc(env(safe-area-inset-bottom, 0px) + 16px)',
        display: 'flex', flexDirection: 'column', gap: 16,
      }}>
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, maxWidth: 440, width: '100%', margin: '0 auto',
        }}>
          {BENEFITS[isCoach ? 'coach' : 'pro'].map(([Icon, title, text], k) => (
            <div key={title} style={{
              background: '#fff', borderRadius: 18, padding: '14px 13px', border: '1px solid rgba(15,23,41,.06)',
              boxShadow: '0 8px 20px -14px rgba(20,24,51,.35)',
              animation: `lcPwCard .45s ${0.15 + k * 0.07}s cubic-bezier(.2,.8,.2,1) both`,
            }}>
              <span style={{
                width: 34, height: 34, borderRadius: 11, background: PREMIUM_GRADIENT, color: '#fff',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 6px 14px -6px rgba(76,79,168,.7)',
              }}>
                <Icon style={{ width: 19, height: 19 }} />
              </span>
              <div style={{ marginTop: 10, fontSize: 14, fontWeight: 800, color: '#0F1729', lineHeight: 1.2 }}>{title}</div>
              <div style={{ marginTop: 3, fontSize: 12.5, color: '#6B7280', lineHeight: 1.35 }}>{text}</div>
            </div>
          ))}
        </div>

        <div style={{ flex: 1, minHeight: 4 }} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 440, width: '100%', margin: '0 auto' }}>
          <StorePriceBlock price={price} trialEligible={store.trialEligible} />
          <PremiumButton size="lg" onClick={buy} disabled={Boolean(store.busy)}>
            {storeButtonLabel(store)}
          </PremiumButton>
          <button
            type="button"
            onClick={close}
            style={{ background: 'none', border: 'none', color: '#6B7280', fontSize: 14, fontWeight: 600, padding: 4, cursor: 'pointer' }}
          >
            Not now
          </button>
          <StorePurchaseFooter store={store} price={price} trialEligible={store.trialEligible} />
        </div>
      </div>

      <style>{`
        @keyframes lcPwIn { from { opacity: 0; transform: translateY(28px); } to { opacity: 1; transform: none; } }
        @keyframes lcPwCard { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
        @keyframes lcPwDraw { to { stroke-dashoffset: 0; } }
      `}</style>
    </div>
  );
}

const gradientText = {
  background: 'linear-gradient(90deg, #9FD3F5, #C3B6FF)',
  WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
};

/** Rendering must never fail because the schedule could not be read. */
function shouldShowPaywallSafe(args) {
  try { return shouldShowPaywall(args); } catch { return false; }
}
