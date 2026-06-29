// Bottom-sheet modal for viewing / editing / deleting a single PlannedWorkout.
// Opens when the user taps a planned (or paired) workout row on NativeDashboardPage.

import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { updatePlannedWorkout, deletePlannedWorkout, exportPlannedWorkout } from '../../services/workoutPlannerApi';
import { SportTile, SPORT_TINT, normSport } from '../native/shared/Tiles';
import { SportGlyph } from '../shared/SportIcon';
import { useCategories } from '../../context/CategoryContext';
import { WorkoutChart } from '../WorkoutPlanner/WorkoutBuilder';
import api from '../../services/api';

/** Total seconds across all steps, respecting repeat groups. */
function planStepSecs(steps) {
  if (!Array.isArray(steps) || steps.length === 0) return 0;
  const visited = new Set();
  let total = 0;
  for (const s of steps) {
    if (!s.groupId) { total += s.durationSeconds || 0; continue; }
    if (visited.has(s.groupId)) continue;
    visited.add(s.groupId);
    const group = steps.filter(x => x.groupId === s.groupId);
    const reps = (group.find(x => x.isGroupHeader)?.groupRepeat) || 1;
    for (const gs of group) total += (gs.durationSeconds || 0) * reps;
  }
  return total;
}

// Local keyframes — sheet slides up, scrim fades in
const SHEET_KEYFRAMES = `
@keyframes ndSheetIn  { from { transform: translateY(100%); } to { transform: translateY(0); } }
@keyframes ndSheetOut { from { transform: translateY(0); }    to { transform: translateY(100%); } }
@keyframes ndScrimIn  { from { opacity: 0; } to { opacity: 1; } }
@keyframes ndScrimOut { from { opacity: 1; } to { opacity: 0; } }
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

/** Server stores metres; legacy builds sometimes wrote km (< 100). */
function planDistanceToDisplay(raw, sport) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return '';
  if (sport === 'swim') return String(Math.round(n));
  const km = n >= 100 ? n / 1000 : n;
  const rounded = Math.round(km * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

function displayDistanceToMetres(str, sport) {
  const n = parseFloat(String(str).replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return null;
  return sport === 'swim' ? Math.round(n) : Math.round(n * 1000);
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
  const navigate = useNavigate();

  // ── Form state ─────────────────────────────────────────────────────────────
  const [title, setTitle]       = useState('');
  const [sport, setSport]       = useState('bike');
  const [date, setDate]         = useState('');
  const [durH, setDurH]         = useState('');
  const [durM, setDurM]         = useState('');
  const [plannedDist, setPlannedDist] = useState('');
  const [targetTss, setTargetTss] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [catOpen, setCatOpen]   = useState(false);
  const { categories, getCategory, getCategoryStyle } = useCategories();
  const [saving, setSaving]     = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError]       = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [closing, setClosing]   = useState(false);

  // Athlete power context: profile zone ranges (primary) + latest test (fallback).
  // WorkoutChart uses cyclingZones to show the same wattage as the Training Zones screen.
  const [athleteCtx, setAthleteCtx] = useState({ ftp: 250, lt1Power: null, lt2Power: null });
  useEffect(() => {
    if (!athleteId) return;
    Promise.all([
      api.get(`/test/list/${athleteId}`).catch(() => ({ data: [] })),
      api.get(`/user/athlete/${athleteId}/profile`).catch(() => ({ data: null })),
    ]).then(([testRes, profileRes]) => {
      // Test-derived thresholds
      const tests = Array.isArray(testRes.data) ? testRes.data : [];
      const sorted = [...tests].sort((a, b) => new Date(b.date) - new Date(a.date));
      const latest = sorted.find(t => t.lt2Power || t.ltPower || t.lt2?.power || t.ftp);

      // Profile zone ranges
      const pz = profileRes.data?.powerZones || {};
      const cyclingZones  = pz.cycling  || null;
      const runningZones  = pz.running  || null;
      const swimmingZones = pz.swimming || null;

      const lt2Power = cyclingZones?.lt2 || cyclingZones?.zone4?.min
        || latest?.lt2Power || latest?.lt2?.power || null;
      const lt1Power = cyclingZones?.lt1 || cyclingZones?.zone3?.min
        || latest?.ltPower  || latest?.lt1Power   || latest?.lt1?.power || null;

      setAthleteCtx({
        ftp:  lt2Power || latest?.ftp || 250,
        lt2Power,
        lt1Power,
        lt2Pace:  runningZones?.lt2  || runningZones?.zone4?.min  || null,
        lt1Pace:  runningZones?.lt1  || runningZones?.zone3?.min  || null,
        cyclingZones,
        runningZones,
        swimmingZones,
      });
    }).catch(() => {});
  }, [athleteId]);

  // Hydrate fields whenever a new workout opens
  useEffect(() => {
    if (!plannedWorkout) return;
    setTitle(plannedWorkout.title || plannedWorkout.name || '');
    const ns = normSport(plannedWorkout.sport || 'bike');
    setSport(ns === 'gym' ? 'strength' : ns);
    setDate(toLocalDateInput(plannedWorkout.date));
    // Prefer explicit plannedDuration; fall back to computing from steps
    const durSecs = Number(plannedWorkout.plannedDuration) || planStepSecs(plannedWorkout.steps);
    const { h, m } = secsToHM(durSecs);
    setDurH(h);
    setDurM(m);
    setPlannedDist(planDistanceToDisplay(plannedWorkout.plannedDistance, ns === 'gym' ? 'strength' : ns));
    setTargetTss(plannedWorkout.targetTss != null ? String(plannedWorkout.targetTss) : '');
    setDescription(plannedWorkout.description || plannedWorkout.notes || '');
    setCategory(plannedWorkout.category || '');
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

  // ── Animated close ─────────────────────────────────────────────────────────
  // doClose() plays the slide-out animation, then calls onClose after 300ms.
  const doClose = useRef(null);
  doClose.current = () => {
    if (closing) return;
    setClosing(true);
    setTimeout(() => { onClose && onClose(); }, 300);
  };

  // ── Swipe-down-to-close ────────────────────────────────────────────────────
  const sheetRef = useRef(null);
  const swipeRef = useRef({ startY: 0, currentY: 0, active: false });

  // Wire non-passive touch listeners directly on the sheet element so we can
  // call preventDefault() to block scroll while the swipe-to-close is active.
  useEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet) return;

    const onStart = (e) => {
      const atTop = sheet.scrollTop <= 0;
      const touchY = e.touches[0].clientY;
      const sheetRect = sheet.getBoundingClientRect();
      const nearTop = (touchY - sheetRect.top) < 60;
      if (!atTop && !nearTop) return;
      swipeRef.current = { startY: touchY, currentY: touchY, active: true };
    };

    const onMove = (e) => {
      if (!swipeRef.current.active) return;
      const dy = e.touches[0].clientY - swipeRef.current.startY;
      if (dy < 0) { swipeRef.current.active = false; return; }
      if (dy < 5) return; // tiny movement — don't commit yet
      swipeRef.current.currentY = e.touches[0].clientY;
      e.preventDefault(); // block iOS rubber-band scroll while sheet is dragging
      sheet.style.transform = `translateY(${Math.min(dy, 300)}px)`;
      sheet.style.transition = 'none';
    };

    const onEnd = () => {
      if (!swipeRef.current.active) return;
      const dy = swipeRef.current.currentY - swipeRef.current.startY;
      swipeRef.current.active = false;
      // Reset inline transform so CSS animation can take over
      sheet.style.transform = '';
      sheet.style.transition = '';
      if (dy > 100) {
        doClose.current();
      }
    };

    sheet.addEventListener('touchstart', onStart, { passive: true });
    sheet.addEventListener('touchmove', onMove, { passive: false });
    sheet.addEventListener('touchend', onEnd, { passive: true });
    sheet.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      sheet.removeEventListener('touchstart', onStart);
      sheet.removeEventListener('touchmove', onMove);
      sheet.removeEventListener('touchend', onEnd);
      sheet.removeEventListener('touchcancel', onEnd);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const isCompleted = !!linkedActivity;
  const tint = SPORT_TINT[sport === 'strength' ? 'gym' : sport] || SPORT_TINT.other;

  // Build chart context: prefer freshly-fetched profile zones + test thresholds
  // so the wattage labels exactly match what the athlete sees on their Training
  // Zones screen. Legacy values stored on the planned workout doc are a fallback.
  const chartContext = {
    ftp:          athleteCtx.ftp          || plannedWorkout?.ftp  || plannedWorkout?.context?.ftp  || 250,
    lt1Power:     athleteCtx.lt1Power     || plannedWorkout?.lt1Power || plannedWorkout?.context?.lt1Power || null,
    lt2Power:     athleteCtx.lt2Power     || plannedWorkout?.lt2Power || plannedWorkout?.context?.lt2Power || null,
    lt1Pace:      athleteCtx.lt1Pace      || plannedWorkout?.lt1Pace  || plannedWorkout?.context?.lt1Pace  || null,
    lt2Pace:      athleteCtx.lt2Pace      || plannedWorkout?.lt2Pace  || plannedWorkout?.context?.lt2Pace  || null,
    cyclingZones: athleteCtx.cyclingZones || plannedWorkout?.cyclingZones || plannedWorkout?.context?.cyclingZones || null,
    runningZones: athleteCtx.runningZones || plannedWorkout?.runningZones || plannedWorkout?.context?.runningZones || null,
    swimmingZones: athleteCtx.swimmingZones || null,
  };

  const hasSteps = Array.isArray(plannedWorkout?.steps) && plannedWorkout.steps.length > 0;

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
        plannedDistance: displayDistanceToMetres(plannedDist, sport),
        targetTss: targetTss !== '' ? Number(targetTss) : null,
        description: description.trim(),
        category: category || null,
      };
      const updated = await updatePlannedWorkout(plannedWorkout._id, payload, athleteId);

      // If the plan is paired with a real activity, mirror the title and
      // category onto it too — the calendar pairs the two and the user
      // expects them to stay in sync. Best-effort, doesn't block the save.
      if (linkedActivity && (linkedActivity.id || linkedActivity._id)) {
        try {
          const actId = String(linkedActivity.id || linkedActivity._id || '');
          const isStrava = !!linkedActivity.stravaId
            || linkedActivity.source === 'strava' || linkedActivity.type === 'strava'
            || actId.startsWith('strava-');
          const isFit = linkedActivity.source === 'fit'
            || linkedActivity.type === 'fit'
            || actId.startsWith('fit-');
          const titleDiffers = payload.title && payload.title !== (linkedActivity.titleManual || linkedActivity.title || linkedActivity.name);
          const catDiffers = payload.category !== (linkedActivity.category || null);
          if (titleDiffers || catDiffers) {
            const actPayload = {};
            if (titleDiffers) {
              if (isStrava) actPayload.title = payload.title; else actPayload.titleManual = payload.title;
            }
            if (catDiffers) actPayload.category = payload.category;
            if (isStrava) {
              const { updateStravaActivity } = await import('../../services/api');
              const rawId = String(linkedActivity.stravaId || actId.replace(/^strava-/, ''));
              await updateStravaActivity(rawId, actPayload);
            } else if (isFit || linkedActivity._id) {
              const { updateFitTraining } = await import('../../services/api');
              const rawId = String(linkedActivity._id || actId.replace(/^fit-/, ''));
              await updateFitTraining(rawId, actPayload);
            }
            try {
              if (titleDiffers) window.dispatchEvent(new CustomEvent('activityTitleUpdated', { detail: { id: actId, title: payload.title } }));
              if (catDiffers)   window.dispatchEvent(new CustomEvent('activityCategoryUpdated', { detail: { id: actId, category: payload.category } }));
            } catch { /* ignore */ }
          }
        } catch (mirrorErr) {
          console.warn('Failed to mirror plan edits to linked activity', mirrorErr);
        }
      }

      onSaved && onSaved(updated);
      try {
        window.dispatchEvent(new CustomEvent('plannedWorkoutUpdated', { detail: { planned: updated } }));
      } catch { /* ignore */ }
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
  // Portal the whole thing into #app-modal-root (z-index 99999 in
  // NativeLayout) so the sheet sits on top of the bottom tab bar instead of
  // hiding behind it.
  const modalRoot = (typeof document !== 'undefined' && document.getElementById('app-modal-root')) || (typeof document !== 'undefined' ? document.body : null);
  if (!modalRoot) return null;

  const content = (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, pointerEvents: 'auto' }}>
      <style>{SHEET_KEYFRAMES}</style>
      {/* Scrim — fades out during close */}
      <div
        onClick={() => doClose.current()}
        style={{
          position: 'absolute', inset: 0,
          background: 'rgba(10,14,26,.45)',
          backdropFilter: 'blur(2px)',
          WebkitBackdropFilter: 'blur(2px)',
          animation: closing
            ? 'ndScrimOut .3s ease forwards'
            : 'ndScrimIn .25s ease both',
        }}
      />

      {/* Bottom sheet — slides out during close */}
      <div
        ref={sheetRef}
        style={{
          position: 'absolute', left: 0, right: 0, bottom: 0,
          background: 'linear-gradient(180deg, rgba(255,255,255,.95), rgba(238,240,244,.98))',
          backdropFilter: 'blur(28px) saturate(170%)',
          WebkitBackdropFilter: 'blur(28px) saturate(170%)',
          borderTopLeftRadius: 22, borderTopRightRadius: 22,
          boxShadow: '0 -10px 32px -8px rgba(10,14,26,.18)',
          paddingBottom: 'env(safe-area-inset-bottom)',
          maxHeight: 'calc(100dvh - env(safe-area-inset-top, 0px) - 12px)',
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          animation: closing
            ? 'ndSheetOut .3s cubic-bezier(.4,0,1,1) forwards'
            : 'ndSheetIn .32s cubic-bezier(.22,1,.36,1) both',
          fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif',
          willChange: 'transform',
        }}
      >
        {/* Drag handle pill — visual indicator */}
        <div style={{ padding: '10px 0 4px', cursor: 'grab' }}>
          <div style={{
            width: 44, height: 4, borderRadius: 9999,
            background: 'rgba(118,126,181,.3)', margin: '0 auto',
          }} />
        </div>

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '12px 18px 8px',
        }}>
          <SportTile sport={sport === 'strength' ? 'gym' : sport} size={36} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: tint, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              {isCompleted ? 'Planned · linked' : 'Planned workout'}
            </div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#0A0E1A', letterSpacing: '-0.01em',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {title || 'Untitled'}
            </div>
          </div>
          {/* Edit in Planner button */}
          <button
            onClick={() => {
              doClose.current();
              setTimeout(() => navigate('/workout-planner', { state: { editWorkout: plannedWorkout } }), 310);
            }}
            style={{
              height: 32, borderRadius: 9999,
              padding: '0 12px',
              background: tint, border: 'none',
              display: 'flex', alignItems: 'center', gap: 5,
              color: '#fff', cursor: 'pointer', fontFamily: 'inherit',
              fontSize: 11, fontWeight: 800, letterSpacing: '0.04em',
              WebkitTapHighlightColor: 'transparent',
              boxShadow: `0 4px 10px -4px ${tint}99`,
            }}
            aria-label="Edit in Planner"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
            Edit
          </button>

          <button
            onClick={() => doClose.current()}
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

        {/* Workout structure chart — shown when the plan has structured steps */}
        {hasSteps && (
          <div style={{ padding: '0 18px 4px' }}>
            <div style={{
              borderRadius: 14,
              background: 'rgba(255,255,255,.7)',
              border: '1px solid rgba(118,126,181,.15)',
              padding: '10px 12px 6px',
              /* overflow must be visible so the hover/tap tooltip can appear above the bars */
              overflow: 'visible',
            }}>
              <div style={{
                fontSize: 9, fontWeight: 800, color: '#9CA3AF',
                letterSpacing: '0.08em', textTransform: 'uppercase',
                marginBottom: 6,
              }}>
                Workout structure
              </div>
              <WorkoutChart steps={plannedWorkout.steps} context={chartContext} />
            </div>
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
              {['bike', 'run', 'swim', 'gym'].map(sp => {
                const on = sport === sp || (sp === 'gym' && (sport === 'strength' || sport === 'gym'));
                const t = SPORT_TINT[sp] || SPORT_TINT.other;
                const label = sp === 'gym' ? 'Gym' : sp.charAt(0).toUpperCase() + sp.slice(1);
                return (
                  <button
                    key={sp}
                    type="button"
                    onClick={() => setSport(sp === 'gym' ? 'strength' : sp)}
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
                    <SportGlyph sport={sp} size={14} color={on ? '#fff' : t} />
                    {label}
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

          {/* Duration (h + m) + planned distance */}
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

            <Field label="Planned distance">
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="—"
                  value={plannedDist}
                  onChange={(e) => setPlannedDist(e.target.value)}
                  style={input}
                />
                <span style={inputUnit}>{sport === 'swim' ? 'm' : 'km'}</span>
              </div>
            </Field>
          </div>

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

          {/* Category */}
          <Field label="Category">
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => setCatOpen(v => !v)}
                style={{
                  ...input,
                  display: 'flex', alignItems: 'center', gap: 8,
                  cursor: 'pointer', textAlign: 'left',
                  ...(category ? (() => { const s = getCategoryStyle(category); return { backgroundColor: s.backgroundColor, color: s.color, borderColor: s.borderColor }; })() : {}),
                }}
              >
                {category ? (
                  <>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: getCategory(category)?.color, flexShrink: 0 }} />
                    <span style={{ fontWeight: 700 }}>{getCategory(category)?.label || category}</span>
                  </>
                ) : (
                  <span style={{ color: '#9aa0b8' }}>No category</span>
                )}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" style={{ marginLeft: 'auto', opacity: 0.6 }}>
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              {catOpen && (
                <div style={{
                  position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 5,
                  background: '#fff', borderRadius: 10, border: '1px solid rgba(118,126,181,.2)',
                  boxShadow: '0 10px 24px -8px rgba(10,14,26,.18)', overflow: 'hidden',
                  maxHeight: 240, overflowY: 'auto',
                }}>
                  <button
                    type="button"
                    onClick={() => { setCategory(''); setCatOpen(false); }}
                    style={{
                      width: '100%', padding: '10px 12px', textAlign: 'left',
                      background: !category ? 'rgba(118,126,181,.08)' : 'transparent',
                      border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13,
                      display: 'flex', alignItems: 'center', gap: 8, color: '#5E6590',
                    }}
                  >
                    <span style={{ width: 10, height: 10, borderRadius: '50%', border: '1px solid #d1d5db', flexShrink: 0 }} />
                    <span>No category</span>
                  </button>
                  {categories.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => { setCategory(c.id); setCatOpen(false); }}
                      style={{
                        width: '100%', padding: '10px 12px', textAlign: 'left',
                        background: category === c.id ? 'rgba(118,126,181,.08)' : 'transparent',
                        border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13,
                        display: 'flex', alignItems: 'center', gap: 8,
                        fontWeight: category === c.id ? 700 : 500,
                      }}
                    >
                      <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: c.color, flexShrink: 0 }} />
                      <span style={{ color: c.color }}>{c.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </Field>

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

          {/* Export to .zwo / .tcx — visible whenever there are structured
              steps. ZWO covers Zwift / TrainerRoad / Wahoo SYSTM; TCX
              covers Garmin Connect + TrainingPeaks. Files trigger the
              system download — on iOS the share-sheet opens so the
              athlete can AirDrop / save to Files / mail it. */}
          {Array.isArray(plannedWorkout?.steps) && plannedWorkout.steps.length > 0 && (
            <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
              {[
                { label: 'Export ZWO', tip: 'Zwift / TrainerRoad', format: 'zwo' },
                { label: 'Export TCX', tip: 'Garmin / TrainingPeaks', format: 'tcx' },
              ].map((b) => (
                <button
                  key={b.format}
                  type="button"
                  onClick={async () => {
                    try {
                      await exportPlannedWorkout(plannedWorkout._id, {
                        format: b.format,
                        athleteId,
                        suggestedName: (plannedWorkout.title || 'workout').replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 50),
                      });
                    } catch (err) {
                      const msg = err?.response?.data?.error || err?.message || 'Export failed';
                      // eslint-disable-next-line no-alert
                      alert(`Export failed: ${msg}`);
                    }
                  }}
                  style={{
                    flex: 1,
                    padding: '9px 8px',
                    borderRadius: 10,
                    border: '1px solid rgba(118,126,181,.22)',
                    background: 'rgba(118,126,181,.06)',
                    color: '#5E6590',
                    fontFamily: 'inherit',
                    fontSize: 11.5,
                    fontWeight: 700,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
                    cursor: 'pointer',
                    WebkitTapHighlightColor: 'transparent',
                    touchAction: 'manipulation',
                  }}
                  title={b.tip}
                >
                  <span>{b.label}</span>
                  <span style={{ fontSize: 9, color: '#9CA3AF', fontWeight: 500 }}>{b.tip}</span>
                </button>
              ))}
            </div>
          )}

          {/* Start workout — primary CTA for not-yet-completed bike plans
              with at least one step. Navigates to the full-screen execution
              page (which now opens to a Tacx-style pre-start hero). */}
          {!linkedActivity && Array.isArray(plannedWorkout?.steps) && plannedWorkout.steps.length > 0 && (
            <button
              type="button"
              onClick={() => {
                const id = plannedWorkout._id;
                if (!id) return;
                const qs = athleteId ? `?athleteId=${athleteId}` : '';
                onClose && onClose();
                navigate(`/workout-execution/${id}${qs}`);
              }}
              style={{
                marginTop: 4,
                width: '100%',
                padding: '13px 14px',
                borderRadius: 14,
                background: 'linear-gradient(135deg,#0EA5E9 0%,#0284C7 100%)',
                border: 'none',
                color: '#fff',
                fontFamily: 'inherit',
                fontSize: 14,
                fontWeight: 800,
                letterSpacing: '0.02em',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                boxShadow: '0 8px 24px -6px rgba(14,165,233,.55)',
                cursor: 'pointer',
                WebkitTapHighlightColor: 'transparent',
                touchAction: 'manipulation',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
              Start Workout
            </button>
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
    </div>
  );

  return ReactDOM.createPortal(content, modalRoot);
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
