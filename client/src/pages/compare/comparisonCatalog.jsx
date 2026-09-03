/**
 * The comparison catalogue — one entry per head-to-head page.
 *
 * These pages answer a different question from /features and the job pages. A
 * reader on /features is still working out what the software does; a reader who
 * typed "trainingpeaks alternative" has already decided to leave something and
 * only wants to know whether landing here would cost them anything. So every
 * entry carries a `fair` block naming what the other platform does better. That
 * is not modesty — a comparison page with no losses in it reads as an advert
 * and converts like one.
 *
 * Everything in `parity` maps to something the app ships, and is kept in step
 * with the PARITY list on /for-coaches. Nothing is claimed here that is not
 * claimed there.
 *
 * Competitor prices are a snapshot, not a fact of nature — `pricing.checked`
 * dates them and every entry links out so a reader can verify rather than
 * trust us. Re-check them when you touch this file.
 *
 * Entries are data; <ComparisonPage> owns the layout.
 */
import React from 'react';
import {
  ThresholdPairCard, ThresholdTrendCard, FormCard, CalendarCard, LactateTestCard,
} from '../../components/About/appCards';

/* Shared across entries: the capability floor a coach leaving another platform
   is checking for. Kept deliberately boring — these are table stakes, not
   selling points, and the reader is scanning for a missing line. */
const PARITY = [
  ['Unlimited athletes', 'One workspace, switch between them in a tap.'],
  ['Training calendar', 'Planned and completed on one grid, per athlete.'],
  ['Structured workout builder', 'Steps, ramps, repeats and groups with real targets.'],
  ['Workout library', 'Save a session as a template and reuse it across the roster.'],
  ['Push to Garmin', 'The session lands on their watch as a structured workout.'],
  ['Planned vs completed', 'Duration, distance, load and power against what you asked for.'],
  ['TSS, IF and work', 'Load per session and per week, on power, pace or heart rate.'],
  ['Fitness / fatigue / form', 'CTL, ATL and TSB per athlete across the season.'],
  ['Annual training plan', 'Periodised blocks, target load, races and taper.'],
  ['Peak power & pace curves', '5 s to 5 h, this block against all time.'],
  ['Laps & stream analysis', 'Every lap and every channel, drag to zoom and measure.'],
  ['Workout comparison', 'The same session against every previous attempt.'],
  ['Time in zones', 'Per session and per period, from measured thresholds.'],
  ['Strava, Garmin & Apple Health', 'Automatic sync, plus .FIT upload.'],
  ['Automatic categorisation', 'Sessions sorted into endurance, LT1, LT2 and VO₂max.'],
  ['Comments on the session', 'The athlete asks about Tuesday under Tuesday.'],
  ['Health monitoring', 'Sleep, HRV, resting HR, illness and injury episodes.'],
  ['Branded PDF reports', 'Your logo on the test report the athlete keeps.'],
];

/* The migration path, told honestly. There is no importer that reads another
   platform's account — history arrives through Strava or Garmin Connect, which
   is where nearly all of it was recorded in the first place. Saying so on the
   page costs one line and buys the reader's trust for everything under it. */
const MIGRATION = [
  { n: '1', t: 'Connect Strava or Garmin', d: 'One OAuth click each. Your history backfills on its own — rides, runs and swims with power, heart rate, pace, cadence, laps and per-second streams, not just summaries.' },
  { n: '2', t: 'Set zones from a real test', d: 'Enter an existing lactate test or run a new one. LT1 and LT2 come out by six methods with the measured points on top, and every zone downstream is anchored to them.' },
  { n: '3', t: 'Build the week', d: 'Structured sessions with targets in watts, pace, heart rate or the athlete’s own zones, dropped onto their calendar.' },
  { n: '4', t: 'It reaches the watch', d: 'The session is written into their Garmin Connect calendar with every step and target intact. You can still export TCX or FIT if something downstream needs it.' },
];

