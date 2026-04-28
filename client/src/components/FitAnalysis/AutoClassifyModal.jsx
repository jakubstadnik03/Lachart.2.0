import React, { useState, useCallback, useMemo } from 'react';
import { XMarkIcon, SparklesIcon, CheckIcon } from '@heroicons/react/24/outline';
import api from '../../services/api';

const CAT_COLORS = {
  endurance: '#3b82f6',
  lt1:       '#0ea5e9',
  tempo:     '#f97316',
  lt2:       '#8b5cf6',
  zone2:     '#22c55e',
  vo2max:    '#ef4444',
  hills:     '#f59e0b',
};

const CAT_LABELS = {
  endurance: 'Endurance',
  lt1:       'LT1',
  tempo:     'Tempo',
  lt2:       'LT2',
  zone2:     'Zone 2',
  vo2max:    'VO₂max',
  hills:     'Hills',
};

// SVG icon components matching TrainingForm
const CatSvg = ({ children, size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, display: 'block' }}>
    {children}
  </svg>
);

const CAT_ICONS = {
  endurance: <CatSvg><path d="M2 12 C5.5 6 8.5 6 12 12 C15.5 18 18.5 18 22 12" /></CatSvg>,
  lt1: <CatSvg>
    <polyline points="3,19 9,16 14,10 20,5" />
    <circle cx="14" cy="10" r="2.2" fill="currentColor" stroke="none" />
  </CatSvg>,
  tempo: <CatSvg>
    <circle cx="12" cy="13" r="8" />
    <polyline points="12,9 12,13 15,15" />
    <line x1="9" y1="2" x2="15" y2="2" />
    <line x1="12" y1="2" x2="12" y2="5" />
  </CatSvg>,
  lt2: <CatSvg>
    <polyline points="3,19 7,18 10,15 13,9 19,4" />
    <circle cx="13" cy="9" r="2.2" fill="currentColor" stroke="none" />
  </CatSvg>,
  zone2: <CatSvg strokeWidth="1.8">
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    <polyline points="8,12 10,10 11,14 13,10 14,12" strokeWidth="1.2" />
  </CatSvg>,
  vo2max: <CatSvg>
    <line x1="12" y1="19" x2="12" y2="5" />
    <polyline points="5,12 12,5 19,12" />
    <line x1="8" y1="19" x2="8" y2="16" strokeWidth="1.2" />
    <line x1="12" y1="21" x2="12" y2="19" strokeWidth="1.2" />
    <line x1="16" y1="19" x2="16" y2="16" strokeWidth="1.2" />
  </CatSvg>,
  hills: <CatSvg>
    <polyline points="2,20 7,10 11,15 15,8 19,13 22,20" />
    <line x1="2" y1="20" x2="22" y2="20" />
  </CatSvg>,
};

const SPORT_ICONS = { cycling: '/icon/bike.svg', running: '/icon/run.svg', swimming: '/icon/swim.svg' };

function CategoryPill({ category }) {
  if (!category) return <span className="text-gray-400 text-xs">—</span>;
  const color = CAT_COLORS[category] || '#6b7280';
  const icon = CAT_ICONS[category] || null;
  const label = CAT_LABELS[category] || category;
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-semibold border"
      style={{ backgroundColor: `${color}22`, color, borderColor: `${color}55` }}
    >
      {icon} {label}
    </span>
  );
}

function formatDur(sec) {
  if (!sec) return '-';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}h${String(m).padStart(2, '0')}`;
  return `${m}'`;
}

