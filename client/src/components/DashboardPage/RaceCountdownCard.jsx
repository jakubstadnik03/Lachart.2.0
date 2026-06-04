/**
 * RaceCountdownCard — TrainingPeaks-style race planning on the dashboard.
 * Shows the countdown to the next race, its fitness (CTL) target vs the
 * athlete's current fitness, and a list of upcoming races. Coaches can plan
 * races for an athlete by passing that athlete's id.
 *
 * Used on both the web dashboard and the native dashboard.
 */
import React, { useEffect, useState, useCallback } from 'react';
import { getRaceEvents, createRaceEvent, deleteRaceEvent } from '../../services/api';

const SPORTS = ['run', 'bike', 'swim', 'triathlon', 'hyrox', 'other'];
const PRIORITY_COLOR = { A: '#E05347', B: '#F59E0B', C: '#599FD0' };

function daysUntil(dateStr) {
  const d = new Date(dateStr);
  const today = new Date();
  d.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  return Math.round((d - today) / 86400000);
}

function fmtDate(dateStr) {
  return new Date(dateStr).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function RaceCountdownCard({ athleteId, currentCTL = null, editable = true }) {
  const [races, setRaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', date: '', sport: 'run', priority: 'A', targetCTL: '' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const todayIso = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
      const { data } = await getRaceEvents(athleteId, { from: todayIso });
      setRaces(Array.isArray(data) ? data : []);
    } catch { setRaces([]); }
    finally { setLoading(false); }
  }, [athleteId]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  const next = races[0] || null;
  const rest = races.slice(1, 5);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.date) return;
    setSaving(true);
    try {
      await createRaceEvent({
        name: form.name.trim(),
        date: form.date,
        sport: form.sport,
        priority: form.priority,
        targetCTL: form.targetCTL ? Number(form.targetCTL) : null,
      }, athleteId);
      setForm({ name: '', date: '', sport: 'run', priority: 'A', targetCTL: '' });
      setAdding(false);
      await load();
    } catch { /* ignore */ }
    finally { setSaving(false); }
  };

  const remove = async (id) => {
    try { await deleteRaceEvent(id); await load(); } catch { /* ignore */ }
  };

  return (
    <div style={{
      background: '#fff', border: '1px solid #E5E7EB', borderRadius: 16,
      padding: '16px 16px 14px', boxShadow: '0 1px 2px rgba(15,23,42,.04)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: '#0A0E1A', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          Upcoming races
        </span>
        {editable && (
          <button onClick={() => setAdding(a => !a)}
            style={{ fontSize: 12, fontWeight: 700, color: '#767EB5', background: 'transparent',
              border: '1px solid #767EB555', borderRadius: 999, padding: '3px 10px', cursor: 'pointer' }}>
            {adding ? 'Cancel' : '+ Add race'}
          </button>
        )}
      </div>

      {adding && (
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12,
          padding: 12, background: '#F8F9FC', borderRadius: 12 }}>
          <input required placeholder="Race name" value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            style={inputStyle} />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input required type="date" value={form.date}
              onChange={e => setForm(f => ({ ...f, date: e.target.value }))} style={{ ...inputStyle, flex: 1 }} />
            <select value={form.sport} onChange={e => setForm(f => ({ ...f, sport: e.target.value }))} style={{ ...inputStyle, flex: 1 }}>
              {SPORTS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))} style={{ ...inputStyle, flex: 1 }}>
              <option value="A">A — goal race</option>
              <option value="B">B race</option>
              <option value="C">C race</option>
            </select>
            <input type="number" placeholder="Target CTL" value={form.targetCTL}
              onChange={e => setForm(f => ({ ...f, targetCTL: e.target.value }))} style={{ ...inputStyle, flex: 1 }} />
          </div>
          <button type="submit" disabled={saving}
            style={{ fontSize: 13, fontWeight: 700, color: '#fff', background: '#767EB5', border: 'none',
              borderRadius: 10, padding: '8px', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Saving…' : 'Add race'}
          </button>
        </form>
      )}

      {loading ? (
        <div style={{ fontSize: 12, color: '#9CA3AF', padding: '8px 0' }}>Loading…</div>
      ) : !next ? (
        <div style={{ fontSize: 12.5, color: '#9CA3AF', padding: '6px 0' }}>
          No races planned. {editable ? 'Add one to see your countdown.' : ''}
        </div>
      ) : (
        <>
          {/* Hero: next race countdown */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
            <span style={{ fontSize: 30, fontWeight: 800, color: '#0A0E1A', lineHeight: 1 }}>
              {Math.max(0, daysUntil(next.date))}
            </span>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#6B7280' }}>
              {daysUntil(next.date) === 0 ? 'race day' : `days until`}
            </span>
            <span style={{
              marginLeft: 'auto', fontSize: 10, fontWeight: 800, color: '#fff',
              background: PRIORITY_COLOR[next.priority] || '#767EB5', borderRadius: 6, padding: '2px 7px',
            }}>{next.priority}</span>
          </div>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#0A0E1A' }}>{next.name}</div>
          <div style={{ fontSize: 11.5, color: '#6B7280', marginTop: 1 }}>
            {fmtDate(next.date)}{next.sport ? ` · ${next.sport}` : ''}{next.location ? ` · ${next.location}` : ''}
          </div>
          {next.targetCTL != null && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
              {currentCTL != null && (
                <span style={{ fontSize: 12, color: '#6B7280' }}>
                  Fitness <b style={{ color: '#0A0E1A' }}>{Math.round(currentCTL)}</b>
                  <span style={{ margin: '0 4px' }}>→</span>
                </span>
              )}
              <span style={{ fontSize: 12, fontWeight: 700, color: '#767EB5' }}>
                Target {Math.round(next.targetCTL)} CTL
              </span>
            </div>
          )}

          {/* Upcoming list */}
          {rest.length > 0 && (
            <div style={{ marginTop: 12, borderTop: '1px solid #F3F4F6', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {rest.map(r => (
                <div key={r._id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: PRIORITY_COLOR[r.priority] || '#767EB5', flexShrink: 0 }} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#0A0E1A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                  <span style={{ fontSize: 11, color: '#9CA3AF', marginLeft: 'auto', flexShrink: 0 }}>{Math.max(0, daysUntil(r.date))}d</span>
                  {editable && (
                    <button onClick={() => remove(r._id)} aria-label="Delete"
                      style={{ background: 'transparent', border: 'none', color: '#D1D5DB', cursor: 'pointer', fontSize: 13, padding: 2 }}>×</button>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

const inputStyle = {
  fontSize: 13, padding: '7px 9px', borderRadius: 8, border: '1px solid #E5E7EB',
  background: '#fff', color: '#0A0E1A', fontFamily: 'inherit', outline: 'none',
};
