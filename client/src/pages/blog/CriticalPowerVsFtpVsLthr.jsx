import React from 'react';
import { Link } from 'react-router-dom';
import BlogPostLayout from './BlogPostLayout';

const FAQS = [
  {
    q: 'What is the difference between Critical Power, FTP and LTHR?',
    a: 'They are three ways of describing roughly the same thing — your sustainable aerobic ceiling — measured differently. Critical Power (CP) is derived mathematically from your power-duration curve. FTP is the power you can hold for about an hour, usually estimated from a 20-minute test. LTHR is the heart rate at your lactate threshold. CP and FTP are power numbers; LTHR is a heart-rate number. They land close together but are not identical.',
  },
  {
    q: 'Is Critical Power the same as FTP?',
    a: 'No, though they are close. Critical Power comes from fitting your best efforts across several durations to a power-duration model, so it reflects a true physiological asymptote. FTP is a single practical estimate of one-hour power, usually 95% of a 20-minute test. CP is often a few percent higher than FTP and tends to be more repeatable, but FTP is simpler to test and more widely supported by training apps.',
  },
  {
    q: 'Which is most accurate — Critical Power, FTP or LTHR?',
    a: 'For pacing and zones, Critical Power is generally the most physiologically robust because it is modelled from multiple efforts, and a lactate test (which gives LT2 directly, plus LTHR) is the gold standard. FTP is the least precise of the three because it infers one-hour power from a single shorter test, but it is good enough for most training. A lactate test resolves all of them at once by measuring LT1, LT2, and the heart rate, power and pace at each.',
  },
  {
    q: 'Should I train with power or heart rate?',
    a: 'Use power (or pace for runners) as the primary target for intervals and threshold work, because it responds instantly and is not affected by heat, fatigue or caffeine. Use heart rate as a secondary signal, especially for long endurance rides where cardiac drift and how you feel matter. LTHR is best for setting endurance and threshold zones; above threshold, heart rate lags too much to be useful.',
  },
  {
    q: 'How do I find my Critical Power?',
    a: 'Do a few maximal efforts of different durations (for example 3 minutes and 12 minutes, on separate days or well-rested within a session), then fit them to a power-duration model — most cycling platforms do this automatically from your ride data. Critical Power is the asymptote the curve settles toward; the extra energy above it is your W′ (anaerobic work capacity).',
  },
];

