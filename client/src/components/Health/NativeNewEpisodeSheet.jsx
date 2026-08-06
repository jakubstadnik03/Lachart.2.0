/**
 * NativeNewEpisodeSheet - log an injury or illness, as a native bottom sheet.
 *
 * Same three steps and the same copy as NewEpisodeModal on the web: where it
 * is, then what it is, then the details. Narrowing by body site first keeps the
 * catalogue from being a wall of twenty conditions, and matches how people
 * actually describe the problem ("my Achilles", not "mid-portion tendinopathy").
 *
 * The app never picks the diagnosis for the athlete - it lists what typically
 * affects that site and asks. Anything they choose can be corrected later.
 *
 * Opened from NativeHealthPage.
 */
import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { createEpisode, catalogForBodySite, todayKey } from '../../services/healthApi';

const SHEET_KEYFRAMES = `
@keyframes ndSheetIn  { from { transform: translateY(100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
@keyframes ndSheetOut { from { transform: translateY(0);    opacity: 1; } to { transform: translateY(100%); opacity: 0; } }
@keyframes ndScrimIn  { from { opacity: 0; } to { opacity: 1; } }
@keyframes ndScrimOut { from { opacity: 1; } to { opacity: 0; } }
`;

const SWIPE_THRESHOLD = 90;      // px down to trigger close on slow drag
const SWIPE_VEL_THRESHOLD = 400; // px/s fast flick

const REGION_ORDER = ['general', 'upper', 'trunk', 'hip', 'thigh', 'knee', 'lower_leg', 'ankle', 'foot'];
const REGION_LABELS = {
  general: 'Whole body',
  upper: 'Shoulder / arm',
  trunk: 'Back',
  hip: 'Hip & groin',
  thigh: 'Thigh',
  knee: 'Knee',
  lower_leg: 'Lower leg',
  ankle: 'Ankle',
  foot: 'Foot',
};

const LOAD_RESPONSE_BADGE = {
  rest: { label: 'Needs load taken off', bg: '#FEF2F2', color: '#DC2626' },
  modified_load: { label: 'Train under the threshold', bg: '#FFF7ED', color: '#EA580C' },
  progressive_load: { label: 'Needs loading, not rest', bg: '#F0FDF4', color: '#16A34A' },
};

