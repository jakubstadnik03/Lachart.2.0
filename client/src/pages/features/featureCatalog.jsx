/**
 * The feature catalogue — one entry per /features/<slug> page.
 *
 * The three job pages (/for-testers, /for-coaches, /for-athletes) answer "is
 * this product for me". They cannot also answer "what exactly does the
 * calendar do" without turning into a manual, and a reader comparing platforms
 * wants precisely that second answer. So each capability gets its own page,
 * laid out the way a feature page reads: a claim, then a run of blocks that
 * each pair one visual with one specific thing the software does.
 *
 * Entries are data, not markup, so <FeaturePage> owns the layout and every
 * page stays identical. `visual` is a live component out of appCards — a
 * reader can click the thing being described rather than look at a picture of
 * it. Where a block reads better over a photograph, `photo` + `card` carry one.
 *
 * Everything claimed here maps to something in the app: the calendar and
 * builder in components/WorkoutPlanner, load and form in
 * DashboardPage/FormFitnessChart, peak curves in training/ActivityPeaksTab,
 * laps and streams in components/FitAnalysis, the season plan in ATP,
 * lactate in components/LactateTesting.
 */
import React from 'react';
import {
  LactateTestCard, ZonesCard, ThresholdPairCard, ThresholdTrendCard, FormCard,
  WeekTssCard, CalendarCard, SessionListCard, PowerRadarCard, TimeInZonesCard,
  TrainingHistoryCard, IntervalTrainingsCard, WorkoutGraphCard, LapsTableCard,
  HealthMetricsCard, ProgressCard,
} from '../../components/About/appCards';

