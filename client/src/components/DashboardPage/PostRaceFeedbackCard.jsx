/**
 * PostRaceFeedbackCard — quick debrief after a race (+1 day).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { getRaceEvents, submitRaceFeedback } from '../../services/api';
import SportIcon from '../shared/SportIcon';

const FEELINGS = [
  { id: 'great', label: 'Skvěle', emoji: '🔥' },
  { id: 'good', label: 'Dobře', emoji: '👍' },
  { id: 'ok', label: 'Ujde', emoji: '😐' },
  { id: 'tough', label: 'Těžké', emoji: '😓' },
  { id: 'rough', label: 'Špatně', emoji: '😞' },
];

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function daysSinceRace(date) {
  const race = startOfDay(date);
  const today = startOfDay(new Date());
  return Math.round((today - race) / (24 * 60 * 60 * 1000));
}

export default function PostRaceFeedbackCard({
  athleteId = null,
  focusRaceId = null,
  onSubmitted,
  compact = false,
}) {
  const [races, setRaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState(focusRaceId || null);
  const [rpe, setRpe] = useState(6);
  const [feeling, setFeeling] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!athleteId) {
      setRaces([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const to = new Date();
      const from = new Date();
      from.setDate(from.getDate() - 14);
      const { data } = await getRaceEvents(athleteId, {
        from: from.toISOString(),
        to: to.toISOString(),
      });
      const pending = (Array.isArray(data) ? data : []).filter((r) => {
        const days = daysSinceRace(r.date);
        if (days < 1 || days > 7) return false;
        return !r.postRaceFeedback?.submittedAt;
      });
      setRaces(pending);
      if (focusRaceId) setActiveId(focusRaceId);
      else setActiveId((cur) => cur || (pending[0] ? String(pending[0]._id) : null));
    } catch {
      setRaces([]);
    } finally {
      setLoading(false);
    }
  }, [athleteId, focusRaceId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (focusRaceId) setActiveId(focusRaceId);
  }, [focusRaceId]);

  const activeRace = useMemo(
    () => races.find((r) => String(r._id) === String(activeId)) || races[0] || null,
    [races, activeId]
  );

  if (loading || !activeRace) return null;

  const handleSubmit = async () => {
    setSaving(true);
    setError('');
    try {
      const { data } = await submitRaceFeedback(activeRace._id, { rpe, feeling, notes });
      setRaces((prev) => prev.filter((r) => String(r._id) !== String(activeRace._id)));
      onSubmitted?.(data);
    } catch (e) {
      setError(e?.response?.data?.error || 'Uložení se nepovedlo');
    } finally {
      setSaving(false);
    }
  };

  const dateLabel = new Date(activeRace.date).toLocaleDateString('cs-CZ', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

  return (
    <div
      className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-4 shadow-sm"
      style={compact ? { padding: 12 } : undefined}
    >
      <div className="flex items-start gap-3 mb-3">
        {activeRace.sport && (
          <span className="w-9 h-9 rounded-xl bg-white/80 flex items-center justify-center shrink-0">
            <SportIcon sport={activeRace.sport} className="w-5 h-5" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide">Po závodu</p>
          <h3 className="text-base font-bold text-gray-900 truncate">{activeRace.name}</h3>
          <p className="text-xs text-gray-600">{dateLabel} — jak to šlo?</p>
        </div>
      </div>

      {races.length > 1 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {races.map((r) => (
            <button
              key={r._id}
              type="button"
              onClick={() => setActiveId(String(r._id))}
              className={`text-[11px] px-2 py-1 rounded-full border ${
                String(r._id) === String(activeRace._id)
                  ? 'bg-amber-600 text-white border-amber-600'
                  : 'bg-white/70 text-gray-700 border-amber-200'
              }`}
            >
              {r.name}
            </button>
          ))}
        </div>
      )}

      <label className="block text-xs font-medium text-gray-700 mb-1">
        RPE (1–10): <span className="font-bold text-amber-800">{rpe}</span>
      </label>
      <input
        type="range"
        min={1}
        max={10}
        value={rpe}
        onChange={(e) => setRpe(Number(e.target.value))}
        className="w-full mb-3 accent-amber-600"
      />

      <p className="text-xs font-medium text-gray-700 mb-1.5">Pocit ze závodu</p>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {FEELINGS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFeeling(f.id)}
            className={`text-xs px-2.5 py-1.5 rounded-xl border transition-colors ${
              feeling === f.id
                ? 'bg-amber-600 text-white border-amber-600'
                : 'bg-white/80 text-gray-700 border-amber-100 hover:border-amber-300'
            }`}
          >
            <span className="mr-1">{f.emoji}</span>
            {f.label}
          </button>
        ))}
      </div>

      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Poznámka pro sebe nebo trenéra…"
        rows={compact ? 2 : 3}
        className="w-full text-sm rounded-xl border border-amber-100 bg-white/90 px-3 py-2 mb-3 resize-none focus:outline-none focus:ring-2 focus:ring-amber-300"
      />

      {error && <p className="text-xs text-red-600 mb-2">{error}</p>}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={saving}
        className="w-full py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold disabled:opacity-60"
      >
        {saving ? 'Ukládám…' : 'Uložit reflexi'}
      </button>
    </div>
  );
}