export default function AutoClassifyModal({ onClose, onApplied }) {
  const [sport, setSport] = useState('all');
  const [skipCategorized, setSkipCategorized] = useState(true);
  const [applyTitles, setApplyTitles] = useState(true);
  const [proposals, setProposals] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [filterCat, setFilterCat] = useState('all');

  const loadProposals = useCallback(async () => {
    setLoading(true);
    setError(null);
    setProposals(null);
    setSelected(new Set());
    setResult(null);
    try {
      const { data } = await api.get('/api/integrations/strava/auto-classify', {
        params: { sport, skipCategorized: skipCategorized ? 'true' : 'false', limit: 500 },
      });
      setProposals(data.proposals || []);
      setSelected(new Set(data.proposals.map(p => p._id)));
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }, [sport, skipCategorized]);

  const visibleProposals = useMemo(() => {
    if (!proposals) return [];
    if (filterCat === 'all') return proposals;
    return proposals.filter(p => p.proposedCategory === filterCat);
  }, [proposals, filterCat]);

  const allVisibleSelected = visibleProposals.length > 0 && visibleProposals.every(p => selected.has(p._id));

  const toggleAll = () => {
    if (allVisibleSelected) {
      setSelected(prev => {
        const next = new Set(prev);
        visibleProposals.forEach(p => next.delete(p._id));
        return next;
      });
    } else {
      setSelected(prev => {
        const next = new Set(prev);
        visibleProposals.forEach(p => next.add(p._id));
        return next;
      });
    }
  };

  const applyChanges = useCallback(async () => {
    if (!proposals || selected.size === 0) return;
    setApplying(true);
    setError(null);
    try {
      const items = proposals
        .filter(p => selected.has(p._id))
        .map(p => ({
          _id: p._id,
          category: p.proposedCategory,
          title: p.proposedTitle,
          applyCategory: true,
          applyTitle: applyTitles,
        }));
      const { data } = await api.post('/api/integrations/strava/auto-classify/apply', { items });
      setResult(data.updated);
      if (onApplied) onApplied();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setApplying(false);
    }
  }, [proposals, selected, applyTitles, onApplied]);

  // Category distribution for filter chips
  const catCounts = useMemo(() => {
    if (!proposals) return {};
    return proposals.reduce((acc, p) => {
      acc[p.proposedCategory] = (acc[p.proposedCategory] || 0) + 1;
      return acc;
    }, {});
  }, [proposals]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <SparklesIcon className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-bold text-gray-900">Auto-categorize Activities</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Controls */}
        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/60 flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-[11px] text-gray-500 mb-1 font-medium">Sport</label>
            <div className="flex gap-1">
              {['all', 'cycling', 'running', 'swimming'].map(s => (
                <button
                  key={s}
                  onClick={() => setSport(s)}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
                    sport === s ? 'bg-primary text-white border-primary' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {SPORT_ICONS[s] ? (
                    <img src={SPORT_ICONS[s]} className={`w-3.5 h-3.5 object-contain ${sport === s ? 'invert' : ''}`} alt="" />
                  ) : '🏅'}
                  {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
            <input type="checkbox" checked={skipCategorized} onChange={e => setSkipCategorized(e.target.checked)} className="rounded" />
            Skip already categorized
          </label>

          <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
            <input type="checkbox" checked={applyTitles} onChange={e => setApplyTitles(e.target.checked)} className="rounded" />
            Also set titles
          </label>

          <button
            onClick={loadProposals}
            disabled={loading}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white text-xs font-semibold rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-all"
          >
            {loading ? (
              <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
            ) : <SparklesIcon className="w-3.5 h-3.5" />}
            {loading ? 'Analyzing…' : 'Analyze'}
          </button>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto">
          {error && (
            <div className="mx-5 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
          )}

          {result !== null && (
            <div className="mx-5 mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700 flex items-center gap-2">
              <CheckIcon className="w-4 h-4" />
              <strong>{result}</strong> activities updated successfully!
            </div>
          )}

          {proposals && proposals.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              <SparklesIcon className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p>No activities to classify. Make sure your zones are configured in Profile.</p>
            </div>
          )}

          {proposals && proposals.length > 0 && (
            <div className="px-5 pt-3 pb-2">
              {/* Category filter chips */}
              <div className="flex flex-wrap gap-1.5 mb-3">
                <button
                  onClick={() => setFilterCat('all')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${filterCat === 'all' ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-500 border-gray-200'}`}
                >
                  All ({proposals.length})
                </button>
                {Object.entries(catCounts).sort((a,b) => b[1]-a[1]).map(([cat, count]) => {
                  const color = CAT_COLORS[cat] || '#6b7280';
                  const icon = CAT_ICONS[cat] || null;
                  const label = CAT_LABELS[cat] || cat;
                  return (
                    <button
                      key={cat}
                      onClick={() => setFilterCat(filterCat === cat ? 'all' : cat)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all"
                      style={filterCat === cat
                        ? { backgroundColor: color, color: '#fff', borderColor: color }
                        : { backgroundColor: `${color}18`, color, borderColor: `${color}44` }
                      }
                    >
                      {icon} {label} ({count})
                    </button>
                  );
                })}
              </div>

              {/* Table */}
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="px-3 py-2 text-left">
                        <input type="checkbox" checked={allVisibleSelected} onChange={toggleAll} className="rounded" />
                      </th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-600 w-28">Date</th>
                      <th className="px-2 py-2 text-left font-semibold text-gray-600 w-8">Sport</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-600">Activity name</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-600 w-24">Duration</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-600 w-32">Category</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-600">Proposed title</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleProposals.map((p, i) => {
                      const isSelected = selected.has(p._id);
                      const date = p.startDate ? new Date(p.startDate).toLocaleDateString('cs-CZ', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '-';
                      return (
                        <tr
                          key={p._id}
                          className={`border-b border-gray-100 cursor-pointer transition-colors ${isSelected ? 'bg-primary/5' : 'hover:bg-gray-50'} ${i % 2 === 0 ? '' : 'bg-gray-50/30'}`}
                          onClick={() => setSelected(prev => {
                            const next = new Set(prev);
                            isSelected ? next.delete(p._id) : next.add(p._id);
                            return next;
                          })}
                        >
                          <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => setSelected(prev => {
                                const next = new Set(prev);
                                isSelected ? next.delete(p._id) : next.add(p._id);
                                return next;
                              })}
                              className="rounded"
                            />
                          </td>
                          <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{date}</td>
                          <td className="px-2 py-2">
                            {SPORT_ICONS[p.sport] ? (
                              <img src={SPORT_ICONS[p.sport]} className="w-4 h-4 object-contain opacity-60" alt={p.sport} />
                            ) : <span className="text-gray-400">?</span>}
                          </td>
                          <td className="px-3 py-2 text-gray-700 max-w-xs truncate">{p.name}</td>
                          <td className="px-3 py-2 text-gray-500">{formatDur(p.movingTime)}</td>
                          <td className="px-3 py-2">
                            <CategoryPill category={p.proposedCategory} />
                          </td>
                          <td className="px-3 py-2 text-gray-700 font-medium">
                            {p.proposedTitle || <span className="text-gray-400">—</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {proposals && proposals.length > 0 && (
          <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/60 flex items-center justify-between gap-3">
            <span className="text-xs text-gray-500">
              <strong className="text-gray-800">{selected.size}</strong> / {proposals.length} selected
              {!applyTitles && <span className="ml-2 text-gray-400">(titles won't be changed)</span>}
            </span>
            <div className="flex gap-2">
              <button onClick={onClose} className="px-3 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-100 transition-all">
                Cancel
              </button>
              <button
                onClick={applyChanges}
                disabled={applying || selected.size === 0}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-primary text-white text-xs font-semibold rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-all"
              >
                {applying ? (
                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                ) : <CheckIcon className="w-3.5 h-3.5" />}
                {applying ? 'Applying…' : `Apply to ${selected.size} activities`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
