import React, { useRef } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { LC, STYLE, Eyebrow, useReveal } from '../../components/About/marketingKit';
import { APP_CARDS_STYLE } from '../../components/About/appCards';
import SiteNav from '../../components/About/SiteNav';
import SiteFooter from '../../components/About/SiteFooter';
import { COMPARISONS, comparisonBySlug, PARITY, MIGRATION } from './comparisonCatalog';

/**
 * One page per head-to-head comparison, rendered from comparisonCatalog.
 *
 * The reader arriving here is mid-decision and sceptical by default — they know
 * whose site they are on. The layout is built around that: the section naming
 * what the other platform does better sits above the pricing table, not buried
 * under it, because a reader who finds the losses is willing to believe the
 * wins. Reordering those two sections would make this page convert worse, not
 * better.
 *
 * Slug comes in as a prop rather than a route param — each comparison owns a
 * top-level URL (/trainingpeaks-alternative, not /compare/trainingpeaks) so the
 * search term the reader typed is the path they land on.
 *
 * Anything added here must also go into PRERENDER_ROUTES in
 * client/scripts/prerender.js and into public/sitemap-main.xml, or crawlers get
 * the logged-out shell and none of this meta exists as far as Google is
 * concerned.
 */

const SITE = 'https://lachart.net';

const Check = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={LC.primary} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}><path d="M20 6 9 17l-5-5" /></svg>
);

const Balance = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={LC.muted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}><path d="M12 3v18M5 7h14M7 7l-3 6h6zM17 7l-3 6h6z" /></svg>
);