export default function NativeNewEpisodeSheet({
  open,
  onClose,
  onCreated,
  catalog = [],
  bodySites = [],
  /** Whose injury this is. Null means the signed-in user. Without it a coach
      logging an injury while viewing an athlete files it against their own
      record, and the athlete never sees it. */
  athleteId = null,
}) {
  const [site, setSite] = useState(null);
  const [entry, setEntry] = useState(null);
  const [side, setSide] = useState('n/a');
  const [severity, setSeverity] = useState(2);
  const [diagnosedBy, setDiagnosedBy] = useState('self');
  const [startDate, setStartDate] = useState(todayKey());
  const [diagnosis, setDiagnosis] = useState('');
  const [visibleToCoach, setVisibleToCoach] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Close animation + swipe-down drag state
  const [closing, setClosing] = useState(false);
  const [dragY, setDragY] = useState(0);
  const touchStartYRef = useRef(0);
  const touchStartTimeRef = useRef(0);
  const isDraggingRef = useRef(false);
  const bodyRef = useRef(null);

  // NativeLayout scrolls its own container, so locking document.body alone
  // leaves the page scrolling under the open sheet on iOS.
  useEffect(() => {
    if (!open) return undefined;
    const prevBody = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const scrollEl = document.getElementById('nl-content-scroll');
    const prevScroll = scrollEl?.style.overflow;
    if (scrollEl) scrollEl.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevBody;
      if (scrollEl) scrollEl.style.overflow = prevScroll ?? '';
    };
  }, [open]);

  // Fresh wizard every time the sheet opens - reopening on step 3 of a
  // half-finished episode would be a trap.
  useEffect(() => {
    if (!open) return;
    setClosing(false);
    setDragY(0);
    setSite(null);
    setEntry(null);
    setSide('n/a');
    setSeverity(2);
    setDiagnosedBy('self');
    setStartDate(todayKey());
    setDiagnosis('');
    setVisibleToCoach(false);
    setError(null);
  }, [open]);

  // Each step is a new screenful, so start it at the top rather than wherever
  // the previous step happened to be scrolled to.
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [site, entry]);

  const triggerClose = useCallback(() => {
    if (closing) return;
    setClosing(true);
    setDragY(0);
    setTimeout(() => {
      setClosing(false); // reset so the guard `!open && !closing` evaluates to null
      onClose?.();
    }, 300);
  }, [closing, onClose]);

  // ── Touch handlers (drag handle + header only) ──────────────────────────
  const handleTouchStart = (e) => {
    touchStartYRef.current = e.touches[0].clientY;
    touchStartTimeRef.current = Date.now();
    isDraggingRef.current = true;
    setDragY(0);
  };

  const handleTouchMove = (e) => {
    if (!isDraggingRef.current) return;
    const dy = e.touches[0].clientY - touchStartYRef.current;
    if (dy > 0) {
      setDragY(dy);
      e.preventDefault(); // prevent page scroll while dragging sheet
    }
  };

  const handleTouchEnd = () => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    const dt = (Date.now() - touchStartTimeRef.current) / 1000;
    const vel = dt > 0 ? dragY / dt : 0;
    if (dragY > SWIPE_THRESHOLD || vel > SWIPE_VEL_THRESHOLD) {
      triggerClose();
    } else {
      setDragY(0);
    }
  };

  const grouped = useMemo(() => {
    const map = {};
    for (const s of bodySites) {
      if (!map[s.region]) map[s.region] = [];
      map[s.region].push(s);
    }
    return REGION_ORDER.filter((r) => map[r]?.length).map((r) => ({ region: r, sites: map[r] }));
  }, [bodySites]);

  const options = useMemo(() => {
    const forSite = catalogForBodySite(catalog, site?.id);
    // "Something else" is always offered - a gap in the catalogue must never be
    // a reason someone cannot log what is going on.
    const other = catalog.find((e) => e.id === 'other');
    return forSite.length ? [...forSite, other].filter(Boolean) : catalog;
  }, [catalog, site]);

  const needsSide = site && !['systemic', 'back_lower', 'sacrum', 'pelvis'].includes(site.id);

  const handleCreate = async () => {
    if (!entry) return;
    setSaving(true);
    setError(null);
    try {
      const created = await createEpisode({
        athleteId,
        catalogId: entry.id,
        bodySite: site?.id || entry.bodySites?.[0] || null,
        side: needsSide ? side : 'n/a',
        severity,
        diagnosedBy,
        startDate,
        diagnosis,
        isVisibleToCoach: visibleToCoach,
      });
      onCreated?.(created);
      triggerClose();
    } catch (e) {
      setError(e?.response?.data?.error || e.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  if (!open && !closing) return null;

  const modalRoot = (typeof document !== 'undefined' && document.getElementById('app-modal-root'))
    || (typeof document !== 'undefined' ? document.body : null);
  if (!modalRoot) return null;

  const scrimOpacity = dragY > 0
    ? Math.max(0.05, 0.45 - dragY / 500)
    : (closing ? 0 : 0.45);

  const sheetAnimation = closing
    ? 'ndSheetOut .30s cubic-bezier(.4,0,1,1) both'
    : (dragY === 0 ? 'ndSheetIn .32s cubic-bezier(.22,1,.36,1) both' : 'none');

  const sheetTransform = dragY > 0 ? `translateY(${dragY}px)` : undefined;
  const sheetTransition = dragY > 0 ? 'none' : (closing ? 'none' : 'transform .3s cubic-bezier(.22,1,.36,1)');

  const stepTitle = !site ? 'Where is it?' : !entry ? 'What is it?' : 'Details';

  const content = (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, pointerEvents: 'auto' }}>
      <style>{SHEET_KEYFRAMES}</style>

      {/* Scrim */}
      <div
        onClick={triggerClose}
        style={{
          position: 'absolute', inset: 0,
          background: `rgba(10,14,26,${scrimOpacity.toFixed(2)})`,
          backdropFilter: 'blur(2px)',
          WebkitBackdropFilter: 'blur(2px)',
          animation: closing ? 'ndScrimOut .30s ease both' : 'ndScrimIn .25s ease both',
          transition: dragY > 0 ? 'background .05s linear' : undefined,
        }}
      />

      {/* Sheet - full height, because step 1 is a long list of body sites */}
      <div
        style={{
          position: 'absolute', left: 0, right: 0, bottom: 0,
          top: 'env(safe-area-inset-top, 44px)',
          background: 'linear-gradient(180deg, rgba(255,255,255,.97), rgba(238,240,244,.99))',
          backdropFilter: 'blur(28px) saturate(170%)',
          WebkitBackdropFilter: 'blur(28px) saturate(170%)',
          borderTopLeftRadius: 22, borderTopRightRadius: 22,
          boxShadow: '0 -10px 32px -8px rgba(10,14,26,.18)',
          paddingBottom: 'env(safe-area-inset-bottom)',
          display: 'flex', flexDirection: 'column',
          animation: sheetAnimation,
          transform: sheetTransform,
          transition: sheetTransition,
          fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif',
          willChange: 'transform',
        }}
      >
        {/* Drag handle - touch target for swipe-down */}
        <div
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          style={{ padding: '10px 0 6px', cursor: 'grab', flexShrink: 0, touchAction: 'none' }}
        >
          <div style={{
            width: 44, height: 4, borderRadius: 9999,
            background: 'rgba(118,126,181,.3)', margin: '0 auto',
          }} />
        </div>

        {/* Header - also acts as a drag zone */}
        <div
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '4px 18px 12px',
            borderBottom: '1px solid rgba(118,126,181,.12)',
            flexShrink: 0,
            touchAction: 'none',
            cursor: 'grab',
          }}
        >
          {site && (
            <button
              type="button"
              onClick={() => (entry ? setEntry(null) : setSite(null))}
              onTouchStart={(e) => e.stopPropagation()}
              style={{ ...sx.roundBtn, marginLeft: -4 }}
              aria-label="Back"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
              </svg>
            </button>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 11, fontWeight: 800, color: '#5E6590',
              letterSpacing: '0.06em', textTransform: 'uppercase',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {site ? site.label : 'Injury or illness'}
            </div>
            <div style={{
              fontSize: 17, fontWeight: 800, color: '#0A0E1A',
              letterSpacing: '-0.02em', marginTop: 1,
            }}>
              {stepTitle}
            </div>
          </div>
          <button
            type="button"
            onClick={triggerClose}
            onTouchStart={(e) => e.stopPropagation()}
            style={sx.roundBtn}
            aria-label="Close"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
              <line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" />
            </svg>
          </button>
        </div>

        {/* Scrollable body */}
        <div
          ref={bodyRef}
          style={{
            flex: 1, minHeight: 0,
            overflowY: 'auto',
            WebkitOverflowScrolling: 'touch',
            overscrollBehavior: 'contain',
            touchAction: 'pan-y',
            padding: '14px 18px calc(20px + env(safe-area-inset-bottom))',
          }}
        >
          {/* Step 1 - body site */}
          {!site && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {grouped.map(({ region, sites }) => (
                <div key={region}>
                  <div style={sx.groupLabel}>{REGION_LABELS[region] || region}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {sites.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setSite(s)}
                        style={sx.tileBtn}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Step 2 - condition */}
          {site && !entry && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {options.map((e) => {
                const badge = LOAD_RESPONSE_BADGE[e.loadResponse];
                return (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => setEntry(e)}
                    style={{
                      width: '100%', textAlign: 'left',
                      padding: '13px 14px', borderRadius: 14,
                      background: 'rgba(255,255,255,.7)',
                      border: '1px solid rgba(118,126,181,.2)',
                      fontFamily: 'inherit', cursor: 'pointer',
                      WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#0A0E1A', minWidth: 0 }}>
                        {e.label}
                      </div>
                      {badge && (
                        <span style={{
                          flexShrink: 0, whiteSpace: 'nowrap',
                          fontSize: 9.5, fontWeight: 800,
                          padding: '3px 8px', borderRadius: 9999,
                          background: badge.bg, color: badge.color,
                        }}>
                          {badge.label}
                        </span>
                      )}
                    </div>
                    {e.summary && (
                      <div style={{ fontSize: 12, color: '#6B7280', marginTop: 5, lineHeight: 1.45 }}>
                        {e.summary}
                      </div>
                    )}
                  </button>
                );
              })}
              <p style={{ fontSize: 12, color: '#6B7280', lineHeight: 1.5, marginTop: 6 }}>
                Not sure which one? Pick the closest, you can change it later. If you have not had it
                looked at and it is not settling, a diagnosis is worth more than any plan this app can
                build.
              </p>
            </div>
          )}

          {/* Step 3 - details */}
          {site && entry && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div style={{
                background: 'rgba(118,126,181,.07)', borderRadius: 14, padding: '12px 14px',
              }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#0A0E1A' }}>{entry.label}</div>
                <div style={{ fontSize: 12, color: '#6B7280', marginTop: 4, lineHeight: 1.45 }}>
                  {entry.summary}
                </div>
              </div>

              {entry.requiresMedicalClearance && (
                <div style={sx.warnRed}>
                  This site needs imaging and medical supervision. The app will track your symptoms
                  and cross-training, but it will not build you a return-to-running plan without a
                  clinician&apos;s clearance.
                </div>
              )}

              {needsSide && (
                <div>
                  <div style={sx.question}>Side</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {[['L', 'Left'], ['R', 'Right'], ['bilateral', 'Both']].map(([v, label]) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setSide(v)}
                        style={{ ...sx.choiceBtn, ...(side === v ? sx.choiceBtnOn : null), flex: 1 }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <div style={sx.question}>How bad is it?</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {[
                    [1, 'A niggle'],
                    [2, 'Affects training'],
                    [3, 'Stops training'],
                    [4, 'Affects daily life'],
                  ].map(([v, label]) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setSeverity(v)}
                      style={{ ...sx.choiceBtn, ...(severity === v ? sx.choiceBtnOn : null) }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div style={sx.question}>Who identified it?</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {[
                    ['self', 'Just me'],
                    ['physio', 'Physio'],
                    ['doctor', 'Doctor'],
                    ['imaging', 'Scan / imaging'],
                  ].map(([v, label]) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setDiagnosedBy(v)}
                      style={{ ...sx.choiceBtn, ...(diagnosedBy === v ? sx.choiceBtnOn : null) }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div style={sx.question}>When did it start?</div>
                <input
                  type="date"
                  value={startDate}
                  max={todayKey()}
                  onChange={(e) => setStartDate(e.target.value)}
                  style={{ ...sx.input, width: 'auto', minWidth: 170 }}
                />
              </div>

              <div>
                <div style={sx.question}>
                  Diagnosis or notes <span style={{ fontWeight: 600, color: '#9CA3AF' }}>(optional)</span>
                </div>
                <textarea
                  value={diagnosis}
                  onChange={(e) => setDiagnosis(e.target.value)}
                  rows={3}
                  placeholder="What the physio said, scan results, anything useful"
                  style={{ ...sx.input, resize: 'none' }}
                />
              </div>

              <button
                type="button"
                onClick={() => setVisibleToCoach((v) => !v)}
                style={{
                  width: '100%', textAlign: 'left',
                  display: 'flex', alignItems: 'flex-start', gap: 12,
                  padding: '13px 13px', borderRadius: 12,
                  background: visibleToCoach ? 'rgba(118,126,181,.10)' : 'rgba(255,255,255,.7)',
                  border: `1px solid ${visibleToCoach ? 'rgba(118,126,181,.35)' : 'rgba(118,126,181,.18)'}`,
                  fontFamily: 'inherit', cursor: 'pointer',
                  WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
                }}
              >
                <span style={{
                  width: 22, height: 22, borderRadius: 7, flexShrink: 0, marginTop: 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: visibleToCoach ? '#5E6590' : 'transparent',
                  border: `1.5px solid ${visibleToCoach ? '#5E6590' : 'rgba(118,126,181,.4)'}`,
                }}>
                  {visibleToCoach && (
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="#fff" strokeWidth="2.4">
                      <path d="M2 6l3 3 5-6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700, color: '#0A0E1A' }}>
                    Share with my coach
                  </span>
                  <span style={{ display: 'block', fontSize: 11.5, color: '#6B7280', marginTop: 3, lineHeight: 1.45 }}>
                    They see the stage and your symptom trend. Private notes stay private either way.
                  </span>
                </span>
              </button>

              <p style={{ fontSize: 11.5, color: '#9CA3AF', lineHeight: 1.5 }}>
                LaChart is a training log, not a medical device. It does not diagnose anything and
                cannot replace a physiotherapist or doctor.
              </p>

              {error && <div style={sx.warnRed}>{error}</div>}

              <button
                type="button"
                onClick={handleCreate}
                disabled={saving}
                style={{
                  width: '100%',
                  padding: '14px 16px', borderRadius: 14,
                  background: '#5E6590', border: '1px solid #5E6590',
                  color: '#fff',
                  fontFamily: 'inherit', fontSize: 14, fontWeight: 800,
                  cursor: 'pointer', opacity: saving ? 0.6 : 1,
                  boxShadow: '0 4px 12px -4px rgba(94,101,144,.5)',
                  WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
                  transition: 'opacity .2s ease',
                }}
              >
                {saving ? 'Saving…' : 'Start tracking'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return ReactDOM.createPortal(content, modalRoot);
}

// ── Module-local styles ───────────────────────────────────────────────────
// `input` sits at 14px because anything smaller triggers iOS focus-zoom, and
// there is no keyboard-avoidance layer to recover from it.

const sx = {
  roundBtn: {
    width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
    background: 'rgba(118,126,181,.12)', border: 'none',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: '#5E6590', cursor: 'pointer', fontFamily: 'inherit',
    WebkitTapHighlightColor: 'transparent',
  },
  question: {
    fontSize: 13.5, fontWeight: 700, color: '#0A0E1A',
    marginBottom: 9, lineHeight: 1.35,
  },
  groupLabel: {
    fontSize: 9.5, fontWeight: 800, color: '#6B7280',
    letterSpacing: '0.08em', textTransform: 'uppercase',
    marginBottom: 8,
  },
  tileBtn: {
    padding: '14px 12px', borderRadius: 12,
    background: 'rgba(255,255,255,.7)',
    border: '1px solid rgba(118,126,181,.2)',
    color: '#0A0E1A', textAlign: 'left',
    fontFamily: 'inherit', fontSize: 13.5, fontWeight: 600,
    cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
  },
  choiceBtn: {
    padding: '13px 10px', borderRadius: 12,
    background: 'rgba(255,255,255,.7)',
    border: '1px solid rgba(118,126,181,.22)',
    color: '#3F456B',
    fontFamily: 'inherit', fontSize: 13.5, fontWeight: 700,
    cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
    transition: 'background .15s ease, color .15s ease',
  },
  choiceBtnOn: {
    background: '#5E6590', border: '1px solid #5E6590', color: '#fff',
  },
  input: {
    width: '100%',
    fontFamily: 'inherit', fontSize: 14, fontWeight: 600,
    color: '#0A0E1A',
    padding: '11px 12px',
    borderRadius: 10,
    border: '1px solid rgba(118,126,181,.22)',
    background: 'rgba(255,255,255,.8)',
    outline: 'none',
    WebkitAppearance: 'none',
    appearance: 'none',
  },
  warnRed: {
    fontSize: 12.5, lineHeight: 1.5, color: '#B91C1C',
    background: '#FEF2F2', border: '1px solid #FECACA',
    borderRadius: 12, padding: '11px 13px',
  },
};
