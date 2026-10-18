import React from 'react';
import { trackEvent } from '../../utils/analytics';
import { planForUser } from '../../utils/planForUser';
import {
  ATHLETE_PLAN_PRICE_LABEL,
  COACH_PLAN_PRICE_LABEL,
  TRIAL_DAYS,
} from '../../constants/planPricing';

const WEB_URL = 'https://lachart.net/settings?tab=subscription';

/**
 * The free-trial offer on the native dashboard.
 *
 * It states the terms in full — how long the trial runs, what it costs
 * afterwards, and that it can be cancelled — because a trial that hides its
 * price is a trick, and because Apple requires it of anything that mentions
 * one. The trial is started on the website: there is no StoreKit purchase in
 * this app, so the button opens a browser, exactly as UpgradeModal already
 * does here.
 *
 * When it appears is decided in utils/trialOfferPrompt.js.
 */
export default function TrialOfferCard({ user, onDismiss }) {
  const plan = planForUser('pro', user);
  const isCoach = plan === 'coach';
  const price = isCoach ? COACH_PLAN_PRICE_LABEL : ATHLETE_PLAN_PRICE_LABEL;
  const planName = isCoach ? 'Coach' : 'Athlete';

  const open = () => {
    trackEvent('trial_offer_click', { source: 'native_dashboard', plan });
    window.open(WEB_URL, '_blank', 'noopener,noreferrer');
  };

  const dismiss = () => {
    trackEvent('trial_offer_dismissed', { source: 'native_dashboard', plan });
    onDismiss?.();
  };

  return (
    <div style={{
      background: '#fff',
      border: '1px solid #E5E7EB',
      borderRadius: 18,
      padding: 18,
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '.06em',
            textTransform: 'uppercase', color: '#9CA3AF', marginBottom: 4,
          }}>
            LaChart {planName}
          </div>
          <div style={{ fontSize: 17, fontWeight: 700, color: '#0A0E1A', lineHeight: 1.25 }}>
            Your zones are measuring your training. See the rest of it.
          </div>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          style={{
            flexShrink: 0, width: 28, height: 28, borderRadius: 14,
            border: 'none', background: '#F3F4F6', color: '#6B7280',
            fontSize: 16, lineHeight: '28px', padding: 0, cursor: 'pointer',
          }}
        >
          ×
        </button>
      </div>

      <ul style={{ margin: 0, paddingLeft: 18, color: '#4B5563', fontSize: 13, lineHeight: 1.65 }}>
        <li>Your whole test history, not just the latest one</li>
        <li>Form, fitness and fatigue tracked against every session</li>
        <li>Structured workouts pushed to your watch</li>
        {isCoach && <li>Unlimited athletes on one roster</li>}
      </ul>

      <button
        type="button"
        onClick={open}
        style={{
          width: '100%', padding: '12px 14px', borderRadius: 14, border: 'none',
          background: '#5E6590', color: '#fff', fontSize: 14, fontWeight: 700,
          cursor: 'pointer',
        }}
      >
        Start {TRIAL_DAYS} days free
      </button>

      <p style={{ margin: 0, fontSize: 11, color: '#9CA3AF', lineHeight: 1.5, textAlign: 'center' }}>
        {TRIAL_DAYS} days free, then {price} a month. Cancel any time before it ends
        and you are not charged. The trial starts on lachart.net in your browser.
      </p>
    </div>
  );
}
