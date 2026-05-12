import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Plus, Trash, Save, X, Zap, Edit2, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { fitCP, predictAtDuration, formatCpValue, compareCpToLt2 } from './cpCalculator';
import { HyperbolaChart, CPTrendChart } from './CPCharts';
import {
  getCPTestsByAthleteId,
  addCPTest,
  updateCPTest,
  deleteCPTest,
  getTestingsByAthleteId,
  getCPStravaBestEfforts,
} from '../../services/api';
import { useNotification } from '../../context/NotificationContext';

/** Parse "MM:SS" or numeric string into seconds. Returns NaN on failure. */
function parseDuration(str) {
  if (str == null || str === '') return NaN;
  const s = String(str).trim();
  const mmss = s.match(/^(\d+):(\d{1,2})$/);
  if (mmss) return Number(mmss[1]) * 60 + Number(mmss[2]);
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
}

/** Format seconds → "MM:SS". */
function fmtMMSS(totalSec) {
  const s = Math.max(0, Math.round(Number(totalSec) || 0));
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return `${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

/** Latest LT2 (in matching units) from a list of lactate tests for the sport. */
function latestLt2(lactateTests, sport) {
  if (!Array.isArray(lactateTests) || lactateTests.length === 0) return null;
  const sportMatch = lactateTests
    .filter(t => String(t.sport || '').toLowerCase() === sport)
    .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  for (const t of sportMatch) {
    const lt2 = Number(t?.thresholdOverrides?.LTP2 ?? t?.LTP2 ?? t?.lt2 ?? t?.thresholdOverrides?.ltp2);
    if (Number.isFinite(lt2) && lt2 > 0) return { value: lt2, testId: t._id || t.id, testDate: t.date };
  }
  return null;
}

/* ─────────────────────────── Effort row ─────────────────────────────────── */

function EffortRow({ effort, sport, onChange, onDelete, idx }) {
  const isPace = sport === 'run' || sport === 'swim';
  const valuePlaceholder = sport === 'bike' ? 'W' : 'MM:SS';
  const valueDisplay = isPace && Number.isFinite(Number(effort.value)) && Number(effort.value) > 0
    ? fmtMMSS(effort.value)
    : (effort.value ?? '');

  return (
    <div className="grid grid-cols-[28px_1fr_1fr_28px] gap-2 items-center py-1">
      <div className="text-xs text-gray-400 text-center">{idx + 1}</div>
      <input
        type="text"
        placeholder="MM:SS"
        value={fmtMMSS(effort.durationSec || '') === '00:00' ? '' : fmtMMSS(effort.durationSec)}
        onChange={(e) => {
          const sec = parseDuration(e.target.value);
          onChange({ ...effort, durationSec: Number.isFinite(sec) ? sec : '' });
        }}
        className="w-full p-1 text-sm border border-gray-200 rounded-lg text-center focus:outline-none focus:ring-2 focus:ring-primary"
      />
      <input
        type="text"
        placeholder={valuePlaceholder}
        value={valueDisplay}
        onChange={(e) => {
          if (isPace) {
            const sec = parseDuration(e.target.value);
            onChange({ ...effort, value: Number.isFinite(sec) ? sec : '' });
          } else {
            const n = Number(String(e.target.value).replace(',', '.'));
            onChange({ ...effort, value: Number.isFinite(n) ? n : '' });
          }
        }}
        className="w-full p-1 text-sm border border-gray-200 rounded-lg text-center focus:outline-none focus:ring-2 focus:ring-primary"
      />
      <button
        type="button"
        onClick={onDelete}
        className="text-red-500 hover:text-red-700 transition-colors"
        title="Remove effort"
      >
        <Trash size={14} />
      </button>
    </div>
  );
}

/* ─────────────────────────── Test card (read mode) ──────────────────────── */

function CPTestCard({ test, lt2, onEdit, onDelete }) {
  const sport = test.sport;
  const fmt = (v) => formatCpValue(v, sport);
  const compare = lt2?.value != null && test.cp != null
    ? compareCpToLt2(test.cp, lt2.value, sport)
    : null;

  const agreementColor = {
    excellent: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    good:      'text-blue-700    bg-blue-50    border-blue-200',
    fair:      'text-amber-700   bg-amber-50   border-amber-200',
    poor:      'text-red-700     bg-red-50     border-red-200',
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <div className="font-bold text-gray-900 truncate">{test.title || 'CP Test'}</div>
          <div className="text-xs text-gray-500 mt-0.5">
            {new Date(test.date).toLocaleDateString()} · {sport} · {test.efforts?.length || 0} efforts
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={onEdit} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors" title="Edit">
            <Edit2 size={14} />
          </button>
          <button onClick={onDelete} className="p-1.5 rounded-lg text-red-500 hover:text-red-700 hover:bg-red-50 transition-colors" title="Delete">
            <Trash size={14} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl p-3 border border-indigo-100">
          <div className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider">Critical Power</div>
          <div className="text-2xl font-bold text-gray-900 mt-0.5">{fmt(test.cp)}</div>
        </div>
        <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl p-3 border border-amber-100">
          <div className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">W' (work capacity)</div>
          <div className="text-2xl font-bold text-gray-900 mt-0.5">
            {test.wPrime != null
              ? sport === 'bike'
                ? `${(test.wPrime / 1000).toFixed(1)} kJ`
                : `${Math.round(test.wPrime)}`
              : '—'}
          </div>
        </div>
      </div>

      {compare && compare.agreement && (
        <div className={`rounded-xl border p-3 text-xs ${agreementColor[compare.agreement]}`}>
          <div className="font-bold uppercase tracking-wider text-[10px] mb-0.5">vs LT2</div>
          <div className="flex items-baseline justify-between gap-2">
            <div>
              CP <strong>{fmt(test.cp)}</strong> · LT2 <strong>{fmt(lt2.value)}</strong>
            </div>
            <div>
              Δ {compare.delta > 0 ? '+' : ''}{compare.isPace ? `${Math.round(compare.delta)}s` : `${Math.round(compare.delta)}W`}
              {' '}({compare.deltaPct > 0 ? '+' : ''}{compare.deltaPct.toFixed(1)}%)
            </div>
          </div>
          <div className="mt-1 text-[11px] opacity-80">
            {compare.agreement === 'excellent' && 'Excellent agreement — high confidence in zones.'}
            {compare.agreement === 'good' && 'Good agreement — within typical 5–10 % range.'}
            {compare.agreement === 'fair' && 'Fair agreement — check protocol or measurement quality.'}
            {compare.agreement === 'poor' && 'Large disagreement — re-test or check one of the measurements.'}
          </div>
        </div>
      )}

      <details className="mt-3 text-xs text-gray-500">
        <summary className="cursor-pointer hover:text-gray-700">Show efforts ({test.efforts?.length || 0})</summary>
        <div className="mt-2 space-y-1">
          {(test.efforts || []).map((e, i) => (
            <div key={i} className="flex justify-between border-b border-gray-50 py-1">
              <span>{fmtMMSS(e.durationSec)}</span>
              <span className="font-mono">{formatCpValue(e.value, sport)}</span>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}

/* ─────────────────────────── Test editor / new ─────────────────────────── */

function CPTestEditor({ initial, athleteId, sport, onSaved, onCancel }) {
  const { addNotification } = useNotification();
  const [draft, setDraft] = useState(() => ({
    title: initial?.title || 'CP Test',
    sport: initial?.sport || sport || 'bike',
    date: initial?.date
      ? new Date(initial.date).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10),
    notes: initial?.notes || '',
    efforts: initial?.efforts?.length
      ? initial.efforts.map(e => ({ ...e }))
      : [
          { durationSec: 180, value: '' },   // 3 min
          { durationSec: 720, value: '' },   // 12 min
        ],
  }));
  const [saving, setSaving] = useState(false);

  const fit = useMemo(() => fitCP(draft.efforts, draft.sport), [draft.efforts, draft.sport]);

  const updateEffort = (idx, next) => {
    setDraft(d => ({ ...d, efforts: d.efforts.map((e, i) => (i === idx ? next : e)) }));
  };
  const addEffort = () => {
    setDraft(d => ({ ...d, efforts: [...d.efforts, { durationSec: '', value: '' }] }));
  };
  const removeEffort = (idx) => {
    setDraft(d => ({ ...d, efforts: d.efforts.filter((_, i) => i !== idx) }));
  };

  const canSave = useMemo(() => {
    const valid = (draft.efforts || []).filter(e => Number(e.durationSec) > 0 && Number(e.value) > 0);
    return valid.length >= 2;
  }, [draft.efforts]);

  // ── Strava best-efforts import ──────────────────────────────────────────
  const [stravaScanning, setStravaScanning] = useState(false);
  const [stravaSuggestions, setStravaSuggestions] = useState(null); // { results: [...] }

  const handleScanStrava = async () => {
    // Target durations come from the currently-listed efforts (so the user can
    // tailor what they're looking for) — fall back to the classic 3/12 pair.
    const targets = draft.efforts
      .map(e => Number(e.durationSec))
      .filter(n => Number.isFinite(n) && n >= 60);
    const durations = targets.length >= 2 ? targets : [180, 720];
    setStravaScanning(true);
    setStravaSuggestions(null);
    try {
      const data = await getCPStravaBestEfforts(athleteId, draft.sport, durations, 180);
      setStravaSuggestions(data);
      const any = (data?.results || []).some(r => (r.candidates || []).length > 0);
      if (!any) {
        addNotification('No matching Strava efforts found in the last 180 days.', 'info');
      }
    } catch (err) {
      addNotification(err?.response?.data?.error || 'Strava scan failed', 'error');
    } finally {
      setStravaScanning(false);
    }
  };

  const applySuggestion = (targetSec, suggestion) => {
    // Insert/replace the effort with this target duration.
    setDraft(d => {
      const idx = d.efforts.findIndex(e => Number(e.durationSec) === Number(targetSec));
      const newEffort = {
        durationSec: suggestion.durationSec,
        value: suggestion.value,
      };
      const efforts = idx >= 0
        ? d.efforts.map((e, i) => (i === idx ? newEffort : e))
        : [...d.efforts, newEffort];
      return { ...d, efforts };
    });
  };

  const handleSave = async () => {
    if (!canSave) {
      addNotification('Need at least 2 efforts with duration and value.', 'warning');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...draft,
        athleteId,
        efforts: draft.efforts
          .filter(e => Number(e.durationSec) > 0 && Number(e.value) > 0)
          .map(e => ({ durationSec: Number(e.durationSec), value: Number(e.value) })),
        cp: fit.valid ? fit.cp : null,
        wPrime: fit.valid ? fit.wPrime : null,
      };
      const saved = initial?._id
        ? await updateCPTest(initial._id, payload)
        : await addCPTest(payload);
      addNotification(initial?._id ? 'CP test updated.' : 'CP test created.', 'success');
      onSaved(saved);
    } catch (err) {
      addNotification(err?.response?.data?.error || err?.message || 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-gray-900 flex items-center gap-2">
          <Zap size={16} className="text-indigo-500" />
          {initial?._id ? 'Edit CP test' : 'New CP test'}
        </h3>
        <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">
          <X size={18} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-3">
        <div>
          <label className="block text-[11px] font-medium text-gray-600 mb-1">Title</label>
          <input
            type="text"
            value={draft.title}
            onChange={(e) => setDraft(d => ({ ...d, title: e.target.value }))}
            className="w-full p-1.5 text-sm border border-gray-200 rounded-lg"
          />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-gray-600 mb-1">Date</label>
          <input
            type="date"
            value={draft.date}
            onChange={(e) => setDraft(d => ({ ...d, date: e.target.value }))}
            className="w-full p-1.5 text-sm border border-gray-200 rounded-lg"
          />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-gray-600 mb-1">Sport</label>
          <select
            value={draft.sport}
            onChange={(e) => setDraft(d => ({ ...d, sport: e.target.value }))}
            className="w-full p-1.5 text-sm border border-gray-200 rounded-lg bg-white"
          >
            <option value="bike">Bike</option>
            <option value="run">Run</option>
            <option value="swim">Swim</option>
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-medium text-gray-600 mb-1">Notes</label>
          <input
            type="text"
            value={draft.notes}
            onChange={(e) => setDraft(d => ({ ...d, notes: e.target.value }))}
            placeholder="optional"
            className="w-full p-1.5 text-sm border border-gray-200 rounded-lg"
          />
        </div>
      </div>

      <div className="rounded-xl border border-gray-100 bg-gray-50/40 p-3 mb-3">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Efforts</div>
          <button
            type="button"
            onClick={handleScanStrava}
            disabled={stravaScanning}
            className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold text-orange-700 bg-orange-50 border border-orange-200 rounded-lg hover:bg-orange-100 disabled:opacity-50 transition-colors"
            title="Scan recent Strava activities and propose efforts matching the durations below"
          >
            <Download size={11} />
            {stravaScanning ? 'Scanning Strava…' : 'Import from Strava'}
          </button>
        </div>

        <div className="grid grid-cols-[28px_1fr_1fr_28px] gap-2 items-center text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1 px-0.5">
          <div className="text-center">#</div>
          <div className="text-center">Duration</div>
          <div className="text-center">{draft.sport === 'bike' ? 'Power (W)' : draft.sport === 'swim' ? 'Pace /100m' : 'Pace /km'}</div>
          <div />
        </div>
        {(draft.efforts || []).map((effort, idx) => (
          <EffortRow
            key={idx}
            idx={idx}
            effort={effort}
            sport={draft.sport}
            onChange={(next) => updateEffort(idx, next)}
            onDelete={() => removeEffort(idx)}
          />
        ))}
        <button
          type="button"
          onClick={addEffort}
          className="mt-1 w-full flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors"
        >
          <Plus size={12} /> Add effort
        </button>

        {/* Strava suggestions — shown after Scan returns results. Each target
            duration gets up to 3 best matches; one tap fills in the effort. */}
        {stravaSuggestions && (
          <div className="mt-3 space-y-2">
            {(stravaSuggestions.results || []).map(group => (
              <div key={group.targetSec} className="bg-orange-50/50 border border-orange-100 rounded-lg p-2">
                <div className="text-[10px] font-bold text-orange-700 mb-1">
                  Best near {fmtMMSS(group.targetSec)} ({group.candidates.length})
                </div>
                {group.candidates.length === 0 ? (
                  <div className="text-[11px] text-gray-400 italic">No matching activities.</div>
                ) : (
                  group.candidates.map((c) => (
                    <button
                      key={c.stravaId}
                      type="button"
                      onClick={() => applySuggestion(group.targetSec, c)}
                      className="w-full flex items-center justify-between gap-2 py-1 px-2 hover:bg-orange-100/60 rounded text-[11px] text-left transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-gray-700 truncate">{c.name}</div>
                        <div className="text-gray-400 text-[10px]">
                          {new Date(c.date).toLocaleDateString()} · {fmtMMSS(c.durationSec)}
                        </div>
                      </div>
                      <div className="font-mono font-bold text-gray-900 shrink-0">
                        {formatCpValue(c.value, draft.sport)}
                      </div>
                    </button>
                  ))
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {fit.valid && (
        <div className="rounded-xl bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-100 p-3 mb-3">
          <div className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider mb-1">Live fit</div>
          <div className="flex items-center justify-around text-sm mb-2">
            <div>
              <div className="text-[10px] text-indigo-700 font-semibold">CP</div>
              <div className="font-bold text-gray-900">{formatCpValue(fit.cp, draft.sport)}</div>
            </div>
            <div>
              <div className="text-[10px] text-indigo-700 font-semibold">W'</div>
              <div className="font-bold text-gray-900">
                {draft.sport === 'bike'
                  ? `${(fit.wPrime / 1000).toFixed(1)} kJ`
                  : `${Math.round(fit.wPrime)}`}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-indigo-700 font-semibold">@ 20 min</div>
              <div className="font-bold text-gray-900">{formatCpValue(predictAtDuration(20 * 60, fit, draft.sport), draft.sport)}</div>
            </div>
            <div>
              <div className="text-[10px] text-indigo-700 font-semibold">@ 60 min</div>
              <div className="font-bold text-gray-900">{formatCpValue(predictAtDuration(60 * 60, fit, draft.sport), draft.sport)}</div>
            </div>
          </div>
          {/* Visual model: hyperbola with measured efforts overlaid */}
          <div className="bg-white/70 rounded-lg p-2">
            <HyperbolaChart efforts={draft.efforts} sport={draft.sport} height={200} />
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 px-3 py-2 text-sm text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave || saving}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Save size={14} /> {saving ? 'Saving…' : initial?._id ? 'Update' : 'Save'}
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────── Main panel ─────────────────────────────────── */

export default function CPTestPanel({ athleteId, sport = 'bike' }) {
  const { addNotification } = useNotification();
  const [tests, setTests] = useState([]);
  const [lactateTests, setLactateTests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);   // null | 'new' | <test object>

  const loadAll = useCallback(async () => {
    if (!athleteId) { setLoading(false); return; }
    setLoading(true);
    try {
      const [cpRes, lacRes] = await Promise.all([
        getCPTestsByAthleteId(athleteId).catch(() => []),
        getTestingsByAthleteId(athleteId).catch(() => []),
      ]);
      setTests(Array.isArray(cpRes) ? cpRes : []);
      setLactateTests(Array.isArray(lacRes) ? lacRes : (lacRes?.data || []));
    } finally {
      setLoading(false);
    }
  }, [athleteId]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const lt2 = useMemo(() => latestLt2(lactateTests, sport), [lactateTests, sport]);

  const filtered = useMemo(
    () => tests.filter(t => t.sport === sport).sort((a, b) => new Date(b.date) - new Date(a.date)),
    [tests, sport]
  );

  const handleSaved = (saved) => {
    setEditing(null);
    setTests(prev => {
      const without = prev.filter(t => t._id !== saved._id);
      return [saved, ...without];
    });
  };

  const handleDelete = async (test) => {
    if (!window.confirm(`Delete CP test from ${new Date(test.date).toLocaleDateString()}?`)) return;
    try {
      await deleteCPTest(test._id);
      setTests(prev => prev.filter(t => t._id !== test._id));
      addNotification('CP test deleted.', 'success');
    } catch (err) {
      addNotification(err?.response?.data?.error || 'Delete failed', 'error');
    }
  };

  return (
    <div className="space-y-3">
      {/* Header with quick-add */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap size={16} className="text-indigo-500" />
          <h3 className="font-bold text-gray-900">Critical Power Tests</h3>
          <span className="text-xs text-gray-400">({filtered.length})</span>
        </div>
        {!editing && (
          <button
            onClick={() => setEditing('new')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition-colors"
          >
            <Plus size={12} /> New CP test
          </button>
        )}
      </div>

      {/* LT2 reference banner */}
      {lt2 && !editing && (
        <div className="rounded-xl bg-blue-50 border border-blue-100 p-3 text-xs text-blue-800">
          <strong>Latest LT2 ({sport}):</strong> {formatCpValue(lt2.value, sport)} from{' '}
          {new Date(lt2.testDate).toLocaleDateString()} — used for comparison below.
        </div>
      )}

      {/* Trend chart — only shown when there are ≥ 2 tests to compare. Classic
          "time-trial progression" view a coach gets in TrainingPeaks/WKO. */}
      {!editing && filtered.length >= 2 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-bold text-gray-900">CP progression</h4>
            <span className="text-[10px] text-gray-400">{filtered.length} tests</span>
          </div>
          <CPTrendChart tests={filtered} sport={sport} height={180} />
        </div>
      )}

      {/* Editor */}
      <AnimatePresence>
        {editing && (
          <motion.div
            key="editor"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <CPTestEditor
              initial={editing === 'new' ? null : editing}
              athleteId={athleteId}
              sport={sport}
              onSaved={handleSaved}
              onCancel={() => setEditing(null)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* List */}
      {loading ? (
        <div className="text-center text-sm text-gray-400 py-8">Loading…</div>
      ) : filtered.length === 0 && !editing ? (
        <div className="text-center text-sm text-gray-400 py-8 bg-gray-50 rounded-2xl border border-gray-100">
          No CP tests yet for {sport}. Click <strong>New CP test</strong> to add the first one.
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(test => (
            <CPTestCard
              key={test._id}
              test={test}
              lt2={lt2}
              onEdit={() => setEditing(test)}
              onDelete={() => handleDelete(test)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
