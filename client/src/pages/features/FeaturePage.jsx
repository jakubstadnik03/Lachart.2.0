import React, { useRef } from 'react';
import { Link, useParams, Navigate } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { LC, STYLE, Eyebrow, useReveal } from '../../components/About/marketingKit';
import { APP_CARDS_STYLE, PhotoShowcase } from '../../components/About/appCards';
import SiteNav from '../../components/About/SiteNav';
import SiteFooter from '../../components/About/SiteFooter';
import { FEATURES, featureBySlug } from './featureCatalog';

/**
 * One page per capability (/features/<slug>), rendered from featureCatalog.
 *
 * The layout is the one a feature page wants: a claim at the top, then a run
 * of alternating blocks that each pair a single visual with a single specific
 * thing the software does, then the other features and a close. Alternation is
 * by index, so adding a block to the catalogue never means touching layout.
 *
 * The visuals are the live app components, not screenshots — the reader gets
 * to switch sport, pick a stage off the curve, drop a series or select a lap
 * on the page that is describing those things.
 */

const SITE = 'https://lachart.net';

const FeaturePage = () => {
  const { slug } = useParams();
  const feature = featureBySlug(slug);

  const revealRefs = useRef([]);
  const pushRef = (el) => { if (el && !revealRefs.current.includes(el)) revealRefs.current.push(el); };
  useReveal(revealRefs.current);

  if (!feature) return <Navigate to="/features" replace />;

  const { eyebrow, title, lead, meta, blocks } = feature;
  const others = FEATURES.filter((f) => f.slug !== slug);
  const canonical = `${SITE}/features/${slug}`;

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
        <meta name="twitter:card" content="summary_large_image" />
        <script type="application/ld+json">{JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'WebPage',
          name: meta.title,
          description: meta.description,
          url: canonical,
          isPartOf: { '@type': 'WebSite', name: 'LaChart', url: SITE },
        })}</script>
      </Helmet>

      <style>{STYLE}</style>
      <style>{APP_CARDS_STYLE}</style>
      <style>{FEATURE_STYLE}</style>

      <SiteNav />

      {/* Hero — claim, one paragraph, and the first visual doing the talking. */}
      <header className="lc-sectpad" style={{ paddingBottom: 24 }}>
        <div ref={pushRef} className="lc-reveal" style={{ maxWidth: 760 }}>
          <Eyebrow>{eyebrow}</Eyebrow>
          <h1 className="lc-huge" style={{ margin: '18px 0 18px' }}>{title}</h1>
          <p className="lc-lead" style={{ fontSize: 'clamp(16px, 1.5vw, 19px)' }}>{lead}</p>
          <div style={{ display: 'flex', gap: 12, marginTop: 26, flexWrap: 'wrap' }}>
            <Link to="/signup" className="lc-btn-primary">🎁 Start your 2-week free trial</Link>
            <Link to="/features" className="lc-btn-ghost">All features</Link>
          </div>
        </div>
      </header>

      {/* The blocks — one capability each, visual and words alternating sides. */}
      {blocks.map((b, i) => (
        <section key={b.t} className="lc-sectpad lc-feat-block" style={{ paddingTop: 26, paddingBottom: 26 }}>
          <div
            ref={pushRef}
            className={`lc-reveal lc-fp-row${i % 2 ? ' lc-fp-flip' : ''}`}
          >
            <div className="lc-fp-visual">
              {b.photo ? (
                <PhotoShowcase
                  src={b.photo[0]} alt={b.photo[1]} ratio="4 / 3"
                  width="1600" height="1067" cards={[b.card]}
                />
              ) : b.visual}
            </div>
            <div className="lc-fp-text">
              <h2 style={{ fontSize: 'clamp(21px, 2.4vw, 28px)', fontWeight: 800, letterSpacing: '-.02em', color: LC.ink, margin: '0 0 12px', lineHeight: 1.2 }}>
                {b.t}
              </h2>
              <p style={{ margin: 0, fontSize: 15.5, lineHeight: 1.65, color: LC.muted }}>{b.d}</p>
            </div>
          </div>
        </section>
      ))}

      {/* Where to go next — every other feature page, one line each. */}
      <section className="lc-sectpad" style={{ paddingTop: 40 }}>
        <div ref={pushRef} className="lc-reveal" style={{ marginBottom: 22 }}>
          <Eyebrow>The rest of it</Eyebrow>
          <h2 className="lc-big" style={{ margin: '14px 0 0' }}>Other features</h2>
        </div>
        <div ref={pushRef} className="lc-reveal" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
          {others.map((f) => (
            <Link key={f.slug} to={`/features/${f.slug}`} className="lc-card lc-fp-link">
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: LC.primaryDark }}>{f.eyebrow}</div>
              <div style={{ fontSize: 17, fontWeight: 700, color: LC.ink, margin: '8px 0 6px' }}>{f.nav}</div>
              <div style={{ fontSize: 13.5, color: LC.muted, lineHeight: 1.5 }}>{f.lead}</div>
            </Link>
          ))}
        </div>
      </section>

      {/* Close */}
      <section className="lc-sectpad" style={{ paddingTop: 16 }}>
        <div ref={pushRef} className="lc-reveal lc-card" style={{ textAlign: 'center', padding: 34 }}>
          <h2 className="lc-big" style={{ margin: '0 0 10px' }}>Two weeks, nothing charged today</h2>
          <p className="lc-lead" style={{ maxWidth: 520, margin: '0 auto 22px' }}>
            Connect a device, enter a test, and see your own numbers in it. Cancel whenever.
          </p>
          <Link to="/signup" className="lc-btn-primary">Start free</Link>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
};

/* Two columns on desktop, flipping side every other block; one column on
   anything narrow, always visual-then-words so the reading order never
   depends on which side the picture happened to be on. */
export const FEATURE_STYLE = `
  .lc-fp-row {
    display: grid;
    grid-template-columns: minmax(0, 420px) minmax(0, 1fr);
    gap: 48px; align-items: center;
  }
  .lc-fp-row.lc-fp-flip { grid-template-columns: minmax(0, 1fr) minmax(0, 420px); }
  .lc-fp-row.lc-fp-flip .lc-fp-visual { order: 2; }
  .lc-fp-row.lc-fp-flip .lc-fp-text { order: 1; }
  .lc-fp-visual { display: flex; justify-content: center; }
  .lc-fp-visual > .lcui-shot { width: 100%; }
  .lc-fp-link { display: block; text-decoration: none; }

  @media (max-width: 900px) {
    .lc-fp-row, .lc-fp-row.lc-fp-flip { grid-template-columns: 1fr; gap: 24px; }
    .lc-fp-row.lc-fp-flip .lc-fp-visual { order: 0; }
    .lc-fp-row.lc-fp-flip .lc-fp-text { order: 0; }
  }
`;

export default FeaturePage;