export const FEATURES = [
  {
    slug: 'analytics',
    audience: ['/for-athletes', 'LaChart for athletes'],
    nav: 'Workout analysis',
    eyebrow: 'Analytics',
    title: 'See what the numbers actually mean.',
    lead: 'Every session arrives with its streams, its laps and its load already worked out — and sitting next to every previous time you did the same thing.',
    meta: {
      title: 'Training & Workout Analysis — Laps, Streams, Peaks | LaChart',
      description: 'Power, heart rate, speed and cadence streams, lap tables, time in zones, peak curves, and the same session against every previous attempt.',
      keywords: 'workout analysis, training analysis software, lap analysis, power analysis, peak power curve, time in zones, interval analysis',
    },
    blocks: [
      {
        t: 'Every channel the device recorded',
        d: 'Power, heart rate, speed and cadence on one chart, each series a chip you can drop to get it out of the way. Drag across the graph to zoom into an interval and read the averages for just that stretch.',
        visual: <WorkoutGraphCard />,
      },
      {
        t: 'Laps, as recorded and as you want them',
        d: 'The device’s own laps come in automatically, with duration, distance, power, heart rate and cadence per lap. Add a lactate reading to any lap and it is compared against your own curve rather than a generic table.',
        visual: <LapsTableCard />,
      },
      {
        t: 'The same session, every time you have done it',
        d: 'Repeat workouts are recognised and grouped, so 4×15min in August sits beside the same session in March. Switch the metric between power, heart rate, lactate and RPE, and the chart between bars, line and trace.',
        visual: <TrainingHistoryCard />,
      },
      {
        t: 'Peak efforts across every duration',
        d: 'Best power from five seconds to five hours, or best pace from 200 m to a half marathon, with the last 30 or 90 days laid over your all-time shape. What improved is the part of the web that grew.',
        visual: <PowerRadarCard />,
      },
      {
        t: 'Time where it counts',
        d: 'Not five zones whose widths depend on where your thresholds happen to sit, but minutes below LT1, at LT1, between the two, at LT2 and above it. The same sentence means the same thing for every athlete.',
        visual: <TimeInZonesCard />,
      },
      {
        t: 'The whole library, sorted',
        d: 'Sessions are categorised automatically into endurance, LT1, LT2 and VO₂max work from what the power and heart rate actually did, so finding every threshold session you have ever ridden is one filter.',
        visual: <IntervalTrainingsCard />,
      },
    ],
  },
  {
    slug: 'planning',
    audience: ['/for-coaches', 'LaChart for coaches'],
    nav: 'Planning & workouts',
    eyebrow: 'Planning',
    title: 'Build the week. It lands on the watch.',
    lead: 'A calendar with the plan and the outcome on the same grid, a real structured-workout builder behind it, and Garmin at the end of the line.',
    meta: {
      title: 'Training Plan & Structured Workout Builder | LaChart',
      description: 'Plan the week in a calendar, build structured intervals with steps, ramps and repeats, and push them to a Garmin watch. Planned versus completed on one grid.',
      keywords: 'training calendar, structured workout builder, push workout to Garmin, training plan software, planned vs actual, workout templates',
    },
    blocks: [
      {
        t: 'Plan and outcome on one grid',
        d: 'The month shows what you asked for and what came back, colour-coded by sport. Drag a session to another day and everything downstream — the week’s load, the block’s target — follows it.',
        visual: <CalendarCard />,
      },
      {
        t: 'The day, once it has happened',
        d: 'Each session lands with its duration, distance, average power or pace and its load, ready to open. Nothing to upload: Strava, Garmin and Apple Health push them in on their own.',
        visual: <SessionListCard />,
      },
      {
        t: 'Structured workouts, properly built',
        d: 'Steps, ramps, repeats and nested groups, with targets in watts, pace, heart rate or the athlete’s own zones. Save any session to the template library and drop it onto anyone’s calendar.',
        photo: ['/marketing/coach-sceen.webp', 'A coach building next week’s sessions at a standing desk'],
        card: <ProgressCard />,
      },
      {
        t: 'Planned versus completed',
        d: 'Duration, distance, load and average power against what was asked for, per session and across the week, so compliance is a number rather than an impression.',
        visual: <ProgressCard />,
      },
      {
        t: 'The week’s load, at a glance',
        d: 'Daily load across the week with the session behind each bar one click away — enough to see a spike coming before it becomes three flat days.',
        visual: <WeekTssCard />,
      },
    ],
  },
  {
    slug: 'lactate-testing',
    audience: ['/for-testers', 'LaChart for testing studios'],
    nav: 'Lactate testing',
    eyebrow: 'Lactate testing',
    title: 'The curve, and the number you can defend.',
    lead: 'Type the stages as you run them. LT1 and LT2 come back by six methods at once, with the measured points on top and the lactate and heart rate at each.',
    meta: {
      title: 'Lactate Test Analysis — LT1, LT2 by Six Methods | LaChart',
      description: 'Enter a step test and get LT1 and LT2 by log-log, IAT, OBLA, D-max and LTP at once, with zones, test-to-test comparison and a branded PDF report.',
      keywords: 'lactate test software, LT1 LT2, log-log method, OBLA, D-max, IAT, lactate curve, lactate threshold analysis',
    },
    blocks: [
      {
        t: 'Six methods, side by side',
        d: 'Log-log, IAT, OBLA 2.0–4.0, baseline offsets, D-max and LTP computed on the same data, with the measured points drawn on top. A consensus you can argue from, not one formula’s guess.',
        visual: <LactateTestCard />,
      },
      {
        t: 'Bike, run and swim',
        d: 'Watts, minutes per kilometre or minutes per hundred metres; step or distance stages; metric or imperial. Switch sport and the thresholds, units and zones all follow.',
        visual: <ThresholdPairCard />,
      },
      {
        t: 'Test against test',
        d: 'Curves overlaid across visits with the shift in LT1 and LT2 called out — the thing a returning client is actually paying to see, and the thing that tells an athlete the block worked.',
        visual: <ThresholdTrendCard />,
      },
      {
        t: 'In the lab or at the roadside',
        d: 'A full step test in a studio, or a single sample taken mid-session and compared against your own curve. The same lactate at a higher intensity is the curve moving right.',
        photo: ['/marketing/lactate-test-athlete-outdoor.webp', 'A lactate reading taken at the roadside, mid-ride'],
        card: <LactateTestCard />,
      },
      {
        t: 'A report with your name on it',
        d: 'Every threshold method with the power, heart rate and lactate at each, exported as a PDF carrying your logo, your studio name and your contact details. It is your document; LaChart draws the curve.',
        photo: ['/marketing/pdf-report.webp', 'The finished report handed across the desk to the athlete'],
        card: <ThresholdTrendCard />,
      },
    ],
  },
  {
    slug: 'training-zones',
    audience: ['/for-athletes', 'LaChart for athletes'],
    nav: 'Zones & thresholds',
    eyebrow: 'Zones',
    title: 'Zones out of blood, not a percentage.',
    lead: 'Most platforms take a number you estimated and cut it into fifths. Here the two thresholds are measured, and everything downstream is anchored to them.',
    meta: {
      title: 'Training Zones from a Lactate Test | LaChart',
      description: 'Power, pace and heart-rate zones generated from your measured LT1 and LT2 rather than a percentage of an estimated FTP, not from a formula.',
      keywords: 'training zones, lactate threshold zones, power zones, heart rate zones, pace zones, zone 2 training, LT1 LT2 zones',
    },
    blocks: [
      {
        t: 'Power, pace and heart rate together',
        d: 'Five zones generated from the thresholds you just measured, each with its power or pace band and the heart rate that went with it on test day. Ready to paste into whatever the athlete trains with.',
        visual: <ZonesCard />,
      },
      {
        t: 'The two numbers everything hangs off',
        d: 'LT1 is where lactate first lifts off baseline; LT2 is the highest intensity you can hold at a steady lactate. Load, categories, time in zone and the retest nudge are all computed from those two.',
        visual: <ThresholdPairCard />,
      },
      {
        t: 'Reported back the same way',
        d: 'Time in zone is minutes below LT1, at LT1, between, at LT2 and above — the same definition for every athlete, so a coach comparing two people is comparing the same thing.',
        visual: <TimeInZonesCard />,
      },
      {
        t: 'A nudge when they have moved',
        d: 'When weeks of sessions agree that a threshold has shifted, the app says so, says how confident it is, and says why. Zones stop describing you long before you notice on your own.',
        visual: <ThresholdTrendCard />,
      },
    ],
  },
  {
    slug: 'load-and-form',
    audience: ['/for-athletes', 'LaChart for athletes'],
    nav: 'Load & form',
    eyebrow: 'Load & form',
    title: 'Fitness, fatigue, and whether today is the day.',
    lead: 'Load per session, chronic and acute load across the season, and the balance between them — so a taper is something you can see arriving rather than something you hope you timed.',
    meta: {
      title: 'Training Load, Fitness & Form — CTL, ATL and TSB | LaChart',
      description: 'Load per session and per week, with CTL, ATL and TSB charted across the season, and a plain-English read on whether you are fresh or digging a hole.',
      keywords: 'training load, TSS, CTL ATL TSB, fitness fatigue form, performance management chart, training stress balance, peak power curve',
    },
    blocks: [
      {
        t: 'Form, in one number',
        d: 'Chronic load is fitness, acute load is fatigue, and the gap between them is form. Fresh, building or overreaching — with the thresholds for each spelled out rather than left to folklore.',
        visual: <FormCard />,
      },
      {
        t: 'The week you actually did',
        d: 'Daily load with the session behind each bar, and the week’s totals for time, distance, load and session count. Enough to spot the spike that becomes next week’s three flat days.',
        visual: <WeekTssCard />,
      },
      {
        t: 'Where the shape changed',
        d: 'Best efforts across durations, this block against the last one and against all time. Improvement is the part of the web that grew; a block that only produced fatigue shows up as one that did not.',
        visual: <PowerRadarCard />,
      },
      {
        t: 'Load computed from real thresholds',
        d: 'Load is scored against a measured LT2 rather than an estimated FTP, so the same 200-point week means the same thing in March and in August — and the same thing for two different athletes.',
        visual: <TimeInZonesCard />,
      },
    ],
  },
  {
    slug: 'health',
    audience: ['/for-athletes', 'LaChart for athletes'],
    nav: 'Health & recovery',
    eyebrow: 'Health',
    title: 'The training, and the body doing it.',
    lead: 'Sleep, HRV and resting heart rate on the same timeline as the sessions, with illness and injury tracked so a bad block has an explanation attached to it.',
    meta: {
      title: 'Recovery Tracking — Sleep, HRV & Resting HR | LaChart',
      description: 'Apple Health metrics on the same timeline as your training: sleep, HRV, resting and low heart rate, plus illness and injury episodes.',
      keywords: 'HRV tracking, sleep tracking athletes, resting heart rate, recovery monitoring, Apple Health training, injury tracking, return to training',
    },
    blocks: [
      {
        t: 'Metrics with a normal range',
        d: 'HRV, sleep, resting heart rate and overnight low, each against your own baseline and your own normal band — because an HRV of 86 ms means nothing until you know what yours usually is.',
        visual: <HealthMetricsCard />,
      },
      {
        t: 'Against the training that caused it',
        d: 'The health timeline and the load timeline are the same timeline. A resting heart rate that climbed three days into a block is a fact about the block, not a mystery.',
        visual: <FormCard />,
      },
      {
        t: 'Illness and injury, on the record',
        d: 'Log an episode, track the symptoms and follow the return-to-training progression. Six months later the gap in the calendar still says what it was.',
        photo: ['/marketing/athlete-indoor-bike.webp', 'A turbo session in a garage, late'],
        card: <HealthMetricsCard />,
      },
    ],
  },
  {
    slug: 'integrations',
    audience: ['/for-athletes', 'LaChart for athletes'],
    nav: 'Integrations',
    eyebrow: 'Integrations',
    title: 'Connect it once, then stop thinking about it.',
    lead: 'Strava, Garmin and Apple Health sync in the background. Sessions go out to the watch the same way they came in.',
    meta: {
      title: 'Strava, Garmin & Apple Health Integration | LaChart',
      description: 'Connect Strava, Garmin or Apple Health once and every ride, run and swim arrives complete. Structured workouts go back out to the Garmin calendar.',
      keywords: 'Strava integration, Garmin Connect integration, Apple Health training, FIT file upload, sync training data, structured workout to Garmin',
    },
    blocks: [
      {
        t: 'Everything arrives on its own',
        d: 'Rides, runs and swims land with power, pace, heart rate, cadence, laps and per-second streams. Nothing to upload and nothing to chase — or drop a .FIT file in yourself when you want to.',
        visual: <SessionListCard />,
      },
      {
        t: 'And goes back out',
        d: 'A structured session written in the builder appears in the athlete’s Garmin Connect calendar with every step and target intact. The steps become laps on the device; they press start.',
        visual: <CalendarCard />,
      },
      {
        t: 'Apple Health for the rest of it',
        d: 'Sleep, HRV, resting and low heart rate come across from the phone, so recovery sits on the same timeline as the training rather than in a second app you have to remember to open.',
        visual: <HealthMetricsCard />,
      },
      {
        t: 'On the wrist, too',
        d: 'An iPhone app for the calendar and the tests, and an Apple Watch face carrying the zones that came out of your own lactate curve.',
        photo: ['/marketing/athlete-running.webp', 'A runner settling into a steady effort on an empty track at dawn'],
        card: <ThresholdPairCard />,
      },
    ],
  },
  {
    slug: 'coaching',
    audience: ['/for-coaches', 'LaChart for coaches'],
    nav: 'Coaching a roster',
    eyebrow: 'Coaching',
    title: 'A roster, not a folder of spreadsheets.',
    lead: 'Every athlete in one workspace, their training arriving on its own, and the week going back out to their watch.',
    meta: {
      title: 'Coaching Software — Roster, Plans & Analysis | LaChart',
      description: 'Coach an unlimited roster: their training arrives on its own, you read load, form and every session, and build workouts that reach their watch.',
      keywords: 'endurance coaching software, athlete management, coaching platform, training plan software, coach dashboard, structured workouts Garmin',
    },
    blocks: [
      {
        t: 'Everyone, at a glance',
        d: 'Switch between athletes in a tap. Status shows who is training, who has gone quiet and who is overdue a retest, before you have opened a single calendar.',
        photo: ['/marketing/coach-graph.webp', 'A coach reading an athlete’s week at a desk'],
        card: <FormCard />,
      },
      {
        t: 'Their week, planned and completed',
        d: 'Build the week on their calendar, push it to their watch, and see what came back against what you asked for — per session and across the block.',
        visual: <CalendarCard />,
      },
      {
        t: 'Read what happened',
        d: 'Laps, streams, load and form, and the same session compared with every previous attempt at it. The conversation starts from what the data says rather than from how it felt.',
        visual: <TrainingHistoryCard />,
      },
      {
        t: 'Talk about it under it',
        d: 'Comments live on the training itself, not in a separate thread. The athlete asks about Tuesday underneath Tuesday, and the answer is still there in November.',
        photo: ['/marketing/coach-athlete-phone.webp', 'A coach and an athlete going through a session together after training'],
        card: <SessionListCard />,
      },
      {
        t: 'Zones you can stand behind',
        d: 'Run the test yourself or take one a studio ran, and every athlete’s zones come from their own curve. Hand them a PDF with your name on it while you are at it.',
        visual: <ZonesCard />,
      },
    ],
  },
];

export const featureBySlug = (slug) => FEATURES.find((f) => f.slug === slug);
