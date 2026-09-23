/**
 * Training zones, read-only, for a profile that is not your own.
 *
 * The coach's athlete page showed everything about an athlete except the one
 * number they coach by. ProfilePage has a richer version of this (zone history
 * and snapshot comparison); this is the compact half of it — the zones as they
 * stand, plus the same Edit entry point, so a coach can fix a threshold from
 * the page they are already reading.
 */
import React, { useMemo, useState, useEffect } from 'react';
import { fmtViewerPaceBare, viewerPaceSuffix } from '../../utils/viewerUnits';

const SPORTS = [
  { id: 'cycling', label: 'Bike', icon: '/icon/bike.svg' },
  { id: 'running', label: 'Run', icon: '/icon/run.svg' },
  { id: 'swimming', label: 'Swim', icon: '/icon/swim.svg' },
];

const ZONE_COLORS = ['bg-[#22c55e]', 'bg-[#3b82f6]', 'bg-[#fbbf24]', 'bg-[#ef4444]', 'bg-[#8b5cf6]'];
const ZONE_NAMES = ['Recovery / Easy', 'Aerobic Base', 'Tempo / Steady', 'Threshold', 'VO₂max / Sprint'];

const paceSportOf = (sport) => (sport === 'swimming' ? 'swim' : 'run');

const hasZonesFor = (powerZones, sport) => {
  const zones = powerZones?.[sport];
  if (!zones || typeof zones !== 'object') return false;
  if (zones.lt1 != null || zones.lt2 != null) return true;
  for (let i = 1; i <= 5; i++) {
    const zone = zones[`zone${i}`];
    if (!zone || typeof zone !== 'object') continue;
    if (zone.min != null || zone.max != null || zone.description) return true;
  }
  return false;
};

export default function TrainingZonesPanel({ powerZones, heartRateZones, onEdit, emptyHint }) {
  const available = useMemo(
    () => SPORTS.map((s) => s.id).filter((id) => hasZonesFor(powerZones, id)),
    [powerZones]
  );
  const [sport, setSport] = useState(available[0] || 'cycling');

  useEffect(() => {
    if (available.length && !available.includes(sport)) setSport(available[0]);
  }, [available, sport]);

  const fmtMain = (val) => {
    if (val == null || val === '' || val === Infinity) return '∞';
    if (sport === 'cycling') return `${val}W`;
    return `${fmtViewerPaceBare(val, paceSportOf(sport)) || '0:00'}${viewerPaceSuffix(paceSportOf(sport))}`;
  };

  const fmtRange = (zone) => {
    if (!zone) return '—';
    const min = zone.min ?? 0;
    const max = zone.max;
    if (sport === 'cycling') {
      return `${Number.isFinite(Number(min)) ? min : 0}–${Number.isFinite(Number(max)) ? max : '∞'} W`;
    }
    const lo = fmtViewerPaceBare(min, paceSportOf(sport)) || '0:00';
    const hi = Number.isFinite(Number(max)) ? fmtViewerPaceBare(max, paceSportOf(sport)) : '∞';
    return `${lo}–${hi} ${viewerPaceSuffix(paceSportOf(sport))}`;
  };

  const fmtHr = (zone) => {
    if (!zone) return '—';
    const min = zone.min ?? 0;
    const max = zone.max;
    return `${Number.isFinite(Number(min)) ? min : 0}–${Number.isFinite(Number(max)) ? max : '∞'} BPM`;
  };

  const fmtLactate = (zone) => {
    const lactate = zone?.lactate;
    const lo = Number(lactate?.min);
    const hi = Number(lactate?.max);
    if (!Number.isFinite(lo) && !Number.isFinite(hi)) return '—';
    const one = (v) => (Number.isFinite(v) ? v.toFixed(1) : '∞');
    return `${one(lo)}–${one(hi)} mmol/L`;
  };

  const zones = powerZones?.[sport] || {};
  const hrForSport = heartRateZones?.[sport] || {};

  return (
    <div className="bg-white rounded-2xl sm:rounded-3xl shadow-sm overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 sm:px-6 py-4 border-b border-gray-100">
        <h3 className="text-lg sm:text-xl font-bold text-gray-900">Training Zones</h3>
        <div className="flex items-center gap-2 flex-wrap">
          {SPORTS.filter((s) => available.includes(s.id)).map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSport(s.id)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                sport === s.id
                  ? 'bg-primary text-white border-primary shadow-sm'
                  : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
              }`}
            >
              <img src={s.icon} alt="" className={`w-3.5 h-3.5 object-contain ${sport === s.id ? 'invert' : ''}`} />
              {s.label}
            </button>
          ))}
          {onEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="px-3 py-1.5 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-all shadow-sm text-xs font-medium"
            >
              Edit
            </button>
          )}
        </div>
      </div>

      {available.length === 0 ? (
        <div className="px-4 sm:px-6 py-5">
          <p className="text-sm text-gray-500">
            {emptyHint || 'No training zones set yet. Add them here, or let a lactate test fill them in.'}
          </p>
        </div>
      ) : (
        <div className="px-4 sm:px-6 py-4 space-y-4">
          {(zones.lt1 || zones.lt2) && (
            <div className="grid grid-cols-2 gap-3">
              {zones.lt1 && (
                <div className="p-3 bg-sky-50 rounded-xl border border-sky-100">
                  <p className="text-[10px] font-semibold text-sky-500 uppercase tracking-wide mb-0.5">LTP1</p>
                  <p className="text-xl font-bold text-sky-700">{fmtMain(zones.lt1)}</p>
                </div>
              )}
              {zones.lt2 && (
                <div className="p-3 bg-violet-50 rounded-xl border border-violet-100">
                  <p className="text-[10px] font-semibold text-violet-500 uppercase tracking-wide mb-0.5">
                    LTP2{sport === 'cycling' ? ' / FTP' : ''}
                  </p>
                  <p className="text-xl font-bold text-violet-700">{fmtMain(zones.lt2)}</p>
                </div>
              )}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wide text-gray-400">
                  <th className="py-2 pr-3 font-semibold">Zone</th>
                  <th className="py-2 pr-3 font-semibold">{sport === 'cycling' ? 'Power' : 'Pace'}</th>
                  <th className="py-2 pr-3 font-semibold">HR</th>
                  <th className="py-2 font-semibold">Lactate</th>
                </tr>
              </thead>
              <tbody>
                {[1, 2, 3, 4, 5].map((n) => {
                  const zone = zones[`zone${n}`];
                  if (!zone) return null;
                  return (
                    <tr key={n} className="border-t border-gray-50">
                      <td className="py-2 pr-3">
                        <span className="inline-flex items-center gap-2">
                          <span className={`w-2.5 h-2.5 rounded-full ${ZONE_COLORS[n - 1]}`} />
                          <span className="font-semibold text-gray-800">{n}</span>
                          <span className="text-gray-500">{zone.description || ZONE_NAMES[n - 1]}</span>
                        </span>
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap text-gray-700">{fmtRange(zone)}</td>
                      <td className="py-2 pr-3 whitespace-nowrap text-gray-700">{fmtHr(hrForSport[`zone${n}`])}</td>
                      <td className="py-2 whitespace-nowrap text-gray-700">{fmtLactate(zone)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
