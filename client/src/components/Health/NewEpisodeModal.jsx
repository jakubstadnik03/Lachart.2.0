/**
 * NewEpisodeModal - log an injury or illness.
 *
 * Two steps: where it is, then what it is. Narrowing by body site first keeps
 * the catalogue from being a wall of twenty conditions, and matches how people
 * actually describe the problem ("my Achilles", not "mid-portion tendinopathy").
 *
 * The app never picks the diagnosis for the athlete - it lists what typically
 * affects that site and asks. Anything they choose can be corrected later.
 */
import React, { useState, useMemo } from 'react';
import { XMarkIcon, ArrowLeftIcon } from '@heroicons/react/24/outline';
import { createEpisode, catalogForBodySite, todayKey } from '../../services/healthApi';

const REGION_ORDER = ['general', 'upper', 'trunk', 'hip', 'thigh', 'knee', 'lower_leg', 'ankle', 'foot'];
const REGION_LABELS = {
  general: 'Whole body',
  upper: 'Shoulder / arm',
  trunk: 'Back',
  hip: 'Hip & groin',
  thigh: 'Thigh',
  knee: 'Knee',
  lower_leg: 'Lower leg',
  ankle: 'Ankle',
  foot: 'Foot',
};

const LOAD_RESPONSE_BADGE = {
  rest: { label: 'Needs load taken off', bg: '#FEF2F2', color: '#DC2626' },
  modified_load: { label: 'Train under the threshold', bg: '#FFF7ED', color: '#EA580C' },
  progressive_load: { label: 'Needs loading, not rest', bg: '#F0FDF4', color: '#16A34A' },
};

