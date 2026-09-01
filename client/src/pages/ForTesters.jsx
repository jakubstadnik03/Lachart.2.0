import React, { useRef } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { LC, STYLE, Eyebrow, BrowserFrame, useReveal } from '../components/About/marketingKit';
import {
  APP_CARDS_STYLE, PhotoShowcase, LactateTestCard, ThresholdPairCard, ZonesCard, ThresholdTrendCard,
  TimeInZonesCard,
} from '../components/About/appCards';
import SiteNav from '../components/About/SiteNav';
import SiteFooter from '../components/About/SiteFooter';
import { COACH_PLAN_PRICE_LABEL } from '../constants/planPricing';

/**
 * Landing page for people who test other people (/for-testers).
 *
 * /for-coaches sells two jobs at once — testing clients and coaching a roster —
 * and the second one drowns the first. In the live data, 25 accounts have run
 * tests on three or more different people and only five ever connected a
 * device: they are not coaching a squad through a season, they run a test and
 * hand back a result. Told about workout calendars and athlete rosters, that
 * reader concludes this is a training platform they would have to adopt.
 *
 * So this page sells one job. Training calendars, workout building and season
 * structure are not mentioned — not softened, not further down the page,
 * absent. Everything here is the path from a drop of blood to a document the
 * client keeps.
 */

const CANONICAL = 'https://lachart.net/for-testers';

const STEPS = [
  { n: '1', t: 'Enter the test', d: 'Type the stages as you run them — load, lactate, heart rate. Power for the bike, pace for the treadmill, per-100m for the pool.' },
  { n: '2', t: 'Read the curve', d: 'LT1 and LT2 by log-log, IAT, OBLA, D-max and LTP at once, with the measured points on top. A consensus, not one formula’s guess.' },
  { n: '3', t: 'Hand it over', d: 'A PDF carrying your logo, your studio name and your contact details. The client walks out with it.' },
  { n: '4', t: 'They come back', d: 'The next test lands beside the last one — both curves on the same axes, and what moved between them.' },
];

const FEATURES = [
  { t: 'Every client, one workspace', d: 'Add a person, enter their test, done. No invitation to accept, no app for them to install, no account for them to remember.' },
  { t: 'Your name on the report', d: 'Logo, studio name and contact on the PDF. It is your document; LaChart just draws the curve.' },
  { t: 'Six threshold methods, side by side', d: 'Log-log, IAT, OBLA 2.0–4.0, baseline offsets, D-max and LTP — with the lactate and heart rate at each, so you can defend the number you chose.' },
  { t: 'Zones out of the test', d: 'Power, pace and heart-rate zones generated from the thresholds you just measured, ready to paste into whatever the client trains with.' },
  { t: 'Test against test', d: 'Curves overlaid across visits, with the shift in LT1 and LT2 — the thing a returning client is paying to see.' },
  { t: 'Bike, run and swim', d: 'Watts, minutes per kilometre or minutes per hundred metres. Step or distance stages, metric or imperial.' },
];

const NOT_NEEDED = [
  'No Strava or Garmin connection',
  'No device for the client to own',
  'No training data required',
  'The test is the whole job',
];

const Check = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={LC.primary} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M20 6 9 17l-5-5" /></svg>
);

