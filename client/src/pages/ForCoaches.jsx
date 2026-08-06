import React, { useRef } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { LC, STYLE, Eyebrow, BrowserFrame, useReveal } from '../components/About/marketingKit';
import SiteNav from '../components/About/SiteNav';
import SiteFooter from '../components/About/SiteFooter';

/**
 * Dedicated coach landing page (/for-coaches).
 *
 * Uses the shared marketing design kit (tokens, STYLE, reveal, nav, footer)
 * so it renders as one system with the About page. Also the SEO landing page
 * for "lactate testing software for coaches".
 */

const CANONICAL = 'https://lachart.net/for-coaches';

const STEPS = [
  { n: '1', t: 'Test', d: 'Run a step test on your client — power or pace, lactate, heart rate. Or let them sync from Strava & Garmin.' },
  { n: '2', t: 'Store', d: 'Every test saved to their profile forever. Overlay curves over time to show progress at a glance.' },
  { n: '3', t: 'Report', d: 'Export a polished PDF with LT1, LT2, OBLA and full zones — carrying your logo, studio name and contact.' },
  { n: '4', t: 'Analyse', d: 'Read their training with power/HR/pace curves, laps, intervals, form & fitness (CTL/ATL/TSB).' },
  { n: '5', t: 'Plan', d: 'Build structured workouts straight into each athlete’s calendar. Plan, log and review in one place.' },
];

const FEATURES = [
  { t: 'One workspace, every athlete', d: 'Switch between clients in a tap. Status dots (green / amber / red) show who is due for a re-test.' },
  { t: 'Branded PDF reports', d: 'Your logo, studio name and contact on every test report — a professional handout you give the athlete.' },
  { t: 'Multi-method thresholds', d: 'LT1, LT2, OBLA, D-max, IAT and log-log computed together — a consensus result, not one formula’s guess.' },
  { t: 'Test on their behalf', d: 'Enter a client’s lactate step test and their zones, curve and report are ready instantly.' },
  { t: 'Plan for your athletes', d: 'Push structured workouts into any athlete’s training calendar and track completion.' },
  { t: 'Full training analysis', d: 'Laps, intervals, HR/power/cadence streams, training load and zone distribution — per athlete.' },
];

const Check = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={LC.primary} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M20 6 9 17l-5-5" /></svg>
);