export default function NewEpisodeModal({
  catalog = [], bodySites = [], onClose, onCreated,
  /** Whose injury this is. Null means the signed-in user. Without it a coach
      logging an injury while viewing an athlete files it against their own
      record, and the athlete never sees it. */
  athleteId = null,
}) {
  const [site, setSite] = useState(null);
  const [entry, setEntry] = useState(null);
  const [side, setSide] = useState('n/a');
  const [severity, setSeverity] = useState(2);
  const [diagnosedBy, setDiagnosedBy] = useState('self');
  const [startDate, setStartDate] = useState(todayKey());
  const [diagnosis, setDiagnosis] = useState('');
  const [visibleToCoach, setVisibleToCoach] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const grouped = useMemo(() => {
    const map = {};
    for (const s of bodySites) {
      if (!map[s.region]) map[s.region] = [];
      map[s.region].push(s);
    }
    return REGION_ORDER.filter((r) => map[r]?.length).map((r) => ({ region: r, sites: map[r] }));
  }, [bodySites]);

  const options = useMemo(() => {
    const forSite = catalogForBodySite(catalog, site?.id);
    // "Something else" is always offered - a gap in the catalogue must never be
    // a reason someone cannot log what is going on.
    const other = catalog.find((e) => e.id === 'other');
    return forSite.length ? [...forSite, other].filter(Boolean) : catalog;
  }, [catalog, site]);

  const needsSide = site && !['systemic', 'back_lower', 'sacrum', 'pelvis'].includes(site.id);

  const handleCreate = async () => {
    if (!entry) return;
    setSaving(true);
    setError(null);
    try {
      const created = await createEpisode({
        athleteId,
        catalogId: entry.id,
        bodySite: site?.id || entry.bodySites?.[0] || null,
        side: needsSide ? side : 'n/a',
        severity,
        diagnosedBy,
        startDate,
        diagnosis,
        isVisibleToCoach: visibleToCoach,
      });
      onCreated?.(created);
      onClose?.();
    } catch (e) {
      setError(e?.response?.data?.error || e.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-center gap-2">
          {site && (
            <button
              type="button"
              onClick={() => (entry ? setEntry(null) : setSite(null))}
              className="p-1 -ml-1 text-gray-400 hover:text-gray-600"
            >
              <ArrowLeftIcon className="w-5 h-5" />
            </button>
          )}
          <div className="flex-1">
            <div className="text-base font-semibold text-gray-900">
              {!site ? 'Where is it?' : !entry ? 'What is it?' : 'Details'}
            </div>
            {site && <div className="text-xs text-gray-500 mt-0.5">{site.label}</div>}
          </div>
          <button type="button" onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-4">
          {/* Step 1 - body site */}
          {!site && (
            <div className="space-y-4">
              {grouped.map(({ region, sites }) => (
                <div key={region}>
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                    {REGION_LABELS[region] || region}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {sites.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setSite(s)}
                        className="px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100 text-sm text-gray-800 text-left"
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Step 2 - condition */}
          {site && !entry && (
            <div className="space-y-2">
              {options.map((e) => {
                const badge = LOAD_RESPONSE_BADGE[e.loadResponse];
                return (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => setEntry(e)}
                    className="w-full text-left px-3.5 py-3 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50/40"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-sm font-semibold text-gray-900">{e.label}</div>
                      {badge && (
                        <span
                          className="text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap flex-shrink-0"
                          style={{ background: badge.bg, color: badge.color }}
                        >
                          {badge.label}
                        </span>
                      )}
                    </div>
                    {e.summary && (
                      <div className="text-xs text-gray-600 mt-1 leading-snug">{e.summary}</div>
                    )}
                  </button>
                );
              })}
              <p className="text-xs text-gray-500 pt-2 leading-relaxed">
                Not sure which one? Pick the closest - you can change it later. If you have not had it
                looked at and it is not settling, a diagnosis is worth more than any plan this app can build.
              </p>
            </div>
          )}

          {/* Step 3 - details */}
          {site && entry && (
            <div className="space-y-4">
              <div className="bg-gray-50 rounded-lg px-3.5 py-3">
                <div className="text-sm font-semibold text-gray-900">{entry.label}</div>
                <div className="text-xs text-gray-600 mt-1 leading-snug">{entry.summary}</div>
              </div>

              {entry.requiresMedicalClearance && (
                <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 leading-relaxed">
                  This site needs imaging and medical supervision. The app will track your symptoms
                  and cross-training, but it will not build you a return-to-running plan without a
                  clinician's clearance.
                </div>
              )}

              {needsSide && (
                <div>
                  <div className="text-sm font-medium text-gray-700 mb-1.5">Side</div>
                  <div className="flex gap-2">
                    {[['L', 'Left'], ['R', 'Right'], ['bilateral', 'Both']].map(([v, label]) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setSide(v)}
                        className={`flex-1 py-2 rounded-lg text-sm font-medium border ${
                          side === v
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-gray-50 text-gray-700 border-gray-200'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <div className="text-sm font-medium text-gray-700 mb-1.5">How bad is it?</div>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    [1, 'A niggle'],
                    [2, 'Affects training'],
                    [3, 'Stops training'],
                    [4, 'Affects daily life'],
                  ].map(([v, label]) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setSeverity(v)}
                      className={`py-2 rounded-lg text-sm font-medium border ${
                        severity === v
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-gray-50 text-gray-700 border-gray-200'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-sm font-medium text-gray-700 mb-1.5">Who identified it?</div>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    ['self', 'Just me'],
                    ['physio', 'Physio'],
                    ['doctor', 'Doctor'],
                    ['imaging', 'Scan / imaging'],
                  ].map(([v, label]) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setDiagnosedBy(v)}
                      className={`py-2 rounded-lg text-sm font-medium border ${
                        diagnosedBy === v
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-gray-50 text-gray-700 border-gray-200'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <label className="block">
                <span className="block text-sm font-medium text-gray-700 mb-1.5">When did it start?</span>
                <input
                  type="date"
                  value={startDate}
                  max={todayKey()}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-md text-sm"
                />
              </label>

              <label className="block">
                <span className="block text-sm font-medium text-gray-700 mb-1.5">
                  Diagnosis or notes <span className="font-normal text-gray-400">(optional)</span>
                </span>
                <textarea
                  value={diagnosis}
                  onChange={(e) => setDiagnosis(e.target.value)}
                  rows={2}
                  placeholder="What the physio said, scan results, anything useful"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                />
              </label>

              <button
                type="button"
                onClick={() => setVisibleToCoach((v) => !v)}
                className="w-full flex items-start gap-3 px-3 py-2.5 rounded-lg border border-gray-200 text-left"
              >
                <span
                  className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 mt-0.5 ${
                    visibleToCoach ? 'bg-blue-600 border-blue-600' : 'border-gray-300'
                  }`}
                >
                  {visibleToCoach && (
                    <svg viewBox="0 0 12 12" className="w-3 h-3 text-white" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M2 6l3 3 5-6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
                <span>
                  <span className="block text-sm text-gray-800">Share with my coach</span>
                  <span className="block text-xs text-gray-500 mt-0.5">
                    They see the stage and your symptom trend. Private notes stay private either way.
                  </span>
                </span>
              </button>

              <p className="text-xs text-gray-400 leading-relaxed">
                LaChart is a training log, not a medical device. It does not diagnose anything and
                cannot replace a physiotherapist or doctor.
              </p>

              {error && <div className="text-sm text-red-600">{error}</div>}
            </div>
          )}
        </div>

        {site && entry && (
          <div className="sticky bottom-0 bg-white border-t border-gray-100 px-5 py-3">
            <button
              type="button"
              onClick={handleCreate}
              disabled={saving}
              className="w-full px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300"
            >
              {saving ? 'Saving…' : 'Start tracking'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
