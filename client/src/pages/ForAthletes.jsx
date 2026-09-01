import React, { useRef } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { LC, STYLE, Eyebrow, BrowserFrame, useReveal } from '../components/About/marketingKit';
import {
  APP_CARDS_STYLE, PhotoShowcase, FormCard, PowerRadarCard, TimeInZonesCard, ThresholdPairCard,
  CalendarCard, WeekTssCard, TrainingHistoryCard, WorkoutGraphCard, LapsTableCard,
  HealthMetricsCard, ProgressCard,
} from '../components/About/appCards';
import SiteNav from '../components/About/SiteNav';
import SiteFooter from '../components/About/SiteFooter';
import { ATHLETE_PLAN_PRICE_LABEL } from '../constants/planPricing';

/**
 * Landing page for the athlete (/for-athletes).
 *
 * The third of the three jobs the app is hired for, and the only one where the
 * training data matters as much as the test. A coach page sells a roster and a
 * tester page sells a report; this one sells the training platform — calendar,
 * workout builder, load and form, peak curves, laps and streams — with the
 * lactate test underneath it setting the zones everything is measured against.
 *
 * The page used to lead with the test alone. An athlete comparing this to
 * TrainingPeaks reads that as an add-on they would run *beside* their real log,
 * so the analysis half is now the spine of the page and the curve is what makes
 * the analysis mean something. PARITY below is deliberately the checklist a
 * reader arrives with; every line of it maps to something the app ships.
 */

const CANONICAL = 'https://lachart.net/for-athletes';

const STEPS = [
  { n: '1', t: 'Connect', d: 'Strava, Garmin or Apple Health — rides, runs and swims arrive on their own with power, pace, heart rate, cadence and laps. Or drop a .FIT file straight in.' },
  { n: '2', t: 'Plan', d: 'Build the week in the calendar, or a whole season in the annual plan. Structured intervals with steps, ramps and repeats, saved as templates and pushed to your watch.' },
  { n: '3', t: 'Train', d: 'The session is on the watch with the zones from your own curve. Tick it off, add RPE, lactate or a comment while it is still fresh.' },
  { n: '4', t: 'Analyse', d: 'Laps, streams, peak curves, time in zones, load and form — and the same session against every previous attempt at it.' },
];

const FEATURES = [
  { t: 'Calendar, planned and completed', d: 'Build the week, drag sessions around, and see what actually came back sitting against what you asked for. Planned versus done, with compliance per week and per block.' },
  { t: 'A real workout builder', d: 'Steps, ramps, repeats and groups, with power, pace or heart-rate targets taken from your zones. Save anything as a template and push the session to your Garmin.' },
  { t: 'Fitness, fatigue and form', d: 'CTL, ATL and TSB charted across the season, so a taper is something you can see arriving rather than something you hope you timed.' },
  { t: 'Every session pulled apart', d: 'Laps, intervals and full streams with drag-to-zoom, time in zones, work and IF — plus the same workout laid over every previous attempt at it.' },
  { t: 'Peak power and pace curves', d: 'Best efforts from five seconds to five hours, this block against the last one and against all time, for the bike and for the run.' },
  { t: 'The season, not just the week', d: 'An annual plan with periodised blocks and race targets, and a countdown that knows what your form is doing between here and the start line.' },
  { t: 'Zones from measurement, not a formula', d: 'LT1 and LT2 come off your own lactate curve. Zones, load and session categories are anchored to those two numbers instead of a fraction of an estimated FTP.' },
  { t: 'Time at your thresholds', d: 'Not five zones whose widths depend on where your thresholds happen to sit, but minutes below LT1, at LT1, between, at LT2 and above. The same sentence means the same thing for everyone.' },
  { t: 'Sleep, HRV and resting HR', d: 'Apple Health metrics on the same timeline as the training, with illness and injury episodes tracked so a bad block has an explanation attached to it.' },
];

/* The checklist an athlete arrives with when they are already logging
   somewhere else. Every line maps to something in the app — the calendar and
   builder in WorkoutPlanner, CTL/ATL/TSB in FormFitnessChart, the peak curves
   in ActivityPeaksTab, the season plan in ATP. */