export const COMPARISONS = [
  /* ─────────────────────────────────────────────────────────────────────── */
  {
    slug: 'trainingpeaks-alternative',
    competitor: 'TrainingPeaks',
    competitorUrl: 'https://www.trainingpeaks.com/',
    eyebrow: 'TrainingPeaks alternative',
    title: 'Leaving TrainingPeaks? Here is what you would land on.',
    lead: 'Everything a coaching platform is expected to do — calendar, structured builder, load and form, peaks, laps, an annual plan — with lactate testing as the thing the zones are actually built from, at €14.99 a month for unlimited athletes.',
    meta: {
      title: 'TrainingPeaks Alternative for Coaches & Athletes | LaChart',
      description: 'An independent TrainingPeaks alternative: training calendar, structured workouts pushed to Garmin, CTL/ATL/TSB, peak curves and lap analysis — with lactate testing at the core. €14.99/month, unlimited athletes.',
      keywords: 'trainingpeaks alternative, alternative to trainingpeaks, trainingpeaks replacement, coaching software, endurance coaching platform, independent training platform, lactate testing software',
    },
    context: {
      heading: 'Why people are asking this in 2026',
      body: [
        'Garmin acquired TrainingPeaks and TrainHeroic in July 2026. An acquisition is not a verdict — TrainingPeaks is a mature product with a deep bench and it is not going anywhere this year. But it is a fair moment to ask who owns the platform your coaching business runs on, and where its roadmap points once a hardware company owns it.',
        'Coaches have seen the other ending too. Specialized bought Today’s Plan in 2019 and shut it down in March 2024. Wahoo closed RGT in October 2023. If you are re-reading that list and thinking about where your athletes’ history lives, that instinct is worth acting on while it is cheap to act on.',
        'LaChart is independent and funded by the people who use it. That is a smaller claim than it sounds — it means no investor timeline is deciding what happens to your data. It also means we are a great deal smaller than TrainingPeaks, which is the honest half of the same sentence.',
      ],
      visual: <FormCard />,
    },
    edge: [
      { t: 'Lactate is the product, not a module', d: 'LT1 and LT2 by six methods — log-log, IAT, OBLA 2.0–3.5, LTP1/LTP2, Dmax and baseline — with the measured points drawn on the curve. Run as many tests as you like; nothing here is metered or sold by the test.' },
      { t: 'Zones from a measurement, not a percentage', d: 'Every zone, every TSS figure and every time-in-zone chart downstream is anchored to two thresholds you actually measured, rather than a fraction of an estimate of a fraction.' },
      { t: 'Tag any interval with a blood sample', d: 'Not only formal step tests. Drop a lactate reading onto any lap of any workout and it is read against that athlete’s own curve.' },
      { t: 'One price, unlimited athletes', d: '€14.99 a month for a coach, €6.99 for an athlete on their own. It does not step up as your roster grows.' },
      { t: 'Smart trainer control built in', d: 'Pair over Bluetooth and execute a structured session with automatic resistance (FTMS) — no third subscription in the middle.' },
      { t: 'The calculators are free and need no account', d: 'Lactate curve, training zones, FTP, TSS, VO₂max, race prediction. Send an athlete a link without asking them to sign up for anything.' },
    ],
    fair: [
      { t: 'The ecosystem is not close', d: 'TrainingPeaks has spent two decades accumulating third-party integrations, and a lot of tooling in this sport speaks its format first. If your workflow depends on something niche plugging straight in, check it before you move.' },
      { t: 'There is no training plan marketplace', d: 'TrainingPeaks sells a large catalogue of pre-built plans and gives coaches a storefront to sell their own. LaChart has no equivalent.' },
      { t: 'No WKO-class modelling companion', d: 'WKO5 does power-duration modelling well beyond what LaChart attempts. If that is the centre of your practice, it is a real gap.' },
      { t: 'We are young and small', d: 'Fewer coaches, a shorter track record and a smaller team. That cuts both ways — you can email the person who wrote the feature — but it is the trade you are making.' },
    ],
    pricing: {
      checked: 'September 2026',
      note: 'TrainingPeaks prices change and vary by plan and billing period — check their site rather than taking ours for it.',
      rows: [
        ['LaChart — coach', '€14.99 / month', 'Unlimited athletes. Lactate testing included and unmetered. Two weeks free.'],
        ['LaChart — athlete', '€6.99 / month', 'For an athlete training themselves, without a coach.'],
      ],
    },
    migrationNote: 'There is no one-click importer that reads a TrainingPeaks account. Your history comes across through Strava or Garmin Connect — which is where nearly all of it was recorded to begin with — and it arrives with the full streams rather than daily summaries.',
    faq: [
      { q: 'Can I import my TrainingPeaks history into LaChart?', a: 'Not directly from a TrainingPeaks account. You connect Strava or Garmin Connect and LaChart backfills your history from there, including power, heart rate, pace, cadence, laps and per-second streams. For nearly every athlete that is the same history, because that is where the device uploaded it first.' },
      { q: 'Does LaChart calculate CTL, ATL and TSB the same way?', a: 'It uses the same exponentially-weighted model the sport standardised on, so fitness, fatigue and form read the way you expect. Load can be computed from power, pace or heart rate depending on the sport and what the session recorded.' },
      { q: 'Can I send structured workouts to a Garmin watch?', a: 'Yes. A session you build is written into the athlete’s Garmin Connect calendar as a structured workout — the steps become laps on the device, with targets intact. TCX and FIT export are also available for anything else downstream.' },
      { q: 'Is lactate testing an extra cost?', a: 'No. Lactate testing is included in the plan and is not metered — there is no per-test charge and no test credits to buy.' },
      { q: 'What does LaChart cost?', a: '€14.99 a month for a coach with unlimited athletes, or €6.99 a month for an athlete training alone. There is a two-week free trial, and the calculators are free without an account.' },
    ],
    visual: <ThresholdPairCard />,
  },

  /* ─────────────────────────────────────────────────────────────────────── */
  {
    slug: 'coachbox-alternative',
    competitor: 'Coachbox',
    competitorUrl: 'https://coachbox.app/',
    eyebrow: 'Coachbox alternative',
    title: 'A Coachbox alternative that does not charge by the test.',
    lead: 'The same job — endurance coaching, lactate testing, a roster on one calendar — without per-test credits and without the price stepping up every time your roster grows.',
    meta: {
      title: 'Coachbox Alternative for Endurance Coaches | LaChart',
      description: 'A Coachbox alternative with unmetered lactate testing and one flat price for unlimited athletes. Calendar, structured workouts to Garmin, CTL/ATL/TSB, lap analysis and LT1/LT2 by six methods.',
      keywords: 'coachbox alternative, alternative to coachbox, lactate testing software, endurance coaching platform, coaching software for triathlon coaches, lactate module',
    },
    context: {
      heading: 'The difference that shows up on the invoice',
      body: [
        'Coachbox and LaChart aim at nearly the same coach, and Coachbox is a good product built by people who know the sport — Belgian, founded in 2014, with its training-load score developed alongside Ghent University. If you are choosing between the two on features alone you will find far more agreement than disagreement.',
        'Where they part company is how testing is sold. Coachbox includes its Lactate Module in every plan, then meters the tests: 5 to 20 free at the start of a licence depending on tier, and €3 to €6 for each one after that. Its standalone lactate plan runs €49 a month, with test packages priced up to €750 for 250 tests.',
        'LaChart does not meter tests. Run five a year or five hundred; the price is the same. For a studio or a coach who tests seriously, that is the whole comparison — a practice running a couple of hundred tests a year is choosing between four figures of test credits and a €180 annual subscription.',
        'The second difference is roster size. Coachbox prices in tiers by athlete count, from €19 a month at five athletes to €149 at a hundred, with per-athlete charges above each tier. LaChart is one price for unlimited athletes.',
      ],
      visual: <LactateTestCard />,
    },
    edge: [
      { t: 'Unmetered lactate testing', d: 'No test credits, no per-test charge, no package to top up. The number of tests you run is not a billing event.' },
      { t: 'One price regardless of roster', d: '€14.99 a month for a coach, whether that is three athletes or ninety. No tier to outgrow and no per-athlete surcharge.' },
      { t: 'Six threshold methods on one curve', d: 'Log-log, IAT, OBLA 2.0–3.5, LTP1/LTP2, Dmax and baseline, with the measured points drawn on top so you can see which method the data actually supports.' },
      { t: 'Lactate on any interval', d: 'Tag any lap of any session with a blood sample, not just a formal step test, and have it read against that athlete’s own curve.' },
      { t: 'Free calculators without an account', d: 'A lactate curve, zones, FTP, TSS and race prediction, all reachable without signing up for anything.' },
    ],
    fair: [
      { t: 'Coachbox has been at this longer', d: 'Founded in 2014, with a team behind it and a base of coaches across more than fifteen countries. LaChart is younger and smaller.' },
      { t: 'A named academic partnership', d: 'The Coachbox Stress Score was developed with the Department of Movement and Sport Sciences at Ghent University, and the platform has been used clinically at UZ Leuven. LaChart has no equivalent credential to point at.' },
      { t: 'It is funded to grow', d: 'Coachbox took €500,000 from Leadout, the fund of Teamleader founder Jeroen De Wit, in February 2026. That buys a pace of development a self-funded project cannot match.' },
      { t: 'Broader sport coverage in the marketing', d: 'Coachbox pitches team and club coaching alongside endurance, including HYROX and rowing. LaChart is squarely an endurance product.' },
    ],
    pricing: {
      checked: 'September 2026',
      note: 'Coachbox prices are taken from their public pricing page and are billed annually; they can change at any time, so check the source before deciding.',
      rows: [
        ['LaChart — coach', '€14.99 / month', 'Unlimited athletes. Lactate testing unmetered.'],
        ['Coachbox Base', '€19 / month', '5 athletes, +€2.50 each. 5 free tests, then €6 per test.'],
        ['Coachbox Build', '€49 / month', '25 athletes, +€2.00 each. 10 free tests, then €5 per test.'],
        ['Coachbox Peak', '€79 / month', '50 athletes, +€1.75 each. 15 free tests, then €4 per test.'],
        ['Coachbox Prime', '€149 / month', '100 athletes, +€1.50 each. 20 free tests, then €3 per test.'],
      ],
    },
    migrationNote: 'There is no direct importer between the two platforms. Your athletes’ training history arrives through Strava, Garmin Connect or .FIT upload, with the full streams rather than summaries.',
    faq: [
      { q: 'Does LaChart charge per lactate test?', a: 'No. Lactate testing is included in the subscription and is not metered — there are no test credits and no per-test fee, however many you run.' },
      { q: 'Does the price go up as I take on more athletes?', a: 'No. A coach subscription is €14.99 a month for unlimited athletes. There are no tiers to outgrow and no per-athlete surcharge.' },
      { q: 'Which threshold methods does LaChart support?', a: 'LT1 and LT2 via log-log, IAT, OBLA 2.0 to 3.5, LTP1 and LTP2, Dmax and baseline, with your measured points drawn on the curve so you can judge which method the data supports.' },
      { q: 'Can I move my athletes’ history across?', a: 'Through Strava, Garmin Connect or .FIT upload rather than a direct transfer. History backfills automatically once an athlete connects an account, with power, heart rate, pace, cadence, laps and per-second streams.' },
    ],
    visual: <ThresholdTrendCard />,
  },

  /* ─────────────────────────────────────────────────────────────────────── */
  {
    slug: 'lachart-vs-trainingpeaks',
    competitor: 'TrainingPeaks',
    competitorUrl: 'https://www.trainingpeaks.com/',
    eyebrow: 'Head to head',
    title: 'LaChart vs TrainingPeaks, line by line.',
    lead: 'The same comparison as the alternatives page, laid out as a table you can scan — including the rows where TrainingPeaks wins.',
    meta: {
      title: 'LaChart vs TrainingPeaks — Feature & Price Comparison | LaChart',
      description: 'A line-by-line comparison of LaChart and TrainingPeaks: calendar, structured workouts, load and form, peak curves, lactate testing, pricing — and where TrainingPeaks is the better choice.',
      keywords: 'lachart vs trainingpeaks, trainingpeaks comparison, training platform comparison, coaching software comparison, lactate testing vs trainingpeaks',
    },
    context: {
      heading: 'How to read this',
      body: [
        'Comparison pages written by one of the two parties are worth what you pay for them, so here is the bias stated up front: we built LaChart, and we chose what goes in the table. What we have tried to avoid is the usual trick of picking only rows we win.',
        'The short version: on the coaching fundamentals the two overlap almost entirely, and a coach would not feel a capability missing in day-to-day work. LaChart is meaningfully better if lactate testing is central to how you set zones, and meaningfully cheaper. TrainingPeaks is better if you depend on its ecosystem, its plan marketplace or WKO-class modelling.',
      ],
      visual: <CalendarCard />,
    },
    edge: [
      { t: 'Lactate testing, unmetered', d: 'Six threshold methods on one curve with the measured points shown, as many tests as you want to run, and a blood sample taggable onto any lap of any workout.' },
      { t: 'Price', d: '€14.99 a month for a coach with unlimited athletes; €6.99 for a solo athlete. Two weeks free and no card for the calculators.' },
      { t: 'Independence', d: 'Self-funded and not owned by a hardware company, which since July 2026 is no longer true of TrainingPeaks.' },
      { t: 'Smart trainer control included', d: 'Bluetooth FTMS resistance control for structured sessions, without a third subscription.' },
    ],
    fair: [
      { t: 'Integration ecosystem', d: 'Two decades of third-party support. If a niche tool in your workflow speaks one platform natively, it is probably that one.' },
      { t: 'Training plan marketplace', d: 'A large catalogue of purchasable plans, and a storefront for coaches selling their own. LaChart has none of this.' },
      { t: 'Advanced modelling', d: 'WKO5 goes considerably further into power-duration modelling than LaChart does.' },
      { t: 'Scale and track record', d: 'More coaches, more years, a bigger team, and a body of institutional knowledge a small project cannot substitute for.' },
    ],
    pricing: {
      checked: 'September 2026',
      note: 'We list only our own prices as fact. TrainingPeaks pricing varies by plan, region and billing period — read it from the source.',
      rows: [
        ['LaChart — coach', '€14.99 / month', 'Unlimited athletes, unmetered lactate testing, two weeks free.'],
        ['LaChart — athlete', '€6.99 / month', 'Solo athlete, no coach.'],
        ['LaChart — calculators', 'Free', 'Lactate curve, zones, FTP, TSS, VO₂max, race prediction. No account.'],
      ],
    },
    migrationNote: 'History moves via Strava, Garmin Connect or .FIT upload. There is no importer that reads a TrainingPeaks account directly.',
    faq: [
      { q: 'Is LaChart a full replacement for TrainingPeaks?', a: 'For the coaching fundamentals — calendar, structured workouts, load and form, peak curves, lap and stream analysis, an annual plan — yes. For a training plan marketplace or WKO-class power-duration modelling, no.' },
      { q: 'What is the biggest practical difference?', a: 'How zones get set. LaChart is built so that LT1 and LT2 come out of a measured lactate test and everything downstream is anchored to them, rather than derived from a percentage of an estimate.' },
      { q: 'How do the prices compare?', a: 'LaChart is €14.99 a month for a coach with unlimited athletes and €6.99 for a solo athlete. TrainingPeaks pricing varies by plan and billing period and is best read from their own site.' },
    ],
    visual: <FormCard />,
  },
];

export const comparisonBySlug = (slug) => COMPARISONS.find((c) => c.slug === slug);

export { PARITY, MIGRATION };
