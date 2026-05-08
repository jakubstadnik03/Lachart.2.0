import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

// Lactate dot — color-coded by mmol/L value
function LactateDot({ value, size = 26, onClick }) {
  let bg, text, border, label;
  if (value == null) {
    bg = '#fff'; text = '#6B7280'; border = '1.5px dashed #E5E7EB'; label = '?';
  } else if (value < 2) {
    bg = '#ECFDF5'; text = '#047857'; border = '1px solid #86EFAC'; label = value.toFixed(1);
  } else if (value < 4) {
    bg = '#FEF3C7'; text = '#92400E'; border = '1px solid #FCD34D'; label = value.toFixed(1);
  } else {
    bg = '#FEE2E2'; text = '#B84238'; border = '1px solid #FDA4AF'; label = value.toFixed(1);
  }
  return (
    <button
      onClick={onClick}
      style={{
        width: size, height: size, borderRadius: '50%', background: bg, border,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: size > 24 ? 9 : 8, fontWeight: 700, color: text,
        flexShrink: 0, cursor: 'pointer', fontVariantNumeric: 'tabular-nums',
      }}
    >
      {label}
    </button>
  );
}

// Sport icon (simple SVG)
function SportIcon({ sport, size = 32 }) {
  const s = String(sport || '').toLowerCase();
  const isBike = s.includes('bike') || s.includes('ride') || s.includes('cycle');
  const isRun  = s.includes('run');
  const isSwim = s.includes('swim');

  const bg = isBike ? '#EEF0F8' : isRun ? '#FFF7ED' : isSwim ? '#EFF6FF' : '#F3F4F6';

  return (
    <div style={{ width: size, height: size, borderRadius: size * 0.3, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <span style={{ fontSize: size * 0.52, lineHeight: 1 }}>
        {isBike ? '🚴' : isRun ? '🏃' : isSwim ? '🏊' : '⚡'}
      </span>
    </div>
  );
}

// Lactate entry sheet (simple inline number input)
function LactateSheet({ interval, onSave, onClose }) {
  const [val, setVal] = useState(interval?.mmol != null ? String(interval.mmol) : '');

  const handleSave = () => {
    const n = parseFloat(val);
    if (!isNaN(n) && n > 0 && n <= 20) onSave(n);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 999, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', background: 'rgba(0,0,0,.4)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ width: '100%', maxWidth: 480, background: '#fff', borderRadius: '20px 20px 0 0', padding: '20px 20px 40px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0A0E1A' }}>Log lactate</div>
            <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>{interval?.label}</div>
          </div>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: '50%', background: '#F3F4F6', border: 'none', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6B7280' }}>✕</button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
          <input
            type="number"
            step="0.1"
            min="0.5"
            max="20"
            value={val}
            onChange={e => setVal(e.target.value)}
            placeholder="0.0"
            autoFocus
            style={{ flex: 1, fontSize: 28, fontWeight: 700, textAlign: 'center', border: '2px solid #E5E7EB', borderRadius: 14, padding: '12px 16px', outline: 'none', color: '#0A0E1A', fontVariantNumeric: 'tabular-nums' }}
          />
          <span style={{ fontSize: 14, fontWeight: 600, color: '#6B7280' }}>mmol/L</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <button onClick={onClose} style={{ padding: '13px 0', borderRadius: 12, background: '#F3F4F6', border: 'none', fontSize: 14, fontWeight: 700, color: '#374151', cursor: 'pointer' }}>Cancel</button>
          <button onClick={handleSave} style={{ padding: '13px 0', borderRadius: 12, background: '#5E6590', border: 'none', fontSize: 14, fontWeight: 700, color: '#fff', cursor: 'pointer' }}>Save</button>
        </div>
      </div>
    </div>
  );
}

