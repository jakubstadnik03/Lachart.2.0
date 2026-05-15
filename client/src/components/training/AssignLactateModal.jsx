import React, { useEffect, useState, useCallback } from 'react';
import { XMarkIcon, BeakerIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { getStravaActivityDetail, assignFieldLactateMeasurement } from '../../services/api';

function fmtDur(sec) {
  const s = Math.round(Number(sec) || 0);
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return `${m}:${String(ss).padStart(2, '0')}`;
}

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function SportIcon({ sport }) {
  const s = String(sport || '').toLowerCase();
  if (s.includes('run') || s.includes('walk')) return <span>🏃</span>;
  if (s.includes('swim')) return <span>🏊</span>;
  if (s.includes('ride') || s.includes('bike') || s.includes('cycl')) return <span>🚴</span>;
  return <span>🏋️</span>;
}

export default function AssignLactateModal({ measurement, onClose, onAssigned, onOpenInForm = null, athleteId = null }) {
  // Step 1: pick activity. Step 2: pick lap.
  const [step, setStep] = useState('pick-activity'); // 'pick-activity' | 'pick-lap'
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');

  const [selectedActivity, setSelectedActivity] = useState(null);
  const [laps, setLaps] = useState([]);
  const [lapsLoading, setLapsLoading] = useState(false);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  // Load recent Strava activities (last 30 days) for picking
  const loadActivities = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { getPendingLactateActivities } = await import('../../services/api');
      const data = await getPendingLactateActivities(athleteId, { days: 30 });
      setActivities(Array.isArray(data?.activities) ? data.activities : []);
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Could not load activities');
    } finally {
      setLoading(false);
    }
  }, [athleteId]);

  useEffect(() => { loadActivities(); }, [loadActivities]);

  const handleSelectActivity = async (activity) => {
    setSelectedActivity(activity);
    setStep('pick-lap');
    setLaps([]);
    setLapsLoading(true);
    try {
      const numericId = String(activity.stravaId || activity._id || '');
      const data = await getStravaActivityDetail(numericId, athleteId);
      setLaps(Array.isArray(data?.laps) ? data.laps : []);
    } catch (e) {
      setLaps([]);
    } finally {
      setLapsLoading(false);
    }
  };

  const handleAssign = async (lap, lapIndex) => {
    setSaving(true);
    setSaveError(null);
    try {
      await assignFieldLactateMeasurement(measurement._id, {
        stravaActivityId: String(selectedActivity.stravaId || ''),
        lapIndex,
        lapNumber: lapIndex + 1,
        trainingTitle: selectedActivity.name || '',
        trainingDate: selectedActivity.startDate || null,
      });
      onAssigned();
      onClose();
    } catch (e) {
      setSaveError(e?.response?.data?.error || e?.message || 'Assign failed');
      setSaving(false);
    }
  };

  const filtered = activities.filter(a =>
    !search || (a.name || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="absolute inset-0 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-xl flex flex-col"
        style={{ maxHeight: '85vh', paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 0px)' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#f5f3ff' }}>
              <BeakerIcon className="w-4 h-4" style={{ color: '#7c3aed' }} />
            </div>
            <div>
              <div className="text-sm font-bold text-gray-900">Assign Lactate</div>
              <div className="text-[11px] text-gray-400">
                {measurement.value} mmol/L · {fmtDate(measurement.recordedAt)}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {step === 'pick-lap' && (
              <button onClick={() => setStep('pick-activity')}
                className="text-xs text-violet-600 font-semibold px-2 py-1 rounded-lg hover:bg-violet-50 mr-1">
                ← Back
              </button>
            )}
            <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100">
              <XMarkIcon className="w-4 h-4 text-gray-400" />
            </button>
          </div>
        </div>

        {/* Step 1: pick activity */}
        {step === 'pick-activity' && (
          <div className="flex flex-col flex-1 min-h-0">
            <div className="px-4 py-2 border-b border-gray-50 flex-shrink-0">
              <p className="text-xs text-gray-500 mb-2">Select an activity from the last 30 days</p>
              <div className="flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2">
                <MagnifyingGlassIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <input
                  type="text"
                  placeholder="Search activities…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="flex-1 text-sm outline-none bg-transparent"
                />
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto">
              {loading && (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-violet-600" />
                </div>
              )}
              {error && <p className="m-4 text-xs text-red-500">{error}</p>}
              {!loading && filtered.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-8">No activities found</p>
              )}
              {!loading && filtered.map(a => (
                <div key={String(a._id)} className="flex items-stretch border-b border-gray-50 hover:bg-violet-50/40 transition-colors">
                  <button
                    onClick={() => handleSelectActivity(a)}
                    className="flex-1 min-w-0 text-left px-4 py-3"
                    title="Browse this activity's laps and pick one"
                  >
                    <div className="flex items-start gap-2">
                      <span className="text-base flex-shrink-0 mt-0.5"><SportIcon sport={a.sport} /></span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-gray-900 truncate">{a.name}</div>
                        <div className="text-[11px] text-gray-400 mt-0.5">
                          {fmtDate(a.startDate)}
                          {a.lapCount ? ` · ${a.lapCount} laps` : ''}
                          {a.movingTime ? ` · ${Math.round(a.movingTime / 60)}min` : ''}
                        </div>
                      </div>
                      <span className="text-violet-400 text-lg flex-shrink-0">›</span>
                    </div>
                  </button>
                  {onOpenInForm && (
                    <button
                      onClick={() => onOpenInForm(a)}
                      title="Open with the lap chart so you can tag the right lap directly"
                      className="px-3 border-l border-gray-100 inline-flex items-center gap-1 text-[11px] font-bold text-violet-600 hover:bg-violet-100 transition-colors"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 20h18" /><path d="M5 16l4-6 4 4 6-9" />
                      </svg>
                      Chart
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: pick lap */}
        {step === 'pick-lap' && (
          <div className="flex flex-col flex-1 min-h-0">
            <div className="px-4 py-2 border-b border-gray-50 flex-shrink-0">
              <p className="text-xs font-semibold text-gray-700 truncate">{selectedActivity?.name}</p>
              <p className="text-[11px] text-gray-400">Pick the lap to assign {measurement.value} mmol/L to</p>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto">
              {lapsLoading && (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-violet-600" />
                </div>
              )}
              {!lapsLoading && laps.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-8">No laps found for this activity</p>
              )}
              {!lapsLoading && laps.map((lap, i) => {
                const dur = lap.elapsed_time || lap.duration || 0;
                const dist = Number(lap.distance || 0);
                const hr = Math.round(lap.average_heartrate || lap.averageHeartRate || 0);
                const lapNum = lap.lapNumber ?? (i + 1);
                const lapLa = lap.lactate ?? lap.lactateValue;
                const isRecovery = dist < 50 && dur < 120;
                return (
                  <button key={i} onClick={() => !saving && handleAssign(lap, i)}
                    disabled={saving}
                    className="w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-violet-50 transition-colors disabled:opacity-60"
                    style={{ backgroundColor: isRecovery ? '#f9fafb' : undefined }}>
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                        style={{ backgroundColor: '#ede9fe', color: '#7c3aed' }}>
                        {lapNum}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-gray-700">{fmtDur(dur)}</span>
                          {dist > 0 && <span className="text-[11px] text-gray-400">{dist >= 1000 ? `${(dist/1000).toFixed(1)}km` : `${Math.round(dist)}m`}</span>}
                          {hr > 0 && <span className="text-[11px] text-gray-400">{hr} bpm</span>}
                        </div>
                        {isRecovery && <span className="text-[10px] text-gray-400">recovery</span>}
                      </div>
                      {lapLa != null ? (
                        <span className="text-xs font-bold flex-shrink-0" style={{ color: '#7c3aed' }}>{Number(lapLa).toFixed(1)} mmol/L</span>
                      ) : (
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: '#ede9fe', color: '#7c3aed' }}>
                          Assign here
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
            {saveError && <p className="px-4 py-2 text-xs text-red-500">{saveError}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
