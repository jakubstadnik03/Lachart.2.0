import React from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet';

/**
 * Dedicated coach landing page (/for-coaches).
 *
 * The main About page buries coach value across three blocks and the nav
 * "For coaches" link used to land on the athlete-default workspace tab. This
 * page gives coaches (and lactate-testing studios) a single, buyer-intent
 * surface: the test → store → branded PDF → analyse → plan workflow, the
 * Coach plan, and the 2-month trial. Also the SEO landing page for
 * "lactate testing software for coaches".
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

const wrapStyle = { fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif', color: '#191723', background: '#fff', minHeight: '100vh' };

const ForCoaches = () => (
  <div style={wrapStyle}>
    <Helmet>
      <title>Lactate Testing Software for Coaches — Branded Reports & Athlete Management | LaChart</title>
      <meta name="description" content="LaChart is lactate testing software built for coaches and testing studios: store every test, generate branded PDF reports with your logo, evaluate LT1/LT2, and plan & analyse your athletes' training. 2 months free." />
      <meta name="keywords" content="lactate testing software, lactate testing software for coaches, lactate test report, branded lactate report, lactate testing studio software, coaching platform, LT1 LT2 software, athlete management software, endurance coaching software" />
      <meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large" />
      <link rel="canonical" href={CANONICAL} />
      <meta property="og:title" content="Lactate Testing Software for Coaches | LaChart" />
      <meta property="og:description" content="Store tests, generate branded PDF reports with your logo, evaluate LT1/LT2, plan & analyse your athletes' training. 2 months free." />
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
        offers: { '@type': 'Offer', price: '14.99', priceCurrency: 'EUR', description: 'Coach plan — 2-month free trial' },
        url: CANONICAL,
      })}</script>
    </Helmet>

    <style>{`
      .fc a { text-decoration: none; }
      .fc-shell { max-width: 1080px; margin: 0 auto; padding: 0 20px; }
      .fc-nav { position: sticky; top: 0; z-index: 20; background: rgba(255,255,255,.92); backdrop-filter: blur(8px); border-bottom: 1px solid #ecebf3; }
      .fc-nav-in { display: flex; align-items: center; justify-content: space-between; height: 60px; }
      .fc-brand { display: flex; align-items: center; gap: 8px; font-weight: 800; font-size: 19px; color: #191723; letter-spacing: -.02em; }
      .fc-cta { display: inline-flex; align-items: center; gap: 6px; background: linear-gradient(135deg,#6b5cf0,#8b7dff); color:#fff; font-weight: 700; font-size: 14px; padding: 10px 18px; border-radius: 10px; box-shadow: 0 6px 16px -6px rgba(107,92,240,.6); }
      .fc-cta.lg { font-size: 16px; padding: 14px 26px; }
      .fc-ghost { color:#4a4658; font-weight:600; font-size:14px; padding:8px 12px; }
      .fc-eyebrow { font-size: 12.5px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: #4c3ed6; }
      .fc-h1 { font-size: clamp(34px, 6vw, 60px); line-height: 1.03; letter-spacing: -.03em; margin: 14px 0 16px; font-weight: 800; text-wrap: balance; }
      .fc-h1 em { color: #6b5cf0; font-style: normal; }
      .fc-lead { font-size: clamp(16px, 2.4vw, 20px); color: #4a4658; max-width: 62ch; line-height: 1.5; }
      .fc-section { padding: clamp(48px, 8vw, 88px) 0; }
      .fc-h2 { font-size: clamp(24px, 4vw, 36px); letter-spacing: -.02em; font-weight: 800; margin: 0 0 10px; text-wrap: balance; }
      .fc-sub { color: #78748a; font-size: 16px; max-width: 60ch; margin: 0 0 34px; }
      .fc-steps { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px,1fr)); gap: 16px; }
      .fc-step { background: #faf9fc; border: 1px solid #ecebf3; border-radius: 14px; padding: 20px; }
      .fc-step .n { width: 30px; height: 30px; border-radius: 9px; background: #6b5cf0; color:#fff; font-weight: 800; display:flex; align-items:center; justify-content:center; font-size: 14px; }
      .fc-step h3 { margin: 12px 0 6px; font-size: 17px; }
      .fc-step p { margin: 0; font-size: 14px; color: #4a4658; line-height: 1.5; }
      .fc-feats { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px,1fr)); gap: 16px; }
      .fc-feat { border: 1px solid #ecebf3; border-radius: 14px; padding: 22px; background:#fff; }
      .fc-feat h3 { margin: 0 0 7px; font-size: 17px; display:flex; align-items:center; gap:8px; }
      .fc-feat p { margin: 0; color:#4a4658; font-size: 14.5px; line-height: 1.55; }
      .fc-check { color:#6b5cf0; flex-shrink:0; }
      .fc-pdf { display:grid; grid-template-columns: 1.1fr 1fr; gap: 40px; align-items:center; }
      .fc-pdf img { width:100%; border-radius: 14px; box-shadow: 0 30px 60px -30px rgba(25,23,35,.35); border:1px solid #ecebf3; }
      .fc-quote { background: linear-gradient(135deg,#f4f2fe,#fff); border:1px solid #e6e2f8; border-radius: 18px; padding: clamp(28px,5vw,48px); text-align:center; }
      .fc-quote p { font-size: clamp(19px,2.6vw,26px); line-height: 1.4; font-weight: 600; letter-spacing:-.01em; margin: 0 0 16px; text-wrap: balance; }
      .fc-quote .who { color:#78748a; font-size: 14px; font-weight:600; }
      .fc-price { max-width: 460px; margin: 0 auto; border: 2px solid #6b5cf0; border-radius: 18px; padding: 32px; text-align:center; box-shadow: 0 24px 48px -28px rgba(107,92,240,.5); }
      .fc-price .amt { font-size: 46px; font-weight: 800; letter-spacing:-.03em; }
      .fc-price .amt span { font-size: 17px; color:#78748a; font-weight:600; }
      .fc-price ul { list-style:none; padding:0; margin: 20px 0 24px; text-align:left; display:flex; flex-direction:column; gap:10px; }
      .fc-price li { display:flex; gap:10px; font-size:14.5px; color:#332f42; }
      .fc-trial-pill { display:inline-block; background:#eae7fd; color:#4c3ed6; font-weight:700; font-size:13px; padding:5px 12px; border-radius:20px; margin-bottom:14px; }
      .fc-foot { border-top:1px solid #ecebf3; padding: 28px 0; color:#78748a; font-size:13px; display:flex; justify-content:space-between; flex-wrap:wrap; gap:12px; }
      .fc-foot a { color:#4a4658; font-weight:500; }
      @media (max-width: 720px){ .fc-pdf { grid-template-columns: 1fr; gap: 24px; } .fc-hero-actions{ flex-direction:column; align-items:stretch; } }
      @media (prefers-color-scheme: dark){
        .fc, .fc-shell { color:#ece9f6; }
      }
    `}</style>

    <div className="fc">
      {/* Nav */}
      <nav className="fc-nav">
        <div className="fc-shell fc-nav-in">
          <Link to="/" className="fc-brand">
            <img src="/images/LaChart.png" alt="LaChart" style={{ height: 28 }} />
            LaChart
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Link to="/login" className="fc-ghost">Sign in</Link>
            <Link to="/signup?plan=coach" className="fc-cta">Start free trial</Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <header className="fc-shell fc-section" style={{ paddingBottom: 'clamp(28px,5vw,48px)' }}>
        <div className="fc-eyebrow">For coaches &amp; testing studios</div>
        <h1 className="fc-h1">Coach a team. <em>Without spreadsheets.</em></h1>
        <p className="fc-lead">
          You already test lactate. LaChart is the software that stores every test, turns it into a
          <strong> branded PDF report with your logo</strong>, evaluates LT1 &amp; LT2, and lets you plan and
          analyse your athletes&rsquo; training — all in one workspace.
        </p>
        <div className="fc-hero-actions" style={{ display: 'flex', gap: 12, marginTop: 26, flexWrap: 'wrap' }}>
          <Link to="/signup?plan=coach" className="fc-cta lg">🎁 Start your 2-month free trial</Link>
          <a href="#pricing" className="fc-ghost" style={{ alignSelf: 'center', fontSize: 15 }}>See pricing →</a>
        </div>
        <p style={{ color: '#78748a', fontSize: 13.5, marginTop: 14 }}>No charge today · cancel anytime · unlimited athletes</p>
      </header>

      {/* Workflow */}
      <section className="fc-shell fc-section" style={{ paddingTop: 0 }}>
        <div className="fc-eyebrow">The workflow</div>
        <h2 className="fc-h2">From a drop of blood to a training plan</h2>
        <p className="fc-sub">Everything a coach does around a lactate test — in one connected flow, per athlete.</p>
        <div className="fc-steps">
          {STEPS.map((s) => (
            <div className="fc-step" key={s.n}>
              <div className="n">{s.n}</div>
              <h3>{s.t}</h3>
              <p>{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Branded PDF showcase */}
      <section style={{ background: '#faf9fc', borderTop: '1px solid #ecebf3', borderBottom: '1px solid #ecebf3' }}>
        <div className="fc-shell fc-section">
          <div className="fc-pdf">
            <img src="/images/lactate-pdf-report.jpg" alt="Branded lactate test PDF report with a coach's logo, showing the lactate curve, LT1/LT2 thresholds and training zones" loading="lazy" />
            <div>
              <div className="fc-eyebrow">Your brand, not ours</div>
              <h2 className="fc-h2">A report that sells your service</h2>
              <p className="fc-sub" style={{ marginBottom: 20 }}>
                Every test exports as a clean PDF carrying <strong>your logo, studio name and contact details</strong> —
                the professional handout clients expect, with LT1, LT2, OBLA and their full power / heart-rate / pace zones.
              </p>
              <Link to="/signup?plan=coach" className="fc-cta">Brand your first report →</Link>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="fc-shell fc-section">
        <div className="fc-eyebrow">Everything in the Coach workspace</div>
        <h2 className="fc-h2">Built for a roster, not one athlete</h2>
        <p className="fc-sub">The tools that turn testing into a coaching service.</p>
        <div className="fc-feats">
          {FEATURES.map((f) => (
            <div className="fc-feat" key={f.t}>
              <h3>
                <svg className="fc-check" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                {f.t}
              </h3>
              <p>{f.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Testimonial */}
      <section className="fc-shell fc-section" style={{ paddingTop: 0 }}>
        <div className="fc-quote">
          <p>&ldquo;I coach 14 triathletes. The athlete switcher and the &lsquo;ready for lactate&rsquo; filter saved me two hours a week. Status dots are pure gold.&rdquo;</p>
          <div className="who">Markus B. · Triathlon coach · Innsbruck</div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="fc-shell fc-section" style={{ paddingTop: 0 }}>
        <div style={{ textAlign: 'center', marginBottom: 30 }}>
          <div className="fc-eyebrow">Coach plan</div>
          <h2 className="fc-h2">Run your whole roster — 2 months free</h2>
        </div>
        <div className="fc-price">
          <span className="fc-trial-pill">🎁 2-month free trial</span>
          <div className="amt">€14.99<span> / month</span></div>
          <p style={{ color: '#78748a', fontSize: 14, margin: '6px 0 0' }}>No charge today · cancel anytime</p>
          <ul>
            {['Unlimited athletes', 'Branded PDF reports — your logo', 'Test on your athletes’ behalf', 'Coach dashboard & athlete switcher', 'Plan workouts into their calendars', 'Full training analysis per athlete', 'Everything in the Athlete plan'].map((li) => (
              <li key={li}>
                <svg className="fc-check" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                {li}
              </li>
            ))}
          </ul>
          <Link to="/signup?plan=coach" className="fc-cta lg" style={{ width: '100%', justifyContent: 'center' }}>Start your 2-month free trial</Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="fc-shell fc-foot">
        <span>© 2026 LaChart · Lactate testing software for coaches</span>
        <nav style={{ display: 'flex', gap: 18 }}>
          <Link to="/about">About</Link>
          <Link to="/lactate-guide">Lactate Guide</Link>
          <Link to="/lactate-curve-calculator">Free Calculator</Link>
          <Link to="/signup?plan=coach">Start free trial</Link>
        </nav>
      </footer>
    </div>
  </div>
);

export default ForCoaches;
