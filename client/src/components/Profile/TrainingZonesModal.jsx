import React, { useEffect, useMemo, useState } from 'react';
import Modal from '../Modal';
import { ltZones } from '../../utils/trainingZoneBounds';
import { parsePaceSeconds, formatPaceClock } from '../../utils/paceText';
import { paceToViewer, paceFromViewer, viewerPaceSuffix, viewerIsImperial } from '../../utils/viewerUnits';

/**
 * The full zone editor — every sport, every zone, by hand or generated.
 *
 * Two anchors per sport drive it: LT1 and LT2 give the power or pace zones,
 * max heart rate gives the heart-rate zones, and one button derives whatever
 * the anchors it has allow. Every number stays editable underneath, because a
 * coach who knows better than the formula should not have to fight it.
 *
 * Pace is typed the way it is spoken — 4:20 — and stored the way the model
 * keeps it, in seconds; the fields translate at the edge.
 */

// Zone edges are shared, so a description names the boundary pair it spans.
// The old wording ("100% LT1 - 95% LT2", "96%-104% LT2") described edges that
// were computed independently and therefore left gaps between the zones.
const ZONE_DESCRIPTIONS = {
  zone1: '< 90% LT1 (recovery / easy)',
  zone2: '90%-100% LT1',
  zone3: 'LT1 - LT2 (tempo)',
  zone4: 'LT2 - 104% LT2 (threshold)',
  zone5: '> 104% LT2 (VO₂max+ / sprint)',
};

const withDescriptions = (zones) =>
  zones && Object.fromEntries(
    Object.entries(zones).map(([key, z]) => [key, { ...z, description: ZONE_DESCRIPTIONS[key] }])
  );

const ZONES = [
  { key: 'zone1', n: 1, name: 'Recovery', color: '#60A5FA', hint: 'below 90% of LT1' },
  { key: 'zone2', n: 2, name: 'Endurance', color: '#34D399', hint: '90–100% of LT1' },
  { key: 'zone3', n: 3, name: 'Tempo', color: '#FBBF24', hint: 'LT1 to LT2' },
  { key: 'zone4', n: 4, name: 'Threshold', color: '#F97316', hint: 'LT2 to 104% of LT2' },
  { key: 'zone5', n: 5, name: 'VO₂max', color: '#F43F5E', hint: 'above 104% of LT2' },
];

const SPORTS = [
  { id: 'cycling', label: 'Bike', pace: false },
  { id: 'running', label: 'Run', pace: true },
  { id: 'swimming', label: 'Swim', pace: true },
];
const SPORT_IDS = SPORTS.map((s) => s.id);

const IOS = {
  blue: '#007AFF',
  red: '#FF3B30',
  label: '#000000',
  secondary: 'rgba(60,60,67,0.6)',
  tertiary: 'rgba(60,60,67,0.3)',
  separator: 'rgba(60,60,67,0.14)',
  fill: 'rgba(118,118,128,0.12)',
  grouped: '#F2F2F7',
};
const FONT = '-apple-system, "SF Pro Text", "SF Pro Display", system-ui, sans-serif';

const toStringOrEmpty = (value) => (value === undefined || value === null ? '' : String(value));
const toNumberOrUndefined = (value) => {
  if (value === '' || value === null || value === undefined) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
};

/** The form's copy of one sport's power/pace zones, as strings. */
function readPowerSport(src = {}) {
  const out = {};
  ZONES.forEach(({ key }) => {
    const z = src[key] || {};
    out[key] = {
      min: toStringOrEmpty(z.min),
      max: toStringOrEmpty(z.max),
      description: z.description || '',
      lactate: { min: toStringOrEmpty(z.lactate?.min), max: toStringOrEmpty(z.lactate?.max) },
    };
  });
  out.lt1 = toStringOrEmpty(src.lt1);
  out.lt2 = toStringOrEmpty(src.lt2);
  return out;
}

