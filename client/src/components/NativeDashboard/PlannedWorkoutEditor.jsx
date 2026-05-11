// Bottom-sheet modal for viewing / editing / deleting a single PlannedWorkout.
// Opens when the user taps a planned (or paired) workout row on NativeDashboardPage.

import React, { useState, useEffect } from 'react';
import { updatePlannedWorkout, deletePlannedWorkout } from '../../services/workoutPlannerApi';
import { SportTile, SPORT_TINT, SPORT_ICONS, normSport } from '../native/shared/Tiles';

// Local keyframes — sheet slides up, scrim fades in
const SHEET_KEYFRAMES = `
@keyframes ndSheetIn  { from { transform: translateY(100%); } to { transform: translateY(0); } }
@keyframes ndScrimIn  { from { opacity: 0; } to { opacity: 1; } }
`;

function toLocalDateInput(d) {
  if (!d) return '';
  const dd = new Date(d);
  if (isNaN(dd)) return '';
  return `${dd.getFullYear()}-${String(dd.getMonth() + 1).padStart(2, '0')}-${String(dd.getDate()).padStart(2, '0')}`;
}

function secsToHM(secs) {
  if (!secs) return { h: '', m: '' };
  const total = Math.round(secs / 60);
  return { h: String(Math.floor(total / 60)), m: String(total % 60) };
}

function hmToSecs(h, m) {
  const hh = Number(h) || 0;
  const mm = Number(m) || 0;
  return (hh * 60 + mm) * 60;
}

