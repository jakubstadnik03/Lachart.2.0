import React, { useEffect, useMemo, useState } from 'react';
import {
  MARKETING_FEATURE_CATEGORIES,
  MARKETING_FEATURES,
} from '../../constants/marketingFeatures';

const LC = {
  primary: '#767EB5',
  primaryDark: '#5E6590',
  primaryTint: '#EEF0F8',
  ink: '#0F1729',
  text: '#1D2C4C',
  muted: '#6B7280',
  border: 'rgba(180,190,210,.30)',
};

function FeatIcon({ d, size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

/**
 * Feature list, grouped by what the visitor is trying to DO.
 *
 * This used to be 28 cards behind category chips, defaulting to "All" — a wall
 * of tiles nobody reads, where finding anything meant guessing which chip to
 * press first. The chips were also named after our internals ("Tools",
 * "Execution") rather than anything a coach would go looking for.
 *
 * Now: six outcomes, one line each, in the order someone actually works —
 * test, understand, plan, execute, connect, coach. Five seconds to scan, with
 * the detail one click away for whoever wants it. Every feature is still
 * rendered in the DOM (collapsed, not unmounted) so nothing is lost to search
 * engines or to Ctrl-F.
 */
const GROUPS = [
  {
    id: 'test',
    cats: ['Testing'],
    title: 'Run the test',
    promise: 'Build the step protocol, enter the samples, get a real curve — field or lab.',
  },
  {
    id: 'understand',
    cats: ['Analysis'],
    title: 'Understand the numbers',
    promise: 'LT1, LT2 and the thresholds around them — and how they move across a season.',
  },
  {
    id: 'plan',
    cats: ['Planning', 'Training'],
    title: 'Plan the work',
    promise: 'Turn those thresholds into structured sessions and a week that adds up.',
  },
  {
    id: 'execute',
    cats: ['Execution'],
    title: 'Do the session',
    promise: 'Follow the intervals live and log lactate where it actually happened.',
  },
  {
    id: 'connect',
    cats: ['Integration', 'Tools'],
    title: 'Let the data arrive on its own',
    promise: 'Garmin, Strava, Apple Health and FIT files land without you exporting anything.',
  },
  {
    id: 'coach',
    cats: ['Coach'],
    title: 'Coach a roster',
    promise: 'Every athlete, their tests and their week — without a spreadsheet in sight.',
  },
];

export default function FeaturesShowcase({ revealRef, pushRef }) {
  const [openId, setOpenId] = useState(GROUPS[0].id);

  const byGroup = useMemo(() => {
    const map = {};
    GROUPS.forEach((g) => {
      map[g.id] = MARKETING_FEATURES.filter((f) => g.cats.includes(f.cat));
    });
    return map;
  }, []);

  // Anything no group claims would silently disappear from the page, so fold
  // it into the last bucket rather than dropping it on the floor.
  const orphans = useMemo(() => {
    const claimed = new Set(GROUPS.flatMap((g) => g.cats));
    return MARKETING_FEATURES.filter((f) => !claimed.has(f.cat));
  }, []);

  const groupForCategory = (cat) => GROUPS.find((g) => g.cats.includes(cat))?.id || null;

  // Keep the old deep links working: /about#features?cat=Planning opens the
  // group that category now lives in, instead of pointing at a chip that's gone.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const cat = params.get('cat');
    if (cat && MARKETING_FEATURE_CATEGORIES.includes(cat)) {
      const g = groupForCategory(cat);
      if (g) setOpenId(g);
    }
  }, []);

  useEffect(() => {
    const onFilter = (e) => {
      const cat = e?.detail?.category;
      const g = cat ? groupForCategory(cat) : null;
      if (!g) return;
      setOpenId(g);
      document.getElementById('features')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    window.addEventListener('lachart:feature-filter', onFilter);
    return () => window.removeEventListener('lachart:feature-filter', onFilter);
  }, []);

  const renderFeatures = (items) => (
    <div className="lc-feat-list">
      {items.map((f) => (
        <div key={f.title} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <span
            aria-hidden="true"
            style={{
              width: 34, height: 34, borderRadius: 10, flexShrink: 0,
              background: LC.primaryTint, color: LC.primary,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <FeatIcon d={f.icon} />
          </span>
          <div style={{ minWidth: 0 }}>
            <h4 style={{ fontSize: 14.5, fontWeight: 700, color: LC.ink, margin: '5px 0 4px' }}>{f.title}</h4>
            <p style={{ fontSize: 13.5, color: LC.muted, lineHeight: 1.55, margin: 0 }}>{f.body}</p>
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <section id="features">
      <div className="lc-sectpad">
        <div ref={revealRef} className="lc-reveal" style={{ textAlign: 'center', maxWidth: 720, margin: '0 auto 34px' }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: LC.primary, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Platform features
          </span>
          <h2 className="lc-big" style={{ margin: '18px 0 12px' }}>
            From first sample <em>to race day</em>
          </h2>
          <p className="lc-lead" style={{ margin: '0 auto' }}>
            {MARKETING_FEATURES.length} features, grouped by what you're actually trying to do.
            Open the part that matters to you.
          </p>
        </div>

        <div ref={pushRef} className="lc-reveal d1" style={{ maxWidth: 880, margin: '0 auto' }}>
          {GROUPS.map((g, gi) => {
            const items = gi === GROUPS.length - 1
              ? [...(byGroup[g.id] || []), ...orphans]
              : (byGroup[g.id] || []);
            if (!items.length) return null;
            const open = openId === g.id;
            return (
              <div
                key={g.id}
                className="lc-card"
                style={{ marginBottom: 10, overflow: 'hidden', borderColor: open ? LC.primary : undefined }}
              >
                <button
                  type="button"
                  aria-expanded={open}
                  aria-controls={`feat-panel-${g.id}`}
                  onClick={() => setOpenId(open ? null : g.id)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 14,
                    padding: '18px 20px', background: open ? LC.primaryTint : '#fff',
                    border: 'none', cursor: 'pointer', textAlign: 'left', transition: 'background .2s',
                  }}
                >
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 16.5, fontWeight: 750, color: LC.ink }}>
                      {g.title}
                    </span>
                    <span style={{ display: 'block', fontSize: 13.5, color: LC.muted, marginTop: 3, lineHeight: 1.5 }}>
                      {g.promise}
                    </span>
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: LC.primary, flexShrink: 0 }}>
                    {items.length}
                  </span>
                  <svg
                    width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={LC.primary}
                    strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
                    style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}
                    aria-hidden="true"
                  >
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>

                {/* Kept mounted and merely hidden — unmounting on collapse would
                    take the copy out of the page for crawlers. */}
                <div
                  id={`feat-panel-${g.id}`}
                  hidden={!open}
                  style={{ padding: '4px 20px 22px', borderTop: `1px solid ${LC.border}` }}
                >
                  {renderFeatures(items)}
                </div>
              </div>
            );
          })}
        </div>

        <style>{`
          .lc-feat-list {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 18px 26px;
            padding-top: 18px;
          }
          @media (max-width: 720px) {
            .lc-feat-list { grid-template-columns: 1fr; }
          }
        `}</style>
      </div>
    </section>
  );
}
