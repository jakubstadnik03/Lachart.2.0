import React, { useRef } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { LC, STYLE, Eyebrow, BrowserFrame, useReveal } from '../components/About/marketingKit';
import SiteNav from '../components/About/SiteNav';
import SiteFooter from '../components/About/SiteFooter';
import { ATHLETE_PLAN_PRICE_LABEL } from '../constants/planPricing';

/**
 * Landing page for the athlete (/for-athletes).
 *
 * The third of the three jobs the app is hired for, and the only one where the
 * training data matters as much as the test. A coach page sells a roster and a
 * tester page sells a report; this one sells the thing an athlete actually
 * comes back for — every session read against a threshold that was measured
 * rather than estimated from a formula.
 */

const CANONICAL = 'https://lachart.net/for-athletes';

const STEPS = [
  { n: '1', t: 'Connect', d: 'Strava, Garmin or Apple Health. Rides, runs and swims arrive on their own, with power, pace, heart rate and laps.' },
  { n: '2', t: 'Get tested', d: 'A lactate step test — yours, or one your coach or a studio enters for you — sets LT1 and LT2 from blood rather than a percentage of a guess.' },
  { n: '3', t: 'Train', d: 'Zones that came out of your own curve, on the bike, the road and your watch.' },
  { n: '4', t: 'Watch it move', d: 'Every session read back against the test: where your heart sat, how long you held each threshold, and when the zones stop describing you.' },
];

const FEATURES = [
  { t: 'Zones from measurement, not a formula', d: 'LT1 and LT2 come off your lactate curve. Everything downstream — zones, load, session categories — is anchored to those two numbers instead of a fraction of an estimated FTP.' },
  { t: 'Time at your thresholds', d: 'Not five zones whose widths depend on where your thresholds happen to sit, but minutes spent below LT1, at LT1, between, at LT2 and above. The same sentence means the same thing for everyone.' },
  { t: 'Heart rate against your test', d: 'You held 250 W at 138 bpm; on test day that intensity cost you 147. Read straight off the stages, nothing extrapolated.' },
  { t: 'A nudge when it is time to retest', d: 'When weeks of sessions agree that your threshold has moved, the app says so — and says how confident it is, and why.' },
  { t: 'Field lactate on any interval', d: 'Take a sample mid-session and it is compared against your own curve: the same lactate at a higher intensity is the curve moving right.' },
  { t: 'The whole picture', d: 'Form and fitness, load, peak efforts, weather, illness and injury — with an iPhone app and an Apple Watch face for the zones.' },
];

const Check = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={LC.primary} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M20 6 9 17l-5-5" /></svg>
);

const INCLUDED = [
  'Strava, Garmin & Apple Health sync',
  'Unlimited lactate tests',
  'iPhone app and Apple Watch zones',
  'Works with or without a coach',
];

