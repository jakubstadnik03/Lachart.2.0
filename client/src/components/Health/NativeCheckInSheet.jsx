/**
 * NativeCheckInSheet - the daily symptom report, as a native bottom sheet.
 *
 * Same questions, same rules and (near enough) the same copy as
 * HealthCheckInModal on the web. Only the chrome changes.
 *
 * The default view is ONE question: the hallmark metric the catalogue defines
 * for this injury. A gate reasoning from three-day-old data is worse than no
 * gate at all, so this has to be a few taps on a phone held one-handed.
 *
 * Red flags are the exception - always visible, because the whole point of
 * asking is to catch the day someone should stop using the app and call a
 * clinician.
 *
 * Opened from NativeHealthPage.
 */
import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { saveCheckIn, todayKey } from '../../services/healthApi';

const SHEET_KEYFRAMES = `
@keyframes ndSheetIn  { from { transform: translateY(100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
@keyframes ndSheetOut { from { transform: translateY(0);    opacity: 1; } to { transform: translateY(100%); opacity: 0; } }
@keyframes ndScrimIn  { from { opacity: 0; } to { opacity: 1; } }
@keyframes ndScrimOut { from { opacity: 1; } to { opacity: 0; } }
`;

const SWIPE_THRESHOLD = 90;      // px down to trigger close on slow drag
const SWIPE_VEL_THRESHOLD = 400; // px/s fast flick

const PAIN_BANDS = [
  { max: 2, label: 'Aware of it', color: '#16A34A', bg: '#F0FDF4' },
  { max: 5, label: 'Changes how I move', color: '#EA580C', bg: '#FFF7ED' },
  { max: 10, label: 'Have to stop', color: '#DC2626', bg: '#FEF2F2' },
];

/**
 * Illness symptoms, grouped by the neck check - the rule that decides whether
 * easy training is reasonable at all. Anything in the second group means stop,
 * so the grouping is the advice, not just a layout choice.
 */
const SYMPTOMS_ABOVE_NECK = [
  { id: 'runny_nose', label: 'Runny nose / sneezing' },
  { id: 'sore_throat', label: 'Sore throat' },
];
const SYMPTOMS_BELOW_NECK = [
  { id: 'chest', label: 'Chest tightness or deep cough' },
  { id: 'body_aches', label: 'Body aches' },
  { id: 'gi', label: 'Stomach / gut' },
  { id: 'fever', label: 'Fever or chills' },
  { id: 'fatigue', label: 'Unusual fatigue' },
];

