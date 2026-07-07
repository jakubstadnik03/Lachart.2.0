import React from 'react';
import { MARKETING_FEATURE_CATEGORIES, featureCountByCategory } from '../../constants/marketingFeatures';

const LC = {
  primary: '#767EB5',
  primaryDark: '#5E6590',
  border: 'rgba(180,190,210,.30)',
};

/** Quick category navigator — sits above the fold, links into #features filter. */
export default function FeatureCategoryStrip() {
  const categories = MARKETING_FEATURE_CATEGORIES.filter((c) => c !== 'All');

  const jump = (cat) => {
    window.dispatchEvent(new CustomEvent('lachart:feature-filter', { detail: { category: cat } }));
    if (window.history.replaceState) {
      const url = new URL(window.location.href);
      url.hash = 'features';
      if (cat === 'All') url.searchParams.delete('cat');
      else url.searchParams.set('cat', cat);
      window.history.replaceState({}, '', url);
    }
    document.getElementById('features')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <section id="feature-map" style={{ background: '#fafbff', borderBottom: `1px solid ${LC.border}` }}>
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '28px 24px 32px' }}>
        <div style={{ textAlign: 'center', marginBottom: 18 }}>
          <h2 style={{ fontSize: 'clamp(1.25rem, 3vw, 1.65rem)', fontWeight: 800, color: '#0F1729', margin: '0 0 8px' }}>
            Explore what LaChart can do
          </h2>
          <p style={{ fontSize: 14.5, color: '#6B7280', margin: 0, maxWidth: 520, marginInline: 'auto' }}>
            Tap a category to jump straight to features — testing, planning, integrations, coaching and more.
          </p>
        </div>
        <div
          className="lc-feat-cat-strip"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: 10,
          }}
        >
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => jump(cat)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 16px',
                borderRadius: 14,
                border: `1px solid ${LC.border}`,
                background: '#fff',
                color: LC.primaryDark,
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 1px 3px rgba(15,23,42,.04)',
                transition: 'transform .15s, box-shadow .15s',
              }}
              className="lc-feat-cat-btn"
            >
              {cat}
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  color: LC.primary,
                  background: '#EEF0F8',
                  borderRadius: 999,
                  padding: '2px 8px',
                  minWidth: 22,
                  textAlign: 'center',
                }}
              >
                {featureCountByCategory(cat)}
              </span>
            </button>
          ))}
        </div>
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <a
            href="#features"
            onClick={(e) => {
              e.preventDefault();
              jump('All');
            }}
            style={{ fontSize: 13, fontWeight: 700, color: LC.primary, textDecoration: 'none' }}
          >
            View all {featureCountByCategory('All')} features →
          </a>
        </div>
        <style>{`
          .lc-feat-cat-btn:hover {
            transform: translateY(-1px);
            box-shadow: 0 6px 16px -8px rgba(118,126,181,.45);
          }
        `}</style>
      </div>
    </section>
  );
}
