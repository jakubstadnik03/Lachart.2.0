/**
 * HealthCheckInModal - the daily symptom report.
 *
 * The whole feature dies if this takes more than a few taps, because a gate
 * reasoning from three-day-old data is worse than no gate at all. So the
 * default view is ONE question: the hallmark metric the catalogue defines for
 * this specific injury (morning stiffness for a tendon, time-to-pain for ITB,
 * weight-bearing pain for a bone). Everything else is behind "More detail".
 *
 * Red flags are the exception - they are always visible, because the whole
 * point of asking is to catch the day someone should stop using the app and
 * call a clinician.
 */
import React, { useState, useMemo } from 'react';
import { XMarkIcon, ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline';
import { saveCheckIn, todayKey } from '../../services/healthApi';

const PAIN_BANDS = [
  { max: 2, label: 'Aware of it', color: '#16A34A', bg: '#F0FDF4' },
  { max: 5, label: 'Changes how I move', color: '#EA580C', bg: '#FFF7ED' },
  { max: 10, label: 'Have to stop', color: '#DC2626', bg: '#FEF2F2' },
];

function bandFor(value) {
  return PAIN_BANDS.find((b) => value <= b.max) || PAIN_BANDS[2];
}

/** 0-10 scale rendered as three colour bands rather than eleven bare numbers. */
function PainScale({ value, onChange, label }) {
  return (
    <div>
      {label && <div className="text-sm font-medium text-gray-700 mb-2">{label}</div>}
      <div className="flex gap-1">
        {Array.from({ length: 11 }, (_, i) => {
          const band = bandFor(i);
          const active = value === i;
          return (
            <button
              key={i}
              type="button"
              onClick={() => onChange(active ? null : i)}
              className="flex-1 rounded-lg text-sm font-semibold transition-all"
              style={{
                padding: '10px 0',
                background: active ? band.color : band.bg,
                color: active ? '#fff' : band.color,
                border: `1px solid ${active ? band.color : 'transparent'}`,
              }}
            >
              {i}
            </button>
          );
        })}
      </div>
      {value != null && (
        <div className="text-xs mt-1.5" style={{ color: bandFor(value).color }}>
          {bandFor(value).label}
        </div>
      )}
    </div>
  );
}

/** Discrete options - used for minutes-of-stiffness and symptom severity. */
function OptionPicker({ options, value, onChange }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(active ? null : opt.value)}
            className={`px-3 py-3 rounded-lg text-sm font-medium text-left transition-all border ${
              active
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

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

function Toggle({ checked, onChange, label, danger }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left text-sm transition-all ${
        checked
          ? danger
            ? 'bg-red-50 border-red-300 text-red-800'
            : 'bg-blue-50 border-blue-300 text-blue-800'
          : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
      }`}
    >
      <span
        className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
          checked ? (danger ? 'bg-red-600 border-red-600' : 'bg-blue-600 border-blue-600') : 'border-gray-300'
        }`}
      >
        {checked && (
          <svg viewBox="0 0 12 12" className="w-3 h-3 text-white" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M2 6l3 3 5-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      <span>{label}</span>
    </button>
  );
}

/** Bilateral field test - two numbers in, symmetry out. */
function TestRow({ test, value, onChange }) {
  const l = Number(value?.left);
  const r = Number(value?.right);
  const symmetry = l > 0 && r > 0 ? Math.round((Math.min(l, r) / Math.max(l, r)) * 100) : null;

  return (
    <div className="border border-gray-200 rounded-lg p-3">
      <div className="text-sm font-medium text-gray-800">{test.label}</div>
      <div className="text-xs text-gray-500 mt-0.5 mb-2.5">{test.instructions}</div>
      {test.bilateral ? (
        <div className="flex items-end gap-2">
          <label className="flex-1">
            <span className="block text-xs text-gray-500 mb-1">Left ({test.unit})</span>
            <input
              type="number"
              inputMode="numeric"
              value={value?.left ?? ''}
              onChange={(e) => onChange({ ...value, test: test.id, left: e.target.value })}
              className="w-full px-2.5 py-2 border border-gray-300 rounded-md text-sm"
            />
          </label>
          <label className="flex-1">
            <span className="block text-xs text-gray-500 mb-1">Right ({test.unit})</span>
            <input
              type="number"
              inputMode="numeric"
              value={value?.right ?? ''}
              onChange={(e) => onChange({ ...value, test: test.id, right: e.target.value })}
              className="w-full px-2.5 py-2 border border-gray-300 rounded-md text-sm"
            />
          </label>
          <div className="w-20 text-center pb-1.5">
            <div className="text-xs text-gray-500">Symmetry</div>
            <div
              className="text-sm font-bold"
              style={{ color: symmetry == null ? '#9CA3AF' : symmetry >= 90 ? '#16A34A' : '#EA580C' }}
            >
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
        <label className="block">
          <span className="block text-xs text-gray-500 mb-1">
            {test.unit === 'minutes' ? 'Minutes' : test.unit === 'cm' ? 'Centimetres' : 'Reps'}
            {test.defaultTarget?.minValue != null ? ` (target ${test.defaultTarget.minValue})` : ''}
          </span>
          <input
            type="number"
            inputMode="numeric"
            value={value?.value ?? ''}
            onChange={(e) => onChange({ ...value, test: test.id, value: e.target.value })}
            className="w-32 px-2.5 py-2 border border-gray-300 rounded-md text-sm"
          />
        </label>
      )}
    </div>
  );
}

export default function HealthCheckInModal({
  episode,
  catalogEntry,
  functionalTests = {},
  trigger = 'daily',
  onClose,
  onSaved,
}) {
  const hallmark = catalogEntry?.hallmark;
  const isIllness = catalogEntry?.kind === 'illness';

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
      onClose?.();
    } catch (e) {
      setError(e?.response?.data?.error || e.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const canSave = hallmarkValue != null || painNow != null || redFlags.length > 0
    || symptoms.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-start justify-between">
          <div>
            <div className="text-base font-semibold text-gray-900">Check-in</div>
            <div className="text-xs text-gray-500 mt-0.5">
              {catalogEntry?.shortLabel || catalogEntry?.label}
              {episode?.side && episode.side !== 'n/a' ? ` · ${episode.side}` : ''}
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-5">
          <div className="flex items-center justify-between gap-3">
            <label className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-700">Day</span>
              <input
                type="date"
                value={date}
                min={episode?.startDate || undefined}
                max={todayKey()}
                onChange={(e) => setDate(e.target.value || todayKey())}
                className="px-2.5 py-1.5 border border-gray-300 rounded-md text-sm"
              />
            </label>
            {date !== todayKey() && (
              <span className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-1">
                Filling in a past day
              </span>
            )}
          </div>

          {/* The one question that matters for this tissue. */}
          {hallmark && (
            <div>
              <div className="text-sm font-medium text-gray-900 mb-2.5">{hallmark.prompt}</div>
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
                <div className="text-sm font-medium text-gray-900 mb-2">What have you got?</div>
                <div className="text-xs text-gray-500 mb-2">Above the neck</div>
                <div className="space-y-1.5">
                  {SYMPTOMS_ABOVE_NECK.map((s) => (
                    <Toggle
                      key={s.id}
                      checked={symptoms.includes(s.id)}
                      onChange={() => toggleSymptom(s.id)}
                      label={s.label}
                    />
                  ))}
                </div>
                <div className="text-xs text-gray-500 mt-3 mb-2">Below the neck - these mean no training</div>
                <div className="space-y-1.5">
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

              <label className="block">
                <span className="block text-sm font-medium text-gray-700 mb-1.5">
                  Temperature (°C, optional)
                </span>
                <input
                  type="number"
                  step="0.1"
                  inputMode="decimal"
                  value={temperatureC}
                  onChange={(e) => setTemperatureC(e.target.value)}
                  placeholder="36.8"
                  className="w-32 px-3 py-2 border border-gray-300 rounded-md text-sm"
                />
              </label>

              {(belowNeck || feverish) && (
                <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 leading-relaxed">
                  {feverish
                    ? 'Fever means no training at all - not even easy. Wait until you have been fever-free '
                      + 'for 24-48 h without medication, then add one to two easy days for every day you had it.'
                    : 'Symptoms below the neck mean no training until they clear.'}
                </div>
              )}
              {symptoms.length > 0 && !belowNeck && !feverish && (
                <div className="text-xs text-green-800 bg-green-50 border border-green-200 rounded-lg px-3 py-2.5 leading-relaxed">
                  Above the neck with no fever - easy training is usually fine at about half your normal
                  volume, zone 1-2 only. Stop if it moves into your chest.
                </div>
              )}
            </>
          )}

          {/* Always visible: these decide whether the answer is "train less" or
              "stop using this app and see someone". */}
          <div>
            <div className="text-sm font-medium text-gray-900 mb-2">Any of these today?</div>
            <div className="space-y-1.5">
              <Toggle checked={limping} onChange={setLimping} label="I'm limping or moving differently" danger />
              <Toggle checked={nightPain} onChange={setNightPain} label="It woke me at night" danger />
              <Toggle checked={painAtRest} onChange={setPainAtRest} label="It hurts even at rest" danger />
              <Toggle checked={swelling} onChange={setSwelling} label="It's swollen" />
              {(catalogEntry?.redFlags || []).map((flag) => (
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
              <div className="text-sm font-medium text-gray-900 mb-2">
                Field test <span className="font-normal text-gray-500">- unlocks the next stage</span>
              </div>
              <div className="space-y-2">
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
            className="flex items-center gap-1.5 text-sm text-blue-600 font-medium"
          >
            {expanded ? <ChevronUpIcon className="w-4 h-4" /> : <ChevronDownIcon className="w-4 h-4" />}
            {expanded ? 'Less detail' : 'More detail'}
          </button>

          {expanded && (
            <div className="space-y-4 pt-1">
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
                <div className="text-sm font-medium text-gray-700 mb-2">
                  How confident do you feel using it?
                </div>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setConfidence(confidence === n ? null : n)}
                      className={`flex-1 py-2 rounded-lg text-sm font-semibold border ${
                        confidence === n
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-gray-50 text-gray-600 border-gray-200'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              <label className="block">
                <span className="block text-sm font-medium text-gray-700 mb-1.5">Note</span>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  placeholder="Anything worth remembering"
                />
              </label>
            </div>
          )}

          {error && <div className="text-sm text-red-600">{error}</div>}
        </div>

        <div className="sticky bottom-0 bg-white border-t border-gray-100 px-5 py-3 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave || saving}
            className="flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300"
          >
            {saving ? 'Saving…' : 'Save check-in'}
          </button>
        </div>
      </div>
    </div>
  );
}
