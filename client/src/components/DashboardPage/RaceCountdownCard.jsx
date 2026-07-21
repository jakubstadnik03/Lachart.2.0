/**
 * RaceCountdownCard — TrainingPeaks-style race planning on the dashboard.
 * Shows the countdown to the next race, its fitness (CTL) target vs the
 * athlete's current fitness, taper hints, and a list of upcoming races.
 */
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { getRaceEvents, createRaceEvent, deleteRaceEvent, updateRaceEvent, getRaceTaperPreview, applyRaceTaper } from '../../services/api';
import { useAuth } from '../../context/AuthProvider';
import { syncRaceLocalNotifications } from '../../utils/raceLocalNotifications';
import { daysUntilRace, recommendedTaperTss, sumWeekPlannedTss } from '../../utils/trainingInsights';
import RaceDetailModal from '../Calendar/RaceDetailModal';

const SPORTS = ['run', 'bike', 'swim', 'triathlon', 'hyrox', 'other'];
const PRIORITY_COLOR = { A: '#E05347', B: '#F59E0B', C: '#599FD0' };

function daysUntil(dateStr) {
  return daysUntilRace(dateStr);
}

function fmtDate(dateStr) {
  return new Date(dateStr).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatForm(tsb) {
  if (tsb == null || Number.isNaN(Number(tsb))) return null;
  const n = Math.round(Number(tsb));
  return n >= 0 ? `+${n}` : `${n}`;
}

function formPillStyle(form) {
  const n = Number(form);
  if (Number.isNaN(n)) return { background: '#F3F4F6', color: '#6B7280', border: '1px solid #E5E7EB' };
  if (n <= -30) return { background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' };
  if (n <= -10) return { background: '#FFF7ED', color: '#EA580C', border: '1px solid #FED7AA' };
  if (n < 10) return { background: '#F3F4F6', color: '#6B7280', border: '1px solid #E5E7EB' };
  return { background: '#F0FDF4', color: '#16A34A', border: '1px solid #BBF7D0' };
}

function FormPill({ form }) {
  const label = formatForm(form);
  if (!label) return null;
  const style = formPillStyle(form);
  return (
    <span
      style={{
        ...style,
        fontSize: 10.5,
        fontWeight: 700,
        borderRadius: 999,
        padding: '2px 8px',
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
    >
      Form {label}
    </span>
  );
}

export default function RaceCountdownCard({
  athleteId,
  currentCTL = null,
  currentForm = null,
  plannedWorkouts = [],
  activities = [],
  userProfile = null,
  editable = true,
  onTaperApplied = null,
}) {
  const { user } = useAuth();
  const [races, setRaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [selectedRace, setSelectedRace] = useState(null);
  const [form, setForm] = useState({ name: '', date: '', sport: 'run', priority: 'A', targetCTL: '' });
  const [saving, setSaving] = useState(false);
  const [taperPreview, setTaperPreview] = useState(null);
  const [taperOpen, setTaperOpen] = useState(false);
  const [taperLoading, setTaperLoading] = useState(false);
  const [taperApplying, setTaperApplying] = useState(false);

  const load = useCallback(async () => {
    try {
      const todayIso = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
      const { data } = await getRaceEvents(athleteId, { from: todayIso });
      const list = Array.isArray(data) ? data : [];
      setRaces(list);
      syncRaceLocalNotifications(list, user?.notifications).catch(() => {});
    } catch {
      setRaces([]);
    } finally {
      setLoading(false);
    }
  }, [athleteId, user?.notifications]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const next = races[0] || null;
  const rest = races.slice(1, 5);
  const days = next ? daysUntil(next.date) : null;

  const hints = useMemo(() => {
    if (!next) return [];
    const out = [];
    if (next.targetCTL != null && currentCTL != null) {
      const gap = Math.round(Number(next.targetCTL) - Number(currentCTL));
      if (gap > 3) out.push({ kind: 'ctl', text: `+${gap} CTL to target` });
      else if (gap < -3) out.push({ kind: 'ctl', text: `CTL ${Math.round(currentCTL)} (target ${Math.round(next.targetCTL)})` });
    }
    if (next.priority === 'A' && days != null && days <= 14 && days >= 0) {
      const weekTss = sumWeekPlannedTss(plannedWorkouts);
      if (weekTss > 0) {
        const rec = recommendedTaperTss(weekTss);
        if (weekTss > rec * 1.1) {
          out.push({ kind: 'taper', text: `Week ${Math.round(weekTss)} TSS → taper ~${rec}` });
        }
      }
    }
    return out;
  }, [next, currentCTL, days, plannedWorkouts]);

  const showTaperCta = next?.priority === 'A' && days != null && days > 0 && days <= 21;

  const openTaperPreview = async () => {
    if (!next?._id) return;
    setTaperOpen(true);
    setTaperLoading(true);
    try {
      const { data } = await getRaceTaperPreview(next._id, athleteId);
      setTaperPreview(data);
    } catch {
      setTaperPreview(null);
    } finally {
      setTaperLoading(false);
    }
  };

  const applyTaper = async () => {
    if (!next?._id) return;
    setTaperApplying(true);
    try {
      await applyRaceTaper(next._id, athleteId, { createPeriod: true });
      setTaperOpen(false);
      setTaperPreview(null);
      onTaperApplied && onTaperApplied();
    } catch {
      /* ignore */
    } finally {
      setTaperApplying(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.date) return;
    setSaving(true);
    try {
      await createRaceEvent(
        {
          name: form.name.trim(),
          date: form.date,
          sport: form.sport,
          priority: form.priority,
          targetCTL: form.targetCTL ? Number(form.targetCTL) : null,
        },
        athleteId
      );
      setForm({ name: '', date: '', sport: 'run', priority: 'A', targetCTL: '' });
      setAdding(false);
      await load();
    } catch {
      /* ignore */
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    try {
      await deleteRaceEvent(id);
      if (String(selectedRace?._id) === String(id)) setSelectedRace(null);
      await load();
    } catch {
      /* ignore */
    }
  };

  const saveRace = async (payload) => {
    if (!selectedRace?._id) return;
    await updateRaceEvent(selectedRace._id, payload);
    setSelectedRace(null);
    await load();
  };

  const raceTapStyle = {
    width: '100%',
    textAlign: 'left',
    background: 'transparent',
    border: 'none',
    padding: 0,
    cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent',
  };

  // Hide the whole card when there are no races (users can add from Calendar).
  if (races.length === 0 && !adding) return null;

  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid #E5E7EB',
        borderRadius: 16,
        padding: '16px 16px 14px',
        boxShadow: '0 1px 2px rgba(15,23,42,.04)',
        overflow: 'hidden',
        minWidth: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span
          style={{
            fontSize: 12,
            fontWeight: 800,
            color: '#0A0E1A',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}
        >
          Upcoming races
        </span>
        {editable && (
          <button
            onClick={() => setAdding((a) => !a)}
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: '#767EB5',
              background: 'transparent',
              border: '1px solid #767EB555',
              borderRadius: 999,
              padding: '3px 10px',
              cursor: 'pointer',
            }}
          >
            {adding ? 'Cancel' : '+ Add race'}
          </button>
        )}
      </div>

      {adding && (
        <form
          onSubmit={submit}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            marginBottom: 12,
            padding: 12,
            background: '#F8F9FC',
            borderRadius: 12,
          }}
        >
          <input
            required
            placeholder="Race name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            style={inputStyle}
          />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              required
              type="date"
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              style={{ ...inputStyle, flex: '1 1 140px', minWidth: 0 }}
            />
            <select
              value={form.sport}
              onChange={(e) => setForm((f) => ({ ...f, sport: e.target.value }))}
              style={{ ...inputStyle, flex: '1 1 120px', minWidth: 0 }}
            >
              {SPORTS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <select
              value={form.priority}
              onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
              style={inputStyle}
            >
              <option value="A">A — goal race</option>
              <option value="B">B race</option>
              <option value="C">C race</option>
            </select>
            <input
              type="number"
              placeholder="Target CTL (optional)"
              value={form.targetCTL}
              onChange={(e) => setForm((f) => ({ ...f, targetCTL: e.target.value }))}
              style={inputStyle}
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: '#fff',
              background: '#767EB5',
              border: 'none',
              borderRadius: 10,
              padding: '8px',
              cursor: 'pointer',
              opacity: saving ? 0.6 : 1,
            }}
          >
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
          <button
            type="button"
            onClick={() => setSelectedRace(next)}
            style={raceTapStyle}
          >
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
              <span style={{ fontSize: 30, fontWeight: 800, color: '#0A0E1A', lineHeight: 1 }}>
                {Math.max(0, days)}
              </span>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#6B7280' }}>
                {days === 0 ? 'race day' : 'days until'}
              </span>
              <span
                style={{
                  marginLeft: 'auto',
                  fontSize: 10,
                  fontWeight: 800,
                  color: '#fff',
                  background: PRIORITY_COLOR[next.priority] || '#767EB5',
                  borderRadius: 6,
                  padding: '2px 7px',
                }}
              >
                {next.priority}
              </span>
            </div>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#0A0E1A' }}>{next.name}</div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                flexWrap: 'wrap',
                marginTop: 4,
                minWidth: 0,
              }}
            >
              <span style={{ fontSize: 11.5, color: '#6B7280' }}>
                {fmtDate(next.date)}
                {next.sport ? ` · ${next.sport}` : ''}
                {next.location ? ` · ${next.location}` : ''}
              </span>
              <FormPill form={currentForm} />
            </div>
            {next.targetCTL != null && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  marginTop: 8,
                  flexWrap: 'wrap',
                  minWidth: 0,
                  fontSize: 12,
                }}
              >
                {currentCTL != null && (
                  <span style={{ color: '#6B7280', whiteSpace: 'nowrap' }}>
                    Fitness <b style={{ color: '#0A0E1A' }}>{Math.round(currentCTL)}</b>
                    <span style={{ margin: '0 3px' }}>→</span>
                  </span>
                )}
                <span style={{ fontWeight: 700, color: '#767EB5', whiteSpace: 'nowrap' }}>
                  Target {Math.round(next.targetCTL)} CTL
                </span>
              </div>
            )}
          </button>
          {hints.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
              {hints.map((h) => (
                <span
                  key={h.kind + h.text}
                  style={{
                    fontSize: 10.5,
                    fontWeight: 700,
                    color: h.kind === 'taper' ? '#B45309' : '#374151',
                    background: h.kind === 'taper' ? '#FFFBEB' : '#F3F4F6',
                    borderRadius: 999,
                    padding: '3px 9px',
                    border: h.kind === 'taper' ? '1px solid #FDE68A' : '1px solid #E5E7EB',
                  }}
                >
                  {h.text}
                </span>
              ))}
            </div>
          )}

          {showTaperCta && editable && (
            <div style={{ marginTop: 12 }}>
              {!taperOpen ? (
                <button
                  type="button"
                  onClick={openTaperPreview}
                  style={{
                    width: '100%',
                    fontSize: 12,
                    fontWeight: 700,
                    color: '#92400E',
                    background: '#FFFBEB',
                    border: '1px solid #FDE68A',
                    borderRadius: 10,
                    padding: '8px 10px',
                    cursor: 'pointer',
                  }}
                >
                  Apply taper to plan
                </button>
              ) : (
                <div style={{ padding: 10, background: '#FFFBEB', borderRadius: 10, border: '1px solid #FDE68A' }}>
                  {taperLoading ? (
                    <div style={{ fontSize: 12, color: '#92400E' }}>Calculating suggestion…</div>
                  ) : taperPreview?.changes?.length ? (
                    <>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#92400E', marginBottom: 6 }}>
                        {taperPreview.summary.workouts} workout(s) · {taperPreview.summary.tssBefore} → {taperPreview.summary.tssAfter} TSS
                      </div>
                      <ul style={{ margin: '0 0 8px', paddingLeft: 16, fontSize: 11, color: '#78350F' }}>
                        {taperPreview.changes.slice(0, 4).map((c) => (
                          <li key={c.id}>
                            {c.date}: {c.title} ({c.before.targetTss || '—'} → {c.after.targetTss || '—'} TSS)
                          </li>
                        ))}
                      </ul>
                      {taperPreview.suggestedPeriod && (
                        <div style={{ fontSize: 10.5, color: '#A16207', marginBottom: 8 }}>
                          + Taper period ({taperPreview.suggestedPeriod.startDate} – {taperPreview.suggestedPeriod.endDate})
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          type="button"
                          disabled={taperApplying}
                          onClick={applyTaper}
                          style={{
                            flex: 1,
                            fontSize: 12,
                            fontWeight: 700,
                            color: '#fff',
                            background: '#D97706',
                            border: 'none',
                            borderRadius: 8,
                            padding: '7px',
                            cursor: 'pointer',
                            opacity: taperApplying ? 0.6 : 1,
                          }}
                        >
                          {taperApplying ? 'Saving…' : 'Reschedule'}
                        </button>
                        <button
                          type="button"
                          onClick={() => { setTaperOpen(false); setTaperPreview(null); }}
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            color: '#92400E',
                            background: 'transparent',
                            border: '1px solid #FDE68A',
                            borderRadius: 8,
                            padding: '7px 12px',
                            cursor: 'pointer',
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </>
                  ) : (
                    <div style={{ fontSize: 12, color: '#92400E' }}>
                      No upcoming planned workouts to adjust — add workouts to the calendar.
                      <button type="button" onClick={() => setTaperOpen(false)} style={{ marginLeft: 8, fontWeight: 700, background: 'none', border: 'none', color: '#B45309', cursor: 'pointer' }}>OK</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {rest.length > 0 && (
            <div
              style={{
                marginTop: 12,
                borderTop: '1px solid #F3F4F6',
                paddingTop: 8,
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
            >
              {rest.map((r) => (
                <div key={r._id} style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  <button
                    type="button"
                    onClick={() => setSelectedRace(r)}
                    style={{
                      ...raceTapStyle,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      flex: 1,
                      minWidth: 0,
                    }}
                  >
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: PRIORITY_COLOR[r.priority] || '#767EB5',
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: '#0A0E1A',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        minWidth: 0,
                        flex: 1,
                        textAlign: 'left',
                      }}
                    >
                      {r.name}
                    </span>
                    <span style={{ fontSize: 11, color: '#9CA3AF', flexShrink: 0, whiteSpace: 'nowrap' }}>
                      {Math.max(0, daysUntil(r.date))}d
                    </span>
                  </button>
                  {editable && (
                    <button
                      onClick={() => remove(r._id)}
                      aria-label="Delete"
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#D1D5DB',
                        cursor: 'pointer',
                        padding: 2,
                        flexShrink: 0,
                        display: 'flex',
                        alignItems: 'center',
                      }}
                    >
                      <XMarkIcon style={{ width: 14, height: 14 }} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {selectedRace && (
        <RaceDetailModal
          race={selectedRace}
          activities={activities}
          plannedWorkouts={plannedWorkouts}
          userProfile={userProfile}
          user={user}
          editable={editable}
          onClose={() => setSelectedRace(null)}
          onSave={saveRace}
          onDelete={() => remove(selectedRace._id)}
        />
      )}
    </div>
  );
}

const inputStyle = {
  fontSize: 13,
  padding: '7px 9px',
  borderRadius: 8,
  border: '1px solid #E5E7EB',
  background: '#fff',
  color: '#0A0E1A',
  fontFamily: 'inherit',
  outline: 'none',
  boxSizing: 'border-box',
  width: '100%',
  maxWidth: '100%',
};
