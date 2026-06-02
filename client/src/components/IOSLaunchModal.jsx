/**
 * IOSLaunchModal — one-shot announcement that the iPhone app is on the
 * App Store. Shown to logged-in WEB users (skipped on Capacitor native —
 * they already have the app installed if they got that far). Persisted to
 * localStorage per user-id so it only appears once.
 *
 * Stacks after WhatsNewModal / WelcomePaywall — see DashboardPage for the
 * gating chain. Mirrors the WhatsNewModal API:
 *   <IOSLaunchModal open={...} onClose={...} userName={...} />
 *   import { iosLaunchSeenKey } from './IOSLaunchModal'
 */
import React, { useEffect } from 'react';
import ReactDOM from 'react-dom';

export const APP_STORE_URL = 'https://apps.apple.com/cz/app/lachart/id6764768876?l=cs';
export const iosLaunchSeenKey = (uid) => `iosLaunch2026Jun_seen_${uid}`;

export default function IOSLaunchModal({ open, onClose, userName }) {
  // Lock background scroll while the modal is open. On iOS Safari, opening
  // a fixed-position overlay without this lets the page underneath scroll
  // through the touch events.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open) return null;

  const node = (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ios-launch-title"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(10,14,26,0.55)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        display: 'grid', placeItems: 'center',
        padding: 16,
        animation: 'iosLaunchFade .18s ease-out',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 520,
          background: '#fff', borderRadius: 22,
          boxShadow: '0 28px 60px rgba(10,14,26,0.32)',
          overflow: 'hidden',
          transform: 'translateZ(0)',
          animation: 'iosLaunchPop .22s cubic-bezier(.2,.7,.3,1)',
        }}
      >
        {/* Hero with phone mockup */}
        <div
          style={{
            position: 'relative',
            background: 'linear-gradient(135deg, #767EB5 0%, #5E6590 65%, #4B5278 100%)',
            padding: '22px 24px 0',
            color: '#fff',
            overflow: 'hidden',
          }}
        >
          <span
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '4px 10px', borderRadius: 9999,
              background: 'rgba(255,255,255,0.18)', color: '#fff',
              fontSize: 10.5, fontWeight: 800, letterSpacing: '0.1em',
              textTransform: 'uppercase',
              border: '1px solid rgba(255,255,255,0.28)',
            }}
          >
            <span style={{
              width: 6, height: 6, borderRadius: 9999,
              background: '#fff',
              boxShadow: '0 0 0 4px rgba(255,255,255,0.25)',
            }} />
            Just launched
          </span>
          <h2
            id="ios-launch-title"
            style={{
              margin: '12px 0 6px',
              fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em',
              lineHeight: 1.15,
            }}
          >
            LaChart is on the App Store
          </h2>
          <p style={{ margin: 0, fontSize: 14.5, color: 'rgba(255,255,255,0.85)', lineHeight: 1.5 }}>
            {userName ? `${userName}, your ` : 'Your '}
            iPhone app is live. Today's training, Form / Fitness / Fatigue widget,
            Apple Health sync and push notifications — free, same account.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16 }}>
            <img
              src="/images/ios-launch/iphone-dashboard.png"
              alt="LaChart iOS dashboard"
              loading="eager"
              style={{
                width: 175,
                maxWidth: '50%',
                filter: 'drop-shadow(0 20px 28px rgba(0,0,0,0.28))',
                marginBottom: -28,  // overlap the white card below
              }}
            />
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '38px 24px 22px' }}>
          <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 20px', display: 'grid', gap: 10 }}>
            {[
              { icon: '📊', text: "Form / Fitness / Fatigue widget on your home screen" },
              { icon: '🏃', text: "Today's planned + completed workouts at a glance" },
              { icon: '❤️', text: 'Apple Health sync — HR, distance, training load' },
              { icon: '🔔', text: 'Push notifications for lactate-test reminders' },
            ].map((f) => (
              <li key={f.text} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 14, color: '#0A0E1A' }}>
                <span style={{ fontSize: 16, lineHeight: 1.2 }}>{f.icon}</span>
                <span style={{ lineHeight: 1.45 }}>{f.text}</span>
              </li>
            ))}
          </ul>

          <div style={{ display: 'flex', gap: 10, flexDirection: 'column' }}>
            <a
              href={APP_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => {
                try { window.gtag && window.gtag('event', 'ios_launch_modal_install_click'); } catch {}
              }}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                padding: '14px 22px', borderRadius: 14,
                background: '#000', color: '#fff',
                textDecoration: 'none',
                fontWeight: 700, fontSize: 15.5,
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M17.05 12.04c-.03-2.8 2.29-4.15 2.4-4.21-1.31-1.92-3.35-2.18-4.07-2.21-1.73-.17-3.38 1.02-4.26 1.02-.89 0-2.24-1-3.69-.97-1.9.03-3.65 1.1-4.62 2.8-1.97 3.42-.5 8.47 1.41 11.24.94 1.36 2.04 2.88 3.48 2.83 1.41-.06 1.94-.91 3.64-.91 1.69 0 2.18.91 3.65.88 1.51-.02 2.46-1.37 3.38-2.74 1.07-1.57 1.51-3.09 1.53-3.17-.03-.01-2.93-1.12-2.95-4.46zM14.4 4.34c.78-.95 1.31-2.28 1.17-3.59-1.13.05-2.49.75-3.29 1.7-.72.84-1.36 2.18-1.19 3.48 1.26.1 2.54-.64 3.31-1.59z"/></svg>
              Download from the App Store
            </a>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'transparent', color: '#6B7280',
                border: 'none', padding: '10px 16px',
                fontSize: 13.5, fontWeight: 600, cursor: 'pointer',
                borderRadius: 10,
              }}
            >
              Maybe later
            </button>
          </div>

          <p style={{ margin: '12px 0 0', textAlign: 'center', fontSize: 11.5, color: '#9CA3AF' }}>
            Requires iOS 16+ · Free · Sign in with your existing LaChart account.
          </p>
        </div>
      </div>

      <style>{`
        @keyframes iosLaunchFade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes iosLaunchPop {
          from { transform: translateY(12px) scale(.97); opacity: 0 }
          to   { transform: translateY(0) scale(1);     opacity: 1 }
        }
      `}</style>
    </div>
  );

  return ReactDOM.createPortal(node, document.body);
}