const PARITY = [
  ['Training calendar', 'Plan and completed on one grid, week, month or season.'],
  ['Structured workout builder', 'Steps, ramps, repeats, groups; power, pace or HR targets.'],
  ['Workout library', 'Save any session as a template and reuse it.'],
  ['Push to your watch', 'Structured sessions land on Garmin before you ride.'],
  ['Planned vs actual', 'Compliance per session, per week, per block.'],
  ['TSS, IF and work', 'Load per session and per week, on power, pace or heart rate.'],
  ['Fitness / fatigue / form', 'CTL, ATL and TSB charted across the season.'],
  ['Annual training plan', 'Periodised blocks, race targets and a countdown.'],
  ['Peak power & pace curves', '5 s to 5 h, this block against all time.'],
  ['Laps & interval analysis', 'Every lap, every stream, drag to zoom and measure.'],
  ['Workout comparison', 'The same session against every previous attempt.'],
  ['Time in zones', 'Per session and per week, from measured thresholds.'],
  ['Strava, Garmin & Apple Health', 'Automatic sync, or upload a .FIT file yourself.'],
  ['Automatic categorisation', 'Sessions sorted into endurance, LT1, LT2 and VO₂max.'],
  ['Health metrics', 'Sleep, HRV, resting HR, illness and injury episodes.'],
  ['Notes and RPE', 'Comments and perceived effort attached to the session.'],
  ['iPhone app & Apple Watch', 'The calendar in your pocket, the zones on your wrist.'],
  ['Race pace predictor', 'What your current curve is worth over a given distance.'],
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
        <title>Training Analysis on Measured Thresholds | LaChart</title>
        <meta name="description" content="Calendar, workout builder, load and form, peak curves and laps — with zones from a real lactate test instead of a percentage of an estimated FTP." />
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
      <style>{APP_CARDS_STYLE}</style>

      <SiteNav ctaHref="/signup?plan=athlete" />

      {/* Hero */}
      <header className="lc-sectpad" style={{ paddingBottom: 32 }}>
        <div className="lc-fa-hero" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.05fr) minmax(0,1fr)', gap: 48, alignItems: 'center' }}>
          <div ref={pushRef} className="lc-reveal">
            <Eyebrow>For athletes</Eyebrow>
            <h1 className="lc-huge" style={{ margin: '18px 0 18px' }}>Plan it, ride it, <em>then take it apart.</em></h1>
            <p className="lc-lead" style={{ maxWidth: 560 }}>
              The whole training platform — calendar, workout builder, load and form, peak curves, laps
              and streams — with one difference underneath it. Your zones come off
              a <strong style={{ color: LC.text }}>real lactate curve</strong>, so every number the
              analysis gives back is measured rather than derived from a percentage of a guess.
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
          <div ref={pushRef} className="lc-reveal right">
            <PhotoShowcase
              src="/marketing/athlete-running.webp" ratio="4 / 3" priority
              alt="A runner settling into a steady effort on an empty track at dawn"
              width="1600" height="1067"
              cards={[<FormCard key="form" />]}
            />
          </div>
        </div>
        <style>{`@media (max-width: 900px){ .lc-fa-hero { grid-template-columns: 1fr !important; gap: 32px !important; } }`}</style>
      </header>

      {/* Workflow */}
      <section className="lc-sectpad" style={{ paddingTop: 24 }}>
        <div ref={pushRef} className="lc-reveal" style={{ marginBottom: 34 }}>
          <Eyebrow>How it works</Eyebrow>
          <h2 className="lc-big" style={{ margin: '14px 0 8px' }}>The loop, end to end</h2>
          <p className="lc-lead">Plan the week, do the work, and get it back as something you can actually read. A lactate test is a snapshot; the point is what the next three months of training do to it.</p>
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

      {/* The app over the training, not beside it. Each card here is live —
          the sport toggles, period filters, calendar days and legend chips all
          work, so a visitor gets to poke at the product before signing up. */}
      <section className="lc-sectpad" style={{ paddingTop: 8, paddingBottom: 8 }}>
        <div ref={pushRef} className="lc-reveal">
          <PhotoShowcase
            src="/marketing/winter-summer-estetic.webp"
            alt="The same road in winter and in summer, one rider between them"
            width="1600" height="1067"
            cards={[<CalendarCard key="calendar" />, <WeekTssCard key="week" />]}
          />
        </div>
        <div ref={pushRef} className="lc-reveal" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20, marginTop: 20 }}>
          <PhotoShowcase
            src="/marketing/athlete-indoor-bike.webp" ratio="4 / 3"
            alt="A turbo session in a garage, late"
            width="1600" height="1067"
            cards={[<TimeInZonesCard key="tiz" />]}
          />
          <PhotoShowcase
            src="/marketing/lactate-test-athlete-outdoor.webp" ratio="4 / 3"
            alt="A lactate reading taken at the roadside, mid-ride"
            width="1600" height="1067"
            cards={[<ThresholdPairCard key="thresholds" />]}
          />
        </div>
      </section>

      {/* Analysis — the half of the product an athlete lives in day to day. */}
      <section className="lc-sectpad" style={{ paddingTop: 24 }}>
        <div ref={pushRef} className="lc-reveal" style={{ marginBottom: 30 }}>
          <Eyebrow>The analysis</Eyebrow>
          <h2 className="lc-big" style={{ margin: '14px 0 8px' }}>What a finished session turns into</h2>
          <p className="lc-lead">
            Every one of these is the real component out of the app. Click them — or read them in detail
            under <Link to="/features/analytics" style={{ color: LC.primaryDark, fontWeight: 700 }}>workout analysis</Link>,{' '}
            <Link to="/features/load-and-form" style={{ color: LC.primaryDark, fontWeight: 700 }}>load &amp; form</Link> and{' '}
            <Link to="/features/planning" style={{ color: LC.primaryDark, fontWeight: 700 }}>planning</Link>.
          </p>
        </div>
        <div ref={pushRef} className="lc-reveal" style={{ display: 'flex', flexWrap: 'wrap', gap: 20, justifyContent: 'center' }}>
          <WorkoutGraphCard />
          <TrainingHistoryCard />
          <PowerRadarCard />
          <LapsTableCard />
          <ProgressCard />
          <HealthMetricsCard />
        </div>
      </section>

      {/* The checklist a reader arrives with when they already log elsewhere. */}
      <section className="lc-sectpad" style={{ paddingTop: 24 }}>
        <div ref={pushRef} className="lc-reveal" style={{ marginBottom: 26 }}>
          <Eyebrow>Coming from TrainingPeaks?</Eyebrow>
          <h2 className="lc-big" style={{ margin: '14px 0 8px' }}>A training platform, not a lactate add-on</h2>
          <p className="lc-lead">
            Everything you keep a training log for is here — and then the part no percentage-based
            platform can give you, because it needs a drop of blood.
          </p>
        </div>
        <div ref={pushRef} className="lc-reveal" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
          {PARITY.map(([t, d]) => (
            <div key={t} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <Check />
              <div>
                <div style={{ fontSize: 14.5, fontWeight: 700, color: LC.ink }}>{t}</div>
                <div style={{ fontSize: 13.5, color: LC.muted, lineHeight: 1.5 }}>{d}</div>
              </div>
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
          <h2 className="lc-big" style={{ margin: '14px 0 8px' }}>Everything the week runs on</h2>
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
