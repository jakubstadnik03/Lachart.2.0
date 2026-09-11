/**
 * The two numbers an activity needs before it can mean anything.
 *
 * Without zones a session is a title and a duration: no time-in-zone, no
 * TSS, nothing to compare against. The full zone editor asks for five zones
 * per sport with lactate ranges on each, and asks for pace as raw seconds —
 * the right tool for a coach, the wrong first question for an athlete who
 * just opened a run. This asks for LT1 and LT2 in the sport they opened, in
 * the unit they think in, and derives the rest the way the app already does.
 *
 * Shown on opening an activity while the profile has no zones. "Later" is
 * per app session, not forever: the point is to keep asking until it is
 * done, without asking on every single tap of one sitting.
 */
import React, { useEffect, useMemo, useState } from 'react';
import ReactDOM from 'react-dom';
import api, { updateUserProfile } from '../../services/api';
import { ltZones } from '../../utils/trainingZoneBounds';
import { requestTrainingZonesModal } from '../../utils/trainingZonesSetup';

const IOS = {
  blue: '#007AFF',
  label: '#000000',
  secondary: 'rgba(60,60,67,0.6)',
  tertiary: 'rgba(60,60,67,0.3)',
  separator: 'rgba(60,60,67,0.14)',
  fill: 'rgba(118,118,128,0.12)',
  red: '#FF3B30',
};
const FONT = '-apple-system, "SF Pro Text", "SF Pro Display", system-ui, sans-serif';

/** Per sport: where the profile keeps it, what unit, which way is harder. */
const SPORTS = {
  bike: { key: 'cycling', noun: 'ride', unit: 'W', pace: false, hint: ['180', '250'] },
  run: { key: 'running', noun: 'run', unit: '/km', pace: true, hint: ['5:10', '4:20'] },
  swim: { key: 'swimming', noun: 'swim', unit: '/100m', pace: true, hint: ['1:50', '1:35'] },
};

const DISMISS_KEY = (userId) => `zonesNudgeDismissed_${userId}`;

export function zonesNudgeDismissedThisSession(userId) {
  try { return !!userId && sessionStorage.getItem(DISMISS_KEY(userId)) === '1'; } catch { return false; }
}
export function dismissZonesNudgeForSession(userId) {
  try { if (userId) sessionStorage.setItem(DISMISS_KEY(userId), '1'); } catch { /* ignore */ }
}

/** "4:20" → 260; "260" → 260; anything else → null. */
export function parsePaceSeconds(text) {
  const s = String(text || '').trim();
  if (!s) return null;
  if (/^\d+$/.test(s)) return Number(s);
  const m = s.match(/^(\d{1,2})[:.](\d{1,2})$/);
  if (!m) return null;
  const sec = Number(m[1]) * 60 + Number(m[2]);
  return Number(m[2]) < 60 && sec > 0 ? sec : null;
}

/**
 * The zone object to store for a sport, or a reason it cannot be built.
 * Pace runs backwards — LT2 is fewer seconds than LT1 — and that is the
 * mistake this is most likely to be asked to accept.
 */
export function buildZonesFor(sportKind, lt1Text, lt2Text) {
  const meta = SPORTS[sportKind];
  if (!meta) return { error: 'Unsupported sport' };
  const parse = meta.pace ? parsePaceSeconds : (t) => { const n = Number(t); return Number.isFinite(n) && n > 0 ? n : null; };
  const lt1 = parse(lt1Text);
  const lt2 = parse(lt2Text);
  if (lt1 == null || lt2 == null) return { error: meta.pace ? 'Enter both as m:ss.' : 'Enter both in watts.' };
  if (meta.pace ? lt2 >= lt1 : lt2 <= lt1) {
    return { error: meta.pace ? 'LT2 is faster than LT1 — fewer minutes per ' + meta.unit.slice(1) + '.' : 'LT2 is above LT1.' };
  }
  const zones = ltZones({ lt1, lt2, ascending: !meta.pace });
  if (!zones) return { error: 'Those two do not make a set of zones.' };
  return { key: meta.key, zones: { ...zones, lt1, lt2 } };
}

function Field({ label, unit, value, onChange, placeholder, pace }) {
  return (
    <label className="block min-w-0 flex-1">
      <span className="mb-1 block text-[12px] font-semibold" style={{ color: IOS.secondary }}>{label}</span>
      <span className="flex items-baseline gap-1.5 rounded-xl px-3 py-2.5" style={{ background: IOS.fill }}>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          inputMode={pace ? 'numeric' : 'decimal'}
          autoComplete="off"
          className="min-w-0 flex-1 bg-transparent text-[22px] font-semibold tracking-[-0.01em] tabular-nums outline-none"
          style={{ color: IOS.label, fontFamily: FONT }}
        />
        <span className="shrink-0 text-[13px] font-semibold" style={{ color: IOS.tertiary }}>{unit}</span>
      </span>
    </label>
  );
}