const ComparisonPage = ({ slug }) => {
  const c = comparisonBySlug(slug);

  const revealRefs = useRef([]);
  const pushRef = (el) => { if (el && !revealRefs.current.includes(el)) revealRefs.current.push(el); };
  useReveal(revealRefs.current);

  if (!c) return null;

  const { competitor, competitorUrl, eyebrow, title, lead, meta, context, edge, fair, pricing, migrationNote, faq } = c;
  const canonical = `${SITE}/${slug}`;
  const others = COMPARISONS.filter((o) => o.slug !== slug);

  return (
    <div className="lc-page lc-page-in">
      <Helmet>
        <title>{meta.title}</title>
        <meta name="description" content={meta.description} />
        <meta name="keywords" content={meta.keywords} />
        <meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large" />
        <link rel="canonical" href={canonical} />
        <meta property="og:title" content={meta.title} />
        <meta property="og:description" content={meta.description} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={canonical} />
        <meta property="og:site_name" content="LaChart" />
        <meta property="og:image" content={`${SITE}/images/lachart-og.png`} />
        <meta name="twitter:card" content="summary_large_image" />
        <script type="application/ld+json">{JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'WebPage',
          name: meta.title,
          description: meta.description,
          url: canonical,
          isPartOf: { '@type': 'WebSite', name: 'LaChart', url: SITE },
        })}</script>
        <script type="application/ld+json">{JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: faq.map((f) => ({
            '@type': 'Question',
            name: f.q,
            acceptedAnswer: { '@type': 'Answer', text: f.a },
          })),
        })}</script>
      </Helmet>

      <style>{STYLE}</style>
      <style>{APP_CARDS_STYLE}</style>
      <style>{COMPARE_STYLE}</style>

      <SiteNav ctaHref="/signup?plan=coach" />

      {/* Hero */}
      <header className="lc-sectpad" style={{ paddingBottom: 24 }}>
        <div ref={pushRef} className="lc-reveal" style={{ maxWidth: 780 }}>
          <Eyebrow>{eyebrow}</Eyebrow>
          <h1 className="lc-huge" style={{ margin: '18px 0 18px' }}>{title}</h1>
          <p className="lc-lead" style={{ fontSize: 'clamp(16px, 1.5vw, 19px)' }}>{lead}</p>
          <div style={{ display: 'flex', gap: 12, marginTop: 26, flexWrap: 'wrap' }}>
            <Link to="/signup?plan=coach" className="lc-btn-primary">🎁 Start your 2-week free trial</Link>
            <Link to="/lactate-curve-calculator" className="lc-btn-ghost">Try the free calculator</Link>
          </div>
        </div>
      </header>

      {/* Context — why this page exists at all. */}
      <section className="lc-sectpad" style={{ paddingTop: 26, paddingBottom: 26 }}>
        <div ref={pushRef} className="lc-reveal lc-cmp-row">
          <div className="lc-cmp-text">
            <h2 className="lc-big" style={{ margin: '0 0 14px' }}>{context.heading}</h2>
            {context.body.map((p, i) => (
              <p key={i} style={{ margin: '0 0 13px', fontSize: 15.5, lineHeight: 1.68, color: LC.muted }}>{p}</p>
            ))}
          </div>
          <div className="lc-cmp-visual">{context.visual}</div>
        </div>
      </section>

      {/* Parity — the capability floor, scanned for gaps rather than read. */}
      <section className="lc-sectpad" style={{ paddingTop: 30 }}>
        <div ref={pushRef} className="lc-reveal" style={{ marginBottom: 20, maxWidth: 700 }}>
          <Eyebrow>Table stakes</Eyebrow>
          <h2 className="lc-big" style={{ margin: '14px 0 10px' }}>What you would not be giving up</h2>
          <p style={{ margin: 0, fontSize: 15.5, lineHeight: 1.65, color: LC.muted }}>
            The list a coach arrives with when they are already running a roster somewhere else.
            Every line is something the app does today.
          </p>
        </div>
        <div ref={pushRef} className="lc-reveal lc-cmp-grid">
          {PARITY.map(([t, d]) => (
            <div key={t} className="lc-cmp-item">
              <Check />
              <div>
                <div style={{ fontSize: 14.5, fontWeight: 700, color: LC.ink, marginBottom: 3 }}>{t}</div>
                <div style={{ fontSize: 13.5, color: LC.muted, lineHeight: 1.55 }}>{d}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Edge */}
      <section className="lc-sectpad" style={{ paddingTop: 44 }}>
        <div ref={pushRef} className="lc-reveal" style={{ marginBottom: 20, maxWidth: 700 }}>
          <Eyebrow>The difference</Eyebrow>
          <h2 className="lc-big" style={{ margin: '14px 0 0' }}>Where LaChart is not the same product</h2>
        </div>
        <div ref={pushRef} className="lc-reveal lc-cmp-cards">
          {edge.map((e) => (
            <div key={e.t} className="lc-card lc-cmp-card">
              <div style={{ fontSize: 16.5, fontWeight: 700, color: LC.ink, marginBottom: 8 }}>{e.t}</div>
              <div style={{ fontSize: 14, color: LC.muted, lineHeight: 1.6 }}>{e.d}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Fair — deliberately above pricing. See the note at the top of the file. */}
      <section className="lc-sectpad" style={{ paddingTop: 44 }}>
        <div ref={pushRef} className="lc-reveal" style={{ marginBottom: 20, maxWidth: 700 }}>
          <Eyebrow>The honest half</Eyebrow>
          <h2 className="lc-big" style={{ margin: '14px 0 10px' }}>Where {competitor} is the better choice</h2>
          <p style={{ margin: 0, fontSize: 15.5, lineHeight: 1.65, color: LC.muted }}>
            If any of these is central to how you work, stay where you are — you would be trading
            down, and finding that out a month in helps neither of us.
          </p>
        </div>
        <div ref={pushRef} className="lc-reveal lc-cmp-grid">
          {fair.map((f) => (
            <div key={f.t} className="lc-cmp-item lc-cmp-fair">
              <Balance />
              <div>
                <div style={{ fontSize: 14.5, fontWeight: 700, color: LC.ink, marginBottom: 3 }}>{f.t}</div>
                <div style={{ fontSize: 13.5, color: LC.muted, lineHeight: 1.55 }}>{f.d}</div>
              </div>
            </div>
          ))}
        </div>
        {competitorUrl && (
          <div ref={pushRef} className="lc-reveal" style={{ marginTop: 16, fontSize: 13.5, color: LC.muted }}>
            Read {competitor}’s own case for itself at{' '}
            <a href={competitorUrl} target="_blank" rel="noopener noreferrer nofollow" style={{ color: LC.primaryDark }}>
              their site
            </a>.
          </div>
        )}
      </section>

      {/* Pricing */}
      <section className="lc-sectpad" style={{ paddingTop: 44 }}>
        <div ref={pushRef} className="lc-reveal" style={{ marginBottom: 20, maxWidth: 700 }}>
          <Eyebrow>Cost</Eyebrow>
          <h2 className="lc-big" style={{ margin: '14px 0 10px' }}>What each one costs</h2>
          <p style={{ margin: 0, fontSize: 15.5, lineHeight: 1.65, color: LC.muted }}>
            Checked {pricing.checked}. {pricing.note}
          </p>
        </div>
        <div ref={pushRef} className="lc-reveal lc-cmp-tablewrap">
          <table className="lc-cmp-table">
            <thead>
              <tr><th>Plan</th><th>Price</th><th>What it includes</th></tr>
            </thead>
            <tbody>
              {pricing.rows.map((r) => (
                <tr key={r[0]} className={r[0].startsWith('LaChart') ? 'lc-cmp-ours' : undefined}>
                  <td style={{ fontWeight: 700, color: LC.ink, whiteSpace: 'nowrap' }}>{r[0]}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{r[1]}</td>
                  <td>{r[2]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Migration */}
      <section className="lc-sectpad" style={{ paddingTop: 44 }}>
        <div ref={pushRef} className="lc-reveal" style={{ marginBottom: 20, maxWidth: 700 }}>
          <Eyebrow>Moving across</Eyebrow>
          <h2 className="lc-big" style={{ margin: '14px 0 10px' }}>What switching actually involves</h2>
          <p style={{ margin: 0, fontSize: 15.5, lineHeight: 1.65, color: LC.muted }}>{migrationNote}</p>
        </div>
        <div ref={pushRef} className="lc-reveal lc-cmp-cards">
          {MIGRATION.map((m) => (
            <div key={m.n} className="lc-card lc-cmp-card">
              <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.12em', color: LC.primaryDark, marginBottom: 8 }}>STEP {m.n}</div>
              <div style={{ fontSize: 16.5, fontWeight: 700, color: LC.ink, marginBottom: 8 }}>{m.t}</div>
              <div style={{ fontSize: 14, color: LC.muted, lineHeight: 1.6 }}>{m.d}</div>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ — also emitted as FAQPage JSON-LD above. */}
      <section className="lc-sectpad" style={{ paddingTop: 44 }}>
        <div ref={pushRef} className="lc-reveal" style={{ marginBottom: 20 }}>
          <Eyebrow>Questions</Eyebrow>
          <h2 className="lc-big" style={{ margin: '14px 0 0' }}>The ones people actually ask</h2>
        </div>
        <div ref={pushRef} className="lc-reveal" style={{ display: 'grid', gap: 12, maxWidth: 820 }}>
          {faq.map((f) => (
            <div key={f.q} className="lc-card" style={{ padding: 20 }}>
              <div style={{ fontSize: 15.5, fontWeight: 700, color: LC.ink, marginBottom: 7 }}>{f.q}</div>
              <div style={{ fontSize: 14.5, color: LC.muted, lineHeight: 1.65 }}>{f.a}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Other comparisons */}
      {others.length > 0 && (
        <section className="lc-sectpad" style={{ paddingTop: 44 }}>
          <div ref={pushRef} className="lc-reveal" style={{ marginBottom: 18 }}>
            <Eyebrow>Also comparing</Eyebrow>
            <h2 className="lc-big" style={{ margin: '14px 0 0' }}>Other side-by-sides</h2>
          </div>
          <div ref={pushRef} className="lc-reveal lc-cmp-cards">
            {others.map((o) => (
              <Link key={o.slug} to={`/${o.slug}`} className="lc-card lc-cmp-card" style={{ display: 'block', textDecoration: 'none' }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: LC.primaryDark }}>{o.eyebrow}</div>
                <div style={{ fontSize: 17, fontWeight: 700, color: LC.ink, margin: '8px 0 6px' }}>{o.title}</div>
                <div style={{ fontSize: 13.5, color: LC.muted, lineHeight: 1.5 }}>{o.lead}</div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Close */}
      <section className="lc-sectpad" style={{ paddingTop: 30 }}>
        <div ref={pushRef} className="lc-reveal lc-card" style={{ textAlign: 'center', padding: 34 }}>
          <h2 className="lc-big" style={{ margin: '0 0 10px' }}>Try it against your own data</h2>
          <p className="lc-lead" style={{ maxWidth: 560, margin: '0 auto 22px' }}>
            Connect Strava or Garmin, let your history land, and put a real test through the curve.
            Two weeks, nothing charged today, cancel whenever.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link to="/signup?plan=coach" className="lc-btn-primary">Start free</Link>
            <Link to="/for-coaches" className="lc-btn-ghost">See it for coaches</Link>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
};

export const COMPARE_STYLE = `
  .lc-cmp-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 420px);
    gap: 48px; align-items: center;
  }
  .lc-cmp-visual { display: flex; justify-content: center; }
  .lc-cmp-visual > .lcui-shot { width: 100%; }

  .lc-cmp-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 14px 26px;
  }
  .lc-cmp-item { display: flex; gap: 10px; align-items: flex-start; }

  .lc-cmp-cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 14px;
  }
  .lc-cmp-card { padding: 22px; }

  .lc-cmp-tablewrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
  .lc-cmp-table {
    width: 100%; border-collapse: collapse; min-width: 560px;
    font-size: 14px; color: ${LC.muted};
  }
  .lc-cmp-table th {
    text-align: left; padding: 10px 14px;
    font-size: 11px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase;
    color: ${LC.primaryDark}; border-bottom: 1px solid ${LC.border};
  }
  .lc-cmp-table td { padding: 13px 14px; border-bottom: 1px solid ${LC.border}; line-height: 1.55; vertical-align: top; }
  .lc-cmp-table tr.lc-cmp-ours { background: ${LC.primaryTint}; }

  @media (max-width: 900px) {
    .lc-cmp-row { grid-template-columns: 1fr; gap: 24px; }
  }
`;

export default ComparisonPage;
