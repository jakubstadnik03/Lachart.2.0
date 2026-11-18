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
 * `variant="native"` is the Capacitor dashboard's look (glass card, lavender
 * accent) with the native sheets: the check-in form and the injury/illness
 * hand-off. The questions and numbers are the same either way.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { ClipboardCheck, ChevronRight } from 'lucide-react';
import { fetchWellnessSummary, saveWellnessFrequency, linkWellnessEpisode, localTodayKey } from '../../services/wellnessCheckInApi';
import { fetchHealthCatalog } from '../../services/healthApi';
import { GlassCard } from '../native/shared/Tiles';
import WellnessCheckInSheet from './WellnessCheckInSheet';
import NativeWellnessCheckInSheet from './NativeWellnessCheckInSheet';
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

function FrequencySelect({ frequency, onChange, saving, native }) {
  const value = frequencyValue(frequency);
  // A stored interval the list does not offer (e.g. 5) still shows as itself.
  const options = FREQUENCY_OPTIONS.some((o) => o.value === value)
    ? FREQUENCY_OPTIONS
    : [...FREQUENCY_OPTIONS, { value, label: `Every ${frequency.everyDays} days` }];
  const handle = (e) => {
    const [mode, n] = e.target.value.split(':');
    onChange({ mode, everyDays: n ? Number(n) : frequency?.everyDays || 2 });
  };
  if (native) {
    return (
      <label style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{ fontSize: 9.5, fontWeight: 800, color: '#9CA3AF', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          Ask
        </span>
        {/* 14px or iOS zooms the page on focus. */}
        <select
          value={value}
          disabled={saving}
          onChange={handle}
          style={{
            fontFamily: 'inherit', fontSize: 14, fontWeight: 700, color: '#5E6590',
            background: 'rgba(118,126,181,.12)', border: 'none', borderRadius: 9,
            padding: '4px 8px', WebkitAppearance: 'none', appearance: 'none',
          }}
        >
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>
    );
  }
  return (
    <label className="flex items-center gap-1.5 text-xs text-gray-500">
      <span>Ask</span>
      <select
        value={value}
        disabled={saving}
        onChange={handle}
        className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-800"
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

function DuePrompt({ native, onClick }) {
  if (native) {
    return (
      <button
        type="button"
        onClick={onClick}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
          padding: '12px 14px', borderRadius: 14, border: 'none', fontFamily: 'inherit',
          background: '#5E6590', color: '#fff', boxShadow: '0 4px 12px -4px rgba(94,101,144,.5)',
          cursor: 'pointer', WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
        }}
      >
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 14, fontWeight: 800 }}>How are you today?</span>
          <span style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: 'rgba(255,255,255,.75)', marginTop: 1 }}>
            Check-in due · about 45 seconds
          </span>
        </span>
        <ChevronRight size={18} color="#fff" />
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center justify-between rounded-xl bg-blue-600 text-white px-4 py-3 text-left"
    >
      <span>
        <span className="block text-sm font-semibold">How are you today?</span>
        <span className="block text-xs text-blue-100">Check-in due · about 45 seconds</span>
      </span>
      <span className="text-sm font-semibold">Check in</span>
    </button>
  );
}

/** Tell the Health cards an episode or its check-in changed (see HealthEpisodeCard). */
function announceHealthChange() {
  try { window.dispatchEvent(new Event('health:changed')); } catch { /* old webviews */ }
}

