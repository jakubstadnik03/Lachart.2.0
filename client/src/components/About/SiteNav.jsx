import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LC } from './marketingKit';
import { FEATURES } from '../../pages/features/featureCatalog';

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
  ['/features', 'Features'],
  ['/about#download', 'App'],
  ['/about#pricing', 'Pricing'],
];

const SiteNav = ({ links = DEFAULT_LINKS, ctaHref = '/signup', showBanner = true }) => {
  const { pathname } = useLocation();
  // Which top-level link matches the page we're on. The Features item also owns
  // its sub-pages (/features/planning etc.), so it stays lit while you browse them.
  const isActive = (href) => {
    if (!href.startsWith('/') || href.includes('#')) return false;
    if (href === '/features') return pathname === '/features' || pathname.startsWith('/features/');
    return pathname === href;
  };
  return (
  <>
  {/* Free-demo banner — the same strip About.jsx shows, so it stays put when
      the reader moves onto /for-coaches, /features, etc. */}
  {showBanner && (
    <div style={{
      background: `linear-gradient(90deg, ${LC.primary}, ${LC.secondary})`,
      color: '#fff', padding: '10px 16px', textAlign: 'center', fontSize: 13.5,
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, flexWrap: 'wrap',
    }}>
      <span>Try calculating lactate thresholds for free — <b>no sign-up needed</b></span>
      <Link to="/lactate-curve-calculator" style={{
        padding: '5px 14px', borderRadius: 8, background: '#fff', color: LC.primaryDark,
        textDecoration: 'none', fontSize: 12.5, fontWeight: 700,
      }}>Try demo</Link>
    </div>
  )}
  <nav
    style={{
      position: 'sticky', top: 0, zIndex: 100,
      background: 'rgba(255,255,255,.92)',
      backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
      borderBottom: '1px solid rgba(180,190,210,.18)',
    }}
  >
    {/* .lc-navdd* dropdown styles come from marketingKit STYLE, injected by the page. */}
    <style>{`@media (max-width: 900px){ .lc-sitenav-links, .lc-sitenav-ghost { display: none !important; } }`}</style>
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
      <Link to="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, fontWeight: 700, color: LC.primaryDark, fontSize: 18, textDecoration: 'none' }}>
        <img src="/about-design/lachart-logo.png" alt="LaChart" style={{ height: 32, width: 'auto' }} />
        <span>LaChart</span>
      </Link>
      <div className="lc-sitenav-links" style={{ display: 'flex', gap: 4 }}>
        {links.map(([href, label]) => {
          // "Features" carries a hover dropdown of its sub-pages, so the reader
          // can jump straight to the one that matches their question.
          if (href === '/features') {
            return (
              <div key={href} className="lc-navdd">
                <Link to={href} className={`lc-nav-link${isActive(href) ? ' active' : ''}`}>{label}</Link>
                <div className="lc-navdd-menu" role="menu">
                  {FEATURES.map((f) => (
                    <Link key={f.slug} to={`/features/${f.slug}`} className="lc-navdd-item" role="menuitem">
                      {f.nav || f.eyebrow}
                      {f.eyebrow && f.nav && f.eyebrow !== f.nav ? <span>{f.eyebrow}</span> : null}
                    </Link>
                  ))}
                </div>
              </div>
            );
          }
          return href.startsWith('/') && !href.includes('#')
            ? <Link key={href} to={href} className={`lc-nav-link${isActive(href) ? ' active' : ''}`}>{label}</Link>
            : <a key={href} href={href} className="lc-nav-link">{label}</a>;
        })}
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
  </>
  );
};

export default SiteNav;
