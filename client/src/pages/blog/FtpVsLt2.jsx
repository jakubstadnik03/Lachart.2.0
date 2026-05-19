import React from 'react';
// (icons removed — were imported but never used)
import BlogPostLayout from './BlogPostLayout';

const FtpVsLt2 = () => (
  <BlogPostLayout
    slug="ftp-vs-lt2"
    title="FTP vs LT2: Are They the Same Power? Spoiler — Usually Yes, Sometimes No"
    subtitle="FTP and LT2 sit a few watts apart on the same curve, but they are measured differently, drift over time differently, and answer slightly different training questions. Here is exactly when they line up and when they don't."
    category="Training Science"
    date="2026-05-17"
    readTime="10 min"
    image="/images/lactate_curve_calculator_lachart.jpg"
    imageAlt="A lactate curve from a cycling test with FTP and LT2 markers overlaid, showing how they sit within a few watts of each other on a typical well-trained athlete"
    description="What is the difference between FTP and LT2? When do they match, when do they diverge, and which one should you actually train against? A practical guide for cyclists."
    keywords="FTP vs LT2, FTP versus lactate threshold, what is FTP, anaerobic threshold cycling, FTP test, lactate threshold power, critical power vs FTP, MLSS vs FTP"
    relatedSlugs={['lt1-vs-lt2-training-zones', 'obla-dmax-iat-methods-compared']}
  >
    <p>
      Open any cycling forum, training app, or coaching book and you'll see
      FTP, LT2, MLSS, CP, and &quot;threshold&quot; used almost
      interchangeably. They aren't the same number, but for most well-trained
      athletes they're within ±10 W of each other — close enough that
      training prescriptions don't really care which one you used. <em>Most</em>
      of the time.
    </p>
    <p>
      This article walks through what each number actually measures, when
      they diverge, and which one you should use as the anchor of your
      training zones.
    </p>

    <h2>Definitions, briefly</h2>

    <h3>FTP — Functional Threshold Power</h3>
    <p>
      Coined by Andrew Coggan around 2003. <strong>The highest average power
      you can sustain for ~60 minutes.</strong> In practice nobody actually
      does a 60-minute all-out time-trial test — too painful, too easy to
      pace badly, recovery cost is huge. Instead FTP is <em>estimated</em>
      from a 20-min all-out test, multiplied by 0.95.
    </p>
    <ul>
      <li>
        <strong>Test:</strong> 20-min all-out time trial → FTP = avg × 0.95.
      </li>
      <li>
        <strong>What it actually measures:</strong> a power output that
        correlates well with 60-min sustainable power for most riders. It's
        a model output, not a physiological quantity.
      </li>
      <li>
        <strong>Where it goes wrong:</strong> riders with high anaerobic
        capacity (puncheurs, sprinters) over-shoot their 20-min test and
        the 0.95 multiplier under-estimates real sustainable power. Riders
        with low anaerobic capacity (pure diesels, ultra-endurance) can
        actually sustain &gt; 95 % of their 20-min for an hour.
      </li>
    </ul>

    <h3>LT2 — Lactate Threshold 2 (anaerobic threshold)</h3>
    <p>
      A physiological measurement. <strong>The intensity at which blood
      lactate production permanently exceeds clearance</strong> and the
      curve becomes nearly vertical.
    </p>
    <ul>
      <li>
        <strong>Test:</strong> stepped blood-lactate test (the protocol from
        our{' '}
        <a href="/blog/lactate-test-at-home" className="text-primary font-semibold hover:underline">
          home lactate test guide
        </a>
        ) → identify the deflection algorithmically (D-max, log-log, IAT,
        OBLA 4.0, etc.).
      </li>
      <li>
        <strong>What it actually measures:</strong> a real, repeatable
        physiological event — the point where anaerobic energy production
        is overwhelming the body's lactate-clearance machinery.
      </li>
      <li>
        <strong>Where it goes wrong:</strong> blood lactate has ±0.2 mmol/L
        sensor noise, the polynomial fit can be pulled off by one bad
        sample, and different detection methods can disagree by 10–30 W.
        The newer LaChart ensemble averages them to reduce this noise.
      </li>
    </ul>

    <h3>MLSS — Maximum Lactate Steady State</h3>
    <p>
      The single most physiologically &quot;true&quot; threshold. <strong>The
      highest intensity at which blood lactate concentration stays stable
      for ~30 minutes.</strong> Painful and time-consuming to test directly
      — needs multiple 30-min constant-power trials at different intensities,
      sampling lactate every 5 min, plotting which power level just barely
      flattens vs which one just barely climbs.
    </p>
    <ul>
      <li>
        <strong>Test:</strong> 4+ separate 30-min trials. Often used as the
        validation reference in sport-science papers; rarely run in
        practice.
      </li>
      <li>
        <strong>Relationship to LT2:</strong> typically within 5 W. LT2 from
        a step test slightly over-shoots MLSS in most studies.
      </li>
    </ul>

    <h3>CP — Critical Power</h3>
    <p>
      Mathematical model based on the relationship between power and
      time-to-exhaustion. <strong>The asymptote of the power-duration
      curve.</strong> Computed from 3 maximal efforts at different
      durations (typically 3 min, 12 min, 30 min — or shorter for sprinters).
    </p>
    <ul>
      <li>
        <strong>Test:</strong> 2–3 separate maximal efforts on different
        days, software fits the hyperbola.
      </li>
      <li>
        <strong>Relationship to FTP/LT2:</strong> CP is typically 3–5 % below
        FTP and is closer to MLSS than FTP is. Better-suited to riders with
        high anaerobic capacity.
      </li>
    </ul>

    <h2>How close do they actually sit?</h2>
    <p>
      For a typical, well-trained amateur cyclist:
    </p>
    <div className="overflow-x-auto my-6">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b-2 border-gray-200">
            <th className="text-left p-3 font-bold">Metric</th>
            <th className="text-left p-3 font-bold">Sample value</th>
            <th className="text-left p-3 font-bold">% of LT2</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-gray-100">
            <td className="p-3 font-semibold">LT2 (lactate)</td>
            <td className="p-3">280 W</td>
            <td className="p-3">100 %</td>
          </tr>
          <tr className="border-b border-gray-100">
            <td className="p-3 font-semibold">MLSS</td>
            <td className="p-3">275 W</td>
            <td className="p-3">98 %</td>
          </tr>
          <tr className="border-b border-gray-100">
            <td className="p-3 font-semibold">FTP</td>
            <td className="p-3">278 W</td>
            <td className="p-3">99 %</td>
          </tr>
          <tr className="border-b border-gray-100">
            <td className="p-3 font-semibold">Critical Power</td>
            <td className="p-3">272 W</td>
            <td className="p-3">97 %</td>
          </tr>
          <tr className="border-b border-gray-100">
            <td className="p-3 font-semibold">VO2max power</td>
            <td className="p-3">335 W</td>
            <td className="p-3">120 %</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p>
      So for the average rider, FTP, LT2, MLSS, and CP all live in a 10 W
      band — about ±2 %. Training zones built from any of them will look
      essentially identical. If you set a Zone 4 interval at 95–105 % of
      FTP vs 95–105 % of LT2, the difference is one or two watts.
    </p>

    <h2>When they diverge — and which one to trust</h2>

    <h3>Case 1: high anaerobic capacity (puncheur / sprinter)</h3>
    <p>
      A rider with a big anaerobic engine over-shoots the 20-min test by
      pulling on glycolytic reserves. Their FTP comes out 5–10 % above
      LT2. If they train against the inflated FTP, they're actually doing
      Zone 4+ intervals — over-cooked, lots of fatigue, lots of grey-zone
      injury risk.
    </p>
    <p>
      <strong>Trust LT2.</strong> The physiology doesn't lie. Their 20-min
      number is just &quot;what they can hold for 20 min&quot;, not what
      they can sustain.
    </p>

    <h3>Case 2: pure diesel / ultra-endurance rider</h3>
    <p>
      Low anaerobic capacity, huge aerobic base. Their 20-min test
      under-estimates sustainable power because they can't generate
      enough anaerobic contribution to push above LT2 for 20 minutes
      straight. FTP comes out 5–10 % below LT2. Training against the
      conservative FTP means leaving fitness on the table.
    </p>
    <p>
      <strong>Trust LT2.</strong> Or run a 60-min Hour Record-style TT and
      use the true 60-min average. FTP estimation overcomplicates it for
      this type.
    </p>

    <h3>Case 3: badly executed lactate test</h3>
    <p>
      Sometimes a lactate test produces nonsense — bad sampling technique,
      protocol too aggressive, test stopped too early. If LT2 comes out at
      150 W on a rider who can clearly hold 270 W for an hour, the test is
      wrong, not the rider.
    </p>
    <p>
      <strong>Re-test.</strong> Or use FTP as the anchor until you can do
      the lactate test properly. See our{' '}
      <a href="/blog/lactate-test-at-home" className="text-primary font-semibold hover:underline">
        protocol guide
      </a>{' '}
      for how to avoid the four most common errors.
    </p>

    <h3>Case 4: detrained or recovering</h3>
    <p>
      After a layoff or illness, FTP estimates from old 20-min tests are
      meaningless. The lactate curve is the only thing that reflects current
      physiology accurately. Re-test and let the new LT2 set zones.
    </p>

    <h2>Which one should YOU train against?</h2>
    <p>
      For most cyclists, the answer is: <strong>whichever you have an
      accurate, current measurement of</strong>. They're close enough that
      training prescriptions won't differ in any meaningful way.
    </p>
    <p>
      That said:
    </p>
    <ul>
      <li>
        <strong>LT2 wins on accuracy.</strong> It's a physiological measure,
        not a model output. Doesn't depend on pacing strategy or how
        rested you are on test day.
      </li>
      <li>
        <strong>FTP wins on convenience.</strong> No analyzer, no finger
        pricks, no protocol design — just a 20-min effort on any smart
        trainer.
      </li>
      <li>
        <strong>LT2 + LT1 together win on training design.</strong> FTP gives
        you one number; a lactate test gives you two thresholds plus the
        whole curve shape. That extra context tells you whether to spend
        the next block on Zone 2 (raise LT1) or threshold work (raise LT2).
      </li>
    </ul>

    <h2>The practical answer</h2>
    <p>
      Do both, six weeks apart. Run a 20-min FTP test to see if your
      numbers ballpark. Then run a proper lactate test to see the full
      curve and pin down LT1 and LT2. If the two numbers agree (within
      5 %), use them interchangeably and re-test every 8 weeks. If they
      disagree by &gt; 10 %, the lactate curve will tell you why — either
      your 20-min pacing was off or your anaerobic capacity is unusual.
    </p>
    <p>
      Either way, the lactate test is the better anchor for long-term
      training because it doesn't care about test-day rested-ness or pacing
      psychology. It just measures what your muscles are doing.
    </p>

    <h2>The short answer</h2>
    <p>
      <strong>For most well-trained cyclists, FTP ≈ LT2 within 2–3 %.</strong>
      Train against whichever you have, and re-measure every 6–8 weeks.
      If they ever diverge by more than 5 %, your physiology is telling
      you something — usually that your aerobic / anaerobic capacity is
      unbalanced and your training mix should shift accordingly.
    </p>

    <div className="bg-primary/5 border border-primary/20 rounded-2xl p-6 my-8 text-center">
      <h3 className="text-xl font-bold text-gray-900 mb-2">Want to compare yours?</h3>
      <p className="text-gray-600 mb-4">
        Run a lactate test (we have a{' '}
        <a href="/blog/lactate-test-at-home" className="text-primary font-semibold hover:underline">
          home protocol guide
        </a>
        ), drop the numbers into the free LaChart calculator, and compare
        the resulting LT2 to your latest FTP. 30 seconds, no signup.
      </p>
      <a
        href="/lactate-curve-calculator"
        className="inline-flex items-center gap-2 bg-primary text-white font-bold px-6 py-3 rounded-xl hover:bg-primary/90 transition-colors"
      >
        Try free calculator →
      </a>
    </div>
  </BlogPostLayout>
);

export default FtpVsLt2;