export default function ZonesNudgeSheet({ sport = 'bike', user, onClose, onSaved }) {
  const meta = SPORTS[sport] || SPORTS.bike;
  const [lt1, setLt1] = useState('');
  const [lt2, setLt2] = useState('');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const built = useMemo(() => (lt1 && lt2 ? buildZonesFor(sport, lt1, lt2) : null), [sport, lt1, lt2]);

  const later = () => { dismissZonesNudgeForSession(user?._id); onClose?.(); };

  const save = async () => {
    const result = buildZonesFor(sport, lt1, lt2);
    if (result.error) { setError(result.error); return; }
    setSaving(true);
    setError(null);
    try {
      // The same write "Update my zones" makes: the whole profile back, with
      // this sport's zones replaced. Heart-rate zones are left alone.
      const profile = (await api.get('/user/profile')).data || {};
      const powerZones = { ...(profile.powerZones || {}), [result.key]: result.zones };
      const res = await updateUserProfile({ ...profile, powerZones, zonesSource: 'manual' });
      const updated = res?.data?.user || res?.data || { ...profile, powerZones };
      // AuthProvider listens for this and replaces its user, so the next
      // activity opened sees zones and does not ask again.
      window.dispatchEvent(new CustomEvent('userUpdated', { detail: { ...(user || {}), ...updated, powerZones } }));
      onSaved?.(powerZones);
      onClose?.();
    } catch (e) {
      setError(e?.response?.data?.error || 'Could not save. Try again.');
    } finally {
      setSaving(false);
    }
  };

  const openFull = () => { later(); requestTrainingZonesModal({ source: 'activity', sport: meta.key }); };

  return ReactDOM.createPortal(
    <div
      className="fixed inset-0 z-[1200] flex items-end justify-center sm:items-center"
      style={{ background: 'rgba(0,0,0,0.32)', fontFamily: FONT }}
      onClick={(e) => { if (e.target === e.currentTarget) later(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="zones-nudge-title"
    >
      <div
        className="w-full max-w-[420px] rounded-t-[22px] bg-white px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-4 sm:rounded-[22px] sm:pb-5"
        style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.18), 0 0 0 0.5px ' + IOS.separator }}
      >
        <div className="mx-auto mb-4 h-1 w-9 rounded-full sm:hidden" style={{ background: IOS.tertiary }} />

        <h2 id="zones-nudge-title" className="text-[22px] font-semibold tracking-[-0.02em]" style={{ color: IOS.label }}>
          Set your {meta.noun} zones
        </h2>
        <p className="mt-1.5 text-[15px] leading-[1.4]" style={{ color: IOS.secondary }}>
          Two numbers turn every {meta.noun} into time in zones, a TSS, and a comparison
          against your test. Everything else is derived.
        </p>

        <div className="mt-5 flex gap-2.5">
          <Field label="LT1 · aerobic" unit={meta.unit} value={lt1} onChange={setLt1} placeholder={meta.hint[0]} pace={meta.pace} />
          <Field label="LT2 · threshold" unit={meta.unit} value={lt2} onChange={setLt2} placeholder={meta.hint[1]} pace={meta.pace} />
        </div>

        {/* Live check, so the mistake is named before the button is pressed. */}
        <p className="mt-2 min-h-[18px] text-[12px]" style={{ color: error || built?.error ? IOS.red : IOS.tertiary }}>
          {error || built?.error || (built?.zones
            ? `Zone 2 up to ${meta.pace ? fmtPace(built.zones.zone2.max) : built.zones.zone2.max + ' W'}, zone 4 from ${meta.pace ? fmtPace(built.zones.zone4.min) : built.zones.zone4.min + ' W'}.`
            : meta.pace ? 'Enter as m:ss, the way your watch shows it.' : ' ')}
        </p>

        <button
          type="button"
          onClick={save}
          disabled={saving || !lt1 || !lt2}
          className="mt-3 w-full rounded-[14px] py-3.5 text-[17px] font-semibold text-white transition-opacity disabled:opacity-40"
          style={{ background: IOS.blue }}
        >
          {saving ? 'Saving…' : 'Save zones'}
        </button>

        <div className="mt-2 flex items-center justify-between">
          <button type="button" onClick={openFull} className="min-h-[40px] text-[15px] font-medium" style={{ color: IOS.blue }}>
            Open the full editor
          </button>
          <button type="button" onClick={later} className="min-h-[40px] text-[15px] font-medium" style={{ color: IOS.secondary }}>
            Later
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function fmtPace(sec) {
  const s = Math.round(Number(sec) || 0);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