export default function NativeCheckInSheet({
  open,
  onClose,
  onSaved,
  episode,
  catalogEntry,
  functionalTests = {},
  trigger = 'daily',
}) {
  const isIllness = catalogEntry?.kind === 'illness';
  const hallmark = catalogEntry?.hallmark;

  // Backfilling is a first-class case: people log an injury after the fact and
  // then want to enter the week they have already lived through. The server
  // refuses a future date or one before onset, so the bounds here match it.
  const [date, setDate] = useState(todayKey());
  const [hallmarkValue, setHallmarkValue] = useState(null);
  const [painNow, setPainNow] = useState(null);
  const [painDuringSession, setPainDuringSession] = useState(null);
  const [painNextMorning, setPainNextMorning] = useState(null);
  const [limping, setLimping] = useState(false);
  const [nightPain, setNightPain] = useState(false);
  const [painAtRest, setPainAtRest] = useState(false);
  const [swelling, setSwelling] = useState(false);
  const [redFlags, setRedFlags] = useState([]);
  const [temperatureC, setTemperatureC] = useState('');
  const [symptoms, setSymptoms] = useState([]);
  const [confidence, setConfidence] = useState(null);
  const [tests, setTests] = useState({});
  const [note, setNote] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Close animation + swipe-down drag state
  const [closing, setClosing] = useState(false);
  const [dragY, setDragY] = useState(0);
  const touchStartYRef = useRef(0);
  const touchStartTimeRef = useRef(0);
  const isDraggingRef = useRef(false);

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

  useEffect(() => {
    if (open) { setClosing(false); setDragY(0); }
  }, [open]);

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

  // Field tests only matter when the current stage gate actually asks for them.
  const stage = catalogEntry?.stages?.[episode?.currentStageIndex ?? 0];
  const gateTests = useMemo(() => {
    const ids = (stage?.gateOut?.tests || []).map((t) => t.test);
    return ids.map((id) => functionalTests[id]).filter(Boolean);
  }, [stage, functionalTests]);

  const toggleRedFlag = (id) => {
    setRedFlags((prev) => (prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]));
  };

  const toggleSymptom = (id) => {
    setSymptoms((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  };

  // The neck check, computed rather than asked: nothing below the neck and no
  // fever means easy training is usually reasonable.
  const belowNeck = symptoms.some((s) => SYMPTOMS_BELOW_NECK.some((x) => x.id === s));
  const feverish = symptoms.includes('fever') || Number(temperatureC) >= 38;

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        date,
        trigger,
        hallmarkValue,
        painNow,
        painDuringSession,
        painNextMorning,
        limping,
        nightPain,
        painAtRest,
        swelling,
        redFlagsReported: redFlags,
        confidence,
        temperatureC: temperatureC === '' ? null : Number(temperatureC),
        symptoms,
        aboveNeckOnly: isIllness ? !belowNeck && !feverish : null,
        // Inputs hand back strings, and an empty one must not reach Mongoose as
        // '' or the whole check-in fails to cast. Numbers or nothing.
        functionalTests: Object.values(tests)
          .filter((t) => t?.test)
          .map((t) => {
            const num = (v) => (v === '' || v == null || Number.isNaN(Number(v)) ? null : Number(v));
            return {
              test: t.test,
              left: num(t.left),
              right: num(t.right),
              value: num(t.value),
              painDuring: num(t.painDuring),
            };
          })
          .filter((t) => t.left != null || t.right != null || t.value != null || t.painDuring != null),
        note,
      };
      const result = await saveCheckIn(episode._id, payload);
      onSaved?.(result);
      triggerClose();
    } catch (e) {
      setError(e?.response?.data?.error || e.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const canSave = hallmarkValue != null || painNow != null || redFlags.length > 0
    || symptoms.length > 0;

  if ((!open && !closing) || !episode || !catalogEntry) return null;

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

      {/* Sheet */}
      <div
        style={{
          position: 'absolute', left: 0, right: 0, bottom: 0,
          maxHeight: 'calc(100dvh - env(safe-area-inset-top, 0px) - 12px)',
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
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
            padding: '4px 18px 12px',
            borderBottom: '1px solid rgba(118,126,181,.12)',
            flexShrink: 0,
            touchAction: 'none',
            cursor: 'grab',
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{
              fontSize: 11, fontWeight: 800, color: '#5E6590',
              letterSpacing: '0.06em', textTransform: 'uppercase',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {catalogEntry.shortLabel || catalogEntry.label}
              {episode.side && episode.side !== 'n/a' ? ` · ${episode.side}` : ''}
            </div>
            <div style={{
              fontSize: 17, fontWeight: 800, color: '#0A0E1A',
              letterSpacing: '-0.02em', marginTop: 1,
            }}>
              Check-in
            </div>
            <label
              onTouchStart={(e) => e.stopPropagation()}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 6 }}
            >
              <input
                type="date"
                value={date}
                min={episode?.startDate || undefined}
                max={todayKey()}
                onChange={(e) => setDate(e.target.value || todayKey())}
                style={{
                  fontSize: 14, padding: '5px 8px', borderRadius: 9,
                  border: '1px solid rgba(118,126,181,.28)',
                  background: 'rgba(255,255,255,.65)', color: '#0A0E1A',
                }}
              />
              {date !== todayKey() && (
                <span style={{
                  fontSize: 10.5, fontWeight: 700, color: '#92400E',
                  background: '#FEF3C7', borderRadius: 999, padding: '3px 8px', whiteSpace: 'nowrap',
                }}>
                  Past day
                </span>
              )}
            </label>
          </div>
          <button
            type="button"
            onClick={triggerClose}
            onTouchStart={(e) => e.stopPropagation()}
            style={{
              width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
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

        {/* Scrollable body. The save button lives at the end of it rather than
            pinned to the bottom - there is no keyboard-avoidance layer, so a
            pinned button would sit under the keyboard on the note field. */}
        <div
          style={{
            flex: 1, minHeight: 0,
            overflowY: 'auto',
            WebkitOverflowScrolling: 'touch',
            overscrollBehavior: 'contain',
            touchAction: 'pan-y',
            padding: '14px 18px calc(20px + env(safe-area-inset-bottom))',
            display: 'flex', flexDirection: 'column', gap: 20,
          }}
        >
          {/* The one question that matters for this tissue. */}
          {hallmark && (
            <div>
              <div style={sx.question}>{hallmark.prompt}</div>
              {hallmark.kind === 'scale' ? (
                <PainScale value={hallmarkValue} onChange={setHallmarkValue} />
              ) : (
                <OptionPicker
                  options={hallmark.options || []}
                  value={hallmarkValue}
                  onChange={setHallmarkValue}
                />
              )}
            </div>
          )}

          {isIllness && (
            <>
              <div>
                <div style={sx.question}>What have you got?</div>
                <div style={sx.groupLabel}>Above the neck</div>
                <div style={sx.stack}>
                  {SYMPTOMS_ABOVE_NECK.map((s) => (
                    <Toggle
                      key={s.id}
                      checked={symptoms.includes(s.id)}
                      onChange={() => toggleSymptom(s.id)}
                      label={s.label}
                    />
                  ))}
                </div>
                <div style={{ ...sx.groupLabel, marginTop: 14 }}>
                  Below the neck - these mean no training
                </div>
                <div style={sx.stack}>
                  {SYMPTOMS_BELOW_NECK.map((s) => (
                    <Toggle
                      key={s.id}
                      checked={symptoms.includes(s.id)}
                      onChange={() => toggleSymptom(s.id)}
                      label={s.label}
                      danger
                    />
                  ))}
                </div>
              </div>

              <div>
                <div style={sx.question}>Temperature (°C, optional)</div>
                <input
                  type="number"
                  step="0.1"
                  inputMode="decimal"
                  value={temperatureC}
                  onChange={(e) => setTemperatureC(e.target.value)}
                  placeholder="36.8"
                  style={{ ...sx.input, width: 130 }}
                />
              </div>

              {(belowNeck || feverish) && (
                <div style={sx.warnRed}>
                  {feverish
                    ? 'Fever means no training at all, not even easy. Wait until you have been '
                      + 'fever-free for 24-48 h without medication, then add one to two easy days '
                      + 'for every day you had it.'
                    : 'Symptoms below the neck mean no training until they clear.'}
                </div>
              )}
              {symptoms.length > 0 && !belowNeck && !feverish && (
                <div style={sx.warnGreen}>
                  Above the neck with no fever - easy training is usually fine at about half your
                  normal volume, zone 1-2 only. Stop if it moves into your chest.
                </div>
              )}
            </>
          )}

          {/* Always visible: these decide whether the answer is "train less" or
              "stop using this app and see someone". */}
          <div>
            <div style={sx.question}>Any of these today?</div>
            <div style={sx.stack}>
              <Toggle checked={limping} onChange={setLimping} label="I'm limping or moving differently" danger />
              <Toggle checked={nightPain} onChange={setNightPain} label="It woke me at night" danger />
              <Toggle checked={painAtRest} onChange={setPainAtRest} label="It hurts even at rest" danger />
              <Toggle checked={swelling} onChange={setSwelling} label="It's swollen" />
              {(catalogEntry.redFlags || []).map((flag) => (
                <Toggle
                  key={flag.id}
                  checked={redFlags.includes(flag.id)}
                  onChange={() => toggleRedFlag(flag.id)}
                  label={flag.label}
                  danger
                />
              ))}
            </div>
          </div>

          {gateTests.length > 0 && (
            <div>
              <div style={sx.question}>
                Field test <span style={{ fontWeight: 600, color: '#6B7280' }}>- unlocks the next stage</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {gateTests.map((t) => (
                  <TestRow
                    key={t.id}
                    test={t}
                    value={tests[t.id]}
                    onChange={(v) => setTests((prev) => ({ ...prev, [t.id]: v }))}
                  />
                ))}
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            style={{
              alignSelf: 'flex-start',
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'none', border: 'none', padding: '4px 0',
              fontFamily: 'inherit', fontSize: 13, fontWeight: 700, color: '#5E6590',
              cursor: 'pointer',
              WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
            }}
          >
            <svg
              width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"
              style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform .2s ease' }}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
            {expanded ? 'Less detail' : 'More detail'}
          </button>

          {expanded && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <PainScale value={painNow} onChange={setPainNow} label="Pain right now" />
              <PainScale
                value={painDuringSession}
                onChange={setPainDuringSession}
                label="Worst pain during today's session"
              />
              <PainScale
                value={painNextMorning}
                onChange={setPainNextMorning}
                label="Pain this morning (the 24 h response to yesterday)"
              />
              <div>
                <div style={sx.question}>How confident do you feel using it?</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setConfidence(confidence === n ? null : n)}
                      style={{
                        flex: 1, padding: '13px 0', borderRadius: 12,
                        fontFamily: 'inherit', fontSize: 14, fontWeight: 700,
                        fontVariantNumeric: 'tabular-nums',
                        background: confidence === n ? '#5E6590' : 'rgba(118,126,181,.06)',
                        color: confidence === n ? '#fff' : '#5E6590',
                        border: `1px solid ${confidence === n ? '#5E6590' : 'rgba(118,126,181,.22)'}`,
                        cursor: 'pointer',
                        WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
                      }}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div style={sx.question}>Note</div>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  placeholder="Anything worth remembering"
                  style={{ ...sx.input, resize: 'none' }}
                />
              </div>
            </div>
          )}

          {error && (
            <div style={sx.warnRed}>{error}</div>
          )}

          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave || saving}
            style={{
              width: '100%',
              padding: '14px 16px', borderRadius: 14,
              background: canSave ? '#5E6590' : 'rgba(118,126,181,.25)',
              border: `1px solid ${canSave ? '#5E6590' : 'transparent'}`,
              color: '#fff',
              fontFamily: 'inherit', fontSize: 14, fontWeight: 800,
              cursor: canSave ? 'pointer' : 'default',
              opacity: saving ? 0.6 : 1,
              boxShadow: canSave ? '0 4px 12px -4px rgba(94,101,144,.5)' : 'none',
              WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
              transition: 'opacity .2s ease, background .2s ease',
            }}
          >
            {saving ? 'Saving…' : 'Save check-in'}
          </button>

          {!canSave && (
            <div style={{ fontSize: 11.5, color: '#9CA3AF', textAlign: 'center', marginTop: -12 }}>
              Answer at least one question to save.
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return ReactDOM.createPortal(content, modalRoot);
}

// ── Module-local pieces ───────────────────────────────────────────────────

function bandFor(value) {
  return PAIN_BANDS.find((b) => value <= b.max) || PAIN_BANDS[2];
}

/**
 * 0-10 scale as three colour bands. Laid out six per row rather than eleven
 * across, so each number is a thumb-sized target on a phone.
 */
function PainScale({ value, onChange, label }) {
  return (
    <div>
      {label && <div style={sx.question}>{label}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 5 }}>
        {Array.from({ length: 11 }, (_, i) => {
          const band = bandFor(i);
          const active = value === i;
          return (
            <button
              key={i}
              type="button"
              onClick={() => onChange(active ? null : i)}
              style={{
                padding: '13px 0', borderRadius: 11,
                fontFamily: 'inherit', fontSize: 14, fontWeight: 700,
                fontVariantNumeric: 'tabular-nums',
                background: active ? band.color : band.bg,
                color: active ? '#fff' : band.color,
                border: `1px solid ${active ? band.color : 'transparent'}`,
                cursor: 'pointer',
                WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
                transition: 'background .15s ease, color .15s ease',
              }}
            >
              {i}
            </button>
          );
        })}
      </div>
      {value != null && (
        <div style={{ fontSize: 11.5, fontWeight: 700, marginTop: 7, color: bandFor(value).color }}>
          {bandFor(value).label}
        </div>
      )}
    </div>
  );
}

/** Discrete options - minutes-of-stiffness and symptom severity. */
function OptionPicker({ options, value, onChange }) {
  return (
    <div style={sx.stack}>
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(active ? null : opt.value)}
            style={{
              width: '100%', textAlign: 'left',
              padding: '14px 14px', borderRadius: 12,
              fontFamily: 'inherit', fontSize: 14, fontWeight: 600,
              background: active ? '#5E6590' : 'rgba(255,255,255,.7)',
              color: active ? '#fff' : '#0A0E1A',
              border: `1px solid ${active ? '#5E6590' : 'rgba(118,126,181,.22)'}`,
              cursor: 'pointer',
              WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
              transition: 'background .15s ease, color .15s ease',
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function Toggle({ checked, onChange, label, danger }) {
  const tint = danger ? '#DC2626' : '#5E6590';
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      style={{
        width: '100%', textAlign: 'left',
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '13px 13px', borderRadius: 12,
        background: checked ? (danger ? '#FEF2F2' : 'rgba(118,126,181,.10)') : 'rgba(255,255,255,.7)',
        border: `1px solid ${checked ? (danger ? '#FECACA' : 'rgba(118,126,181,.35)') : 'rgba(118,126,181,.18)'}`,
        color: checked ? (danger ? '#B91C1C' : '#3F456B') : '#374151',
        fontFamily: 'inherit', fontSize: 13.5, fontWeight: 600, lineHeight: 1.35,
        cursor: 'pointer',
        WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
        transition: 'background .15s ease, border-color .15s ease',
      }}
    >
      <span style={{
        width: 22, height: 22, borderRadius: 7, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: checked ? tint : 'transparent',
        border: `1.5px solid ${checked ? tint : 'rgba(118,126,181,.4)'}`,
      }}>
        {checked && (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="#fff" strokeWidth="2.4">
            <path d="M2 6l3 3 5-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      <span style={{ minWidth: 0 }}>{label}</span>
    </button>
  );
}

/** Bilateral field test - two numbers in, symmetry out. */
function TestRow({ test, value, onChange }) {
  const l = Number(value?.left);
  const r = Number(value?.right);
  const symmetry = l > 0 && r > 0 ? Math.round((Math.min(l, r) / Math.max(l, r)) * 100) : null;

  return (
    <div style={{
      border: '1px solid rgba(118,126,181,.18)', borderRadius: 14,
      background: 'rgba(255,255,255,.55)', padding: '12px 12px',
    }}>
      <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0A0E1A' }}>{test.label}</div>
      <div style={{ fontSize: 11.5, color: '#6B7280', marginTop: 3, marginBottom: 10, lineHeight: 1.4 }}>
        {test.instructions}
      </div>
      {test.bilateral ? (
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
          <label style={{ flex: 1, display: 'block' }}>
            <span style={sx.fieldLabel}>Left ({test.unit})</span>
            <input
              type="number"
              inputMode="numeric"
              value={value?.left ?? ''}
              onChange={(e) => onChange({ ...value, test: test.id, left: e.target.value })}
              style={sx.input}
            />
          </label>
          <label style={{ flex: 1, display: 'block' }}>
            <span style={sx.fieldLabel}>Right ({test.unit})</span>
            <input
              type="number"
              inputMode="numeric"
              value={value?.right ?? ''}
              onChange={(e) => onChange({ ...value, test: test.id, right: e.target.value })}
              style={sx.input}
            />
          </label>
          <div style={{ width: 62, textAlign: 'center', paddingBottom: 8 }}>
            <span style={sx.fieldLabel}>Symmetry</span>
            <div style={{
              fontSize: 14, fontWeight: 800, fontVariantNumeric: 'tabular-nums',
              color: symmetry == null ? '#9CA3AF' : symmetry >= 90 ? '#16A34A' : '#EA580C',
            }}>
              {symmetry == null ? '-' : `${symmetry}%`}
            </div>
          </div>
        </div>
      ) : test.unit === 'pain' ? (
        <PainScale
          value={value?.painDuring ?? null}
          onChange={(v) => onChange({ ...value, test: test.id, painDuring: v })}
          label="Pain during the test"
        />
      ) : (
        /* One-sided numeric test (minutes walked, reps on the affected side).
           Without this input the gate could never be satisfied: there is no
           left/right to compare and a pain score is not what it asks for. */
        <label style={{ display: 'block' }}>
          <span style={sx.fieldLabel}>
            {test.unit === 'minutes' ? 'Minutes' : test.unit === 'cm' ? 'Centimetres' : 'Reps'}
            {test.defaultTarget?.minValue != null ? ` (target ${test.defaultTarget.minValue})` : ''}
          </span>
          <input
            type="number"
            inputMode="numeric"
            value={value?.value ?? ''}
            onChange={(e) => onChange({ ...value, test: test.id, value: e.target.value })}
            style={{ ...sx.input, width: 130 }}
          />
        </label>
      )}
    </div>
  );
}

// Shared inline styles. `input` sits at 14px because anything smaller triggers
// iOS focus-zoom, and there is no keyboard-avoidance layer to recover from it.
const sx = {
  question: {
    fontSize: 13.5, fontWeight: 700, color: '#0A0E1A',
    marginBottom: 9, lineHeight: 1.35,
  },
  groupLabel: {
    fontSize: 9.5, fontWeight: 800, color: '#6B7280',
    letterSpacing: '0.08em', textTransform: 'uppercase',
    marginBottom: 7,
  },
  fieldLabel: {
    display: 'block',
    fontSize: 9.5, fontWeight: 800, color: '#6B7280',
    letterSpacing: '0.08em', textTransform: 'uppercase',
    marginBottom: 5,
  },
  stack: { display: 'flex', flexDirection: 'column', gap: 7 },
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
    fontVariantNumeric: 'tabular-nums',
  },
  warnRed: {
    fontSize: 12.5, lineHeight: 1.5, color: '#B91C1C',
    background: '#FEF2F2', border: '1px solid #FECACA',
    borderRadius: 12, padding: '11px 13px',
  },
  warnGreen: {
    fontSize: 12.5, lineHeight: 1.5, color: '#15803D',
    background: 'rgba(34,197,94,.08)', border: '1px solid rgba(34,197,94,.25)',
    borderRadius: 12, padding: '11px 13px',
  },
};
