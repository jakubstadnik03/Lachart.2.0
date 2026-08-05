import React from 'react';
import { Link } from 'react-router-dom';

const LC = {
  primaryDark: '#5E6590',
  muted: '#6B7280',
  border: 'rgba(180,190,210,.30)',
};

/**
 * Marketing footer, shared by /about, /privacy and /terms.
 *
 * It used to live inline in About.jsx, so the legal pages carried their own
 * hand-written footers that drifted from it. Anchors are written as
 * `/about#features` rather than bare `#features` — a bare hash on /privacy
 * points at nothing, which is exactly how the copies rotted.
 */
const COLUMNS = [
  {
    h: 'Product',
    l: [
      ['Features', '/about#features'],
      ['Pricing', '/about#pricing'],
      ['Calculator', '/lactate-curve-calculator'],
      ['Tutorials', '/how-to-use'],
    ],
  },
  {
    h: 'Learn',
    l: [
      ['Lactate Guide', '/lactate-guide'],
      ['Test at home', '/blog/lactate-test-at-home'],
      ['Read your curve', '/blog/lactate-test-interpretation'],
      ['LT1 vs LT2', '/blog/lt1-vs-lt2-training-zones'],
      ['FTP vs LT2', '/blog/ftp-vs-lt2'],
    ],
  },
  {
    h: 'Company',
    l: [
      ['About', '/about#hero'],
      ['Blog', '/lactate-guide'],
      // Was /contact, which has no route at all. /support exists but sits
      // inside the authenticated block, so a logged-out visitor reading the
      // marketing pages just got bounced to /login — no better than the 404.
      // Mail always works, for everyone.
      ['Contact', 'mailto:lachart@lachart.net'],
    ],
  },
  { h: 'Legal', l: [['Privacy', '/privacy'], ['Terms', '/terms']] },
];

const linkStyle = { fontSize: 13.5, color: LC.muted, textDecoration: 'none' };

export default function SiteFooter() {
  return (
    <footer style={{ background: '#fff', borderTop: '1px solid ' + LC.border, padding: '40px 24px 24px', marginTop: 40 }}>
      <div
        className="lc-footer-grid"
        style={{ maxWidth: 1280, margin: '0 auto', display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 30 }}
      >
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <img src="/about-design/lachart-logo.png" alt="LaChart" style={{ height: 28 }} />
            <span style={{ fontSize: 16, fontWeight: 700, color: LC.primaryDark }}>LaChart</span>
          </div>
          <p style={{ fontSize: 13, color: LC.muted, lineHeight: 1.6, maxWidth: 320 }}>
            Lactate testing for endurance athletes and coaches. Calculate thresholds, build zones, generate PDF reports.
          </p>
        </div>

        {COLUMNS.map((col) => (
          <div key={col.h}>
            <h6 style={{ fontSize: 11.5, fontWeight: 800, color: LC.primaryDark, textTransform: 'uppercase', letterSpacing: '0.12em', margin: '0 0 12px' }}>
              {col.h}
            </h6>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {col.l.map(([label, href]) => (
                <li key={label}>
                  {/* Only in-app paths get a Link. Hash targets need a real
                      anchor — react-router changes the URL without scrolling to
                      the fragment, so "Features" would land at the top of
                      /about — and mailto:/http: would break Link entirely. */}
                  {href.startsWith('/') && !href.includes('#')
                    ? <Link to={href} style={linkStyle}>{label}</Link>
                    : <a href={href} style={linkStyle}>{label}</a>}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div style={{ maxWidth: 1280, margin: '24px auto 0', paddingTop: 18, borderTop: '1px solid ' + LC.border, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <span style={{ fontSize: 12, color: LC.muted }}>© {new Date().getFullYear()} LaChart. All rights reserved.</span>
        <span style={{ fontSize: 12, color: LC.muted }}>Made for athletes who measure.</span>
      </div>

      <style>{`
        @media (max-width: 720px) { .lc-footer-grid { grid-template-columns: 1fr 1fr !important; } }
        @media (max-width: 480px) { .lc-footer-grid { grid-template-columns: 1fr !important; } }
      `}</style>
    </footer>
  );
}