export default function TodayCard({ todayActivity, todayPlanned, onLogLactate }) {
  const navigate = useNavigate();
  const [sheetInterval, setSheetInterval] = useState(null);

  const activity = todayActivity;
  const planned  = todayPlanned;
  const hasActivity = !!activity;

  const sport   = activity?.sport || planned?.sport || 'bike';
  const title   = activity?.title || activity?.name || planned?.title || 'No training today';
  const subline = activity
    ? (() => {
        const dur  = Number(activity.duration || activity.movingTime || activity.elapsed_time || 0);
        const dist = Number(activity.distance || activity.totalDistance || 0);
        const pwr  = Number(activity.avgPower || activity.average_watts || 0);
        const parts = [];
        if (dur > 0)  parts.push(`${Math.floor(dur/3600)}h ${String(Math.floor((dur%3600)/60)).padStart(2,'0')}m`);
        if (dist > 0) parts.push(dist >= 1000 ? `${(dist/1000).toFixed(1)} km` : `${Math.round(dist)} m`);
        if (pwr > 0)  parts.push(`${Math.round(pwr)} W`);
        return parts.join(' · ') || 'Completed';
      })()
    : planned
    ? `Plan: ${planned.plannedDuration ? `${Math.round(planned.plannedDuration / 60)} min` : ''}${planned.plannedDistance ? ` · ${planned.plannedDistance} km` : ''}${planned.targetTss ? ` · ${planned.targetTss} TSS` : ''}`
    : 'Rest day';

  // Intervals from the activity's results array
  const intervals = Array.isArray(activity?.results) ? activity.results : [];

  const handleLactateSave = async (intervalId, mmol) => {
    setSheetInterval(null);
    if (onLogLactate) onLogLactate(intervalId, mmol);
  };

  const openActivity = () => {
    if (activity) {
      const id = activity._id || activity.id;
      if (id) navigate(`/training-calendar/${id}`);
    } else if (planned) {
      // open planned workout detail
    }
  };

  return (
    <>
      <div style={styles.card}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: intervals.length ? 12 : 0 }}>
          <SportIcon sport={sport} size={38} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14.5, fontWeight: 700, color: '#0A0E1A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
            <div style={{ fontSize: 11, color: '#6B7280', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{subline}</div>
          </div>
          {hasActivity && (
            <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 9999, background: '#4BA87D22', color: '#047857' }}>Done</span>
          )}
          {!hasActivity && planned && (
            <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 9999, background: '#FF6B4A22', color: '#E85535' }}>Today</span>
          )}
        </div>

        {/* Interval list */}
        {intervals.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
            {intervals.slice(0, 6).map((iv, i) => {
              const mmol = iv.lactate ?? iv.mmol ?? iv.lac ?? null;
              const pwr  = iv.avgPower || iv.targetPower || null;
              const barPct = mmol != null ? Math.min(100, (mmol / 8) * 100) : 0;
              const barColor = mmol == null ? 'transparent'
                : mmol < 2 ? 'linear-gradient(90deg,#86EFAC,#4BA87D)'
                : mmol < 4 ? 'linear-gradient(90deg,#FCD34D,#F59E0B)'
                :             'linear-gradient(90deg,#FDA4AF,#E05347)';

              return (
                <button
                  key={i}
                  onClick={() => setSheetInterval({ ...iv, label: iv.name || iv.label || `Interval ${i + 1}`, mmol })}
                  style={styles.intervalRow}
                >
                  {/* Name */}
                  <span style={{ fontSize: 11.5, fontWeight: 600, color: '#0A0E1A', flex: '0 0 100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'left' }}>
                    {iv.name || iv.label || `Interval ${i + 1}`}
                  </span>
                  {/* Power */}
                  <span style={{ fontSize: 10.5, color: '#6B7280', fontVariantNumeric: 'tabular-nums', minWidth: 40 }}>
                    {pwr ? `${Math.round(pwr)} W` : ''}
                  </span>
                  {/* Bar */}
                  <div style={{ flex: 1, position: 'relative', height: 6, borderRadius: 3, overflow: 'hidden', background: 'rgba(118,126,181,.15)' }}>
                    {mmol != null && (
                      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${barPct}%`, borderRadius: 3, background: barColor, transition: 'width .3s' }} />
                    )}
                  </div>
                  {/* Dot */}
                  <LactateDot value={mmol} size={26} />
                </button>
              );
            })}
          </div>
        )}

        {/* CTA */}
        <button onClick={openActivity} style={styles.cta}>
          {hasActivity ? 'Open training detail' : planned ? 'Open training plan' : 'View calendar'}
          <span style={{ fontSize: 12 }}>→</span>
        </button>
      </div>

      {sheetInterval && (
        <LactateSheet
          interval={sheetInterval}
          onSave={(mmol) => handleLactateSave(sheetInterval._id || sheetInterval.id, mmol)}
          onClose={() => setSheetInterval(null)}
        />
      )}
    </>
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
  intervalRow: {
    display: 'grid',
    gridTemplateColumns: '100px 44px 1fr 28px',
    gap: 8,
    alignItems: 'center',
    padding: '8px 10px',
    borderRadius: 10,
    background: 'rgba(255,255,255,.45)',
    border: '1px solid rgba(255,255,255,.5)',
    fontFamily: 'inherit',
    cursor: 'pointer',
    textAlign: 'left',
  },
  cta: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    padding: '10px 12px',
    borderRadius: 10,
    background: 'rgba(118,126,181,.1)',
    border: '1px solid rgba(118,126,181,.18)',
    fontFamily: 'inherit',
    fontSize: 12,
    fontWeight: 700,
    color: '#5E6590',
    cursor: 'pointer',
    marginTop: 2,
  },
};
