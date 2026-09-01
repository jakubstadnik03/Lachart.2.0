import React from 'react';
import { Link } from 'react-router-dom';
import { LC } from './marketingKit';

/**
 * Shared marketing top nav — the same sticky bar the About page uses, so
 * standalone marketing pages (e.g. /for-coaches) carry identical chrome.
 * Requires the marketing STYLE block (lc-nav-link etc.) to be present on the
 * page; ForCoaches injects it. Links default to the About-page sections.
 */
const DEFAULT_LINKS = [
  // The three jobs, named. One account type covered two very different coach
  // products and the site sold them as one, so the reader had to work out which
  // was theirs from a feature list aimed at somebody else.
  ['/for-testers', 'For testers'],
  ['/for-coaches', 'For coaches'],
  ['/for-athletes', 'For athletes'],
  ['/about#features', 'Features'],
  ['/about#download', 'App'],
  ['/how-to-use', 'Tutorials'],
  ['/about#pricing', 'Pricing'],
];

const SiteNav = ({ links = DEFAULT_LINKS, ctaHref = '/signup' }) => (
  <nav
    style={{
      position: 'sticky', top: 0, zIndex: 100,
      background: 'rgba(255,255,255,.92)',
      backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
      borderBottom: '1px solid rgba(180,190,210,.18)',
    }}
  >
    <style>{`@media (max-width: 900px){ .lc-sitenav-links, .lc-sitenav-ghost { display: none !important; } }`}</style>
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
      <Link to="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, fontWeight: 700, color: LC.primaryDark, fontSize: 18, textDecoration: 'none' }}>
        <img src="/about-design/lachart-logo.png" alt="LaChart" style={{ height: 32, width: 'auto' }} />
        <span>LaChart</span>
      </Link>
      <div className="lc-sitenav-links" style={{ display: 'flex', gap: 4 }}>
        {links.map(([href, label]) => (
          href.startsWith('/') && !href.includes('#')
            ? <Link key={href} to={href} className="lc-nav-link">{label}</Link>
            : <a key={href} href={href} className="lc-nav-link">{label}</a>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <Link to="/login" className="lc-sitenav-ghost" style={{ color: LC.muted, textDecoration: 'none', fontSize: 14, fontWeight: 500, padding: '8px 12px' }}>Sign in</Link>
        <Link to={ctaHref} style={{
          padding: '10px 18px', borderRadius: 10, background: LC.primaryDark, color: '#fff',
          textDecoration: 'none', fontSize: 14, fontWeight: 700,
          boxShadow: '0 4px 12px -4px rgba(118,126,181,.5)',
        }}>Start free</Link>
      </div>
    </div>
  </nav>
);

export default SiteNav;
