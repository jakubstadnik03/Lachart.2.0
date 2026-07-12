import React, { useEffect, useState } from 'react';
import {
  MARKETING_FEATURE_CATEGORIES,
  MARKETING_FEATURES,
  featureCountByCategory,
} from '../../constants/marketingFeatures';

const LC = {
  primary: '#767EB5',
  primaryDark: '#5E6590',
  primaryTint: '#EEF0F8',
  ink: '#0F1729',
  muted: '#6B7280',
  border: 'rgba(180,190,210,.30)',
};

function FeatIcon({ d }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

/**
 * Full filterable feature grid for the About / landing page.
 * Supports deep-link: /about#features?cat=Planning
 */
export default function FeaturesShowcase({ revealRef, pushRef }) {
  const [featCat, setFeatCat] = useState('All');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const cat = params.get('cat');
    if (cat && MARKETING_FEATURE_CATEGORIES.includes(cat)) {
      setFeatCat(cat);
    }
  }, []);

  useEffect(() => {
    const onFilter = (e) => {
      const cat = e?.detail?.category;
      if (cat && MARKETING_FEATURE_CATEGORIES.includes(cat)) {
        setFeatCat(cat);
        document.getElementById('features')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    };
    window.addEventListener('lachart:feature-filter', onFilter);
    return () => window.removeEventListener('lachart:feature-filter', onFilter);
  }, []);

  const filtered = MARKETING_FEATURES.filter((f) => featCat === 'All' || f.cat === featCat);

  return (
    <section id="features">
      <div className="lc-sectpad">
        <div ref={revealRef} className="lc-reveal" style={{ textAlign: 'center', maxWidth: 760, margin: '0 auto 30px' }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: LC.primary, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Platform features
          </span>
          <h2 className="lc-big" style={{ margin: '18px 0 12px' }}>
            Everything in LaChart — <em>{MARKETING_FEATURES.length} features</em>
          </h2>
          <p className="lc-lead" style={{ margin: '0 auto' }}>
            From lactate curve to live workouts, coach workspace and Apple Health — one platform for athletes and coaches.
          </p>
        </div>

        <div
          ref={pushRef}
          className="lc-reveal d1"
          style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginBottom: 24 }}
        >
          {MARKETING_FEATURE_CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setFeatCat(cat)}
              style={{
                padding: '7px 16px',
                borderRadius: 9999,
                cursor: 'pointer',
                background: featCat === cat ? LC.primaryDark : '#fff',
                color: featCat === cat ? '#fff' : LC.muted,
                fontSize: 13,
                fontWeight: 700,
                border: featCat === cat ? 'none' : `1px solid ${LC.border}`,
                transition: 'all .2s',
              }}
            >
              {cat}
              {cat !== 'All' && (
                <span style={{ marginLeft: 6, opacity: 0.75, fontSize: 11 }}>
                  {featureCountByCategory(cat)}
                </span>
              )}
            </button>
          ))}
        </div>

        <div
          ref={pushRef}
          className="lc-reveal d2 lc-feat-grid"
          style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}
        >
          {filtered.map((f) => (
            <article key={f.title + featCat} className="lc-card lc-feat-card" style={{ padding: 22 }}>
              <div
                className="lc-feat-icon"
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 12,
                  background: LC.primaryTint,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: LC.primary,
                  marginBottom: 12,
                }}
              >
                <FeatIcon d={f.icon} />
              </div>
              <span style={{ fontSize: 10.5, fontWeight: 700, color: LC.primary, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {f.cat}
              </span>
              <h4 style={{ fontSize: 15, fontWeight: 700, color: LC.ink, margin: '6px 0 8px' }}>{f.title}</h4>
              <p style={{ fontSize: 13.5, color: LC.muted, lineHeight: 1.55, margin: 0 }}>{f.body}</p>
            </article>
          ))}
        </div>

        <style>{`
          @media (max-width: 900px) { .lc-feat-grid { grid-template-columns: repeat(2, 1fr) !important; } }
          @media (max-width: 540px) { .lc-feat-grid { grid-template-columns: 1fr !important; } }
        `}</style>
      </div>
    </section>
  );
}
