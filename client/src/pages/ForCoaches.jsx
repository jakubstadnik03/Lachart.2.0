import React, { useRef } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { LC, STYLE, Eyebrow, BrowserFrame, useReveal } from '../components/About/marketingKit';
import SiteNav from '../components/About/SiteNav';
import SiteFooter from '../components/About/SiteFooter';

/**
 * Landing page for coaching a roster (/for-coaches).
 *
 * This page used to sell two jobs at once — testing clients and coaching
 * athletes — and the two readers want opposite things. Testing now has
 * /for-testers, so this one is free to be what a coach with athletes on the
 * books actually needs: their training arriving on its own, analysed, and the
 * week going back out to their watch.
 *
 * Lactate is still here, because it is what makes the zones worth anything —
 * but as the anchor under the coaching, not as the product. A visitor who only
 * tests is pointed at the other page rather than sold a calendar.
 *
 * Uses the shared marketing design kit so all three job pages render as one
 * system.
 */

const CANONICAL = 'https://lachart.net/for-coaches';

const STEPS = [
  { n: '1', t: 'Add them', d: 'Invite an athlete or create them yourself. They connect Strava, Garmin or Apple Health once and every ride, run and swim lands in your workspace from then on.' },
  { n: '2', t: 'Set the zones', d: 'From a lactate test rather than a percentage of an estimate — yours, or one a studio ran. Every number downstream is anchored to those two thresholds.' },
  { n: '3', t: 'Build the week', d: 'Structured sessions with targets in watts, pace, heart rate or their own zones, dropped straight onto the athlete’s calendar.' },
  { n: '4', t: 'It reaches the watch', d: 'The session is written into their Garmin Connect calendar as a structured workout — the steps become laps, with targets, on the device.' },
  { n: '5', t: 'Read what happened', d: 'Planned against completed, load and form, laps and intervals, and the same session compared with every previous attempt at it.' },
];