const CriticalPowerVsFtpVsLthr = () => (
  <BlogPostLayout
    slug="critical-power-vs-ftp-vs-lthr"
    title="Critical Power vs FTP vs LTHR: Which Threshold Number Should You Train By?"
    subtitle="Three numbers claim to define your endurance ceiling — Critical Power, FTP and lactate threshold heart rate. They sit close together but they are not the same, and using the wrong one quietly mis-sets every zone below it. Here is what each really measures and which to trust."
    category="Training Science"
    date="2026-07-14"
    readTime="11 min"
    image="/images/lactate_curve_calculator_lachart.jpg"
    imageAlt="A power-duration curve with Critical Power, FTP and the lactate threshold marked, showing how the three threshold numbers line up close but not identically"
    description="Critical Power vs FTP vs LTHR — what each threshold number actually measures, how they differ, which is most accurate, and how a lactate test resolves all three at once."
    keywords="critical power vs ftp, critical power vs lthr, ftp vs lthr, critical power vs ftp vs lthr, what is critical power, critical power cycling, lactate threshold heart rate, threshold power, W prime, power duration curve"
    relatedSlugs={['ftp-vs-lt2', 'lactate-threshold-heart-rate']}
    faqs={FAQS}
  >
    <p>
      Open three different training apps and each hands you a different
      &quot;threshold&quot; number to build your season on. One shows{' '}
      <strong>Critical Power</strong>, one shows <strong>FTP</strong>, and your
      heart-rate zones are anchored to <strong>LTHR</strong>. They're all trying
      to describe the same thing — the highest intensity you can sustain
      aerobically — but they measure it in different ways, land at slightly
      different values, and behave differently day to day.
    </p>
    <p>
      Pick the wrong one, or treat them as interchangeable, and every zone you
      derive inherits the error. This article breaks down what each number
      actually is, how they line up, which is most accurate, and how a single
      lactate test settles the argument by giving you all three at once.
    </p>

    <h2>The three numbers, quickly</h2>
    <div style={{ overflowX: 'auto' }}>
      <table>
        <thead>
          <tr>
            <th>Number</th>
            <th>What it is</th>
            <th>Units</th>
            <th>How it's measured</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Critical Power (CP)</strong></td>
            <td>The asymptote of your power-duration curve — the highest power your aerobic system can sustain in a steady state</td>
            <td>Watts</td>
            <td>Modelled from several maximal efforts of different durations</td>
          </tr>
          <tr>
            <td><strong>FTP</strong></td>
            <td>Functional Threshold Power — the power you could hold for ~1 hour</td>
            <td>Watts</td>
            <td>Usually 95% of a 20-minute test (or a ramp/8-min estimate)</td>
          </tr>
          <tr>
            <td><strong>LTHR</strong></td>
            <td>Lactate Threshold Heart Rate — the heart rate at your anaerobic threshold (LT2)</td>
            <td>bpm</td>
            <td>Lactate step test, or a 30-min field-test average</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p>
      Two of them (CP and FTP) are <em>power</em> numbers; one (LTHR) is a{' '}
      <em>heart-rate</em> number. That distinction matters more than most people
      realise — power and heart rate answer different questions, which we get to
      below.
    </p>

    <h2>Critical Power: the physiological asymptote</h2>
    <p>
      Critical Power comes from a simple, powerful idea: plot your best power for
      a range of durations — say 1, 3, 5 and 12 minutes — and the points fall on
      a curve that flattens toward a horizontal line. That line is your{' '}
      <strong>Critical Power</strong>: the boundary between efforts you can
      sustain in a metabolic steady state and efforts that inexorably drive you
      toward exhaustion.
    </p>
    <p>
      The gap between your short-duration power and CP is your{' '}
      <strong>W&prime; (&quot;W-prime&quot;)</strong> — a fixed battery of
      anaerobic work you can spend above CP before you blow up. This is CP's
      unique strength: it doesn't just give you a threshold, it quantifies how
      much you have <em>above</em> it, which is gold for pacing breakaways,
      climbs and time trials.
    </p>
    <ul>
      <li><strong>Pros:</strong> physiologically grounded, modelled from multiple efforts so it's repeatable, and it comes with W&prime; for pacing.</li>
      <li><strong>Cons:</strong> only as good as the test efforts you feed it — a poorly paced 3-minute or 12-minute effort skews the model. It's a power-only concept, so it says nothing about your heart rate or lactate directly.</li>
    </ul>

    <h2>FTP: the practical one-hour estimate</h2>
    <p>
      FTP is the number the cycling world actually runs on, because it's easy to
      test and every platform supports it. It's defined as the power you could
      hold for roughly an hour, and it's almost never tested that way — instead
      it's estimated, most commonly as <strong>95% of your best 20-minute
      power</strong>, or from a ramp test.
    </p>
    <p>
      That convenience is also its weakness. FTP is a single estimate inferred
      from one shorter effort, so it's sensitive to how you paced that test and
      to your particular physiology. A rider with a big anaerobic contribution
      can over-shoot a 20-minute test and end up with an FTP they can't actually
      hold for an hour. We cover exactly how FTP relates to the physiological
      threshold in{' '}
      <Link to="/blog/ftp-vs-lt2">FTP vs LT2</Link>.
    </p>
    <ul>
      <li><strong>Pros:</strong> quick, universally supported, good enough for setting everyday training zones.</li>
      <li><strong>Cons:</strong> least precise of the three; a 20-minute test is not an hour, and the 95% factor is a population average, not your average.</li>
    </ul>

    <h2>LTHR: the heart-rate anchor</h2>
    <p>
      LTHR is the heart rate at your lactate threshold — specifically LT2, the
      anaerobic threshold. Where CP and FTP tell you <em>how hard to push</em>,
      LTHR tells you <em>how hard your body is working internally</em>. It's the
      right anchor for heart-rate zones, especially for long endurance sessions
      where power alone can hide accumulating fatigue.
    </p>
    <p>
      But heart rate is a slower, noisier signal. It lags at the start of
      intervals, drifts upward over a long ride (cardiac drift), and moves with
      heat, hydration, caffeine, sleep and stress. That's why LTHR is excellent
      for endurance and threshold zones but useless above threshold, where HR
      simply can't keep up with the effort. Full method and zone-building guide
      in{' '}
      <Link to="/blog/lactate-threshold-heart-rate">Lactate Threshold Heart Rate</Link>.
    </p>

    <h2>How they line up (and why they don't match)</h2>
    <p>
      For a well-trained cyclist, the three tend to sit close together — but
      &quot;close&quot; is not &quot;equal&quot;:
    </p>
    <ul>
      <li>
        <strong>CP is usually a few percent above FTP.</strong> Because CP is a
        steady-state asymptote and FTP is discounted from a 20-minute test, most
        riders' CP comes out slightly higher. Train off FTP and your threshold
        sessions may run a touch easy; train off CP and they may run a touch hard.
      </li>
      <li>
        <strong>LT2 (the true lactate threshold) can sit on either side.</strong>{' '}
        Depending on your glycolytic profile (your{' '}
        <Link to="/blog/what-is-vlamax">VLaMax</Link>), your measured LT2 power
        can be above or below both CP and FTP. This is the crux: CP and FTP are
        performance estimates; LT2 is a direct physiological measurement.
      </li>
      <li>
        <strong>LTHR is a heart rate, so it can't be compared in watts at all</strong>{' '}
        — it's the internal-load partner to whichever power number you use.
      </li>
    </ul>
    <p>
      The practical consequence: if your FTP, CP and LTHR were each set from
      different tests on different days, your power zones and heart-rate zones may
      quietly disagree — and you'll feel it as sessions that are &quot;in
      zone&quot; on one metric but not the other.
    </p>

    <h2>Power or heart rate — which should drive the session?</h2>
    <p>
      This is the question underneath the whole comparison. The short answer:
    </p>
    <ul>
      <li>
        <strong>Use power (or running pace) as the primary target</strong> for
        intervals, threshold efforts and anything short. It responds instantly and
        isn't fooled by heat or fatigue.
      </li>
      <li>
        <strong>Use heart rate (anchored to LTHR) as the secondary signal,</strong>{' '}
        and as the primary one for long Zone 2 rides where internal load and drift
        matter more than hitting an exact wattage. See{' '}
        <Link to="/blog/zone-2-training-lactate">Zone 2 training</Link>.
      </li>
      <li>
        <strong>Watch the two together.</strong> When your heart rate at a fixed
        power starts climbing across a session, that's fatigue — useful
        information no single number gives you.
      </li>
    </ul>

    <h2>How a lactate test resolves all three</h2>
    <p>
      Here's the thing the CP-vs-FTP-vs-LTHR debate usually misses: they're all
      proxies for the same underlying physiology, and a{' '}
      <strong>blood lactate step test measures that physiology directly.</strong>{' '}
      In one test you record power (or pace) <em>and</em> heart rate <em>and</em>{' '}
      a lactate sample at each stage, which gives you:
    </p>
    <ul>
      <li>Your <strong>LT2</strong> — the true anaerobic threshold in watts/pace, the number FTP and CP are trying to approximate.</li>
      <li>Your <strong>LTHR</strong> — the heart rate at that exact point, not a formula.</li>
      <li>Your <strong>LT1</strong> and the top of Zone 2, which neither CP nor FTP gives you.</li>
      <li>Power, pace <em>and</em> heart-rate zones that all agree, because they came from the same effort on the same day.</li>
    </ul>
    <p>
      This is what LaChart automates: enter your step-test numbers — power/pace,
      heart rate and lactate at each stage — and it detects LT1 and LT2 with
      several methods at once, then reads out your threshold heart rate and builds
      matching power, pace and HR zones. Instead of three numbers from three tests
      that don't quite line up, you get one coherent picture. You can also start
      free with the{' '}
      <Link to="/lactate-curve-calculator">lactate curve calculator</Link> to see
      your thresholds from a single test.
    </p>

    <h2>The bottom line</h2>
    <p>
      Critical Power, FTP and LTHR aren't rivals so much as three different
      windows onto your endurance ceiling. CP is the most robust power estimate
      and comes with W&prime; for pacing; FTP is the convenient everyday standard
      but the least precise; LTHR is the right anchor for heart-rate zones but a
      noisier signal. Train primarily off power, watch heart rate alongside it,
      and if you want the ground truth all three approximate, measure it once with
      a lactate test — then every zone below it is built on the same foundation.
    </p>
  </BlogPostLayout>
);

export default CriticalPowerVsFtpVsLthr;