function readHrSport(src = {}) {
  const out = {};
  ZONES.forEach(({ key }) => {
    const z = src[key] || {};
    out[key] = { min: toStringOrEmpty(z.min), max: toStringOrEmpty(z.max), description: z.description || '' };
  });
  out.maxHeartRate = toStringOrEmpty(src.maxHeartRate);
  out.lastUpdated = src.lastUpdated || undefined;
  return out;
}

function mapPowerZoneForSubmit(zone = {}) {
  const lactateMin = toNumberOrUndefined(zone?.lactate?.min);
  const lactateMax = toNumberOrUndefined(zone?.lactate?.max);
  const hasLactate = lactateMin !== undefined || lactateMax !== undefined;
  return {
    min: toNumberOrUndefined(zone?.min),
    max: toNumberOrUndefined(zone?.max),
    description: zone?.description || undefined,
    lactate: hasLactate ? { min: lactateMin, max: lactateMax } : undefined,
  };
}

function mapPowerSportForSubmit(sport) {
  if (!sport) return undefined;
  const out = {};
  ZONES.forEach(({ key }) => { out[key] = mapPowerZoneForSubmit(sport[key]); });
  out.lt1 = sport.lt1 ? Number(sport.lt1) : undefined;
  out.lt2 = sport.lt2 ? Number(sport.lt2) : undefined;
  out.lastUpdated = new Date();
  return out;
}

function mapHrSportForSubmit(sport) {
  if (!sport) return undefined;
  const out = {};
  ZONES.forEach(({ key }) => {
    const z = sport[key] || {};
    out[key] = {
      min: z.min ? Number(z.min) : undefined,
      max: z.max ? Number(z.max) : undefined,
      description: z.description || undefined,
    };
  });
  out.maxHeartRate = sport.maxHeartRate ? Number(sport.maxHeartRate) : undefined;
  out.lastUpdated = sport.lastUpdated || new Date();
  return out;
}