const ForCoaches = () => {
  const revealRefs = useRef([]);
  const pushRef = (el) => { if (el && !revealRefs.current.includes(el)) revealRefs.current.push(el); };
  useReveal(revealRefs.current);

  return (
    <div className="lc-page lc-page-in">
      <Helmet>
        <title>Lactate Testing Software for Coaches — Branded Reports & Athlete Management | LaChart</title>
        <meta name="description" content="LaChart is lactate testing software built for coaches and testing studios: store every test, generate branded PDF reports with your logo, evaluate LT1/LT2, and plan & analyse your athletes' training. 2 weeks free." />
        <meta name="keywords" content="lactate testing software, lactate testing software for coaches, lactate test report, branded lactate report, lactate testing studio software, coaching platform, LT1 LT2 software, athlete management software, endurance coaching software" />
        <meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large" />
        <link rel="canonical" href={CANONICAL} />
        <meta property="og:title" content="Lactate Testing Software for Coaches | LaChart" />
        <meta property="og:description" content="Store tests, generate branded PDF reports with your logo, evaluate LT1/LT2, plan & analyse your athletes' training. 2 weeks free." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={CANONICAL} />
        <meta property="og:image" content="https://lachart.net/images/lactate-pdf-report.jpg" />
        <meta property="og:site_name" content="LaChart" />
        <meta name="twitter:card" content="summary_large_image" />
        <script type="application/ld+json">{JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'SoftwareApplication',
          name: 'LaChart — Lactate Testing Software for Coaches',
          applicationCategory: 'SportsApplication',
          operatingSystem: 'Web, iOS, Android',
          description: 'Lactate testing and endurance-coaching software: store tests, generate branded PDF reports, evaluate LT1/LT2, plan and analyse athlete training.',
          offers: { '@type': 'Offer', price: '14.99', priceCurrency: 'EUR', description: 'Coach plan — 2-week free trial' },
          url: CANONICAL,
        })}</script>
      </Helmet>

      <style>{STYLE}</style>

      <SiteNav ctaHref="/signup?plan=coach" />

      {/* Hero */}
      <header className="lc-sectpad" style={{ paddingBottom: 32 }}>
        <div className="lc-fc-hero" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.05fr) minmax(0,1fr)', gap: 48, alignItems: 'center' }}>
          <div ref={pushRef} className="lc-reveal">
            <Eyebrow>For coaches &amp; testing studios</Eyebrow>
            <h1 className="lc-huge" style={{ margin: '18px 0 18px' }}>Coach a team. <em>Without spreadsheets.</em></h1>
            <p className="lc-lead" style={{ maxWidth: 560 }}>
              You already test lactate. LaChart is the software that stores every test, turns it into a
              <strong style={{ color: LC.text }}> branded PDF report with your logo</strong>, evaluates LT1 &amp; LT2, and
              lets you plan and analyse your athletes&rsquo; training — all in one workspace.
            </p>
            <div style={{ display: 'flex', gap: 12, marginTop: 28, flexWrap: 'wrap', alignItems: 'center' }}>
              <Link to="/signup?plan=coach" className="lc-btn-primary">🎁 Start your 2-week free trial</Link>
              <a href="#pricing" className="lc-btn-ghost">See pricing</a>
            </div>
            <p style={{ color: LC.muted, fontSize: 13.5, marginTop: 14 }}>No charge today · cancel anytime · unlimited athletes</p>
          </div>
          <div ref={pushRef} className="lc-reveal right lc-float">
            <BrowserFrame label="lachart.net · coach dashboard">
              <img src="/about-design/dashboard-home.png" alt="LaChart coach dashboard showing an athlete's lactate curve, training zones and form & fitness" loading="eager" style={{ display: 'block', width: '100%' }} />
            </BrowserFrame>
          </div>
        </div>
        <style>{`@media (max-width: 900px){ .lc-fc-hero { grid-template-columns: 1fr !important; gap: 32px !important; } }`}</style>
      </header>

      {/* Workflow */}
      <section className="lc-sectpad" style={{ paddingTop: 24 }}>
        <div ref={pushRef} className="lc-reveal" style={{ marginBottom: 34 }}>
          <Eyebrow>The workflow</Eyebrow>
          <h2 className="lc-big" style={{ margin: '14px 0 8px' }}>From a drop of blood to a training plan</h2>
          <p className="lc-lead">Everything a coach does around a lactate test — in one connected flow, per athlete.</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 16 }}>
          {STEPS.map((s, i) => (
            <div key={s.n} ref={pushRef} className={`lc-reveal d${i + 1} lc-card`}>
              <div style={{ width: 30, height: 30, borderRadius: 9, background: LC.primary, color: '#fff', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>{s.n}</div>
              <h3 style={{ margin: '12px 0 6px', fontSize: 17, color: LC.ink }}>{s.t}</h3>
              <p style={{ margin: 0, fontSize: 14, color: LC.muted, lineHeight: 1.5 }}>{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Product gallery */}
      <section className="lc-sectpad" style={{ paddingTop: 24 }}>
        <div ref={pushRef} className="lc-reveal" style={{ marginBottom: 30 }}>
          <Eyebrow>Inside the workspace</Eyebrow>
          <h2 className="lc-big" style={{ margin: '14px 0 8px' }}>See what your athletes get</h2>
          <p className="lc-lead">Lactate testing, a full training calendar and auto-generated zones — one tool for the whole coaching relationship.</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
          {[
            { img: '/about-design/lactate-testing-page.png', label: 'Lactate testing', cap: 'Enter a step test — the curve, LT1, LT2 and zones compute instantly.' },
            { img: '/about-design/training-calendar.png', label: 'Training calendar', cap: 'Plan, log and review each athlete’s week in one place.' },
            { img: '/about-design/zones-generator.png', label: 'Training zones', cap: 'Power, heart-rate and pace zones straight from the test.' },
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

      {/* Branded PDF showcase */}
      <section className="lc-sectpad" style={{ paddingTop: 24 }}>
        <div ref={pushRef} className="lc-reveal lc-card" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 36, alignItems: 'center', padding: 28 }}>
          <img src="/images/lactate-pdf-report.jpg" alt="Branded lactate test PDF report with a coach's logo, showing the lactate curve, LT1/LT2 thresholds and training zones" loading="lazy" style={{ width: '100%', borderRadius: 14, boxShadow: '0 24px 48px -24px rgba(15,23,41,.35)', border: '1px solid ' + LC.border }} />
          <div>
            <Eyebrow>Your brand, not ours</Eyebrow>
            <h2 className="lc-big" style={{ margin: '14px 0 10px' }}>A report that sells your service</h2>
            <p className="lc-lead" style={{ marginBottom: 20 }}>
              Every test exports as a clean PDF carrying <strong style={{ color: LC.text }}>your logo, studio name and contact details</strong> —
              the professional handout clients expect, with LT1, LT2, OBLA and their full power / heart-rate / pace zones.
            </p>
            <Link to="/signup?plan=coach" className="lc-btn-primary">Brand your first report</Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="lc-sectpad" style={{ paddingTop: 24 }}>
        <div ref={pushRef} className="lc-reveal" style={{ marginBottom: 34 }}>
          <Eyebrow>Everything in the Coach workspace</Eyebrow>
          <h2 className="lc-big" style={{ margin: '14px 0 8px' }}>Built for a roster, not one athlete</h2>
          <p className="lc-lead">The tools that turn testing into a coaching service.</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: 16 }}>
          {FEATURES.map((f, i) => (
            <div key={f.t} ref={pushRef} className={`lc-reveal d${(i % 3) + 1} lc-card`}>
              <h3 style={{ margin: '0 0 7px', fontSize: 17, color: LC.ink, display: 'flex', alignItems: 'center', gap: 8 }}><Check />{f.t}</h3>
              <p style={{ margin: 0, color: LC.muted, fontSize: 14.5, lineHeight: 1.55 }}>{f.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Testimonial */}
      <section className="lc-sectpad" style={{ paddingTop: 12 }}>
        <div ref={pushRef} className="lc-reveal lc-card" style={{ textAlign: 'center', padding: 'clamp(28px, 5vw, 48px)', background: 'linear-gradient(135deg, ' + LC.primaryTint + ', #fff)' }}>
          <p style={{ fontSize: 'clamp(19px, 2.6vw, 26px)', lineHeight: 1.4, fontWeight: 600, letterSpacing: '-.01em', margin: '0 auto 20px', maxWidth: 720, color: LC.ink }}>
            &ldquo;I coach 14 triathletes. The athlete switcher and the &lsquo;ready for lactate&rsquo; filter saved me two hours a week. Status dots are pure gold.&rdquo;
          </p>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
            <img src="/images/coach-avatar.webp" alt="Markus B." loading="lazy" style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', border: '2px solid #fff', boxShadow: '0 2px 8px rgba(15,23,41,.15)' }} />
            <div style={{ color: LC.muted, fontSize: 14, fontWeight: 600, textAlign: 'left' }}>Markus B.<br /><span style={{ fontWeight: 500 }}>Triathlon coach · Innsbruck</span></div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="lc-sectpad" style={{ paddingTop: 12 }}>
        <div ref={pushRef} className="lc-reveal" style={{ textAlign: 'center', marginBottom: 28 }}>
          <Eyebrow>Coach plan</Eyebrow>
          <h2 className="lc-big" style={{ margin: '14px 0 0' }}>Run your whole roster — 2 weeks free</h2>
        </div>
        <div ref={pushRef} className="lc-reveal scale lc-card" style={{ maxWidth: 460, margin: '0 auto', border: '2px solid ' + LC.primary, textAlign: 'center', padding: 32 }}>
          <span style={{ display: 'inline-block', background: LC.primaryTint, color: LC.primaryDark, fontWeight: 700, fontSize: 13, padding: '5px 12px', borderRadius: 20, marginBottom: 14 }}>🎁 2-week free trial</span>
          <div style={{ fontSize: 46, fontWeight: 800, letterSpacing: '-.03em', color: LC.ink }}>€14.99<span style={{ fontSize: 17, color: LC.muted, fontWeight: 600 }}> / month</span></div>
          <p style={{ color: LC.muted, fontSize: 14, margin: '6px 0 0' }}>No charge today · cancel anytime</p>
          <ul style={{ listStyle: 'none', padding: 0, margin: '20px 0 24px', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {['Unlimited athletes', 'Branded PDF reports — your logo', 'Test on your athletes’ behalf', 'Coach dashboard & athlete switcher', 'Plan workouts into their calendars', 'Full training analysis per athlete', 'Everything in the Athlete plan'].map((li) => (
              <li key={li} style={{ display: 'flex', gap: 10, fontSize: 14.5, color: LC.text }}><Check />{li}</li>
            ))}
          </ul>
          <Link to="/signup?plan=coach" className="lc-btn-primary" style={{ width: '100%', justifyContent: 'center' }}>Start your 2-week free trial</Link>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
};

export default ForCoaches;
