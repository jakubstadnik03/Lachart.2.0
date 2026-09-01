import React, { useRef } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { LC, STYLE, Eyebrow, useReveal } from '../../components/About/marketingKit';
import { APP_CARDS_STYLE } from '../../components/About/appCards';
import SiteNav from '../../components/About/SiteNav';
import SiteFooter from '../../components/About/SiteFooter';
import { FEATURES } from './featureCatalog';

/**
 * /features — the door to the per-capability pages.
 *
 * Each card carries the first live visual from that feature's page, so the
 * index is a contact sheet of the product rather than a list of nouns.
 */

const CANONICAL = 'https://lachart.net/features';

const FeaturesIndex = () => {
  const revealRefs = useRef([]);
  const pushRef = (el) => { if (el && !revealRefs.current.includes(el)) revealRefs.current.push(el); };
  useReveal(revealRefs.current);

  return (
    <div className="lc-page lc-page-in">
      <Helmet>
        <title>Features — Analysis, Planning &amp; Lactate | LaChart</title>
        <meta name="description" content="Workout analysis, a training calendar and workout builder, load and form, lactate testing, measured zones, health tracking and device integrations." />
        <meta name="keywords" content="training software features, workout analysis, training calendar, structured workouts, training load, lactate testing, training zones, Strava Garmin integration" />
        <meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large" />
        <link rel="canonical" href={CANONICAL} />
        <meta property="og:title" content="Features | LaChart" />
        <meta property="og:description" content="Workout analysis, planning, load and form, lactate testing, zones, health and integrations." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={CANONICAL} />
        <meta property="og:image" content="https://lachart.net/images/lachart-og.png" />
        <meta property="og:site_name" content="LaChart" />
        <meta name="twitter:card" content="summary_large_image" />
        <script type="application/ld+json">{JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'ItemList',
          name: 'LaChart features',
          itemListElement: FEATURES.map((f, i) => ({
            '@type': 'ListItem', position: i + 1, name: f.nav, url: `${CANONICAL}/${f.slug}`,
          })),
        })}</script>
      </Helmet>

      <style>{STYLE}</style>
      <style>{APP_CARDS_STYLE}</style>

      <SiteNav />

      <header className="lc-sectpad" style={{ paddingBottom: 20 }}>
        <div ref={pushRef} className="lc-reveal" style={{ maxWidth: 760 }}>
          <Eyebrow>Features</Eyebrow>
          <h1 className="lc-huge" style={{ margin: '18px 0 18px' }}>Everything it <em>actually does.</em></h1>
          <p className="lc-lead" style={{ fontSize: 'clamp(16px, 1.5vw, 19px)' }}>
            A full training platform — calendar, workout builder, load and form, laps and streams —
            with measured lactate thresholds underneath instead of a percentage of an estimate.
            Each page below is one part of it, in detail.
          </p>
        </div>
      </header>

      <section className="lc-sectpad" style={{ paddingTop: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 18 }}>
          {FEATURES.map((f, i) => (
            <Link
              key={f.slug} to={`/features/${f.slug}`}
              ref={pushRef} className={`lc-reveal d${(i % 4) + 1} lc-card`}
              style={{ display: 'block', textDecoration: 'none' }}
            >
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: LC.primaryDark }}>{f.eyebrow}</div>
              <h2 style={{ fontSize: 19, fontWeight: 800, color: LC.ink, margin: '10px 0 8px', letterSpacing: '-.01em' }}>{f.nav}</h2>
              <p style={{ margin: 0, fontSize: 14, color: LC.muted, lineHeight: 1.55 }}>{f.lead}</p>
              <div style={{ marginTop: 14, fontSize: 13.5, fontWeight: 700, color: LC.primaryDark }}>
                {f.blocks.length} things it does →
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="lc-sectpad" style={{ paddingTop: 24 }}>
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

export default FeaturesIndex;
