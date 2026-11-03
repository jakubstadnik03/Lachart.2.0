/**
 * WellnessCheckInSheet - the athlete's "How are you today?" form.
 *
 * Six 1-5 questions, two yes/no, one optional line: about 45 seconds. Every
 * scale button carries its words, not just a number, so a 2 on sleep means
 * "Poorly" to everyone who answers it.
 *
 * Pain and illness stop at yes/no on purpose. A "yes" leads on to the existing
 * injury/illness flow (an open episode's check-in, or logging a new one) via
 * `onHandoff`, rather than asking a second, weaker set of symptom questions
 * here.
 *
 * Bottom sheet on a phone (web and the Capacitor app), centred modal from the
 * sm breakpoint up - the same shell as HealthCheckInModal.
 */
import React, { useEffect, useMemo, useState } from 'react';
import ReactDOM from 'react-dom';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { saveWellnessCheckIn } from '../../services/wellnessCheckInApi';
import { fetchHealthToday } from '../../services/healthApi';
import { WELLNESS_AREAS, BAND_STYLE, GUIDANCE_NOTE } from './wellnessCopy';

function ScaleRow({ area, value, onChange }) {
  return (
    <fieldset>
      <legend className="text-sm font-medium text-gray-800 mb-2">{area.question}</legend>
      <div className="grid grid-cols-5 gap-1.5">
        {area.scale.map((label, i) => {
          const n = i + 1;
          const active = value === n;
          return (
            <button
              key={n}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(n)}
              className={`flex flex-col items-center justify-start rounded-xl px-1 py-2 min-h-[56px] border transition-colors ${
                active
                  ? 'bg-blue-600 border-blue-600 text-white'
                  : 'bg-white border-gray-200 text-gray-700 hover:border-blue-300'
              }`}
            >
              <span className="text-base font-semibold leading-none">{n}</span>
              <span className={`mt-1 text-[10px] leading-tight text-center ${active ? 'text-blue-50' : 'text-gray-500'}`}>
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function YesNo({ question, hint, value, onChange }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <div className="text-sm font-medium text-gray-800">{question}</div>
        {hint && <div className="text-xs text-gray-500 mt-0.5">{hint}</div>}
      </div>
      <div className="flex rounded-xl border border-gray-200 overflow-hidden shrink-0">
        {[false, true].map((v) => {
          const active = value === v;
          const yesActive = active && v;
          return (
            <button
              key={String(v)}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(v)}
              className={`px-4 py-2 text-sm font-medium ${
                yesActive ? 'bg-rose-600 text-white'
                  : active ? 'bg-gray-800 text-white'
                    : 'bg-white text-gray-600'
              }`}
            >
              {v ? 'Yes' : 'No'}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Open episodes of the matching kind, for "update what is already logged". */
function matchingEpisodes(items, { pain, illness }) {
  return (items || []).filter((it) => {
    const kind = it?.catalogEntry?.kind || it?.episode?.kind;
    return (illness && kind === 'illness') || (pain && kind !== 'illness');
  });
}

export default function WellnessCheckInSheet({
  open,
  onClose,
  onSaved,
  /** ({ type: 'episode', item } | { type: 'new', kind: 'injury'|'illness' }, checkIn) */
  onHandoff,
  /** Today's report, when the athlete is editing rather than answering fresh. */
  existing = null,
  sharedWithCoach = true,
}) {
  const [answers, setAnswers] = useState({});
  const [pain, setPain] = useState(null);
  const [illness, setIllness] = useState(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(null); // { checkIn, band }
  const [openEpisodes, setOpenEpisodes] = useState(null);

  useEffect(() => {
    if (!open) return;
    const a = {};
    WELLNESS_AREAS.forEach(({ key }) => { a[key] = existing?.[key] ?? null; });
    setAnswers(a);
    setPain(existing ? Boolean(existing.pain) : null);
    setIllness(existing ? Boolean(existing.illness) : null);
    setNote(existing?.note || '');
    setSaved(null);
    setError(null);
    setOpenEpisodes(null);
  }, [open, existing]);

  // Lock the page behind the sheet, as the other sheets do.
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  const answered = WELLNESS_AREAS.filter(({ key }) => answers[key] != null).length;
  const complete = answered === WELLNESS_AREAS.length && pain != null && illness != null;

  const handoffNeeded = Boolean(saved && (saved.checkIn.pain || saved.checkIn.illness));
  useEffect(() => {
    if (!handoffNeeded || openEpisodes) return;
    fetchHealthToday().then(setOpenEpisodes).catch(() => setOpenEpisodes([]));
  }, [handoffNeeded, openEpisodes]);

  const relevant = useMemo(
    () => matchingEpisodes(openEpisodes, saved?.checkIn || {}),
    [openEpisodes, saved],
  );

  if (!open) return null;

  const handleSave = async () => {
    if (!complete) return;
    setSaving(true);
    setError(null);
    try {
      const result = await saveWellnessCheckIn({
        ...answers,
        pain,
        illness,
        note: note.trim(),
        date: existing?.date || undefined,
      });
      setSaved(result);
      onSaved?.(result);
    } catch (e) {
      setError(e?.response?.data?.error || e.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const band = saved ? BAND_STYLE[saved.band] : null;

  const body = (
    <div
      className="fixed inset-0 z-[1000] flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Wellness check-in"
        className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[92vh] flex flex-col"
      >
        <div className="border-b border-gray-100 px-5 pt-4 pb-3 flex items-start justify-between shrink-0">
          <div>
            <div className="text-base font-semibold text-gray-900">How are you today?</div>
            <div className="text-xs text-gray-500 mt-0.5">
              About 45 seconds{sharedWithCoach ? ' · shared with your coach' : ''}
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1 text-gray-400 hover:text-gray-600">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {!saved ? (
          <>
            <div className="px-5 py-4 space-y-5 overflow-y-auto">
              {WELLNESS_AREAS.map((area) => (
                <ScaleRow
                  key={area.key}
                  area={area}
                  value={answers[area.key]}
                  onChange={(v) => setAnswers((prev) => ({ ...prev, [area.key]: v }))}
                />
              ))}

              <div className="space-y-4 pt-1">
                <YesNo
                  question="Do you have any pain?"
                  hint="Joint, tendon or anything that isn't normal muscle soreness"
                  value={pain}
                  onChange={setPain}
                />
                <YesNo question="Are you feeling ill?" value={illness} onChange={setIllness} />
              </div>

              <label className="block">
                <span className="text-sm font-medium text-gray-800">Anything else we should know?</span>
                <span className="text-xs text-gray-400 ml-1">Optional</span>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value.slice(0, 500))}
                  rows={2}
                  className="mt-1.5 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                  placeholder="Travel, exams, a bad night…"
                />
              </label>
              {error && <div className="text-sm text-rose-600">{error}</div>}
            </div>

            <div
              className="border-t border-gray-100 px-5 pt-3 shrink-0"
              style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}
            >
              <button
                type="button"
                disabled={!complete || saving}
                onClick={handleSave}
                className="w-full rounded-xl bg-blue-600 text-white font-semibold py-3 disabled:opacity-40"
              >
                {saving ? 'Saving…' : complete ? 'Save check-in' : `${answered + (pain != null) + (illness != null)} of 8 answered`}
              </button>
            </div>
          </>
        ) : (
          <div
            className="px-5 py-5 space-y-4 overflow-y-auto"
            style={{ paddingBottom: 'max(20px, env(safe-area-inset-bottom))' }}
          >
            <div className="flex items-center gap-3">
              <div className="text-4xl font-bold tabular-nums" style={{ color: band?.hex }}>
                {saved.checkIn.score}
              </div>
              <div>
                <div className="text-sm font-semibold text-gray-900">Thanks, saved</div>
                {band && (
                  <span className={`inline-block mt-0.5 text-xs font-medium px-2 py-0.5 rounded-full ring-1 ${band.pill}`}>
                    {band.label}
                  </span>
                )}
              </div>
            </div>

            {handoffNeeded ? (
              <div className="rounded-xl bg-rose-50 ring-1 ring-rose-200 p-4 space-y-3">
                <div className="text-sm text-rose-900">
                  {saved.checkIn.pain && saved.checkIn.illness
                    ? 'You mentioned pain and feeling ill.'
                    : saved.checkIn.pain ? 'You mentioned pain.' : 'You mentioned feeling ill.'}
                  {' '}Logging it gives you and your coach a plan for getting back to full training.
                </div>
                {openEpisodes == null ? (
                  <div className="text-xs text-rose-700">Checking what is already logged…</div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {relevant.map((item) => (
                      <button
                        key={item.episode._id}
                        type="button"
                        onClick={() => onHandoff?.({ type: 'episode', item }, saved.checkIn)}
                        className="w-full text-left rounded-lg bg-white ring-1 ring-rose-200 px-3 py-2.5 text-sm font-medium text-rose-800"
                      >
                        Update: {item.catalogEntry?.shortLabel || item.catalogEntry?.label || 'open episode'}
                      </button>
                    ))}
                    {saved.checkIn.pain && (
                      <button
                        type="button"
                        onClick={() => onHandoff?.({ type: 'new', kind: 'injury' }, saved.checkIn)}
                        className="w-full text-left rounded-lg bg-white ring-1 ring-rose-200 px-3 py-2.5 text-sm font-medium text-rose-800"
                      >
                        Log a new injury or pain
                      </button>
                    )}
                    {saved.checkIn.illness && (
                      <button
                        type="button"
                        onClick={() => onHandoff?.({ type: 'new', kind: 'illness' }, saved.checkIn)}
                        className="w-full text-left rounded-lg bg-white ring-1 ring-rose-200 px-3 py-2.5 text-sm font-medium text-rose-800"
                      >
                        Log an illness
                      </button>
                    )}
                  </div>
                )}
                <button type="button" onClick={onClose} className="text-xs font-medium text-rose-700">
                  Not now
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="w-full rounded-xl bg-gray-900 text-white font-semibold py-3"
              >
                Done
              </button>
            )}
            <p className="text-[11px] text-gray-400">{GUIDANCE_NOTE}</p>
          </div>
        )}
      </div>
    </div>
  );

  return ReactDOM.createPortal(body, document.body);
}