/** iOS segmented control. */
function Segmented({ value, options, onChange }) {
  return (
    <div className="flex gap-0.5 rounded-[10px] p-0.5" style={{ background: IOS.fill }} role="tablist">
      {options.map((o) => {
        const on = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(o.id)}
            className={`min-h-[32px] flex-1 rounded-[8px] px-3 text-[13px] font-semibold transition-colors ${on ? 'bg-white' : ''}`}
            style={on
              ? { color: IOS.label, boxShadow: '0 1px 3px rgba(0,0,0,0.10), 0 0 0 0.5px rgba(0,0,0,0.04)' }
              : { color: IOS.secondary }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * A quiet numeric field with its unit inside the box.
 *
 * `pace` fields show m:ss and hand back seconds; while the athlete is still
 * typing, the text is theirs and is only translated once they leave the field.
 */
function Field({ value, onChange, unit, placeholder, pace = false, paceSport = 'run', step, size = 'md', ariaLabel }) {
  const [draft, setDraft] = useState(null);
  // Stored per km / per 100 m; shown and typed in the viewer's unit.
  const shown = draft != null ? draft : (pace ? formatPaceClock(paceToViewer(value, paceSport)) : (value ?? ''));
  const commitPace = () => {
    if (draft == null) return;
    const secs = parsePaceSeconds(draft);
    onChange(secs != null ? String(Math.round(paceFromViewer(secs, paceSport))) : '');
    setDraft(null);
  };
  const cls = size === 'sm'
    ? 'h-[34px] min-w-[52px] text-[13px] pl-2.5'
    : 'h-[42px] text-[15px] pl-3';
  return (
    <div className="relative min-w-0">
      <input
        type={pace ? 'text' : 'number'}
        inputMode={pace ? 'numeric' : 'decimal'}
        step={step}
        value={shown}
        aria-label={ariaLabel}
        placeholder={placeholder}
        onChange={(e) => (pace ? setDraft(e.target.value) : onChange(e.target.value))}
        onBlur={pace ? commitPace : undefined}
        onKeyDown={pace ? (e) => { if (e.key === 'Enter') { e.preventDefault(); commitPace(); } } : undefined}
        className={`w-full rounded-[10px] bg-white tabular-nums outline-none transition-shadow focus:ring-2 focus:ring-[#007AFF]/40 ${cls} ${unit ? 'pr-10' : 'pr-2.5'}`}
        style={{ color: IOS.label, boxShadow: `0 0 0 0.5px ${IOS.separator}`, fontFamily: FONT }}
      />
      {unit && (
        <span
          className={`pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 ${size === 'sm' ? 'text-[11px]' : 'text-[12px]'}`}
          style={{ color: IOS.tertiary }}
        >
          {unit}
        </span>
      )}
    </div>
  );
}

/** Min – max, one line. */
function Range({ min, max, onMin, onMax, unit, pace, paceSport, step, last, label }) {
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <Field size="sm" value={min} onChange={onMin} unit={unit} pace={pace} paceSport={paceSport} step={step} placeholder="min" ariaLabel={`${label} min`} />
      <span className="text-[12px] flex-shrink-0" style={{ color: IOS.tertiary }}>–</span>
      <Field size="sm" value={max} onChange={onMax} unit={unit} pace={pace} paceSport={paceSport} step={step} placeholder={last ? '∞' : 'max'} ariaLabel={`${label} max`} />
    </div>
  );
}

/**
 * @param {string|null} forAthlete  the athlete's name when a coach is setting
 *   someone else's zones — it goes in the title so the coach knows whose
 */
const TrainingZonesModal = ({ isOpen, onClose, onSubmit, userData, forAthlete = null }) => {
  const [formData, setFormData] = useState({});
  const [error, setError] = useState('');
  const [selectedSport, setSelectedSport] = useState('cycling');
  /** Where the numbers in the fields came from, when not from the profile. */
  const [prefillNote, setPrefillNote] = useState(null);

  useEffect(() => {
    if (!userData) return;
    const sportId = userData._selectedSport && SPORT_IDS.includes(userData._selectedSport) ? userData._selectedSport : null;
    if (sportId) setSelectedSport(sportId);
    const powerZones = {};
    const heartRateZones = {};
    SPORT_IDS.forEach((id) => {
      powerZones[id] = readPowerSport(userData.powerZones?.[id]);
      heartRateZones[id] = readHrSport(userData.heartRateZones?.[id]);
    });

    // An estimate handed in for review: the thresholds go into the fields
    // and the zones they imply are drawn at once, so what the athlete sees is
    // exactly what Save would keep. Heart-rate zones are left alone.
    const prefill = userData._prefill;
    if (prefill && sportId) {
      const sp = powerZones[sportId];
      if (prefill.lt1 > 0) sp.lt1 = String(Math.round(prefill.lt1));
      if (prefill.lt2 > 0) sp.lt2 = String(Math.round(prefill.lt2));
      const lt1 = Number(sp.lt1);
      const lt2 = Number(sp.lt2);
      const pace = sportId !== 'cycling';
      if (lt1 > 0 && lt2 > 0 && (pace ? lt2 < lt1 : lt2 > lt1)) {
        const zones = withDescriptions(ltZones({ lt1, lt2, ascending: !pace, floorFactor: 0.50, topFactor: 1.30 }));
        if (zones) {
          ZONES.forEach(({ key }) => {
            sp[key] = { ...zones[key], lactate: sp[key]?.lactate || { min: '', max: '' } };
          });
        }
      }
    }
    setPrefillNote(prefill?.note || null);
    setFormData({ powerZones, heartRateZones });
  }, [userData]);

  useEffect(() => { setError(''); }, [selectedSport]);

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');
    const powerZones = {};
    const heartRateZones = {};
    SPORT_IDS.forEach((id) => {
      powerZones[id] = mapPowerSportForSubmit(formData.powerZones?.[id]);
      heartRateZones[id] = mapHrSportForSubmit(formData.heartRateZones?.[id]);
    });
    onSubmit({
      powerZones: formData.powerZones ? powerZones : undefined,
      heartRateZones: formData.heartRateZones ? heartRateZones : undefined,
    });
  };

  const sport = SPORTS.find((s) => s.id === selectedSport) || SPORTS[0];
  const power = useMemo(() => formData.powerZones?.[selectedSport] || {}, [formData.powerZones, selectedSport]);
  const hr = formData.heartRateZones?.[selectedSport] || {};

  const setPower = (patch) => setFormData((prev) => ({
    ...prev,
    powerZones: { ...prev.powerZones, [selectedSport]: { ...prev.powerZones?.[selectedSport], ...patch } },
  }));
  const setHr = (patch) => setFormData((prev) => ({
    ...prev,
    heartRateZones: { ...prev.heartRateZones, [selectedSport]: { ...prev.heartRateZones?.[selectedSport], ...patch } },
  }));
  const setPowerZone = (key, patch) => setFormData((prev) => {
    const cur = prev.powerZones?.[selectedSport] || {};
    return {
      ...prev,
      powerZones: { ...prev.powerZones, [selectedSport]: { ...cur, [key]: { ...cur[key], ...patch } } },
    };
  });
  const setLactate = (key, patch) => setFormData((prev) => {
    const cur = prev.powerZones?.[selectedSport] || {};
    const zone = cur[key] || {};
    return {
      ...prev,
      powerZones: { ...prev.powerZones, [selectedSport]: { ...cur, [key]: { ...zone, lactate: { ...zone.lactate, ...patch } } } },
    };
  });
  const setHrZone = (key, patch) => setFormData((prev) => {
    const cur = prev.heartRateZones?.[selectedSport] || {};
    return {
      ...prev,
      heartRateZones: { ...prev.heartRateZones, [selectedSport]: { ...cur, [key]: { ...cur[key], ...patch } } },
    };
  });

  /**
   * Derive what the anchors allow: power/pace zones from LT1 and LT2, heart
   * rate zones from max HR — either, or both, in one press.
   */
  const generate = () => {
    const lt1 = parseFloat(power.lt1);
    const lt2 = parseFloat(power.lt2);
    const maxHR = parseFloat(hr.maxHeartRate);
    const hasLt = Number.isFinite(lt1) && Number.isFinite(lt2) && lt1 > 0 && lt2 > 0;
    const hasHr = Number.isFinite(maxHR) && maxHR > 0;

    if (!hasLt && !hasHr) {
      setError(sport.pace
        ? 'Enter LT1 and LT2 as a pace, or a max heart rate, to generate zones.'
        : 'Enter LT1 and LT2 in watts, or a max heart rate, to generate zones.');
      return;
    }
    if (hasLt) {
      if (!sport.pace && lt2 <= lt1) { setError('LT2 must be higher than LT1 — it is the harder of the two.'); return; }
      if (sport.pace && lt2 >= lt1) { setError('LT2 must be the faster pace — fewer minutes per ' + paceUnit.slice(1) + ' than LT1.'); return; }
      const zones = withDescriptions(ltZones({
        lt1, lt2, ascending: !sport.pace, floorFactor: 0.50, topFactor: 1.30,
      }));
      // Keep any lactate the athlete typed against the zones.
      const merged = {};
      ZONES.forEach(({ key }) => {
        merged[key] = { ...zones[key], lactate: power[key]?.lactate || { min: '', max: '' } };
      });
      setPower({ ...merged, lt1, lt2 });
    }
    if (hasHr) {
      setHr({
        zone1: { min: Math.round(maxHR * 0.50), max: Math.round(maxHR * 0.60), description: '50–60% Max HR (Recovery)' },
        zone2: { min: Math.round(maxHR * 0.60), max: Math.round(maxHR * 0.70), description: '60–70% Max HR (Aerobic)' },
        zone3: { min: Math.round(maxHR * 0.70), max: Math.round(maxHR * 0.80), description: '70–80% Max HR (Tempo)' },
        zone4: { min: Math.round(maxHR * 0.80), max: Math.round(maxHR * 0.90), description: '80–90% Max HR (Threshold)' },
        zone5: { min: Math.round(maxHR * 0.90), max: Math.round(maxHR * 1.00), description: '90–100% Max HR (VO2max)' },
        maxHeartRate: maxHR,
        lastUpdated: new Date(),
      });
    }
    setError('');
  };

  // Pace is shown in the units of whoever is looking — the same rule as every
  // other pace on screen — and stored per kilometre / per 100 m underneath.
  const paceSport = sport.id === 'swimming' ? 'swim' : 'run';
  const paceUnit = viewerPaceSuffix(paceSport);
  const imperial = viewerIsImperial();
  const mainUnit = sport.pace ? paceUnit : 'W';
  const mainLabel = sport.pace ? 'Pace' : 'Power';
  const paceHint = sport.id === 'swimming'
    ? (imperial ? ['1:40', '1:25'] : ['1:50', '1:35'])
    : (imperial ? ['7:15', '6:25'] : ['4:30', '4:00']);
  const fmtPaceView = (secs) => formatPaceClock(paceToViewer(secs, paceSport));

  // The ladder: five bands, the number at each step. Equal widths — pace runs
  // the other way and a proportional bar would have to explain itself.
  const ladder = useMemo(() => {
    const mins = ZONES.map(({ key }) => Number(power[key]?.min));
    if (!mins.every((n) => Number.isFinite(n) && n > 0)) return null;
    return ZONES.map((z, i) => ({
      ...z,
      from: sport.pace ? fmtPaceView(mins[i]) : Math.round(mins[i]),
      to: i < ZONES.length - 1 ? (sport.pace ? fmtPaceView(mins[i + 1]) : Math.round(mins[i + 1])) : null,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [power, sport.pace, paceSport]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={forAthlete ? `Training zones · ${forAthlete}` : 'Training zones'}>
      <form onSubmit={handleSubmit} className="space-y-5" style={{ fontFamily: FONT }}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[13px] leading-snug" style={{ color: IOS.secondary }}>
            Two thresholds give the {sport.pace ? 'pace' : 'power'} zones, a max heart rate gives the heart-rate zones.
            {forAthlete ? ` They are saved to ${forAthlete}\u2019s profile.` : ' Every number below stays yours to change.'}
          </p>
          <div className="w-full sm:w-[280px] flex-shrink-0">
            <Segmented value={selectedSport} options={SPORTS} onChange={setSelectedSport} />
          </div>
        </div>

        {/* Thresholds */}
        <div className="rounded-2xl p-4" style={{ background: IOS.grouped }}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="block min-w-0">
              <span className="mb-1.5 block text-[12px] font-semibold uppercase tracking-[0.05em]" style={{ color: IOS.secondary }}>LT1</span>
              <Field
                value={power.lt1}
                onChange={(v) => setPower({ lt1: v })}
                unit={mainUnit}
                pace={sport.pace}
                paceSport={paceSport}
                placeholder={sport.pace ? paceHint[0] : '200'}
                ariaLabel="LT1"
              />
            </label>
            <label className="block min-w-0">
              <span className="mb-1.5 block text-[12px] font-semibold uppercase tracking-[0.05em]" style={{ color: IOS.secondary }}>LT2 · threshold</span>
              <Field
                value={power.lt2}
                onChange={(v) => setPower({ lt2: v })}
                unit={mainUnit}
                pace={sport.pace}
                paceSport={paceSport}
                placeholder={sport.pace ? paceHint[1] : '280'}
                ariaLabel="LT2"
              />
            </label>
            <label className="block min-w-0">
              <span className="mb-1.5 block text-[12px] font-semibold uppercase tracking-[0.05em]" style={{ color: IOS.secondary }}>Max heart rate</span>
              <Field
                value={hr.maxHeartRate}
                onChange={(v) => setHr({ maxHeartRate: v })}
                unit="bpm"
                placeholder="190"
                ariaLabel="Max heart rate"
              />
            </label>
          </div>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-[12px] min-h-[16px]" style={{ color: error ? IOS.red : (prefillNote ? '#5856D6' : IOS.tertiary) }} role={error ? 'alert' : undefined}>
              {error || prefillNote || (sport.pace ? `Pace as m:ss per ${paceUnit.slice(1)} — ${paceHint[1]}, not seconds.` : 'Watts at LT1 and LT2 from your last test.')}
            </div>
            <button
              type="button"
              onClick={generate}
              className="h-[38px] rounded-[10px] px-4 text-[14px] font-semibold text-white transition-opacity active:opacity-80 sm:flex-shrink-0"
              style={{ background: IOS.blue }}
            >
              Generate zones
            </button>
          </div>
        </div>

        {/* The ladder */}
        {ladder && (
          <div>
            <div className="flex overflow-hidden rounded-[10px]">
              {ladder.map((z) => (
                <div
                  key={z.key}
                  className="flex-1 min-w-0 px-1.5 py-1.5 text-center text-[11px] font-semibold text-white tabular-nums"
                  style={{ background: z.color }}
                  title={`${z.name}: ${z.from}${z.to ? ` – ${z.to}` : ' +'}`}
                >
                  <div className="truncate">Z{z.n}</div>
                  <div className="truncate opacity-90 font-medium">{z.from}{z.to ? '–' : '+'}{z.to || ''}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Zones */}
        <div>
          <div className="hidden sm:grid grid-cols-[150px_1fr_1fr_1fr] gap-3 px-1 pb-2 text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: IOS.secondary }}>
            <div>Zone</div>
            <div>{mainLabel} ({mainUnit})</div>
            <div>Heart rate (bpm)</div>
            <div>Lactate (mmol/L)</div>
          </div>
          <div className="overflow-hidden rounded-2xl" style={{ boxShadow: `0 0 0 0.5px ${IOS.separator}` }}>
            {ZONES.map((z, i) => {
              const pz = power[z.key] || {};
              const hz = hr[z.key] || {};
              const last = i === ZONES.length - 1;
              return (
                <div
                  key={z.key}
                  className="grid grid-cols-1 gap-2.5 px-3 py-3 sm:grid-cols-[150px_1fr_1fr_1fr] sm:items-center sm:gap-3"
                  style={{ borderTop: i ? `0.5px solid ${IOS.separator}` : 'none', borderLeft: `3px solid ${z.color}` }}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className="inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                      style={{ background: z.color }}
                    >
                      {z.n}
                    </span>
                    <div className="min-w-0">
                      <div className="text-[13px] font-semibold leading-tight" style={{ color: IOS.label }}>{z.name}</div>
                      <div className="text-[11px] leading-tight truncate" style={{ color: IOS.secondary }}>{z.hint}</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 sm:contents">
                    <div>
                      <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-[0.05em] sm:hidden" style={{ color: IOS.secondary }}>{mainLabel} ({mainUnit})</div>
                      <Range
                        label={`Zone ${z.n} ${mainLabel.toLowerCase()}`}
                        min={pz.min} max={pz.max}
                        onMin={(v) => setPowerZone(z.key, { min: v })}
                        onMax={(v) => setPowerZone(z.key, { max: v })}
                        pace={sport.pace}
                        paceSport={paceSport}
                        last={last}
                      />
                    </div>
                    <div>
                      <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-[0.05em] sm:hidden" style={{ color: IOS.secondary }}>Heart rate (bpm)</div>
                      <Range
                        label={`Zone ${z.n} heart rate`}
                        min={hz.min} max={hz.max}
                        onMin={(v) => setHrZone(z.key, { min: v })}
                        onMax={(v) => setHrZone(z.key, { max: v })}
                        last={last}
                      />
                    </div>
                    <div>
                      <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-[0.05em] sm:hidden" style={{ color: IOS.secondary }}>Lactate (mmol/L)</div>
                      <Range
                        label={`Zone ${z.n} lactate`}
                        min={pz.lactate?.min} max={pz.lactate?.max}
                        onMin={(v) => setLactate(z.key, { min: v })}
                        onMax={(v) => setLactate(z.key, { max: v })}
                        step="0.1"
                        last={last}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end sm:gap-3">
          <button
            type="button"
            onClick={onClose}
            className="h-[42px] rounded-[10px] px-5 text-[15px] font-semibold transition-colors hover:bg-black/[.04]"
            style={{ color: IOS.blue }}
          >
            Not now
          </button>
          <button
            type="submit"
            className="h-[42px] rounded-[10px] px-6 text-[15px] font-semibold text-white transition-opacity active:opacity-80"
            style={{ background: IOS.blue }}
          >
            Save zones
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default TrainingZonesModal;
