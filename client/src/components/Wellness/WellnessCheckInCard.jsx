/**
 * WellnessCheckInCard - the daily wellness check-in on the dashboard.
 *
 * One card for both sides of it:
 *   - the athlete sees "check in" when one is due, then their own trend;
 *   - the coach sees the athlete's trend and sets how often they are asked.
 *
 * For an athlete with the check-in switched off and nothing recent it renders
 * nothing, so it costs the many athletes who never use it no screen space. A
 * coach always sees at least the one-line "off" state, because that is where
 * they switch it on.
 *
 * `variant="native"` wraps it in the glass card the Capacitor dashboard uses
 * and hands pain/illness off to the native episode sheets instead of the web
 * modals. The questions and numbers are the same either way.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { fetchWellnessSummary, saveWellnessFrequency, linkWellnessEpisode, localTodayKey } from '../../services/wellnessCheckInApi';
import { fetchHealthCatalog } from '../../services/healthApi';
import { GlassCard } from '../native/shared/Tiles';
import WellnessCheckInSheet from './WellnessCheckInSheet';
import WellnessTrendView from './WellnessTrendView';
import HealthCheckInModal from '../Health/HealthCheckInModal';
import NewEpisodeModal from '../Health/NewEpisodeModal';
import NativeCheckInSheet from '../Health/NativeCheckInSheet';
import NativeNewEpisodeSheet from '../Health/NativeNewEpisodeSheet';

const FREQUENCY_OPTIONS = [
  { value: 'off', label: 'Off' },
  { value: 'daily', label: 'Daily' },
  ...[2, 3, 4, 7, 14].map((n) => ({ value: `interval:${n}`, label: `Every ${n} days` })),
];

function frequencyValue(f) {
  if (!f || f.mode === 'off') return 'off';
  if (f.mode === 'daily') return 'daily';
  return `interval:${f.everyDays}`;
}

function frequencyLabel(f) {
  if (!f || f.mode === 'off') return 'off';
  if (f.mode === 'daily') return 'daily';
  return `every ${f.everyDays} days`;
}

function FrequencySelect({ frequency, onChange, saving }) {
  const value = frequencyValue(frequency);
  // A stored interval the list does not offer (e.g. 5) still shows as itself.
  const options = FREQUENCY_OPTIONS.some((o) => o.value === value)
    ? FREQUENCY_OPTIONS
    : [...FREQUENCY_OPTIONS, { value, label: `Every ${frequency.everyDays} days` }];
  return (
    <label className="flex items-center gap-1.5 text-xs text-gray-500">
      <span>Ask</span>
      <select
        value={value}
        disabled={saving}
        onChange={(e) => {
          const [mode, n] = e.target.value.split(':');
          onChange({ mode, everyDays: n ? Number(n) : frequency?.everyDays || 2 });
        }}
        className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-800"
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

export default function WellnessCheckInCard({
  athleteId = null,
  variant = 'web',
  style,
  /** For the harness and tests: render this summary instead of fetching one. */
  initialSummary = null,
}) {
  const [summary, setSummary] = useState(initialSummary);
  const [loaded, setLoaded] = useState(Boolean(initialSummary));
  const [formOpen, setFormOpen] = useState(false);
  const [savingFreq, setSavingFreq] = useState(false);
  const [handoff, setHandoff] = useState(null);
  const [catalog, setCatalog] = useState(null);

  const load = useCallback(async () => {
    if (initialSummary) return;
    try {
      setSummary(await fetchWellnessSummary(athleteId));
    } catch {
      setSummary(null);
    } finally {
      setLoaded(true);
    }
  }, [athleteId, initialSummary]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!handoff || catalog) return;
    fetchHealthCatalog().then(setCatalog).catch(() => setCatalog({ catalog: [], bodySites: [], functionalTests: {} }));
  }, [handoff, catalog]);

  if (!loaded || !summary) return null;

  const { latest, frequency, due, viewerIsCoach, canSetFrequency } = summary;
  const off = !frequency || frequency.mode === 'off';
  if (!viewerIsCoach && off && !(summary.rows || []).length) return null;

  const isNative = variant === 'native';
  const checkedInToday = latest?.date === (summary.today || localTodayKey());

  const changeFrequency = async (next) => {
    setSavingFreq(true);
    try {
      const { frequency: saved } = await saveWellnessFrequency({ athleteId, ...next });
      setSummary((s) => ({ ...s, frequency: saved }));
      load();
    } finally {
      setSavingFreq(false);
    }
  };

  const startHandoff = (action, checkIn) => {
    setFormOpen(false);
    if (action.type === 'episode' && checkIn?._id) {
      linkWellnessEpisode(checkIn._id, action.item.episode._id).then(load).catch(() => {});
    }
    setHandoff({ ...action, checkIn });
  };

  const onEpisodeCreated = (created) => {
    const id = created?._id || created?.episode?._id;
    if (id && handoff?.checkIn?._id) {
      linkWellnessEpisode(handoff.checkIn._id, id).then(load).catch(() => {});
    }
  };

  const content = (
    <>
      <div className="flex items-center justify-between gap-2 mb-3">
        <h2 className="text-sm font-semibold text-gray-800">Wellness check-in</h2>
        {canSetFrequency ? (
          <FrequencySelect frequency={frequency} onChange={changeFrequency} saving={savingFreq} />
        ) : (
          <span className="text-xs text-gray-400">Your coach asks {frequencyLabel(frequency)}</span>
        )}
      </div>

      {!viewerIsCoach && (due || !latest) && !off && (
        <button
          type="button"
          onClick={() => setFormOpen(true)}
          className="w-full mb-3 flex items-center justify-between rounded-xl bg-blue-600 text-white px-4 py-3 text-left"
        >
          <span>
            <span className="block text-sm font-semibold">How are you today?</span>
            <span className="block text-xs text-blue-100">Check-in due · about 45 seconds</span>
          </span>
          <span className="text-sm font-semibold">Check in</span>
        </button>
      )}

      {latest ? (
        <WellnessTrendView summary={summary} />
      ) : viewerIsCoach ? (
        <p className="text-xs text-gray-500">
          {off
            ? 'Ask this athlete a six-question check-in (wellbeing, sleep, energy, stress, soreness) and follow the trend here.'
            : 'No check-ins yet. The athlete is asked on their dashboard.'}
        </p>
      ) : null}

      {/* Answering between scheduled days is allowed; it just is not asked for. */}
      {!viewerIsCoach && latest && (checkedInToday || (!due && !off)) && (
        <button
          type="button"
          onClick={() => setFormOpen(true)}
          className="mt-2 text-xs font-medium text-blue-600"
        >
          {checkedInToday ? 'Edit today’s answers' : 'Check in today anyway'}
        </button>
      )}

      <WellnessCheckInSheet
        open={formOpen}
        existing={checkedInToday ? latest : null}
        sharedWithCoach={!canSetFrequency}
        onClose={() => setFormOpen(false)}
        onSaved={load}
        onHandoff={startHandoff}
      />

      {handoff?.type === 'episode' && (isNative ? (
        <NativeCheckInSheet
          open
          episode={handoff.item.episode}
          catalogEntry={handoff.item.catalogEntry}
          functionalTests={catalog?.functionalTests || {}}
          onClose={() => setHandoff(null)}
          onSaved={load}
        />
      ) : (
        <HealthCheckInModal
          episode={handoff.item.episode}
          catalogEntry={handoff.item.catalogEntry}
          functionalTests={catalog?.functionalTests || {}}
          onClose={() => setHandoff(null)}
          onSaved={load}
        />
      ))}

      {handoff?.type === 'new' && catalog && (isNative ? (
        <NativeNewEpisodeSheet
          open
          catalog={catalog.catalog}
          bodySites={catalog.bodySites}
          onClose={() => setHandoff(null)}
          onCreated={onEpisodeCreated}
        />
      ) : (
        <NewEpisodeModal
          catalog={catalog.catalog}
          bodySites={catalog.bodySites}
          onClose={() => setHandoff(null)}
          onCreated={onEpisodeCreated}
        />
      ))}
    </>
  );

  if (isNative) return <GlassCard style={{ padding: '14px 16px', ...style }}>{content}</GlassCard>;
  return (
    <div className="rounded-2xl bg-white ring-1 ring-slate-200/70 shadow-sm p-4 sm:p-5" style={style}>
      {content}
    </div>
  );
}
