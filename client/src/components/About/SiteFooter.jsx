import React from 'react';
import { Link } from 'react-router-dom';
import BackToTop from './BackToTop';

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
      ['Features', '/features'],
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
];

/**
 * Legal sits under the brand paragraph rather than in a column of its own.
 *
 * As a fifth child of a four-column grid it wrapped onto a second row, so two
 * links — Privacy and Terms — bought themselves a full extra grid row and the
 * empty band beside it. In the brand cell they cost one line.
 */
const LEGAL = [['Privacy', '/privacy'], ['Terms', '/terms']];

const linkStyle = { fontSize: 13.5, color: LC.muted, textDecoration: 'none' };

/**
 * `backToTop={false}` for a page that already floats its own way up —
 * /about has the ringed one with the scroll progress; two arrows stacked in
 * the same corner was what the reader got otherwise.
 */
export default function SiteFooter({ backToTop = true }) {
  return (
    <>
    {backToTop && <BackToTop />}
    <footer className="lc-footer" style={{ background: '#fff', borderTop: '1px solid ' + LC.border }}>
      <div
        className="lc-footer-grid"
        style={{ maxWidth: 1280, margin: '0 auto', display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 30 }}
      >
        <div className="lc-footer-brand">
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <img src="/about-design/lachart-logo.png" alt="LaChart" style={{ height: 28 }} />
            <span style={{ fontSize: 16, fontWeight: 700, color: LC.primaryDark }}>LaChart</span>
          </div>
          <p style={{ fontSize: 13, color: LC.muted, lineHeight: 1.6, maxWidth: 320 }}>
            Lactate testing for endurance athletes and coaches. Calculate thresholds, build zones, generate PDF reports.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14 }}>
            {LEGAL.map(([label, href], i) => (
              <React.Fragment key={label}>
                {i > 0 && <span aria-hidden style={{ color: LC.border, fontSize: 12 }}>·</span>}
                <Link to={href} style={linkStyle}>{label}</Link>
              </React.Fragment>
            ))}
          </div>
        </div>

        {COLUMNS.map((col) => (
          <div key={col.h} className="lc-footer-col">
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

      <div className="lc-footer-base" style={{ maxWidth: 1280, margin: '24px auto 0', paddingTop: 18, borderTop: '1px solid ' + LC.border, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <span style={{ fontSize: 12, color: LC.muted }}>© {new Date().getFullYear()} LaChart. All rights reserved.</span>
        <span className="lc-footer-tagline" style={{ fontSize: 12, color: LC.muted }}>Made for athletes who measure.</span>
      </div>

      <style>{`
        .lc-footer { padding: 40px 24px 24px; margin-top: 40px; }

        @media (max-width: 720px) {
          .lc-footer-grid { grid-template-columns: 1fr 1fr !important; gap: 22px !important; }
        }

        /* Phones.
           This used to collapse to a single column at 480 px, which stacked the
           brand block and four link lists — fourteen links, one under another —
           into a footer taller than the screen it sat under. Two columns halve
           it, the brand paragraph goes (the reader has just come down the whole
           page; it tells them nothing new), and the padding stops being desktop
           padding. */
        @media (max-width: 560px) {
          .lc-footer { padding: 24px 18px 18px; margin-top: 24px; }
          .lc-footer-grid { grid-template-columns: 1fr 1fr !important; gap: 18px 16px !important; }
          .lc-footer-brand { grid-column: 1 / -1; }
          .lc-footer-brand p { display: none; }
          .lc-footer-col h6 { margin-bottom: 8px !important; font-size: 11px !important; }
          .lc-footer-col ul { gap: 6px !important; }
          .lc-footer-col a { font-size: 13px !important; }
          .lc-footer-base { margin-top: 16px !important; padding-top: 12px !important; }
          /* Two strap lines side by side wrap into four rows on a narrow
             screen; the copyright is the one that has to be there. */
          .lc-footer-tagline { display: none; }
        }
      `}</style>
    </footer>
    </>
  );
}