export default function PlannedWorkoutEditor({
  plannedWorkout,
  linkedActivity,
  athleteId,
  onClose,
  onSaved,
  onDeleted,
  onOpenLinkedActivity,
}) {
  const isOpen = !!plannedWorkout;

  // ── Form state ─────────────────────────────────────────────────────────────
  const [title, setTitle]       = useState('');
  const [sport, setSport]       = useState('bike');
  const [date, setDate]         = useState('');
  const [durH, setDurH]         = useState('');
  const [durM, setDurM]         = useState('');
  const [targetTss, setTargetTss] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving]     = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError]       = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Hydrate fields whenever a new workout opens
  useEffect(() => {
    if (!plannedWorkout) return;
    setTitle(plannedWorkout.title || plannedWorkout.name || '');
    setSport(normSport(plannedWorkout.sport || 'bike'));
    setDate(toLocalDateInput(plannedWorkout.date));
    const { h, m } = secsToHM(Number(plannedWorkout.plannedDuration) || 0);
    setDurH(h);
    setDurM(m);
    setTargetTss(plannedWorkout.targetTss != null ? String(plannedWorkout.targetTss) : '');
    setDescription(plannedWorkout.description || plannedWorkout.notes || '');
    setError(null);
    setConfirmDelete(false);
  }, [plannedWorkout]);

  // Lock body scroll while open
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [isOpen]);

  if (!isOpen) return null;

  const isCompleted = !!linkedActivity;
  const tint = SPORT_TINT[sport] || SPORT_TINT.other;

  // ── Save / Delete handlers ─────────────────────────────────────────────────
  const handleSave = async () => {
    if (!plannedWorkout?._id) return;
    setSaving(true); setError(null);
    try {
      const payload = {
        title: title.trim() || 'Planned workout',
        sport,
        date,                                    // YYYY-MM-DD
        plannedDuration: hmToSecs(durH, durM),   // seconds
        targetTss: targetTss !== '' ? Number(targetTss) : null,
        description: description.trim(),
      };
      const updated = await updatePlannedWorkout(plannedWorkout._id, payload, athleteId);
      onSaved && onSaved(updated);
      onClose && onClose();
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!plannedWorkout?._id) return;
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setDeleting(true); setError(null);
    try {
      await deletePlannedWorkout(plannedWorkout._id, athleteId);
      onDeleted && onDeleted(plannedWorkout._id);
      onClose && onClose();
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Failed to delete');
      setDeleting(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{SHEET_KEYFRAMES}</style>
      {/* Scrim */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 100,
          background: 'rgba(10,14,26,.45)',
          backdropFilter: 'blur(2px)',
          WebkitBackdropFilter: 'blur(2px)',
          animation: 'ndScrimIn .25s ease both',
        }}
      />

      {/* Bottom sheet */}
      <div
        style={{
          position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 101,
          background: 'linear-gradient(180deg, rgba(255,255,255,.95), rgba(238,240,244,.98))',
          backdropFilter: 'blur(28px) saturate(170%)',
          WebkitBackdropFilter: 'blur(28px) saturate(170%)',
          borderTopLeftRadius: 22, borderTopRightRadius: 22,
          boxShadow: '0 -10px 32px -8px rgba(10,14,26,.18)',
          paddingBottom: 'env(safe-area-inset-bottom)',
          maxHeight: '88vh',
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          animation: 'ndSheetIn .32s cubic-bezier(.22,1,.36,1) both',
          fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif',
        }}
      >
        {/* Drag handle */}
        <div style={{
          width: 44, height: 4, borderRadius: 9999,
          background: 'rgba(118,126,181,.3)', margin: '8px auto 4px',
        }} />

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '12px 18px 8px',
        }}>
          <SportTile sport={sport} size={36} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: tint, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              {isCompleted ? 'Planned · linked' : 'Planned workout'}
            </div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#0A0E1A', letterSpacing: '-0.01em',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {title || 'Untitled'}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 32, height: 32, borderRadius: '50%',
              background: 'rgba(118,126,181,.12)', border: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#5E6590', cursor: 'pointer', fontFamily: 'inherit',
              WebkitTapHighlightColor: 'transparent',
            }}
            aria-label="Close"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
              <line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" />
            </svg>
          </button>
        </div>

        {/* Linked activity quick-open */}
        {isCompleted && (
          <div style={{ padding: '0 18px 8px' }}>
            <button
              onClick={() => { onOpenLinkedActivity && onOpenLinkedActivity(linkedActivity); }}
              style={{
                width: '100%',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                padding: '10px 12px', borderRadius: 12,
                background: 'rgba(34,197,94,.08)',
                border: '1px solid rgba(34,197,94,.25)',
                color: '#15803d',
                fontFamily: 'inherit', fontSize: 12, fontWeight: 700,
                cursor: 'pointer',
                WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Open completed activity
              </span>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>
        )}

        {/* Form fields */}
        <div style={{ padding: '4px 18px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Title */}
          <Field label="Title">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Threshold 4×8'"
              style={input}
            />
          </Field>

          {/* Sport pills */}
          <Field label="Sport">
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {['bike', 'run', 'swim'].map(sp => {
                const on = sport === sp;
                const t = SPORT_TINT[sp];
                const icon = SPORT_ICONS[sp];
                return (
                  <button
                    key={sp}
                    type="button"
                    onClick={() => setSport(sp)}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      padding: '7px 14px 7px 10px', borderRadius: 9999,
                      border: on ? `1.5px solid ${t}` : '1px solid rgba(118,126,181,.2)',
                      background: on ? t : 'rgba(255,255,255,.6)',
                      color: on ? '#fff' : '#6B7280',
                      fontFamily: 'inherit', fontSize: 12, fontWeight: 700,
                      cursor: 'pointer',
                      WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
                      transition: 'background .2s ease, color .2s ease, border-color .2s ease',
                    }}
                  >
                    {icon && (
                      <span style={{
                        width: 14, height: 14, display: 'block',
                        background: on ? '#fff' : t,
                        WebkitMaskImage: `url(${icon})`, maskImage: `url(${icon})`,
                        WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat',
                        WebkitMaskPosition: 'center', maskPosition: 'center',
                        WebkitMaskSize: 'contain', maskSize: 'contain',
                      }} />
                    )}
                    {sp.charAt(0).toUpperCase() + sp.slice(1)}
                  </button>
                );
              })}
            </div>
          </Field>

          {/* Date */}
          <Field label="Date">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              style={input}
            />
          </Field>

          {/* Duration (h + m) + target TSS */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="Duration">
              <div style={{ display: 'flex', gap: 6 }}>
                <div style={{ flex: 1, position: 'relative' }}>
                  <input
                    type="number"
                    inputMode="numeric"
                    min="0"
                    placeholder="0"
                    value={durH}
                    onChange={(e) => setDurH(e.target.value)}
                    style={input}
                  />
                  <span style={inputUnit}>h</span>
                </div>
                <div style={{ flex: 1, position: 'relative' }}>
                  <input
                    type="number"
                    inputMode="numeric"
                    min="0"
                    max="59"
                    placeholder="0"
                    value={durM}
                    onChange={(e) => setDurM(e.target.value)}
                    style={input}
                  />
                  <span style={inputUnit}>m</span>
                </div>
              </div>
            </Field>

            <Field label="Target TSS">
              <input
                type="number"
                inputMode="numeric"
                min="0"
                placeholder="—"
                value={targetTss}
                onChange={(e) => setTargetTss(e.target.value)}
                style={input}
              />
            </Field>
          </div>

          {/* Description */}
          <Field label="Notes">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Workout notes, intervals, intent…"
              rows={3}
              style={{ ...input, resize: 'vertical', minHeight: 64, lineHeight: 1.4, padding: '10px 12px' }}
            />
          </Field>

          {/* Error */}
          {error && (
            <div style={{
              padding: '8px 12px', borderRadius: 10,
              background: '#FEF2F2', border: '1px solid #FECACA',
              color: '#B91C1C', fontSize: 12, fontWeight: 600,
            }}>
              {error}
            </div>
          )}

          {/* Action row */}
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button
              type="button"
              onClick={handleDelete}
              disabled={saving || deleting}
              style={{
                flex: '0 0 auto',
                padding: '11px 14px', borderRadius: 12,
                background: confirmDelete ? '#ef4444' : 'rgba(239,68,68,.1)',
                border: confirmDelete ? '1px solid #ef4444' : '1px solid rgba(239,68,68,.25)',
                color: confirmDelete ? '#fff' : '#ef4444',
                fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700,
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
                WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
                transition: 'background .2s ease, color .2s ease, border-color .2s ease',
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              </svg>
              {confirmDelete ? 'Confirm?' : 'Delete'}
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={saving || deleting}
              style={{
                flex: 1,
                padding: '11px 14px', borderRadius: 12,
                background: '#5E6590',
                border: '1px solid #5E6590',
                color: '#fff',
                fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700,
                cursor: 'pointer',
                opacity: saving ? 0.6 : 1,
                boxShadow: '0 4px 12px -4px rgba(94,101,144,.5)',
                WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
                transition: 'opacity .2s ease, transform .12s ease',
              }}
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Field wrapper ────────────────────────────────────────────────────────────

function Field({ label, children }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <span style={{
        fontSize: 9.5, fontWeight: 800, color: '#6B7280',
        letterSpacing: '0.08em', textTransform: 'uppercase',
      }}>
        {label}
      </span>
      {children}
    </label>
  );
}

const input = {
  width: '100%',
  fontFamily: 'inherit', fontSize: 14, fontWeight: 600,
  color: '#0A0E1A',
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px solid rgba(118,126,181,.22)',
  background: 'rgba(255,255,255,.7)',
  outline: 'none',
  WebkitAppearance: 'none',
  appearance: 'none',
  fontVariantNumeric: 'tabular-nums',
  transition: 'border-color .15s ease, background .15s ease',
};

const inputUnit = {
  position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
  fontSize: 11, fontWeight: 700, color: '#9CA3AF',
  pointerEvents: 'none', letterSpacing: '0.04em', textTransform: 'uppercase',
};