const FEATURES = [
  { t: 'One workspace, every athlete', d: 'Switch between athletes in a tap. Status dots show at a glance who is training, who has gone quiet and who is due to be retested.' },
  { t: 'Their data arrives on its own', d: 'Strava, Garmin and Apple Health sync in the background — power, pace, heart rate, cadence, laps and per-second streams. Nothing to upload, nothing to chase.' },
  { t: 'Load, form and fitness', d: 'TSS per session, CTL, ATL and TSB per athlete, with a plain-English read on whether they are fresh, productive or digging a hole.' },
  { t: 'The same session, every time they did it', d: 'Repeat workouts are recognised and grouped, so 5×8min in August sits beside the same session in March — power, heart rate and what moved between them.' },
  { t: 'Structured workouts onto their watch', d: 'Build the session once and it appears in their Garmin Connect calendar with every step and target intact. They press start; you see it come back.' },
  { t: 'Planned versus completed', d: 'Duration, distance, load and average power side by side with what you asked for — per session and across the week.' },
  { t: 'Zones out of a real test', d: 'LT1 and LT2 by six methods with the measured points on top, and power, pace and heart-rate zones generated from them.' },
  { t: 'The season, not just the week', d: 'An annual structure with blocks and target load, races with a countdown and taper, and a weekly review you write once and keep.' },
  { t: 'Talk about the session itself', d: 'Comments live on the training, not in a separate thread — the athlete asks about Tuesday under Tuesday.' },
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
        <title>Coaching Software for Endurance Coaches — Athlete Training, Load &amp; Structured Workouts | LaChart</title>
        <meta name="description" content="Coaching software for endurance coaches: your athletes connect Strava or Garmin, you read their load, form and every session, build structured workouts that reach their watch, and set their zones from a real lactate test. 2 weeks free." />
        <meta name="keywords" content="endurance coaching software, athlete management software, training plan software, structured workouts Garmin, TSS CTL ATL TSB, coaching platform, training load analysis, coach training calendar, lactate threshold zones" />
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
              Your athletes connect Strava or Garmin once and their training arrives on its own. You read
              it — load, form, laps, the same session against every previous attempt — build next week,
              and <strong style={{ color: LC.text }}>it lands on their watch</strong>. All of it anchored
              to zones from a real lactate test instead of a percentage of a guess.
            </p>
            <div style={{ display: 'flex', gap: 12, marginTop: 28, flexWrap: 'wrap', alignItems: 'center' }}>
              <Link to="/signup?plan=coach" className="lc-btn-primary">🎁 Start your 2-week free trial</Link>
              <a href="#pricing" className="lc-btn-ghost">See pricing</a>
            </div>
            <p style={{ color: LC.muted, fontSize: 13.5, marginTop: 14 }}>No charge today · cancel anytime · unlimited athletes</p>
          </div>
          <div ref={pushRef} className="lc-reveal right lc-float">
            <img src="/marketing/coach-sceen.webp"
              alt="A coach at a standing desk reviewing an athlete's lactate test on two screens"
              loading="eager" width="1600" height="1067"
              style={{ display: 'block', width: '100%', borderRadius: 18, boxShadow: '0 24px 60px rgba(15,23,41,.18)' }} />
          </div>
        </div>
        <style>{`@media (max-width: 900px){ .lc-fc-hero { grid-template-columns: 1fr !important; gap: 32px !important; } }`}</style>
      </header>

      {/* Testing-only readers belong on the other page — sending them into a
          calendar pitch is how a lab coach concludes this is not for them. */}
      <section className="lc-sectpad" style={{ paddingTop: 8, paddingBottom: 8 }}>
        <div ref={pushRef} className="lc-reveal lc-card" style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
          <p style={{ margin: 0, color: LC.muted, fontSize: 14.5, lineHeight: 1.55, maxWidth: 620 }}>
            <strong style={{ color: LC.ink }}>Only test people?</strong> If you run step tests for clients
            and hand back a report — no calendars, no athletes to follow — that is its own product.
          </p>
          <Link to="/for-testers" className="lc-btn-ghost">See LaChart for testers →</Link>
        </div>
      </section>

      {/* Workflow */}
      <section className="lc-sectpad" style={{ paddingTop: 24 }}>
        <div ref={pushRef} className="lc-reveal" style={{ marginBottom: 34 }}>
          <Eyebrow>The workflow</Eyebrow>
          <h2 className="lc-big" style={{ margin: '14px 0 8px' }}>From their watch to yours and back</h2>
          <p className="lc-lead">The loop a coach actually runs, per athlete, without a spreadsheet in the middle of it.</p>
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

      <section className="lc-sectpad" style={{ paddingTop: 8, paddingBottom: 8 }}>
        <div ref={pushRef} className="lc-reveal" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
          {[
            ['/marketing/coach-athlete-phone.webp', 'A coach and an athlete going through a session together after training'],
            ['/marketing/coach-graph.webp', 'A coach reading an athlete\u2019s week at a desk'],
          ].map(([src, alt]) => (
            <img key={src} src={src} alt={alt} loading="lazy" width="1600" height="1067"
              style={{ display: 'block', width: '100%', borderRadius: 14, aspectRatio: '3 / 2', objectFit: 'cover' }} />
          ))}
        </div>
      </section>

      {/* Product gallery */}
      <section className="lc-sectpad" style={{ paddingTop: 24 }}>
        <div ref={pushRef} className="lc-reveal" style={{ marginBottom: 30 }}>
          <Eyebrow>Inside the workspace</Eyebrow>
          <h2 className="lc-big" style={{ margin: '14px 0 8px' }}>See what your athletes get</h2>
          <p className="lc-lead">A calendar they can follow, zones that came from their own physiology, and sessions that explain themselves.</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
          {[
            { img: '/about-design/training-calendar.png', label: 'Training calendar', cap: 'Build the week, push it to their Garmin, and see what came back against it.' },
            { img: '/about-design/training-log-page.png', label: 'Session analysis', cap: 'Laps, intervals, streams and load — and the same session every time they have done it.' },
            { img: '/about-design/zones-generator.png', label: 'Training zones', cap: 'Power, heart-rate and pace zones straight from their lactate test.' },
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
