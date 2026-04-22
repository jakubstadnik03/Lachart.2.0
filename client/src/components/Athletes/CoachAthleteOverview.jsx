import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';

const SIX_WEEKS_MS = 6 * 7 * 24 * 60 * 60 * 1000;
const TWELVE_WEEKS_MS = 12 * 7 * 24 * 60 * 60 * 1000;

function getStatus(lastTestDate) {
  if (!lastTestDate) return 'red';
  const diff = Date.now() - new Date(lastTestDate).getTime();
  if (diff < SIX_WEEKS_MS) return 'green';
  if (diff < TWELVE_WEEKS_MS) return 'yellow';
  return 'red';
}

function StatusDot({ status }) {
  const colors = {
    green: 'bg-green-400',
    yellow: 'bg-yellow-400',
    red: 'bg-red-400',
  };
  const titles = {
    green: 'Tested within 6 weeks',
    yellow: 'Last test 6–12 weeks ago',
    red: 'No test in 12+ weeks',
  };
  return (
    <span
      title={titles[status]}
      className={`inline-block w-2.5 h-2.5 rounded-full ${colors[status]} flex-shrink-0`}
    />
  );
}

function SportBadge({ sport }) {
  const colors = {
    bike: 'bg-blue-100 text-blue-700',
    run: 'bg-emerald-100 text-emerald-700',
    swim: 'bg-cyan-100 text-cyan-700',
  };
  if (!sport) return null;
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors[sport?.toLowerCase()] || 'bg-gray-100 text-gray-600'}`}>
      {sport}
    </span>
  );
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

/** Estimate LT2: find first result where lactate >= 4.0, return power/pace */
function estimateLT2(testResults) {
  if (!Array.isArray(testResults) || testResults.length === 0) return null;
  // Sort by power/pace ascending
  const sorted = [...testResults].sort((a, b) => (a.power || a.pace || 0) - (b.power || b.pace || 0));
  const lt2Step = sorted.find((r) => parseFloat(r.lactate) >= 4.0);
  if (!lt2Step) return null;
  if (lt2Step.power) return `${lt2Step.power}W`;
  if (lt2Step.pace) return lt2Step.pace;
  return null;
}

const STATUS_ORDER = { red: 0, yellow: 1, green: 2 };

const SORT_OPTIONS = [
  { value: 'status', label: 'Status' },
  { value: 'lastTest', label: 'Last Test' },
  { value: 'name', label: 'Name' },
];

const FILTER_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'needs', label: 'Needs Testing' },
  { value: 'ok', label: 'Up to Date' },
];

export default function CoachAthleteOverview({ athletes }) {
  const navigate = useNavigate();
  const [athleteData, setAthleteData] = useState({});
  const [sortBy, setSortBy] = useState('status');
  const [filter, setFilter] = useState('all');

  const fetchAthleteTests = useCallback(async () => {
    if (!athletes || athletes.length === 0) return;

    // Batch: limit to 20 at a time to avoid flooding
    const batch = athletes.slice(0, 20);

    const results = await Promise.allSettled(
      batch.map((athlete) =>
        api.get(`/test/list/${athlete._id}`).then((res) => ({
          athleteId: athlete._id,
          tests: res.data || [],
        }))
      )
    );

    const newData = {};
    results.forEach((result) => {
      if (result.status === 'fulfilled') {
        const { athleteId, tests } = result.value;
        // Sort tests newest first
        const sorted = [...tests].sort(
          (a, b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt)
        );
        const latestTest = sorted[0];
        const lastTestDate = latestTest?.date || latestTest?.createdAt || null;

        // Estimate LT2 from latest test's results
        const lt2 = latestTest?.results ? estimateLT2(latestTest.results) : null;

        newData[athleteId] = { lastTestDate, lt2, status: getStatus(lastTestDate) };
      }
    });

    setAthleteData(newData);
  }, [athletes]);

  useEffect(() => {
    fetchAthleteTests();
  }, [fetchAthleteTests]);

  const enriched = (athletes || []).map((athlete) => ({
    ...athlete,
    ...(athleteData[athlete._id] || { lastTestDate: null, lt2: null, status: 'red' }),
  }));

  // Filter
  const filtered = enriched.filter((a) => {
    if (filter === 'needs') return a.status === 'red' || a.status === 'yellow';
    if (filter === 'ok') return a.status === 'green';
    return true;
  });

  // Sort
  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === 'status') return STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    if (sortBy === 'lastTest') {
      if (!a.lastTestDate && !b.lastTestDate) return 0;
      if (!a.lastTestDate) return 1;
      if (!b.lastTestDate) return -1;
      return new Date(b.lastTestDate) - new Date(a.lastTestDate);
    }
    if (sortBy === 'name') {
      return `${a.name} ${a.surname}`.localeCompare(`${b.name} ${b.surname}`);
    }
    return 0;
  });

  const needsCount = enriched.filter((a) => a.status !== 'green').length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden"
    >
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-800">
            Athlete Overview
            <span className="ml-2 text-sm font-normal text-gray-400">({enriched.length})</span>
          </h2>
          {needsCount > 0 && (
            <p className="text-xs text-amber-600 mt-0.5">{needsCount} athlete{needsCount !== 1 ? 's' : ''} need{needsCount === 1 ? 's' : ''} testing</p>
          )}
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Filter tabs */}
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            {FILTER_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setFilter(opt.value)}
                className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${
                  filter === opt.value
                    ? 'bg-white text-gray-800 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Sort */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-gray-600 focus:outline-none focus:ring-2 focus:ring-[#767EB5]"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>Sort: {opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Mobile card list — visible only on small screens */}
      {sorted.length === 0 ? (
        <div className="px-5 py-10 text-center text-sm text-gray-400">No athletes match this filter.</div>
      ) : (
        <>
          {/* ── Mobile cards (hidden on sm+) ── */}
          <div className="sm:hidden divide-y divide-gray-50">
            {sorted.map((athlete, idx) => {
              const loading = athleteData[athlete._id] === undefined;
              const statusLabel = athlete.status === 'green' ? 'Active' : athlete.status === 'yellow' ? 'Due soon' : 'Overdue';
              return (
                <motion.div
                  key={athlete._id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: idx * 0.03 }}
                  className="px-4 py-3 hover:bg-gray-50 transition-colors"
                >
                  {/* Top row: name + status */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <button
                        onClick={() => navigate(`/athlete/${athlete._id}`)}
                        className="font-semibold text-gray-800 text-sm hover:text-primary text-left leading-tight"
                        style={{ touchAction: 'manipulation' }}
                      >
                        {athlete.name} {athlete.surname}
                      </button>
                      {athlete.email && (
                        <p className="text-xs text-gray-400 truncate mt-0.5">{athlete.email}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0 mt-0.5">
                      <StatusDot status={athlete.status} />
                      <span className="text-xs text-gray-500">{statusLabel}</span>
                    </div>
                  </div>

                  {/* Bottom row: sport · last test · LT2 · actions */}
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <SportBadge sport={athlete.sport} />
                      <span className="text-xs text-gray-400">
                        {loading ? (
                          <span className="inline-block w-16 h-2.5 bg-gray-200 rounded animate-pulse" />
                        ) : (
                          formatDate(athlete.lastTestDate)
                        )}
                      </span>
                      {!loading && athlete.lt2 && (
                        <span className="text-xs text-primary font-medium">{athlete.lt2}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <button
                        onClick={() => navigate(`/dashboard/${athlete._id}`)}
                        className="text-xs text-primary font-medium"
                        style={{ touchAction: 'manipulation' }}
                      >
                        Dashboard
                      </button>
                      <button
                        onClick={() => navigate(`/testing/${athlete._id}`)}
                        className="text-xs text-gray-500"
                        style={{ touchAction: 'manipulation' }}
                      >
                        Tests
                      </button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* ── Desktop table (hidden on mobile) ── */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-50">
                  <th className="text-left px-5 py-3 text-xs font-medium text-gray-400 uppercase tracking-wide">Athlete</th>
                  <th className="text-left px-3 py-3 text-xs font-medium text-gray-400 uppercase tracking-wide">Sport</th>
                  <th className="text-left px-3 py-3 text-xs font-medium text-gray-400 uppercase tracking-wide">Last Test</th>
                  <th className="text-left px-3 py-3 text-xs font-medium text-gray-400 uppercase tracking-wide">LT2 est.</th>
                  <th className="text-left px-3 py-3 text-xs font-medium text-gray-400 uppercase tracking-wide">Status</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {sorted.map((athlete, idx) => (
                  <motion.tr
                    key={athlete._id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: idx * 0.03 }}
                    className="hover:bg-gray-50 transition-colors group"
                  >
                    <td className="px-5 py-3">
                      <span
                        className="font-medium text-gray-800 cursor-pointer hover:text-[#767EB5] transition-colors"
                        onClick={() => navigate(`/athlete/${athlete._id}`)}
                      >
                        {athlete.name} {athlete.surname}
                      </span>
                      {athlete.email && (
                        <p className="text-xs text-gray-400">{athlete.email}</p>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <SportBadge sport={athlete.sport} />
                    </td>
                    <td className="px-3 py-3 text-gray-600 whitespace-nowrap">
                      {athleteData[athlete._id] === undefined ? (
                        <span className="inline-block w-20 h-3 bg-gray-200 rounded animate-pulse" />
                      ) : (
                        formatDate(athlete.lastTestDate)
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {athleteData[athlete._id] === undefined ? (
                        <span className="inline-block w-12 h-3 bg-gray-200 rounded animate-pulse" />
                      ) : athlete.lt2 ? (
                        <span className="text-[#767EB5] font-medium">{athlete.lt2}</span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1.5">
                        <StatusDot status={athlete.status} />
                        <span className="text-xs text-gray-500 capitalize">{athlete.status === 'green' ? 'Active' : athlete.status === 'yellow' ? 'Due soon' : 'Overdue'}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => navigate(`/dashboard/${athlete._id}`)}
                          className="text-xs text-[#767EB5] hover:underline font-medium whitespace-nowrap"
                        >
                          Dashboard
                        </button>
                        <button
                          onClick={() => navigate(`/testing/${athlete._id}`)}
                          className="text-xs text-gray-500 hover:underline whitespace-nowrap"
                        >
                          Tests
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </motion.div>
  );
}
