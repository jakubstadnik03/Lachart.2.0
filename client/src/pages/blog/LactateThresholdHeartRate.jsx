import React from 'react';
import { Link } from 'react-router-dom';
import BlogPostLayout from './BlogPostLayout';

const LactateThresholdHeartRate = () => (
  <BlogPostLayout
    slug="lactate-threshold-heart-rate"
    title="Lactate Threshold Heart Rate (LTHR): How to Find Yours and Train By It"
    subtitle="Your LTHR is the single most useful heart-rate number in endurance training — and almost nobody's is what the %-of-max formulas say. Here's what LTHR actually is, the three ways to measure it, and how to build your heart-rate zones around it."
    category="Training Science"
    date="2026-07-12"
    readTime="11 min"
    image="/images/lactate-analysis.jpg"
    imageAlt="A lactate step test showing heart rate rising alongside blood lactate, with the lactate threshold heart rate (LTHR) marked at the LT2 deflection point"
    description="What is lactate threshold heart rate (LTHR) and how do you find it? Learn the lab, field and step-test methods, and how to set accurate HR training zones from your LTHR."
    keywords="lactate threshold heart rate, LTHR, how to find lactate threshold heart rate, threshold heart rate, LTHR test, heart rate training zones, LT2 heart rate, anaerobic threshold heart rate, Friel LTHR, lactate test heart rate"
    relatedSlugs={['lt1-vs-lt2-training-zones', 'zone-2-training-lactate']}
  >
    <p>
      Open any heart-rate training plan and it will tell you to spend so many
      minutes in Zone 3, so many at threshold, so many in Zone 5. But those
      zones are only as good as the number they're built on. If you set them
      from &quot;220 minus age&quot; or a percentage of your max heart rate,
      you're anchoring your whole plan to a population average that is probably
      wrong for you by 5–15 beats. The number that fixes this is your{' '}
      <strong>lactate threshold heart rate (LTHR)</strong>.
    </p>
    <p>
      This article explains what LTHR is, why it's a better anchor than max HR,
      the three ways to measure it (from most to least accurate), and how to turn
      it into heart-rate zones you can actually train by.
    </p>

    <h2>What is lactate threshold heart rate?</h2>
    <p>
      Your LTHR is the <strong>heart rate at your lactate threshold</strong> —
      the intensity above which blood lactate starts to accumulate faster than
      your body can clear it. In practice &quot;the lactate threshold&quot; that
      LTHR refers to is usually <strong>LT2, the anaerobic threshold</strong> —
      roughly the hardest effort you could hold for about an hour. It's the same
      physiological event that defines FTP in cycling, expressed as a heart rate
      instead of a power or pace.
    </p>
    <p>
      There are really two threshold heart rates, and it's worth knowing both:
    </p>
    <ul>
      <li>
        <strong>LT1 heart rate (aerobic threshold)</strong> — the top of your
        easy, all-day endurance zone. This is the ceiling of{' '}
        <Link to="/blog/zone-2-training-lactate">Zone 2 training</Link>.
      </li>
      <li>
        <strong>LT2 heart rate (anaerobic threshold)</strong> — what most people
        mean by &quot;LTHR&quot;, and the anchor for threshold and tempo work.
      </li>
    </ul>
    <p>
      If the LT1/LT2 distinction is new, our guide to{' '}
      <Link to="/blog/lt1-vs-lt2-training-zones">LT1 vs LT2 training zones</Link>{' '}
      lays out the full picture. For the rest of this article, &quot;LTHR&quot;
      means your LT2 heart rate unless stated otherwise.
    </p>

    <h2>Why LTHR beats &quot;percentage of max heart rate&quot;</h2>
    <p>
      Max-HR formulas and %HRmax zones fail for the same reason: they assume
      everyone's physiology sits in the same place relative to their maximum.
      They don't.
    </p>
    <ul>
      <li>
        <strong>Max HR itself is highly individual.</strong> Two 40-year-olds can
        have maximums 20+ bpm apart. &quot;220 − age&quot; has a standard error
        of around ±10–12 bpm — big enough to misplace every zone below it.
      </li>
      <li>
        <strong>The threshold sits at different %HRmax for different people.</strong>{' '}
        LT2 can fall anywhere from about 85% to 92% of max HR depending on
        training status. A single percentage can't capture that.
      </li>
      <li>
        <strong>LTHR moves with fitness in a way max HR doesn't.</strong> As you
        train, your max HR barely changes, but your threshold HR (and the power
        or pace you can hold there) climbs. Anchoring to LTHR means your zones
        track your fitness; anchoring to max HR means they don't.
      </li>
    </ul>
    <p>
      This is why coaches and physiologists build heart-rate zones from a
      measured threshold, not from a birthday.
    </p>

    <h2>How to find your LTHR — three methods</h2>

    <h3>1. Blood lactate step test (most accurate)</h3>
    <p>
      This is the gold standard because it measures the actual physiological
      event instead of inferring it. You ride or run a series of increasing
      stages, and at the end of each stage you record <strong>both</strong> your
      heart rate and a fingertip blood-lactate sample. Plot lactate against
      intensity, find the deflection point where lactate starts climbing sharply
      (LT2), and read off the heart rate at that point — that's your LTHR.
    </p>
    <ul>
      <li>
        <strong>Why it wins:</strong> it pins LT1 and LT2 directly, gives you the
        HR, power and pace at each, and it's repeatable so you can track change
        over time.
      </li>
      <li>
        <strong>Do it yourself:</strong> a portable analyzer makes this a home
        test — see our{' '}
        <Link to="/blog/lactate-testing-protocol-guide">step-test protocol guide</Link>{' '}
        for stage length, sampling and the common mistakes, and the{' '}
        <Link to="/blog/lactate-test-at-home">at-home guide</Link> for the kit.
      </li>
    </ul>
    <p>
      This is exactly what LaChart automates: enter your step-test numbers —
      including the heart rate at each stage — and it detects LT1 and LT2 using
      several methods at once, then reads out your threshold heart rate along with
      your full HR, power and pace zones. No manual curve-drawing.
    </p>

    <h3>2. Field test (good, no blood needed)</h3>
    <p>
      The most widely used field method comes from coach Joe Friel: do a{' '}
      <strong>30-minute all-out time trial, solo</strong>, on a route or trainer
      where you can hold a steady effort. Start your lap timer at the 10-minute
      mark and take your <strong>average heart rate for the final 20 minutes</strong> —
      that average is a good estimate of your LTHR.
    </p>
    <ul>
      <li>
        <strong>Pros:</strong> free, no equipment beyond an HR strap, reasonably
        accurate for most people.
      </li>
      <li>
        <strong>Cons:</strong> pacing a true 30-minute effort is hard; go out too
        fast or too easy and the number is off. It estimates only LT2 — you don't
        get LT1 or your aerobic-threshold HR from it.
      </li>
      <li>
        <strong>Tip:</strong> use a chest-strap HR monitor, not a wrist optical
        sensor, for threshold work — optical HR lags and drops beats exactly when
        the effort is hard.
      </li>
    </ul>

    <h3>3. From an existing lactate test or race file</h3>
    <p>
      If you've done a lab or home lactate test before, you already have your
      LTHR — it's the heart rate recorded at LT2. You can also approximate it from
      a recent hard, steady effort of ~40–60 minutes (a hilly TT, a hard group
      ride you drove, a threshold race): the average HR of a well-paced hour is
      close to LTHR for most trained athletes.
    </p>

    <h2>Turning LTHR into heart-rate zones</h2>
    <p>
      Once you have your LTHR, you can build zones as percentages of it. A common
      scheme (adapted from Friel) looks like this — treat the numbers as a
      starting point, not gospel:
    </p>
    <div style={{ overflowX: 'auto' }}>
      <table>
        <thead>
          <tr>
            <th>Zone</th>
            <th>% of LTHR</th>
            <th>Purpose</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>Zone 1 — Recovery</td><td>&lt; 85%</td><td>Active recovery, easy spinning</td></tr>
          <tr><td>Zone 2 — Aerobic / endurance</td><td>85–89%</td><td>Base, fat oxidation (near LT1)</td></tr>
          <tr><td>Zone 3 — Tempo</td><td>90–94%</td><td>Sustained moderate work</td></tr>
          <tr><td>Zone 4 — Threshold</td><td>95–99%</td><td>At/just under LTHR</td></tr>
          <tr><td>Zone 5a — Just above threshold</td><td>100–102%</td><td>Threshold overload</td></tr>
          <tr><td>Zone 5b/5c — VO2max & anaerobic</td><td>&gt; 102% (HR lags here)</td><td>Short, hard intervals</td></tr>
        </tbody>
      </table>
    </div>
    <p>
      The important caveat: <strong>above threshold, heart rate stops being a
      useful guide.</strong> In short VO2max and anaerobic intervals your HR
      can't rise fast enough to reflect the effort, so pace or power is the
      better target there — and LTHR-based zones are most useful from recovery up
      through threshold.
    </p>

    <h2>The limits of heart rate (and how to work around them)</h2>
    <p>
      LTHR is a great anchor, but heart rate is a noisy signal. Know its quirks
      so you don't get misled:
    </p>
    <ul>
      <li>
        <strong>Cardiac drift:</strong> over a long session your HR creeps up at
        the same power/pace as you fatigue and dehydrate. Don't chase a fixed HR
        late in a ride — you'll end up going too easy.
      </li>
      <li>
        <strong>Heat, altitude, caffeine, stress, illness</strong> all shift HR
        by several beats. Your LTHR isn't a fixed constant every single day.
      </li>
      <li>
        <strong>HR lags effort</strong> at the start of intervals and on short
        efforts — useless for anything under a few minutes.
      </li>
      <li>
        <strong>Best practice:</strong> anchor endurance and threshold work to
        LTHR, but pair it with power (bike) or pace (run) set from the same
        lactate test, so drift and daily noise don't push you into the wrong
        zone. See how power and threshold relate in{' '}
        <Link to="/blog/ftp-vs-lt2">FTP vs LT2</Link>.
      </li>
    </ul>

    <h2>The bottom line</h2>
    <p>
      Your lactate threshold heart rate is the most useful HR number you can
      know — but only if it's <em>yours</em>, measured, not guessed from your age.
      A blood lactate test gives it to you directly along with LT1, LT2 and your
      full zones; a 30-minute field test gets you close for free. Set your zones
      from LTHR, re-test as you get fitter, and pair heart rate with power or pace
      so you're training against your physiology instead of a formula.
    </p>
  </BlogPostLayout>
);

export default LactateThresholdHeartRate;
