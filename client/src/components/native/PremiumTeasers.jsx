import React from 'react';

/**
 * The free user's own numbers, one per locked card on the native testing and
 * training pages — the "teaser" half of PremiumLock's personal preview.
 *
 * Every component here is dumb: the page hands it numbers it has already
 * loaded, and nothing fetches. The point is to show something true about the
 * athlete next to the price, not a blurred stand-in for what they might get.
 */

/** Days between a test and now, or null when the date is unusable. */
export function daysSince(date, now = Date.now()) {
  const t = new Date(date).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((now - t) / 86400000));
}

/**
 * The best thing the training list says about the radar's sport, without the
 * radar: highest session average power on the bike, fastest average pace over
 * a run of 3 km or more. A session average is not a 20-minute best, so the
 * teaser calls it what it is.
 */
export function bestSessionFor(trainings, sport, { getSecs, getDist }) {
  let best = null;
  let count = 0;
  for (const t of Array.isArray(trainings) ? trainings : []) {
    if (String(t?.sport || '').toLowerCase() !== sport) continue;
    count += 1;
    if (sport === 'bike') {
      const w = Number(t.avgPower ?? t.averagePower ?? t.average_watts);
      if (Number.isFinite(w) && w > 0 && (!best || w > best.value)) best = { value: w, training: t };
    } else if (sport === 'run') {
      const dist = getDist(t);
      const secs = getSecs(t);
      if (dist >= 3000 && secs > 0) {
        const pace = secs / (dist / 1000);
        if (!best || pace < best.value) best = { value: pace, training: t };
      }
    }
  }
  return { count, best };
}

export function TeaserStat({ value, label, headline, hint, color = '#5E6590' }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14,
      background: '#F7F8FA', borderRadius: 14, padding: '12px 14px',
    }}>
      <div style={{ textAlign: 'center', minWidth: 56 }}>
        <div style={{ fontSize: 24, fontWeight: 800, color, lineHeight: 1, whiteSpace: 'nowrap' }}>
          {value}
        </div>
        <div style={{
          fontSize: 10, fontWeight: 700, color: '#9CA3AF', marginTop: 4,
          textTransform: 'uppercase', letterSpacing: '.05em',
        }}>
          {label}
        </div>
      </div>
      <div style={{ minWidth: 0 }}>
        {headline && <div style={{ fontSize: 15, fontWeight: 700, color: '#0A0E1A' }}>{headline}</div>}
        {hint && <div style={{ fontSize: 12, color: '#4B5563', lineHeight: 1.4, marginTop: 2 }}>{hint}</div>}
      </div>
    </div>
  );
}

const fmtDay = (date) => {
  const d = new Date(date);
  if (!Number.isFinite(d.getTime())) return '';
  return d.toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' });
};

const sportWord = (sport) => (sport === 'run' ? 'run' : sport === 'swim' ? 'swim' : 'bike');

/** The free test quota, used up — with the threshold those tests produced. */
export function TestLimitTeaser({ testCount, limit, lt2Label, sport, testDate }) {
  const hasLt2 = lt2Label && lt2Label !== '—';
  return (
    <TeaserStat
      value={`${testCount}/${limit}`}
      label="Free tests"
      headline={hasLt2 ? `Your LT2: ${lt2Label}` : 'All your free tests are used'}
      hint={hasLt2
        ? `From your ${sportWord(sport)} test on ${fmtDay(testDate)}. The next test is the one that shows whether it moved.`
        : 'Your tests stay here either way. Adding the next one needs Premium.'}
    />
  );
}

/** How long ago the selected test was, and what it measured then. */
export function SinceTestTeaser({ testDate, lt2Label }) {
  const days = daysSince(testDate);
  if (days == null) return null;
  const hasLt2 = lt2Label && lt2Label !== '—';
  return (
    <TeaserStat
      value={days}
      label={days === 1 ? 'Day ago' : 'Days ago'}
      headline={hasLt2 ? `LT2 on test day: ${lt2Label}` : 'Your last test'}
      hint={days >= 14
        ? 'Your training since then has probably moved it.'
        : 'Each session you sync from now on is read against this test.'}
    />
  );
}

/** The athlete's own thresholds, before any comparison. */
export function BenchmarkTeaser({ lt1Label, lt2Label, sport }) {
  const hasLt2 = lt2Label && lt2Label !== '—';
  if (!hasLt2) {
    return (
      <div style={{ fontSize: 13, color: '#6B7280', lineHeight: 1.45 }}>
        Add a {sportWord(sport)} test with clear thresholds and LaChart can place it among
        other athletes&apos; real lactate tests.
      </div>
    );
  }
  const hasLt1 = lt1Label && lt1Label !== '—';
  return (
    <TeaserStat
      value={lt2Label}
      label="Your LT2"
      headline={hasLt1 ? `LT1 ${lt1Label}` : null}
      hint={`From your latest ${sportWord(sport)} test. Where does that sit among other LaChart athletes?`}
    />
  );
}

/** One real number from the sessions the radar would be drawn from. */
export function PerformanceProfileTeaser({ sport, count, bestLabel, bestDate }) {
  if (!count) {
    return (
      <div style={{ fontSize: 13, color: '#6B7280', lineHeight: 1.45 }}>
        Once your rides and runs sync, LaChart draws your power or pace profile from them.
      </div>
    );
  }
  const noun = sport === 'run' ? 'run' : 'ride';
  return (
    <TeaserStat
      value={bestLabel || count}
      label={bestLabel ? (sport === 'run' ? 'Best avg pace' : 'Best avg') : `${noun}s`}
      headline={`${count} ${noun}${count === 1 ? '' : 's'} in this view`}
      hint={bestLabel
        ? `Your best session average${sport === 'run' ? ' over 3 km+' : ''}${bestDate ? `, ${fmtDay(bestDate)}` : ''}.`
        : 'Enough to start drawing your profile.'}
    />
  );
}
