import React from 'react';
import { TRIAL_DAYS } from '../constants/planPricing';

const open = (url) => () => window.open(url, '_blank', 'noopener,noreferrer');

const linkStyle = {
  background: 'none', border: 'none', padding: 0, margin: 0,
  color: '#9CA3AF', fontSize: 11, fontWeight: 600, textDecoration: 'underline', cursor: 'pointer',
};

/**
 * The small print under an App Store purchase button, kept to one line.
 *
 * Apple (guideline 3.1.2) wants it next to the button: the price after the
 * trial, that it renews on its own and can be cancelled, Restore Purchases,
 * and links to the terms and privacy policy. That is all it says.
 */
export default function StorePurchaseFooter({ store, price, trialEligible = true, align = 'center' }) {
  const busy = Boolean(store.busy);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, textAlign: align }}>
      {store.message && (
        <p role="status" style={{ margin: '0 0 2px', fontSize: 12, color: '#4B5563', lineHeight: 1.45 }}>
          {store.message}
        </p>
      )}
      <p style={{ margin: 0, fontSize: 11, color: '#9CA3AF', lineHeight: 1.45 }}>
        {`${price}/month, renews automatically until cancelled.`}
        {trialEligible ? ` Charged after the ${TRIAL_DAYS}-day free trial.` : ''}
      </p>
      <div style={{
        display: 'flex', gap: 10, flexWrap: 'wrap',
        justifyContent: align === 'center' ? 'center' : 'flex-start',
      }}
      >
        <button type="button" onClick={store.restore} disabled={busy} style={{ ...linkStyle, opacity: busy ? 0.5 : 1 }}>
          {store.busy === 'restoring' ? 'Restoring…' : 'Restore'}
        </button>
        <button type="button" onClick={open('https://lachart.net/terms')} style={linkStyle}>Terms</button>
        <button type="button" onClick={open('https://lachart.net/privacy')} style={linkStyle}>Privacy</button>
      </div>
    </div>
  );
}

/**
 * The price, as the biggest pricing element on the screen.
 *
 * App Review (3.1.2(c), Oct 2026) rejected a flow whose free trial stood out
 * more than the billed amount. So the amount is large and first, and the trial
 * is a smaller line under it. Goes right above the purchase button.
 */
export function StorePriceBlock({ price, trialEligible = true, align = 'center', tone = 'light' }) {
  const dark = tone === 'dark';
  return (
    <div style={{ textAlign: align, display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div style={{ color: dark ? '#fff' : '#0F1729', lineHeight: 1.1 }}>
        <span style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em' }}>{price}</span>
        <span style={{ fontSize: 15, fontWeight: 600, color: dark ? 'rgba(255,255,255,.75)' : '#4B5563' }}> / month</span>
      </div>
      {trialEligible && (
        <div style={{ fontSize: 12.5, color: dark ? 'rgba(255,255,255,.7)' : '#6B7280' }}>
          {TRIAL_DAYS}-day free trial first · cancel anytime
        </div>
      )}
    </div>
  );
}

/** Label for the main button, given where the purchase is. */
export function storeButtonLabel(store) {
  if (store.busy === 'buying') return 'Opening the App Store…';
  if (store.busy === 'confirming') return 'Confirming…';
  if (store.busy === 'restoring') return 'Restoring…';
  return 'Subscribe';
}