export default function WellnessCheckInCard({
  athleteId = null,
  variant = 'web',
  style,
}) {
  const [summary, setSummary] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [savingFreq, setSavingFreq] = useState(false);
  const [handoff, setHandoff] = useState(null);
  const [catalog, setCatalog] = useState(null);

  const load = useCallback(async () => {
    try {
      setSummary(await fetchWellnessSummary(athleteId));
    } catch {
      // A failed refresh keeps what is on screen; only a failed first load
      // hides the card. Otherwise a blip after saving would take the open
      // form down with it.
      setSummary((prev) => prev || null);
    } finally {
      setLoaded(true);
    }
  }, [athleteId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!handoff || catalog) return;
    fetchHealthCatalog().then(setCatalog).catch(() => setCatalog({ catalog: [], bodySites: [], functionalTests: {} }));
  }, [handoff, catalog]);

  if (!loaded || !summary) return null;

  const { latest, frequency, due, viewerIsCoach, canSetFrequency } = summary;
  const off = !frequency || frequency.mode === 'off';
  if (!viewerIsCoach && off && !(summary.rows || []).length) return null;

  const native = variant === 'native';
  const checkedInToday = latest?.date === (summary.today || localTodayKey());
  const showPrompt = !viewerIsCoach && !off && (due || !latest);
  const showLink = !viewerIsCoach && latest && (checkedInToday || (!due && !off));

  const changeFrequency = async (next) => {
    setSavingFreq(true);
    try {
      const { frequency: saved } = await saveWellnessFrequency({ athleteId, ...next });
      setSummary((s) => ({ ...s, frequency: saved }));
      load();
    } catch {
      /* the select snaps back to the stored value on the next render */
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

  const onEpisodeCheckIn = () => {
    announceHealthChange();
    load();
  };

  const onEpisodeCreated = (created) => {
    announceHealthChange();
    const id = created?._id || created?.episode?._id;
    if (id && handoff?.checkIn?._id) {
      linkWellnessEpisode(handoff.checkIn._id, id).then(load).catch(() => {});
    }
  };

  const header = native ? (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
      <ClipboardCheck size={16} color="#767EB5" />
      <span style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>Wellness</span>
      <span style={{ marginLeft: 'auto' }}>
        {canSetFrequency ? (
          <FrequencySelect native frequency={frequency} onChange={changeFrequency} saving={savingFreq} />
        ) : (
          <span style={{ fontSize: 10.5, fontWeight: 800, color: '#5E6590', background: 'rgba(118,126,181,.12)', borderRadius: 8, padding: '3px 8px' }}>
            {frequencyLabel(frequency) === 'off' ? 'Paused' : `Asked ${frequencyLabel(frequency)}`}
          </span>
        )}
      </span>
    </div>
  ) : (
    <div className="flex items-center justify-between gap-2 mb-3">
      <h2 className="text-sm font-semibold text-gray-800">Wellness check-in</h2>
      {canSetFrequency ? (
        <FrequencySelect frequency={frequency} onChange={changeFrequency} saving={savingFreq} />
      ) : (
        <span className="text-xs text-gray-400">Your coach asks {frequencyLabel(frequency)}</span>
      )}
    </div>
  );

  const emptyCoachText = off
    ? 'Ask this athlete a six-question check-in (wellbeing, sleep, energy, stress, soreness) and follow the trend here.'
    : 'No check-ins yet. The athlete is asked on their dashboard.';

  const Sheet = native ? NativeWellnessCheckInSheet : WellnessCheckInSheet;

  const content = (
    <>
      {header}

      {showPrompt && (
        <div style={{ marginBottom: 12 }}>
          <DuePrompt native={native} onClick={() => setFormOpen(true)} />
        </div>
      )}

      {latest ? (
        <WellnessTrendView summary={summary} variant={variant} />
      ) : viewerIsCoach ? (
        native
          ? <div style={{ fontSize: 12, lineHeight: 1.45, color: '#6B7280' }}>{emptyCoachText}</div>
          : <p className="text-xs text-gray-500">{emptyCoachText}</p>
      ) : null}

      {/* Answering between scheduled days is allowed; it just is not asked for. */}
      {showLink && (
        <button
          type="button"
          onClick={() => setFormOpen(true)}
          className={native ? undefined : 'mt-2 text-xs font-medium text-blue-600'}
          style={native ? {
            marginTop: 10, background: 'none', border: 'none', padding: 0, fontFamily: 'inherit',
            fontSize: 12.5, fontWeight: 700, color: '#5E6590', cursor: 'pointer',
          } : undefined}
        >
          {checkedInToday ? 'Edit today’s answers' : 'Check in today anyway'}
        </button>
      )}

      <Sheet
        open={formOpen}
        existing={checkedInToday ? latest : null}
        sharedWithCoach={!canSetFrequency}
        onClose={() => setFormOpen(false)}
        onSaved={load}
        onHandoff={startHandoff}
      />

      {handoff?.type === 'episode' && (native ? (
        <NativeCheckInSheet
          open
          episode={handoff.item.episode}
          catalogEntry={handoff.item.catalogEntry}
          functionalTests={catalog?.functionalTests || {}}
          onClose={() => setHandoff(null)}
          onSaved={onEpisodeCheckIn}
        />
      ) : (
        <HealthCheckInModal
          episode={handoff.item.episode}
          catalogEntry={handoff.item.catalogEntry}
          functionalTests={catalog?.functionalTests || {}}
          onClose={() => setHandoff(null)}
          onSaved={onEpisodeCheckIn}
        />
      ))}

      {handoff?.type === 'new' && catalog && (native ? (
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

  if (native) return <GlassCard style={{ padding: '14px 16px', ...style }}>{content}</GlassCard>;
  return (
    <div className="rounded-2xl bg-white ring-1 ring-slate-200/70 shadow-sm p-4 sm:p-5" style={style}>
      {content}
    </div>
  );
}
