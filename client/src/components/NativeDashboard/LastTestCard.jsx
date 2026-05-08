import React from 'react';
import { useNavigate } from 'react-router-dom';

function SportIcon({ sport, size = 28 }) {
  const s = String(sport || '').toLowerCase();
  const isBike = s.includes('bike') || s.includes('ride') || s.includes('cycle');
  const isRun  = s.includes('run');
  const isSwim = s.includes('swim');
  const bg    = isBike ? '#EEF0F8' : isRun ? '#FFF7ED' : isSwim ? '#EFF6FF' : '#F3F4F6';
  return (
    <div style={{ width: size, height: size, borderRadius: size * 0.3, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <span style={{ fontSize: size * 0.52, lineHeight: 1 }}>
        {isBike ? '🚴' : isRun ? '🏃' : isSwim ? '🏊' : '⚡'}
      </span>
    </div>
  );
}

function LacValue({ label, value, color }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '8px 12px', borderRadius: 12, background: color + '12', flex: 1 }}>
      <span style={{ fontSize: 9, fontWeight: 700, color: '#6B7280', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{label}</span>
      <span style={{ fontSize: 17, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
        {value != null ? Number(value).toFixed(1) : '—'}
      </span>
      <span style={{ fontSize: 9, color: '#9CA3AF', fontWeight: 600 }}>mmol/L</span>
    </div>
  );
}

export default function LastTestCard({ tests = [] }) {
  const navigate = useNavigate();

  // Find last test — sort by date descending, pick first
  const sorted = [...tests].sort((a, b) => {
    const da = new Date(a.date || a.testDate || 0);
    const db = new Date(b.date || b.testDate || 0);
    return db - da;
  });
  const last = sorted[0];

  if (!last) {
    return (
      <div style={styles.card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={styles.sectionLabel}>Last Lab Test</span>
        </div>
        <div style={{ textAlign: 'center', padding: '18px 0', color: '#9CA3AF', fontSize: 12, fontWeight: 600 }}>No tests recorded yet</div>
      </div>
    );
  }

  const sport   = last.sport || last.testType || 'bike';
  const testDate = new Date(last.date || last.testDate || 0);
  const daysAgo  = Math.floor((Date.now() - testDate) / 86400000);
  const dateStr  = testDate.toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' });

  // Extract LT1/LT2 from results array
  const results = Array.isArray(last.results) ? last.results : [];

  // LT1: first point where lactate >= 2 (or explicit threshold marker)
  // LT2: first point where lactate >= 4 (or explicit threshold)
  const lt1 = last.lt1 ?? last.LT1 ?? last.threshold1 ?? (() => {
    const pt = results.find(r => {
      const lac = r.lactate ?? r.mmol ?? r.lac;
      return lac != null && Number(lac) >= 1.8 && Number(lac) < 3;
    });
    return pt ? (pt.lactate ?? pt.mmol ?? pt.lac) : null;
  })();

  const lt2 = last.lt2 ?? last.LT2 ?? last.threshold2 ?? (() => {
    const pt = results.find(r => {
      const lac = r.lactate ?? r.mmol ?? r.lac;
      return lac != null && Number(lac) >= 3.8;
    });
    return pt ? (pt.lactate ?? pt.mmol ?? pt.lac) : null;
  })();

  // Optional: power/pace at LT1/LT2
  const lt1Power = last.lt1Power ?? last.LT1Power ?? null;
  const lt2Power = last.lt2Power ?? last.LT2Power ?? null;

  const testId = last._id || last.id;

  return (
    <div style={styles.card}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={styles.sectionLabel}>Last Lab Test</span>
        {testId && (
          <button
            onClick={() => navigate(`/lactate-test/${testId}`)}
            style={styles.linkBtn}
          >
            View full curve →
          </button>
        )}
      </div>

      {/* Test meta */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <SportIcon sport={sport} size={32} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0A0E1A' }}>
            {last.title || last.name || `${sport.charAt(0).toUpperCase() + sport.slice(1)} Lactate Test`}
          </div>
          <div style={{ fontSize: 11, color: '#6B7280', marginTop: 1, fontVariantNumeric: 'tabular-nums' }}>
            {dateStr} · {daysAgo === 0 ? 'Today' : daysAgo === 1 ? '1 day ago' : `${daysAgo} days ago`}
          </div>
        </div>
      </div>

      {/* LT1 / LT2 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: lt1Power || lt2Power ? 10 : 0 }}>
        <LacValue label="LT1" value={lt1} color="#4BA87D" />
        <LacValue label="LT2" value={lt2} color="#E05347" />
      </div>

      {/* Power at thresholds (if available) */}
      {(lt1Power || lt2Power) && (
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          {lt1Power != null && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px', borderRadius: 10, background: 'rgba(75,168,125,.08)', border: '1px solid rgba(75,168,125,.18)' }}>
              <span style={{ fontSize: 9.5, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.06em' }}>LT1</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#4BA87D', fontVariantNumeric: 'tabular-nums' }}>{Math.round(lt1Power)} W</span>
            </div>
          )}
          {lt2Power != null && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px', borderRadius: 10, background: 'rgba(224,83,71,.08)', border: '1px solid rgba(224,83,71,.18)' }}>
              <span style={{ fontSize: 9.5, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.06em' }}>LT2</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#E05347', fontVariantNumeric: 'tabular-nums' }}>{Math.round(lt2Power)} W</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const styles = {
  card: {
    background: 'rgba(255,255,255,.65)',
    backdropFilter: 'blur(22px) saturate(170%)',
    WebkitBackdropFilter: 'blur(22px) saturate(170%)',
    border: '1px solid rgba(255,255,255,.7)',
    boxShadow: '0 1px 0 rgba(255,255,255,.7) inset, 0 8px 24px -10px rgba(10,14,26,.08)',
    borderRadius: 18,
    padding: '14px 16px',
  },
  sectionLabel: {
    fontSize: 10.5, fontWeight: 700, color: '#0A0E1A',
    textTransform: 'uppercase', letterSpacing: '0.06em',
  },
  linkBtn: {
    background: 'none', border: 'none', fontFamily: 'inherit',
    fontSize: 11.5, fontWeight: 700, color: '#767EB5',
    cursor: 'pointer', padding: 0,
  },
};