const ForAthletes = () => {
  const revealRefs = useRef([]);
  const pushRef = (el) => { if (el && !revealRefs.current.includes(el)) revealRefs.current.push(el); };
  useReveal(revealRefs.current);

  return (
    <div className="lc-page lc-page-in">
      <Helmet>
        <title>Train by Measured Thresholds, Not Estimates — LaChart for Athletes</title>
        <meta name="description" content="Connect Strava or Garmin, set your zones from a real lactate test, and see every session read against it — time at LT1 and LT2, heart rate versus your own curve, and a nudge when it is time to retest. 2 weeks free." />
        <meta name="keywords" content="lactate threshold training, LT1 LT2 zones, training zones from lactate test, endurance training app, Strava lactate, Garmin lactate threshold, zone 2 training, threshold heart rate" />
        <meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large" />
        <link rel="canonical" href={CANONICAL} />
        <meta property="og:title" content="Train by Measured Thresholds, Not Estimates | LaChart" />
        <meta property="og:description" content="Zones from your own lactate curve, and every session read back against it." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={CANONICAL} />
        <meta property="og:image" content="https://lachart.net/images/lactate-pdf-report.jpg" />
        <meta property="og:site_name" content="LaChart" />
        <meta name="twitter:card" content="summary_large_image" />
        <script type="application/ld+json">{JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'SoftwareApplication',
          name: 'LaChart — Lactate-Based Training for Athletes',
          applicationCategory: 'HealthApplication',
          operatingSystem: 'Web, iOS, Android',
          description: 'Training zones from a measured lactate test, with every session read back against it.',
          offers: { '@type': 'Offer', price: '6.99', priceCurrency: 'EUR', description: 'Athlete subscription — 2-week free trial' },
          url: CANONICAL,
        })}</script>
      </Helmet>

      <style>{STYLE}</style>

      <SiteNav ctaHref="/signup?plan=athlete" />

      {/* Hero */}
      <header className="lc-sectpad" style={{ paddingBottom: 32 }}>
        <div className="lc-fa-hero" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.05fr) minmax(0,1fr)', gap: 48, alignItems: 'center' }}>
          <div ref={pushRef} className="lc-reveal">
            <Eyebrow>For athletes</Eyebrow>
            <h1 className="lc-huge" style={{ margin: '18px 0 18px' }}>Your zones, <em>measured.</em></h1>
            <p className="lc-lead" style={{ maxWidth: 560 }}>
              Most apps guess your threshold from a percentage of a number you estimated. LaChart takes it
              from <strong style={{ color: LC.text }}>your lactate curve</strong> — then reads every ride
              and run back against it, so you can see the curve move.
            </p>
            <div style={{ display: 'flex', gap: 12, marginTop: 28, flexWrap: 'wrap', alignItems: 'center' }}>
              <Link to="/signup?plan=athlete" className="lc-btn-primary">🎁 Start your 2-week free trial</Link>
              <Link to="/lactate-curve-calculator" className="lc-btn-ghost">Try the curve calculator</Link>
            </div>
            <ul style={{ listStyle: 'none', padding: 0, margin: '22px 0 0', display: 'grid', gap: 8 }}>
              {INCLUDED.map((n) => (
                <li key={n} style={{ display: 'flex', gap: 10, alignItems: 'center', color: LC.muted, fontSize: 14 }}>
                  <Check />{n}
                </li>
              ))}
            </ul>
          </div>
          <div ref={pushRef} className="lc-reveal right lc-float">
            <BrowserFrame label="lachart.net · dashboard">
              <img src="/about-design/dashboard-home.png" alt="LaChart dashboard with the athlete's lactate curve, zones and form & fitness" loading="eager" style={{ display: 'block', width: '100%' }} />
            </BrowserFrame>
          </div>
        </div>
        <style>{`@media (max-width: 900px){ .lc-fa-hero { grid-template-columns: 1fr !important; gap: 32px !important; } }`}</style>
      </header>

      {/* Workflow */}
      <section className="lc-sectpad" style={{ paddingTop: 24 }}>
        <div ref={pushRef} className="lc-reveal" style={{ marginBottom: 34 }}>
          <Eyebrow>How it works</Eyebrow>
          <h2 className="lc-big" style={{ margin: '14px 0 8px' }}>Test once, then every session means something</h2>
          <p className="lc-lead">A lactate test is a snapshot. The point is what the next three months of training do to it.</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 16 }}>
          {STEPS.map((s, i) => (
            <div key={s.n} ref={pushRef} className={`lc-reveal d${i + 1} lc-card`}>
              <div style={{ width: 30, height: 30, borderRadius: 9, background: LC.primary, color: '#fff', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>{s.n}</div>
              <h3 style={{ margin: '12px 0 6px', fontSize: 17, color: LC.ink }}>{s.t}</h3>
              <p style={{ margin: 0, fontSize: 14, color: LC.muted, lineHeight: 1.5 }}>{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Gallery */}
      <section className="lc-sectpad" style={{ paddingTop: 24 }}>
        <div ref={pushRef} className="lc-reveal" style={{ marginBottom: 30 }}>
          <Eyebrow>Inside</Eyebrow>
          <h2 className="lc-big" style={{ margin: '14px 0 8px' }}>What you actually look at</h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
          {[
            { img: '/about-design/lactate-testing-page.png', label: 'Your curve', cap: 'LT1 and LT2 by every method, with the measured points on top.' },
            { img: '/about-design/zones-generator.png', label: 'Your zones', cap: 'Power, pace and heart-rate zones straight out of the test.' },
            { img: '/about-design/training-log-page.png', label: 'Every session', cap: 'Read back against the test — time at each threshold, heart rate versus test day.' },
          ].map((g, i) => (
            <div key={g.label} ref={pushRef} className={`lc-reveal d${i + 1}`}>
              <BrowserFrame label={g.label}>
                <img src={g.img} alt={`LaChart ${g.label}`} loading="lazy" style={{ display: 'block', width: '100%' }} />
              </BrowserFrame>
              <p style={{ color: LC.muted, fontSize: 13.5, margin: '12px 4px 0', lineHeight: 1.5 }}>{g.cap}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="lc-sectpad" style={{ paddingTop: 24 }}>
        <div ref={pushRef} className="lc-reveal" style={{ marginBottom: 30 }}>
          <Eyebrow>What you get</Eyebrow>
          <h2 className="lc-big" style={{ margin: '14px 0 8px' }}>Anchored to your physiology, not a percentage</h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
          {FEATURES.map((f, i) => (
            <div key={f.t} ref={pushRef} className={`lc-reveal d${(i % 3) + 1} lc-card`}>
              <h3 style={{ margin: '0 0 6px', fontSize: 16.5, color: LC.ink }}>{f.t}</h3>
              <p style={{ margin: 0, fontSize: 14, color: LC.muted, lineHeight: 1.55 }}>{f.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Price */}
      <section id="price" className="lc-sectpad" style={{ paddingTop: 24 }}>
        <div ref={pushRef} className="lc-reveal lc-card" style={{ textAlign: 'center', padding: 34 }}>
          <Eyebrow>One subscription</Eyebrow>
          <h2 className="lc-big" style={{ margin: '14px 0 10px' }}>
            {ATHLETE_PLAN_PRICE_LABEL}<span style={{ fontSize: 18, color: LC.muted }}> / month</span>
          </h2>
          <p className="lc-lead" style={{ maxWidth: 520, margin: '0 auto 22px' }}>
            Two weeks free, no card charged today, cancel whenever. If a coach or a studio tests you,
            their results land in your account too.
          </p>
          <Link to="/signup?plan=athlete" className="lc-btn-primary">Start free</Link>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
};

export default ForAthletes;