const ForTesters = () => {
  const revealRefs = useRef([]);
  const pushRef = (el) => { if (el && !revealRefs.current.includes(el)) revealRefs.current.push(el); };
  useReveal(revealRefs.current);

  return (
    <div className="lc-page lc-page-in">
      <Helmet>
        <title>Lactate Test Software for Labs &amp; Studios | LaChart</title>
        <meta name="description" content="Enter a lactate step test, get LT1 and LT2 by six methods, and hand the client a PDF report with your own logo. No device or training data needed." />
        <meta name="keywords" content="lactate test software, lactate testing studio, lactate analyser software, lactate curve software, branded lactate report, LT1 LT2 report, performance testing lab software, step test software, sports diagnostics software" />
        <meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large" />
        <link rel="canonical" href={CANONICAL} />
        <meta property="og:title" content="Lactate Test Software for Labs & Testing Studios | LaChart" />
        <meta property="og:description" content="Enter a step test, read LT1 and LT2 by six methods, hand the client a branded PDF. No device connection needed." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={CANONICAL} />
        <meta property="og:image" content="https://lachart.net/images/lactate-pdf-report.jpg" />
        <meta property="og:site_name" content="LaChart" />
        <meta name="twitter:card" content="summary_large_image" />
        <script type="application/ld+json">{JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'SoftwareApplication',
          name: 'LaChart — Lactate Test Software for Testing Studios',
          applicationCategory: 'SportsApplication',
          operatingSystem: 'Web, iOS, Android',
          description: 'Lactate testing software for labs and studios: enter a step test, compute LT1 and LT2 by six methods, and export a branded PDF report for the client.',
          offers: { '@type': 'Offer', price: '14.99', priceCurrency: 'EUR', description: 'Coach subscription — 2-week free trial' },
          url: CANONICAL,
        })}</script>
      </Helmet>

      <style>{STYLE}</style>
      <style>{APP_CARDS_STYLE}</style>

      <SiteNav ctaHref="/signup?plan=coach" />

      {/* Hero */}
      <header className="lc-sectpad" style={{ paddingBottom: 32 }}>
        <div className="lc-ftr-hero" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.05fr) minmax(0,1fr)', gap: 48, alignItems: 'center' }}>
          <div ref={pushRef} className="lc-reveal">
            <Eyebrow>For testing studios, labs &amp; physios</Eyebrow>
            <h1 className="lc-huge" style={{ margin: '18px 0 18px' }}>You take the blood. <em>We draw the curve.</em></h1>
            <p className="lc-lead" style={{ maxWidth: 560 }}>
              Type the stages as you run them and get LT1 and LT2 by six methods, the zones that follow,
              and a <strong style={{ color: LC.text }}>PDF with your logo on it</strong> to hand the client
              before they leave. Three tests a day, every one saved to that person forever.
            </p>
            <div style={{ display: 'flex', gap: 12, marginTop: 28, flexWrap: 'wrap', alignItems: 'center' }}>
              <Link to="/signup?plan=coach" className="lc-btn-primary">🎁 Start your 2-week free trial</Link>
              <Link to="/lactate-curve-calculator" className="lc-btn-ghost">Try it without an account</Link>
            </div>
            <ul style={{ listStyle: 'none', padding: 0, margin: '22px 0 0', display: 'grid', gap: 8 }}>
              {NOT_NEEDED.map((n) => (
                <li key={n} style={{ display: 'flex', gap: 10, alignItems: 'center', color: LC.muted, fontSize: 14 }}>
                  <Check />{n}
                </li>
              ))}
            </ul>
          </div>
          {/* A composed shot, not a screenshot — it carries its own background,
              so a BrowserFrame around it would be a browser drawn around a
              photograph of a track. */}
          <div ref={pushRef} className="lc-reveal right">
            <PhotoShowcase
              src="/about-design/hero-lactate-curve.jpg" ratio="4 / 3" priority cardScale={0.78}
              alt="A lactate curve with LT1 and LT2 marked and a test-to-test zone comparison, shown on a tablet and phone beside a running track"
              cards={[<ThresholdPairCard key="thresholds" />]}
            />
          </div>
        </div>
        <style>{`@media (max-width: 900px){ .lc-ftr-hero { grid-template-columns: 1fr !important; gap: 32px !important; } }`}</style>
      </header>

      {/* Workflow */}
      <section className="lc-sectpad" style={{ paddingTop: 24 }}>
        <div ref={pushRef} className="lc-reveal" style={{ marginBottom: 34 }}>
          <Eyebrow>The visit</Eyebrow>
          <h2 className="lc-big" style={{ margin: '14px 0 8px' }}>From a drop of blood to a document</h2>
          <p className="lc-lead">Four steps, and the client is holding the result before they have changed.</p>
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

      {/* The section that described the visit had no picture of one — and a
          screenshot parked beside a photograph reads as two separate things.
          The app sits *on* the photo instead: the curve over the lab, the
          zones over the sample, the test-to-test shift over the report. */}
      <section className="lc-sectpad" style={{ paddingTop: 8, paddingBottom: 8 }}>
        <div ref={pushRef} className="lc-reveal">
          <PhotoShowcase
            src="/marketing/athlete-testing.webp"
            alt="A step test running in a performance lab, technician recording the stages"
            width="1600" height="1067"
            cards={[<LactateTestCard key="curve" />, <ThresholdPairCard key="thresholds" />]}
          />
        </div>
        <div ref={pushRef} className="lc-reveal" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20, marginTop: 20 }}>
          <PhotoShowcase
            src="/marketing/testing.webp" ratio="4 / 3"
            alt="A capillary sample taken from a cyclist mid-stage"
            width="1600" height="1067"
            cards={[<ZonesCard key="zones" />]}
          />
          <PhotoShowcase
            src="/marketing/pdf-report.webp" ratio="4 / 3"
            alt="The finished report handed across the desk to the athlete"
            width="1600" height="1067"
            cards={[<ThresholdTrendCard key="trend" />]}
          />
        </div>
      </section>

      {/* The report */}
      <section className="lc-sectpad" style={{ paddingTop: 24 }}>
        <div ref={pushRef} className="lc-reveal" style={{ marginBottom: 30 }}>
          <Eyebrow>The deliverable</Eyebrow>
          <h2 className="lc-big" style={{ margin: '14px 0 8px' }}>What the client walks out with</h2>
          <p className="lc-lead">
            The report is the thing they paid for, so it carries your name — not ours.
          </p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
          {[
            { img: '/about-design/lachart-test-pdf.png', label: 'The report', framed: false, cap: 'Every threshold method with the power, heart rate and lactate at each — so the number you chose is one you can defend.' },
            { img: '/about-design/zones-generator.png', label: 'Their zones', framed: true, cap: 'Power, pace and heart-rate zones computed from the thresholds you just measured.' },
          ].map((g, i) => (
            <div key={g.label} ref={pushRef} className={`lc-reveal d${i + 1}`}>
              {g.framed ? (
                <BrowserFrame label={g.label}>
                  <img src={g.img} alt={`LaChart ${g.label}`} loading="lazy" style={{ display: 'block', width: '100%' }} />
                </BrowserFrame>
              ) : (
                <img src={g.img} alt={`LaChart ${g.label}`} loading="lazy"
                  style={{ display: 'block', width: '100%' }} />
              )}
              <p style={{ color: LC.muted, fontSize: 13.5, margin: '12px 4px 0', lineHeight: 1.5 }}>{g.cap}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="lc-sectpad" style={{ paddingTop: 24 }}>
        <div ref={pushRef} className="lc-reveal" style={{ marginBottom: 30 }}>
          <Eyebrow>What you get</Eyebrow>
          <h2 className="lc-big" style={{ margin: '14px 0 8px' }}>Built for the person holding the lancet</h2>
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

      {/* The components themselves, live — the reader can switch sport, pick a
          stage off the curve and see the zones move before they sign up. */}
      <section className="lc-sectpad" style={{ paddingTop: 24 }}>
        <div ref={pushRef} className="lc-reveal" style={{ marginBottom: 30 }}>
          <Eyebrow>Try it here</Eyebrow>
          <h2 className="lc-big" style={{ margin: '14px 0 8px' }}>The real thing, not a screenshot</h2>
          <p className="lc-lead">
            These are the components out of the app. Click a stage on the curve, switch sport, pick a zone —
            or read <Link to="/features/lactate-testing" style={{ color: LC.primaryDark, fontWeight: 700 }}>lactate testing</Link> and{' '}
            <Link to="/features/training-zones" style={{ color: LC.primaryDark, fontWeight: 700 }}>zones &amp; thresholds</Link> in detail.
          </p>
        </div>
        <div ref={pushRef} className="lc-reveal" style={{ display: 'flex', flexWrap: 'wrap', gap: 20, justifyContent: 'center' }}>
          <LactateTestCard />
          <ZonesCard />
          <ThresholdTrendCard />
          <TimeInZonesCard />
        </div>
      </section>

      {/* Price */}
      <section id="price" className="lc-sectpad" style={{ paddingTop: 24 }}>
        <div ref={pushRef} className="lc-reveal lc-card" style={{ textAlign: 'center', padding: 34 }}>
          <Eyebrow>One subscription</Eyebrow>
          <h2 className="lc-big" style={{ margin: '14px 0 10px' }}>
            {COACH_PLAN_PRICE_LABEL}<span style={{ fontSize: 18, color: LC.muted }}> / month</span>
          </h2>
          <p className="lc-lead" style={{ maxWidth: 520, margin: '0 auto 22px' }}>
            Unlimited people tested, unlimited tests, unlimited reports. Two weeks free, no card charged
            today, cancel whenever.
          </p>
          <Link to="/signup?plan=coach" className="lc-btn-primary">Start testing</Link>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
};

export default ForTesters;
